export const utcDateKey = (now: Date) => now.toISOString().slice(0, 10);

export function readDailyHoroscope(value: unknown, sign: string, today: string): { date: string; horoscope: string } | null {
  if (!value || typeof value !== "object" || !("data" in value)) return null;
  const data = value.data;
  if (!data || typeof data !== "object" || !("date" in data) || !("horoscope" in data) || !("sign" in data)) return null;
  return data.date === today && typeof data.sign === "string" && data.sign.toLowerCase() === sign &&
    typeof data.horoscope === "string" && data.horoscope.trim()
    ? { date: today, horoscope: data.horoscope.trim() } : null;
}

// Preserve this app's existing digit-sum convention and master numbers 11/22.
export function calculateLifePath(year: number, month: number, day: number, today = new Date()): number {
  const date = new Date(year, month - 1, day);
  const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
  if (![year, month, day].every(Number.isInteger) || year < 1900 || date.getFullYear() !== year ||
      date.getMonth() !== month - 1 || date.getDate() !== day || date > endOfToday) {
    throw new Error("Enter a valid birth date that is not in the future.");
  }
  let sum = `${year}${month}${day}`.split("").reduce((total, digit) => total + Number(digit), 0);
  while (sum > 9 && sum !== 11 && sum !== 22) sum = String(sum).split("").reduce((total, digit) => total + Number(digit), 0);
  return sum;
}
