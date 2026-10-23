// The single broadcaster rank ladder. Rank is earned only from lifetime Gems received through qualifying live gifts.
export const BROADCASTER_RANKS = [
  { name: "New Seer", gems: 0 },
  { name: "Mystic Adept", gems: 1000 },
  { name: "Oracle", gems: 5000 },
  { name: "High Oracle", gems: 15000 },
  { name: "Celestial Sage", gems: 40000 },
  { name: "Grand Mystic", gems: 100000 },
  { name: "Luna Master", gems: 250000 }
] as const;

export type BroadcasterRank = (typeof BROADCASTER_RANKS)[number];

export type BroadcasterRankProgress = {
  lifetimeGemsReceived: number;
  currentRank: BroadcasterRank;
  nextRank: BroadcasterRank | null;
  rankProgress: number;
  gemsToNextRank: number;
};

export function isValidLifetimeGems(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function getBroadcasterRankProgress(lifetimeGemsReceived: number): BroadcasterRankProgress | null {
  if (!isValidLifetimeGems(lifetimeGemsReceived)) return null;

  let currentRankIndex = 0;
  for (let index = 1; index < BROADCASTER_RANKS.length; index += 1) {
    if (BROADCASTER_RANKS[index].gems > lifetimeGemsReceived) break;
    currentRankIndex = index;
  }
  const currentRank = BROADCASTER_RANKS[currentRankIndex];
  const nextRank = BROADCASTER_RANKS[currentRankIndex + 1] ?? null;
  const rankProgress = nextRank
    ? Math.max(0, Math.min(1, (lifetimeGemsReceived - currentRank.gems) / (nextRank.gems - currentRank.gems)))
    : 1;
  const gemsToNextRank = nextRank ? Math.max(0, nextRank.gems - lifetimeGemsReceived) : 0;

  return { lifetimeGemsReceived, currentRank, nextRank, rankProgress, gemsToNextRank };
}

// users/{uid}.lifetimeGemsReceived is the only rank source; an absent field means no qualifying gifts yet.
export function getAuthoritativeBroadcasterRank(userData: { lifetimeGemsReceived?: unknown } | undefined) {
  if (!userData) return null;
  const stored = userData?.lifetimeGemsReceived;
  if (stored !== undefined && !isValidLifetimeGems(stored)) return null;
  return getBroadcasterRankProgress(stored ?? 0);
}
