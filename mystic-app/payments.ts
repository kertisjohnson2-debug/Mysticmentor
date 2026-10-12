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

export type ConnectReadiness = { ready: boolean; reason?: string };

// A broadcaster can receive paid tips only when Stripe reports the connected account can take charges and pay out.
export function evaluateConnectReadiness(account: { charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean; capabilities?: { transfers?: string } } | null | undefined): ConnectReadiness {
  if (!account) return { ready: false, reason: "No payout account is linked." };
  if (!account.details_submitted) return { ready: false, reason: "Stripe onboarding is not finished." };
  if (account.capabilities?.transfers !== "active") return { ready: false, reason: "Transfers are not yet enabled on the payout account." };
  if (!account.charges_enabled) return { ready: false, reason: "The payout account cannot accept charges yet." };
  if (!account.payouts_enabled) return { ready: false, reason: "Payouts are not yet enabled on the payout account." };
  return { ready: true };
}
