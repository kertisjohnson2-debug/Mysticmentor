import { useEffect, useRef, useState } from "react";
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
import { db } from "../firebase";
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

// TURN relay goes here. Set VITE_TURN_URL (comma-separated), VITE_TURN_USERNAME and
// VITE_TURN_CREDENTIAL when a TURN service is available; no code change needed.
function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const env = import.meta.env as Record<string, string | undefined>;
  const turnUrls = env.VITE_TURN_URL?.split(",").map((url) => url.trim()).filter(Boolean);
  if (turnUrls?.length) {
    servers.push({ urls: turnUrls, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  }
  return servers;
}

const rtcConfig = (): RTCConfiguration => ({ iceServers: buildIceServers() });

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

function sendCandidates(pc: RTCPeerConnection, sessionId: string, viewerId: string, from: Candidate["from"]) {
  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    const payload: Candidate = { from, candidate: event.candidate.toJSON() };
    addDoc(candidatesRef(sessionId, viewerId), payload).catch(() => undefined);
  };
}

/** Broadcaster: captures camera/mic, publishes the session, and answers each viewer's offer. */
export type LiveSessionMeta = { name: string; avatar: string; avatarUrl: string; title: string; description: string; hashtags: string; topic: string };

export const LIVE_SESSION_HEARTBEAT_MS = 30000;

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

    const answerViewer = async (media: MediaStream, viewerId: string, offer: RTCSessionDescriptionInit) => {
      if (peers.has(viewerId)) return;
      const pc = new RTCPeerConnection(rtcConfig());
      const peer: { pc: RTCPeerConnection; unsubscribe?: Unsubscribe } = { pc };
      peers.set(viewerId, peer);
      media.getTracks().forEach((track) => pc.addTrack(track, media));
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") setViewerConnections(Array.from(peers.values()).filter((item) => item.pc.connectionState === "connected").length);
        if (pc.connectionState === "failed" || pc.connectionState === "closed") closePeer(viewerId);
      };
      sendCandidates(pc, sessionId, viewerId, "broadcaster");
      await pc.setRemoteDescription(offer);
      await pc.setLocalDescription(await pc.createAnswer());
      await updateDoc(doc(viewersRef(sessionId), viewerId), { answer: { type: "answer", sdp: pc.localDescription?.sdp ?? "" } });
      peer.unsubscribe = onSnapshot(candidatesRef(sessionId, viewerId), (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const data = change.doc.data() as Candidate;
          if (change.type === "added" && data.from === "viewer") pc.addIceCandidate(data.candidate).catch(() => undefined);
        });
      });
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
      streamRef.current = media;
      setStream(media);

      try {
        await setDoc(sessionRef(sessionId), { ownerUid: broadcasterUid, sessionId, status: "live", startedAt: Date.now(), updatedAt: Date.now(), ...metaRef.current });
        if (cancelled) return;
        requestNotification("/api/notify-live", { sessionId });
        sessionIdRef.current = sessionId;
        setPublishedSessionId(sessionId);
        heartbeat = window.setInterval(() => {
          updateDoc(sessionRef(sessionId), { updatedAt: Date.now() }).catch(() => undefined);
        }, LIVE_SESSION_HEARTBEAT_MS);
        setStatus("live");
        unsubscribeViewers = onSnapshot(viewersRef(sessionId), (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();
            if (change.type === "removed") closePeer(change.doc.id);
            else if (data.sessionId === sessionId && data.offer && !data.answer) {
              answerViewer(media, change.doc.id, data.offer as RTCSessionDescriptionInit).catch((err) => { console.error("Live viewer connection failed:", err); closePeer(change.doc.id); });
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
    const unsubscribe = onSnapshot(liveQuery, (snapshot) => {
      // If an account somehow has several sessions, join the newest
      const newest = snapshot.docs.map((item) => item.data()).sort((x, y) => (y.startedAt as number) - (x.startedAt as number))[0];
      const next = newest ? (newest.sessionId as string) : null;
      setSessionId(next);
      if (!next) { setStream(null); setStatus("waiting"); }
    }, () => setStatus("error"));
    return () => { unsubscribe(); setSessionId(null); setStream(null); setStatus("idle"); };
  }, [enabled, broadcasterUid]);

  useEffect(() => {
    if (!enabled || !broadcasterUid || !viewerUid || !sessionId) return;
    let cancelled = false;
    const viewerId = randomId();
    const viewerDoc = doc(viewersRef(sessionId), viewerId);
    const pc = new RTCPeerConnection(rtcConfig());
    const remote = new MediaStream();
    let unsubscribeAnswer: Unsubscribe | undefined;
    let unsubscribeCandidates: Unsubscribe | undefined;

    setStatus("connecting");
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (event) => {
      remote.addTrack(event.track);
      setStream(new MediaStream(remote.getTracks()));
    };
    pc.onconnectionstatechange = () => {
      if (cancelled) return;
      if (pc.connectionState === "connected") setStatus("connected");
      else if (pc.connectionState === "failed") setStatus("error");
    };
    sendCandidates(pc, sessionId, viewerId, "viewer");

    (async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer());
        await setDoc(viewerDoc, { viewerUid, sessionId, createdAt: Date.now(), offer: { type: "offer", sdp: pc.localDescription?.sdp ?? "" } });
        let answered = false;
        unsubscribeAnswer = onSnapshot(viewerDoc, (snapshot) => {
          const answer = snapshot.data()?.answer as RTCSessionDescriptionInit | undefined;
          if (!answer || answered || cancelled) return;
          answered = true;
          pc.setRemoteDescription(answer).then(() => {
            unsubscribeCandidates = onSnapshot(candidatesRef(sessionId, viewerId), (candidates) => {
              candidates.docChanges().forEach((change) => {
                const data = change.doc.data() as Candidate;
                if (change.type === "added" && data.from === "broadcaster") pc.addIceCandidate(data.candidate).catch(() => undefined);
              });
            });
          }).catch(() => setStatus("error"));
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
      pc.onicecandidate = null;
      pc.close();
      getDocs(candidatesRef(sessionId, viewerId))
        .then((items) => Promise.all(items.docs.map((item) => deleteDoc(item.ref))))
        .catch(() => undefined)
        .finally(() => deleteDoc(viewerDoc).catch(() => undefined));
    };
  }, [enabled, broadcasterUid, viewerUid, sessionId]);

  return { stream, status, sessionId };
}
