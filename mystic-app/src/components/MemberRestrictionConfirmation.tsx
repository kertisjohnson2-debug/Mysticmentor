type Props = {
  action: "suspend" | "ban";
  enabled: boolean;
  memberLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function MemberRestrictionConfirmation({ action, enabled, memberLabel, busy, onConfirm, onCancel }: Props) {
  const label = action === "ban" ? enabled ? "Ban" : "Unban" : enabled ? "Suspend" : "Unsuspend";
  return <div role="group" aria-label="Confirm account restriction" className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
    <p>{label} {memberLabel}?</p>
    <p className="text-[10px] text-slate-400">{enabled ? "Authenticated account access will be blocked. Existing records will not be deleted." : "Only this restriction will be removed. Any other restriction remains in effect."}</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={onConfirm} className="min-h-11 touch-manipulation rounded-lg border border-amber-400/50 px-3 py-2 text-xs text-amber-200 disabled:opacity-50">{busy ? "Saving..." : `Confirm ${label.toLowerCase()}`}</button>
      <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 touch-manipulation rounded-lg border border-white/20 px-3 py-2 text-xs disabled:opacity-50">Cancel</button>
    </div>
  </div>;
}
