import { useEffect, useState, type FormEvent } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import {
  changeAdminPasscode, loadAdminAccessStatus, resetAdminPasscode, revokeAdminAccess,
  setupAdminPin, verifyAdminPasscode, type AdminSessionInfo
} from "../lib/adminAccess";

const inputClass = "w-full rounded-lg border border-[#2c1654] bg-[#070412] px-3 py-3 text-center text-slate-100 outline-none focus:border-mystic-gold";
const buttonClass = "min-h-11 w-full rounded-lg bg-mystic-gold px-4 py-3 text-xs font-bold uppercase text-[#070412] disabled:opacity-50";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Administrator request failed.";
const validPin = (pin: string) => /^[0-9]{4}$/.test(pin);

function PinInput({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <input type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} autoComplete="off" value={value}
    onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ""))} placeholder={label} aria-label={label} className={inputClass} required />;
}

function Remember({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-start gap-2 text-left text-xs text-slate-300">
    <input type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} className="accent-[#f3c65f]" />
    <span>Remember this device<span className="block text-[10px] text-slate-500">Use only on a private device. Access expires or can be revoked.</span></span>
  </label>;
}

export default function AdminAccessGate({ onVerified, onCancel }: { onVerified: (session: AdminSessionInfo) => void; onCancel: () => void }) {
  const [mode, setMode] = useState<"loading" | "verify" | "setup" | "reset" | "error">("loading");
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadAdminAccessStatus().then((status) => {
      if (cancelled) return;
      if (status.session) onVerified(status.session);
      else setMode(status.passcodeConfigured ? "verify" : "setup");
    }).catch((reason) => { if (!cancelled) { setError(errorText(reason)); setMode("error"); } });
    return () => { cancelled = true; };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!validPin(pin) || (mode !== "verify" && confirmation !== pin)) {
      setError("Enter four numeric digits and make sure the PINs match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const session = mode === "verify" ? await verifyAdminPasscode(pin, remember)
        : mode === "setup" ? await setupAdminPin(pin, remember) : await resetAdminPasscode(accountPassword, pin, remember);
      setPin("");
      setConfirmation("");
      setAccountPassword("");
      onVerified(session);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  };

  return <section aria-labelledby="admin-access-title" className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center py-6">
    <div className="space-y-4 rounded-2xl border-2 border-mystic-gold/60 bg-gradient-to-b from-[#1c103a] to-[#070412] p-6 text-center">
      <Lock className="mx-auto h-8 w-8 text-mystic-gold" />
      <h2 id="admin-access-title" className="font-display text-lg text-white">Admin Access</h2>
      <p className="text-xs text-slate-300">{mode === "setup" ? "Create a four-digit Admin PIN using your verified administrator session."
        : mode === "reset" ? "Recovery only: confirm your account password to replace the PIN and invalidate every remembered device."
          : "Enter your four-digit Admin PIN."}</p>
      {mode === "loading" ? <p role="status" className="text-xs text-slate-400">Checking access...</p> : mode !== "error" && (
        <form onSubmit={(event) => void submit(event)} className="space-y-3">
          {mode === "reset" && <input type="password" autoComplete="current-password" required value={accountPassword}
            onChange={(event) => setAccountPassword(event.target.value)} placeholder="Account password (recovery only)" aria-label="Account password" className={inputClass} />}
          <PinInput value={pin} onChange={setPin} label={mode === "verify" ? "Admin PIN" : "New four-digit PIN"} />
          {mode !== "verify" && <PinInput value={confirmation} onChange={setConfirmation} label="Confirm PIN" />}
          <Remember value={remember} onChange={setRemember} />
          <button disabled={busy} className={buttonClass}>{busy ? "Verifying..." : mode === "verify" ? "Unlock Admin" : mode === "setup" ? "Create PIN" : "Reset PIN"}</button>
          {mode === "verify" && <button type="button" onClick={() => { setPin(""); setError(""); setMode("reset"); }} className="min-h-10 text-xs text-slate-400 underline">Forgot PIN?</button>}
          {mode === "reset" && <button type="button" onClick={() => { setError(""); setPin(""); setMode("verify"); }} className="min-h-10 text-xs text-slate-400 underline">Back to PIN</button>}
        </form>
      )}
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <button onClick={onCancel} className="min-h-11 w-full rounded-lg border border-white/20 text-xs text-slate-200">Back to Member</button>
    </div>
  </section>;
}

export function AdminSecurityPanel({ session, onSessionChanged, onRevoked }: { session: AdminSessionInfo | null; onSessionChanged: (session: AdminSessionInfo) => void; onRevoked: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [remember, setRemember] = useState(session?.remember ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const change = async (event: FormEvent) => {
    event.preventDefault();
    if (!validPin(next) || confirmation !== next) return setError("Enter matching four-digit PINs.");
    setBusy(true); setError(""); setMessage("");
    try {
      onSessionChanged(await changeAdminPasscode(current, next, remember));
      setCurrent(""); setNext(""); setConfirmation("");
      setMessage("PIN changed. Every previous admin session is now invalid.");
    } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!confirm("Revoke all remembered sessions for your administrator account?")) return;
    setBusy(true); setError("");
    try { await revokeAdminAccess("all"); onRevoked(); } catch (reason) { setError(errorText(reason)); } finally { setBusy(false); }
  };
  return <div className="space-y-4 rounded-xl border border-teal-400/30 bg-[#0d071f] p-4">
    <h3 className="flex items-center gap-2 text-sm text-white"><ShieldCheck className="h-4 w-4 text-teal-300" /> Admin PIN & Devices</h3>
    <p className="text-xs text-slate-400">{session ? `Session expires ${new Date(session.expiresAt).toLocaleString()}` : "Session details unavailable."}</p>
    <form onSubmit={(event) => void change(event)} className="space-y-3">
      <PinInput value={current} onChange={setCurrent} label="Current PIN" />
      <PinInput value={next} onChange={setNext} label="New four-digit PIN" />
      <PinInput value={confirmation} onChange={setConfirmation} label="Confirm PIN" />
      <Remember value={remember} onChange={setRemember} />
      <button disabled={busy} className={buttonClass}>Change PIN</button>
    </form>
    <button disabled={busy} onClick={() => void revoke()} className="min-h-11 rounded-lg border border-red-400/40 px-4 text-xs text-red-300">Revoke my remembered devices</button>
    {message && <p role="status" className="text-xs text-teal-300">{message}</p>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
  </div>;
}
