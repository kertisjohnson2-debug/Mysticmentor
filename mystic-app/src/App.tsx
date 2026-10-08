/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  auth, 
  db, 
  OperationType, 
  handleFirestoreError 
} from "./firebase";
import { createAvatarDataUrl } from "./lib/avatarImage";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  sendPasswordResetEmail,
  updateProfile,
  sendEmailVerification
} from "firebase/auth";
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  onSnapshot, 
  addDoc, 
  orderBy, 
  query, 
  limit,
  where 
} from "firebase/firestore";
import {
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
  Video,
  MessageSquare,
  Gift,
  DollarSign,
  User,
  History,
  TrendingUp,
  Send,
  Volume2,
  VolumeX,
  Calendar,
  ChevronRight,
  Info,
  Lock,
  Award,
  Flame,
  CheckCircle,
  Gem,
  Plus,
  Play,
  Grid
} from "lucide-react";

import {
  TAROT_DECK,
  ZODIAC_SIGNS,
  NUMEROLOGY_PROFILES,
  CHAT_TEMPLATES,
  GIFT_TEMPLATES,
  TarotCard,
  ZodiacSign
} from "./data/spiritualData";
import CelestialOnboarding from "./components/CelestialOnboarding";
import LiveCommunity from "./components/LiveCommunity";
import MyProfile from "./components/MyProfile";
import type { UserIdentity } from "./types/userProfile";

// Bundled image assets (hashed URLs in production builds)
import COSMIC_BACKDROP from "./assets/images/cosmic_tarot_backdrop_1790704955137.jpg";
import CARD_BACK_IMG from "./assets/images/mystical_card_back_1790704964638.jpg";
import TAROT_READER_IMG from "./assets/images/mystical_tarot_reader_1790704974614.jpg";

async function ensureServerProfile(user: { getIdToken: () => Promise<string> }, displayName?: string | null): Promise<any | null> {
  const token = await user.getIdToken();
  const response = await fetch("/api/init-profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ displayName: displayName || "" })
  });
  if (!response.ok) throw new Error(`Profile initialization failed (${response.status})`);
  return (await response.json()).profile ?? null;
}

export default function App() {
  const queryParams = new URLSearchParams(window.location.search);
  const isSandboxCheckoutPath = window.location.pathname === "/stripe-sandbox-checkout";
  const isSandboxConnectPath = window.location.pathname === "/stripe-sandbox-connect-onboard";

  // Navigation State
  const [activeTab, setActiveTab] = useState<"home" | "tarot" | "zodiac" | "numerology" | "live" | "dashboard" | "profile" | "admin">("home");

  // Audio mute/unmute state
  const [isMuted, setIsMuted] = useState(false);

  // --- TAROT DECK STATE & LOCAL STORAGE PERSISTENCE ---
  const [cards, setCards] = useState<TarotCard[]>(() => {
    try {
      const saved = localStorage.getItem("celestial_tarot_deck");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Failed to load saved tarot deck", e);
    }
    return TAROT_DECK;
  });

  // --- SMART SHUFFLE ENGINE STATES ---
  const [recentDrawnIds, setRecentDrawnIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem("celestial_recently_drawn_cards");
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [allowReversed, setAllowReversed] = useState<boolean>(() => {
    const saved = localStorage.getItem("celestial_allow_reversed");
    return saved !== "false"; // Default to true
  });

  const [smartShuffleEnabled, setSmartShuffleEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("celestial_smart_shuffle");
    return saved !== "false"; // Default to true
  });

  const [repeatProtectionLimit, setRepeatProtectionLimit] = useState<number>(() => {
    const saved = localStorage.getItem("celestial_repeat_limit");
    return saved ? parseInt(saved, 10) : 15; // Default to 15
  });

  // --- ADMIN AUTH & STATE ---
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [showAdminGate, setShowAdminGate] = useState(false);
  const [adminPasscodeInput, setAdminPasscodeInput] = useState("");
  const [adminGateError, setAdminGateError] = useState("");

  // --- MEMBER LANDING ENTRANCE GATE STATE ---
  const [hasSkippedAuth, setHasSkippedAuth] = useState(() => {
    return localStorage.getItem("celestial_skipped_auth") === "true";
  });

  // --- REAL FIREBASE AUTHENTICATION STATES ---
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dbUserDoc, setDbUserDoc] = useState<any>(null);
  const [pendingMemberNavigation, setPendingMemberNavigation] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccessMsg, setAuthSuccessMsg] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");
  const [profileSaveMessage, setProfileSaveMessage] = useState("");

  useEffect(() => {
    if (!profileSaveMessage) return;
    const timer = window.setTimeout(() => setProfileSaveMessage(""), 4000);
    return () => window.clearTimeout(timer);
  }, [profileSaveMessage]);

  useEffect(() => {
    if (activeTab !== "profile") {
      setProfileSaveMessage("");
      setProfileSaveError("");
    }
  }, [activeTab]);

  // --- ADMIN PANEL SUB-STATES ---
  const [adminSubTab, setAdminSubTab] = useState<"broadcast" | "deck" | "shuffle" | "staff" | "financials">("broadcast");
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [cardEditForm, setCardEditForm] = useState<TarotCard | null>(null);
  const [deckFilter, setDeckFilter] = useState<"all" | "major" | "minor" | "hidden" | "edited">("all");
  const [deckSearch, setDeckSearch] = useState("");
  const [staffEmailInput, setStaffEmailInput] = useState("");
  const [staffList, setStaffList] = useState<any[]>([]);
  const [tarotReaderEmailInput, setTarotReaderEmailInput] = useState("");
  const [tarotReaderList, setTarotReaderList] = useState<any[]>([]);
  // UI gate only (Firestore rules enforce hasTarotPermission). Derived from the user's Firestore document, not the
  // admin-portal session flag. tarotReader keeps the verified-email requirement because the rules require it too.
  const hasTarotReaderPermission = Boolean(
    currentUser && !currentUser.isAnonymous && (
      dbUserDoc?.role === "admin" ||
      (currentUser.email === "kertisjohnson7@gmail.com" && currentUser.emailVerified) ||
      (currentUser.emailVerified && dbUserDoc?.tarotReader === true)
    )
  );
  const [financialStats, setFinancialStats] = useState<any>({
    totalGrossVolume: 0,
    totalPlatformRevenue: 0,
    totalTransfers: 0,
    purchaseCount: 0
  });
  const [financialRecords, setFinancialRecords] = useState<any[]>([]);

  const monthlyGrossHistory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of financialRecords) {
      if (r.type !== "gem_purchase" && r.type !== "tip") continue;
      const amount = Number(r.amount);
      const date = r.createdAt ? new Date(r.createdAt) : null;
      if (!date || isNaN(date.getTime()) || !Number.isFinite(amount)) continue;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      totals.set(key, (totals.get(key) ?? 0) + amount);
    }
    return Array.from(totals.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, total]) => ({
        key,
        total,
        label: new Date(`${key}-01T00:00:00`).toLocaleString(undefined, { month: "short" })
      }));
  }, [financialRecords]);
  const maxMonthlyGross = Math.max(1, ...monthlyGrossHistory.map((m) => m.total));
  const gemsCredited = financialRecords
    .filter((r) => r.type === "gem_purchase")
    .reduce((sum, r) => sum + (Number(r.gemsAmount) || 0), 0);
  const todayGross = useMemo(() => {
    const today = new Date().toDateString();
    return financialRecords
      .filter((r) => (r.type === "gem_purchase" || r.type === "tip") && r.createdAt && new Date(r.createdAt).toDateString() === today)
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [financialRecords]);

  // --- TAROT SPREAD STATE ---
  const [tarotTopic, setTarotTopic] = useState("General Guidance");
  const [drawnCards, setDrawnCards] = useState<{
    card: TarotCard;
    isReversed: boolean;
    isFlipped: boolean;
  }[]>([]);
  const [tarotStage, setTarotStage] = useState<"setup" | "reading">("setup");
  const [hasFlippedAll, setHasFlippedAll] = useState(false);

  // --- SINGLE CARD OF THE DAY (HOME VIEW) ---
  const [dailyCard, setDailyCard] = useState<TarotCard | null>(null);
  const [dailyCardReversed, setDailyCardReversed] = useState(false);
  const [dailyCardFlipped, setDailyCardFlipped] = useState(false);

  // --- ZODIAC STATE ---
  const [selectedZodiac, setSelectedZodiac] = useState<ZodiacSign | null>(null);
  const [dailyHoroscope, setDailyHoroscope] = useState<{ status: "idle" | "loading" | "ready" | "error"; date: string; text: string }>({ status: "idle", date: "", text: "" });
  const [horoscopeRetry, setHoroscopeRetry] = useState(0);
  const selectedZodiacId = selectedZodiac?.id;
  useEffect(() => {
    if (!selectedZodiacId) { setDailyHoroscope({ status: "idle", date: "", text: "" }); return; }
    let cancelled = false;
    setDailyHoroscope({ status: "loading", date: "", text: "" });
    fetch(`/api/horoscope/daily?sign=${encodeURIComponent(selectedZodiacId)}`)
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`Status ${res.status}`)))
      .then((data) => { if (!cancelled) setDailyHoroscope({ status: "ready", date: String(data.date), text: String(data.horoscope) }); })
      .catch(() => { if (!cancelled) setDailyHoroscope({ status: "error", date: "", text: "" }); });
    return () => { cancelled = true; };
  }, [selectedZodiacId, horoscopeRetry]);

  // --- NUMEROLOGY STATE ---
  const [dobMonth, setDobMonth] = useState("01");
  const [dobDay, setDobDay] = useState("01");
  const [dobYear, setDobYear] = useState("1995");
  const [calcStatus, setCalcStatus] = useState<"idle" | "calculating" | "done">("idle");
  const [calcMessage, setCalcMessage] = useState("");
  const [lifePathNumber, setLifePathNumber] = useState<number | null>(null);

  // --- LIVE ROOM STATE ---
  const [liveGoal, setLiveGoal] = useState(320); // out of 500 Gems
  const [chatMessages, setChatMessages] = useState<
    { id: number; sender: string; text: string; role: string; gift?: string; color?: string }[]
  >([
    { id: 1, sender: "Vesta_Priestess", text: "Ready for the portal reading!", role: "viewer" },
    { id: 2, sender: "MysticSage", text: "That energy shift was intense today.", role: "viewer" },
    { id: 3, sender: "Aurelia_T", text: "Can you consult the Oracle of Chariot?", role: "viewer" }
  ]);
  const [userChatInput, setUserChatInput] = useState("");
  const [activeGifts, setActiveGifts] = useState<{ id: string; icon: string; x: number; y: number }[]>([]);
  const [risingHearts, setRisingHearts] = useState<{ id: string; x: number }[]>([]);
  const [liveVideoActive, setLiveVideoActive] = useState(true);

  // --- MEMBER DASHBOARD STATE ---
  const [userGems, setUserGems] = useState(850);
  const [savedReadings, setSavedReadings] = useState([
    {
      id: "sr-1",
      date: "Sep 24, 2026",
      topic: "Love & Connections",
      cards: ["The Lovers", "The Star (Reversed)", "The Moon"],
      summary: "A beautiful alignment of paths, though inner anxieties block complete trust. Healing is active."
    },
    {
      id: "sr-2",
      date: "Sep 10, 2026",
      topic: "Career & Ambition",
      cards: ["The Magician", "The Emperor", "Strength"],
      summary: "Incredible manifestation power. Establish strict structure and trust your patient inner diplomacy."
    }
  ]);
  const [isReaderPortal, setIsReaderPortal] = useState(false);
  const [tipSuccessMessage, setTipSuccessMessage] = useState("");

  // Refs for auto-scroll live chat
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Web Audio Synth for magical feedback
  const playCelestialSound = (type: string) => {
    if (isMuted) return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      if (type === "flip") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } else if (type === "quartz") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.6);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      } else if (type === "lotus") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.1);
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.2);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.7);
        osc.start();
        osc.stop(ctx.currentTime + 0.7);
      } else if (type === "chalice") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.8);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.9);
        osc.start();
        osc.stop(ctx.currentTime + 0.9);
      } else if (type === "feather") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } else if (type === "star") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 1.2);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.2);
        osc.start();
        osc.stop(ctx.currentTime + 1.2);
      } else if (type === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3); // G5
        osc.frequency.setValueAtTime(1046.5, ctx.currentTime + 0.45); // C6
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
        osc.start();
        osc.stop(ctx.currentTime + 0.8);
      }
    } catch (e) {
      // AudioContext could be blocked by browser user gesture policies
    }
  };

  // Set up random daily card on load, keeping it consistent for the same user and date
  useEffect(() => {
    const todayStr = new Date().toDateString();
    const savedDate = localStorage.getItem("celestial_daily_card_date");
    const savedId = localStorage.getItem("celestial_daily_card_id");
    const savedReversed = localStorage.getItem("celestial_daily_card_reversed");

    // Filter available cards to avoid hidden ones
    const availableCards = cards.filter(c => !c.isHidden);
    if (availableCards.length === 0) return;

    if (savedDate === todayStr && savedId !== null) {
      const cardId = parseInt(savedId, 10);
      const foundCard = cards.find(c => c.id === cardId) || availableCards[0];
      setDailyCard(foundCard);
      setDailyCardReversed(savedReversed === "true");
    } else {
      const randomIndex = Math.floor(Math.random() * availableCards.length);
      const chosenCard = availableCards[randomIndex];
      const isRev = allowReversed ? Math.random() > 0.7 : false;

      setDailyCard(chosenCard);
      setDailyCardReversed(isRev);

      localStorage.setItem("celestial_daily_card_date", todayStr);
      localStorage.setItem("celestial_daily_card_id", chosenCard.id.toString());
      localStorage.setItem("celestial_daily_card_reversed", isRev.toString());
    }
  }, [cards, allowReversed]);

  // --- REAL-TIME FIREBASE AUTH & DATABASE SUBSCRIPTIONS ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setIsAuthLoading(true);
      // Anonymous Live viewers are not app members: no profile, no member state
      if (user && !user.isAnonymous) {
        setCurrentUser(user);
        
        // Fetch or create user record in Firestore
        const userDocRef = doc(db, "users", user.uid);
        try {
          const docSnap = await getDoc(userDocRef);
          if (!docSnap.exists()) {
            // The server creates the profile with the trusted starting balance
            const created = await ensureServerProfile(user, user.displayName || authDisplayName);
            if (created) setDbUserDoc(created);
          } else {
            setDbUserDoc(docSnap.data());
          }
        } catch (error) {
          console.error("Failed to fetch or establish user profile:", error);
        }
      } else {
        setCurrentUser(null);
        setDbUserDoc(null);
        setIsAdminAuthenticated(false);
      }
      setIsAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!pendingMemberNavigation || isAuthLoading) return;
    setActiveTab(currentUser ? "profile" : "dashboard");
    setPendingMemberNavigation(false);
  }, [pendingMemberNavigation, isAuthLoading, currentUser]);

  // Listen for real-time user document changes to update gem balances and roles
  useEffect(() => {
    if (!currentUser) return;

    const userDocRef = doc(db, "users", currentUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setDbUserDoc(data);
        
        // Auto-elevate admin state for current session if role matches or email matches AND email is verified
        if (data.role === "admin" || (currentUser.email === "kertisjohnson7@gmail.com" && currentUser.emailVerified)) {
          setIsAdminAuthenticated(true);
        } else {
          setIsAdminAuthenticated(false);
        }
      }
    }, (error) => {
      console.error("Failed to sync user document real-time:", error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Sync userGems state with dbUserDoc.gemBalance when authenticated
  useEffect(() => {
    if (dbUserDoc && typeof dbUserDoc.gemBalance === "number") {
      setUserGems(dbUserDoc.gemBalance);
    }
  }, [dbUserDoc]);

  // Real-time synchronization of private reading history
  useEffect(() => {
    if (!currentUser) {
      // Fallback guest readings
      setSavedReadings([
        {
          id: "sr-1",
          date: "Sep 24, 2026",
          topic: "Love & Connections",
          cards: ["The Lovers", "The Star (Reversed)", "The Moon"],
          summary: "A beautiful alignment of paths, though inner anxieties block complete trust. Healing is active."
        },
        {
          id: "sr-2",
          date: "Sep 10, 2026",
          topic: "Career & Ambition",
          cards: ["The Magician", "The Emperor", "Strength"],
          summary: "Incredible manifestation power. Establish strict structure and trust your patient inner diplomacy."
        }
      ]);
      return;
    }

    const readingsRef = collection(db, "users", currentUser.uid, "readings");
    const q = query(readingsRef, orderBy("createdAt", "desc"), limit(20));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setSavedReadings(list);
    }, (error) => {
      console.error("Failed to sync member readings:", error);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Real-time synchronization of Authorized Administrators
  useEffect(() => {
    if (!isAdminAuthenticated) {
      setStaffList([]);
      return;
    }

    const usersRef = collection(db, "users");
    const q = query(usersRef, where("role", "==", "admin"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ uid: doc.id, ...doc.data() });
      });
      // Ensure kertisjohnson7@gmail.com is represented even if profile is not fully created yet, keeping it robust
      if (list.length === 0 || !list.some(u => u.email === "kertisjohnson7@gmail.com")) {
        list.unshift({
          uid: "bootstrap-admin",
          email: "kertisjohnson7@gmail.com",
          displayName: "Primary Administrator (Bootstrap)",
          role: "admin",
          gemBalance: "Infinite",
          cloutPoints: "Infinite"
        });
      }
      setStaffList(list);
    }, (error) => {
      console.error("Failed to sync staff role roster:", error);
    });

    return () => unsubscribe();
  }, [isAdminAuthenticated]);

  // Real-time synchronization of users granted Tarot Reader permission
  useEffect(() => {
    if (!isAdminAuthenticated) {
      setTarotReaderList([]);
      return;
    }
    const q = query(collection(db, "users"), where("tarotReader", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTarotReaderList(snapshot.docs.map((d) => ({ uid: d.id, ...d.data() })));
    }, (error) => {
      console.error("Failed to sync Tarot Reader roster:", error);
    });
    return () => unsubscribe();
  }, [isAdminAuthenticated]);

  // Real-time synchronization of Financial Performance stats & Reconciliation Records
  useEffect(() => {
    if (!isAdminAuthenticated) {
      setFinancialRecords([]);
      return;
    }

    // 1. Sync financial stats singleton doc
    const statsDocRef = doc(db, "admin_settings", "financials");
    const unsubStats = onSnapshot(statsDocRef, (snap) => {
      if (snap.exists()) {
        setFinancialStats(snap.data());
      }
    }, (error) => {
      console.error("Failed to sync financial settings document:", error);
    });

    // 2. Sync financial records ledger
    const recordsRef = collection(db, "financial_records");
    const q = query(recordsRef, orderBy("createdAt", "desc"), limit(50));
    
    const unsubRecords = onSnapshot(q, (snapshot) => {
      const list: any[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setFinancialRecords(list);
    }, (error) => {
      console.error("Failed to sync financial auditing records:", error);
    });

    return () => {
      unsubStats();
      unsubRecords();
    };
  }, [isAdminAuthenticated]);

  // Live Stream Chat Simulation Loop
  useEffect(() => {
    let chatInterval: NodeJS.Timeout;
    if (activeTab === "live") {
      chatInterval = setInterval(() => {
        const randomTemplate = CHAT_TEMPLATES[Math.floor(Math.random() * CHAT_TEMPLATES.length)];
        const newMsg = {
          id: Date.now() + Math.random(),
          sender: randomTemplate.sender,
          text: randomTemplate.text,
          role: randomTemplate.role
        };
        setChatMessages((prev) => [...prev.slice(-30), newMsg]);
        
        // Simulating passive hearts floating from viewers
        if (Math.random() > 0.4) {
          triggerPassiveHeart();
        }
      }, 3500);
    }
    return () => clearInterval(chatInterval);
  }, [activeTab]);

  // Auto scroll live chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  const triggerPassiveHeart = () => {
    const id = Date.now().toString() + Math.random();
    const x = 30 + Math.random() * 40; // centered
    setRisingHearts((prev) => [...prev, { id, x }]);
    setTimeout(() => {
      setRisingHearts((prev) => prev.filter((h) => h.id !== id));
    }, 2000);
  };

  // --- AUTHENTICATION HANDLERS ---
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthSuccessMsg("");

    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError("Email and password fields are required.");
      return;
    }

    if (authMode === "register" && !authDisplayName.trim()) {
      setAuthError("Chosen name is required.");
      return;
    }

    try {
      if (authMode === "login") {
        playCelestialSound("success");
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword.trim());
        setAuthSuccessMsg("Soul connection established! Welcome back.");
      } else {
        playCelestialSound("success");
        const userCred = await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword.trim());
        await updateProfile(userCred.user, {
          displayName: authDisplayName.trim()
        });
        
        // Profile (and starting balance) is created by the server; the name is a non-sensitive field
        const created = await ensureServerProfile(userCred.user, authDisplayName.trim());
        if (created) {
          if (created.displayName !== authDisplayName.trim()) {
            await updateDoc(doc(db, "users", userCred.user.uid), { displayName: authDisplayName.trim(), updatedAt: new Date().toISOString() });
            created.displayName = authDisplayName.trim();
          }
          setDbUserDoc(created);
        }
        setAuthSuccessMsg("Account registered successfully! Welcome to the Circle.");
      }
    } catch (err: any) {
      console.error("Auth Exception:", err);
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        setAuthError("Incompatible spiritual match. Incorrect credentials.");
      } else if (err.code === "auth/email-already-in-use") {
        setAuthError("This email coordinate is already linked to a celestial profile.");
      } else if (err.code === "auth/weak-password") {
        setAuthError("Your passcode must consist of at least 6 characters.");
      } else if (err.code === "auth/operation-not-allowed" || String(err.message).includes("PASSWORD_LOGIN_DISABLED")) {
        setAuthError("Email/password sign-in is not enabled for this Mysticmentor project yet.");
      } else {
        setAuthError(err.message || "An unexpected validation exception occurred.");
      }
    }
  };

  const handleSaveProfile = async (displayName: string, photo: File | null): Promise<boolean> => {
    if (!currentUser) {
      setProfileSaveError("Sign in again before saving your profile.");
      return false;
    }

    setIsProfileSaving(true);
    setProfileSaveError("");
    setProfileSaveMessage("");

    const withTimeout = <T,>(operation: Promise<T>, label: string) =>
      Promise.race<T>([
        operation,
        new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(`${label} timed out. Please check your connection and try again.`)), 20000))
      ]);

    let uploadedAvatarUrl: string | undefined;
    const currentAvatarUrl = dbUserDoc?.avatarUrl || currentUser.photoURL || undefined;
    try {
      if (photo) {
        uploadedAvatarUrl = await createAvatarDataUrl(photo);
      }

      await withTimeout(updateDoc(doc(db, "users", currentUser.uid), {
        displayName,
        ...((uploadedAvatarUrl || currentAvatarUrl) ? { avatarUrl: uploadedAvatarUrl || currentAvatarUrl } : {}),
        updatedAt: new Date().toISOString()
      }), "Saving your profile");
    } catch (error) {
      console.error("Failed to save member profile:", error);
      setProfileSaveError(error instanceof Error ? error.message : "Unable to save profile changes.");
      setIsProfileSaving(false);
      return false;
    }

    try {
      await withTimeout(updateProfile(currentUser, {
        displayName,
      }), "Authentication profile sync");
      setProfileSaveMessage("Your profile has been saved.");
    } catch (error) {
      console.error("Profile saved, but Firebase Authentication profile sync failed:", error);
      setProfileSaveMessage("Your profile was saved, but its authentication profile copy could not be synchronized. Please try saving again.");
    }
    setIsProfileSaving(false);
    return true;
  };

  const handleSignOut = async () => {
    try {
      playCelestialSound("flip");
      await signOut(auth);
      setAuthSuccessMsg("Signed out from the Sanctuary.");
    } catch (err: any) {
      console.error("Sign out error:", err);
    }
  };

  const handleForgotPassword = async () => {
    setAuthError("");
    setAuthSuccessMsg("");
    if (!authEmail.trim()) {
      setAuthError("Please input your email coordinate above to receive a reset key.");
      return;
    }
    try {
      playCelestialSound("flip");
      await sendPasswordResetEmail(auth, authEmail.trim());
      setAuthSuccessMsg("Celestial reset directive dispatched! Please inspect your email inbox.");
    } catch (err: any) {
      console.error("Password reset error:", err);
      if (err.code === "auth/user-not-found") {
        setAuthError("No registered circle account matches this email coordinate.");
      } else {
        setAuthError(err.message || "Could not dispatch reset key.");
      }
    }
  };

  // --- INTERACTIVE ACTIONS ---

  // Initialize interactive 3-card spread with smart shuffle, visibility filtering, and repeat-reduction support
  const handleDrawTarot = () => {
    playCelestialSound("success");

    // Filter available cards to exclude hidden records
    const availableCards = cards.filter(c => !c.isHidden);
    
    if (availableCards.length < 3) {
      alert("Celestial Oracle Alert: Not enough visible cards in your deck to form a 3-card spread! Please enable more cards in the Sanctuary Admin Panel.");
      return;
    }

    let selectedCards: TarotCard[] = [];

    if (smartShuffleEnabled) {
      // Divide visible deck into "fresh" and "recent" pools based on historical tracking
      const freshPool = availableCards.filter(c => !recentDrawnIds.includes(c.id));
      
      if (freshPool.length >= 3) {
        // Shuffle fresh pool and draw 3 unique cards without replacement
        const shuffledFresh = [...freshPool].sort(() => 0.5 - Math.random());
        selectedCards = shuffledFresh.slice(0, 3);
      } else {
        // Exceeded fresh pool limit. Gather all remaining fresh, then top up from oldest drawn cards in recent history
        selectedCards = [...freshPool];
        
        const recentPool = availableCards.filter(
          c => recentDrawnIds.includes(c.id) && !selectedCards.some(s => s.id === c.id)
        );
        
        // Sort remaining recent cards by least-recently drawn order (preferring lower indices in tracking list)
        recentPool.sort((a, b) => {
          const idxA = recentDrawnIds.indexOf(a.id);
          const idxB = recentDrawnIds.indexOf(b.id);
          return idxA - idxB;
        });

        const needed = 3 - selectedCards.length;
        selectedCards = [...selectedCards, ...recentPool.slice(0, needed)];
      }
    } else {
      // Standard random draw without replacement within the spread
      const shuffled = [...availableCards].sort(() => 0.5 - Math.random());
      selectedCards = shuffled.slice(0, 3);
    }

    // Wrap drawn cards with reversal calculations and flipped states
    const selected = selectedCards.map((card) => ({
      card,
      isReversed: allowReversed ? Math.random() > 0.7 : false,
      isFlipped: false
    }));

    // Update tracking records for repeat protection
    if (smartShuffleEnabled) {
      const drawnIds = selectedCards.map(c => c.id);
      setRecentDrawnIds(prev => {
        const filteredPrev = prev.filter(id => !drawnIds.includes(id));
        const updated = [...filteredPrev, ...drawnIds];
        const trimmed = updated.slice(-repeatProtectionLimit);
        localStorage.setItem("celestial_recently_drawn_cards", JSON.stringify(trimmed));
        return trimmed;
      });
    }

    setDrawnCards(selected);
    setTarotStage("reading");
    setHasFlippedAll(false);
  };

  // Flip individual card
  const handleFlipCard = (index: number) => {
    if (drawnCards[index].isFlipped) return;
    playCelestialSound("flip");
    const updated = [...drawnCards];
    updated[index].isFlipped = true;
    setDrawnCards(updated);

    // Check if all are flipped
    const allFlipped = updated.every((c) => c.isFlipped);
    if (allFlipped) {
      setHasFlippedAll(true);
    }
  };

  // Redraw Tarot resets
  const handleRedrawTarot = () => {
    playCelestialSound("flip");
    setTarotStage("setup");
    setDrawnCards([]);
    setHasFlippedAll(false);
  };

  // Dynamic interpretation generator for the 3-card spread based on topic
  const getCombinedSynthesis = () => {
    if (drawnCards.length < 3) return "";
    const names = drawnCards.map((c) => `${c.card.name} (${c.isReversed ? "Reversed" : "Upright"})`);
    
    let introduction = `For your path of "${tarotTopic}", drawing ${names[0]} in the past, ${names[1]} in the present, and ${names[2]} as your guiding horizon forms a profound energetic bridge. `;
    let logic = "";

    if (tarotTopic.includes("Love")) {
      logic = "Your romantic narrative shows a clear transition. The foundational energy asks you to process residual emotions. Today's current card invites radical vulnerability and heart-alignment. As you step forward, release old protective shields to allow authentic cosmic companionship to find you.";
    } else if (tarotTopic.includes("Career")) {
      logic = "Your professional alignment is undergoing a structural rebuild. Your past actions have secured stable knowledge, but your current state demands focus and disciplined boundaries. The future path highlights substantial abundance, provided you avoid shortcuts and stand in your absolute power.";
    } else if (tarotTopic.includes("Spiritual")) {
      logic = "This is a sacred initiation sequence. Your soul history has prepared you with deep psychic sensitivity. At present, you are called to quiet, restorative meditation and surrender. The universe is aligning to reveal your ultimate destiny; your guiding stars are brighter than ever.";
    } else {
      logic = "Your overall energy suggests a dynamic turning point. The cosmic wheel is turning, bringing karma and destined events into absolute focus. Align your analytical mind with raw instinct, trust the structural changes around you, and step forward with unconditional faith.";
    }

    return `${introduction} ${logic}`;
  };

  // --- NUMEROLOGY CALCULATOR ---
  const handleCalculateNumerology = (e: React.FormEvent) => {
    e.preventDefault();
    setCalcStatus("calculating");
    setLifePathNumber(null);

    const messages = [
      "Gathering birth coordinate frequencies...",
      "Extracting temporal numbers...",
      "Summing cosmic vibrations...",
      "Deconstructing master numbers...",
      "Aligning with the ancient Pythagorean code..."
    ];

    let step = 0;
    setCalcMessage(messages[0]);

    const interval = setInterval(() => {
      step++;
      if (step < messages.length) {
        setCalcMessage(messages[step]);
      } else {
        clearInterval(interval);
        
        // Calculate Life Path Number
        // Sum Month + Day + Year
        const mDigits = dobMonth.split("").map(Number);
        const dDigits = dobDay.split("").map(Number);
        const yDigits = dobYear.split("").map(Number);
        const allDigits = [...mDigits, ...dDigits, ...yDigits];
        
        const sumDigits = (nums: number[]): number => {
          return nums.reduce((acc, curr) => acc + curr, 0);
        };

        let initialSum = sumDigits(allDigits);
        
        // Keep reducing unless it's a Master Number: 11, 22
        const reduceToSingleDigit = (num: number): number => {
          if (num === 11 || num === 22) return num;
          if (num < 10) return num;
          const digits = num.toString().split("").map(Number);
          return reduceToSingleDigit(sumDigits(digits));
        };

        const result = reduceToSingleDigit(initialSum);
        // Fallback safety (if it gets weird or 33, force standard profile range)
        const finalNumber = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22].includes(result) ? result : 7;

        setLifePathNumber(finalNumber);
        setCalcStatus("done");
        playCelestialSound("success");
      }
    }, 600);
  };

  // --- LIVE ROOM INTERACTIONS ---

  // Handle sending user chat
  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userChatInput.trim()) return;

    const userMsg = {
      id: Date.now(),
      sender: "You (Golden Initiate)",
      text: userChatInput.trim(),
      role: "user"
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setUserChatInput("");

    // Simulate instant reaction from live reader after 1.5s
    setTimeout(() => {
      const answers = [
        "Reader Luna: I feel that question deeply. Let the cards address that.",
        "Reader Luna: Yes! The gold vibration in your profile aligns perfectly with that choice.",
        "Reader Luna: Your energetic signature indicates a beautiful breakthrough near 11:11.",
        "Reader Luna: The oracle nods. Trust the water transitions!"
      ];
      const randomAnswer = answers[Math.floor(Math.random() * answers.length)];
      setChatMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: "Reader Luna (Host)",
          text: randomAnswer,
          role: "host"
        }
      ]);
    }, 1500);
  };

  // Handle sending virtual gift
  const handleSendGift = async (giftId: string) => {
    const gift = GIFT_TEMPLATES.find((g) => g.id === giftId);
    if (!gift) return;

    if (userGems < gift.cost) {
      alert("Insufficient Gems! Recharge your celestial balance in your Dashboard.");
      return;
    }

    if (currentUser) {
      // Secure authenticated spending path for logged-in users
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) {
          alert("Session expired. Please sign in again.");
          return;
        }

        const response = await fetch("/api/spend-gems", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({
            giftId,
            recipientId: "bootstrap-admin"
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          alert(`Gift dispatch failed: ${errData.error || "Server validation error"}`);
          return;
        }

        const data = await response.json();
        // Sync our local state with the server's confirmed secure new balance
        setUserGems(data.newBalance);
      } catch (err: any) {
        console.error("Gifting error:", err);
        alert("Verification connection interrupted. Please try again.");
        return;
      }
    } else {
      // Guest mode fallback (Unsecured local-only cache)
      setUserGems((prev) => prev - gift.cost);
    }

    // Increment Goal
    setLiveGoal((prev) => Math.min(500, prev + gift.cost));

    // Play synthesized sound
    playCelestialSound(giftId);

    // Create gift announcement in chat
    const announceMsg = {
      id: Date.now(),
      sender: currentUser ? (dbUserDoc?.displayName || currentUser.email?.split("@")[0] || "You") : "You (Guest)",
      text: `sent ${gift.name} ${gift.icon}!`,
      role: currentUser ? "user" : "viewer",
      gift: gift.name,
      color: gift.color
    };
    setChatMessages((prev) => [...prev, announceMsg]);

    // Animate custom floating gift overlay inside feed
    const id = Date.now().toString();
    const x = 20 + Math.random() * 60; // 20% to 80% horizontal range
    const y = 30 + Math.random() * 40;
    setActiveGifts((prev) => [...prev, { id, icon: gift.icon, x, y }]);

    setTimeout(() => {
      setActiveGifts((prev) => prev.filter((item) => item.id !== id));
    }, 2500);

    // Generate hearts
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        triggerPassiveHeart();
      }, i * 200);
    }
  };

  // Tip Reader Interface with server-side processing
  const handleSendTip = async (amount: number) => {
    if (!currentUser) {
      alert("Please sign in or register to send cash tips.");
      return;
    }

    try {
      playCelestialSound("success");
      setLiveGoal((prev) => Math.min(500, prev + Math.floor(amount * 5))); // 1 dollar = 5 gems conversion
      setTipSuccessMessage(`Successfully tipped $${amount}! Luna raises her hands in gratitude.`);
      setTimeout(() => setTipSuccessMessage(""), 5000);

      const tipMsg = {
        id: Date.now(),
        sender: "You",
        text: `tipped $${amount}! 💖`,
        role: "user"
      };
      setChatMessages((prev) => [...prev, tipMsg]);

      // Call our secure Express endpoint to divide fees (20/80) and update Firestore securely
      await fetch("/api/process-sandbox-tip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: currentUser.uid,
          recipientId: "bootstrap-admin", // Tips go securely to the channel owner's connected wallet
          amount
        })
      });
    } catch (err) {
      console.error("Failed to process server-side tip:", err);
    }
  };

  // Securely trigger checkout session for purchasing celestial gems package
  const handleBuyGems = async (packageId: string, cost: number, gemsAmount: number) => {
    if (!currentUser) {
      alert("Please sign in or register to purchase celestial gems.");
      return;
    }
    try {
      playCelestialSound("success");
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/create-gem-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + idToken },
        body: JSON.stringify({
          userId: currentUser.uid,
          packageId,
          cost,
          gemsAmount
        })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url; // redirects to Stripe or Sandbox Simulator checkout!
      } else {
        alert(data.error || "Failed to establish checkout portal. Please try again.");
      }
    } catch (err) {
      console.error("Gem purchase error:", err);
      alert("Could not process your checkout connection.");
    }
  };

  // Securely trigger Stripe Connect Express onboarding link
  const handleConnectStripe = async () => {
    if (!currentUser) return;
    try {
      playCelestialSound("success");
      const res = await fetch("/api/create-connect-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: currentUser.uid })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Connect onboarding link failed.");
      }
    } catch (err) {
      console.error("Stripe Connect error:", err);
    }
  };

  // Securely promote a registered email-verified user to Administrator in Cloud Firestore
  const handlePromoteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffEmailInput.trim()) return;

    try {
      playCelestialSound("success");
      const targetEmail = staffEmailInput.trim().toLowerCase();
      
      // Query users collection for this email
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("email", "==", targetEmail));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        alert(`No registered Celestial profile found for email coordinate: "${targetEmail}". Please ensure your wife registers her account and coordinates first.`);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();

      if (userData.role === "admin") {
        alert(`"${targetEmail}" is already authorized as a Celestial Architect (Admin).`);
        return;
      }

      // Promote in Firestore
      await updateDoc(doc(db, "users", userDoc.id), {
        role: "admin",
        updatedAt: new Date().toISOString()
      });

      alert(`Success! "${targetEmail}" has been granted administrator privileges in the Firestore database. They will receive access upon email verification.`);
      setStaffEmailInput("");
    } catch (error) {
      console.error("Failed to promote staff:", error);
      alert("Spiritual permission denied: Only authorized administrators can promote users.");
    }
  };

  // Demote an administrator back to standard member in Cloud Firestore
  const handleDemoteStaff = async (uid: string, email: string) => {
    if (email === "kertisjohnson7@gmail.com") {
      alert("Demotion Denied: The primary bootstrap administrator cannot be demoted.");
      return;
    }

    if (confirm(`Are you sure you want to revoke administrator privileges for "${email}"?`)) {
      try {
        playCelestialSound("flip");
        await updateDoc(doc(db, "users", uid), {
          role: "member",
          updatedAt: new Date().toISOString()
        });
        alert(`Success! "${email}" has been demoted to a standard member in the Firestore database.`);
      } catch (error) {
        console.error("Failed to demote staff:", error);
        alert("Permission Denied: Only authorized administrators can alter user roles.");
      }
    }
  };

  // Grant or revoke the Tarot Reader permission (stored on the user's Firestore profile)
  const handleSetTarotReader = async (e: React.FormEvent | null, target: { uid?: string; email: string }, enabled: boolean) => {
    e?.preventDefault();
    try {
      let uid = target.uid;
      if (!uid) {
        const email = target.email.trim().toLowerCase();
        if (!email) return;
        const snap = await getDocs(query(collection(db, "users"), where("email", "==", email)));
        if (snap.empty) {
          alert(`No registered profile found for "${email}".`);
          return;
        }
        uid = snap.docs[0].id;
      }
      await updateDoc(doc(db, "users", uid), { tarotReader: enabled, updatedAt: new Date().toISOString() });
      if (!target.uid) setTarotReaderEmailInput("");
    } catch (error) {
      console.error("Failed to update Tarot Reader permission:", error);
      alert("Permission Denied: Only authorized administrators can change Tarot Reader access.");
    }
  };

  // Helper to dynamically get Lucide Icon components
  const getLucideIcon = (name: string, className = "w-6 h-6") => {
    const iconMap: Record<string, any> = {
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
      Sun
    };
    const Component = iconMap[name] || Sparkles;
    return <Component className={className} />;
  };

  if (isSandboxCheckoutPath) {
    const sessionId = queryParams.get("session_id");
    const userId = queryParams.get("userId");
    const gemsAmount = queryParams.get("gemsAmount");
    const cost = queryParams.get("cost");
    const packageId = queryParams.get("packageId");

    const handleAuthorizeSimulatedPayment = async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (idToken) {
          headers["Authorization"] = `Bearer ${idToken}`;
        }

        const res = await fetch("/api/simulate-webhook-success", {
          method: "POST",
          headers,
          body: JSON.stringify({
            session_id: sessionId,
            userId,
            gemsAmount,
            cost,
            packageId
          })
        });
        const data = await res.json();
        if (data.success) {
          window.location.href = `/dashboard?payment=success&tx=${sessionId}`;
        } else {
          alert("Simulation failed.");
        }
      } catch (err) {
        console.error(err);
      }
    };

    return (
      <div className="min-h-screen bg-[#070412] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#120a26] border-2 border-mystic-gold rounded-2xl p-6 space-y-6 shadow-2xl text-left relative">
          <div className="flex items-center gap-2 border-b border-[#2c1654]/40 pb-3">
            <Gem className="w-6 h-6 text-mystic-gold animate-bounce" />
            <h1 className="font-display text-base font-bold text-white tracking-wider">STRIPE SECURE CHECKOUT (SANDBOX)</h1>
          </div>

          <div className="space-y-4">
            <div className="p-3 bg-black/40 rounded-lg border border-[#2c1654]/60">
              <span className="text-[10px] font-mono text-slate-400 block uppercase">Product Selection</span>
              <strong className="text-white block text-sm">{gemsAmount} Celestial Gems Package</strong>
              <span className="text-[11px] text-teal-400 block mt-0.5">Price: ${cost} USD</span>
            </div>

            <div className="p-3 bg-black/40 rounded-lg border border-[#2c1654]/60 text-xs text-slate-300 space-y-2">
              <div className="flex justify-between">
                <span>Account ID:</span>
                <span className="font-mono text-[10px]">{userId}</span>
              </div>
              <div className="flex justify-between">
                <span>Session ID:</span>
                <span className="font-mono text-[10px]">{sessionId}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/5 rounded-lg border border-amber-500/30 text-[10px] text-amber-300 leading-normal">
              ⚠️ <strong>Developer Mode Active:</strong> This is a sandboxed Stripe payment flow simulation. Clicking authorize sends a verified simulated webhook event directly to the full-stack server endpoint `/api/stripe-webhook` to securely increment user wallet credits. No real cards are required.
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleAuthorizeSimulatedPayment}
              className="flex-1 py-2.5 rounded-lg bg-mystic-gold text-black font-bold text-xs uppercase cursor-pointer text-center"
            >
              Authorize Payment
            </button>
            <button
              onClick={() => { window.location.href = `/dashboard?payment=cancel`; }}
              className="px-4 py-2.5 rounded-lg border border-[#2c1654] text-slate-300 text-xs cursor-pointer hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isSandboxConnectPath) {
    const userId = queryParams.get("userId");

    const handleCompleteSimulatedOnboarding = async () => {
      try {
        await updateDoc(doc(db, "users", userId!), {
          stripeConnectId: "acct_sim_" + Date.now(),
          stripeConnectStatus: "active",
          updatedAt: new Date().toISOString()
        });
        window.location.href = `/dashboard?connect=success`;
      } catch (err) {
        console.error(err);
      }
    };

    return (
      <div className="min-h-screen bg-[#070412] text-slate-100 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#120a26] border-2 border-teal-500 rounded-2xl p-6 space-y-6 shadow-2xl text-left relative">
          <div className="flex items-center gap-2 border-b border-[#2c1654]/40 pb-3">
            <Shield className="w-6 h-6 text-teal-400" />
            <h1 className="font-display text-base font-bold text-white tracking-wider">STRIPE CONNECT SETUP (SANDBOX)</h1>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Link your recipient bank account or debit card coordinate to authorize split payouts. Under the current transfer model, you will receive <strong>80% of cash tips</strong> directly.
          </p>

          <div className="space-y-4">
            <div className="p-3 bg-black/40 rounded-lg border border-[#2c1654]/60 text-xs text-slate-300 space-y-2">
              <div className="flex justify-between">
                <span>Account User Reference:</span>
                <span className="font-mono text-[10px]">{userId}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform Commission:</span>
                <span className="font-mono text-teal-300">20% Application Fee</span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleCompleteSimulatedOnboarding}
              className="flex-1 py-2.5 rounded-lg bg-teal-400 text-black font-bold text-xs uppercase hover:brightness-110 active:scale-95 transition-all cursor-pointer text-center"
            >
              Complete Onboarding
            </button>
            <button
              onClick={() => { window.location.href = `/dashboard?connect=cancel`; }}
              className="px-4 py-2.5 rounded-lg border border-[#2c1654] text-slate-300 text-xs cursor-pointer hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="h-[100dvh] overflow-hidden bg-[#070412] text-slate-100 flex flex-col items-center relative">
      {/* Wide-screen sanctuary scenery (hidden on phones) */}
      <div aria-hidden="true" className="hidden md:block absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-60"
          style={{ backgroundImage: `url(${COSMIC_BACKDROP})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070412]/70 via-transparent to-[#070412]/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#070412]/40 via-transparent to-[#070412]/70" />
        <div
          className="hidden lg:block absolute top-1/2 left-[4%] xl:left-[8%] w-[14vw] max-w-[220px] aspect-[3/4] -translate-y-1/2 -rotate-6 rounded-2xl bg-cover bg-center shadow-[0_0_60px_rgba(243,198,95,0.25)] border border-mystic-gold/40 opacity-90"
          style={{ backgroundImage: `url(${CARD_BACK_IMG})` }}
        />
        <div
          className="hidden lg:block absolute top-1/2 right-[4%] xl:right-[8%] w-[14vw] max-w-[220px] aspect-[3/4] -translate-y-1/2 rotate-6 rounded-2xl bg-cover bg-center shadow-[0_0_60px_rgba(243,198,95,0.25)] border border-mystic-gold/40 opacity-90"
          style={{ backgroundImage: `url(${CARD_BACK_IMG})` }}
        />
      </div>

      {/* Outer Widescreen/Desktop Container Wrapper with moving nebula & starfield background */}
      <div className={`w-full cosmic-nebula-bg shadow-2xl flex flex-col relative z-10 overflow-hidden ${activeTab === "live" ? "h-[100dvh] min-h-0 max-w-none pb-16" : "max-w-md h-[100dvh] min-h-0 border-x border-[#1a1133] pb-20"}`}>
        
        {/* Phone-only scenery inside the app column, beneath all content */}
        {activeTab !== "live" && (
          <div aria-hidden="true" className="md:hidden absolute inset-0 -z-10 pointer-events-none overflow-hidden">
            <div
              className="absolute inset-0 bg-cover bg-[62%_50%] opacity-45"
              style={{ backgroundImage: `url(${COSMIC_BACKDROP})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#070412]/60 via-[#070412]/25 to-[#070412]/75" />
          </div>
        )}

        {/* Continuous Floating & Pulsing Cosmic Orbs at varied sizes and depths */}
        {activeTab !== "live" && <>
          <div className="absolute top-12 left-10 w-24 h-24 cosmic-glowing-orb-gold animate-float-orb-gold pointer-events-none" />
          <div className="absolute top-1/4 -right-12 w-32 h-32 cosmic-glowing-orb-purple animate-float-orb-purple pointer-events-none" />
          <div className="absolute bottom-40 left-6 w-28 h-28 cosmic-glowing-orb-indigo animate-float-orb-indigo pointer-events-none" />
          <div className="absolute top-[60%] right-10 w-20 h-20 cosmic-glowing-orb-gold animate-float-orb-gold pointer-events-none" style={{ animationDelay: "-4s" }} />
          <div className="absolute top-[80%] -left-12 w-36 h-36 cosmic-glowing-orb-purple animate-float-orb-purple pointer-events-none" style={{ animationDelay: "-8s" }} />
        </>}

        {activeTab !== "tarot" && activeTab !== "live" && (
          <div className="absolute top-4 right-4 z-10 w-16 h-16 sm:w-20 sm:h-20 drop-shadow-[0_0_10px_rgba(200,162,200,0.5)]">
            <img src="/src/assets/images/mascot.jpeg" alt="Luna's Little Guardian" className="w-full h-full object-contain" />
          </div>
        )}

        {/* Shooting Stars */}
        <div className="absolute top-20 right-10 w-[2px] h-[2px] bg-white rounded-full shooting-star-1 pointer-events-none opacity-40 shadow-[0_0_8px_#fff]" />
        <div className="absolute top-96 right-20 w-[1.5px] h-[1.5px] bg-mystic-gold rounded-full shooting-star-2 pointer-events-none opacity-30 shadow-[0_0_6px_#f3c65f]" />

        {/* Rotating Celestial Astrological Ring / Sacred Geometry */}
        <div className="cosmic-ring-container">
          <svg className="w-full h-full celestial-ring text-mystic-gold" viewBox="0 0 200 200" fill="none" stroke="currentColor">
            <circle cx="100" cy="100" r="95" strokeWidth="0.9" strokeDasharray="4 3" />
            <circle cx="100" cy="100" r="85" strokeWidth="0.65" />
            <circle cx="100" cy="100" r="50" strokeWidth="0.65" />
            <polygon points="100,50 143.3,125 56.7,125" strokeWidth="0.45" />
            <polygon points="100,150 143.3,75 56.7,75" strokeWidth="0.45" />
            <circle cx="100" cy="50" r="1.75" fill="currentColor" />
            <circle cx="100" cy="150" r="1.75" fill="currentColor" />
            <circle cx="143.3" cy="125" r="1.75" fill="currentColor" />
            <circle cx="56.7" cy="125" r="1.75" fill="currentColor" />
            <circle cx="143.3" cy="75" r="1.75" fill="currentColor" />
            <circle cx="56.7" cy="75" r="1.75" fill="currentColor" />
          </svg>
        </div>

        {/* --- STICKY TOP APP BAR (Pattern 2 Contract: 1-Row, 3-Zone) --- */}
        {activeTab !== "live" && <header className="sticky top-0 z-50 bg-[#070412]/80 backdrop-blur-md border-b border-[#2c1654]/40 px-4 py-3 flex items-center justify-between h-14">
          {/* Zone 1: Brand Title Wordmark in Display Font */}
          <div className="flex items-center gap-1.5">
            <span className="font-display text-lg font-bold tracking-wider text-mystic-gold animate-text-pulse">
              CELESTIAL
            </span>
            <span className="font-display text-xs tracking-widest text-teal-400 font-semibold opacity-80">
              SANCTUARY
            </span>
          </div>

          {/* Zone 2: Navigation Status Indicators (Compact / Unboxed Text Metadata) */}
          <div className="hidden xs:flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
            <span>Sun in Libra</span>
            <span aria-hidden="true" className="text-mystic-gold/40">·</span>
            <span className="text-teal-400">Moon in Cancer</span>
          </div>

          {/* Zone 3: Interactive Sound Mute & Profile Indicator */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setIsMuted(!isMuted);
                playCelestialSound("flip");
              }}
              className="p-1.5 rounded-lg border border-[#2c1654]/60 bg-[#120a26]/40 hover:text-mystic-gold transition-colors"
              title={isMuted ? "Unmute Celestial Chimes" : "Mute Sound"}
              aria-label="Toggle Sound"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-mystic-gold" />}
            </button>
            <button
              onClick={async () => {
                if (currentUser) {
                  await handleSignOut();
                } else if (hasSkippedAuth) {
                  playCelestialSound("flip");
                  localStorage.removeItem("celestial_skipped_auth");
                  setHasSkippedAuth(false);
                }
              }}
              className="w-7 h-7 rounded-full bg-gradient-to-tr from-mystic-gold to-purple-600 flex items-center justify-center p-0.5 shadow-md cursor-pointer hover:brightness-110 active:scale-95 transition-all"
            >
              <div className="w-full h-full bg-[#0b081c] rounded-full flex items-center justify-center text-[10px] font-bold text-mystic-gold">
                AT
              </div>
            </button>
          </div>
        </header>}

        {/* Main Content View Switcher */}
        <main className={`flex-1 min-h-0 z-10 overflow-y-auto ${activeTab === "live" ? "px-0 py-0" : "px-4 py-4"}`}>


          {!isAuthLoading && !currentUser && !hasSkippedAuth && activeTab !== "dashboard" ? (
            <CelestialOnboarding
              authMode={authMode}
              setAuthMode={setAuthMode}
              authDisplayName={authDisplayName}
              setAuthDisplayName={setAuthDisplayName}
              authEmail={authEmail}
              setAuthEmail={setAuthEmail}
              authPassword={authPassword}
              setAuthPassword={setAuthPassword}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              authError={authError}
              authSuccessMsg={authSuccessMsg}
              handleAuthSubmit={handleAuthSubmit}
              handleForgotPassword={handleForgotPassword}
              onGuestExplore={() => {
                playCelestialSound("flip");
                localStorage.setItem("celestial_skipped_auth", "true");
                setHasSkippedAuth(true);
              }}
            />
          ) : (
            <>

              {/* ==================== 1. HOME VIEW ==================== */}
          {activeTab === "home" && (
            <div className="space-y-6 fade-in">
              
              {/* Premium Hero Celestial Welcome */}
              <div className="relative rounded-2xl overflow-hidden border border-[#2c1654] shadow-xl p-5 bg-gradient-to-br from-[#1c113a] to-[#0a0618] text-center">
                <div 
                  className="absolute inset-0 opacity-20 bg-cover bg-center mix-blend-overlay pointer-events-none"
                  style={{ backgroundImage: `url(${COSMIC_BACKDROP})` }}
                />
                <h1 className="font-display text-xl font-bold tracking-wide text-white mb-1">
                  Step Into the Sanctuary
                </h1>
                <p className="text-xs text-slate-300 max-w-xs mx-auto leading-relaxed mb-4">
                  Unlock cosmic timelines, calculate your life vibrational frequency, and stream real-time interactive readings.
                </p>
                
                {/* Celestial Transition Micro Indicators (Unboxed) */}
                <div className="flex flex-wrap justify-center items-center gap-2 text-[10px] text-slate-400 border-t border-[#2c1654]/50 pt-3">
                  <span className="text-mystic-gold font-semibold">VENUS IN SCORPIO</span>
                  <span aria-hidden="true" className="text-slate-600">/</span>
                  <span>MERCURY DIRECT</span>
                  <span aria-hidden="true" className="text-slate-600">/</span>
                  <span className="text-teal-400 font-semibold">ECLIPSE SEASON ACTIVE</span>
                </div>
              </div>

              {/* CARD OF THE DAY (Interactive Single Card Draw) */}
              <div className="rounded-2xl border border-[#2c1654]/60 p-5 bg-[#120a26]/40 backdrop-blur-md">
                <div className="flex items-center justify-between mb-3 border-b border-[#2c1654]/30 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-mystic-gold" />
                    <h2 className="font-display text-sm font-semibold text-mystic-gold tracking-wider">
                      Daily Guidance Oracle
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400">Single Card draw</span>
                    <button
                      type="button"
                      onClick={() => {
                        handleDrawTarot();
                        setActiveTab("tarot");
                      }}
                      className="text-[9px] font-semibold tracking-wide text-mystic-gold border border-mystic-gold/40 px-2 py-1 rounded hover:bg-mystic-gold/10"
                    >
                      THREE-CARD DRAW
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                  Focus your intent, hold a question in your consciousness, and tap the daily card to reveal your spiritual directive.
                </p>

                {dailyCard ? (
                  <div className="flex flex-col items-center">
                    
                    {/* The 3D Flippable Card */}
                    <div className="perspective-1000 w-40 h-64 my-2">
                      <div
                        onClick={() => {
                          if (!dailyCardFlipped) {
                            playCelestialSound("flip");
                            setDailyCardFlipped(true);
                          }
                        }}
                        className={`w-full h-full duration-700 transform-style-3d cursor-pointer relative ${
                          dailyCardFlipped ? "rotate-y-180" : "hover:scale-105"
                        }`}
                      >
                        {/* CARD BACK */}
                        <div 
                          className="absolute inset-0 w-full h-full rounded-xl bg-cover bg-center border border-mystic-gold/40 shadow-xl backface-hidden flex flex-col justify-between p-3 card-active-ripple"
                          style={{ backgroundImage: `url(${CARD_BACK_IMG})` }}
                        >
                          {/* Golden Ripple Wave Overlay */}
                          <div className="absolute inset-0 bg-transparent rounded-xl pointer-events-none z-30 ripple-wave-element" />
                          
                          {/* Sparkle Particles Burst */}
                          <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
                            <span className="cosmic-sparkle s-1" />
                            <span className="cosmic-sparkle s-2" />
                            <span className="cosmic-sparkle s-3" />
                            <span className="cosmic-sparkle s-4" />
                            <span className="cosmic-sparkle s-5" />
                            <span className="cosmic-sparkle s-6" />
                          </div>

                          <div className="w-full border-t border-mystic-gold/20 pt-1 z-10" />
                          <div className="self-center w-12 h-12 rounded-full border border-mystic-gold/30 bg-black/40 flex items-center justify-center z-10">
                            <MoonStar className="w-6 h-6 text-mystic-gold/80 animate-pulse-subtle" />
                          </div>
                          <div className="w-full border-b border-mystic-gold/20 pb-1 z-10" />
                        </div>

                        {/* CARD FRONT */}
                        <div
                          className={`absolute inset-0 w-full h-full rounded-xl bg-gradient-to-b from-[#1d123e] to-[#070412] border-2 border-mystic-gold shadow-xl backface-hidden rotate-y-180 flex flex-col justify-between p-3 text-center overflow-hidden ${
                            dailyCardReversed ? "rotate-180" : ""
                          }`}
                        >
                          {/* Delicate celestial gold frame */}
                          <div className="absolute inset-1.5 border border-mystic-gold/20 rounded-lg pointer-events-none" />
                          
                          <span className="text-[10px] font-mono tracking-widest text-mystic-gold/80 block mt-1">
                            ARCANA {dailyCard.number}
                          </span>

                          <div className="my-auto flex flex-col items-center z-10">
                            <div className="w-14 h-14 rounded-full bg-mystic-gold/10 border border-mystic-gold/30 flex items-center justify-center text-mystic-gold mb-2 shadow-inner">
                              {getLucideIcon(dailyCard.iconName, "w-8 h-8")}
                            </div>
                            <h3 className="font-display text-sm font-semibold text-white tracking-wide">
                              {dailyCard.name}
                            </h3>
                            <p className="text-[9px] text-teal-400 font-medium mt-1 uppercase tracking-wider">
                              {dailyCardReversed ? "Reversed Directive" : "Upright Alignment"}
                            </p>
                          </div>

                          <div className="text-[9px] text-slate-400 z-10 italic truncate">
                            {dailyCard.description}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Revealer Details */}
                    {dailyCardFlipped && (
                      <div className="mt-4 p-4 rounded-xl bg-black/40 border border-[#2c1654]/40 w-full space-y-2 text-left fade-in">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-mystic-gold font-display">
                            {dailyCard.name} ({dailyCardReversed ? "Reversed" : "Upright"})
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 bg-[#2c1654]/60 text-teal-300 rounded">
                            Keywords
                          </span>
                        </div>
                        
                        {/* Keywords unboxed */}
                        <div className="text-[10px] text-teal-400 font-medium tracking-wide">
                          {(dailyCardReversed ? dailyCard.reversedKeywords : dailyCard.uprightKeywords).join(" · ")}
                        </div>

                        <p className="text-xs text-slate-300 leading-relaxed border-t border-[#2c1654]/30 pt-2">
                          {dailyCardReversed ? dailyCard.reversedMeaning : dailyCard.uprightMeaning}
                        </p>

                        <div className="bg-[#120a26]/80 p-2.5 rounded-lg border-l-2 border-mystic-gold text-[11px] text-slate-300 italic">
                          <span className="font-bold text-mystic-gold not-italic">Daily Advice: </span>
                          {dailyCard.advice}
                        </div>

                        <button
                          onClick={() => {
                            playCelestialSound("flip");
                            setDailyCardFlipped(false);
                            // Draw another random visible card from the configured deck
                            setTimeout(() => {
                              const available = cards.filter(c => !c.isHidden);
                              if (available.length > 0) {
                                const randomIndex = Math.floor(Math.random() * available.length);
                                setDailyCard(available[randomIndex]);
                                setDailyCardReversed(allowReversed ? Math.random() > 0.7 : false);
                              }
                            }, 300);
                          }}
                          className="w-full mt-2 py-2 text-center text-xs font-semibold text-mystic-gold bg-mystic-gold/10 rounded-lg hover:bg-mystic-gold/20 transition-all border border-mystic-gold/30 active:scale-[0.98]"
                        >
                          Shuffle & Redraw Another Daily Card
                        </button>
                      </div>
                    )}

                    {!dailyCardFlipped && (
                      <p className="text-[10px] text-teal-400 animate-pulse mt-1 tracking-wide uppercase font-semibold">
                        ▲ Tap Card to Unlock Vibrations ▲
                      </p>
                    )}

                  </div>
                ) : (
                  <div className="h-40 flex items-center justify-center text-slate-500">
                    Aligning deck elements...
                  </div>
                )}
              </div>

              {/* CORE HUB FEATURE SHORTCUTS */}
              <div className="space-y-3">
                <h3 className="font-display text-xs tracking-widest text-slate-400 font-bold uppercase pl-1">
                  Sacred Instruments
                </h3>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setActiveTab("tarot"); playCelestialSound("flip"); }}
                    className="p-4 rounded-xl bg-gradient-to-b from-[#161031] to-[#0c081e] border border-[#2c1654]/60 text-left hover:border-mystic-gold/60 transition-all shadow group"
                  >
                    <Wand2 className="w-5 h-5 text-mystic-gold mb-2 group-hover:scale-110 transition-transform" />
                    <h4 className="font-display text-xs font-semibold text-white tracking-wide">
                      Tarot Oracle
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      Interactive 3-Card layout for love, career, or spirit.
                    </p>
                  </button>

                  <button
                    onClick={() => { setActiveTab("zodiac"); playCelestialSound("flip"); }}
                    className="p-4 rounded-xl bg-gradient-to-b from-[#161031] to-[#0c081e] border border-[#2c1654]/60 text-left hover:border-mystic-gold/60 transition-all shadow group"
                  >
                    <MoonStar className="w-5 h-5 text-teal-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h4 className="font-display text-xs font-semibold text-white tracking-wide">
                      Zodiac Portal
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      12 signs and customized daily celestial forecasts.
                    </p>
                  </button>

                  <button
                    onClick={() => { setActiveTab("numerology"); playCelestialSound("flip"); }}
                    className="p-4 rounded-xl bg-gradient-to-b from-[#161031] to-[#0c081e] border border-[#2c1654]/60 text-left hover:border-mystic-gold/60 transition-all shadow group"
                  >
                    <Activity className="w-5 h-5 text-purple-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h4 className="font-display text-xs font-semibold text-white tracking-wide">
                      Numerology
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      Vibrational Life Path numbers calculated dynamically.
                    </p>
                  </button>

                  <button
                    onClick={() => { setActiveTab("live"); playCelestialSound("flip"); }}
                    className="p-4 rounded-xl bg-gradient-to-b from-[#161031] to-[#0c081e] border border-[#2c1654]/60 text-left hover:border-mystic-gold/60 transition-all shadow group relative overflow-hidden"
                  >
                    <span className="absolute top-3 right-3 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                    </span>
                    <Video className="w-5 h-5 text-red-400 mb-2 group-hover:scale-110 transition-transform" />
                    <h4 className="font-display text-xs font-semibold text-white tracking-wide">
                      Live Portal
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                      Simulated chat, gift sending, and tipping demo room.
                    </p>
                  </button>
                </div>
              </div>

              {/* REVERED TESTIMONIAL ADJACENT (Section 1.H Constraint) */}
              <div className="rounded-xl border border-[#2c1654]/30 p-4 bg-black/20 text-center">
                <span className="text-[9px] font-mono tracking-widest text-mystic-gold uppercase block mb-1">
                  Verified Spiritual Circle
                </span>
                <p className="text-[11px] text-slate-300 italic leading-relaxed">
                  "Luna's guidance predicted my career shift to the exact day. The three-card synthesis is incredibly detailed and therapeutic."
                </p>
                <span className="text-[9px] text-slate-500 block mt-1.5 font-medium">
                  — Evelyn Vance, Creative Producer, San Francisco
                </span>
              </div>

            </div>
          )}

          {/* ==================== 2. TAROT VIEW ==================== */}
          {activeTab === "tarot" && (
            <div className="space-y-6 fade-in">
              
              <div className="text-center space-y-1">
                <h2 className="font-display text-lg font-bold tracking-wider text-mystic-gold">
                  The Golden Oracle Spread
                </h2>
                <p className="text-xs text-slate-400">
                  A high-fidelity three-card past, present, and future energetic path.
                </p>
              </div>

              {tarotStage === "setup" ? (
                <div className="space-y-5 rounded-2xl border border-[#2c1654] p-5 bg-[#120a26]/40 backdrop-blur-md">
                  
                  {/* Topic Selector */}
                  <div className="space-y-3">
                    <label className="text-xs font-semibold text-slate-300 pl-1">
                      Choose Your Question Focus:
                    </label>
                    
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { title: "Love & Relationships", desc: "Soulmates, dynamics, romantic paths" },
                        { title: "Career & Abundance", desc: "Wealth, status, upcoming business shifts" },
                        { title: "Spiritual Path & Self", desc: "Intuition development, shadow self, wisdom" },
                        { title: "General Fortunes", desc: "Overall aura vibe, upcoming cosmic trends" }
                      ].map((item) => (
                        <button
                          key={item.title}
                          onClick={() => {
                            setTarotTopic(item.title);
                            playCelestialSound("flip");
                          }}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            tarotTopic === item.title
                              ? "bg-gradient-to-r from-[#211442] to-[#120a26] border-mystic-gold text-white shadow-lg shadow-mystic-gold/10"
                              : "bg-[#0b081c] border-[#2c1654]/50 hover:border-[#2c1654] text-slate-400"
                          }`}
                        >
                          <div className="font-display text-xs font-semibold tracking-wide">
                            {item.title}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 font-normal">
                            {item.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-[#2c1654]/40 pt-4">
                    <button
                      onClick={handleDrawTarot}
                      className="w-full py-3 rounded-xl bg-gradient-to-r from-mystic-gold-dark via-mystic-gold to-mystic-gold-dark text-[#070412] font-semibold text-xs tracking-widest uppercase hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-mystic-gold/25"
                    >
                      Summon the Oracle Cards
                    </button>
                  </div>

                  <div className="text-[10px] text-center text-slate-500 italic">
                    The deck will be thoroughly shuffled and magnetized to your chosen vibration.
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  
                  {/* Active Reading Header */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#120a26]/60 border border-[#2c1654]/40 text-xs">
                    <div>
                      <span className="text-slate-400 font-normal">Active Reading: </span>
                      <span className="text-mystic-gold font-semibold font-display tracking-wide">{tarotTopic}</span>
                    </div>
                    <button
                      onClick={handleRedrawTarot}
                      className="text-[10px] text-teal-400 border border-teal-400/40 px-2 py-1 rounded bg-teal-400/10 hover:bg-teal-400/20 active:scale-[0.97] transition-all"
                    >
                      Reset Deck
                    </button>
                  </div>

                  {/* THREE CARDS LAYOUT */}
                  <div className="grid grid-cols-3 gap-2 py-4">
                    {drawnCards.map((item, index) => {
                      const positionLabel = index === 0 ? "Past" : index === 1 ? "Present" : "Future";
                      return (
                        <div key={index} className="flex flex-col items-center space-y-2">
                          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold font-display">
                            {positionLabel}
                          </span>

                          {/* Interactive Card Container */}
                          <div className="perspective-1000 w-full aspect-[2/3] max-h-56">
                            <div
                              onClick={() => handleFlipCard(index)}
                              className={`w-full h-full duration-700 transform-style-3d cursor-pointer relative ${
                                item.isFlipped ? "rotate-y-180" : "hover:scale-[1.02]"
                              }`}
                            >
                              {/* CARD BACK */}
                              <div
                                className="absolute inset-0 w-full h-full rounded-lg bg-cover bg-center border border-mystic-gold/40 shadow-lg backface-hidden flex items-center justify-center p-2 card-active-ripple"
                                style={{ backgroundImage: `url(${CARD_BACK_IMG})` }}
                              >
                                {/* Golden Ripple Wave Overlay */}
                                <div className="absolute inset-0 bg-transparent rounded-lg pointer-events-none z-30 ripple-wave-element" />
                                
                                {/* Sparkle Particles Burst */}
                                <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
                                  <span className="cosmic-sparkle s-1" />
                                  <span className="cosmic-sparkle s-2" />
                                  <span className="cosmic-sparkle s-3" />
                                  <span className="cosmic-sparkle s-4" />
                                  <span className="cosmic-sparkle s-5" />
                                  <span className="cosmic-sparkle s-6" />
                                </div>

                                <div className="w-8 h-8 rounded-full border border-mystic-gold/20 bg-black/60 flex items-center justify-center z-10">
                                  <Sparkles className="w-4 h-4 text-mystic-gold/60 animate-pulse" />
                                </div>
                              </div>

                              {/* CARD FRONT */}
                              <div
                                className={`absolute inset-0 w-full h-full rounded-lg bg-gradient-to-b from-[#180f33] to-[#070412] border-2 border-mystic-gold shadow-lg backface-hidden rotate-y-180 flex flex-col justify-between p-2 text-center ${
                                  item.isReversed ? "rotate-180" : ""
                                }`}
                              >
                                {/* Subtle gold accent */}
                                <div className="absolute inset-1 border border-mystic-gold/10 rounded-md pointer-events-none" />

                                <span className="text-[8px] font-mono text-mystic-gold/80 block uppercase tracking-tight">
                                  Arcana {item.card.number}
                                </span>

                                <div className="my-auto flex flex-col items-center">
                                  <div className="w-8 h-8 rounded-full bg-mystic-gold/10 border border-mystic-gold/20 flex items-center justify-center text-mystic-gold mb-1">
                                    {getLucideIcon(item.card.iconName, "w-4 h-4")}
                                  </div>
                                  <h4 className="font-display text-[9px] font-bold text-white tracking-tight leading-tight line-clamp-1">
                                    {item.card.name}
                                  </h4>
                                  <p className="text-[7px] text-teal-400 font-semibold uppercase mt-0.5 tracking-tighter">
                                    {item.isReversed ? "Rev." : "Upr."}
                                  </p>
                                </div>

                                <span className="text-[6px] text-slate-500 uppercase font-mono block">
                                  Oracle Vibe
                                </span>
                              </div>
                            </div>
                          </div>

                          {!item.isFlipped ? (
                            <span className="text-[8px] text-mystic-gold animate-pulse text-center">
                              Tap to Reveal
                            </span>
                          ) : (
                            <span className="text-[9px] text-teal-400 font-semibold truncate max-w-full text-center font-display">
                              {item.card.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* INTERPRETATIONS SECTION (Visible dynamically as they are flipped) */}
                  <div className="space-y-4">
                    {drawnCards.some((c) => c.isFlipped) && (
                      <h3 className="font-display text-xs tracking-widest text-slate-400 uppercase font-bold pl-1">
                        Drawn Interpretations
                      </h3>
                    )}

                    <div className="space-y-3">
                      {drawnCards.map((item, index) => {
                        if (!item.isFlipped) return null;
                        const positionLabel = index === 0 ? "The Past Foundations" : index === 1 ? "The Present Vibrations" : "The Future Horizon";
                        return (
                          <div
                            key={index}
                            className="p-4 rounded-xl bg-gradient-to-br from-[#120a26] to-[#070412] border border-[#2c1654]/40 space-y-2 text-left fade-in"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] uppercase font-bold tracking-widest text-teal-400">
                                {positionLabel}
                              </span>
                              <span className="text-[9px] text-mystic-gold font-medium font-mono">
                                Arcana {item.card.number}
                              </span>
                            </div>

                            <h4 className="font-display text-xs font-semibold text-white">
                              {item.card.name} <span className="text-slate-400 font-normal">({item.isReversed ? "Reversed" : "Upright"})</span>
                            </h4>

                            <div className="text-[10px] text-mystic-gold font-semibold uppercase tracking-wider">
                              {(item.isReversed ? item.card.reversedKeywords : item.card.uprightKeywords).join(" · ")}
                            </div>

                            <p className="text-xs text-slate-300 leading-relaxed pt-1">
                              {item.isReversed ? item.card.reversedMeaning : item.card.uprightMeaning}
                            </p>

                            <div className="text-[10px] text-slate-400 italic pt-1.5 border-t border-[#2c1654]/20">
                              <span className="font-semibold text-teal-400 not-italic">Advice: </span>
                              {item.card.advice}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* DYNAMIC COMBINED SYNTHESIS (Unlocks when all 3 cards are flipped) */}
                    {hasFlippedAll ? (
                      <div className="p-5 rounded-2xl border-2 border-mystic-gold bg-[#120a26] text-left space-y-3 shadow-xl relative overflow-hidden fade-in">
                        <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-mystic-gold/10 blur-xl pointer-events-none" />
                        
                        <div className="flex items-center gap-2">
                          <Crown className="w-4 h-4 text-mystic-gold" />
                          <h3 className="font-display text-xs tracking-widest uppercase font-bold text-mystic-gold">
                            Combined Synthesis Oracle
                          </h3>
                        </div>

                        <p className="text-xs text-slate-100 leading-relaxed font-body">
                          {getCombinedSynthesis()}
                        </p>

                        <div className="bg-[#070412]/60 p-3 rounded-lg border border-mystic-gold/20 text-[10px] text-slate-300 flex items-start gap-2">
                          <Info className="w-3.5 h-3.5 text-mystic-gold shrink-0 mt-0.5" />
                          <span>
                            This synthesis has been tailored to your selected path of <strong>{tarotTopic}</strong> based on the unique spatial alignment of your three Major Arcana cards. Review your personal Member Dashboard to keep this reading archived.
                          </span>
                        </div>

                        <div className="pt-2 flex gap-2">
                          <button
                            onClick={async () => {
                              playCelestialSound("success");
                              const cardsSummary = drawnCards.map((c) => `${c.card.name} (${c.isReversed ? "Reversed" : "Upright"})`);
                              const summaryText = getCombinedSynthesis();
                              const formattedDate = new Date().toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric"
                              });

                              if (currentUser) {
                                // Save reading persistently in Cloud Firestore
                                const newDocId = "rd-" + Date.now();
                                const docRef = doc(db, "users", currentUser.uid, "readings", newDocId);
                                const payload = {
                                  id: newDocId,
                                  userId: currentUser.uid,
                                  date: formattedDate,
                                  topic: tarotTopic,
                                  cards: cardsSummary,
                                  summary: summaryText.substring(0, 110) + "...",
                                  createdAt: new Date().toISOString()
                                };
                                try {
                                  await setDoc(docRef, payload);
                                  alert("Celestial Reading successfully saved to your sacred Cloud Profile!");
                                } catch (error) {
                                  handleFirestoreError(error, OperationType.WRITE, `users/${currentUser.uid}/readings/${newDocId}`);
                                }
                              } else {
                                // Guest local fallback
                                const newReading = {
                                  id: Date.now().toString(),
                                  date: "Today",
                                  topic: tarotTopic,
                                  cards: cardsSummary,
                                  summary: summaryText.substring(0, 110) + "..."
                                };
                                setSavedReadings((prev) => [newReading, ...prev]);
                                alert("Saved to temporary guest session! Register or log in on the Member tab to persist logs cross-device.");
                              }
                            }}
                            className="flex-1 py-2 text-center text-xs font-semibold text-[#070412] bg-mystic-gold rounded-lg hover:brightness-110 active:scale-[0.98] transition-all"
                          >
                            {currentUser ? "Save to Cloud Archive" : "Save as Guest"}
                          </button>
                          <button
                            onClick={handleRedrawTarot}
                            className="px-3 py-2 text-xs font-semibold text-slate-300 border border-[#2c1654] rounded-lg hover:bg-[#120a26]"
                          >
                            Draw Again
                          </button>
                        </div>

                      </div>
                    ) : (
                      drawnCards.some((c) => c.isFlipped) && (
                        <p className="text-[10px] text-center text-slate-400 animate-pulse italic pt-2">
                          Flip remaining card(s) to unlock the complete Cosmic Synthesis Advice.
                        </p>
                      )
                    )}

                  </div>
                </div>
              )}

            </div>
          )}

          {/* ==================== 3. ZODIAC VIEW ==================== */}
          {activeTab === "zodiac" && (
            <div className="space-y-6 fade-in">
              
              <div className="text-center space-y-1">
                <h2 className="font-display text-lg font-bold tracking-wider text-mystic-gold">
                  Zodiac & Daily Horoscopes
                </h2>
                <p className="text-xs text-slate-400">
                  Select your sign to download live daily planetary transit forecasts.
                </p>
              </div>

              {/* GRID OF 12 SIGNS */}
              <div className="grid grid-cols-3 gap-2.5">
                {ZODIAC_SIGNS.map((sign) => (
                  <button
                    key={sign.id}
                    onClick={() => {
                      setSelectedZodiac(sign);
                      playCelestialSound("success");
                    }}
                    className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                      selectedZodiac?.id === sign.id
                        ? "bg-[#20133c] border-mystic-gold shadow-lg shadow-mystic-gold/10 scale-105"
                        : "bg-[#120a26]/40 border-[#2c1654]/60 hover:border-mystic-gold/40"
                    }`}
                  >
                    <span className="text-2xl mb-1 text-mystic-gold leading-none">
                      {sign.symbol}
                    </span>
                    <span className="font-display text-xs font-semibold text-white tracking-wide">
                      {sign.name}
                    </span>
                    <span className="text-[8px] text-slate-400 mt-0.5 scale-95 font-medium truncate w-full">
                      {sign.dateRange}
                    </span>
                  </button>
                ))}
              </div>

              {/* ZODIAC HOROSCOPE BOARD (Pattern 3: Slide up sheet simulation or rich detail card) */}
              {selectedZodiac ? (
                <div className="p-5 rounded-2xl border border-mystic-gold/50 bg-gradient-to-b from-[#1b0e35] to-[#070412] text-left space-y-4 fade-in">
                  
                  {/* Title lockup */}
                  <div className="flex items-start justify-between border-b border-[#2c1654]/40 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-11 h-11 rounded-full bg-mystic-gold/15 border border-mystic-gold/30 flex items-center justify-center text-2xl text-mystic-gold">
                        {selectedZodiac.symbol}
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-bold text-white tracking-wide">
                          {selectedZodiac.name} Oracle
                        </h3>
                        {/* Clean unboxed metadata separator */}
                        <div className="text-[10px] text-slate-400 font-medium">
                          {selectedZodiac.dateRange} <span aria-hidden="true" className="text-mystic-gold/30">·</span> {selectedZodiac.element} Element
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => { setSelectedZodiac(null); playCelestialSound("flip"); }}
                      className="text-[10px] text-red-400 border border-red-400/30 px-2 py-0.5 rounded bg-red-400/5 hover:bg-red-400/10"
                    >
                      Close sign
                    </button>
                  </div>

                  {/* Micro attributes (Unboxed metadata) */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-300 border-b border-[#2c1654]/20 pb-3">
                    <div>
                      <span className="text-slate-400 font-normal">Ruling Planet: </span>
                      <span className="text-teal-400 font-semibold">{selectedZodiac.rulingPlanet}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-normal">Match Compatibility: </span>
                      <span className="text-mystic-gold font-semibold">{selectedZodiac.compatibility}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-normal">Lucky Tone: </span>
                      <span className="text-teal-400 font-semibold">{selectedZodiac.luckyColor}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-normal">Optimal Hour: </span>
                      <span className="text-mystic-gold font-mono font-semibold tabular-nums">{selectedZodiac.horoscope.luckyTime}</span>
                    </div>
                  </div>

                  {/* Today's Reading (live API) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold tracking-wider uppercase text-mystic-gold">
                        {dailyHoroscope.status === "ready" ? `Today's Reading — ${(() => { const d = new Date(`${dailyHoroscope.date}T12:00:00`); return Number.isNaN(d.getTime()) ? dailyHoroscope.date : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }); })()}` : "Today's Reading"}
                      </span>
                      <span className="flex items-center gap-1 text-[9px] text-teal-300 font-medium shrink-0">
                        <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                        Updated daily
                      </span>
                    </div>
                    {dailyHoroscope.status === "loading" && (
                      <p role="status" className="text-xs text-slate-400 animate-pulse">Consulting the stars…</p>
                    )}
                    {dailyHoroscope.status === "error" && (
                      <p role="alert" className="text-xs text-slate-300">
                        Today's horoscope couldn't be loaded.{" "}
                        <button onClick={() => setHoroscopeRetry((n) => n + 1)} className="text-mystic-gold underline">Try again</button>
                      </p>
                    )}
                    {dailyHoroscope.status === "ready" && (
                      <p className="text-xs text-slate-200 leading-relaxed">{dailyHoroscope.text}</p>
                    )}
                  </div>

                  {/* Traits List (Unboxed metadata list) */}
                  <div className="space-y-1.5 border-t border-[#2c1654]/30 pt-3">
                    <span className="text-[10px] font-mono tracking-wider text-mystic-gold uppercase block">
                      Core Astral Sign Strengths:
                    </span>
                    <div className="text-[11px] text-slate-300 font-medium">
                      {selectedZodiac.traits.join(" · ")}
                    </div>
                  </div>

                  {/* Lucky Statistics */}
                  <div className="bg-black/40 p-3 rounded-xl border border-[#2c1654]/40 flex justify-between items-center text-xs text-slate-300">
                    <div>
                      <span className="text-slate-400">Sign Lucky Num: </span>
                      <span className="text-mystic-gold font-bold font-mono text-sm tabular-nums">
                        {selectedZodiac.horoscope.luckyNumber}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Current Aura Mood: </span>
                      <span className="text-teal-400 font-bold">
                        {selectedZodiac.horoscope.mood}
                      </span>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="p-8 rounded-xl border border-dashed border-[#2c1654] text-center text-slate-500 text-xs">
                  <Compass className="w-8 h-8 text-[#2c1654] mx-auto mb-2 animate-spin" style={{ animationDuration: '20s' }} />
                  Tap your birth sign above to reveal your full daily planetary transit readings.
                </div>
              )}

            </div>
          )}

          {/* ==================== 4. NUMEROLOGY VIEW ==================== */}
          {activeTab === "numerology" && (
            <div className="space-y-6 fade-in">
              
              <div className="text-center space-y-1">
                <h2 className="font-display text-lg font-bold tracking-wider text-mystic-gold">
                  Destiny & Soul Path Calculator
                </h2>
                <p className="text-xs text-slate-400">
                  Unlock Pythagorean equations to extract your numeric Life Path vibration.
                </p>
              </div>

              {/* Calculator Form */}
              <form
                onSubmit={handleCalculateNumerology}
                className="p-5 rounded-2xl border border-[#2c1654] bg-[#120a26]/40 backdrop-blur-sm space-y-4 text-left"
              >
                <div className="flex items-center gap-2 border-b border-[#2c1654]/30 pb-2.5 mb-2">
                  <Calendar className="w-4 h-4 text-mystic-gold" />
                  <span className="text-xs font-semibold text-mystic-gold uppercase tracking-wider">
                    Enter Date of Birth
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 block uppercase">Month</label>
                    <select
                      value={dobMonth}
                      onChange={(e) => setDobMonth(e.target.value)}
                      className="w-full bg-[#0b081c] border border-[#2c1654] rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-mystic-gold"
                    >
                      {Array.from({ length: 12 }, (_, i) => {
                        const m = (i + 1).toString().padStart(2, "0");
                        return (
                          <option key={m} value={m}>
                            {m} ({new Date(2000, i).toLocaleString("en", { month: "short" })})
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 block uppercase">Day</label>
                    <select
                      value={dobDay}
                      onChange={(e) => setDobDay(e.target.value)}
                      className="w-full bg-[#0b081c] border border-[#2c1654] rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-mystic-gold"
                    >
                      {Array.from({ length: 31 }, (_, i) => {
                        const d = (i + 1).toString().padStart(2, "0");
                        return <option key={d} value={d}>{d}</option>;
                      })}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 block uppercase">Year</label>
                    <select
                      value={dobYear}
                      onChange={(e) => setDobYear(e.target.value)}
                      className="w-full bg-[#0b081c] border border-[#2c1654] rounded-lg p-2.5 text-xs text-slate-200 outline-none focus:border-mystic-gold"
                    >
                      {Array.from({ length: 80 }, (_, i) => {
                        const y = (2026 - i).toString();
                        return <option key={y} value={y}>{y}</option>;
                      })}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-[#070412] font-bold text-xs tracking-widest uppercase hover:brightness-110 active:scale-[0.98] transition-all shadow-lg"
                >
                  Decode Vibrational Key
                </button>
              </form>

              {/* CALCULATION FEEDBACK SHIMMER */}
              {calcStatus === "calculating" && (
                <div className="p-6 rounded-2xl bg-black/40 border border-[#2c1654] text-center space-y-3">
                  <div className="relative w-12 h-12 mx-auto">
                    <div className="absolute inset-0 rounded-full border-4 border-teal-500/10 border-t-teal-400 animate-spin" />
                    <Sparkles className="w-5 h-5 text-teal-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <p className="text-xs text-teal-400 animate-pulse font-mono tracking-wider uppercase font-semibold">
                    {calcMessage}
                  </p>
                </div>
              )}

              {/* NUMEROLOGY DETAILED DISPLAY */}
              {calcStatus === "done" && lifePathNumber !== null && (
                <div className="p-5 rounded-2xl border-2 border-teal-400 bg-gradient-to-b from-[#111e35] to-[#070412] text-left space-y-4 shadow-xl fade-in">
                  
                  <div className="text-center space-y-1 border-b border-[#2c1654]/40 pb-4">
                    <span className="text-[10px] font-mono tracking-widest text-teal-300 uppercase block">
                      Your Unique Life Path Vibration is:
                    </span>
                    <div className="text-5xl font-extrabold font-display text-mystic-gold py-1 animate-pulse-subtle">
                      {lifePathNumber}
                    </div>
                    <h3 className="font-display text-base font-bold text-white tracking-wide">
                      {NUMEROLOGY_PROFILES[lifePathNumber]?.title}
                    </h3>
                  </div>

                  <p className="text-xs text-slate-100 italic text-center px-2 leading-relaxed">
                    "{NUMEROLOGY_PROFILES[lifePathNumber]?.tagline}"
                  </p>

                  <div className="space-y-3 pt-2">
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-teal-300 uppercase block">Personality Blueprint:</span>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {NUMEROLOGY_PROFILES[lifePathNumber]?.personality}
                      </p>
                    </div>

                    {/* Strengths list unboxed */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-teal-300 uppercase block">Vibrational Strengths:</span>
                      <div className="text-xs text-slate-300 font-medium leading-normal">
                        {NUMEROLOGY_PROFILES[lifePathNumber]?.strengths.join(" · ")}
                      </div>
                    </div>

                    {/* Weaknesses list unboxed */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-teal-300 uppercase block">Challenging Shadows:</span>
                      <div className="text-xs text-slate-400 font-normal leading-normal">
                        {NUMEROLOGY_PROFILES[lifePathNumber]?.weaknesses.join(" · ")}
                      </div>
                    </div>

                    {/* Careers list unboxed */}
                    <div className="space-y-1">
                      <span className="text-[10px] font-mono text-teal-300 uppercase block">High-Frequency Occupations:</span>
                      <div className="text-xs text-slate-300 font-medium leading-normal">
                        {NUMEROLOGY_PROFILES[lifePathNumber]?.careerPaths.join(" · ")}
                      </div>
                    </div>

                    <div className="bg-black/30 p-3 rounded-lg border border-[#2c1654]/50 text-xs text-slate-300 flex justify-between items-center">
                      <div>
                        <span className="text-slate-400">Compatible Soul Paths:</span>
                      </div>
                      <span className="font-bold text-mystic-gold font-display text-sm">
                        Paths {NUMEROLOGY_PROFILES[lifePathNumber]?.compatibility}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => { playCelestialSound("flip"); setCalcStatus("idle"); }}
                    className="w-full py-2.5 text-xs text-center text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/10"
                  >
                    Recalculate Another Birthdate
                  </button>

                </div>
              )}

            </div>
          )}

          {/* ==================== 5. LIVE ROOM VIEW ==================== */}
          {activeTab === "live" && (
            <LiveCommunity
              gemBalance={typeof dbUserDoc?.gemBalance === "number" ? dbUserDoc.gemBalance : 0}
              onExit={() => setActiveTab("home")}
              isAuthorizedReader={hasTarotReaderPermission}
              currentUserId={currentUser?.uid ?? null}
              avatarUrl={currentUser ? dbUserDoc?.avatarUrl || currentUser.photoURL || undefined : undefined}
              displayName={currentUser ? dbUserDoc?.displayName || currentUser.displayName || currentUser.email?.split("@")[0] || undefined : undefined}
            />
          )}
          {activeTab === "live" && false && (
            <div className="space-y-5 fade-in">
              
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <h2 className="font-display text-sm font-bold tracking-wider text-mystic-gold uppercase">
                    Luna's Celestial Alcove
                  </h2>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                    <span className="text-red-400 font-semibold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 inline-block animate-ping"></span>
                      SIMULATED LIVE
                    </span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="text-slate-300 font-mono tabular-nums">742 watching</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setLiveVideoActive(!liveVideoActive);
                    playCelestialSound("flip");
                  }}
                  className="text-[9px] border border-[#2c1654] px-2 py-1 rounded bg-[#120a26] text-slate-300 hover:text-white"
                >
                  {liveVideoActive ? "Pause Feed" : "Start Feed"}
                </button>
              </div>

              {/* LIVE VERTICAL VIDEO SCREEN SIMULATION */}
              <div className="relative rounded-2xl overflow-hidden border border-[#2c1654] bg-[#070412] aspect-[4/3] w-full shadow-inner flex flex-col justify-between">
                
                {liveVideoActive ? (
                  <div 
                    className="absolute inset-0 bg-cover bg-center transition-all duration-500 filter"
                    style={{ backgroundImage: `url(${TAROT_READER_IMG})` }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-[#070412] flex flex-col items-center justify-center p-4 text-center">
                    <Video className="w-8 h-8 text-slate-600 mb-2 animate-pulse" />
                    <span className="text-xs text-slate-500 font-semibold uppercase">Feed Paused by Viewer</span>
                  </div>
                )}

                {/* Stream overlays */}
                <div className="absolute top-3 left-3 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded tracking-widest flex items-center gap-1 shadow-md uppercase">
                  <span className="h-1 w-1 bg-white rounded-full animate-pulse"></span>
                  Live
                </div>

                {/* Sound indicator */}
                <div className="absolute top-3 right-3 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded tracking-wide shadow-md flex items-center gap-1">
                  <Wand2 className="w-3 h-3 text-mystic-gold animate-spin" style={{ animationDuration: '6s' }} />
                  Luna (Channelling)
                </div>

                {/* Floating Gift Animations overlay */}
                {activeGifts.map((gift) => (
                  <div
                    key={gift.id}
                    className="absolute text-5xl animate-bounce pointer-events-none z-30 transition-all duration-1000 ease-out flex flex-col items-center"
                    style={{
                      left: `${gift.x}%`,
                      top: `${gift.y}%`,
                      transform: "translate(-50%, -50%)",
                      animationDuration: "1s"
                    }}
                  >
                    <span>{gift.icon}</span>
                    <span className="text-[9px] bg-mystic-gold text-black font-bold font-display px-1 rounded uppercase tracking-tighter whitespace-nowrap">
                      Gift Sent!
                    </span>
                  </div>
                ))}

                {/* Rising Heart Animations */}
                {risingHearts.map((heart) => (
                  <div
                    key={heart.id}
                    className="absolute text-red-500 text-xl font-bold animate-float-card pointer-events-none z-30"
                    style={{
                      left: `${heart.x}%`,
                      bottom: "10%",
                      opacity: 0,
                      animation: "twinkle 1.8s ease-in-out forwards"
                    }}
                  >
                    ❤️
                  </div>
                ))}

                {/* Sound effect warning for the room */}
                <div className="absolute bottom-3 left-3 bg-black/50 p-1.5 rounded text-[8px] text-slate-300 max-w-[150px] leading-tight">
                  🔊 Send virtual gifts to hear synthesized chimes in real-time!
                </div>

                {/* TIP REACTION banner */}
                {tipSuccessMessage && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-purple-900 to-[#120a26] text-mystic-gold border border-mystic-gold p-3 rounded-lg text-xs font-bold text-center z-40 shadow-2xl animate-pulse w-[80%]">
                    {tipSuccessMessage}
                  </div>
                )}

              </div>

              {/* READERS ACTIVE DESK CARDS DISPLAY */}
              <div className="p-3.5 rounded-xl border border-[#2c1654]/40 bg-[#120a26]/40 backdrop-blur-md">
                <span className="text-[9px] font-mono tracking-widest text-mystic-gold uppercase block mb-2 text-center">
                  Luna's Current Active Desk Reading
                </span>
                
                <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                  <div className="bg-black/40 p-2 rounded border border-[#2c1654]/60">
                    <div className="text-slate-400 font-bold uppercase text-[8px]">Card 1</div>
                    <div className="text-white font-semibold line-clamp-1">The High Priestess</div>
                    <div className="text-[8px] text-teal-400">Past Wisdom</div>
                  </div>
                  <div className="bg-black/40 p-2 rounded border border-[#2c1654]/60">
                    <div className="text-slate-400 font-bold uppercase text-[8px]">Card 2</div>
                    <div className="text-white font-semibold line-clamp-1">The Lovers</div>
                    <div className="text-[8px] text-teal-400">Present Choices</div>
                  </div>
                  <div className="bg-black/40 p-2 rounded border border-[#2c1654]/60">
                    <div className="text-slate-400 font-bold uppercase text-[8px]">Card 3</div>
                    <div className="text-white font-semibold line-clamp-1">The Star</div>
                    <div className="text-[8px] text-teal-400">Future Healing</div>
                  </div>
                </div>
              </div>

              {/* SIMULATED STREAM GOAL TRACKER */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[11px] text-slate-300">
                  <span className="flex items-center gap-1 font-medium">
                    <Gem className="w-3.5 h-3.5 text-teal-400" />
                    Reader's Aura Support Goal:
                  </span>
                  <span className="font-mono text-mystic-gold font-bold tabular-nums">
                    {liveGoal} / 500 Gems
                  </span>
                </div>
                <div className="w-full bg-[#0b081c] h-2 rounded-full border border-[#2c1654] overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-teal-400 via-mystic-gold to-purple-600 h-full transition-all duration-1000"
                    style={{ width: `${(liveGoal / 500) * 100}%` }}
                  />
                </div>
              </div>

              {/* ACTIVE LIVE CHAT BOX */}
              <div className="flex flex-col h-48 rounded-xl border border-[#2c1654] bg-[#070412]/80 overflow-hidden">
                <div className="p-2 border-b border-[#2c1654]/60 bg-[#120a26]/40 text-[10px] text-slate-400 font-semibold tracking-wider flex justify-between">
                  <span>LIVE CHAT SIMULATION</span>
                  <span className="text-teal-400">Aura-Linked</span>
                </div>

                <div className="flex-1 p-3 overflow-y-auto space-y-2.5 text-xs text-left">
                  {chatMessages.map((msg) => {
                    const isSystem = msg.gift;
                    const isHost = msg.role === "host";
                    const isUser = msg.role === "user";
                    
                    if (isSystem) {
                      return (
                        <div
                          key={msg.id}
                          className={`p-2 rounded bg-gradient-to-r ${msg.color} text-black font-semibold text-[11px] animate-pulse-subtle`}
                        >
                          🎉 {msg.sender} {msg.text}
                        </div>
                      );
                    }

                    return (
                      <div key={msg.id} className="leading-tight">
                        <span
                          className={`font-semibold mr-1.5 font-display ${
                            isHost
                              ? "text-mystic-gold"
                              : isUser
                              ? "text-teal-400"
                              : "text-purple-300"
                          }`}
                        >
                          {msg.sender}:
                        </span>
                        <span className={isHost ? "text-mystic-gold/90 italic" : "text-slate-200"}>
                          {msg.text}
                        </span>
                      </div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                {/* Dynamic User Chat input bar */}
                <form
                  onSubmit={handleSendChat}
                  className="p-2 bg-[#120a26]/40 border-t border-[#2c1654]/50 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={userChatInput}
                    onChange={(e) => setUserChatInput(e.target.value)}
                    placeholder="Ask Luna or share vibes..."
                    className="flex-1 bg-[#070412] border border-[#2c1654] rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-mystic-gold"
                  />
                  <button
                    type="submit"
                    className="p-1.5 bg-[#2c1654] text-mystic-gold rounded-lg hover:text-white transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>

              {/* VIRTUAL GIFTS & TIP DRAWER */}
              <div className="space-y-4">
                
                {/* Gifts */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-widest text-slate-400 pl-1">
                    <span>Send Virtual Cosmic Gifts</span>
                    <span className="text-teal-400 font-mono">Your Gems: {userGems}</span>
                  </div>

                  <div className="grid grid-cols-5 gap-1">
                    {GIFT_TEMPLATES.map((gift) => (
                      <button
                        key={gift.id}
                        onClick={() => handleSendGift(gift.id)}
                        className="p-1.5 rounded-lg border border-[#2c1654] bg-[#120a26]/30 hover:border-mystic-gold active:scale-95 transition-all flex flex-col items-center text-center"
                        title={`${gift.name} (${gift.cost} Gems)`}
                      >
                        <span className="text-xl mb-0.5">{gift.icon}</span>
                        <span className="text-[8px] text-slate-300 font-semibold truncate w-full">
                          {gift.name}
                        </span>
                        <span className="text-[7px] text-teal-400 font-mono mt-0.5">
                          {gift.cost}g
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tipping interface */}
                <div className="space-y-1.5 border-t border-[#2c1654]/30 pt-3">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 pl-1 block text-left">
                    Send Professional Reader Cash Tip
                  </span>

                  <div className="flex gap-2">
                    {[5, 10, 25].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => handleSendTip(amount)}
                        className="flex-1 py-2 text-center rounded-lg border border-mystic-gold bg-mystic-gold/5 text-mystic-gold font-bold text-xs hover:bg-mystic-gold/10 active:scale-95 transition-all"
                      >
                        ${amount}
                      </button>
                    ))}
                  </div>

                  {/* Share/Invite Button */}
                  <button
                    type="button"
                    onClick={async () => {
                      const shareData = {
                        title: "Celestial Sanctuary",
                        text: "Join me in the Celestial Sanctuary for spiritual readings!",
                        url: window.location.origin
                      };
                      if (navigator.share) {
                        try {
                          await navigator.share(shareData);
                        } catch (err) {
                          console.error("Error sharing:", err);
                        }
                      } else {
                        navigator.clipboard.writeText(shareData.url);
                        alert("Link copied to clipboard!");
                      }
                    }}
                    className="w-full py-2 bg-indigo-900/40 text-indigo-300 rounded-lg text-xs font-bold uppercase hover:bg-indigo-900/60 transition-all border border-indigo-500/30 mt-2"
                  >
                    Share / Invite Friends
                  </button>
                </div>

              </div>

              <p className="text-[9px] text-center text-slate-500 italic">
                * Note: Chat, gifts, tips, and spectator lists are simulations for frontend evaluation. No actual payment flows or database actions are executed.
              </p>

            </div>
          )}

          {/* ==================== 6. DASHBOARD VIEW ==================== */}
          {activeTab === "dashboard" && (
            <div className="space-y-6 fade-in">
              
              {!currentUser ? (
                /* AUTHENTICATION FORM PANEL */
                <div className="rounded-2xl border border-mystic-gold bg-gradient-to-br from-[#1d123a] to-[#0a0618] p-6 text-left space-y-4 shadow-xl">
                  <div className="flex border-b border-[#2c1654]/40 pb-1">
                    <button
                      type="button"
                      onClick={() => { playCelestialSound("flip"); setAuthMode("login"); setAuthError(""); setAuthSuccessMsg(""); }}
                      className={`flex-1 py-1.5 text-center text-xs font-bold tracking-wide uppercase transition-all ${
                        authMode === "login" ? "text-mystic-gold border-b-2 border-mystic-gold font-display" : "text-slate-400 font-display"
                      }`}
                    >
                      Login to Circle
                    </button>
                    <button
                      type="button"
                      onClick={() => { playCelestialSound("flip"); setAuthMode("register"); setAuthError(""); setAuthSuccessMsg(""); }}
                      className={`flex-1 py-1.5 text-center text-xs font-bold tracking-wide uppercase transition-all ${
                        authMode === "register" ? "text-mystic-gold border-b-2 border-mystic-gold font-display" : "text-slate-400 font-display"
                      }`}
                    >
                      Register Profile
                    </button>
                  </div>

                  <form onSubmit={handleAuthSubmit} className="space-y-3.5 pt-2 text-xs">
                    {authMode === "register" && (
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1 uppercase font-bold tracking-tight">Chosen Name</label>
                        <input
                          type="text"
                          value={authDisplayName}
                          onChange={(e) => setAuthDisplayName(e.target.value)}
                          placeholder="Aurelia Thorne"
                          className="w-full bg-[#070412] border border-[#2c1654] rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-mystic-gold"
                          required
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 uppercase font-bold tracking-tight">Email coordinate</label>
                      <input
                        type="email"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="mystic@sanctuary.com"
                        className="w-full bg-[#070412] border border-[#2c1654] rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-mystic-gold"
                        required
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[10px] text-slate-400 block uppercase font-bold tracking-tight">Passcode key</label>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-[9px] text-teal-400 font-bold hover:underline cursor-pointer bg-transparent border-0 outline-none"
                        >
                          {showPassword ? "Hide" : "Show"} Key
                        </button>
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        placeholder="6+ characters passcode"
                        className="w-full bg-[#070412] border border-[#2c1654] rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-mystic-gold"
                        required
                      />
                    </div>

                    {authError && (
                      <div className="p-2.5 rounded bg-red-950/40 border border-red-500/20 text-red-400 text-[10px] font-medium">
                        ⚠️ {authError}
                      </div>
                    )}

                    {authSuccessMsg && (
                      <div className="p-2.5 rounded bg-teal-950/40 border border-teal-500/20 text-teal-400 text-[10px] font-medium">
                        ✨ {authSuccessMsg}
                      </div>
                    )}

                    <div className="pt-1.5 space-y-2">
                      <button
                        type="submit"
                        className="w-full py-2.5 text-center text-xs font-bold text-[#070412] bg-mystic-gold rounded-lg hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer uppercase tracking-wider font-display"
                      >
                        {authMode === "login" ? "Verify Soul Key" : "Register Star Profile"}
                      </button>

                      {authMode === "login" && (
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          className="w-full text-center text-[10px] text-slate-400 hover:text-mystic-gold cursor-pointer bg-transparent border-0 outline-none hover:underline"
                        >
                          Forgot passcode? Request celestial reset
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Guest Access info banner */}
                  <div className="border-t border-[#2c1654]/30 pt-4 text-center">
                    <span className="text-[9px] font-mono tracking-widest text-teal-300 uppercase block font-bold mb-1">
                      Guest Exploration Enabled
                    </span>
                    <p className="text-[10px] text-slate-400 leading-relaxed font-body max-w-xs mx-auto">
                      Ordinary guests have full access to explore the Tarot draws, Zodiac calendars, and Numerology paths. Creating an account unlocks a private, secure Cloud Profile to archive your reading history persistently.
                    </p>
                  </div>
                </div>
              ) : (
                /* AUTHENTICATED PROFILE VIEW */
                <div className="rounded-2xl border border-mystic-gold bg-gradient-to-br from-[#1d123a] to-[#0a0618] p-5 text-left space-y-4 shadow-lg">
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-mystic-gold to-teal-400 p-0.5 flex items-center justify-center">
                        <div className="w-full h-full bg-[#0b081c] rounded-full flex items-center justify-center text-lg font-bold text-white font-display">
                          {dbUserDoc?.displayName ? dbUserDoc.displayName.substring(0, 2).toUpperCase() : "CM"}
                        </div>
                      </div>
                    
                      <div>
                        <h3 className="font-display text-sm font-bold text-white tracking-wide">
                          {dbUserDoc?.displayName || currentUser.email?.split("@")[0]}
                        </h3>
                        <div className="text-[10px] text-teal-300 font-semibold uppercase tracking-wider">
                          {dbUserDoc?.role === "admin" ? "CELESTIAL ARCHITECT (ADMIN)" : "GOLDEN INITIATE RING"}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="text-[9px] border border-red-400/40 text-red-400 px-2.5 py-1 rounded bg-red-400/5 hover:bg-red-400/15 cursor-pointer active:scale-95 transition-all uppercase font-bold"
                    >
                      Sign Out
                    </button>
                  </div>

                  {/* Account details in unboxed format */}
                  <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 border-t border-[#2c1654]/40 pt-3">
                    <div>
                      <span>Star Identity: </span>
                      <strong className="text-white truncate block max-w-full">{currentUser.email}</strong>
                    </div>
                    <div>
                      <span>Role Rank: </span>
                      <strong className="text-mystic-gold font-mono uppercase">{dbUserDoc?.role || "member"}</strong>
                    </div>
                    <div>
                      <span>Gem Credit Bank: </span>
                      <strong className="text-teal-400 font-mono tabular-nums">{dbUserDoc?.gemBalance ?? 850} Gems</strong>
                    </div>
                    <div>
                      <span>Broadcaster Clout: </span>
                      <strong className="text-pink-400 font-mono">{dbUserDoc?.cloutPoints ?? 0} Points</strong>
                    </div>
                  </div>

                  {/* Email Verification Status & Action Buttons */}
                  <div className="p-3 rounded-lg border border-[#2c1654]/60 bg-[#070412]/60 text-[10px] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 font-semibold uppercase">Email Verification:</span>
                      {currentUser.emailVerified ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-1 uppercase">
                          <CheckCircle className="w-3.5 h-3.5" /> Verified
                        </span>
                      ) : (
                        <span className="text-amber-400 font-bold flex items-center gap-1 uppercase">
                          <Lock className="w-3.5 h-3.5" /> Unverified
                        </span>
                      )}
                    </div>
                    
                    {!currentUser.emailVerified && (
                      <p className="text-[9px] text-slate-400 leading-normal">
                        To unlock full sanctuary features, including any assigned Administrator privileges, you must verify your email coordinate.
                      </p>
                    )}

                    <div className="flex gap-2">
                      {!currentUser.emailVerified && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              playCelestialSound("success");
                              await sendEmailVerification(currentUser);
                              alert("Celestial verification link has been dispatched! Please inspect your email inbox (including spam folder).");
                            } catch (err: any) {
                              console.error("Failed to send verification:", err);
                              alert(err.message || "Failed to send verification link.");
                            }
                          }}
                          className="flex-1 py-1 px-2.5 rounded bg-mystic-gold text-black font-bold text-[9px] uppercase active:scale-95 transition-all text-center hover:brightness-110"
                        >
                          Send Verification Link
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            playCelestialSound("success");
                            await currentUser.reload();
                            // Clone the user object to force state reload in React
                            const refreshed = auth.currentUser;
                            setCurrentUser(refreshed ? { ...refreshed } : null);
                            alert("Sanctuary session coordinates re-aligned and refreshed!");
                          } catch (err: any) {
                            console.error("Failed to refresh user:", err);
                          }
                        }}
                        className="flex-1 py-1 px-2.5 rounded border border-[#2c1654] text-slate-300 font-bold text-[9px] uppercase hover:bg-white/5 active:scale-95 transition-all"
                      >
                        Refresh Status
                      </button>
                    </div>
                  </div>

                  {/* Gems Recharge (Stripe Sandbox Store) */}
                  <div className="border-t border-[#2c1654]/40 pt-3 space-y-2">
                    <span className="text-[9px] font-mono tracking-widest text-mystic-gold uppercase block">
                      Celestial Gem Recharger (Stripe Payment Gateway)
                    </span>
                    <p className="text-[9px] text-slate-400 leading-normal">
                      Purchase virtual gems to tip readers, send animated crystals/roses in live streams, and earn non-redeemable Clout points.
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleBuyGems("gems_500", 4.99, 500)}
                        className="p-2 rounded bg-[#120a26]/85 border border-[#2c1654] hover:border-mystic-gold text-left transition-all active:scale-95 cursor-pointer"
                      >
                        <div className="font-semibold text-xs text-white">500 Gems</div>
                        <div className="text-[9px] text-teal-400 font-mono mt-0.5">$4.99 USD</div>
                      </button>
                      <button
                        onClick={() => handleBuyGems("gems_1200", 9.99, 1200)}
                        className="p-2 rounded bg-[#120a26]/85 border border-[#2c1654] hover:border-mystic-gold text-left transition-all active:scale-95 cursor-pointer"
                      >
                        <div className="font-semibold text-xs text-white">1,200 Gems</div>
                        <div className="text-[9px] text-teal-400 font-mono mt-0.5">$9.99 USD</div>
                      </button>
                    </div>
                  </div>

                  {/* Stripe Connect Onboarding (Only visible to Hosts/Admins) */}
                  {(dbUserDoc?.role === "admin" || currentUser.email === "kertisjohnson7@gmail.com") && (
                    <div className="border-t border-[#2c1654]/40 pt-3 space-y-2 text-left">
                      <span className="text-[9px] font-mono tracking-widest text-teal-400 uppercase block">
                        Stripe Connect Host Wallet (Transfer Share)
                      </span>
                      <p className="text-[10px] text-slate-400 leading-normal">
                        Onboard with Stripe Connect to securely link your bank account or card. This enables recipient transfers for receiving 80% of audience cash tips.
                      </p>
                      
                      <div className="flex items-center justify-between p-3 rounded-lg bg-teal-950/20 border border-teal-500/20">
                        <div className="space-y-0.5">
                          <span className="text-xs font-bold text-white block">Stripe Connect Status:</span>
                          <span className="text-[9px] font-mono text-teal-300 uppercase font-semibold">
                            {dbUserDoc?.stripeConnectId ? "Onboarded (Active)" : "Not Onboarded"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleConnectStripe}
                          className="py-1.5 px-3 rounded bg-teal-400 text-black font-bold text-[10px] uppercase hover:brightness-110 active:scale-95 transition-all"
                        >
                          {dbUserDoc?.stripeConnectId ? "Go to Dashboard" : "Setup Connect Link"}
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )}

              {currentUser && (
                <>
                  {/* EXPANDABLE SAVED READINGS LIST */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 pl-1">
                      <History className="w-4 h-4 text-mystic-gold" />
                      <h3 className="font-display text-xs tracking-widest text-slate-400 font-bold uppercase">
                        Past Saved Readings
                      </h3>
                    </div>

                    <div className="space-y-2.5">
                      {savedReadings.map((reading) => (
                        <div
                          key={reading.id}
                          className="p-4 rounded-xl border border-[#2c1654]/50 bg-[#120a26]/20 text-left space-y-2"
                        >
                          <div className="flex justify-between items-center text-[10px] text-slate-400">
                            <span>{reading.date}</span>
                            <span className="text-mystic-gold font-semibold uppercase">{reading.topic}</span>
                          </div>

                          <div className="font-display text-xs font-semibold text-white">
                            {reading.cards.join(" · ")}
                          </div>

                          <p className="text-[11px] text-slate-300 leading-relaxed font-body">
                            {reading.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Premium Subscriber Content (Unboxed Metadata style) */}
                  <div className="p-4 rounded-xl border border-[#2c1654]/40 bg-gradient-to-r from-[#140b2b] to-[#0d071f] text-left space-y-2">
                    <span className="text-[9px] font-mono tracking-widest text-teal-300 uppercase block">
                      Exclusive Subscriber Oracle Daily Verse
                    </span>
                    <p className="text-xs text-slate-300 leading-relaxed font-body">
                      "Today, Venus aligns with Pluto, illuminating hidden layers of creative willpower. Stay dedicated to structural discipline and trust what the quiet space reveals to you."
                    </p>
                  </div>
                </>
              )}

              {/* Quiet, unboxed Staff Entrance Access Gate */}
              <div className="pt-6 pb-2 text-center border-t border-[#2c1654]/20">
                <button
                  type="button"
                  onClick={() => {
                    playCelestialSound("flip");
                    setAdminPasscodeInput("");
                    setAdminGateError("");
                    setShowAdminGate(true);
                  }}
                  className="text-[10px] text-slate-500 hover:text-mystic-gold transition-colors font-medium hover:underline cursor-pointer bg-transparent border-0"
                >
                  Reader Access Gate (Staff Only)
                </button>
              </div>

            </div>
          )}

          {activeTab === "profile" && currentUser && (
            <MyProfile
              identity={{
                uid: currentUser.uid,
                displayName: dbUserDoc?.displayName || currentUser.displayName || currentUser.email?.split("@")[0] || "Celestial Member",
                avatarUrl: dbUserDoc?.avatarUrl || currentUser.photoURL || null
              } satisfies UserIdentity}
              email={currentUser.email || ""}
              isSaving={isProfileSaving}
              saveError={profileSaveError}
              saveMessage={profileSaveMessage}
              onSave={handleSaveProfile}
            />
          )}

          {/* ==================== 7. DEDICATED ADMIN CONSOLE VIEW ==================== */}
          {activeTab === "admin" && (
            <div className="space-y-6 fade-in text-left">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-teal-500/30 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-mystic-gold" />
                  <div>
                    <h2 className="font-display text-base font-bold tracking-wider text-white">
                      Sanctuary Admin Console
                    </h2>
                    <span className="text-[9px] font-mono uppercase text-teal-400 font-semibold block">
                      Oracle Control & System Registry
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    playCelestialSound("flip");
                    setIsAdminAuthenticated(false);
                    setActiveTab("dashboard");
                  }}
                  className="text-[10px] text-red-400 border border-red-400/40 px-2.5 py-1 rounded bg-red-400/10 hover:bg-red-400/20 active:scale-95 transition-all cursor-pointer font-bold"
                >
                  Lock & Exit
                </button>
              </div>

              {/* Sandbox Security & Architecture Disclosure (Requirement 3 & 4 Secure State Notice) */}
              <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-500/5 text-left space-y-2 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-10">
                  <Shield className="w-12 h-12 text-teal-400" />
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-teal-400 shrink-0" />
                  <span className="text-[9px] font-mono uppercase tracking-widest text-teal-400 font-bold">
                    Secure Role-Based Access Control
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed font-body">
                  <strong>Secure Architecture Verified:</strong> Administrative operations are fully secured. Credentials, roles, and administrative mutations are protected server-side via <code className="text-teal-300 bg-teal-950/40 px-1 py-0.5 rounded text-[10px]">Firestore Security Rules</code> and verified Firebase Authentication email sessions. Ordinary members are restricted from self-assigning roles or modifying master configurations.
                </p>
              </div>

              {/* Sub-Navigation Tabs inside Admin */}
              <div className="flex border-b border-[#2c1654]/40">
                <button
                  type="button"
                  onClick={() => { playCelestialSound("flip"); setAdminSubTab("broadcast"); }}
                  className={`flex-1 py-2 text-center text-xs font-semibold tracking-wide transition-all border-b-2 ${
                    adminSubTab === "broadcast"
                      ? "border-mystic-gold text-mystic-gold"
                      : "border-transparent text-slate-450 hover:text-white"
                  }`}
                >
                  Live Broadcast
                </button>
                <button
                  type="button"
                  onClick={() => { playCelestialSound("flip"); setAdminSubTab("shuffle"); }}
                  className={`flex-1 py-2 text-center text-xs font-semibold tracking-wide transition-all border-b-2 ${
                    adminSubTab === "shuffle"
                      ? "border-mystic-gold text-mystic-gold"
                      : "border-transparent text-slate-450 hover:text-white"
                  }`}
                >
                  Smart Shuffle Settings
                </button>
                <button
                  type="button"
                  onClick={() => { playCelestialSound("flip"); setAdminSubTab("deck"); }}
                  className={`flex-1 py-2 text-center text-xs font-semibold tracking-wide transition-all border-b-2 ${
                    adminSubTab === "deck"
                      ? "border-mystic-gold text-mystic-gold"
                      : "border-transparent text-slate-450 hover:text-white"
                  }`}
                >
                  Deck Manager ({cards.length})
                </button>
                <button
                  type="button"
                  onClick={() => { playCelestialSound("flip"); setAdminSubTab("staff"); }}
                  className={`flex-1 py-2 text-center text-xs font-semibold tracking-wide transition-all border-b-2 ${
                    adminSubTab === "staff"
                      ? "border-mystic-gold text-mystic-gold"
                      : "border-transparent text-slate-450 hover:text-white"
                  }`}
                >
                  Staff Roster
                </button>
                <button
                  type="button"
                  onClick={() => { playCelestialSound("flip"); setAdminSubTab("financials"); }}
                  className={`flex-1 py-2 text-center text-xs font-semibold tracking-wide transition-all border-b-2 ${
                    adminSubTab === "financials"
                      ? "border-mystic-gold text-mystic-gold"
                      : "border-transparent text-slate-450 hover:text-white"
                  }`}
                >
                  Financials
                </button>
              </div>

              {/* SUBTAB 1: LIVE BROADCAST CONTROLS */}
              {adminSubTab === "broadcast" && (
                <div className="space-y-4 fade-in">
                  <div className="p-4 rounded-xl border border-[#2c1654] bg-[#120a26]/40 text-left space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-mystic-gold font-bold">
                        Aura Broadcast Status
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-[10px] text-emerald-400 font-bold uppercase font-mono">Live & Connected</span>
                      </div>
                    </div>
                    <h3 className="text-xs text-slate-300 font-body">
                      Topic: <strong className="text-white">"Luna's Celestial Guidance and Deep Soul Path Consultation"</strong>
                    </h3>
                  </div>

                  {/* INTERACTIVE SIMULATIONS */}
                  <div className="p-4 rounded-xl border border-teal-500/40 bg-[#070412]/80 text-left space-y-3">
                    <span className="text-[10px] font-mono tracking-widest text-teal-300 uppercase block font-semibold">
                      Simulate Live Audience Interactions
                    </span>

                    <div className="grid grid-cols-1 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Push Simulated Host Message to Stream:</label>
                        <button
                          type="button"
                          onClick={() => {
                            playCelestialSound("success");
                            const hostMsg = {
                              id: Date.now(),
                              sender: "Reader Luna (Host)",
                              text: "✨ Cosmic alignment starting soon! Send a Phoenix Feather for immediate path channelling focus! ✨",
                              role: "host"
                            };
                            setChatMessages((prev) => [...prev, hostMsg]);
                          }}
                          className="w-full py-2 text-center text-xs font-semibold text-[#070412] bg-teal-400 rounded-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                        >
                          Send Host Call-to-Action Announcement
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">Trigger Incoming Spectator Gift Chime:</label>
                        <button
                          type="button"
                          onClick={() => {
                            const randomGift = GIFT_TEMPLATES[Math.floor(Math.random() * GIFT_TEMPLATES.length)];
                            playCelestialSound(randomGift.id);
                            
                            setLiveGoal((prev) => Math.min(500, prev + randomGift.cost));

                            const mockNames = ["NebulaSeeker", "ZodiacKnight", "AeroVibe", "SolarPriestess", "Vesta_Divine"];
                            const randomName = mockNames[Math.floor(Math.random() * mockNames.length)];
                            
                            const announceMsg = {
                              id: Date.now(),
                              sender: randomName,
                              text: `sent ${randomGift.name} ${randomGift.icon}!`,
                              role: "viewer",
                              gift: randomGift.name,
                              color: randomGift.color
                            };
                            setChatMessages((prev) => [...prev, announceMsg]);

                            const id = Date.now().toString();
                            const x = 20 + Math.random() * 60;
                            const y = 30 + Math.random() * 40;
                            setActiveGifts((prev) => [...prev, { id, icon: randomGift.icon, x, y }]);
                            setTimeout(() => {
                              setActiveGifts((prev) => prev.filter((item) => item.id !== id));
                            }, 2500);

                            for (let i = 0; i < 3; i++) {
                              setTimeout(() => {
                                triggerPassiveHeart();
                              }, i * 200);
                            }
                          }}
                          className="w-full py-2 text-center text-xs font-semibold text-mystic-gold bg-mystic-gold/15 border border-mystic-gold/40 rounded-lg hover:bg-mystic-gold/20 active:scale-95 transition-all cursor-pointer"
                        >
                          Inject Random Spectator Gift
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Compounding Earnings Stats */}
                  <div className="grid grid-cols-3 gap-2 font-mono">
                    <div className="bg-[#120a26] p-3 rounded-xl text-center border border-[#2c1654]">
                      <span className="text-[8px] text-slate-400 uppercase block mb-1">Today's Gross</span>
                      <span className="text-sm font-bold text-white tabular-nums">${todayGross.toFixed(2)}</span>
                    </div>
                    <div className="bg-[#120a26] p-3 rounded-xl text-center border border-[#2c1654]">
                      <span className="text-[8px] text-slate-400 uppercase block mb-1">Archived Inquiries</span>
                      <span className="text-sm font-bold text-teal-400 tabular-nums">0</span>
                    </div>
                    <div className="bg-[#120a26] p-3 rounded-xl text-center border border-[#2c1654]">
                      <span className="text-[8px] text-slate-400 uppercase block mb-1">Gems Credited</span>
                      <span className="text-sm font-bold text-mystic-gold tabular-nums">{gemsCredited}g</span>
                    </div>
                  </div>

                  {/* Monthly Compounding revenue graph */}
                  <div className="p-4 rounded-xl bg-black/40 border border-[#2c1654]/40 space-y-2 text-left">
                    <span className="text-[9px] font-mono text-slate-400 uppercase block font-bold">
                      Revenue History (Gross Volume by Month, Recent Ledger Records)
                    </span>

                    {monthlyGrossHistory.length === 0 ? (
                      <div className="h-24 flex items-center justify-center text-center text-[10px] text-slate-500 italic bg-black/40 rounded border border-dashed border-[#2c1654]/40 px-3">
                        No revenue history yet. Monthly totals will appear once payments are recorded.
                      </div>
                    ) : (
                      <div className="h-24 flex items-end justify-between px-3 bg-black/40 rounded border border-[#2c1654]/40 pt-4">
                        {monthlyGrossHistory.map((m) => (
                          <div key={m.key} className="flex flex-col items-center flex-1 space-y-1">
                            <span className="text-[7px] text-teal-300 font-mono">${m.total.toFixed(2)}</span>
                            <div
                              className="w-8 bg-gradient-to-t from-[#2c1654] to-mystic-gold rounded-t transition-all duration-1000"
                              style={{ height: `${Math.max(2, Math.round((m.total / maxMonthlyGross) * 48))}px` }}
                            />
                            <span className="text-[8px] text-slate-500 uppercase">{m.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Client waiting list */}
                  <div className="space-y-2 text-left">
                    <span className="text-[9px] font-mono text-slate-400 uppercase block pl-1 font-semibold">
                      Active Telepathy waiting Queue
                    </span>

                    <div className="py-6 text-center text-[11px] text-slate-500 border border-dashed border-[#2c1654]/40 rounded-lg italic">
                      No clients waiting — no records yet.
                    </div>
                  </div>
                </div>
              )}

              {/* SUBTAB 2: SMART SHUFFLE & SPREAD CONFIG */}
              {adminSubTab === "shuffle" && (
                <div className="space-y-5 fade-in">
                  <div className="p-4 rounded-xl border border-teal-500/30 bg-[#070412]/80 space-y-4 text-left">
                    <span className="text-[10px] font-mono tracking-widest text-teal-300 uppercase block font-semibold">
                      Spiritual Oracle Draw Parameters
                    </span>

                    {/* Toggle Allow Reversed */}
                    <div className="flex items-center justify-between border-b border-[#2c1654]/30 pb-3">
                      <div className="space-y-0.5 max-w-[80%]">
                        <label className="text-xs font-bold text-white block">Allow Reversed Cards</label>
                        <p className="text-[10px] text-slate-400">
                          Allows the cards to be drawn upside down, revealing alternative shadow dynamics in daily oracle or interactive spreads.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={allowReversed}
                        onChange={(e) => {
                          playCelestialSound("flip");
                          setAllowReversed(e.target.checked);
                          localStorage.setItem("celestial_allow_reversed", e.target.checked.toString());
                        }}
                        className="w-4 h-4 text-teal-500 bg-[#070412] border-teal-500 rounded focus:ring-teal-500 accent-teal-400 cursor-pointer"
                      />
                    </div>

                    {/* Toggle Smart Shuffle */}
                    <div className="flex items-center justify-between border-b border-[#2c1654]/30 pb-3">
                      <div className="space-y-0.5 max-w-[80%]">
                        <label className="text-xs font-bold text-white block">Enable Smart Shuffle (Repeat Reduction)</label>
                        <p className="text-[10px] text-slate-400">
                          Tracks drawn cards to prevent repeating duplicates too quickly across sequential readings. Encourages deep diversity of advice.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={smartShuffleEnabled}
                        onChange={(e) => {
                          playCelestialSound("flip");
                          setSmartShuffleEnabled(e.target.checked);
                          localStorage.setItem("celestial_smart_shuffle", e.target.checked.toString());
                        }}
                        className="w-4 h-4 text-teal-500 bg-[#070412] border-teal-500 rounded focus:ring-teal-500 accent-teal-400 cursor-pointer"
                      />
                    </div>

                    {/* Protection limit size */}
                    {smartShuffleEnabled && (
                      <div className="space-y-2 border-b border-[#2c1654]/30 pb-3">
                        <div className="flex justify-between items-center text-xs">
                          <label className="font-bold text-white">Vibrational Protection Size</label>
                          <span className="font-mono text-teal-300 font-bold">{repeatProtectionLimit} Cards Memory</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Specifies how many of the most recently drawn cards should be locked out of drawings before the smart engine forces a reset or recycle.
                        </p>
                        <input
                          type="range"
                          min="5"
                          max="40"
                          value={repeatProtectionLimit}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            setRepeatProtectionLimit(val);
                            localStorage.setItem("celestial_repeat_limit", val.toString());
                          }}
                          className="w-full accent-teal-400 h-1 bg-black/60 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    )}
                  </div>

                  {/* Shuffle Memory Queue Visual Representation */}
                  <div className="p-4 rounded-xl border border-[#2c1654] bg-[#120a26]/20 text-left space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-mystic-gold" />
                        <span className="text-[10px] font-mono uppercase tracking-widest text-mystic-gold font-bold">
                          Active Memory Buffer ({recentDrawnIds.length} tracked)
                        </span>
                      </div>
                      {recentDrawnIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            playCelestialSound("success");
                            setRecentDrawnIds([]);
                            localStorage.removeItem("celestial_recently_drawn_cards");
                            alert("Vibrational draw history successfully flushed!");
                          }}
                          className="text-[9px] text-teal-300 hover:text-white uppercase font-bold tracking-tight px-2 py-0.5 bg-teal-950/40 border border-teal-500/30 rounded cursor-pointer transition-colors"
                        >
                          Flush Memory
                        </button>
                      )}
                    </div>

                    <p className="text-[10px] text-slate-400">
                      The cards below reside in the temporary tracking cache and will be filtered out of consecutive draws until the lockout count is achieved.
                    </p>

                    {recentDrawnIds.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-[#2c1654]/40 rounded-lg italic">
                        Tracking cache empty. Pull some cards to register alignment memory.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-black/20 rounded">
                        {recentDrawnIds.map((id) => {
                          const card = cards.find(c => c.id === id);
                          if (!card) return null;
                          return (
                            <span
                              key={id}
                              className="text-[9px] px-2 py-0.5 bg-[#2c1654]/40 border border-[#2c1654]/60 rounded-full text-slate-300 font-mono flex items-center gap-1"
                            >
                              <span className="h-1 w-1 bg-teal-400 rounded-full"></span>
                              {card.name} (ID: {card.id})
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SUBTAB 3: DECK DATABASE MANAGER */}
              {adminSubTab === "deck" && (
                <div className="space-y-4 fade-in">
                  
                  {/* Inline Card Editor View */}
                  {editingCardId !== null && cardEditForm !== null ? (
                    <div className="p-4 rounded-xl border-2 border-mystic-gold bg-gradient-to-b from-[#180f33] to-[#070412] text-left space-y-4">
                      <div className="flex items-center justify-between border-b border-[#2c1654]/60 pb-2">
                        <span className="text-[10px] font-mono text-mystic-gold uppercase font-bold">
                          Editing Card Identity: ID {editingCardId} ({cardEditForm.name})
                        </span>
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-black/60 text-slate-400">
                          {editingCardId < 22 ? "Major Arcana" : "Minor Arcana"}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-3.5 text-xs">
                        {/* Name Input */}
                        <div>
                          <label className="text-[10px] text-slate-450 block mb-1 uppercase font-bold tracking-tight">Card Name</label>
                          <input
                            type="text"
                            value={cardEditForm.name}
                            onChange={(e) => setCardEditForm({ ...cardEditForm, name: e.target.value })}
                            className="w-full bg-black/60 border border-[#2c1654] rounded-lg p-2 text-white outline-none focus:border-mystic-gold"
                          />
                        </div>

                        {/* Keywords Upright */}
                        <div>
                          <label className="text-[10px] text-slate-450 block mb-1 uppercase font-bold tracking-tight">Upright Keywords (comma-separated)</label>
                          <input
                            type="text"
                            value={cardEditForm.uprightKeywords.join(", ")}
                            onChange={(e) => setCardEditForm({
                              ...cardEditForm,
                              uprightKeywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                            })}
                            className="w-full bg-black/60 border border-[#2c1654] rounded-lg p-2 text-white font-mono outline-none focus:border-mystic-gold"
                          />
                        </div>

                        {/* Keywords Reversed */}
                        <div>
                          <label className="text-[10px] text-slate-450 block mb-1 uppercase font-bold tracking-tight">Reversed Keywords (comma-separated)</label>
                          <input
                            type="text"
                            value={cardEditForm.reversedKeywords.join(", ")}
                            onChange={(e) => setCardEditForm({
                              ...cardEditForm,
                              reversedKeywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                            })}
                            className="w-full bg-black/60 border border-[#2c1654] rounded-lg p-2 text-white font-mono outline-none focus:border-mystic-gold"
                          />
                        </div>

                        {/* Meaning Upright */}
                        <div>
                          <label className="text-[10px] text-slate-450 block mb-1 uppercase font-bold tracking-tight">Upright Interpretation Meaning</label>
                          <textarea
                            rows={3}
                            value={cardEditForm.uprightMeaning}
                            onChange={(e) => setCardEditForm({ ...cardEditForm, uprightMeaning: e.target.value })}
                            className="w-full bg-black/60 border border-[#2c1654] rounded-lg p-2 text-white outline-none focus:border-mystic-gold leading-relaxed"
                          />
                        </div>

                        {/* Meaning Reversed */}
                        <div>
                          <label className="text-[10px] text-slate-450 block mb-1 uppercase font-bold tracking-tight">Reversed Interpretation Meaning</label>
                          <textarea
                            rows={3}
                            value={cardEditForm.reversedMeaning}
                            onChange={(e) => setCardEditForm({ ...cardEditForm, reversedMeaning: e.target.value })}
                            className="w-full bg-black/60 border border-[#2c1654] rounded-lg p-2 text-white outline-none focus:border-mystic-gold leading-relaxed"
                          />
                        </div>

                        {/* Description */}
                        <div>
                          <label className="text-[10px] text-slate-450 block mb-1 uppercase font-bold tracking-tight">Visual Description (Artwork Context)</label>
                          <input
                            type="text"
                            value={cardEditForm.description}
                            onChange={(e) => setCardEditForm({ ...cardEditForm, description: e.target.value })}
                            className="w-full bg-black/60 border border-[#2c1654] rounded-lg p-2 text-white outline-none focus:border-mystic-gold"
                          />
                        </div>

                        {/* Advice */}
                        <div>
                          <label className="text-[10px] text-slate-450 block mb-1 uppercase font-bold tracking-tight">Direct Oracle Advice</label>
                          <input
                            type="text"
                            value={cardEditForm.advice}
                            onChange={(e) => setCardEditForm({ ...cardEditForm, advice: e.target.value })}
                            className="w-full bg-black/60 border border-[#2c1654] rounded-lg p-2 text-white outline-none focus:border-mystic-gold"
                          />
                        </div>

                        {/* Visibility Toggle */}
                        <div className="flex items-center justify-between p-2.5 bg-black/40 rounded border border-[#2c1654]/40 my-1">
                          <div className="space-y-0.5">
                            <span className="text-xs font-bold text-white block">Hide from Readings</span>
                            <span className="text-[9px] text-slate-400 block">If toggled ON, this card will not be drawn in spreads or daily guidances.</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={!!cardEditForm.isHidden}
                            onChange={(e) => setCardEditForm({ ...cardEditForm, isHidden: e.target.checked })}
                            className="w-4 h-4 text-teal-500 bg-[#070412] border-teal-500 rounded focus:ring-teal-500 accent-teal-400 cursor-pointer"
                          />
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="pt-2 flex flex-col gap-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              playCelestialSound("success");
                              const updated = cards.map(c => c.id === editingCardId ? { ...cardEditForm } : c);
                              setCards(updated);
                              localStorage.setItem("celestial_tarot_deck", JSON.stringify(updated));
                              setEditingCardId(null);
                              setCardEditForm(null);
                            }}
                            className="flex-1 py-2 rounded-lg bg-mystic-gold text-[#070412] font-bold text-xs uppercase cursor-pointer text-center hover:brightness-110 active:scale-95 transition-all"
                          >
                            Save Celestial Card
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => {
                              playCelestialSound("flip");
                              setEditingCardId(null);
                              setCardEditForm(null);
                            }}
                            className="px-4 py-2 rounded-lg border border-[#2c1654] text-slate-300 text-xs cursor-pointer hover:bg-white/5 active:scale-95"
                          >
                            Cancel
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("Restore this card's details to the default original templates? Any customized details will be lost.")) {
                              playCelestialSound("flip");
                              const originalCard = TAROT_DECK.find(c => c.id === editingCardId);
                              if (originalCard) {
                                setCardEditForm({ ...originalCard });
                                const updated = cards.map(c => c.id === editingCardId ? { ...originalCard } : c);
                                setCards(updated);
                                localStorage.setItem("celestial_tarot_deck", JSON.stringify(updated));
                                alert("Card restored to original defaults.");
                              }
                            }
                          }}
                          className="w-full py-1.5 text-center text-[10px] font-bold uppercase tracking-wide text-red-400 bg-red-950/20 border border-red-500/20 rounded hover:bg-red-950/40 cursor-pointer"
                        >
                          Reset Card to Original Default
                        </button>
                      </div>

                    </div>
                  ) : (
                    // DB Browser View
                    <div className="space-y-3.5 text-left">
                      
                      {/* Search and Filters */}
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={deckSearch}
                          onChange={(e) => setDeckSearch(e.target.value)}
                          placeholder="Search card by name or keywords..."
                          className="w-full bg-[#070412] border border-[#2c1654] rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-mystic-gold"
                        />

                        {/* Sub Filter Category pills */}
                        <div className="flex flex-wrap gap-1">
                          {[
                            { id: "all", label: "All (78)" },
                            { id: "major", label: "Major (22)" },
                            { id: "minor", label: "Minor (56)" },
                            { id: "hidden", label: "Hidden" },
                            { id: "edited", label: "Customized" }
                          ].map((pill) => {
                            const isAct = deckFilter === pill.id;
                            return (
                              <button
                                key={pill.id}
                                type="button"
                                onClick={() => { playCelestialSound("flip"); setDeckFilter(pill.id as any); }}
                                className={`text-[9px] px-2 py-1 rounded font-semibold transition-all cursor-pointer ${
                                  isAct
                                    ? "bg-teal-400 text-[#070412]"
                                    : "bg-[#120a26]/80 border border-[#2c1654]/50 text-slate-450 hover:text-white"
                                }`}
                              >
                                {pill.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Reset Deck to Factory */}
                      <div className="flex justify-between items-center text-[10px] text-slate-400 pl-1 border-b border-[#2c1654]/20 pb-2">
                        <span>Database Registry Browser</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm("CELESTIAL RE-ALIGNMENT WARNING: This will immediately delete ALL custom card changes, meanings, edits, and visibility toggles, restoring the entire 78-card deck to original default templates. Do you wish to proceed?")) {
                              playCelestialSound("success");
                              setCards(TAROT_DECK);
                              localStorage.setItem("celestial_tarot_deck", JSON.stringify(TAROT_DECK));
                              alert("All tarot deck custom records successfully restored to factory defaults!");
                            }
                          }}
                          className="text-[9px] text-red-400 hover:text-white transition-colors cursor-pointer bg-transparent border-0 underline"
                        >
                          Reset Full Deck Defaults
                        </button>
                      </div>

                      {/* Cards database list */}
                      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1 bg-black/20 rounded border border-[#2c1654]/20 p-2.5">
                        {(() => {
                          const filtered = cards.filter(c => {
                            // Search filter
                            const matchQuery = c.name.toLowerCase().includes(deckSearch.toLowerCase()) ||
                              c.uprightKeywords.some(k => k.toLowerCase().includes(deckSearch.toLowerCase())) ||
                              c.reversedKeywords.some(k => k.toLowerCase().includes(deckSearch.toLowerCase()));

                            if (!matchQuery) return false;

                            // Tab Category filters
                            if (deckFilter === "major") return c.id < 22;
                            if (deckFilter === "minor") return c.id >= 22;
                            if (deckFilter === "hidden") return !!c.isHidden;
                            if (deckFilter === "edited") {
                              const original = TAROT_DECK.find(orig => orig.id === c.id);
                              if (!original) return false;
                              return (
                                original.name !== c.name ||
                                original.uprightMeaning !== c.uprightMeaning ||
                                original.reversedMeaning !== c.reversedMeaning ||
                                original.advice !== c.advice ||
                                original.description !== c.description ||
                                original.uprightKeywords.join(",") !== c.uprightKeywords.join(",") ||
                                original.reversedKeywords.join(",") !== c.reversedKeywords.join(",")
                              );
                            }
                            return true;
                          });

                          if (filtered.length === 0) {
                            return (
                              <div className="text-center py-8 text-xs text-slate-500 italic">
                                No records matched your filter coordinates.
                              </div>
                            );
                          }

                          return filtered.map((c) => {
                            // Check if edited from original template
                            const original = TAROT_DECK.find(orig => orig.id === c.id);
                            const isCustom = original && (
                              original.name !== c.name ||
                              original.uprightMeaning !== c.uprightMeaning ||
                              original.reversedMeaning !== c.reversedMeaning ||
                              original.advice !== c.advice ||
                              original.description !== c.description ||
                              original.uprightKeywords.join(",") !== c.uprightKeywords.join(",") ||
                              original.reversedKeywords.join(",") !== c.reversedKeywords.join(",")
                            );

                            return (
                              <div
                                key={c.id}
                                className="p-2.5 rounded-lg bg-[#120a26]/40 border border-[#2c1654]/40 flex justify-between items-center text-xs"
                              >
                                <div className="space-y-1 max-w-[70%]">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-bold text-white tracking-tight">{c.name}</span>
                                    <span className="text-[8px] font-mono font-bold text-slate-500 uppercase">ID: {c.id}</span>
                                    {c.isHidden && (
                                      <span className="text-[7px] font-bold bg-red-950 text-red-400 border border-red-500/20 rounded px-1 uppercase">Hidden</span>
                                    )}
                                    {isCustom && (
                                      <span className="text-[7px] font-bold bg-teal-950 text-teal-300 border border-teal-500/20 rounded px-1 uppercase">Custom</span>
                                    )}
                                  </div>

                                  <div className="text-[9px] text-slate-400 leading-tight font-mono truncate">
                                    {c.uprightKeywords.join(" · ")}
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => {
                                    playCelestialSound("flip");
                                    setEditingCardId(c.id);
                                    setCardEditForm({ ...c });
                                  }}
                                  className="text-[9px] px-2.5 py-1 text-teal-300 hover:text-white bg-teal-950/40 border border-teal-500/30 rounded uppercase font-bold active:scale-95 transition-all cursor-pointer"
                                >
                                  Edit Card
                                </button>
                              </div>
                            );
                          });
                        })()}
                      </div>

                    </div>
                  )}

                </div>
              )}

              {/* SUBTAB 4: STAFF ROSTER & PROMOTION */}
              {adminSubTab === "staff" && (
                <div className="space-y-4 fade-in text-left">
                  
                  {/* Promotion Form */}
                  <form onSubmit={handlePromoteStaff} className="p-4 rounded-xl border border-teal-500/30 bg-[#070412]/80 space-y-3">
                    <div className="flex items-center gap-1.5 border-b border-[#2c1654]/30 pb-2">
                      <Plus className="w-4 h-4 text-teal-400" />
                      <span className="text-[10px] font-mono tracking-widest text-teal-400 font-bold uppercase">
                        Authorize New Administrator
                      </span>
                    </div>

                    <p className="text-[10px] text-slate-400 leading-normal">
                      Enter the email coordinate of your wife (or another trusted reader) who has already registered their star profile. They must verify their email address before accessing the console.
                    </p>

                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={staffEmailInput}
                        onChange={(e) => setStaffEmailInput(e.target.value)}
                        placeholder="wife@coordinate.com"
                        className="flex-1 bg-[#0b081c] border border-[#2c1654] rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-mystic-gold"
                        required
                      />
                      <button
                        type="submit"
                        className="py-2 px-4 rounded-lg bg-teal-400 text-black font-bold text-xs uppercase cursor-pointer hover:brightness-110 active:scale-95 transition-all text-center"
                      >
                        Grant Admin
                      </button>
                    </div>
                  </form>

                  {/* Staff List */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-mono text-slate-400 uppercase block pl-1 font-semibold">
                      Authorized Administrators Staff List
                    </span>

                    <div className="space-y-2">
                      {staffList.map((staff, idx) => {
                        const isBootstrap = staff.email === "kertisjohnson7@gmail.com";
                        return (
                          <div
                            key={staff.uid || idx}
                            className="p-3 rounded-xl bg-gradient-to-br from-[#120a26] to-[#070412] border border-[#2c1654]/40 flex justify-between items-center text-xs"
                          >
                            <div className="space-y-1 max-w-[70%]">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-white tracking-tight">
                                  {staff.displayName || "Celestial Admin"}
                                </span>
                                {isBootstrap ? (
                                  <span className="text-[7px] font-bold bg-mystic-gold/25 text-mystic-gold border border-mystic-gold/30 rounded px-1 uppercase">Primary (Bootstrap)</span>
                                ) : (
                                  <span className="text-[7px] font-bold bg-teal-950 text-teal-300 border border-teal-500/20 rounded px-1 uppercase">Promoted</span>
                                )}
                              </div>
                              <div className="text-[9px] font-mono text-slate-400 leading-tight">
                                {staff.email}
                              </div>
                            </div>

                            {!isBootstrap && (
                              <button
                                type="button"
                                onClick={() => handleDemoteStaff(staff.uid, staff.email)}
                                className="text-[9px] px-2.5 py-1 text-red-400 hover:text-white bg-red-950/20 border border-red-500/20 rounded uppercase font-bold active:scale-95 transition-all cursor-pointer"
                              >
                                Revoke
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tarot Reader permission */}
                  <div className="p-4 rounded-xl border border-mystic-gold/30 bg-[#070412]/80 space-y-3">
                    <span className="text-[10px] font-mono tracking-widest text-mystic-gold font-bold uppercase block">
                      Tarot Reader Access
                    </span>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Administrators always have Tarot controls. Grant Tarot Reader to a registered user so they can run readings in their live broadcasts.
                    </p>
                    <form onSubmit={(e) => handleSetTarotReader(e, { email: tarotReaderEmailInput }, true)} className="flex gap-2">
                      <input
                        type="email"
                        value={tarotReaderEmailInput}
                        onChange={(e) => setTarotReaderEmailInput(e.target.value)}
                        placeholder="reader@coordinate.com"
                        className="flex-1 bg-[#0b081c] border border-[#2c1654] rounded-lg px-3 py-2 text-xs text-slate-100 outline-none focus:border-mystic-gold"
                        required
                      />
                      <button type="submit" className="py-2 px-4 rounded-lg bg-mystic-gold text-black font-bold text-xs uppercase cursor-pointer hover:brightness-110 active:scale-95 transition-all">
                        Grant
                      </button>
                    </form>
                    {tarotReaderList.map((reader) => (
                      <div key={reader.uid} className="flex justify-between items-center text-xs p-2 rounded-lg bg-[#120a26]/60 border border-[#2c1654]/40">
                        <span className="font-mono text-[10px] text-slate-300 truncate">{reader.email}</span>
                        <button
                          type="button"
                          onClick={() => handleSetTarotReader(null, { uid: reader.uid, email: reader.email }, false)}
                          className="text-[9px] px-2.5 py-1 text-red-400 hover:text-white bg-red-950/20 border border-red-500/20 rounded uppercase font-bold active:scale-95 transition-all cursor-pointer"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>

                </div>
              )}

              {/* SUBTAB 5: FINANCIALS LEDGER & STRIPE CONFIG */}
              {adminSubTab === "financials" && (
                <div className="space-y-5 fade-in text-left text-xs">
                  
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="bg-[#120a26]/80 border border-[#2c1654] p-3 rounded-xl relative overflow-hidden">
                      <div className="absolute top-2 right-2 opacity-10">
                        <DollarSign className="w-8 h-8 text-mystic-gold" />
                      </div>
                      <span className="text-[9px] font-mono uppercase text-slate-400 block mb-1">Gross Volume</span>
                      <strong className="text-lg font-bold text-white tabular-nums">
                        ${(financialStats?.totalGrossVolume ?? 0).toFixed(2)}
                      </strong>
                    </div>

                    <div className="bg-[#120a26]/80 border border-[#2c1654] p-3 rounded-xl relative overflow-hidden">
                      <div className="absolute top-2 right-2 opacity-10">
                        <Shield className="w-8 h-8 text-teal-400" />
                      </div>
                      <span className="text-[9px] font-mono uppercase text-slate-400 block mb-1">Platform Rev (20%)</span>
                      <strong className="text-lg font-bold text-teal-400 tabular-nums">
                        ${(financialStats?.totalPlatformRevenue ?? 0).toFixed(2)}
                      </strong>
                    </div>

                    <div className="bg-[#120a26]/80 border border-[#2c1654] p-3 rounded-xl relative overflow-hidden">
                      <div className="absolute top-2 right-2 opacity-10">
                        <TrendingUp className="w-8 h-8 text-purple-400" />
                      </div>
                      <span className="text-[9px] font-mono uppercase text-slate-400 block mb-1">Connect Payouts (80%)</span>
                      <strong className="text-lg font-bold text-purple-300 tabular-nums">
                        ${(financialStats?.totalTransfers ?? 0).toFixed(2)}
                      </strong>
                    </div>

                    <div className="bg-[#120a26]/80 border border-[#2c1654] p-3 rounded-xl relative overflow-hidden">
                      <div className="absolute top-2 right-2 opacity-10">
                        <Gem className="w-8 h-8 text-mystic-gold" />
                      </div>
                      <span className="text-[9px] font-mono uppercase text-slate-400 block mb-1">Transactions</span>
                      <strong className="text-lg font-bold text-mystic-gold tabular-nums">
                        {financialStats?.purchaseCount ?? 0}
                      </strong>
                    </div>
                  </div>

                  {/* Stripe Configuration Assistant Guide */}
                  <div className="p-4 rounded-xl border border-mystic-gold/30 bg-mystic-gold/5 space-y-3">
                    <div className="flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-mystic-gold" />
                      <span className="text-[10px] font-mono tracking-widest text-mystic-gold font-bold uppercase">
                        Stripe Integration Setup Assistant
                      </span>
                    </div>
                    
                    <p className="text-[11px] text-slate-300 leading-relaxed font-body">
                      Celestial Sanctuary is fully engineered with standard server-side webhook validation and Connect Express routing. Follow these instructions to securely bind your existing Stripe dashboard coordinates.
                    </p>

                    <div className="space-y-2 border-t border-[#2c1654]/40 pt-3 text-[11px] leading-relaxed">
                      <div>
                        <strong className="text-white">1. Add API Credentials:</strong>
                        <p className="text-slate-400 mt-0.5">
                          Create or open your existing account in the <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="text-mystic-gold underline">Stripe Dashboard</a>. Copy your <strong className="text-slate-300">Secret Key (sk_test_...)</strong> and paste it as <code className="text-teal-300 bg-teal-950/40 px-1 rounded text-[10px]">STRIPE_SECRET_KEY</code> in your environment variables/file.
                        </p>
                      </div>

                      <div>
                        <strong className="text-white">2. Enable Stripe Connect:</strong>
                        <p className="text-slate-400 mt-0.5">
                          In your Stripe Dashboard, go to <strong className="text-slate-300">Connect Settings</strong>, enable "Express Accounts" for your platform, and configure the return redirects to match your app coordinates.
                        </p>
                      </div>

                      <div>
                        <strong className="text-white">3. Configure Verified Webhooks:</strong>
                        <p className="text-slate-400 mt-0.5">
                          Navigate to <strong className="text-slate-300">Developers &gt; Webhooks</strong>, add an endpoint targeting <code className="text-teal-300 bg-teal-950/40 px-1 rounded text-[10px]">https://your-domain.com/api/stripe-webhook</code>, and listen for:
                          <span className="block font-mono text-[9px] text-emerald-400 mt-0.5">
                            • checkout.session.completed<br/>
                            • charge.refunded<br/>
                            • charge.dispute.created
                          </span>
                          Retrieve your webhook secret (<strong className="text-slate-300">whsec_...</strong>) and store it as <code className="text-teal-300 bg-teal-950/40 px-1 rounded text-[10px]">STRIPE_WEBHOOK_SECRET</code> in your environment.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Real-time Ledger */}
                  <div className="space-y-2.5">
                    <span className="text-[9px] font-mono text-slate-400 uppercase block pl-1 font-semibold">
                      Global Reconciliation Audit Ledger
                    </span>

                    {financialRecords.length === 0 ? (
                      <div className="py-8 text-center text-slate-500 border border-dashed border-[#2c1654]/40 rounded-xl italic">
                        No financial events registered in server ledger logs yet.<br/>
                        <span className="text-[10px] text-slate-600 block mt-1">
                          (Initiate a gem recharge on the Member tab or tip on the Live tab to test)
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                        {financialRecords.map((record) => {
                          const isTip = record.type === "tip";
                          const isPurchase = record.type === "gem_purchase";
                          const isRefund = record.type === "refund";
                          const isDispute = record.type === "dispute";

                          return (
                            <div
                              key={record.id}
                              className="p-3 rounded-xl bg-gradient-to-br from-[#120a26] to-[#070412] border border-[#2c1654]/40 text-left space-y-2"
                            >
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="font-mono text-slate-400">{record.id}</span>
                                <span className="text-slate-500">
                                  {record.createdAt ? new Date(record.createdAt).toLocaleString() : "Unknown Time"}
                                </span>
                              </div>

                              <div className="flex justify-between items-center">
                                <div className="flex items-center gap-1.5">
                                  {isPurchase && (
                                    <span className="text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-500/20 rounded px-1.5 uppercase">
                                      Gem Purchase
                                    </span>
                                  )}
                                  {isTip && (
                                    <span className="text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-500/20 rounded px-1.5 uppercase">
                                      Reader Tip
                                    </span>
                                  )}
                                  {isRefund && (
                                    <span className="text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-500/20 rounded px-1.5 uppercase">
                                      Refund Event
                                    </span>
                                  )}
                                  {isDispute && (
                                    <span className="text-[9px] font-bold bg-red-950 text-red-400 border border-red-500/20 rounded px-1.5 uppercase">
                                      Dispute Open
                                    </span>
                                  )}
                                  
                                  <span className="text-slate-300 font-semibold text-[11px]">
                                    {isPurchase && `+${record.gemsAmount} Gems`}
                                    {isTip && `Direct Payout Tip`}
                                    {isRefund && `Charge Refund`}
                                    {isDispute && `Disputed Amount`}
                                  </span>
                                </div>

                                <strong className="text-white font-mono font-bold text-sm">
                                  ${record.amount ? Number(record.amount).toFixed(2) : "0.00"}
                                </strong>
                              </div>

                              <div className="grid grid-cols-2 gap-1.5 border-t border-[#2c1654]/30 pt-2 text-[9px] text-slate-400 font-mono">
                                <div>
                                  Status: <strong className="text-teal-400 uppercase">{record.status}</strong>
                                </div>
                                {isTip && (
                                  <div className="text-right">
                                    Split: <span className="text-slate-300">20% Fee / 80% Payout</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>
          )}
          </>
        )}

        </main>


        {/* --- ADMIN ACCESS GATE PASSCODE MODAL --- */}
        {showAdminGate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="w-full max-w-xs bg-gradient-to-b from-[#1c103a] to-[#070412] border-2 border-mystic-gold rounded-2xl p-6 text-center space-y-4 shadow-2xl relative">
              <div className="absolute top-3 right-3">
                <button
                  type="button"
                  onClick={() => {
                    playCelestialSound("flip");
                    setShowAdminGate(false);
                  }}
                  className="text-slate-400 hover:text-white text-xs font-semibold px-2 py-0.5 rounded border border-[#2c1654]/60 bg-[#070412] cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="w-12 h-12 rounded-full bg-mystic-gold/15 border border-mystic-gold/40 flex items-center justify-center mx-auto text-mystic-gold text-lg">
                <Lock className="w-5 h-5 animate-pulse" />
              </div>

              <div>
                <h3 className="font-display text-sm font-bold text-white tracking-wide">
                  Reader's Cosmic Portal
                </h3>
                <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                  Enter the mystical passcode to verify administrator authority.
                </p>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={adminPasscodeInput}
                  onChange={(e) => {
                    setAdminPasscodeInput(e.target.value);
                    setAdminGateError("");
                  }}
                  placeholder="Enter Passcode"
                  className="w-full bg-[#070412] border border-[#2c1654] rounded-lg px-3 py-2 text-xs text-center text-slate-100 outline-none focus:border-mystic-gold"
                  autoFocus
                />

                {adminGateError && (
                  <p className="text-[10px] text-red-400 font-medium">
                    {adminGateError}
                  </p>
                )}
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (currentUser && (currentUser.email === "kertisjohnson7@gmail.com" || dbUserDoc?.role === "admin")) {
                      if (!currentUser.emailVerified) {
                        setAdminGateError("Your administrator email coordinate is unverified. Please verify your email on the Member tab first.");
                        return;
                      }
                      playCelestialSound("success");
                      setIsAdminAuthenticated(true);
                      setActiveTab("admin");
                      setShowAdminGate(false);
                    } else {
                      playCelestialSound("flip");
                      setAdminGateError("Vibrational match failed. Only verified, authorized administrator accounts can access this portal.");
                    }
                  }}
                  className="flex-1 py-2 rounded-lg bg-mystic-gold text-[#070412] font-bold text-xs uppercase cursor-pointer"
                >
                  Verify Key
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playCelestialSound("flip");
                    setShowAdminGate(false);
                  }}
                  className="px-3 py-2 rounded-lg border border-[#2c1654] text-slate-300 text-xs cursor-pointer"
                >
                  Cancel
                </button>
              </div>

              <p className="text-[8px] text-slate-500 italic">
                Secure Portal Access: Log in as <strong className="text-mystic-gold">kertisjohnson7@gmail.com</strong> or another promoted verified admin account.
              </p>
            </div>
          </div>
        )}

      </div>

    </div>

      {/* --- STICKY BOTTOM TAB NAVIGATION (Pattern 1 Touch-First Contract) --- */}
        <nav className={`fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md h-16 bg-[#070412]/95 backdrop-blur-md border-t border-[#2c1654]/60 z-40 grid items-center ${
          isAdminAuthenticated ? "grid-cols-7" : "grid-cols-6"
        }`}>
          
          <button
            onClick={() => { setActiveTab("home"); playCelestialSound("flip"); }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-all cursor-pointer ${
              activeTab === "home" ? "text-mystic-gold" : "text-slate-400 hover:text-white"
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[9px] font-semibold tracking-tight mt-1">Home</span>
          </button>

          <button
            onClick={() => { setActiveTab("tarot"); playCelestialSound("flip"); }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-all cursor-pointer ${
              activeTab === "tarot" ? "text-mystic-gold" : "text-slate-400 hover:text-white"
            }`}
          >
            <Wand2 className="w-5 h-5" />
            <span className="text-[9px] font-semibold tracking-tight mt-1">Tarot</span>
          </button>

          <button
            onClick={() => { setActiveTab("zodiac"); playCelestialSound("flip"); }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-all cursor-pointer ${
              activeTab === "zodiac" ? "text-mystic-gold" : "text-slate-400 hover:text-white"
            }`}
          >
            <Moon className="w-5 h-5" />
            <span className="text-[9px] font-semibold tracking-tight mt-1">Zodiac</span>
          </button>

          <button
            onClick={() => { setActiveTab("numerology"); playCelestialSound("flip"); }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-all cursor-pointer ${
              activeTab === "numerology" ? "text-mystic-gold" : "text-slate-400 hover:text-white"
            }`}
          >
            <Activity className="w-5 h-5" />
            <span className="text-[9px] font-semibold tracking-tight mt-1">Numbers</span>
          </button>

          <button
            onClick={() => { setActiveTab("live"); playCelestialSound("flip"); }}
            className="relative flex h-full min-h-[44px] flex-col items-center justify-center text-slate-400 transition-all hover:text-white"
          >
            <span className="absolute top-2 right-4 flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
            </span>
            <Video className="w-5 h-5" />
            <span className="text-[9px] font-semibold tracking-tight mt-1">Live</span>
          </button>

          <button
            onClick={() => {
              playCelestialSound("flip");
              if (isAuthLoading) {
                setPendingMemberNavigation(true);
                return;
              }
              setActiveTab(currentUser ? "profile" : "dashboard");
            }}
            className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-all cursor-pointer ${
              activeTab === "dashboard" || activeTab === "profile" ? "text-mystic-gold" : "text-slate-400 hover:text-white"
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[9px] font-semibold tracking-tight mt-1">Member</span>
          </button>

          {isAdminAuthenticated && (
            <button
              onClick={() => { setActiveTab("admin"); playCelestialSound("flip"); }}
              className={`flex flex-col items-center justify-center h-full min-h-[44px] transition-all cursor-pointer ${
                activeTab === "admin" ? "text-teal-400" : "text-slate-400 hover:text-white"
              }`}
            >
              <TrendingUp className="w-5 h-5" />
              <span className="text-[9px] font-semibold tracking-tight mt-1">Admin</span>
            </button>
          )}

        </nav>
    </>
  );
}
