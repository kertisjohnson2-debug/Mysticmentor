import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleDollarSign,
  Gamepad2,
  Gem,
  Heart,
  Leaf,
  MessageCircle,
  Music2,
  PawPrint,
  Send,
  Sparkles,
  Users,
  Video,
  X
} from "lucide-react";
import { TAROT_DECK, type TarotCard } from "../data/spiritualData";
import ImmersiveLiveRoom, { type LiveReadingCard, type LiveSpread } from "./ImmersiveLiveRoom";

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
  title: string;
  description?: string;
  hashtags?: string;
  topic: LiveTopic;
  viewers: number;
  theme: string;
  image?: string;
  lifetimeGems: number;
};

type ChatLine = { id: number; sender: string; text: string; kind?: "gift" | "system" };

const topics: { name: LiveTopic; icon: typeof Sparkles }[] = [
  { name: "Tarot & Spirituality", icon: Sparkles },
  { name: "Plants & Gardening", icon: Leaf },
  { name: "Books", icon: BookOpen },
  { name: "Pets", icon: PawPrint },
  { name: "Gaming", icon: Gamepad2 },
  { name: "Music", icon: Music2 },
  { name: "Just Chatting", icon: MessageCircle }
];

const initialBroadcasters: Broadcaster[] = [
  { id: "aster", name: "Aster Vale", avatar: "AV", title: "A gentle reading for the week ahead", topic: "Tarot & Spirituality", viewers: 742, theme: "from-[#37234f] via-[#68476a] to-[#bd7d69]", image: "/src/assets/images/mystical_tarot_reader_1790704974614.jpg", lifetimeGems: 26800 },
  { id: "fern", name: "Fern Hollow", avatar: "FH", title: "Repotting my moon garden", topic: "Plants & Gardening", viewers: 186, theme: "from-[#163b32] via-[#416b50] to-[#a0a85b]", lifetimeGems: 840 },
  { id: "nia", name: "Nia Reads", avatar: "NR", title: "Quiet chapters & rainy-day tea", topic: "Books", viewers: 319, theme: "from-[#4a2534] via-[#874957] to-[#d29b74]", lifetimeGems: 6120 },
  { id: "miso", name: "Miso & Jun", avatar: "MJ", title: "The kittens discovered the stream", topic: "Pets", viewers: 1204, theme: "from-[#593d2c] via-[#b27a47] to-[#e4c38d]", lifetimeGems: 1550 },
  { id: "pixel", name: "PixelWitch", avatar: "PW", title: "Cozy quest, no spoilers", topic: "Gaming", viewers: 528, theme: "from-[#222d59] via-[#6153a0] to-[#c56d9b]", lifetimeGems: 52800 },
  { id: "sol", name: "Sol Strings", avatar: "SS", title: "Acoustic requests by candlelight", topic: "Music", viewers: 403, theme: "from-[#3b3321] via-[#806842] to-[#d69b5d]", lifetimeGems: 10300 },
  { id: "theo", name: "Theo Afterhours", avatar: "TA", title: "What are you making tonight?", topic: "Just Chatting", viewers: 97, theme: "from-[#283846] via-[#4a6872] to-[#9eafb0]", lifetimeGems: 320 }
];

const gifts = [
  { name: "Heart", emoji: "💗", gems: 10 },
  { name: "Star", emoji: "⭐", gems: 50 },
  { name: "Rose", emoji: "🌹", gems: 100 },
  { name: "Crystal", emoji: "🔮", gems: 250 },
  { name: "Teddy", emoji: "🧸", gems: 500 }
];

const ranks = [
  { name: "New Seer", gems: 0 },
  { name: "Mystic", gems: 1000 },
  { name: "Oracle", gems: 5000 },
  { name: "High Oracle", gems: 10000 },
  { name: "Celestial Reader", gems: 25000 },
  { name: "Grand Mystic", gems: 50000 },
  { name: "Luna Master", gems: 100000 }
];

const mockChat: ChatLine[] = [
  { id: 1, sender: "moonlit.mara", text: "Just joined, this is lovely." },
  { id: 2, sender: "Juniper", text: "That really resonates, thank you." },
  { id: 3, sender: "Ari", text: "Sending good energy from Oregon." }
];

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export default function LiveCommunity({ onExit, isAuthorizedReader }: { onExit: () => void; isAuthorizedReader: boolean }) {
  const [screen, setScreen] = useState<"directory" | "setup" | "broadcast" | "viewer" | "earnings">("viewer");
  const [selectedTopic, setSelectedTopic] = useState<LiveTopic | "All">("All");
  const [selectedBroadcaster, setSelectedBroadcaster] = useState<Broadcaster>(initialBroadcasters[0]);
  const [myBroadcaster, setMyBroadcaster] = useState<Broadcaster | null>(null);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastDescription, setBroadcastDescription] = useState("");
  const [broadcastHashtags, setBroadcastHashtags] = useState("#Tarot #Spirituality #Guidance");
  const [broadcastTopic, setBroadcastTopic] = useState<LiveTopic>("Just Chatting");
  const [liveStartedAt, setLiveStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isBroadcastPaused, setIsBroadcastPaused] = useState(false);
  const [viewerGems, setViewerGems] = useState(850);
  const [giftsReceived, setGiftsReceived] = useState(0);
  const [hasCreatorAccess, setHasCreatorAccess] = useState(false);
  const [viewerCount, setViewerCount] = useState(742);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isGiftSheetOpen, setIsGiftSheetOpen] = useState(false);
  const [readingSpread, setReadingSpread] = useState<LiveSpread>("three");
  const [liveReading, setLiveReading] = useState<LiveReadingCard[]>([]);
  const [showInterpretations, setShowInterpretations] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [customTip, setCustomTip] = useState("");
  const [notice, setNotice] = useState("");
  const [chat, setChat] = useState<ChatLine[]>(mockChat);

  useEffect(() => {
    if (!liveStartedAt || isBroadcastPaused) return;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [screen, liveStartedAt, isBroadcastPaused]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const currentRank = [...ranks].reverse().find((rank) => rank.gems <= selectedBroadcaster.lifetimeGems) ?? ranks[0];
  const visibleBroadcasters = [...initialBroadcasters, ...(myBroadcaster ? [myBroadcaster] : [])]
    .filter((broadcaster) => selectedTopic === "All" || broadcaster.topic === selectedTopic);
  const readerProfile = isAuthorizedReader;

  const startBroadcast = () => {
    const newBroadcaster: Broadcaster = {
      id: "your-live",
      name: readerProfile ? "Celestial Reader" : "Kertis Johnson",
      avatar: readerProfile ? "CR" : "KJ",
      title: broadcastTitle.trim() || "A little time together in the Sanctuary",
      description: broadcastDescription.trim(),
      hashtags: broadcastHashtags.trim(),
      topic: broadcastTopic,
      viewers: 1,
      theme: readerProfile ? "from-[#37234f] via-[#68476a] to-[#bd7d69]" : "from-[#283846] via-[#4a6872] to-[#9eafb0]",
      image: readerProfile ? "/src/assets/images/mystical_tarot_reader_1790704974614.jpg" : undefined,
      lifetimeGems: readerProfile ? 26800 : 320
    };
    setMyBroadcaster(newBroadcaster);
    setSelectedBroadcaster(newBroadcaster);
    setViewerCount(1);
    setGiftsReceived(0);
    setLiveReading([]);
    setReadingSpread("three");
    setShowInterpretations(true);
    setHasCreatorAccess(true);
    setElapsedSeconds(0);
    setLiveStartedAt(Date.now());
    setIsBroadcastPaused(false);
    setChat([{ id: Date.now(), sender: "Sanctuary", text: "Your broadcast is live.", kind: "system" }]);
    setScreen("broadcast");
  };

  const endBroadcast = () => {
    setIsBroadcastPaused(false);
    setLiveStartedAt(null);
    setMyBroadcaster(null);
    setScreen("directory");
    setNotice("Your broadcast has ended.");
  };

  const sendGift = (gift: typeof gifts[number]) => {
    if (viewerGems < gift.gems) {
      setNotice("Not enough Gems for this gift.");
      return;
    }
    setViewerGems((balance) => balance - gift.gems);
    setGiftsReceived((total) => total + gift.gems);
    setChat((messages) => [...messages, { id: Date.now(), sender: "Kertis", text: `sent a ${gift.name} ${gift.emoji} — ${gift.gems} Gems`, kind: "gift" }]);
    setIsGiftSheetOpen(false);
    setNotice(`${gift.name} sent to ${selectedBroadcaster.name}`);
  };

  const sendCashTip = (amount: string) => {
    setNotice(`Stripe checkout is not connected. No $${amount} tip was charged.`);
    setIsGiftSheetOpen(false);
  };

  const sendChat = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message) return;
    setChat((messages) => [...messages, { id: Date.now(), sender: "Kertis", text: message }]);
    setChatInput("");
  };

  const showHeart = () => {
    setNotice("Heart sent");
    setChat((messages) => [...messages, { id: Date.now(), sender: "Kertis", text: "sent a heart 💗", kind: "gift" }]);
  };

  const publishLiveReading = (cards: TarotCard[]) => {
    setLiveReading(cards.map((card) => ({
      card,
      isReversed: Math.random() > 0.7,
      isRevealed: false
    })));
    setShowInterpretations(true);
    setChat((messages) => [...messages, { id: Date.now(), sender: "Celestial Reader", text: `began a ${cards.length === 1 ? "one-card" : "Past · Present · Future"} reading`, kind: "system" }]);
  };

  const startLiveReading = () => {
    const availableCards = TAROT_DECK.filter((card) => !card.isHidden);
    const shuffledCards = [...availableCards];
    for (let index = shuffledCards.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffledCards[index], shuffledCards[swapIndex]] = [shuffledCards[swapIndex], shuffledCards[index]];
    }
    const count = readingSpread === "single" ? 1 : 3;
    publishLiveReading(shuffledCards.slice(0, count));
  };

  const startSelectedLiveReading = (cardIds: number[]) => {
    const count = readingSpread === "single" ? 1 : 3;
    if (cardIds.length !== count || new Set(cardIds).size !== count) return;
    const selectedCards = cardIds.slice(0, count).map((id) => TAROT_DECK.find((card) => card.id === id && !card.isHidden));
    if (selectedCards.length !== count || selectedCards.some((card) => !card)) return;
    publishLiveReading(selectedCards as TarotCard[]);
  };

  const revealLiveCard = (index: number) => {
    const readingCard = liveReading[index];
    if (!readingCard || readingCard.isRevealed) return;
    setLiveReading((cards) => cards.map((card, cardIndex) => cardIndex === index ? { ...card, isRevealed: true } : card));
    const position = readingSpread === "single" ? "Guidance" : ["Past", "Present", "Future"][index];
    setChat((messages) => [...messages, { id: Date.now(), sender: "Celestial Reader", text: `revealed ${readingCard.card.name} (${readingCard.isReversed ? "Reversed" : "Upright"}) in ${position}`, kind: "system" }]);
  };

  const revealNextLiveCard = () => {
    const index = liveReading.findIndex((card) => !card.isRevealed);
    if (index >= 0) revealLiveCard(index);
  };

  const revealAllLiveCards = () => {
    if (liveReading.every((card) => card.isRevealed)) return;
    setLiveReading((cards) => cards.map((card) => ({ ...card, isRevealed: true })));
    setChat((messages) => [...messages, { id: Date.now(), sender: "Celestial Reader", text: "revealed the full spread", kind: "system" }]);
  };

  const resetLiveReading = () => setLiveReading([]);

  const videoSurface = (broadcaster: Broadcaster, large = false, showChatOverlay = false) => (
    <div className={`relative isolate overflow-hidden bg-gradient-to-br ${broadcaster.theme} ${large ? "aspect-[4/5]" : "aspect-video"}`}>
      {broadcaster.image && <img src={broadcaster.image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-75" />}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_22%,rgba(255,255,255,.28),transparent_24%),linear-gradient(180deg,transparent_35%,rgba(8,6,16,.78))]" />
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />Live</div>
      <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded bg-black/55 px-2 py-1 text-[11px] text-white backdrop-blur-sm"><Users className="h-3.5 w-3.5" />{formatCount(broadcaster.id === "your-live" ? viewerCount : broadcaster.viewers)}</div>
      {showChatOverlay && <div className="absolute bottom-16 left-3 right-3 space-y-1.5">{chat.slice(-3).map((line) => <p key={line.id} className="w-fit max-w-full rounded bg-black/45 px-2 py-1 text-xs text-white shadow-sm backdrop-blur-sm"><strong className="mr-1">{line.sender}</strong>{line.text}</p>)}</div>}
      <div className="absolute bottom-0 left-0 right-0 p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/75">{broadcaster.topic}</p><h2 className={`${large ? "text-xl" : "text-base"} mt-1 font-display font-semibold text-white`}>{broadcaster.title}</h2></div>
    </div>
  );

  const backButton = (action: () => void, label = "Back") => <button onClick={action} aria-label={label} className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white active:scale-95"><ArrowLeft className="h-5 w-5" /></button>;

  if (screen === "directory") {
    return (
      <section className="mx-auto min-h-[calc(100dvh-9rem)] max-w-2xl space-y-5 pb-5 text-slate-100">
        <header className="flex items-center justify-between">{backButton(onExit, "Return to the Sanctuary")}<div className="text-center"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">Celestial Sanctuary</p><h1 className="font-display text-xl font-semibold text-white">Live Circle</h1></div><button onClick={() => setScreen("setup")} aria-label="Go live" className="flex h-11 w-11 items-center justify-center rounded-full bg-mystic-gold text-[#100b1c] shadow-[0_0_22px_rgba(243,198,95,.18)] active:scale-95"><Video className="h-5 w-5" /></button></header>
        <button onClick={() => setScreen("setup")} className="flex w-full items-center justify-between rounded-xl border border-mystic-gold/40 bg-gradient-to-r from-mystic-gold/15 to-transparent px-4 py-3 text-left"><span><strong className="block font-display text-sm text-mystic-gold">Go live</strong><span className="text-xs text-slate-400">Start a broadcast with your community</span></span><ChevronRight className="h-5 w-5 text-mystic-gold" /></button>
        <section><div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300">Live now</p><h2 className="font-display text-lg text-white">Find your people</h2></div>{hasCreatorAccess && <button onClick={() => setScreen("earnings")} className="flex items-center gap-1 text-xs text-slate-400 hover:text-mystic-gold"><BarChart3 className="h-4 w-4" />Creator</button>}</div>
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1"><button onClick={() => setSelectedTopic("All")} className={`shrink-0 rounded-full border px-3 py-2 text-xs ${selectedTopic === "All" ? "border-mystic-gold bg-mystic-gold text-[#100b1c]" : "border-white/10 bg-white/5 text-slate-300"}`}>All</button>{topics.map(({ name, icon: Icon }) => <button key={name} onClick={() => setSelectedTopic(name)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs ${selectedTopic === name ? "border-mystic-gold bg-mystic-gold text-[#100b1c]" : "border-white/10 bg-white/5 text-slate-300"}`}><Icon className="h-3.5 w-3.5" />{name}</button>)}</div>
          <div className="grid gap-4 sm:grid-cols-2">{visibleBroadcasters.map((broadcaster) => <button key={broadcaster.id} onClick={() => { setSelectedBroadcaster(broadcaster); setViewerCount(broadcaster.id === "your-live" ? viewerCount : broadcaster.viewers); setIsFollowing(false); if (broadcaster.id === "your-live") { setScreen("broadcast"); } else { setChat(mockChat); setScreen("viewer"); } }} className="overflow-hidden rounded-xl border border-white/10 bg-[#120d20] text-left transition-colors hover:border-mystic-gold/50">{videoSurface(broadcaster)}<div className="flex items-center gap-3 p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-mystic-gold/40 bg-[#39264a] font-display text-xs text-mystic-gold">{broadcaster.avatar}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{broadcaster.name}</div><p className="truncate text-xs text-slate-400">{broadcaster.title}</p></div><div className="flex items-center gap-1 text-xs text-slate-400"><Users className="h-3.5 w-3.5" />{formatCount(broadcaster.id === "your-live" ? viewerCount : broadcaster.viewers)}</div></div></button>)}{visibleBroadcasters.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-400">No one is live in this topic right now.</p>}</div>
        </section>
      </section>
    );
  }

  if (screen === "setup") {
    return (
      <section className="mx-auto max-w-lg space-y-6 pb-8 text-slate-100">
        <header className="flex items-center gap-3">{backButton(() => setScreen("directory"))}<div><p className="text-[10px] uppercase tracking-[0.18em] text-teal-300">Your broadcast</p><h1 className="font-display text-xl text-white">Set the intention</h1></div></header>
        <label className="block space-y-2"><span className="text-xs font-semibold text-slate-300">Broadcast title</span><input value={broadcastTitle} onChange={(event) => setBroadcastTitle(event.target.value)} maxLength={80} placeholder="What are we sharing today?" className="h-12 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-mystic-gold/70" /></label>
        <label className="block space-y-2"><span className="text-xs font-semibold text-slate-300">Short description</span><textarea value={broadcastDescription} onChange={(event) => setBroadcastDescription(event.target.value)} maxLength={140} rows={2} placeholder="A little context for your viewers" className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-mystic-gold/70" /></label>
        <label className="block space-y-2"><span className="text-xs font-semibold text-slate-300">Hashtags / topics</span><input value={broadcastHashtags} onChange={(event) => setBroadcastHashtags(event.target.value)} maxLength={100} placeholder="#Tarot #Guidance" className="h-12 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-mystic-gold/70" /></label>
        <label className="block space-y-2"><span className="text-xs font-semibold text-slate-300">Topic</span><select value={broadcastTopic} onChange={(event) => setBroadcastTopic(event.target.value as LiveTopic)} className="h-12 w-full rounded-lg border border-white/10 bg-[#171122] px-3 text-sm text-white outline-none focus:border-mystic-gold/70">{topics.map(({ name }) => <option key={name} value={name}>{name}</option>)}</select></label>
        <div className="border-y border-white/10 py-4"><h2 className="text-sm font-semibold text-white">Host profile</h2><p className="mt-1 text-xs text-slate-400">{readerProfile ? "Authorized Celestial Sanctuary Reader" : "Community host · Tarot broadcaster tools unavailable"}</p></div>
        <button onClick={startBroadcast} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-mystic-gold font-semibold text-[#100b1c] active:scale-[0.99]"><Video className="h-4 w-4" />Start Live</button>
      </section>
    );
  }

  if (screen === "earnings") {
    const stats = [["Today's earnings", "$86.50"], ["This week", "$412.00"], ["This month", "$1,284.75"], ["Total earnings", "$8,640.25"], ["Tips", "$530.00"], ["Gift / Gem earnings", "$754.75"], ["Pending balance", "$145.00"], ["Available balance", "$1,139.75"]];
    return (
      <section className="mx-auto max-w-lg space-y-5 pb-8 text-slate-100"><header className="flex items-center gap-3">{backButton(() => setScreen("directory"))}<div><p className="text-[10px] uppercase tracking-[0.18em] text-teal-300">Private creator view</p><h1 className="font-display text-xl text-white">Earnings overview</h1></div></header><div className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-white/10 py-5">{stats.map(([label, value]) => <div key={label}><p className="text-xs text-slate-400">{label}</p><strong className="mt-1 block font-display text-lg text-mystic-gold">{value}</strong></div>)}</div><section><h2 className="mb-3 text-sm font-semibold text-white">Payout history</h2><div className="divide-y divide-white/10">{[["Sep 28, 2026", "$240.00", "Paid"], ["Sep 14, 2026", "$185.50", "Paid"], ["Aug 31, 2026", "$312.00", "Paid"]].map(([date, amount, status]) => <div key={date} className="flex items-center justify-between py-3 text-sm"><span className="text-slate-300">{date}</span><span className="font-medium text-white">{amount}</span><span className="text-xs text-teal-300">{status}</span></div>)}</div></section><p className="text-xs text-slate-500">Example figures only. Payouts are not enabled.</p></section>
    );
  }

  const isBroadcaster = screen === "broadcast";
  const canUseTarot = isBroadcaster && readerProfile;

  if (isBroadcaster || screen === "viewer") {
    return (
      <ImmersiveLiveRoom
        broadcaster={selectedBroadcaster}
        isBroadcaster={isBroadcaster}
        isPaused={isBroadcastPaused}
        canUseTarot={canUseTarot}
        currentRank={currentRank.name}
        elapsedSeconds={elapsedSeconds}
        viewerCount={viewerCount}
        giftsReceived={giftsReceived}
        isFollowing={isFollowing}
        readingSpread={readingSpread}
        readingCards={liveReading}
        showInterpretations={showInterpretations}
        onBrowse={() => setScreen("directory")}
        onStartBroadcast={() => setScreen("setup")}
        onEarnings={() => setScreen("earnings")}
        onEndBroadcast={endBroadcast}
        onTogglePause={() => setIsBroadcastPaused((paused) => !paused)}
        onUpdateBroadcastInfo={(title, description, hashtags) => {
          const updatedBroadcaster = { ...selectedBroadcaster, title, description, hashtags };
          setSelectedBroadcaster(updatedBroadcaster);
          if (updatedBroadcaster.id === "your-live") setMyBroadcaster(updatedBroadcaster);
          setBroadcastTitle(title);
          setBroadcastDescription(description);
          setBroadcastHashtags(hashtags);
        }}
        onToggleFollow={() => setIsFollowing((following) => !following)}
        onHeart={showHeart}
        onChooseSpread={(spread) => {
          setReadingSpread(spread);
          setLiveReading([]);
        }}
        onStartReading={startLiveReading}
        onDrawSelectedCards={startSelectedLiveReading}
        onFlipLiveCard={revealLiveCard}
        onRevealNext={revealNextLiveCard}
        onRevealAll={revealAllLiveCards}
        onResetReading={resetLiveReading}
        onToggleInterpretations={() => setShowInterpretations((visible) => !visible)}
        chat={chat}
        chatInput={chatInput}
        setChatInput={setChatInput}
        onSendChat={sendChat}
        onShare={async () => {
          if (typeof navigator.share === "function") {
            try {
              await navigator.share({ title: selectedBroadcaster.title, text: selectedBroadcaster.description || selectedBroadcaster.title, url: window.location.href });
            } catch (error) {
              if (error instanceof DOMException && error.name === "AbortError") return;
              setNotice("Unable to share this broadcast.");
            }
            return;
          }
          try {
            await navigator.clipboard.writeText(window.location.href);
            setNotice("Broadcast link copied.");
          } catch {
            setNotice("Unable to share this broadcast.");
          }
        }}
        notice={notice}
        viewerGems={viewerGems}
        onSendGift={sendGift}
        onSendCashTip={sendCashTip}
        customTip={customTip}
        setCustomTip={setCustomTip}
        isGiftSheetOpen={isGiftSheetOpen}
        setIsGiftSheetOpen={setIsGiftSheetOpen}
      />
    );
  }

}