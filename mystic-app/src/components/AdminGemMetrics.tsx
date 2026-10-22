import { getAuthoritativeBroadcasterRank, isValidLifetimeGems } from "../lib/broadcasterRanks";

export default function AdminGemMetrics({ gemBalance, lifetimeGemsReceived }: { gemBalance?: unknown; lifetimeGemsReceived?: unknown }) {
  const rank = getAuthoritativeBroadcasterRank({ lifetimeGemsReceived });
  return <dl className="grid gap-3 sm:grid-cols-2">
    <div><dt className="text-slate-400">Spendable Gem balance</dt><dd>{isValidLifetimeGems(gemBalance) ? gemBalance.toLocaleString() : "Not available — missing or invalid balance"}</dd></div>
    <div><dt className="text-slate-400">Lifetime qualifying live-gift Gems received</dt><dd>{rank ? rank.lifetimeGemsReceived.toLocaleString() : "Not available — invalid qualifying total"}</dd></div>
    <div><dt className="text-slate-400">Broadcaster rank (existing ladder)</dt><dd>{rank?.currentRank.name || "Not available"}</dd></div>
    <div><dt className="text-slate-400">Qualifying progress</dt><dd>{rank ? rank.nextRank
      ? `${rank.gemsToNextRank.toLocaleString()} qualifying Gems to ${rank.nextRank.name}`
      : "Highest existing rank reached" : "Not available"}</dd></div>
  </dl>;
}
