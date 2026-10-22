import { CircleDollarSign, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { auth } from "../firebase";

type PayoutStatus = { linked: boolean; ready: boolean; reason?: string };

type Props = {
  canReceivePayouts: boolean;
  returnedFromStripe: boolean;
};

// Reuses the existing Stripe routes: payout
// readiness is always read live from Stripe by /api/connect/status for the signed-in member only.
export default function PaymentsPayouts({ canReceivePayouts, returnedFromStripe }: Props) {
  const refreshOnboarding = new URLSearchParams(window.location.search).get("connect") === "refresh";
  const [status, setStatus] = useState<PayoutStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/connect/status", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not read payout status.");
      setStatus(data);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Could not read payout status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canReceivePayouts) void loadStatus();
  }, [canReceivePayouts, loadStatus]);

  const startSetup = async () => {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/create-connect-onboarding", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify(refreshOnboarding ? { refreshOnly: true } : {}) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "Could not start Stripe payout setup.");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Stripe payout setup.");
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="payments-payouts-heading" className="space-y-3 rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#0d2a21]/90 to-[#120a28]/95 p-4 text-left">
      <header className="flex items-center gap-2"><CircleDollarSign className="h-5 w-5 text-mystic-gold" aria-hidden="true" /><div><h2 id="payments-payouts-heading" className="font-display text-base text-white">Payments &amp; Payouts</h2><p className="text-[10px] text-slate-400">Powered by Stripe. Card details are entered on Stripe and never saved here.</p></div></header>
      {canReceivePayouts && (
        <div className="space-y-2 rounded-xl border border-teal-400/25 bg-teal-950/20 p-3 text-xs leading-relaxed text-slate-300">
          <p className="font-semibold text-white">Broadcaster payouts</p>
          {returnedFromStripe && <p role="status" className="text-slate-400">{refreshOnboarding ? "Your Stripe onboarding link expired or is no longer valid. Request a fresh link to resume setup for your existing payout account." : "You returned from Stripe. The status below is read live from Stripe."}</p>}
          {loading ? <p role="status" className="flex items-center gap-2 text-slate-400"><LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />Checking Stripe payout status…</p>
            : error ? <p role="alert" className="text-rose-300">{error}</p>
            : status?.ready ? <p className="text-teal-200">Stripe confirms your payout account is ready to receive tips.</p>
            : status ? <p>Not ready for tips yet. {status.reason}</p> : null}
          <p className="text-[11px] text-slate-500">Buying gems or sending tips does not verify your payout account; only Stripe's own onboarding does.</p>
          <div className="flex flex-wrap gap-2">
            {(refreshOnboarding || !status || !status.ready) && !loading && (
              <button
                type="button"
                onClick={() => void startSetup()}
                disabled={busy}
                className="rounded-lg border border-mystic-gold/40 bg-mystic-gold/10 px-4 py-2 text-xs font-semibold text-mystic-gold disabled:opacity-50"
              >
                {busy ? "Opening Stripe…" : refreshOnboarding ? "Request Fresh Onboarding Link" : status?.linked ? "Resume Setup" : "Set Up Payouts"}
              </button>
            )}
            {!loading && <button type="button" onClick={() => void loadStatus()} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-slate-200">Refresh status</button>}
          </div>
        </div>
      )}
    </section>
  );
}
