import type express from "express";
import { getAuth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

type Guard = (req: express.Request, res: express.Response) => Promise<string | null>;
const PRIMARY_ADMIN_EMAIL = "kertisjohnson7@gmail.com";

export function registerAdminPanel(app: express.Express, db: Firestore, guard: Guard) {
  app.get("/api/admin/panel", async (req, res) => {
    if (!(await guard(req, res))) return;
    try {
      const [users, stats, records] = await Promise.all([
        db.collection("users").get(),
        db.collection("admin_settings").doc("financials").get(),
        db.collection("financial_records").orderBy("createdAt", "desc").limit(50).get()
      ]);
      const fields = ["email", "displayName", "avatarUrl", "role", "tarotReader", "suspended", "gemBalance", "cloutPoints", "createdAt"];
      return res.json({
        members: users.docs.map((doc) => {
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
    if (!["promote", "demote", "tarotReader", "suspend"].includes(action) ||
        (typeof uid !== "string" && typeof email !== "string") ||
        (["tarotReader", "suspend"].includes(action) && typeof enabled !== "boolean")) {
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
        if (action === "promote" && (!target.emailVerified || target.disabled || data.suspended === true)) throw new Error("verify-first");
        if ((action === "demote" && (target.email === PRIMARY_ADMIN_EMAIL || target.uid === actor)) ||
            (["suspend", "tarotReader"].includes(action) && (data.role === "admin" || target.email === PRIMARY_ADMIN_EMAIL))) {
          throw new Error("protected-admin");
        }
        const patch = action === "promote" ? { role: "admin" } : action === "demote" ? { role: "member" }
          : action === "tarotReader" ? { tarotReader: enabled } : { suspended: enabled };
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
