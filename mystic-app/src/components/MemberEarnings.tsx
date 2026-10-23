import { CircleDollarSign, Gem, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { auth } from "../firebase";
import PaymentsPayouts from "./PaymentsPayouts";

type CashTips = { count: number; grossCents: number; recordedShareCents: number; unverifiedCount: number; pending?: { count: number; grossCents: number } };
type Earnings = {
  totalGemsEarned: number;
  todayGemsEarned: number;
  lifetimeGemsEarned: number | null;
  cashTips?: CashTips;
  transactions: { id: string; date: unknown; viewerName: string; gemsAmount: number }[];
};

type Props = { uid: string; canReceivePayouts: boolean; returnedFromStripe: boolean };

const usd = (cents: number) => (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
const gems = (value: number | null) => (value === null ? "Unavailable" : value.toLocaleString());

// One place for broadcaster earnings: virtual gift Gems and real-money tips are kept visibly separate.
export default function MemberEarnings({ uid, canReceivePayouts, returnedFromStripe }: Props) {
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "restricted" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = auth.currentUser;
      if (!user || user.isAnonymous || user.uid !== uid) {
        if (!cancelled) setState("error");
        return;
      }
      try {
        const token = await user.getIdToken();
        const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const response = await fetch(`/api/live/earnings?timeZone=${encodeURIComponent(timeZone)}`, { headers: { Authorization: `Bearer ${token}` } });
        if (cancelled) return;
        if (response.status === 403) return setState("restricted");
        if (!response.ok) return setState("error");
        setEarnings(await response.json());
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const tips = earnings?.cashTips;
  const legacyGap = earnings && earnings.lifetimeGemsEarned !== null && earnings.lifetimeGemsEarned !== earnings.totalGemsEarned;

  return (
    <section aria-labelledby="member-earnings-title" className="space-y-4 rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#120a28]/95 to-[#0d2a21]/90 p-4 text-left sm:p-5">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300">Private to you</p>
        <h2 id="member-earnings-title" className="font-display text-lg font-semibold text-white">Earnings &amp; Payouts</h2>
      </header>

      {state === "loading" && <div role="status" className="flex items-center gap-2 text-sm text-slate-300"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Loading earnings…</div>}
      {state === "restricted" && <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">Gift and tip earnings are available to approved readers.</p>}
      {state === "error" && <p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-950/20 px-3 py-2 text-xs text-rose-200">Earnings could not be loaded right now.</p>}

      {state === "ready" && earnings && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-xl border border-violet-300/20 bg-black/25 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-violet-100"><Gem className="h-4 w-4 text-mystic-gold" aria-hidden="true" />Live gift Gems <span className="text-[10px] font-normal text-slate-400">(virtual)</span></h3>
            <dl className="grid grid-cols-3 gap-2 text-center">
              {([
                ["Itemized total", earnings.totalGemsEarned],
                ["Today", earnings.todayGemsEarned],
                ["Lifetime", earnings.lifetimeGemsEarned],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-mystic-gold/20 bg-[#1d123a]/60 px-2 py-2">
                  <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="font-display text-lg tabular-nums text-mystic-gold">{gems(value)}</dd>
                </div>
              ))}
            </dl>
            {legacyGap && <p className="text-[10px] leading-relaxed text-slate-500">Lifetime includes earlier gift totals that predate itemized gift history. That difference is preserved as recorded and not yet reconciled.</p>}
            <details className="rounded-lg border border-white/10 bg-black/20 text-xs">
              <summary className="cursor-pointer px-3 py-2 text-slate-300">Gift history ({earnings.transactions.length})</summary>
              {earnings.transactions.length === 0 ? <p className="px-3 pb-3 text-slate-500">No itemized gifts yet.</p> : (
                <ul className="max-h-48 divide-y divide-white/5 overflow-y-auto px-3 pb-2">
                  {earnings.transactions.map((item) => {
                    const date = typeof item.date === "string" ? new Date(item.date) : null;
                    return <li key={item.id} className="flex justify-between gap-2 py-1.5"><span className="truncate text-slate-300">{item.viewerName}{date && Number.isFinite(date.getTime()) ? <span className="ml-2 text-slate-500">{date.toLocaleDateString()}</span> : null}</span><span className="tabular-nums text-mystic-gold">{item.gemsAmount.toLocaleString()} Gems</span></li>;
                  })}
                </ul>
              )}
            </details>
          </div>

          <div className="space-y-3 rounded-xl border border-teal-300/20 bg-black/25 p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-teal-100"><CircleDollarSign className="h-4 w-4 text-teal-300" aria-hidden="true" />Cash tips <span className="text-[10px] font-normal text-slate-400">(USD via Stripe)</span></h3>
            {tips ? (
              <dl className="grid grid-cols-3 gap-2 text-center">
                {([
                  ["Tips", tips.count.toLocaleString()],
                  ["Gross", usd(tips.grossCents)],
                  ["Your share", usd(tips.recordedShareCents)],
                ] as const).map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-teal-300/20 bg-teal-950/30 px-2 py-2">
                    <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className="font-display text-lg tabular-nums text-teal-100">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : <p className="text-xs text-slate-500">Cash tip totals are unavailable.</p>}
            {tips && tips.unverifiedCount > 0 && <p className="text-[10px] text-amber-200/80">{tips.unverifiedCount} tip record(s) could not be verified and are excluded.</p>}
            {tips?.pending && tips.pending.count > 0 && <p className="text-[10px] text-amber-200/80">{tips.pending.count} tip checkout(s) totalling {usd(tips.pending.grossCents)} are awaiting Stripe confirmation and are not included above.</p>}
            <p className="text-[10px] leading-relaxed text-slate-500">"Your share" is the recorded split. Actual payouts and Stripe fees are shown in your Stripe account. Cash tips are separate from Gems and do not affect broadcaster rank.</p>
          </div>
        </div>
      )}

      <PaymentsPayouts canReceivePayouts={canReceivePayouts} returnedFromStripe={returnedFromStripe} />
    </section>
  );
}
