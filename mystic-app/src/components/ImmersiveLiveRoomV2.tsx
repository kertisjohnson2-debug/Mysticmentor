import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { collection, deleteDoc, doc, getDoc, limitToLast, onSnapshot, orderBy, query, setDoc, where, type DocumentChange, type DocumentSnapshot, type QueryDocumentSnapshot, type QuerySnapshot } from "firebase/firestore";
import { onAuthStateChanged, type User } from "firebase/auth";
import { createPortal } from "react-dom";
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
import { useBroadcasterRank } from "../lib/useBroadcasterRank";
import { requestNotification } from "../lib/notifications";
import { eventsRefV2 as eventsRef, useLiveBroadcastV2 as useLiveBroadcast, useLiveViewerV2 as useLiveViewer, getLiveV2DiagnosticLog, subscribeLiveV2Diagnostics, type LiveSessionV2Meta as LiveSessionMeta } from "../lib/liveVideoV2";
import { TAROT_DECK, type TarotCard } from "../data/spiritualData";
import ImmersiveLiveRoom, { type LiveReadingCard, type LiveSpread } from "./ImmersiveLiveRoom";
import NotificationBell from "./NotificationBell";
import LiveThumbnailPicker from "./LiveThumbnailPicker";
import { loadLiveThumbnails, type LiveThumbnail } from "../lib/liveThumbnails";
import { isLiveSessionActive, LIVE_DISPLAY_STALE_MS } from "../lib/liveSessionState";
import DEFAULT_LIVE_THUMBNAIL from "../assets/images/mystical_tarot_reader_1790704974614.jpg";
import MemberProfile from "./MemberProfile";
import { loadPublicMemberProfile, type PublicMemberProfile } from "../lib/memberProfile";

function TemporaryLiveV2Diagnostics() {
  const [open, setOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const log = useSyncExternalStore(subscribeLiveV2Diagnostics, getLiveV2DiagnosticLog);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const copyLog = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(log);
      setCopyStatus("Diagnostic log copied.");
    } catch {
      textRef.current?.focus();
      textRef.current?.select();
      setCopyStatus("Automatic copying is unavailable. Touch and hold the selected text, then choose Copy.");
    }
  };

  return <>
    {!open && <button type="button" onClick={() => setOpen(true)} className="fixed left-3 top-[calc(env(safe-area-inset-top)+4.5rem)] z-[110] min-h-11 rounded-lg border border-amber-300/60 bg-black/90 px-3 text-xs font-semibold text-amber-200">
      V2 diagnostics (temporary)
    </button>}
    {open && <section role="dialog" aria-modal="false" aria-label="Temporary Live V2 diagnostics" className="fixed inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] z-[110] mx-auto flex max-w-xl flex-col gap-3 rounded-xl border border-amber-300/50 bg-[#100b1c] p-3 text-white shadow-2xl">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-200">Temporary Live V2 diagnostics</h2>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-lg border border-white/20 px-3 text-sm">Close</button>
      </header>
      <p className="text-xs text-slate-300">Current device only. Latest 500 sanitized events; refreshing clears them. Closing this panel does not stop the broadcast.</p>
      <textarea ref={textRef} readOnly value={log} placeholder="No V2 connection events yet. Close this panel and start or join a broadcast." aria-label="Sanitized Live V2 diagnostic log" spellCheck={false} className="min-h-0 w-full flex-1 select-text rounded-lg border border-white/20 bg-black p-2 font-mono text-xs leading-relaxed text-white" />
      <button type="button" onClick={() => void copyLog()} disabled={!log} className="min-h-11 rounded-lg bg-amber-200 px-3 text-sm font-semibold text-black disabled:opacity-40">Copy diagnostic log</button>
      {copyStatus && <p role="status" className="text-xs text-amber-200">{copyStatus}</p>}
    </section>}
  </>;
}

export default function ImmersiveLiveRoomV2() {
  const [user, setUser] = useState<User | null>(() => auth.currentUser);
  const [authReady, setAuthReady] = useState(() => Boolean(auth.currentUser));
  const [authError, setAuthError] = useState("");
  const [member, setMember] = useState<{ uid: string; data: Record<string, unknown> } | null>(null);
  const [profileError, setProfileError] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<PublicMemberProfile | null>(null);
  const profileRequest = useRef(0);
  const memberUid = user && !user.isAnonymous ? user.uid : null;

  useEffect(() => onAuthStateChanged(auth, (nextUser: User | null) => {
    setUser(nextUser);
    setAuthReady(true);
    setAuthError("");
  }, (error: Error) => {
    console.error("V2 could not restore Firebase authentication:", error);
    setAuthError(error.message);
  }), []);

  useEffect(() => {
    if (authReady) return;
    const timer = window.setTimeout(() => {
      setAuthError("Firebase is still restoring your existing session. No account or browser storage has been changed.");
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [authReady]);

  useEffect(() => {
    setMember(null);
    setProfileError("");
    setSelectedProfile(null);
    profileRequest.current += 1;
    if (!memberUid) return;
    return onSnapshot(doc(db, "users", memberUid), (snapshot: DocumentSnapshot) => {
      setMember({ uid: memberUid, data: snapshot.data() ?? {} });
    }, (error: Error) => {
      console.error("V2 could not load the current member:", error);
      setProfileError("Could not load your member permissions and Gem balance.");
    });
  }, [memberUid]);

  const profile = member && member.uid === memberUid ? member.data : null;
  const isAuthorizedReader = Boolean(
    user && !user.isAnonymous && (
      profile?.role === "admin" ||
      (user.email === "kertisjohnson7@gmail.com" && user.emailVerified) ||
      (user.emailVerified && profile?.tarotReader === true)
    )
  );
  const displayName = typeof profile?.displayName === "string" && profile.displayName
    ? profile.displayName
    : user?.displayName || user?.email?.split("@")[0] || undefined;
  const avatarUrl = typeof profile?.avatarUrl === "string" && profile.avatarUrl
    ? profile.avatarUrl
    : user?.photoURL || undefined;

  const viewMemberProfile = async (uid: string) => {
    const request = ++profileRequest.current;
    setProfileError("");
    try {
      const nextProfile = await loadPublicMemberProfile(uid, uid === memberUid);
      if (request === profileRequest.current) setSelectedProfile(nextProfile);
    } catch (error) {
      console.error("V2 could not load the selected member profile:", error);
      if (request === profileRequest.current) {
        setProfileError(error instanceof Error ? error.message : "Unable to load that member profile.");
      }
    }
  };

  return (
    <div className="min-h-[100dvh] bg-cosmic-dark flex items-start justify-center">
      <TemporaryLiveV2Diagnostics />
      <div className="w-full cosmic-nebula-bg shadow-2xl flex flex-col relative z-10 overflow-hidden h-[100dvh] min-h-0 max-w-none">
        <main className="flex-1 min-h-0 overflow-y-auto z-10 px-0 py-0">
          {authReady ? (
            <LiveCommunityV2
              onExit={() => window.location.assign("/")}
              isAuthorizedReader={isAuthorizedReader}
              currentUserId={memberUid}
              authenticatedViewerUid={user?.uid ?? null}
              displayName={displayName}
              avatarUrl={avatarUrl}
              gemBalance={typeof profile?.gemBalance === "number" ? profile.gemBalance : 0}
              onViewMemberProfile={(uid) => void viewMemberProfile(uid)}
            />
          ) : (
            <div role="status" className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-300">
              {authError || "Restoring your Mysticmentor session..."}
            </div>
          )}
        </main>
        {profileError && (
          <div role="alert" className="fixed inset-x-4 top-6 z-[101] mx-auto max-w-md rounded-lg border border-red-400/30 bg-red-950/90 px-3 py-2 text-center text-xs text-red-200 shadow-xl">
            {profileError}
            <button type="button" onClick={() => setProfileError("")} className="ml-2 font-semibold underline">Close</button>
          </div>
        )}
      </div>
      {selectedProfile && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Member profile" className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-2 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="my-auto max-h-[calc(100dvh-1rem)] w-full max-w-md min-w-0 overflow-y-auto overscroll-contain sm:max-h-[calc(100dvh-2rem)]">
            <MemberProfile member={selectedProfile} onClose={() => { profileRequest.current += 1; setSelectedProfile(null); }} />
          </div>
        </div>, document.body
      )}
    </div>
  );
}

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
  cards: { id: number; reversed: boolean; revealed: boolean; book?: boolean }[];
  showInterpretations: boolean;
  updatedAt: number;
};

type LiveSessionDoc = LiveSessionMeta & { ownerUid: string; sessionId: string; startedAt: number; updatedAt: number };
type BroadcasterEarnings = {
  totalGemsEarned: number;
  todayGemsEarned: number;
  lifetimeGemsEarned: number | null;
  transactions: { id: string; date: string; viewerName: string; gemsAmount: number; status: string }[];
};

// A published broadcast is considered live while its heartbeat is recent
const BROADCAST_HEARTBEAT_MS = 30000;
const BROADCAST_STALE_MS = LIVE_DISPLAY_STALE_MS;

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
  { id: "pre-live", name: "You", avatar: "LV", title: "Ready to go live", topic: "Just Chatting", viewers: 0, theme: "from-[#37234f] via-[#68476a] to-[#bd7d69]", image: DEFAULT_LIVE_THUMBNAIL }
];

const gifts = [
  { name: "Heart", emoji: "💗", gems: 10 },
  { name: "Star", emoji: "⭐", gems: 50 },
  { name: "Rose", emoji: "🌹", gems: 100 },
  { name: "Crystal", emoji: "🔮", gems: 250 },
  { name: "Teddy", emoji: "🧸", gems: 500 }
];

const mockChat: ChatLine[] = [];

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function LiveCommunityV2({ onExit, isAuthorizedReader, currentUserId, authenticatedViewerUid, displayName, avatarUrl, gemBalance, onViewMemberProfile }: { onExit: () => void; isAuthorizedReader: boolean; currentUserId: string | null; authenticatedViewerUid: string | null; displayName?: string; avatarUrl?: string; gemBalance: number; onViewMemberProfile: (uid: string) => void }) {
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
  const [giftsReceived, setGiftsReceived] = useState(0);
  const [hasCreatorAccess, setHasCreatorAccess] = useState(false);
  const [earnings, setEarnings] = useState<BroadcasterEarnings | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsError, setEarningsError] = useState("");
  const [earningsRefresh, setEarningsRefresh] = useState(0);
  const [payout, setPayout] = useState<{ linked: boolean; ready: boolean; reason?: string } | null>(null);
  const [payoutError, setPayoutError] = useState("");
  // Payout readiness is read live from Stripe by the server for the signed-in broadcaster only
  useEffect(() => {
    const user = auth.currentUser;
    if (screen !== "earnings" || !user || user.isAnonymous) return;
    let cancelled = false;
    setPayout(null);
    setPayoutError("");
    void (async () => {
      try {
        const response = await fetch("/api/connect/status", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.ok) setPayout(data);
        else setPayoutError(data.error || "Could not read payout status.");
      } catch {
        if (!cancelled) setPayoutError("Could not read payout status.");
      }
    })();
    return () => { cancelled = true; };
  }, [screen, currentUserId]);
  const [viewerCount, setViewerCount] = useState(0);
  const [followedUids, setFollowedUids] = useState<Record<string, boolean>>({});
  const [isGiftSheetOpen, setIsGiftSheetOpen] = useState(false);
  const [readingSpread, setReadingSpread] = useState<LiveSpread>("three");
  const [liveReading, setLiveReading] = useState<LiveReadingCard[]>([]);
  const [bookReading, setBookReading] = useState<{ spread: LiveSpread; cards: LiveReadingCard[] } | null>(null);
  const [showInterpretations, setShowInterpretations] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [customTip, setCustomTip] = useState("");
  const [notice, setNotice] = useState("");
  const [chat, setChat] = useState<ChatLine[]>(mockChat);
  const [viewerReturn, setViewerReturn] = useState<"directory" | "exit">("exit");
  const [remoteReadings, setRemoteReadings] = useState<RemoteReading[]>([]);
  const [liveSessions, setLiveSessions] = useState<LiveSessionDoc[]>([]);
  const [clock, setClock] = useState(() => Date.now());

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

  const viewerUid = authenticatedViewerUid;

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
    viewers: 0,
    theme: "from-[#37234f] via-[#68476a] to-[#bd7d69]",
    image: DEFAULT_LIVE_THUMBNAIL
  });

  // One card per broadcaster (newest session), excluding the viewer's own broadcast
  const liveRemotes = useMemo(() => {
    const newest = new Map<string, LiveSessionDoc>();
    liveSessions
      .filter((session) => session.ownerUid !== viewerUid && isLiveSessionActive(session, clock, BROADCAST_STALE_MS))
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
  const { rank: broadcasterRank } = useBroadcasterRank(rankOwnerUid);
  useEffect(() => {
    if (!currentUserId || !followTargetUid || followTargetUid === currentUserId) return;
    return onSnapshot(
      doc(db, "users", currentUserId, "following", followTargetUid),
      (snapshot: DocumentSnapshot) => setFollowedUids((current) => ({ ...current, [followTargetUid]: snapshot.exists() })),
      (error: Error) => console.error("Could not load follow state:", error)
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

  // Promo thumbnails for the cards on screen. URLs are only swapped when the broadcaster changes the image or the signed link is aging.
  const [thumbnails, setThumbnails] = useState<Record<string, LiveThumbnail & { fetchedAt: number }>>({});
  const thumbnailUids = visibleBroadcasters.map((broadcaster) => broadcaster.id === "your-live" ? currentUserId : broadcaster.profileUid).filter((uid): uid is string => Boolean(uid)).sort().join(",");
  useEffect(() => {
    if (screen !== "directory" || !thumbnailUids) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const latest = await loadLiveThumbnails(thumbnailUids.split(","));
        if (cancelled) return;
        const now = Date.now();
        setThumbnails((current) => {
          const next: typeof current = {};
          for (const uid of thumbnailUids.split(",")) {
            const fresh = latest[uid];
            const known = current[uid];
            if (!fresh) continue;
            next[uid] = known && known.version === fresh.version && now - known.fetchedAt < 30 * 60_000 ? known : { ...fresh, fetchedAt: now };
          }
          return next;
        });
      } catch {
        // Cards keep the default artwork when thumbnails cannot be loaded.
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [screen, thumbnailUids]);

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
  useEffect(() => {
    if (isLiveNow) setViewerCount(broadcastVideo.viewerConnections);
  }, [isLiveNow, broadcastVideo.viewerConnections]);

  // Chat and hearts are shared through liveSessions/{sessionId}/events, scoped to the session being viewed
  const activeEventsSessionId = screen === "broadcast" ? broadcastVideo.sessionId : screen === "viewer" ? viewerVideo.sessionId : null;
  useEffect(() => {
    if (!viewerUid || !activeEventsSessionId) return;
    const seen = new Set<string>();
    const listenStartedAt = Date.now() - 5000;
    const unsubscribe = onSnapshot(query(eventsRef(activeEventsSessionId), orderBy("createdAt"), limitToLast(50)), (snapshot: QuerySnapshot) => {
      const lines: ChatLine[] = [];
      snapshot.docChanges().forEach((change: DocumentChange) => {
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
            .then((profileSnapshot: DocumentSnapshot) => {
              const profileAvatarUrl = typeof profileSnapshot.data()?.avatarUrl === "string" ? profileSnapshot.data()!.avatarUrl : null;
              chatAvatarCache.current.set(senderUid, profileAvatarUrl);
              if (profileAvatarUrl) {
                setChat((messages) => messages.map((message) => message.senderUid === senderUid && !message.avatarUrl ? { ...message, avatarUrl: profileAvatarUrl } : message));
              }
            })
            .catch((error: unknown) => console.error("Could not load chat sender profile:", error));
        }
        // The broadcaster's gift total only counts new gifts from other people, never history or their own echo
        if (screen === "broadcast" && data.kind === "gift" && data.uid !== viewerUid && typeof data.amount === "number" && data.createdAt >= listenStartedAt) {
          setGiftsReceived((total) => total + data.amount);
        }
      });
      if (lines.length) setChat((messages) => [...messages, ...lines]);
    }, (error: Error) => console.error("Failed to sync live chat:", error));
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
      text: text.slice(0, 300),
      kind,
      ...(amount === undefined ? {} : { amount }),
      createdAt: Date.now()
    }).catch((error: unknown) => { console.error("Failed to send live event:", error); setNotice("Could not send. Please try again."); });
    return true;
  };

  // Active broadcasts come from liveSessions (the same docs the video connection uses)
  useEffect(() => {
    if (!viewerUid) return;
    const unsubscribe = onSnapshot(query(collection(db, "liveSessions"), where("status", "==", "live")), (snapshot: QuerySnapshot) => {
      setLiveSessions(snapshot.docs.map((item: QueryDocumentSnapshot) => item.data() as LiveSessionDoc));
    }, (error: Error) => console.error("Failed to sync live sessions:", error));
    return unsubscribe;
  }, [viewerUid]);

  // Viewers receive every broadcaster's published Tarot state in real time
  useEffect(() => {
    if (!viewerUid) return;
    const unsubscribe = onSnapshot(collection(db, "liveReadings"), (snapshot: QuerySnapshot) => {
      setRemoteReadings(snapshot.docs.map((item: QueryDocumentSnapshot) => item.data() as RemoteReading));
    }, (error: Error) => console.error("Failed to sync live broadcasts:", error));
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
      spread: bookReading?.spread ?? readingSpread,
      cards: (bookReading?.cards ?? liveReading).map((item) => ({ id: item.card.id, reversed: item.isReversed, revealed: item.isRevealed, ...(bookReading ? { book: true } : {}) })),
      showInterpretations,
      updatedAt: Date.now()
    }).catch((error: unknown) => console.error("Failed to publish live reading:", error));
    publish();
    const heartbeat = window.setInterval(publish, BROADCAST_HEARTBEAT_MS);
    return () => window.clearInterval(heartbeat);
  }, [canPublish, currentUserId, myBroadcaster, isBroadcastPaused, readingSpread, liveReading, bookReading, showInterpretations]);

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
      name: chosenName || "Community host",
      avatar: chosenName ? chosenName.slice(0, 2).toUpperCase() : "CH",
      title: broadcastTitle.trim() || "A little time together in the Sanctuary",
      description: broadcastDescription.trim(),
      hashtags: broadcastHashtags.trim(),
      topic: broadcastTopic,
      viewers: 0,
      theme: readerProfile ? "from-[#37234f] via-[#68476a] to-[#bd7d69]" : "from-[#283846] via-[#4a6872] to-[#9eafb0]",
      image: readerProfile ? DEFAULT_LIVE_THUMBNAIL : undefined
    };
    setMyBroadcaster(newBroadcaster);
    setSelectedBroadcaster(newBroadcaster);
    setViewerCount(0);
    setGiftsReceived(0);
    setLiveReading([]);
    setReadingSpread("three");
    setShowInterpretations(true);
    setHasCreatorAccess(true);
    setElapsedSeconds(0);
    setLiveStartedAt(Date.now());
    setIsBroadcastPaused(false);
    setChat([]);
    setScreen("broadcast");
  };

  const endBroadcast = () => {
    setIsBroadcastPaused(false);
    setLiveStartedAt(null);
    setMyBroadcaster(null);
    setScreen("directory");
    setNotice("Your broadcast has ended.");
  };

  const giftInFlight = useRef(false);
  const sendGift = async (gift: typeof gifts[number]) => {
    if (giftInFlight.current) return;
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
    // One request ID per intentional gift; the server credits a repeated ID only once.
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const body = JSON.stringify({ context: "live", giftId: gift.name.toLowerCase(), recipientId: activeSession.ownerUid, sessionId: activeSession.sessionId, requestId });
    giftInFlight.current = true;
    try {
      const idToken = await user.getIdToken().catch(() => null);
      if (!idToken) {
        setNotice("Gift could not be sent. No Gems were spent.");
        return;
      }
      let response: Response | null = null;
      for (let attempt = 0; attempt < 2 && !response; attempt += 1) {
        try {
          const attemptResponse = await fetch("/api/spend-gems", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body });
          if (attemptResponse.status >= 500) {
            console.error("Gift confirmation failed:", attemptResponse.status);
          } else {
            response = attemptResponse;
          }
        } catch {
          // Network failure: the gift may or may not have been recorded, so retry once with the same request ID.
        }
      }
      if (!response) {
        setNotice("Gift could not be confirmed. Check your Gem balance before trying again.");
        return;
      }
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        setNotice(`${typeof failure?.error === "string" ? failure.error : "Gift could not be confirmed."} Check your Gem balance before trying again.`);
        return;
      }
      const confirmation = await response.json().catch(() => null);
      if (confirmation?.success !== true || typeof confirmation.transactionId !== "string") {
        setNotice("Gift could not be confirmed. Check your Gem balance before trying again.");
        return;
      }
    } finally {
      giftInFlight.current = false;
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
      {broadcaster.image && <img src={broadcaster.image} alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-75" />}
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
          <div className="grid gap-4 sm:grid-cols-2">{visibleBroadcasters.map((broadcaster) => <button key={broadcaster.id} onClick={() => { setSelectedBroadcaster(broadcaster); setViewerCount(broadcaster.id === "your-live" ? viewerCount : broadcaster.viewers); if (broadcaster.id === "your-live") { setScreen("broadcast"); } else { setChat(mockChat); setViewerReturn("directory"); setScreen("viewer"); } }} className="overflow-hidden rounded-xl border border-white/10 bg-[#120d20] text-left transition-colors hover:border-mystic-gold/50">{videoSurface({ ...broadcaster, image: thumbnails[(broadcaster.id === "your-live" ? currentUserId : broadcaster.profileUid) ?? ""]?.url ?? DEFAULT_LIVE_THUMBNAIL })}<div className="flex items-center gap-3 p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-mystic-gold/40 bg-[#39264a] font-display text-xs text-mystic-gold">{(broadcaster.id === "your-live" ? avatarUrl : broadcaster.avatarUrl) ? <img src={(broadcaster.id === "your-live" ? avatarUrl : broadcaster.avatarUrl)} alt="" className="h-full w-full object-cover" /> : broadcaster.avatar}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold text-white">{broadcaster.id === "your-live" ? `Your Live · ${broadcaster.name}` : broadcaster.name}</div><p className="truncate text-xs text-slate-400">{broadcaster.title}</p></div><div className="flex items-center gap-1 text-xs text-slate-400"><Users className="h-3.5 w-3.5" />{formatCount(broadcaster.id === "your-live" ? viewerCount : broadcaster.viewers)}</div></div></button>)}{visibleBroadcasters.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-400">No one is live in this topic right now.</p>}</div>
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
        <LiveThumbnailPicker defaultImage={DEFAULT_LIVE_THUMBNAIL} />
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
        <section aria-label="Cash tip payout setup" className="space-y-2 rounded-xl border border-white/10 bg-[#120d20] p-4 text-xs leading-relaxed text-slate-300">
          <h2 className="font-display text-base text-white">Cash tip payouts</h2>
          {payoutError ? <p role="alert" className="text-rose-300">{payoutError}</p> : !payout ? <p role="status" className="text-slate-400">Checking Stripe payout status…</p> : payout.ready ? <p className="text-teal-200">Stripe confirms your payout account is ready. Viewers can send cash tips.</p> : <p>Viewers cannot send cash tips until Stripe confirms your payout account. {payout.reason}</p>}
          {payout && !payout.ready && <p className="text-slate-400">To set up or resume payouts, open Member → Payments &amp; Payouts.</p>}
        </section>
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
              ].map(([label, value]) => <div key={label} className="rounded-xl border border-mystic-gold/25 bg-gradient-to-br from-[#1d123a]/90 to-[#0a0618]/90 p-4"><p className="text-xs text-slate-400">{label}</p><strong className="mt-1 block font-display text-2xl text-mystic-gold">{value === null ? "Unavailable" : <>{formatCount(Number(value))}<span className="ml-1 text-sm font-normal">Gems</span></>}</strong></div>)}
            </div>
            {earnings.lifetimeGemsEarned !== null && earnings.totalGemsEarned !== earnings.lifetimeGemsEarned && <p className="text-[11px] leading-relaxed text-slate-500">The lifetime total includes verified legacy gift totals. Individual viewer records are available for gifts recorded in the transaction history.</p>}
            <section className="overflow-hidden rounded-xl border border-white/10 bg-[#120d20]">
              <div className="border-b border-white/10 px-4 py-3"><h2 className="font-display text-base text-white">Viewer gift history</h2><p className="mt-1 text-[11px] text-slate-400">Confirmed virtual-Gem gifts only.</p></div>
              {earnings.transactions.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-slate-400">{(earnings.lifetimeGemsEarned ?? 0) > 0 ? "The lifetime aggregate includes earlier verified gifts, but individual viewer records are not available for those gifts." : "No verified viewer Gem tips yet. Earnings will appear here after a gift is confirmed."}</p>
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
      <div className="relative h-full min-h-0">
      <ImmersiveLiveRoom
        videoStream={isBroadcaster ? broadcastVideo.stream : viewerVideo.stream}
        videoStatus={isBroadcaster ? broadcastVideo.status : viewerVideo.status}
        videoError={isBroadcaster ? broadcastVideo.error : viewerVideo.error}
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
        broadcasterRank={broadcasterRank}
        elapsedSeconds={elapsedSeconds}
        viewerCount={viewerCount}
        giftsReceived={giftsReceived}
        isFollowing={isFollowing}
        readingSpread={isBroadcaster ? readingSpread : activeRemote?.spread ?? "three"}
        readingCards={isBroadcaster ? liveReading : remoteReadingCards}
        showInterpretations={isBroadcaster ? showInterpretations : activeRemote?.showInterpretations ?? true}
        isBookDisplay={!isBroadcaster && Boolean(activeRemote?.cards.some((entry) => entry.book))}
        onBrowse={() => setScreen("directory")}
        onStartBroadcast={() => setScreen("setup")}
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
        onBookReadingChange={setBookReading}
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
        notice={(isBroadcaster ? broadcastVideo.error : viewerVideo.error) || notice}
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
      {!isBroadcaster && (
        <span
          aria-label="Live Broadcast V2"
          className="pointer-events-none absolute right-5 top-[calc(max(0.75rem,env(safe-area-inset-top))+2.75rem)] z-30 flex h-3 w-9 items-center justify-center rounded-full border border-mystic-gold/60 bg-[#100b1c] text-[10px] font-bold leading-none text-mystic-gold"
        >
          V2
        </span>
      )}
      </div>
    );
  }

}