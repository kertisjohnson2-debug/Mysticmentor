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
  updateDoc,
  where,
  type Unsubscribe
} from "firebase/firestore";
import { db } from "../firebase";

const randomId = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`)
    .replace(/[^a-zA-Z0-9_-]/g, "");

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

type Candidate = { from: "viewer" | "broadcaster"; candidate: RTCIceCandidateInit };

let diagnosticLog = "";
let diagnosticLines: string[] = [];
const diagnosticListeners = new Set<() => void>();

export const getLiveV2DiagnosticLog = () => diagnosticLog;
export function subscribeLiveV2Diagnostics(listener: () => void) {
  diagnosticListeners.add(listener);
  return () => { diagnosticListeners.delete(listener); };
}

// Temporary diagnostics: only allowlisted scalar fields, never SDP, addresses, or raw errors.
function liveV2Diagnostics(role: Candidate["from"], sessionId: string, viewerId?: string) {
  const log = (event: string, details: Record<string, string | number | boolean | null> = {}) => {
    const entry = {
      timestamp: new Date().toISOString(), role, sessionId, viewerId, event, ...details
    };
    console.info("LIVE_V2_DIAG", entry);
    diagnosticLines = [...diagnosticLines, `LIVE_V2_DIAG ${JSON.stringify(entry)}`].slice(-500);
    diagnosticLog = diagnosticLines.join("\n");
    diagnosticListeners.forEach((listener) => listener());
  };
  const error = (event: string, value: unknown) => {
    const code = typeof value === "object" && value !== null && "code" in value ? value.code : undefined;
    const allowedCodes = ["permission-denied", "unauthenticated", "unavailable", "deadline-exceeded", "not-found", "invalid-argument", "cancelled", "resource-exhausted", "failed-precondition", "aborted", "internal", "unknown"];
    log(event, {
      code: typeof code === "string" && allowedCodes.includes(code.replace(/^firestore\//, ""))
        ? code.replace(/^firestore\//, "") : "unclassified",
      name: value instanceof Error && ["InvalidStateError", "OperationError", "NotAllowedError", "NotFoundError", "NotSupportedError", "TypeError"].includes(value.name)
        ? value.name : "other"
    });
  };
  return { log, error };
}

function diagnosticCandidateType(candidate: RTCIceCandidateInit): string {
  const type = candidate.candidate?.match(/(?:^|\s)typ (host|srflx|prflx|relay)(?:\s|$)/)?.[1];
  return type ?? "unknown";
}

function observeLiveV2Peer(pc: RTCPeerConnection, diag: ReturnType<typeof liveV2Diagnostics>) {
  let disposed = false;
  const stats = async () => {
    try {
      const report = await pc.getStats();
      const selectedIds = new Set<string>();
      report.forEach((item) => {
        if (item.type === "transport" && typeof item.selectedCandidatePairId === "string") {
          selectedIds.add(item.selectedCandidatePairId);
        }
      });
      let pairs = 0;
      report.forEach((item) => {
        if (item.type !== "candidate-pair") return;
        pairs += 1;
        const local = report.get(item.localCandidateId);
        const remote = report.get(item.remoteCandidateId);
        const safeType = (type: unknown) => typeof type === "string" && ["host", "srflx", "prflx", "relay"].includes(type) ? type : "unavailable";
        diag.log("candidate-pair", {
          state: ["frozen", "waiting", "in-progress", "failed", "succeeded"].includes(item.state) ? item.state : "unavailable",
          selected: selectedIds.has(item.id) || item.selected === true,
          nominated: item.nominated === true,
          localType: safeType(local?.candidateType),
          remoteType: safeType(remote?.candidateType)
        });
      });
      diag.log("stats-summary", { candidatePairs: pairs, selectedPairExposed: selectedIds.size > 0 });
    } catch (err) {
      if (!disposed) diag.error("stats-unavailable", err);
    }
  };
  const state = () => {
    diag.log("peer-state", {
      iceGatheringState: pc.iceGatheringState,
      iceConnectionState: pc.iceConnectionState,
      connectionState: pc.connectionState
    });
    void stats();
  };
  const iceError = (event: RTCPeerConnectionIceErrorEvent) => {
    diag.log("ice-server-error", { errorCode: event.errorCode });
  };
  pc.addEventListener("icegatheringstatechange", state);
  pc.addEventListener("iceconnectionstatechange", state);
  pc.addEventListener("icecandidateerror", iceError);
  diag.log("ice-config", { turnConfigured: buildIceServers().some((server) =>
    (typeof server.urls === "string" ? [server.urls] : server.urls).some((url) => /^turns?:/.test(url))
  ) });
  state();
  return {
    state,
    dispose: () => {
      disposed = true;
      pc.removeEventListener("icegatheringstatechange", state);
      pc.removeEventListener("iceconnectionstatechange", state);
      pc.removeEventListener("icecandidateerror", iceError);
    }
  };
}

export type LiveVideoV2Status =
  | "idle"
  | "requesting"
  | "live"
  | "connecting"
  | "connected"
  | "waiting"
  | "error";

export type LiveSessionV2Meta = {
  name: string;
  avatar: string;
  avatarUrl: string;
  title: string;
  description: string;
  hashtags: string;
  topic: string;
};

const sessionRef = (sessionId: string) => doc(db, "liveSessions", sessionId);
const viewersRef = (sessionId: string) => collection(sessionRef(sessionId), "viewers");
export const eventsRefV2 = (sessionId: string) => collection(sessionRef(sessionId), "events");
const candidatesRef = (sessionId: string, viewerId: string) =>
  collection(doc(viewersRef(sessionId), viewerId), "candidates");

async function clearViewers(sessionId: string) {
  const viewers = await getDocs(viewersRef(sessionId));
  await Promise.all(viewers.docs.map(async (viewer) => {
    const candidates = await getDocs(candidatesRef(sessionId, viewer.id));
    await Promise.all(candidates.docs.map((candidate) => deleteDoc(candidate.ref)));
    await deleteDoc(viewer.ref);
  }));
}

function sendCandidates(
  pc: RTCPeerConnection,
  sessionId: string,
  viewerId: string,
  from: Candidate["from"],
  onError: (error: unknown) => void
) {
  const diag = liveV2Diagnostics(from, sessionId, viewerId);
  pc.onicecandidate = (event) => {
    if (!event.candidate) { diag.log("local-ice-complete"); return; }
    const payload: Candidate = { from, candidate: event.candidate.toJSON() };
    diag.log("local-candidate-generated", { type: diagnosticCandidateType(payload.candidate) });
    void addDoc(candidatesRef(sessionId, viewerId), payload).then(() => {
      diag.log("candidate-written", { type: diagnosticCandidateType(payload.candidate) });
    }).catch((err) => { diag.error("candidate-write-error", err); onError(err); });
  };
}

export function useLiveBroadcastV2(
  broadcasterUid: string | null,
  enabled: boolean,
  paused: boolean,
  meta?: LiveSessionV2Meta
) {
  const metaRef = useRef(meta);
  const sessionIdRef = useRef<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<LiveVideoV2Status>("idle");
  const [error, setError] = useState("");
  const [viewerConnections, setViewerConnections] = useState(0);
  const [publishedSessionId, setPublishedSessionId] = useState<string | null>(null);
  metaRef.current = meta;

  useEffect(() => {
    streamRef.current?.getTracks().forEach((track) => { track.enabled = !paused; });
  }, [paused, stream]);

  useEffect(() => {
    if (!enabled || !broadcasterUid) return;
    let cancelled = false;
    let heartbeat: number | undefined;
    let unsubscribeViewers: Unsubscribe | undefined;
    const peers = new Map<string, { pc: RTCPeerConnection; unsubscribe?: Unsubscribe; disposeDiagnostics?: () => void }>();
    const sessionId = randomId();
    const diag = liveV2Diagnostics("broadcaster", sessionId);

    const reportError = (message: string, err?: unknown) => {
      if (err) diag.error(message, err);
      if (cancelled) return;
      setStatus("error");
      setError(message);
    };

    const closePeer = (viewerId: string) => {
      const peer = peers.get(viewerId);
      if (!peer) return;
      peer.unsubscribe?.();
      peer.disposeDiagnostics?.();
      peer.pc.onicecandidate = null;
      peer.pc.close();
      peers.delete(viewerId);
      setViewerConnections(
        Array.from(peers.values()).filter((item) => item.pc.connectionState === "connected").length
      );
    };

    const answerViewer = async (media: MediaStream, viewerId: string, offer: RTCSessionDescriptionInit) => {
      if (peers.has(viewerId)) return;
      const diag = liveV2Diagnostics("broadcaster", sessionId, viewerId);
      diag.log("offer-received");
      const pc = new RTCPeerConnection(rtcConfig());
      const diagnostics = observeLiveV2Peer(pc, diag);
      const peer: { pc: RTCPeerConnection; unsubscribe?: Unsubscribe; disposeDiagnostics?: () => void } = { pc, disposeDiagnostics: diagnostics.dispose };
      peers.set(viewerId, peer);
      media.getTracks().forEach((track) => pc.addTrack(track, media));
      pc.onconnectionstatechange = () => {
        diagnostics.state();
        if (pc.connectionState === "connected") {
          setViewerConnections(
            Array.from(peers.values()).filter((item) => item.pc.connectionState === "connected").length
          );
        } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          closePeer(viewerId);
        }
      };
      sendCandidates(pc, sessionId, viewerId, "broadcaster", (err) =>
        reportError("Could not publish a broadcaster ICE candidate.", err)
      );
      await pc.setRemoteDescription(offer);
      diag.log("offer-applied");
      await pc.setLocalDescription(await pc.createAnswer());
      diag.log("answer-created");
      await updateDoc(doc(viewersRef(sessionId), viewerId), {
        answer: { type: "answer", sdp: pc.localDescription?.sdp ?? "" }
      });
      diag.log("answer-written");
      peer.unsubscribe = onSnapshot(
        candidatesRef(sessionId, viewerId),
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data() as Candidate;
            if (change.type === "added" && data.from === "viewer") {
              diag.log("remote-candidate-received", { type: diagnosticCandidateType(data.candidate) });
              void pc.addIceCandidate(data.candidate).then(() => diag.log("remote-candidate-applied", { type: diagnosticCandidateType(data.candidate) })).catch((err) =>
                reportError("Could not apply a viewer ICE candidate.", err)
              );
            }
          });
        },
        (err) => reportError("Could not receive viewer ICE candidates.", err)
      );
    };

    const endOnPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      window.clearInterval(heartbeat);
      void deleteDoc(sessionRef(sessionId)).catch((err) =>
        diag.error("pagehide-session-delete-error", err)
      );
    };

    const publish = async () => {
      setStatus("requesting");
      setError("");
      let media: MediaStream;
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new DOMException("Camera API unavailable", "NotSupportedError");
        }
        media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: true });
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        reportError(
          name === "NotAllowedError"
            ? "Camera and microphone access was blocked. Allow access in your browser to share video."
            : name === "NotSupportedError"
              ? "This browser or connection can't access the camera. Open the app over HTTPS and try again."
              : name === "NotFoundError"
                ? "No camera or microphone was found on this device."
                : "Could not start your camera or microphone.",
          err
        );
        return;
      }
      if (cancelled) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = media;
      setStream(media);

      try {
        const now = Date.now();
        await setDoc(sessionRef(sessionId), {
          ownerUid: broadcasterUid,
          sessionId,
          status: "live",
          startedAt: now,
          updatedAt: now,
          ...metaRef.current
        });
        if (cancelled) return;
        sessionIdRef.current = sessionId;
        setPublishedSessionId(sessionId);
        heartbeat = window.setInterval(() => {
          void updateDoc(sessionRef(sessionId), { updatedAt: Date.now() }).catch((err) =>
            reportError("The live session heartbeat failed; viewers may lose this broadcast.", err)
          );
        }, LIVE_SESSION_HEARTBEAT_MS);
        window.addEventListener("pagehide", endOnPageHide);
        setStatus("live");
        unsubscribeViewers = onSnapshot(
          viewersRef(sessionId),
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              const data = change.doc.data();
              if (change.type === "removed") closePeer(change.doc.id);
              else if (data.sessionId === sessionId && data.offer && !data.answer) {
                void answerViewer(media, change.doc.id, data.offer as RTCSessionDescriptionInit).catch((err) => {
                  liveV2Diagnostics("broadcaster", sessionId, change.doc.id).error("viewer-negotiation-error", err);
                  closePeer(change.doc.id);
                  reportError("Could not negotiate the viewer's WebRTC connection.", err);
                });
              }
            });
          },
          (err) => reportError("Live session signaling failed.", err)
        );
      } catch (err) {
        reportError("Could not publish your live video session. Check your account and Firestore access.", err);
      }
    };
    void publish();

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
      void clearViewers(sessionId)
        .catch((err) => diag.error("viewer-signaling-cleanup-error", err))
        .finally(() => deleteDoc(sessionRef(sessionId)).catch((err) =>
          diag.error("session-delete-error", err)
        ));
    };
  }, [enabled, broadcasterUid]);

  const metaKey = meta ? JSON.stringify(meta) : "";
  useEffect(() => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || !metaRef.current) return;
    void updateDoc(sessionRef(sessionId), { ...metaRef.current, updatedAt: Date.now() }).catch((err) => {
      liveV2Diagnostics("broadcaster", sessionId).error("metadata-write-error", err);
      setError("Could not update broadcast information.");
    });
  }, [metaKey]);

  return { stream, status, error, viewerConnections, sessionId: publishedSessionId };
}

export function useLiveViewerV2(
  broadcasterUid: string | null,
  viewerUid: string | null,
  enabled: boolean
) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<LiveVideoV2Status>("idle");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled || !broadcasterUid) return;
    setStatus("waiting");
    setError("");
    const liveQuery = query(
      collection(db, "liveSessions"),
      where("ownerUid", "==", broadcasterUid),
      where("status", "==", "live")
    );
    let documents: Record<string, unknown>[] = [];
    const selectSession = () => {
      const now = Date.now();
      const newest = documents
        .filter((item) => isLiveSessionActive(item, now, LIVE_DISPLAY_STALE_MS))
        .sort((left, right) => (right.startedAt as number) - (left.startedAt as number))[0];
      const nextId = newest ? newest.sessionId as string : null;
      setSessionId(nextId);
      if (!nextId) {
        setStream(null);
        setStatus("waiting");
      }
    };
    const unsubscribe = onSnapshot(
      liveQuery,
      (snapshot) => {
        documents = snapshot.docs.map((item) => item.data());
        selectSession();
      },
      (err) => {
        liveV2Diagnostics("viewer", "discovery").error("session-discovery-error", err);
        setError("Could not discover this broadcaster's live session.");
        setStatus("error");
      }
    );
    const recheck = window.setInterval(selectSession, LIVE_SESSION_HEARTBEAT_MS);
    return () => {
      unsubscribe();
      window.clearInterval(recheck);
      setSessionId(null);
      setStream(null);
      setStatus("idle");
    };
  }, [enabled, broadcasterUid]);

  useEffect(() => {
    if (!enabled || !broadcasterUid || !viewerUid || !sessionId) return;
    let cancelled = false;
    let answerApplied = false;
    const viewerId = randomId();
    const viewerDoc = doc(viewersRef(sessionId), viewerId);
    const pc = new RTCPeerConnection(rtcConfig());
    const remote = new MediaStream();
    const diag = liveV2Diagnostics("viewer", sessionId, viewerId);
    const diagnostics = observeLiveV2Peer(pc, diag);
    let unsubscribeAnswer: Unsubscribe | undefined;
    let unsubscribeCandidates: Unsubscribe | undefined;

    const fail = (message: string, err?: unknown) => {
      if (err) diag.error(message, err);
      if (cancelled) return;
      setError(message);
      setStatus("error");
    };
    setError("");
    setStatus("connecting");
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (event) => {
      if (!remote.getTracks().some((track) => track.id === event.track.id)) remote.addTrack(event.track);
      setStream(new MediaStream(remote.getTracks()));
    };
    pc.onconnectionstatechange = () => {
      if (cancelled) return;
      diagnostics.state();
      if (pc.connectionState === "connected") setStatus("connected");
      else if (pc.connectionState === "failed") fail("The WebRTC connection to the broadcaster failed.");
    };
    let viewerDocumentReady = false;
    const pendingCandidates: Candidate[] = [];
    const publishCandidate = (payload: Candidate) => {
      if (cancelled) return;
      void addDoc(candidatesRef(sessionId, viewerId), payload).then(() => {
        diag.log("candidate-written", { type: diagnosticCandidateType(payload.candidate) });
      }).catch((err) =>
        fail("Could not publish a viewer ICE candidate.", err)
      );
    };
    pc.onicecandidate = (event) => {
      if (cancelled) return;
      if (!event.candidate) { diag.log("local-ice-complete"); return; }
      const payload: Candidate = { from: "viewer", candidate: event.candidate.toJSON() };
      diag.log("local-candidate-generated", {
        type: diagnosticCandidateType(payload.candidate), buffered: !viewerDocumentReady
      });
      if (viewerDocumentReady) publishCandidate(payload);
      else pendingCandidates.push(payload);
    };

    const join = async () => {
      try {
        const offer = await pc.createOffer();
        diag.log("offer-created");
        await pc.setLocalDescription(offer);
        diag.log("offer-local-description-applied");
        if (cancelled) return;
        diag.log("offer-write-started");
        await setDoc(viewerDoc, {
          viewerUid,
          sessionId,
          createdAt: Date.now(),
          offer: { type: "offer", sdp: pc.localDescription?.sdp ?? "" }
        });
        diag.log("offer-written");
        if (cancelled) {
          void deleteDoc(viewerDoc).catch((err) =>
            diag.error("viewer-document-delete-error", err)
          );
          return;
        }
        viewerDocumentReady = true;
        diag.log("candidate-buffer-flush", { count: pendingCandidates.length });
        pendingCandidates.splice(0).forEach(publishCandidate);
        unsubscribeAnswer = onSnapshot(
          viewerDoc,
          (snapshot) => {
            const answer = snapshot.data()?.answer as RTCSessionDescriptionInit | undefined;
            if (!answer || answerApplied || cancelled) return;
            diag.log("answer-received");
            answerApplied = true;
            void pc.setRemoteDescription(answer).then(() => {
              diag.log("answer-applied");
              if (cancelled) return;
              unsubscribeCandidates = onSnapshot(
                candidatesRef(sessionId, viewerId),
                (candidates) => {
                  candidates.docChanges().forEach((change) => {
                    const data = change.doc.data() as Candidate;
                    if (change.type === "added" && data.from === "broadcaster") {
                      diag.log("remote-candidate-received", { type: diagnosticCandidateType(data.candidate) });
                      void pc.addIceCandidate(data.candidate).then(() => diag.log("remote-candidate-applied", { type: diagnosticCandidateType(data.candidate) })).catch((err) =>
                        fail("Could not apply a broadcaster ICE candidate.", err)
                      );
                    }
                  });
                },
                (err) => fail("Could not receive broadcaster ICE candidates.", err)
              );
            }).catch((err) => fail("Could not apply the broadcaster's WebRTC answer.", err));
          },
          (err) => fail("Could not receive the broadcaster's WebRTC answer.", err)
        );
      } catch (err) {
        pc.onicecandidate = null;
        pendingCandidates.length = 0;
        fail("Could not join the broadcaster's live session.", err);
      }
    };
    void join();

    return () => {
      cancelled = true;
      diagnostics.dispose();
      pendingCandidates.length = 0;
      unsubscribeAnswer?.();
      unsubscribeCandidates?.();
      pc.onicecandidate = null;
      pc.close();
      void getDocs(candidatesRef(sessionId, viewerId))
        .then((items) => Promise.all(items.docs.map((item) => deleteDoc(item.ref))))
        .catch((err) => diag.error("candidate-cleanup-error", err))
        .finally(() => deleteDoc(viewerDoc).catch((err) =>
          diag.error("viewer-document-delete-error", err)
        ));
    };
  }, [enabled, broadcasterUid, viewerUid, sessionId]);

  return { stream, status, sessionId, error };
}
