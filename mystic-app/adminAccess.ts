import crypto from "crypto";

// Server-only helpers for the administrator passcode gate. Only salted scrypt hashes and SHA-256 digests of
// session tokens are ever stored; the raw passcode and raw session token never leave the request that carries them.

export const ADMIN_PASSCODE_MIN = 4;
export const ADMIN_PASSCODE_MAX = 128;
export const ADMIN_MAX_FAILED_ATTEMPTS = 5;
export const ADMIN_LOCKOUT_MS = 15 * 60_000;
export const ADMIN_RECENT_SIGN_IN_MS = 5 * 60_000;
const SCRYPT = { N: 32768, r: 8, p: 1, keyLength: 64 };

const positiveNumber = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// Configurable security timeouts; re-verification is required once a session expires.
export const adminSessionDurations = (env: Record<string, string | undefined> = process.env) => ({
  standardMs: positiveNumber(env.ADMIN_SESSION_TIMEOUT_MINUTES, 60) * 60_000,
  rememberedMs: positiveNumber(env.ADMIN_REMEMBER_DEVICE_DAYS, 30) * 24 * 60 * 60_000
});

export type PasscodeRecord = { algorithm: "scrypt"; salt: string; hash: string; N: number; r: number; p: number; keyLength: number; generation?: string };

export function validateNewPasscode(value: unknown): { value: string } | { error: string } {
  if (typeof value !== "string" || !/^[0-9]{4}$/.test(value)) return { error: "Enter exactly four numeric digits." };
  return { value };
}

const scrypt = (passcode: string, salt: Buffer, params: Pick<PasscodeRecord, "N" | "r" | "p" | "keyLength">) =>
  new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(passcode.normalize("NFKC"), salt, params.keyLength, { N: params.N, r: params.r, p: params.p, maxmem: 128 * params.N * params.r * 2 }, (error, key) => error ? reject(error) : resolve(key));
  });

export async function hashPasscode(passcode: string): Promise<PasscodeRecord> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(passcode, salt, SCRYPT);
  return { algorithm: "scrypt", salt: salt.toString("base64"), hash: hash.toString("base64"), ...SCRYPT };
}

export function isPasscodeRecord(value: unknown): value is PasscodeRecord {
  const record = value as Partial<PasscodeRecord> | null;
  return Boolean(record && record.algorithm === "scrypt" && typeof record.salt === "string" && typeof record.hash === "string" &&
    record.N === SCRYPT.N && record.r === SCRYPT.r && record.p === SCRYPT.p && record.keyLength === SCRYPT.keyLength &&
    Buffer.from(record.salt, "base64").length === 16 && Buffer.from(record.hash, "base64").length === 64);
}

export async function verifyPasscode(passcode: unknown, record: unknown): Promise<boolean> {
  if (typeof passcode !== "string" || passcode.length === 0 || passcode.length > ADMIN_PASSCODE_MAX || !isPasscodeRecord(record)) return false;
  const expected = Buffer.from(record.hash, "base64");
  const actual = await scrypt(passcode, Buffer.from(record.salt, "base64"), record);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export const sessionIdFor = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function newAdminSession(uid: string, remember: boolean, now: number, durations = adminSessionDurations()) {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    id: sessionIdFor(token),
    record: { uid, remember, createdAt: now, expiresAt: now + (remember ? durations.rememberedMs : durations.standardMs), revoked: false }
  };
}

export const isSessionTokenShape = (token: unknown): token is string => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);

// A session is valid only for the same admin uid, before expiry, and while not revoked.
export function isAdminSessionValid(record: unknown, uid: string, now: number): boolean {
  const session = record as { uid?: unknown; expiresAt?: unknown; revoked?: unknown } | null | undefined;
  return Boolean(session && session.uid === uid && session.revoked === false && typeof session.expiresAt === "number" && session.expiresAt > now);
}

export type AttemptState = { failures: number; lockedUntil: number };

export function readAttemptState(value: unknown): AttemptState {
  const data = value as Partial<AttemptState> | null | undefined;
  return {
    failures: typeof data?.failures === "number" && data.failures >= 0 ? Math.floor(data.failures) : 0,
    lockedUntil: typeof data?.lockedUntil === "number" ? data.lockedUntil : 0
  };
}

export const lockedFor = (state: AttemptState, now: number) => Math.max(0, state.lockedUntil - now);

export function afterFailedAttempt(state: AttemptState, now: number): AttemptState {
  const failures = (state.lockedUntil && state.lockedUntil <= now ? 0 : state.failures) + 1;
  return failures >= ADMIN_MAX_FAILED_ATTEMPTS ? { failures: 0, lockedUntil: now + ADMIN_LOCKOUT_MS } : { failures, lockedUntil: 0 };
}

// Recovery (not first-use PIN setup) requires a recent Firebase sign-in.
export const isRecentSignIn = (authTimeSeconds: unknown, now: number) =>
  typeof authTimeSeconds === "number" && authTimeSeconds * 1000 <= now + 60_000 && now - authTimeSeconds * 1000 <= ADMIN_RECENT_SIGN_IN_MS;
