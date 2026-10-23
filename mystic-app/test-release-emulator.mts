// Emulator-only integration checks against the real server. Never run against production.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { SPIN_COMPLETE_MS } from "./src/lib/affirmations";

if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8082" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") {
  throw new Error("This script requires the local Firestore and Auth emulators.");
}
const config = JSON.parse(readFileSync("./firebase-applet-config.json", "utf8"));
const app = initializeApp({ projectId: config.projectId });
const db = getFirestore(app, config.firestoreDatabaseId);
const base = "http://127.0.0.1:3099";
const password = "Emulator-Test-123!";
let checks = 0;
function check(name: string, ok: boolean) { assert(ok, name); console.log(`PASS ${name}`); checks++; }
async function user(label: string, role = "member", verified = true) {
  const created = await getAuth().createUser({ email: `${label}@release.test`, password, emailVerified: verified });
  await db.collection("users").doc(created.uid).set({ uid: created.uid, email: created.email, role, displayName: label, createdAt: "2026-01-01T00:00:00Z", gemBalance: 0, cloutPoints: 0 });
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: created.email, password, returnSecureToken: true })
  });
  const result = await response.json();
  return { uid: created.uid, token: String(result.idToken), email: created.email! };
}
async function api(path: string, token: string, body?: Record<string, unknown>, session?: string, method?: string) {
  const response = await fetch(base + path, {
    method: method ?? (body ? "POST" : "GET"), headers: { Authorization: `Bearer ${token}`, ...(session ? { "X-Admin-Session": session } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  return { status: response.status, data: await response.json() };
}
const a = await user("admin-a", "admin"), b = await user("admin-b", "admin"), m = await user("member"), u = await user("unverified-admin", "admin", false);
const prefix = "/api/admin/access";
check("ordinary member cannot initialize PIN", (await api(`${prefix}/passcode/setup`, m.token, { newPasscode: "0427" })).status === 403);
check("unverified admin cannot initialize PIN", (await api(`${prefix}/passcode/setup`, u.token, { newPasscode: "0427" })).status === 403);
check("non-numeric PIN rejected", (await api(`${prefix}/passcode/setup`, a.token, { newPasscode: "abcd" })).status === 400);
const setup = await api(`${prefix}/passcode/setup`, a.token, { newPasscode: "0427", remember: true });
check("verified admin creates four-digit PIN without second login", setup.status === 200 && typeof setup.data.token === "string");
check("setup cannot overwrite existing PIN", (await api(`${prefix}/passcode/setup`, a.token, { newPasscode: "9876" })).status === 409);
const sa = String(setup.data.token);
check("member list and finances denied without PIN session", (await api("/api/admin/panel", a.token)).status === 401);
const panel = await api("/api/admin/panel", a.token, undefined, sa);
check("member list and finances available with admin + PIN", panel.status === 200 && panel.data.members.length === 4);
check("member cannot use admin's session", (await api("/api/admin/panel", m.token, undefined, sa)).status === 403);
check("other admin cannot use this session", (await api("/api/admin/panel", b.token, undefined, sa)).status === 401);
check("suspension denied without PIN", (await api("/api/admin/members/action", a.token, { action: "suspend", uid: m.uid, enabled: true })).status === 401);
check("suspension through guarded endpoint works", (await api("/api/admin/members/action", a.token, { action: "suspend", uid: m.uid, enabled: true }, sa)).status === 200);
await api("/api/admin/members/action", a.token, { action: "suspend", uid: m.uid, enabled: false }, sa);
check("Tarot grant through guarded endpoint works", (await api("/api/admin/members/action", a.token, { action: "tarotReader", email: m.email, enabled: true }, sa)).status === 200);
check("promotion through guarded endpoint works", (await api("/api/admin/members/action", a.token, { action: "promote", uid: m.uid }, sa)).status === 200);
check("admin cannot suspend another admin", (await api("/api/admin/members/action", a.token, { action: "suspend", uid: m.uid, enabled: true }, sa)).status === 403);
check("demotion through guarded endpoint works", (await api("/api/admin/members/action", a.token, { action: "demote", uid: m.uid }, sa)).status === 200);
check("admin cannot demote self", (await api("/api/admin/members/action", a.token, { action: "demote", uid: a.uid }, sa)).status === 403);
const sb = String((await api(`${prefix}/verify`, b.token, { passcode: "0427" })).data.token);
const changed = await api(`${prefix}/passcode/change`, a.token, { currentPasscode: "0427", newPasscode: "9876", remember: true });
check("change PIN creates replacement session", changed.status === 200);
check("PIN rotation invalidates OTHER admin's session too", (await api("/api/admin/panel", b.token, undefined, sb)).status === 401);
const anew = String(changed.data.token);
await api(`${prefix}/revoke`, a.token, { scope: "all" }, anew);
check("revoke remembered devices blocks subsequent privileged reads", (await api("/api/admin/panel", a.token, undefined, anew)).status === 401);
const lockResults = await Promise.all(Array.from({ length: 10 }, () => api(`${prefix}/verify`, b.token, { passcode: "1111" })));
check("parallel guesses cannot bypass atomic lockout", lockResults.filter((r) => r.status === 429).length >= 5);
check("correct PIN blocked during lockout", (await api(`${prefix}/verify`, b.token, { passcode: "9876" })).status === 429);
const pinDoc = (await db.collection("adminSecurity").doc("passcode").get()).data()!;
check("PIN stored only as salted hash", pinDoc.algorithm === "scrypt" && !JSON.stringify(pinDoc).includes("9876"));

// Firestore rules must deny direct admin bypasses, even with a valid Firebase admin identity.
const firestoreBase = `http://127.0.0.1:8082/v1/projects/${config.projectId}/databases/${config.firestoreDatabaseId}/documents`;
async function rest(path: string, token: string, method = "GET", body?: unknown) {
  return fetch(`${firestoreBase}/${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
}
await db.collection("admin_settings").doc("financials").set({ totalGrossVolume: 42 });
await db.collection("financial_records").doc("test-private").set({ amount: 42, createdAt: new Date().toISOString() });
check("rules deny direct other-member profile read", (await rest(`users/${m.uid}`, a.token)).status === 403);
check("rules preserve own profile reads", (await rest(`users/${a.uid}`, a.token)).status === 200);
check("rules deny direct financial singleton read", (await rest("admin_settings/financials", a.token)).status === 403);
check("rules deny direct financial ledger read", (await rest("financial_records/test-private", a.token)).status === 403);
check("rules deny direct role promotion", (await rest(`users/${m.uid}?updateMask.fieldPaths=role`, a.token, "PATCH", { fields: { role: { stringValue: "admin" } } })).status === 403);
check("rules deny direct settings writes", (await rest("admin_settings/community", a.token, "PATCH", { fields: { replyImagesEnabled: { booleanValue: true } } })).status === 403);

// Completed spins are counted transactionally; interrupted and duplicate requests are not counted twice.
const day = new Date().toISOString().slice(0, 10);
const spinRef = db.collection("affirmationDays").doc(`${m.uid}_${day}`);
const start = await api("/api/affirmations/start", m.token, {});
check("spin starts with ten remaining", start.status === 200 && start.data.remaining === 10);
check("cannot complete before all six reels stop", (await api("/api/affirmations/complete", m.token, { id: start.data.pending.id })).status === 409);
const replacement = await api("/api/affirmations/start", m.token, {});
check("interrupted spin consumes no allowance", replacement.data.remaining === 10 && (await api("/api/affirmations/complete", m.token, { id: start.data.pending.id })).status === 409);
for (let index = 0; index < 10; index++) {
  const next = index === 0 ? replacement : await api("/api/affirmations/start", m.token, {});
  await spinRef.update({ "pending.startedAt": Date.now() - SPIN_COMPLETE_MS - 10 });
  const completed = await Promise.all(Array.from({ length: 3 }, () => api("/api/affirmations/complete", m.token, { id: next.data.pending.id })));
  assert(completed.every((r) => r.status === 200 && r.data.remaining === 9 - index));
}
check("ten completed spins counted once despite replayed completion requests", (await spinRef.get()).data()?.completed === 10);
check("refresh preserves exhausted allowance", (await api("/api/affirmations/status", m.token)).data.remaining === 0);
check("eleventh spin refused server-side", (await api("/api/affirmations/start", m.token, {})).status === 429);
check("different member has separate allowance", (await api("/api/affirmations/status", a.token)).data.remaining === 10);
check("rules deny clients changing the allowance", (await rest(`affirmationDays/${m.uid}_${day}`, m.token, "PATCH", { fields: { completed: { integerValue: "0" } } })).status === 403);

// Disabled/revoked Firebase credentials must not pass the independent admin-session guard.
const rev = await user("revocable-admin", "admin");
const revSession = String((await api(`${prefix}/verify`, rev.token, { passcode: "9876" })).data.token);
await getAuth().updateUser(rev.uid, { disabled: true });
check("disabled administrator rejected despite valid PIN session", [401, 403].includes((await api("/api/admin/panel", rev.token, undefined, revSession)).status));
await getAuth().updateUser(rev.uid, { disabled: false });
await new Promise((resolve) => setTimeout(resolve, 1100));
await getAuth().revokeRefreshTokens(rev.uid);
check("revoked Firebase sign-in rejected despite valid PIN session", [401, 403].includes((await api("/api/admin/panel", rev.token, undefined, revSession)).status));
console.log(`ALL ${checks} PASSED (emulators only).`);
