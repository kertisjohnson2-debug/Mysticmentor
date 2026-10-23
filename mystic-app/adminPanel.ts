import type express from "express";
import { getAuth } from "firebase-admin/auth";
import { FieldPath, type Firestore } from "firebase-admin/firestore";
import { revenueRecord, REVENUE_LIMITATIONS } from "./src/lib/adminRevenue";
import { getAuthoritativeBroadcasterRank } from "./src/lib/broadcasterRanks";

type Guard = (req: express.Request, res: express.Response) => Promise<string | null>;
type FirebaseConfiguration = { projectId: string; firestoreDatabaseId: string };
const PRIMARY_ADMIN_EMAIL = "kertisjohnson7@gmail.com";

export function registerAdminPanel(app: express.Express, db: Firestore, guard: Guard, configuration?: FirebaseConfiguration) {
  app.get("/api/admin/diagnostics", async (req, res) => {
    if (!(await guard(req, res))) return;
    res.setHeader("Cache-Control", "no-store");
    return res.json({
      server: { status: "available", uptimeSeconds: Math.floor(process.uptime()) },
      firestore: {
        status: "admin-authorization-read-succeeded",
        detail: "The protected authorization path succeeded for this request. No separate connectivity probe was run."
      },
      configuration: configuration ? {
        status: "configured",
        projectId: configuration.projectId,
        firestoreDatabaseId: configuration.firestoreDatabaseId
      } : { status: "unavailable", projectId: null, firestoreDatabaseId: null },
      checksNotRun: [
        "Firestore quota limits and billing status — verify in Google Cloud Console for the configured project and database",
        "Stripe connectivity",
        "email delivery"
      ]
    });
  });

  app.get("/api/admin/rankings", async (req, res) => {
    if (!(await guard(req, res))) return;
    res.setHeader("Cache-Control", "no-store");
    const after = req.query.after;
    if (after !== undefined && (typeof after !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(after))) {
      return res.status(400).json({ error: "Invalid rankings cursor." });
    }
    let cursor: { gems: number; uid: string } | null = null;
    if (typeof after === "string") {
      try {
        const decoded = Buffer.from(after, "base64url").toString("utf8");
        const match = /^([0-9]{1,16})\|([A-Za-z0-9_-]{1,128})$/.exec(decoded);
        if (!match || Buffer.from(decoded).toString("base64url") !== after) return res.status(400).json({ error: "Invalid rankings cursor." });
        cursor = { gems: Number(match[1]), uid: match[2] };
        if (!Number.isSafeInteger(cursor.gems) || cursor.gems < 1) return res.status(400).json({ error: "Invalid rankings cursor." });
      } catch {
        return res.status(400).json({ error: "Invalid rankings cursor." });
      }
    }
    try {
      let query = db.collection("users")
        .where("lifetimeGemsReceived", ">", 0)
        .orderBy("lifetimeGemsReceived", "desc")
        .orderBy(FieldPath.documentId())
        .limit(26);
      if (cursor) query = query.startAfter(cursor.gems, cursor.uid);
      const snapshot = await query.get();
      const page = snapshot.docs.slice(0, 25);
      const last = page[page.length - 1];
      const lastGems = last?.data().lifetimeGemsReceived;
      return res.json({
        members: page.map((document) => {
          const data = document.data();
          const rank = getAuthoritativeBroadcasterRank(data);
          return {
            uid: document.id,
            displayName: typeof data.displayName === "string" ? data.displayName : null,
            lifetimeGemsReceived: rank?.lifetimeGemsReceived ?? null,
            currentRank: rank?.currentRank.name ?? null
          };
        }),
        nextCursor: snapshot.size > 25 && Number.isSafeInteger(lastGems) && lastGems > 0
          ? Buffer.from(`${lastGems}|${last.id}`).toString("base64url")
          : null
      });
    } catch (error) {
      console.error("[Admin] Broadcaster ranking read failed:", error);
      return res.status(500).json({ error: "Could not load broadcaster rankings." });
    }
  });

  app.get("/api/admin/revenue", async (req, res) => {
    if (!(await guard(req, res))) return;
    res.setHeader("Cache-Control", "no-store");
    const after = req.query.after;
    if (after !== undefined && (typeof after !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(after))) {
      return res.status(400).json({ error: "Invalid revenue cursor." });
    }
    try {
      let query = db.collection("financial_records").orderBy(FieldPath.documentId()).limit(26);
      if (typeof after === "string") query = query.startAfter(after);
      const snapshot = await query.get();
      const page = snapshot.docs.slice(0, 25);
      return res.json({
        records: page.map((item) => revenueRecord(item.id, item.data())),
        metrics: REVENUE_LIMITATIONS.map((item) => ({ ...item, value: null })),
        nextCursor: snapshot.size > 25 ? page[page.length - 1].id : null
      });
    } catch (error) {
      console.error("[Admin] Revenue read failed:", error);
      return res.status(500).json({ error: "Could not load revenue records. No revenue totals have been inferred." });
    }
  });

  app.get("/api/admin/panel", async (req, res) => {
    if (!(await guard(req, res))) return;
    res.setHeader("Cache-Control", "no-store");
    try {
      const [admins, readers, memberCount, stats, records] = await Promise.all([
        db.collection("users").where("role", "==", "admin").limit(100).get(),
        db.collection("users").where("tarotReader", "==", true).limit(100).get(),
        db.collection("users").count().get(),
        db.collection("admin_settings").doc("financials").get(),
        db.collection("financial_records").orderBy("createdAt", "desc").limit(50).get()
      ]);
      const users = new Map([...admins.docs, ...readers.docs].map((doc) => [doc.id, doc]));
      const fields = ["email", "displayName", "avatarUrl", "role", "tarotReader", "suspended", "gemBalance", "cloutPoints", "createdAt"];
      return res.json({
        memberCount: memberCount.data().count,
        staffTruncated: admins.size === 100 || readers.size === 100,
        members: [...users.values()].map((doc) => {
          const data = doc.data();
          return { uid: doc.id, ...Object.fromEntries(fields.filter((key) => data[key] !== undefined).map((key) => [key, data[key]])) };
        }),
        financials: stats.data() ?? null,
        records: records.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
      });
    } catch (error) {
      console.error("[Admin] Panel read failed:", error);
      return res.status(500).json({ error: "Could not load the administrator panel." });
    }
  });

  app.post("/api/admin/members/action", async (req, res) => {
    const actor = await guard(req, res);
    if (!actor) return;
    const { action, uid, email, enabled } = req.body ?? {};
    if (!["promote", "demote", "tarotReader", "suspend", "ban"].includes(action) ||
        (typeof uid !== "string" && typeof email !== "string") ||
        (typeof uid === "string" && !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) ||
        (["tarotReader", "suspend", "ban"].includes(action) && typeof enabled !== "boolean")) {
      return res.status(400).json({ error: "Invalid member action." });
    }
    try {
      const target = typeof uid === "string"
        ? await getAuth().getUser(uid)
        : await getAuth().getUserByEmail(email.trim().toLowerCase());
      const ref = db.collection("users").doc(target.uid);
      await db.runTransaction(async (tx) => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) throw new Error("profile-not-found");
        const data = snapshot.data()!;
        if (action === "promote" && (!target.emailVerified || target.disabled || data.suspended === true || data.banned === true)) throw new Error("verify-first");
        if ((action === "demote" && (target.email === PRIMARY_ADMIN_EMAIL || target.uid === actor)) ||
            (["suspend", "ban", "tarotReader"].includes(action) && (data.role === "admin" || target.email === PRIMARY_ADMIN_EMAIL || target.uid === actor))) {
          throw new Error("protected-admin");
        }
        const patch = action === "promote" ? { role: "admin" } : action === "demote" ? { role: "member" }
          : action === "tarotReader" ? { tarotReader: enabled } : action === "ban" ? { banned: enabled } : { suspended: enabled };
        tx.update(ref, { ...patch, updatedAt: new Date().toISOString() });
        tx.create(db.collection("adminAudit").doc(), { actor, targetUid: target.uid, action, ...patch, createdAt: new Date().toISOString() });
      });
      return res.json({ success: true });
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "protected-admin") return res.status(403).json({ error: "This administrator account is protected from that action." });
      if (code === "verify-first") return res.status(409).json({ error: "The member must verify their email and have an active account before promotion." });
      if (code === "profile-not-found" || (error as { code?: string }).code === "auth/user-not-found") return res.status(404).json({ error: "No registered member profile found." });
      console.error("[Admin] Member action failed:", error);
      return res.status(500).json({ error: "Could not save the member action." });
    }
  });
}
