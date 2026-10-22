import { processStripeEvent, getDb } from './server';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

// Note: Using admin SDK because server.ts uses admin SDK.
// Ensure env var is set before import to make admin SDK connect to emulator.
// FIRESTORE_EMULATOR_HOST=localhost:9090 must be set in the shell.

async function runTests() {
  console.log("\n=== CELESTIAL SANCTUARY — REAL FIRESTORE INTEGRATION TESTS ===\n");
  
  const userId = "test_user_int_1";
  const transactionId = "tx_int_123";
  const pkg = { gems: 500, cost: 4.99 };
  
  // 1. Setup disposable user data
  await getDb().collection("users").doc(userId).set({
    gemBalance: 10,
    email: "test@sanctuary.com"
  });

  // Scenario 1: Normal Purchase
  const event1 = {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "sess_1",
        metadata: {
          type: "gem_purchase",
          userId,
          packageId: "gems_500",
          gemsAmount: "500",
          cost: "4.99",
          transactionId
        }
      }
    }
  };

  console.log("[Test 1] Normal Purchase...");
  await processStripeEvent(event1 as any);
  
  const userSnap = await getFirestore().collection("users").doc(userId).get();
  const userData = userSnap.data();
  console.log(`- Balance: ${userData?.gemBalance} (Expected: 510)`);
  if (userData?.gemBalance !== 510) throw new Error("Test 1 Failed: Balance mismatch");

  // Scenario 2: Duplicate Session (Different Event ID)
  // Should be blocked by transactionId duplication check
  const event2 = {
    id: "evt_2",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "sess_1",
        metadata: {
          type: "gem_purchase",
          userId,
          packageId: "gems_500",
          gemsAmount: "500",
          cost: "4.99",
          transactionId
        }
      }
    }
  };
  
  console.log("\n[Test 2] Duplicate Session (Different Event ID)...");
  await processStripeEvent(event2 as any);
  
  const userSnap2 = await getFirestore().collection("users").doc(userId).get();
  console.log(`- Balance: ${userSnap2.data()?.gemBalance} (Expected: 510)`);
  if (userSnap2.data()?.gemBalance !== 510) throw new Error("Test 2 Failed: Balance should not have increased");

  console.log("\n✨ REAL FIRESTORE EMULATOR INTEGRATION TESTS PASSED SUCCESSFULLY! ✨\n");
}

runTests().catch(err => {
  console.error("Test Failure:", err);
  process.exit(1);
});
