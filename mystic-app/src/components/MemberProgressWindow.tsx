import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { Award, LoaderCircle, Sparkles } from "lucide-react";
import { db } from "../firebase";

type Props = { uid: string };

export default function MemberProgressWindow({ uid }: Props) {
  const [cloutPoints, setCloutPoints] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    setCloutPoints(null);
    return onSnapshot(doc(db, "users", uid), (snapshot) => {
      const value = snapshot.data()?.cloutPoints;
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
        setCloutPoints(0);
      } else {
        setCloutPoints(value);
      }
      setError("");
      setLoading(false);
    }, (snapshotError) => {
      console.error("Failed to load member progress:", snapshotError);
      setError("Your progress could not be loaded.");
      setLoading(false);
    });
  }, [uid]);

  return (
    <section aria-labelledby="member-progress-title" className="space-y-4 rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#1d123a]/90 to-[#0a0618]/95 p-4 text-left shadow-[0_0_24px_rgba(243,198,95,0.06)] sm:p-5">
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-mystic-gold/30 bg-mystic-gold/10 text-mystic-gold"><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-teal-300">Private account progress</p>
          <h2 id="member-progress-title" className="font-display text-lg font-semibold text-white">Progress &amp; Rank</h2>
        </div>
      </header>

      {loading ? (
        <div role="status" className="flex min-h-20 items-center justify-center gap-2 text-sm text-slate-300"><LoaderCircle className="h-4 w-4 animate-spin" />Loading your progress…</div>
      ) : error ? (
        <p role="alert" className="rounded-lg border border-rose-400/25 bg-rose-950/20 px-3 py-3 text-sm text-rose-200">{error}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs text-slate-400">Existing Clout points</p>
              <strong className="mt-1 block font-display text-2xl text-mystic-gold">{(cloutPoints ?? 0).toLocaleString()}</strong>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">This is the points total already recorded on your own account; it is separate from Gems and broadcaster gift earnings.</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs text-slate-400">Member rank</p>
              <strong className="mt-1 block font-display text-lg text-slate-200">Not configured</strong>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">The app has no member rank thresholds, so progress toward a next rank cannot be calculated.</p>
            </div>
          </div>

          <div className="rounded-xl border border-mystic-gold/15 bg-mystic-gold/[0.04] p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white"><Award className="h-4 w-4 text-mystic-gold" aria-hidden="true" />Achievements &amp; milestones</div>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">No achievement or milestone records are defined in the existing account system. No awards or progress have been added or inferred.</p>
            {(cloutPoints ?? 0) === 0 && <p className="mt-2 text-[11px] text-slate-500">No Clout points are currently recorded for this account.</p>}
          </div>
        </>
      )}
    </section>
  );
}
