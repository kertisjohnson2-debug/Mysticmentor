// Six reels that align into one daily affirmation. Reels 1 and 5 share a grammatical person so the sentence always agrees.
export const AFFIRMATION_PERSONS = [
  { subject: "I", possessive: "My", reflexive: "myself", becoming: "the person I am" },
  { subject: "We", possessive: "Our", reflexive: "ourselves", becoming: "the people we are" },
  { subject: "You", possessive: "Your", reflexive: "yourself", becoming: "the person you are" }
] as const;

export const AFFIRMATION_REELS = {
  subjects: AFFIRMATION_PERSONS.map((person) => person.subject),
  verbs: ["Welcome", "Embrace", "Radiate", "Choose", "Invite", "Receive"],
  gifts: ["Peace", "Love", "Healing", "Abundance", "Clarity", "Joy", "Courage", "Light"],
  trusts: ["Trust", "Honor", "Cherish", "Celebrate", "Value", "Embrace"],
  possessives: AFFIRMATION_PERSONS.map((person) => person.possessive),
  paths: ["Journey", "Path", "Purpose", "Energy", "Intuition", "Spirit", "Timing", "Heart"]
} as const;

export const REEL_ORDER = ["subjects", "verbs", "gifts", "trusts", "possessives", "paths"] as const;

export type AffirmationSpin = { person: number; verb: number; gift: number; trust: number; path: number };

export function affirmationWords(spin: AffirmationSpin): [string, string, string, string, string, string] {
  const person = AFFIRMATION_PERSONS[spin.person];
  return [person.subject, AFFIRMATION_REELS.verbs[spin.verb], AFFIRMATION_REELS.gifts[spin.gift], AFFIRMATION_REELS.trusts[spin.trust], person.possessive, AFFIRMATION_REELS.paths[spin.path]];
}

export function affirmationSentence(spin: AffirmationSpin) {
  const person = AFFIRMATION_PERSONS[spin.person];
  const [subject, verb, gift, trust, possessive, path] = affirmationWords(spin);
  return `${subject} ${verb.toLowerCase()} ${gift.toLowerCase()}, ${trust.toLowerCase()} ${possessive.toLowerCase()} ${path.toLowerCase()}, and allow ${person.reflexive} to grow into ${person.becoming} meant to become.`;
}

export function randomSpin(random: () => number = Math.random): AffirmationSpin {
  const pick = (length: number) => Math.min(length - 1, Math.floor(random() * length));
  return {
    person: pick(AFFIRMATION_PERSONS.length),
    verb: pick(AFFIRMATION_REELS.verbs.length),
    gift: pick(AFFIRMATION_REELS.gifts.length),
    trust: pick(AFFIRMATION_REELS.trusts.length),
    path: pick(AFFIRMATION_REELS.paths.length)
  };
}

// The shared affirmation follows the same UTC calendar day as the server allowance.
export function dailySpin(date: Date): AffirmationSpin {
  let seed = date.getUTCFullYear() * 10000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();
  const next = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  return randomSpin(next);
}

export function reelIndexes(spin: AffirmationSpin) {
  return [spin.person, spin.verb, spin.gift, spin.trust, spin.person, spin.path];
}

export const AFFIRMATION_STATEMENT_COUNT = AFFIRMATION_PERSONS.length * AFFIRMATION_REELS.verbs.length *
  AFFIRMATION_REELS.gifts.length * AFFIRMATION_REELS.trusts.length * AFFIRMATION_REELS.paths.length;
export const DAILY_SPIN_LIMIT = 10;
export const FIRST_REEL_STOP_MS = 1400;
export const REEL_STOP_GAP_MS = 450;
export const SPIN_COMPLETE_MS = FIRST_REEL_STOP_MS + 5 * REEL_STOP_GAP_MS + 150;

export function distinctSpin(previous: AffirmationSpin, random: () => number = Math.random): AffirmationSpin {
  const spin = randomSpin(random);
  if (JSON.stringify(reelIndexes(spin)) === JSON.stringify(reelIndexes(previous))) {
    spin.path = (spin.path + 1) % AFFIRMATION_REELS.paths.length;
  }
  return spin;
}
