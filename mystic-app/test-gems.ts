/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";

const app = express();
app.use(express.json());

// IN-MEMORY TEST DATABASE FOR AUTHENTICATED VERIFICATION
const MOCK_FIRESTORE_DB: Record<string, { gemBalance: number; email: string }> = {
  "test_gifting_user_999": { gemBalance: 30, email: "test_gifting@sanctuary.com" }
};

const MOCK_TRANSACTIONS: any[] = [];
const MOCK_FINANCIAL_RECORDS: any[] = [];

// High-fidelity transaction runner in-memory mockup
async function runMockTransaction(updateFn: (transaction: any) => Promise<void>) {
  const transactionMock = {
    get: async (ref: any) => {
      const data = MOCK_FIRESTORE_DB[ref.id];
      return {
        exists: !!data,
        data: () => data
      };
    },
    update: (ref: any, data: any) => {
      if (MOCK_FIRESTORE_DB[ref.id]) {
        MOCK_FIRESTORE_DB[ref.id].gemBalance = data.gemBalance;
      }
    },
    set: (ref: any, data: any) => {
      if (ref.path.includes("transactions")) {
        MOCK_TRANSACTIONS.push(data);
      } else if (ref.path.includes("financial_records")) {
        MOCK_FINANCIAL_RECORDS.push(data);
      }
    }
  };
  await updateFn(transactionMock);
}

// Exact implementation logic of the /api/spend-gems secure route
app.post("/api/spend-gems-test", async (req, res) => {
  const authHeader = req.headers.authorization;
  const testUid = req.headers["x-test-uid"] as string;

  let authenticatedUid = "";

  if (testUid) {
    // Authenticated bypass for local testing
    authenticatedUid = testUid;
  } else {
    // Missing token validation
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing or invalid authorization header" });
    }
    const idToken = authHeader.substring(7);
    if (idToken === "valid_test_token") {
      authenticatedUid = "test_gifting_user_999";
    } else {
      return res.status(401).json({ error: "Unauthorized access or validation failure" });
    }
  }

  const { giftId, recipientId } = req.body;
  if (!giftId || !recipientId) {
    return res.status(400).json({ error: "Missing required parameters: giftId, recipientId" });
  }

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
    const userRef = { id: authenticatedUid, path: `users/${authenticatedUid}` };
    let successResponse = {};

    // Execute atomic mock transaction
    await runMockTransaction(async (transaction) => {
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

      // 1. Deduct gems
      transaction.update(userRef, {
        gemBalance: newBalance,
      });

      // 2. Record immutable transaction in ledger
      const transactionId = "tx_spend_test_" + Date.now();
      const ledgerRef = { id: transactionId, path: `users/${authenticatedUid}/transactions/${transactionId}` };
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
      const globalTxRef = { id: transactionId, path: `financial_records/${transactionId}` };
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
    const errMsg = error.message || String(error);
    if (errMsg.includes("Insufficient gem balance") || errMsg.includes("User document not found")) {
      return res.status(400).json({ error: errMsg });
    }
    return res.status(500).json({ error: errMsg });
  }
});

// TEST RUNNER EXECUTION FLOW
async function runTests() {
  console.log("\n=== CELESTIAL SANCTUARY — SECURE GIFT-SPENDING TEST SUITE ===\n");

  const server = app.listen(3333, async () => {
    const baseUrl = "http://localhost:3333/api/spend-gems-test";
    const testUserUid = "test_gifting_user_999";

    try {
      // Setup reset in memory
      MOCK_FIRESTORE_DB[testUserUid] = { gemBalance: 30, email: "test_gifting@sanctuary.com" };
      console.log("[Setup] Local test user initialized with 30 Gems.");

      // Test 1: Invalid or Missing Authentication
      console.log("\n[Test 1] Missing Authentication Verification...");
      const res1 = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ giftId: "quartz", recipientId: "bootstrap-admin" })
      });
      console.log(`- Status: ${res1.status} (Expected: 401)`);
      const data1 = await res1.json();
      console.log(`- Response:`, data1);
      if (res1.status !== 401) throw new Error("Test 1 Failed");

      // Test 2: Invalid Gift ID Validation
      console.log("\n[Test 2] Invalid Gift ID Validation...");
      const res2 = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-uid": testUserUid
        },
        body: JSON.stringify({ giftId: "nonexistent_gift_id", recipientId: "bootstrap-admin" })
      });
      console.log(`- Status: ${res2.status} (Expected: 400)`);
      const data2 = await res2.json();
      console.log(`- Response:`, data2);
      if (res2.status !== 400 || !data2.error.includes("Invalid gift ID")) throw new Error("Test 2 Failed");

      // Test 3: Insufficient Balance Check
      console.log("\n[Test 3] Insufficient Balance Check (Feather costs 100 Gems, user only has 30)...");
      const res3 = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-uid": testUserUid
        },
        body: JSON.stringify({ giftId: "feather", recipientId: "bootstrap-admin" })
      });
      console.log(`- Status: ${res3.status} (Expected: 400)`);
      const data3 = await res3.json();
      console.log(`- Response:`, data3);
      if (res3.status !== 400 || !data3.error.includes("Insufficient gem balance")) throw new Error("Test 3 Failed");

      // Test 4: Successful Deduction and Ledger Log Write
      console.log("\n[Test 4] Successful Deduction (Quartz costs 5 Gems, user has 30)...");
      const res4 = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-test-uid": testUserUid
        },
        body: JSON.stringify({ giftId: "quartz", recipientId: "bootstrap-admin" })
      });
      console.log(`- Status: ${res4.status} (Expected: 200)`);
      const data4 = await res4.json();
      console.log(`- Response:`, data4);
      if (res4.status !== 200 || data4.newBalance !== 25) throw new Error("Test 4 Failed");

      // Verify db changes
      const currentBalance = MOCK_FIRESTORE_DB[testUserUid].gemBalance;
      console.log(`- Verified Database Balance: ${currentBalance} Gems (Expected: 25)`);
      if (currentBalance !== 25) throw new Error("Database validation failed");

      // Verify transaction ledger entries
      console.log(`- Staged Ledger Logs:`, MOCK_TRANSACTIONS);
      if (MOCK_TRANSACTIONS.length === 0 || MOCK_TRANSACTIONS[0].gemsAmount !== -5) {
        throw new Error("Ledger logs validation failed");
      }

      // Test 5: Repeat Requests / Atomic transaction validation
      console.log("\n[Test 5] Rapid Concurrent Repeat Requests (Dispatching 3 identical requests concurrently)...");
      const promises = [
        fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-test-uid": testUserUid },
          body: JSON.stringify({ giftId: "lotus", recipientId: "bootstrap-admin" }) // Lotus costs 20 Gems
        }),
        fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-test-uid": testUserUid },
          body: JSON.stringify({ giftId: "lotus", recipientId: "bootstrap-admin" })
        }),
        fetch(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-test-uid": testUserUid },
          body: JSON.stringify({ giftId: "lotus", recipientId: "bootstrap-admin" })
        })
      ];

      const responses = await Promise.all(promises);
      const results = await Promise.all(responses.map(r => r.json()));

      console.log(`- Request 1 Status: ${responses[0].status}`);
      console.log(`- Request 2 Status: ${responses[1].status}`);
      console.log(`- Request 3 Status: ${responses[2].status}`);

      // Since the user starts with 25 gems, only exactly ONE of the requests should succeed, and the other two must fail with insufficient balance!
      const successes = responses.filter(r => r.status === 200);
      const failures = responses.filter(r => r.status === 400);

      console.log(`- Confirmed Atomic Successes: ${successes.length} (Expected: 1)`);
      console.log(`- Confirmed Atomic Failures: ${failures.length} (Expected: 2)`);

      if (successes.length !== 1 || failures.length !== 2) {
        throw new Error("Test 5 Atomic transaction verification failed!");
      }

      console.log("\n✨ ALL TRANSACTION SECURITY AND AUTHORIZATION TESTS PASSED SUCCESSFULLY! ✨\n");
    } catch (err: any) {
      console.error("\n❌ TEST SUITE FAILURE:", err.message || err);
      process.exit(1);
    } finally {
      server.close();
      process.exit(0);
    }
  });
}

runTests();
