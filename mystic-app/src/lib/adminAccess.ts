import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { auth } from "../firebase";

// Only the random, server-revocable session token is kept in the browser; never the passcode.
// Remembered devices use localStorage; otherwise the token lasts for this tab only.
const storageKey = (uid: string) => `mm-admin-session:${uid}`;
const memorySessions = new Map<string, string>();
export const ADMIN_PASSCODE_MIN = 4;

export type AdminSessionInfo = { expiresAt: number; remember: boolean };
export type AdminAccessStatus = { passcodeConfigured: boolean; session: AdminSessionInfo | null };

export function readAdminSessionToken(uid: string | undefined | null) {
  if (!uid || typeof window === "undefined") return null;
  try {
    return memorySessions.get(uid) ?? window.sessionStorage.getItem(storageKey(uid)) ?? window.localStorage.getItem(storageKey(uid));
  } catch {
    return memorySessions.get(uid) ?? null;
  }
}

export function clearAdminSessionToken(uid: string | undefined | null) {
  if (!uid || typeof window === "undefined") return;
  memorySessions.delete(uid);
  try {
    window.sessionStorage.removeItem(storageKey(uid));
    window.localStorage.removeItem(storageKey(uid));
  } catch {
    // Storage may be unavailable in private browsing; nothing to clear.
  }
}

function storeAdminSessionToken(uid: string, token: string, remember: boolean) {
  clearAdminSessionToken(uid);
  memorySessions.set(uid, token);
  try {
    (remember ? window.localStorage : window.sessionStorage).setItem(storageKey(uid), token);
  } catch {
    console.warn("[Admin] Device storage unavailable; access is remembered only until this page reloads.");
  }
}

export class AdminAccessError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

export async function adminFetch<T>(path: string, body?: Record<string, unknown>, forceRefresh = false): Promise<T> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new AdminAccessError("Sign in with your administrator account.", 401);
  const token = await user.getIdToken(forceRefresh);
  const session = readAdminSessionToken(user.uid);
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(session ? { "X-Admin-Session": session } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json().catch(() => null) as (T & { error?: string; code?: string }) | null;
  if (!response.ok || !result) {
    if (response.status === 401 || response.status === 403) window.dispatchEvent(new Event("admin-access-invalid"));
    throw new AdminAccessError(result?.error || `Administrator access request failed (${response.status}).`, response.status, result?.code);
  }
  return result;
}

type IssuedSession = AdminSessionInfo & { token: string };
const keep = (issued: IssuedSession): AdminSessionInfo => {
  const uid = auth.currentUser?.uid;
  if (uid) storeAdminSessionToken(uid, issued.token, issued.remember);
  return { expiresAt: issued.expiresAt, remember: issued.remember };
};

export const loadAdminAccessStatus = () => adminFetch<AdminAccessStatus>("/api/admin/access/status");

export type AdminMember = {
  uid: string; email?: string; displayName?: string; avatarUrl?: string; role?: string;
  tarotReader?: boolean; suspended?: boolean; gemBalance?: number; cloutPoints?: number; createdAt?: string;
};
export type AdminPanelData = { members: AdminMember[]; financials: Record<string, number | string> | null; records: Record<string, unknown>[] };
export const loadAdminPanel = () => adminFetch<AdminPanelData>("/api/admin/panel");
export const adminMemberAction = (action: "promote" | "demote" | "tarotReader" | "suspend", target: { uid?: string; email?: string }, enabled?: boolean) =>
  adminFetch<{ success: boolean }>("/api/admin/members/action", { action, ...target, ...(enabled === undefined ? {} : { enabled }) });

export async function setupAdminPin(newPasscode: string, remember: boolean) {
  return keep(await adminFetch<IssuedSession>("/api/admin/access/passcode/setup", { newPasscode, remember }));
}

export async function verifyAdminPasscode(passcode: string, remember: boolean) {
  return keep(await adminFetch<IssuedSession>("/api/admin/access/verify", { passcode, remember }));
}

export async function changeAdminPasscode(currentPasscode: string, newPasscode: string, remember: boolean) {
  return keep(await adminFetch<IssuedSession>("/api/admin/access/passcode/change", { currentPasscode, newPasscode, remember }));
}

// Confirms the account password with Firebase first so the server sees a fresh sign-in.
export async function resetAdminPasscode(accountPassword: string, newPasscode: string, remember: boolean) {
  const user = auth.currentUser;
  if (!user?.email) throw new AdminAccessError("Sign in with your administrator email account.", 401);
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, accountPassword));
  } catch {
    throw new AdminAccessError("That account password was not accepted.", 401);
  }
  return keep(await adminFetch<IssuedSession>("/api/admin/access/passcode/reset", { newPasscode, remember }, true));
}

export async function revokeAdminAccess(scope: "this" | "all") {
  const uid = auth.currentUser?.uid;
  if (scope === "this" && !readAdminSessionToken(uid)) return { revoked: 0 };
  const result = await adminFetch<{ revoked: number }>("/api/admin/access/revoke", { scope });
  clearAdminSessionToken(uid);
  return result;
}
