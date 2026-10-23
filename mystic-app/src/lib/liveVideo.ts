import { useEffect, useRef, useState } from "react";
import { isLiveSessionActive, LIVE_DISPLAY_STALE_MS, LIVE_SESSION_HEARTBEAT_MS } from "./liveSessionState";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  updateDoc,
  type Unsubscribe
} from "firebase/firestore";
import { auth, db } from "../firebase";
import { requestNotification } from "./notifications";

/*
 * Live video: device-to-device WebRTC. Firestore carries signaling only (never media).
 *
 *   liveSessions/{sessionId}                       one doc per broadcast (ownerUid = broadcaster)
 *   liveSessions/{sessionId}/viewers/{viewerId}    one doc per viewer connection (offer/answer)
 *   liveSessions/{sessionId}/viewers/{viewerId}/candidates/{id}   ICE candidates
 *   liveSessions/{sessionId}/events/{eventId}      chat messages and hearts shared by everyone in that session
 *
 * sessionId is random per broadcast (never the uid), so two sessions on one account cannot collide.
 * Viewers find the active session by querying ownerUid; viewerId is a per-connection id. The broadcaster keeps
 * one RTCPeerConnection per viewerId, so more viewers just means more entries in that map.
 * To move to an SFU later, only the broadcaster-side "one connection per viewer" logic changes.
 */

// STUN/TURN comes from the server at runtime (/api/live/ice-servers, the same TURN_URL / TURN_USERNAME /
// TURN_CREDENTIAL used by private calls). Build-time VITE_TURN_URL (comma-separated), VITE_TURN_USERNAME and
// VITE_TURN_CREDENTIAL remain a fallback. Without a TURN relay, devices on mobile/cellular networks usually cannot connect.
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const env = import.meta.env as Record<string, string | undefined>;
  const turnUrls = env.VITE_TURN_URL?.split(",").map((url) => url.trim()).filter(Boolean);
  if (turnUrls?.length) {
    servers.push({ urls: turnUrls, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  }
  return servers;
}

type IceConfig = { iceServers: RTCIceServer[]; turnConfigured: boolean };
let cachedIceConfig: IceConfig | null = null;

async function loadIceConfig(): Promise<IceConfig> {
  if (cachedIceConfig) return cachedIceConfig;
  const fallback = buildIceServers();
  const fallbackConfig = { iceServers: fallback, turnConfigured: fallback.length > 1 };
  try {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error("not signed in");
    const response = await fetch("/api/live/ice-servers", { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json() as Partial<IceConfig>;
    if (!Array.isArray(data.iceServers) || !data.iceServers.length) throw new Error("empty ICE server list");
    cachedIceConfig = data.turnConfigured || !fallbackConfig.turnConfigured ? { iceServers: data.iceServers, turnConfigured: Boolean(data.turnConfigured) } : fallbackConfig;
  } catch (err) {
    console.warn("[LiveVideo] Could not load ICE servers from the server; using built-in config:", err instanceof Error ? err.message : err);
    return fallbackConfig;
  }
  if (!cachedIceConfig.turnConfigured) console.warn("[LiveVideo] No TURN relay configured; video may fail between devices on mobile or restrictive networks.");
  return cachedIceConfig;
}

// Logs connection health without SDP, candidate addresses, or credentials.
function watchPeer(pc: RTCPeerConnection, role: Candidate["from"], turnConfigured: boolean) {
  const localTypes: Record<string, number> = {};
  pc.addEventListener("icecandidate", (event) => {
    if (event.candidate) localTypes[event.candidate.type ?? "unknown"] = (localTypes[event.candidate.type ?? "unknown"] ?? 0) + 1;
  });
  pc.addEventListener("icecandidateerror", (event) => {
    const { errorCode } = event as RTCPeerConnectionIceErrorEvent;
    if (errorCode !== 701) console.warn(`[LiveVideo] ${role} ICE server error`, { errorCode });
  });
  pc.addEventListener("iceconnectionstatechange", () => {
    if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "disconnected") {
      console.warn(`[LiveVideo] ${role} ICE ${pc.iceConnectionState}`, { turnConfigured, localCandidateTypes: { ...localTypes } });
    }
  });
  pc.addEventListener("connectionstatechange", () => {
    if (pc.connectionState === "failed") console.warn(`[LiveVideo] ${role} peer connection failed`, { iceState: pc.iceConnectionState, turnConfigured });
  });
}

const randomId = () => (crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9_-]/g, "");

type Candidate = { from: "viewer" | "broadcaster"; candidate: RTCIceCandidateInit };

export type LiveVideoStatus = "idle" | "requesting" | "live" | "connecting" | "connected" | "waiting" | "error";

const sessionRef = (sessionId: string) => doc(db, "liveSessions", sessionId);
const viewersRef = (sessionId: string) => collection(sessionRef(sessionId), "viewers");
export const eventsRef = (sessionId: string) => collection(sessionRef(sessionId), "events");
const candidatesRef = (sessionId: string, viewerId: string) => collection(doc(viewersRef(sessionId), viewerId), "candidates");

async function clearViewers(sessionId: string) {
  const events = await getDocs(eventsRef(sessionId)).catch(() => null);
  if (events) await Promise.all(events.docs.map((item) => deleteDoc(item.ref).catch(() => undefined)));
  const viewers = await getDocs(viewersRef(sessionId));
  await Promise.all(viewers.docs.map(async (viewer) => {
    const candidates = await getDocs(candidatesRef(sessionId, viewer.id));
    await Promise.all(candidates.docs.map((item) => deleteDoc(item.ref)));
    await deleteDoc(viewer.ref);
  }));
}

function sendCandidates(pc: RTCPeerConnection, sessionId: string, viewerId: string, from: Candidate["from"], ready = true) {
  const pending: Candidate[] = [];
  const send = (payload: Candidate) => {
    addDoc(candidatesRef(sessionId, viewerId), payload).catch((err) => console.warn(`[LiveVideo] ${from} ICE candidate not sent:`, err?.code ?? "unknown"));
  };
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    const payload: Candidate = { from, candidate: event.candidate.toJSON() };
    if (ready) send(payload);
    else pending.push(payload);
  };
  return () => {
    ready = true;
    pending.splice(0).forEach(send);
  };
}

function addRemoteCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit, role: Candidate["from"]) {
  pc.addIceCandidate(candidate).catch((err) => console.warn(`[LiveVideo] ${role} could not add remote ICE candidate:`, err?.name ?? err));
}

/** Broadcaster: captures camera/mic, publishes the session, and answers each viewer's offer. */
export type LiveSessionMeta = { name: string; avatar: string; avatarUrl: string; title: string; description: string; hashtags: string; topic: string };

export { LIVE_SESSION_HEARTBEAT_MS };

export function useLiveBroadcast(broadcasterUid: string | null, enabled: boolean, paused: boolean, meta?: LiveSessionMeta) {
  const metaRef = useRef<LiveSessionMeta | undefined>(meta);
  const sessionIdRef = useRef<string | null>(null);
  metaRef.current = meta;

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<LiveVideoStatus>("idle");
  const [error, setError] = useState("");
  const [viewerConnections, setViewerConnections] = useState(0);
  const [publishedSessionId, setPublishedSessionId] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    streamRef.current?.getTracks().forEach((track) => { track.enabled = !paused; });
  }, [paused, stream]);

  useEffect(() => {
    if (!enabled || !broadcasterUid) return;
    let cancelled = false;
    const peers = new Map<string, { pc: RTCPeerConnection; unsubscribe?: Unsubscribe }>();
    let unsubscribeViewers: Unsubscribe | undefined;
    const sessionId = randomId();
    let heartbeat: number | undefined;

    const closePeer = (viewerId: string) => {
      const peer = peers.get(viewerId);
      if (!peer) return;
      peer.unsubscribe?.();
      peer.pc.onicecandidate = null;
      peer.pc.close();
      peers.delete(viewerId);
      setViewerConnections(peers.size);
    };

    const answerViewer = async (media: MediaStream, ice: IceConfig, viewerId: string, offer: RTCSessionDescriptionInit) => {
      if (peers.has(viewerId)) return;
      const pc = new RTCPeerConnection({ iceServers: ice.iceServers });
      const peer: { pc: RTCPeerConnection; unsubscribe?: Unsubscribe } = { pc };
      peers.set(viewerId, peer);
      watchPeer(pc, "broadcaster", ice.turnConfigured);
      const liveTracks = media.getTracks().filter((track) => track.readyState === "live");
      if (!liveTracks.some((track) => track.kind === "video")) console.warn("[LiveVideo] broadcaster has no live camera track to send");
      liveTracks.forEach((track) => pc.addTrack(track, media));
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setViewerConnections(Array.from(peers.values()).filter((item) => item.pc.connectionState === "connected").length);
        if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(viewerId);
      };
      sendCandidates(pc, sessionId, viewerId, "broadcaster");
      await pc.setRemoteDescription(offer);
      if (cancelled || peers.get(viewerId) !== peer) return;
      await pc.setLocalDescription(await pc.createAnswer());
      if (cancelled || peers.get(viewerId) !== peer) return;
      await updateDoc(doc(viewersRef(sessionId), viewerId), { answer: { type: "answer", sdp: pc.localDescription?.sdp ?? "" } });
      if (cancelled || peers.get(viewerId) !== peer) return;
      peer.unsubscribe = onSnapshot(candidatesRef(sessionId, viewerId), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data() as Candidate;
          if (change.type === "added" && data.from === "viewer") addRemoteCandidate(pc, data.candidate, "broadcaster");
        });
      }, (err) => console.warn("[LiveVideo] broadcaster ICE candidate listener failed:", err.code));
    };

    // Unmount cleanup never runs when the tab is closed, which used to leave sessions marked "live" forever.
    // A bfcache-persisted page is only frozen: its heartbeat resumes on restore, so it is not ended.
    const endOnPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      window.clearInterval(heartbeat);
      deleteDoc(sessionRef(sessionId)).catch(() => undefined);
    };

    (async () => {
      setStatus("requesting");
      setError("");
      let media: MediaStream;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("Camera API unavailable", "NotSupportedError");
        media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        console.warn("[LiveVideo] Camera/microphone unavailable:", name || "UnknownError");
        setStatus("error");
        setError(name === "NotAllowedError"
          ? "Camera and microphone access was blocked. Allow access in your browser to share video."
          : name === "NotSupportedError"
            ? "This browser or connection can't access the camera. Open the app over https and try again."
            : name === "NotFoundError"
              ? "No camera or microphone was found on this device."
              : "Could not start your camera or microphone.");
        return;
      }
      if (cancelled) { media.getTracks().forEach((track) => track.stop()); return; }
      if (!media.getVideoTracks().length) console.warn("[LiveVideo] Camera returned no video track");
      if (!media.getAudioTracks().length) console.warn("[LiveVideo] Microphone returned no audio track");
      media.getTracks().forEach((track) => track.addEventListener("ended", () => console.warn(`[LiveVideo] broadcaster ${track.kind} track ended`)));
      streamRef.current = media;
      setStream(media);
      const ice = await loadIceConfig();
      if (cancelled) return;

      try {
        await setDoc(sessionRef(sessionId), { ownerUid: broadcasterUid, sessionId, status: "live", startedAt: Date.now(), updatedAt: Date.now(), ...metaRef.current });
        if (cancelled) return;
        requestNotification("/api/notify-live", { sessionId });
        sessionIdRef.current = sessionId;
        setPublishedSessionId(sessionId);
        heartbeat = window.setInterval(() => {
          updateDoc(sessionRef(sessionId), { updatedAt: Date.now() }).catch(() => undefined);
        }, LIVE_SESSION_HEARTBEAT_MS);
        window.addEventListener("pagehide", endOnPageHide);
        setStatus("live");
        unsubscribeViewers = onSnapshot(viewersRef(sessionId), (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            if (change.type === "removed") closePeer(change.doc.id);
            else if (data.sessionId === sessionId && data.offer && !data.answer) {
              answerViewer(media, ice, change.doc.id, data.offer as RTCSessionDescriptionInit).catch((err) => { console.error("Live viewer connection failed:", err); closePeer(change.doc.id); });
            }
          });
        }, (err) => { console.error("Live signaling failed:", err); setStatus("error"); setError("Live video signaling failed."); });
      } catch (err) {
        console.error("Failed to publish live session:", err);
        if (!cancelled) { setStatus("error"); setError("Could not publish your live video session."); }
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", endOnPageHide);
      sessionIdRef.current = null;
      setPublishedSessionId(null);
      unsubscribeViewers?.();
      Array.from(peers.keys()).forEach(closePeer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStream(null);
      setStatus("idle");
      setViewerConnections(0);
      clearViewers(sessionId).catch(() => undefined).finally(() => deleteDoc(sessionRef(sessionId)).catch(() => undefined));
    };
  }, [enabled, broadcasterUid]);

  const metaKey = meta ? JSON.stringify(meta) : "";
  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !metaRef.current) return;
    updateDoc(sessionRef(sessionId), { ...metaRef.current, updatedAt: Date.now() }).catch(() => undefined);
  }, [metaKey]);

  return { stream, status, error, viewerConnections, sessionId: publishedSessionId };
}

/** Viewer: joins the broadcaster's active session and receives the remote stream. */
export function useLiveViewer(broadcasterUid: string | null, viewerUid: string | null, enabled: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<LiveVideoStatus>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !broadcasterUid) return;
    setStatus("waiting");
    const liveQuery = query(collection(db, "liveSessions"), where("ownerUid", "==", broadcasterUid), where("status", "==", "live"));
    let docs: Record<string, unknown>[] = [];
    // Join the newest session that still has a recent heartbeat; abandoned sessions left marked "live" are ignored.
    const pick = () => {
      const now = Date.now();
      const newest = docs.filter((item) => isLiveSessionActive(item, now, LIVE_DISPLAY_STALE_MS)).sort((x, y) => (y.startedAt as number) - (x.startedAt as number))[0];
      const next = newest ? (newest.sessionId as string) : null;
      setSessionId(next);
      if (!next) { setStream(null); setStatus("waiting"); }
    };
    const unsubscribe = onSnapshot(liveQuery, (snapshot) => {
      docs = snapshot.docs.map((item) => item.data());
      pick();
    }, () => setStatus("error"));
    const recheck = window.setInterval(pick, LIVE_SESSION_HEARTBEAT_MS);
    return () => { unsubscribe(); window.clearInterval(recheck); setSessionId(null); setStream(null); setStatus("idle"); };
  }, [enabled, broadcasterUid]);

  useEffect(() => {
    if (!enabled || !broadcasterUid || !viewerUid || !sessionId) return;
    let cancelled = false;
    const viewerId = randomId();
    const viewerDoc = doc(viewersRef(sessionId), viewerId);
    const remote = new MediaStream();
    let pc: RTCPeerConnection | null = null;
    let unsubscribeAnswer: Unsubscribe | undefined;
    let unsubscribeCandidates: Unsubscribe | undefined;

    setStatus("connecting");
    (async () => {
      try {
        const ice = await loadIceConfig();
        if (cancelled) return;
        const peer = new RTCPeerConnection({ iceServers: ice.iceServers });
        pc = peer;
        watchPeer(peer, "viewer", ice.turnConfigured);
        peer.addTransceiver("video", { direction: "recvonly" });
        peer.addTransceiver("audio", { direction: "recvonly" });
        peer.ontrack = (event) => {
          if (cancelled) return;
          remote.addTrack(event.track);
          console.info("[LiveVideo] viewer remote track received", { kind: event.track.kind, muted: event.track.muted });
          setStream(remote);
        };
        peer.onconnectionstatechange = () => {
          if (cancelled) return;
          if (peer.connectionState === "connected") {
            setStatus("connected");
            if (!remote.getVideoTracks().length) console.warn("[LiveVideo] viewer connected but received no video track");
          } else if (peer.connectionState === "failed") setStatus("error");
        };
        // Candidate permissions depend on viewerUid in the parent document, which must be committed first.
        const flushCandidates = sendCandidates(peer, sessionId, viewerId, "viewer", false);

        await peer.setLocalDescription(await peer.createOffer());
        if (cancelled) return;
        await setDoc(viewerDoc, { viewerUid, sessionId, createdAt: Date.now(), offer: { type: "offer", sdp: peer.localDescription?.sdp ?? "" } });
        if (cancelled) { await deleteDoc(viewerDoc); return; }
        flushCandidates();
        let answered = false;
        unsubscribeAnswer = onSnapshot(viewerDoc, (snapshot) => {
          const answer = snapshot.data()?.answer as RTCSessionDescriptionInit | undefined;
          if (!answer || answered || cancelled) return;
          answered = true;
          peer.setRemoteDescription(answer).then(() => {
            if (cancelled) return;
            unsubscribeCandidates = onSnapshot(candidatesRef(sessionId, viewerId), (candidates) => {
              candidates.docChanges().forEach((change) => {
                const data = change.doc.data() as Candidate;
                if (change.type === "added" && data.from === "broadcaster") addRemoteCandidate(peer, data.candidate, "viewer");
              });
            }, (err) => console.warn("[LiveVideo] viewer ICE candidate listener failed:", err.code));
          }).catch((err) => {
            console.warn("[LiveVideo] viewer could not apply broadcaster answer:", err?.name ?? err);
            if (!cancelled) setStatus("error");
          });
        }, (err) => {
          console.warn("[LiveVideo] viewer answer listener failed:", err.code);
          if (!cancelled) setStatus("error");
        });
      } catch (err) {
        console.error("Failed to join live session:", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      unsubscribeAnswer?.();
      unsubscribeCandidates?.();
      if (pc) { pc.onicecandidate = null; pc.ontrack = null; pc.onconnectionstatechange = null; pc.close(); }
      remote.getTracks().forEach((track) => track.stop());
      setStream(null);
      getDocs(candidatesRef(sessionId, viewerId))
        .then((items) => Promise.all(items.docs.map((item) => deleteDoc(item.ref))))
        .catch(() => undefined)
        .finally(() => deleteDoc(viewerDoc).catch(() => undefined));
    };
  }, [enabled, broadcasterUid, viewerUid, sessionId]);

  return { stream, status, sessionId };
}
