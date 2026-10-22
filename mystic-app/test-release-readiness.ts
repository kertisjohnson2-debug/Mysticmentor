import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AFFIRMATION_STATEMENT_COUNT, AFFIRMATION_PERSONS, AFFIRMATION_REELS, affirmationSentence, affirmationWords, dailySpin, distinctSpin, SPIN_COMPLETE_MS } from "./src/lib/affirmations";
import { calculateLifePath, readDailyHoroscope } from "./src/lib/dailyContent";
import { nextSpinReset, spinStatus, utcSpinDay } from "./affirmationSpins";

let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }
check("all valid reel combinations are distinct and agree grammatically", () => {
  const sentences = new Set<string>();
  for (let person = 0; person < 3; person++) for (let verb = 0; verb < 6; verb++) for (let gift = 0; gift < 8; gift++) for (let trust = 0; trust < 6; trust++) for (let path = 0; path < 8; path++) {
    const spin = { person, verb, gift, trust, path };
    const words = affirmationWords(spin);
    assert.equal(words.length, 6);
    assert.equal(words[0], AFFIRMATION_PERSONS[person].subject);
    assert.equal(words[4], AFFIRMATION_PERSONS[person].possessive);
    assert(!affirmationSentence(spin).includes("undefined"));
    sentences.add(affirmationSentence(spin));
  }
  assert.equal(sentences.size, AFFIRMATION_STATEMENT_COUNT);
  assert.equal(sentences.size, 6912);
  assert(!AFFIRMATION_REELS.trusts.some((word) => String(word) === "Believe"));
});
check("Spin Again avoids immediate repeats even when randomness repeats", () => {
  const previous = { person: 0, verb: 0, gift: 0, trust: 0, path: 0 };
  assert.notDeepEqual(distinctSpin(previous, () => 0), previous);
  assert.equal(SPIN_COMPLETE_MS, 3800);
});
check("UTC day and reset boundary", () => {
  const end = Date.parse("2026-10-16T23:59:59.999Z");
  assert.equal(utcSpinDay(end), "2026-10-16");
  assert.equal(nextSpinReset(end), end + 1);
  assert.equal(utcSpinDay(end + 1), "2026-10-17");
  assert.equal(spinStatus({ completed: 9 }, end).remaining, 1);
  assert.equal(spinStatus({ completed: 10 }, end).remaining, 0);
  assert.equal(spinStatus({}, end + 1).remaining, 10);
  assert.deepEqual(dailySpin(new Date("2026-10-17T01:00:00+14:00")), dailySpin(new Date("2026-10-16T23:59:00Z")));
});
check("horoscope rejects wrong date, wrong sign and empty data", () => {
  const reading = { data: { date: "2026-10-16", sign: "Aries", horoscope: "A current reading." } };
  assert(readDailyHoroscope(reading, "aries", "2026-10-16"));
  assert.equal(readDailyHoroscope(reading, "taurus", "2026-10-16"), null);
  assert.equal(readDailyHoroscope(reading, "aries", "2026-10-17"), null);
  assert.equal(readDailyHoroscope({ data: { ...reading.data, horoscope: "" } }, "aries", "2026-10-16"), null);
});
check("life path preserves digit sum, 11/22 and valid leap dates", () => {
  const today = new Date(2026, 9, 16);
  assert.equal(calculateLifePath(1995, 1, 1, today), 8);
  assert.equal(calculateLifePath(2000, 1, 8, today), 11);
  assert.equal(calculateLifePath(2000, 9, 29, today), 22);
  assert.equal(calculateLifePath(2000, 2, 29, today), 6);
  assert.equal(calculateLifePath(1995, 1, 1, new Date(2027, 0, 1)), 8);
  assert.throws(() => calculateLifePath(2001, 2, 29, today));
  assert.throws(() => calculateLifePath(2027, 1, 1, today));
  assert.throws(() => calculateLifePath(2000, 4, 31, today));
});
check("admin UI no longer directly reads privileged Firestore collections", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  assert(!app.includes('collection(db, "users")'));
  assert(!app.includes('collection(db, "financial_records")'));
  assert(!app.includes('doc(db, "admin_settings"'));
  assert(!app.includes('updateDoc(doc(db, "users", uid)'));
  assert(app.includes('adminMemberAction("promote"'));
  assert(app.includes('adminMemberAction("suspend"'));
});
check("PIN setup has no account-password reauthentication", () => {
  const client = readFileSync("src/lib/adminAccess.ts", "utf8");
  const setup = client.slice(client.indexOf("export async function setupAdminPin"), client.indexOf("export async function verifyAdminPasscode"));
  assert(setup.includes("/passcode/setup"));
  assert(!setup.includes("reauthenticate"));
  const server = readFileSync("server.ts", "utf8");
  assert(server.includes("verifyIdToken(req.headers.authorization!.substring(7), true)"));
  assert(server.includes("!authUser.disabled"));
});
check("visual fixes address image source and modal stacking, not broad CSS", () => {
  const app = readFileSync("src/App.tsx", "utf8");
  assert(!app.includes("/src/assets/images/mascot.jpeg"));
  assert(!app.includes("Little Guardian"));
  assert(readFileSync("src/assets/images/mascot.jpeg", "utf8").includes("placeholder"));
  assert(app.includes('selectedMemberProfile && createPortal('));
  assert(app.includes("</div>, document.body"));
  assert(readFileSync("src/components/MemberProfile.tsx", "utf8").includes("h-11 w-11 shrink-0"));
});
console.log(`ALL ${checks} PASSED; ${AFFIRMATION_STATEMENT_COUNT} unique affirmation statements enumerated.`);
