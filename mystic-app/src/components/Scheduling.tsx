import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { CalendarDays, Clock, CreditCard, LoaderCircle, Plus, Trash2, UserRound, Video } from "lucide-react";
import PrivateCall from "./PrivateCall";
import ProfileLink from "./ProfileLink";
import { auth } from "../firebase";
import {
  SCHEDULE_DURATIONS,
  SCHEDULE_READING_TYPES,
  STATUS_LABELS,
  canJoinCall,
  startBookingPayment,
  cancelBooking,
  createBooking,
  formatPrice,
  loadBookings,
  loadMySchedule,
  loadReaderSlots,
  loadReaders,
  saveMySchedule,
  type AvailabilityWindow,
  type Booking,
  type ReaderScheduleSettings,
  type ReaderSlots,
  type ReaderSummary
} from "../lib/scheduling";

type Tab = "book" | "appointments" | "reader";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const timeZoneOptions = (): string[] => {
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone");
  const zones = supported && supported.length ? supported : ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"];
  return zones.includes(browserZone()) ? zones : [browserZone(), ...zones];
};

const formatSlotTime = (ms: number, timeZone?: string) =>
  new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZone });
const formatDay = (ms: number, timeZone?: string) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", timeZone });
const formatWhen = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });

const defaultSettings = (): ReaderScheduleSettings => ({
  enabled: false,
  timeZone: browserZone(),
  durationMinutes: 30,
  readingType: "Tarot",
  priceType: "free",
  priceCents: 0,
  weekly: []
});

const fieldClass = "h-11 w-full rounded-lg border border-[#39235f] bg-[#090613] px-3 text-sm text-white outline-none focus:border-mystic-gold";
const goldButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-mystic-gold px-4 text-sm font-bold text-[#0b081c] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
const ghostButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:opacity-50";

function ReaderAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-mystic-gold/60 bg-[#271643] font-display text-sm text-mystic-gold">
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : (name.slice(0, 2).toUpperCase() || <UserRound className="h-5 w-5" />)}
    </span>
  );
}

export default function Scheduling({ onSignIn, isAdmin = false, onViewProfile }: { onSignIn: () => void; isAdmin?: boolean; onViewProfile?: (uid: string) => void }) {
  const [viewerUid, setViewerUid] = useState<string | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("book");
  const [eligible, setEligible] = useState(false);
  const [settingsState, setSettingsState] = useState<"loading" | "ready" | "error">("loading");
  const [settingsError, setSettingsError] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [readers, setReaders] = useState<ReaderSummary[] | null>(null);
  const [readersError, setReadersError] = useState("");
  const [selectedReader, setSelectedReader] = useState<ReaderSummary | null>(null);
  const [slotData, setSlotData] = useState<ReaderSlots | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  const [bookings, setBookings] = useState<{ asMember: Booking[]; asReader: Booking[] } | null>(null);
  const [bookingsError, setBookingsError] = useState("");
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [callBooking, setCallBooking] = useState<Booking | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setClockTick((value) => value + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const [settings, setSettings] = useState<ReaderScheduleSettings>(defaultSettings);
  const [priceInput, setPriceInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const zones = useMemo(timeZoneOptions, []);

  useEffect(() => onAuthStateChanged(auth, (user) => setViewerUid(user && !user.isAnonymous ? user.uid : null)), []);

  const refreshReaders = useCallback(async () => {
    setReadersError("");
    try {
      setReaders((await loadReaders()).readers);
    } catch (error) {
      setReadersError(error instanceof Error ? error.message : "Could not load readers.");
      setReaders([]);
    }
  }, []);

  // The server decides who may publish; a failed load must never hide the settings tab from an admin.
  const refreshMySettings = useCallback(async () => {
    setSettingsState("loading");
    setSettingsError("");
    try {
      const { eligible: isEligible, settings: stored } = await loadMySchedule();
      setEligible(isEligible);
      if (stored) {
        setSettings(stored);
        setPriceInput(stored.priceType === "paid" ? (stored.priceCents / 100).toFixed(2) : "");
      }
      setSettingsState("ready");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Could not load your scheduling settings.");
      setSettingsState("error");
    }
  }, []);

  const refreshBookings = useCallback(async () => {
    setBookingsError("");
    try {
      setBookings(await loadBookings());
    } catch (error) {
      setBookingsError(error instanceof Error ? error.message : "Could not load appointments.");
      setBookings({ asMember: [], asReader: [] });
    }
  }, []);

  // Account switches must never carry the previous account's role, schedule or appointments over.
  useEffect(() => {
    setEligible(false);
    setSettingsState("loading");
    setSettingsError("");
    setSettings(defaultSettings);
    setPriceInput("");
    setBookings(null);
    setReaders(null);
    setSelectedReader(null);
    setSlotData(null);
    setSelectedSlot(null);
    setCallBooking(null);
    setCancelTarget(null);
    setNotice(null);
    setTab("book");
  }, [viewerUid]);

  useEffect(() => {
    if (!viewerUid) return;
    void refreshReaders();
    void refreshBookings();
    void refreshMySettings();
  }, [viewerUid, refreshReaders, refreshBookings, refreshMySettings]);

  const openReader = async (reader: ReaderSummary) => {
    setSelectedReader(reader);
    setSlotData(null);
    setSelectedSlot(null);
    setSlotsLoading(true);
    setNotice(null);
    try {
      setSlotData(await loadReaderSlots(reader.uid));
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not load available times." });
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleBook = async () => {
    if (!selectedReader || selectedSlot === null || isBooking) return;
    setIsBooking(true);
    setNotice(null);
    try {
      const { booking } = await createBooking(selectedReader.uid, selectedSlot);
      setNotice({ kind: "ok", text: booking.status === "confirmed" ? "Your appointment is confirmed." : "Your time is held. It stays pending until payment is completed." });
      setSelectedSlot(null);
      await Promise.all([refreshBookings(), openReaderSilently(selectedReader)]);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not create the booking." });
      await openReaderSilently(selectedReader);
      setSelectedSlot(null);
    } finally {
      setIsBooking(false);
    }
  };

  const openReaderSilently = async (reader: ReaderSummary) => {
    try {
      setSlotData(await loadReaderSlots(reader.uid));
    } catch {
      setSlotData(null);
    }
  };

  const handlePay = async (bookingId: string) => {
    setPayingId(bookingId);
    setNotice(null);
    try {
      const { url } = await startBookingPayment(bookingId);
      window.location.assign(url);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not start payment." });
      setPayingId(null);
    }
  };

  const handleCancel = async (bookingId: string) => {
    setIsCancelling(true);
    setNotice(null);
    try {
      await cancelBooking(bookingId);
      setCancelTarget(null);
      setNotice({ kind: "ok", text: "The appointment was cancelled." });
      await refreshBookings();
      if (selectedReader) await openReaderSilently(selectedReader);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not cancel the appointment." });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSaveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setNotice(null);
    try {
      const dollars = Number(priceInput);
      const next: ReaderScheduleSettings = {
        ...settings,
        priceCents: settings.priceType === "paid" ? Math.round(dollars * 100) : 0
      };
      if (settings.priceType === "paid" && (!Number.isFinite(dollars) || dollars <= 0)) throw new Error("Enter a price greater than $0, or choose Free.");
      const saved = await saveMySchedule(next);
      setSettings(saved.settings);
      setNotice({ kind: "ok", text: saved.settings.enabled ? "Your schedule is published." : "Your schedule is saved and hidden from members." });
      void refreshReaders();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "Could not save your schedule." });
    } finally {
      setIsSaving(false);
    }
  };

  const updateWindow = (index: number, patch: Partial<AvailabilityWindow>) =>
    setSettings((current) => ({ ...current, weekly: current.weekly.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  const slotsByDay = useMemo(() => {
    const groups = new Map<string, { label: string; slots: { startMs: number; endMs: number }[] }>();
    (slotData?.slots ?? []).forEach((slot) => {
      const key = new Date(slot.startMs).toDateString();
      const group = groups.get(key) ?? { label: formatDay(slot.startMs), slots: [] };
      group.slots.push(slot);
      groups.set(key, group);
    });
    return [...groups.values()];
  }, [slotData]);

  if (callBooking) {
    return <PrivateCall booking={callBooking} onLeave={() => { setCallBooking(null); void refreshBookings(); }} />;
  }

  if (viewerUid === undefined) {
    return <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />Loading…</div>;
  }

  if (viewerUid === null) {
    return (
      <section className="mx-auto max-w-xl rounded-2xl border border-mystic-gold/40 bg-[#100a20]/90 px-5 py-10 text-center">
        <CalendarDays className="mx-auto h-8 w-8 text-mystic-gold" aria-hidden="true" />
        <h2 className="mt-3 font-display text-xl text-white">Reader Scheduling</h2>
        <p className="mt-2 text-sm text-slate-400">Sign in with a member account to book readings or manage your availability.</p>
        <button type="button" onClick={onSignIn} className={`${goldButton} mt-4`}>Sign in</button>
      </section>
    );
  }

  // Only the server's verdict unlocks reader controls. The client admin hint merely keeps a retry visible if that check failed to load.
  const showReaderTab = eligible || (isAdmin && settingsState === "error");
  const tabs: { id: Tab; label: string }[] = [
    { id: "book", label: "Book a reading" },
    { id: "appointments", label: "Appointments" },
    ...(showReaderTab ? [{ id: "reader" as Tab, label: "Reader settings" }] : [])
  ];
  const now = Date.now();
  const renderBooking = (booking: Booking, asReader: boolean) => {
    const upcoming = booking.endMs > now && (booking.status === "confirmed" || booking.status === "pending_payment");
    return (
      <li key={booking.id} className="rounded-xl border border-white/10 bg-black/20 p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-base text-white">{asReader ? booking.memberName : booking.readerName}</p>
            <p className="text-xs text-slate-300">{formatWhen(booking.startMs)} · {booking.durationMinutes} min · {booking.readingType}</p>
            <p className="text-[11px] text-slate-500">Reader time zone: {booking.timeZone} · {formatPrice(booking.priceType, booking.priceCents)}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${booking.status === "confirmed" ? "border-emerald-300/40 text-emerald-200" : booking.status === "pending_payment" ? "border-amber-300/40 text-amber-200" : "border-white/15 text-slate-400"}`}>{STATUS_LABELS[booking.status]}</span>
        </div>
        {booking.status === "pending_payment" && <p className="mt-2 text-[11px] text-amber-200/80">Payment has not been collected. No private-session access is granted until the payment is verified.</p>}
        {booking.status === "payment_conflict" && <p className="mt-2 text-[11px] text-rose-200/80">Your payment arrived after this time was taken. Contact support for a refund.</p>}
        {!asReader && booking.status === "pending_payment" && (
          <button type="button" disabled={payingId === booking.id} onClick={() => void handlePay(booking.id)} className={`${goldButton} mt-3 min-h-10 text-xs`}>{payingId === booking.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}Pay {formatPrice(booking.priceType, booking.priceCents)} to confirm</button>
        )}
        {canJoinCall(booking, now) && <button type="button" onClick={() => setCallBooking(booking)} className={`${goldButton} mt-3 min-h-10 text-xs`}><Video className="h-4 w-4" />Join private video session</button>}
        {booking.status === "confirmed" && !canJoinCall(booking, now) && booking.endMs > now && <p className="mt-2 text-[11px] text-slate-400">Your private video room opens 10 minutes before the start time.</p>}
        {upcoming && (cancelTarget === booking.id ? (
          <div role="alertdialog" aria-label="Confirm cancellation" className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-rose-300/30 bg-rose-950/25 p-2.5 text-xs text-rose-100">
            <span className="mr-auto">Cancel this appointment?</span>
            <button type="button" disabled={isCancelling} onClick={() => void handleCancel(booking.id)} className="min-h-9 rounded-lg bg-rose-600 px-3 font-semibold text-white disabled:opacity-50">{isCancelling ? "Cancelling…" : "Yes, cancel"}</button>
            <button type="button" onClick={() => setCancelTarget(null)} className="min-h-9 rounded-lg border border-white/15 px-3 text-slate-200">Keep</button>
          </div>
        ) : <button type="button" onClick={() => setCancelTarget(booking.id)} className="mt-3 min-h-9 rounded-lg border border-rose-300/30 px-3 text-xs text-rose-200 hover:bg-rose-950/30">Cancel appointment</button>)}
      </li>
    );
  };

  const section = (title: string, list: Booking[], asReader: boolean) => {
    const upcoming = list.filter((b) => b.endMs > now && (b.status === "confirmed" || b.status === "pending_payment"));
    const past = list.filter((b) => !upcoming.includes(b));
    return (
      <div className="space-y-3">
        <h3 className="font-display text-lg text-white">{title}</h3>
        {upcoming.length === 0 ? <p className="text-xs text-slate-500">No upcoming appointments.</p> : <ul className="space-y-2 md:grid md:grid-cols-2 md:gap-2 md:space-y-0 lg:block lg:space-y-2">{upcoming.map((b) => renderBooking(b, asReader))}</ul>}
        {past.length > 0 && <details className="text-xs text-slate-400"><summary className="cursor-pointer">Recent cancelled or past ({past.length})</summary><ul className="mt-2 space-y-2">{past.map((b) => renderBooking(b, asReader))}</ul></details>}
      </div>
    );
  };

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 pb-8 text-slate-100">
      <header className="rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#1d123a]/95 to-[#0a0618]/95 p-5 shadow-[0_0_28px_rgba(243,198,95,0.08)]">
        <p className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-200"><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />Celestial Tools</p>
        <h1 className="mt-1 font-display text-2xl text-white">Reader Scheduling</h1>
        <p className="mt-1 text-xs text-slate-400">Book time with an approved reader, or publish your own availability.</p>
      </header>

      <div role="tablist" aria-label="Scheduling sections" className="flex gap-2 overflow-x-auto">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => { setTab(item.id); setNotice(null); }} className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-semibold transition ${tab === item.id ? "border-mystic-gold bg-mystic-gold/15 text-mystic-gold" : "border-white/15 text-slate-300 hover:bg-white/5"}`}>{item.label}</button>
        ))}
      </div>

      {notice && <p role={notice.kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${notice.kind === "error" ? "border-rose-300/40 bg-rose-950/30 text-rose-100" : "border-emerald-300/30 bg-emerald-950/25 text-emerald-100"}`}>{notice.text}</p>}

      {tab === "book" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-3">
            <h2 className="font-display text-lg text-white">Available readers</h2>
            {readers === null ? <p className="flex items-center gap-2 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />Loading readers…</p>
              : readersError ? <p role="alert" className="text-xs text-rose-200">{readersError}</p>
              : readers.length === 0 ? <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-slate-400">{eligible ? "No other readers are accepting bookings yet. You can publish your own availability from Reader settings so members can book you." : "No readers are accepting bookings yet. Approved readers can publish their availability from Reader settings."}</p>
              : <ul className="space-y-2">{readers.map((reader) => (
                <li key={reader.uid}>
                  <button type="button" onClick={() => void openReader(reader)} aria-pressed={selectedReader?.uid === reader.uid} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${selectedReader?.uid === reader.uid ? "border-mystic-gold bg-mystic-gold/10" : "border-[#6642a0]/60 bg-[#130d28]/80 hover:border-mystic-gold/50"}`}>
                    <ReaderAvatar name={reader.displayName} avatarUrl={reader.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base text-white">{reader.displayName}</span>
                      <span className="block text-[11px] text-slate-400">{reader.readingType} · {reader.durationMinutes} min · {formatPrice(reader.priceType, reader.priceCents)}</span>
                      <span className="block text-[10px] text-slate-500">Reader time zone: {reader.timeZone}</span>
                    </span>
                  </button>
                </li>
              ))}</ul>}
          </div>

          <div className="space-y-3 rounded-2xl border border-[#6642a0]/60 bg-[#130d28]/70 p-4">
            {!selectedReader ? <p className="text-sm text-slate-400">Choose a reader to see their available times.</p> : slotsLoading ? <p className="flex items-center gap-2 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />Loading available times…</p> : !slotData ? <p className="text-xs text-slate-400">Available times could not be loaded.</p> : (
              <>
                <div className="flex items-center gap-3">
                  <ProfileLink uid={selectedReader.uid} name={slotData.reader.displayName} onOpen={onViewProfile} className="shrink-0 rounded-full transition hover:ring-2 hover:ring-mystic-gold/50">
                    <ReaderAvatar name={slotData.reader.displayName} avatarUrl={slotData.reader.avatarUrl} />
                  </ProfileLink>
                  <div>
                    <h2 className="font-display text-lg text-white"><ProfileLink uid={selectedReader.uid} name={slotData.reader.displayName} onOpen={onViewProfile} className="text-left transition hover:text-mystic-gold hover:underline">{slotData.reader.displayName}</ProfileLink></h2>
                    <p className="text-xs text-slate-300">{slotData.settings.readingType} · {slotData.settings.durationMinutes} min · {formatPrice(slotData.settings.priceType, slotData.settings.priceCents)}</p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">Times are shown in your local time zone ({browserZone()}). Reader time zone: {slotData.settings.timeZone}.</p>
                {slotsByDay.length === 0 ? <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-400">No open times in the next two weeks.</p> : (
                  <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                    {slotsByDay.map((group) => (
                      <div key={group.label}>
                        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-teal-200">{group.label}</h3>
                        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                          {group.slots.map((slot) => (
                            <button key={slot.startMs} type="button" aria-pressed={selectedSlot === slot.startMs} onClick={() => setSelectedSlot(slot.startMs)} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition ${selectedSlot === slot.startMs ? "border-mystic-gold bg-mystic-gold text-[#0b081c]" : "border-mystic-gold/30 text-mystic-gold hover:bg-mystic-gold/10"}`}><Clock className="h-3.5 w-3.5" aria-hidden="true" />{formatSlotTime(slot.startMs)}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {selectedSlot !== null && (
                  <div className="space-y-2 rounded-xl border border-mystic-gold/40 bg-mystic-gold/5 p-3">
                    <p className="text-sm text-white">{formatWhen(selectedSlot)} · {slotData.settings.durationMinutes} min with {slotData.reader.displayName}</p>
                    <p className="text-xs text-slate-300">{slotData.settings.readingType} · {formatPrice(slotData.settings.priceType, slotData.settings.priceCents)}</p>
                    {slotData.settings.priceType === "paid" && <p className="text-[11px] text-amber-200/90">Payment is not collected in the app yet. This time is held as “Pending payment” and grants no private-session access until payment is connected and verified.</p>}
                    <button type="button" disabled={isBooking} onClick={() => void handleBook()} className={goldButton}>{isBooking && <LoaderCircle className="h-4 w-4 animate-spin" />}{isBooking ? "Booking…" : slotData.settings.priceType === "paid" ? "Hold this time" : "Confirm booking"}</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === "appointments" && (
        <div className={`grid items-start gap-6 ${eligible || (bookings?.asReader.length ?? 0) > 0 ? "lg:grid-cols-2" : ""}`}>
          {bookings === null ? <p className="flex items-center gap-2 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />Loading appointments…</p> : (
            <>
              {bookingsError && <p role="alert" className="text-xs text-rose-200">{bookingsError}</p>}
              {section("Your bookings", bookings.asMember, false)}
              {(eligible || bookings.asReader.length > 0) && section("Booked with you", bookings.asReader, true)}
            </>
          )}
        </div>
      )}

      {tab === "reader" && showReaderTab && settingsState === "loading" && <p className="flex items-center gap-2 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />Loading your schedule…</p>}
      {tab === "reader" && showReaderTab && settingsState === "error" && (
        <div role="alert" className="space-y-2 rounded-xl border border-rose-300/30 bg-rose-950/25 p-4 text-xs text-rose-100">
          <p>{settingsError}</p>
          <button type="button" onClick={() => void refreshMySettings()} className="min-h-9 rounded-lg border border-rose-300/40 px-3">Try again</button>
        </div>
      )}
      {tab === "reader" && eligible && settingsState === "ready" && (
        <form onSubmit={(event) => void handleSaveSettings(event)} className="space-y-4 rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#1d123a]/90 to-[#0a0618]/95 p-4 sm:p-5">
          <label className="flex min-h-11 items-center gap-3 text-sm text-white"><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} className="h-5 w-5 accent-[#f3c65f]" />Accept bookings (visible to members)</label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Time zone</span><select value={settings.timeZone} onChange={(event) => setSettings({ ...settings, timeZone: event.target.value })} className={fieldClass}>{zones.map((zone) => <option key={zone} value={zone} className="bg-[#150d29]">{zone}</option>)}</select></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Reading type</span><select value={settings.readingType} onChange={(event) => setSettings({ ...settings, readingType: event.target.value })} className={fieldClass}>{SCHEDULE_READING_TYPES.map((type) => <option key={type} className="bg-[#150d29]">{type}</option>)}</select></label>
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-300">Appointment length</span><select value={settings.durationMinutes} onChange={(event) => setSettings({ ...settings, durationMinutes: Number(event.target.value) })} className={fieldClass}>{SCHEDULE_DURATIONS.map((minutes) => <option key={minutes} value={minutes} className="bg-[#150d29]">{minutes} minutes</option>)}</select></label>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-300">Price</span>
              <div className="flex gap-2">
                <select aria-label="Pricing" value={settings.priceType} onChange={(event) => setSettings({ ...settings, priceType: event.target.value as "free" | "paid" })} className={fieldClass}><option value="free" className="bg-[#150d29]">Free / fee waived</option><option value="paid" className="bg-[#150d29]">Paid (USD)</option></select>
                {settings.priceType === "paid" && <input aria-label="Price in US dollars" inputMode="decimal" value={priceInput} onChange={(event) => setPriceInput(event.target.value)} placeholder="25.00" className={`${fieldClass} max-w-28`} />}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><h2 className="font-display text-base text-white">Weekly availability</h2><button type="button" onClick={() => setSettings({ ...settings, weekly: [...settings.weekly, { day: 1, start: "09:00", end: "12:00" }] })} className={`${ghostButton} min-h-10 text-xs`}><Plus className="h-3.5 w-3.5" />Add window</button></div>
            {settings.weekly.length === 0 && <p className="text-xs text-slate-500">No availability windows yet.</p>}
            {settings.weekly.map((window, index) => (
              <div key={index} className="grid grid-cols-[1fr_auto] items-end gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                <select aria-label="Day" value={window.day} onChange={(event) => updateWindow(index, { day: Number(event.target.value) })} className={fieldClass}>{DAY_NAMES.map((name, day) => <option key={name} value={day} className="bg-[#150d29]">{name}</option>)}</select>
                <button type="button" aria-label="Remove window" onClick={() => setSettings({ ...settings, weekly: settings.weekly.filter((_, i) => i !== index) })} className="flex h-11 w-11 items-center justify-center rounded-lg border border-rose-300/30 text-rose-200 sm:order-last"><Trash2 className="h-4 w-4" /></button>
                <input aria-label="Start time" type="time" value={window.start} onChange={(event) => updateWindow(index, { start: event.target.value })} className={fieldClass} />
                <input aria-label="End time" type="time" value={window.end} onChange={(event) => updateWindow(index, { end: event.target.value })} className={fieldClass} />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">Existing bookings stay in place if you edit or disable your schedule. Cancel them from Appointments if you cannot keep them. Paid sessions are held for 15 minutes and are confirmed only after Stripe verifies the payment.</p>
          <button type="submit" disabled={isSaving} className={goldButton}>{isSaving && <LoaderCircle className="h-4 w-4 animate-spin" />}Save schedule</button>
        </form>
      )}
    </section>
  );
}
