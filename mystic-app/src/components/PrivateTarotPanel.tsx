import { useCallback, useEffect, useRef, useState } from "react";
import TarotCardArt from "./TarotCardArt";
import { ReadingEntry } from "./ImmersiveLiveRoom";
import { TAROT_DECK } from "../data/spiritualData";
import cardBackImage from "../assets/images/mystical_card_back_1790704964638.jpg";
import { loadPrivateReading, updatePrivateReading, type PrivateReading, type PrivateReadingAction } from "../lib/scheduling";

const POLL_MS = 1500;
const positionLabel = (spread: PrivateReading["spread"], index: number) => spread === "single" ? "Guidance" : ["Past", "Present", "Future"][index];

/*
 * Shared Tarot cards for one private appointment. The server owns the reading state: the reader changes it,
 * and both participants render the server's copy with the same card ids, artwork, orientation and labels as Live.
 */
export default function PrivateTarotPanel({ bookingId, role }: { bookingId: string; role: "reader" | "member" }) {
  const [reading, setReading] = useState<PrivateReading | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const version = useRef<number | undefined>(undefined);
  const isReader = role === "reader";

  const apply = useCallback((next: PrivateReading) => {
    version.current = next.version;
    setReading(next);
  }, []);

  useEffect(() => {
    let disposed = false;
    let loading = false;
    const poll = async () => {
      if (loading || disposed) return;
      loading = true;
      try {
        const next = await loadPrivateReading(bookingId, version.current);
        if (!disposed) {
          setError("");
          if (!("unchanged" in next)) apply(next);
        }
      } catch (loadError) {
        if (!disposed) setError(loadError instanceof Error ? loadError.message : "Could not load the shared reading.");
      } finally {
        loading = false;
      }
    };
    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [bookingId, apply]);

  const act = async (body: PrivateReadingAction) => {
    if (busy) return;
    setBusy(true);
    try {
      apply(await updatePrivateReading(bookingId, body));
      setError("");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Could not update the reading.");
    } finally {
      setBusy(false);
    }
  };

  const cards = reading?.cards ?? [];
  const spread = reading?.spread ?? "three";
  const allRevealed = cards.length > 0 && cards.every((card) => card.revealed);
  const revealed = cards.flatMap((card, index) => {
    const full = card.revealed && card.id !== null ? TAROT_DECK.find((item) => item.id === card.id && !item.isHidden) : undefined;
    return full ? [{ index, item: { card: full, isReversed: Boolean(card.reversed), isRevealed: true } }] : [];
  });
  const button = "rounded-full border border-mystic-gold/50 bg-mystic-gold/15 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-mystic-gold disabled:opacity-40";

  return (
    <section aria-label="Shared Tarot reading" className="space-y-3 rounded-xl border border-mystic-gold/30 bg-[#100b1a]/85 p-3 shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.16em] text-mystic-gold">Shared Tarot reading</p>
        {isReader && (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void act({ action: "draw", spread: "single" })} className={button}>One card</button>
            <button type="button" disabled={busy} onClick={() => void act({ action: "draw", spread: "three" })} className={button}>Past · Present · Future</button>
          </div>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="py-4 text-center text-xs text-slate-300">{isReader ? "Choose a spread to draw cards. Your client sees each card only after you reveal it." : "Your reader has not drawn cards yet."}</p>
      ) : (
        <>
          <div className={`grid items-start gap-2 md:gap-4 ${spread === "single" ? "grid-cols-1 justify-items-center" : "grid-cols-3"}`}>
            {cards.map((card, index) => {
              const full = card.revealed && card.id !== null ? TAROT_DECK.find((item) => item.id === card.id) : undefined;
              const label = positionLabel(spread, index);
              const canFlip = isReader && !card.revealed && !busy;
              return (
                <div key={index} className="flex min-w-0 flex-col items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-mystic-gold">{label}</span>
                  <button
                    type="button"
                    disabled={!canFlip}
                    onClick={() => void act({ action: "reveal", index })}
                    aria-label={full ? `${full.name}, ${card.reversed ? "reversed" : "upright"}` : isReader ? `Reveal ${label.toLowerCase()} card` : `${label} card not revealed yet`}
                    className="relative aspect-[2/3] w-[5.25rem] overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-mystic-gold md:w-[8rem]"
                  >
                    {full ? (
                      <div className={`absolute inset-0 h-full w-full overflow-hidden rounded-lg ${card.reversed ? "rotate-180" : ""}`}>
                        <TarotCardArt id={full.id} className="pointer-events-none absolute inset-0 h-full w-full rounded-lg" />
                      </div>
                    ) : (
                      <span className="absolute inset-0 rounded-lg border-2 border-mystic-gold/55 bg-cover bg-center shadow-[0_8px_28px_rgba(0,0,0,.55)]" style={{ backgroundImage: `url(${cardBackImage})` }} />
                    )}
                  </button>
                  {full && <span className="text-center text-[10px] text-white/90">{full.name}{card.reversed ? " (reversed)" : ""}</span>}
                </div>
              );
            })}
          </div>
          {isReader && (
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" disabled={busy || allRevealed} onClick={() => void act({ action: "revealNext" })} className={button}>Reveal next</button>
              <button type="button" disabled={busy || allRevealed} onClick={() => void act({ action: "revealAll" })} className={button}>Reveal all</button>
              <button type="button" disabled={busy} onClick={() => void act({ action: "reset" })} className="rounded-full border border-white/25 bg-black/40 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white disabled:opacity-40">Clear</button>
            </div>
          )}
          {isReader && revealed.length > 0 && (
            <div className="max-h-72 space-y-2 overflow-y-auto border-t border-white/10 pt-3" aria-label="Reader-only card meanings">
              <p className="text-[9px] uppercase tracking-[0.14em] text-slate-400">Visible to you only</p>
              {revealed.map(({ index, item }) => <ReadingEntry key={`${item.card.id}-${index}`} item={item} position={positionLabel(spread, index)} />)}
            </div>
          )}
        </>
      )}
      {error && <p role="alert" className="text-xs text-rose-200">{error}</p>}
    </section>
  );
}
