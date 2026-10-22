import { useEffect, useState } from "react";
import { adminFetch } from "../lib/adminAccess";
import { REPORT_REASONS, reportStatusLabel, type AdminReport } from "../lib/communityReports";
import AdminReportReview from "./AdminReportReview";

type Page = { reports: AdminReport[]; nextCursor: string | null };
const buttonClass = "min-h-11 touch-manipulation rounded-lg border border-mystic-gold/40 px-3 py-2 text-xs text-mystic-gold disabled:opacity-50";

export default function AdminReports() {
  const [page, setPage] = useState<Page | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    adminFetch<Page>(`/api/admin/reports${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`)
      .then((data) => { if (active) setPage(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load reports."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, refresh]);
  return <section className="space-y-4 text-left">
    <h3 className="text-sm font-bold text-white">Reports & Alerts</h3>
    <p className="text-xs text-slate-400">Member-submitted community reports, 25 per page in record-ID order. No automated monitoring or account alerts are implemented.</p>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {message && <p role="status" className="text-xs text-teal-300">{message}</p>}
    {loading && page && <p role="status" className="text-xs text-slate-400">Refreshing reports; displayed records may be stale.</p>}
    {loading ? <p role="status" className="text-xs text-slate-400">Loading reports...</p> : page?.reports.length === 0 && <p className="text-xs text-slate-400">No reports on this page.</p>}
    {page?.reports.map((report) => <article key={report.id} className="space-y-2 rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4 text-xs text-slate-300">
      <h4 className="font-bold text-white">{REPORT_REASONS.find((reason) => reason.id === report.reason)?.label || report.reason} · {reportStatusLabel(report.status)}</h4>
      <p className="whitespace-pre-wrap break-words">{report.details || "No additional details supplied."}</p>
      <p className="break-all">Reported {report.targetType}: {report.postId}{report.replyId ? ` / ${report.replyId}` : ""}</p>
      <p className="break-all">Reporter UID: {report.reporterUid || "Unavailable"} · Reported account UID: {report.targetAuthorUid || "Unavailable"}</p>
      <p>Submitted: {report.createdAt || "Time unavailable"}</p>
      {report.reviewedAt && <p className="break-all">Reviewed: {report.reviewedAt} by {report.reviewedBy}</p>}
      <button type="button" disabled={loading || !!selectedId && selectedId !== report.id} aria-expanded={selectedId === report.id} onClick={() => setSelectedId(report.id)} className={buttonClass}>Open report</button>
      {selectedId === report.id && <AdminReportReview key={report.id} id={report.id}
        onSaved={(saved) => { setMessage(saved); setRefresh((value) => value + 1); }} onClose={() => setSelectedId(null)} />}
    </article>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!!selectedId || loading || previous.length === 0} onClick={() => { setPage(null); setCursor(previous[previous.length - 1]); setPrevious((items) => items.slice(0, -1)); }} className={buttonClass}>Previous</button>
      <button type="button" disabled={!!selectedId || loading || !page?.nextCursor} onClick={() => { if (page?.nextCursor) { setPage(null); setPrevious((items) => [...items, cursor]); setCursor(page.nextCursor); } }} className={buttonClass}>Next</button>
      <button type="button" disabled={!!selectedId || loading} onClick={() => setRefresh((value) => value + 1)} className={buttonClass}>Refresh</button>
    </div>
  </section>;
}
