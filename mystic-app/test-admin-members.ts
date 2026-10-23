// Emulator-only route and rules tests. All account and report data below are synthetic.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { isDeepStrictEqual } from "node:util";
import express from "express";
import { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { registerAdminPanel } from "./adminPanel";
import { registerAccountRestrictions, registerMemberManagement, isAccountRestricted } from "./memberManagement";
import { readEmailConsent, EMAIL_CONSENT_VERSION, EMAIL_CONSENT_WORDING, type EmailConsent } from "./src/lib/emailConsent";
import RegistrationConsent from "./src/components/RegistrationConsent";
import PolicyPage from "./src/components/PolicyPage";
import MemberRestrictionConfirmation from "./src/components/MemberRestrictionConfirmation";
import MemberCardControls from "./src/components/MemberCardControls";
import AdminGemMetrics from "./src/components/AdminGemMetrics";
import AdminRankings from "./src/components/AdminRankings";
import AdminDiagnostics from "./src/components/AdminDiagnostics";
import { revenueRecord, REVENUE_LIMITATIONS } from "./src/lib/adminRevenue";
import { TERMS_VERSION, PRIVACY_VERSION, POLICY_REVIEW_NOTICE } from "./src/lib/policies";
import { reportStatusLabel, validateReportInput, REPORT_TRANSITIONS } from "./src/lib/communityReports";

const projectId = "demo-mysticmentor-admin-phase2";
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^127\.0\.0\.1:\d+$/);
assert.match(process.env.FIREBASE_AUTH_EMULATOR_HOST || "", /^127\.0\.0\.1:\d+$/);
const firebase = initializeApp({ projectId });
const db = getFirestore(firebase);
const auth = getAuth(firebase);
let checks = 0;
function check(name: string, value: unknown) { assert.ok(value, name); checks++; console.log(`PASS ${name}`); }
type ControlProps = { children?: ReactNode; onClick?: () => void; disabled?: boolean; className?: string; type?: string };
function buttons(node: ReactNode): ControlProps[] {
  const result: ControlProps[] = [];
  Children.forEach(node, (child) => {
    if (!isValidElement<ControlProps>(child)) return;
    if (child.type === "button") result.push(child.props);
    result.push(...buttons(child.props.children));
  });
  return result;
}
const app = express();
app.use(express.json());
registerAccountRestrictions(app, db);
const memberGuard = async (req: express.Request, res: express.Response) => {
  try {
    const token = req.headers.authorization?.slice(7);
    if (!token) { res.status(401).json({ error: "Sign in" }); return null; }
    return (await auth.verifyIdToken(token, true)).uid;
  } catch { res.status(401).json({ error: "Invalid token" }); return null; }
};
const adminGuard = async (req: express.Request, res: express.Response) => {
  const uid = await memberGuard(req, res);
  if (!uid) return null;
  if ((await db.collection("users").doc(uid).get()).data()?.role !== "admin") { res.status(403).json({ error: "Admin only" }); return null; }
  if (req.headers["x-admin-session"] !== "test-verified-session") { res.status(401).json({ error: "PIN required" }); return null; }
  return uid;
};
registerAdminPanel(app, db, adminGuard);
registerMemberManagement(app, db, adminGuard, memberGuard);
app.get("/api/legacy-probe", (_req, res) => res.json({ ok: true }));
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
async function createUser(uid: string, email: string, role = "member") {
  await auth.createUser({ uid, email, password: "synthetic-password-123", emailVerified: true });
  await db.collection("users").doc(uid).set({ uid, email, displayName: uid, role, gemBalance: 0, cloutPoints: 0, createdAt: "2026-10-21T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z" });
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "synthetic-password-123", returnSecureToken: true })
  });
  assert.equal(response.status, 200);
  return (await response.json()).idToken as string;
}
async function request(path: string, token?: string, body?: Record<string, unknown>, pin = true) {
  return fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...(pin ? { "X-Admin-Session": "test-verified-session" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}
async function rest(path: string, token: string, body?: Record<string, unknown>) {
  return fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/${path}`, {
    method: body ? "PATCH" : "GET",
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

try {
  const acceptance = { onboarding: true, termsAccepted: true, termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION };
  const admin = await createUser("phase2_admin", "admin@example.test", "admin");
  const member = await createUser("phase2_member", "member@example.test");
  await createUser("phase2_primary", "kertisjohnson7@gmail.com", "admin");
  await db.collection("broadcasterStats").doc("phase2_admin").set({ uid: "phase2_admin" });
  check("synthetic authenticated-read probe exists before restriction tests", (await rest("broadcasterStats/phase2_admin", member)).status === 200);
  check("unknown and false consent never imply opt-in", !readEmailConsent().consented && !readEmailConsent({ consented: false }).consented && !readEmailConsent({ consented: "true" }).consented);
  check("restriction defaults preserve legacy members", !isAccountRestricted() && !isAccountRestricted({}));
  check("suspension and ban independently restrict accounts", isAccountRestricted({ suspended: true }) && isAccountRestricted({ banned: true }));
  check("anonymous directory access rejected", (await request("/api/admin/members")).status === 401);
  check("ordinary members cannot read email directory", (await request("/api/admin/members", member)).status === 403);
  check("admin without PIN session cannot read directory", (await request("/api/admin/members", admin, undefined, false)).status === 401);
  check("existing account without consent is unconsented", (await (await request("/api/members/me/email-consent", member)).json()).consented === false);
  check("onboarding rejects missing required acceptance", (await request("/api/members/me/email-consent", member, { consented: true, onboarding: true, termsAccepted: false })).status === 400);
  check("old policy version rejected without recording acceptance", (await request("/api/members/me/email-consent", member, { ...acceptance, consented: false, termsVersion: "outdated" })).status === 409 && !(await db.collection("memberPolicyAcceptance").doc("phase2_member").get()).exists);
  check("onboarding succeeds without optional email consent", (await request("/api/members/me/email-consent", member, { ...acceptance, consented: false })).status === 200);
  let consent = (await db.collection("memberEmailConsent").doc("phase2_member").get()).data()!;
  check("false choice persists with server timestamp and wording version", consent.consented === false && consent.version === EMAIL_CONSENT_VERSION && consent.wording === EMAIL_CONSENT_WORDING && typeof consent.recordedAt === "string");
  const policy = (await db.collection("memberPolicyAcceptance").doc("phase2_member").get()).data()!;
  check("required Terms acceptance has separate versions and timestamp", policy.termsVersion === TERMS_VERSION && policy.privacyVersion === PRIVACY_VERSION && typeof policy.acceptedAt === "string" && policy.actor === "phase2_member" && consent.consented === false);
  check("existing members have no fabricated policy acceptance", !(await db.collection("memberPolicyAcceptance").doc("phase2_admin").get()).exists);
  check("non-boolean consent rejected", (await request("/api/members/me/email-consent", member, { consented: "true" })).status === 400);
  check("later explicit opt-in succeeds", (await request("/api/members/me/email-consent", member, { consented: true })).status === 200);
  check("registration retry cannot overwrite a later preference", (await (await request("/api/members/me/email-consent", member, { ...acceptance, consented: false })).json()).consented === true);
  check("acceptance retry preserves original history and timestamp", (await db.collection("memberPolicyAcceptance").doc("phase2_member").collection("history").get()).size === 1 && (await db.collection("memberPolicyAcceptance").doc("phase2_member").get()).data()?.acceptedAt === policy.acceptedAt);
  await request("/api/members/me/email-consent", member, { consented: false });
  consent = (await db.collection("memberEmailConsent").doc("phase2_member").get()).data()!;
  check("unsubscribe persists false and history is append-only", consent.consented === false && (await db.collection("memberEmailConsent").doc("phase2_member").collection("history").get()).size === 3);
  check("unauthenticated consent mutation rejected", (await request("/api/members/me/email-consent", undefined, { consented: true })).status === 401);
  check("ordinary member cannot edit another member", (await request("/api/admin/members/edit", member, { uid: "phase2_admin", displayName: "Changed" })).status === 403);
  check("invalid edit rejected", (await request("/api/admin/members/edit", admin, { uid: "phase2_member", displayName: "" })).status === 400);
  check("admin edit succeeds", (await request("/api/admin/members/edit", admin, { uid: "phase2_member", displayName: "Chosen name" })).status === 200);
  check("Edit Name persists the exact name", (await db.collection("users").doc("phase2_member").get()).data()?.displayName === "Chosen name");
  const editedAccount = await (await request("/api/admin/accounts?email=member@example.test", admin)).json();
  check("email directory reload returns saved profile name instead of stale Auth name", editedAccount.members[0].displayName === "Chosen name");
  const editedNameSearch = await (await request("/api/admin/members?search=Chosen&searchBy=displayName", admin)).json();
  check("name search finds the saved display name", editedNameSearch.members.length === 1 && editedNameSearch.members[0].displayName === "Chosen name");
  check("name edit audit records the prior and saved name", (await db.collection("adminAudit").where("action", "==", "edit-display-name").get()).docs.some((item) => item.data().before === "phase2_member" && item.data().displayName === "Chosen name"));
  check("edit changes only supported profile fields", (await db.collection("users").doc("phase2_member").get()).data()?.gemBalance === 0);
  check("admin cannot suspend self", (await request("/api/admin/members/action", admin, { action: "suspend", uid: "phase2_admin", enabled: true })).status === 403);
  check("primary admin cannot be banned", (await request("/api/admin/members/action", admin, { action: "ban", uid: "phase2_primary", enabled: true })).status === 403);
  check("self demotion rejected", (await request("/api/admin/members/action", admin, { action: "demote", uid: "phase2_admin" })).status === 403);
  check("ordinary member cannot ban another account", (await request("/api/admin/members/action", member, { action: "ban", uid: "phase2_admin", enabled: true })).status === 403);
  check("no PIN means no member action", (await request("/api/admin/members/action", admin, { action: "suspend", uid: "phase2_member", enabled: true }, false)).status === 401);
  check("authorized suspension succeeds", (await request("/api/admin/members/action", admin, { action: "suspend", uid: "phase2_member", enabled: true })).status === 200);
  const suspendedAccount = await (await request("/api/admin/accounts?email=member@example.test", admin)).json();
  check("suspension is persisted and returned on directory reload", suspendedAccount.members[0].suspended === true && (await db.collection("users").doc("phase2_member").get()).data()?.suspended === true);
  const suspendedFilter = await (await request("/api/admin/members?search=suspended&searchBy=status", admin)).json();
  check("directory restriction-status filter finds suspended profile", suspendedFilter.members.some((item: { uid: string }) => item.uid === "phase2_member"));
  check("suspended existing token cannot call legacy API", (await request("/api/legacy-probe", member)).status === 403);
  check("restricted member can observe own profile only", (await rest("users/phase2_member", member)).status === 200);
  check("restricted member cannot access authenticated Firestore data", (await rest("broadcasterStats/phase2_admin", member)).status === 403);
  await request("/api/admin/members/action", admin, { action: "ban", uid: "phase2_member", enabled: true });
  await request("/api/admin/members/action", admin, { action: "suspend", uid: "phase2_member", enabled: false });
  check("unsuspending does not remove a ban", (await request("/api/legacy-probe", member)).status === 403);
  const bannedAccount = await (await request("/api/admin/accounts?email=member@example.test", admin)).json();
  check("ban and unsuspend persist independently", bannedAccount.members[0].banned === true && bannedAccount.members[0].suspended === false);
  const bannedFilter = await (await request("/api/admin/members?search=banned&searchBy=status", admin)).json();
  check("directory restriction-status filter finds banned profile", bannedFilter.members.some((item: { uid: string }) => item.uid === "phase2_member"));
  check("banned existing token cannot access authenticated Firestore data", (await rest("broadcasterStats/phase2_admin", member)).status === 403);
  await request("/api/admin/members/action", admin, { action: "ban", uid: "phase2_member", enabled: false });
  check("unban restores unrestricted account access", (await request("/api/legacy-probe", member)).status === 200);
  check("unban persists in Firestore", (await db.collection("users").doc("phase2_member").get()).data()?.banned === false);
  check("unbanned profile can still be edited under rules", (await rest("users/phase2_member?updateMask.fieldPaths=displayName", member, { fields: { displayName: { stringValue: "Member edit" } } })).status === 200);
  check("member cannot self-assign banned flag", (await rest("users/phase2_member?updateMask.fieldPaths=banned", member, { fields: { banned: { booleanValue: true } } })).status === 403);
  check("consent collection is never directly readable", (await rest("memberEmailConsent/phase2_member", member)).status === 403);
  check("consent cannot be forged with direct writes", (await rest("memberEmailConsent/phase2_member", member, { fields: { consented: { booleanValue: true } } })).status === 403);
  check("admin cannot read consent directly without server gate", (await rest("memberEmailConsent/phase2_member", admin)).status === 403);
  check("policy acceptance cannot be forged by client writes", (await rest("memberPolicyAcceptance/phase2_member", member, { fields: { termsVersion: { stringValue: TERMS_VERSION } } })).status === 403);
  check("policy acceptance histories are not directly readable", (await rest("memberPolicyAcceptance/phase2_member/history", admin)).status === 403);
  check("ordinary member cannot read another member email profile", (await rest("users/phase2_admin", member)).status === 403);
  check("delete action remains unavailable", (await request("/api/admin/members/action", admin, { action: "delete", uid: "phase2_member" })).status === 400 && (await db.collection("users").doc("phase2_member").get()).exists);
  const batch = db.batch();
  for (let index = 0; index < 55; index++) batch.set(db.collection("users").doc(`page_${String(index).padStart(3, "0")}`), { displayName: `Paging ${index}`, email: `paging${index}@example.test`, role: "member" });
  await batch.commit();
  await Promise.all(Array.from({ length: 55 }, (_, index) => auth.createUser({ uid: `page_${String(index).padStart(3, "0")}`, email: `paging${index}@example.test` })));
  const firstPage = await (await request("/api/admin/members", admin)).json();
  const nextPage = await (await request(`/api/admin/members?after=${firstPage.nextCursor}`, admin)).json();
  check("directory is bounded with non-overlapping pages", firstPage.members.length === 50 && nextPage.members.length === 8 && !nextPage.members.some((item: { uid: string }) => firstPage.members.some((prior: { uid: string }) => prior.uid === item.uid)));
  const emailSearch = await (await request("/api/admin/members?search=member@example.test&searchBy=email", admin)).json();
  check("directory search reaches matching account beyond first page", emailSearch.members.length === 1 && emailSearch.members[0].uid === "phase2_member");
  check("admin directory exposes explicit consent separately", emailSearch.members[0].emailConsent.consented === false && emailSearch.members[0].email === "member@example.test");
  const nameSearch = await (await request("/api/admin/members?search=Paging&searchBy=displayName", admin)).json();
  check("name-prefix query is bounded", nameSearch.members.length === 50 && nameSearch.nextCursor);
  const nameNext = await (await request(`/api/admin/members?search=Paging&searchBy=displayName&after=${nameSearch.nextCursor}`, admin)).json();
  check("name-prefix cursor traverses remaining matches", nameNext.members.length === 5);
  const adminRoleSearch = await (await request("/api/admin/members?search=admin&searchBy=role", admin)).json();
  check("member directory can search exact profile role", adminRoleSearch.members.length === 2 &&
    adminRoleSearch.members.every((item: { role: string }) => item.role === "admin"));
  check("member directory rejects unsupported role filters", (await request("/api/admin/members?search=owner&searchBy=role", admin)).status === 400);
  const panelResponse = await request("/api/admin/panel", admin);
  const panel = await panelResponse.json();
  check("panel counts all profiles without fetching full directory", panel.memberCount === 58 && panel.members.length === 2);
  check("protected Admin panel bundle is not cacheable", panelResponse.headers.get("cache-control") === "no-store");
  await auth.createUser({ uid: "auth_only", email: "auth-only@example.test" });
  check("ordinary member cannot read full Auth directory", (await request("/api/admin/accounts", member)).status === 403);
  check("full Auth directory requires PIN session", (await request("/api/admin/accounts", admin, undefined, false)).status === 401);
  const accountFirst = await (await request("/api/admin/accounts", admin)).json();
  const accountNext = await (await request(`/api/admin/accounts?pageToken=${encodeURIComponent(accountFirst.nextCursor)}`, admin)).json();
  check("Auth directory is paginated and includes every account", accountFirst.members.length === 50 && accountNext.members.length === 9);
  const authOnly = await (await request("/api/admin/accounts?email=auth-only@example.test", admin)).json();
  check("email search includes Auth-only account without invented profile or consent", authOnly.members[0].uid === "auth_only" && authOnly.members[0].hasProfile === false && authOnly.members[0].emailConsent.consented === false);
  check("profile-less account cannot be implicitly edited or granted data", (await request("/api/admin/members/edit", admin, { uid: "auth_only", displayName: "New profile" })).status === 404 && !(await db.collection("users").doc("auth_only").get()).exists);
  await db.collection("communityReports").doc("report_1").set({
    reporterUid: "phase2_member", postId: "post_1", targetType: "post", targetAuthorUid: "phase2_admin",
    reason: "spam", details: "Synthetic report", status: "open", createdAt: FieldValue.serverTimestamp()
  });
  check("member cannot read reports through server", (await request("/api/admin/reports", member)).status === 403);
  check("reports require PIN session", (await request("/api/admin/reports", admin, undefined, false)).status === 401);
  check("reports remain directly private", (await rest("communityReports/report_1", admin)).status === 403);
  check("ordinary member cannot change review state", (await request("/api/admin/reports/review", member, { id: "report_1", fromStatus: "open", status: "reviewing" })).status === 403);
  check("report mutations require PIN session", (await request("/api/admin/reports/review", admin, { id: "report_1", fromStatus: "open", status: "reviewing" }, false)).status === 401);
  check("invalid transition is rejected", (await request("/api/admin/reports/review", admin, { id: "report_1", fromStatus: "open", status: "resolved" })).status === 400);
  check("prototype property cannot become a transition", (await request("/api/admin/reports/review", admin, { id: "report_1", fromStatus: "constructor", status: "reviewing" })).status === 400);
  const updates = await Promise.all([1, 2].map(() => request("/api/admin/reports/review", admin, { id: "report_1", fromStatus: "open", status: "reviewing" })));
  check("concurrent review has one success and one conflict", updates.map((item) => item.status).sort().join(",") === "200,409");
  await request("/api/admin/reports/review", admin, { id: "report_1", fromStatus: "reviewing", status: "resolved" });
  const report = (await db.collection("communityReports").doc("report_1").get()).data()!;
  check("review preserves original report and reviewer timestamp", report.details === "Synthetic report" && report.status === "resolved" && report.reviewedBy === "phase2_admin" && typeof report.reviewedAt === "string");
  check("review history appends once per committed change", (await db.collection("communityReports").doc("report_1").collection("history").get()).size === 2);
  check("review and member actions leave audit records", (await db.collection("adminAudit").where("action", "==", "report-review").get()).size === 2 && (await db.collection("adminAudit").where("action", "==", "ban").get()).size === 2);
  const reportPage = await (await request("/api/admin/reports", admin)).json();
  check("report queue returns time, details and current state", reportPage.reports[0].createdAt && reportPage.reports[0].details === "Synthetic report" && reportPage.reports[0].status === "resolved");
  const reportBatch = db.batch();
  for (let index = 0; index < 30; index++) reportBatch.set(db.collection("communityReports").doc(`report_page_${index}`), { reason: "spam", details: "Synthetic paging", status: "open", createdAt: FieldValue.serverTimestamp() });
  await reportBatch.commit();
  const reportFirst = await (await request("/api/admin/reports", admin)).json();
  const reportNext = await (await request(`/api/admin/reports?after=${reportFirst.nextCursor}`, admin)).json();
  check("report queue is bounded and paginated", reportFirst.reports.length === 25 && reportNext.reports.length === 6);
  const source = readFileSync("server.ts", "utf8");
  check("production wiring retains role + PIN guard and reports configured Firebase IDs", source.includes("registerMemberManagement(app, db, requireAdminSession, authenticateMember)") &&
    source.includes("registerAdminPanel(app, db, requireAdminSession, {") &&
    source.includes("projectId: firebaseConfig.projectId") && source.includes("firestoreDatabaseId: firebaseConfig.firestoreDatabaseId"));
  check("restrictions middleware registered after webhook and before member routes", source.indexOf('app.post("/api/stripe-webhook"') < source.indexOf("registerAccountRestrictions(app, db)") && source.indexOf("registerAccountRestrictions(app, db)") < source.indexOf('app.post("/api/init-profile"'));
  const ui = readFileSync("src/App.tsx", "utf8");
  const checkboxes = readFileSync("src/components/RegistrationConsent.tsx", "utf8");
  check("email checkbox defaults false independently of required terms", ui.includes("[emailOptIn, setEmailOptIn] = useState(false)") && ui.includes('authMode === "register" && !termsAccepted') && checkboxes.includes('required checked={termsAccepted}') && checkboxes.includes('type="checkbox" checked={emailOptIn}'));
  check("both onboarding forms use shared separate consent controls", ui.includes("<RegistrationConsent") && readFileSync("src/components/CelestialOnboarding.tsx", "utf8").includes("<RegistrationConsent"));
  const controls = renderToStaticMarkup(createElement(RegistrationConsent, { termsAccepted: true, onTermsChange: () => {}, emailOptIn: false, onEmailChange: () => {} }));
  const inputs = controls.match(/<input[^>]+>/g) || [];
  check("rendered onboarding permits required terms without optional email", inputs.length === 2 && inputs[0].includes("required") && inputs[0].includes("checked") && !inputs[1].includes("required") && !inputs[1].includes("checked"));
  check("registration directly links both policies without leaving the form", controls.includes('href="/terms"') && controls.includes('href="/privacy"') && controls.includes('target="_blank"'));
  const termsPage = renderToStaticMarkup(createElement(PolicyPage, { policy: "terms" }));
  const privacyPage = renderToStaticMarkup(createElement(PolicyPage, { policy: "privacy" }));
  check("public policy pages render substantive versioned starter documents", termsPage.includes(TERMS_VERSION) && privacyPage.includes(PRIVACY_VERSION) && termsPage.includes(POLICY_REVIEW_NOTICE) && privacyPage.includes("Retention, security, and requests"));
  check("Terms distinguish necessary emails and incomplete promotional integration", termsPage.includes("necessary account and service-related emails") && termsPage.includes("does not opt you into") && termsPage.includes("unsubscribe mechanism") && termsPage.includes("when those notices are sent"));
  const root = readFileSync("src/main.tsx", "utf8");
  check("public policy routes do not require the Admin/member UI", root.includes("path === '/terms' || path === '/privacy'") && root.includes("<PolicyPage policy="));
  check("footer and settings both link policies", readFileSync("src/components/LandingPage.tsx", "utf8").includes("<PolicyLinks") && readFileSync("src/components/MyProfile.tsx", "utf8").includes("<PolicyLinks"));
  check("failed acceptance saves have retryable registration view", ui.includes("registrationPending ? (") && ui.includes("retryRegistration") && ui.indexOf('authMode === "register" && !termsAccepted') < ui.indexOf("await createUserWithEmailAndPassword"));
  check("member settings support later opt-out", readFileSync("src/components/MyProfile.tsx", "utf8").includes("<EmailPreference") && readFileSync("src/components/EmailPreference.tsx", "utf8").includes("consented: choice"));
  const historyPath = "/api/admin/members/phase2_member/email-consent";
  check("anonymous cannot inspect marketing preference history", (await request(historyPath)).status === 401);
  check("ordinary member cannot inspect Admin preference history", (await request(historyPath, member)).status === 403);
  check("history requires Admin PIN session", (await request(historyPath, admin, undefined, false)).status === 401);
  const historyResponse = await request(historyPath, admin);
  const preferenceHistory = await historyResponse.json();
  check("history responses prevent caching sensitive preferences", historyResponse.headers.get("cache-control") === "no-store");
  check("Admin can inspect current opt-out and all three recorded choices", preferenceHistory.current.consented === false && preferenceHistory.history.length === 3 &&
    preferenceHistory.history.filter((item: { consented: boolean }) => item.consented).length === 1 &&
    preferenceHistory.history.filter((item: { consented: boolean }) => !item.consented).length === 2);
  check("Admin history exposes original timestamps, wording and sources", preferenceHistory.history.every((item: { recordedAt: unknown; version: string; wording: string; source: string }) =>
    typeof item.recordedAt === "string" && item.version === EMAIL_CONSENT_VERSION && item.wording === EMAIL_CONSENT_WORDING && ["onboarding", "account-settings"].includes(item.source)));
  check("unrecorded consent is explicitly unknown and history empty", (await (await request("/api/admin/members/phase2_admin/email-consent", admin)).json()).history.length === 0);
  check("history route has no Admin write operation", (await request(historyPath, admin, { consented: true })).status === 404 &&
    (await db.collection("memberEmailConsent").doc("phase2_member").get()).data()?.consented === false);
  check("invalid preference history cursor is rejected", (await request(`${historyPath}?after=missing_cursor`, admin)).status === 409);
  const historyBatch = db.batch();
  for (let index = 0; index < 27; index++) historyBatch.set(db.collection("memberEmailConsent").doc("phase2_member").collection("history").doc(`synthetic_${index}`), {
    consented: index % 2 === 0, recordedAt: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`, version: EMAIL_CONSENT_VERSION, source: "account-settings", wording: EMAIL_CONSENT_WORDING
  });
  await historyBatch.commit();
  const historyFirst = await (await request(historyPath, admin)).json();
  const historyNext = await (await request(`${historyPath}?after=${historyFirst.nextCursor}`, admin)).json();
  check("preference history is bounded and paginated without repeats", historyFirst.history.length === 25 && historyNext.history.length === 5 &&
    !historyNext.history.some((item: { id: string }) => historyFirst.history.some((prior: { id: string }) => prior.id === item.id)));
  check("preference history is newest first", historyFirst.history.every((item: { recordedAt: string }, index: number) => index === 0 || item.recordedAt <= historyFirst.history[index - 1].recordedAt));
  for (const action of ["suspend", "ban"] as const) {
    for (const enabled of [true, false]) {
      const confirmation = renderToStaticMarkup(createElement(MemberRestrictionConfirmation, { action, enabled, memberLabel: "Synthetic member", busy: false, onConfirm: () => {}, onCancel: () => {} }));
      const label = action === "ban" ? enabled ? "ban" : "unban" : enabled ? "suspend" : "unsuspend";
      check(`in-page ${label} confirmation renders explicit confirm and cancel`, confirmation.includes(`Confirm ${label}`) && confirmation.includes("Cancel") && confirmation.includes('aria-label="Confirm account restriction"'));
    }
  }
  const memberUI = readFileSync("src/components/AdminMembers.tsx", "utf8");
  const cardControls = readFileSync("src/components/MemberCardControls.tsx", "utf8");
  check("restriction actions no longer depend on suppressible browser confirm", !memberUI.includes("window.confirm") && memberUI.includes("<MemberRestrictionConfirmation") && memberUI.includes("adminMemberAction(action, { uid: member.uid }, enabled)"));
  check("name edits and restrictions display outcome and refresh directory", memberUI.includes("Display name saved as") && memberUI.includes('setRefresh((value) => value + 1)') && memberUI.includes("Any other restrictions remain in effect."));
  check("preference history UI is read-only and distinguishes decline/withdrawal", readFileSync("src/components/AdminEmailConsentHistory.tsx", "utf8").includes("Opt-out / declined or withdrawn") && cardControls.includes("View email preference history"));
  check("member card keys and action handlers use the member UID, never an index", memberUI.includes("key={member.uid}") &&
    memberUI.includes("void save(member.uid)") && memberUI.includes("pendingAction?.uid === member.uid") &&
    cardControls.includes('onRestriction(member.uid, "suspend", member.suspended !== true)') && cardControls.includes('onRestriction(member.uid, "ban", member.banned !== true)') &&
    memberUI.includes('key={member.uid} uid={member.uid}') && !memberUI.includes("members[0]"));
  check("name drafts are bound to their UID and cannot submit twice while saving", memberUI.includes('setEditing({ uid: target.uid, name: target.displayName || "" })') &&
    memberUI.includes("editing?.uid !== uid") && memberUI.includes("mutationInFlight.current = true") && memberUI.includes('required disabled={busy} maxLength={100} value={editing.name}'));
  check("directory reload clears stale drafts, restriction confirmations and history", memberUI.includes("setEditing(null); setPendingAction(null); setHistoryUid(null);"));
  check("each card offers the inverse action for its own restriction flags", cardControls.includes('{member.suspended ? "Unsuspend" : "Suspend"}') &&
    cardControls.includes('{member.banned ? "Unban" : "Ban"}') && !memberUI.includes(".filter("));
  check("Admin requests bypass cached private directory data", readFileSync("src/lib/adminAccess.ts", "utf8").includes('cache: "no-store"'));
  check("history is registered before the production API not-found fallback", source.indexOf("registerMemberManagement(app, db, requireAdminSession, authenticateMember)") < source.indexOf('app.use("/api", (_req, res) => res.status(404)'));
  const firstRow = ["broadcast", "shuffle", "deck", "staff", "financials", "images", "security"];
  const adminNavigation = ui.slice(ui.indexOf('aria-label="Existing Admin tools"'), ui.indexOf('aria-label="New Admin sections"'));
  check("the seven existing Admin tabs retain their order", firstRow.every((tab, index) => adminNavigation.includes(`setAdminSubTab("${tab}")`) &&
    (index === 0 || adminNavigation.indexOf(`setAdminSubTab("${tab}")`) > adminNavigation.indexOf(`setAdminSubTab("${firstRow[index - 1]}")`))));
  check("Phase 2 sections and reliable Overview remain wired under the Admin gate", ui.includes('activeTab === "admin" && isAdminAuthenticated') &&
    ui.includes('adminSubTab === "members" && <AdminMembers />') && ui.includes('adminSubTab === "reports" && <AdminReports />') &&
    ui.includes('Registered profiles') && ui.includes('adminDataLoaded && memberCount !== null') && ui.includes('Not available yet') &&
    ui.includes('id: "rewards"') && ui.includes('id: "rankings"') && ui.includes('id: "diagnostics"'));
  check("Staff Roster retains role and Tarot duties rather than the full member directory", ui.includes("onSubmit={handlePromoteStaff}") &&
    ui.includes("handleDemoteStaff(staff.uid, staff.email)") && ui.includes("handleSetTarotReader(null, { uid: reader.uid, email: reader.email }, false)") &&
    !ui.includes('memberList.map('));

  type DirectoryMember = {
    uid: string; email: string; displayName: string; role: string; suspended?: boolean; banned?: boolean; emailConsent: EmailConsent;
  };
  const integrationMembers = await Promise.all(["a", "b", "c"].map(async (suffix) => {
    const uid = `integration_${suffix}`;
    const email = `${uid}@example.test`;
    return { uid, email, name: `Integration member ${suffix.toUpperCase()}`, token: await createUser(uid, email) };
  }));
  const integrationRefs = integrationMembers.map(({ uid }) => db.collection("users").doc(uid));
  const beforeUnrelated = (await db.collection("users").doc("phase2_member").get()).data();
  for (const target of integrationMembers) {
    const prior = await db.getAll(...integrationRefs);
    check(`${target.uid}: Edit Name accepts the specific target UID`, (await request("/api/admin/members/edit", admin, { uid: target.uid, displayName: target.name })).status === 200);
    const updated = await db.getAll(...integrationRefs);
    check(`${target.uid}: Edit Name leaves every other card unchanged`, updated.every((item, index) => item.id === target.uid
      ? item.data()?.displayName === target.name
      : isDeepStrictEqual(item.data(), prior[index].data())));
    const result = await (await request(`/api/admin/accounts?email=${encodeURIComponent(target.email)}`, admin)).json();
    check(`${target.uid}: fresh email query returns the persisted name and matching email/UID`, result.members.length === 1 &&
      result.members[0].uid === target.uid && result.members[0].displayName === target.name && result.members[0].email === target.email);
    check(`${target.uid}: name edit audit identifies actor and target`, (await db.collection("adminAudit").where("targetUid", "==", target.uid).get()).docs.some((item) =>
      item.data().action === "edit-display-name" && item.data().actor === "phase2_admin" && item.data().displayName === target.name));
  }
  const [alpha, beta, legacy] = integrationMembers;
  const acceptedAfter = new Date().toISOString();
  await request("/api/members/me/email-consent", alpha.token, { ...acceptance, consented: true });
  await request("/api/members/me/email-consent", alpha.token, { consented: false, uid: beta.uid });
  check("member preference updates derive ownership from authentication, ignoring a forged target UID", !(await db.collection("memberEmailConsent").doc(beta.uid).get()).exists &&
    (await db.collection("memberEmailConsent").doc(alpha.uid).get()).data()?.consented === false);
  await request("/api/members/me/email-consent", beta.token, { ...acceptance, consented: false });
  await request("/api/members/me/email-consent", beta.token, { consented: true });
  await request("/api/members/me/email-consent", beta.token, { consented: false });
  const acceptedBefore = new Date().toISOString();
  for (const target of [alpha, beta]) {
    const acceptanceRecord = (await db.collection("memberPolicyAcceptance").doc(target.uid).get()).data()!;
    check(`${target.uid}: policy acceptance retains correct versions, actor and server timestamp`, acceptanceRecord.termsVersion === TERMS_VERSION &&
      acceptanceRecord.privacyVersion === PRIVACY_VERSION && acceptanceRecord.actor === target.uid &&
      acceptanceRecord.acceptedAt >= acceptedAfter && acceptanceRecord.acceptedAt <= acceptedBefore);
  }
  for (const [index, target] of integrationMembers.entries()) {
    const history = await (await request(`/api/admin/members/${target.uid}/email-consent`, admin)).json();
    const storedHistory = await db.collection("memberEmailConsent").doc(target.uid).collection("history").get();
    check(`${target.uid}: Admin history uses only that member's events, exact timestamps and wording`, history.history.length === [2, 3, 0][index] &&
      history.history.every((item: { id: string; recordedAt: string; wording: string; version: string; source: string }) => {
        const stored = storedHistory.docs.find((doc) => doc.id === item.id)?.data();
        return stored?.actor === target.uid && item.recordedAt === stored.recordedAt && item.wording === stored.wording &&
          item.version === stored.version && item.source === stored.source;
      }));
    check(`${target.uid}: Admin cannot record marketing permission on this history endpoint`, (await request(`/api/admin/members/${target.uid}/email-consent`, admin, { consented: true })).status === 404);
  }
  check("legacy member inspection creates neither consent nor policy acceptance", !(await db.collection("memberEmailConsent").doc(legacy.uid).get()).exists &&
    !(await db.collection("memberPolicyAcceptance").doc(legacy.uid).get()).exists);
  check("another member's consent cursor cannot be used to cross-read history", (await request(`/api/admin/members/${beta.uid}/email-consent?after=${(await db.collection("memberEmailConsent").doc(alpha.uid).collection("history").get()).docs[0].id}`, admin)).status === 409);

  async function changeRestriction(target: typeof alpha, action: "suspend" | "ban", enabled: boolean) {
    const prior = await db.getAll(...integrationRefs);
    check(`${target.uid}: ${action}=${enabled} is authorized and saved`, (await request("/api/admin/members/action", admin, { uid: target.uid, action, enabled })).status === 200);
    const updated = await db.getAll(...integrationRefs);
    const field = action === "suspend" ? "suspended" : "banned";
    check(`${target.uid}: ${action}=${enabled} changes only the requested account and flag`, updated.every((item, index) => {
      const data = item.data()!;
      if (item.id !== target.uid) return isDeepStrictEqual(data, prior[index].data());
      const before = prior[index].data()!;
      return data[field] === enabled && data.displayName === before.displayName && data.email === before.email &&
        data.role === before.role && data.gemBalance === before.gemBalance &&
        data[action === "suspend" ? "banned" : "suspended"] === before[action === "suspend" ? "banned" : "suspended"];
    }));
  }
  await changeRestriction(alpha, "suspend", true);
  await changeRestriction(beta, "ban", true);
  await changeRestriction(legacy, "suspend", true);
  await changeRestriction(legacy, "ban", true);
  const listed: DirectoryMember[] = [];
  let pageToken: string | null = null;
  do {
    const response = await request(`/api/admin/accounts${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ""}`, admin);
    check("refreshed account directory is successful and uncached", response.status === 200 && response.headers.get("cache-control") === "no-store");
    const data: { members: DirectoryMember[]; nextCursor: string | null } = await response.json();
    listed.push(...data.members);
    pageToken = data.nextCursor;
  } while (pageToken);
  const nameResponse = await request("/api/admin/members?search=Integration&searchBy=displayName", admin);
  const nameResults: { members: DirectoryMember[] } = await nameResponse.json();
  check("profile-name search is also uncached", nameResponse.headers.get("cache-control") === "no-store");
  for (const [index, target] of integrationMembers.entries()) {
    for (const [label, records] of [["full directory", listed], ["name search", nameResults.members]] as const) {
      const record = records.find((item) => item.uid === target.uid);
      check(`${target.uid}: ${label} keeps the restricted account visible with identity, role and flags`, record?.email === target.email &&
        record.displayName === target.name && record.role === "member" && record.suspended === (index !== 1 ? true : undefined) &&
        record.banned === (index !== 0 ? true : undefined) && record.emailConsent.consented === false);
    }
    check(`${target.uid}: restricted existing token is denied by API and Firestore`, (await request("/api/legacy-probe", target.token)).status === 403 &&
      (await rest("broadcasterStats/phase2_admin", target.token)).status === 403);
    const restrictedHistory = await (await request(`/api/admin/members/${target.uid}/email-consent`, admin)).json();
    check(`${target.uid}: restriction never hides history from an authorized Admin`, restrictedHistory.history.length === [2, 3, 0][index]);
    check(`${target.uid}: Admin can edit a restricted account without removing restrictions`, (await request("/api/admin/members/edit", admin, { uid: target.uid, displayName: target.name })).status === 200 &&
      (await request("/api/legacy-probe", target.token)).status === 403);
  }
  for (const target of integrationMembers) {
    await changeRestriction(target, "ban", true);
    await changeRestriction(target, "suspend", false);
    check(`${target.uid}: Unsuspend does not bypass an outstanding ban`, (await request("/api/legacy-probe", target.token)).status === 403);
    await changeRestriction(target, "suspend", true);
    await changeRestriction(target, "ban", false);
    check(`${target.uid}: Unban does not bypass an outstanding suspension`, (await request("/api/legacy-probe", target.token)).status === 403);
    await changeRestriction(target, "suspend", false);
    const refreshed = await (await request(`/api/admin/accounts?email=${encodeURIComponent(target.email)}`, admin)).json();
    check(`${target.uid}: both cleared flags persist in a fresh directory response and restore access`, refreshed.members[0].uid === target.uid &&
      refreshed.members[0].banned === false && refreshed.members[0].suspended === false && (await request("/api/legacy-probe", target.token)).status === 200 &&
      (await rest("broadcasterStats/phase2_admin", target.token)).status === 200);
    const audit = (await db.collection("adminAudit").where("targetUid", "==", target.uid).get()).docs.map((item) => item.data());
    check(`${target.uid}: restriction audit preserves the correct target, actor and timestamps`, audit.filter((item) => ["ban", "suspend"].includes(item.action)).length >= 6 &&
      audit.every((item) => item.targetUid === target.uid && item.actor === "phase2_admin" && typeof item.createdAt === "string"));
    check(`${target.uid}: Delete is rejected and Auth/profile/history survive`, (await request("/api/admin/members/action", admin, { uid: target.uid, action: "delete" })).status === 400 &&
      (await auth.getUser(target.uid)).uid === target.uid && (await db.collection("users").doc(target.uid).get()).exists);
  }
  for (const uid of ["phase2_admin", "phase2_primary"]) {
    for (const action of ["suspend", "ban"]) {
      for (const enabled of [false, true]) {
        check(`${uid}: ${action}=${enabled} preserves primary/self protection`, (await request("/api/admin/members/action", admin, { uid, action, enabled })).status === 403);
      }
    }
  }
  check("multi-member operations leave the pre-existing member unchanged", isDeepStrictEqual((await db.collection("users").doc("phase2_member").get()).data(), beforeUnrelated));
  for (const target of integrationMembers) {
    check(`${target.uid}: ordinary member cannot edit or restrict another non-admin account`, (await request("/api/admin/members/edit", member, { uid: target.uid, displayName: "Unauthorized" })).status === 403 &&
      (await request("/api/admin/members/action", member, { uid: target.uid, action: "suspend", enabled: true })).status === 403 &&
      (await request("/api/admin/members/action", member, { uid: target.uid, action: "ban", enabled: true })).status === 403);
    check(`${target.uid}: name edits and restrictions require the PIN session`, (await request("/api/admin/members/edit", admin, { uid: target.uid, displayName: "No PIN" }, false)).status === 401 &&
      (await request("/api/admin/members/action", admin, { uid: target.uid, action: "ban", enabled: true }, false)).status === 401);
  }
  const tiedHistory = db.batch();
  for (const target of [alpha, beta]) {
    for (let index = 0; index < 28; index++) {
      tiedHistory.set(db.collection("memberEmailConsent").doc(target.uid).collection("history").doc(`tie_${index}`), {
        consented: index % 2 === 0, recordedAt: "2026-01-01T00:00:00.000Z", version: EMAIL_CONSENT_VERSION,
        source: "account-settings", actor: target.uid, wording: EMAIL_CONSENT_WORDING
      });
    }
  }
  await tiedHistory.commit();
  for (const [index, target] of [alpha, beta].entries()) {
    const historyUrl = `/api/admin/members/${target.uid}/email-consent`;
    const first = await (await request(historyUrl, admin)).json();
    const second = await (await request(`${historyUrl}?after=${encodeURIComponent(first.nextCursor)}`, admin)).json();
    check(`${target.uid}: tied timestamps paginate without losing or duplicating this member's events`, first.history.length === 25 &&
      second.history.length === 5 + index && second.nextCursor === null &&
      new Set([...first.history, ...second.history].map((item: { id: string }) => item.id)).size === 30 + index);
    check(`${target.uid}: reading paginated history never changes current opt-out or timestamps`, first.current.consented === false &&
      second.current.recordedAt === first.current.recordedAt && (await db.collection("memberEmailConsent").doc(target.uid).get()).data()?.recordedAt === first.current.recordedAt);
  }
  for (const [index, target] of [
    { uid: "first_card", displayName: "First card" },
    { uid: "later_card", displayName: "Later card", suspended: true },
    { uid: "page_two_card", displayName: "Page two", banned: true },
    { uid: "guest_test_card", displayName: "Guest test", suspended: true, banned: true }
  ].entries()) {
    const calls: unknown[] = [];
    let deletionUid: string | null = null;
    const props = {
      member: target, busy: false, historyOpen: false, deletionOpen: false,
      onEdit: (value: { uid: string }) => { calls.push(["edit", value.uid]); },
      onRestriction: (uid: string, action: "suspend" | "ban", enabled: boolean) => { calls.push([action, uid, enabled]); },
      onHistory: (uid: string) => { calls.push(["history", uid]); },
      onDeletion: (uid: string | null) => { deletionUid = uid; }
    };
    const controls = buttons(MemberCardControls(props));
    check(`${target.uid}: all supported card controls are enabled with touch-sized native buttons`, controls.length === 5 &&
      controls.every((button) => button.type === "button" && !button.disabled && button.className?.includes("min-h-11") && button.className.includes("touch-manipulation")));
    for (const button of controls) button.onClick?.();
    check(`${target.uid}: invoking each handler forwards this exact UID and independent restriction state`, isDeepStrictEqual(calls, [
      ["history", target.uid], ["edit", target.uid], ["suspend", target.uid, index !== 1 && index !== 3], ["ban", target.uid, index < 2]
    ]));
    check(`${target.uid}: Delete explanation opens for the tapped account without a mutation`, deletionUid === target.uid);
    const expanded = MemberCardControls({ ...props, deletionOpen: deletionUid === target.uid });
    const markup = renderToStaticMarkup(expanded);
    check(`${target.uid}: deletion explanation displays this member and explicitly forbids partial deletion`, markup.includes(target.uid) &&
      markup.includes("Deletion unavailable") && markup.includes("safe account deletion is not implemented yet.") && markup.includes("No account or records will be deleted."));
    const close = buttons(expanded).find((button) => button.children === "Close deletion explanation");
    check(`${target.uid}: enabled native Close control hides deletion explanation`, !!close && !close.disabled && !!close.onClick);
    assert.ok(close?.onClick);
    close.onClick();
    check(`${target.uid}: close callback clears only explanatory state`, deletionUid === null && calls.length === 4 &&
      !renderToStaticMarkup(MemberCardControls({ ...props, deletionOpen: deletionUid === target.uid })).includes('aria-label="Account deletion unavailable"'));
    const hiddenHistory = buttons(MemberCardControls({ ...props, historyOpen: true }))[0];
    hiddenHistory.onClick?.();
    check(`${target.uid}: Hide history still forwards the same UID`, isDeepStrictEqual(calls[calls.length - 1], ["history", target.uid]));
  }
  for (const member of [
    { uid: "no_profile_guest", hasProfile: false },
    { uid: "protected_admin", role: "admin" },
    { uid: "primary_admin", email: "kertisjohnson7@gmail.com" }
  ]) {
    const tree = MemberCardControls({
      member, busy: false, historyOpen: false, deletionOpen: false,
      onEdit: () => {}, onRestriction: () => {}, onHistory: () => {}, onDeletion: () => {}
    });
    const controls = buttons(tree);
    check(`${member.uid}: unsafe restriction actions remain disabled but history and Delete explanation respond`, controls[2].disabled && controls[3].disabled &&
      !controls[0].disabled && !controls[4].disabled && (member.hasProfile !== false || controls[1].disabled));
  }
  const busyControls = buttons(MemberCardControls({
    member: { uid: "busy_member" }, busy: true, historyOpen: false, deletionOpen: true,
    onEdit: () => {}, onRestriction: () => {}, onHistory: () => {}, onDeletion: () => {}
  }));
  check("saving disables mutations without trapping Delete explanation or history controls", busyControls[1].disabled && busyControls[2].disabled &&
    busyControls[3].disabled && !busyControls[0].disabled && !busyControls[4].disabled && !busyControls[5].disabled);

  // Create a UID that sorts after the first Auth directory page, then act on the record returned by pagination.
  const guestToken = await createUser("zz_later_page_guest", "later-guest@example.test");
  const laterPageMembers: DirectoryMember[] = [];
  let laterPageToken: string | null = null;
  do {
    const response: { members: DirectoryMember[]; nextCursor: string | null } = await (await request(`/api/admin/accounts${laterPageToken ? `?pageToken=${encodeURIComponent(laterPageToken)}` : ""}`, admin)).json();
    if (laterPageToken) laterPageMembers.push(...response.members);
    laterPageToken = response.nextCursor;
  } while (laterPageToken);
  const laterGuest = laterPageMembers.find((item) => item.uid === "zz_later_page_guest");
  check("later-page test member is actually obtained from a non-first directory page", !!laterGuest);
  assert.ok(laterGuest);
  check("later-page record UID edits the intended profile", (await request("/api/admin/members/edit", admin, { uid: laterGuest.uid, displayName: "Later page renamed" })).status === 200 &&
    (await db.collection("users").doc(laterGuest.uid).get()).data()?.displayName === "Later page renamed");
  for (const action of ["suspend", "ban"] as const) {
    check(`later-page ${action} persists and blocks the correct existing token`, (await request("/api/admin/members/action", admin, { uid: laterGuest.uid, action, enabled: true })).status === 200 &&
      (await request("/api/legacy-probe", guestToken)).status === 403);
    check(`later-page undo ${action} restores that member's access`, (await request("/api/admin/members/action", admin, { uid: laterGuest.uid, action, enabled: false })).status === 200 &&
      (await request("/api/legacy-probe", guestToken)).status === 200);
  }
  const guestHistory = await request(`/api/admin/members/${laterGuest.uid}/email-consent`, admin);
  const guestHistoryData = await guestHistory.json();
  check("later-page guest/test member history is readable without inventing consent", guestHistory.status === 200 &&
    guestHistoryData.history.length === 0 && guestHistoryData.current.consented === false);
  const authOnlyHistory = await request("/api/admin/members/auth_only/email-consent", admin);
  check("Auth-only record supports read-only history but never implicitly gains a profile", authOnlyHistory.status === 200 &&
    (await authOnlyHistory.json()).current.consented === false && !(await db.collection("users").doc("auth_only").get()).exists);
  const anonymousResponse = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true })
  });
  assert.equal(anonymousResponse.status, 200);
  const anonymous: { localId: string; idToken: string } = await anonymousResponse.json();
  await db.collection("users").doc(anonymous.localId).set({
    uid: anonymous.localId, email: "", displayName: "Anonymous guest test", role: "member",
    gemBalance: 0, cloutPoints: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
  });
  check("anonymous guest with an existing profile supports UID-based name editing", (await request("/api/admin/members/edit", admin, {
    uid: anonymous.localId, displayName: "Guest renamed"
  })).status === 200 && (await db.collection("users").doc(anonymous.localId).get()).data()?.displayName === "Guest renamed");
  for (const action of ["suspend", "ban"] as const) {
    check(`anonymous guest supports ${action} without an email address`, (await request("/api/admin/members/action", admin, { uid: anonymous.localId, action, enabled: true })).status === 200 &&
      (await request("/api/legacy-probe", anonymous.idToken)).status === 403);
    check(`anonymous guest supports undo ${action} for that same UID`, (await request("/api/admin/members/action", admin, { uid: anonymous.localId, action, enabled: false })).status === 200 &&
      (await request("/api/legacy-probe", anonymous.idToken)).status === 200);
  }
  const anonymousHistory = await request(`/api/admin/members/${anonymous.localId}/email-consent`, admin);
  check("anonymous guest history can be inspected without granting marketing consent", anonymousHistory.status === 200 &&
    (await anonymousHistory.json()).current.consented === false && !(await db.collection("memberEmailConsent").doc(anonymous.localId).get()).exists);
  check("Delete explanation is mounted per UID and reset on pagination/reload", memberUI.includes("deletionOpen={deletionUid === member.uid}") &&
    memberUI.includes("onDeletion={setDeletionUid}") && memberUI.includes("setDeletionUid(null)"));
  await request("/api/admin/members/edit", admin, { uid: alpha.uid, displayName: "E2E member" });
  await request("/api/admin/members/action", admin, { uid: alpha.uid, action: "suspend", enabled: true });
  await request("/api/admin/members/action", admin, { uid: alpha.uid, action: "ban", enabled: true });
  const renderedFixtures = [
    { email: beta.email, uid: beta.uid, suspend: "Suspend", ban: "Ban", disabled: false },
    { email: alpha.email, uid: alpha.uid, suspend: "Unsuspend", ban: "Unban", disabled: false },
    { email: "admin@example.test", uid: "phase2_admin", suspend: "Suspend", ban: "Ban", disabled: true }
  ];
  for (const fixture of renderedFixtures) {
    const response = await request(`/api/admin/accounts?email=${encodeURIComponent(fixture.email)}`, admin);
    assert.equal(response.status, 200);
    const data: { members: Parameters<typeof MemberCardControls>[0]["member"][] } = await response.json();
    assert.equal(data.members.length, 1);
    const record = data.members[0];
    assert.equal(record.uid, fixture.uid);
    const markup = renderToStaticMarkup(createElement(MemberCardControls, {
      member: record, busy: false, historyOpen: false, deletionOpen: false,
      onEdit: () => {}, onRestriction: () => {}, onHistory: () => {}, onDeletion: () => {}
    }));
    const renderedButtons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    for (const label of [fixture.suspend, fixture.ban]) {
      const rendered = renderedButtons.find((button) => button.endsWith(`>${label}</button>`));
      check(`${record.uid}: actual server-rendered ${label} disabled attribute matches directory eligibility`, !!rendered &&
        /\sdisabled(?:=""|(?=\s|>))/.test(rendered) === fixture.disabled);
    }
    check(`${record.uid}: protected reason is rendered only for the protected account`, markup.includes("Protected administrator:") === fixture.disabled);
    if (fixture.uid === alpha.uid) {
      check("E2E member remains discoverable with name, email, both flags and enabled reversal controls", record.displayName === "E2E member" &&
        record.email === alpha.email && record.suspended === true && record.banned === true);
      const searchResponse = await (await request("/api/admin/members?search=E2E&searchBy=displayName", admin)).json();
      check("restricted E2E member also remains in profile-name search", searchResponse.members.some((item: { uid: string }) => item.uid === alpha.uid));
    }
  }
  for (const action of ["suspend", "ban"]) {
    const response = await request("/api/admin/members/action", admin, { uid: "phase2_admin", action, enabled: true });
    const failure = await response.json();
    check(`${action}: protected Admin denial includes useful server error text`, response.status === 403 &&
      failure.error === "This administrator account is protected from that action.");
  }
  const missingPinResponse = await request("/api/admin/members/action", admin, { uid: beta.uid, action: "suspend", enabled: true }, false);
  check("expired or missing PIN rejects an ordinary member mutation explicitly", missingPinResponse.status === 401 && typeof (await missingPinResponse.json()).error === "string");
  check("backend action failures stay bound to the affected card instead of an offscreen page-level message",
    memberUI.includes("actionError?.uid === member.uid") && memberUI.includes('{actionError.message}</p>') &&
    memberUI.includes("setActionError({ uid: member.uid, message:") && memberUI.includes("reason instanceof Error ? reason.message"));
  await request("/api/admin/members/action", admin, { uid: alpha.uid, action: "suspend", enabled: false });
  await request("/api/admin/members/action", admin, { uid: alpha.uid, action: "ban", enabled: false });
  check("Admin report labels adapt existing schema without inventing statuses", ["open", "reviewing", "resolved", "dismissed"].map(reportStatusLabel).join(",") === "New,Under Review,Resolved,Dismissed");
  check("unknown report status is explicit, not a fabricated New status", reportStatusLabel("legacy") === "Unknown (legacy)");
  const detailPath = "/api/admin/reports/report_1";
  check("report details deny anonymous and ordinary members", (await request(detailPath)).status === 401 && (await request(detailPath, member)).status === 403);
  check("report details require PIN authorization", (await request(detailPath, admin, undefined, false)).status === 401);
  check("missing report detail is an explicit 404", (await request("/api/admin/reports/missing_report", admin)).status === 404);
  const initialDetailResponse = await request(detailPath, admin);
  const initialDetail = await initialDetailResponse.json();
  check("report detail retains real submission, reviewer, date and transition history", initialDetailResponse.status === 200 &&
    initialDetailResponse.headers.get("cache-control") === "no-store" && initialDetail.report.details === "Synthetic report" &&
    initialDetail.report.reporterUid === "phase2_member" && initialDetail.report.targetAuthorUid === "phase2_admin" &&
    initialDetail.report.reviewedBy === "phase2_admin" && initialDetail.history.length === 2 &&
    initialDetail.history.every((event: { actor: string; createdAt: string }) => event.actor === "phase2_admin" && Number.isFinite(Date.parse(event.createdAt))));
  check("original report and history remain denied to direct client updates and reads", (await rest("communityReports/report_1", admin, { fields: { status: { stringValue: "dismissed" } } })).status === 403 &&
    (await rest("communityReports/report_1/history", admin)).status === 403);
  const originalSubmission = (await db.collection("communityReports").doc("report_1").get()).data()!;
  for (const [fromStatus, status] of [["resolved", "open"], ["open", "reviewing"], ["reviewing", "dismissed"], ["dismissed", "open"], ["open", "reviewing"], ["reviewing", "resolved"]]) {
    const response = await request("/api/admin/reports/review", admin, { id: "report_1", fromStatus, status });
    check(`review workflow persists ${reportStatusLabel(fromStatus)} to ${reportStatusLabel(status)}`, response.status === 200 &&
      (await db.collection("communityReports").doc("report_1").get()).data()?.status === status);
  }
  const updatedDetail = await (await request(detailPath, admin)).json();
  const updatedQueue = await (await request("/api/admin/reports", admin)).json();
  check("queue and detail reload reflect final saved status and appended events", updatedDetail.report.status === "resolved" &&
    updatedDetail.history.length === 8 && updatedQueue.reports.find((item: { id: string }) => item.id === "report_1").status === "resolved");
  const finalReport = (await db.collection("communityReports").doc("report_1").get()).data()!;
  check("review transitions never overwrite original submission identity/content/time", ["reporterUid", "postId", "targetType", "targetAuthorUid", "reason", "details", "createdAt"].every((key) => isDeepStrictEqual(finalReport[key], originalSubmission[key])));
  check("every new report transition appends one matching audit record", (await db.collection("adminAudit").where("reportId", "==", "report_1").get()).size === 8);
  const reviewHistoryBatch = db.batch();
  for (let index = 0; index < 28; index++) reviewHistoryBatch.set(db.collection("communityReports").doc("report_1").collection("history").doc(`review_${index}`), {
    actor: "phase2_admin", fromStatus: "open", status: "reviewing", createdAt: "2026-01-01T00:00:00.000Z"
  });
  await reviewHistoryBatch.commit();
  const historyOne = await (await request(detailPath, admin)).json();
  const historyTwo = await (await request(`${detailPath}?after=${historyOne.nextCursor}`, admin)).json();
  check("report history paginates tied dates without missing or repeating events", historyOne.history.length === 25 && historyTwo.history.length === 11 &&
    historyTwo.nextCursor === null && new Set([...historyOne.history, ...historyTwo.history].map((item: { id: string }) => item.id)).size === 36);
  check("report history is newest first", [...historyOne.history, ...historyTwo.history].every((item: { createdAt: string }, index: number, all: { createdAt: string }[]) =>
    index === 0 || item.createdAt <= all[index - 1].createdAt));
  check("report history cursor is scoped to the selected report", (await request("/api/admin/reports/report_page_0?after=review_0", admin)).status === 409);
  const validSubmission = validateReportInput({ postId: "compatible_post", replyId: "compatible_reply", reason: "other", details: "  Synthetic compatibility check  " });
  assert.ok(validSubmission.ok);
  await db.collection("communityReports").doc("submission_compatible").create({
    reporterUid: "phase2_member", ...validSubmission.value, targetType: "reply", postAuthorUid: "phase2_admin",
    targetAuthorUid: beta.uid, status: "open", createdAt: FieldValue.serverTimestamp()
  });
  const compatible = await (await request("/api/admin/reports/submission_compatible", admin)).json();
  check("validated post/reply submission schema is compatible with Admin detail", compatible.report.status === "open" &&
    compatible.report.replyId === "compatible_reply" && compatible.report.targetAuthorUid === beta.uid &&
    compatible.report.details === "Synthetic compatibility check" && !!compatible.report.createdAt && compatible.history.length === 0);
  const submissionSource = source.slice(source.indexOf('app.post("/api/community/reports"'), source.indexOf("const ZODIAC_SIGNS"));
  check("production submission still validates, deduplicates and creates initial New-compatible reports", submissionSource.includes("validateReportInput(req.body)") &&
    submissionSource.includes('status: "open"') && submissionSource.includes("reporterUid: uid") && submissionSource.includes("reportKeySource(uid, postId, replyId)") &&
    submissionSource.includes("reportRef.create(") && submissionSource.includes("status(409)") && submissionSource.includes("FieldValue.serverTimestamp()"));
  const reportUI = readFileSync("src/components/AdminReports.tsx", "utf8");
  const reviewUI = readFileSync("src/components/AdminReportReview.tsx", "utf8");
  check("queue opens the selected report ID and refreshes after a saved review", reportUI.includes("setSelectedId(report.id)") &&
    reportUI.includes('key={report.id} id={report.id}') && reportUI.includes("setMessage(saved); setRefresh((value) => value + 1)"));
  check("review requests use loaded report identity and current status with inline outcome feedback", reviewUI.includes("id: detail.report.id, fromStatus: detail.report.status, status") &&
    reviewUI.includes('role="alert"') && reviewUI.includes('role="status"') && reviewUI.includes("onSaved(saved)") && reviewUI.includes("saving.current"));
  check("all four displayed statuses have validated paths without deleting history", REPORT_TRANSITIONS.reviewing.includes("open") && REPORT_TRANSITIONS.reviewing.includes("resolved") &&
    REPORT_TRANSITIONS.reviewing.includes("dismissed") && REPORT_TRANSITIONS.open.includes("reviewing"));
  const gemBefore = await db.collection("users").doc(beta.uid).get();
  await db.collection("users").doc(beta.uid).update({ gemBalance: 73, lifetimeGemsReceived: 1680 });
  await db.collection("users").doc(alpha.uid).update({ gemBalance: 9, lifetimeGemsReceived: 5000, suspended: true });
  const gemsBeforeRead = await db.getAll(db.collection("users").doc(alpha.uid), db.collection("users").doc(beta.uid));
  const auditBeforeRead = (await db.collection("adminAudit").count().get()).data().count;
  check("Gem profile records remain unavailable to anonymous and ordinary members", (await request("/api/admin/members?search=Integration", undefined)).status === 401 &&
    (await request("/api/admin/members?search=Integration", member)).status === 403);
  check("Gem profile records require a verified Admin PIN session", (await request("/api/admin/members", admin, undefined, false)).status === 401);
  const gemPageResponse = await request(`/api/admin/members?search=${encodeURIComponent(beta.email)}&searchBy=email`, admin);
  const gemPage = await gemPageResponse.json();
  check("Gem profile query returns the exact member UID and distinct real balance/rank totals", gemPageResponse.status === 200 &&
    gemPage.members.length === 1 && gemPage.members[0].uid === beta.uid &&
    gemPage.members[0].gemBalance === 73 && gemPage.members[0].lifetimeGemsReceived === 1680);
  const suspendedGemPage = await (await request(`/api/admin/members?search=${encodeURIComponent(alpha.email)}&searchBy=email`, admin)).json();
  check("restricted Gem profiles remain visible without mixing another member's totals", suspendedGemPage.members[0].uid === alpha.uid &&
    suspendedGemPage.members[0].suspended === true && suspendedGemPage.members[0].gemBalance === 9 && suspendedGemPage.members[0].lifetimeGemsReceived === 5000);
  const metrics = renderToStaticMarkup(createElement(AdminGemMetrics, { gemBalance: 73, lifetimeGemsReceived: 1680 }));
  check("rendered Gem metrics separate spendable balance from existing rank progression", metrics.includes("Spendable Gem balance") && metrics.includes(">73<") &&
    metrics.includes("Lifetime qualifying live-gift Gems received") && metrics.includes("1,680") &&
    metrics.includes("Mystic Adept") && metrics.includes("3,320 qualifying Gems to Oracle"));
  const invalidMetrics = renderToStaticMarkup(createElement(AdminGemMetrics, { gemBalance: -1, lifetimeGemsReceived: "1680" }));
  check("malformed Gem metrics display unavailable rather than fabricated numbers/ranks", invalidMetrics.includes("missing or invalid balance") &&
    invalidMetrics.includes("invalid qualifying total") && !invalidMetrics.includes("Mystic Adept"));
  const legacyMetrics = renderToStaticMarkup(createElement(AdminGemMetrics, {}));
  check("absent spendable balance is unknown while existing absent lifetime rule stays New Seer", legacyMetrics.includes("missing or invalid balance") && legacyMetrics.includes("New Seer"));
  const gemsAfterRead = await db.getAll(db.collection("users").doc(alpha.uid), db.collection("users").doc(beta.uid));
  check("reading Gems creates no balance, lifetime, consent or audit mutations", gemsAfterRead.every((doc, index) =>
    isDeepStrictEqual(doc.data(), gemsBeforeRead[index].data())) && (await db.collection("adminAudit").count().get()).data().count === auditBeforeRead);
  check("unsupported award action is rejected without crediting a balance", (await request("/api/admin/members/action", admin, { action: "award", uid: beta.uid, amount: 500 })).status === 400 &&
    (await db.collection("users").doc(beta.uid).get()).data()?.gemBalance === 73);
  check("Gem profile endpoint still uses bounded existing pagination", (await (await request("/api/admin/members", admin)).json()).members.length === 50);
  const rewardsUI = readFileSync("src/components/AdminGemsRewards.tsx", "utf8");
  check("Rewards view reuses protected read-only member endpoint and exposes no award submission", rewardsUI.includes("`/api/admin/members?${params}`") &&
    rewardsUI.includes("Admin awards unavailable") && !rewardsUI.includes('method: "POST"') &&
    !rewardsUI.includes("updateDoc") && !rewardsUI.includes("adminMemberAction"));
  check("Rewards navigation is connected without replacing other placeholders", readFileSync("src/App.tsx", "utf8").includes('adminSubTab === "rewards" && <AdminGemsRewards />') &&
    rewardsUI.includes('role="alert"') && rewardsUI.includes('role="status"') && rewardsUI.includes("No account profiles matched"));
  await db.collection("users").doc(beta.uid).set(gemBefore.data()!);
  const revenuePath = "/api/admin/revenue";
  check("Revenue rejects anonymous and ordinary users", (await request(revenuePath)).status === 401 && (await request(revenuePath, member)).status === 403);
  check("Revenue requires existing Admin PIN authorization", (await request(revenuePath, admin, undefined, false)).status === 401);
  check("Revenue rejects malformed pagination", (await request(`${revenuePath}?after=bad%2Fpath`, admin)).status === 400);
  const financialBatch = db.batch();
  for (let index = 0; index < 28; index++) financialBatch.set(db.collection("financial_records").doc(`revenue_${String(index).padStart(3, "0")}`), {
    type: index === 1 ? "refund" : "tip", amount: index + 1, platformFee: 0.2, recipientShare: 0.8,
    status: index === 1 ? "refunded" : "completed", createdAt: "2026-10-21T00:00:00.000Z",
    senderId: "private_sender", recipientId: "private_recipient", stripeSessionId: "private_stripe_session",
    cardNumber: "never-return-this", secret: "never-return-this"
  });
  await financialBatch.commit();
  const revenueBefore = await db.collection("financial_records").get();
  const revenueResponse = await request(revenuePath, admin);
  const revenueOne = await revenueResponse.json();
  const revenueTwo = await (await request(`${revenuePath}?after=${encodeURIComponent(revenueOne.nextCursor)}`, admin)).json();
  check("Revenue reads 25 sanitized records per page without duplicates", revenueResponse.status === 200 && revenueOne.records.length === 25 &&
    revenueTwo.records.length === 3 && revenueTwo.nextCursor === null &&
    new Set([...revenueOne.records, ...revenueTwo.records].map((item: { id: string }) => item.id)).size === 28);
  check("Revenue responses are private and uncached", revenueResponse.headers.get("cache-control") === "no-store" &&
    !JSON.stringify(revenueOne).includes("private_sender") && !JSON.stringify(revenueOne).includes("private_recipient") &&
    !JSON.stringify(revenueOne).includes("private_stripe_session") && !JSON.stringify(revenueOne).includes("never-return-this"));
  check("Revenue preserves distinct recorded gross, fee and allocation fields without inferring currency", revenueOne.records[0].amount === 1 &&
    revenueOne.records[0].platformFee === 0.2 && revenueOne.records[0].recipientShare === 0.8 && revenueOne.records[0].currency === null);
  check("Revenue totals never present mixed sandbox aggregates as actual earnings", revenueOne.metrics.length === REVENUE_LIMITATIONS.length &&
    revenueOne.metrics.every((metric: { value: unknown; reason: string }) => metric.value === null && !!metric.reason) &&
    revenueOne.metrics.some((metric: { label: string }) => metric.label === "Today's platform revenue"));
  const parsedRecord = revenueRecord("safe", { amount: NaN, platformFee: -4, recipientShare: "100", currency: "usd", createdAt: "invalid", type: "refund", originalChargeId: "secret_charge" });
  check("Revenue invalid amounts/dates are unknown, not zero or fabricated", parsedRecord.amount === null && parsedRecord.platformFee === null &&
    parsedRecord.recipientShare === null && parsedRecord.createdAt === null && parsedRecord.currency === "USD" && !JSON.stringify(parsedRecord).includes("secret_charge"));
  const revenueAfter = await db.collection("financial_records").get();
  check("Revenue reads preserve all stored financial records", isDeepStrictEqual(revenueBefore.docs.map((doc) => doc.data()), revenueAfter.docs.map((doc) => doc.data())));
  check("Revenue offers no mutation endpoint", (await request(revenuePath, admin, { amount: 999 })).status === 404);
  const rankingBatch = db.batch();
  for (let index = 0; index < 28; index++) rankingBatch.set(db.collection("users").doc(`ranking_${String(index).padStart(3, "0")}`), {
    displayName: `Rank ${index}`, role: "member", lifetimeGemsReceived: 10000 + index, gemBalance: 1000 - index
  });
  await rankingBatch.commit();
  const rankingPath = "/api/admin/rankings";
  check("rankings reject anonymous, ordinary-member, and missing-PIN requests",
    (await request(rankingPath)).status === 401 && (await request(rankingPath, member)).status === 403 &&
    (await request(rankingPath, admin, undefined, false)).status === 401);
  check("rankings validate cursors", (await request(`${rankingPath}?after=bad`, admin)).status === 400);
  const rankingResponse = await request(rankingPath, admin);
  const rankingOne = await rankingResponse.json();
  const rankingTwo = await (await request(`${rankingPath}?after=${encodeURIComponent(rankingOne.nextCursor)}`, admin)).json();
  check("rankings are bounded, ordered by qualifying Gems, and paginate without duplicates",
    rankingResponse.status === 200 && rankingOne.members.length === 25 && rankingOne.members[0].uid === "ranking_027" &&
    rankingOne.members[0].lifetimeGemsReceived === 10027 && rankingOne.members[0].currentRank === "Oracle" &&
    rankingTwo.members.length === 4 && !rankingTwo.members.some((item: { uid: string }) => rankingOne.members.some((first: { uid: string }) => first.uid === item.uid)));
  check("rankings do not read spendable balance as rank progression", rankingOne.members[0].lifetimeGemsReceived !== 973);
  check("ranking response is private and uncached", rankingResponse.headers.get("cache-control") === "no-store");
  check("ranking endpoint offers no mutation operation", (await request(rankingPath, admin, { gems: 999 })).status === 404);
  const diagnosticPath = "/api/admin/diagnostics";
  check("diagnostics reject anonymous, ordinary-member, and missing-PIN requests",
    (await request(diagnosticPath)).status === 401 && (await request(diagnosticPath, member)).status === 403 &&
    (await request(diagnosticPath, admin, undefined, false)).status === 401);
  const diagnosticResponse = await request(diagnosticPath, admin);
  const diagnostics = await diagnosticResponse.json();
  check("diagnostics report only guarded request status and explicitly unrun checks",
    diagnosticResponse.status === 200 && diagnostics.server.status === "available" &&
    diagnostics.firestore.status === "admin-authorization-read-succeeded" &&
    diagnostics.checksNotRun.some((item: string) => item.includes("Google Cloud Console")) &&
    !JSON.stringify(diagnostics).includes("secret") && diagnosticResponse.headers.get("cache-control") === "no-store");
  const rankingMarkup = renderToStaticMarkup(createElement(AdminRankings));
  const diagnosticMarkup = renderToStaticMarkup(createElement(AdminDiagnostics, { session: { expiresAt: 1000, remember: false } }));
  const diagnosticsUI = readFileSync("src/components/AdminDiagnostics.tsx", "utf8");
  check("rankings and Diagnostics replace prior placeholders with status-aware pages",
    rankingMarkup.includes("authoritative lifetime qualifying") && diagnosticMarkup.includes("Checking protected diagnostics") &&
    diagnosticsUI.includes("Google Cloud Console") &&
    !readFileSync("src/App.tsx", "utf8").includes("Admin-only section placeholder"));
  check("Admin panel data no longer polls Firestore and offers an explicit refresh",
    !readFileSync("src/App.tsx", "utf8").includes("setInterval(() => void refresh(), 30_000)") &&
    readFileSync("src/App.tsx", "utf8").includes("Refresh Admin data"));
  check("member directory exposes email, name, role, and restriction-status search",
    readFileSync("src/components/AdminMembers.tsx", "utf8").includes('<option value="role">Role</option>') &&
    readFileSync("src/components/AdminMembers.tsx", "utf8").includes('<option value="status">Restriction status</option>'));
  const accessUI = readFileSync("src/App.tsx", "utf8");
  const accessClient = readFileSync("src/lib/adminAccess.ts", "utf8");
  check("Revenue is immediately after Diagnostics in the second navigation row", /id: "diagnostics", label: "Diagnostics" \},\s*\{ id: "revenue", label: "Revenue"/.test(accessUI) &&
    accessUI.includes('adminSubTab === "revenue" && <AdminRevenue />'));
  check("Admin fallback visibility uses server-authorized eligibility without unlocking the console", accessUI.includes('fetch("/api/admin/access/status"') &&
    accessUI.includes("(!dbUserDoc && serverAdminIdentity === currentUser.uid)") &&
    accessUI.includes("isAuthLoading || dbUserDoc || !profileLoadFailed") &&
    accessUI.includes('activeTab === "admin" && isAdminAuthenticated && ('));
  check("Admin request handling distinguishes protected-target denial from lost authorization", accessClient.includes('result?.code === "admin-access-denied"') &&
    accessClient.includes('result?.code === "account-restricted"') && !accessClient.includes('response.status === 401 || response.status === 403'));
  check("server still gates eligibility and Revenue on existing authorization", source.includes('code: "admin-access-denied"') &&
    readFileSync("adminPanel.ts", "utf8").includes('app.get("/api/admin/revenue", async (req, res) => {\n    if (!(await guard(req, res))) return;'));
  console.log(`ALL ${checks} PHASE 2 CHECKS PASSED`);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await db.terminate();
}
