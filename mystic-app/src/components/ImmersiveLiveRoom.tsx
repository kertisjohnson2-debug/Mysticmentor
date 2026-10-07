import { useEffect, useRef, useState } from "react";
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import {
  Activity,
  Anchor,
  BarChart3,
  BookOpen,
  Check,
  CircleDollarSign,
  Compass,
  Crown,
  Eye,
  Gem,
  Heart,
  Moon,
  MoonStar,
  MessageCircle,
  Pause,
  Pencil,
  ArrowLeft,
  Play,
  RefreshCw,
  Scale,
  Send,
  Share2,
  Shield,
  Skull,
  Sparkles,
  Sun,
  Users,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  X,
  type LucideIcon
} from "lucide-react";
import { TAROT_DECK, type TarotCard } from "../data/spiritualData";
import { tarotPositionContext } from "../data/tarotInterpretations";
import type { LiveVideoStatus } from "../lib/liveVideo";

type LiveTopic =
  | "Tarot & Spirituality"
  | "Plants & Gardening"
  | "Books"
  | "Pets"
  | "Gaming"
  | "Music"
  | "Just Chatting";

type Broadcaster = {
  id: string;
  name: string;
  avatar: string;
  avatarUrl?: string;
  title: string;
  description?: string;
  hashtags?: string;
  topic: LiveTopic;
  viewers: number;
  theme: string;
  image?: string;
  lifetimeGems: number;
};

type ChatLine = { id: number | string; sender: string; text: string; kind?: "gift" | "system" };
type LiveGift = { name: string; emoji: string; gems: number };
export type LiveSpread = "single" | "three";
export type LiveReadingCard = { card: TarotCard; isReversed: boolean; isRevealed: boolean };

const cardBackImage = "/src/assets/images/mystical_card_back_1790704964638.jpg";
const tarotIcons: Record<string, LucideIcon> = {
  Compass,
  Wand2,
  Moon,
  Crown,
  Shield,
  BookOpen,
  Heart,
  Sparkles,
  Activity,
  Eye,
  RefreshCw,
  Scale,
  Anchor,
  Skull,
  MoonStar,
  Sun,
  Gem
};

const gifts: LiveGift[] = [
  { name: "Heart", emoji: "💗", gems: 10 },
  { name: "Star", emoji: "⭐", gems: 50 },
  { name: "Rose", emoji: "🌹", gems: 100 },
  { name: "Crystal", emoji: "🔮", gems: 250 },
  { name: "Teddy", emoji: "🧸", gems: 500 }
];

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

const chatNameColors = ["text-fuchsia-200", "text-sky-200", "text-amber-200", "text-emerald-200", "text-violet-200", "text-rose-200"];

function chatNameColor(sender: string) {
  const hash = [...sender].reduce((value, character) => value + character.charCodeAt(0), 0);
  return chatNameColors[hash % chatNameColors.length];
}

type Props = {
  videoStream: MediaStream | null;
  videoStatus: LiveVideoStatus;
  videoError: string;
  hasRealVideo: boolean;
  broadcaster: Broadcaster;
  isBroadcaster: boolean;
  isPaused: boolean;
  canUseTarot: boolean;
  currentRank: string;
  elapsedSeconds: number;
  viewerCount: number;
  giftsReceived: number;
  isFollowing: boolean;
  readingSpread: LiveSpread;
  readingCards: LiveReadingCard[];
  showInterpretations: boolean;
  onBack: () => void;
  onBrowse: () => void;
  onStartBroadcast: () => void;
  onEarnings: () => void;
  onEndBroadcast: () => void;
  onTogglePause: () => void;
  onUpdateBroadcastInfo: (title: string, description: string, hashtags: string) => void;
  onToggleFollow: () => void;
  onHeart: () => void;
  onChooseSpread: (spread: LiveSpread) => void;
  onStartReading: () => void;
  onDrawSelectedCards: (cardIds: number[]) => void;
  onFlipLiveCard: (index: number) => void;
  onRevealNext: () => void;
  onRevealAll: () => void;
  onResetReading: () => void;
  onToggleInterpretations: () => void;
  chat: ChatLine[];
  chatInput: string;
  setChatInput: Dispatch<SetStateAction<string>>;
  onSendChat: (event: FormEvent<HTMLFormElement>) => void;
  onShare: () => void;
  notificationBell?: ReactNode;
  notice: string;
  viewerGems: number;
  onSendGift: (gift: LiveGift) => void;
  onSendCashTip: (amount: string) => void;
  customTip: string;
  setCustomTip: Dispatch<SetStateAction<string>>;
  isGiftSheetOpen: boolean;
  setIsGiftSheetOpen: Dispatch<SetStateAction<boolean>>;
};

function ReadingEntry({ item, position }: { item: LiveReadingCard; position: string }) {
  const { card, isReversed } = item;
  const keywords = isReversed ? card.reversedKeywords : card.uprightKeywords;
  return <article className="rounded-lg border border-white/10 bg-[#100b1a]/70 p-2 backdrop-blur-md">
    <div className="flex items-center justify-between gap-2"><h4 className="truncate font-display text-[11px] font-semibold text-mystic-gold">{position} · {card.name}</h4><span className="shrink-0 text-[8px] font-semibold uppercase text-teal-200">{isReversed ? "Reversed" : "Upright"}</span></div>
    <p className="mt-1 text-[8px] font-medium uppercase tracking-wide text-white/70">{keywords.join(" · ")}</p>
    <p className="mt-1.5 text-[10px] leading-relaxed text-mystic-gold/90">{tarotPositionContext(position, card.name, isReversed)}</p>
    <p className="mt-1.5 text-[10px] leading-relaxed text-white/90">{isReversed ? card.reversedMeaning : card.uprightMeaning}</p>
    {card.description && <p className="mt-1.5 text-[10px] leading-relaxed text-white/75">{card.description}</p>}
    <p className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] italic leading-relaxed text-teal-100/90">Guidance: {card.advice}</p>
  </article>;
}

export default function ImmersiveLiveRoom({
  videoStream,
  videoStatus,
  videoError,
  hasRealVideo,
  broadcaster,
  isBroadcaster,
  isPaused,
  canUseTarot,
  currentRank,
  elapsedSeconds,
  viewerCount,
  giftsReceived,
  isFollowing,
  readingSpread,
  readingCards,
  showInterpretations,
  onBack,
  onBrowse,
  onStartBroadcast,
  onEarnings,
  onEndBroadcast,
  onTogglePause,
  onUpdateBroadcastInfo,
  onToggleFollow,
  onHeart,
  onChooseSpread,
  onStartReading,
  onDrawSelectedCards,
  onFlipLiveCard,
  onRevealNext,
  onRevealAll,
  onResetReading,
  onToggleInterpretations,
  chat,
  chatInput,
  setChatInput,
  onSendChat,
  onShare,
  notificationBell,  notice,
  viewerGems,
  onSendGift,
  onSendCashTip,
  customTip,
  setCustomTip,
  isGiftSheetOpen,
  setIsGiftSheetOpen
}: Props) {
  const [isReadingControlsOpen, setIsReadingControlsOpen] = useState(false);
  const [isCardPickerOpen, setIsCardPickerOpen] = useState(false);
  const [isBroadcastInfoOpen, setIsBroadcastInfoOpen] = useState(false);
  const [isEndConfirmationOpen, setIsEndConfirmationOpen] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState(broadcaster.title);
  const [broadcastDescription, setBroadcastDescription] = useState(broadcaster.description ?? "");
  const [broadcastHashtags, setBroadcastHashtags] = useState(broadcaster.hashtags ?? "");
  const [manualCardIds, setManualCardIds] = useState<(number | "")[]>([]);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isAudioBlocked, setIsAudioBlocked] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isReadingPanelOpen, setIsReadingPanelOpen] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => setIsVideoMuted(video.muted || video.volume === 0);
    sync();
    video.addEventListener("volumechange", sync);
    return () => video.removeEventListener("volumechange", sync);
  }, [hasRealVideo]);

  // Runs inside the tap handler so iOS/iPadOS Safari accepts the unmute
  const toggleViewerSound = () => {
    const video = videoRef.current;
    if (!video) return;
    const shouldMute = !(video.muted || video.volume === 0);
    if (!shouldMute && video.volume === 0) video.volume = 1;
    video.muted = shouldMute;
    setIsVideoMuted(shouldMute);
    setIsAudioBlocked(false);
    video.play().catch(() => undefined);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = videoStream;
    setIsAudioBlocked(false);
    if (!videoStream) return;
    video.play().catch(() => {
      // Autoplay with sound can be blocked; fall back to muted playback until the viewer taps
      video.muted = true;
      setIsAudioBlocked(true);
      video.play().catch(() => undefined);
    });
  }, [videoStream, hasRealVideo]);

  const spreadSize = readingSpread === "single" ? 1 : 3;
  const selectedManualCardIds = manualCardIds.slice(0, spreadSize).filter((id): id is number => typeof id === "number");
  const hasCompleteManualSelection = selectedManualCardIds.length === spreadSize && new Set(selectedManualCardIds).size === spreadSize;
  const revealedReadingCards = readingCards.flatMap((item, index) => item.isRevealed ? [{ item, index }] : []);
  const hasRevealedReading = revealedReadingCards.length > 0;

  useEffect(() => {
    if (!hasRevealedReading) setIsReadingPanelOpen(false);
  }, [hasRevealedReading]);

  return (
    <section className="relative isolate h-full min-h-full w-full overflow-hidden bg-[#09070c] text-slate-100">
      <div className={`absolute inset-0 bg-gradient-to-br ${broadcaster.theme}`}>
        {!hasRealVideo && broadcaster.image && <img src={broadcaster.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-90" />}
        {hasRealVideo && <video ref={videoRef} autoPlay playsInline muted={isBroadcaster} className={`absolute inset-0 h-full w-full object-cover ${isBroadcaster ? "-scale-x-100" : ""} ${videoStream ? "" : "hidden"}`} />}
        {hasRealVideo && !videoStream && <p role="status" className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-sm text-white/80">{videoError || (isBroadcaster ? (videoStatus === "requesting" ? "Allow camera and microphone access to go live…" : "Starting your camera…") : videoStatus === "error" ? "Could not connect to this broadcast's video." : "Connecting to the broadcaster's video…")}</p>}
        {hasRealVideo && !isBroadcaster && <button type="button" onClick={toggleViewerSound} aria-label={isVideoMuted ? "Unmute broadcast audio" : "Mute broadcast audio"} aria-pressed={isVideoMuted} title={isVideoMuted ? "Sound off — tap to unmute" : "Sound on — tap to mute"} className="absolute right-4 top-[calc(env(safe-area-inset-top)+4.25rem)] z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/55 text-white shadow-lg backdrop-blur-md transition active:scale-90 sm:right-6">{isVideoMuted ? <VolumeX className="h-5 w-5 text-rose-200" /> : <Volume2 className="h-5 w-5" />}</button>}
        {hasRealVideo && isAudioBlocked && !isBroadcaster && <button type="button" onClick={() => { if (videoRef.current) { videoRef.current.muted = false; videoRef.current.play().catch(() => undefined); } setIsAudioBlocked(false); }} className="absolute left-1/2 top-24 z-20 -translate-x-1/2 rounded-full bg-black/60 px-4 py-2 text-xs font-semibold text-white backdrop-blur-md">Tap to unmute</button>}
        <div className={`absolute inset-0 bg-[radial-gradient(circle_at_65%_28%,rgba(255,255,255,.12),transparent_28%),linear-gradient(180deg,rgba(9,7,12,.45)_0%,transparent_28%,rgba(9,7,12,.12)_48%,rgba(9,7,12,.86)_100%)] ${isPaused ? "bg-black/45" : ""}`} />
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={onBack} aria-label={isBroadcaster ? "Back (your broadcast stays live)" : "Leave broadcast"} title={isBroadcaster ? "Back (your broadcast stays live)" : "Leave broadcast"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-lg backdrop-blur-md transition hover:bg-black/60 active:scale-95"><ArrowLeft className="h-5 w-5" /></button>
  <button onClick={onBrowse} aria-label="Browse Live Broadcasts" title="Browse Live Broadcasts" className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-mystic-gold/35 bg-black/40 px-3 text-mystic-gold shadow-lg backdrop-blur-md transition hover:bg-black/60 active:scale-95">
          <Users className="h-5 w-5" /><span className="hidden text-[10px] font-semibold sm:inline">Browse</span>
        </button>
        </div>
        <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/15 bg-black/35 px-3 py-2 shadow-lg backdrop-blur-md">
          <span className={`relative flex h-2 w-2 shrink-0 rounded-full ${isPaused ? "bg-amber-300" : "bg-rose-400"}`} />
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white">{isPaused ? "Paused" : "Live"}</span>
          <span className="h-3 w-px bg-white/20" />
          <Users className="h-3.5 w-3.5 shrink-0 text-white/75" />
          <span className="whitespace-nowrap text-xs font-medium text-white">{formatCount(viewerCount)}</span>
          {isBroadcaster && <><span className="h-3 w-px bg-white/20" /><span className="font-mono text-xs text-white/80">{String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}</span></>}
        </div>
        {isBroadcaster ? (
          <button onClick={() => { setBroadcastTitle(broadcaster.title); setBroadcastDescription(broadcaster.description ?? ""); setBroadcastHashtags(broadcaster.hashtags ?? ""); setIsBroadcastInfoOpen(true); }} aria-label="Edit broadcast information" title="Edit broadcast information" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-mystic-gold/35 bg-black/35 text-mystic-gold shadow-lg backdrop-blur-md transition hover:bg-black/50 active:scale-95"><Pencil className="h-5 w-5" /></button>
        ) : (
          <div className="flex shrink-0 gap-2">
            <button onClick={onStartBroadcast} aria-label="Start your own broadcast" title="Start your own broadcast" className="flex h-11 w-11 items-center justify-center rounded-full border border-mystic-gold/40 bg-black/30 text-mystic-gold shadow-lg backdrop-blur-md transition hover:bg-black/50 active:scale-95"><Video className="h-5 w-5" /></button>
          </div>
        )}
      </header>

      <div className={`absolute left-4 ${isBroadcaster ? "right-44 sm:right-44" : "right-[4.75rem] sm:right-24"} ${readingCards.length > 0 ? "max-md:right-[13rem]!" : ""} top-[calc(env(safe-area-inset-top)+4.25rem)] z-10 flex items-center gap-3 sm:left-6`}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-mystic-gold/60 bg-[#25182e]/85 font-display text-xs font-semibold text-mystic-gold shadow-lg backdrop-blur-md">{broadcaster.avatarUrl ? <img src={broadcaster.avatarUrl} alt="" className="h-full w-full object-cover" /> : broadcaster.avatar}</div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-white drop-shadow">{broadcaster.name}</p>
            {!isBroadcaster && <button onClick={onToggleFollow} className={`min-h-8 shrink-0 rounded-full border px-3 text-[10px] font-semibold transition active:scale-95 ${isFollowing ? "border-teal-200/40 bg-teal-900/55 text-teal-100" : "border-mystic-gold/70 bg-black/30 text-mystic-gold backdrop-blur-md"}`}>{isFollowing ? "Following" : "Follow"}</button>}
          </div>
          <p className="mt-0.5 truncate text-[10px] font-medium text-white/70">{broadcaster.topic}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-white drop-shadow-[0_1px_6px_rgba(0,0,0,.9)]">{broadcaster.title}</p>
          {broadcaster.description && <p className="mt-0.5 line-clamp-1 text-[10px] text-white/75">{broadcaster.description}</p>}
          {broadcaster.hashtags && <p className="mt-0.5 line-clamp-1 text-[10px] font-medium text-mystic-gold drop-shadow">{broadcaster.hashtags}</p>}
        </div>
      </div>

      {isPaused && <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/55 px-5 py-3 font-display text-sm text-white shadow-xl backdrop-blur-md">Broadcast paused</div>}

      {readingCards.length > 0 && <section aria-label="Live Tarot reading" className="absolute left-auto right-[3.9rem] top-[calc(env(safe-area-inset-top)+4.25rem)] z-10 w-[8.5rem] md:left-auto md:right-[5.25rem] md:top-[calc(env(safe-area-inset-top)+6.75rem)] md:w-[min(38vw,20rem)] md:translate-x-0">
        <div className={`grid items-start gap-1 md:gap-2 ${readingSpread === "single" ? "grid-cols-1 justify-items-center" : "grid-cols-3"}`}>
          {readingCards.map((item, index) => {
            const CardIcon = tarotIcons[item.card.iconName] ?? Sparkles;
            const position = readingSpread === "single" ? "Guidance" : ["Past", "Present", "Future"][index];
            return <div key={`${item.card.id}-${index}`} className="flex min-w-0 flex-col items-center gap-1.5">
              <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-mystic-gold drop-shadow sm:text-[10px]">{position}</span>
              <button type="button" disabled={!isBroadcaster || item.isRevealed} onClick={() => onFlipLiveCard(index)} aria-label={item.isRevealed ? `${item.card.name}, ${item.isReversed ? "reversed" : "upright"}` : `Reveal ${position.toLowerCase()} card`} className={`perspective-1000 aspect-[2/3] w-full rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-mystic-gold ${readingSpread === "single" ? "max-w-[3.5rem] md:max-w-[7rem]" : "max-w-[3.1rem] md:max-w-[5rem]"}`}>
                <span className={`relative block h-full w-full transform-style-3d transition-transform duration-700 ${item.isRevealed ? "rotate-y-180" : ""}`}>
                  <span className="backface-hidden absolute inset-0 flex items-center justify-center overflow-hidden rounded-lg border border-mystic-gold/55 bg-cover bg-center shadow-[0_8px_28px_rgba(0,0,0,.55)]" style={{ backgroundImage: `url(${cardBackImage})` }}>
                    <span className="absolute inset-1.5 rounded-md border border-mystic-gold/35" />
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-mystic-gold/40 bg-black/55 text-mystic-gold shadow-[0_0_24px_rgba(243,198,95,.28)] md:h-9 md:w-9"><Sparkles className="h-4 w-4 md:h-5 md:w-5" /></span>
                  </span>
                  <span className={`backface-hidden rotate-y-180 absolute inset-0 flex flex-col items-center justify-between overflow-hidden rounded-lg border-2 border-mystic-gold/80 bg-[radial-gradient(circle_at_50%_40%,rgba(243,198,95,.17),transparent_42%),linear-gradient(155deg,#302044,#100b1a_72%)] p-1 text-center md:p-2 shadow-[0_8px_30px_rgba(0,0,0,.6)] ${item.isReversed ? "rotate-180" : ""}`}>
                    <span className="absolute inset-1 rounded-md border border-mystic-gold/25" />
                    <span className="relative hidden text-[8px] font-mono uppercase tracking-[0.12em] text-mystic-gold/80 md:block">Arcana {item.card.number}</span>
                    <span className="relative flex min-h-0 flex-col items-center justify-center">
                      <span className="mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-mystic-gold/45 bg-mystic-gold/10 text-mystic-gold shadow-[0_0_24px_rgba(243,198,95,.18)] md:mb-1.5 md:h-9 md:w-9"><CardIcon className="h-4 w-4 md:h-5 md:w-5" /></span>
                      <span className="line-clamp-2 font-display text-[7px] font-semibold leading-tight text-white md:text-xs">{item.card.name}</span>
                      <span className="mt-0.5 text-[6px] font-semibold uppercase tracking-wider text-teal-200 md:mt-1 md:text-[7px]">{item.isReversed ? "Reversed" : "Upright"}</span>
                    </span>
                    <span className="relative line-clamp-2 hidden text-[7px] leading-tight text-white/60 md:block">{item.card.description}</span>
                  </span>
                </span>
              </button>
            </div>;
          })}
        </div>
        {isBroadcaster && <div className="mt-1.5 flex justify-center"><button type="button" onClick={onResetReading} aria-label="Finish reading and clear the cards" className="flex h-7 items-center gap-1 rounded-full border border-mystic-gold/40 bg-[#100b1a]/75 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-mystic-gold shadow-lg backdrop-blur-md transition hover:bg-black/60 active:scale-95"><Check className="h-3 w-3" />Done</button></div>}
        {isBroadcaster && showInterpretations && hasRevealedReading && <div className="mt-1.5 hidden max-h-[34dvh] flex-col gap-1.5 overflow-y-auto overscroll-contain pr-1 md:flex">
          {revealedReadingCards.map(({ item, index }) => <ReadingEntry key={`${item.card.id}-meaning`} item={item} position={readingSpread === "single" ? "Guidance" : ["Past", "Present", "Future"][index]} />)}
        </div>}
      </section>}

      <aside aria-label={isBroadcaster ? "Broadcast controls" : "Live reactions and gifts"} className={`absolute ${isBroadcaster ? "right-2 gap-1.5" : "right-2 gap-2"} bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-center md:bottom-auto md:right-5 md:top-[43%] md:-translate-y-1/2 ${isBroadcaster ? "md:gap-2" : "md:gap-3"}`}>
        {notificationBell}
        <button onClick={onHeart} aria-label="Send a heart reaction" title="Send a heart" className="flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-full border border-white/20 bg-black/35 text-rose-200 shadow-lg backdrop-blur-md transition hover:bg-black/55 active:scale-90"><Heart className="h-5 w-5 fill-current" /></button>
        {!isBroadcaster && <>
          <button onClick={() => setIsGiftSheetOpen(true)} aria-label="Send Gems or a gift" title="Gems & Gifts" className="flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-full border border-white/20 bg-black/35 text-mystic-gold shadow-lg backdrop-blur-md transition hover:bg-black/55 active:scale-90"><Gem className="h-5 w-5" /><span className="text-[8px] font-semibold">Gifts</span></button>
          <button onClick={() => { chatInputRef.current?.focus(); }} aria-label="Open live chat" title="Open chat" className="flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-full border border-white/20 bg-black/35 text-teal-100 shadow-lg backdrop-blur-md transition hover:bg-black/55 active:scale-90"><MessageCircle className="h-5 w-5" /><span className="text-[8px] font-semibold">Chat</span></button>
          <button onClick={onShare} aria-label="Share broadcast" title="Share broadcast" className="flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-full border border-white/20 bg-black/35 text-white shadow-lg backdrop-blur-md transition hover:bg-black/55 active:scale-90"><Share2 className="h-5 w-5" /><span className="text-[8px] font-semibold">Share</span></button>
        </>}
        {canUseTarot && <button onClick={() => setIsReadingControlsOpen(true)} aria-label="Open live reading controls" title="Live reading controls" className="flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-full border border-mystic-gold/40 bg-black/35 text-mystic-gold shadow-lg backdrop-blur-md transition hover:bg-black/55 active:scale-90"><Sparkles className="h-5 w-5" /><span className="text-[8px] font-semibold">Tarot</span></button>}
        {isBroadcaster && <>
          <button onClick={onTogglePause} aria-label={isPaused ? "Resume broadcast" : "Pause broadcast"} title={isPaused ? "Resume broadcast" : "Pause broadcast"} className="flex h-11 w-11 items-center justify-center rounded-full border border-mystic-gold/40 bg-black/35 text-mystic-gold shadow-lg backdrop-blur-md transition hover:bg-black/55 active:scale-90">{isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
          <button onClick={() => setIsEndConfirmationOpen(true)} aria-label="End broadcast" title="End broadcast" className="flex h-11 w-11 items-center justify-center rounded-full border border-rose-300/35 bg-black/35 text-rose-200 shadow-lg backdrop-blur-md transition hover:bg-rose-950/60 active:scale-90"><Video className="h-4 w-4" /></button>
          <button onClick={onEarnings} aria-label="Creator earnings" title="Creator earnings" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white/80 shadow-lg backdrop-blur-md transition hover:bg-white/10 active:scale-90"><BarChart3 className="h-4 w-4" /></button>
        </>}

      </aside>

      {isBroadcaster && showInterpretations && hasRevealedReading && <div className="pointer-events-none absolute inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-20 px-4 sm:px-6 md:hidden">
        <div className="pointer-events-auto ml-0 mr-[4.75rem] flex flex-col gap-1.5">
          <button type="button" onClick={() => setIsReadingPanelOpen((open) => !open)} className="w-fit rounded-full border border-mystic-gold/35 bg-[#100b1a]/75 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-mystic-gold shadow-lg backdrop-blur-md">
            {isReadingPanelOpen ? "Hide reading" : "Reading"}
          </button>
          {isReadingPanelOpen && <section aria-label="Tarot interpretation panel" className="fixed inset-x-0 bottom-16 z-50 flex max-h-[calc(100dvh-9rem)] min-h-[40dvh] flex-col rounded-t-2xl border border-mystic-gold/25 bg-[#100b1a]/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl backdrop-blur-md">
            <div className="mb-2 flex shrink-0 items-center justify-between">
              <h3 className="font-display text-[11px] text-mystic-gold">Reading</h3>
              <button type="button" onClick={() => setIsReadingPanelOpen(false)} className="rounded-full border border-white/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-200">Close</button>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {revealedReadingCards.map(({ item, index }) => <ReadingEntry key={`${item.card.id}-mobile-meaning`} item={item} position={readingSpread === "single" ? "Guidance" : ["Past", "Present", "Future"][index]} />)}
            </div>
          </section>}
        </div>
      </div>}

      {isCardPickerOpen && canUseTarot && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 pb-16 backdrop-blur-sm md:pb-0" onClick={() => setIsCardPickerOpen(false)}><section role="dialog" aria-modal="true" aria-label="Choose cards for a live Tarot reading" onClick={(event) => event.stopPropagation()} className="max-h-[calc(100dvh-5rem)] w-full max-w-lg overflow-y-auto overscroll-contain md:max-h-[82dvh] rounded-t-2xl border border-mystic-gold/25 bg-[#100c18] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl"><div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" /><div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mystic-gold">Reader only · private</p><h2 className="font-display text-lg text-white">Choose the cards</h2></div><button onClick={() => setIsCardPickerOpen(false)} aria-label="Close card picker" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400"><X className="h-5 w-5" /></button></div><div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1"><button onClick={() => { onChooseSpread("single"); setManualCardIds([]); }} aria-pressed={readingSpread === "single"} className={`h-10 rounded-lg text-xs font-semibold transition ${readingSpread === "single" ? "bg-mystic-gold text-[#100b1c]" : "text-slate-300 hover:bg-white/5"}`}>1 card</button><button onClick={() => { onChooseSpread("three"); setManualCardIds([]); }} aria-pressed={readingSpread === "three"} className={`h-10 rounded-lg text-xs font-semibold transition ${readingSpread === "three" ? "bg-mystic-gold text-[#100b1c]" : "text-slate-300 hover:bg-white/5"}`}>3 cards</button></div><div className="space-y-3">{Array.from({ length: spreadSize }, (_, index) => {
                const position = readingSpread === "single" ? "Guidance" : ["Past", "Present", "Future"][index];
                const selectedId = manualCardIds[index] ?? "";
                const availableCards = TAROT_DECK.filter((card) => !card.isHidden && (!manualCardIds.includes(card.id) || selectedId === card.id));
                return <label key={position} className="block space-y-1.5"><span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-200">{position}</span><select value={selectedId} onChange={(event) => setManualCardIds((previous) => { const next = previous.slice(0, spreadSize); next[index] = event.target.value ? Number(event.target.value) : ""; return next; })} className="h-12 w-full rounded-lg border border-white/10 bg-[#171122] px-3 text-sm text-white"><option value="">Choose a card</option>{availableCards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}</select></label>;
              })}</div><button disabled={!hasCompleteManualSelection} onClick={() => { onDrawSelectedCards(selectedManualCardIds); setIsCardPickerOpen(false); }} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-mystic-gold text-sm font-semibold text-[#100b1c] disabled:cursor-not-allowed disabled:opacity-40"><Check className="h-4 w-4" />Place selected cards on stream</button></section></div>}

      <div className={`absolute bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-[4.75rem] z-10 flex ${readingCards.length > 0 ? "max-h-[15dvh]" : "max-h-[28dvh]"} flex-col justify-end overflow-y-auto overflow-x-hidden pr-1 sm:bottom-[calc(6rem+env(safe-area-inset-bottom))] sm:left-6 sm:right-24`}>
        <div className="min-w-0 max-w-full space-y-1.5 px-2 pb-2 pt-5">
          {chat.slice(-8).map((line) => <p key={line.id} className={`max-w-full whitespace-normal break-words text-xs leading-relaxed [overflow-wrap:anywhere] [text-shadow:0_1px_3px_rgba(0,0,0,.9),0_0_8px_rgba(0,0,0,.5)] ${line.kind === "gift" ? "text-mystic-gold" : line.kind === "system" ? "text-teal-200" : "text-white"}`}><strong className={`mr-1 font-semibold ${chatNameColor(line.sender)}`}>{line.sender}</strong>{line.text}</p>)}
        </div>
        {isBroadcaster && <div className="mt-1 flex items-center gap-2 px-2 text-[10px] text-white/75"><Gem className="h-3.5 w-3.5 text-mystic-gold" />{formatCount(giftsReceived)} Gems received <span className="text-white/30">·</span>{currentRank}</div>}
      </div>

      <form onSubmit={onSendChat} className="absolute inset-x-4 bottom-0 z-20 flex gap-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:inset-x-6">
        <input ref={chatInputRef} value={chatInput} onChange={(event) => setChatInput(event.target.value)} placeholder={isBroadcaster ? "Say hello to chat" : "Say something kind..."} aria-label="Message the live chat" className="h-12 min-w-0 flex-1 rounded-full border border-white/20 bg-black/45 px-4 text-sm text-white shadow-lg outline-none backdrop-blur-xl placeholder:text-white/55 focus:border-mystic-gold/70" />
        <button aria-label="Send message" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-mystic-gold/50 bg-mystic-gold text-[#100b1c] shadow-lg transition hover:brightness-110 active:scale-95"><Send className="h-4 w-4" /></button>
      </form>

      {isReadingControlsOpen && canUseTarot && <div className="pointer-events-none fixed inset-x-0 bottom-16 z-50 flex justify-center md:bottom-0"><section role="dialog" aria-modal="true" aria-label="Live Tarot reading controls" onClick={(event) => event.stopPropagation()} className="pointer-events-auto max-h-[calc(100dvh-7rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl md:max-h-[34dvh] border border-mystic-gold/25 bg-[#100c18]/90 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl backdrop-blur-md"><div className="mb-2 flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mystic-gold">Reader only · private</p><h2 className="font-display text-sm text-white">Live Tarot desk</h2></div><button onClick={() => setIsReadingControlsOpen(false)} aria-label="Close reading controls" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400"><X className="h-5 w-5" /></button></div><div className="mb-2 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1"><button onClick={() => onChooseSpread("single")} aria-pressed={readingSpread === "single"} className={`h-8 rounded-lg text-[11px] font-semibold transition ${readingSpread === "single" ? "bg-mystic-gold text-[#100b1c]" : "text-slate-300 hover:bg-white/5"}`}>Single Card</button><button onClick={() => onChooseSpread("three")} aria-pressed={readingSpread === "three"} className={`h-8 rounded-lg text-[11px] font-semibold transition ${readingSpread === "three" ? "bg-mystic-gold text-[#100b1c]" : "text-slate-300 hover:bg-white/5"}`}>Three Card</button></div><button onClick={() => { onStartReading(); setIsReadingControlsOpen(false); }} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-mystic-gold text-sm font-semibold text-[#100b1c] shadow-[0_0_24px_rgba(243,198,95,.16)] transition hover:brightness-110 active:scale-[.99]"><Sparkles className="h-4 w-4" />Draw Cards</button><button onClick={() => { setIsCardPickerOpen(true); setIsReadingControlsOpen(false); }} className="mt-1.5 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/10 text-xs font-semibold text-slate-200"><BookOpen className="h-4 w-4 text-teal-200" />Choose physical cards</button>{readingCards.length > 0 && <><div className="mt-1.5 grid grid-cols-2 gap-1.5"><button onClick={onRevealNext} disabled={readingCards.every((card) => card.isRevealed)} className="flex h-9 items-center justify-center gap-2 rounded-lg border border-mystic-gold/30 bg-mystic-gold/[0.06] text-xs font-semibold text-mystic-gold disabled:opacity-40"><Eye className="h-4 w-4" />Reveal next</button><button onClick={onRevealAll} disabled={readingCards.every((card) => card.isRevealed)} className="h-9 rounded-lg border border-white/10 text-xs font-semibold text-slate-200 disabled:opacity-40">Reveal all</button></div><button onClick={onToggleInterpretations} aria-pressed={showInterpretations} className="mt-1.5 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/10 text-xs font-semibold text-slate-200"><BookOpen className="h-4 w-4 text-teal-200" />{showInterpretations ? "Hide viewer interpretations" : "Show viewer interpretations"}</button><button onClick={onResetReading} className="mt-1.5 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-rose-300/20 text-xs font-semibold text-rose-200"><RefreshCw className="h-4 w-4" />Clear Reading</button></>}</section></div>}

      {isBroadcastInfoOpen && isBroadcaster && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setIsBroadcastInfoOpen(false)}><section role="dialog" aria-modal="true" aria-label="Edit broadcast information" onClick={(event) => event.stopPropagation()} className="w-full max-w-md space-y-4 rounded-2xl border border-mystic-gold/25 bg-[#100c18] p-5 shadow-2xl"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mystic-gold">Live broadcast</p><h2 className="font-display text-lg text-white">Edit broadcast info</h2></div><button onClick={() => setIsBroadcastInfoOpen(false)} aria-label="Close broadcast editor" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400"><X className="h-5 w-5" /></button></div><label className="block space-y-1.5 text-xs text-slate-300">Title<input value={broadcastTitle} onChange={(event) => setBroadcastTitle(event.target.value)} maxLength={80} className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-mystic-gold/70" /></label><label className="block space-y-1.5 text-xs text-slate-300">Short description<textarea value={broadcastDescription} onChange={(event) => setBroadcastDescription(event.target.value)} maxLength={140} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-mystic-gold/70" /></label><label className="block space-y-1.5 text-xs text-slate-300">Hashtags / topics<input value={broadcastHashtags} onChange={(event) => setBroadcastHashtags(event.target.value)} maxLength={100} placeholder="#Tarot #Guidance" className="mt-1 h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-mystic-gold/70" /></label><button onClick={() => { onUpdateBroadcastInfo(broadcastTitle.trim() || "Live reading", broadcastDescription.trim(), broadcastHashtags.trim()); setIsBroadcastInfoOpen(false); }} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-mystic-gold text-sm font-semibold text-[#100b1c]"><Check className="h-4 w-4" />Save changes</button></section></div>}

      {isEndConfirmationOpen && isBroadcaster && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><section role="alertdialog" aria-modal="true" aria-labelledby="end-broadcast-title" className="w-full max-w-sm rounded-2xl border border-rose-300/25 bg-[#100c18] p-5 shadow-2xl"><h2 id="end-broadcast-title" className="font-display text-lg text-white">End this broadcast?</h2><p className="mt-2 text-sm leading-relaxed text-slate-300">Viewers will leave the live room. You can start another broadcast later.</p><div className="mt-5 grid grid-cols-2 gap-2"><button onClick={() => setIsEndConfirmationOpen(false)} className="h-11 rounded-lg border border-white/15 text-sm font-semibold text-white">Keep live</button><button onClick={onEndBroadcast} className="h-11 rounded-lg bg-rose-600 text-sm font-semibold text-white">End broadcast</button></div></section></div>}

      {notice && <div role="status" className="fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-white/10 bg-[#21182c]/95 px-4 py-2 text-center text-xs text-white shadow-xl backdrop-blur-md">{notice}</div>}

      {isGiftSheetOpen && !isBroadcaster && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setIsGiftSheetOpen(false)}><section role="dialog" aria-modal="true" aria-label="Gifts and tips" onClick={(event) => event.stopPropagation()} className="max-h-[82dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-white/10 bg-[#100c18] px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl"><div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/20" /><div className="mb-4 flex items-center justify-between"><div><h2 className="font-display text-lg text-white">Send a gift or tip</h2><p className="flex items-center gap-1 text-xs text-teal-200"><Gem className="h-3.5 w-3.5" />Your balance: {formatCount(viewerGems)} Gems</p></div><button onClick={() => setIsGiftSheetOpen(false)} aria-label="Close gifts and tips" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-400"><X className="h-5 w-5" /></button></div><h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Quick gifts</h3><div className="grid grid-cols-5 gap-2">{gifts.map((gift) => <button key={gift.name} onClick={() => onSendGift(gift)} className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-1 text-center active:border-mystic-gold"><span className="text-2xl">{gift.emoji}</span><span className="text-[10px] text-white">{gift.name}</span><span className="text-[10px] text-teal-200">{gift.gems} Gems</span></button>)}</div><div className="mt-5 border-t border-white/10 pt-4"><div className="mb-2 flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-mystic-gold" /><h3 className="text-xs font-semibold text-white">Real cash tip</h3></div><p className="mb-3 text-[11px] leading-relaxed text-slate-400">Cash tips are processed through Stripe. Checkout is not connected in this demo; selecting an amount will not charge you.</p><div className="grid grid-cols-3 gap-2">{[1, 5, 10, 20, 50, 100].map((amount) => <button key={amount} onClick={() => onSendCashTip(String(amount))} className="h-10 rounded-lg border border-mystic-gold/20 bg-mystic-gold/[0.04] text-sm font-semibold text-mystic-gold">${amount}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); if (Number(customTip) > 0) onSendCashTip(customTip); }} className="mt-2 flex gap-2"><label className="sr-only" htmlFor="custom-live-tip">Custom tip amount</label><div className="flex h-11 flex-1 items-center rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-slate-300">$<input id="custom-live-tip" type="number" min="1" step="1" value={customTip} onChange={(event) => setCustomTip(event.target.value)} placeholder="Custom amount" className="ml-2 min-w-0 flex-1 bg-transparent text-white outline-none placeholder:text-slate-500" /></div><button className="rounded-lg bg-white/10 px-4 text-xs font-semibold text-white">Continue</button></form></div></section></div>}

    </section>
  );
}