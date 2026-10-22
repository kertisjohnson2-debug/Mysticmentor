import assert from "node:assert/strict";
import { generateSlots, overlaps, validateScheduleSettings, zonedTimeToUtcMs, type ReaderScheduleSettings } from "./scheduling";

const base: ReaderScheduleSettings = {
  enabled: true,
  timeZone: "America/New_York",
  durationMinutes: 30,
  readingType: "Tarot",
  priceType: "free",
  priceCents: 0,
  weekly: [{ day: 1, start: "09:00", end: "10:30" }]
};

// 2026-01-05 09:00 EST (UTC-5) and 2026-07-06 09:00 EDT (UTC-4)
assert.equal(zonedTimeToUtcMs(2026, 1, 5, 9, 0, "America/New_York"), Date.UTC(2026, 0, 5, 14, 0));
assert.equal(zonedTimeToUtcMs(2026, 7, 6, 9, 0, "America/New_York"), Date.UTC(2026, 6, 6, 13, 0));
assert.equal(zonedTimeToUtcMs(2026, 7, 6, 9, 0, "Asia/Kolkata"), Date.UTC(2026, 6, 6, 3, 30));

const now = Date.UTC(2026, 0, 1, 12, 0); // Thursday
const slots = generateSlots(base, now);
assert.ok(slots.length > 0 && slots.length % 3 === 0, "three 30-minute slots per Monday window");
assert.equal(slots[0].startMs, Date.UTC(2026, 0, 5, 14, 0));
assert.equal(slots[0].endMs - slots[0].startMs, 30 * 60 * 1000);
assert.ok(slots.every((slot) => new Date(slot.startMs).toLocaleDateString("en-US", { timeZone: base.timeZone, weekday: "long" }) === "Monday"));
assert.ok(slots.every((slot) => slot.startMs >= now + 60 * 60 * 1000), "respects minimum lead time");
assert.equal(generateSlots({ ...base, enabled: false }, now).length, 0);
assert.ok(overlaps(slots[0], { startMs: slots[0].startMs + 1, endMs: slots[0].endMs + 1 }));
assert.ok(!overlaps(slots[0], slots[1]));

const ok = (input: unknown) => "value" in validateScheduleSettings(input);
assert.ok(ok(base));
assert.ok(ok({ ...base, priceType: "paid", priceCents: 2500 }));
assert.ok(!ok({ ...base, priceType: "paid", priceCents: 0 }), "paid requires a price");
assert.ok(!ok({ ...base, priceType: "paid", priceCents: 99999999 }));
assert.ok(!ok({ ...base, timeZone: "Not/AZone" }));
assert.ok(!ok({ ...base, durationMinutes: 7 }));
assert.ok(!ok({ ...base, weekly: [{ day: 9, start: "09:00", end: "10:00" }] }));
assert.ok(!ok({ ...base, weekly: [{ day: 1, start: "10:00", end: "09:00" }] }));
assert.ok(!ok({ ...base, weekly: [{ day: 1, start: "09:00", end: "09:10" }] }), "window shorter than duration");
assert.ok(!ok({ ...base, weekly: [{ day: 1, start: "09:00", end: "10:00" }, { day: 1, start: "09:30", end: "11:00" }] }), "overlapping windows");
assert.ok(!ok({ ...base, weekly: [] }), "cannot enable with no availability");
assert.ok(ok({ ...base, enabled: false, weekly: [] }), "can disable with no availability");
const normalized = validateScheduleSettings({ ...base, priceType: "free", priceCents: 4000 });
assert.ok("value" in normalized && normalized.value.priceCents === 0, "free sessions always store a zero price");

console.log("scheduling unit tests passed");
