/*
 * Community Board report and profile-link checks. Pure logic and source wiring only: no Firebase, Stripe or network.
 *   npx tsx test-community-reports.ts
 */
import { readFileSync } from "node:fs";
import { REPORT_REASONS, reportKeySource, validateReportInput } from "./src/lib/communityReports";
import { withAuthorAvatars } from "./src/lib/communityBoard";
import { isLiveSessionActive, LIVE_DISPLAY_STALE_MS } from "./src/lib/liveSessionState";

let failures = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail: unknown = "") => { checks++; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${JSON.stringify(detail)}`}`); };

// ---- report validation ----
const valid = validateReportInput({ postId: "post_1", reason: "spam" });
check("post report with a reason and no details is valid", valid.ok && valid.value.details === "" && valid.value.replyId === undefined, valid);
const withReply = validateReportInput({ postId: "post_1", replyId: "reply-2", reason: "harassment", details: "  rude  " });
check("reply report keeps the reply ID and trims details", withReply.ok && withReply.value.replyId === "reply-2" && withReply.value.details === "rude", withReply);
check("missing reason is rejected", !validateReportInput({ postId: "post_1" }).ok);
check("unknown reason is rejected", !validateReportInput({ postId: "post_1", reason: "dislike" }).ok);
check("free-text reason (old client format) is rejected", !validateReportInput({ postId: "post_1", reason: "This is spam" }).ok);
check("'Something else' requires details", !validateReportInput({ postId: "post_1", reason: "other" }).ok && !validateReportInput({ postId: "post_1", reason: "other", details: "   " }).ok);
check("'Something else' with details is valid", validateReportInput({ postId: "post_1", reason: "other", details: "Impersonation" }).ok);
check("details over 500 characters are rejected", !validateReportInput({ postId: "post_1", reason: "spam", details: "x".repeat(501) }).ok);
check("details of exactly 500 characters are accepted", validateReportInput({ postId: "post_1", reason: "spam", details: "x".repeat(500) }).ok);
check("non-text details are rejected", !validateReportInput({ postId: "post_1", reason: "spam", details: 5 }).ok);
check("invalid or path-like IDs are rejected", ["", "a/b", "../x", 7].every((postId) => !validateReportInput({ postId, reason: "spam" }).ok) &&
  !validateReportInput({ postId: "post_1", replyId: "a/b", reason: "spam" }).ok);
check("empty body is rejected", !validateReportInput(undefined).ok && !validateReportInput(null).ok);
check("every reason has a unique ID and label", new Set(REPORT_REASONS.map((r) => r.id)).size === REPORT_REASONS.length && REPORT_REASONS.every((r) => r.label.length > 0));

// ---- duplicate-report key ----
check("same reporter and post produce the same key", reportKeySource("u1", "p1") === reportKeySource("u1", "p1"));
check("different reporters get different keys", reportKeySource("u1", "p1") !== reportKeySource("u2", "p1"));
check("a post and its reply get different keys", reportKeySource("u1", "p1") !== reportKeySource("u1", "p1", "r1"));
check("IDs cannot be shifted between fields to collide", reportKeySource("u1", "p1r1") !== reportKeySource("u1", "p1", "r1") && reportKeySource("u1p", "1") !== reportKeySource("u1", "p1"));

// ---- server wiring ----
const server = readFileSync("server.ts", "utf8");
const route = server.slice(server.indexOf('app.post("/api/community/reports"'), server.indexOf("const ZODIAC_SIGNS"));
check("report route authenticates the reporter", route.includes("authenticateMember(req, res)") && route.includes("reporterUid: uid"));
check("report route validates with the shared rules", route.includes("validateReportInput(req.body)"));
check("report route stores post and content author IDs", route.includes("postAuthorUid") && route.includes("targetAuthorUid"));
check("report route uses a deterministic ID and create() to block duplicates", route.includes("reportKeySource(uid, postId, replyId)") && route.includes(".create(") && route.includes("status(409)"));
check("report route blocks reporting your own content", route.includes("targetAuthorUid === uid"));
check("report route never deletes or bans", !/\.delete\(|suspended|banned|Ref\.update\(|\.set\(/.test(route));

// ---- client wiring ----
const board = readFileSync("src/components/CommunityBoard.tsx", "utf8");
check("report form offers reason choices and optional details", board.includes("REPORT_REASONS.map") && board.includes("reportDetails") && board.includes('type="radio"'));
check("report form validates before sending and shows errors inline", board.includes("validateReportInput({") && board.includes("reportError &&"));
check("success message only after the save call resolves", /await reportCommunityContent\([^)]*\);\s*setReportTarget\(null\);[\s\S]{0,120}setActionMessage\(/.test(board));
check("report form renders next to the post and reply Report buttons", board.includes('renderReportForm("post")') && board.includes('renderReportForm("reply")') && !board.includes("reportKey &&"));
check("signed-out members are sent to sign-in instead of an error", /const openReport[\s\S]{0,80}if \(!viewerUid\) \{\s*onSignIn\(\);/.test(board));
check("post avatars and names use the shared ProfileLink", /function AuthorAvatar[\s\S]{0,400}<ProfileLink/.test(board) && /function AuthorName[\s\S]{0,300}<ProfileLink/.test(board));

const connections = readFileSync("src/components/Connections.tsx", "utf8");
const scheduling = readFileSync("src/components/Scheduling.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
check("Connections avatars and names open profiles", (connections.match(/<ProfileLink uid=\{member\.uid\}/g) ?? []).length === 2);
check("Scheduling selected-reader avatar and name open profiles", (scheduling.match(/<ProfileLink uid=\{selectedReader\.uid\}/g) ?? []).length === 2);
check("App passes the profile handler to Community, Connections and Scheduling",
  ["<CommunityBoard", "<Connections", "<Scheduling"].every((tag) => app.split("\n").some((line) => line.includes(tag) && line.includes("onViewProfile={handleViewMemberProfile}"))));
check("profile overlay renders on Connections and Scheduling tabs", /activeTab === "connections" \|\| activeTab === "scheduling"\) && selectedMemberProfile/.test(app));

// ---- real author identity on posts and replies ----
const author = (uid: string, displayName: string) => ({ authorUid: uid, author: { uid, displayName, avatarUrl: "" } });
const largePhoto = "data:image/jpeg;base64," + "A".repeat(78540);
const mapped = withAuthorAvatars([author("alice", "Alice"), author("bob", "Bob"), author("alice", "Alice"), author("carol", "Carol")], { alice: largePhoto, bob: "data:image/jpeg;base64,QkJC" });
check("each item gets the photo keyed by its own authorUid", mapped[0].author.avatarUrl === largePhoto && mapped[2].author.avatarUrl === largePhoto && mapped[1].author.avatarUrl === "data:image/jpeg;base64,QkJC");
check("author without a photo keeps the initials fallback", mapped[3].author.avatarUrl === "" && mapped[3].author.displayName === "Carol");
check("photo mapping never changes the author's uid or name", mapped.every((item, index) => item.author.uid === item.authorUid && item.author.displayName === ["Alice", "Bob", "Alice", "Carol"][index]));
check("missing or malformed avatar map leaves items unchanged", withAuthorAvatars([author("alice", "A")], undefined)[0].author.avatarUrl === "" && withAuthorAvatars([author("alice", "A")], "x")[0].author.avatarUrl === "" && withAuthorAvatars([author("alice", "A")], { alice: 5 })[0].author.avatarUrl === "");
check("inherited object keys are never used as photos", withAuthorAvatars([author("toString", "T"), author("__proto__", "P")], {}).every((item) => item.author.avatarUrl === ""));
const serverSource = readFileSync("server.ts", "utf8");
const resolver = serverSource.slice(serverSource.indexOf("const resolveCommunityAuthors"), serverSource.indexOf("const getCommunityMember"));
check("board author photos use the public-profile photo validator, not the 40 KB notification limit", resolver.includes("publicProfileAvatar(data.avatarUrl)") && !resolver.includes("safeAvatar("));
check("board honors the member's profile-photo visibility setting", resolver.includes('collection("memberPublicSettings")') && resolver.includes("visibility.avatar"));
check("posts and replies routes return authorAvatars", (serverSource.match(/res\.json\(\{ (posts: withImages|replies: withAuthors), authorAvatars \}\)/g) ?? []).length === 2);
const boardLib = readFileSync("src/lib/communityBoard.ts", "utf8");
check("client post and reply loaders attach author photos", (boardLib.match(/withAuthorAvatars\(result\.(posts|replies), result\.authorAvatars\)/g) ?? []).length === 2);

// ---- broadcast status (shared heartbeat rule) ----
const nowMs = 1_000_000_000;
check("live with heartbeat inside 90 s is active", isLiveSessionActive({ status: "live", updatedAt: nowMs - LIVE_DISPLAY_STALE_MS }, nowMs, LIVE_DISPLAY_STALE_MS));
check("live with heartbeat 1 ms past 90 s is not active", !isLiveSessionActive({ status: "live", updatedAt: nowMs - LIVE_DISPLAY_STALE_MS - 1 }, nowMs, LIVE_DISPLAY_STALE_MS));
check("ended session is never active", !isLiveSessionActive({ status: "ended", updatedAt: nowMs }, nowMs, LIVE_DISPLAY_STALE_MS));
check("startedAt is used before the first heartbeat", isLiveSessionActive({ status: "live", startedAt: nowMs - 1000 }, nowMs, LIVE_DISPLAY_STALE_MS));
check("missing or malformed heartbeat is not active", !isLiveSessionActive({ status: "live" }, nowMs, LIVE_DISPLAY_STALE_MS) && !isLiveSessionActive({ status: "live", updatedAt: "now" }, nowMs, LIVE_DISPLAY_STALE_MS));
check("public profile status uses the shared display heartbeat rule", /isLive = sessionsSnapshot\.docs\.some\(\(session\) => isLiveSessionActive\(session\.data\(\), checkedAt, LIVE_DISPLAY_STALE_MS\)\)/.test(serverSource));
const profileSource = readFileSync("src/components/MemberProfile.tsx", "utf8");
check("Broadcast Status card shows green LIVE NOW only for isLive === true and muted OFFLINE for false", /displayedMember\.isLive === true \? "live" : displayedMember\.isLive === false \? "offline" : "private"/.test(profileSource) &&
  /broadcastState === "live" \? <>[\s\S]*?bg-emerald-400\/15[\s\S]*?Live now/.test(profileSource) && /broadcastState === "offline" \? <>[\s\S]*?text-slate-400[\s\S]*?Offline/.test(profileSource));

console.log(failures ? `\n${failures} OF ${checks} FAILED` : `\nALL ${checks} PASSED`);
process.exit(failures ? 1 : 0);
