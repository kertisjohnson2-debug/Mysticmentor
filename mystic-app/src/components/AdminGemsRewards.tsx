import { useEffect, useState } from "react";
import { adminFetch } from "../lib/adminAccess";
import AdminGemMetrics from "./AdminGemMetrics";

type Member = {
  uid: string; displayName?: string; email?: string; role?: string; suspended?: boolean; banned?: boolean;
  gemBalance?: unknown; lifetimeGemsReceived?: unknown;
};
type Page = { members: Member[]; nextCursor: string | null };
const buttonClass = "min-h-11 touch-manipulation rounded-lg border border-mystic-gold/40 px-3 py-2 text-xs text-mystic-gold disabled:opacity-50";

export default function AdminGemsRewards() {
  const [page, setPage] = useState<Page | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [search, setSearch] = useState("");
  const [searchBy, setSearchBy] = useState("email");
  const [query, setQuery] = useState({ search: "", searchBy: "email" });
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setPage(null); setError("");
    const params = new URLSearchParams(query);
    if (cursor) params.set("after", cursor);
    adminFetch<Page>(`/api/admin/members?${params}`)
      .then((value) => { if (active) setPage(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load Gem records."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, query, refresh]);
  return <section className="space-y-4 text-left text-xs text-slate-300">
    <h3 className="text-sm font-bold text-white">Gems & Rewards</h3>
    <p>Read-only account profile records, up to 50 per page. Auth-only accounts without profiles have no wallet record here. Search exact profile email or case-sensitive name prefix.</p>
    <div className="space-y-2 rounded-xl border border-mystic-gold/30 p-3">
      <h4 className="font-semibold text-white">Admin awards unavailable</h4>
      <p>No supported Admin award endpoint or promotional-award ledger exists. Awards require a reviewed Admin/PIN-authorized, atomic, audited and idempotent server flow that records promotional origin separately from purchases. No Gems can be awarded from this section.</p>
    </div>
    <p className="text-slate-400">Spendable balance is not qualifying gift income or cash. Rank uses only the existing lifetime qualifying live-gift total; a missing lifetime field means no qualifying gifts yet under the existing rules. Invalid balances/totals are unavailable, not silently reset. Purchased-versus-promotional breakdown and Admin award history are not available. Cash tips and payouts remain in Financials.</p>
    <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); setCursor(null); setPrevious([]); setQuery({ search: search.trim(), searchBy }); }}>
      <label>Search by <select value={searchBy} onChange={(event) => setSearchBy(event.target.value)} className="bg-[#120a26] p-2"><option value="email">Profile email</option><option value="displayName">Name prefix</option></select></label>
      <input aria-label="Gem account search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 rounded-lg bg-[#120a26] p-2 text-white" />
      <button type="submit" className={buttonClass}>Search</button>
    </form>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {loading && <p role="status">Loading Gem records...</p>}
    {!loading && page?.members.length === 0 && <p>No account profiles matched. No balances or rewards have been created.</p>}
    {page?.members.map((member) => <article key={member.uid} className="space-y-3 rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4">
      <h4 className="font-bold text-white">{member.displayName || "Unnamed member"}</h4>
      <p className="break-all">{member.email || "No email recorded"} · UID: {member.uid}</p>
      <p>Role: {member.role || "member"} · {member.banned ? "Banned" : member.suspended ? "Suspended" : "No recorded restriction"}{member.banned && member.suspended ? " (also suspended)" : ""}</p>
      <AdminGemMetrics gemBalance={member.gemBalance} lifetimeGemsReceived={member.lifetimeGemsReceived} />
    </article>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={loading || previous.length === 0} onClick={() => { setCursor(previous[previous.length - 1]); setPrevious((items) => items.slice(0, -1)); }} className={buttonClass}>Previous</button>
      <button type="button" disabled={loading || !page?.nextCursor} onClick={() => { if (page?.nextCursor) { setPrevious((items) => [...items, cursor]); setCursor(page.nextCursor); } }} className={buttonClass}>Next</button>
      <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)} className={buttonClass}>Refresh</button>
    </div>
  </section>;
}
