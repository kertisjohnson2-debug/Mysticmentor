process.env.FIRESTORE_EMULATOR_HOST = "localhost:8081";
import * as admin from "firebase-admin";
admin.initializeApp({ projectId: "demo-no-project" });

async function runTests() {
  const { processStripeEvent, db } = await import("./server.ts");
  const crypto = (await import("crypto")).default;
  
  console.log("Running Stripe Event Integration Tests...");

  // 1. Verify Connectivity
  try {
    await db.collection('_test_').doc('conn').set({ ok: true });
    console.log("✅ Emulator connectivity verified.");
  } catch (e) {
    console.error("❌ Failed to connect to emulator:", e);
    process.exit(1);
  }

  // Helper to create a mock event
  const createMockEvent = (txId: string, eventId: string) => ({
    id: eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: txId,
        metadata: {
          type: "gem_purchase",
          userId: "user123",
          gemsAmount: "500",
          cost: "4.99",
          packageId: "gems_500",
          transactionId: txId
        }
      }
    }
  } as any);

  // 2. Test Purchase
  await db.collection("users").doc("user123").set({ gemBalance: 0, email: "user@example.com" });
  
  const txId = "tx_" + crypto.randomUUID();
  const eventId = "evt_" + crypto.randomUUID();
  console.log("Testing purchase...");
  await processStripeEvent(createMockEvent(txId, eventId));

  // Verify state
  const userSnap = await db.collection("users").doc("user123").get();
  if (userSnap.data()?.gemBalance !== 500) throw new Error("Purchase failed: incorrect balance");
  console.log("✅ Purchase test passed.");

  // 3. Test Replay (Same txId, different eventId)
  const replayEventId = "evt_" + crypto.randomUUID();
  console.log("Testing replay...");
  await processStripeEvent(createMockEvent(txId, replayEventId));
  // Should NOT increase balance again
  const userSnap2 = await db.collection("users").doc("user123").get();
  if (userSnap2.data()?.gemBalance !== 500) throw new Error("Replay test failed: balance increased");
  console.log("✅ Replay test passed.");

  // 4. Test Concurrency (Same txId, same eventId - duplicate)
  console.log("Testing concurrency (duplicate attempts)...");
  await Promise.all([
    processStripeEvent(createMockEvent(txId, eventId)),
    processStripeEvent(createMockEvent(txId, eventId))
  ]);
  const userSnap3 = await db.collection("users").doc("user123").get();
  if (userSnap3.data()?.gemBalance !== 500) throw new Error("Concurrency test failed: balance increased");
  console.log("✅ Concurrency test passed.");
  
  console.log("All tests passed!");
}

runTests();
