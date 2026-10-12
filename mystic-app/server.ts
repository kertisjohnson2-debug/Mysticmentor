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
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";
import { FieldPath, FieldValue, getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import crypto from "crypto";
import { TAROT_DECK } from "./src/data/spiritualData";
import { generateSlots, overlaps, validateScheduleSettings, type ReaderScheduleSettings } from "./scheduling";
import { calculateTipSplit, evaluateConnectReadiness, parseTipAmountCents } from "./payments";

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
const COMMUNITY_MAX_IMAGES_PER_POST = 4;
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
  const resolveCommunityAuthors = async <T extends { authorUid?: unknown; author?: unknown }>(items: T[]) => {
    const uids = [...new Set(items.map((item) => item.authorUid).filter(isValidMemberUid))];
    const current = new Map<string, { uid: string; displayName: string; avatarUrl: string }>();
    if (uids.length) {
      const snapshots = await db.getAll(...uids.map((uid) => db.collection("users").doc(uid)));
      snapshots.forEach((snapshot) => {
        const data = snapshot.data();
        if (!snapshot.exists || !data || data.suspended === true) return;
        current.set(snapshot.id, {
          uid: snapshot.id,
          displayName: String(data.displayName || "Celestial Member").slice(0, 100),
          avatarUrl: safeAvatar(data.avatarUrl)
        });
      });
    }
    return items.map((item) => {
      const uid = typeof item.authorUid === "string" ? item.authorUid : "";
      const fallback = item.author as { displayName?: unknown; avatarUrl?: unknown } | undefined;
      return {
        ...item,
        author: current.get(uid) ?? {
          uid,
          displayName: typeof fallback?.displayName === "string" ? fallback.displayName.slice(0, 100) : "Celestial Member",
          avatarUrl: safeAvatar(fallback?.avatarUrl)
        }
      };
    });
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

  const communityBucket = () => getStorage().bucket();
  const requestKeyId = (uid: string, key: unknown) =>
    typeof key === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(key)
      ? crypto.createHash("sha256").update(`${uid}:${key}`).digest("hex").slice(0, 40)
      : null;

  const signedImageUrls = async (imageIds: unknown): Promise<{ id: string; url: string }[]> => {
    if (!Array.isArray(imageIds) || !imageIds.length) return [];
    const ids = imageIds.filter(isValidMemberUid).slice(0, COMMUNITY_MAX_IMAGES_PER_POST);
    const snapshots = await db.getAll(...ids.map((id) => db.collection("communityImages").doc(id)));
    const images = await Promise.all(snapshots.map(async (snapshot) => {
      const data = snapshot.data();
      if (!snapshot.exists || !data || typeof data.path !== "string") return null;
      try {
        const [url] = await communityBucket().file(data.path).getSignedUrl({ version: "v4", action: "read", expires: Date.now() + 60 * 60 * 1000 });
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
      if (typeof path === "string") await communityBucket().file(path).delete({ ignoreNotFound: true }).catch((error) => {
        console.error("[Community] Image object delete failed:", error instanceof Error ? error.message : error);
      });
      await ref.delete();
    }
  };

  // Verified JPEG upload: the browser resizes/compresses to JPEG; the server checks size and magic bytes.
  app.post("/api/community/images", express.raw({ type: "image/jpeg", limit: COMMUNITY_MAX_IMAGE_BYTES }), async (req, res) => {
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes.length > COMMUNITY_MAX_IMAGE_BYTES ||
      bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return res.status(400).json({ error: "Upload a JPEG image under 2.5 MB." });
    }
    try {
      const member = await getSafeMember(uid);
      if (!member) return res.status(403).json({ error: "An active member profile is required." });
      const pending = await db.collection("communityImages").where("ownerUid", "==", uid).where("status", "==", "pending").limit(11).get();
      if (pending.size >= 10) return res.status(429).json({ error: "Attach or remove your unused images before uploading more." });
      const imageRef = db.collection("communityImages").doc();
      const objectPath = `community-images/${uid}/${imageRef.id}.jpg`;
      await communityBucket().file(objectPath).save(bytes, { contentType: "image/jpeg", resumable: false });
      await imageRef.create({ ownerUid: uid, path: objectPath, bytes: bytes.length, status: "pending", postId: null, createdAt: FieldValue.serverTimestamp() });
      return res.status(201).json({ imageId: imageRef.id });
    } catch (error) {
      const code = (error as { code?: number }).code;
      console.error("[Community] Image upload failed:", error instanceof Error ? error.message : error);
      if (code === 404) return res.status(503).json({ error: "Image storage is not set up for this project yet." });
      return res.status(500).json({ error: "Could not upload the image." });
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
      const withAuthors = await resolveCommunityAuthors(posts);
      const withImages = await Promise.all(withAuthors.map(async ({ imageIds, ...post }) => ({ ...post, images: await signedImageUrls(imageIds) })));
      return res.json({ posts: withImages });
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
      const replies = snapshot.docs
        .map((item) => {
          const data = item.data();
          return {
            id: item.id,
            authorUid: data.authorUid,
            author: data.author,
            body: data.body,
            parentReplyId: typeof data.parentReplyId === "string" ? data.parentReplyId : null,
            depth: typeof data.depth === "number" ? data.depth : 0,
            editedAt: toCommunityTimestamp(data.editedAt),
            createdAt: toCommunityTimestamp(data.createdAt)
          };
        })
        .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
        .slice(0, 300);
      return res.json({ replies: await resolveCommunityAuthors(replies) });
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
          if (!snapshot.exists || data?.ownerUid !== uid || data?.status !== "pending") throw new Error("IMAGE_NOT_AVAILABLE");
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
    const { title, body, removeImageIds } = req.body ?? {};
    const removals: string[] = Array.isArray(removeImageIds) ? removeImageIds : [];
    if (!isValidMemberUid(postId) || !isCommunityText(title, 120) || !isCommunityText(body, 3000) || !removals.every(isValidMemberUid)) {
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
        transaction.update(postRef, {
          title: title.trim(),
          body: body.trim(),
          imageIds: current.filter((id) => !removed.includes(id)),
          editedAt: FieldValue.serverTimestamp()
        });
      });
      await deleteCommunityImages(removed);
      return res.json({ updated: true });
    } catch (error) {
      if (error instanceof Error && error.message === "POST_NOT_AVAILABLE") return res.status(404).json({ error: "This post is no longer available." });
      if (error instanceof Error && error.message === "NOT_OWNER") return res.status(403).json({ error: "You can only edit your own posts." });
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
    const { body, parentReplyId, requestId } = req.body ?? {};
    if (!isValidMemberUid(postId) || !isCommunityText(body, 2000) ||
      (parentReplyId !== undefined && parentReplyId !== null && !isValidMemberUid(parentReplyId))) {
      return res.status(400).json({ error: "Enter a reply to continue." });
    }

    try {
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
        transaction.create(replyRef, {
          authorUid: uid,
          author: member,
          body: body.trim(),
          parentReplyId: typeof parentReplyId === "string" ? parentReplyId : null,
          depth,
          stateCode: post?.stateCode,
          cityName: post?.cityName,
          topic: post?.topic,
          createdAt: FieldValue.serverTimestamp()
        });
        transaction.update(postRef, { replyCount: FieldValue.increment(1) });
      });
      return res.status(201).json({ replyId: replyRef.id });
    } catch (error) {
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
    const { body } = req.body ?? {};
    if (!isValidMemberUid(postId) || !isValidMemberUid(replyId) || !isCommunityText(body, 2000)) {
      return res.status(400).json({ error: "Enter a reply to continue." });
    }
    try {
      const postRef = db.collection("communityPosts").doc(postId);
      const replyRef = postRef.collection("replies").doc(replyId);
      await db.runTransaction(async (transaction) => {
        const [postSnapshot, replySnapshot] = await Promise.all([transaction.get(postRef), transaction.get(replyRef)]);
        if (!postSnapshot.exists || postSnapshot.data()?.status !== "published" || !replySnapshot.exists) throw new Error("NOT_AVAILABLE");
        if (replySnapshot.data()?.authorUid !== uid) throw new Error("NOT_OWNER");
        transaction.update(replyRef, { body: body.trim(), editedAt: FieldValue.serverTimestamp() });
      });
      return res.json({ updated: true });
    } catch (error) {
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
        transaction.update(postRef, { replyCount: FieldValue.increment(-doomed.size) });
      });
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
    const { postId, replyId, reason } = req.body ?? {};
    if (!isValidMemberUid(postId) || (replyId !== undefined && !isValidMemberUid(replyId)) ||
      !isCommunityText(reason, 500)) {
      return res.status(400).json({ error: "A valid post and report reason are required." });
    }

    try {
      const member = await getCommunityMember(uid, res);
      if (!member) return;
      const postRef = db.collection("communityPosts").doc(postId);
      const targetRef = replyId ? postRef.collection("replies").doc(replyId) : postRef;
      const [postSnapshot, targetSnapshot] = await Promise.all([postRef.get(), targetRef.get()]);
      if (!postSnapshot.exists || postSnapshot.data()?.status !== "published" || !targetSnapshot.exists) {
        return res.status(404).json({ error: "The reported content is no longer available." });
      }
      const reportRef = db.collection("communityReports").doc();
      await reportRef.create({
        reporterUid: uid,
        postId,
        ...(replyId ? { replyId } : {}),
        reason: reason.trim(),
        status: "open",
        createdAt: FieldValue.serverTimestamp()
      });
      return res.status(201).json({ reportId: reportRef.id });
    } catch (error) {
      console.error("[Community] Report submission failed:", error);
      return res.status(500).json({ error: "Could not submit the report." });
    }
  });

  const broadcasterRank = (lifetimeGemsReceived: number) => {
    if (lifetimeGemsReceived >= 100000) return "Luna Master";
    if (lifetimeGemsReceived >= 50000) return "Grand Mystic";
    if (lifetimeGemsReceived >= 25000) return "Celestial Reader";
    if (lifetimeGemsReceived >= 10000) return "High Oracle";
    if (lifetimeGemsReceived >= 5000) return "Oracle";
    if (lifetimeGemsReceived >= 1000) return "Mystic";
    return "New Seer";
  };

  app.get("/api/members/:uid/profile", async (req, res) => {
    const viewerUid = await authenticateMember(req, res);
    if (!viewerUid) return;
    const uid = req.params.uid;
    if (!isValidMemberUid(uid)) return res.status(400).json({ error: "Invalid member profile" });

    try {
      const [memberSnapshot, statsSnapshot, sessionsSnapshot] = await Promise.all([
        db.collection("users").doc(uid).get(),
        db.collection("broadcasterStats").doc(uid).get(),
        db.collection("liveSessions").where("ownerUid", "==", uid).limit(5).get()
      ]);
      const member = memberSnapshot.data();
      if (!memberSnapshot.exists || !member || member.suspended === true) {
        return res.status(404).json({ error: "Member profile not found" });
      }

      const stats = statsSnapshot.data();
      const lifetimeGemsReceived = Number(stats?.lifetimeGemsReceived);
      const hasBroadcasterRank = statsSnapshot.exists && Number.isFinite(lifetimeGemsReceived) && lifetimeGemsReceived >= 0;
      const isLive = sessionsSnapshot.docs.some((session) => {
        const data = session.data();
        return data.status === "live" && typeof data.updatedAt === "number" && data.updatedAt >= Date.now() - 90000;
      });

      return res.json({
        uid,
        displayName: String(member.displayName || "Celestial Member").slice(0, 100),
        avatarUrl: safeAvatar(member.avatarUrl),
        bio: typeof member.bio === "string" ? member.bio.slice(0, 500) : "",
        spiritualInterests: typeof member.spiritualInterests === "string" ? member.spiritualInterests.slice(0, 500) : "",
        tarotReader: member.tarotReader === true,
        ...(hasBroadcasterRank ? {
          broadcasterRank: broadcasterRank(lifetimeGemsReceived)
        } : {}),
        isLive
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
    // Reuse only while the reading is for today (UTC) or was fetched very recently
    if (cached && (cached.date === todayUtc || Date.now() - cached.fetchedAt < HOROSCOPE_RECHECK_MS)) {
      return res.json({ sign, date: cached.date, horoscope: cached.horoscope, cached: true });
    }
    try {
      const upstream = await fetch(`https://freehoroscopeapi.com/api/v1/get-horoscope/daily?sign=${encodeURIComponent(sign)}`, { signal: AbortSignal.timeout(8000) });
      if (!upstream.ok) throw new Error(`Upstream status ${upstream.status}`);
      const body: any = await upstream.json();
      const date = body?.data?.date;
      const horoscope = body?.data?.horoscope;
      if (typeof date !== "string" || typeof horoscope !== "string" || !horoscope.trim()) throw new Error("Unexpected upstream response");
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

  // --- STRIPE CONNECT (TEST MODE): broadcasters link a payout account; the account id is stored server-side only ---
  const stripeBaseUrl = (req: express.Request) => (process.env.APP_URL || (req.headers.origin as string) || "").replace(/\/$/, "");

  // Ids created by the old local simulator (acct_sim_*) are not real Stripe accounts.
  const isRealConnectId = (id: unknown): id is string => typeof id === "string" && id.startsWith("acct_") && !id.startsWith("acct_sim_");

  const loadConnectReadiness = async (uid: string) => {
    const userRef = db.collection("users").doc(uid);
    const accountId = (await userRef.get()).data()?.stripeConnectId;
    if (!isRealConnectId(accountId)) {
      return { linked: false, accountId: null as string | null, ...evaluateConnectReadiness(null) };
    }
    const account = await stripe.accounts.retrieve(accountId);
    const readiness = evaluateConnectReadiness(account as any);
    const status = readiness.ready ? "active" : "pending";
    await userRef.update({ stripeConnectStatus: status, updatedAt: new Date().toISOString() });
    return { linked: true, accountId, ...readiness };
  };

  // --- API: CREATE CONNECT ONBOARDING LINK (authenticated; the account is always the caller's own) ---
  app.post("/api/create-connect-onboarding", async (req, res) => {
    if (!isStripeConfigured) return res.status(503).json({ error: "Payments are not configured on this server." });
    const uid = await authenticateMember(req, res);
    if (!uid) return;
    try {
      if (!(await getEligibleReader(uid))) {
        return res.status(403).json({ error: "Only approved broadcasters can link a payout account." });
      }
      const baseUrl = stripeBaseUrl(req);
      if (!baseUrl) return res.status(500).json({ error: "Application URL is not configured." });

      const userRef = db.collection("users").doc(uid);
      let accountId = (await userRef.get()).data()?.stripeConnectId;
      if (!isRealConnectId(accountId)) {
        const authUser = await getAuth().getUser(uid);
        const account = await stripe.accounts.create({
          type: "express",
          ...(authUser.email ? { email: authUser.email } : {}),
          capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
          metadata: { mysticmentorUid: uid },
        }, { idempotencyKey: `connect-account-${uid}` });
        accountId = account.id;
        await userRef.update({ stripeConnectId: accountId, stripeConnectStatus: "pending", updatedAt: new Date().toISOString() });
      }

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${baseUrl}/dashboard?connect=refresh`,
        return_url: `${baseUrl}/dashboard?connect=return`,
        type: "account_onboarding",
      });
      return res.json({ url: accountLink.url });
    } catch (error: any) {
      console.error("[Stripe Connect Error]:", error?.message);
      return res.status(500).json({ error: "Could not start Stripe onboarding." });
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
    if (!session || session.status !== "live" || typeof session.ownerUid !== "string") return { status: 404, error: "This broadcast is not live." } as const;
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
      const readiness = target.accountId ? evaluateConnectReadiness((await stripe.accounts.retrieve(target.accountId)) as any) : evaluateConnectReadiness(null);
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

      const readiness = target.accountId ? evaluateConnectReadiness((await stripe.accounts.retrieve(target.accountId)) as any) : evaluateConnectReadiness(null);
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

    const { giftId, recipientId, context, sessionId } = req.body;
    if (!giftId || !recipientId) {
      return res.status(400).json({ error: "Missing required parameters: giftId, recipientId" });
    }
    const isLiveGift = context === "live";

    // Verify gift cost from trusted server-side template
    const giftCostMap: Record<string, number> = {
      quartz: 5,
      lotus: 20,
      chalice: 50,
      feather: 100,
      star: 200
    };
    // Live room gifts; the cost always comes from this table, never from the client
    const liveGiftCostMap: Record<string, number> = {
      heart: 10,
      star: 50,
      rose: 100,
      crystal: 250,
      teddy: 500
    };

    const giftCost = (isLiveGift ? liveGiftCostMap : giftCostMap)[giftId as string];
    if (giftCost === undefined || !Object.prototype.hasOwnProperty.call(isLiveGift ? liveGiftCostMap : giftCostMap, giftId as string)) {
      return res.status(400).json({ error: "Invalid gift ID" });
    }
    if (isLiveGift && (typeof sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId) || typeof recipientId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(recipientId))) {
      return res.status(400).json({ error: "Invalid live gift parameters" });
    }

    try {
      // Verify Firebase ID Token securely on the server
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const authenticatedUid = decodedToken.uid;

      if (isLiveGift && (recipientId === authenticatedUid || decodedToken.firebase?.sign_in_provider === "anonymous")) {
        return res.status(400).json({ error: "Live gifts must come from a signed-in member to another broadcaster" });
      }

      const userRef = db.collection("users").doc(authenticatedUid);
      let successResponse = {};
      const transactionId = "tx_spend_" + Date.now() + (isLiveGift ? "_" + crypto.randomBytes(4).toString("hex") : "");
      const createdAt = new Date().toISOString();

      // Execute atomic transaction to prevent race conditions or duplicate deducts
      await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
          throw new Error("User document not found in Firestore");
        }

        // Live gifts credit the broadcaster only when the session is genuinely live and owned by the recipient
        const recipientRef = isLiveGift ? db.collection("users").doc(recipientId as string) : null;
        const statsRef = isLiveGift ? db.collection("broadcasterStats").doc(recipientId as string) : null;
        let recipientLifetime = 0;
        if (isLiveGift && recipientRef) {
          const [sessionSnap, recipientSnap] = await Promise.all([
            transaction.get(db.collection("liveSessions").doc(sessionId as string)),
            transaction.get(recipientRef)
          ]);
          const session = sessionSnap.data();
          if (!session || session.ownerUid !== recipientId || session.status !== "live") {
            throw new Error("Live session is not active for this broadcaster");
          }
          if (!recipientSnap.exists) {
            throw new Error("Recipient User document not found in Firestore");
          }
          recipientLifetime = Number(recipientSnap.data()?.lifetimeGemsReceived) || 0;
        }

        const uData = userSnap.data() || {};
        const currentBalance = uData.gemBalance || 0;

        if (currentBalance < giftCost) {
          throw new Error("Insufficient gem balance in database");
        }

        const newBalance = currentBalance - giftCost;

        // 1. Deduct gems securely exactly once inside the atomic transaction
        transaction.update(userRef, {
          gemBalance: newBalance,
          updatedAt: new Date().toISOString(),
        });

        // 1b. Credit the broadcaster's lifetime total in the same transaction (server-confirmed spend only)
        if (isLiveGift && recipientRef && statsRef) {
          const lifetimeGemsReceived = recipientLifetime + giftCost;
          transaction.update(recipientRef, { lifetimeGemsReceived });
          transaction.set(statsRef, { lifetimeGemsReceived, updatedAt: Date.now() });
          const recipientTxRef = recipientRef.collection("transactions").doc(transactionId);
          transaction.set(recipientTxRef, {
            id: transactionId,
            type: "live_gift_received",
            viewerUid: authenticatedUid,
            viewerName: String(uData.displayName || "Viewer").slice(0, 100),
            gemsAmount: giftCost,
            giftId,
            sessionId,
            createdAt,
            status: "completed",
          });
        }

        // 2. Record immutable transaction safely in User's subcollection ledger
        const ledgerRef = userRef.collection("transactions").doc(transactionId);
        transaction.set(ledgerRef, {
          id: transactionId,
          userId: authenticatedUid,
          type: "spend_gift",
          gemsAmount: -giftCost,
          giftId,
          description: `Spent ${giftCost} Gems on ${giftId} virtual gift`,
          createdAt,
          status: "completed",
        });

        // 3. Record in Global Financial Records as ledger
        const globalTxRef = db.collection("financial_records").doc(transactionId);
        transaction.set(globalTxRef, {
          id: transactionId,
          type: "spend_gift",
          userId: authenticatedUid,
          gemsAmount: giftCost,
          giftId,
          status: "completed",
          createdAt,
        });

        successResponse = {
          success: true,
          newBalance,
          transactionId,
        };
      });

      return res.json(successResponse);
    } catch (error: any) {
      console.error("[Spend Gems Error]:", error);
      const errMsg = error.message || String(error);
      if (errMsg.includes("Insufficient gem balance") || errMsg.includes("User document not found") || errMsg.includes("Live session is not active")) {
        return res.status(400).json({ error: errMsg });
      }
      return res.status(401).json({ error: "Unauthorized access or validation failure" });
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
      let todayKey: string;
      try {
        todayKey = new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
      } catch {
        return res.status(400).json({ error: "Invalid time zone." });
      }
      const dateKey = (value: unknown) => {
        const date = typeof value === "string" ? new Date(value) : null;
        if (!date || !Number.isFinite(date.getTime())) return null;
        return new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(date);
      };

      const [userSnap, transactionsSnap] = await Promise.all([
        db.collection("users").doc(uid).get(),
        db.collection("users").doc(uid).collection("transactions").where("type", "==", "live_gift_received").get(),
      ]);
      const transactions: { id: string; status: unknown; gemsAmount: unknown; createdAt: unknown; viewerName: unknown }[] = transactionsSnap.docs
        .map((snapshot) => {
          const data = snapshot.data();
          return { id: snapshot.id, status: data.status, gemsAmount: data.gemsAmount, createdAt: data.createdAt, viewerName: data.viewerName };
        })
        .filter((item) => item.status === "completed" && Number.isSafeInteger(item.gemsAmount) && item.gemsAmount > 0)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      const totalGemsEarned = transactions.reduce((total, item) => total + Number(item.gemsAmount), 0);
      const todayGemsEarned = transactions.reduce((total, item) => total + (dateKey(item.createdAt) === todayKey ? Number(item.gemsAmount) : 0), 0);
      const lifetimeGemsEarned = Number(userSnap.data()?.lifetimeGemsReceived) || 0;

      return res.json({
        totalGemsEarned,
        todayGemsEarned,
        lifetimeGemsEarned,
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
  const firestore = getFirestore();
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
  const tipId = session.metadata?.tipId;
  if (typeof tipId !== "string" || !/^[a-f0-9]{32}$/.test(tipId)) throw new Error("[Live Tip] Invalid tip id.");
  if (session.payment_status !== "paid") return;

  await db.runTransaction(async (transaction) => {
    const eventLogRef = db.collection("processed_stripe_events").doc(event.id);
    const tipRef = db.collection("liveTips").doc(tipId);
    const finRef = db.collection("admin_settings").doc("financials");
    const [eventLog, tipSnap, finSnap] = await Promise.all([transaction.get(eventLogRef), transaction.get(tipRef), transaction.get(finRef)]);
    if (eventLog.exists) return;
    const tip = tipSnap.data();
    if (!tip) throw new Error("[Live Tip] Unknown tip.");
    if (tip.status === "completed") { transaction.set(eventLogRef, { eventId: event.id, type: event.type, processedAt: new Date().toISOString() }); return; }
    if (tip.stripeSessionId !== session.id || session.amount_total !== tip.amountCents || session.currency !== "usd") {
      throw new Error("[Live Tip] Paid session does not match the stored tip.");
    }
    const recipientRef = db.collection("users").doc(tip.recipientUid);
    const recipientSnap = await transaction.get(recipientRef);

    const now = new Date().toISOString();
    const dollars = tip.amountCents / 100;
    const platformFee = tip.platformFeeCents / 100;
    const recipientShare = tip.recipientShareCents / 100;
    const txId = `tx_tip_${tipId}`;
    const shared = { recipientId: tip.recipientUid, gemsAmount: 0, cashAmount: dollars, platformFee, recipientShare, stripeSessionId: session.id, createdAt: now, status: "completed" };

    transaction.set(eventLogRef, { eventId: event.id, type: event.type, processedAt: now });
    transaction.update(tipRef, { status: "completed", paidAt: now, paymentIntent: typeof session.payment_intent === "string" ? session.payment_intent : null });
    transaction.set(db.collection("users").doc(tip.senderUid).collection("transactions").doc(txId), { id: txId, userId: tip.senderUid, type: "tip", description: `Cash tip of $${dollars.toFixed(2)} sent to broadcaster`, ...shared });
    transaction.set(recipientRef.collection("transactions").doc(txId), { id: txId, userId: tip.senderUid, type: "tip_received", description: `Cash tip of $${dollars.toFixed(2)} received from viewer`, ...shared });
    if (recipientSnap.exists) transaction.update(recipientRef, { cloutPoints: FieldValue.increment(Math.floor(dollars)), updatedAt: now });
    transaction.set(db.collection("financial_records").doc(txId), { id: txId, type: "tip", senderId: tip.senderUid, recipientId: tip.recipientUid, amount: dollars, platformFee, recipientShare, stripeSessionId: session.id, status: "completed", createdAt: now });
    const fData = finSnap.data() || {};
    transaction.set(finRef, {
      totalGrossVolume: (fData.totalGrossVolume || 0) + dollars,
      totalPlatformRevenue: (fData.totalPlatformRevenue || 0) + platformFee,
      totalTransfers: (fData.totalTransfers || 0) + recipientShare,
      purchaseCount: (fData.purchaseCount || 0) + 1,
      updatedAt: now
    }, { merge: true });
  });
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
