import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

async function testConnection() {
  console.log("Initializing admin...");
  admin.initializeApp({ projectId: 'demo-no-project' });
  const db = getFirestore();
  
  console.log("Writing to emulator...");
  await db.collection("test").doc("doc1").set({ val: 1 });
  
  console.log("Reading from emulator...");
  const snap = await db.collection("test").doc("doc1").get();
  
  if (snap.exists && snap.data()?.val === 1) {
    console.log("SUCCESS: Connected to emulator!");
  } else {
    console.log("FAILURE: Could not verify data in emulator.");
  }
}

testConnection().catch(err => {
  console.error("Connection Test Failure:", err);
  process.exit(1);
});
