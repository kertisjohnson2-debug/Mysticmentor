/*
 * Private appointment authorization + shared Tarot synchronization tests.
 * Runs against a live server (npm run dev) and the real Firebase project via the Admin SDK, using temporary
 * verified users that are deleted afterwards:  npx tsx test-private-appointment.ts
 */
import { createHash } from "node:crypto";
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

async function makeUser(tag: string, reader: boolean) {
  const uid = `apptest${tag}${Date.now().toString(36)}`;
  await auth.createUser({ uid, email: `${uid}@example.com`, emailVerified: true, displayName: tag });
  await db.collection("users").doc(uid).set({ displayName: tag, tarotReader: reader, createdAt: Date.now() });
  const custom = await auth.createCustomToken(uid);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${cfg.apiKey}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) });
  return { uid, token: ((await response.json()) as { idToken: string }).idToken };
}
const call = async (token: string | null, method: string, path: string, body?: unknown) => {
  const response = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let json: any = null;
  try { json = await response.json(); } catch { /* empty body */ }
  return { s: response.status, j: json };
};

const users: string[] = [];
const bookingIds: string[] = [];
try {
  const reader = await makeUser("reader", true); users.push(reader.uid);
  const client = await makeUser("client", false); users.push(client.uid);
  const outsider = await makeUser("outsider", false); users.push(outsider.uid);
  const now = Date.now();
  const makeBooking = async (label: string, patch: Record<string, unknown>) => {
    const id = createHash("sha256").update(`apptest${label}${now}`).digest("hex");
    bookingIds.push(id);
    await db.collection("bookings").doc(id).set({ readerUid: reader.uid, memberUid: client.uid, readerName: "R", memberName: "C", status: "confirmed", readingType: "Tarot", durationMinutes: 30, startMs: now + 5 * 60000, endMs: now + 35 * 60000, priceType: "free", priceCents: 0, paymentStatus: "none", createdAtMs: now, ...patch });
    return `/api/scheduling/bookings/${id}/call`;
  };

  const live = await makeBooking("live", {});
  const other = await makeBooking("other", { memberUid: outsider.uid });
  const early = await makeBooking("early", { startMs: now + 60 * 60000, endMs: now + 90 * 60000 });
  const late = await makeBooking("late", { startMs: now - 90 * 60000, endMs: now - 60 * 60000 });
  const unpaid = await makeBooking("unpaid", { status: "pending_payment", priceType: "paid", priceCents: 2500, holdExpiresMs: now + 600000 });
  const cancelled = await makeBooking("cancelled", { status: "cancelled" });

  // Room authorization
  check("unauthenticated join 401", (await call(null, "POST", `${live}/join`)).s === 401);
  check("outsider join 404", (await call(outsider.token, "POST", `${live}/join`)).s === 404);
  check("reader joins own room", (await call(reader.token, "POST", `${live}/join`)).j?.role === "reader");
  check("client joins own room", (await call(client.token, "POST", `${live}/join`)).j?.role === "member");
  check("before window 425", (await call(client.token, "POST", `${early}/join`)).s === 425);
  check("after window 410", (await call(client.token, "POST", `${late}/join`)).s === 410);
  check("unpaid booking 409", (await call(client.token, "POST", `${unpaid}/join`)).s === 409);
  check("cancelled booking 409", (await call(client.token, "POST", `${cancelled}/join`)).s === 409);
  check("outsider signal 404", (await call(outsider.token, "POST", `${live}/signal`, { type: "offer", callId: "outsider01", payload: {} })).s === 404);
  check("outsider signal read 404", (await call(outsider.token, "GET", `${live}/signals?after=0`)).s === 404);

  // Shared reading: authorization
  check("unauthenticated reading 401", (await call(null, "GET", `${live}/reading`)).s === 401);
  check("outsider reading read 404", (await call(outsider.token, "GET", `${live}/reading`)).s === 404);
  check("outsider reading write 404", (await call(outsider.token, "POST", `${live}/reading`, { action: "draw", spread: "three" })).s === 404);
  check("room B reading unreachable from room A participant", (await call(client.token, "GET", `${other}/reading`)).s === 404);
  check("reading unavailable before window 425", (await call(reader.token, "GET", `${early}/reading`)).s === 425);
  check("reading unavailable for unpaid 409", (await call(reader.token, "GET", `${unpaid}/reading`)).s === 409);
  check("client cannot draw (403)", (await call(client.token, "POST", `${live}/reading`, { action: "draw", spread: "three" })).s === 403);
  check("client cannot reveal (403)", (await call(client.token, "POST", `${live}/reading`, { action: "revealAll" })).s === 403);

  // Shared reading: behavior
  check("invalid action 400", (await call(reader.token, "POST", `${live}/reading`, { action: "nope" })).s === 400);
  check("invalid spread 400", (await call(reader.token, "POST", `${live}/reading`, { action: "draw", spread: "ten" })).s === 400);
  check("reveal before draw 409", (await call(reader.token, "POST", `${live}/reading`, { action: "revealNext" })).s === 409);
  const empty = await call(client.token, "GET", `${live}/reading`);
  check("empty reading for client", empty.s === 200 && empty.j.cards.length === 0);

  const drawn = await call(reader.token, "POST", `${live}/reading`, { action: "draw", spread: "three" });
  const ids: number[] = drawn.j?.cards?.map((c: any) => c.id) ?? [];
  check("reader draws 3 unique canonical cards", drawn.s === 200 && ids.length === 3 && new Set(ids).size === 3 && ids.every((id) => Number.isInteger(id) && id >= 0 && id < 78), JSON.stringify(ids));
  const hidden = await call(client.token, "GET", `${live}/reading`);
  check("client sees 3 face-down cards without ids or orientation", hidden.j.cards.length === 3 && hidden.j.cards.every((c: any) => c.id === null && c.reversed === null && c.revealed === false), JSON.stringify(hidden.j));
  check("raw hidden payload leaks no card id", !JSON.stringify(hidden.j).match(/"id":\d/));

  const r1 = await call(reader.token, "POST", `${live}/reading`, { action: "reveal", index: 1 });
  const seen = await call(client.token, "GET", `${live}/reading`);
  check("client sees only the revealed card, same id and orientation", seen.j.cards[1].id === ids[1] && seen.j.cards[1].reversed === r1.j.cards[1].reversed && seen.j.cards[0].id === null && seen.j.cards[2].id === null);
  const same = await call(client.token, "GET", `${live}/reading?since=${seen.j.version}`);
  check("unchanged version short-circuits", same.j?.unchanged === true);
  await call(reader.token, "POST", `${live}/reading`, { action: "revealNext" });
  const all = await call(reader.token, "POST", `${live}/reading`, { action: "revealAll" });
  const finalView = await call(client.token, "GET", `${live}/reading`);
  check("revealNext/revealAll sync to client", all.j.cards.every((c: any) => c.revealed) && finalView.j.cards.map((c: any) => c.id).join() === ids.join() && finalView.j.version > seen.j.version);
  const single = await call(reader.token, "POST", `${live}/reading`, { action: "draw", spread: "single" });
  check("single-card spread", single.j.spread === "single" && single.j.cards.length === 1);
  const clear = await call(reader.token, "POST", `${live}/reading`, { action: "reset" });
  check("reset clears the reading", clear.j.cards.length === 0 && (await call(client.token, "GET", `${live}/reading`)).j.cards.length === 0);

  // Isolation: reading in one appointment never appears in another or in the public liveReadings collection
  await call(reader.token, "POST", `${live}/reading`, { action: "draw", spread: "three" });
  const otherView = await call(outsider.token, "GET", `${other}/reading`);
  check("other appointment's reading is untouched", otherView.s === 200 && otherView.j.cards.length === 0);
  check("nothing written to public liveReadings", !(await db.collection("liveReadings").doc(reader.uid).get()).exists);
  const stored = await db.collection("bookings").doc(live.split("/")[4]).collection("reading").doc("state").get();
  check("state persists server-side in the booking subcollection", stored.exists && stored.data()?.cards?.length === 3);
} catch (error) {
  console.error("SCRIPT ERROR", error);
  failed++;
} finally {
  for (const id of bookingIds) {
    for (const sub of ["signals", "reading"]) {
      const docs = await db.collection("bookings").doc(id).collection(sub).get().catch(() => null);
      if (docs) await Promise.all(docs.docs.map((d) => d.ref.delete()));
    }
    await db.collection("bookings").doc(id).delete().catch(() => undefined);
  }
  for (const uid of users) {
    await db.collection("users").doc(uid).delete().catch(() => undefined);
    await auth.deleteUser(uid).catch(() => undefined);
  }
  console.log(results.join("\n"));
  console.log(failed ? `FAILED: ${failed}` : "ALL PASSED");
  process.exit(failed ? 1 : 0);
}
