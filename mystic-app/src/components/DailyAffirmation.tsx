import { useEffect, useRef, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../firebase";
import { request } from "../lib/communityBoard";
import { AFFIRMATION_REELS, REEL_ORDER, affirmationSentence, dailySpin, reelIndexes, FIRST_REEL_STOP_MS, REEL_STOP_GAP_MS, SPIN_COMPLETE_MS, type AffirmationSpin } from "../lib/affirmations";

const ROW = 44;
const CYCLES = 7;
type Allowance = { remaining: number; resetsAt: number; last: AffirmationSpin };
type Started = Allowance & { pending: { id: string; spin: AffirmationSpin } };

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function Reel({ words, target, spinId, durationMs, stopped }: { words: readonly string[]; target: number; spinId: number; durationMs: number; stopped: boolean }) {
  const strip = Array.from({ length: CYCLES }, () => words).flat();
  const [position, setPosition] = useState(words.length + target);
  const [animate, setAnimate] = useState(false);
  const previous = useRef(target);

  useEffect(() => {
    if (spinId === 0 || durationMs === 0) {
      setAnimate(false);
      setPosition(words.length + target);
      previous.current = target;
      return;
    }
    // Jump back to the same word in the first cycle, then roll forward several cycles to the new word.
    setAnimate(false);
    setPosition(words.length + previous.current);
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(() => {
      setAnimate(true);
      setPosition((CYCLES - 2) * words.length + target);
      previous.current = target;
    }); });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame); };
  }, [spinId]);

  return (
    <div data-reel-stopped={stopped} className={`relative h-[132px] min-w-0 flex-1 overflow-hidden rounded-[40%/9%] border-x-2 border-y bg-gradient-to-b from-[#070311] via-[#38205a] to-[#070311] transition-colors duration-500 ${stopped ? "border-mystic-gold shadow-[inset_0_0_18px_#070311,0_0_16px_#c084fc60]" : "border-amber-500/40"}`}>
      <div
        className="absolute inset-x-0 top-0"
        style={{
          transform: `translateY(${ROW - position * ROW}px)`,
          transition: animate ? `transform ${durationMs}ms cubic-bezier(0.12, 0.7, 0.18, 1)` : "none"
        }}
      >
        {strip.map((word, index) => (
          <div key={index} className={`flex h-[44px] items-center justify-center text-center font-display text-[clamp(0.53rem,2.3vw,1rem)] font-bold leading-tight ${index === position && stopped ? "text-amber-100 drop-shadow-[0_0_5px_#f59e0b]" : "text-violet-200/45"}`}>
            {word}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[44px] h-[44px] border-y border-mystic-gold/60 bg-mystic-gold/5" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#070412]/80 via-transparent to-[#070412]/80" />
    </div>
  );
}

export default function DailyAffirmation() {
  const [spin, setSpin] = useState<AffirmationSpin>(() => dailySpin(new Date()));
  const [spinId, setSpinId] = useState(0);
  const [stoppedCount, setStoppedCount] = useState<number>(REEL_ORDER.length);
  const [reducedMotion] = useState(prefersReducedMotion);
  const timers = useRef<number[]>([]);
  const active = useRef(false);
  const operation = useRef(0);
  const mounted = useRef(true);
  const [memberUid, setMemberUid] = useState<string | null>(null);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const clearTimers = () => { timers.current.forEach((id) => window.clearTimeout(id)); timers.current = []; };
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      operation.current++;
      clearTimers(); active.current = false; setBusy(false); setStoppedCount(6); setAllowance(null); setError("");
      setMemberUid(user && !user.isAnonymous ? user.uid : null);
    });
    return () => { mounted.current = false; operation.current++; clearTimers(); unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!memberUid) {
      const refreshShared = () => setSpin(dailySpin(new Date()));
      refreshShared();
      const timer = window.setInterval(refreshShared, 30_000);
      window.addEventListener("focus", refreshShared);
      return () => { window.clearInterval(timer); window.removeEventListener("focus", refreshShared); };
    }
    let cancelled = false;
    const refresh = () => {
      if (active.current) return;
      request<Allowance>("/api/affirmations/status", undefined, "GET").then((result) => {
        if (!cancelled && !active.current) { setAllowance(result); setSpin(result.last); setError(""); }
      }).catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Could not load spin allowance."); });
    };
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [memberUid]);

  const spinning = busy || stoppedCount < REEL_ORDER.length;
  const durationFor = (reel: number) => reducedMotion ? 0 : FIRST_REEL_STOP_MS + reel * REEL_STOP_GAP_MS;

  const spinAgain = async () => {
    if (active.current || !memberUid || !allowance || allowance.remaining === 0) return;
    const currentOperation = ++operation.current;
    const isCurrent = () => mounted.current && operation.current === currentOperation && auth.currentUser?.uid === memberUid;
    active.current = true;
    setBusy(true); setError("");
    clearTimers();
    try {
      const result = await request<Started>("/api/affirmations/start", {});
      if (!isCurrent()) return;
      setSpin(result.pending.spin);
      setSpinId((id) => id + 1);
      setStoppedCount(0);
      REEL_ORDER.forEach((_, reel) => {
        timers.current.push(window.setTimeout(() => setStoppedCount((count) => Math.max(count, reel + 1)), durationFor(reel) + 80));
      });
      timers.current.push(window.setTimeout(async () => {
        try {
          const completed = await request<Allowance>("/api/affirmations/complete", { id: result.pending.id });
          if (isCurrent()) { setAllowance(completed); setSpin(completed.last); }
        } catch (reason) {
          if (isCurrent()) {
            setSpin(allowance.last);
            setError(reason instanceof Error ? reason.message : "Could not confirm this spin.");
          }
        } finally {
          if (isCurrent()) { setBusy(false); setStoppedCount(6); active.current = false; }
        }
      }, SPIN_COMPLETE_MS + 100));
    } catch (reason) {
      if (isCurrent()) {
        setError(reason instanceof Error ? reason.message : "Could not start a spin.");
        setBusy(false); active.current = false;
      }
    }
  };

  const targets = reelIndexes(spin);

  return (
    <section aria-labelledby="daily-affirmation-title" className="affirmation-sanctuary fade-in relative isolate mx-auto w-full max-w-3xl overflow-hidden rounded-[2rem] border border-mystic-gold/30 px-2 py-8 text-center shadow-[0_0_55px_#9333ea40] sm:px-8 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,#7e22ce70,transparent_60%),linear-gradient(#130625ed,#070311f5)]" />
      <div aria-hidden="true" className="mb-3 text-3xl text-mystic-gold drop-shadow-[0_0_12px_#c084fc]">☾ ✧ ☽</div>
      <header className="space-y-1">
        <h2 id="daily-affirmation-title" className="font-display text-2xl font-bold tracking-wide text-mystic-gold drop-shadow-[0_0_12px_rgba(243,198,95,0.35)] sm:text-3xl">Daily Affirmation</h2>
        <p className="font-serif text-sm italic text-violet-200">✦ Let the Universe Speak to You ✦</p>
      </header>

      <div aria-hidden="true" className="mt-7 flex justify-around px-2 text-lg text-fuchsia-200 drop-shadow-[0_0_8px_#c084fc]">{REEL_ORDER.map((key) => <span key={key}>✦</span>)}</div>
      <div className="relative rounded-[2rem] border-2 border-mystic-gold bg-gradient-to-b from-amber-600/40 via-[#1c103a] to-amber-600/30 p-1.5 shadow-[0_0_22px_#d9770650,inset_0_0_24px_#9333ea80] sm:p-4">
        <div className="flex gap-1 sm:gap-2" role="img" aria-label={spinning ? "Reels spinning" : `Reels show: ${targets.map((index, reel) => AFFIRMATION_REELS[REEL_ORDER[reel]][index]).join(" ")}`}>
          {REEL_ORDER.map((key, reel) => (
            <Reel key={key} words={AFFIRMATION_REELS[key]} target={targets[reel]} spinId={spinId} durationMs={durationFor(reel)} stopped={reel < stoppedCount} />
          ))}
        </div>
      </div>

      <div className="mt-7 min-h-[120px] rounded-[2rem] border-2 border-mystic-gold/60 bg-gradient-to-br from-[#2b0b43] to-[#090213] px-4 py-5 shadow-[inset_0_0_20px_#a855f730,0_0_16px_#f59e0b20] sm:px-8" aria-live="polite">
        {spinning ? (
          <p className="pt-5 text-sm text-violet-200/70">The reels are aligning…</p>
        ) : (
          <p className="font-serif text-lg italic leading-relaxed text-amber-100 sm:text-xl">{affirmationSentence(spin)}</p>
        )}
      </div>

      <button
        type="button"
        onClick={() => void spinAgain()}
        disabled={spinning || !allowance || allowance.remaining === 0}
        className="mx-auto mt-7 inline-flex min-h-12 items-center gap-2 rounded-full border-2 border-mystic-gold bg-gradient-to-b from-[#783cb7] via-[#351257] to-[#150522] px-8 py-3 font-display text-sm font-bold uppercase tracking-widest text-amber-100 shadow-[0_0_18px_#c084fc80,inset_0_0_12px_#f3c65f30] transition active:scale-95 disabled:opacity-60"
      >
        {spinning ? <Sparkles className="h-4 w-4 animate-pulse" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
        {spinning ? "Spinning…" : "Spin Again"}
      </button>
      <p role="status" className="mt-4 text-xs text-amber-100">{memberUid
        ? allowance ? `${allowance.remaining} of 10 spins remaining today` : "Loading your daily allowance..."
        : "Sign in to receive 10 spins per day. Today's shared affirmation is shown above."}</p>
      <p className="mt-1 text-[10px] text-violet-200/70">Resets at midnight UTC. Interrupted spins are not counted.</p>
      {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/40 p-3 text-xs text-red-200">{error}</p>}
    </section>
  );
}
