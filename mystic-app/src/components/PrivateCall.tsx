import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Mic, MicOff, PhoneOff, ShieldCheck, Video, VideoOff } from "lucide-react";
import { request, type Booking } from "../lib/scheduling";
import PrivateTarotPanel from "./PrivateTarotPanel";

type Role = "reader" | "member";
type JoinInfo = { role: Role; peerName: string; iceServers: RTCIceServer[]; turnConfigured: boolean; endMs: number; serverNowMs: number };
type Signal = { id: string; type: "ready" | "offer" | "answer" | "candidate" | "hangup"; callId: string; payload: { forCallId?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } | null; createdAtMs: number };

const POLL_MS = 1000;
const READY_REPEAT_MS = 4000;
const RECONNECT_AFTER_MS = 8000;
const newCallId = () => crypto.randomUUID().replace(/-/g, "");

/*
 * Private reader-client video. Media is device-to-device WebRTC; the server only relays SDP/ICE between the two
 * participants of one confirmed booking and rejects everyone else. The reader creates the offer.
 */
export default function PrivateCall({ booking, onLeave }: { booking: Booking; onLeave: () => void }) {
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const endCall = useRef<(notify: boolean) => void>(() => undefined);
  const [status, setStatus] = useState("Opening your private room…");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [peerName, setPeerName] = useState("");
  const [turnMissing, setTurnMissing] = useState(false);
  const [myRole, setMyRole] = useState<Role | null>(null);

  useEffect(() => {
    let disposed = false;
    let callId = newCallId();
    const base = `/api/scheduling/bookings/${encodeURIComponent(booking.id)}/call`;
    let pc: RTCPeerConnection | null = null;
    let role: Role = "member";
    let peerCallId = "";
    let remoteSet = false;
    let gotOffer = false;
    let cursor = 0;
    const seen = new Set<string>();
    const pendingCandidates: RTCIceCandidateInit[] = [];
    const timers: number[] = [];
    let dropTimer = 0;
    const peerNameRef = { current: "your guest" };

    const send = (type: Signal["type"], payload: unknown) =>
      request(`${base}/signal`, "POST", { type, callId, payload }).catch(() => undefined);

    const closePeer = () => {
      pc?.close();
      pc = null;
      remoteSet = false;
      pendingCandidates.length = 0;
      if (remoteVideo.current) remoteVideo.current.srcObject = null;
      setConnected(false);
    };

    const createPeer = (iceServers: RTCIceServer[], forCallId: string) => {
      closePeer();
      const peer = new RTCPeerConnection({ iceServers });
      pc = peer;
      localStream.current?.getTracks().forEach((track) => peer.addTrack(track, localStream.current!));
      peer.onicecandidate = (event) => {
        if (event.candidate) void send("candidate", { forCallId, candidate: event.candidate.toJSON() });
      };
      peer.ontrack = (event) => {
        if (remoteVideo.current && event.streams[0]) remoteVideo.current.srcObject = event.streams[0];
      };
      // The client restarts negotiation with a fresh call id; the reader answers by sending a new offer.
      const reconnect = () => {
        if (disposed || pc !== peer) return;
        if (role === "member") {
          closePeer();
          callId = newCallId();
          gotOffer = false;
          setStatus("Reconnecting…");
          void send("ready", null);
        } else {
          setStatus(`Waiting for ${peerNameRef.current} to reconnect…`);
        }
      };
      peer.onconnectionstatechange = () => {
        if (disposed || pc !== peer) return;
        window.clearTimeout(dropTimer);
        if (peer.connectionState === "connected") { setConnected(true); setStatus("Connected"); }
        else if (peer.connectionState === "connecting") setStatus("Connecting…");
        else if (peer.connectionState === "disconnected") { setConnected(false); setStatus("Connection interrupted. Reconnecting…"); dropTimer = window.setTimeout(reconnect, RECONNECT_AFTER_MS); }
        else if (peer.connectionState === "failed") {
          setConnected(false);
          setStatus("The connection failed. Retrying… Network restrictions may require a relay server.");
          dropTimer = window.setTimeout(reconnect, 1500);
        }
      };
      return peer;
    };

    const flushCandidates = async () => {
      while (pc && remoteSet && pendingCandidates.length) await pc.addIceCandidate(pendingCandidates.shift()!).catch(() => undefined);
    };

    const handleSignal = async (signal: Signal, info: JoinInfo) => {
      if (signal.type === "hangup") {
        closePeer();
        setEnded(true);
        setStatus(`${info.peerName} left the call.`);
        if (role === "member") {
          // Keep announcing readiness so the reader can reconnect after leaving and rejoining.
          callId = newCallId();
          gotOffer = false;
        }
        return;
      }
      if (role === "reader") {
        if (signal.type === "ready" && signal.callId !== peerCallId) {
          peerCallId = signal.callId;
          setEnded(false);
          setStatus("Connecting…");
          const peer = createPeer(info.iceServers, peerCallId);
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          await send("offer", { forCallId: peerCallId, sdp: offer });
        } else if (signal.callId === peerCallId && signal.type === "answer" && signal.payload?.sdp && pc && !remoteSet) {
          await pc.setRemoteDescription(signal.payload.sdp);
          remoteSet = true;
          await flushCandidates();
        } else if (signal.callId === peerCallId && signal.type === "candidate" && signal.payload?.candidate) {
          pendingCandidates.push(signal.payload.candidate);
          await flushCandidates();
        }
        return;
      }
      if (signal.payload?.forCallId !== callId) return;
      if (signal.type === "offer" && signal.payload.sdp && !gotOffer) {
        gotOffer = true;
        setEnded(false);
        setStatus("Connecting…");
        const peer = createPeer(info.iceServers, signal.callId);
        await peer.setRemoteDescription(signal.payload.sdp);
        remoteSet = true;
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        await send("answer", { forCallId: signal.callId, sdp: answer });
        await flushCandidates();
      } else if (signal.type === "candidate" && signal.payload.candidate) {
        pendingCandidates.push(signal.payload.candidate);
        await flushCandidates();
      }
    };

    const start = async () => {
      let info: JoinInfo;
      try {
        info = await request<JoinInfo>(`${base}/join`, "POST", {});
      } catch (joinError) {
        setError(joinError instanceof Error ? joinError.message : "Could not open the video room.");
        return;
      }
      if (disposed) return;
      role = info.role;
      cursor = info.serverNowMs;
      setPeerName(info.peerName);
      peerNameRef.current = info.peerName;
      setMyRole(info.role);
      setTurnMissing(!info.turnConfigured);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
        if (disposed) { stream.getTracks().forEach((track) => track.stop()); return; }
        localStream.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
      } catch {
        setError("Camera and microphone access is required. Allow access in your browser settings and try again.");
        return;
      }
      setStatus(`Waiting for ${info.peerName} to join…`);
      if (role === "member") {
        void send("ready", null);
        timers.push(window.setInterval(() => { if (!gotOffer) void send("ready", null); }, READY_REPEAT_MS));
      }
      let polling = false;
      timers.push(window.setInterval(async () => {
        if (polling || disposed) return;
        polling = true;
        try {
          const result = await request<{ signals: Signal[]; cursor: number }>(`${base}/signals?after=${cursor}`);
          cursor = result.cursor;
          for (const signal of result.signals) {
            if (seen.has(signal.id)) continue;
            seen.add(signal.id);
            await handleSignal(signal, info);
          }
        } catch (pollError) {
          const message = pollError instanceof Error ? pollError.message : "";
          if (/ended|no longer|not found/i.test(message)) { setEnded(true); setStatus("This video session has ended."); closePeer(); }
        } finally {
          polling = false;
        }
      }, POLL_MS));
    };

    endCall.current = (notify) => {
      if (notify) void send("hangup", null);
      window.clearTimeout(dropTimer);
      timers.forEach((timer) => window.clearInterval(timer));
      timers.length = 0;
      closePeer();
      localStream.current?.getTracks().forEach((track) => track.stop());
      localStream.current = null;
    };

    void start();
    return () => {
      disposed = true;
      endCall.current(false);
    };
  }, [booking.id]);

  const toggle = (kind: "audio" | "video") => {
    const tracks = kind === "audio" ? localStream.current?.getAudioTracks() : localStream.current?.getVideoTracks();
    if (!tracks?.length) return;
    const next = !tracks[0].enabled;
    tracks.forEach((track) => { track.enabled = next; });
    if (kind === "audio") setMicOn(next); else setCameraOn(next);
  };

  const leave = () => {
    endCall.current(true);
    onLeave();
  };

  return (
    <section className="mx-auto w-full max-w-4xl space-y-3 rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#1d123a]/95 to-[#09051a] p-3 sm:p-5" aria-label="Private video session">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-100"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Private session</p>
          <h2 className="truncate font-display text-xl text-white">{booking.readingType} · {peerName || "Connecting"}</h2>
        </div>
        <span role="status" className={`rounded-full border px-3 py-1 text-xs ${connected ? "border-emerald-300/40 text-emerald-200" : "border-amber-300/40 text-amber-100"}`}>{error ? "Unavailable" : status}</span>
      </header>

      {error ? (
        <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-950/25 p-4 text-sm text-rose-100">{error}</div>
      ) : (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
          <video ref={remoteVideo} autoPlay playsInline className="h-full w-full object-cover" />
          {!connected && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-sm text-slate-300">{ended ? null : <LoaderCircle className="h-6 w-6 animate-spin text-mystic-gold" />}<p className="px-6">{status}</p></div>}
          <video ref={localVideo} autoPlay playsInline muted className="absolute bottom-2 right-2 aspect-video w-28 rounded-lg border border-mystic-gold/50 bg-black object-cover sm:w-44" />
        </div>
      )}

      {myRole && !error && !ended && <PrivateTarotPanel bookingId={booking.id} role={myRole} />}

      {turnMissing && !error && <p className="text-[11px] text-slate-400">No relay (TURN) server is configured, so some restrictive networks may be unable to connect.</p>}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => toggle("audio")} disabled={Boolean(error)} aria-pressed={!micOn} aria-label={micOn ? "Mute microphone" : "Unmute microphone"} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10 disabled:opacity-40">{micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5 text-rose-300" />}</button>
        <button type="button" onClick={() => toggle("video")} disabled={Boolean(error)} aria-pressed={!cameraOn} aria-label={cameraOn ? "Turn camera off" : "Turn camera on"} className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10 disabled:opacity-40">{cameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5 text-rose-300" />}</button>
        <button type="button" onClick={leave} className="inline-flex h-12 items-center gap-2 rounded-full bg-rose-600 px-5 text-sm font-semibold text-white hover:bg-rose-500"><PhoneOff className="h-5 w-5" />{error || ended ? "Back to appointments" : "End call"}</button>
      </div>
    </section>
  );
}
