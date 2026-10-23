import { useEffect, useState } from "react";
import { adminFetch } from "../lib/adminAccess";

type RankedMember = { uid: string; displayName: string | null; lifetimeGemsReceived: number | null; currentRank: string | null };
type RankingPage = { members: RankedMember[]; nextCursor: string | null };
const buttonClass = "min-h-11 touch-manipulation rounded-lg border border-mystic-gold/40 px-3 py-2 text-xs text-mystic-gold disabled:opacity-50";

export default function AdminRankings() {
  const [page, setPage] = useState<RankingPage | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const positionOffset = previous.length * 25;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setPage(null);
    setError("");
    adminFetch<RankingPage>(`/api/admin/rankings${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`)
      .then((result) => { if (active) setPage(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load broadcaster rankings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, refresh]);
  return <section className="space-y-4 text-left text-xs text-slate-300">
    <h3 className="text-sm font-bold text-white">Broadcaster Rankings</h3>
    <p>Rank and order use the existing authoritative lifetime qualifying live-gift Gems total. Spendable balance, cash tips, and payouts do not affect this list. Up to 25 profiles per page.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {loading && <p role="status">Loading rankings...</p>}
    {!loading && page?.members.length === 0 && <p>No profiles with qualifying live-gift Gems were found.</p>}
    {page?.members.map((member, index) => <article key={member.uid} className="flex items-start justify-between gap-3 rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4">
      <div>
        <h4 className="font-bold text-white">{member.displayName || "Unnamed broadcaster"}</h4>
        <p className="break-all text-slate-500">UID: {member.uid}</p>
      </div>
      <dl className="shrink-0 text-right">
        <dt className="text-slate-400">Rank · page position {positionOffset + index + 1}</dt>
        <dd>{member.currentRank || "Unavailable"} · {member.lifetimeGemsReceived?.toLocaleString() ?? "Unavailable"} qualifying Gems</dd>
      </dl>
    </article>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={loading || previous.length === 0} onClick={() => { setCursor(previous[previous.length - 1]); setPrevious((items) => items.slice(0, -1)); }} className={buttonClass}>Previous</button>
      <button type="button" disabled={loading || !page?.nextCursor} onClick={() => { if (page?.nextCursor) { setPrevious((items) => [...items, cursor]); setCursor(page.nextCursor); } }} className={buttonClass}>Next</button>
      <button type="button" disabled={loading} onClick={() => { setCursor(null); setPrevious([]); setRefresh((value) => value + 1); }} className={buttonClass}>Refresh</button>
    </div>
  </section>;
}
