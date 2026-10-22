import { useEffect, useState } from "react";
import { adminFetch } from "../lib/adminAccess";
import type { EmailConsentHistoryPage } from "../lib/emailConsent";

export default function AdminEmailConsentHistory({ uid }: { uid: string }) {
  const [page, setPage] = useState<EmailConsentHistoryPage | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true); setPage(null); setError("");
    adminFetch<EmailConsentHistoryPage>(`/api/admin/members/${encodeURIComponent(uid)}/email-consent${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`)
      .then((data) => { if (active) setPage(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load email preference history."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uid, cursor, refresh]);
  return <section aria-label="Marketing email preference history" className="space-y-2 rounded-lg border border-[#2c1654] bg-[#070412]/60 p-3">
    <h5 className="font-semibold text-white">Marketing email preference history</h5>
    <p className="text-[10px] text-slate-400">Read-only member choices, newest first, up to 25 per page. Necessary account/service notices are separate. Administrators cannot grant marketing permission.</p>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {loading && <p role="status">Loading preference history...</p>}
    {page && <>
      <p>Current: {page.current.consented ? "Explicitly opted in" : "Not consented"} · {page.current.consented ? "Consent recorded" : "Decline/withdrawal recorded"}: {page.current.recordedAt || "Not recorded"}</p>
      {page.history.length === 0 && <p>No preference history recorded. Absence of history is not permission.</p>}
      <ol className="space-y-2">
        {page.history.map((item) => <li key={item.id} className="space-y-1 border-t border-white/10 pt-2">
          <p>{item.consented ? "Opt-in / consent" : "Opt-out / declined or withdrawn"}: {item.recordedAt || "Timestamp unavailable"}</p>
          <p className="text-[10px] text-slate-400">Source: {item.source || "Unknown"} · Version: {item.version || "Unknown"}</p>
          {item.wording && <p className="text-[10px] text-slate-400">Recorded wording: {item.wording}</p>}
        </li>)}
      </ol>
    </>}
    <div className="flex flex-wrap gap-3 text-mystic-gold">
      <button type="button" disabled={loading || previous.length === 0} onClick={() => { setCursor(previous[previous.length - 1]); setPrevious((items) => items.slice(0, -1)); }} className="min-h-11 touch-manipulation disabled:opacity-50">Previous history</button>
      <button type="button" disabled={loading || !page?.nextCursor} onClick={() => { if (page?.nextCursor) { setPrevious((items) => [...items, cursor]); setCursor(page.nextCursor); } }} className="min-h-11 touch-manipulation disabled:opacity-50">Older history</button>
      <button type="button" disabled={loading} onClick={() => { setCursor(null); setPrevious([]); setRefresh((value) => value + 1); }} className="min-h-11 touch-manipulation disabled:opacity-50">Reload history</button>
    </div>
  </section>;
}
