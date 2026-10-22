import { useEffect, useState } from "react";
import { EMAIL_CONSENT_WORDING } from "../lib/emailConsent";
import { emailPreferenceRequest } from "../lib/emailPreference";

export default function EmailPreference({ uid }: { uid: string }) {
  const [choice, setChoice] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setChoice(null);
    emailPreferenceRequest().then((data) => { if (active) setChoice(data.consented); })
      .catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Could not load email preference."); });
    return () => { active = false; };
  }, [uid, reload]);
  const save = async () => {
    if (choice === null) return;
    setBusy(true); setMessage("");
    try {
      const result = await emailPreferenceRequest({ consented: choice });
      setChoice(result.consented); setMessage("Email preference saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save email preference.");
    } finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4">
    <h3 className="text-sm font-bold text-white">Email contact preference</h3>
    <label className="flex items-start gap-2 text-xs text-slate-300">
      <input type="checkbox" checked={choice === true} disabled={choice === null || busy} onChange={(event) => setChoice(event.target.checked)} />
      <span>{EMAIL_CONSENT_WORDING}</span>
    </label>
    <p className="text-[10px] text-slate-500">This optional permission is separate from account access and required service notices. No emails are sent by this setting.</p>
    {message && <p role="status" className="text-xs text-teal-300">{message}</p>}
    {choice === null ? <button type="button" onClick={() => setReload((value) => value + 1)} className="text-xs text-mystic-gold">Retry loading preference</button> :
      <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg border border-mystic-gold/40 px-3 py-2 text-xs text-mystic-gold disabled:opacity-50">Save email preference</button>}
  </section>;
}
