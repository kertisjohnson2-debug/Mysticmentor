/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// 1. Force the Admin SDK to target the emulator strictly before any Firebase imports occur.
// This guarantees that we will never touch or leak to the production database.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";

const { db, processStripeEvent } = await import("./server.js");
import crypto from "crypto";

const TEST_USER_ID = `test_user_integration_${crypto.randomBytes(4).toString("hex")}`;
const PACKAGE_ID = "gems_500";
const GEMS_AMOUNT = 500;
const COST = 4.99;

// Pre-flight check to verify that the Firestore emulator is active on port 8080 and reachable
async function verifyEmulatorOnline() {
  console.log(`[Pre-flight] Verifying Firestore Emulator connection at ${process.env.FIRESTORE_EMULATOR_HOST}...`);
  try {
    // Attempt a quick document set to verify connectivity
    await db.collection("emulator_health").doc("ping").set({
      timestamp: new Date().toISOString(),
      active: true
    });
    console.log("✅ [Pre-flight] Firestore Emulator is ONLINE and reachable. Continuing tests safely.\n");
  } catch (error: any) {
    console.error("❌ [Pre-flight FAIL] Could not connect to local Firestore Emulator!");
    console.error(`Please ensure the emulator is running via 'npx firebase emulators:start --only firestore' on port 8080.`);
    console.error(`Error details: ${error.message || error}`);
    console.error("\n🔒 System Fails-Closed: Halting execution to prevent accidental production connection.");
    process.exit(1);
  }
}

async function runTests() {
  await verifyEmulatorOnline();

  console.log("=================================================================");
  console.log("🛡️ CELESTIAL SANCTUARY — WEBHOOK EMULATOR INTEGRATION TEST SUITE");
  console.log("=================================================================\n");

  try {
    // 1. SEED TEST DATABASE
    console.log(`[Setup] Seeding test user document for ID: ${TEST_USER_ID}`);
    const userRef = db.collection("users").doc(TEST_USER_ID);
    await userRef.set({
      uid: TEST_USER_ID,
      email: `${TEST_USER_ID}@sanctuary.test`,
      gemBalance: 100, // Starts with 100 gems
      createdAt: new Date().toISOString(),
    });

    // Verify initial balance
    const userSnapBefore = await userRef.get();
    console.log(`- Initial User Gem Balance: ${userSnapBefore.data()?.gemBalance} Gems`);

    // 2. SCENARIO 1: A Legitimate Single Purchase
    console.log("\n--- [Scenario 1] Processing a legitimate single purchase ---");
    const transactionId1 = `tx_sess_${crypto.randomUUID()}`;
    const eventId1 = `evt_stripe_${crypto.randomUUID()}`;

    const eventPayload1 = {
      id: eventId1,
      type: "checkout.session.completed",
      data: {
        object: {
          id: transactionId1,
          amount_total: Math.round(COST * 100),
          currency: "usd",
          payment_status: "paid",
          metadata: {
            userId: TEST_USER_ID,
            packageId: PACKAGE_ID,
            gemsAmount: GEMS_AMOUNT.toString(),
            cost: COST.toString(),
            type: "gem_purchase",
            transactionId: transactionId1,
          }
        }
      }
    };

    console.log(`- Dispatching Event: ${eventId1} for Session: ${transactionId1}`);
    await processStripeEvent(eventPayload1 as any);

    // Verify balances & logs after Scenario 1
    const userSnap1 = await userRef.get();
    const finalBalance1 = userSnap1.data()?.gemBalance;
    console.log(`- User Gem Balance: ${finalBalance1} Gems (Expected: 600)`);
    if (finalBalance1 !== 600) {
      throw new Error(`Scenario 1 Failed: Gem balance is ${finalBalance1}, expected 600.`);
    }

    // Verify transaction logs inside user subcollection
    const userLedgerSnap = await userRef.collection("transactions").doc(transactionId1).get();
    console.log(`- User Ledger Record Exists: ${userLedgerSnap.exists}`);
    if (!userLedgerSnap.exists) {
      throw new Error("Scenario 1 Failed: Ledger record missing from user subcollection.");
    }

    // Verify global financial records
    const globalTxSnap = await db.collection("financial_records").doc(transactionId1).get();
    console.log(`- Global Financial Record Exists: ${globalTxSnap.exists}`);
    if (!globalTxSnap.exists) {
      throw new Error("Scenario 1 Failed: Global financial record missing.");
    }

    // Verify event processed marker
    const eventLogSnap1 = await db.collection("processed_stripe_events").doc(eventId1).get();
    console.log(`- Webhook Event Marker Exists: ${eventLogSnap1.exists}`);
    if (!eventLogSnap1.exists) {
      throw new Error("Scenario 1 Failed: Processed event log missing.");
    }
    console.log("✅ [Scenario 1] Passed successfully.");

    // 3. SCENARIO 2: Replay of the same transaction (duplicate transaction ID) with a new Event ID
    console.log("\n--- [Scenario 2] Replaying same transaction ID with a new Stripe Event ID ---");
    const eventId2_replay = `evt_stripe_${crypto.randomUUID()}`;
    const eventPayload2_replay = {
      id: eventId2_replay,
      type: "checkout.session.completed",
      data: {
        object: {
          id: transactionId1, // Reusing transactionId1
          amount_total: Math.round(COST * 100),
          currency: "usd",
          payment_status: "paid",
          metadata: {
            userId: TEST_USER_ID,
            packageId: PACKAGE_ID,
            gemsAmount: GEMS_AMOUNT.toString(),
            cost: COST.toString(),
            type: "gem_purchase",
            transactionId: transactionId1,
          }
        }
      }
    };

    console.log(`- Dispatching Replay Event: ${eventId2_replay} with Duplicate Session: ${transactionId1}`);
    await processStripeEvent(eventPayload2_replay as any);

    // Verify balance has NOT increased (remains 600)
    const userSnap2 = await userRef.get();
    const finalBalance2 = userSnap2.data()?.gemBalance;
    console.log(`- User Gem Balance: ${finalBalance2} Gems (Expected: 600 - Blocked Duplicate)`);
    if (finalBalance2 !== 600) {
      throw new Error(`Scenario 2 Failed: Duplicate credit bypass! Gem balance is ${finalBalance2}, expected 600.`);
    }

    // Confirm that the new event ID is NOT logged as processed to conserve storage and audit integrity (or logged and rejected)
    const eventLogSnap2 = await db.collection("processed_stripe_events").doc(eventId2_replay).get();
    console.log(`- Webhook Replay Event ID Processed Log Exists: ${eventLogSnap2.exists} (Expected: false)`);
    if (eventLogSnap2.exists) {
      throw new Error("Scenario 2 Failed: Replay event logged as processed even though transaction was a duplicate.");
    }
    console.log("✅ [Scenario 2] Passed successfully. Session-level duplicate correctly rejected.");

    // 4. SCENARIO 3: Concurrent duplicate requests (sending overlapping webhooks for same session ID simultaneously)
    console.log("\n--- [Scenario 3] Concurrent overlapping webhook requests for new transaction ID ---");
    const transactionId3_concurrent = `tx_sess_${crypto.randomUUID()}`;
    const eventId3_a = `evt_stripe_${crypto.randomUUID()}`;
    const eventId3_b = `evt_stripe_${crypto.randomUUID()}`;

    const payload3_a = {
      id: eventId3_a,
      type: "checkout.session.completed",
      data: {
        object: {
          id: transactionId3_concurrent,
          amount_total: Math.round(COST * 100),
          currency: "usd",
          metadata: {
            userId: TEST_USER_ID,
            packageId: PACKAGE_ID,
            gemsAmount: GEMS_AMOUNT.toString(),
            cost: COST.toString(),
            type: "gem_purchase",
            transactionId: transactionId3_concurrent,
          }
        }
      }
    };

    const payload3_b = {
      id: eventId3_b,
      type: "checkout.session.completed",
      data: {
        object: {
          id: transactionId3_concurrent,
          amount_total: Math.round(COST * 100),
          currency: "usd",
          metadata: {
            userId: TEST_USER_ID,
            packageId: PACKAGE_ID,
            gemsAmount: GEMS_AMOUNT.toString(),
            cost: COST.toString(),
            type: "gem_purchase",
            transactionId: transactionId3_concurrent,
          }
        }
      }
    };

    console.log(`- Dispatching Thread A (Event: ${eventId3_a}) and Thread B (Event: ${eventId3_b}) concurrently...`);
    
    // Dispatch both processing requests concurrently
    const promises = [
      processStripeEvent(payload3_a as any),
      processStripeEvent(payload3_b as any)
    ];

    await Promise.allSettled(promises);

    // Verify balance has increased by EXACTLY one pack (600 + 500 = 1100 gems)
    const userSnap3 = await userRef.get();
    const finalBalance3 = userSnap3.data()?.gemBalance;
    console.log(`- Final User Gem Balance: ${finalBalance3} Gems (Expected: 1100 - Concurrent block successful)`);
    if (finalBalance3 !== 1100) {
      throw new Error(`Scenario 3 Failed: Concurrent updates leaked! Gem balance is ${finalBalance3}, expected 1100.`);
    }

    // Verify processed event logging. Exactly one event should be successfully marked
    const logSnap3_a = await db.collection("processed_stripe_events").doc(eventId3_a).get();
    const logSnap3_b = await db.collection("processed_stripe_events").doc(eventId3_b).get();
    console.log(`- Event A logged: ${logSnap3_a.exists}`);
    console.log(`- Event B logged: ${logSnap3_b.exists}`);
    
    const loggedEventsCount = (logSnap3_a.exists ? 1 : 0) + (logSnap3_b.exists ? 1 : 0);
    if (loggedEventsCount !== 1) {
      throw new Error(`Scenario 3 Failed: Processed event counts mismatch. Logged ${loggedEventsCount}, expected exactly 1.`);
    }

    // Verify financial aggregation
    const finRef = db.collection("admin_settings").doc("financials");
    const finSnap = await finRef.get();
    const fData = finSnap.data() || {};
    console.log(`- Financial Aggregation Gross Volume: $${fData.totalGrossVolume}`);
    console.log(`- Financial Aggregation Purchase Count: ${fData.purchaseCount}`);

    console.log("\n🏆 ALL EMULATOR INTEGRATION TESTS PASSED SUCCESSFULLY! 🏆\n");
    process.exit(0);
  } catch (error: any) {
    console.error("\n❌ TEST SUITE FAILURE:", error.message || error);
    process.exit(1);
  }
}

runTests();
