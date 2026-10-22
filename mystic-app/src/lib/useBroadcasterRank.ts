import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { getBroadcasterRankProgress, isValidLifetimeGems, type BroadcasterRankProgress } from "./broadcasterRanks";

export type BroadcasterRankState =
  | { status: "loading"; rank: null }
  | { status: "ready"; rank: BroadcasterRankProgress }
  | { status: "unavailable"; rank: null };

// Every broadcaster-rank display uses this hook: the server returns the authoritative users/{uid} lifetime total,
// and the shared helper turns it into rank, progress and Gems remaining. broadcasterStats only signals when to refresh.
export function useBroadcasterRank(uid: string | null): BroadcasterRankState {
  const [result, setResult] = useState<{ uid: string | null; state: BroadcasterRankState }>({
    uid: null, state: { status: "loading", rank: null }
  });

  useEffect(() => {
    const setState = (state: BroadcasterRankState) => setResult({ uid, state });
    setState({ status: "loading", rank: null });
    if (!uid) {
      setState({ status: "unavailable", rank: null });
      return;
    }
    let cancelled = false;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error("Not signed in");
        const response = await fetch(`/api/broadcasters/${encodeURIComponent(uid)}/rank`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || `Rank request failed (HTTP ${response.status})`);
        if (data?.uid !== uid || !isValidLifetimeGems(data?.lifetimeGemsReceived)) throw new Error("Invalid broadcaster rank response");
        const rank = getBroadcasterRankProgress(data.lifetimeGemsReceived);
        if (cancelled || current !== request) return;
        setState(rank ? { status: "ready", rank } : { status: "unavailable", rank: null });
      } catch (error) {
        if (!cancelled && current === request) {
          console.error("Failed to load broadcaster rank:", error);
          setState({ status: "unavailable", rank: null });
        }
      }
    };
    let unsubscribeStats: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      unsubscribeStats?.();
      unsubscribeStats = undefined;
      ++request;
      setState({ status: user ? "loading" : "unavailable", rank: null });
      if (!user) return;
      void refresh();
      unsubscribeStats = onSnapshot(doc(db, "broadcasterStats", uid), () => void refresh(), (error) => {
        console.error("Broadcaster rank live refresh unavailable:", error);
        void refresh();
      });
    });
    const onFocus = () => { if (auth.currentUser) void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      unsubscribeAuth();
      unsubscribeStats?.();
      window.removeEventListener("focus", onFocus);
    };
  }, [uid]);

  // Never display the previous broadcaster's result during the render before the UID effect runs.
  return result.uid === uid ? result.state : { status: uid ? "loading" : "unavailable", rank: null };
}
