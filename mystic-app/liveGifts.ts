import type { Firestore } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { isValidLifetimeGems } from "./src/lib/broadcasterRanks";
import { isLiveSessionActive, LIVE_PAYMENT_STALE_MS } from "./src/lib/liveSessionState";

// Gift costs always come from these server tables, never from the client.
export const GIFT_COSTS: Record<string, number> = { quartz: 5, lotus: 20, chalice: 50, feather: 100, star: 200 };
export const LIVE_GIFT_COSTS: Record<string, number> = { heart: 10, star: 50, rose: 100, crystal: 250, teddy: 500 };

const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const REQUEST_ID = /^[a-zA-Z0-9_-]{8,64}$/;
// Broadcasters heartbeat every 30s (client hides sessions after 90s); 5 minutes also tolerates client clock skew.
export const LIVE_SESSION_STALE_MS = LIVE_PAYMENT_STALE_MS;

export type ReceivedGiftRecord = { id: string; status: unknown; gemsAmount: unknown; createdAt: unknown; viewerName: unknown };

// Itemized and same-day totals from live_gift_received records. Only completed records with a positive whole Gem amount count;
// "today" is the calendar date in the viewer's IANA time zone. Throws RangeError for an invalid time zone.
export function summarizeReceivedGifts(records: ReceivedGiftRecord[], timeZone: string, now: Date = new Date()) {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const todayKey = format.format(now);
  const dateKey = (value: unknown) => {
    const date = typeof value === "string" ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? format.format(date) : null;
  };
  const completed = records
    .filter((item) => item.status === "completed" && Number.isSafeInteger(item.gemsAmount) && (item.gemsAmount as number) > 0)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const totalGemsEarned = completed.reduce((total, item) => total + Number(item.gemsAmount), 0);
  const todayGemsEarned = completed.reduce((total, item) => total + (dateKey(item.createdAt) === todayKey ? Number(item.gemsAmount) : 0), 0);
  return { completed, totalGemsEarned, todayGemsEarned };
}

export class GiftSpendError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type GiftSpendInput = {
  senderUid: string;
  senderIsAnonymous: boolean;
  giftId: unknown;
  recipientId: unknown;
  context: unknown;
  sessionId: unknown;
  requestId: unknown;
};

export type GiftSpendResult = { success: true; newBalance: number; transactionId: string; duplicate?: true };

export function giftCostFor(giftId: unknown, isLiveGift: boolean): number | null {
  const table = isLiveGift ? LIVE_GIFT_COSTS : GIFT_COSTS;
  return typeof giftId === "string" && Object.prototype.hasOwnProperty.call(table, giftId) ? table[giftId] : null;
}

export async function spendGemsOnGift(db: Firestore, input: GiftSpendInput, now = () => Date.now()): Promise<GiftSpendResult> {
  const { senderUid, giftId, recipientId, sessionId, requestId } = input;
  if (!giftId || !recipientId) throw new GiftSpendError(400, "Missing required parameters: giftId, recipientId");
  const isLiveGift = input.context === "live";
  const giftCost = giftCostFor(giftId, isLiveGift);
  if (giftCost === null) throw new GiftSpendError(400, "Invalid gift ID");
  if (isLiveGift && (typeof sessionId !== "string" || !SAFE_ID.test(sessionId) || typeof recipientId !== "string" || !SAFE_ID.test(recipientId))) {
    throw new GiftSpendError(400, "Invalid live gift parameters");
  }
  // Live gifts advance broadcaster rank, so each intentional gift carries one client-generated request ID used for deduplication.
  if (isLiveGift && (typeof requestId !== "string" || !REQUEST_ID.test(requestId))) {
    throw new GiftSpendError(400, "Invalid live gift request ID");
  }
  if (isLiveGift && (recipientId === senderUid || input.senderIsAnonymous)) {
    throw new GiftSpendError(400, "Live gifts must come from a signed-in member to another broadcaster");
  }

  const userRef = db.collection("users").doc(senderUid);
  const transactionId = isLiveGift
    ? `tx_live_${createHash("sha256").update(JSON.stringify([senderUid, requestId])).digest("hex")}`
    : "tx_spend_" + now();
  const createdAt = new Date(now()).toISOString();
  const ledgerRef = userRef.collection("transactions").doc(transactionId);

  return db.runTransaction(async (transaction) => {
    const [userSnap, existingLedger] = await Promise.all([
      transaction.get(userRef),
      isLiveGift ? transaction.get(ledgerRef) : Promise.resolve(null)
    ]);
    if (!userSnap.exists) throw new GiftSpendError(400, "User document not found in Firestore");
    const uData = userSnap.data() || {};
    const currentBalance = uData.gemBalance === undefined ? 0 : uData.gemBalance;
    if (!isValidLifetimeGems(currentBalance)) throw new GiftSpendError(409, "Sender Gem balance needs review before gifts can be spent");

    // A replayed request returns the original outcome without spending or crediting again.
    if (existingLedger?.exists) {
      const prior = existingLedger.data() || {};
      if (prior.type !== "spend_gift" || prior.status !== "completed" || prior.userId !== senderUid ||
          prior.giftId !== giftId || prior.recipientId !== recipientId || prior.sessionId !== sessionId ||
          prior.gemsAmount !== -giftCost) {
        throw new GiftSpendError(409, "Gift request ID was already used for a different gift");
      }
      return { success: true, newBalance: currentBalance, transactionId, duplicate: true } as GiftSpendResult;
    }

    // Live gifts credit the broadcaster only when the session is genuinely live and owned by the recipient
    const recipientRef = isLiveGift ? db.collection("users").doc(recipientId as string) : null;
    const statsRef = isLiveGift ? db.collection("broadcasterStats").doc(recipientId as string) : null;
    let recipientLifetime = 0;
    let publicLifetime: unknown;
    if (isLiveGift && recipientRef && statsRef) {
      const [sessionSnap, recipientSnap, statsSnap] = await Promise.all([
        transaction.get(db.collection("liveSessions").doc(sessionId as string)),
        transaction.get(recipientRef),
        transaction.get(statsRef)
      ]);
      const session = sessionSnap.data();
      if (!session || session.ownerUid !== recipientId || session.status !== "live") {
        throw new GiftSpendError(400, "Live session is not active for this broadcaster");
      }
      // Abandoned broadcasts keep status "live"; only a session with a recent heartbeat may earn rank.
      if (!isLiveSessionActive(session, now(), LIVE_SESSION_STALE_MS)) {
        throw new GiftSpendError(400, "Live session is no longer active for this broadcaster");
      }
      if (!recipientSnap.exists) throw new GiftSpendError(400, "Recipient User document not found in Firestore");
      const stored = recipientSnap.data()?.lifetimeGemsReceived;
      // A never-credited broadcaster starts at 0; a malformed stored total is never silently reset.
      if (stored !== undefined && !isValidLifetimeGems(stored)) {
        throw new GiftSpendError(409, "Broadcaster lifetime Gem total needs review before more gifts can be credited");
      }
      recipientLifetime = stored ?? 0;
      publicLifetime = statsSnap.data()?.lifetimeGemsReceived;
      if (publicLifetime !== undefined && !isValidLifetimeGems(publicLifetime)) {
        throw new GiftSpendError(409, "Public broadcaster Gem total needs review before more gifts can be credited");
      }
    }

    if (currentBalance < giftCost) throw new GiftSpendError(400, "Insufficient gem balance in database");
    const newBalance = currentBalance - giftCost;

    // 1. Deduct gems securely exactly once inside the atomic transaction
    transaction.update(userRef, { gemBalance: newBalance, updatedAt: createdAt });

    // 1b. Credit the authoritative lifetime total (users) and refresh the public copy in the same transaction
    if (isLiveGift && recipientRef && statsRef) {
      const lifetimeGemsReceived = recipientLifetime + giftCost;
      if (!Number.isSafeInteger(lifetimeGemsReceived)) throw new GiftSpendError(409, "Broadcaster lifetime Gem total needs review before more gifts can be credited");
      transaction.update(recipientRef, { lifetimeGemsReceived });
      if ((publicLifetime === undefined && recipientLifetime !== 0) ||
          (isValidLifetimeGems(publicLifetime) && publicLifetime !== recipientLifetime)) {
        // Historical differences require reconciliation approval, not an implicit repair during a new gift.
        console.warn(`[Broadcaster Rank] Public total for ${recipientId} differs from the authoritative total; left unchanged for review.`);
        transaction.set(statsRef, { updatedAt: now() }, { merge: true });
      } else {
        transaction.set(statsRef, { lifetimeGemsReceived, updatedAt: now() }, { merge: true });
      }
      const recipientTxRef = recipientRef.collection("transactions").doc(transactionId);
      transaction.set(recipientTxRef, {
        id: transactionId,
        type: "live_gift_received",
        viewerUid: senderUid,
        viewerName: String(uData.displayName || "Viewer").slice(0, 100),
        gemsAmount: giftCost,
        giftId,
        sessionId,
        createdAt,
        status: "completed",
      });
    }

    // 2. Record immutable transaction safely in User's subcollection ledger
    transaction.set(ledgerRef, {
      id: transactionId,
      userId: senderUid,
      type: "spend_gift",
      gemsAmount: -giftCost,
      giftId,
      ...(isLiveGift ? { recipientId, sessionId } : {}),
      description: `Spent ${giftCost} Gems on ${giftId} virtual gift`,
      createdAt,
      status: "completed",
    });

    // 3. Record in Global Financial Records as ledger
    transaction.set(db.collection("financial_records").doc(transactionId), {
      id: transactionId,
      type: "spend_gift",
      userId: senderUid,
      gemsAmount: giftCost,
      giftId,
      status: "completed",
      createdAt,
    });

    return { success: true, newBalance, transactionId } as GiftSpendResult;
  });
}
