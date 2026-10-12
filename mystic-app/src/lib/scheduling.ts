import { auth } from "../firebase";

export const SCHEDULE_DURATIONS = [15, 30, 45, 60, 90] as const;
export const SCHEDULE_READING_TYPES = ["Tarot", "Astrology", "Numerology", "General Guidance"] as const;

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

export type ReaderSummary = {
  uid: string;
  displayName: string;
  avatarUrl: string;
  readingType: string;
  durationMinutes: number;
  priceType: "free" | "paid";
  priceCents: number;
  timeZone: string;
};

export type ReaderSlots = {
  reader: { uid: string; displayName: string; avatarUrl: string };
  settings: Omit<ReaderSummary, "uid" | "displayName" | "avatarUrl">;
  slots: { startMs: number; endMs: number }[];
};

export type BookingStatus = "confirmed" | "pending_payment" | "payment_expired" | "payment_conflict" | "cancelled_by_member" | "cancelled_by_reader";

export type Booking = {
  id: string;
  readerUid: string;
  readerName: string;
  memberUid: string;
  memberName: string;
  startMs: number;
  endMs: number;
  durationMinutes: number;
  readingType: string;
  priceType: "free" | "paid";
  priceCents: number;
  timeZone: string;
  status: BookingStatus;
  paymentStatus: "free" | "unpaid" | "paid" | "paid_needs_refund";
  holdExpiresMs: number | null;
};

export async function request<T>(path: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Sign in with a member account to use scheduling.");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const result = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !result) {
    throw new Error(result?.error || (response.status >= 502 && response.status <= 504
      ? "The scheduling service is unreachable right now. Please try again shortly."
      : `Scheduling request failed (${response.status}).`));
  }
  return result;
}

export const loadMySchedule = () => request<{ eligible: boolean; settings: ReaderScheduleSettings | null }>("/api/scheduling/my-settings");
export const saveMySchedule = (settings: ReaderScheduleSettings) => request<{ settings: ReaderScheduleSettings }>("/api/scheduling/my-settings", "PUT", settings);
export const loadReaders = () => request<{ readers: ReaderSummary[] }>("/api/scheduling/readers");
export const loadReaderSlots = (readerUid: string) => request<ReaderSlots>(`/api/scheduling/readers/${encodeURIComponent(readerUid)}/slots`);
export const createBooking = (readerUid: string, startMs: number) => request<{ booking: Booking }>("/api/scheduling/bookings", "POST", { readerUid, startMs });
export const loadBookings = () => request<{ asMember: Booking[]; asReader: Booking[] }>("/api/scheduling/bookings");
export const cancelBooking = (bookingId: string) => request<{ cancelled: boolean }>(`/api/scheduling/bookings/${encodeURIComponent(bookingId)}/cancel`, "POST", {});

export const formatPrice = (priceType: "free" | "paid", priceCents: number) =>
  priceType === "free" ? "Free" : `$${(priceCents / 100).toFixed(2)}`;

export const STATUS_LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  pending_payment: "Pending payment",
  payment_expired: "Payment window ended",
  payment_conflict: "Paid · needs refund",
  cancelled_by_member: "Cancelled by member",
  cancelled_by_reader: "Cancelled by reader"
};

export const startBookingPayment = (bookingId: string) => request<{ url: string }>(`/api/scheduling/bookings/${encodeURIComponent(bookingId)}/checkout`, "POST", {});

export const CALL_EARLY_JOIN_MS = 10 * 60 * 1000;
export const CALL_LATE_JOIN_MS = 15 * 60 * 1000;
export const canJoinCall = (booking: Booking, now = Date.now()) =>
  booking.status === "confirmed" && now >= booking.startMs - CALL_EARLY_JOIN_MS && now <= booking.endMs + CALL_LATE_JOIN_MS;

export type PrivateReadingCard = { id: number | null; reversed: boolean | null; revealed: boolean };
export type PrivateReading = { spread: "single" | "three"; version: number; updatedAtMs: number; cards: PrivateReadingCard[] };
export type PrivateReadingAction =
  | { action: "draw"; spread: "single" | "three" }
  | { action: "reveal"; index: number }
  | { action: "revealNext" | "revealAll" | "reset" };

const readingPath = (bookingId: string) => `/api/scheduling/bookings/${encodeURIComponent(bookingId)}/call/reading`;
export const loadPrivateReading = (bookingId: string, since?: number) =>
  request<PrivateReading | { unchanged: true; version: number }>(`${readingPath(bookingId)}${since === undefined ? "" : `?since=${since}`}`);
export const updatePrivateReading = (bookingId: string, body: PrivateReadingAction) =>
  request<PrivateReading>(readingPath(bookingId), "POST", body);
