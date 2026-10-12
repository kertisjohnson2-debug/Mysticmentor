import { CalendarDays, Radio, ShieldCheck, Sparkles, UserRound, X } from "lucide-react";

export type MemberProfileData = {
  uid: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
  tarotReader?: boolean;
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
  if (!member) return null;
  const displayedMember = member;
  const displayName = displayedMember.displayName?.trim() || "Unnamed member";
  const role = displayedMember.role?.trim() || "member";
  const isAdmin = role.toLowerCase() === "admin";
  const initials = displayName.slice(0, 2).toUpperCase();
  const joinedDate = displayedMember.createdAt ? new Date(displayedMember.createdAt).toLocaleDateString() : "—";

  return (
    <section className="fade-in relative overflow-hidden rounded-3xl border border-mystic-gold/70 bg-[#0c071b] p-1 text-left shadow-[0_0_55px_rgba(243,198,95,0.18)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(140,82,255,0.4),transparent_40%),radial-gradient(circle_at_86%_16%,rgba(243,198,95,0.2),transparent_26%),linear-gradient(145deg,#28144b_0%,#0c071b_56%,#170b30_100%)]" />
      <div className="absolute -left-16 top-28 h-44 w-44 rounded-full border border-mystic-gold/10" aria-hidden="true" />
      <div className="absolute -left-7 top-37 h-26 w-26 rounded-full border border-teal-200/10" aria-hidden="true" />
      <Sparkles className="absolute left-5 top-7 h-4 w-4 text-mystic-gold/70" aria-hidden="true" />
      <Sparkles className="absolute bottom-8 right-7 h-3 w-3 text-teal-200/55" aria-hidden="true" />

      <div className="relative rounded-[1.35rem] border border-white/10 bg-[#090613]/45 p-5 backdrop-blur-md sm:p-7">
        <div className="flex items-start justify-between gap-3 border-b border-mystic-gold/15 pb-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-teal-200">Celestial Identity</p>
            <p className="mt-1 text-xs text-slate-400">Member Profile</p>
          </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-mystic-gold/20 bg-black/25 p-2 text-slate-400 transition hover:border-mystic-gold/60 hover:bg-white/5 hover:text-white"
            aria-label="Close member profile"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        </div>

        <div className="mt-6 flex flex-col items-center text-center">
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

          <h2 className="mt-5 font-display text-2xl font-bold tracking-wide text-white sm:text-3xl">{displayName}</h2>
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
            {displayedMember.isLive === true && <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300/40 bg-rose-950/30 px-3 py-1.5 text-rose-200"><Radio className="h-3 w-3" aria-hidden="true" />Live now</span>}
            {displayedMember.broadcasterRank && <span className="rounded-full border border-mystic-gold/35 bg-mystic-gold/10 px-3 py-1.5 text-mystic-gold">{displayedMember.broadcasterRank}</span>}
          </div>
        </div>

        {(displayedMember.bio || displayedMember.spiritualInterests) && <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-left">
          {displayedMember.bio && <div><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">About</p><p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{displayedMember.bio}</p></div>}
          {displayedMember.spiritualInterests && <div><p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Spiritual interests</p><div className="mt-2 flex flex-wrap gap-1.5">{displayedMember.spiritualInterests.split(",").map((interest) => interest.trim()).filter(Boolean).map((interest) => <span key={interest} className="rounded-full border border-teal-300/25 bg-teal-950/25 px-2 py-1 text-[10px] text-teal-200">{interest}</span>)}</div></div>}
        </div>}

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-mystic-gold/25 bg-gradient-to-br from-mystic-gold/[0.09] to-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">Celestial Clout</p>
            <p className="mt-1 font-display text-2xl text-mystic-gold">{typeof displayedMember.cloutPoints === "number" ? displayedMember.cloutPoints.toLocaleString() : 0}</p>
          </div>
          <div className="rounded-2xl border border-teal-300/20 bg-gradient-to-br from-teal-300/[0.07] to-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <p className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500"><CalendarDays className="h-3 w-3 text-teal-300" aria-hidden="true" />Member Since</p>
            <p className="mt-2 text-sm font-medium text-slate-100">{joinedDate}</p>
          </div>
        </div>

      </div>
    </section>
  );
}
