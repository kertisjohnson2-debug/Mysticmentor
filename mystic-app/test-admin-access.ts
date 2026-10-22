/*
 * Admin passcode gate and Daily Affirmation checks. Pure logic and source wiring only: no Firebase, Stripe or network.
 *   npx tsx test-admin-access.ts
 */
import { readFileSync } from "node:fs";
import {
  ADMIN_LOCKOUT_MS, ADMIN_MAX_FAILED_ATTEMPTS, adminSessionDurations, afterFailedAttempt, hashPasscode, isAdminSessionValid,
  isRecentSignIn, isSessionTokenShape, lockedFor, newAdminSession, readAttemptState, sessionIdFor, validateNewPasscode, verifyPasscode
} from "./adminAccess";
import { AFFIRMATION_PERSONS, AFFIRMATION_REELS, REEL_ORDER, affirmationSentence, affirmationWords, dailySpin, randomSpin, reelIndexes } from "./src/lib/affirmations";

let failures = 0;
let checks = 0;
const check = (name: string, ok: boolean, detail: unknown = "") => { checks++; if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${JSON.stringify(detail)}`}`); };

// ---- passcode hashing ----
const record = await hashPasscode("Moonlit-Oracle-7");
check("stored record is salted scrypt and never contains the passcode", record.algorithm === "scrypt" && Buffer.from(record.salt, "base64").length === 16 && !JSON.stringify(record).includes("Moonlit"), record);
check("same passcode hashes differently each time (random salt)", (await hashPasscode("Moonlit-Oracle-7")).hash !== record.hash);
check("correct passcode verifies", await verifyPasscode("Moonlit-Oracle-7", record));
check("wrong passcode fails", !(await verifyPasscode("moonlit-oracle-7", record)));
check("empty, non-string and oversized passcodes fail", !(await verifyPasscode("", record)) && !(await verifyPasscode(undefined, record)) && !(await verifyPasscode("x".repeat(129), record)));
check("missing or tampered record fails closed", !(await verifyPasscode("Moonlit-Oracle-7", null)) && !(await verifyPasscode("Moonlit-Oracle-7", { ...record, N: 2 })) && !(await verifyPasscode("Moonlit-Oracle-7", { ...record, algorithm: "plain" })));
check("PIN rules: exactly four numeric digits, including leading zero", "value" in validateNewPasscode("0427") && "error" in validateNewPasscode("123") && "error" in validateNewPasscode("12345") && "error" in validateNewPasscode("12a4") && "error" in validateNewPasscode(1234) && "error" in validateNewPasscode(" 1234"));

// ---- sessions ----
const now = 1_800_000_000_000;
const durations = adminSessionDurations({});
check("default timeouts: 60 minutes, 30 days when remembered", durations.standardMs === 3_600_000 && durations.rememberedMs === 30 * 86_400_000);
check("timeouts are configurable and ignore invalid values", adminSessionDurations({ ADMIN_SESSION_TIMEOUT_MINUTES: "15", ADMIN_REMEMBER_DEVICE_DAYS: "7" }).standardMs === 900_000 && adminSessionDurations({ ADMIN_SESSION_TIMEOUT_MINUTES: "-5" }).standardMs === 3_600_000);
const session = newAdminSession("admin-uid", false, now, durations);
const remembered = newAdminSession("admin-uid", true, now, durations);
check("session token is 256-bit random and stored only as its SHA-256 id", isSessionTokenShape(session.token) && session.id === sessionIdFor(session.token) && !JSON.stringify(session.record).includes(session.token));
check("tokens are unique", session.token !== remembered.token);
check("standard and remembered expiry", session.record.expiresAt === now + durations.standardMs && remembered.record.expiresAt === now + durations.rememberedMs && remembered.record.remember === true);
check("session valid for same admin before expiry", isAdminSessionValid(session.record, "admin-uid", now + 1000));
check("session invalid at expiry (re-verification required)", !isAdminSessionValid(session.record, "admin-uid", session.record.expiresAt));
check("session invalid for another uid", !isAdminSessionValid(session.record, "other-uid", now));
check("revoked session invalid", !isAdminSessionValid({ ...session.record, revoked: true }, "admin-uid", now));
check("missing or malformed session invalid", !isAdminSessionValid(undefined, "admin-uid", now) && !isAdminSessionValid({ uid: "admin-uid", expiresAt: "later", revoked: false }, "admin-uid", now));
check("malformed session headers rejected", !isSessionTokenShape("abc") && !isSessionTokenShape(undefined) && !isSessionTokenShape(["x"]) && !isSessionTokenShape(session.token + "!"));

// ---- lockout and recent sign-in ----
let attempts = readAttemptState(undefined);
for (let index = 1; index < ADMIN_MAX_FAILED_ATTEMPTS; index++) attempts = afterFailedAttempt(attempts, now);
check("failures below the limit do not lock", attempts.failures === ADMIN_MAX_FAILED_ATTEMPTS - 1 && lockedFor(attempts, now) === 0);
attempts = afterFailedAttempt(attempts, now);
check("fifth failure locks for 15 minutes", lockedFor(attempts, now) === ADMIN_LOCKOUT_MS);
check("lock expires and the counter restarts", lockedFor(attempts, now + ADMIN_LOCKOUT_MS) === 0 && afterFailedAttempt(attempts, now + ADMIN_LOCKOUT_MS).failures === 1);
check("malformed attempt data is treated as zero failures", readAttemptState({ failures: -3, lockedUntil: "x" }).failures === 0);
check("reset requires a sign-in within 5 minutes", isRecentSignIn(now / 1000 - 60, now) && !isRecentSignIn(now / 1000 - 301, now) && !isRecentSignIn(undefined, now) && !isRecentSignIn(now / 1000 + 3600, now));

// ---- server wiring ----
const server = readFileSync("server.ts", "utf8");
const route = (path: string) => server.slice(server.indexOf(`app.${path}`), server.indexOf("\n  });", server.indexOf(`app.${path}`)));
check("existing admin APIs require a passcode-verified session", route('put("/api/admin/community-settings"').includes("requireAdminSession(req, res)") && route('get("/api/admin/storage-usage"').includes("requireAdminSession(req, res)"));
check("requireAdminSession re-checks the admin role first", /const requireAdminSession[\s\S]*?await authenticateAdmin\(req, res\)[\s\S]*?readAdminSession\(req, uid\)/.test(server));
check("passcode verify and change endpoints require the admin role", route('post("/api/admin/access/verify"').includes("authenticateAdmin(req, res)") && route('post("/api/admin/access/passcode/change"').includes("authenticateAdmin(req, res)"));
const reset = route('post("/api/admin/access/passcode/reset"');
check("reset checks revoked tokens, admin role, verified email and recent sign-in", reset.includes("verifyIdToken(authHeader.substring(7), true)") && reset.includes("isAdminAccount(decoded.uid)") && reset.includes("decoded.email_verified !== true") && reset.includes("isRecentSignIn(decoded.auth_time"));
check("change and reset invalidate every old session generation", route('post("/api/admin/access/passcode/change"').includes("generation = crypto.randomUUID()") && reset.includes("generation = crypto.randomUUID()") && server.includes("data?.generation === pin.data()?.generation"));
const adminBlock = server.slice(server.indexOf("const ADMIN_PASSCODE_REF"), server.indexOf('app.get("/api/community/settings"'));
check("server never logs or stores the raw passcode", !adminBlock.split("\n").some((line) => line.includes("console.") && /req\.body|next\.value|passcode\b(?!\s*(verification|change|reset))/i.test(line.replace(/"[^"]*"/g, ""))) && !/set\(\{[^}]*(passcode|newPasscode)\s*[:,}]/.test(adminBlock) && adminBlock.includes("hashPasscode(next.value)"));
const rules = readFileSync("firestore.rules", "utf8");
check("admin security collections have no client rules (default deny applies)", !/adminSecurity|adminSessions|adminAccessAttempts/.test(rules) && /match \/\{document=\*\*\} \{\s*allow read, write: if false;/.test(rules));

// ---- client wiring ----
const app = readFileSync("src/App.tsx", "utf8");
const nav = app.slice(app.indexOf("STICKY BOTTOM TAB NAVIGATION"), app.indexOf("</nav>"));
check("bottom navigation has no Admin item", !/>Admin</.test(nav) && !nav.includes('setActiveTab("admin")'));
check("bottom navigation opens the Daily Affirmation page", nav.includes('setActiveTab("affirmation")') && nav.includes(">Affirm<") && app.includes('activeTab === "affirmation" && <DailyAffirmation />'));
check("other navigation items keep their order", ["Home", "Tarot", "Zodiac", "Numbers", "Live", "Community", "Celestial Tools", "Member", "Affirm"].reduce((last, label) => { const at = nav.indexOf(label, last); return at < 0 ? Number.POSITIVE_INFINITY : at; }, 0) !== Number.POSITIVE_INFINITY && nav.includes("grid-cols-9"));
check("old client-only passcode modal removed", !app.includes("showAdminGate") && !app.includes("Verify Key") && !app.includes("Reader Access Gate (Staff Only)"));
check("admin state is never auto-granted from the user document", !/setIsAdminAuthenticated\(true\)/.test(app.replace("setIsAdminAuthenticated(true);\n    setActiveTab(\"admin\")", "")) && app.includes("const handleAdminVerified"));
check("Admin panel renders only after server verification", app.includes('activeTab === "admin" && isAdminAuthenticated && ('));
check("Admin Access entry is passed to the Member page only for admin accounts", app.includes("onOpenAdminAccess={isAdminAccount ?") && app.includes(": undefined}"));
const client = readFileSync("src/lib/adminAccess.ts", "utf8");
check("browser stores only the session token, never the passcode", /setItem\(storageKey\(uid\), token\)/.test(client) && !/setItem\([^)]*passcode/i.test(client));

// ---- Daily Affirmation ----
check("six reels in order", REEL_ORDER.length === 6 && REEL_ORDER.every((key) => AFFIRMATION_REELS[key].length >= 3));
const reference = { person: 0, verb: AFFIRMATION_REELS.verbs.indexOf("Welcome"), gift: AFFIRMATION_REELS.gifts.indexOf("Peace"), trust: AFFIRMATION_REELS.trusts.indexOf("Trust"), path: AFFIRMATION_REELS.paths.indexOf("Journey") };
check("reference artwork words align", affirmationWords(reference).join(" ") === "I Welcome Peace Trust My Journey");
check("reference artwork sentence", affirmationSentence(reference) === "I welcome peace, trust my journey, and allow myself to grow into the person I am meant to become.", affirmationSentence(reference));
check("subject and possessive always agree", AFFIRMATION_PERSONS.every((_, person) => { const words = affirmationWords({ ...reference, person }); return AFFIRMATION_PERSONS[person].subject === words[0] && AFFIRMATION_PERSONS[person].possessive === words[4]; }));
check("we-form grammar", affirmationSentence({ ...reference, person: 1 }) === "We welcome peace, trust our journey, and allow ourselves to grow into the people we are meant to become.");
check("daily spin is stable for a day and changes across days", JSON.stringify(dailySpin(new Date(2026, 9, 16, 8))) === JSON.stringify(dailySpin(new Date(2026, 9, 16, 22))) && new Set(Array.from({ length: 10 }, (_, day) => JSON.stringify(dailySpin(new Date(2026, 9, day + 1))))).size > 1);
check("random spin stays in range even at the edge", (() => { const spin = randomSpin(() => 0.9999999); return reelIndexes(spin).every((index, reel) => index >= 0 && index < AFFIRMATION_REELS[REEL_ORDER[reel]].length); })());
const page = readFileSync("src/components/DailyAffirmation.tsx", "utf8");
check("reels stop one at a time and Spin Again is disabled while spinning", page.includes("FIRST_REEL_STOP_MS + reel * REEL_STOP_GAP_MS") && /disabled=\{spinning \|\|/.test(page) && page.includes("Spin Again"));

console.log(failures ? `${failures} OF ${checks} FAILED` : `ALL ${checks} PASSED`);
process.exit(failures ? 1 : 0);
