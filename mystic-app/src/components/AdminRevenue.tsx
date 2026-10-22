import { useEffect, useState } from "react";
import { adminFetch } from "../lib/adminAccess";
import type { RevenueRecord } from "../lib/adminRevenue";

type Page = { records: RevenueRecord[]; metrics: { label: string; value: null; reason: string }[]; nextCursor: string | null };
const buttonClass = "min-h-11 touch-manipulation rounded-lg border border-mystic-gold/40 px-3 py-2 text-xs text-mystic-gold disabled:opacity-50";
const amount = (value: number | null, currency: string | null) => value === null ? "Not available" : `${value.toFixed(2)} ${currency || "(currency not recorded)"}`;
export default function AdminRevenue() {
  const [page, setPage] = useState<Page | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setPage(null);
    adminFetch<Page>(`/api/admin/revenue${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`)
      .then((data) => { if (active) setPage(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load revenue records."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, refresh]);
  return <section className="space-y-4 text-left text-xs text-slate-300">
    <h3 className="text-sm font-bold text-white">Revenue</h3>
    <p>Stored financial ledger, not verified live earnings. No Stripe API calls, charges, payouts or reconciliation run here. Existing Financials is unchanged.</p>
    {loading && <p role="status">Loading revenue records...</p>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      {page?.metrics.map((metric) => <div key={metric.label} className="space-y-2 rounded-xl border border-[#2c1654] p-3">
        <h4 className="font-semibold text-white">{metric.label}</h4><p>Not available</p><p className="text-slate-400">{metric.reason}</p>
      </div>)}
    </div>
    <h4 className="font-semibold text-white">Recorded transactions</h4>
    <p>25 records per page, in record-ID order (not date order). Amounts below are stored values, not independently verified cash receipts. No page amounts or overlapping ledgers are summed. Refund amounts are cumulative snapshots per charge.</p>
    {!loading && page?.records.length === 0 && <p>No financial records on this page. This is not evidence of zero revenue.</p>}
    {page?.records.map((record) => <article key={record.id} className="space-y-2 rounded-xl border border-[#2c1654] p-3">
      <h5 className="break-all font-semibold text-white">{record.type || "Unknown type"} · {record.status || "Status unavailable"}</h5>
      <p className="break-all">Ledger ID: {record.id}</p><p>Date: {record.createdAt || "Not available"}</p><p>{record.source}</p>
      <p>Recorded {record.type === "refund" ? "cumulative refund" : "gross amount"}: {amount(record.amount, record.currency)}</p>
      <p>Recorded platform fee (before processing/refunds): {amount(record.platformFee, record.currency)}</p>
      <p>Recorded recipient allocation (not settled payout): {amount(record.recipientShare, record.currency)}</p>
    </article>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={loading || !previous.length} onClick={() => { setCursor(previous[previous.length - 1]); setPrevious((items) => items.slice(0, -1)); }} className={buttonClass}>Previous</button>
      <button type="button" disabled={loading || !page?.nextCursor} onClick={() => { if (page?.nextCursor) { setPrevious((items) => [...items, cursor]); setCursor(page.nextCursor); } }} className={buttonClass}>Next</button>
      <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)} className={buttonClass}>Refresh</button>
    </div>
  </section>;
}
