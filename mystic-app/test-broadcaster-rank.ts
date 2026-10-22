/*
 * Broadcaster rank tests. Pure ladder checks plus gift/reconciliation checks against the LOCAL Firestore emulator only.
 *   firebase emulators:exec --only firestore --project demo-mysticmentor-rank "npx tsx test-broadcaster-rank.ts"
 */
if (!/^(?:127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST ?? "")) {
  console.error("Refusing to run: FIRESTORE_EMULATOR_HOST must name a loopback emulator (this test must never touch a real project).");
  process.exit(2);
}
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type Stripe from "stripe";
import { BROADCASTER_RANKS, getAuthoritativeBroadcasterRank, getBroadcasterRankProgress } from "./src/lib/broadcasterRanks";
import { GiftSpendError, spendGemsOnGift, summarizeReceivedGifts } from "./liveGifts";
import { applyReconciliation, planReconciliation } from "./scripts/reconcile-broadcaster-rank";
import { summarizePendingTips, summarizeReceivedTips } from "./payments";
import { readFileSync } from "node:fs";
import { isLiveSessionActive, LIVE_DISPLAY_STALE_MS, LIVE_PAYMENT_STALE_MS } from "./src/lib/liveSessionState";
import { confirmLiveTipIn, verifyPaidLiveTip } from "./liveTipRecovery";

let failures = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail: unknown = "") => { checks++; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${JSON.stringify(detail)}`}`); };

// ---- ladder ----
check("exactly seven ranks in order", JSON.stringify(BROADCASTER_RANKS.map((r) => r.name)) === JSON.stringify(["New Seer", "Mystic Adept", "Oracle", "High Oracle", "Celestial Sage", "Grand Mystic", "Luna Master"]));
check("entry rank starts at 0", BROADCASTER_RANKS[0].gems === 0);
check("final thresholds are pinned", JSON.stringify(BROADCASTER_RANKS.map((rank) => rank.gems)) === JSON.stringify([0, 1000, 5000, 15000, 40000, 100000, 250000]));
check("thresholds strictly increasing", BROADCASTER_RANKS.every((r, i) => i === 0 || r.gems > BROADCASTER_RANKS[i - 1].gems));
check("each step is at least as large as the previous step", BROADCASTER_RANKS.every((r, i) => i < 2 || r.gems - BROADCASTER_RANKS[i - 1].gems >= BROADCASTER_RANKS[i - 1].gems - BROADCASTER_RANKS[i - 2].gems));
BROADCASTER_RANKS.forEach((rank, i) => {
  const at = getBroadcasterRankProgress(rank.gems)!;
  const next = BROADCASTER_RANKS[i + 1];
  check(`${rank.name} reached exactly at ${rank.gems}`, at.currentRank.name === rank.name && at.rankProgress === (next ? 0 : 1) && at.gemsToNextRank === (next ? next.gems - rank.gems : 0) && at.nextRank?.name === next?.name);
  if (i > 0) {
    const below = getBroadcasterRankProgress(rank.gems - 1)!;
    check(`${rank.gems - 1} is still ${BROADCASTER_RANKS[i - 1].name}, 1 Gem to ${rank.name}`, below.currentRank.name === BROADCASTER_RANKS[i - 1].name && below.gemsToNextRank === 1 && below.rankProgress < 1);
  }
  if (next) {
    const midpoint = (rank.gems + next.gems) / 2;
    const half = getBroadcasterRankProgress(midpoint)!;
    check(`${rank.name} midpoint is 50% with the correct distance`, half.currentRank.name === rank.name && half.rankProgress === 0.5 && half.gemsToNextRank === next.gems - midpoint);
  }
});
const sample = getBroadcasterRankProgress(1680)!;
check("1,680 Gems: Mystic Adept, 17% toward Oracle, 3,320 remaining", sample.currentRank.name === "Mystic Adept" && sample.rankProgress === 0.17 && sample.gemsToNextRank === 3320);
check("above the top threshold stays at Luna Master", getBroadcasterRankProgress(10_000_000)!.currentRank.name === "Luna Master");
check("invalid totals produce no rank", [-1, 1.5, Number.NaN, Infinity].every((v) => getBroadcasterRankProgress(v) === null));
check("authoritative source: missing total is New Seer", getAuthoritativeBroadcasterRank({})?.currentRank.name === "New Seer");
check("authoritative source: malformed total is unavailable, not reset", getAuthoritativeBroadcasterRank({ lifetimeGemsReceived: "1680" }) === null);
check("authoritative source: missing user is unavailable", getAuthoritativeBroadcasterRank(undefined) === null);
check("authoritative source: null total is unavailable", getAuthoritativeBroadcasterRank({ lifetimeGemsReceived: null }) === null);
check("profile/overlay and server compute identical results from the same total",
  JSON.stringify(getAuthoritativeBroadcasterRank({ lifetimeGemsReceived: 1680 })) === JSON.stringify(getBroadcasterRankProgress(1680)));

// ---- itemized and "today" gift totals (date and time-zone boundaries) ----
const giftRecord = (id: string, createdAt: unknown, gemsAmount: unknown = 10, status: unknown = "completed") => ({ id, status, gemsAmount, createdAt, viewerName: "Viewer" });
const boundaryGifts = [
  giftRecord("utc-late", "2026-10-15T23:59:59.999Z", 100),
  giftRecord("utc-early", "2026-10-16T00:00:00.000Z", 50),
  giftRecord("ny-late", "2026-10-16T03:59:59.999Z", 20),
  giftRecord("ny-early", "2026-10-16T04:00:00.000Z", 10),
];
const utcNoon = new Date("2026-10-16T12:00:00.000Z");
check("today (UTC) starts exactly at UTC midnight", summarizeReceivedGifts(boundaryGifts, "UTC", utcNoon).todayGemsEarned === 80);
check("today (New York) starts at local midnight (04:00Z in EDT)", summarizeReceivedGifts(boundaryGifts, "America/New_York", utcNoon).todayGemsEarned === 10);
check("just before New York midnight, earlier same-local-day gifts count", summarizeReceivedGifts(boundaryGifts, "America/New_York", new Date("2026-10-16T03:59:59.999Z")).todayGemsEarned === 170);
check("today (Tokyo) uses the Tokyo calendar date", summarizeReceivedGifts(boundaryGifts, "Asia/Tokyo", new Date("2026-10-16T00:30:00.000Z")).todayGemsEarned === 180);
const mixed = summarizeReceivedGifts([
  giftRecord("ok", "2026-10-16T01:00:00.000Z", 250),
  giftRecord("pending", "2026-10-16T01:00:00.000Z", 500, "pending"),
  giftRecord("failed", "2026-10-16T01:00:00.000Z", 500, "failed"),
  giftRecord("fraction", "2026-10-16T01:00:00.000Z", 1.5),
  giftRecord("zero", "2026-10-16T01:00:00.000Z", 0),
  giftRecord("string", "2026-10-16T01:00:00.000Z", "100"),
  giftRecord("no-date", undefined, 40),
  giftRecord("bad-date", "not a date", 60),
], "UTC", utcNoon);
check("itemized total counts only completed whole positive Gem records", mixed.totalGemsEarned === 350 && mixed.completed.length === 3, mixed);
check("records with missing or invalid dates count in itemized total but never in today", mixed.todayGemsEarned === 250, mixed);
check("missing itemized records yield 0 itemized, independent of the lifetime total", summarizeReceivedGifts([], "UTC", utcNoon).totalGemsEarned === 0 && getAuthoritativeBroadcasterRank({ lifetimeGemsReceived: 1680 })?.lifetimeGemsReceived === 1680);
check("history is ordered newest first", summarizeReceivedGifts(boundaryGifts, "UTC", utcNoon).completed.map((g) => g.id).join() === "ny-early,ny-late,utc-early,utc-late");
let invalidZoneRejected = false;
try { summarizeReceivedGifts(boundaryGifts, "Not/AZone", utcNoon); } catch (error) { invalidZoneRejected = error instanceof RangeError; }
check("invalid time zone is rejected rather than silently using another date", invalidZoneRejected);

// ---- cash tip summary (separate from Gems and rank) ----
const tipSummary = summarizeReceivedTips([
  { status: "completed", cashAmount: 1, recipientShare: 0.8 },
  { status: "completed", cashAmount: 5.1, recipientShare: 4.08 },
  { status: "pending", cashAmount: 99, recipientShare: 79.2 },
  { status: "completed", cashAmount: "3", recipientShare: 2.4 },
  { status: "completed", cashAmount: 2, recipientShare: 3 },
  { status: "completed" },
]);
check("tip summary sums completed tips in exact cents", tipSummary.count === 2 && tipSummary.grossCents === 610 && tipSummary.recordedShareCents === 488, tipSummary);
check("tip summary reports malformed completed tips instead of zeroing them", tipSummary.unverifiedCount === 3, tipSummary);
check("tip summary of no records is empty", JSON.stringify(summarizeReceivedTips([])) === JSON.stringify({ count: 0, grossCents: 0, recordedShareCents: 0, unverifiedCount: 0 }));
const pendingTips = summarizePendingTips([{ status: "pending", amountCents: 100 }, { status: "pending", amountCents: 10200 }, { status: "completed", amountCents: 500 }, { status: "pending", amountCents: "100" }, { status: "pending", amountCents: 1.5 }]);
check("pending tips are counted separately and never as confirmed earnings", pendingTips.count === 2 && pendingTips.grossCents === 10300, pendingTips);

// ---- UI wiring (source checks) ----
const liveRoomSource = readFileSync("src/components/ImmersiveLiveRoom.tsx", "utf8");
const liveCommunitySource = readFileSync("src/components/LiveCommunity.tsx", "utf8");
const progressSource = readFileSync("src/components/MemberProgressWindow.tsx", "utf8");
const myProfileSource = readFileSync("src/components/MyProfile.tsx", "utf8");
check("Live room no longer has the bar-chart earnings shortcut", !/onEarnings|BarChart3|Creator earnings/.test(liveRoomSource));
check("Live room keeps rank overlay and other controls", ["broadcasterRank", "End broadcast", "onTogglePause", "Heart"].every((token) => liveRoomSource.includes(token)));
check("LiveCommunity no longer passes onEarnings", !liveCommunitySource.includes("onEarnings"));
check("Member rank card uses the shared rank source and has no Clout card", progressSource.includes("useBroadcasterRank(uid)") && progressSource.includes("BROADCASTER_RANKS") && !/clout/i.test(progressSource));
check("Member page keeps wallet/purchases and uses consolidated earnings", myProfileSource.includes("Virtual Gem Wallet") && myProfileSource.includes("gems_500") && myProfileSource.includes("<MemberEarnings") && !myProfileSource.includes("<PaymentsPayouts"));
const publicProfileSource = readFileSync("src/components/MemberProfile.tsx", "utf8");
const serverSource = readFileSync("server.ts", "utf8");
check("public profile has no Clout card but keeps the broadcaster rank card", !/Celestial Clout|cloutPoints\.toLocaleString/.test(publicProfileSource) && publicProfileSource.includes("useBroadcasterRank") && publicProfileSource.includes("Broadcaster rank:"));
check("public profile shows Member Since and Broadcast Status cards", publicProfileSource.includes("Member Since") && publicProfileSource.includes("Broadcast Status") && /"live" : displayedMember\.isLive === false \? "offline" : "private"/.test(publicProfileSource));
check("public profile live status reads every live-status session, not an unordered sample", serverSource.includes('.where("ownerUid", "==", uid).where("status", "==", "live").get()') && !serverSource.includes('.where("ownerUid", "==", uid).limit(5)'));
check("public profile omits live status when hidden and returns the real creation date", serverSource.includes("...(show.liveStatus ? { isLive } : {})") && serverSource.includes("...(memberSince ? { createdAt: memberSince } : {})"));

// ---- live session lifecycle (stale "live" docs) ----
const T = 1_800_000_000_000;
check("fresh heartbeat is active", isLiveSessionActive({ status: "live", updatedAt: T - 1000 }, T, LIVE_DISPLAY_STALE_MS));
check("heartbeat exactly at the display window is active; 1 ms later is not",
  isLiveSessionActive({ status: "live", updatedAt: T - LIVE_DISPLAY_STALE_MS }, T, LIVE_DISPLAY_STALE_MS) && !isLiveSessionActive({ status: "live", updatedAt: T - LIVE_DISPLAY_STALE_MS - 1 }, T, LIVE_DISPLAY_STALE_MS));
check("abandoned session still marked live is inactive for display and payments",
  !isLiveSessionActive({ status: "live", startedAt: T - 3_600_000, updatedAt: T - 3_600_000 }, T, LIVE_DISPLAY_STALE_MS) && !isLiveSessionActive({ status: "live", updatedAt: T - 3_600_000 }, T, LIVE_PAYMENT_STALE_MS));
check("startedAt counts before the first heartbeat", isLiveSessionActive({ status: "live", startedAt: T - 5000 }, T, LIVE_DISPLAY_STALE_MS));
check("missing/invalid heartbeat, ended status or missing doc is inactive",
  [{ status: "live" }, { status: "live", updatedAt: "now" }, { status: "live", updatedAt: Number.NaN }, { status: "ended", updatedAt: T }, null, undefined].every((item) => !isLiveSessionActive(item as never, T, LIVE_DISPLAY_STALE_MS)));
const liveVideoSource = readFileSync("src/lib/liveVideo.ts", "utf8");
const lifecycleServerSource = readFileSync("server.ts", "utf8");
check("broadcaster ends its session when the tab closes (pagehide), not only on unmount", /addEventListener\("pagehide", endOnPageHide\)/.test(liveVideoSource) && /removeEventListener\("pagehide", endOnPageHide\)/.test(liveVideoSource));
check("viewers only join sessions with a recent heartbeat", /isLiveSessionActive\(item, now, LIVE_DISPLAY_STALE_MS\)/.test(liveVideoSource));
check("tips, thumbnails and public live status use the shared liveness rule",
  /!isLiveSessionActive\(session, Date.now\(\), LIVE_PAYMENT_STALE_MS\)/.test(lifecycleServerSource) && (lifecycleServerSource.match(/isLiveSessionActive\(.*, LIVE_DISPLAY_STALE_MS\)/g) ?? []).length >= 2);
check("webhook tip confirmation and recovery share one implementation", /return confirmLiveTipIn\(db, event, session\)/.test(lifecycleServerSource));

// ---- gifts against the emulator ----
const testApp = initializeApp({ projectId: "demo-mysticmentor-rank" });
const db = getFirestore(testApp);
const users = db.collection("users");
const stats = db.collection("broadcasterStats");
const lifetime = async (uid: string) => (await users.doc(uid).get()).data()?.lifetimeGemsReceived;
const publicLifetime = async (uid: string) => (await stats.doc(uid).get()).data()?.lifetimeGemsReceived;
const balance = async (uid: string) => (await users.doc(uid).get()).data()?.gemBalance;
const count = async (path: string) => (await db.collection(path).count().get()).data().count;
const gift = (over: Partial<Parameters<typeof spendGemsOnGift>[1]> = {}) => spendGemsOnGift(db, { senderUid: "viewer", senderIsAnonymous: false, giftId: "heart", recipientId: "host", context: "live", sessionId: "session1", requestId: "req00000001", ...over });
const failsWith = async (p: Promise<unknown>, status: number) => { try { await p; return false; } catch (e) { return e instanceof GiftSpendError && e.status === status; } };

await users.doc("viewer").set({ displayName: "Viewer", gemBalance: 1000, lifetimeGemsReceived: 0 });
await users.doc("host").set({ displayName: "Host", gemBalance: 77, lifetimeGemsReceived: 1680 });
await stats.doc("host").set({ lifetimeGemsReceived: 1680 });
await db.collection("liveSessions").doc("session1").set({ ownerUid: "host", status: "live", updatedAt: Date.now() });
await db.collection("liveSessions").doc("ended").set({ ownerUid: "host", status: "ended" });

await spendGemsOnGift(db, { senderUid: "viewer", senderIsAnonymous: false, giftId: "star", recipientId: "host", context: undefined, sessionId: undefined, requestId: undefined });
check("non-live gift spends Gems but does not advance rank", (await balance("viewer")) === 800 && (await lifetime("host")) === 1680 && (await publicLifetime("host")) === 1680);

check("live gift without a request ID is rejected", await failsWith(gift({ requestId: undefined }), 400));
check("anonymous gift is rejected", await failsWith(gift({ senderIsAnonymous: true }), 400));
check("session owned by another broadcaster is rejected", await failsWith(gift({ recipientId: "viewer" }), 400));
check("gift to an ended session is rejected and changes nothing", await failsWith(gift({ sessionId: "ended" }), 400) && (await balance("viewer")) === 800 && (await lifetime("host")) === 1680);
check("self-gift is rejected", await failsWith(gift({ senderUid: "host" }), 400));
await db.collection("liveSessions").doc("abandoned").set({ ownerUid: "host", status: "live", startedAt: Date.now() - 3_600_000, updatedAt: Date.now() - 3_600_000 });
await db.collection("liveSessions").doc("noheartbeat").set({ ownerUid: "host", status: "live" });
check("gift to an abandoned 'live' session (stale heartbeat) is rejected and changes nothing",
  await failsWith(gift({ sessionId: "abandoned", requestId: "stale0000001" }), 400) && (await balance("viewer")) === 800 && (await lifetime("host")) === 1680 && (await count("users/host/transactions")) === 0);
check("gift to a session with no heartbeat is rejected", await failsWith(gift({ sessionId: "noheartbeat", requestId: "stale0000002" }), 400) && (await lifetime("host")) === 1680);
check("failed gift attempts leave no receipt, spend or financial record", (await count("financial_records")) === 1 && (await count("users/viewer/transactions")) === 1);

const first = await gift();
check("qualifying gift deducts the sender and credits the authoritative total", first.success && (await balance("viewer")) === 790 && (await lifetime("host")) === 1690);
check("qualifying gift refreshes the public copy to the same total", (await publicLifetime("host")) === 1690);
check("recipient balance is untouched by gift rank credit", (await balance("host")) === 77);
const recordsAfterFirst = [await count("financial_records"), await count("users/host/transactions"), await count("users/viewer/transactions")];
check("one financial record and one ledger entry on each side", JSON.stringify(recordsAfterFirst) === JSON.stringify([2, 1, 2]), recordsAfterFirst);

const replay = await gift();
check("replayed request returns the original transaction without crediting again", replay.duplicate === true && replay.transactionId === first.transactionId && (await balance("viewer")) === 790 && (await lifetime("host")) === 1690);
check("replay writes no new records", JSON.stringify([await count("financial_records"), await count("users/host/transactions"), await count("users/viewer/transactions")]) === JSON.stringify(recordsAfterFirst));
check("reusing a request ID for a different gift is rejected", await failsWith(gift({ giftId: "rose" }), 409) && (await lifetime("host")) === 1690);
await db.collection("liveSessions").doc("session1").update({ status: "ended" });
check("completed gift can be safely replayed after the session ends", (await gift()).duplicate === true && (await balance("viewer")) === 790);
await db.collection("liveSessions").doc("session1").update({ status: "live", updatedAt: Date.now() });

const concurrent = await Promise.allSettled([gift({ requestId: "concurrent01" }), gift({ requestId: "concurrent01" }), gift({ requestId: "concurrent01" })]);
check("concurrent duplicates credit exactly once", concurrent.every((r) => r.status === "fulfilled") && (await lifetime("host")) === 1700 && (await balance("viewer")) === 780, concurrent.map((r) => r.status));
await gift({ requestId: "distinct0002" });
check("a distinct request is a separate gift", (await lifetime("host")) === 1710 && (await balance("viewer")) === 770);

await stats.doc("host").set({ lifetimeGemsReceived: 99999 });
await gift({ requestId: "higherpub003" });
check("a higher public copy is never decreased by a gift", (await publicLifetime("host")) === 99999 && (await lifetime("host")) === 1720);
check("display calculations ignore a higher public copy", getAuthoritativeBroadcasterRank((await users.doc("host").get()).data())?.lifetimeGemsReceived === 1720);

await users.doc("broken").set({ gemBalance: 0, lifetimeGemsReceived: "oops" });
await db.collection("liveSessions").doc("session2").set({ ownerUid: "broken", status: "live", updatedAt: Date.now() });
check("malformed broadcaster total blocks the gift and charges nothing", await failsWith(gift({ recipientId: "broken", sessionId: "session2", requestId: "broken000004" }), 409) && (await balance("viewer")) === 760 && (await users.doc("broken").get()).data()?.lifetimeGemsReceived === "oops");
await users.doc("broken").update({ lifetimeGemsReceived: Number.MAX_SAFE_INTEGER });
const recordsBeforeFailure = await count("financial_records");
check("overflow rolls back queued balance writes and records", await failsWith(gift({ recipientId: "broken", sessionId: "session2", requestId: "overflow0004" }), 409) &&
  (await balance("viewer")) === 760 && (await count("financial_records")) === recordsBeforeFailure && (await lifetime("broken")) === Number.MAX_SAFE_INTEGER);
await stats.doc("broken").set({ lifetimeGemsReceived: "invalid" });
await users.doc("broken").update({ lifetimeGemsReceived: 0 });
check("malformed public copy is preserved and gift charges nothing", await failsWith(gift({ recipientId: "broken", sessionId: "session2", requestId: "badpublic004" }), 409) &&
  (await balance("viewer")) === 760 && (await publicLifetime("broken")) === "invalid" && (await lifetime("broken")) === 0);
await users.doc("viewer").update({ gemBalance: "100" });
check("malformed sender balance is rejected without changing the total", await failsWith(gift({ requestId: "badbalance04" }), 409) && (await lifetime("host")) === 1720);
await users.doc("viewer").update({ gemBalance: 760 });

// ---- reconciliation ----
check("higher public copy is blocked, not lowered", (await planReconciliation(db, "host")).action === "blocked" && (await publicLifetime("host")) === 99999);
await stats.doc("host").delete();
const legacy = await planReconciliation(db, "host");
check("legacy total not backed by gift records is reported, not copied", legacy.action === "blocked" && legacy.ledgerTotal === 40 && (await publicLifetime("host")) === undefined, legacy);

await users.doc("clean").set({ gemBalance: 0, lifetimeGemsReceived: 0 });
await db.collection("liveSessions").doc("session3").set({ ownerUid: "clean", status: "live", updatedAt: Date.now() });
await gift({ recipientId: "clean", sessionId: "session3", requestId: "clean0000005" });
await stats.doc("clean").delete();
const plan = await planReconciliation(db, "clean");
check("ledger-backed total with a missing public copy is proposed for update", plan.action === "update" && plan.authoritative === 10);
check("dry run writes nothing", (await publicLifetime("clean")) === undefined);
let wrongTokenRejected = false;
try { await applyReconciliation(db, "clean", "clean:missing:999"); } catch { wrongTokenRejected = true; }
check("apply requires the exact confirmation token", wrongTokenRejected && (await publicLifetime("clean")) === undefined);
const after = await applyReconciliation(db, "clean", plan.action === "update" ? plan.token : "");
check("approved apply sets the public copy to the authoritative total and verifies", after.action === "none" && (await publicLifetime("clean")) === 10 && (await lifetime("clean")) === 10);
await stats.doc("clean").set({ lifetimeGemsReceived: 1, retained: "preserve" });
const stale = await planReconciliation(db, "clean");
await users.doc("clean").update({ updatedAt: "changed after dry run" });
let staleRejected = false;
try { await applyReconciliation(db, "clean", stale.action === "update" ? stale.token : ""); } catch { staleRejected = true; }
check("document version changes invalidate approval even when totals match", staleRejected && (await publicLifetime("clean")) === 1);
const fresh = await planReconciliation(db, "clean");
await applyReconciliation(db, "clean", fresh.action === "update" ? fresh.token : "");
check("reconciliation preserves unrelated public fields and recipient balance", (await stats.doc("clean").get()).data()?.retained === "preserve" && (await balance("clean")) === 0);
await stats.doc("clean").delete();
const ledgerPlan = await planReconciliation(db, "clean");
const cleanLedger = await users.doc("clean").collection("transactions").get();
await cleanLedger.docs[0].ref.update({ status: "pending" });
let ledgerChangeRejected = false;
try { await applyReconciliation(db, "clean", ledgerPlan.action === "update" ? ledgerPlan.token : ""); } catch { ledgerChangeRejected = true; }
check("changed gift evidence invalidates approval without writes", ledgerChangeRejected && (await publicLifetime("clean")) === undefined);
await cleanLedger.docs[0].ref.update({ status: "completed", gemsAmount: 11 });
const malformed = await planReconciliation(db, "clean");
check("malformed completed evidence blocks reconciliation explicitly", malformed.action === "blocked" && malformed.ledgerIssues.length === 1 && (await publicLifetime("clean")) === undefined);
await users.doc("unrecorded").set({ gemBalance: 0 });
check("reconciliation never invents a missing authoritative total", (await planReconciliation(db, "unrecorded")).action === "blocked" && (await publicLifetime("unrecorded")) === undefined);

await users.doc("sender").set({ gemBalance: 20 });
await users.doc("sender_x").set({ gemBalance: 20 });
await stats.doc("host").set({ lifetimeGemsReceived: 1720 });
const separate = await Promise.all([
  gift({ senderUid: "sender", requestId: "x_request01" }),
  gift({ senderUid: "sender_x", requestId: "request01" })
]);
check("sender/request pairs cannot collide in the shared financial ledger", separate[0].transactionId !== separate[1].transactionId &&
  (await db.collection("financial_records").doc(separate[0].transactionId).get()).data()?.userId === "sender" &&
  (await db.collection("financial_records").doc(separate[1].transactionId).get()).data()?.userId === "sender_x" &&
  (await lifetime("host")) === 1740 && (await publicLifetime("host")) === 1740);
await users.doc("legacy-missing").set({ gemBalance: 0, lifetimeGemsReceived: 50 });
await db.collection("liveSessions").doc("legacy-session").set({ ownerUid: "legacy-missing", status: "live", updatedAt: Date.now() });
await gift({ recipientId: "legacy-missing", sessionId: "legacy-session", requestId: "legacy000001" });
check("a new gift never implicitly reconciles a missing historical copy", (await lifetime("legacy-missing")) === 60 && (await publicLifetime("legacy-missing")) === undefined);
await stats.doc("legacy-missing").set({ lifetimeGemsReceived: 20 });
await gift({ recipientId: "legacy-missing", sessionId: "legacy-session", requestId: "legacy000002" });
check("a new gift preserves a lower discrepant historical copy for review", (await lifetime("legacy-missing")) === 70 && (await publicLifetime("legacy-missing")) === 20);

// ---- recovering paid tips the webhook never delivered (stubbed Stripe reader, emulator only) ----
{
  const recTipId = "0123456789abcdef0123456789abcdef";
  const dest = "acct_fixture_dest";
  await db.collection("users").doc("tip-recipient").set({ gemBalance: 7, lifetimeGemsReceived: 1680, cloutPoints: 0 });
  await db.collection("liveTips").doc(recTipId).set({ tipId: recTipId, status: "pending", stripeSessionId: "cs_fixture", amountCents: 100, platformFeeCents: 20, recipientShareCents: 80,
    recipientUid: "tip-recipient", senderUid: "tip-sender", destinationAccount: dest, currency: "usd" });
  const sessionObj = { id: "cs_fixture", object: "checkout.session", livemode: false, status: "complete", payment_status: "paid", amount_total: 100, currency: "usd", created: 1000, payment_intent: "pi_fixture", metadata: { type: "live_tip", tipId: recTipId } };
  const makeStripe = (over: { session?: object; fee?: number; destination?: string; events?: object[] } = {}) => ({
    checkout: { sessions: { retrieve: async () => ({ ...sessionObj, ...over.session }) } },
    paymentIntents: { retrieve: async () => ({ id: "pi_fixture", status: "succeeded", application_fee_amount: over.fee ?? 20, transfer_data: { destination: over.destination ?? dest },
      latest_charge: { id: "ch_fixture", status: "succeeded", transfer: "tr_fixture", application_fee: "fee_fixture" } }) },
    transfers: { retrieve: async () => ({ id: "tr_fixture", amount: 100, destination: over.destination ?? dest }) },
    applicationFees: { retrieve: async () => ({ id: "fee_fixture", amount: over.fee ?? 20 }) },
    events: { list: () => (async function* () { for (const e of over.events ?? [{ id: "evt_fixture", type: "checkout.session.completed", data: { object: sessionObj } }]) yield e; })() },
  }) as unknown as Parameters<typeof verifyPaidLiveTip>[1];
  const refused = async (name: string, stripeStub: Parameters<typeof verifyPaidLiveTip>[1], liveMode = false) =>
    check(`tip recovery refuses: ${name}`, !(await verifyPaidLiveTip(db, stripeStub, recTipId, liveMode)).verified);
  await refused("unpaid/open session", makeStripe({ session: { status: "open", payment_status: "unpaid", payment_intent: null } }));
  await refused("application fee differs from stored fee", makeStripe({ fee: 10 }));
  await refused("payment went to a different connected account", makeStripe({ destination: "acct_other" }));
  await refused("test-mode session with a live-mode key", makeStripe(), true);
  await refused("Stripe has no completion event for the session", makeStripe({ events: [] }));
  await refused("amount differs from stored tip", makeStripe({ session: { amount_total: 500 } }));
  check("pending tip was not touched by refused verifications", (await db.collection("liveTips").doc(recTipId).get()).data()?.status === "pending" && (await count("users/tip-recipient/transactions")) === 0);
  const verified = await verifyPaidLiveTip(db, makeStripe(), recTipId, false);
  check("fully matching paid tip verifies with Stripe's own event", verified.verified && verified.event?.id === "evt_fixture" && verified.amounts.transferCents === 100 && verified.amounts.applicationFeeCents === 20, verified.checks.filter((c) => !c.ok));
  await confirmLiveTipIn(db, verified.event!, verified.event!.data.object);
  await confirmLiveTipIn(db, verified.event!, verified.event!.data.object);
  await confirmLiveTipIn(db, { ...verified.event!, id: "evt_fixture_redelivered" } as never, verified.event!.data.object);
  const rec = (await db.collection("users").doc("tip-recipient").get()).data();
  const receivedTip = (await db.collection("users/tip-recipient/transactions").doc(`tx_tip_${recTipId}`).get()).data();
  check("recovered tip is recorded exactly once despite replays and a redelivered event",
    (await db.collection("liveTips").doc(recTipId).get()).data()?.status === "completed" && (await count("users/tip-recipient/transactions")) === 1 && rec?.cloutPoints === 1 &&
    receivedTip?.type === "tip_received" && receivedTip.cashAmount === 1 && receivedTip.platformFee === 0.2 && receivedTip.recipientShare === 0.8);
  check("recovered tip never changes rank or wallet Gems", rec?.lifetimeGemsReceived === 1680 && rec?.gemBalance === 7);
  check("recovered tip appears in the confirmed cash-tip summary, not as Gems",
    JSON.stringify(summarizeReceivedTips((await db.collection("users/tip-recipient/transactions").where("type", "==", "tip_received").get()).docs.map((d) => d.data()))) === JSON.stringify({ count: 1, grossCents: 100, recordedShareCents: 80, unverifiedCount: 0 }));
}

// Exercise the actual payment-event processor with synthetic fixtures and the demo emulator only.
// Importing server.ts does not start its HTTP server or call Stripe.
const { db: paymentDb, processStripeEvent, publicMemberSince } = await import("./server");
check("member since prefers the Firebase Auth creation time", publicMemberSince("Sat, 03 Oct 2026 21:15:41 GMT", "2026-10-03T22:27:52.293Z") === "2026-10-03T21:15:41.000Z");
check("member since falls back to the stored profile date (string or Timestamp)", publicMemberSince(null, "2026-10-03T22:27:52.293Z") === "2026-10-03T22:27:52.293Z" &&
  publicMemberSince(undefined, { toDate: () => new Date("2026-01-02T03:04:05.000Z") }) === "2026-01-02T03:04:05.000Z");
check("member since is omitted rather than guessed when no valid date exists", publicMemberSince(null, undefined) === null && publicMemberSince("garbage", 12) === null && publicMemberSince(new Date(Date.now() + 86400000).toISOString(), null) === null);
if (testApp.options.projectId !== "demo-mysticmentor-rank" || paymentDb !== getFirestore(testApp, paymentDb.databaseId)) {
  throw new Error("Payment processor is not isolated to the demo project");
}
const paymentUser = paymentDb.collection("users").doc("rank-payment-fixture");
await paymentUser.set({ gemBalance: 20, lifetimeGemsReceived: 1680, cloutPoints: 0 });
await paymentDb.collection("broadcasterStats").doc(paymentUser.id).set({ lifetimeGemsReceived: 1680 });
const paymentEvent = (id: string, session: Record<string, unknown>) => ({
  id, object: "event", api_version: null, created: 1, livemode: false, pending_webhooks: 0, request: null,
  type: "checkout.session.completed", data: { object: { object: "checkout.session", ...session } }
}) as Stripe.CheckoutSessionCompletedEvent;
const purchase = paymentEvent("evt_rank_purchase", {
  id: "cs_rank_purchase", payment_status: "paid", amount_total: 499,
  metadata: { type: "gem_purchase", userId: paymentUser.id, packageId: "gems_500", gemsAmount: "500", transactionId: "rank_purchase_fixture" }
});
await processStripeEvent(purchase);
await processStripeEvent(purchase);
const purchasedUser = (await paymentUser.get()).data();
check("purchasing Gems changes only spendable Gems, not broadcaster rank", purchasedUser?.gemBalance === 520 && purchasedUser.lifetimeGemsReceived === 1680 &&
  (await paymentDb.collection("broadcasterStats").doc(paymentUser.id).get()).data()?.lifetimeGemsReceived === 1680);
check("purchase keeps its existing financial record", (await paymentDb.collection("financial_records").doc("rank_purchase_fixture").get()).data()?.type === "gem_purchase");
const tipId = "abcdef0123456789abcdef0123456789";
await paymentDb.collection("liveTips").doc(tipId).set({
  status: "pending", stripeSessionId: "cs_rank_tip", amountCents: 100,
  platformFeeCents: 20, recipientShareCents: 80, recipientUid: paymentUser.id, senderUid: "tip-sender-fixture"
});
await processStripeEvent(paymentEvent("evt_rank_tip", {
  id: "cs_rank_tip", payment_status: "paid", amount_total: 100, currency: "usd", metadata: { type: "live_tip", tipId }
}));
const tippedUser = (await paymentUser.get()).data();
check("cash tips and their Clout reward do not advance broadcaster rank", tippedUser?.lifetimeGemsReceived === 1680 && tippedUser.gemBalance === 520 && tippedUser.cloutPoints === 1);
check("cash tip preserves its existing financial record", (await paymentDb.collection("financial_records").doc(`tx_tip_${tipId}`).get()).data()?.type === "tip");

console.log(failures ? `\n${failures} OF ${checks} FAILED` : `\nALL ${checks} PASSED`);
process.exit(failures ? 1 : 0);
