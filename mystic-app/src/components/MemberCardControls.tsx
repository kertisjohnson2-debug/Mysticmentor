import type { AdminMember } from "../lib/adminAccess";

type Member = AdminMember & { hasProfile?: boolean };
type Props = {
  member: Member;
  busy: boolean;
  historyOpen: boolean;
  deletionOpen: boolean;
  onEdit: (member: Member) => void;
  onRestriction: (uid: string, action: "suspend" | "ban", enabled: boolean) => void;
  onHistory: (uid: string) => void;
  onDeletion: (uid: string | null) => void;
};
const buttonClass = "min-h-11 touch-manipulation rounded-lg border border-mystic-gold/40 px-3 py-2 text-xs text-mystic-gold disabled:opacity-50";

export default function MemberCardControls({ member, busy, historyOpen, deletionOpen, onEdit, onRestriction, onHistory, onDeletion }: Props) {
  const protectedAccount = member.role === "admin" || member.email === "kertisjohnson7@gmail.com";
  const restrictionReason = protectedAccount ? "Protected administrator: Suspend, Unsuspend, Ban and Unban are unavailable for this account."
    : member.hasProfile === false ? "No application profile: account restriction actions are unavailable until profile setup is complete."
    : busy ? "A member change is still saving. Account actions will become available when it finishes."
    : null;
  const reasonId = `member-restriction-reason-${member.uid}`;
  return <>
    <button type="button" aria-expanded={historyOpen} onClick={() => onHistory(member.uid)} className={buttonClass}>{historyOpen ? "Hide email preference history" : "View email preference history"}</button>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy || member.hasProfile === false} onClick={() => onEdit(member)} className={buttonClass}>Edit name</button>
      <button type="button" aria-describedby={restrictionReason ? reasonId : undefined} disabled={busy || protectedAccount || member.hasProfile === false} onClick={() => onRestriction(member.uid, "suspend", member.suspended !== true)} className={buttonClass}>{member.suspended ? "Unsuspend" : "Suspend"}</button>
      <button type="button" aria-describedby={restrictionReason ? reasonId : undefined} disabled={busy || protectedAccount || member.hasProfile === false} onClick={() => onRestriction(member.uid, "ban", member.banned !== true)} className={buttonClass}>{member.banned ? "Unban" : "Ban"}</button>
      <button type="button" aria-expanded={deletionOpen} onClick={() => onDeletion(deletionOpen ? null : member.uid)} className={buttonClass}>Why deletion is unavailable</button>
    </div>
    {restrictionReason && <p id={reasonId} className="text-[10px] text-slate-400">{restrictionReason}</p>}
    {busy && <p role="status" className="text-[10px] text-slate-400">Saving a member change. Account actions are temporarily disabled.</p>}
    {deletionOpen && <section aria-label="Account deletion unavailable" className="space-y-2 rounded-lg border border-mystic-gold/40 p-3">
      <p>Deletion unavailable — safe account deletion is not implemented yet.</p>
      <p className="break-all text-[10px] text-slate-400">Account: {member.email || member.displayName || member.uid} · ID: {member.uid}. No account or records will be deleted. Authentication removal, related-record retention, financial history, and recovery safeguards need an approved lifecycle.</p>
      <button type="button" onClick={() => onDeletion(null)} className={buttonClass}>Close deletion explanation</button>
    </section>}
  </>;
}
