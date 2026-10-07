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
import { getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- FIREBASE ADMIN INITIALIZATION ---
// Reads project configuration automatically to connect with full administrative privileges
const firebaseConfig = JSON.parse(readFileSync("./firebase-applet-config.json", "utf-8"));

// Initialize if not already initialized
if (getApps().length === 0) {
  try {
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
    console.log("[Firebase Admin] Connected successfully to project:", firebaseConfig.projectId);
  } catch (error) {
    console.error("[Firebase Admin] Initialization failed:", error);
  }
}

// Bind to the exact named Firestore Database ID allocated for this workspace applet
export const db = getFirestore(getApps()[0], firebaseConfig.firestoreDatabaseId);
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

function isLocalHost(host: string | undefined): boolean {
  if (!host) return false;
  const cleanHost = host.split(":")[0];
  return cleanHost === "localhost" || cleanHost === "127.0.0.1" || cleanHost === "::1" || cleanHost.endsWith(".local");
}

// Simulation is allowed only outside production, on a local host, and when explicitly enabled.
function isSimulationAllowed(host: string | undefined): boolean {
  return !isProduction && process.env.ENABLE_WEBHOOK_SIMULATION === "true" && isLocalHost(host);
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
  const authenticateMember = async (req: express.Request, res: express.Response): Promise<string | null> => {
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
      if (isRateLimited(decoded.uid)) {
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

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ") || authHeader.length <= 7) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }

    // Trusted package definition only; client cost/gemsAmount are ignored.
    const pkg = typeof packageId === "string" && Object.prototype.hasOwnProperty.call(GEM_PACKAGES, packageId)
      ? GEM_PACKAGES[packageId]
      : undefined;
    if (!pkg) {
      return res.status(400).json({ error: "Invalid gem package." });
    }

    try {
      const decodedToken = await getAuth().verifyIdToken(authHeader.substring(7));
      const userId = decodedToken.uid;
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

  // --- API: CREATE CONNECT ONBOARDING LINK ---
  app.post("/api/create-connect-onboarding", async (req, res) => {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "Missing required parameter: userId" });
    }

    try {
      if (isStripeConfigured) {
        // Create or retrieve Stripe Connect Express account for recipient transfers
        // First retrieve user email to pre-populate onboarding
        const userSnap = await db.collection("users").doc(userId).get();
        const userEmail = userSnap.exists ? userSnap.data()?.email : "";

        const account = await stripe.accounts.create({
          type: "express",
          email: userEmail,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });

        // Update user's profile with connect account reference
        await db.collection("users").doc(userId).update({
          stripeConnectId: account.id,
          stripeConnectStatus: "pending",
          updatedAt: new Date().toISOString(),
        });

        // Generate account onboarding link
        const accountLink = await stripe.accountLinks.create({
          account: account.id,
          refresh_url: `${req.headers.origin}/dashboard?connect=refresh`,
          return_url: `${req.headers.origin}/dashboard?connect=success`,
          type: "account_onboarding",
        });

        return res.json({ url: accountLink.url, accountId: account.id, simulated: false });
      } else {
        // Return simulated connect onboarding
        const simulatedUrl = `/stripe-sandbox-connect-onboard?userId=${userId}`;
        return res.json({ url: simulatedUrl, accountId: "acct_sim_" + Date.now(), simulated: true });
      }
    } catch (error: any) {
      console.error("[Stripe Connect Error]:", error);
      return res.status(500).json({ error: error.message });
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
        }

        // 2. Record immutable transaction safely in User's subcollection ledger
        const transactionId = "tx_spend_" + Date.now() + (isLiveGift ? "_" + crypto.randomBytes(4).toString("hex") : "");
        const ledgerRef = userRef.collection("transactions").doc(transactionId);
        transaction.set(ledgerRef, {
          id: transactionId,
          userId: authenticatedUid,
          type: "spend_gift",
          gemsAmount: -giftCost,
          giftId,
          description: `Spent ${giftCost} Gems on ${giftId} virtual gift`,
          createdAt: new Date().toISOString(),
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
          createdAt: new Date().toISOString(),
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

  const port = 3000;
  app.listen(port, () => {
    console.log(`[Full-Stack Server] running on http://0.0.0.0:${port}`);
  });
}

// --- SECURE EVENTS SERVER-SIDE WEBHOOK PROCESSOR ---
export async function processStripeEvent(event: Stripe.Event) {
  const eventId = event.id;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const metadata = session.metadata || {};

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
      if (session.amount_total !== undefined && session.amount_total !== null && session.amount_total !== Math.round(pkg.cost * 100)) {
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
