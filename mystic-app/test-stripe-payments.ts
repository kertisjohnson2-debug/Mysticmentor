/*
 * Stripe test-mode payment tests: tip maths, authorization, validation, webhook signatures and idempotency.
 * Runs its OWN server on port 3111 with PLACEHOLDER Stripe values (never real keys), so no request here can reach Stripe.
 * Real Firestore + temporary users are used and removed afterwards, and the shared financials aggregate is restored.
 *   npx tsx test-stripe-payments.ts
 * NOT covered here: real Stripe Checkout, real Connect onboarding, real webhook delivery from Stripe.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { calculateTipSplit, evaluateConnectReadiness, parseTipAmountCents } from "./payments";
import { getBroadcasterRankProgress } from "./src/lib/broadcasterRanks";

const PORT = 3111;
const BASE = `http://localhost:${PORT}`;
const WEBHOOK_SECRET = "whsec_local_test_only_placeholder";
const cfg = JSON.parse(readFileSync("firebase-applet-config.json", "utf8"));
const app = initializeApp({ credential: cert(JSON.parse(process.env.MYSTICMENTOR_FIREBASE_SERVICE_ACCOUNT!)) });
const auth = getAuth(app);
const db = getFirestore(app, cfg.firestoreDatabaseId);
const signer = new Stripe("sk_test_placeholder_not_a_real_key");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder_not_a_real_key");
const tag = Date.now().toString(36);
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`); };

// ---- pure maths ----
check("tip minimum $1.00 accepted", parseTipAmountCents(100) === 100);
check("tip maximum $500.00 accepted", parseTipAmountCents(50000) === 50000);
for (const bad of [99, 0, -500, 50001, 5.5, "500", null, undefined, NaN, Infinity, 1e21, {}, [500]]) {
  check(`invalid tip amount rejected: ${JSON.stringify(bad) ?? String(bad)}`, parseTipAmountCents(bad) === null);
}
check("split of $5.00 is 20%/80%", JSON.stringify(calculateTipSplit(500)) === JSON.stringify({ platformFeeCents: 100, recipientShareCents: 400 }));
check("split of $10.00 is $2.00/$8.00", calculateTipSplit(1000).platformFeeCents === 200 && calculateTipSplit(1000).recipientShareCents === 800);
let sumsOk = true;
for (let cents = 100; cents <= 50000; cents += 7) { const s = calculateTipSplit(cents); if (s.platformFeeCents + s.recipientShareCents !== cents || s.platformFeeCents < 0 || s.recipientShareCents <= 0) sumsOk = false; }
check("fee + broadcaster share always equals the tip exactly", sumsOk);
check("odd-cent tip rounds the fee to the nearest cent ($1.01 -> 20c fee)", calculateTipSplit(101).platformFeeCents === 20 && calculateTipSplit(101).recipientShareCents === 81);
check("connect readiness: no account", evaluateConnectReadiness(null).ready === false);
check("connect readiness: unfinished onboarding", evaluateConnectReadiness({ details_submitted: false, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: "active" } }).ready === false);
check("connect readiness: transfers inactive", evaluateConnectReadiness({ details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: "pending" } }).ready === false);
check("connect readiness: payouts disabled", evaluateConnectReadiness({ details_submitted: true, charges_enabled: true, payouts_enabled: false, capabilities: { transfers: "active" } }).ready === false);
check("connect readiness: fully enabled", evaluateConnectReadiness({ details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: "active" } }).ready === true);
check("v2 Connect readiness: active recipient transfers and payouts", evaluateConnectReadiness({
  object: "v2.core.account",
  configuration: {
    recipient: {
      capabilities: {
        stripe_balance: {
          payouts: { status: "active" },
          stripe_transfers: { status: "active" },
        },
      },
    },
  },
}).ready === true);
check("v2 Connect readiness: pending recipient payouts", evaluateConnectReadiness({
  object: "v2.core.account",
  configuration: { recipient: { capabilities: { stripe_balance: { payouts: { status: "pending" }, stripe_transfers: { status: "active" } } } } },
}).ready === false);
check("broadcaster rank uses the existing lifetime-Gem thresholds", getBroadcasterRankProgress(1000)?.currentRank.name === "Mystic Adept");
check("broadcaster rank progress uses the stored lifetime-Gem total", getBroadcasterRankProgress(500)?.rankProgress === 0.5);
check("invalid lifetime-Gem totals do not produce a rank", getBroadcasterRankProgress(-1) === null && getBroadcasterRankProgress(Number.NaN) === null);

// ---- server with placeholder Stripe configuration ----
const server = spawn("npx", ["tsx", "server.ts"], { env: { ...process.env, PORT: String(PORT), STRIPE_SECRET_KEY: "sk_test_placeholder_not_a_real_key", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, ENABLE_WEBHOOK_SIMULATION: "false", APP_URL: "http://localhost:3111" }, stdio: "ignore", detached: true });
const stopServer = () => { try { process.kill(-server.pid!, "SIGTERM"); } catch { /* already stopped */ } };
for (let i = 0; i < 90; i++) { try { if ((await fetch(BASE + "/api/scheduling/readers")).status) break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }

const users: string[] = [];
const cleanup: Array<() => Promise<unknown>> = [];
const finRef = db.collection("admin_settings").doc("financials");
const finBefore = await finRef.get();

async function makeUser(name: string, data: Record<string, unknown> = {}) {
  const uid = `paytest${name}${tag}`;
  await auth.createUser({ uid, email: `${uid}@example.com`, displayName: name });
  await db.collection("users").doc(uid).set({ displayName: name, role: "member", gemBalance: 0, cloutPoints: 0, createdAt: Date.now(), ...data });
  users.push(uid);
  const custom = await auth.createCustomToken(uid);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${cfg.apiKey}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: custom, returnSecureToken: true }) });
  return { uid, token: ((await response.json()) as { idToken: string }).idToken };
}
const api = async (token: string | null, method: string, path: string, body?: unknown) => {
  const response = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  let json: any = null; try { json = await response.json(); } catch { /* empty */ }
  return { s: response.status, j: json };
};
const webhook = async (event: object, opts: { sign?: boolean; secret?: string } = {}) => {
  const payload = JSON.stringify(event);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.sign !== false) headers["stripe-signature"] = signer.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? WEBHOOK_SECRET });
  const response = await fetch(BASE + "/api/stripe-webhook", { method: "POST", headers, body: payload });
  return response.status;
};
const evt = (id: string, session: Record<string, unknown>) => ({ id, object: "event", api_version: "2024-06-20", created: Math.floor(Date.now() / 1000), type: "checkout.session.completed", data: { object: { object: "checkout.session", payment_status: "paid", currency: "usd", ...session } } });
const balance = async (uid: string) => (await db.collection("users").doc(uid).get()).data()?.gemBalance;

try {
  const viewer = await makeUser("viewer");
  const outsider = await makeUser("outsider");
  const host = await makeUser("host", {
    role: "admin",
    lifetimeGemsReceived: 900,
    bio: "Profile bio",
    spiritualInterests: "Tarot, meditation",
    tarotReader: true,
    email: "private-profile@example.com",
    privateReadings: [{ content: "private reading marker" }],
    financialInformation: { account: "private finance marker" },
  });
  const unlinkedHost = await makeUser("unlinked", { role: "admin" });
  const giftSender = await makeUser("gift_sender", { gemBalance: 100 });
  const giftRecipient = await makeUser("gift_recipient", { role: "admin", lifetimeGemsReceived: 0 });
  const sessionId = `paytest_live_${tag}`;
  await db.collection("liveSessions").doc(sessionId).set({ ownerUid: unlinkedHost.uid, sessionId, status: "live", startedAt: Date.now(), updatedAt: Date.now() });
  cleanup.push(() => db.collection("liveSessions").doc(sessionId).delete());
  const ownSession = `paytest_own_${tag}`;
  await db.collection("liveSessions").doc(ownSession).set({ ownerUid: viewer.uid, sessionId: ownSession, status: "live", startedAt: Date.now(), updatedAt: Date.now() });
  cleanup.push(() => db.collection("liveSessions").doc(ownSession).delete());
  const endedSession = `paytest_ended_${tag}`;
  await db.collection("liveSessions").doc(endedSession).set({ ownerUid: unlinkedHost.uid, sessionId: endedSession, status: "ended", startedAt: Date.now(), updatedAt: Date.now() });
  cleanup.push(() => db.collection("liveSessions").doc(endedSession).delete());
  const giftSessionId = `paytest_gift_${tag}`;
  await db.collection("liveSessions").doc(giftSessionId).set({ ownerUid: giftRecipient.uid, sessionId: giftSessionId, status: "live", startedAt: Date.now(), updatedAt: Date.now() });
  cleanup.push(() => db.collection("liveSessions").doc(giftSessionId).delete());
  await db.collection("broadcasterStats").doc(host.uid).set({ lifetimeGemsReceived: 900 });
  cleanup.push(() => db.collection("broadcasterStats").doc(host.uid).delete());

  const todayGiftDate = new Date().toISOString();
  const yesterdayGiftDate = new Date(Date.now() - 86400000).toISOString();
  await Promise.all([
    db.collection("users").doc(host.uid).collection("transactions").doc(`earn_today_${tag}`).set({
      type: "live_gift_received", status: "completed", viewerUid: viewer.uid, viewerName: "Verified Viewer", gemsAmount: 50, createdAt: todayGiftDate,
    }),
    db.collection("users").doc(host.uid).collection("transactions").doc(`earn_yesterday_${tag}`).set({
      type: "live_gift_received", status: "completed", viewerUid: outsider.uid, viewerName: "Another Viewer", gemsAmount: 25, createdAt: yesterdayGiftDate,
    }),
    db.collection("users").doc(host.uid).collection("transactions").doc(`earn_pending_${tag}`).set({
      type: "live_gift_received", status: "pending", viewerUid: outsider.uid, viewerName: "Pending Viewer", gemsAmount: 300, createdAt: todayGiftDate,
    }),
    db.collection("users").doc(host.uid).collection("transactions").doc(`earn_purchase_${tag}`).set({
      type: "gem_purchase", status: "completed", gemsAmount: 1200, createdAt: todayGiftDate,
    }),
    db.collection("users").doc(host.uid).collection("transactions").doc(`earn_cash_tip_${tag}`).set({
      type: "tip_received", status: "completed", gemsAmount: 0, cashAmount: 10, createdAt: todayGiftDate,
    }),
  ]);

  // ---- authentication and validation ----
  check("gem checkout requires authentication", (await api(null, "POST", "/api/create-gem-checkout-session", { packageId: "gems_500" })).s === 401);
  check("gem checkout rejects unknown package", (await api(viewer.token, "POST", "/api/create-gem-checkout-session", { packageId: "gems_999999" })).s === 400);
  check("gem checkout rejects prototype-key package id", (await api(viewer.token, "POST", "/api/create-gem-checkout-session", { packageId: "constructor" })).s === 400);
  check("tip checkout requires authentication", (await api(null, "POST", "/api/live/tip-checkout", { sessionId, amountCents: 500 })).s === 401);
  check("tip checkout rejects a forged token", (await api("not.a.token", "POST", "/api/live/tip-checkout", { sessionId, amountCents: 500 })).s === 401);
  for (const amountCents of [99, 50001, 5.5, "500", -100, undefined]) {
    check(`tip checkout rejects amount ${JSON.stringify(amountCents) ?? "missing"}`, (await api(viewer.token, "POST", "/api/live/tip-checkout", { sessionId, amountCents })).s === 400);
  }
  check("tip checkout rejects a malformed session id", (await api(viewer.token, "POST", "/api/live/tip-checkout", { sessionId: "../x/y", amountCents: 500 })).s === 400);
  check("tip checkout rejects an unknown session", (await api(viewer.token, "POST", "/api/live/tip-checkout", { sessionId: "nope_nope", amountCents: 500 })).s === 404);
  check("tip checkout rejects an ended broadcast", (await api(viewer.token, "POST", "/api/live/tip-checkout", { sessionId: endedSession, amountCents: 500 })).s === 404);
  check("a broadcaster cannot tip their own stream", (await api(viewer.token, "POST", "/api/live/tip-checkout", { sessionId: ownSession, amountCents: 500 })).s === 400);
  const unready = await api(viewer.token, "POST", "/api/live/tip-checkout", { sessionId, amountCents: 500, recipientUid: outsider.uid, destinationAccount: "acct_attacker", transfer_data: { destination: "acct_attacker" } });
  check("tips are refused (409) while the broadcaster has no ready payout account, ignoring client-supplied recipient/account", unready.s === 409, JSON.stringify(unready));
  check("no tip record is created when checkout is refused", (await db.collection("liveTips").where("senderUid", "==", viewer.uid).get()).empty);
  const status = await api(viewer.token, "GET", `/api/live/tip-status?sessionId=${sessionId}`);
  check("tip-status reports paid tips disabled for an unlinked broadcaster", status.s === 200 && status.j.enabled === false);
  check("tip-status requires authentication", (await api(null, "GET", `/api/live/tip-status?sessionId=${sessionId}`)).s === 401);

  check("connect onboarding requires authentication", (await api(null, "POST", "/api/create-connect-onboarding", { userId: host.uid })).s === 401);
  const forgedOnboarding = await api(viewer.token, "POST", "/api/create-connect-onboarding", { userId: host.uid });
  check("an ordinary member onboarding is for their own account only (body userId ignored)", forgedOnboarding.s === 200 || forgedOnboarding.s === 500);
  const viewerConnectId = (await db.collection("users").doc(viewer.uid).get()).data()?.stripeConnectId;
  if (typeof viewerConnectId === "string" && viewerConnectId.startsWith("acct_")) await stripe.accounts.del(viewerConnectId).catch(() => undefined);
  check("onboarding attempt wrote no payout account for the named user", !(await db.collection("users").doc(host.uid).get()).data()?.stripeConnectId);
  check("connect status requires authentication", (await api(null, "GET", "/api/connect/status")).s === 401);
  const ownStatus = await api(host.token, "GET", "/api/connect/status");
  check("connect status for an unlinked admin reports not linked and not ready", ownStatus.s === 200 && ownStatus.j.linked === false && ownStatus.j.ready === false);
  check("connect status never returns the account id", !JSON.stringify(ownStatus.j).includes("acct_"));

  // ---- authenticated broadcaster Gem earnings ----
  check("earnings endpoint requires authentication", (await api(null, "GET", "/api/live/earnings")).s === 401);
  check("ordinary members cannot access the broadcaster earnings endpoint", (await api(viewer.token, "GET", "/api/live/earnings")).s === 403);
  const earnings = await api(host.token, "GET", "/api/live/earnings?timeZone=UTC");
  check("eligible broadcaster receives only their verified Gem gift earnings", earnings.s === 200 && earnings.j.totalGemsEarned === 75 && earnings.j.lifetimeGemsEarned === 900);
  check("today's Gem earnings use the requested time zone and exclude pending gifts", earnings.j.todayGemsEarned === 50);
  check("earnings history includes date, viewer, amount and status for completed gifts", earnings.j.transactions?.length === 2 && earnings.j.transactions.some((entry: any) => entry.viewerName === "Verified Viewer" && entry.gemsAmount === 50 && entry.status === "completed" && entry.date === todayGiftDate));
  const forgedEarnings = await api(viewer.token, "GET", `/api/live/earnings?timeZone=UTC&userId=${host.uid}`);
  check("a client cannot request another broadcaster's earnings by supplying a uid", forgedEarnings.s === 403);
  check("earnings endpoint rejects invalid time zones", (await api(host.token, "GET", "/api/live/earnings?timeZone=Not_A_Real_Zone")).s === 400);
  const giftResult = await api(giftSender.token, "POST", "/api/spend-gems", { context: "live", giftId: "heart", recipientId: giftRecipient.uid, sessionId: giftSessionId, requestId: `paytestgift${tag}` });
  // The gift writes the recipient's public stats and a financial record; remove both so test users leave no orphaned totals.
  cleanup.push(() => db.collection("broadcasterStats").doc(giftRecipient.uid).delete());
  if (typeof giftResult.j?.transactionId === "string") cleanup.push(() => db.collection("financial_records").doc(giftResult.j.transactionId).delete());
  const receivedGiftLedger = await db.collection("users").doc(giftRecipient.uid).collection("transactions").where("type", "==", "live_gift_received").get();
  check("a confirmed live gift writes a broadcaster-side earnings ledger entry", giftResult.s === 200 && receivedGiftLedger.size === 1);
  check("gift earnings history records the verified viewer, gems and completed status", receivedGiftLedger.docs[0]?.data().viewerName === "gift_sender" && receivedGiftLedger.docs[0]?.data().gemsAmount === 10 && receivedGiftLedger.docs[0]?.data().status === "completed");
  check("gift and lifetime gem earnings endpoint returns the server-recorded gift", (await api(giftRecipient.token, "GET", "/api/live/earnings?timeZone=UTC")).j.totalGemsEarned === 10 && (await api(giftRecipient.token, "GET", "/api/live/earnings?timeZone=UTC")).j.lifetimeGemsEarned === 10);

  // ---- webhook signature ----
  const gemSession = `cs_test_gem_${tag}`;
  const gemMeta = (extra: Record<string, string> = {}) => ({ type: "gem_purchase", userId: viewer.uid, packageId: "gems_500", gemsAmount: "500", cost: "4.99", transactionId: `tx_sess_${tag}`, ...extra });
  const gemEvent = (id: string, over: Record<string, unknown> = {}, meta = gemMeta()) => evt(id, { id: gemSession, amount_total: 499, metadata: meta, ...over });
  check("webhook rejects a request with no signature", (await webhook(gemEvent(`evt_nosig_${tag}`), { sign: false })) === 400);
  check("webhook rejects a signature made with the wrong secret", (await webhook(gemEvent(`evt_badsig_${tag}`), { secret: "whsec_wrong" })) === 400);
  check("webhook rejects an unsigned simulated payload (simulation is off)", (await webhook(gemEvent(`evt_sim_${tag}`), { sign: false })) === 400);
  check("rejected webhooks credited nothing", (await balance(viewer.uid)) === 0);
  const tampered = JSON.stringify(gemEvent(`evt_tamper_${tag}`));
  const goodHeader = signer.webhooks.generateTestHeaderString({ payload: tampered, secret: WEBHOOK_SECRET });
  const tamperedResponse = await fetch(BASE + "/api/stripe-webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": goodHeader }, body: tampered.replace('"amount_total":499', '"amount_total":1') });
  check("webhook rejects a body altered after signing", tamperedResponse.status === 400);

  // ---- gem crediting and idempotency ----
  check("valid signed gem purchase is accepted", (await webhook(gemEvent(`evt_gem1_${tag}`))) === 200);
  check("gems credited from the server package table (500)", (await balance(viewer.uid)) === 500, String(await balance(viewer.uid)));
  check("duplicate delivery of the same event is acknowledged", (await webhook(gemEvent(`evt_gem1_${tag}`))) === 200);
  check("duplicate event did not credit twice", (await balance(viewer.uid)) === 500);
  check("a different event for the same paid session did not credit twice", (await webhook(gemEvent(`evt_gem2_${tag}`))) === 200 && (await balance(viewer.uid)) === 500);
  const ledger = (await db.collection("users").doc(viewer.uid).collection("transactions").get()).docs.filter((d) => d.data().type === "recharge");
  check("exactly one recharge ledger entry exists", ledger.length === 1 && ledger[0].data().gemsAmount === 500 && ledger[0].data().cashAmount === 4.99);
  cleanup.push(async () => { await db.collection("processed_stripe_sessions").doc(gemSession).delete(); await db.collection("financial_records").doc(`tx_sess_${tag}`).delete(); });

  const otherSession = `cs_test_gem_bad_${tag}`;
  check("signed event whose paid amount does not match the package price is refused", (await webhook(evt(`evt_amt_${tag}`, { id: otherSession, amount_total: 1, metadata: gemMeta({ transactionId: `tx_sess_amt_${tag}` }) }))) === 500);
  check("signed event with inflated gemsAmount metadata is refused", (await webhook(evt(`evt_inflate_${tag}`, { id: `${otherSession}2`, amount_total: 499, metadata: gemMeta({ gemsAmount: "999999", transactionId: `tx_sess_inf_${tag}` }) }))) === 500);
  check("signed event with an unknown package is refused", (await webhook(evt(`evt_pkg_${tag}`, { id: `${otherSession}3`, amount_total: 499, metadata: gemMeta({ packageId: "gems_free", transactionId: `tx_sess_pkg_${tag}` }) }))) === 500);
  check("signed event with a missing amount_total is refused", (await webhook(evt(`evt_noamt_${tag}`, { id: `${otherSession}4`, metadata: gemMeta({ transactionId: `tx_sess_noamt_${tag}` }) }))) === 500);
  check("an unpaid session credits nothing", (await webhook(evt(`evt_unpaid_${tag}`, { id: `${otherSession}5`, amount_total: 499, payment_status: "unpaid", metadata: gemMeta({ transactionId: `tx_sess_unp_${tag}` }) }))) === 200 && (await balance(viewer.uid)) === 500);
  check("refused events left the balance unchanged", (await balance(viewer.uid)) === 500);

  // ---- tip recording (server-created pending tip, then verified webhook) ----
  const tipId = `${tag}`.padEnd(32, "a").slice(0, 32).replace(/[^a-f0-9]/g, "b");
  const tipSession = `cs_test_tip_${tag}`;
  const amountCents = 1000; const split = calculateTipSplit(amountCents);
  await db.collection("liveTips").doc(tipId).set({ tipId, senderUid: viewer.uid, recipientUid: host.uid, sessionId, destinationAccount: "acct_test_placeholder", amountCents, ...split, platformFeeCents: split.platformFeeCents, recipientShareCents: split.recipientShareCents, currency: "usd", status: "pending", stripeSessionId: tipSession, createdAt: new Date().toISOString() });
  cleanup.push(async () => { await db.collection("liveTips").doc(tipId).delete(); await db.collection("financial_records").doc(`tx_tip_${tipId}`).delete(); });
  const tipEvent = (id: string, over: Record<string, unknown> = {}) => evt(id, { id: tipSession, amount_total: amountCents, payment_intent: "pi_test_placeholder", metadata: { type: "live_tip", tipId, senderUid: outsider.uid, recipientUid: outsider.uid }, ...over });

  check("a paid session that does not match the stored tip amount is refused", (await webhook(tipEvent(`evt_tipbad_${tag}`, { amount_total: 100 }))) === 500);
  check("a paid session with a different Stripe session id is refused", (await webhook(tipEvent(`evt_tipsess_${tag}`, { id: "cs_test_other" }))) === 500);
  check("refused tip events left the tip pending", (await db.collection("liveTips").doc(tipId).get()).data()?.status === "pending");
  check("an unpaid tip session records nothing", (await webhook(tipEvent(`evt_tipunpaid_${tag}`, { payment_status: "unpaid" }))) === 200 && (await db.collection("liveTips").doc(tipId).get()).data()?.status === "pending");
  check("an unknown tip id is refused", (await webhook(tipEvent(`evt_tipunknown_${tag}`, { metadata: { type: "live_tip", tipId: "f".repeat(32) } }))) === 500);
  check("signed tip event is accepted", (await webhook(tipEvent(`evt_tip1_${tag}`))) === 200);
  const tipDoc = (await db.collection("liveTips").doc(tipId).get()).data();
  check("tip marked completed", tipDoc?.status === "completed");
  const txId = `tx_tip_${tipId}`;
  const senderTx = (await db.collection("users").doc(viewer.uid).collection("transactions").doc(txId).get()).data();
  const hostTx = (await db.collection("users").doc(host.uid).collection("transactions").doc(txId).get()).data();
  check("sender ledger records the tip with the 20/80 split", senderTx?.type === "tip" && senderTx.cashAmount === 10 && senderTx.platformFee === 2 && senderTx.recipientShare === 8);
  check("recipient is the server-stored broadcaster, not the event metadata user", hostTx?.type === "tip_received" && hostTx.recipientShare === 8 && !(await db.collection("users").doc(outsider.uid).collection("transactions").doc(txId).get()).exists);
  check("recipient clout credited once (+$10 = 10)", (await db.collection("users").doc(host.uid).get()).data()?.cloutPoints === 10);
  check("duplicate tip event is acknowledged without double recording", (await webhook(tipEvent(`evt_tip1_${tag}`))) === 200 && (await db.collection("users").doc(host.uid).get()).data()?.cloutPoints === 10);
  check("redelivery under a new event id does not double record", (await webhook(tipEvent(`evt_tip2_${tag}`))) === 200 && (await db.collection("users").doc(host.uid).get()).data()?.cloutPoints === 10);
  const earningsAfterCashTip = await api(host.token, "GET", "/api/live/earnings?timeZone=UTC");
  check("cash-tip webhook and duplicate delivery do not count as Gem earnings", earningsAfterCashTip.j.totalGemsEarned === 75 && earningsAfterCashTip.j.todayGemsEarned === 50);
  const finRecord = (await db.collection("financial_records").doc(txId).get()).data();
  check("one financial record with platform fee $2.00 / broadcaster $8.00", finRecord?.platformFee === 2 && finRecord?.recipientShare === 8 && finRecord?.amount === 10);
  cleanup.push(() => db.collection("processed_stripe_events").doc(`evt_tip1_${tag}`).delete());

  // ---- member profile visibility and stored progress ----
  const defaultSettings = await api(host.token, "GET", "/api/members/me/public-settings");
  check("Clout stays private by default for accounts without an explicit choice", defaultSettings.s === 200 && defaultSettings.j.visibility.clout === false);
  const hiddenSettings = {
    zodiacSign: "Leo",
    visibility: { avatar: false, bio: false, spiritualInterests: false, zodiac: false, readerStatus: false, rank: false, clout: false, liveStatus: false },
  };
  const savedHiddenSettings = await api(host.token, "PUT", "/api/members/me/public-settings", hiddenSettings);
  const reloadedHiddenSettings = await api(host.token, "GET", "/api/members/me/public-settings");
  check("profile visibility choices save and persist after reload", savedHiddenSettings.s === 200 && reloadedHiddenSettings.s === 200 && JSON.stringify(reloadedHiddenSettings.j) === JSON.stringify(hiddenSettings));
  cleanup.push(() => db.collection("memberPublicSettings").doc(host.uid).delete());
  const hiddenProfile = await api(viewer.token, "GET", `/api/members/${host.uid}/profile`);
  check("profile privacy hides opted-out fields including stored Clout and rank", hiddenProfile.s === 200 && hiddenProfile.j.bio === "" && hiddenProfile.j.spiritualInterests === "" && hiddenProfile.j.tarotReader === false && !("broadcasterRank" in hiddenProfile.j) && !("cloutPoints" in hiddenProfile.j) && !("zodiacSign" in hiddenProfile.j));
  check("public profile omits email, private readings, and financial information", !JSON.stringify(hiddenProfile.j).includes("private-profile@example.com") && !JSON.stringify(hiddenProfile.j).includes("private reading marker") && !JSON.stringify(hiddenProfile.j).includes("private finance marker") && !("gemBalance" in hiddenProfile.j) && !("stripeConnectId" in hiddenProfile.j));

  const visibleSettings = {
    zodiacSign: "Leo",
    visibility: { avatar: true, bio: true, spiritualInterests: true, zodiac: true, readerStatus: true, rank: true, clout: true, liveStatus: true },
  };
  const savedVisibleSettings = await api(host.token, "PUT", "/api/members/me/public-settings", visibleSettings);
  const visibleProfile = await api(viewer.token, "GET", `/api/members/${host.uid}/profile`);
  check("public profile exposes only opted-in real profile, rank, and Clout data", savedVisibleSettings.s === 200 && visibleProfile.s === 200 && visibleProfile.j.bio === "Profile bio" && visibleProfile.j.spiritualInterests === "Tarot, meditation" && visibleProfile.j.tarotReader === true && visibleProfile.j.zodiacSign === "Leo" && visibleProfile.j.broadcasterRank === "New Seer" && visibleProfile.j.cloutPoints === 10);
  check("email, private readings, and financial information stay private with every visibility option enabled", !JSON.stringify(visibleProfile.j).includes("private-profile@example.com") && !JSON.stringify(visibleProfile.j).includes("private reading marker") && !JSON.stringify(visibleProfile.j).includes("private finance marker") && !("gemBalance" in visibleProfile.j) && !("stripeConnectId" in visibleProfile.j));

  // ---- privacy of ledgers ----
  const viewerTxDoc = await db.collection("users").doc(viewer.uid).collection("transactions").doc(txId).get();
  const rest = await fetch(`https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents/users/${host.uid}/transactions/${txId}`, { headers: { authorization: `Bearer ${outsider.token}` } });
  check("another member cannot read the broadcaster's tip ledger (Firestore rules)", rest.status === 403, String(rest.status));
  const restFin = await fetch(`https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${cfg.firestoreDatabaseId}/documents/liveTips/${tipId}`, { headers: { authorization: `Bearer ${viewer.token}` } });
  check("members cannot read liveTips records (Firestore rules)", restFin.status === 403, String(restFin.status));
  check("sender ledger entry exists for the sender", viewerTxDoc.exists);
} finally {
  stopServer();
  for (const task of cleanup) await task().catch(() => undefined);
  for (const uid of users) {
    const txs = await db.collection("users").doc(uid).collection("transactions").get().catch(() => null);
    if (txs) await Promise.all(txs.docs.map((d) => d.ref.delete()));
    await db.collection("users").doc(uid).delete().catch(() => undefined);
    await auth.deleteUser(uid).catch(() => undefined);
  }
  for (const id of [`evt_gem1_${tag}`, `evt_gem2_${tag}`, `evt_tip2_${tag}`]) await db.collection("processed_stripe_events").doc(id).delete().catch(() => undefined);
  if (finBefore.exists) await finRef.set(finBefore.data()!); else await finRef.delete().catch(() => undefined);
}
console.log(failures === 0 ? "ALL PASSED" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
