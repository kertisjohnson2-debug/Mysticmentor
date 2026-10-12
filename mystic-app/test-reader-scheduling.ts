/*
 * Admin-as-reader discovery, settings persistence and booking-visibility tests.
 * Needs a running server (npm run dev) and the service account:  npx tsx test-reader-scheduling.ts
 * Creates temporary users/bookings and deletes them afterwards.
 */
import { readFileSync } from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const cfg = JSON.parse(readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp({ credential: cert(JSON.parse(process.env.MYSTICMENTOR_FIREBASE_SERVICE_ACCOUNT!)) });
const auth = getAuth(app);
const db = getFirestore(app, cfg.firestoreDatabaseId);
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const results: string[] = [];
let failed = 0;
const check = (name: string, ok: boolean, extra = "") => { results.push(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`); if (!ok) failed++; };

async function makeUser(tag: string, data: Record<string, unknown>, verified = false) {
  const uid = `rdrtest${tag}${Date.now().toString(36)}`;
  await auth.createUser({ uid, email: `${uid}@example.com`, emailVerified: verified, displayName: tag });
  await db.collection("users").doc(uid).set({ displayName: tag, createdAt: Date.now(), ...data });
  const custom = await auth.createCustomToken(uid);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${cfg.apiKey}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) });
  return { uid, token: ((await response.json()) as { idToken: string }).idToken };
}
const call = async (token: string | null, method: string, path: string, body?: unknown) => {
  const response = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json: any = null;
  try { json = await response.json(); } catch { /* empty */ }
  return { s: response.status, j: json };
};

const users: string[] = [];
try {
  // Admin accounts are created exactly like the app's admin role: users/{uid}.role === "admin", no tarotReader flag, email unverified.
  const admin = await makeUser("admin", { role: "admin" }); users.push(admin.uid);
  const admin2 = await makeUser("admintwo", { role: "admin" }); users.push(admin2.uid);
  const member = await makeUser("member", { role: "member" }); users.push(member.uid);
  const suspended = await makeUser("susp", { role: "admin", suspended: true }); users.push(suspended.uid);

  const windows = [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, start: "09:00", end: "17:00" }));
  const settings = { enabled: true, timeZone: "America/New_York", durationMinutes: 45, readingType: "Astrology", priceType: "paid", priceCents: 4200, weekly: windows };

  let r = await call(admin.token, "GET", "/api/scheduling/my-settings");
  check("admin is eligible with no stored settings", r.s === 200 && r.j.eligible === true && r.j.settings === null);
  r = await call(member.token, "GET", "/api/scheduling/my-settings");
  check("plain member is not eligible", r.j.eligible === false);
  const forged = await call(member.token, "PUT", "/api/scheduling/my-settings", { ...settings, role: "admin", eligible: true, isAdmin: true });
  check("[customer] cannot publish a schedule even when claiming admin in the body", forged.s === 403 || forged.s === 401, String(forged.s));
  check("[customer] still not eligible and nothing stored after forged save", (await call(member.token, "GET", "/api/scheduling/my-settings")).j.settings === null && !(await db.collection("readerSchedules").doc(member.uid).get()).exists);
  check("[customer] is absent from the reader directory", !(await call(member.token, "GET", "/api/scheduling/readers")).j.readers.some((x: any) => x.uid === member.uid));
  check("[customer] has no reader-side appointments", ((await call(member.token, "GET", "/api/scheduling/bookings")).j.asReader ?? []).length === 0);
  r = await call(suspended.token, "GET", "/api/scheduling/my-settings");
  check("suspended admin is not eligible", r.s === 401 || r.s === 403 || r.j.eligible === false, String(r.s));

  r = await call(member.token, "GET", "/api/scheduling/readers");
  check("admin without saved schedule is not listed", !r.j.readers.some((x: any) => x.uid === admin.uid));

  r = await call(admin.token, "PUT", "/api/scheduling/my-settings", { ...settings, enabled: true, weekly: [] });
  const emptyPublished = await call(member.token, "GET", "/api/scheduling/readers");
  check("enabled schedule with no availability is not listed", !emptyPublished.j.readers.some((x: any) => x.uid === admin.uid), `save=${r.s}`);

  r = await call(admin.token, "PUT", "/api/scheduling/my-settings", settings);
  check("admin saves settings", r.s === 200, String(r.s));
  r = await call(admin.token, "GET", "/api/scheduling/my-settings");
  const s = r.j.settings;
  check("settings persist and reload identically", s && s.enabled === true && s.timeZone === "America/New_York" && s.durationMinutes === 45 && s.readingType === "Astrology" && s.priceType === "paid" && s.priceCents === 4200 && s.weekly.length === 7, JSON.stringify(s)?.slice(0, 120));
  const stored = (await db.collection("readerSchedules").doc(admin.uid).get()).data();
  check("settings are stored in readerSchedules", stored?.durationMinutes === 45 && stored?.readerUid === admin.uid);

  r = await call(member.token, "GET", "/api/scheduling/readers");
  const listed = r.j.readers.find((x: any) => x.uid === admin.uid);
  check("member sees the admin as a reader with saved details", !!listed && listed.readingType === "Astrology" && listed.durationMinutes === 45 && listed.priceCents === 4200 && listed.timeZone === "America/New_York");
  check("reader listing exposes no email or role", !JSON.stringify(listed).match(/email|role|gem/i), JSON.stringify(listed));
  r = await call(admin.token, "GET", "/api/scheduling/readers");
  check("admin does not see themselves in the list", !r.j.readers.some((x: any) => x.uid === admin.uid));

  r = await call(member.token, "GET", `/api/scheduling/readers/${admin.uid}/slots`);
  const slots: { startMs: number; endMs: number }[] = r.j.slots ?? [];
  check("slots derive from saved settings (45-minute length)", r.s === 200 && slots.length > 0 && slots.every((x) => x.endMs - x.startMs === 45 * 60000));

  // Disabling hides the admin and persists
  r = await call(admin.token, "PUT", "/api/scheduling/my-settings", { ...settings, enabled: false });
  check("admin can disable bookings", r.s === 200);
  check("disabled admin disappears from the list", !(await call(member.token, "GET", "/api/scheduling/readers")).j.readers.some((x: any) => x.uid === admin.uid));
  check("disabled state persists on reload", (await call(admin.token, "GET", "/api/scheduling/my-settings")).j.settings.enabled === false);
  await call(admin.token, "PUT", "/api/scheduling/my-settings", { ...settings, priceType: "free", priceCents: 0 });

  // First-time admin journey: brand-new admin, no schedule yet, opens settings, saves first schedule, reloads, customer finds them
  const fresh = await makeUser("firstadmin", { role: "admin" }); users.push(fresh.uid);
  const firstOpen = await call(fresh.token, "GET", "/api/scheduling/my-settings");
  check("[first-time] new admin opens settings with no schedule (eligible, null)", firstOpen.s === 200 && firstOpen.j.eligible === true && firstOpen.j.settings === null);
  check("[first-time] not discoverable before saving", !(await call(member.token, "GET", "/api/scheduling/readers")).j.readers.some((x: any) => x.uid === fresh.uid));
  const firstSave = await call(fresh.token, "PUT", "/api/scheduling/my-settings", { enabled: true, timeZone: "America/Los_Angeles", durationMinutes: 30, readingType: "Tarot", priceType: "free", priceCents: 0, weekly: [{ day: 1, start: "10:00", end: "12:00" }, { day: 3, start: "14:00", end: "16:00" }, { day: 5, start: "09:00", end: "11:00" }] });
  check("[first-time] first save succeeds", firstSave.s === 200, String(firstSave.s));
  const reloaded = await call(fresh.token, "GET", "/api/scheduling/my-settings");
  check("[first-time] reload returns saved schedule", reloaded.j.settings?.timeZone === "America/Los_Angeles" && reloaded.j.settings?.weekly.length === 3 && reloaded.j.settings?.readingType === "Tarot");
  const discovered = (await call(member.token, "GET", "/api/scheduling/readers")).j.readers.find((x: any) => x.uid === fresh.uid);
  check("[first-time] customer discovers the admin with saved details", !!discovered && discovered.timeZone === "America/Los_Angeles" && discovered.durationMinutes === 30 && discovered.readingType === "Tarot");
  const freshSlots = (await call(member.token, "GET", `/api/scheduling/readers/${fresh.uid}/slots`)).j.slots ?? [];
  check("[first-time] customer sees future slots only", freshSlots.length > 0 && freshSlots.every((x: any) => x.startMs > Date.now()));
  check("[first-time] invalid first save is rejected, nothing stored", (await call(users.length ? (await makeUser("edge", { role: "admin" }).then((u) => { users.push(u.uid); return u; })).token : "", "PUT", "/api/scheduling/my-settings", { enabled: true, timeZone: "Nope/Zone", durationMinutes: 30, readingType: "Tarot", priceType: "free", priceCents: 0, weekly: [{ day: 1, start: "10:00", end: "12:00" }] })).s === 400);

  // Booking: appears in both lists and the same booking id gates the private call
  r = await call(member.token, "POST", "/api/scheduling/bookings", { readerUid: admin.uid, startMs: slots[0].startMs });
  const booking = r.j?.booking ?? r.j;
  check("member books the admin's slot (free, confirmed)", r.s === 201 && booking.status === "confirmed", `${r.s} ${booking?.status}`);
  r = await call(admin2.token, "POST", "/api/scheduling/bookings", { readerUid: admin.uid, startMs: slots[0].startMs });
  check("same slot cannot be double-booked", r.s === 409, String(r.s));
  r = await call(member.token, "GET", "/api/scheduling/bookings");
  check("customer list contains the booking", r.j.asMember.some((b: any) => b.id === booking.id));
  r = await call(admin.token, "GET", "/api/scheduling/bookings");
  const asReader = r.j.asReader.find((b: any) => b.id === booking.id);
  check("admin's reader list contains the same booking", !!asReader && asReader.memberName);
  check("outsider admin does not see it", ![...(await call(admin2.token, "GET", "/api/scheduling/bookings")).j.asMember, ...(await call(admin2.token, "GET", "/api/scheduling/bookings")).j.asReader].some((b: any) => b.id === booking.id));
  check("booked slot removed from slot list", !(await call(admin2.token, "GET", `/api/scheduling/readers/${admin.uid}/slots`)).j.slots.some((x: any) => x.startMs === slots[0].startMs));
  r = await call(member.token, "POST", `/api/scheduling/bookings/${booking.id}/call/join`);
  check("both participants resolve to the same call route (outside window: 425, not 404)", r.s === 425 && (await call(admin.token, "POST", `/api/scheduling/bookings/${booking.id}/call/join`)).s === 425);
  check("non-participant admin cannot reach the call (404)", (await call(admin2.token, "POST", `/api/scheduling/bookings/${booking.id}/call/join`)).s === 404);
  await db.collection("bookings").doc(booking.id).delete();
} catch (error) {
  console.error("SCRIPT ERROR", error);
  failed++;
} finally {
  for (const uid of users) {
    const bookings = await db.collection("bookings").where("readerUid", "==", uid).get().catch(() => null);
    if (bookings) await Promise.all(bookings.docs.map((d) => d.ref.delete()));
    await db.collection("readerSchedules").doc(uid).delete().catch(() => undefined);
    await db.collection("users").doc(uid).delete().catch(() => undefined);
    await auth.deleteUser(uid).catch(() => undefined);
  }
  console.log(results.join("\n"));
  console.log(failed ? `FAILED: ${failed}` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
}
