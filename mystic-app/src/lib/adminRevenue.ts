export const REVENUE_LIMITATIONS = [
  { label: "Total platform revenue", reason: "Existing aggregates include sandbox activity. Ledger records do not consistently identify live versus test payments or fee/refund attribution." },
  { label: "Today's platform revenue", reason: "No reliable live-only platform earnings source or complete net-revenue accounting is recorded." },
  { label: "Stripe tip gross volume", reason: "Recorded tips may include simulation/test activity. Gross tips are not platform earnings." },
  { label: "Platform fees retained", reason: "Recorded platform fees are before processing fees and refunds; live-only retained totals are not verifiable." },
  { label: "Broadcaster payouts", reason: "Recipient-share allocations are not proof of a Stripe transfer or settled bank payout." },
  { label: "Refund total", reason: "Refund records are cumulative charge snapshots without consistent currency or allocation to platform earnings." },
  { label: "Payment-processing fees", reason: "Stripe balance-transaction processing fees are not stored in the financial ledger." },
  { label: "Real-money Gem purchase revenue", reason: "Gem purchase records lack consistent live/test markers. Gross purchase amounts are not net revenue." },
  { label: "Subscription revenue", reason: "No verified subscription revenue source is implemented." },
  { label: "Affiliate income", reason: "No verified affiliate income records are implemented." }
] as const;

export type RevenueRecord = {
  id: string; type: string | null; status: string | null; createdAt: string | null;
  amount: number | null; platformFee: number | null; recipientShare: number | null;
  currency: string | null; source: string;
};
const money = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
export function revenueRecord(id: string, data: Record<string, unknown>): RevenueRecord {
  return {
    id, type: typeof data.type === "string" ? data.type : null,
    status: typeof data.status === "string" ? data.status : null,
    createdAt: typeof data.createdAt === "string" && Number.isFinite(Date.parse(data.createdAt)) ? data.createdAt : null,
    amount: money(data.amount), platformFee: money(data.platformFee), recipientShare: money(data.recipientShare),
    currency: typeof data.currency === "string" && /^[a-zA-Z]{3}$/.test(data.currency) ? data.currency.toUpperCase() : null,
    source: typeof data.stripeSessionId === "string" ? "Stripe session-linked ledger record (live/test unverified)" :
      data.type === "refund" ? "Stored charge refund snapshot (currency/mode unverified)" : "Financial ledger (payment origin unverified)"
  };
}
