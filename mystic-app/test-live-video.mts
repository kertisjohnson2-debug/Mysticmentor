import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";

// Runs the real viewer hook with deterministic browser/Firestore doubles; no network or camera access.
const source = readFileSync(new URL("./src/lib/liveVideo.ts", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "ts", format: "cjs", define: { "import.meta.env": "{}" } });

async function viewerTest(leaveDuringPublish: boolean) {
  type Ref = { path: string };
  type Track = { kind: string; stopped: boolean; stop(): void };
  const effects: (() => (() => void) | undefined)[] = [];
  const states: unknown[] = [];
  const listeners: { path: string; active: boolean; next: (snapshot: unknown) => void }[] = [];
  const candidates: unknown[] = [];
  const transceivers: string[] = [];
  const warnings: unknown[][] = [];
  let stateIndex = 0;
  let parentExists = false;
  let publishStarted = false;
  let commitOffer = () => {};
  const publishing = new Promise<void>((resolve) => { commitOffer = resolve; });
  const ref = (parent: Ref, ...parts: string[]) => ({ path: [parent.path, ...parts].filter(Boolean).join("/") });
  const track: Track = { kind: "video", stopped: false, stop() { this.stopped = true; } };
  class Stream {
    constructor(private tracks: Track[] = []) {}
    addTrack(value: Track) { this.tracks.push(value); }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter((value) => value.kind === "video"); }
  }
  let peer: Peer | undefined;
  class Peer {
    onicecandidate: ((event: { candidate: { toJSON(): object } }) => void) | null = null;
    ontrack: ((event: { track: Track }) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    connectionState = "new";
    localDescription = { type: "offer", sdp: "test-offer" };
    remoteDescription: unknown = null;
    constructor() { peer = this; }
    addEventListener() {}
    addTransceiver(kind: string, options: { direction: string }) { transceivers.push(`${kind}:${options.direction}`); }
    async createOffer() { return this.localDescription; }
    async setLocalDescription() { this.emitCandidate("early"); }
    async setRemoteDescription(answer: unknown) { this.remoteDescription = answer; }
    emitCandidate(label: string) { this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: label }) } }); }
    close() { this.connectionState = "closed"; }
  }
  const firestore = {
    doc: ref, collection: ref, query: (value: Ref) => value, where: () => ({}),
    async setDoc() {
      publishStarted = true;
      await publishing;
      parentExists = true;
    },
    async addDoc(_ref: Ref, payload: unknown) {
      assert(parentExists, "ICE candidate must not be written before the viewer document is committed");
      candidates.push(payload);
    },
    async deleteDoc(value: Ref) { if (!value.path.includes("/candidates/")) parentExists = false; },
    async getDocs() { return { docs: [] }; },
    onSnapshot(value: Ref, next: (snapshot: unknown) => void) {
      const listener = { path: value.path, active: true, next };
      listeners.push(listener);
      return () => { listener.active = false; };
    },
  };
  const modules: Record<string, unknown> = {
    react: {
      useState(initial: unknown) {
        const index = stateIndex++;
        states[index] = index === 2 ? "test-session" : initial;
        return [states[index], (value: unknown) => { states[index] = value; }];
      },
      useEffect(effect: () => (() => void) | undefined) { effects.push(effect); },
    },
    "firebase/firestore": firestore,
    "../firebase": { db: { path: "" }, auth: { currentUser: { async getIdToken() { return "test-token"; } } } },
    "./liveSessionState": { LIVE_SESSION_HEARTBEAT_MS: 30000 },
    "./notifications": {},
  };
  const module: { exports: { useLiveViewer?: (broadcaster: string, viewer: string, enabled: boolean) => void } } = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports,
    require(name: string) { assert(name in modules, `Unexpected import: ${name}`); return modules[name]; },
    console: { info() {}, warn: (...args: unknown[]) => warnings.push(args), error: (...args: unknown[]) => warnings.push(args) },
    crypto: { randomUUID: () => "test-viewer" },
    window: { setInterval: () => 1, clearInterval() {} },
    RTCPeerConnection: Peer, MediaStream: Stream,
    async fetch() {
      return { ok: true, async json() { return { iceServers: [{ urls: ["stun:test.invalid"] }], turnConfigured: false }; } };
    },
  });
  module.exports.useLiveViewer!("broadcaster", "viewer", true);
  const cleanups = effects.map((effect) => effect());
  await setImmediate();
  assert(publishStarted);
  assert(peer);
  assert.deepEqual(transceivers, ["video:recvonly", "audio:recvonly"]);
  peer.emitCandidate("during-write");
  await setImmediate();
  assert.equal(candidates.length, 0, "early candidates must be buffered, not sent or discarded");
  if (leaveDuringPublish) cleanups[1]?.();
  commitOffer();
  await setImmediate();
  if (leaveDuringPublish) {
    assert.equal(parentExists, false, "leaving during publication must not leave a viewer document behind");
    assert.equal(candidates.length, 0);
    assert.equal(peer.connectionState, "closed");
    assert(!listeners.some((listener) => listener.active && listener.path.includes("/viewers/")));
  } else {
    assert.equal(candidates.length, 2, "all buffered candidates must be flushed after commit");
    peer.emitCandidate("late");
    await setImmediate();
    assert.equal(candidates.length, 3);
    const answerListener = listeners.find((listener) => listener.path.endsWith("/viewers/test-viewer"));
    assert(answerListener);
    answerListener.next({ data: () => ({ answer: { type: "answer", sdp: "test-answer" } }) });
    await setImmediate();
    assert(peer.remoteDescription, "viewer must apply the broadcaster answer");
    assert(listeners.some((listener) => listener.active && listener.path.endsWith("/candidates")));
    peer.ontrack?.({ track });
    const received = states[0] as Stream;
    assert.equal(received.getVideoTracks()[0], track, "the exposed stream must contain the remote video track");
    const audioTrack: Track = { kind: "audio", stopped: false, stop() { this.stopped = true; } };
    peer.ontrack?.({ track: audioTrack });
    assert.equal(states[0], received, "a second track must not replace the stream and restart video playback");
    assert.equal(received.getTracks()[1], audioTrack);
    peer.connectionState = "connected";
    peer.onconnectionstatechange?.();
    assert.equal(states[1], "connected");
    cleanups[1]?.();
    await setImmediate();
    assert(track.stopped);
    assert(audioTrack.stopped);
    assert.equal(states[0], null);
    assert.equal(parentExists, false);
    assert.equal(peer.connectionState, "closed");
    assert(!listeners.some((listener) => listener.active && listener.path.includes("/viewers/")));
  }
  assert(!warnings.some((args) => String(args[0]).includes("ICE candidate not sent")));
  cleanups[0]?.();
}

await viewerTest(false);
console.log("PASS viewer buffers early ICE, applies the answer, exposes remote video, and cleans up");
await viewerTest(true);
console.log("PASS leaving during offer publication does not send candidates or leave signaling listeners/documents");

const room = readFileSync(new URL("./src/components/ImmersiveLiveRoom.tsx", import.meta.url), "utf8");
const attachment = room.indexOf("    video.srcObject = videoStream;");
const effectStart = room.lastIndexOf("  useEffect(() => {", attachment);
const effectEnd = room.indexOf("  }, [videoStream, hasRealVideo]);", attachment);
assert(effectStart >= 0 && effectEnd > attachment);
const playback = await transform(room.slice(effectStart, effectEnd) + "  }, []);", { loader: "ts" });
for (const leaveBeforeRejection of [false, true]) {
  let cleanup: (() => void) | undefined;
  let rejectPlay = (_error: Error) => {};
  let plays = 0;
  let blocked = false;
  const warnings: unknown[] = [];
  const stream = {};
  const video = {
    srcObject: null as unknown, muted: false,
    addEventListener() {}, removeEventListener() {},
    play() {
      plays++;
      if (plays === 1) return new Promise<void>((_resolve, reject) => { rejectPlay = reject; });
      return Promise.reject(Object.assign(new Error("test-only"), { name: "NotSupportedError" }));
    },
  };
  runInNewContext(playback.code, {
    Error,
    videoRef: { current: video }, videoStream: stream,
    useEffect(effect: () => () => void) { cleanup = effect(); },
    setIsAudioBlocked(value: boolean) { blocked = value; },
    console: { info() {}, warn: (...args: unknown[]) => warnings.push(args) },
  });
  assert.equal(video.srcObject, stream);
  if (leaveBeforeRejection) cleanup?.();
  rejectPlay(Object.assign(new Error("test-only"), { name: "NotAllowedError" }));
  await setImmediate();
  assert.equal(plays, leaveBeforeRejection ? 1 : 2, "only an active attachment may retry playback muted");
  assert.equal(blocked, !leaveBeforeRejection);
  assert.equal(warnings.length, leaveBeforeRejection ? 0 : 2, "both initial and muted playback failures must be reported");
  cleanup?.();
  assert.equal(video.srcObject, null);
}
console.log("PASS playback retries permission-blocked video muted, reports retry failure, and ignores stale rejections");
