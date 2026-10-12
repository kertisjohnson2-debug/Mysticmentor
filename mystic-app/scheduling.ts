/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Pure scheduling helpers shared by the server routes and tests. No database access here.

export const SCHEDULE_DURATIONS = [15, 30, 45, 60, 90] as const;
export const SCHEDULE_READING_TYPES = ["Tarot", "Astrology", "Numerology", "General Guidance"] as const;
export const SCHEDULE_HORIZON_DAYS = 14;
export const SCHEDULE_MIN_LEAD_MS = 60 * 60 * 1000;
export const SCHEDULE_MAX_PRICE_CENTS = 50000;
export const SCHEDULE_MIN_PRICE_CENTS = 100;
export const SCHEDULE_MAX_WINDOWS = 21;

export type AvailabilityWindow = { day: number; start: string; end: string };

export type ReaderScheduleSettings = {
  enabled: boolean;
  timeZone: string;
  durationMinutes: number;
  readingType: string;
  priceType: "free" | "paid";
  priceCents: number;
  weekly: AvailabilityWindow[];
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const minutesOf = (time: string) => {
  const match = TIME_PATTERN.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// Returns a validated, normalized copy or an error message.
export function validateScheduleSettings(input: unknown): { value: ReaderScheduleSettings } | { error: string } {
  const data = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (typeof data.enabled !== "boolean") return { error: "Choose whether scheduling is enabled." };
  if (!isValidTimeZone(data.timeZone)) return { error: "Choose a valid time zone." };
  const duration = data.durationMinutes;
  if (typeof duration !== "number" || !(SCHEDULE_DURATIONS as readonly number[]).includes(duration)) {
    return { error: "Choose a supported appointment duration." };
  }
  if (typeof data.readingType !== "string" || !(SCHEDULE_READING_TYPES as readonly string[]).includes(data.readingType)) {
    return { error: "Choose a supported reading type." };
  }
  if (data.priceType !== "free" && data.priceType !== "paid") return { error: "Choose a free or paid session." };
  let priceCents = 0;
  if (data.priceType === "paid") {
    if (typeof data.priceCents !== "number" || !Number.isInteger(data.priceCents) ||
      data.priceCents < SCHEDULE_MIN_PRICE_CENTS || data.priceCents > SCHEDULE_MAX_PRICE_CENTS) {
      return { error: "Enter a price between $1.00 and $500.00." };
    }
    priceCents = data.priceCents;
  }
  if (!Array.isArray(data.weekly) || data.weekly.length > SCHEDULE_MAX_WINDOWS) return { error: "Provide your weekly availability." };
  const weekly: AvailabilityWindow[] = [];
  for (const item of data.weekly as unknown[]) {
    const window = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    if (typeof window.day !== "number" || !Number.isInteger(window.day) || window.day < 0 || window.day > 6 ||
      typeof window.start !== "string" || typeof window.end !== "string") {
      return { error: "Each availability window needs a day, start and end time." };
    }
    const start = minutesOf(window.start);
    const end = minutesOf(window.end);
    if (start === null || end === null || end <= start) return { error: "Each availability window must end after it starts." };
    if (end - start < duration) return { error: "Each availability window must be at least as long as the appointment duration." };
    weekly.push({ day: window.day, start: window.start, end: window.end });
  }
  weekly.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start));
  for (let index = 1; index < weekly.length; index += 1) {
    if (weekly[index].day === weekly[index - 1].day && weekly[index].start < weekly[index - 1].end) {
      return { error: "Availability windows on the same day cannot overlap." };
    }
  }
  if (data.enabled && weekly.length === 0) return { error: "Add at least one availability window before enabling scheduling." };
  return {
    value: {
      enabled: data.enabled,
      timeZone: data.timeZone,
      durationMinutes: duration,
      readingType: data.readingType,
      priceType: data.priceType,
      priceCents,
      weekly
    }
  };
}

function zonedParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric"
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

// Converts a wall-clock time in a time zone to a UTC timestamp (DST-aware).
export function zonedTimeToUtcMs(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const offsetAt = (ms: number) => {
    const p = zonedParts(ms, timeZone);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  let utc = wall - offsetAt(wall);
  utc = wall - offsetAt(utc);
  return utc;
}

export type SlotInfo = { startMs: number; endMs: number };

export function generateSlots(settings: ReaderScheduleSettings, nowMs: number): SlotInfo[] {
  if (!settings.enabled) return [];
  const durationMs = settings.durationMinutes * 60 * 1000;
  const today = zonedParts(nowMs, settings.timeZone);
  const slots: SlotInfo[] = [];
  for (let offset = 0; offset <= SCHEDULE_HORIZON_DAYS; offset += 1) {
    const calendar = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    const year = calendar.getUTCFullYear();
    const month = calendar.getUTCMonth() + 1;
    const day = calendar.getUTCDate();
    const weekday = calendar.getUTCDay();
    for (const window of settings.weekly) {
      if (window.day !== weekday) continue;
      const windowStart = minutesOf(window.start)!;
      const windowEnd = minutesOf(window.end)!;
      for (let minute = windowStart; minute + settings.durationMinutes <= windowEnd; minute += settings.durationMinutes) {
        const startMs = zonedTimeToUtcMs(year, month, day, Math.floor(minute / 60), minute % 60, settings.timeZone);
        if (startMs >= nowMs + SCHEDULE_MIN_LEAD_MS && startMs <= nowMs + SCHEDULE_HORIZON_DAYS * 24 * 60 * 60 * 1000) {
          slots.push({ startMs, endMs: startMs + durationMs });
        }
      }
    }
  }
  return slots.sort((a, b) => a.startMs - b.startMs);
}

export const overlaps = (a: SlotInfo, b: SlotInfo) => a.startMs < b.endMs && b.startMs < a.endMs;
