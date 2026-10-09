import { useState } from "react";
import TarotCardArt from "./TarotCardArt";
import { TAROT_DECK } from "../data/spiritualData";
import { tarotPositionContext } from "../data/tarotInterpretations";
import cardBackImage from "../assets/images/mystical_card_back_1790704964638.jpg";

type TestCard = {
  id: number;
  position: "Past" | "Present" | "Future";
  isReversed: boolean;
  isRevealed: boolean;
};

const initialCards: TestCard[] = [
  { id: 0, position: "Past", isReversed: false, isRevealed: false },
  { id: 1, position: "Present", isReversed: true, isRevealed: false },
  { id: 2, position: "Future", isReversed: false, isRevealed: false },
];

type Props = { onDone: () => void };

export default function LiveTarotCardDisplayV2({ onDone }: Props) {
  const [cards, setCards] = useState(initialCards);
  const [isReading, setIsReading] = useState(false);
  const [showReading, setShowReading] = useState(false);

  const startReading = () => {
    setCards(initialCards);
    setShowReading(false);
    setIsReading(true);
  };

  const revealCard = (id: number) => {
    setCards((current) => current.map((card) => card.id === id ? { ...card, isRevealed: true } : card));
  };

  const visibleCards = cards.map((item) => ({
    item,
    card: TAROT_DECK.find((candidate) => candidate.id === item.id) ?? TAROT_DECK[item.id],
  }));

  return (
    <section aria-label="Live Tarot reading" className="rounded-xl border border-mystic-gold/30 bg-[#100b1a]/85 p-3 shadow-2xl backdrop-blur-md">
      {!isReading ? (
        <div className="flex flex-col items-center gap-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-mystic-gold">Three-card reading</p>
          <button type="button" onClick={startReading} className="rounded-full border border-mystic-gold/50 bg-mystic-gold/15 px-5 py-2 text-xs font-bold uppercase tracking-[0.14em] text-mystic-gold">Read</button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 items-start gap-2 md:gap-4">
            {visibleCards.map(({ item, card }) => (
              <div key={item.id} className="flex min-w-0 flex-col items-center gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-mystic-gold drop-shadow">{item.position}</span>
                <button
                  type="button"
                  onClick={() => revealCard(item.id)}
                  aria-label={item.isRevealed ? `${card.name}, ${item.isReversed ? "reversed" : "upright"}` : `Reveal ${item.position.toLowerCase()} card`}
                  className="relative aspect-[2/3] w-[5.25rem] overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-mystic-gold md:w-[8rem]"
                >
                  {item.isRevealed ? (
                    <div className={`backface-hidden absolute inset-0 h-full w-full overflow-hidden rounded-lg ${item.isReversed ? "rotate-180" : ""}`}>
                      <TarotCardArt key={`live-tarot-art-${item.id}`} id={item.id} className="pointer-events-none absolute inset-0 h-full w-full rounded-lg" />
                    </div>
                  ) : (
                    <span className="absolute inset-0 rounded-lg border-2 border-mystic-gold/55 bg-cover bg-center shadow-[0_8px_28px_rgba(0,0,0,.55)]" style={{ backgroundImage: `url(${cardBackImage})` }} />
                  )}
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-center gap-2">
            {cards.every((card) => card.isRevealed) && (
              <button type="button" onClick={() => setShowReading((visible) => !visible)} className="rounded-full border border-mystic-gold/50 bg-mystic-gold/15 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-mystic-gold">{showReading ? "Hide Reading" : "Read"}</button>
            )}
            <button type="button" onClick={onDone} className="rounded-full border border-white/25 bg-black/40 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white">Done</button>
          </div>
          {showReading && (
            <div className="mt-3 max-h-[32dvh] space-y-2 overflow-y-auto border-t border-white/10 pt-3">
              {visibleCards.map(({ item, card }) => (
                <article key={`${item.id}-meaning`} className="rounded-lg border border-white/10 bg-black/20 p-2">
                  <h4 className="text-[10px] font-semibold text-mystic-gold">{item.position} · {card.name}</h4>
                  <p className="mt-1 text-[9px] leading-relaxed text-white/85">{tarotPositionContext(item.position, card.name, item.isReversed)}</p>
                  <p className="mt-1 text-[9px] leading-relaxed text-white/75">{item.isReversed ? card.reversedMeaning : card.uprightMeaning}</p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
