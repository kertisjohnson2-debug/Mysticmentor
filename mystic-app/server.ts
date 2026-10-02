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
import { getFirestore } from "firebase-admin/firestore";
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

// --- STRIPE INITIALIZATION ---
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const isStripeConfigured = !!STRIPE_SECRET_KEY;
const stripe = isStripeConfigured
  ? new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: "2025-01-27.acerc" as any, // Set to standard modern API version
    })
  : (null as unknown as Stripe);

if (isStripeConfigured) {
  console.log("[Stripe Backend] Initialized with real API keys.");
} else {
  console.log("[Stripe Backend] API keys not found. Running in high-fidelity Stripe Sandbox Simulator mode.");
}

async function startServer() {
  const app = express();

  // --- STRIPE WEBHOOK (Needs raw body for signature verification) ---
  app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event: Stripe.Event;

    try {
      if (isStripeConfigured && STRIPE_WEBHOOK_SECRET) {
        event = stripe.webhooks.constructEvent(req.body, sig as string, STRIPE_WEBHOOK_SECRET);
      } else {
        // Fallback or Parse simulated webhook payload
        const rawBody = req.body.toString("utf-8");
        const parsed = JSON.parse(rawBody);
        event = parsed as Stripe.Event;
        console.log("[Stripe Simulator Webhook] Received simulated webhook event:", event.type);
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

  // --- API: CREATE CHEKOUT SESSION (GEMS PURCHASE) ---
  app.post("/api/create-gem-checkout-session", async (req, res) => {
    const { userId, packageId, cost, gemsAmount } = req.body;

    if (!userId || !packageId || !cost || !gemsAmount) {
      return res.status(400).json({ error: "Missing required parameters: userId, packageId, cost, gemsAmount" });
    }

    try {
      const transactionId = "tx_sess_" + crypto.randomUUID();

      if (isStripeConfigured) {
        // Create actual Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: `Celestial Gems - ${gemsAmount} Pack`,
                  description: `Unlock animated virtual gifts, tipping, and deep reading guides inside Celestial Sanctuary.`,
                },
                unit_amount: Math.round(cost * 100), // cost in cents
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${req.headers.origin}/dashboard?payment=success&tx=${transactionId}`,
          cancel_url: `${req.headers.origin}/dashboard?payment=cancel`,
          metadata: {
            userId,
            packageId,
            gemsAmount: gemsAmount.toString(),
            cost: cost.toString(),
            type: "gem_purchase",
            transactionId,
          },
        });

        return res.json({ url: session.url, sessionId: session.id, simulated: false });
      } else {
        // Return simulated checkout URL
        const simulatedUrl = `/stripe-sandbox-checkout?session_id=${transactionId}&userId=${userId}&gemsAmount=${gemsAmount}&cost=${cost}&packageId=${packageId}`;
        return res.json({ url: simulatedUrl, sessionId: transactionId, simulated: true });
      }
    } catch (error: any) {
      console.error("[Create Checkout Session Error]:", error);
      return res.status(500).json({ error: error.message });
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

    const { giftId, recipientId } = req.body;
    if (!giftId || !recipientId) {
      return res.status(400).json({ error: "Missing required parameters: giftId, recipientId" });
    }

    // Verify gift cost from trusted server-side template
    const giftCostMap: Record<string, number> = {
      quartz: 5,
      lotus: 20,
      chalice: 50,
      feather: 100,
      star: 200
    };

    const giftCost = giftCostMap[giftId as string];
    if (giftCost === undefined) {
      return res.status(400).json({ error: "Invalid gift ID" });
    }

    try {
      // Verify Firebase ID Token securely on the server
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const authenticatedUid = decodedToken.uid;

      const userRef = db.collection("users").doc(authenticatedUid);
      let successResponse = {};

      // Execute atomic transaction to prevent race conditions or duplicate deducts
      await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists) {
          throw new Error("User document not found in Firestore");
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

        // 2. Record immutable transaction safely in User's subcollection ledger
        const transactionId = "tx_spend_" + Date.now();
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
      if (errMsg.includes("Insufficient gem balance") || errMsg.includes("User document not found")) {
        return res.status(400).json({ error: errMsg });
      }
      return res.status(401).json({ error: "Unauthorized access or validation failure" });
    }
  });

  // --- API: PROCESS SIMULATED CASH TIP (Direct Transfer Check) ---
  app.post("/api/process-sandbox-tip", async (req, res) => {
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

  // Helper to verify if a hostname corresponds to a local environment
  const isLocalHost = (host: string | undefined): boolean => {
    if (!host) return false;
    const cleanHost = host.split(":")[0];
    return (
      cleanHost === "localhost" ||
      cleanHost === "127.0.0.1" ||
      cleanHost === "::1" ||
      cleanHost.endsWith(".local")
    );
  };

  // --- API: POST SIMULATE WEBHOOK SUCCESS (Used by Dev Simulator UI) ---
  app.post("/api/simulate-webhook-success", async (req, res) => {
    // 1. Strict Environment Locking:
    // Reject requests if we are in a production or staging environment.
    // Cloud run deployments run under process.env.NODE_ENV === "production" and are on non-local domains.
    const isProductionOrStaging = process.env.NODE_ENV === "production" || !isLocalHost(req.hostname);
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
    const trustedPackages: Record<string, { gems: number; cost: number }> = {
      gems_500: { gems: 500, cost: 4.99 },
      gems_1200: { gems: 1200, cost: 9.99 }
    };

    const pkg = trustedPackages[packageId as string];
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
      const { userId, gemsAmount, cost, packageId, transactionId } = metadata;
      const numGems = parseInt(gemsAmount, 10);
      const rawCost = parseFloat(cost);

      console.log(`[Stripe Secure Success] Initiating atomic transaction for User: ${userId}, Gems: ${numGems}, Session: ${transactionId}`);

      await db.runTransaction(async (transaction) => {
        // 1. Prevent duplicate event processing by logging processed webhooks
        const eventLogRef = db.collection("processed_stripe_events").doc(eventId);
        const eventLogSnap = await transaction.get(eventLogRef);

        if (eventLogSnap.exists) {
          console.log(`[Stripe Security] Webhook duplicate blocked. Event ID already processed: ${eventId}`);
          return;
        }

        // 2. Prevent duplicate credit for the exact checkout session/transaction ID
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
