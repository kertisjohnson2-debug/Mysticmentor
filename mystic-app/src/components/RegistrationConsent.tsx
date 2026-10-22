import { EMAIL_CONSENT_WORDING } from "../lib/emailConsent";
import PolicyLinks from "./PolicyLinks";

type Props = { termsAccepted: boolean; onTermsChange: (value: boolean) => void; emailOptIn: boolean; onEmailChange: (value: boolean) => void; disabled?: boolean };
export default function RegistrationConsent({ termsAccepted, onTermsChange, emailOptIn, onEmailChange, disabled = false }: Props) {
  return <div className="space-y-3 text-xs text-slate-300">
    <p>Read before registering: <PolicyLinks newTab />.</p>
    <label className="flex items-start gap-2">
      <input type="checkbox" required checked={termsAccepted} disabled={disabled} onChange={(event) => onTermsChange(event.target.checked)} className="mt-0.5 accent-[#f3c65f]" />
      <span>I accept the Terms of Service and acknowledge the Privacy Policy (required).</span>
    </label>
    <p className="text-[10px] text-slate-400">Account creation and continuing after acceptance signifies agreement to necessary security, account, and service emails when sent. Optional promotional emails are separate below.</p>
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={emailOptIn} disabled={disabled} onChange={(event) => onEmailChange(event.target.checked)} className="mt-0.5 accent-[#f3c65f]" />
      <span>{EMAIL_CONSENT_WORDING} <span className="text-slate-500">(Optional)</span></span>
    </label>
  </div>;
}
