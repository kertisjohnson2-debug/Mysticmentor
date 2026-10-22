/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import fs from "fs/promises";
import admin from "firebase-admin";
import { cert, getApps } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import crypto from "crypto";
import { TAROT_DECK } from "./src/data/spiritualData";
import { getAuthoritativeBroadcasterRank as authoritativeBroadcasterRank } from "./src/lib/broadcasterRanks";
import { reportKeySource, validateReportInput } from "./src/lib/communityReports";
import { GiftSpendError, giftCostFor, spendGemsOnGift, summarizeReceivedGifts } from "./liveGifts";
import { confirmLiveTipIn } from "./liveTipRecovery";
import { isLiveSessionActive, LIVE_DISPLAY_STALE_MS, LIVE_PAYMENT_STALE_MS } from "./src/lib/liveSessionState";
import { generateSlots, overlaps, validateScheduleSettings, type ReaderScheduleSettings } from "./scheduling";
import { afterFailedAttempt, ADMIN_LOCKOUT_MS, hashPasscode, isAdminSessionValid, isPasscodeRecord, isRecentSignIn, isSessionTokenShape, lockedFor, newAdminSession, readAttemptState, sessionIdFor, validateNewPasscode, verifyPasscode } from "./adminAccess";
import { registerAdminPanel } from "./adminPanel";
import { registerAccountRestrictions, registerMemberManagement } from "./memberManagement";
import { registerAffirmationSpins } from "./affirmationSpins";
import { readDailyHoroscope } from "./src/lib/dailyContent";
import { calculateTipSplit, evaluateConnectReadiness, parseTipAmountCents, summarizePendingTips, summarizeReceivedTips } from "./payments";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- FIREBASE ADMIN INITIALIZATION ---
// Reads project configuration automatically to connect with full administrative privileges
const firebaseConfig = JSON.parse(readFileSync("./firebase-applet-config.json", "utf-8"));

// Initialize if not already initialized
if (getApps().length === 0) {
  try {
    // Use the project's service-account secret when provided; otherwise fall back to Application Default Credentials (hosted environments).
    const serviceAccountJson = process.env.MYSTICMENTOR_FIREBASE_SERVICE_ACCOUNT;
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      ...(serviceAccountJson ? { credential: cert(JSON.parse(serviceAccountJson)) } : {}),
    });
    console.log("[Firebase Admin] Connected successfully to project:", firebaseConfig.projectId);
  } catch (error) {
    console.error("[Firebase Admin] Initialization failed:", error);
  }
}

// Bind to the exact named Firestore Database ID allocated for this workspace applet
export const db = getFirestore(getApps()[0], firebaseConfig.firestoreDatabaseId);

// A failed background Firestore call must not take the whole server down (clients would see gateway 502s).
process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled promise rejection:", reason);
});
export function getDb() {
  return db;
}

// Account creation date for public profiles: Firebase Auth's creation time first, then the stored profile date. Never guessed.
export function publicMemberSince(authCreationTime: unknown, storedCreatedAt: unknown): string | null {
  const candidates = [authCreationTime, storedCreatedAt && typeof storedCreatedAt === "object" && "toDate" in storedCreatedAt && typeof storedCreatedAt.toDate === "function" ? storedCreatedAt.toDate() : storedCreatedAt];
  for (const value of candidates) {
    const date = typeof value === "string" ? new Date(value) : value instanceof Date ? value : null;
    if (date && Number.isFinite(date.getTime()) && date.getTime() <= Date.now()) return date.toISOString();
  }
  return null;
}

// --- STRIPE INITIALIZATION ---
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const isStripeConfigured = !!STRIPE_SECRET_KEY;
const isProduction = process.env.NODE_ENV === "production";
const stripe = isStripeConfigured
  ? new Stripe(STRIPE_SECRET_KEY)
  : (null as unknown as Stripe);

// Server-side source of truth for Gem packages. Client-supplied cost/gems are never trusted.
const GEM_PACKAGES: Record<string, { gems: number; cost: number }> = {
  gems_500: { gems: 500, cost: 4.99 },
  gems_1200: { gems: 1200, cost: 9.99 },
};

const COMMUNITY_TOPICS = ["General", "Spirituality", "Tarot", "Wellness", "Events", "Friendship", "Local Gems", "Introductions"] as const;
const COMMUNITY_MAX_REPLY_DEPTH = 4;
const COMMUNITY_MAX_IMAGES_PER_POST = 3;
const R2_FREE_TIER_BYTES = 10 * 1024 ** 3;
const R2_WARN_BYTES = 8 * 1024 ** 3;
const COMMUNITY_MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const COMMUNITY_GEOGRAPHY_BASE_URL = "https://countriesnow.space/api/v0.1";
const COMMUNITY_LOCATION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let communityStatesCache: { value: CommunityState[]; expiresAt: number } | null = null;
const communityCitiesCache = new Map<string, { value: string[]; expiresAt: number }>();

type CommunityState = { code: string; name: string };

const connectionRequestId = (senderUid: string, recipientUid: string) =>
  crypto.createHash("sha256").update(`${senderUid}\0${recipientUid}`).digest("hex");

const connectionId = (firstUid: string, secondUid: string) =>
  crypto.createHash("sha256").update([firstUid, secondUid].sort().join("\0")).digest("hex");

function isLocalHost(host: string | undefined): boolean {
  if (!host) return false;
  const cleanHost = host.split(":")[0];
  return cleanHost === "localhost" || cleanHost === "127.0.0.1" || cleanHost === "::1" || cleanHost.endsWith(".local");
}

// Simulation is allowed only outside production, on a local host, and when explicitly enabled.
function isSimulationAllowed(host: string | undefined): boolean {
  return !isProduction && process.env.ENABLE_WEBHOOK_SIMULATION === "true" && isLocalHost(host);
}

function isCommunityTopic(value: unknown): value is typeof COMMUNITY_TOPICS[number] {
  return typeof value === "string" && (COMMUNITY_TOPICS as readonly string[]).includes(value);
}

function isStateCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z]{2}$/.test(value);
}

function isCommunityText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maximumLength;
}

async function geographyJson(url: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`Geographic service returned HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || (payload as { error?: unknown }).error !== false) {
        throw new Error("Geographic service returned an invalid response");
      }
      return payload;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function getCommunityStates(): Promise<CommunityState[]> {
  if (communityStatesCache && communityStatesCache.expiresAt > Date.now()) return communityStatesCache.value;
  const url = new URL(`${COMMUNITY_GEOGRAPHY_BASE_URL}/countries/states/q`);
  url.searchParams.set("country", "United States");
  const payload = await geographyJson(url.toString());
  const data = (payload as { data?: { name?: unknown; states?: unknown } }).data;
  if (!data || data.name !== "United States" || !Array.isArray(data.states)) throw new Error("Geographic service returned no U.S. states");
  const states = data.states
    .filter((state) => Boolean(state) && typeof state === "object" &&
      typeof (state as { name?: unknown }).name === "string" &&
      isStateCode((state as { state_code?: unknown }).state_code))
    .map((state) => ({
      name: (state as { name: string }).name,
      code: (state as { state_code: string }).state_code
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!states.length) throw new Error("Geographic service returned no valid U.S. states");
  communityStatesCache = { value: states, expiresAt: Date.now() + COMMUNITY_LOCATION_CACHE_TTL_MS };
  return states;
}

async function getCommunityCities(stateCode: string): Promise<string[]> {
  const cached = communityCitiesCache.get(stateCode);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const state = (await getCommunityStates()).find((item) => item.code === stateCode);
  if (!state) throw new Error("Geographic service returned no matching state");
  const url = new URL(`${COMMUNITY_GEOGRAPHY_BASE_URL}/countries/state/cities/q`);
  url.searchParams.set("country", "United States");
  url.searchParams.set("state", state.name);
  const payload = await geographyJson(url.toString());
  const cities = (payload as { data?: unknown }).data;
  if (!Array.isArray(cities) || !cities.every((city) => typeof city === "string")) {
    throw new Error("Geographic service returned an invalid city list");
  }
  const uniqueCities = [...new Set(cities.map((city) => city.trim()).filter((city) => city && !/ county$/i.test(city)))]
    .sort((a, b) => a.localeCompare(b));
  if (!uniqueCities.length) throw new Error("Geographic service returned no cities for this state");
  communityCitiesCache.set(stateCode, { value: uniqueCities, expiresAt: Date.now() + COMMUNITY_LOCATION_CACHE_TTL_MS });
  return uniqueCities;
}

if (isStripeConfigured) {
  console.log("[Stripe Backend] Initialized with real API keys.");
} else if (isProduction) {
  console.error("[Stripe Backend] STRIPE_SECRET_KEY is missing in production. Gem checkout is disabled.");
} else {
  console.log("[Stripe Backend] API keys not found. Local development simulator available only with ENABLE_WEBHOOK_SIMULATION=true.");
}
if (isProduction && isStripeConfigured && !STRIPE_WEBHOOK_SECRET) {
  console.error("[Stripe Backend] STRIPE_WEBHOOK_SECRET is missing in production. Webhooks will be rejected.");
}

async function startServer() {
  const app = express();

  // --- STRIPE WEBHOOK (Needs raw body for signature verification) ---
  app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event: Stripe.Event;

    try {
      if (isStripeConfigured && STRIPE_WEBHOOK_SECRET) {
        if (!sig) throw new Error("Missing stripe-signature header");
        event = stripe.webhooks.constructEvent(req.body, sig as string, STRIPE_WEBHOOK_SECRET);
      } else if (isSimulationAllowed(req.hostname)) {
        // Local development only: unsigned simulated payload
        event = JSON.parse(req.body.toString("utf-8")) as Stripe.Event;
        console.log("[Stripe Simulator Webhook] Received simulated webhook event:", event.type);
      } else {
        console.error("[Stripe Webhook Error] Webhook secret not configured; rejecting unsigned event.");
        return res.status(503).send("Webhook endpoint is not configured.");
      }
    } catch (err: any) {
      console.error("[Stripe Webhook Error] Signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      await processStripeEvent(event);
      return res.json({ received: true });
    } catch (error: any) {
      console.error("[Stripe Webhook Processing Error]:", error);
      return res.status(500).send(`Processing Error: ${error.message}`);
    }
  });

  // --- PARSE JSON FOR STANDARD API ENDPOINTS ---
  app.use(express.json());

  // All bearer-authenticated API paths, including legacy routes, enforce account restrictions.
  // Webhooks are registered above this middleware and continue to reconcile existing payments.
  registerAccountRestrictions(app, db);

  // --- API: NOTIFICATIONS (server-only writers; clients can never write notification docs) ---
  const NOTIFICATION_AVATAR_MAX = 40000;
  const LIVE_NOTIFY_MAX_AGE_MS = 2 * 60 * 1000;
  const NOTIFY_RATE_WINDOW_MS = 60 * 1000;
  const NOTIFY_RATE_MAX = 30;
  const notifyRateHits = new Map<string, number[]>();

  const isRateLimited = (uid: string) => {
    const now = Date.now();
    const hits = (notifyRateHits.get(uid) ?? []).filter((time) => now - time < NOTIFY_RATE_WINDOW_MS);
    hits.push(now);
    notifyRateHits.set(uid, hits);
    return hits.length > NOTIFY_RATE_MAX;
  };

  // Returns the verified, non-anonymous caller uid or sends the error response
  const authenticateMember = async (req: express.Request, res: express.Response, rateLimit = true): Promise<string | null> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.length <= 7) {
      res.status(401).json({ error: "Missing or invalid authorization header" });
      return null;
    }
    try {
      const decoded = await getAuth().verifyIdToken(authHeader.substring(7));
      if (decoded.firebase?.sign_in_provider === "anonymous") {
        res.status(403).json({ error: "Sign in to continue" });
        return null;
      }
      if (rateLimit && isRateLimited(decoded.uid)) {
        res.status(429).json({ error: "Too many requests" });
        return null;
      }
      return decoded.uid;
    } catch {
      res.status(401).json({ error: "Invalid ID token" });
      return null;
    }
  };

  const safeAvatar = (value: unknown) => (typeof value === "string" && value.length <= NOTIFICATION_AVATAR_MAX ? value : "");
  // Saved JPEGs can exceed notification limits; match the existing user avatar field limit.
  const publicProfileAvatar = (value: unknown) => {
    if (typeof value === "string" && value.length <= 300000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      return value;
    }
    return safeAvatar(value);
  };

  // Creates the doc only if absent; the deterministic id makes repeated requests no-ops
  const createNotificationOnce = async (recipientUid: string, notificationId: string, data: Record<string, unknown>) => {
    try {
      await db.collection("users").doc(recipientUid).collection("notifications").doc(notificationId).create(data);
      return true;
    } catch (error: any) {
      if (error?.code === 6 || error?.code === "already-exists") return false;
      throw error;
    }
  };

  // Creates the member's profile once with the trusted starting balance; never touches an existing profile
  const STARTING_GEM_BALANCE = 850;
  app.post("/api/init-profile", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      const authUser = await getAuth().getUser(uid);
      const requestedName = typeof req.body?.displayName === "string" ? req.body.displayName.trim().slice(0, 100) : "";
      const email = authUser.email || "";
      const isAdminEmail = email === "kertisjohnson7@gmail.com" && authUser.emailVerified === true;
      const userRef = db.collection("users").doc(uid);
      const profile = await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(userRef);
        if (snap.exists) return snap.data();
        const now = new Date().toISOString();
        const created = {
          uid,
          email,
          displayName: requestedName || authUser.displayName || email.split("@")[0] || "Celestial Member",
          role: isAdminEmail ? "admin" : "member",
          gemBalance: STARTING_GEM_BALANCE,
          cloutPoints: 0,
          createdAt: now,
          updatedAt: now
        };
        transaction.create(userRef, created);
        return created;
      });
      return res.json({ success: true, profile });
    } catch (error) {
      console.error("init-profile failed:", error);
      return res.status(500).json({ error: "Could not initialize profile" });
    }
  });

  app.post("/api/notify-follow", async (req, res) => {
    const followerUid = await authenticateMember(req, res);
    if (!followerUid) return;

    const broadcasterUid = req.body?.broadcasterUid;
    if (typeof broadcasterUid !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(broadcasterUid)) {
      return res.status(400).json({ error: "Invalid broadcasterUid" });
    }
    if (broadcasterUid === followerUid) {
      return res.status(400).json({ error: "You cannot notify yourself" });
    }

    try {
      const followSnap = await db.collection("users").doc(followerUid).collection("following").doc(broadcasterUid).get();
      if (!followSnap.exists || followSnap.data()?.broadcasterUid !== broadcasterUid) {
        return res.status(404).json({ error: "Follow not found" });
      }
      const recipientSnap = await db.collection("users").doc(broadcasterUid).get();
      if (!recipientSnap.exists) {
        return res.status(404).json({ error: "Recipient not found" });
      }

      const followerSnap = await db.collection("users").doc(followerUid).get();
      const followerData = followerSnap.data() ?? {};
      const actorDisplayName = String(followerData.displayName || "A member").slice(0, 100);
      const dedupeKey = `follow:${followerUid}:${broadcasterUid}`;

      const created = await createNotificationOnce(broadcasterUid, dedupeKey, {
        type: "follow",
        message: `${actorDisplayName} followed you.`,
        actorUid: followerUid,
        actorDisplayName,
        actorAvatarUrl: safeAvatar(followerData.avatarUrl),
        recipientUid: broadcasterUid,
        broadcasterUid: null,
        sessionId: null,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
        dedupeKey
      });
      return res.json({ created });
    } catch (error) {
      console.error("[Notifications] Follow notification failed:", error);
      return res.status(500).json({ error: "Could not create notification" });
    }
  });

  app.post("/api/notify-live", async (req, res) => {
    const broadcasterUid = await authenticateMember(req, res);
    if (!broadcasterUid) return;

    const sessionId = req.body?.sessionId;
    if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) {
      return res.status(400).json({ error: "Invalid sessionId" });
    }

    try {
      const sessionSnap = await db.collection("liveSessions").doc(sessionId).get();
      const session = sessionSnap.data();
      if (!session || session.ownerUid !== broadcasterUid) {
        return res.status(403).json({ error: "You do not own this live session" });
      }
      if (session.status !== "live" || typeof session.startedAt !== "number" || Date.now() - session.startedAt > LIVE_NOTIFY_MAX_AGE_MS) {
        return res.status(409).json({ error: "Live session is not currently starting" });
      }

      const broadcasterSnap = await db.collection("users").doc(broadcasterUid).get();
      const broadcasterData = broadcasterSnap.data() ?? {};
      const actorDisplayName = String(broadcasterData.displayName || session.name || "A broadcaster").slice(0, 100);
      const actorAvatarUrl = safeAvatar(session.avatarUrl);

      const followers = await db.collectionGroup("following").where("broadcasterUid", "==", broadcasterUid).get();
      const followerUids = followers.docs
        .filter((item) => item.ref.parent.parent?.parent.id === "users")
        .map((item) => item.ref.parent.parent!.id)
        .filter((uid) => uid !== broadcasterUid);

      let created = 0;
      for (let index = 0; index < followerUids.length; index += 25) {
        const results = await Promise.all(followerUids.slice(index, index + 25).map((followerUid) => {
          const dedupeKey = `live:${sessionId}:${followerUid}`;
          return createNotificationOnce(followerUid, dedupeKey, {
            type: "live",
            message: `${actorDisplayName} is live now.`,
            actorUid: broadcasterUid,
            actorDisplayName,
            actorAvatarUrl,
            recipientUid: followerUid,
            broadcasterUid,
            sessionId,
            createdAt: FieldValue.serverTimestamp(),
            readAt: null,
            dedupeKey
          });
        }));
        created += results.filter(Boolean).length;
      }
      return res.json({ created, followers: followerUids.length });
    } catch (error) {
      console.error("[Notifications] Live notification failed:", error);
      return res.status(500).json({ error: "Could not create notifications" });
    }
  });

  const isValidMemberUid = (value: unknown): value is string =>
    typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value);

  const getSafeMember = async (uid: string) => {
    const snapshot = await db.collection("users").doc(uid).get();
    const data = snapshot.data();
    if (!snapshot.exists || data?.suspended === true) return null;
    return {
      uid,
      displayName: String(data?.displayName || "Celestial Member").slice(0, 100),
      avatarUrl: safeAvatar(data?.avatarUrl)
    };
  };

  // Authors are shown with their current saved profile; the stored snapshot is only a fallback.
  // Saved profile photos can be large, so each author's photo is returned once in `authorAvatars` (keyed by
  // authorUid) instead of being repeated on every post or reply; the client fills it back in by the same uid.
  const resolveCommunityAuthors = async <T extends { authorUid?: unknown; author?: unknown }>(items: T[]) => {
    const uids = [...new Set(items.map((item) => item.authorUid).filter(isValidMemberUid))];
    const current = new Map<string, { uid: string; displayName: string }>();
    const authorAvatars: Record<string, string> = {};
    const photoHidden = new Set<string>();
    if (uids.length) {
      const [snapshots, settingsSnapshots] = await Promise.all([
        db.getAll(...uids.map((uid) => db.collection("users").doc(uid))),
        db.getAll(...uids.map((uid) => db.collection("memberPublicSettings").doc(uid)))
      ]);
      // Respect the same "Profile photo" visibility setting the public profile uses.
      settingsSnapshots.forEach((snapshot) => { if (!normalizeProfileSettings(snapshot.data()).visibility.avatar) photoHidden.add(snapshot.id); });
      snapshots.forEach((snapshot) => {
        const data = snapshot.data();
        if (!snapshot.exists || !data || data.suspended === true) return;
        current.set(snapshot.id, { uid: snapshot.id, displayName: String(data.displayName || "Celestial Member").slice(0, 100) });
        const avatar = photoHidden.has(snapshot.id) ? "" : publicProfileAvatar(data.avatarUrl);
        if (avatar) authorAvatars[snapshot.id] = avatar;
      });
    }
    const resolved = items.map((item) => {
      const uid = typeof item.authorUid === "string" ? item.authorUid : "";
      const fallback = item.author as { displayName?: unknown; avatarUrl?: unknown } | undefined;
      const live = current.get(uid);
      if (!live && uid && !authorAvatars[uid] && !photoHidden.has(uid)) {
        const stored = publicProfileAvatar(fallback?.avatarUrl);
        if (stored) authorAvatars[uid] = stored;
      }
      return {
        ...item,
        author: {
          uid,
          displayName: live?.displayName ?? (typeof fallback?.displayName === "string" && fallback.displayName ? fallback.displayName.slice(0, 100) : "Celestial Member"),
          avatarUrl: ""
        }
      };
    });
    return { items: resolved, authorAvatars };
  };

  const getCommunityMember = async (uid: string, res: express.Response) => {
    const member = await getSafeMember(uid);
    if (!member) {
      res.status(403).json({ error: "An active member profile is required." });
      return null;
    }
    return member;
  };

  app.get("/api/community/states", async (_req, res) => {
    try {
      return res.json({ states: await getCommunityStates() });
    } catch (error) {
      console.error("[Community] Could not load geographic states:", error);
      return res.status(502).json({ error: "The geographic service is unavailable. Please try again." });
    }
  });

  app.get("/api/community/states/:stateCode/cities", async (req, res) => {
    const { stateCode } = req.params;
    if (!isStateCode(stateCode)) return res.status(400).json({ error: "Invalid state selection." });
    try {
      const states = await getCommunityStates();
      if (!states.some((state) => state.code === stateCode)) return res.status(404).json({ error: "State not found." });
      return res.json({ cities: await getCommunityCities(stateCode) });
    } catch (error) {
      console.error("[Community] Could not load geographic cities:", error);
      return res.status(502).json({ error: "The geographic service is unavailable. Please try again." });
    }
  });

  const R2_ENV = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"] as const;
  let r2Client: S3Client | null = null;
  const r2 = () => {
    const missing = R2_ENV.filter((name) => !process.env[name]);
    if (missing.length) throw Object.assign(new Error(`R2 storage is not configured: missing ${missing.join(", ")}`), { r2Missing: true });
    r2Client ??= new S3Client({
      region: "auto",
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
    });
    return { client: r2Client, Bucket: process.env.R2_BUCKET_NAME! };
  };
  const requestKeyId = (uid: string, key: unknown) =>
    typeof key === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(key)
      ? crypto.createHash("sha256").update(`${uid}:${key}`).digest("hex").slice(0, 40)
      : null;

  const signedImageUrls = async (imageIds: unknown): Promise<{ id: string; url: string }[]> => {
    if (!Array.isArray(imageIds) || !imageIds.length) return [];
    // Display cap is deliberately above the new 3-image limit so older posts keep all their images.
    const ids = imageIds.filter(isValidMemberUid).slice(0, 10);
    const snapshots = await db.getAll(...ids.map((id) => db.collection("communityImages").doc(id)));
    const images = await Promise.all(snapshots.map(async (snapshot) => {
      const data = snapshot.data();
      if (!snapshot.exists || !data || typeof data.path !== "string") return null;
      try {
        const { client, Bucket } = r2();
        const url = await getSignedUrl(client, new GetObjectCommand({ Bucket, Key: data.path }), { expiresIn: 60 * 60 });
        return { id: snapshot.id, url };
      } catch (error) {
        console.error("[Community] Could not sign image URL:", error instanceof Error ? error.message : error);
        return null;
      }
    }));
    return images.filter((image): image is { id: string; url: string } => image !== null);
  };

  const deleteCommunityImages = async (imageIds: unknown) => {
    if (!Array.isArray(imageIds)) return;
    for (const id of imageIds.filter(isValidMemberUid)) {
      const ref = db.collection("communityImages").doc(id);
      const snapshot = await ref.get();
      const path = snapshot.data()?.path;
      if (typeof path === "string") {
        try {
          const { client, Bucket } = r2();
          await client.send(new DeleteObjectCommand({ Bucket, Key: path }));
        } catch (error) {
          console.error("[Community] Image object delete failed:", error instanceof Error ? error.message : error);
          if ((error as { r2Missing?: boolean }).r2Missing) continue; // keep metadata so the object can be cleaned up once configured
        }
      }
      await ref.delete();
    }
  };

  const parseImageIds = (value: unknown): string[] | null => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.length > COMMUNITY_MAX_IMAGES_PER_POST || !value.every(isValidMemberUid) || new Set(value).size !== value.length) return null;
    return value;
  };

  // Must run before any transaction write: confirms every id is an unused upload owned by this member and made for this target.
  const readPendingImageRefs = async (transaction: FirebaseFirestore.Transaction, uid: string, ids: string[], target: "post" | "reply" = "reply") => {
    const refs = ids.map((id) => db.collection("communityImages").doc(id));
    const snapshots = refs.length ? await transaction.getAll(...refs) : [];
    snapshots.forEach((snapshot) => {
      const data = snapshot.data();
      if (!snapshot.exists || data?.ownerUid !== uid || data?.status !== "pending" || (data?.target ?? "post") !== target) throw new Error("IMAGE_NOT_AVAILABLE");
    });
    return refs;
  };

  // Reply images are off unless an admin turns them on; absent setting means disabled.
  const COMMUNITY_SETTINGS_REF = () => db.collection("admin_settings").doc("community");
  const replyImagesEnabled = async () => (await COMMUNITY_SETTINGS_REF().get()).data()?.replyImagesEnabled === true;
  const REPLY_IMAGES_OFF = "Images in replies are turned off right now. You can still reply with text.";

  // In-memory per-user sliding windows, same approach as the existing request limiter.
  const uploadHits = new Map<string, number[]>();
  const uploadRateLimited = (uid: string, scope: string, limits: [windowMs: number, max: number][]) => {
    const now = Date.now();
    const longest = Math.max(...limits.map(([windowMs]) => windowMs));
    const hits = (uploadHits.get(`${scope}:${uid}`) ?? []).filter((time) => now - time < longest);
    const limited = limits.some(([windowMs, max]) => hits.filter((time) => now - time < windowMs).length >= max);
    if (!limited) hits.push(now);
    uploadHits.set(`${scope}:${uid}`, hits);
    if (uploadHits.size > 5000) for (const [key, times] of uploadHits) if (!times.some((time) => now - time < longest)) uploadHits.delete(key);
    return limited;
  };
  const COMMUNITY_UPLOAD_LIMITS: [number, number][] = [[60_000, 6], [60 * 60_000, 30]];
  const THUMBNAIL_UPLOAD_LIMITS: [number, number][] = [[60_000, 3], [60 * 60_000, 10]];

  // Total bucket size from R2 itself, cached because listing is a billable operation.
  let storageUsageCache: { usedBytes: number; objectCount: number; truncated: boolean; checkedAt: number } | null = null;
  const getStorageUsage = async (force = false) => {
    if (!force && storageUsageCache && Date.now() - storageUsageCache.checkedAt < 15 * 60_000) return storageUsageCache;
    const { client, Bucket } = r2();
    let usedBytes = 0;
    let objectCount = 0;
    let token: string | undefined;
    let pages = 0;
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }));
      (page.Contents ?? []).forEach((item) => { usedBytes += item.Size ?? 0; objectCount += 1; });
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      pages += 1;
    } while (token && pages < 100);
    storageUsageCache = { usedBytes, objectCount, truncated: Boolean(token), checkedAt: Date.now() };
    return storageUsageCache;
  };
  // Stops new uploads once the free allowance is used; a failed usage check never blocks members.
  const storageFull = async () => {
    try {
      return (await getStorageUsage()).usedBytes >= R2_FREE_TIER_BYTES;
    } catch {
      return false;
    }
  };

  const isAdminAccount = async (uid: string) => {
    const [snapshot, authUser] = await Promise.all([db.collection("users").doc(uid).get(), getAuth().getUser(uid)]);
    const data = snapshot.data();
    return !authUser.disabled && data?.suspended !== true && (
      data?.role === "admin" ||
      (authUser.email === "kertisjohnson7@gmail.com" && authUser.emailVerified)
    );
  };

  // Role check only (existing authorization). Protected admin data and actions also require requireAdminSession.
  const authenticateAdmin = async (req: express.Request, res: express.Response): Promise<string | null> => {
    const uid = await authenticateMember(req, res);
    if (!uid) return null;
    try {
      await getAuth().verifyIdToken(req.headers.authorization!.substring(7), true);
      if (await isAdminAccount(uid)) return uid;
    } catch (error) {
      console.error("[Admin] Admin check failed:", error instanceof Error ? error.message : error);
    }
    res.status(403).json({ error: "Admin access required.", code: "admin-access-denied" });
    return null;
  };

  // --- Admin passcode gate: server-validated, revocable sessions (Admin SDK only; Firestore rules deny clients) ---
  const ADMIN_PASSCODE_REF = () => db.collection("adminSecurity").doc("passcode");
  const adminSessionRef = (id: string) => db.collection("adminSessions").doc(id);
  const adminAttemptsRef = (uid: string) => db.collection("adminAccessAttempts").doc(uid);
  const adminSessionToken = (req: express.Request) => {
    const header = req.headers["x-admin-session"];
    return isSessionTokenShape(header) ? header : null;
  };
  const readAdminSession = async (req: express.Request, uid: string) => {
    const token = adminSessionToken(req);
    if (!token) return null;
    const [snapshot, pin] = await Promise.all([adminSessionRef(sessionIdFor(token)).get(), ADMIN_PASSCODE_REF().get()]);
    const data = snapshot.data();
    return isAdminSessionValid(data, uid, Date.now()) && typeof pin.data()?.generation === "string" && data?.generation === pin.data()?.generation
      ? { id: snapshot.id, expiresAt: data!.expiresAt as number, remember: data!.remember === true } : null;
  };

  const requireAdminSession = async (req: express.Request, res: express.Response): Promise<string | null> => {
    const uid = await authenticateAdmin(req, res);
    if (!uid) return null;
    try {
      if (await readAdminSession(req, uid)) return uid;
    } catch (error) {
      console.error("[Admin] Session check failed:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Could not verify administrator access." });
      return null;
    }
    res.status(401).json({ error: "Administrator passcode verification required.", code: "admin-session-required" });
    return null;
  };

  const issueAdminSession = async (uid: string, remember: boolean, generation: string) => {
    const session = newAdminSession(uid, remember, Date.now());
    await adminSessionRef(session.id).create({ ...session.record, generation });
    return { token: session.token, expiresAt: session.record.expiresAt, remember };
  };

  const revokeAdminSessions = async (uid: string, exceptId?: string) => {
    const snapshot = await db.collection("adminSessions").where("uid", "==", uid).where("revoked", "==", false).get();
    let revoked = 0;
    for (let index = 0; index < snapshot.docs.length; index += 400) {
      const batch = db.batch();
      snapshot.docs.slice(index, index + 400).forEach((doc) => {
        if (doc.id === exceptId) return;
        batch.update(doc.ref, { revoked: true, revokedAt: Date.now() });
        revoked += 1;
      });
      await batch.commit();
    }
    return revoked;
  };

  // Checks the passcode under a per-admin lockout; failures are counted atomically in Firestore.
  const checkAdminPasscode = async (uid: string, passcode: unknown): Promise<{ ok: true; generation: string } | { ok: false; status: number; error: string }> => {
    const stored = (await ADMIN_PASSCODE_REF().get()).data();
    if (!isPasscodeRecord(stored)) return { ok: false, status: 409, error: "No administrator passcode is set yet." };
    // Reserve an attempt before expensive hashing so concurrent requests cannot bypass the five-attempt lock.
    const allowed = await db.runTransaction(async (tx) => {
      const state = readAttemptState((await tx.get(adminAttemptsRef(uid))).data());
      if (lockedFor(state, Date.now()) > 0) return false;
      tx.set(adminAttemptsRef(uid), { ...afterFailedAttempt(state, Date.now()), updatedAt: Date.now() });
      return true;
    });
    if (!allowed) return { ok: false, status: 429, error: "Too many PIN attempts. Try again in 15 minutes." };
    if (await verifyPasscode(passcode, stored)) {
      await adminAttemptsRef(uid).set({ failures: 0, lockedUntil: 0, updatedAt: Date.now() });
      if (typeof stored.generation !== "string") return { ok: false, status: 409, error: "Upgrade the existing passcode using verified account recovery." };
      return { ok: true, generation: stored.generation };
    }
    const next = readAttemptState((await adminAttemptsRef(uid).get()).data());
    return next.lockedUntil
      ? { ok: false, status: 429, error: `Too many incorrect attempts. Try again in ${Math.ceil(ADMIN_LOCKOUT_MS / 60_000)} minutes.` }
      : { ok: false, status: 403, error: "Incorrect passcode." };
  };

  app.get("/api/admin/access/status", async (req, res) => {
    const uid = await authenticateAdmin(req, res);
    if (!uid) return;
    try {
      const [stored, session] = await Promise.all([ADMIN_PASSCODE_REF().get(), readAdminSession(req, uid)]);
      return res.json({ passcodeConfigured: isPasscodeRecord(stored.data()), session: session ? { expiresAt: session.expiresAt, remember: session.remember } : null });
    } catch (error) {
      console.error("[Admin] Access status failed:", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "Could not check administrator access." });
    }
  });

  app.post("/api/admin/access/verify", async (req, res) => {
    const uid = await authenticateAdmin(req, res);
    if (!uid) return;
    try {
      const result = await checkAdminPasscode(uid, req.body?.passcode);
      if (!result.ok) return res.status(result.status).json({ error: result.error });
      return res.json(await issueAdminSession(uid, req.body?.remember === true, result.generation));
    } catch (error) {
      console.error("[Admin] Passcode verification failed:", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "Could not verify the passcode." });
    }
  });

  app.post("/api/admin/access/passcode/change", async (req, res) => {
    const uid = await authenticateAdmin(req, res);
    if (!uid) return;
    const next = validateNewPasscode(req.body?.newPasscode);
    if ("error" in next) return res.status(400).json({ error: next.error });
    try {
      const result = await checkAdminPasscode(uid, req.body?.currentPasscode);
      if (!result.ok) return res.status(result.status).json({ error: result.status === 403 ? "The current passcode is incorrect." : result.error });
      const hash = await hashPasscode(next.value);
      const generation = crypto.randomUUID();
      await db.runTransaction(async (tx) => {
        const stored = await tx.get(ADMIN_PASSCODE_REF());
        if (stored.data()?.generation !== result.generation) throw new Error("PIN changed concurrently; verify again.");
        tx.set(ADMIN_PASSCODE_REF(), { ...hash, generation, updatedAt: Date.now(), updatedBy: uid });
      });
      return res.json(await issueAdminSession(uid, req.body?.remember === true, generation));
    } catch (error) {
      console.error("[Admin] Passcode change failed:", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "Could not change the passcode." });
    }
  });

  // Recovery requires a verified admin account and a fresh Firebase sign-in; first-use setup is separate.
  app.post("/api/admin/access/passcode/reset", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ") || authHeader.length <= 7) return res.status(401).json({ error: "Missing or invalid authorization header" });
    let decoded: DecodedIdToken;
    try {
      decoded = await getAuth().verifyIdToken(authHeader.substring(7), true);
    } catch {
      return res.status(401).json({ error: "Invalid ID token" });
    }
    if (decoded.firebase?.sign_in_provider === "anonymous") return res.status(403).json({ error: "Sign in to continue" });
    if (isRateLimited(decoded.uid)) return res.status(429).json({ error: "Too many requests" });
    try {
      if (!(await isAdminAccount(decoded.uid))) return res.status(403).json({ error: "Admin access required." });
    } catch (error) {
      console.error("[Admin] Admin check failed:", error instanceof Error ? error.message : error);
      return res.status(403).json({ error: "Admin access required." });
    }
    if (decoded.email_verified !== true) return res.status(403).json({ error: "Verify your account email before resetting the passcode." });
    if (!isRecentSignIn(decoded.auth_time, Date.now())) return res.status(401).json({ error: "Confirm your account password again to continue.", code: "recent-sign-in-required" });
    const next = validateNewPasscode(req.body?.newPasscode);
    if ("error" in next) return res.status(400).json({ error: next.error });
    try {
      const generation = crypto.randomUUID();
      await ADMIN_PASSCODE_REF().set({ ...(await hashPasscode(next.value)), generation, updatedAt: Date.now(), updatedBy: decoded.uid });
      await adminAttemptsRef(decoded.uid).set({ failures: 0, lockedUntil: 0, updatedAt: Date.now() });
      return res.json(await issueAdminSession(decoded.uid, req.body?.remember === true, generation));
    } catch (error) {
      console.error("[Admin] Passcode reset failed:", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "Could not reset the passcode." });
    }
  });

  // Revokes this device's session, or every session for this administrator.
  app.post("/api/admin/access/revoke", async (req, res) => {
    const uid = await authenticateAdmin(req, res);
    if (!uid) return;
    try {
      if (req.body?.scope === "all") {
        if (!(await readAdminSession(req, uid))) return res.status(401).json({ error: "Administrator passcode verification required.", code: "admin-session-required" });
        return res.json({ revoked: await revokeAdminSessions(uid) });
      }
      const token = adminSessionToken(req);
      if (!token) return res.json({ revoked: 0 });
      const ref = adminSessionRef(sessionIdFor(token));
      const revoked = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists || snapshot.data()?.uid !== uid || snapshot.data()?.revoked === true) return 0;
        transaction.update(ref, { revoked: true, revokedAt: Date.now() });
        return 1;
      });
      return res.json({ revoked });
    } catch (error) {
      console.error("[Admin] Session revoke failed:", error instanceof Error ? error.message : error);
      return res.status(500).json({ error: "Could not revoke administrator access." });
    }
  });

  // Initial creation uses the already authenticated, verified admin account; it cannot overwrite an existing PIN.
  app.post("/api/admin/access/passcode/setup", async (req, res) => {
    const uid = await authenticateAdmin(req, res);
    if (!uid) return;
    const next = validateNewPasscode(req.body?.newPasscode);
    if ("error" in next) return res.status(400).json({ error: next.error });
    try {
      const generation = crypto.randomUUID();
      const hash = await hashPasscode(next.value);
      const created = await db.runTransaction(async (tx) => {
        if ((await tx.get(ADMIN_PASSCODE_REF())).exists) return false;
        tx.create(ADMIN_PASSCODE_REF(), { ...hash, generation, updatedAt: Date.now(), updatedBy: uid });
        return true;
      });
      if (!created) return res.status(409).json({ error: "A PIN is already configured. Enter it or use verified recovery." });
      return res.json(await issueAdminSession(uid, req.body?.remember === true, generation));
    } catch (error) {
      console.error("[Admin] PIN setup failed:", error);
      return res.status(500).json({ error: "Could not create the administrator PIN." });
    }
  });

  registerAdminPanel(app, db, requireAdminSession);
  registerMemberManagement(app, db, requireAdminSession, authenticateMember);
  registerAffirmationSpins(app, db, (req, res) => authenticateMember(req, res, false));

  const storageErrorResponse = (res: express.Response, error: unknown, fallback: string) => {
    if ((error as { r2Missing?: boolean }).r2Missing || (error as { name?: string }).name === "NoSuchBucket") return res.status(503).json({ error: "Image storage is not set up for this project yet." });
    return res.status(500).json({ error: fallback });
  };

  const isJpeg = (bytes: unknown): bytes is Buffer =>
    Buffer.isBuffer(bytes) && bytes.length >= 4 && bytes.length <= COMMUNITY_MAX_IMAGE_BYTES && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

  app.get("/api/community/settings", async (_req, res) => {
    try {
      return res.json({ replyImagesEnabled: await replyImagesEnabled(), maxImagesPerPost: COMMUNITY_MAX_IMAGES_PER_POST });
    } catch (error) {
      console.error("[Community] Settings read failed:", error);
      return res.json({ replyImagesEnabled: false, maxImagesPerPost: COMMUNITY_MAX_IMAGES_PER_POST });
    }
  });

  app.put("/api/admin/community-settings", async (req, res) => {
    const uid = await requireAdminSession(req, res);
    if (!uid) return;
    if (typeof req.body?.replyImagesEnabled !== "boolean") return res.status(400).json({ error: "Provide replyImagesEnabled as true or false." });
    try {
      await COMMUNITY_SETTINGS_REF().set({ replyImagesEnabled: req.body.replyImagesEnabled, updatedBy: uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.json({ replyImagesEnabled: req.body.replyImagesEnabled });
    } catch (error) {
      console.error("[Admin] Community settings update failed:", error);
      return res.status(500).json({ error: "Could not save the setting." });
    }
  });

  app.get("/api/admin/storage-usage", async (req, res) => {
    const uid = await requireAdminSession(req, res);
    if (!uid) return;
    try {
      const usage = await getStorageUsage(req.query.refresh === "1");
      return res.json({
        ...usage,
        limitBytes: R2_FREE_TIER_BYTES,
        warnBytes: R2_WARN_BYTES,
        level: usage.usedBytes >= R2_FREE_TIER_BYTES ? "full" : usage.usedBytes >= R2_WARN_BYTES ? "warning" : "ok"
      });
    } catch (error) {
      console.error("[Admin] Storage usage failed:", error instanceof Error ? error.message : error);
      return storageErrorResponse(res, error, "Could not read storage usage.");
    }
  });

  // Verified JPEG upload: the browser resizes/compresses to JPEG; the server checks size and magic bytes.
  app.post("/api/community/images", express.raw({ type: "image/jpeg", limit: COMMUNITY_MAX_IMAGE_BYTES }), async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const target = req.query.target === "reply" ? "reply" : "post";
    const bytes = req.body;
    if (!isJpeg(bytes)) {
      return res.status(400).json({ error: "Upload a JPEG image under 2.5 MB." });
    }
    if (uploadRateLimited(uid, "community-image", COMMUNITY_UPLOAD_LIMITS)) {
      return res.status(429).json({ error: "You are uploading too quickly. Please wait a minute and try again." });
    }
    try {
      if (target === "reply" && !(await replyImagesEnabled())) return res.status(403).json({ error: REPLY_IMAGES_OFF });
      const member = await getSafeMember(uid);
      if (!member) return res.status(403).json({ error: "An active member profile is required." });
      if (await storageFull()) return res.status(503).json({ error: "Image uploads are paused right now. Please try again later." });
      const pending = await db.collection("communityImages").where("ownerUid", "==", uid).where("status", "==", "pending").limit(11).get();
      if (pending.size >= 10) return res.status(429).json({ error: "Attach or remove your unused images before uploading more." });
      const imageRef = db.collection("communityImages").doc();
      const objectPath = `community-images/${uid}/${imageRef.id}.jpg`;
      const { client, Bucket } = r2();
      await client.send(new PutObjectCommand({ Bucket, Key: objectPath, Body: bytes, ContentType: "image/jpeg", ContentLength: bytes.length }));
      await imageRef.create({ ownerUid: uid, path: objectPath, bytes: bytes.length, target, status: "pending", postId: null, createdAt: FieldValue.serverTimestamp() });
      return res.status(201).json({ imageId: imageRef.id });
    } catch (error) {
      console.error("[Community] Image upload failed:", error instanceof Error ? error.message : error);
      return storageErrorResponse(res, error, "Could not upload the image.");
    }
  });

  // Live broadcast thumbnails: one image per broadcaster, stored in the same R2 bucket and keyed by their own uid.
  app.put("/api/live/thumbnail", express.raw({ type: "image/jpeg", limit: COMMUNITY_MAX_IMAGE_BYTES }), async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const bytes = req.body;
    if (!isJpeg(bytes)) return res.status(400).json({ error: "Upload a JPEG image under 2.5 MB." });
    if (uploadRateLimited(uid, "live-thumbnail", THUMBNAIL_UPLOAD_LIMITS)) {
      return res.status(429).json({ error: "You are changing your thumbnail too quickly. Please try again later." });
    }
    try {
      if (!(await getSafeMember(uid))) return res.status(403).json({ error: "An active member profile is required." });
      if (await storageFull()) return res.status(503).json({ error: "Image uploads are paused right now. Please try again later." });
      const ref = db.collection("liveThumbnails").doc(uid);
      const previousPath = (await ref.get()).data()?.path;
      const objectPath = `live-thumbnails/${uid}/${crypto.randomBytes(12).toString("hex")}.jpg`;
      const { client, Bucket } = r2();
      await client.send(new PutObjectCommand({ Bucket, Key: objectPath, Body: bytes, ContentType: "image/jpeg", ContentLength: bytes.length }));
      const version = Date.now();
      try {
        await ref.set({ ownerUid: uid, path: objectPath, bytes: bytes.length, version, updatedAt: FieldValue.serverTimestamp() });
      } catch (error) {
        await client.send(new DeleteObjectCommand({ Bucket, Key: objectPath })).catch(() => undefined);
        throw error;
      }
      if (typeof previousPath === "string" && previousPath !== objectPath) {
        await client.send(new DeleteObjectCommand({ Bucket, Key: previousPath })).catch((error) => console.error("[Live] Old thumbnail delete failed:", error instanceof Error ? error.message : error));
      }
      return res.json({ version });
    } catch (error) {
      console.error("[Live] Thumbnail upload failed:", error instanceof Error ? error.message : error);
      return storageErrorResponse(res, error, "Could not upload the thumbnail.");
    }
  });

  app.delete("/api/live/thumbnail", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      const ref = db.collection("liveThumbnails").doc(uid);
      const path = (await ref.get()).data()?.path;
      if (typeof path === "string") {
        const { client, Bucket } = r2();
        await client.send(new DeleteObjectCommand({ Bucket, Key: path }));
      }
      await ref.delete();
      return res.json({ deleted: true });
    } catch (error) {
      console.error("[Live] Thumbnail delete failed:", error instanceof Error ? error.message : error);
      return storageErrorResponse(res, error, "Could not remove the thumbnail.");
    }
  });

  // Public promo images for broadcasts that are live now (plus the caller's own, so they can preview before going live).
  const thumbnailReadHits = new Map<string, number[]>();
  app.get("/api/live/thumbnails", async (req, res) => {
    const now = Date.now();
    const ipKey = req.ip ?? "unknown";
    const recent = (thumbnailReadHits.get(ipKey) ?? []).filter((time) => now - time < 60_000);
    recent.push(now);
    thumbnailReadHits.set(ipKey, recent);
    if (thumbnailReadHits.size > 5000) for (const [key, times] of thumbnailReadHits) if (!times.some((time) => now - time < 60_000)) thumbnailReadHits.delete(key);
    if (recent.length > 60) return res.status(429).json({ error: "Too many requests" });

    const requested = [...new Set(String(req.query.uids ?? "").split(",").filter(isValidMemberUid))].slice(0, 30);
    if (!requested.length) return res.json({ thumbnails: {} });
    try {
      let callerUid: string | null = null;
      const header = req.headers.authorization;
      if (header?.startsWith("Bearer ")) callerUid = await getAuth().verifyIdToken(header.substring(7)).then((decoded) => decoded.uid).catch(() => null);
      const liveUids = new Set<string>();
      for (let index = 0; index < requested.length; index += 30) {
        const live = await db.collection("liveSessions").where("ownerUid", "in", requested.slice(index, index + 30)).where("status", "==", "live").get();
        const checkedAt = Date.now();
        live.docs.filter((item) => isLiveSessionActive(item.data(), checkedAt, LIVE_DISPLAY_STALE_MS)).forEach((item) => liveUids.add(String(item.data().ownerUid)));
      }
      const allowed = requested.filter((uid) => liveUids.has(uid) || uid === callerUid);
      const thumbnails: Record<string, { url: string; version: number }> = {};
      if (allowed.length) {
        const snapshots = await db.getAll(...allowed.map((uid) => db.collection("liveThumbnails").doc(uid)));
        const { client, Bucket } = r2();
        await Promise.all(snapshots.map(async (snapshot) => {
          const data = snapshot.data();
          if (!data || data.ownerUid !== snapshot.id || typeof data.path !== "string") return;
          const url = await getSignedUrl(client, new GetObjectCommand({ Bucket, Key: data.path }), { expiresIn: 60 * 60 });
          thumbnails[snapshot.id] = { url, version: Number(data.version) || 0 };
        }));
      }
      return res.json({ thumbnails });
    } catch (error) {
      // Cards fall back to the default artwork, so an unconfigured bucket is not an error for viewers.
      if (!(error as { r2Missing?: boolean }).r2Missing) console.error("[Live] Thumbnail lookup failed:", error instanceof Error ? error.message : error);
      return res.json({ thumbnails: {} });
    }
  });

  app.delete("/api/community/images/:imageId", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { imageId } = req.params;
    if (!isValidMemberUid(imageId)) return res.status(400).json({ error: "Invalid image." });
    try {
      const snapshot = await db.collection("communityImages").doc(imageId).get();
      const data = snapshot.data();
      if (!snapshot.exists || data?.ownerUid !== uid) return res.status(404).json({ error: "Image not found." });
      if (data.status !== "pending") return res.status(409).json({ error: "Remove attached images by editing the post." });
      await deleteCommunityImages([imageId]);
      return res.json({ deleted: true });
    } catch (error) {
      console.error("[Community] Image delete failed:", error);
      return res.status(500).json({ error: "Could not delete the image." });
    }
  });

  app.get("/api/community/preferences", async (req, res) => {
    const uid = await authenticateMember(req, res, false);
    if (!uid) return;
    try {
      const data = (await db.collection("communityPreferences").doc(uid).get()).data();
      return res.json({
        stateCode: isStateCode(data?.stateCode) ? data!.stateCode : "",
        cityName: typeof data?.cityName === "string" ? data.cityName : ""
      });
    } catch (error) {
      console.error("[Community] Preference read failed:", error);
      return res.status(500).json({ error: "Could not load your saved location." });
    }
  });

  app.put("/api/community/preferences", async (req, res) => {
    const uid = await authenticateMember(req, res, false);
    if (!uid) return;
    const { stateCode, cityName } = req.body ?? {};
    if (!isStateCode(stateCode) || (cityName !== "" && !isCommunityText(cityName, 100))) {
      return res.status(400).json({ error: "Invalid saved location." });
    }
    try {
      const states = await getCommunityStates();
      if (!states.some((state) => state.code === stateCode)) return res.status(400).json({ error: "Invalid state." });
      let verifiedCity = "";
      if (cityName) {
        const cities = await getCommunityCities(stateCode);
        const match = cities.find((city) => city.toLocaleLowerCase() === cityName.trim().toLocaleLowerCase());
        if (!match) return res.status(400).json({ error: "The city does not belong to that state." });
        verifiedCity = match;
      }
      await db.collection("communityPreferences").doc(uid).set({ stateCode, cityName: verifiedCity, updatedAt: FieldValue.serverTimestamp() });
      return res.json({ stateCode, cityName: verifiedCity });
    } catch (error) {
      console.error("[Community] Preference save failed:", error);
      return res.status(500).json({ error: "Could not save your location." });
    }
  });

  const toCommunityTimestamp = (value: unknown): number | null =>
    value && typeof (value as { toMillis?: unknown }).toMillis === "function" ? (value as { toMillis: () => number }).toMillis() : null;

  // Reads go through the server so the board does not depend on client Firestore rules being deployed.
  app.get("/api/community/posts", async (req, res) => {
    const uid = await authenticateMember(req, res, false);
    if (!uid) return;
    const { stateCode, cityName, topic } = req.query;
    if (!isStateCode(stateCode) || typeof cityName !== "string" || !isCommunityText(cityName, 100) ||
      (topic !== undefined && topic !== "" && !isCommunityTopic(topic))) {
      return res.status(400).json({ error: "Choose a valid state, city and topic." });
    }
    try {
      let query = db.collection("communityPosts")
        .where("stateCode", "==", stateCode)
        .where("cityName", "==", cityName)
        .where("status", "==", "published");
      if (typeof topic === "string" && topic) query = query.where("topic", "==", topic);
      const snapshot = await query.get();
      const posts = snapshot.docs
        .map((item) => {
          const data = item.data();
          return {
            id: item.id,
            authorUid: data.authorUid,
            author: data.author,
            stateCode: data.stateCode,
            stateName: data.stateName,
            cityName: data.cityName,
            topic: data.topic,
            title: data.title,
            body: data.body,
            replyCount: typeof data.replyCount === "number" ? data.replyCount : 0,
            imageIds: Array.isArray(data.imageIds) ? data.imageIds : [],
            editedAt: toCommunityTimestamp(data.editedAt),
            createdAt: toCommunityTimestamp(data.createdAt)
          };
        })
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .slice(0, 50);
      const { items: withAuthors, authorAvatars } = await resolveCommunityAuthors(posts);
      const withImages = await Promise.all(withAuthors.map(async ({ imageIds, ...post }) => ({ ...post, images: await signedImageUrls(imageIds) })));
      return res.json({ posts: withImages, authorAvatars });
    } catch (error) {
      console.error("[Community] Post listing failed:", error);
      return res.status(500).json({ error: "Posts could not be loaded." });
    }
  });

  app.get("/api/community/posts/:postId/replies", async (req, res) => {
    const uid = await authenticateMember(req, res, false);
    if (!uid) return;
    const { postId } = req.params;
    if (!isValidMemberUid(postId)) return res.status(400).json({ error: "Invalid post." });
    try {
      const postRef = db.collection("communityPosts").doc(postId);
      const postSnapshot = await postRef.get();
      if (!postSnapshot.exists || postSnapshot.data()?.status !== "published") {
        return res.status(404).json({ error: "This post is no longer available." });
      }
      const snapshot = await postRef.collection("replies").get();
      const replies = (await Promise.all(snapshot.docs
        .map((item) => {
          const data = item.data();
          return {
            id: item.id,
            authorUid: data.authorUid,
            author: data.author,
            body: data.body,
            imageIds: Array.isArray(data.imageIds) ? data.imageIds : [],
            parentReplyId: typeof data.parentReplyId === "string" ? data.parentReplyId : null,
            depth: typeof data.depth === "number" ? data.depth : 0,
            editedAt: toCommunityTimestamp(data.editedAt),
            createdAt: toCommunityTimestamp(data.createdAt)
          };
        })
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        .slice(0, 300)
        .map(async ({ imageIds, ...reply }) => ({ ...reply, images: await signedImageUrls(imageIds) }))));
      const { items: withAuthors, authorAvatars } = await resolveCommunityAuthors(replies);
      return res.json({ replies: withAuthors, authorAvatars });
    } catch (error) {
      console.error("[Community] Reply listing failed:", error);
      return res.status(500).json({ error: "Replies could not be loaded." });
    }
  });

  app.post("/api/community/posts", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { stateCode, cityName, topic, title, body, imageIds, requestId } = req.body ?? {};
    if (!isStateCode(stateCode) || !isCommunityText(cityName, 100) || !isCommunityTopic(topic) ||
      !isCommunityText(title, 120) || !isCommunityText(body, 3000)) {
      return res.status(400).json({ error: "Choose a valid location and topic, and provide a title and post." });
    }
    const attachedImageIds: string[] = Array.isArray(imageIds) ? imageIds : [];
    if (attachedImageIds.length > COMMUNITY_MAX_IMAGES_PER_POST || !attachedImageIds.every(isValidMemberUid) ||
      new Set(attachedImageIds).size !== attachedImageIds.length) {
      return res.status(400).json({ error: `Attach up to ${COMMUNITY_MAX_IMAGES_PER_POST} images.` });
    }

    try {
      const [member, states, cities] = await Promise.all([
        getCommunityMember(uid, res),
        getCommunityStates(),
        getCommunityCities(stateCode)
      ]);
      if (!member) return;
      const state = states.find((item) => item.code === stateCode);
      const verifiedCity = cities.find((city) => city.toLocaleLowerCase() === cityName.trim().toLocaleLowerCase());
      if (!state || !verifiedCity) {
        return res.status(400).json({ error: "The selected city does not belong to the selected state." });
      }
      const keyId = requestKeyId(uid, requestId);
      const postRef = (keyId ? db.collection("communityPosts").doc(keyId) : db.collection("communityPosts").doc());
      await db.runTransaction(async (transaction) => {
        if (keyId && (await transaction.get(postRef)).exists) return;
        const imageRefs = attachedImageIds.map((id) => db.collection("communityImages").doc(id));
        const imageSnapshots = imageRefs.length ? await transaction.getAll(...imageRefs) : [];
        imageSnapshots.forEach((snapshot) => {
          const data = snapshot.data();
          if (!snapshot.exists || data?.ownerUid !== uid || data?.status !== "pending" || (data?.target ?? "post") !== "post") throw new Error("IMAGE_NOT_AVAILABLE");
        });
        transaction.create(postRef, {
          authorUid: uid,
          author: member,
          stateCode,
          stateName: state.name,
          cityName: verifiedCity,
          topic,
          title: title.trim(),
          body: body.trim(),
          imageIds: attachedImageIds,
          status: "published",
          replyCount: 0,
          createdAt: FieldValue.serverTimestamp()
        });
        imageRefs.forEach((ref) => transaction.update(ref, { status: "attached", postId: postRef.id }));
      });
      return res.status(201).json({ postId: postRef.id });
    } catch (error) {
      if (error instanceof Error && error.message === "IMAGE_NOT_AVAILABLE") {
        return res.status(400).json({ error: "One of the attached images is unavailable. Remove it and try again." });
      }
      console.error("[Community] Post creation failed:", error);
      return res.status(500).json({ error: "Could not publish the post." });
    }
  });

  app.patch("/api/community/posts/:postId", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { postId } = req.params;
    const { title, body, removeImageIds, addImageIds } = req.body ?? {};
    const removals: string[] = Array.isArray(removeImageIds) ? removeImageIds : [];
    const additions = parseImageIds(addImageIds);
    if (!isValidMemberUid(postId) || !isCommunityText(title, 120) || !isCommunityText(body, 3000) || !removals.every(isValidMemberUid) || !additions) {
      return res.status(400).json({ error: "Provide a valid title and post." });
    }
    try {
      const postRef = db.collection("communityPosts").doc(postId);
      let removed: string[] = [];
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(postRef);
        const post = snapshot.data();
        if (!snapshot.exists || post?.status !== "published") throw new Error("POST_NOT_AVAILABLE");
        if (post.authorUid !== uid) throw new Error("NOT_OWNER");
        const current: string[] = Array.isArray(post.imageIds) ? post.imageIds : [];
        removed = removals.filter((id) => current.includes(id));
        const kept = current.filter((id) => !removed.includes(id));
        if ((additions.length > 0 && kept.length + additions.length > COMMUNITY_MAX_IMAGES_PER_POST) || additions.some((id) => current.includes(id))) throw new Error("TOO_MANY_IMAGES");
        const addedRefs = await readPendingImageRefs(transaction, uid, additions, "post");
        transaction.update(postRef, {
          title: title.trim(),
          body: body.trim(),
          imageIds: [...kept, ...additions],
          editedAt: FieldValue.serverTimestamp()
        });
        addedRefs.forEach((ref) => transaction.update(ref, { status: "attached", postId }));
      });
      await deleteCommunityImages(removed);
      return res.json({ updated: true });
    } catch (error) {
      if (error instanceof Error && error.message === "POST_NOT_AVAILABLE") return res.status(404).json({ error: "This post is no longer available." });
      if (error instanceof Error && error.message === "NOT_OWNER") return res.status(403).json({ error: "You can only edit your own posts." });
      if (error instanceof Error && error.message === "TOO_MANY_IMAGES") return res.status(400).json({ error: `A post can have up to ${COMMUNITY_MAX_IMAGES_PER_POST} images.` });
      if (error instanceof Error && error.message === "IMAGE_NOT_AVAILABLE") return res.status(400).json({ error: "One of the attached images is unavailable. Remove it and try again." });
      console.error("[Community] Post edit failed:", error);
      return res.status(500).json({ error: "Could not save your changes." });
    }
  });

  app.delete("/api/community/posts/:postId", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { postId } = req.params;
    if (!isValidMemberUid(postId)) return res.status(400).json({ error: "Invalid post." });
    try {
      const postRef = db.collection("communityPosts").doc(postId);
      const snapshot = await postRef.get();
      const post = snapshot.data();
      if (!snapshot.exists) return res.status(404).json({ error: "This post is no longer available." });
      if (post?.authorUid !== uid) return res.status(403).json({ error: "You can only delete your own posts." });
      // Hide first so a partial cleanup can never leave a visible half-deleted post.
      await postRef.update({ status: "deleted" });
      await deleteCommunityImages(post.imageIds);
      const replySnapshot = await postRef.collection("replies").get();
      for (const item of replySnapshot.docs) await deleteCommunityImages(item.data().imageIds);
      await db.recursiveDelete(postRef);
      return res.json({ deleted: true });
    } catch (error) {
      console.error("[Community] Post delete failed:", error);
      return res.status(500).json({ error: "Could not delete the post." });
    }
  });

  app.post("/api/community/posts/:postId/replies", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { postId } = req.params;
    const { body, parentReplyId, requestId, imageIds } = req.body ?? {};
    const attachedImageIds = parseImageIds(imageIds);
    if (!isValidMemberUid(postId) || !isCommunityText(body, 2000) || !attachedImageIds ||
      (parentReplyId !== undefined && parentReplyId !== null && !isValidMemberUid(parentReplyId))) {
      return res.status(400).json({ error: "Enter a reply to continue." });
    }

    try {
      if (attachedImageIds.length > 0 && !(await replyImagesEnabled())) return res.status(403).json({ error: REPLY_IMAGES_OFF });
      const member = await getCommunityMember(uid, res);
      if (!member) return;
      const postRef = db.collection("communityPosts").doc(postId);
      const replyKeyId = requestKeyId(uid, requestId);
      const replyRef = (replyKeyId ? postRef.collection("replies").doc(replyKeyId) : postRef.collection("replies").doc());
      await db.runTransaction(async (transaction) => {
        const postSnapshot = await transaction.get(postRef);
        const post = postSnapshot.data();
        if (replyKeyId && (await transaction.get(replyRef)).exists) return;
        if (!postSnapshot.exists || post?.status !== "published") {
          throw new Error("POST_NOT_AVAILABLE");
        }
        let depth = 0;
        if (typeof parentReplyId === "string") {
          const parentSnapshot = await transaction.get(postRef.collection("replies").doc(parentReplyId));
          if (!parentSnapshot.exists) throw new Error("PARENT_NOT_AVAILABLE");
          depth = Math.min((typeof parentSnapshot.data()?.depth === "number" ? parentSnapshot.data()!.depth : 0) + 1, COMMUNITY_MAX_REPLY_DEPTH);
        }
        const imageRefs = await readPendingImageRefs(transaction, uid, attachedImageIds, "reply");
        transaction.create(replyRef, {
          authorUid: uid,
          author: member,
          body: body.trim(),
          imageIds: attachedImageIds,
          parentReplyId: typeof parentReplyId === "string" ? parentReplyId : null,
          depth,
          stateCode: post?.stateCode,
          cityName: post?.cityName,
          topic: post?.topic,
          createdAt: FieldValue.serverTimestamp()
        });
        imageRefs.forEach((ref) => transaction.update(ref, { status: "attached", postId, replyId: replyRef.id }));
        transaction.update(postRef, { replyCount: FieldValue.increment(1) });
      });
      return res.status(201).json({ replyId: replyRef.id });
    } catch (error) {
      if (error instanceof Error && error.message === "IMAGE_NOT_AVAILABLE") {
        return res.status(400).json({ error: "One of the attached images is unavailable. Remove it and try again." });
      }
      if (error instanceof Error && error.message === "POST_NOT_AVAILABLE") {
        return res.status(404).json({ error: "This post is no longer available." });
      }
      if (error instanceof Error && error.message === "PARENT_NOT_AVAILABLE") {
        return res.status(404).json({ error: "The reply you are responding to is no longer available." });
      }
      console.error("[Community] Reply creation failed:", error);
      return res.status(500).json({ error: "Could not publish the reply." });
    }
  });

  app.patch("/api/community/posts/:postId/replies/:replyId", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { postId, replyId } = req.params;
    const { body, removeImageIds, addImageIds } = req.body ?? {};
    const removals: string[] = Array.isArray(removeImageIds) ? removeImageIds : [];
    const additions = parseImageIds(addImageIds);
    if (!isValidMemberUid(postId) || !isValidMemberUid(replyId) || !isCommunityText(body, 2000) || !removals.every(isValidMemberUid) || !additions) {
      return res.status(400).json({ error: "Enter a reply to continue." });
    }
    try {
      if (additions.length > 0 && !(await replyImagesEnabled())) return res.status(403).json({ error: REPLY_IMAGES_OFF });
      const postRef = db.collection("communityPosts").doc(postId);
      const replyRef = postRef.collection("replies").doc(replyId);
      let removed: string[] = [];
      await db.runTransaction(async (transaction) => {
        const [postSnapshot, replySnapshot] = await Promise.all([transaction.get(postRef), transaction.get(replyRef)]);
        if (!postSnapshot.exists || postSnapshot.data()?.status !== "published" || !replySnapshot.exists) throw new Error("NOT_AVAILABLE");
        const reply = replySnapshot.data();
        if (reply?.authorUid !== uid) throw new Error("NOT_OWNER");
        const current: string[] = Array.isArray(reply.imageIds) ? reply.imageIds : [];
        removed = removals.filter((id) => current.includes(id));
        const kept = current.filter((id) => !removed.includes(id));
        if ((additions.length > 0 && kept.length + additions.length > COMMUNITY_MAX_IMAGES_PER_POST) || additions.some((id) => current.includes(id))) throw new Error("TOO_MANY_IMAGES");
        const addedRefs = await readPendingImageRefs(transaction, uid, additions, "reply");
        transaction.update(replyRef, { body: body.trim(), imageIds: [...kept, ...additions], editedAt: FieldValue.serverTimestamp() });
        addedRefs.forEach((ref) => transaction.update(ref, { status: "attached", postId, replyId }));
      });
      await deleteCommunityImages(removed);
      return res.json({ updated: true });
    } catch (error) {
      if (error instanceof Error && error.message === "TOO_MANY_IMAGES") return res.status(400).json({ error: `A reply can have up to ${COMMUNITY_MAX_IMAGES_PER_POST} images.` });
      if (error instanceof Error && error.message === "IMAGE_NOT_AVAILABLE") return res.status(400).json({ error: "One of the attached images is unavailable. Remove it and try again." });
      if (error instanceof Error && error.message === "NOT_AVAILABLE") return res.status(404).json({ error: "This reply is no longer available." });
      if (error instanceof Error && error.message === "NOT_OWNER") return res.status(403).json({ error: "You can only edit your own replies." });
      console.error("[Community] Reply edit failed:", error);
      return res.status(500).json({ error: "Could not save your changes." });
    }
  });

  // Deleting a reply also removes the replies beneath it so no orphaned branches remain.
  app.delete("/api/community/posts/:postId/replies/:replyId", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { postId, replyId } = req.params;
    if (!isValidMemberUid(postId) || !isValidMemberUid(replyId)) return res.status(400).json({ error: "Invalid reply." });
    try {
      const postRef = db.collection("communityPosts").doc(postId);
      let removedCount = 0;
      let doomedImageIds: string[] = [];
      await db.runTransaction(async (transaction) => {
        const [postSnapshot, all] = await Promise.all([transaction.get(postRef), transaction.get(postRef.collection("replies"))]);
        const target = all.docs.find((item) => item.id === replyId);
        if (!postSnapshot.exists || postSnapshot.data()?.status !== "published" || !target) throw new Error("NOT_AVAILABLE");
        if (target.data().authorUid !== uid) throw new Error("NOT_OWNER");
        const doomed = new Set([replyId]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const item of all.docs) {
            const parent = item.data().parentReplyId;
            if (!doomed.has(item.id) && typeof parent === "string" && doomed.has(parent)) { doomed.add(item.id); grew = true; }
          }
        }
        all.docs.filter((item) => doomed.has(item.id)).forEach((item) => transaction.delete(item.ref));
        removedCount = doomed.size;
        doomedImageIds = all.docs.filter((item) => doomed.has(item.id)).flatMap((item) => Array.isArray(item.data().imageIds) ? item.data().imageIds : []);
        transaction.update(postRef, { replyCount: FieldValue.increment(-doomed.size) });
      });
      await deleteCommunityImages(doomedImageIds);
      return res.json({ deleted: true, removedCount });
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_AVAILABLE") return res.status(404).json({ error: "This reply is no longer available." });
      if (error instanceof Error && error.message === "NOT_OWNER") return res.status(403).json({ error: "You can only delete your own replies." });
      console.error("[Community] Reply delete failed:", error);
      return res.status(500).json({ error: "Could not delete the reply." });
    }
  });

  app.post("/api/community/reports", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const input = validateReportInput(req.body);
    if (!input.ok) return res.status(400).json({ error: input.error });
    const { postId, replyId, reason, details } = input.value;
    const targetLabel = replyId ? "reply" : "post";

    try {
      const member = await getCommunityMember(uid, res);
      if (!member) return;
      const postRef = db.collection("communityPosts").doc(postId);
      const targetRef = replyId ? postRef.collection("replies").doc(replyId) : postRef;
      const [postSnapshot, targetSnapshot] = await Promise.all([postRef.get(), targetRef.get()]);
      if (!postSnapshot.exists || postSnapshot.data()?.status !== "published" || !targetSnapshot.exists) {
        return res.status(404).json({ error: "The reported content is no longer available." });
      }
      const postAuthorUid = postSnapshot.data()?.authorUid;
      const targetAuthorUid = targetSnapshot.data()?.authorUid;
      if (targetAuthorUid === uid) return res.status(400).json({ error: `You can't report your own ${targetLabel}.` });
      // Deterministic ID: create() fails if this member already reported the same post or reply.
      const reportRef = db.collection("communityReports").doc(crypto.createHash("sha256").update(reportKeySource(uid, postId, replyId)).digest("hex").slice(0, 40));
      try {
        await reportRef.create({
          reporterUid: uid,
          postId,
          ...(replyId ? { replyId } : {}),
          targetType: targetLabel,
          postAuthorUid: typeof postAuthorUid === "string" ? postAuthorUid : null,
          targetAuthorUid: typeof targetAuthorUid === "string" ? targetAuthorUid : null,
          reason,
          ...(details ? { details } : {}),
          status: "open",
          createdAt: FieldValue.serverTimestamp()
        });
      } catch (error) {
        const code = (error as { code?: unknown })?.code;
        if (code === 6 || code === "already-exists") {
          return res.status(409).json({ error: `You've already reported this ${targetLabel}. Our moderators will review it.` });
        }
        throw error;
      }
      return res.status(201).json({ reportId: reportRef.id });
    } catch (error) {
      console.error("[Community] Report submission failed:", error);
      return res.status(500).json({ error: "Could not submit the report." });
    }
  });

  const ZODIAC_SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const VISIBILITY_KEYS = ["avatar", "bio", "spiritualInterests", "zodiac", "readerStatus", "rank", "clout", "liveStatus"] as const;
  // Existing public details stay visible until a member hides them; the optional zodiac sign is hidden until chosen.
  function normalizeProfileSettings(raw: any, allVisible = false) {
    const stored = raw && typeof raw === "object" && raw.visibility && typeof raw.visibility === "object" ? raw.visibility : {};
    const visibility = Object.fromEntries(VISIBILITY_KEYS.map((key) => [key, allVisible ? true : typeof stored[key] === "boolean" ? stored[key] : key !== "zodiac" && key !== "clout"])) as Record<(typeof VISIBILITY_KEYS)[number], boolean>;
    const zodiacSign = typeof raw?.zodiacSign === "string" && ZODIAC_SIGNS.includes(raw.zodiacSign) ? raw.zodiacSign : "";
    return { zodiacSign, visibility };
  }

  app.get("/api/members/me/public-settings", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      return res.json(normalizeProfileSettings((await db.collection("memberPublicSettings").doc(uid).get()).data()));
    } catch (error) {
      console.error("[Members] Public settings read failed:", error);
      return res.status(500).json({ error: "Could not load profile privacy settings" });
    }
  });

  app.put("/api/members/me/public-settings", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const body = req.body;
    const zodiacSign = body?.zodiacSign ?? "";
    if (typeof zodiacSign !== "string" || (zodiacSign !== "" && !ZODIAC_SIGNS.includes(zodiacSign))) return res.status(400).json({ error: "Choose a valid zodiac sign." });
    const incoming = body?.visibility;
    if (!incoming || typeof incoming !== "object" || VISIBILITY_KEYS.some((key) => typeof incoming[key] !== "boolean")) return res.status(400).json({ error: "Invalid privacy settings." });
    try {
      const settings = { zodiacSign, visibility: Object.fromEntries(VISIBILITY_KEYS.map((key) => [key, incoming[key]])), updatedAt: new Date().toISOString() };
      await db.collection("memberPublicSettings").doc(uid).set(settings);
      return res.json(normalizeProfileSettings(settings));
    } catch (error) {
      console.error("[Members] Public settings save failed:", error);
      return res.status(500).json({ error: "Could not save profile privacy settings" });
    }
  });

  app.get("/api/members/:uid/profile", async (req, res) => {
    const viewerUid = await authenticateMember(req, res);
    if (!viewerUid) return;
    const uid = req.params.uid;
    if (!isValidMemberUid(uid)) return res.status(400).json({ error: "Invalid member profile" });

    try {
      // Members can own many abandoned sessions still marked "live", so read every live-status session rather than an unordered sample.
      const [memberSnapshot, sessionsSnapshot, authCreationTime] = await Promise.all([
        db.collection("users").doc(uid).get(),
        db.collection("liveSessions").where("ownerUid", "==", uid).where("status", "==", "live").get(),
        getAuth().getUser(uid).then((record) => record.metadata.creationTime).catch(() => null)
      ]);
      const member = memberSnapshot.data();
      if (!memberSnapshot.exists || !member || member.suspended === true) {
        return res.status(404).json({ error: "Member profile not found" });
      }

      const rankProgression = authoritativeBroadcasterRank(member);
      const hasBroadcasterRank = rankProgression !== null;
      const cloutPoints = member.cloutPoints;
      const checkedAt = Date.now();
      const isLive = sessionsSnapshot.docs.some((session) => isLiveSessionActive(session.data(), checkedAt, LIVE_DISPLAY_STALE_MS));
      const memberSince = publicMemberSince(authCreationTime, member.createdAt);

      const settings = normalizeProfileSettings((await db.collection("memberPublicSettings").doc(uid).get()).data());
      // ?preview=1 lets owners see exactly what other members receive; without it the owner sees all of their own fields.
      const show = viewerUid === uid && req.query.preview !== "1" ? normalizeProfileSettings(null, true).visibility : settings.visibility;
      const zodiac = settings.zodiacSign;

      return res.json({
        uid,
        displayName: String(member.displayName || "Celestial Member").slice(0, 100),
        avatarUrl: show.avatar ? publicProfileAvatar(member.avatarUrl) : "",
        bio: show.bio && typeof member.bio === "string" ? member.bio.slice(0, 500) : "",
        spiritualInterests: show.spiritualInterests && typeof member.spiritualInterests === "string" ? member.spiritualInterests.slice(0, 500) : "",
        tarotReader: show.readerStatus && member.tarotReader === true,
        ...(show.zodiac && zodiac ? { zodiacSign: zodiac } : {}),
        ...(show.rank && hasBroadcasterRank ? {
          broadcasterRank: rankProgression.currentRank.name
        } : {}),
        ...(show.clout && typeof cloutPoints === "number" && Number.isSafeInteger(cloutPoints) && cloutPoints >= 0 ? { cloutPoints } : {}),
        ...(memberSince ? { createdAt: memberSince } : {}),
        // Omitted when hidden so clients can distinguish "not shared" from "offline".
        ...(show.liveStatus ? { isLive } : {})
      });
    } catch (error) {
      console.error("[Members] Public profile lookup failed:", error);
      return res.status(500).json({ error: "Could not load member profile" });
    }
  });

  const MEMBER_SCAN_SIZE = 100;

  app.get("/api/connections/members", async (req, res) => {
    try {
      const uid = await authenticateMember(req, res);
      if (!uid) return;
      const cursor = req.query.cursor;
      const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100).toLocaleLowerCase() : "";
      if ((cursor !== undefined && !isValidMemberUid(cursor)) || (req.query.search !== undefined && typeof req.query.search !== "string")) {
        return res.status(400).json({ error: "Invalid member search parameters" });
      }

      // Project only the public fields so large profile documents (emails, etc.) are never loaded
      let membersQuery = db.collection("users").orderBy(FieldPath.documentId()).select("displayName", "avatarUrl", "suspended").limit(MEMBER_SCAN_SIZE);
      if (typeof cursor === "string") membersQuery = membersQuery.startAfter(cursor);
      const snapshot = await membersQuery.get();
      const members: { uid: string; displayName: string; avatarUrl: string }[] = [];
      let lastScannedIndex = -1;

      for (let index = 0; index < snapshot.docs.length; index += 1) {
        const item = snapshot.docs[index];
        lastScannedIndex = index;
        const data = item.data();
        const displayName = String(data.displayName || "Celestial Member").slice(0, 100);
        if (item.id === uid || data.suspended === true || (search && !displayName.toLocaleLowerCase().includes(search))) continue;
        members.push({ uid: item.id, displayName, avatarUrl: safeAvatar(data.avatarUrl) });
        if (members.length === 50) break;
      }
      const hasMore = lastScannedIndex < snapshot.docs.length - 1 || snapshot.size === MEMBER_SCAN_SIZE;

      return res.json({
        members,
        nextCursor: hasMore && lastScannedIndex >= 0 ? snapshot.docs[lastScannedIndex].id : null
      });
    } catch (error) {
      console.error("[Connections] Member discovery failed:", error);
      if (!res.headersSent) return res.status(500).json({ error: "Could not load members" });
    }
  });

  app.get("/api/connections", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      const [incomingSnapshot, outgoingSnapshot, connectionsSnapshot] = await Promise.all([
        db.collection("connectionRequests").where("recipientUid", "==", uid).get(),
        db.collection("connectionRequests").where("senderUid", "==", uid).get(),
        db.collection("connections").where("memberUids", "array-contains", uid).get()
      ]);
      const pendingIncoming = incomingSnapshot.docs.filter((item) => item.data().status === "pending");
      const pendingOutgoing = outgoingSnapshot.docs.filter((item) => item.data().status === "pending");
      const otherUids = [...new Set([
        ...pendingIncoming.map((item) => String(item.data().senderUid)),
        ...pendingOutgoing.map((item) => String(item.data().recipientUid)),
        ...connectionsSnapshot.docs.map((item) => {
          const members = item.data().memberUids as string[];
          return members.find((memberUid) => memberUid !== uid) ?? "";
        })
      ].filter(Boolean))];
      const profiles = await Promise.all(otherUids.map(async (otherUid) => [otherUid, await getSafeMember(otherUid)] as const));
      const profileByUid = new Map(profiles);
      const requestItems = (items: typeof pendingIncoming, memberField: "senderUid" | "recipientUid") =>
        items.flatMap((item) => {
          const member = profileByUid.get(String(item.data()[memberField]));
          return member ? [{ id: item.id, member, createdAt: item.data().createdAt ?? null }] : [];
        });
      const accepted = connectionsSnapshot.docs.flatMap((item) => {
        const members = item.data().memberUids as string[];
        const otherUid = members.find((memberUid) => memberUid !== uid);
        const member = otherUid ? profileByUid.get(otherUid) : null;
        return member ? [{ id: item.id, member, createdAt: item.data().createdAt ?? null }] : [];
      });
      return res.json({
        incoming: requestItems(pendingIncoming, "senderUid"),
        outgoing: requestItems(pendingOutgoing, "recipientUid"),
        connections: accepted
      });
    } catch (error) {
      console.error("[Connections] Relationship list failed:", error);
      return res.status(500).json({ error: "Could not load connections" });
    }
  });

  app.post("/api/connections/request", async (req, res) => {
    const senderUid = await authenticateMember(req, res);
    if (!senderUid) return;
    const recipientUid = req.body?.recipientUid;
    if (!isValidMemberUid(recipientUid) || recipientUid === senderUid) {
      return res.status(400).json({ error: "Invalid connection recipient" });
    }
    try {
      const [sender, recipient] = await Promise.all([getSafeMember(senderUid), getSafeMember(recipientUid)]);
      if (!sender) return res.status(403).json({ error: "Your member profile is unavailable" });
      if (!recipient) return res.status(404).json({ error: "Member not found" });

      const requestRef = db.collection("connectionRequests").doc(connectionRequestId(senderUid, recipientUid));
      const reverseRef = db.collection("connectionRequests").doc(connectionRequestId(recipientUid, senderUid));
      const connectionRef = db.collection("connections").doc(connectionId(senderUid, recipientUid));
      await db.runTransaction(async (transaction) => {
        const [requestSnapshot, reverseSnapshot, connectionSnapshot] = await Promise.all([
          transaction.get(requestRef),
          transaction.get(reverseRef),
          transaction.get(connectionRef)
        ]);
        if (connectionSnapshot.exists) throw Object.assign(new Error("You are already connected"), { status: 409 });
        if (reverseSnapshot.exists && reverseSnapshot.data()?.status === "pending") {
          throw Object.assign(new Error("This member has already requested to connect with you"), { status: 409 });
        }
        if (requestSnapshot.exists && requestSnapshot.data()?.status === "pending") {
          throw Object.assign(new Error("Connection request already sent"), { status: 409 });
        }
        if (requestSnapshot.exists && requestSnapshot.data()?.status === "accepted") {
          throw Object.assign(new Error("You are already connected"), { status: 409 });
        }
        transaction.set(requestRef, {
          senderUid,
          recipientUid,
          status: "pending",
          createdAt: new Date().toISOString()
        });
      });
      return res.json({ sent: true });
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: number }).status)
        : 500;
      if (status === 500) console.error("[Connections] Request creation failed:", error);
      return res.status(status).json({ error: error instanceof Error ? error.message : "Could not send connection request" });
    }
  });

  app.post("/api/connections/respond", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { requestId, action } = req.body ?? {};
    if (typeof requestId !== "string" || !/^[a-f0-9]{64}$/.test(requestId) || !["accept", "decline", "cancel"].includes(action)) {
      return res.status(400).json({ error: "Invalid connection action" });
    }
    try {
      const requestRef = db.collection("connectionRequests").doc(requestId);
      await db.runTransaction(async (transaction) => {
        const requestSnapshot = await transaction.get(requestRef);
        if (!requestSnapshot.exists || requestSnapshot.data()?.status !== "pending") {
          throw Object.assign(new Error("Connection request is no longer pending"), { status: 409 });
        }
        const request = requestSnapshot.data()!;
        const isRecipientAction = (action === "accept" || action === "decline") && request.recipientUid === uid;
        const isSenderCancel = action === "cancel" && request.senderUid === uid;
        if (!isRecipientAction && !isSenderCancel) {
          throw Object.assign(new Error("You are not allowed to change this request"), { status: 403 });
        }

        if (action === "accept") {
          const connectionRef = db.collection("connections").doc(connectionId(request.senderUid, request.recipientUid));
          const existingConnection = await transaction.get(connectionRef);
          if (existingConnection.exists) {
            throw Object.assign(new Error("You are already connected"), { status: 409 });
          }
          transaction.create(connectionRef, {
            memberUids: [request.senderUid, request.recipientUid].sort(),
            createdAt: FieldValue.serverTimestamp(),
            acceptedRequestId: requestId
          });
        }
        transaction.update(requestRef, {
          status: action === "accept" ? "accepted" : action === "decline" ? "declined" : "cancelled",
          respondedAt: FieldValue.serverTimestamp()
        });
      });
      return res.json({ updated: true });
    } catch (error) {
      const status = typeof error === "object" && error !== null && "status" in error
        ? Number((error as { status: number }).status)
        : 500;
      if (status === 500) console.error("[Connections] Request response failed:", error);
      return res.status(status).json({ error: error instanceof Error ? error.message : "Could not update connection request" });
    }
  });

  // --- API: DAILY HOROSCOPE (proxy + cache; upstream has no CORS) ---
  const HOROSCOPE_SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
  const HOROSCOPE_RECHECK_MS = 30 * 60 * 1000;
  const horoscopeCache = new Map<string, { date: string; horoscope: string; fetchedAt: number }>();

  app.get("/api/horoscope/daily", async (req, res) => {
    const sign = typeof req.query.sign === "string" ? req.query.sign.toLowerCase() : "";
    if (!HOROSCOPE_SIGNS.includes(sign)) {
      return res.status(400).json({ error: "Invalid zodiac sign." });
    }
    const todayUtc = new Date().toISOString().slice(0, 10);
    const cached = horoscopeCache.get(sign);
    if (cached && cached.date === todayUtc && Date.now() - cached.fetchedAt < HOROSCOPE_RECHECK_MS) {
      return res.json({ sign, date: cached.date, horoscope: cached.horoscope, cached: true });
    }
    try {
      const upstream = await fetch(`https://freehoroscopeapi.com/api/v1/get-horoscope/daily?sign=${encodeURIComponent(sign)}`, { signal: AbortSignal.timeout(8000) });
      if (!upstream.ok) throw new Error(`Upstream status ${upstream.status}`);
      const reading = readDailyHoroscope(await upstream.json(), sign, todayUtc);
      if (!reading) throw new Error("Upstream returned a missing, wrong-sign, or non-current reading");
      const { date, horoscope } = reading;
      horoscopeCache.set(sign, { date, horoscope, fetchedAt: Date.now() });
      return res.json({ sign, date, horoscope, cached: false });
    } catch (err: any) {
      console.error("[Horoscope API] fetch failed:", err.message);
      return res.status(502).json({ error: "Could not load today's horoscope. Please try again shortly." });
    }
  });

  // --- API: CREATE CHECKOUT SESSION (GEMS PURCHASE) ---
  app.post("/api/create-gem-checkout-session", async (req, res) => {
    const { packageId } = req.body || {};

    if (!isStripeConfigured && !isSimulationAllowed(req.hostname)) {
      console.error("[Create Checkout Session] Stripe is not configured; refusing to create checkout.");
      return res.status(503).json({ error: "Payments are not configured on this server." });
    }

    const userId = await authenticateMember(req, res);
    if (!userId) return;

    // Trusted package definition only; client cost/gemsAmount are ignored.
    const pkg = typeof packageId === "string" && Object.prototype.hasOwnProperty.call(GEM_PACKAGES, packageId)
      ? GEM_PACKAGES[packageId]
      : undefined;
    if (!pkg) {
      return res.status(400).json({ error: "Invalid gem package." });
    }

    try {
      const transactionId = "tx_sess_" + crypto.randomUUID();

      if (isStripeConfigured) {
        const baseUrl = (process.env.APP_URL || (req.headers.origin as string) || "").replace(/\/$/, "");
        if (!baseUrl) {
          return res.status(500).json({ error: "Application URL is not configured." });
        }
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Celestial Gems - ${pkg.gems} Pack`,
                  description: `Unlock animated virtual gifts, tipping, and deep reading guides inside Celestial Sanctuary.`,
                },
                unit_amount: Math.round(pkg.cost * 100),
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          client_reference_id: userId,
          success_url: `${baseUrl}/dashboard?payment=success&tx=${transactionId}`,
          cancel_url: `${baseUrl}/dashboard?payment=cancel`,
          metadata: {
            userId,
            packageId,
            gemsAmount: pkg.gems.toString(),
            cost: pkg.cost.toString(),
            type: "gem_purchase",
            transactionId,
          },
        });

        return res.json({ url: session.url, sessionId: session.id, simulated: false });
      }

      // Local development simulator (guarded above by isSimulationAllowed)
      const simulatedUrl = `/stripe-sandbox-checkout?session_id=${transactionId}&userId=${userId}&gemsAmount=${pkg.gems}&cost=${pkg.cost}&packageId=${packageId}`;
      return res.json({ url: simulatedUrl, sessionId: transactionId, simulated: true });
    } catch (error: any) {
      console.error("[Create Checkout Session Error]:", error);
      return res.status(500).json({ error: "Could not create checkout session." });
    }
  });

  // --- STRIPE CONNECT: broadcasters link a payout account; the account id is stored server-side only ---
  const stripeBaseUrl = (req: express.Request) => {
    const envUrl = process.env.APP_URL;
    if (envUrl) return envUrl.replace(/\/$/, "");
    const origin = req.headers.origin as string;
    if (origin) return origin.replace(/\/$/, "");
    const host = req.get("host");
    if (host) return `${req.protocol || "http"}://${host}`.replace(/\/$/, "");
    return "";
  };

  // Ids created by the old local simulator (acct_sim_*) are not real Stripe accounts.
  const isRealConnectId = (id: unknown): id is string => typeof id === "string" && id.startsWith("acct_") && !id.startsWith("acct_sim_");

  const retrieveConnectReadiness = async (accountId: string) => {
    try {
      const account = await stripe.v2.core.accounts.retrieve(accountId, {
        include: ["configuration.recipient"],
      });
      return evaluateConnectReadiness(account);
    } catch (error: any) {
      if (error?.code !== "resource_missing") throw error;
      const account = await stripe.accounts.retrieve(accountId);
      return evaluateConnectReadiness(account);
    }
  };

  const createConnectOnboardingLink = async (accountId: string, baseUrl: string) => {
    const refreshUrl = `${baseUrl}/dashboard?connect=refresh`;
    const returnUrl = `${baseUrl}/dashboard?connect=return`;
    let isV2Account = true;
    try {
      await stripe.v2.core.accounts.retrieve(accountId, {
        include: ["configuration.recipient"],
      });
    } catch (error: any) {
      if (error?.code !== "resource_missing") throw error;
      isV2Account = false;
    }
    if (isV2Account) {
      const accountLink = await stripe.v2.core.accountLinks.create({
        account: accountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["recipient", "merchant"],
            refresh_url: refreshUrl,
            return_url: returnUrl,
          },
        },
      });
      return accountLink.url;
    }
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });
    return accountLink.url;
  };

  const loadConnectReadiness = async (uid: string) => {
    const userRef = db.collection("users").doc(uid);
    const accountId = (await userRef.get()).data()?.stripeConnectId;
    if (!isRealConnectId(accountId)) {
      return { linked: false, accountId: null as string | null, ...evaluateConnectReadiness(null) };
    }
    try {
      const readiness = await retrieveConnectReadiness(accountId);
      const status = readiness.ready ? "active" : "pending";
      await userRef.update({ stripeConnectStatus: status, updatedAt: new Date().toISOString() });
      return { linked: true, accountId, ...readiness };
    } catch (retrieveError: any) {
      if (retrieveError?.code === "resource_missing") {
        await userRef.update({ stripeConnectId: null, stripeConnectStatus: "unlinked", updatedAt: new Date().toISOString() });
        return { linked: false, accountId: null as string | null, ...evaluateConnectReadiness(null) };
      }
      throw retrieveError;
    }
  };

  const createConnectedAccount = async (uid: string, email?: string): Promise<string> => {
    const contactEmail = email || `${uid}@mysticmentor.app`;
    try {
      // Stripe mandates Accounts v2 for new Connect integrations unless v1 policy is enabled in dashboard
      const v2Account = await stripe.v2.core.accounts.create({
        contact_email: contactEmail,
        identity: { country: "US" },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: {
                stripe_transfers: { requested: true }
              }
            }
          },
          merchant: {
            capabilities: {
              card_payments: { requested: true }
            }
          }
        },
        dashboard: "express",
        defaults: {
          responsibilities: {
            losses_collector: "application",
            fees_collector: "application"
          }
        },
        metadata: { mysticmentorUid: uid }
      });
      return v2Account.id;
    } catch (v2Err: any) {
      console.warn("[Stripe Connect v2 fallback]:", v2Err?.message);
      const v1Account = await stripe.accounts.create({
        type: "express",
        ...(email ? { email } : {}),
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
        metadata: { mysticmentorUid: uid },
      }, { idempotencyKey: `connect-account-${uid}` });
      return v1Account.id;
    }
  };

  // --- API: CREATE CONNECT ONBOARDING LINK (authenticated; the account is always the caller's own) ---
  app.post("/api/create-connect-onboarding", async (req, res) => {
    if (!isStripeConfigured) return res.status(503).json({ error: "Payments are not configured on this server." });
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const refreshOnly = req.body?.refreshOnly === true;
    try {
      // Any signed-in, non-suspended member may link their own payout account; Tarot authorization is a separate check.
      const memberSnap = await db.collection("users").doc(uid).get();
      if (!memberSnap.exists || memberSnap.data()?.suspended === true) {
        return res.status(403).json({ error: "This account cannot link a payout account." });
      }
      const baseUrl = stripeBaseUrl(req);
      if (!baseUrl) return res.status(500).json({ error: "Application URL is not configured." });

      const userRef = db.collection("users").doc(uid);
      let accountId = (await userRef.get()).data()?.stripeConnectId;
      if (!isRealConnectId(accountId)) {
        if (refreshOnly) {
          return res.status(409).json({ error: "No existing Stripe payout account is linked. A fresh onboarding link cannot be requested." });
        }
        const authUser = await getAuth().getUser(uid).catch(() => null);
        const email = authUser?.email || (memberSnap.data()?.email as string) || undefined;
        accountId = await createConnectedAccount(uid, email);
        await userRef.update({ stripeConnectId: accountId, stripeConnectStatus: "pending", updatedAt: new Date().toISOString() });
      }

      let accountLinkUrl: string;
      try {
        accountLinkUrl = await createConnectOnboardingLink(accountId, baseUrl);
      } catch (linkError: any) {
        if (linkError?.code === "resource_missing") {
          if (refreshOnly) {
            return res.status(409).json({ error: "The existing Stripe payout account is unavailable on this server. A fresh onboarding link cannot be requested." });
          }
          const authUser = await getAuth().getUser(uid).catch(() => null);
          const email = authUser?.email || (memberSnap.data()?.email as string) || undefined;
          accountId = await createConnectedAccount(uid, email);
          await userRef.update({ stripeConnectId: accountId, stripeConnectStatus: "pending", updatedAt: new Date().toISOString() });
          accountLinkUrl = await createConnectOnboardingLink(accountId, baseUrl);
        } else {
          throw linkError;
        }
      }
      return res.json({ url: accountLinkUrl });
    } catch (error: any) {
      console.error("[Stripe Connect Error]:", error?.message);
      return res.status(500).json({ error: error?.message || "Could not start Stripe onboarding." });
    }
  });

  // --- API: CONNECT STATUS (the caller's own payout-account readiness, read live from Stripe) ---
  app.get("/api/connect/status", async (req, res) => {
    if (!isStripeConfigured) return res.status(503).json({ error: "Payments are not configured on this server." });
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      const { linked, ready, reason } = await loadConnectReadiness(uid);
      return res.json({ linked, ready, ...(ready ? {} : { reason }) });
    } catch (error: any) {
      console.error("[Stripe Connect Status Error]:", error?.message);
      return res.status(500).json({ error: "Could not read payout account status." });
    }
  });

  // Resolves the broadcaster from a genuinely live session. The recipient is never taken from the client.
  const resolveTipTarget = async (sessionId: unknown, senderUid: string) => {
    if (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) return { status: 400, error: "Invalid live session." } as const;
    const sessionSnap = await db.collection("liveSessions").doc(sessionId).get();
    const session = sessionSnap.data();
    if (!session || !isLiveSessionActive(session, Date.now(), LIVE_PAYMENT_STALE_MS) || typeof session.ownerUid !== "string") return { status: 404, error: "This broadcast is not live." } as const;
    if (session.ownerUid === senderUid) return { status: 400, error: "You cannot tip yourself." } as const;
    const recipientSnap = await db.collection("users").doc(session.ownerUid).get();
    const recipient = recipientSnap.data();
    if (!recipient || recipient.suspended === true) return { status: 404, error: "This broadcast is not live." } as const;
    return { status: 200, recipientUid: session.ownerUid as string, recipientName: String(recipient.displayName || "Celestial Reader").slice(0, 80), accountId: isRealConnectId(recipient.stripeConnectId) ? recipient.stripeConnectId : "" } as const;
  };

  // --- API: ARE PAID TIPS ENABLED FOR THIS LIVE BROADCAST? (readiness read live from Stripe) ---
  app.get("/api/live/tip-status", async (req, res) => {
    if (!isStripeConfigured) return res.json({ enabled: false, reason: "Payments are not configured yet." });
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      const target = await resolveTipTarget(req.query.sessionId, uid);
      if (target.status !== 200) return res.status(target.status).json({ error: target.error });
      const readiness = target.accountId ? await retrieveConnectReadiness(target.accountId) : evaluateConnectReadiness(null);
      return res.json({ enabled: readiness.ready, ...(readiness.ready ? {} : { reason: "This broadcaster has not finished payout setup, so paid tips are unavailable." }) });
    } catch (error: any) {
      console.error("[Tip Status Error]:", error?.message);
      return res.json({ enabled: false, reason: "Paid tips are temporarily unavailable." });
    }
  });

  // --- API: LIVESTREAM TIP CHECKOUT (Stripe Connect destination charge; 20% platform fee) ---
  app.post("/api/live/tip-checkout", async (req, res) => {
    if (!isStripeConfigured) return res.status(503).json({ error: "Payments are not configured on this server." });
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const amountCents = parseTipAmountCents(req.body?.amountCents);
    if (amountCents === null) return res.status(400).json({ error: "Tip must be a whole amount between $1.00 and $500.00." });
    try {
      const target = await resolveTipTarget(req.body?.sessionId, uid);
      if (target.status !== 200) return res.status(target.status).json({ error: target.error });
      const baseUrl = stripeBaseUrl(req);
      if (!baseUrl) return res.status(500).json({ error: "Application URL is not configured." });

      const readiness = target.accountId ? await retrieveConnectReadiness(target.accountId) : evaluateConnectReadiness(null);
      if (!readiness.ready) return res.status(409).json({ error: "This broadcaster has not finished payout setup, so paid tips are unavailable." });

      const { platformFeeCents, recipientShareCents } = calculateTipSplit(amountCents);
      const tipId = crypto.randomUUID().replace(/-/g, "");
      const tipRef = db.collection("liveTips").doc(tipId);
      await tipRef.set({
        tipId, senderUid: uid, recipientUid: target.recipientUid, sessionId: req.body.sessionId, destinationAccount: target.accountId,
        amountCents, platformFeeCents, recipientShareCents, currency: "usd", status: "pending", createdAt: new Date().toISOString(),
      });
      const metadata = { type: "live_tip", tipId, senderUid: uid, recipientUid: target.recipientUid };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: uid,
        line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: amountCents, product_data: { name: `Tip for ${target.recipientName}`, description: "Livestream tip" } } }],
        payment_intent_data: { application_fee_amount: platformFeeCents, transfer_data: { destination: target.accountId }, metadata },
        metadata,
        success_url: `${baseUrl}/?tip=success`,
        cancel_url: `${baseUrl}/?tip=cancel`,
      }, { idempotencyKey: `live-tip-${tipId}` });
      await tipRef.update({ stripeSessionId: session.id });
      return res.json({ url: session.url });
    } catch (error: any) {
      console.error("[Live Tip Checkout Error]:", error?.message);
      return res.status(500).json({ error: "Could not start tip checkout." });
    }
  });

  // --- API: SPEND GEMS SECURE ENDPOINT ---
  app.post("/api/spend-gems", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const idToken = authHeader.substring(7); // "Bearer " is 7 characters
    if (!idToken) {
      return res.status(401).json({ error: "Missing ID token" });
    }

    const { giftId, recipientId, context, sessionId, requestId } = req.body ?? {};
    if (!giftId || !recipientId) {
      return res.status(400).json({ error: "Missing required parameters: giftId, recipientId" });
    }
    if (giftCostFor(giftId, context === "live") === null) {
      return res.status(400).json({ error: "Invalid gift ID" });
    }

    let decodedToken: DecodedIdToken;
    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch {
      return res.status(401).json({ error: "Invalid ID token" });
    }
    try {
      const result = await spendGemsOnGift(db, {
        senderUid: decodedToken.uid,
        senderIsAnonymous: decodedToken.firebase?.sign_in_provider === "anonymous",
        giftId, recipientId, context, sessionId, requestId
      });
      return res.json(result);
    } catch (error) {
      if (error instanceof GiftSpendError) return res.status(error.status).json({ error: error.message });
      console.error("[Spend Gems Error]:", error);
      return res.status(500).json({ error: "Gift could not be confirmed. Retry with the same request ID." });
    }
  });

  // Authoritative broadcaster rank for any signed-in viewer: computed from users/{uid}.lifetimeGemsReceived only.
  app.get("/api/broadcasters/:uid/rank", async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ") || authHeader.length <= 7) return res.status(401).json({ error: "Missing or invalid authorization header" });
    try {
      await getAuth().verifyIdToken(authHeader.substring(7));
    } catch {
      return res.status(401).json({ error: "Invalid ID token" });
    }
    const uid = req.params.uid;
    if (!isValidMemberUid(uid)) return res.status(400).json({ error: "Invalid broadcaster" });
    try {
      const snapshot = await db.collection("users").doc(uid).get();
      if (!snapshot.exists) return res.status(404).json({ error: "Broadcaster not found" });
      const rank = authoritativeBroadcasterRank(snapshot.data());
      if (!rank) return res.status(409).json({ error: "Broadcaster rank is unavailable" });
      res.setHeader("Cache-Control", "no-store");
      return res.json({ uid, ...rank });
    } catch (error) {
      console.error("[Broadcaster Rank] Lookup failed:", error);
      return res.status(500).json({ error: "Could not load broadcaster rank" });
    }
  });

  // Returns only the authenticated broadcaster's server-recorded live-gift earnings.
  app.get("/api/live/earnings", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      if (!(await getEligibleReader(uid))) {
        return res.status(403).json({ error: "Broadcaster earnings are available to approved readers only." });
      }

      const timeZone = typeof req.query.timeZone === "string" ? req.query.timeZone : "UTC";
      try {
        new Intl.DateTimeFormat("en-CA", { timeZone });
      } catch {
        return res.status(400).json({ error: "Invalid time zone." });
      }

      const [userSnap, transactionsSnap, tipsSnap, pendingTipsSnap] = await Promise.all([
        db.collection("users").doc(uid).get(),
        db.collection("users").doc(uid).collection("transactions").where("type", "==", "live_gift_received").get(),
        db.collection("users").doc(uid).collection("transactions").where("type", "==", "tip_received").get(),
        db.collection("liveTips").where("recipientUid", "==", uid).get(),
      ]);
      const { completed: transactions, totalGemsEarned, todayGemsEarned } = summarizeReceivedGifts(
        transactionsSnap.docs.map((snapshot) => {
          const data = snapshot.data();
          return { id: snapshot.id, status: data.status, gemsAmount: data.gemsAmount, createdAt: data.createdAt, viewerName: data.viewerName };
        }),
        timeZone,
      );
      // Same authoritative total and validation as broadcaster rank; a malformed total is reported as unavailable, not 0.
      const lifetimeGemsEarned = authoritativeBroadcasterRank(userSnap.data())?.lifetimeGemsReceived ?? null;
      const cashTips = { ...summarizeReceivedTips(tipsSnap.docs.map((snapshot) => snapshot.data())), pending: summarizePendingTips(pendingTipsSnap.docs.map((snapshot) => snapshot.data())) };

      return res.json({
        totalGemsEarned,
        todayGemsEarned,
        lifetimeGemsEarned,
        cashTips,
        transactions: transactions.slice(0, 100).map((item) => ({
          id: item.id,
          date: item.createdAt,
          viewerName: String(item.viewerName || "Viewer").slice(0, 100),
          gemsAmount: Number(item.gemsAmount),
          status: "completed",
        })),
      });
    } catch (error: any) {
      console.error("[Live Earnings Error]:", error?.message || error);
      return res.status(500).json({ error: "Could not load broadcaster earnings." });
    }
  });

  // --- API: PROCESS SIMULATED CASH TIP (Direct Transfer Check) ---
  app.post("/api/process-sandbox-tip", async (req, res) => {
    // Development simulator only: never available in production or on public hosts
    if (!isSimulationAllowed(req.hostname)) {
      return res.status(403).json({ error: "Tip simulation is disabled in this environment." });
    }

    const { userId, recipientId, amount } = req.body;

    if (!userId || !recipientId || !amount) {
      return res.status(400).json({ error: "Missing parameters: userId, recipientId, amount" });
    }

    try {
      const txId = "tx_tip_" + Date.now();
      const rawCost = Number(amount);
      
      // Calculate 20% platform commission & 80% recipient share
      const platformFee = Math.round(rawCost * 0.20 * 100) / 100;
      const recipientShare = Math.round(rawCost * 0.80 * 100) / 100;

      // Update Firestore ledgers securely on the server
      const batch = db.batch();

      // Log transaction under Sender's records
      const userTxRef = db.collection("users").doc(userId).collection("transactions").doc(txId);
      batch.set(userTxRef, {
        id: txId,
        userId,
        recipientId,
        type: "tip",
        gemsAmount: 0,
        cashAmount: rawCost,
        platformFee,
        recipientShare,
        description: `Cash tip of $${rawCost} sent to host`,
        createdAt: new Date().toISOString(),
        status: "completed"
      });

      // Log transaction under Recipient's records and credit Clout Points (1 Clout per Dollar)
      const recipientTxRef = db.collection("users").doc(recipientId).collection("transactions").doc(txId);
      batch.set(recipientTxRef, {
        id: txId,
        userId,
        recipientId,
        type: "tip_received",
        gemsAmount: 0,
        cashAmount: rawCost,
        platformFee,
        recipientShare,
        description: `Cash tip of $${rawCost} received from viewer`,
        createdAt: new Date().toISOString(),
        status: "completed"
      });

      // Credit Recipient's non-redeemable Clout Points
      const recipientRef = db.collection("users").doc(recipientId);
      const recipientSnap = await recipientRef.get();
      if (recipientSnap.exists) {
        const currentClout = recipientSnap.data()?.cloutPoints || 0;
        batch.update(recipientRef, {
          cloutPoints: currentClout + Math.floor(rawCost),
          updatedAt: new Date().toISOString()
        });
      }

      // Record in Global Financial Records
      const globalTxRef = db.collection("financial_records").doc(txId);
      batch.set(globalTxRef, {
        id: txId,
        type: "tip",
        senderId: userId,
        recipientId,
        amount: rawCost,
        platformFee,
        recipientShare,
        status: "completed",
        createdAt: new Date().toISOString()
      });

      // Update financial aggregation doc
      const finRef = db.collection("admin_settings").doc("financials");
      const finSnap = await finRef.get();
      if (!finSnap.exists) {
        batch.set(finRef, {
          totalGrossVolume: rawCost,
          totalPlatformRevenue: platformFee,
          totalTransfers: recipientShare,
          purchaseCount: 1,
          updatedAt: new Date().toISOString()
        });
      } else {
        const fData = finSnap.data() || {};
        batch.update(finRef, {
          totalGrossVolume: (fData.totalGrossVolume || 0) + rawCost,
          totalPlatformRevenue: (fData.totalPlatformRevenue || 0) + platformFee,
          totalTransfers: (fData.totalTransfers || 0) + recipientShare,
          purchaseCount: (fData.purchaseCount || 0) + 1,
          updatedAt: new Date().toISOString()
        });
      }

      await batch.commit();
      return res.json({ success: true, txId, platformFee, recipientShare });
    } catch (error: any) {
      console.error("[Tip Process Error]:", error);
      return res.status(500).json({ error: error.message });
    }
  });

  // --- API: POST SIMULATE WEBHOOK SUCCESS (Used by Dev Simulator UI) ---
  app.post("/api/simulate-webhook-success", async (req, res) => {
    // 1. Strict Environment Locking:
    // Reject requests if we are in a production or staging environment.
    // Cloud run deployments run under process.env.NODE_ENV === "production" and are on non-local domains.
    const isProductionOrStaging = isProduction || !isLocalHost(req.hostname);
    if (isProductionOrStaging) {
      return res.status(403).json({ 
        error: "Simulation endpoint is strictly disabled in production and publicly accessible staging environments." 
      });
    }

    // 2. Explicit Development-only Enablement Check:
    // Default the simulation to disabled unless process.env.ENABLE_WEBHOOK_SIMULATION is explicitly set to "true".
    const isSimulationExplicitlyEnabled = process.env.ENABLE_WEBHOOK_SIMULATION === "true";
    if (!isSimulationExplicitlyEnabled) {
      return res.status(403).json({ 
        error: "Simulation endpoint is disabled by default. Set ENABLE_WEBHOOK_SIMULATION=true in local development or test environments to enable." 
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    const idToken = authHeader.substring(7);
    if (!idToken) {
      return res.status(401).json({ error: "Missing ID token" });
    }

    const { session_id, userId, gemsAmount, cost, packageId } = req.body;

    if (!session_id || !userId || !gemsAmount || !cost || !packageId) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    // Never trust client-supplied gemsAmount or cost; retrieve from trusted packages configuration
    const pkg = Object.prototype.hasOwnProperty.call(GEM_PACKAGES, packageId) ? GEM_PACKAGES[packageId as string] : undefined;
    if (!pkg) {
      return res.status(400).json({ error: "Invalid or untrusted package ID" });
    }

    const verifiedGemsAmount = pkg.gems;
    const verifiedCost = pkg.cost;

    try {
      // Securely verify Firebase ID Token
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const authenticatedUid = decodedToken.uid;

      // Ensure the logged-in user can only simulate purchases for their own account
      if (authenticatedUid !== userId) {
        return res.status(403).json({ error: "Forbidden: You can only simulate purchases for your own account" });
      }

      // Simulate Stripe Webhook Payload with verified server-side values
      const mockWebhookEvent = {
        id: "evt_sim_" + crypto.randomUUID(),
        object: "event",
        api_version: "2023-10-16",
        created: Math.floor(Date.now() / 1000),
        type: "checkout.session.completed",
        data: {
          object: {
            id: session_id,
            object: "checkout.session",
            amount_total: Math.round(Number(verifiedCost) * 100),
            currency: "usd",
            payment_status: "paid",
            metadata: {
              userId: authenticatedUid,
              packageId,
              gemsAmount: verifiedGemsAmount.toString(),
              cost: verifiedCost.toString(),
              type: "gem_purchase",
              transactionId: session_id,
            },
          },
        },
      };

      // Trigger Webhook Event logic synchronously
      await processStripeEvent(mockWebhookEvent as any);
      return res.json({ success: true, eventId: mockWebhookEvent.id });
    } catch (error: any) {
      console.error("[Simulate Webhook Error]:", error);
      return res.status(401).json({ error: "Unauthorized access or validation failure" });
    }
  });

  // --- API: READER SCHEDULING (server-only writers; clients never touch these collections) ---
  const ACTIVE_BOOKING_STATUSES = ["confirmed", "pending_payment"];
  const MAX_ACTIVE_BOOKINGS_PER_MEMBER = 10;
  const bookingIdFor = (readerUid: string, startMs: number) =>
    crypto.createHash("sha256").update(`${readerUid}\0${startMs}`).digest("hex");

  // A reader is a member the existing role system approved: an admin, or a verified-email member with tarotReader = true.
  const getEligibleReader = async (uid: string) => {
    const [snapshot, authUser] = await Promise.all([
      db.collection("users").doc(uid).get(),
      getAuth().getUser(uid).catch(() => null)
    ]);
    const data = snapshot.data();
    if (!snapshot.exists || !data || !authUser || data.suspended === true) return null;
    const verified = authUser.emailVerified === true;
    const approved = data.role === "admin" ||
      (authUser.email === "kertisjohnson7@gmail.com" && verified) ||
      (verified && data.tarotReader === true);
    if (!approved) return null;
    return { uid, displayName: String(data.displayName || "Celestial Reader").slice(0, 100), avatarUrl: safeAvatar(data.avatarUrl) };
  };

  const readStoredSchedule = (data: FirebaseFirestore.DocumentData | undefined): ReaderScheduleSettings | null => {
    if (!data) return null;
    const result = validateScheduleSettings(data);
    return "value" in result ? result.value : null;
  };

  const PAYMENT_HOLD_MS = 15 * 60 * 1000;
  // A paid slot is only held while its checkout window is open; confirmed bookings always hold.
  const holdsSlot = (data: FirebaseFirestore.DocumentData, now = Date.now()) =>
    data.status === "confirmed" || (data.status === "pending_payment" && typeof data.holdExpiresMs === "number" && data.holdExpiresMs > now);

  const publicBooking = (id: string, data: FirebaseFirestore.DocumentData) => ({
    id,
    readerUid: data.readerUid,
    readerName: data.readerName,
    memberUid: data.memberUid,
    memberName: data.memberName,
    startMs: data.startMs,
    endMs: data.endMs,
    durationMinutes: data.durationMinutes,
    readingType: data.readingType,
    priceType: data.priceType,
    priceCents: data.priceCents,
    timeZone: data.timeZone,
    status: data.status === "pending_payment" && !holdsSlot(data) ? "payment_expired" : data.status,
    paymentStatus: data.paymentStatus,
    holdExpiresMs: data.status === "pending_payment" && typeof data.holdExpiresMs === "number" ? data.holdExpiresMs : null
  });

  const activeBookingsFor = async (readerUid: string) => {
    const snapshot = await db.collection("bookings").where("readerUid", "==", readerUid).where("status", "in", ACTIVE_BOOKING_STATUSES).get();
    return snapshot.docs.filter((item) => holdsSlot(item.data())).map((item) => item.data() as { startMs: number; endMs: number });
  };

  const memberNameFor = async (uid: string) => {
    const data = (await db.collection("users").doc(uid).get()).data();
    return String(data?.displayName || "Celestial Member").slice(0, 100);
  };

  app.get("/api/scheduling/my-settings", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      const reader = await getEligibleReader(uid);
      if (!reader) return res.json({ eligible: false, settings: null });
      const snapshot = await db.collection("readerSchedules").doc(uid).get();
      return res.json({ eligible: true, settings: readStoredSchedule(snapshot.data()) });
    } catch (error) {
      console.error("[Scheduling] Settings lookup failed:", error);
      return res.status(500).json({ error: "Could not load your scheduling settings." });
    }
  });

  app.put("/api/scheduling/my-settings", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      if (!(await getEligibleReader(uid))) return res.status(403).json({ error: "Only approved readers can publish a schedule." });
      const result = validateScheduleSettings(req.body);
      if ("error" in result) return res.status(400).json({ error: result.error });
      await db.collection("readerSchedules").doc(uid).set({ ...result.value, readerUid: uid, updatedAt: FieldValue.serverTimestamp() });
      return res.json({ settings: result.value });
    } catch (error) {
      console.error("[Scheduling] Settings save failed:", error);
      return res.status(500).json({ error: "Could not save your scheduling settings." });
    }
  });

  app.get("/api/scheduling/readers", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      const snapshot = await db.collection("readerSchedules").where("enabled", "==", true).limit(50).get();
      const readers = (await Promise.all(snapshot.docs.map(async (item) => {
        const settings = readStoredSchedule(item.data());
        // Only list readers a client could actually book: enabled, valid, and with at least one open slot.
        if (!settings || !settings.enabled || item.id === uid || generateSlots(settings, Date.now()).length === 0) return null;
        const reader = await getEligibleReader(item.id);
        if (!reader) return null;
        return {
          ...reader,
          readingType: settings.readingType,
          durationMinutes: settings.durationMinutes,
          priceType: settings.priceType,
          priceCents: settings.priceCents,
          timeZone: settings.timeZone
        };
      }))).filter(Boolean);
      return res.json({ readers });
    } catch (error) {
      console.error("[Scheduling] Reader list failed:", error);
      return res.status(500).json({ error: "Could not load readers." });
    }
  });

  app.get("/api/scheduling/readers/:readerUid/slots", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { readerUid } = req.params;
    if (!isValidMemberUid(readerUid)) return res.status(400).json({ error: "Invalid reader." });
    try {
      const reader = await getEligibleReader(readerUid);
      const settings = reader ? readStoredSchedule((await db.collection("readerSchedules").doc(readerUid).get()).data()) : null;
      if (!reader || !settings || !settings.enabled) return res.status(404).json({ error: "This reader is not accepting bookings." });
      const taken = await activeBookingsFor(readerUid);
      const slots = generateSlots(settings, Date.now()).filter((slot) => !taken.some((booking) => overlaps(slot, booking)));
      return res.json({
        reader,
        settings: {
          readingType: settings.readingType,
          durationMinutes: settings.durationMinutes,
          priceType: settings.priceType,
          priceCents: settings.priceCents,
          timeZone: settings.timeZone
        },
        slots
      });
    } catch (error) {
      console.error("[Scheduling] Slot lookup failed:", error);
      return res.status(500).json({ error: "Could not load available times." });
    }
  });

  app.post("/api/scheduling/bookings", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { readerUid, startMs } = req.body ?? {};
    if (!isValidMemberUid(readerUid) || typeof startMs !== "number" || !Number.isSafeInteger(startMs)) {
      return res.status(400).json({ error: "Choose a reader and an available time." });
    }
    if (readerUid === uid) return res.status(400).json({ error: "You cannot book your own reading." });
    try {
      const [reader, member] = await Promise.all([getEligibleReader(readerUid), memberNameFor(uid)]);
      if (!reader) return res.status(404).json({ error: "This reader is not accepting bookings." });
      const bookingRef = db.collection("bookings").doc(bookingIdFor(readerUid, startMs));
      const scheduleRef = db.collection("readerSchedules").doc(readerUid);
      let created: ReturnType<typeof publicBooking> | null = null;
      await db.runTransaction(async (transaction) => {
        const [scheduleSnapshot, existing, readerActive, memberActive] = await Promise.all([
          transaction.get(scheduleRef),
          transaction.get(bookingRef),
          transaction.get(db.collection("bookings").where("readerUid", "==", readerUid).where("status", "in", ACTIVE_BOOKING_STATUSES)),
          transaction.get(db.collection("bookings").where("memberUid", "==", uid).where("status", "in", ACTIVE_BOOKING_STATUSES))
        ]);
        const settings = readStoredSchedule(scheduleSnapshot.data());
        if (!settings || !settings.enabled) throw new Error("NOT_ACCEPTING");
        const now = Date.now();
        const slot = generateSlots(settings, now).find((item) => item.startMs === startMs);
        if (!slot) throw new Error("SLOT_UNAVAILABLE");
        if (existing.exists && holdsSlot(existing.data()!, now)) throw new Error("SLOT_TAKEN");
        if (readerActive.docs.some((item) => item.id !== bookingRef.id && holdsSlot(item.data(), now) && overlaps(slot, item.data() as { startMs: number; endMs: number }))) throw new Error("SLOT_TAKEN");
        if (memberActive.docs.filter((item) => item.data().endMs > now && holdsSlot(item.data(), now)).length >= MAX_ACTIVE_BOOKINGS_PER_MEMBER) throw new Error("TOO_MANY");
        const isFree = settings.priceType === "free";
        const data = {
          readerUid,
          readerName: reader.displayName,
          memberUid: uid,
          memberName: member,
          startMs: slot.startMs,
          endMs: slot.endMs,
          durationMinutes: settings.durationMinutes,
          readingType: settings.readingType,
          priceType: settings.priceType,
          priceCents: settings.priceCents,
          timeZone: settings.timeZone,
          // Paid sessions are held but never confirmed until a verified server-side payment exists.
          status: isFree ? "confirmed" : "pending_payment",
          paymentStatus: isFree ? "free" : "unpaid",
          ...(isFree ? {} : { holdExpiresMs: now + PAYMENT_HOLD_MS }),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        };
        transaction.set(bookingRef, data);
        created = publicBooking(bookingRef.id, data);
      });
      return res.status(201).json({ booking: created });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "NOT_ACCEPTING") return res.status(404).json({ error: "This reader is not accepting bookings." });
      if (code === "SLOT_UNAVAILABLE") return res.status(409).json({ error: "That time is no longer offered. Please choose another." });
      if (code === "SLOT_TAKEN") return res.status(409).json({ error: "That time was just booked. Please choose another." });
      if (code === "TOO_MANY") return res.status(429).json({ error: "You have too many upcoming appointments. Cancel one before booking another." });
      console.error("[Scheduling] Booking failed:", error);
      return res.status(500).json({ error: "Could not create the booking." });
    }
  });

  app.get("/api/scheduling/bookings", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const load = async (field: "memberUid" | "readerUid") => (await db.collection("bookings").where(field, "==", uid).limit(500).get()).docs
        .filter((item) => item.data().endMs > cutoff)
        .sort((a, b) => a.data().startMs - b.data().startMs)
        .map((item) => publicBooking(item.id, item.data()));
      const [asMember, asReader] = await Promise.all([load("memberUid"), load("readerUid")]);
      return res.json({ asMember, asReader });
    } catch (error) {
      console.error("[Scheduling] Booking list failed:", error);
      return res.status(500).json({ error: "Could not load appointments." });
    }
  });

  app.post("/api/scheduling/bookings/:bookingId/cancel", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { bookingId } = req.params;
    if (!/^[a-f0-9]{64}$/.test(bookingId)) return res.status(400).json({ error: "Invalid appointment." });
    try {
      const bookingRef = db.collection("bookings").doc(bookingId);
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(bookingRef);
        const data = snapshot.data();
        if (!data || (data.memberUid !== uid && data.readerUid !== uid)) throw new Error("NOT_FOUND");
        if (!ACTIVE_BOOKING_STATUSES.includes(data.status) || data.startMs <= Date.now()) throw new Error("NOT_CANCELLABLE");
        transaction.update(bookingRef, {
          status: data.memberUid === uid ? "cancelled_by_member" : "cancelled_by_reader",
          cancelledAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      });
      return res.json({ cancelled: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "NOT_FOUND") return res.status(404).json({ error: "Appointment not found." });
      if (code === "NOT_CANCELLABLE") return res.status(409).json({ error: "This appointment can no longer be cancelled." });
      console.error("[Scheduling] Cancellation failed:", error);
      return res.status(500).json({ error: "Could not cancel the appointment." });
    }
  });

  const getBookingForParticipant = async (bookingId: string, uid: string) => {
    const snapshot = await db.collection("bookings").doc(bookingId).get();
    const data = snapshot.data();
    if (!snapshot.exists || !data || (data.memberUid !== uid && data.readerUid !== uid)) return null;
    return { ref: snapshot.ref, data, role: data.readerUid === uid ? "reader" as const : "member" as const };
  };

  // --- Paid bookings: Stripe Checkout; the booking is confirmed only by the verified webhook. ---
  app.post("/api/scheduling/bookings/:bookingId/checkout", async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const { bookingId } = req.params;
    if (!/^[a-f0-9]{64}$/.test(bookingId)) return res.status(400).json({ error: "Invalid appointment." });
    try {
      const booking = await getBookingForParticipant(bookingId, uid);
      if (!booking || booking.role !== "member") return res.status(404).json({ error: "Appointment not found." });
      if (!isStripeConfigured) return res.status(503).json({ error: "Payment processing is not configured yet. This paid appointment cannot be completed." });
      const { data } = booking;
      if (data.status !== "pending_payment" || !holdsSlot(data)) return res.status(409).json({ error: "This payment window has ended. Please book the time again." });
      if (!Number.isSafeInteger(data.priceCents) || data.priceCents < 50) return res.status(409).json({ error: "This appointment has no valid price." });
      const baseUrl = (process.env.APP_URL || (req.headers.origin as string) || "").replace(/\/$/, "");
      if (!baseUrl) return res.status(500).json({ error: "Application URL is not configured." });
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: `${data.readingType} reading with ${data.readerName}`, description: `${data.durationMinutes}-minute private video session` },
            unit_amount: data.priceCents
          },
          quantity: 1
        }],
        mode: "payment",
        client_reference_id: uid,
        expires_at: Math.floor(Math.max(data.holdExpiresMs, Date.now() + 31 * 60 * 1000) / 1000),
        success_url: `${baseUrl}/?booking_payment=success`,
        cancel_url: `${baseUrl}/?booking_payment=cancel`,
        metadata: { type: "booking_payment", bookingId, memberUid: uid }
      });
      return res.json({ url: session.url });
    } catch (error) {
      console.error("[Scheduling] Booking checkout failed:", error);
      return res.status(500).json({ error: "Could not start payment." });
    }
  });

  // --- Private video: participant-only signaling mailbox. Media is peer-to-peer; the server only relays SDP/ICE. ---
  const CALL_EARLY_JOIN_MS = 10 * 60 * 1000;
  const CALL_LATE_JOIN_MS = 15 * 60 * 1000;
  const CALL_MAX_SIGNALS = 2000;
  const callIceServers = () => {
    const servers: { urls: string[]; username?: string; credential?: string }[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
    const turn = (process.env.TURN_URL || process.env.VITE_TURN_URL || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (turn.length) servers.push({ urls: turn, username: process.env.TURN_USERNAME || process.env.VITE_TURN_USERNAME, credential: process.env.TURN_CREDENTIAL || process.env.VITE_TURN_CREDENTIAL });
    return servers;
  };

  const authorizeCall = async (req: express.Request, res: express.Response) => {
    const uid = await authenticateMember(req, res, false);
    if (!uid) return null;
    const { bookingId } = req.params;
    if (!/^[a-f0-9]{64}$/.test(bookingId)) { res.status(400).json({ error: "Invalid appointment." }); return null; }
    const booking = await getBookingForParticipant(bookingId, uid);
    if (!booking) { res.status(404).json({ error: "Appointment not found." }); return null; }
    const now = Date.now();
    if (booking.data.status !== "confirmed") { res.status(409).json({ error: "Only confirmed appointments have a video room." }); return null; }
    if (now < booking.data.startMs - CALL_EARLY_JOIN_MS) { res.status(425).json({ error: "The video room opens 10 minutes before the appointment." }); return null; }
    if (now > booking.data.endMs + CALL_LATE_JOIN_MS) { res.status(410).json({ error: "This video session has ended." }); return null; }
    return { uid, ...booking };
  };

  app.post("/api/scheduling/bookings/:bookingId/call/join", async (req, res) => {
    try {
      const auth = await authorizeCall(req, res);
      if (!auth) return;
      const stale = await auth.ref.collection("signals").where("createdAtMs", "<", Date.now() - 2 * 60 * 60 * 1000).limit(100).get();
      await Promise.all(stale.docs.map((item) => item.ref.delete()));
      return res.json({
        role: auth.role,
        peerName: auth.role === "reader" ? auth.data.memberName : auth.data.readerName,
        iceServers: callIceServers(),
        turnConfigured: callIceServers().length > 1,
        endMs: auth.data.endMs,
        serverNowMs: Date.now()
      });
    } catch (error) {
      console.error("[Call] Join failed:", error);
      return res.status(500).json({ error: "Could not open the video room." });
    }
  });

  app.post("/api/scheduling/bookings/:bookingId/call/signal", async (req, res) => {
    const { type, payload, callId } = req.body ?? {};
    if (!["ready", "offer", "answer", "candidate", "hangup"].includes(type) || typeof callId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(callId)) {
      return res.status(400).json({ error: "Invalid call signal." });
    }
    const serialized = JSON.stringify(payload ?? null);
    if (serialized.length > 30000) return res.status(413).json({ error: "Call signal too large." });
    try {
      const auth = await authorizeCall(req, res);
      if (!auth) return;
      const signals = auth.ref.collection("signals");
      if ((await signals.count().get()).data().count >= CALL_MAX_SIGNALS) return res.status(429).json({ error: "Too many call signals for this appointment." });
      const ref = signals.doc();
      await ref.set({ from: auth.role, type, callId, payload: serialized, createdAtMs: Date.now() });
      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error("[Call] Signal failed:", error);
      return res.status(500).json({ error: "Could not send the call signal." });
    }
  });

  // Appointment-private Tarot reading. The state lives only in bookings/{id}/reading/state (deny-all to clients) and is
  // served through the same participant/time-window authorization as the call. Cards reuse the canonical deck ids.
  const READING_SPREADS: Record<string, number> = { single: 1, three: 3 };
  const readingDeckIds = new Set(TAROT_DECK.filter((card) => !card.isHidden).map((card) => card.id));
  type PrivateReadingCard = { id: number; reversed: boolean; revealed: boolean };
  type PrivateReadingState = { spread: "single" | "three"; cards: PrivateReadingCard[]; version: number; updatedAtMs: number };
  const emptyReading = (): PrivateReadingState => ({ spread: "three", cards: [], version: 0, updatedAtMs: 0 });
  const readReading = (data: FirebaseFirestore.DocumentData | undefined): PrivateReadingState => {
    if (!data || !Array.isArray(data.cards)) return emptyReading();
    return { spread: data.spread === "single" ? "single" : "three", cards: data.cards as PrivateReadingCard[], version: Number(data.version) || 0, updatedAtMs: Number(data.updatedAtMs) || 0 };
  };
  // The client never receives the identity or orientation of a card that has not been revealed.
  const readingFor = (state: PrivateReadingState, role: "reader" | "member") => ({
    spread: state.spread,
    version: state.version,
    updatedAtMs: state.updatedAtMs,
    cards: state.cards.map((card) => role === "reader" || card.revealed
      ? card
      : { id: null, reversed: null, revealed: false })
  });
  const drawPrivateCards = (count: number) => {
    const pool = [...readingDeckIds];
    const picked: PrivateReadingCard[] = [];
    while (picked.length < count && pool.length) {
      const index = crypto.randomInt(pool.length);
      picked.push({ id: pool.splice(index, 1)[0], reversed: crypto.randomInt(10) >= 7, revealed: false });
    }
    return picked;
  };

  app.get("/api/scheduling/bookings/:bookingId/call/reading", async (req, res) => {
    try {
      const auth = await authorizeCall(req, res);
      if (!auth) return;
      const state = readReading((await auth.ref.collection("reading").doc("state").get()).data());
      if (req.query.since !== undefined && Number(req.query.since) === state.version) return res.json({ unchanged: true, version: state.version });
      return res.json(readingFor(state, auth.role));
    } catch (error) {
      console.error("[Call] Reading load failed:", error);
      return res.status(500).json({ error: "Could not load the shared reading." });
    }
  });

  app.post("/api/scheduling/bookings/:bookingId/call/reading", async (req, res) => {
    const { action, spread, index } = req.body ?? {};
    if (!["draw", "reveal", "revealNext", "revealAll", "reset"].includes(action)) return res.status(400).json({ error: "Invalid reading action." });
    try {
      const auth = await authorizeCall(req, res);
      if (!auth) return;
      if (auth.role !== "reader") return res.status(403).json({ error: "Only the reader controls the cards." });
      if (action === "draw" && !(typeof spread === "string" && Object.prototype.hasOwnProperty.call(READING_SPREADS, spread))) return res.status(400).json({ error: "Choose a one-card or three-card spread." });
      if (action === "reveal" && !(Number.isInteger(index) && index >= 0 && index < 3)) return res.status(400).json({ error: "Invalid card." });
      const ref = auth.ref.collection("reading").doc("state");
      let result: PrivateReadingState | null = null;
      let failure = "";
      await db.runTransaction(async (transaction) => {
        const state = readReading((await transaction.get(ref)).data());
        let cards = state.cards.map((card) => ({ ...card }));
        let nextSpread = state.spread;
        if (action === "draw") { nextSpread = spread; cards = drawPrivateCards(READING_SPREADS[spread]); }
        else if (action === "reset") cards = [];
        else if (!cards.length) { failure = "Draw cards first."; return; }
        else if (action === "reveal") { if (!cards[index]) { failure = "Invalid card."; return; } cards[index].revealed = true; }
        else if (action === "revealNext") { const next = cards.find((card) => !card.revealed); if (next) next.revealed = true; }
        else cards.forEach((card) => { card.revealed = true; });
        result = { spread: nextSpread, cards, version: state.version + 1, updatedAtMs: Date.now() };
        transaction.set(ref, result);
      });
      if (failure || !result) return res.status(409).json({ error: failure || "Could not update the reading." });
      return res.json(readingFor(result, "reader"));
    } catch (error) {
      console.error("[Call] Reading update failed:", error);
      return res.status(500).json({ error: "Could not update the shared reading." });
    }
  });

  app.get("/api/scheduling/bookings/:bookingId/call/signals", async (req, res) => {
    const after = Number(req.query.after);
    if (!Number.isFinite(after) || after < 0) return res.status(400).json({ error: "Invalid cursor." });
    try {
      const auth = await authorizeCall(req, res);
      if (!auth) return;
      const snapshot = await auth.ref.collection("signals").where("createdAtMs", ">=", after).orderBy("createdAtMs").limit(200).get();
      const signals = snapshot.docs
        .filter((item) => item.data().from !== auth.role)
        .map((item) => {
          const data = item.data();
          return { id: item.id, type: data.type, callId: data.callId, payload: JSON.parse(data.payload), createdAtMs: data.createdAtMs };
        });
      const cursor = snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1].data().createdAtMs : after;
      return res.json({ signals, cursor });
    } catch (error) {
      console.error("[Call] Signal read failed:", error);
      return res.status(500).json({ error: "Could not read call signals." });
    }
  });

  // Unknown API routes and unexpected errors must return JSON, never the HTML app shell
  app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found" }));
  app.use("/api", (error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[API] Unhandled error:", error);
    if (res.headersSent) return next(error);
    return res.status(500).json({ error: "Internal server error" });
  });

  // --- STACKED DEPLOYMENT & ROUTING WITH VITE ---
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });

    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = await fs.readFile(path.resolve(__dirname, "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Serve Static Production Assets
    app.use(express.static(path.resolve(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.resolve(__dirname, "dist/index.html"));
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`[Full-Stack Server] running on http://0.0.0.0:${port}`);
  });
}

// Confirms a held paid booking only for a verified, fully paid session whose amount matches the stored price.
export async function confirmBookingPayment(session: any) {
  const { bookingId, memberUid } = session.metadata || {};
  if (typeof bookingId !== "string" || !/^[a-f0-9]{64}$/.test(bookingId)) throw new Error("[Booking Payment] Invalid booking id.");
  if (session.payment_status !== "paid") return;
  const firestore = db; // bookings live in the app's named database, not the default one
  const ref = firestore.collection("bookings").doc(bookingId);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data();
    if (!data) throw new Error("[Booking Payment] Booking not found.");
    if (data.paymentSessionId === session.id) return;
    if (data.memberUid !== memberUid || session.amount_total !== data.priceCents || data.priceType !== "paid") {
      throw new Error("[Booking Payment] Session does not match the booking.");
    }
    if (data.status !== "pending_payment") {
      transaction.update(ref, { paymentStatus: "paid_needs_refund", paymentSessionId: session.id, updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    const others = await transaction.get(firestore.collection("bookings").where("readerUid", "==", data.readerUid).where("status", "in", ["confirmed"]));
    if (others.docs.some((item) => item.id !== ref.id && item.data().startMs < data.endMs && item.data().endMs > data.startMs)) {
      transaction.update(ref, { status: "payment_conflict", paymentStatus: "paid_needs_refund", paymentSessionId: session.id, updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    transaction.update(ref, { status: "confirmed", paymentStatus: "paid", paymentSessionId: session.id, paidAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
}

// Records a livestream tip only for a verified, fully paid session that matches the server-stored pending tip. Idempotent.
export async function confirmLiveTip(event: Stripe.Event, session: any) {
  return confirmLiveTipIn(db, event, session);
}

// --- SECURE EVENTS SERVER-SIDE WEBHOOK PROCESSOR ---
export async function processStripeEvent(event: Stripe.Event) {
  const eventId = event.id;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const metadata = session.metadata || {};

    if (metadata.type === "booking_payment") {
      await confirmBookingPayment(session);
      return;
    }

    if (metadata.type === "live_tip") {
      await confirmLiveTip(event, session);
      return;
    }

    if (metadata.type === "gem_purchase") {
      const { userId, packageId, gemsAmount, transactionId } = metadata;
      const sessionId: string = session.id;

      // Validate against the server-side trusted package table; metadata amounts are never credited blindly.
      const pkg = typeof packageId === "string" && Object.prototype.hasOwnProperty.call(GEM_PACKAGES, packageId)
        ? GEM_PACKAGES[packageId]
        : undefined;
      if (!pkg) {
        throw new Error(`[Stripe Security] Unknown gem package in webhook: ${packageId}`);
      }
      if (typeof userId !== "string" || !userId || userId.includes("/")) {
        throw new Error("[Stripe Security] Invalid userId in webhook metadata.");
      }
      if (typeof transactionId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(transactionId)) {
        throw new Error("[Stripe Security] Invalid transactionId in webhook metadata.");
      }
      if (typeof sessionId !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(sessionId)) {
        throw new Error("[Stripe Security] Invalid checkout session id.");
      }
      if (session.payment_status !== "paid") {
        console.log(`[Stripe Security] Session ${sessionId} not paid (status: ${session.payment_status}); not crediting.`);
        return;
      }
      if (parseInt(gemsAmount, 10) !== pkg.gems) {
        throw new Error("[Stripe Security] Webhook gemsAmount does not match trusted package.");
      }
      if (session.amount_total !== Math.round(pkg.cost * 100)) {
        throw new Error("[Stripe Security] Webhook amount_total does not match trusted package price.");
      }
      const numGems = pkg.gems;
      const rawCost = pkg.cost;

      console.log(`[Stripe Secure Success] Initiating atomic transaction for User: ${userId}, Gems: ${numGems}, Session: ${transactionId}`);

      await db.runTransaction(async (transaction) => {
        // 1. Prevent duplicate event processing by logging processed webhooks
        const eventLogRef = db.collection("processed_stripe_events").doc(eventId);
        const eventLogSnap = await transaction.get(eventLogRef);

        if (eventLogSnap.exists) {
          console.log(`[Stripe Security] Webhook duplicate blocked. Event ID already processed: ${eventId}`);
          return;
        }

        // 2. Prevent duplicate credit for the same Stripe session / transaction ID
        const sessionLogRef = db.collection("processed_stripe_sessions").doc(sessionId);
        const sessionLogSnap = await transaction.get(sessionLogRef);
        if (sessionLogSnap.exists) {
          console.log(`[Stripe Security] Session duplicate blocked: ${sessionId}`);
          return;
        }
        const globalTxRef = db.collection("financial_records").doc(transactionId);
        const globalTxSnap = await transaction.get(globalTxRef);

        if (globalTxSnap.exists) {
          console.log(`[Stripe Security] Transaction duplicate blocked. Session already credited: ${transactionId}`);
          return;
        }

        // 3. Fetch current User balance
        const userRef = db.collection("users").doc(userId);
        const userSnap = await transaction.get(userRef);

        if (!userSnap.exists) {
          throw new Error(`[Stripe Secure Error] Targeted user document not found in Firestore: ${userId}`);
        }

        const uData = userSnap.data() || {};
        const currentBalance = uData.gemBalance || 0;

        // 4. Fetch financial aggregation doc (Read before any writes)
        const finRef = db.collection("admin_settings").doc("financials");
        const finSnap = await transaction.get(finRef);

        // --- ATOMIC MUTATIONS ---

        // Record webhook as processed to lock state
        transaction.set(eventLogRef, {
          eventId,
          type: event.type,
          processedAt: new Date().toISOString(),
        });

        transaction.set(sessionLogRef, {
          sessionId,
          eventId,
          transactionId,
          userId,
          processedAt: new Date().toISOString(),
        });

        // Credit Wallet Balance securely server-side
        transaction.update(userRef, {
          gemBalance: currentBalance + numGems,
          updatedAt: new Date().toISOString(),
        });

        // Add Transaction Reference Ledger log
        const ledgerRef = userRef.collection("transactions").doc(transactionId);
        transaction.set(ledgerRef, {
          id: transactionId,
          userId,
          type: "recharge",
          gemsAmount: numGems,
          cashAmount: rawCost,
          description: `Stripe Gems Credit Recharge (+${numGems} Gems)`,
          packageId,
          stripeSessionId: sessionId,
          createdAt: new Date().toISOString(),
          status: "completed",
        });

        // Add Global Reconciliation Log
        transaction.set(globalTxRef, {
          id: transactionId,
          type: "gem_purchase",
          userId,
          gemsAmount: numGems,
          amount: rawCost,
          packageId,
          stripeSessionId: sessionId,
          status: "completed",
          createdAt: new Date().toISOString()
        });

        if (!finSnap.exists) {
          transaction.set(finRef, {
            totalGrossVolume: rawCost,
            totalPlatformRevenue: rawCost,
            totalTransfers: 0,
            purchaseCount: 1,
            updatedAt: new Date().toISOString()
          });
        } else {
          const fData = finSnap.data() || {};
          transaction.update(finRef, {
            totalGrossVolume: (fData.totalGrossVolume || 0) + rawCost,
            totalPlatformRevenue: (fData.totalPlatformRevenue || 0) + rawCost,
            purchaseCount: (fData.purchaseCount || 0) + 1,
            updatedAt: new Date().toISOString()
          });
        }

        console.log(`[Stripe Secure Wallet Credit] User ${userId} successfully credited with ${numGems} gems in atomic transaction.`);
      });
    }
  } else {
    // Prevent duplicate event processing for non-checkout events using a simple write
    const eventLogRef = db.collection("processed_stripe_events").doc(eventId);
    const eventLogSnap = await eventLogRef.get();

    if (eventLogSnap.exists) {
      console.log(`[Stripe Security] Webhook duplicate blocked. Event ID already processed: ${eventId}`);
      return;
    }

    await eventLogRef.set({
      eventId,
      type: event.type,
      processedAt: new Date().toISOString(),
    });

    if (event.type === "charge.refunded") {
      // Handle Refunds securely on the server
      const charge = event.data.object as any;
      console.log(`[Stripe Refund Event] Refund requested for charge: ${charge.id}`);
      
      // Log Refund in Global Financial Records
      const refundTxId = "ref_" + charge.id;
      await db.collection("financial_records").doc(refundTxId).set({
        id: refundTxId,
        originalChargeId: charge.id,
        type: "refund",
        amount: charge.amount_refunded / 100,
        status: "refunded",
        createdAt: new Date().toISOString()
      });
    } else if (event.type === "charge.dispute.created") {
      // Handle Disputes securely
      const dispute = event.data.object as any;
      console.log(`[Stripe Dispute Event] Dispute opened for charge: ${dispute.charge}`);

      const disputeTxId = "dis_" + dispute.id;
      await db.collection("financial_records").doc(disputeTxId).set({
        id: disputeTxId,
        disputeId: dispute.id,
        chargeId: dispute.charge,
        type: "dispute",
        amount: dispute.amount / 100,
        status: "disputed",
        reason: dispute.reason,
        createdAt: new Date().toISOString()
      });
    }
  }
}

if (import.meta.url === "file://" + process.argv[1]) {
  startServer();
}
