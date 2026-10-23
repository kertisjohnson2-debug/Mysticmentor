import assert from "node:assert/strict";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import express from "express";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { registerAdminPanel } from "./adminPanel";
import { registerMemberManagement } from "./memberManagement";
import { EMAIL_CONSENT_VERSION, EMAIL_CONSENT_WORDING } from "./src/lib/emailConsent";
import { PRIVACY_VERSION, TERMS_VERSION } from "./src/lib/policies";

assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^127\.0\.0\.1:\d+$/);
const firebase = initializeApp({ projectId: "demo-mysticmentor-admin-completion" });
const db = getFirestore(firebase);
const app = express();
app.use(express.json());
const adminGuard = async (req: express.Request, res: express.Response) => {
  if (req.headers.authorization !== "Bearer synthetic-admin") {
    res.status(req.headers.authorization === "Bearer synthetic-member" ? 403 : 401).json({ error: "Admin access required." });
    return null;
  }
  if (req.headers["x-admin-session"] !== "synthetic-pin-session") {
    res.status(401).json({ error: "PIN required" });
    return null;
  }
  return "synthetic-admin";
};
registerAdminPanel(app, db, adminGuard, {
  projectId: "demo-mysticmentor-admin-completion",
  firestoreDatabaseId: "(default)"
});
registerMemberManagement(app, db, adminGuard, async (req, res) => {
  if (req.headers.authorization === "Bearer synthetic-member") return "synthetic-member";
  res.status(401).json({ error: "Sign in" });
  return null;
});
const server = app.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address !== "string");
const base = `http://127.0.0.1:${address.port}`;
const testId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const headers = (identity?: "admin" | "member", pin = true) => ({
  ...(identity ? { Authorization: `Bearer synthetic-${identity}` } : {}),
  ...(pin ? { "X-Admin-Session": "synthetic-pin-session" } : {})
});
const call = (path: string, identity?: "admin" | "member", pin = true, body?: Record<string, unknown>) =>
  fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { ...headers(identity, pin), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

try {
  const members = [
    { uid: `member_${testId}_admin`, displayName: "Admin filter fixture", role: "admin" },
    { uid: `member_${testId}_suspended`, displayName: "Suspended filter fixture", role: "member", suspended: true },
    { uid: `member_${testId}_banned`, displayName: "Banned filter fixture", role: "member", banned: true }
  ];
  const batch = db.batch();
  members.forEach((member) => batch.set(db.collection("users").doc(member.uid), member));
  batch.set(db.collection("users").doc("synthetic-member"), { uid: "synthetic-member", role: "member", displayName: "Consent fixture" });
  batch.set(db.collection("users").doc("synthetic-other"), { uid: "synthetic-other", role: "member", displayName: "Other fixture" });
  for (let index = 0; index < 28; index += 1) {
    batch.set(db.collection("users").doc(`rank_${testId}_${String(index).padStart(2, "0")}`), {
      displayName: `Rank fixture ${index}`, role: "member", lifetimeGemsReceived: 9_000_000_000_000_000 + index, gemBalance: index
    });
  }
  await batch.commit();

  assert.equal((await call("/api/admin/rankings")).status, 401);
  assert.equal((await call("/api/admin/rankings", "member")).status, 403);
  assert.equal((await call("/api/admin/rankings", "admin", false)).status, 401);
  assert.equal((await call("/api/admin/rankings?after=bad", "admin")).status, 400);
  const firstResponse = await call("/api/admin/rankings", "admin");
  const first = await firstResponse.json() as { members: Array<{ uid: string; lifetimeGemsReceived: number; currentRank: string }>; nextCursor: string | null };
  assert.equal(firstResponse.status, 200);
  assert.equal(firstResponse.headers.get("cache-control"), "no-store");
  assert.equal(first.members.length, 25);
  assert.equal(first.members[0].uid, `rank_${testId}_27`);
  assert.equal(first.members[0].lifetimeGemsReceived, 9_000_000_000_000_027);
  assert.equal(first.members[0].currentRank, "Luna Master");
  assert.ok(first.members.every((member) => !("gemBalance" in member)));
  assert.ok(first.nextCursor);
  const secondResponse = await call(`/api/admin/rankings?after=${encodeURIComponent(first.nextCursor)}`, "admin");
  const second = await secondResponse.json() as { members: Array<{ uid: string }>; nextCursor: string | null };
  assert.equal(secondResponse.status, 200);
  assert.equal(second.members.length, 3);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.members, ...second.members].map((member) => member.uid)).size, 28);

  for (const [searchBy, search] of [["status", "suspended"], ["status", "banned"], ["role", "admin"]] as const) {
    const response = await call(`/api/admin/members?search=${search}&searchBy=${searchBy}`, "admin");
    assert.equal(response.status, 200);
    const result = await response.json() as { members: Array<{ uid: string }> };
    assert.ok(result.members.some((member) => member.uid === members.find((fixture) =>
      searchBy === "role" ? fixture.role === "admin" : fixture[search] === true)?.uid));
  }
  assert.equal((await call("/api/admin/members?search=owner&searchBy=role", "admin")).status, 400);
  assert.equal((await call("/api/admin/members?search=disabled&searchBy=status", "admin")).status, 400);

  assert.equal((await call("/api/admin/diagnostics")).status, 401);
  assert.equal((await call("/api/admin/diagnostics", "member")).status, 403);
  assert.equal((await call("/api/admin/diagnostics", "admin", false)).status, 401);
  const diagnosticResponse = await call("/api/admin/diagnostics", "admin");
  const diagnostics = await diagnosticResponse.json() as {
    server: { status: string };
    firestore: { status: string };
    configuration: { status: string; projectId: string | null; firestoreDatabaseId: string | null };
    checksNotRun: string[];
  };
  assert.equal(diagnosticResponse.status, 200);
  assert.equal(diagnosticResponse.headers.get("cache-control"), "no-store");
  assert.equal(diagnostics.server.status, "available");
  assert.equal(diagnostics.firestore.status, "admin-authorization-read-succeeded");
  assert.equal(diagnostics.configuration.status, "configured");
  assert.equal(diagnostics.configuration.projectId, "demo-mysticmentor-admin-completion");
  assert.equal(diagnostics.configuration.firestoreDatabaseId, "(default)");
  assert.ok(diagnostics.checksNotRun.some((check) => check.includes("Google Cloud Console")));
  assert.ok(!JSON.stringify(diagnostics).includes("secret"));
  assert.ok(!("apiKey" in diagnostics.configuration));

  const appSource = readFileSync("src/App.tsx", "utf8");
  for (const label of ["Live Broadcast", "Smart Shuffle Settings", "Deck Manager", "Staff Roster", "Financials", "Images", "Security",
    "Overview", "Members", "Reports & Alerts", "Gems & Rewards", "Broadcaster Rankings", "Diagnostics"]) {
    assert.ok(appSource.includes(label), `Existing Admin tab remains wired: ${label}`);
  }
  assert.ok(!appSource.includes("setInterval(() => void refresh(), 30_000)"));
  assert.ok(appSource.includes("Refresh Admin data"));
  assert.ok(appSource.includes("profileReadQuotaBlocked"));
  assert.ok(appSource.includes("adminSubTab === \"rankings\" && <AdminRankings />"));
  assert.ok(appSource.includes("adminSubTab === \"diagnostics\" && <AdminDiagnostics"));
  assert.ok(appSource.includes('unsubscribeUserProfile = onSnapshot(doc(db, "users", user.uid)'));
  assert.ok(!appSource.includes("getDoc(userDocRef)"));
  assert.ok(appSource.includes("if (!res.ok || data?.success !== true)"));
  assert.ok(!appSource.includes("Archived Inquiries"));
  assert.ok(!appSource.includes("Today's Gross"));
  const serverSource = readFileSync("server.ts", "utf8");
  assert.ok(serverSource.includes("Simulated payment could not be confirmed. No payment success was reported."));

  const consentPath = "/api/members/me/email-consent";
  assert.equal((await call(consentPath)).status, 401);
  const initialPreferenceResponse = await call(consentPath, "member");
  const initialPreference = await initialPreferenceResponse.json() as { consented: boolean; recordedAt: string | null };
  assert.equal(initialPreferenceResponse.status, 200);
  assert.equal(initialPreferenceResponse.headers.get("cache-control"), "no-store");
  assert.equal(initialPreference.consented, false);
  assert.equal(initialPreference.recordedAt, null);
  const onboarding = await call(consentPath, "member", true, {
    consented: false, onboarding: true, termsAccepted: true,
    termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, uid: "synthetic-other"
  });
  assert.equal(onboarding.status, 200);
  const storedConsent = (await db.collection("memberEmailConsent").doc("synthetic-member").get()).data()!;
  const storedPolicy = (await db.collection("memberPolicyAcceptance").doc("synthetic-member").get()).data()!;
  assert.equal(storedConsent.consented, false);
  assert.equal(storedConsent.version, EMAIL_CONSENT_VERSION);
  assert.equal(storedConsent.wording, EMAIL_CONSENT_WORDING);
  assert.equal(storedConsent.source, undefined);
  assert.equal((await db.collection("memberEmailConsent").doc("synthetic-member").collection("history").get()).size, 1);
  assert.equal(typeof storedConsent.recordedAt, "string");
  assert.equal(storedPolicy.termsVersion, TERMS_VERSION);
  assert.equal(storedPolicy.privacyVersion, PRIVACY_VERSION);
  assert.equal(typeof storedPolicy.acceptedAt, "string");
  assert.equal((await db.collection("memberEmailConsent").doc("synthetic-other").get()).exists, false);
  const optIn = await call(consentPath, "member", true, { consented: true });
  assert.equal(optIn.status, 200);
  assert.equal((await db.collection("memberEmailConsent").doc("synthetic-member").get()).data()?.consented, true);
  await call(consentPath, "member", true, { consented: false });
  assert.equal((await db.collection("memberEmailConsent").doc("synthetic-member").collection("history").get()).size, 3);

  assert.equal((await call("/api/admin/reports")).status, 401);
  assert.equal((await call("/api/admin/reports", "member")).status, 403);
  assert.equal((await call("/api/admin/reports", "admin", false)).status, 401);
  const reportRef = db.collection("communityReports").doc(`report_${testId}`);
  await reportRef.set({
    reporterUid: "synthetic-member", targetAuthorUid: "synthetic-other", postId: "post_fixture", targetType: "post",
    reason: "spam", details: "Synthetic report fixture", status: "open", createdAt: "2026-10-22T00:00:00.000Z"
  });
  const reportList = await call("/api/admin/reports", "admin");
  const reportPage = await reportList.json() as { reports: Array<{ id: string; status: string }>; nextCursor: string | null };
  assert.equal(reportList.status, 200);
  assert.equal(reportList.headers.get("cache-control"), "no-store");
  assert.ok(reportPage.reports.some((report) => report.id === reportRef.id && report.status === "open"));
  const reportDetail = await call(`/api/admin/reports/${reportRef.id}`, "admin");
  assert.equal(reportDetail.status, 200);
  assert.equal((await reportDetail.json() as { report: { reporterUid: string } }).report.reporterUid, "synthetic-member");
  assert.equal((await call("/api/admin/reports/review", "admin", true, { id: reportRef.id, fromStatus: "open", status: "resolved" })).status, 400);
  assert.equal((await call("/api/admin/reports/review", "admin", true, { id: reportRef.id, fromStatus: "open", status: "reviewing" })).status, 200);
  assert.equal((await call("/api/admin/reports/review", "admin", true, { id: reportRef.id, fromStatus: "reviewing", status: "resolved" })).status, 200);
  assert.equal((await reportRef.get()).data()?.status, "resolved");
  assert.equal((await reportRef.collection("history").get()).size, 2);
  assert.equal((await db.collection("adminAudit").where("action", "==", "report-review").where("reportId", "==", reportRef.id).get()).size, 2);

  console.log("PASS Admin ranking authorization, ordering, bounded pagination, and safe fields");
  console.log("PASS Admin role/status member filters and invalid-filter validation");
  console.log("PASS Diagnostics authorization, sanitized status, and explicit unverified checks");
  console.log("PASS optional email consent, server timestamps, policy separation, and no target-UID forgery");
  console.log("PASS protected Reports queue, supported status transitions, and append-only audit history");
  console.log("PASS Admin tab preservation and quota-conscious on-demand refresh wiring");
  console.log("ALL 6 ADMIN COMPLETION CHECK GROUPS PASSED");
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await db.terminate();
}
