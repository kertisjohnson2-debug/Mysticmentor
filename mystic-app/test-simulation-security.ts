/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";

// --- MOCK CONSTANTS & LOGIC ---
const PORT = 4444;
const BASE_URL = `http://localhost:${PORT}/api/simulate-webhook-success`;

// Helper function identical to the helper in server.ts
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

// Build the test Express app
const app = express();
app.use(express.json());

// Exact clone of the secured simulate-webhook-success endpoint for standalone isolated unit testing
app.post("/api/simulate-webhook-success", async (req, res) => {
  // Use custom test header for hostname if provided in unit test, otherwise default to req.hostname
  const hostname = (req.headers["x-test-hostname"] as string) || req.hostname;

  // 1. Strict Environment Locking:
  // Reject requests if we are in a production or staging environment.
  const isProductionOrStaging = process.env.NODE_ENV === "production" || !isLocalHost(hostname);
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

  // Parse authorization
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const idToken = authHeader.substring(7);
  if (!idToken || idToken !== "valid_test_token") {
    return res.status(401).json({ error: "Missing or invalid ID token" });
  }

  const { session_id, userId, gemsAmount, cost, packageId } = req.body;
  if (!session_id || !userId || !gemsAmount || !cost || !packageId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // Match user UID
  if (userId !== "test_user_123") {
    return res.status(403).json({ error: "Forbidden: You can only simulate purchases for your own account" });
  }

  // Trusted package validation
  const trustedPackages: Record<string, { gems: number; cost: number }> = {
    gems_500: { gems: 500, cost: 4.99 },
    gems_1200: { gems: 1200, cost: 9.99 }
  };

  const pkg = trustedPackages[packageId as string];
  if (!pkg) {
    return res.status(400).json({ error: "Invalid or untrusted package ID" });
  }

  return res.json({ success: true, eventId: "evt_sim_mock" });
});

async function runTests() {
  console.log("\n=======================================================");
  console.log("🔒 CELESTIAL SANCTUARY — ENDPOINT LOCKDOWN TEST SUITE");
  console.log("=======================================================\n");

  const server = app.listen(PORT, async () => {
    try {
      // Test 1: Disabled by Default (ENABLE_WEBHOOK_SIMULATION is not set)
      console.log("[Test 1] Testing Disabled-by-Default behavior in local dev...");
      delete process.env.ENABLE_WEBHOOK_SIMULATION;
      process.env.NODE_ENV = "development";

      const res1 = await fetch(BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer valid_test_token"
        },
        body: JSON.stringify({
          session_id: "sess_123",
          userId: "test_user_123",
          gemsAmount: 500,
          cost: 4.99,
          packageId: "gems_500"
        })
      });
      console.log(`- Status: ${res1.status} (Expected: 403)`);
      const data1 = await res1.json();
      console.log(`- Message: ${data1.error}`);
      if (res1.status !== 403 || !data1.error.includes("disabled by default")) {
        throw new Error("Test 1 Failed: Local development allowed simulation without explicit enablement!");
      }
      console.log("✅ Test 1 Passed: Correctly blocked by default in development.");

      // Test 2: Permitted Local Testing (Explicitly Enabled)
      console.log("\n[Test 2] Testing Permitted Local Testing (Enabled explicitly)...");
      process.env.ENABLE_WEBHOOK_SIMULATION = "true";
      process.env.NODE_ENV = "development";

      const res2 = await fetch(BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer valid_test_token"
        },
        body: JSON.stringify({
          session_id: "sess_123",
          userId: "test_user_123",
          gemsAmount: 500,
          cost: 4.99,
          packageId: "gems_500"
        })
      });
      console.log(`- Status: ${res2.status} (Expected: 200)`);
      const data2 = await res2.json();
      if (res2.status !== 200 || !data2.success) {
        throw new Error(`Test 2 Failed: Permitted local testing returned status ${res2.status}`);
      }
      console.log("✅ Test 2 Passed: Successfully simulated payment in explicitly enabled local development.");

      // Test 3: Production Rejection (With Explicit Setting Enabled)
      console.log("\n[Test 3] Testing Production Rejection (Even if explicitly set)...");
      process.env.ENABLE_WEBHOOK_SIMULATION = "true";
      process.env.NODE_ENV = "production";

      const res3 = await fetch(BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer valid_test_token"
        },
        body: JSON.stringify({
          session_id: "sess_123",
          userId: "test_user_123",
          gemsAmount: 500,
          cost: 4.99,
          packageId: "gems_500"
        })
      });
      console.log(`- Status: ${res3.status} (Expected: 403)`);
      const data3 = await res3.json();
      console.log(`- Message: ${data3.error}`);
      if (res3.status !== 403 || !data3.error.includes("disabled in production")) {
        throw new Error("Test 3 Failed: Simulation endpoint allowed request in NODE_ENV=production!");
      }
      console.log("✅ Test 3 Passed: Successfully rejected simulated payment in production environment.");

      // Test 4: Staging / Non-local Host Rejection
      console.log("\n[Test 4] Testing Staging Rejection (Non-local Host Header)...");
      process.env.ENABLE_WEBHOOK_SIMULATION = "true";
      process.env.NODE_ENV = "development";

      const res4 = await fetch(BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer valid_test_token",
          "x-test-hostname": "ais-staging.us-west2.run.app"
        },
        body: JSON.stringify({
          session_id: "sess_123",
          userId: "test_user_123",
          gemsAmount: 500,
          cost: 4.99,
          packageId: "gems_500"
        })
      });
      console.log(`- Status: ${res4.status} (Expected: 403)`);
      const data4 = await res4.json();
      console.log(`- Message: ${data4.error}`);
      if (res4.status !== 403 || !data4.error.includes("disabled in production")) {
        throw new Error("Test 4 Failed: Simulation endpoint allowed non-local host request!");
      }
      console.log("✅ Test 4 Passed: Successfully rejected simulated payment for public staging host.");

      console.log("\n🎉 ALL SECURED WEBHOOK SIMULATION ENDPOINT TESTS PASSED SUCCESSFULLY! 🎉\n");
      process.exit(0);
    } catch (err: any) {
      console.error("\n❌ TEST SUITE FAILURE:", err.message || err);
      process.exit(1);
    } finally {
      server.close();
    }
  });
}

runTests();
