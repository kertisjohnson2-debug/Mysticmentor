import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type Stripe from "stripe";

export type TipCheck = { name: string; ok: boolean; detail?: string };
export type TipVerification = {
  tipId: string;
  appStatus: unknown;
  checks: TipCheck[];
  verified: boolean;
  event: Stripe.Event | null;
  ids: { checkoutSessionId?: string; paymentIntentId?: string; chargeId?: string; transferId?: string; applicationFeeId?: string; eventId?: string };
  amounts: { amountCents?: number; applicationFeeCents?: number; transferCents?: number };
};

type StripeReader = Pick<Stripe, "checkout" | "paymentIntents" | "transfers" | "applicationFees" | "events">;

// Read-only verification of a stored live tip against Stripe. A tip is only eligible for recording when every check passes
// and Stripe's own checkout.session.completed event for that session is found; nothing is inferred or fabricated.
export async function verifyPaidLiveTip(db: Firestore, stripe: StripeReader, tipId: string, liveMode: boolean): Promise<TipVerification> {
  const result: TipVerification = { tipId, appStatus: undefined, checks: [], verified: false, event: null, ids: {}, amounts: {} };
  const check = (name: string, ok: boolean, detail?: string) => { result.checks.push({ name, ok, ...(detail ? { detail } : {}) }); return ok; };

  if (!check("tip id format", /^[a-f0-9]{32}$/.test(tipId))) return result;
  const tip = (await db.collection("liveTips").doc(tipId).get()).data();
  if (!check("tip record exists", Boolean(tip)) || !tip) return result;
  result.appStatus = tip.status;
  if (!check("tip has a Checkout Session", typeof tip.stripeSessionId === "string")) return result;

  const session = await stripe.checkout.sessions.retrieve(tip.stripeSessionId);
  result.ids.checkoutSessionId = session.id;
  result.amounts.amountCents = session.amount_total ?? undefined;
  check("environment matches the configured key (test vs live)", session.livemode === liveMode, `livemode=${session.livemode}`);
  check("session is a live_tip for this tip", session.metadata?.type === "live_tip" && session.metadata?.tipId === tipId);
  check("session is complete and paid", session.status === "complete" && session.payment_status === "paid", `${session.status}/${session.payment_status}`);
  check("amount and currency match the stored tip", session.amount_total === tip.amountCents && session.currency === "usd", `${session.amount_total} ${session.currency}`);
  if (!check("session has a PaymentIntent", typeof session.payment_intent === "string")) return result;

  const intent = await stripe.paymentIntents.retrieve(session.payment_intent as string, { expand: ["latest_charge"] });
  result.ids.paymentIntentId = intent.id;
  check("PaymentIntent succeeded", intent.status === "succeeded", intent.status);
  check("application fee equals the stored platform fee", intent.application_fee_amount === tip.platformFeeCents, `${intent.application_fee_amount}`);
  check("destination equals the stored broadcaster account", typeof tip.destinationAccount === "string" && intent.transfer_data?.destination === tip.destinationAccount);
  const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? intent.latest_charge : null;
  result.ids.chargeId = charge?.id;
  check("charge succeeded", charge?.status === "succeeded", charge?.status);

  const transferId = typeof charge?.transfer === "string" ? charge.transfer : charge?.transfer?.id;
  if (check("connected-account transfer exists", Boolean(transferId)) && transferId) {
    const transfer = await stripe.transfers.retrieve(transferId);
    result.ids.transferId = transfer.id;
    result.amounts.transferCents = transfer.amount;
    check("transfer went to the stored broadcaster account", transfer.destination === tip.destinationAccount);
  }
  const feeId = typeof charge?.application_fee === "string" ? charge.application_fee : charge?.application_fee?.id;
  if (check("platform application fee exists", Boolean(feeId)) && feeId) {
    const fee = await stripe.applicationFees.retrieve(feeId);
    result.ids.applicationFeeId = fee.id;
    result.amounts.applicationFeeCents = fee.amount;
    check("collected application fee equals the stored platform fee", fee.amount === tip.platformFeeCents, `${fee.amount}`);
  }

  for await (const event of stripe.events.list({ type: "checkout.session.completed", created: { gte: session.created - 60 }, limit: 100 })) {
    if ((event.data.object as { id?: string }).id === session.id) { result.event = event; break; }
  }
  result.ids.eventId = result.event?.id;
  check("Stripe's checkout.session.completed event exists", Boolean(result.event));
  result.verified = result.checks.every((item) => item.ok);
  return result;
}

// Records a livestream tip only for a verified, fully paid session that matches the server-stored pending tip. Idempotent.
export async function confirmLiveTipIn(db: Firestore, event: Stripe.Event, session: any) {
  const tipId = session.metadata?.tipId;
  if (typeof tipId !== "string" || !/^[a-f0-9]{32}$/.test(tipId)) throw new Error("[Live Tip] Invalid tip id.");
  if (session.payment_status !== "paid") return;

  await db.runTransaction(async (transaction) => {
    const eventLogRef = db.collection("processed_stripe_events").doc(event.id);
    const tipRef = db.collection("liveTips").doc(tipId);
    const finRef = db.collection("admin_settings").doc("financials");
    const [eventLog, tipSnap, finSnap] = await Promise.all([transaction.get(eventLogRef), transaction.get(tipRef), transaction.get(finRef)]);
    if (eventLog.exists) return;
    const tip = tipSnap.data();
    if (!tip) throw new Error("[Live Tip] Unknown tip.");
    if (tip.status === "completed") { transaction.set(eventLogRef, { eventId: event.id, type: event.type, processedAt: new Date().toISOString() }); return; }
    if (tip.stripeSessionId !== session.id || session.amount_total !== tip.amountCents || session.currency !== "usd") {
      throw new Error("[Live Tip] Paid session does not match the stored tip.");
    }
    const recipientRef = db.collection("users").doc(tip.recipientUid);
    const recipientSnap = await transaction.get(recipientRef);

    const now = new Date().toISOString();
    const dollars = tip.amountCents / 100;
    const platformFee = tip.platformFeeCents / 100;
    const recipientShare = tip.recipientShareCents / 100;
    const txId = `tx_tip_${tipId}`;
    const shared = { recipientId: tip.recipientUid, gemsAmount: 0, cashAmount: dollars, platformFee, recipientShare, stripeSessionId: session.id, createdAt: now, status: "completed" };

    transaction.set(eventLogRef, { eventId: event.id, type: event.type, processedAt: now });
    transaction.update(tipRef, { status: "completed", paidAt: now, paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : null });
    transaction.set(db.collection("users").doc(tip.senderUid).collection("transactions").doc(txId), { id: txId, userId: tip.senderUid, type: "tip", description: `Cash tip of $${dollars.toFixed(2)} sent to broadcaster`, ...shared });
    transaction.set(recipientRef.collection("transactions").doc(txId), { id: txId, userId: tip.senderUid, type: "tip_received", description: `Cash tip of $${dollars.toFixed(2)} received from viewer`, ...shared });
    if (recipientSnap.exists) transaction.update(recipientRef, { cloutPoints: FieldValue.increment(Math.floor(dollars)), updatedAt: now });
    transaction.set(db.collection("financial_records").doc(txId), { id: txId, type: "tip", senderId: tip.senderUid, recipientId: tip.recipientUid, amount: dollars, platformFee, recipientShare, stripeSessionId: session.id, status: "completed", createdAt: now });
    const fData = finSnap.data() || {};
    transaction.set(finRef, {
      totalGrossVolume: (fData.totalGrossVolume || 0) + dollars,
      totalPlatformRevenue: (fData.totalPlatformRevenue || 0) + platformFee,
      totalTransfers: (fData.totalTransfers || 0) + recipientShare,
      purchaseCount: (fData.purchaseCount || 0) + 1,
      updatedAt: now
    }, { merge: true });
  });
}
