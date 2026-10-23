import { Crown, LoaderCircle } from "lucide-react";
import { BROADCASTER_RANKS } from "../lib/broadcasterRanks";
import { useBroadcasterRank } from "../lib/useBroadcasterRank";

type Props = { uid: string };

// Broadcaster rank from the shared authoritative source; the same values appear on the public profile and the Live overlay.
export default function MemberProgressWindow({ uid }: Props) {
  const { status, rank } = useBroadcasterRank(uid);
  const percent = rank ? Math.round(rank.rankProgress * 100) : 0;

  return (
    <section aria-labelledby="broadcaster-progress-title" className="relative space-y-4 overflow-hidden rounded-2xl border border-mystic-gold/40 bg-[radial-gradient(circle_at_85%_0%,rgba(139,92,246,0.28),transparent_45%),linear-gradient(150deg,#0d2a21_0%,#120a28_70%)] p-4 text-left shadow-[0_0_24px_rgba(243,198,95,0.06)] sm:p-5">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-mystic-gold/40 bg-mystic-gold/10 text-mystic-gold shadow-[0_0_16px_rgba(243,198,95,0.25)]"><Crown className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300">Live gift progression</p>
          <h2 id="broadcaster-progress-title" className="font-display text-lg font-semibold text-white">Broadcaster Progress &amp; Rank</h2>
        </div>
      </header>

      {status === "loading" ? (
        <div role="status" className="flex min-h-24 items-center justify-center gap-2 text-sm text-slate-300"><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Loading your rank…</div>
      ) : !rank ? (
        <p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-950/20 px-3 py-3 text-sm text-rose-200">Your broadcaster rank could not be loaded right now.</p>
      ) : (
        <>
          <div className="rounded-xl border border-mystic-gold/25 bg-black/25 p-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Current rank</p>
                <strong className="block font-display text-2xl text-mystic-gold drop-shadow-[0_0_10px_rgba(243,198,95,0.35)]">{rank.currentRank.name}</strong>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">Lifetime qualifying gift Gems</p>
                <strong className="font-display text-xl tabular-nums text-white">{rank.lifetimeGemsReceived.toLocaleString()}</strong>
              </div>
            </div>
            <div role="progressbar" aria-label="Progress toward next broadcaster rank" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-teal-300 via-mystic-gold to-[#f6e3a6]" style={{ width: `${rank.rankProgress * 100}%` }} />
            </div>
            <p className="mt-2 flex flex-wrap justify-between gap-1 text-xs text-slate-300">
              <span>{percent}% complete</span>
              <span>{rank.nextRank ? `${rank.gemsToNextRank.toLocaleString()} Gems to ${rank.nextRank.name}` : "Highest rank achieved"}</span>
            </p>
          </div>

          <ol aria-label="Broadcaster rank ladder" className="grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
            {BROADCASTER_RANKS.map((step) => {
              const reached = rank.lifetimeGemsReceived >= step.gems;
              const current = step.name === rank.currentRank.name;
              return (
                <li key={step.name} aria-current={current ? "step" : undefined} className={`rounded-lg border px-2 py-1.5 ${current ? "border-mystic-gold/70 bg-mystic-gold/15 text-mystic-gold" : reached ? "border-teal-300/30 bg-teal-950/30 text-teal-100" : "border-white/10 bg-black/20 text-slate-400"}`}>
                  <span className="block truncate font-semibold">{step.name}</span>
                  <span className="tabular-nums opacity-80">{step.gems.toLocaleString()}</span>
                </li>
              );
            })}
          </ol>
          <p className="text-[10px] leading-relaxed text-slate-500">Only confirmed gifts received during your live broadcasts advance rank. Purchased Gems, wallet balance and cash tips do not.</p>
        </>
      )}
    </section>
  );
}
