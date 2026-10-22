// Read-only diagnostics for the /live-video-v2 test page. Nothing here writes to storage or changes auth state.
import { auth } from "../firebase";

const FIREBASE_AUTH_DB = "firebaseLocalStorageDb";
const FIREBASE_AUTH_STORE = "firebaseLocalStorage";
const IDB_TIMEOUT_MS = 5000;

export type StoredSessionStatus =
  | { kind: "unsupported"; detail: string }
  | { kind: "no-database" }
  | { kind: "no-user" }
  | { kind: "stuck"; detail: string }
  | { kind: "error"; detail: string }
  | { kind: "found"; uid: string; email: string | null; tokenExpired: boolean };

export type AuthNetworkCall = { endpoint: string; durationMs: number; status: number | null };

const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
  new Promise<T | "timeout">((resolve, reject) => {
    const timer = window.setTimeout(() => resolve("timeout"), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });

const requestToPromise = <T,>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export async function inspectStoredAuthSession(): Promise<StoredSessionStatus> {
  if (typeof indexedDB === "undefined") return { kind: "unsupported", detail: "IndexedDB is unavailable in this browser context." };
  try {
    // Avoid creating the database as a side effect when the browser can list databases first.
    if (typeof indexedDB.databases === "function") {
      const list = await withTimeout(indexedDB.databases(), IDB_TIMEOUT_MS);
      if (list === "timeout") return { kind: "stuck", detail: "indexedDB.databases() did not respond within 5s." };
      if (!list.some((entry) => entry.name === FIREBASE_AUTH_DB)) return { kind: "no-database" };
    }
    const opened = await withTimeout(
      new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(FIREBASE_AUTH_DB);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("IndexedDB open was blocked by another tab."));
      }),
      IDB_TIMEOUT_MS
    );
    if (opened === "timeout") return { kind: "stuck", detail: "Opening Firebase's IndexedDB store did not respond within 5s." };
    try {
      if (!opened.objectStoreNames.contains(FIREBASE_AUTH_STORE)) return { kind: "no-user" };
      const key = `firebase:authUser:${auth.config.apiKey}:${auth.name}`;
      const store = opened.transaction(FIREBASE_AUTH_STORE, "readonly").objectStore(FIREBASE_AUTH_STORE);
      const record = await withTimeout(requestToPromise(store.get(key)), IDB_TIMEOUT_MS);
      if (record === "timeout") return { kind: "stuck", detail: "Reading the stored Firebase user did not respond within 5s." };
      const user = (record as { value?: { uid?: string; email?: string; stsTokenManager?: { expirationTime?: number } } } | undefined)?.value;
      if (!user?.uid) return { kind: "no-user" };
      const expiresAt = user.stsTokenManager?.expirationTime ?? 0;
      return { kind: "found", uid: user.uid, email: user.email ?? null, tokenExpired: expiresAt <= Date.now() };
    } finally {
      opened.close();
    }
  } catch (error) {
    return { kind: "error", detail: error instanceof Error ? error.message : String(error) };
  }
}

export function completedAuthNetworkCalls(): AuthNetworkCall[] {
  return performance
    .getEntriesByType("resource")
    .filter((entry) => /identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com/.test(entry.name))
    .map((entry) => {
      const url = new URL(entry.name);
      const status = (entry as PerformanceResourceTiming & { responseStatus?: number }).responseStatus;
      return { endpoint: `${url.host}${url.pathname}`, durationMs: Math.round(entry.duration), status: status || null };
    });
}

export function browserContextSummary() {
  let embedded = false;
  try {
    embedded = window.self !== window.top;
  } catch {
    embedded = true;
  }
  return {
    origin: window.location.origin,
    embedded,
    secureContext: window.isSecureContext,
    online: navigator.onLine,
  };
}
