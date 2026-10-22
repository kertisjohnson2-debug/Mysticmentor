import type express from "express";
import { FieldPath, type Firestore, type DocumentData } from "firebase-admin/firestore";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { EMAIL_CONSENT_VERSION, EMAIL_CONSENT_WORDING, readEmailConsent } from "./src/lib/emailConsent";
import { REPORT_TRANSITIONS } from "./src/lib/communityReports";
import { PRIVACY_VERSION, TERMS_VERSION } from "./src/lib/policies";

type Guard = (req: express.Request, res: express.Response) => Promise<string | null>;
const SAFE_ID = /^[a-zA-Z0-9_-]{1,128}$/;
const reportDate = (value: unknown): string | null => {
  if (typeof value === "string") return Number.isFinite(Date.parse(value)) ? value : null;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
};
function reportRecord(id: string, data: DocumentData) {
  return {
    id, postId: data.postId ?? "", replyId: data.replyId ?? null, targetType: data.targetType ?? "",
    reporterUid: data.reporterUid ?? "", targetAuthorUid: data.targetAuthorUid ?? null, reason: data.reason ?? "",
    details: data.details ?? "", status: data.status ?? "",
    createdAt: reportDate(data.createdAt), reviewedAt: reportDate(data.reviewedAt), reviewedBy: data.reviewedBy ?? null
  };
}
export const isAccountRestricted = (data?: { suspended?: unknown; banned?: unknown }) =>
  data?.suspended === true || data?.banned === true;

export function registerAccountRestrictions(app: express.Express, db: Firestore) {
  app.use("/api", async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) return next();
    let decoded: DecodedIdToken;
    try {
      decoded = await getAuth().verifyIdToken(header.substring(7), true);
    } catch {
      return res.status(401).json({ error: "Invalid or revoked ID token." });
    }
    try {
      const profile = await db.collection("users").doc(decoded.uid).get();
      if (isAccountRestricted(profile.data())) return res.status(403).json({ error: "Account suspended or banned. Contact Mysticmentor support.", code: "account-restricted" });
      return next();
    } catch (error) {
      console.error("[Account] Access check failed:", error);
      return res.status(503).json({ error: "Could not verify account access. Please retry." });
    }
  });
}

export function registerMemberManagement(app: express.Express, db: Firestore, adminGuard: Guard, memberGuard: Guard) {
  app.get("/api/admin/members/:uid/email-consent", async (req, res) => {
    if (!(await adminGuard(req, res))) return;
    const uid = req.params.uid;
    const after = req.query.after;
    if (typeof uid !== "string" || !SAFE_ID.test(uid) ||
        (after !== undefined && (typeof after !== "string" || !SAFE_ID.test(after)))) {
      return res.status(400).json({ error: "Invalid member or preference-history cursor." });
    }
    try {
      const ref = db.collection("memberEmailConsent").doc(uid);
      const current = await ref.get();
      let query = ref.collection("history").orderBy("recordedAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(26);
      if (typeof after === "string") {
        const cursor = await ref.collection("history").doc(after).get();
        if (!cursor.exists || typeof cursor.data()?.recordedAt !== "string") {
          return res.status(409).json({ error: "Preference history cursor is unavailable. Reload the history." });
        }
        query = query.startAfter(cursor);
      }
      const snapshot = await query.get();
      const page = snapshot.docs.slice(0, 25);
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        current: readEmailConsent(current.data()),
        history: page.map((item) => {
          const data = item.data();
          return {
            id: item.id, ...readEmailConsent(data),
            source: typeof data.source === "string" ? data.source : null,
            wording: typeof data.wording === "string" ? data.wording : null
          };
        }),
        nextCursor: snapshot.size > 25 ? page[page.length - 1].id : null
      });
    } catch (error) {
      console.error("[Admin] Email preference history failed:", error);
      return res.status(500).json({ error: "Could not load email preference history." });
    }
  });

  app.get("/api/admin/accounts", async (req, res) => {
    if (!(await adminGuard(req, res))) return;
    res.setHeader("Cache-Control", "no-store");
    const { pageToken, email } = req.query;
    if ((pageToken !== undefined && (typeof pageToken !== "string" || pageToken.length > 4096)) ||
        (email !== undefined && (typeof email !== "string" || !email.trim() || email.length > 254))) {
      return res.status(400).json({ error: "Invalid account search or cursor." });
    }
    try {
      const result = typeof email === "string"
        ? { users: [await getAuth().getUserByEmail(email.trim().toLowerCase())], pageToken: undefined }
        : await getAuth().listUsers(50, typeof pageToken === "string" ? pageToken : undefined);
      const profiles = result.users.length ? await db.getAll(...result.users.map((user) => db.collection("users").doc(user.uid))) : [];
      const consents = result.users.length ? await db.getAll(...result.users.map((user) => db.collection("memberEmailConsent").doc(user.uid))) : [];
      const fields = ["displayName", "role", "tarotReader", "suspended", "banned", "createdAt"];
      return res.json({
        members: result.users.map((user, index) => {
          const data = profiles[index]?.data() ?? {};
          return {
            uid: user.uid, email: user.email ?? "", displayName: user.displayName ?? "",
            ...Object.fromEntries(fields.filter((key) => data[key] !== undefined).map((key) => [key, data[key]])),
            hasProfile: profiles[index]?.exists === true,
            accountDisabled: user.disabled, emailVerified: user.emailVerified,
            emailConsent: readEmailConsent(consents[index]?.data())
          };
        }),
        nextCursor: result.pageToken ?? null
      });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "auth/user-not-found") return res.json({ members: [], nextCursor: null });
      if (code === "auth/invalid-page-token" || code === "auth/invalid-email") return res.status(400).json({ error: "Invalid account cursor or email. Restart the search." });
      console.error("[Admin] Account directory failed:", error);
      return res.status(500).json({ error: "Could not load account directory." });
    }
  });

  app.get("/api/members/me/email-consent", async (req, res) => {
    const uid = await memberGuard(req, res);
    if (!uid) return;
    try {
      return res.json(readEmailConsent((await db.collection("memberEmailConsent").doc(uid).get()).data()));
    } catch (error) {
      console.error("[Consent] Read failed:", error);
      return res.status(500).json({ error: "Could not load email preference." });
    }
  });

  app.post("/api/members/me/email-consent", async (req, res) => {
    const uid = await memberGuard(req, res);
    if (!uid) return;
    const { consented, onboarding, termsAccepted, termsVersion, privacyVersion } = req.body ?? {};
    if (typeof consented !== "boolean" || (onboarding !== undefined && typeof onboarding !== "boolean") ||
        (onboarding === true && termsAccepted !== true)) {
      return res.status(400).json({ error: "Choose an email preference and accept the required terms during registration." });
    }
    if (onboarding === true && (termsVersion !== TERMS_VERSION || privacyVersion !== PRIVACY_VERSION)) {
      return res.status(409).json({ error: "Policies have changed. Reload, review the current Terms and Privacy Policy, and accept again." });
    }
    try {
      const ref = db.collection("memberEmailConsent").doc(uid);
      const result = await db.runTransaction(async (tx) => {
        const profile = await tx.get(db.collection("users").doc(uid));
        if (!profile.exists || isAccountRestricted(profile.data())) throw new Error("account-unavailable");
        const stored = await tx.get(ref);
        const policyRef = db.collection("memberPolicyAcceptance").doc(uid);
        const policy = onboarding === true ? await tx.get(policyRef) : null;
        const recordedAt = new Date().toISOString();
        if (onboarding === true && (policy?.data()?.termsVersion !== TERMS_VERSION || policy?.data()?.privacyVersion !== PRIVACY_VERSION)) {
          const acceptance = { termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION, acceptedAt: recordedAt, actor: uid, source: "registration" };
          tx.set(policyRef, acceptance);
          tx.create(policyRef.collection("history").doc(), acceptance);
        }
        // Registration retries must never overwrite a later explicit account-settings choice.
        if (onboarding === true && stored.exists) return readEmailConsent(stored.data());
        const value = { consented, recordedAt, version: EMAIL_CONSENT_VERSION, wording: EMAIL_CONSENT_WORDING };
        tx.set(ref, value, { merge: true });
        tx.create(ref.collection("history").doc(), { ...value, source: onboarding === true ? "onboarding" : "account-settings", actor: uid });
        return readEmailConsent(value);
      });
      return res.json(result);
    } catch (error) {
      if (error instanceof Error && error.message === "account-unavailable") return res.status(403).json({ error: "Member account is unavailable." });
      console.error("[Consent] Save failed:", error);
      return res.status(500).json({ error: "Could not save email preference. Please retry in account settings." });
    }
  });

  app.get("/api/admin/members", async (req, res) => {
    if (!(await adminGuard(req, res))) return;
    res.setHeader("Cache-Control", "no-store");
    const after = req.query.after;
    const search = req.query.search ?? "";
    const searchBy = req.query.searchBy ?? "email";
    if (after !== undefined && (typeof after !== "string" || !SAFE_ID.test(after))) return res.status(400).json({ error: "Invalid member cursor." });
    if (typeof search !== "string" || search.length > 100 || typeof searchBy !== "string" || !["email", "displayName"].includes(searchBy)) return res.status(400).json({ error: "Invalid member search." });
    try {
      let query = search && searchBy === "displayName"
        ? db.collection("users").orderBy("displayName").orderBy(FieldPath.documentId()).startAt(search).endAt(`${search}\uf8ff`).limit(51)
        : (search ? db.collection("users").where("email", "==", search.trim().toLowerCase()) : db.collection("users")).orderBy(FieldPath.documentId()).limit(51);
      if (typeof after === "string") {
        if (search && searchBy === "displayName") {
          const cursor = await db.collection("users").doc(after).get();
          if (!cursor.exists || typeof cursor.data()?.displayName !== "string") return res.status(409).json({ error: "Search cursor changed. Start the search again." });
          query = query.startAfter(cursor.data()!.displayName, after);
        } else query = query.startAfter(after);
      }
      const snapshot = await query.get();
      const page = snapshot.docs.slice(0, 50);
      const consents = page.length ? await db.getAll(...page.map((item) => db.collection("memberEmailConsent").doc(item.id))) : [];
      const fields = ["displayName", "email", "role", "tarotReader", "suspended", "banned", "createdAt", "gemBalance", "lifetimeGemsReceived"];
      return res.json({
        members: page.map((item, index) => ({
          uid: item.id,
          ...Object.fromEntries(fields.filter((key) => item.data()[key] !== undefined).map((key) => [key, item.data()[key]])),
          emailConsent: readEmailConsent(consents[index]?.data())
        })),
        nextCursor: snapshot.size > 50 ? page[page.length - 1].id : null
      });
    } catch (error) {
      console.error("[Admin] Directory read failed:", error);
      return res.status(500).json({ error: "Could not load member directory." });
    }
  });

  app.post("/api/admin/members/edit", async (req, res) => {
    const actor = await adminGuard(req, res);
    if (!actor) return;
    const { uid, displayName } = req.body ?? {};
    if (typeof uid !== "string" || !SAFE_ID.test(uid) || typeof displayName !== "string" || !displayName.trim() || displayName.trim().length > 100) {
      return res.status(400).json({ error: "A member and a display name of 1–100 characters are required." });
    }
    try {
      const ref = db.collection("users").doc(uid);
      await db.runTransaction(async (tx) => {
        const before = await tx.get(ref);
        if (!before.exists) throw new Error("not-found");
        const createdAt = new Date().toISOString();
        tx.update(ref, { displayName: displayName.trim(), updatedAt: createdAt });
        tx.create(db.collection("adminAudit").doc(), { actor, targetUid: uid, action: "edit-display-name", before: before.data()?.displayName ?? null, displayName: displayName.trim(), createdAt });
      });
      return res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "not-found") return res.status(404).json({ error: "Member not found." });
      console.error("[Admin] Edit failed:", error);
      return res.status(500).json({ error: "Could not edit member." });
    }
  });

  app.get("/api/admin/reports", async (req, res) => {
    if (!(await adminGuard(req, res))) return;
    res.setHeader("Cache-Control", "no-store");
    const after = req.query.after;
    if (after !== undefined && (typeof after !== "string" || !SAFE_ID.test(after))) return res.status(400).json({ error: "Invalid report cursor." });
    try {
      let query = db.collection("communityReports").orderBy(FieldPath.documentId()).limit(26);
      if (typeof after === "string") query = query.startAfter(after);
      const snapshot = await query.get();
      const page = snapshot.docs.slice(0, 25);
      return res.json({
        reports: page.map((item) => reportRecord(item.id, item.data())),
        nextCursor: snapshot.size > 25 ? page[page.length - 1].id : null
      });
    } catch (error) {
      console.error("[Admin] Reports read failed:", error);
      return res.status(500).json({ error: "Could not load reports." });
    }
  });

  app.get("/api/admin/reports/:id", async (req, res) => {
    if (!(await adminGuard(req, res))) return;
    res.setHeader("Cache-Control", "no-store");
    const { id } = req.params;
    const { after } = req.query;
    if (typeof id !== "string" || !SAFE_ID.test(id) || (after !== undefined && (typeof after !== "string" || !SAFE_ID.test(after)))) {
      return res.status(400).json({ error: "Invalid report or history cursor." });
    }
    try {
      const ref = db.collection("communityReports").doc(id);
      const report = await ref.get();
      if (!report.exists) return res.status(404).json({ error: "Report not found." });
      let query = ref.collection("history").orderBy("createdAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(26);
      if (typeof after === "string") {
        const cursor = await ref.collection("history").doc(after).get();
        if (!cursor.exists || !reportDate(cursor.data()?.createdAt)) return res.status(409).json({ error: "Report history cursor is unavailable. Reload the report." });
        query = query.startAfter(cursor);
      }
      const snapshot = await query.get();
      const page = snapshot.docs.slice(0, 25);
      return res.json({
        report: reportRecord(report.id, report.data()!),
        history: page.map((item) => {
          const data = item.data();
          return { id: item.id, actor: data.actor ?? null, fromStatus: data.fromStatus ?? "", status: data.status ?? "", createdAt: reportDate(data.createdAt) };
        }),
        nextCursor: snapshot.size > 25 ? page[page.length - 1].id : null
      });
    } catch (error) {
      console.error("[Admin] Report detail failed:", error);
      return res.status(500).json({ error: "Could not load report details and history." });
    }
  });

  app.post("/api/admin/reports/review", async (req, res) => {
    const actor = await adminGuard(req, res);
    if (!actor) return;
    const { id, fromStatus, status } = req.body ?? {};
    if (typeof id !== "string" || !SAFE_ID.test(id) || typeof fromStatus !== "string" ||
        typeof status !== "string" || !Object.hasOwn(REPORT_TRANSITIONS, fromStatus) || !REPORT_TRANSITIONS[fromStatus].includes(status)) {
      return res.status(400).json({ error: "Invalid review status transition." });
    }
    try {
      const ref = db.collection("communityReports").doc(id);
      await db.runTransaction(async (tx) => {
        const original = await tx.get(ref);
        if (!original.exists) throw new Error("not-found");
        if (original.data()?.status !== fromStatus) throw new Error("stale-status");
        const reviewedAt = new Date().toISOString();
        const action = { actor, action: "report-review", reportId: id, fromStatus, status, createdAt: reviewedAt };
        tx.update(ref, { status, reviewedAt, reviewedBy: actor });
        tx.create(ref.collection("history").doc(), action);
        tx.create(db.collection("adminAudit").doc(), action);
      });
      return res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === "not-found") return res.status(404).json({ error: "Report not found." });
      if (error instanceof Error && error.message === "stale-status") return res.status(409).json({ error: "Another administrator updated this report. Refresh before reviewing." });
      console.error("[Admin] Report review failed:", error);
      return res.status(500).json({ error: "Could not update report status." });
    }
  });
}
