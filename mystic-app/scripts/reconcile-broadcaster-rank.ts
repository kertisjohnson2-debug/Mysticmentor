/*
 * Broadcaster rank reconciliation for ONE account. Read-only unless --apply is given with the exact confirmation token
 * printed by a dry run. It only ever raises broadcasterStats/{uid}.lifetimeGemsReceived to the authoritative
 * users/{uid}.lifetimeGemsReceived, and only when that total is fully backed by completed live_gift_received records.
 *
 *   Dry run:  npx tsx scripts/reconcile-broadcaster-rank.ts <uid>
 *   Apply:    npx tsx scripts/reconcile-broadcaster-rank.ts <uid> --apply --confirm=<token from dry run>
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore, type Transaction } from "firebase-admin/firestore";
import { getBroadcasterRankProgress, isValidLifetimeGems } from "../src/lib/broadcasterRanks";
import { giftCostFor } from "../liveGifts";

type ReconcileEvidence = {
  authoritative: unknown;
  publicCopy: unknown;
  ledgerTotal: number;
  ledgerIssues: string[];
  userExists: boolean;
  publicExists: boolean;
};

export type ReconcilePlan = ReconcileEvidence & (
  | { action: "none" | "blocked"; reason: string }
  | { action: "update"; reason: string; token: string }
);

async function readPlan(db: Firestore, transaction: Transaction, uid: string): Promise<ReconcilePlan> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) throw new Error("Invalid account UID");
  const [userSnap, statsSnap, ledgerSnap] = await Promise.all([
    transaction.get(db.collection("users").doc(uid)),
    transaction.get(db.collection("broadcasterStats").doc(uid)),
    transaction.get(db.collection("users").doc(uid).collection("transactions").where("type", "==", "live_gift_received"))
  ]);
  let ledgerTotal = 0;
  const ledgerIssues: string[] = [];
  for (const document of ledgerSnap.docs) {
    const record = document.data();
    if (record.status !== "completed") continue;
    if (!isValidLifetimeGems(record.gemsAmount) || record.gemsAmount === 0 ||
        giftCostFor(record.giftId, true) !== record.gemsAmount ||
        typeof record.sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(record.sessionId) ||
        typeof record.viewerUid !== "string" || !record.viewerUid || record.viewerUid === uid) {
      ledgerIssues.push(`Completed gift record ${document.id} is malformed or does not match a qualifying gift cost`);
      continue;
    }
    ledgerTotal += record.gemsAmount;
  }
  if (!Number.isSafeInteger(ledgerTotal)) ledgerIssues.push("Ledger total exceeds the safe integer range");
  const authoritative = userSnap.data()?.lifetimeGemsReceived;
  const publicCopy = statsSnap.exists ? statsSnap.data()?.lifetimeGemsReceived : undefined;
  const evidence = { authoritative, publicCopy, ledgerTotal, ledgerIssues, userExists: userSnap.exists, publicExists: statsSnap.exists };
  if (!userSnap.exists) return { ...evidence, action: "blocked", reason: "users document does not exist" };
  if (!isValidLifetimeGems(authoritative)) return { ...evidence, action: "blocked", reason: "authoritative total is missing or not a valid non-negative integer" };
  if (publicCopy === authoritative) return { ...evidence, action: "none", reason: "public copy already matches the authoritative total; no historical total will be changed" };
  if (publicCopy !== undefined && !isValidLifetimeGems(publicCopy)) return { ...evidence, action: "blocked", reason: "public copy is malformed; review manually" };
  if (isValidLifetimeGems(publicCopy) && publicCopy > authoritative) return { ...evidence, action: "blocked", reason: "public copy is higher than the authoritative total; it will not be decreased without review" };
  if (ledgerIssues.length) return { ...evidence, action: "blocked", reason: "Completed gift records require review; no historical total will be changed" };
  if (ledgerTotal !== authoritative) return { ...evidence, action: "blocked", reason: `authoritative total differs from completed live_gift_received records by ${authoritative - ledgerTotal}; historical origin is unresolved` };
  const token = createHash("sha256").update(JSON.stringify({
    database: db.databaseId, uid,
    userVersion: userSnap.updateTime?.toDate().toISOString(),
    userNanos: userSnap.updateTime?.nanoseconds,
    publicVersion: statsSnap.updateTime?.toDate().toISOString(),
    publicNanos: statsSnap.updateTime?.nanoseconds,
    ledgerVersions: ledgerSnap.docs.map((document) => [document.id, document.updateTime.toDate().toISOString(), document.updateTime.nanoseconds]),
    authoritative, publicCopy
  })).digest("hex");
  return { ...evidence, action: "update", reason: "public copy is missing or lower than the ledger-backed authoritative total", token };
}

export function planReconciliation(db: Firestore, uid: string): Promise<ReconcilePlan> {
  return db.runTransaction((transaction) => readPlan(db, transaction, uid), { readOnly: true });
}

export async function applyReconciliation(db: Firestore, uid: string, token: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) throw new Error("Invalid account UID");
  const statsRef = db.collection("broadcasterStats").doc(uid);
  await db.runTransaction(async (transaction) => {
    const plan = await readPlan(db, transaction, uid);
    if (plan.action !== "update" || plan.token !== token) throw new Error("Data changed since the dry run or the confirmation token does not match; nothing was written. Run a new dry run.");
    transaction.set(statsRef, { lifetimeGemsReceived: plan.authoritative, updatedAt: Date.now(), reconciledAt: Date.now() }, { merge: true });
  });
  return planReconciliation(db, uid);
}

const describe = (label: string, value: unknown) => {
  const rank = isValidLifetimeGems(value) ? getBroadcasterRankProgress(value) : null;
  return `${label}: ${value === undefined ? "missing" : JSON.stringify(value)}${rank ? ` -> ${rank.currentRank.name}, ${Math.round(rank.rankProgress * 1000) / 10}%, ${rank.nextRank ? `${rank.gemsToNextRank} Gems to ${rank.nextRank.name}` : "highest rank"}` : ""}`;
};

if (process.argv[1]?.endsWith("reconcile-broadcaster-rank.ts")) {
  const [uid, ...flags] = process.argv.slice(2);
  if (!uid || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid) ||
      flags.some((flag) => flag !== "--apply" && !/^--confirm=[a-f0-9]{64}$/.test(flag))) {
    console.error("Usage: npx tsx scripts/reconcile-broadcaster-rank.ts <uid> [--apply --confirm=<token>]");
    process.exit(2);
  }
  const cfg = JSON.parse(readFileSync("firebase-applet-config.json", "utf8"));
  const sa = process.env.MYSTICMENTOR_FIREBASE_SERVICE_ACCOUNT;
  const app = initializeApp({ projectId: cfg.projectId, ...(sa ? { credential: cert(JSON.parse(sa)) } : {}) });
  const db = getFirestore(app, cfg.firestoreDatabaseId);
  const apply = flags.includes("--apply");
  const token = flags.find((f) => f.startsWith("--confirm="))?.slice("--confirm=".length);
  try {
    const plan = apply ? await applyReconciliation(db, uid, token ?? "") : await planReconciliation(db, uid);
    console.log(`${apply ? "APPLIED" : "DRY RUN (no writes)"} for ${uid} in project ${cfg.projectId}, database ${cfg.firestoreDatabaseId}`);
    console.log(`Observed at: ${new Date().toISOString()}; user document exists: ${plan.userExists}; public document exists: ${plan.publicExists}`);
    console.log(describe("Authoritative users total", plan.authoritative));
    console.log(describe("Public broadcasterStats copy", plan.publicCopy));
    console.log(`Completed qualifying live_gift_received ledger total: ${plan.ledgerTotal}`);
    if (isValidLifetimeGems(plan.authoritative) && plan.authoritative !== plan.ledgerTotal) {
      console.log(`Historical evidence gap: ${plan.authoritative - plan.ledgerTotal} Gems. Existing total preserved; origin requires review, not an automatic correction.`);
    }
    for (const issue of plan.ledgerIssues) console.log(`Ledger issue: ${issue}`);
    console.log(`Decision: ${plan.action} — ${plan.reason}`);
    if (!apply && plan.action === "update") console.log(`To apply only after explicit approval: --apply --confirm=${plan.token}`);
    process.exit(plan.action === "blocked" ? 1 : 0);
  } catch (error) {
    console.error("Broadcaster rank reconciliation failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
