/*
 * Focused checks for admin financial privacy rules and Stripe Checkout webhook expectations.
 * EMULATOR ONLY: never touches production Firestore and never calls Stripe (placeholder secrets only).
 *   firebase emulators:exec --only firestore --project demo-mysticmentor-stripe "npx tsx test-stripe-webhook-rules.mts"
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Stripe from "stripe";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? "";
if (!/^(127\.0\.0\.1|localhost):\d+$/.test(emulatorHost) || !String(process.env.GCLOUD_PROJECT).startsWith("demo-")) {
  throw new Error("Run this only inside `firebase emulators:exec --only firestore --project demo-…`.");
}
// Ensure the imported server module can never reach real credentials or Stripe.
for (const name of ["MYSTICMENTOR_FIREBASE_SERVICE_ACCOUNT", "GOOGLE_APPLICATION_CREDENTIALS", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "ENABLE_WEBHOOK_SIMULATION"]) delete process.env[name];

const config = JSON.parse(readFileSync("./firebase-applet-config.json", "utf8"));
const projectId = process.env.GCLOUD_PROJECT!;
// Pre-initialize with an offline stub credential so no Google metadata/credential lookup is attempted;
// server.ts reuses this app instead of creating its own.
const { initializeApp, cert } = await import("firebase-admin/app");
const { generateKeyPairSync } = await import("node:crypto");
const throwawayKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
initializeApp({ projectId, credential: cert({ projectId, clientEmail: "emulator-only@example.invalid", privateKey: throwawayKey }) });
const { db, processStripeEvent } = await import("./server.ts");
const { calculateTipSplit } = await import("./payments.ts");

let checks = 0;
function check(name: string, ok: boolean) { if (!ok) { console.error(`FAIL ${name}`); process.exit(1); } assert(ok, name); console.log(`PASS ${name}`); checks++; }
// server.ts swallows unhandled rejections, so surface any unexpected error explicitly.
process.on("unhandledRejection", (error) => { console.error("FAIL unexpected error:", error); process.exit(1); });
async function rejects(promise: Promise<unknown>) { try { await promise; return false; } catch { return true; } }
const event = (id: string, type: string, object: Record<string, unknown>) => ({ id, type, data: { object } }) as unknown as Stripe.Event;

// ---------- 1. Event configuration consistency (static) ----------
const server = readFileSync("./server.ts", "utf8");
const script = readFileSync("./scripts/dev-stripe.sh", "utf8");
const docs = readFileSync("./STRIPE_TEST_MODE.md", "utf8");
const expected = ["charge.dispute.created", "charge.refunded", "checkout.session.completed"];
const handled = [...new Set([...server.matchAll(/event\.type === "([a-z_.]+)"/g)].map((m) => m[1]))].sort();
const listened = (script.match(/--events\s+([a-z_.,]+)/)?.[1] ?? "").split(",").sort();
const dashboardStep = docs.split("\n").find((line) => line.includes("Developers → Webhooks")) ?? "";
const documented = [...dashboardStep.matchAll(/`([a-z_]+\.[a-z_.]+)`/g)].map((m) => m[1]).sort();
check("handler processes exactly the expected event types", JSON.stringify(handled) === JSON.stringify(expected));
check("CLI listener forwards exactly the handled events", JSON.stringify(listened) === JSON.stringify(expected));
check("Dashboard instructions list exactly the handled events", JSON.stringify(documented) === JSON.stringify(expected));
check("Dashboard endpoint documented as platform-account ('your account') scope", /Events on your account/.test(dashboardStep));
check("payment_intent.succeeded is not handled as a Checkout substitute", !/event\.type === "payment_intent\.succeeded"/.test(server));
const webhookAt = server.indexOf('app.post("/api/stripe-webhook", express.raw(');
check("webhook uses raw body and is registered before JSON parsing", webhookAt > 0 && webhookAt < server.indexOf("app.use(express.json())"));
check("webhook verifies signatures with constructEvent", /stripe\.webhooks\.constructEvent\(req\.body, sig as string, STRIPE_WEBHOOK_SECRET\)/.test(server));
check("tip Checkout sets the 20% application fee and destination", /application_fee_amount: platformFeeCents, transfer_data: \{ destination: target\.accountId \}/.test(server));
check("tip split for $1.00 is 20¢ platform / 80¢ broadcaster", JSON.stringify(calculateTipSplit(100)) === JSON.stringify({ platformFeeCents: 20, recipientShareCents: 80 }));

// Signature verification behaviour of the SDK path used by the route (placeholder secret only).
const signer = new Stripe("sk_test_placeholder_not_a_real_key");
const secret = "whsec_local_test_only_placeholder";
const payload = JSON.stringify({ id: "evt_sig", type: "checkout.session.completed", data: { object: {} } });
const header = signer.webhooks.generateTestHeaderString({ payload, secret });
check("valid signature accepted", signer.webhooks.constructEvent(payload, header, secret).id === "evt_sig");
check("tampered payload rejected", await rejects(Promise.resolve().then(() => signer.webhooks.constructEvent(payload.replace("evt_sig", "evt_bad"), header, secret))));
check("wrong signing secret rejected", await rejects(Promise.resolve().then(() => signer.webhooks.constructEvent(payload, header, "whsec_other_placeholder"))));

// ---------- 2. Firestore rules (emulator REST with unsigned emulator tokens) ----------
const base = `http://${emulatorHost}/v1/projects/${projectId}/databases/${config.firestoreDatabaseId}/documents`;
function token(uid: string, email: string, verified: boolean) {
  const enc = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${enc({ alg: "none", typ: "JWT" })}.${enc({ iss: `https://securetoken.google.com/${projectId}`, aud: projectId, sub: uid, user_id: uid, email, email_verified: verified, iat: now, exp: now + 3600, auth_time: now, firebase: { sign_in_provider: "password" } })}.`;
}
async function rest(path: string, auth?: string, method = "GET", body?: unknown) {
  const response = await fetch(`${base}/${path}`, { method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return response.status;
}
await db.collection("users").doc("rule-member").set({ uid: "rule-member", email: "member@rules.test", role: "member", gemBalance: 0, cloutPoints: 0 });
await db.collection("users").doc("rule-role-admin").set({ uid: "rule-role-admin", email: "roleadmin@rules.test", role: "admin", gemBalance: 0, cloutPoints: 0 });
await db.collection("users").doc("rule-unverified-role-admin").set({ uid: "rule-unverified-role-admin", email: "unverified@rules.test", role: "admin", gemBalance: 0, cloutPoints: 0 });
await db.collection("admin_settings").doc("financials").set({ totalGrossVolume: 42 });
await db.collection("admin_settings").doc("community").set({ replyImagesEnabled: false });
await db.collection("admin_settings").doc("other").set({ hidden: true });
await db.collection("financial_records").doc("rec1").set({ amount: 1 });
await db.collection("users").doc("rule-member").collection("transactions").doc("tx1").set({ amount: 1 });

const member = token("rule-member", "member@rules.test", true);
const roleAdmin = token("rule-role-admin", "roleadmin@rules.test", true);
const unverifiedRoleAdmin = token("rule-unverified-role-admin", "unverified@rules.test", false);
const bootstrapAdmin = token("rule-bootstrap", "kertisjohnson7@gmail.com", true);
const unverifiedBootstrap = token("rule-unverified", "kertisjohnson7@gmail.com", false);
for (const [label, auth] of [["signed-out visitor", undefined], ["member", member], ["unverified role admin", unverifiedRoleAdmin], ["unverified admin email", unverifiedBootstrap]] as const) {
  check(`financials singleton not client-readable by ${label}`, (await rest("admin_settings/financials", auth)) === 403);
  check(`financial_records not client-readable by ${label}`, (await rest("financial_records/rec1", auth)) === 403);
  check(`non-public settings doc not client-readable by ${label}`, (await rest("admin_settings/other", auth)) === 403);
}
for (const [label, auth] of [["verified role admin", roleAdmin], ["verified bootstrap admin", bootstrapAdmin]] as const) {
  check(`financials singleton is readable by ${label}`, (await rest("admin_settings/financials", auth)) === 200);
  check(`financial records are readable by ${label}`, (await rest("financial_records/rec1", auth)) === 200);
  check(`financial records collection is listable by ${label}`, (await rest("financial_records", auth)) === 200);
  check(`non-public settings doc remains hidden from ${label}`, (await rest("admin_settings/other", auth)) === 403);
}
check("admin_settings collection cannot be listed", (await rest("admin_settings")) === 403 && (await rest("admin_settings", bootstrapAdmin)) === 403);
check("financials cannot be written by an admin client", (await rest("admin_settings/financials?updateMask.fieldPaths=totalGrossVolume", bootstrapAdmin, "PATCH", { fields: { totalGrossVolume: { integerValue: "0" } } })) === 403);
check("financial records cannot be written by an admin client", (await rest("financial_records/rec1?updateMask.fieldPaths=amount", bootstrapAdmin, "PATCH", { fields: { amount: { integerValue: "0" } } })) === 403);
check("public community settings remain readable", (await rest("admin_settings/community")) === 200);
check("members can still read their own transactions", (await rest("users/rule-member/transactions/tx1", member)) === 200);
check("members cannot read another member's transactions", (await rest("users/rule-member/transactions/tx1", roleAdmin)) === 403);
await db.collection("admin_settings").doc("financials").delete();

// ---------- 3. Webhook processing for gems, tips and bookings ----------
const fin = async () => (await db.collection("admin_settings").doc("financials").get()).data() ?? {};

// Gem purchase
await db.collection("users").doc("buyer").set({ uid: "buyer", email: "buyer@rules.test", role: "member", gemBalance: 0, cloutPoints: 0 });
const gemSession = (over: Record<string, unknown> = {}) => ({ id: "cs_test_gem1", object: "checkout.session", payment_status: "paid", amount_total: 499, currency: "usd", metadata: { type: "gem_purchase", userId: "buyer", packageId: "gems_500", gemsAmount: "500", transactionId: "gemtx1" }, ...over });
const gems = async () => (await db.collection("users").doc("buyer").get()).data()?.gemBalance;
await processStripeEvent(event("evt_gem_unpaid", "checkout.session.completed", gemSession({ payment_status: "unpaid" })));
check("unpaid gem session credits nothing", (await gems()) === 0);
check("gem amount mismatch rejected", await rejects(processStripeEvent(event("evt_gem_bad", "checkout.session.completed", gemSession({ amount_total: 1 })))));
check("forged gem count rejected", await rejects(processStripeEvent(event("evt_gem_forged", "checkout.session.completed", gemSession({ metadata: { ...gemSession().metadata, gemsAmount: "99999" } })))));
await processStripeEvent(event("evt_gem_ok", "checkout.session.completed", gemSession()));
check("paid gem session credits once", (await gems()) === 500);
await processStripeEvent(event("evt_gem_ok", "checkout.session.completed", gemSession()));
await processStripeEvent(event("evt_gem_redelivered", "checkout.session.completed", gemSession()));
check("replayed event and duplicate session do not credit again", (await gems()) === 500 && (await fin()).purchaseCount === 1);

// Livestream tip ($1.00, 20% platform fee)
const tipId = "a".repeat(32);
const split = calculateTipSplit(100);
await db.collection("users").doc("broadcaster").set({ uid: "broadcaster", email: "b@rules.test", role: "member", gemBalance: 0, cloutPoints: 0 });
await db.collection("liveTips").doc(tipId).set({ tipId, senderUid: "buyer", recipientUid: "broadcaster", amountCents: 100, ...split, currency: "usd", status: "pending", stripeSessionId: "cs_test_tip1" });
const tipSession = (over: Record<string, unknown> = {}) => ({ id: "cs_test_tip1", object: "checkout.session", payment_status: "paid", amount_total: 100, currency: "usd", payment_intent: "pi_test_tip1", metadata: { type: "live_tip", tipId, senderUid: "buyer", recipientUid: "broadcaster" }, ...over });
await processStripeEvent(event("evt_tip_unpaid", "checkout.session.completed", tipSession({ payment_status: "unpaid" })));
check("unpaid tip session records nothing", (await db.collection("liveTips").doc(tipId).get()).data()?.status === "pending");
check("tip amount mismatch rejected", await rejects(processStripeEvent(event("evt_tip_amt", "checkout.session.completed", tipSession({ amount_total: 5000 })))));
check("tip currency mismatch rejected", await rejects(processStripeEvent(event("evt_tip_cur", "checkout.session.completed", tipSession({ currency: "eur" })))));
check("tip for a different session rejected", await rejects(processStripeEvent(event("evt_tip_sess", "checkout.session.completed", tipSession({ id: "cs_test_other" })))));
const before = await fin();
await processStripeEvent(event("evt_tip_ok", "checkout.session.completed", tipSession()));
const record = (await db.collection("financial_records").doc(`tx_tip_${tipId}`).get()).data();
check("paid tip recorded with 20¢ platform fee and 80¢ broadcaster share", record?.platformFee === 0.2 && record?.recipientShare === 0.8 && record?.amount === 1);
await processStripeEvent(event("evt_tip_ok", "checkout.session.completed", tipSession()));
await processStripeEvent(event("evt_tip_redelivered", "checkout.session.completed", tipSession()));
const after = await fin();
check("tip totals updated exactly once despite replays", Math.abs((after.totalPlatformRevenue - before.totalPlatformRevenue) - 0.2) < 1e-9 && Math.abs((after.totalTransfers ?? 0) - 0.8) < 1e-9 && after.purchaseCount === before.purchaseCount + 1);

// Private booking (stored in the app's NAMED database)
const bookingId = "b".repeat(64);
const bookingRef = db.collection("bookings").doc(bookingId);
await bookingRef.set({ memberUid: "buyer", readerUid: "broadcaster", priceCents: 2500, priceType: "paid", status: "pending_payment", startMs: 1, endMs: 2 });
const bookingSession = (over: Record<string, unknown> = {}) => ({ id: "cs_test_booking1", object: "checkout.session", payment_status: "paid", amount_total: 2500, currency: "usd", metadata: { type: "booking_payment", bookingId, memberUid: "buyer" }, ...over });
await processStripeEvent(event("evt_book_unpaid", "checkout.session.completed", bookingSession({ payment_status: "unpaid" })));
check("unpaid booking session leaves booking pending", (await bookingRef.get()).data()?.status === "pending_payment");
check("booking amount mismatch rejected", await rejects(processStripeEvent(event("evt_book_amt", "checkout.session.completed", bookingSession({ amount_total: 100 })))));
await processStripeEvent(event("evt_book_ok", "checkout.session.completed", bookingSession()));
const booked = (await bookingRef.get()).data();
check("paid booking confirmed in the named database", booked?.status === "confirmed" && booked?.paymentSessionId === "cs_test_booking1");
await processStripeEvent(event("evt_book_redelivered", "checkout.session.completed", bookingSession()));
check("redelivered booking event is a no-op", (await bookingRef.get()).data()?.status === "confirmed");

// Events that must not record payments
const finBefore = JSON.stringify({ ...(await fin()), updatedAt: null });
await processStripeEvent(event("evt_pi", "payment_intent.succeeded", { id: "pi_test_x", amount: 499, metadata: { type: "gem_purchase", userId: "buyer", packageId: "gems_500" } }));
await processStripeEvent(event("evt_generic", "checkout.session.completed", { id: "cs_test_generic", payment_status: "paid", amount_total: 3000, metadata: {} }));
check("payment_intent.succeeded and untagged sessions record nothing", (await gems()) === 500 && JSON.stringify({ ...(await fin()), updatedAt: null }) === finBefore);

console.log(`\n${checks} checks passed (Firestore emulator only; no Stripe API calls).`);
process.exit(0);
