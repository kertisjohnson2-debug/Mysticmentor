// Shared liveness rule for liveSessions docs. A tab that closes or crashes can leave status "live" behind, so a session
// only counts as active while its heartbeat (updatedAt, or startedAt before the first beat) is recent.
export const LIVE_SESSION_HEARTBEAT_MS = 30_000;
// Display and joining: matches the client heartbeat (three missed beats).
export const LIVE_DISPLAY_STALE_MS = 90_000;
// Gifts and tips: a little more lenient to tolerate client clock skew.
export const LIVE_PAYMENT_STALE_MS = 5 * 60 * 1000;

export function isLiveSessionActive(session: { status?: unknown; updatedAt?: unknown; startedAt?: unknown } | null | undefined, nowMs: number, staleMs: number): boolean {
  if (!session || session.status !== "live") return false;
  const heartbeat = session.updatedAt ?? session.startedAt;
  return typeof heartbeat === "number" && Number.isFinite(heartbeat) && nowMs - heartbeat <= staleMs;
}
