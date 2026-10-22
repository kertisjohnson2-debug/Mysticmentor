/*
 * Records live tips that Stripe shows as paid but the app never recorded (for example because no webhook endpoint was
 * configured). Read-only unless --apply is given. Test-mode keys only.
 *
 *   Dry run:  npx tsx scripts/recover-live-tips.ts <tipId> [<tipId> ...]
 *             npx tsx scripts/recover-live-tips.ts --pending-for=<recipientUid>
 *   Apply:    npx tsx scripts/recover-live-tips.ts <tipId> [<tipId> ...] --apply
 *
 * --apply passes Stripe's own checkout.session.completed event to the webhook's existing idempotent confirmLiveTipIn (the same code server.ts's confirmLiveTip runs),
 * and only for tips whose every verification check passed. Rerunning it, or a later webhook delivery, records nothing twice.
 */
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { confirmLiveTipIn, verifyPaidLiveTip } from "../liveTipRecovery";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const pendingFor = args.find((arg) => arg.startsWith("--pending-for="))?.slice("--pending-for=".length);
const tipIds = args.filter((arg) => !arg.startsWith("--"));
const key = process.env.STRIPE_SECRET_KEY || "";
if (!key.startsWith("sk_test_")) { console.error("Refusing: this script only runs with a Stripe test-mode key."); process.exit(2); }
const stripe = new Stripe(key);
// Same project and named database as server.ts, without loading the whole server for a read-only dry run.
const config = JSON.parse(readFileSync("./firebase-applet-config.json", "utf-8"));
const serviceAccount = process.env.MYSTICMENTOR_FIREBASE_SERVICE_ACCOUNT;
const db = getFirestore(initializeApp({ projectId: config.projectId, ...(serviceAccount ? { credential: cert(JSON.parse(serviceAccount)) } : {}) }, "recover-live-tips"), config.firestoreDatabaseId);
if (pendingFor) {
  const pending = await db.collection("liveTips").where("recipientUid", "==", pendingFor).where("status", "==", "pending").get();
  tipIds.push(...pending.docs.map((doc) => doc.id));
}
if (!tipIds.length) { console.error("Usage: npx tsx scripts/recover-live-tips.ts <tipId> [...] | --pending-for=<uid> [--apply]"); process.exit(2); }

let exitCode = 0;
for (const tipId of tipIds) {
  const result = await verifyPaidLiveTip(db, stripe, tipId, false);
  console.log(`\nTip ${tipId} (app status: ${String(result.appStatus)})`);
  console.log(`  ids: ${JSON.stringify(result.ids)}`);
  console.log(`  amounts (cents): ${JSON.stringify(result.amounts)}`);
  for (const item of result.checks) console.log(`  ${item.ok ? "OK  " : "FAIL"} ${item.name}${item.detail ? ` (${item.detail})` : ""}`);
  if (!result.verified || !result.event) { console.log("  -> NOT eligible; left unchanged."); exitCode = 1; continue; }
  if (result.appStatus === "completed") { console.log("  -> Already recorded; nothing to do."); continue; }
  if (!apply) { console.log("  -> Verified. Dry run only; rerun with --apply to record it."); continue; }
  await confirmLiveTipIn(db, result.event, result.event.data.object);
  const after = (await db.collection("liveTips").doc(tipId).get()).data();
  const processed = (await db.collection("processed_stripe_events").doc(result.event.id).get()).exists;
  console.log(`  -> Applied via the idempotent tip confirmation. Tip status now: ${after?.status}; event logged: ${processed}`);
  if (after?.status !== "completed" || !processed) exitCode = 1;
}
process.exit(exitCode);
