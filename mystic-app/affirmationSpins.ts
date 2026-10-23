import crypto from "node:crypto";
import type express from "express";
import type { Firestore } from "firebase-admin/firestore";
import { dailySpin, distinctSpin, DAILY_SPIN_LIMIT, SPIN_COMPLETE_MS, type AffirmationSpin } from "./src/lib/affirmations";

export const utcSpinDay = (now: number) => new Date(now).toISOString().slice(0, 10);
export const nextSpinReset = (now: number) => new Date(`${utcSpinDay(now)}T00:00:00Z`).getTime() + 86_400_000;
type PendingSpin = { id: string; spin: AffirmationSpin; startedAt: number };
type SpinDay = { completed?: number; last?: AffirmationSpin; lastId?: string; pending?: PendingSpin | null };
export const spinStatus = (data: SpinDay, now: number) => ({
  day: utcSpinDay(now), remaining: Math.max(0, DAILY_SPIN_LIMIT - (data.completed ?? 0)),
  resetsAt: nextSpinReset(now), last: data.last ?? dailySpin(new Date(`${utcSpinDay(now)}T12:00:00Z`))
});

export function registerAffirmationSpins(app: express.Express, db: Firestore, authenticate: (req: express.Request, res: express.Response) => Promise<string | null>) {
  const refFor = (uid: string, now: number) => db.collection("affirmationDays").doc(`${uid}_${utcSpinDay(now)}`);
  app.get("/api/affirmations/status", async (req, res) => {
    const uid = await authenticate(req, res);
    if (!uid) return;
    try {
      const now = Date.now();
      return res.json(spinStatus((await refFor(uid, now).get()).data() ?? {}, now));
    } catch (error) {
      console.error("[Affirmation] Status failed:", error);
      return res.status(500).json({ error: "Could not load today's spin allowance." });
    }
  });
  app.post("/api/affirmations/start", async (req, res) => {
    const uid = await authenticate(req, res);
    if (!uid) return;
    try {
      const now = Date.now();
      const result = await db.runTransaction(async (tx) => {
        const ref = refFor(uid, now);
        const data: SpinDay = (await tx.get(ref)).data() ?? {};
        const status = spinStatus(data, now);
        if (status.remaining === 0) return { ...status, pending: null };
        // A new attempt replaces an interrupted one without consuming a spin.
        const pending: PendingSpin = { id: crypto.randomUUID(), spin: distinctSpin(status.last), startedAt: now };
        tx.set(ref, { pending }, { merge: true });
        return { ...status, pending };
      });
      if (!result.pending) return res.status(429).json({ ...result, error: "All 10 daily spins are complete. Resets at midnight UTC." });
      return res.json(result);
    } catch (error) {
      console.error("[Affirmation] Start failed:", error);
      return res.status(500).json({ error: "Could not start a spin. No spin was counted." });
    }
  });
  app.post("/api/affirmations/complete", async (req, res) => {
    const uid = await authenticate(req, res);
    if (!uid) return;
    if (typeof req.body?.id !== "string" || !/^[a-f0-9-]{36}$/.test(req.body.id)) return res.status(400).json({ error: "Invalid spin identifier." });
    try {
      const now = Date.now();
      const result = await db.runTransaction(async (tx) => {
        const ref = refFor(uid, now);
        const data: SpinDay = (await tx.get(ref)).data() ?? {};
        if (data.lastId === req.body.id) return { ok: true, ...spinStatus(data, now) };
        if (!data.pending || data.pending.id !== req.body.id || now - data.pending.startedAt < SPIN_COMPLETE_MS ||
            now - data.pending.startedAt > 5 * 60_000 || (data.completed ?? 0) >= DAILY_SPIN_LIMIT) return { ok: false };
        const next = { completed: (data.completed ?? 0) + 1, last: data.pending.spin, lastId: data.pending.id, pending: null };
        tx.set(ref, next);
        return { ok: true, ...spinStatus(next, now) };
      });
      if (!result.ok) return res.status(409).json({ error: "Spin interrupted, replaced, or the UTC day changed. Refresh the allowance and try again." });
      return res.json(result);
    } catch (error) {
      console.error("[Affirmation] Completion failed:", error);
      return res.status(500).json({ error: "Could not confirm the completed spin. Refresh to check your allowance." });
    }
  });
}
