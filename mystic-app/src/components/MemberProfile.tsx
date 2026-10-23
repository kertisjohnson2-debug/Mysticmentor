import { ZODIAC_GLYPHS } from "../lib/memberProfile";
import { CalendarDays, Radio, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";
import { useBroadcasterRank } from "../lib/useBroadcasterRank";

export type MemberProfileData = {
  uid: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
  tarotReader?: boolean;
  zodiacSign?: string | null;
  cloutPoints?: number;
  createdAt?: string | null;
  bio?: string | null;
  spiritualInterests?: string | null;
  broadcasterRank?: string | null;
  isLive?: boolean;
};

type Props = {
  member?: MemberProfileData;
  onClose?: () => void;
};

export default function MemberProfile({ member, onClose }: Props) {
  const { status: rankStatus, rank } = useBroadcasterRank(member?.broadcasterRank ? member.uid : null);
  if (!member) return null;
  const displayedMember = member;
  const displayName = displayedMember.displayName?.trim() || "Unnamed member";
  const role = displayedMember.role?.trim() || "member";
  const isAdmin = role.toLowerCase() === "admin";
  const initials = displayName.slice(0, 2).toUpperCase();
  const joinedDate = displayedMember.createdAt && Number.isFinite(new Date(displayedMember.createdAt).getTime())
    ? new Date(displayedMember.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
    : null;
  const broadcastState = displayedMember.isLive === true ? "live" : displayedMember.isLive === false ? "offline" : "private";

  return (
    <section className="fade-in relative min-w-0 overflow-hidden rounded-3xl border-2 border-emerald-400/50 bg-[#04100d] p-4 text-left shadow-[0_0_55px_rgba(52,211,153,0.2),0_0_0_1px_rgba(243,198,95,0.25)] sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.28),transparent_45%),radial-gradient(circle_at_90%_30%,rgba(109,63,190,0.38),transparent_38%),linear-gradient(160deg,#07241c_0%,#050b0a_55%,#180c33_100%)]" aria-hidden="true" />
      <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(1px_1px_at_12%_18%,#fff,transparent),radial-gradient(1.5px_1.5px_at_78%_12%,#f3c65f,transparent),radial-gradient(1px_1px_at_40%_70%,#fff,transparent),radial-gradient(1px_1px_at_88%_64%,#fff,transparent),radial-gradient(1.5px_1.5px_at_24%_88%,#f3c65f,transparent),radial-gradient(1px_1px_at_62%_40%,#fff,transparent)]" aria-hidden="true" />
      <span className="pointer-events-none absolute left-2 top-1 select-none text-3xl sm:text-4xl text-[#f6d77a] drop-shadow-[0_0_12px_rgba(246,215,122,0.95)]" aria-hidden="true">♌</span>
      <span className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 select-none text-3xl sm:text-4xl text-emerald-200 drop-shadow-[0_0_12px_rgba(110,231,183,0.95)]" aria-hidden="true">♎</span>
      <span className="pointer-events-none absolute right-2 top-1 select-none text-3xl sm:text-4xl text-[#f6d77a] drop-shadow-[0_0_12px_rgba(246,215,122,0.95)]" aria-hidden="true">♏</span>
      <span className="pointer-events-none absolute left-1 top-1/2 select-none text-3xl sm:text-4xl text-emerald-200 drop-shadow-[0_0_12px_rgba(110,231,183,0.95)]" aria-hidden="true">♍</span>
      <span className="pointer-events-none absolute right-1 top-1/2 select-none text-3xl sm:text-4xl text-[#f6d77a] drop-shadow-[0_0_12px_rgba(246,215,122,0.95)]" aria-hidden="true">♊</span>
      <span className="pointer-events-none absolute left-2 bottom-1 select-none text-3xl sm:text-4xl text-emerald-200 drop-shadow-[0_0_12px_rgba(110,231,183,0.95)]" aria-hidden="true">♐</span>
      <span className="pointer-events-none absolute left-1/2 bottom-0 -translate-x-1/2 select-none text-3xl sm:text-4xl text-[#f6d77a] drop-shadow-[0_0_12px_rgba(246,215,122,0.95)]" aria-hidden="true">♒</span>
      <span className="pointer-events-none absolute right-2 bottom-1 select-none text-3xl sm:text-4xl text-emerald-200 drop-shadow-[0_0_12px_rgba(110,231,183,0.95)]" aria-hidden="true">♓</span>

      <div className="relative min-w-0 rounded-2xl border-2 border-mystic-gold/60 bg-[#06100d]/85 p-3 shadow-[inset_0_0_30px_rgba(52,211,153,0.1)] backdrop-blur-md sm:p-5">
        <div className="flex items-start justify-between gap-3 border-b border-mystic-gold/15 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-teal-200">Celestial Identity</p>
            <p className="mt-1 text-xs text-slate-400">Member Profile</p>
          </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-mystic-gold bg-[#120a26] text-mystic-gold shadow-lg transition hover:bg-[#2c1654] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Close member profile"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        )}
        </div>

        <div className="mt-4 flex flex-col items-center text-center">
          <div className="relative rounded-full bg-gradient-to-br from-mystic-gold via-[#fff0b0] to-[#a36a23] p-[3px] shadow-[0_0_34px_rgba(243,198,95,0.38)]">
            <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-[#130a25] bg-[#070412] text-3xl font-bold text-mystic-gold sm:h-40 sm:w-40">
              {displayedMember.avatarUrl ? (
                <img src={displayedMember.avatarUrl} alt={`${displayName} profile`} className="h-full w-full object-cover" />
              ) : initials ? (
                <span aria-label={`${displayName} initials`}>{initials}</span>
              ) : (
                <UserRound className="h-14 w-14" aria-hidden="true" />
              )}
            </div>
            <span className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border border-mystic-gold/60 bg-[#160c2d] text-mystic-gold">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>

          <h2 className="mt-5 max-w-full break-words font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">{displayName}</h2>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300/30 bg-teal-950/35 px-3 py-1.5 text-teal-200">
              {isAdmin && <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              {isAdmin ? "Administrator" : role}
            </span>
            {displayedMember.tarotReader === true && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-mystic-gold/35 bg-mystic-gold/10 px-3 py-1.5 text-mystic-gold">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Tarot Reader
              </span>
            )}
            {displayedMember.zodiacSign && ZODIAC_GLYPHS[displayedMember.zodiacSign] && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-300/40 bg-purple-950/40 px-3 py-1.5 text-purple-100"><span className="text-sm text-mystic-gold drop-shadow-[0_0_6px_rgba(243,198,95,0.9)]" aria-hidden="true">{ZODIAC_GLYPHS[displayedMember.zodiacSign]}</span>{displayedMember.zodiacSign}</span>
            )}
            {displayedMember.isLive === true && <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 bg-rose-950/30 px-3 py-1.5 text-rose-200"><Radio className="h-3 w-3" aria-hidden="true" />Live now</span>}
            {displayedMember.broadcasterRank && <span className="rounded-full border border-mystic-gold/35 bg-mystic-gold/10 px-3 py-1.5 text-mystic-gold">{rank?.currentRank.name ?? (rankStatus === "loading" ? "Loading rank..." : "Rank unavailable")}</span>}
          </div>
        </div>

        {rank && <div className="mt-4 rounded-xl border border-mystic-gold/25 bg-black/20 p-3 text-left">
          <p className="text-xs text-mystic-gold">Broadcaster rank: {rank.currentRank.name}</p>
          <div role="progressbar" aria-label="Progress toward next broadcaster rank" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rank.rankProgress * 100)} className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-mystic-gold" style={{ width: `${rank.rankProgress * 100}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-slate-400">{rank.lifetimeGemsReceived.toLocaleString()} lifetime Gems · {Math.round(rank.rankProgress * 100)}% · {rank.nextRank ? `${rank.gemsToNextRank.toLocaleString()} Gems to ${rank.nextRank.name}` : "highest rank"}</p>
        </div>}

        {(displayedMember.bio || displayedMember.spiritualInterests) && <div className="mt-4 space-y-3 rounded-2xl border border-mystic-gold/25 bg-black/20 p-4 text-left">
          {displayedMember.bio && <div><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">About</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{displayedMember.bio}</p></div>}
          {displayedMember.spiritualInterests && <div><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Spiritual interests</p><div className="mt-2 flex flex-wrap gap-1.5">{displayedMember.spiritualInterests.split(",").map((interest) => interest.trim()).filter(Boolean).map((interest) => <span key={interest} className="rounded-full border border-teal-300/25 bg-teal-950/25 px-2 py-1 text-[10px] text-teal-200">{interest}</span>)}</div></div>}
        </div>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-teal-300/20 bg-gradient-to-br from-teal-300/[0.07] via-black/20 to-purple-500/[0.08] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500"><CalendarDays className="h-3 w-3 text-teal-300" aria-hidden="true" />Member Since</p>
            <p className="mt-2 font-display text-lg text-slate-100">{joinedDate ?? <span className="text-sm text-slate-500">Not recorded</span>}</p>
          </div>
          <div className={`rounded-2xl border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${broadcastState === "live" ? "border-emerald-300/40 bg-gradient-to-br from-emerald-400/[0.12] via-black/20 to-mystic-gold/[0.08]" : "border-mystic-gold/25 bg-gradient-to-br from-mystic-gold/[0.07] via-black/20 to-purple-500/[0.08]"}`}>
            <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500"><Radio className="h-3 w-3 text-mystic-gold" aria-hidden="true" />Broadcast Status</p>
            <div className="mt-2" role="status" aria-label={broadcastState === "live" ? "Broadcasting live now" : broadcastState === "offline" ? "Not broadcasting" : "Broadcast status not shared"}>
              {broadcastState === "live" ? <>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/60 bg-emerald-400/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-emerald-200 shadow-[0_0_14px_rgba(52,211,153,0.35)]"><span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" /></span>Live now</span>
                <p className="mt-1.5 text-[11px] text-emerald-100/70">Broadcasting right now</p>
              </> : broadcastState === "offline" ? <>
                <span className="inline-flex items-center gap-2 rounded-full border border-slate-500/40 bg-slate-700/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400"><span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden="true" />Offline</span>
                <p className="mt-1.5 text-[11px] text-slate-500">Not broadcasting right now</p>
              </> : <span className="text-sm text-slate-500">Not shared</span>}
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
