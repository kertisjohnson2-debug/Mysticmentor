import { useEffect, useMemo, useRef, useState } from "react";
import { collection, deleteDoc, doc, getDoc, limitToLast, onSnapshot, orderBy, query, setDoc, where } from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { auth, db } from "../firebase";
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
  RefreshCw,
  Send,
  Sparkles,
  Users,
  Video,
  X
} from "lucide-react";
import { createLiveAvatarThumbnail } from "../lib/avatarImage";
import { requestNotification } from "../lib/notifications";
import { eventsRef, useLiveBroadcast, useLiveViewer, type LiveSessionMeta } from "../lib/liveVideo";
import { TAROT_DECK, type TarotCard } from "../data/spiritualData";
import ImmersiveLiveRoom, { type LiveReadingCard, type LiveSpread } from "./ImmersiveLiveRoom";
import NotificationBell from "./NotificationBell";

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
  profileUid?: string;
  name: string;
  avatar: string;
  title: string;
  description?: string;
  hashtags?: string;
  topic: LiveTopic;
  viewers: number;
  theme: string;
  image?: string;
  avatarUrl?: string;
};

type RemoteReading = {
  broadcasterUid: string;
  name: string;
  avatar: string;
  title: string;
  description?: string;
  hashtags?: string;
  topic: LiveTopic;
  isPaused: boolean;
  spread: LiveSpread;
  cards: { id: number; reversed: boolean; revealed: boolean }[];
  showInterpretations: boolean;
  updatedAt: number;
};

type LiveSessionDoc = LiveSessionMeta & { ownerUid: string; sessionId: string; startedAt: number; updatedAt: number };
type BroadcasterEarnings = {
  totalGemsEarned: number;
  todayGemsEarned: number;
  lifetimeGemsEarned: number;
  transactions: { id: string; date: string; viewerName: string; gemsAmount: number; status: string }[];
};

// A published broadcast is considered live while its heartbeat is recent
const BROADCAST_HEARTBEAT_MS = 30000;
const BROADCAST_STALE_MS = 90000;

type ChatLine = { id: number | string; sender: string; senderUid?: string; avatarUrl?: string; text: string; kind?: "gift" | "system" };

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
  { id: "aster", name: "Aster Vale", avatar: "AV", title: "A gentle reading for the week ahead", topic: "Tarot & Spirituality", viewers: 742, theme: "from-[#37234f] via-[#68476a] to-[#bd7d69]", image: "/src/assets/images/mystical_tarot_reader_1790704974614.jpg" },
  { id: "fern", name: "Fern Hollow", avatar: "FH", title: "Repotting my moon garden", topic: "Plants & Gardening", viewers: 186, theme: "from-[#163b32] via-[#416b50] to-[#a0a85b]" },
  { id: "nia", name: "Nia Reads", avatar: "NR", title: "Quiet chapters & rainy-day tea", topic: "Books", viewers: 319, theme: "from-[#4a2534] via-[#874957] to-[#d29b74]" },
  { id: "miso", name: "Miso & Jun", avatar: "MJ", title: "The kittens discovered the stream", topic: "Pets", viewers: 1204, theme: "from-[#593d2c] via-[#b27a47] to-[#e4c38d]" },
  { id: "pixel", name: "PixelWitch", avatar: "PW", title: "Cozy quest, no spoilers", topic: "Gaming", viewers: 528, theme: "from-[#222d59] via-[#6153a0] to-[#c56d9b]" },
  { id: "sol", name: "Sol Strings", avatar: "SS", title: "Acoustic requests by candlelight", topic: "Music", viewers: 403, theme: "from-[#3b3321] via-[#806842] to-[#d69b5d]" },
  { id: "theo", name: "Theo Afterhours", avatar: "TA", title: "What are you making tonight?", topic: "Just Chatting", viewers: 97, theme: "from-[#283846] via-[#4a6872] to-[#9eafb0]" }
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

export default function LiveCommunity({ onExit, isAuthorizedReader, currentUserId, displayName, avatarUrl, gemBalance, onViewMemberProfile }: { onExit: () => void; isAuthorizedReader: boolean; currentUserId: string | null; displayName?: string; avatarUrl?: string; gemBalance: number; onViewMemberProfile: (uid: string) => void }) {
  const [screen, setScreen] = useState<"directory" | "setup" | "broadcast" | "viewer" | "earnings">("viewer");
  const [selectedTopic, setSelectedTopic] = useState<LiveTopic | "All">("All");
  const [selectedBroadcaster, setSelectedBroadcaster] = useState<Broadcaster>(initialBroadcasters[0]);
  const [myBroadcaster, setMyBroadcaster] = useState<Broadcaster | null>(null);
  const chatAvatarCache = useRef(new Map<string, string | null>());
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastDescription, setBroadcastDescription] = useState("");
  const [broadcastHashtags, setBroadcastHashtags] = useState("#Tarot #Spirituality #Guidance");
  const [broadcastTopic, setBroadcastTopic] = useState<LiveTopic>("Just Chatting");
  const [liveStartedAt, setLiveStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isBroadcastPaused, setIsBroadcastPaused] = useState(false);
  const viewerGems = gemBalance;
  const [lifetimeGemsReceived, setLifetimeGemsReceived] = useState(0);
  const [giftsReceived, setGiftsReceived] = useState(0);
  const [hasCreatorAccess, setHasCreatorAccess] = useState(false);
  const [earnings, setEarnings] = useState<BroadcasterEarnings | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsError, setEarningsError] = useState("");
  const [earningsRefresh, setEarningsRefresh] = useState(0);
  const [viewerCount, setViewerCount] = useState(742);
  const [followedUids, setFollowedUids] = useState<Record<string, boolean>>({});
  const [isGiftSheetOpen, setIsGiftSheetOpen] = useState(false);
  const [readingSpread, setReadingSpread] = useState<LiveSpread>("three");
  const [liveReading, setLiveReading] = useState<LiveReadingCard[]>([]);
  const [showInterpretations, setShowInterpretations] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [customTip, setCustomTip] = useState("");
  const [notice, setNotice] = useState("");
  const [chat, setChat] = useState<ChatLine[]>(mockChat);
  const [viewerReturn, setViewerReturn] = useState<"directory" | "exit">("exit");
  const [remoteReadings, setRemoteReadings] = useState<RemoteReading[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSessionDoc[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const [guestUid, setGuestUid] = useState<string | null>(null);
  const [guestAuthUnavailable, setGuestAuthUnavailable] = useState(false);
  const [directoryError, setDirectoryError] = useState(false);

  useEffect(() => {
    if (screen !== "earnings") return;
    let cancelled = false;
    setEarnings(null);
    setEarningsError("");
    setEarningsLoading(true);
    void (async () => {
      const user = auth.currentUser;
      if (!user || user.isAnonymous || user.uid !== currentUserId) {
        throw new Error("Sign in with your broadcaster account to view earnings.");
      }
      const token = await user.getIdToken();
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const response = await fetch(`/api/live/earnings?timeZone=${encodeURIComponent(timeZone)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load broadcaster earnings.");
      return data as BroadcasterEarnings;
    })().then((data) => {
      if (!cancelled) setEarnings(data);
    }).catch((error) => {
      if (!cancelled) setEarningsError(error instanceof Error ? error.message : "Could not load broadcaster earnings.");
    }).finally(() => {
      if (!cancelled) setEarningsLoading(false);
    });
    return () => { cancelled = true; };
  }, [screen, currentUserId, earningsRefresh]);

  // Signed-out visitors get an anonymous, viewer-only Firebase identity (own UID, no profile doc)
  useEffect(() => {
    if (currentUserId) { setGuestUid(null); return; }
    let cancelled = false;
    (async () => {
      // Wait for Firebase to restore any saved session so a real member is never replaced
      await auth.authStateReady();
      if (cancelled) return;
      const existing = auth.currentUser;
      if (existing) {
        if (existing.isAnonymous) setGuestUid(existing.uid);
        return;
      }
      const credential = await signInAnonymously(auth);
      if (!cancelled) setGuestUid(credential.user.uid);
    })().catch((error) => {
      console.error("Anonymous Live viewing is unavailable:", error);
      if (!cancelled) setGuestAuthUnavailable(true);
    });
    return () => { cancelled = true; };
  }, [currentUserId]);
  const viewerUid = currentUserId ?? guestUid;

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

  const currentRank = [...ranks].reverse().find((rank) => rank.gems <= lifetimeGemsReceived) ?? ranks[0];
  const readerProfile = isAuthorizedReader;
  const tarotAllowed = readerProfile && screen === "broadcast";
  const isLiveNow = Boolean(myBroadcaster && liveStartedAt);
  const canPublish = isLiveNow && readerProfile && Boolean(currentUserId);

  const toBroadcaster = (remote: LiveSessionDoc): Broadcaster => ({
    id: `live-${remote.ownerUid}`,
    profileUid: remote.ownerUid,
    name: remote.name || "Live broadcaster",
    avatar: remote.avatar || "LV",
    avatarUrl: remote.avatarUrl || undefined,
    title: remote.title || "Live now",
    description: remote.description,
    hashtags: remote.hashtags,
    topic: (topics.some((item) => item.name === remote.topic) ? remote.topic : "Just Chatting") as LiveTopic,
    viewers: 1,
    theme: "from-[#37234f] via-[#68476a] to-[#bd7d69]",
    image: "/src/assets/images/mystical_tarot_reader_1790704974614.jpg"
  });

  // One card per broadcaster (newest session), excluding the viewer's own broadcast
  const liveRemotes = useMemo(() => {
    const newest = new Map<string, LiveSessionDoc>();
    liveSessions
      .filter((session) => session.ownerUid !== viewerUid && clock - (session.updatedAt ?? session.startedAt) < BROADCAST_STALE_MS)
      .forEach((session) => {
        const current = newest.get(session.ownerUid);
        if (!current || session.startedAt > current.startedAt) newest.set(session.ownerUid, session);
      });
    return Array.from(newest.values()).sort((x, y) => y.startedAt - x.startedAt);
  }, [liveSessions, viewerUid, clock]);
  const activeSession = selectedBroadcaster.id.startsWith("live-")
    ? liveRemotes.find((session) => `live-${session.ownerUid}` === selectedBroadcaster.id)
    : undefined;
  const activeRemote = activeSession
    ? remoteReadings.find((reading) => reading.broadcasterUid === activeSession.ownerUid && clock - reading.updatedAt < BROADCAST_STALE_MS)
    : undefined;
  // Follows live at users/{followerUid}/following/{broadcasterUid}; only real signed-in members can follow
  const followTargetUid = activeSession?.ownerUid ?? null;
  // Rank source: server-written lifetime total for the broadcaster being shown
  const rankOwnerUid = screen === "broadcast" ? currentUserId : activeSession?.ownerUid ?? null;
  useEffect(() => {
    setLifetimeGemsReceived(0);
    if (!rankOwnerUid) return;
    return onSnapshot(doc(db, "broadcasterStats", rankOwnerUid), (snap) => {
      setLifetimeGemsReceived(Number(snap.data()?.lifetimeGemsReceived) || 0);
    }, () => setLifetimeGemsReceived(0));
  }, [rankOwnerUid]);
  useEffect(() => {
    if (!currentUserId || !followTargetUid || followTargetUid === currentUserId) return;
    return onSnapshot(
      doc(db, "users", currentUserId, "following", followTargetUid),
      (snapshot) => setFollowedUids((current) => ({ ...current, [followTargetUid]: snapshot.exists() })),
      (error) => console.error("Could not load follow state:", error)
    );
  }, [currentUserId, followTargetUid]);
  useEffect(() => { setFollowedUids({}); }, [currentUserId]);
  const isFollowing = Boolean(followTargetUid && followedUids[followTargetUid]);
  const toggleFollow = async () => {
    if (!currentUserId) { setNotice("Sign in to follow broadcasters."); return; }
    if (!followTargetUid || followTargetUid === currentUserId) return;
    const followRef = doc(db, "users", currentUserId, "following", followTargetUid);
    try {
      if (isFollowing) await deleteDoc(followRef);
      else {
        await setDoc(followRef, { broadcasterUid: followTargetUid, followedAt: Date.now() });
        requestNotification("/api/notify-follow", { broadcasterUid: followTargetUid });
      }
    } catch (error) {
      console.error("Could not update follow:", error);
      setNotice("Could not update follow. Please try again.");
    }
  };
  const remoteReadingCards: LiveReadingCard[] = (activeRemote?.cards ?? []).flatMap((entry) => {
    const card = TAROT_DECK.find((item) => item.id === entry.id && !item.isHidden);
    return card ? [{ card, isReversed: entry.reversed, isRevealed: entry.revealed }] : [];
  });
  const visibleBroadcasters = [...(myBroadcaster && isLiveNow ? [myBroadcaster] : []), ...liveRemotes.map(toBroadcaster)]
    .filter((broadcaster) => selectedTopic === "All" || broadcaster.topic === selectedTopic);

  // Real device-to-device video. The broadcaster's camera stays on while live, even when browsing other screens
  const [liveAvatarThumb, setLiveAvatarThumb] = useState("");
  useEffect(() => {
    let cancelled = false;
    setLiveAvatarThumb("");
    if (!currentUserId || !avatarUrl) return;
    createLiveAvatarThumbnail(avatarUrl).then((thumb) => { if (!cancelled) setLiveAvatarThumb(thumb); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [currentUserId, avatarUrl]);
  const broadcastVideo = useLiveBroadcast(currentUserId, Boolean(currentUserId) && isLiveNow, isBroadcastPaused, myBroadcaster ? {
    name: myBroadcaster.name.slice(0, 80),
    avatar: myBroadcaster.avatar.slice(0, 8),
    avatarUrl: liveAvatarThumb,
    title: myBroadcaster.title.slice(0, 200),
    description: (myBroadcaster.description ?? "").slice(0, 1000),
    hashtags: (myBroadcaster.hashtags ?? "").slice(0, 300),
    topic: myBroadcaster.topic
  } : undefined);
  const viewerBroadcasterUid = screen === "viewer" ? activeSession?.ownerUid ?? null : null;
  const viewerVideo = useLiveViewer(viewerBroadcasterUid, viewerUid, Boolean(viewerBroadcasterUid));

  // Chat and hearts are shared through liveSessions/{sessionId}/events, scoped to the session being viewed
  const activeEventsSessionId = screen === "broadcast" ? broadcastVideo.sessionId : screen === "viewer" ? viewerVideo.sessionId : null;
  useEffect(() => {
    if (!viewerUid || !activeEventsSessionId) return;
    const seen = new Set<string>();
    const listenStartedAt = Date.now() - 5000;
    const unsubscribe = onSnapshot(query(eventsRef(activeEventsSessionId), orderBy("createdAt"), limitToLast(50)), (snapshot) => {
      const lines: ChatLine[] = [];
      snapshot.docChanges().forEach((change) => {
        if (change.type !== "added" || seen.has(change.doc.id)) return;
        seen.add(change.doc.id);
        const data = change.doc.data();
        if (typeof data.sender !== "string" || typeof data.text !== "string") return;
        const senderUid = typeof data.uid === "string" ? data.uid : undefined;
        const eventAvatarUrl = typeof data.avatarUrl === "string" && data.avatarUrl ? data.avatarUrl : undefined;
        if (senderUid && eventAvatarUrl) chatAvatarCache.current.set(senderUid, eventAvatarUrl);
        lines.push({ id: `event-${change.doc.id}`, sender: data.sender, senderUid, avatarUrl: eventAvatarUrl ?? (senderUid ? chatAvatarCache.current.get(senderUid) ?? undefined : undefined), text: data.text, kind: data.kind === "heart" || data.kind === "gift" || data.kind === "tip" ? "gift" : undefined });
        if (senderUid && !eventAvatarUrl && !chatAvatarCache.current.has(senderUid)) {
          chatAvatarCache.current.set(senderUid, null);
          getDoc(doc(db, "users", senderUid))
            .then((profileSnapshot) => {
              const profileAvatarUrl = typeof profileSnapshot.data()?.avatarUrl === "string" ? profileSnapshot.data()!.avatarUrl : null;
              chatAvatarCache.current.set(senderUid, profileAvatarUrl);
              if (profileAvatarUrl) {
                setChat((messages) => messages.map((message) => message.senderUid === senderUid && !message.avatarUrl ? { ...message, avatarUrl: profileAvatarUrl } : message));
              }
            })
            .catch((error) => console.error("Could not load chat sender profile:", error));
        }
        // The broadcaster's gift total only counts new gifts from other people, never history or their own echo
        if (screen === "broadcast" && data.kind === "gift" && data.uid !== viewerUid && typeof data.amount === "number" && data.createdAt >= listenStartedAt) {
          setGiftsReceived((total) => total + data.amount);
        }
      });
      if (lines.length) setChat((messages) => [...messages, ...lines]);
    }, (error) => console.error("Failed to sync live chat:", error));
    return unsubscribe;
  }, [viewerUid, activeEventsSessionId, screen]);

  const publishLiveEvent = (kind: "chat" | "heart" | "gift" | "tip", text: string, amount?: number) => {
    if (!viewerUid || !activeEventsSessionId) {
      setNotice("Live chat is still connecting. Try again in a moment.");
      return false;
    }
    const eventId = (crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, "");
    setDoc(doc(eventsRef(activeEventsSessionId), eventId), {
      uid: viewerUid,
      sender: (displayName?.trim() || "Guest").slice(0, 80),
      ...(avatarUrl ? { avatarUrl } : {}),
      text: text.slice(0, 300),
      kind,
      ...(amount === undefined ? {} : { amount }),
      createdAt: Date.now()
    }).catch((error) => { console.error("Failed to send live event:", error); setNotice("Could not send. Please try again."); });
    return true;
  };

  // Active broadcasts come from liveSessions (the same docs the video connection uses)
  useEffect(() => {
    if (!viewerUid) return;
    const unsubscribe = onSnapshot(query(collection(db, "liveSessions"), where("status", "==", "live")), (snapshot) => {
      setDirectoryError(false);
      setLiveSessions(snapshot.docs.map((item) => item.data() as LiveSessionDoc));
    }, (error) => {
      console.error("Failed to sync live sessions:", error);
      setDirectoryError(true);
    });
    return unsubscribe;
  }, [viewerUid]);

  // Viewers receive every broadcaster's published Tarot state in real time
  useEffect(() => {
    if (!viewerUid) return;
    const unsubscribe = onSnapshot(collection(db, "liveReadings"), (snapshot) => {
      setRemoteReadings(snapshot.docs.map((item) => item.data() as RemoteReading));
    }, (error) => console.error("Failed to sync live broadcasts:", error));
    const tick = window.setInterval(() => setClock(Date.now()), 15000);
    return () => { unsubscribe(); window.clearInterval(tick); };
  }, [viewerUid]);

  // A Tarot-permitted broadcaster publishes the shared reading state (rules re-check the permission)
  useEffect(() => {
    if (!canPublish || !currentUserId || !myBroadcaster) return;
    const publish = () => setDoc(doc(db, "liveReadings", currentUserId), {
      broadcasterUid: currentUserId,
      name: myBroadcaster.name,
      avatar: myBroadcaster.avatar,
      title: myBroadcaster.title,
      description: myBroadcaster.description ?? "",
      hashtags: myBroadcaster.hashtags ?? "",
      topic: myBroadcaster.topic,
      isPaused: isBroadcastPaused,
      spread: readingSpread,
      cards: liveReading.map((item) => ({ id: item.card.id, reversed: item.isReversed, revealed: item.isRevealed })),
      showInterpretations,
      updatedAt: Date.now()
    }).catch((error) => console.error("Failed to publish live reading:", error));
    publish();
    const heartbeat = window.setInterval(publish, BROADCAST_HEARTBEAT_MS);
    return () => window.clearInterval(heartbeat);
  }, [canPublish, currentUserId, myBroadcaster, isBroadcastPaused, readingSpread, liveReading, showInterpretations]);

  // Remove the published broadcast when it ends, the permission is revoked, or the room unmounts
  useEffect(() => {
    if (!canPublish || !currentUserId) return;
    return () => { deleteDoc(doc(db, "liveReadings", currentUserId)).catch(() => undefined); };
  }, [canPublish, currentUserId]);

  // A remote broadcast that stops publishing sends viewers back to Browse
  useEffect(() => {
    if (screen === "viewer" && selectedBroadcaster.id.startsWith("live-") && !activeSession) {
      setScreen("directory");
      setNotice("That broadcast has ended.");
    }
  }, [screen, selectedBroadcaster.id, activeSession]);

  // Revoking Tarot Reader mid-broadcast removes any reading from the stream
  useEffect(() => {
    if (!isAuthorizedReader) setLiveReading([]);
  }, [isAuthorizedReader]);

  const startBroadcast = () => {
    // Guests (anonymous) are viewers only
    if (!currentUserId) {
      setNotice("Sign in to start a broadcast.");
      return;
    }
    const chosenName = displayName?.trim();
    const newBroadcaster: Broadcaster = {
      id: "your-live",
      name: chosenName || (readerProfile ? "Celestial Reader" : "Kertis Johnson"),
      avatar: chosenName ? chosenName.slice(0, 2).toUpperCase() : readerProfile ? "CR" : "KJ",
      title: broadcastTitle.trim() || "A little time together in the Sanctuary",
      description: broadcastDescription.trim(),
      hashtags: broadcastHashtags.trim(),
      topic: broadcastTopic,
      viewers: 1,
      theme: readerProfile ? "from-[#37234f] via-[#68476a] to-[#bd7d69]" : "from-[#283846] via-[#4a6872] to-[#9eafb0]",
      image: readerProfile ? "/src/assets/images/mystical_tarot_reader_1790704974614.jpg" : undefined
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

  const sendGift = async (gift: typeof gifts[number]) => {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
      setNotice("Sign in to send gifts.");
      return;
    }
    if (screen !== "viewer" || !activeSession) {
      setNotice("Gifts can only be sent to a live broadcaster.");
      return;
    }
    if (viewerGems < gift.gems) {
      setNotice("Not enough Gems for this gift.");
      return;
    }
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/spend-gems", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ context: "live", giftId: gift.name.toLowerCase(), recipientId: activeSession.ownerUid, sessionId: activeSession.sessionId })
      });
      if (!response.ok) throw new Error("Gift was not confirmed");
    } catch {
      setNotice("Gift could not be sent. No Gems were spent.");
      return;
    }
    publishLiveEvent("gift", `sent a ${gift.name} ${gift.emoji} — ${gift.gems} Gems`, gift.gems);
    setIsGiftSheetOpen(false);
    setNotice(`${gift.name} sent to ${selectedBroadcaster.name}`);
  };

  const [cashTips, setCashTips] = useState<{ enabled: boolean; message: string }>({ enabled: false, message: "" });
  useEffect(() => {
    const user = auth.currentUser;
    if (!isGiftSheetOpen || screen !== "viewer" || !activeSession || !user || user.isAnonymous) return;
    let cancelled = false;
    setCashTips({ enabled: false, message: "" });
    void (async () => {
      try {
        const response = await fetch(`/api/live/tip-status?sessionId=${encodeURIComponent(activeSession.sessionId)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        const data = await response.json();
        if (!cancelled) setCashTips({ enabled: response.ok && data.enabled === true, message: data.reason || data.error || "Paid tips are unavailable right now." });
      } catch {
        if (!cancelled) setCashTips({ enabled: false, message: "Paid tips are unavailable right now." });
      }
    })();
    return () => { cancelled = true; };
  }, [isGiftSheetOpen, screen, activeSession?.sessionId]);

  // The server resolves the broadcaster from the live session and prices the checkout; only the amount comes from here.
  const sendCashTip = async (amount: string) => {
    const amountCents = Math.round(Number(amount) * 100);
    const user = auth.currentUser;
    if (!user || user.isAnonymous || !activeSession) {
      setNotice("Sign in to tip a live broadcaster.");
      return;
    }
    try {
      const response = await fetch("/api/live/tip-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ sessionId: activeSession.sessionId, amountCents })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== "string") throw new Error(data.error || "Tip checkout could not be started.");
      window.location.href = data.url;
    } catch (error) {
      setNotice(`${error instanceof Error ? error.message : "Tip checkout could not be started."} You were not charged.`);
      setIsGiftSheetOpen(false);
    }
  };

  const sendChat = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatInput.trim();
    if (!message) return;
    if (publishLiveEvent("chat", message)) setChatInput("");
  };

  const showHeart = () => {
    if (publishLiveEvent("heart", "sent a heart 💗")) setNotice("Heart sent");
  };

  const publishLiveReading = (cards: TarotCard[]) => {
    if (!tarotAllowed) return;
    setLiveReading(cards.map((card) => ({
      card,
      isReversed: Math.random() > 0.7,
      isRevealed: false
    })));
    setShowInterpretations(true);
    setChat((messages) => [...messages, { id: Date.now(), sender: "Celestial Reader", text: `began a ${cards.length === 1 ? "one-card" : "Past · Present · Future"} reading`, kind: "system" }]);
  };

  const startLiveReading = () => {
    if (!tarotAllowed) return;
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
    if (!tarotAllowed) return;
    const count = readingSpread === "single" ? 1 : 3;
    if (cardIds.length !== count || new Set(cardIds).size !== count) return;
    const selectedCards = cardIds.slice(0, count).map((id) => TAROT_DECK.find((card) => card.id === id && !card.isHidden));
    if (selectedCards.length !== count || selectedCards.some((card) => !card)) return;
    publishLiveReading(selectedCards as TarotCard[]);
  };

  const revealLiveCard = (index: number) => {
    if (!tarotAllowed) return;
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
    if (!tarotAllowed) return;
    if (liveReading.every((card) => card.isRevealed)) return;
    setLiveReading((cards) => cards.map((card) => ({ ...card, isRevealed: true })));
    setChat((messages) => [...messages, { id: Date.now(), sender: "Celestial Reader", text: "revealed the full spread", kind: "system" }]);
  };

  const resetLiveReading = () => { if (tarotAllowed) setLiveReading([]); };

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
        <header className="flex items-center justify-between">{isLiveNow ? backButton(() => { if (myBroadcaster) setSelectedBroadcaster(myBroadcaster); setScreen("broadcast"); }, "Back to your live broadcast") : backButton(onExit, "Return to the Sanctuary")}<div className="text-center"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">Celestial Sanctuary</p><h1 className="font-display text-xl font-semibold text-white">Live Circle</h1></div><button onClick={() => setScreen("setup")} aria-label="Go live" className="flex h-11 w-11 items-center justify-center rounded-full bg-mystic-gold text-[#100b1c] shadow-[0_0_22px_rgba(243,198,95,.18)] active:scale-95"><Video className="h-5 w-5" /></button></header>
        {notice && <p role="status" className="rounded-lg border border-mystic-gold/30 bg-mystic-gold/10 px-3 py-2 text-center text-xs text-mystic-gold">{notice}</p>}
        <button onClick={() => setScreen("setup")} className="flex w-full items-center justify-between rounded-xl border border-mystic-gold/40 bg-gradient-to-r from-mystic-gold/15 to-transparent px-4 py-3 text-left"><span><strong className="block font-display text-sm text-mystic-gold">Go live</strong><span className="text-xs text-slate-400">Start a broadcast with your community</span></span><ChevronRight className="h-5 w-5 text-mystic-gold" /></button>
        <section><div className="mb-3 flex items-end justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-red-300">Live now</p><h2 className="font-display text-lg text-white">Find your people</h2></div>{hasCreatorAccess && isAuthorizedReader && <button onClick={() => setScreen("earnings")} className="flex items-center gap-1 text-xs text-slate-400 hover:text-mystic-gold"><BarChart3 className="h-4 w-4" />Creator earnings</button>}</div>
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1"><button onClick={() => setSelectedTopic("All")} className={`shrink-0 rounded-full border px-3 py-2 text-xs ${selectedTopic === "All" ? "border-mystic-gold bg-mystic-gold text-[#100b1c]" : "border-white/10 bg-white/5 text-slate-300"}`}>All</button>{topics.map(({ name, icon: Icon }) => <button key={name} onClick={() => setSelectedTopic(name)} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs ${selectedTopic === name ? "border-mystic-gold bg-mystic-gold text-[#100b1c]" : "border-white/10 bg-white/5 text-slate-300"}`}><Icon className="h-3.5 w-3.5" />{name}</button>)}</div>
          <div className="grid gap-4 sm:grid-cols-2">{visibleBroadcasters.length === 0 && directoryError && <p role="alert" className="col-span-full rounded-lg border border-rose-400/25 bg-rose-950/20 px-3 py-2 text-center text-xs text-rose-200">Live is unavailable right now. Check your connection and try again.</p>}{visibleBroadcasters.length === 0 && !directoryError && !viewerUid && guestAuthUnavailable && <div className="col-span-full space-y-3 py-6 text-center"><p className="text-sm text-slate-300">Sign in to watch live broadcasts.</p><button onClick={onExit} className="rounded-lg bg-mystic-gold px-4 py-2 text-xs font-semibold text-[#100b1c] active:scale-95">Return to sign in</button></div>}{visibleBroadcasters.map((broadcaster) => <button key={broadcaster.id} onClick={() => { setSelectedBroadcaster(broadcaster); setViewerCount(broadcaster.id === "your-live" ? viewerCount : broadcaster.viewers); if (broadcaster.id === "your-live") { setScreen("broadcast"); } else { setChat(mockChat); setViewerReturn("directory"); setScreen("viewer"); } }} className="overflow-hidden rounded-xl border border-white/10 bg-[#120d20] text-left transition-colors hover:border-mystic-gold/50">{videoSurface(broadcaster)}<div className="flex items-center gap-3 p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-mystic-gold/40 bg-[#39264a] font-display text-xs text-mystic-gold">{(broadcaster.id === "your-live" ? avatarUrl : broadcaster.avatarUrl) ? <img src={(broadcaster.id === "your-live" ? avatarUrl : broadcaster.avatarUrl)} alt="" className="h-full w-full object-cover" /> : broadcaster.avatar}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{broadcaster.id === "your-live" ? `Your Live · ${broadcaster.name}` : broadcaster.name}</div><p className="truncate text-xs text-slate-400">{broadcaster.title}</p></div><div className="flex items-center gap-1 text-xs text-slate-400"><Users className="h-3.5 w-3.5" />{formatCount(broadcaster.id === "your-live" ? viewerCount : broadcaster.viewers)}</div></div></button>)}{visibleBroadcasters.length === 0 && !directoryError && !(guestAuthUnavailable && !viewerUid) && <p className="col-span-full py-10 text-center text-sm text-slate-400">No one is live in this topic right now.</p>}</div>
        </section>
      </section>
    );
  }

  if (screen === "setup") {
    return (
      <section className="mx-auto max-w-lg space-y-6 pb-8 text-slate-100">
        <header className="flex items-center gap-3">{backButton(() => setScreen("directory"))}<div><p className="text-[10px] uppercase tracking-[0.18em] text-teal-300">Your broadcast</p><h1 className="font-display text-xl text-white">Set the intention</h1></div></header>
        {notice && <p role="status" className="rounded-lg border border-mystic-gold/30 bg-mystic-gold/10 px-3 py-2 text-center text-xs text-mystic-gold">{notice}</p>}
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
    return (
      <section className="mx-auto max-w-3xl space-y-5 pb-8 text-slate-100">
        <header className="flex items-center gap-3">
          {backButton(() => setScreen("directory"))}
          <div><p className="text-[10px] uppercase tracking-[0.18em] text-teal-300">Private broadcaster view</p><h1 className="font-display text-xl text-white">Gem earnings</h1></div>
        </header>
        <p className="rounded-xl border border-mystic-gold/20 bg-mystic-gold/[0.06] p-3 text-xs leading-relaxed text-slate-300">
          These are virtual Gems from confirmed viewer gifts, not cash or withdrawable earnings. Purchased Gems are not included. Stripe cash tips are tracked separately.
        </p>
        {earningsLoading ? (
          <div role="status" className="flex min-h-32 items-center justify-center gap-2 rounded-xl border border-white/10 bg-[#120d20] text-sm text-slate-300"><RefreshCw className="h-4 w-4 animate-spin" />Loading verified tip earnings…</div>
        ) : earningsError ? (
          <div role="alert" className="space-y-3 rounded-xl border border-rose-400/25 bg-rose-950/20 p-4 text-sm text-rose-200"><p>{earningsError}</p><button onClick={() => setEarningsRefresh((n) => n + 1)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-300/30 px-3 text-xs font-semibold hover:bg-rose-400/10"><RefreshCw className="h-3.5 w-3.5" />Retry</button></div>
        ) : earnings && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Total gems earned", earnings.totalGemsEarned],
                ["Today", earnings.todayGemsEarned],
                ["Lifetime gems earned", earnings.lifetimeGemsEarned],
              ].map(([label, value]) => <div key={label} className="rounded-xl border border-mystic-gold/25 bg-gradient-to-br from-[#1d123a]/90 to-[#0a0618]/90 p-4"><p className="text-xs text-slate-400">{label}</p><strong className="mt-1 block font-display text-2xl text-mystic-gold">{formatCount(Number(value))}<span className="ml-1 text-sm font-normal">Gems</span></strong></div>)}
            </div>
            {earnings.totalGemsEarned !== earnings.lifetimeGemsEarned && <p className="text-[11px] leading-relaxed text-slate-500">The lifetime total includes verified legacy gift totals. Individual viewer records are available for gifts recorded in the transaction history.</p>}
            <section className="overflow-hidden rounded-xl border border-white/10 bg-[#120d20]">
              <div className="border-b border-white/10 px-4 py-3"><h2 className="font-display text-base text-white">Viewer gift history</h2><p className="mt-1 text-[11px] text-slate-400">Confirmed virtual-Gem gifts only.</p></div>
              {earnings.transactions.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-400">{earnings.lifetimeGemsEarned > 0 ? "The lifetime aggregate includes earlier verified gifts, but individual viewer records are not available for those gifts." : "No verified viewer Gem tips yet. Earnings will appear here after a gift is confirmed."}</p>
              ) : (
                <div className="divide-y divide-white/10">
                  {earnings.transactions.map((item) => <div key={item.id} className="grid grid-cols-2 gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_auto_auto] sm:items-center">
                    <span className="col-span-2 min-w-0 truncate font-medium text-white sm:col-span-1">{item.viewerName}</span>
                    <span className="text-xs text-slate-400">{new Date(item.date).toLocaleString()}</span>
                    <strong className="text-right text-teal-200">+{formatCount(item.gemsAmount)} Gems</strong>
                    <span className="col-span-2 text-[10px] capitalize text-slate-500 sm:col-span-1 sm:text-right">{item.status}</span>
                  </div>)}
                </div>
              )}
            </section>
          </>
        )}
      </section>
    );
  }

  const isBroadcaster = screen === "broadcast";
  // Pre-live (no real session selected): show the signed-in user's own identity, never mock or stale broadcaster data
  const preLiveName = displayName?.trim() || (currentUserId ? "You" : "Guest");
  const preLiveBroadcaster: Broadcaster = {
    ...selectedBroadcaster,
    name: preLiveName,
    avatar: preLiveName.slice(0, 2).toUpperCase(),
    avatarUrl: currentUserId ? avatarUrl : undefined,
    title: "Ready to go live",
    description: undefined,
    hashtags: undefined
  };
  const canUseTarot = isBroadcaster && readerProfile;

  if (isBroadcaster || screen === "viewer") {
    return (
      <ImmersiveLiveRoom
        videoStream={isBroadcaster ? broadcastVideo.stream : viewerVideo.stream}
        videoStatus={isBroadcaster ? broadcastVideo.status : viewerVideo.status}
        videoError={isBroadcaster ? broadcastVideo.error : ""}
        hasRealVideo={isBroadcaster ? Boolean(currentUserId) : Boolean(viewerBroadcasterUid)}
        broadcaster={isBroadcaster && myBroadcaster ? { ...myBroadcaster, profileUid: currentUserId ?? undefined, avatarUrl } : activeSession ? toBroadcaster(activeSession) : { ...preLiveBroadcaster, profileUid: currentUserId ?? undefined }}
        isBroadcaster={isBroadcaster}
        onBack={() => {
          if (isBroadcaster) {
            setScreen("directory");
            setNotice("You are still live. Use End to finish your broadcast.");
          } else if (viewerReturn === "directory") setScreen("directory");
          else onExit();
        }}
        onViewMemberProfile={onViewMemberProfile}
        isPaused={isBroadcaster ? isBroadcastPaused : Boolean(activeRemote?.isPaused)}
        canUseTarot={canUseTarot}
        currentRank={currentRank.name}
        elapsedSeconds={elapsedSeconds}
        viewerCount={viewerCount}
        giftsReceived={giftsReceived}
        isFollowing={isFollowing}
        readingSpread={isBroadcaster ? readingSpread : activeRemote?.spread ?? "three"}
        readingCards={isBroadcaster ? liveReading : remoteReadingCards}
        showInterpretations={isBroadcaster ? showInterpretations : activeRemote?.showInterpretations ?? true}
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
        onToggleFollow={toggleFollow}
        onHeart={showHeart}
        onChooseSpread={(spread) => {
          if (!tarotAllowed) return;
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
        notificationBell={currentUserId ? <NotificationBell recipientUid={currentUserId} /> : undefined}
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
        cashTipsEnabled={cashTips.enabled}
        cashTipsMessage={cashTips.message}
        customTip={customTip}
        setCustomTip={setCustomTip}
        isGiftSheetOpen={isGiftSheetOpen}
        setIsGiftSheetOpen={setIsGiftSheetOpen}
      />
    );
  }

}