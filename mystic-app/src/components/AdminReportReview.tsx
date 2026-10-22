import { useEffect, useRef, useState } from "react";
import { adminFetch } from "../lib/adminAccess";
import { REPORT_REASONS, REPORT_TRANSITIONS, reportStatusLabel, type AdminReportDetail } from "../lib/communityReports";

const buttonClass = "min-h-11 touch-manipulation rounded-lg border border-mystic-gold/40 px-3 py-2 text-xs text-mystic-gold disabled:opacity-50";
export default function AdminReportReview({ id, onSaved, onClose }: { id: string; onSaved: (message: string) => void; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminReportDetail | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true); setDetail(null); setError("");
    adminFetch<AdminReportDetail>(`/api/admin/reports/${encodeURIComponent(id)}${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`)
      .then((value) => { if (active) setDetail(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load report."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, cursor, refresh]);
  const review = async (status: string) => {
    if (!detail || saving.current) return;
    saving.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await adminFetch("/api/admin/reports/review", { id: detail.report.id, fromStatus: detail.report.status, status });
      const saved = `Report ${detail.report.id} saved as ${reportStatusLabel(status)}.`;
      setMessage(saved); onSaved(saved);
      setCursor(null); setPrevious([]); setRefresh((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save report review.");
    } finally { saving.current = false; setBusy(false); }
  };
  return <section aria-label={`Review report ${id}`} className="space-y-3 rounded-lg border border-mystic-gold/40 p-3">
    <h5 className="font-bold text-white">Report details and review</h5>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {message && <p role="status" className="text-teal-300">{message}</p>}
    {loading && <p role="status">Loading report and review history...</p>}
    {detail && <>
      <p className="break-all">Report ID: {detail.report.id}</p>
      <p>Reason: {REPORT_REASONS.find((reason) => reason.id === detail.report.reason)?.label || detail.report.reason || "Unavailable"}</p>
      <p className="whitespace-pre-wrap break-words">{detail.report.details || "No additional details supplied."}</p>
      <p className="break-all">Reporter UID: {detail.report.reporterUid || "Unavailable"} · Reported account UID: {detail.report.targetAuthorUid || "Unavailable"}</p>
      <p className="break-all">Content: {detail.report.targetType} {detail.report.postId}{detail.report.replyId ? ` / ${detail.report.replyId}` : ""}</p>
      <p>Submitted: {detail.report.createdAt || "Time unavailable"} · Status: {reportStatusLabel(detail.report.status)}</p>
      {detail.report.reviewedAt && <p className="break-all">Last reviewed: {detail.report.reviewedAt} by {detail.report.reviewedBy || "Unavailable"}</p>}
      <div className="flex flex-wrap gap-2">
        {(Object.hasOwn(REPORT_TRANSITIONS, detail.report.status) ? REPORT_TRANSITIONS[detail.report.status] : []).map((status) =>
          <button key={status} type="button" disabled={busy || loading} onClick={() => void review(status)} className={buttonClass}>Mark {reportStatusLabel(status)}</button>)}
      </div>
      {detail.report.status === "open" && <p className="text-slate-400">Move a New report to Under Review before resolving it, or dismiss it.</p>}
      <h6 className="font-semibold text-white">Review history</h6>
      {detail.history.length === 0 && <p>No review actions recorded.</p>}
      <ol className="space-y-2">
        {detail.history.map((event) => <li key={event.id} className="break-words border-t border-white/10 pt-2">
          {reportStatusLabel(event.fromStatus)} → {reportStatusLabel(event.status)} · {event.createdAt || "Time unavailable"} · Reviewer UID: {event.actor || "Unavailable"}
        </li>)}
      </ol>
    </>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || loading || previous.length === 0} onClick={() => { setCursor(previous[previous.length - 1]); setPrevious((items) => items.slice(0, -1)); }} className={buttonClass}>Previous history</button>
      <button type="button" disabled={busy || loading || !detail?.nextCursor} onClick={() => { if (detail?.nextCursor) { setPrevious((items) => [...items, cursor]); setCursor(detail.nextCursor); } }} className={buttonClass}>Older history</button>
      <button type="button" disabled={busy || loading} onClick={() => { setCursor(null); setPrevious([]); setRefresh((value) => value + 1); }} className={buttonClass}>Reload report</button>
      <button type="button" disabled={busy} onClick={onClose} className={buttonClass}>Close report</button>
    </div>
  </section>;
}
