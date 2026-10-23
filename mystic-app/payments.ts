/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure money helpers shared by the server routes and tests. No database or Stripe access here.

export const PLATFORM_FEE_RATE = 0.2;
export const TIP_MIN_CENTS = 100;
export const TIP_MAX_CENTS = 50000;

// Accepts only whole US-dollar-cent integers inside the allowed range; anything else is rejected, never rounded.
export function parseTipAmountCents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  if (value < TIP_MIN_CENTS || value > TIP_MAX_CENTS) return null;
  return value;
}

// The platform keeps 20% (rounded to the nearest cent); the broadcaster receives the remainder, before Stripe's processing costs.
export function calculateTipSplit(amountCents: number): { platformFeeCents: number; recipientShareCents: number } {
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE);
  return { platformFeeCents, recipientShareCents: amountCents - platformFeeCents };
}

export type ReceivedTipSummary = { count: number; grossCents: number; recordedShareCents: number; unverifiedCount: number };

// Summarizes a broadcaster's existing completed tip_received records. Malformed records are counted, never guessed.
export function summarizeReceivedTips(records: { status?: unknown; cashAmount?: unknown; recipientShare?: unknown }[]): ReceivedTipSummary {
  const toCents = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  const summary: ReceivedTipSummary = { count: 0, grossCents: 0, recordedShareCents: 0, unverifiedCount: 0 };
  for (const record of records) {
    if (record.status !== "completed") continue;
    const gross = toCents(record.cashAmount);
    const share = toCents(record.recipientShare);
    if (gross === null || gross === 0 || share === null || share > gross) {
      summary.unverifiedCount += 1;
      continue;
    }
    summary.count += 1;
    summary.grossCents += gross;
    summary.recordedShareCents += share;
  }
  return summary;
}

// Tip Checkouts started for this broadcaster that Stripe has not yet confirmed (unpaid, abandoned, or webhook not processed).
export function summarizePendingTips(records: { status?: unknown; amountCents?: unknown }[]): { count: number; grossCents: number } {
  const pending = records.filter((record) => record.status === "pending" && Number.isSafeInteger(record.amountCents) && (record.amountCents as number) > 0);
  return { count: pending.length, grossCents: pending.reduce((total, record) => total + (record.amountCents as number), 0) };
}

export type ConnectReadiness = { ready: boolean; reason?: string };

// A broadcaster can receive paid tips only when Stripe reports the connected account can receive transfers and pay out.
export function evaluateConnectReadiness(account: {
  object?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  capabilities?: { transfers?: string };
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          payouts?: { status?: string };
          stripe_transfers?: { status?: string };
        };
      };
    };
  };
} | null | undefined): ConnectReadiness {
  if (!account) return { ready: false, reason: "No payout account is linked." };
  if (account.object === "v2.core.account") {
    const recipientCapabilities = account.configuration?.recipient?.capabilities?.stripe_balance;
    if (recipientCapabilities?.stripe_transfers?.status !== "active") {
      return { ready: false, reason: "Transfers are not yet enabled on the payout account." };
    }
    if (recipientCapabilities.payouts?.status !== "active") {
      return { ready: false, reason: "Payouts are not yet enabled on the payout account." };
    }
    return { ready: true };
  }
  if (!account.details_submitted) return { ready: false, reason: "Stripe onboarding is not finished." };
  if (account.capabilities?.transfers !== "active") return { ready: false, reason: "Transfers are not yet enabled on the payout account." };
  if (!account.charges_enabled) return { ready: false, reason: "The payout account cannot accept charges yet." };
  if (!account.payouts_enabled) return { ready: false, reason: "Payouts are not yet enabled on the payout account." };
  return { ready: true };
}
