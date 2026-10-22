import { useEffect, useRef, useState } from "react";
import { adminFetch, adminMemberAction, type AdminMember } from "../lib/adminAccess";
import type { EmailConsent } from "../lib/emailConsent";
import AdminEmailConsentHistory from "./AdminEmailConsentHistory";
import MemberRestrictionConfirmation from "./MemberRestrictionConfirmation";
import MemberCardControls from "./MemberCardControls";

type Member = AdminMember & { emailConsent: EmailConsent; hasProfile?: boolean; accountDisabled?: boolean; emailVerified?: boolean };
type Page = { members: Member[]; nextCursor: string | null };
const buttonClass = "min-h-11 touch-manipulation rounded-lg border border-mystic-gold/40 px-3 py-2 text-xs text-mystic-gold disabled:opacity-50";

export default function AdminMembers() {
  const [page, setPage] = useState<Page | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [search, setSearch] = useState("");
  const [searchBy, setSearchBy] = useState("email");
  const [query, setQuery] = useState({ search: "", searchBy: "email" });
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState<{ uid: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ uid: string; name: string } | null>(null);
  const mutationInFlight = useRef(false);
  const [pendingAction, setPendingAction] = useState<{ uid: string; action: "suspend" | "ban"; enabled: boolean } | null>(null);
  const [historyUid, setHistoryUid] = useState<string | null>(null);
  const [deletionUid, setDeletionUid] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setPage(null); setError("");
    setEditing(null); setPendingAction(null); setHistoryUid(null);
    setDeletionUid(null);
    setActionError(null);
    const nameSearch = !!query.search && query.searchBy === "displayName";
    const params = new URLSearchParams(nameSearch ? query : query.search ? { email: query.search } : {});
    if (cursor) params.set(nameSearch ? "after" : "pageToken", cursor);
    adminFetch<Page>(`/api/admin/${nameSearch ? "members" : "accounts"}?${params}`).then((data) => { if (active) setPage(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load members."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cursor, query, refresh]);

  const act = async (member: Member, action: "suspend" | "ban") => {
    if (mutationInFlight.current || pendingAction?.uid !== member.uid || pendingAction.action !== action) return;
    const { enabled } = pendingAction;
    mutationInFlight.current = true;
    setBusy(true); setError(""); setActionError(null); setMessage("");
    try {
      await adminMemberAction(action, { uid: member.uid }, enabled);
      setPendingAction(null);
      setMessage(`${member.email || member.uid}: ${action === "ban" ? enabled ? "ban saved" : "ban removed" : enabled ? "suspension saved" : "suspension removed"}. Any other restrictions remain in effect.`);
      setRefresh((value) => value + 1);
    } catch (reason) {
      setActionError({ uid: member.uid, message: `Could not ${enabled ? action : action === "ban" ? "unban" : "unsuspend"} ${member.email || member.uid}: ${reason instanceof Error ? reason.message : "Could not update member."}` });
    }
    finally { mutationInFlight.current = false; setBusy(false); }
  };
  const save = async (uid: string) => {
    if (mutationInFlight.current || editing?.uid !== uid) return;
    const displayName = editing.name.trim();
    mutationInFlight.current = true;
    setBusy(true); setError(""); setActionError(null); setMessage("");
    try {
      await adminFetch("/api/admin/members/edit", { uid, displayName });
      setMessage(`Display name saved as "${displayName}". Reloading the directory; a renamed member may no longer match the current name filter.`);
      setEditing(null); setRefresh((value) => value + 1);
    } catch (reason) {
      setActionError({ uid, message: `Could not save this member's name: ${reason instanceof Error ? reason.message : "Could not edit member."}` });
    }
    finally { mutationInFlight.current = false; setBusy(false); }
  };
  return <section className="space-y-4 text-left">
    <h3 className="text-sm font-bold text-white">Members</h3>
    <p className="text-xs text-slate-400">All Firebase accounts, up to 50 per page. Search email exactly, or use a case-sensitive name prefix to search registered profiles. Accounts without a profile are included in the full directory and email search.</p>
    <form onSubmit={(event) => { event.preventDefault(); if (busy) return; setPendingAction(null); setEditing(null); setHistoryUid(null); setCursor(null); setPrevious([]); setQuery({ search: search.trim(), searchBy }); }} className="flex flex-wrap gap-2">
      <label className="text-xs text-slate-300">Search by <select value={searchBy} onChange={(event) => setSearchBy(event.target.value)} className="bg-[#120a26] p-2"><option value="email">Email</option><option value="displayName">Name prefix</option></select></label>
      <input aria-label="Member search" value={search} maxLength={searchBy === "email" ? 254 : 100} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 rounded-lg bg-[#120a26] p-2 text-xs text-white" />
      <button type="submit" disabled={busy} className={buttonClass}>Search</button>
    </form>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {message && <p role="status" className="text-xs text-teal-300">{message}</p>}
    {loading ? <p role="status" className="text-xs text-slate-400">Loading members...</p> : page?.members.length === 0 && <p className="text-xs text-slate-400">No profiles matched.</p>}
    {page?.members.map((member) => {
      return <article key={member.uid} className="space-y-3 rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4 text-xs text-slate-300">
        <h4 className="font-bold text-white">{member.displayName || "Unnamed member"}</h4>
        <p className="break-all">{member.email || "No email recorded"}</p>
        {typeof member.emailVerified === "boolean" && <p className="text-[10px] text-slate-500">Email verified: {member.emailVerified ? "Yes" : "No"}</p>}
        <p>Role: {member.role || (member.hasProfile === false ? "No profile" : "member")} · Status: {member.banned ? "Banned" : member.suspended ? "Suspended" : "No recorded restriction"}{member.banned && member.suspended ? " (also suspended)" : ""}{member.accountDisabled ? " · Firebase account disabled" : ""}</p>
        {member.hasProfile === false && <p className="text-[10px] text-slate-500">No application profile. Profile actions are unavailable until the member completes profile setup; no data is created here.</p>}
        <p className="break-all text-[10px] text-slate-500">ID: {member.uid}</p>
        <p>Marketing email contact: {member.emailConsent.consented ? "Explicitly opted in" : member.emailConsent.recordedAt ? "Not consented" : "Not recorded — not consented"}</p>
        <p className="text-[10px] text-slate-400">{member.emailConsent.consented ? "Consent recorded" : "Decline/withdrawal recorded"}: {member.emailConsent.recordedAt || "Not recorded"} · Wording version: {member.emailConsent.version || "Not recorded"}</p>
        <MemberCardControls member={member} busy={busy} historyOpen={historyUid === member.uid} deletionOpen={deletionUid === member.uid}
          onHistory={(uid) => setHistoryUid((current) => current === uid ? null : uid)}
          onDeletion={setDeletionUid}
          onEdit={(target) => { setActionError(null); setPendingAction(null); setEditing({ uid: target.uid, name: target.displayName || "" }); }}
          onRestriction={(uid, action, enabled) => { setActionError(null); setEditing(null); setError(""); setPendingAction({ uid, action, enabled }); }} />
        {actionError?.uid === member.uid && <p role="alert" className="text-xs text-red-300">{actionError.message}</p>}
        {historyUid === member.uid && <AdminEmailConsentHistory key={member.uid} uid={member.uid} />}
        {pendingAction?.uid === member.uid && <MemberRestrictionConfirmation action={pendingAction.action} enabled={pendingAction.enabled} memberLabel={member.email || member.uid} busy={busy} onConfirm={() => void act(member, pendingAction.action)} onCancel={() => setPendingAction(null)} />}
        {editing?.uid === member.uid && <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void save(member.uid); }}>
          <input aria-label="Display name" required disabled={busy} maxLength={100} value={editing.name} onChange={(event) => setEditing({ uid: member.uid, name: event.target.value })} className="min-w-0 flex-1 rounded bg-[#070412] p-2" />
          <button disabled={busy} className={buttonClass}>Save name</button>
          <button type="button" disabled={busy} onClick={() => setEditing(null)} className={buttonClass}>Cancel</button>
        </form>}
      </article>;
    })}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || loading || previous.length === 0} onClick={() => { setCursor(previous[previous.length - 1]); setPrevious((items) => items.slice(0, -1)); }} className={buttonClass}>Previous</button>
      <button type="button" disabled={busy || loading || !page?.nextCursor} onClick={() => { if (page?.nextCursor) { setPrevious((items) => [...items, cursor]); setCursor(page.nextCursor); } }} className={buttonClass}>Next</button>
      <button type="button" disabled={busy || loading} onClick={() => setRefresh((value) => value + 1)} className={buttonClass}>Refresh</button>
    </div>
    <p className="text-[10px] text-slate-500">Delete is unavailable until authentication removal, related-record retention, financial history, and recovery safeguards have an approved lifecycle. Staff permissions remain in Staff Roster. Email consent cannot be granted by an administrator.</p>
  </section>;
}
