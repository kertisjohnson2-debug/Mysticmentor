import { useEffect, useState } from "react";
import { Camera, Check, Eye, Gem, ImagePlus, LoaderCircle, ShieldCheck, UserRound } from "lucide-react";
import { loadPublicSettings, savePublicSettings, ZODIAC_GLYPHS, ZODIAC_SIGNS, type PublicSettings, type VisibilityKey } from "../lib/memberProfile";
import type { UserIdentity } from "../types/userProfile";
import MemberProgressWindow from "./MemberProgressWindow";
import MemberEarnings from "./MemberEarnings";
import EmailPreference from "./EmailPreference";
import PolicyLinks from "./PolicyLinks";

type Props = {
  identity: UserIdentity;
  bio: string;
  spiritualInterests: string;
  gemBalance: number;
  isSaving: boolean;
  saveError: string;
  saveMessage: string;
  onSave: (displayName: string, bio: string, spiritualInterests: string, photo: File | null) => Promise<boolean>;
  onBuyGems: (packageId: string, cost: number, gemsAmount: number) => Promise<void>;
  canReceivePayouts: boolean;
  returnedFromStripe: boolean;
  onPreviewPublicProfile: () => void;
  // Provided only for authorized administrator accounts.
  onOpenAdminAccess?: () => void;
};

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

export default function MyProfile({
  identity,
  bio: initialBio,
  spiritualInterests: initialSpiritualInterests,
  gemBalance,
  isSaving,
  saveError,
  saveMessage,
  onSave,
  onBuyGems,
  canReceivePayouts,
  returnedFromStripe,
  onPreviewPublicProfile,
  onOpenAdminAccess
}: Props) {
  const [displayName, setDisplayName] = useState(identity.displayName);
  const [bio, setBio] = useState(initialBio);
  const [spiritualInterests, setSpiritualInterests] = useState(initialSpiritualInterests);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<PublicSettings | null>(null);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [privacyMessage, setPrivacyMessage] = useState("");

  useEffect(() => setDisplayName(identity.displayName), [identity.displayName]);
  useEffect(() => setBio(initialBio), [initialBio]);
  useEffect(() => setSpiritualInterests(initialSpiritualInterests), [initialSpiritualInterests]);

  useEffect(() => {
    let active = true;
    loadPublicSettings().then((settings) => { if (active) { setPublicSettings(settings); setDraftSettings(settings); } }).catch(() => { if (active) setPrivacyMessage("Privacy settings could not be loaded."); });
    return () => { active = false; };
  }, [identity.uid]);

  const settingsDirty = !!publicSettings && !!draftSettings && JSON.stringify(publicSettings) !== JSON.stringify(draftSettings);

  const persistSettings = async () => {
    if (!draftSettings) return;
    setPrivacyBusy(true);
    setPrivacyMessage("");
    try {
      const saved = await savePublicSettings(draftSettings);
      setPublicSettings(saved);
      setDraftSettings(saved);
      setPrivacyMessage("Public profile settings saved.");
    } catch (error) {
      setPrivacyMessage(error instanceof Error ? error.message : "Could not save privacy settings.");
    } finally {
      setPrivacyBusy(false);
    }
  };

  useEffect(() => {
    if (!photo) {
      setPhotoPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(photo);
    setPhotoPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [photo]);

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedPhoto = event.target.files?.[0] ?? null;
    event.target.value = "";
    setPhotoError("");
    if (!selectedPhoto) return;
    if (!selectedPhoto.type.startsWith("image/")) {
      setPhoto(null);
      setPhotoError("Choose an image file for your profile photo.");
      return;
    }
    if (selectedPhoto.size > MAX_PHOTO_SIZE) {
      setPhoto(null);
      setPhotoError("Profile photos must be 5 MB or smaller.");
      return;
    }
    setPhoto(selectedPhoto);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const chosenName = displayName.trim();
    if (!chosenName) {
      setPhotoError("Chosen Name is required.");
      return;
    }
    setPhotoError("");
    if (await onSave(chosenName, bio.trim(), spiritualInterests.trim(), photo)) setPhoto(null);
  };

  const shownPhoto = photoPreview || identity.avatarUrl;
  const interests = spiritualInterests.split(",").map((interest) => interest.trim()).filter(Boolean);

  return (
    <section className="fade-in relative w-full min-w-0 overflow-hidden rounded-3xl bg-[radial-gradient(ellipse_at_85%_5%,rgba(120,80,200,0.35),transparent_35%),radial-gradient(ellipse_at_10%_90%,rgba(16,185,129,0.25),transparent_40%),linear-gradient(160deg,#04140f_0%,#02070a_55%,#120a2a_100%)] px-3 py-4 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <div className="pointer-events-none absolute inset-0 opacity-80 [background-image:radial-gradient(1px_1px_at_6%_12%,#fff,transparent),radial-gradient(1.5px_1.5px_at_18%_40%,#f3c65f,transparent),radial-gradient(1px_1px_at_30%_8%,#fff,transparent),radial-gradient(1px_1px_at_48%_92%,#fff,transparent),radial-gradient(1.5px_1.5px_at_64%_6%,#f3c65f,transparent),radial-gradient(1px_1px_at_82%_30%,#fff,transparent),radial-gradient(1.5px_1.5px_at_94%_56%,#f3c65f,transparent),radial-gradient(1px_1px_at_72%_88%,#fff,transparent),radial-gradient(1px_1px_at_10%_70%,#fff,transparent),radial-gradient(1.5px_1.5px_at_38%_60%,#fff,transparent)]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-10 top-4 h-24 w-24 rounded-full bg-[radial-gradient(circle,rgba(200,170,255,0.55),transparent_65%)] blur-md" aria-hidden="true" />
        <span className="pointer-events-none absolute left-2 top-2 select-none text-3xl sm:text-5xl text-[#f6d77a] drop-shadow-[0_0_12px_rgba(246,215,122,0.95)]" aria-hidden="true">♌</span>
        <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 select-none text-3xl sm:text-5xl text-emerald-200 drop-shadow-[0_0_12px_rgba(110,231,183,0.95)]" aria-hidden="true">♎</span>
        <span className="pointer-events-none absolute right-2 top-2 select-none text-3xl sm:text-5xl text-[#f6d77a] drop-shadow-[0_0_12px_rgba(246,215,122,0.95)]" aria-hidden="true">♏</span>
        <span className="pointer-events-none absolute left-1 top-1/3 select-none text-3xl sm:text-5xl text-emerald-200 drop-shadow-[0_0_12px_rgba(110,231,183,0.95)]" aria-hidden="true">♍</span>
        <span className="pointer-events-none absolute right-1 top-1/3 select-none text-3xl sm:text-5xl text-[#f6d77a] drop-shadow-[0_0_12px_rgba(246,215,122,0.95)]" aria-hidden="true">♊</span>
        <span className="pointer-events-none absolute left-1 bottom-1/3 select-none text-3xl sm:text-5xl text-[#f6d77a] drop-shadow-[0_0_12px_rgba(246,215,122,0.95)]" aria-hidden="true">♒</span>
        <span className="pointer-events-none absolute right-1 bottom-1/3 select-none text-3xl sm:text-5xl text-emerald-200 drop-shadow-[0_0_12px_rgba(110,231,183,0.95)]" aria-hidden="true">♈</span>
        <span className="pointer-events-none absolute left-2 bottom-2 select-none text-3xl sm:text-5xl text-emerald-200 drop-shadow-[0_0_12px_rgba(110,231,183,0.95)]" aria-hidden="true">♐</span>
        <span className="pointer-events-none absolute right-2 bottom-2 select-none text-3xl sm:text-5xl text-[#f6d77a] drop-shadow-[0_0_12px_rgba(246,215,122,0.95)]" aria-hidden="true">♓</span>
        <span className="pointer-events-none absolute left-1/2 bottom-1 -translate-x-1/2 select-none text-3xl sm:text-5xl text-[#f6d77a] drop-shadow-[0_0_12px_rgba(246,215,122,0.95)]" aria-hidden="true">♍</span>
      <div className="relative rounded-2xl border-2 border-emerald-400/50 bg-[#06130f]/90 p-1.5 shadow-[0_0_40px_rgba(52,211,153,0.35),inset_0_0_30px_rgba(52,211,153,0.08)]">
        <div className="relative space-y-4 rounded-xl border border-mystic-gold/60 p-3 sm:p-5">
          <span className="pointer-events-none absolute left-1.5 top-1.5 h-5 w-5 border-l-2 border-t-2 border-mystic-gold" aria-hidden="true" />
          <span className="pointer-events-none absolute right-1.5 top-1.5 h-5 w-5 border-r-2 border-t-2 border-mystic-gold" aria-hidden="true" />
          <span className="pointer-events-none absolute bottom-1.5 left-1.5 h-5 w-5 border-b-2 border-l-2 border-mystic-gold" aria-hidden="true" />
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 h-5 w-5 border-b-2 border-r-2 border-mystic-gold" aria-hidden="true" />
          <header className="space-y-1 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-300">Cosmic Guidance · Your Celestial Sanctuary</p>
            <h1 className="font-display text-2xl font-bold uppercase tracking-[0.12em] text-[#f6e3a6] drop-shadow-[0_0_10px_rgba(246,215,122,0.35)] sm:text-3xl">{displayName.trim() || "My Profile"}</h1>
            <div className="mx-auto h-px w-2/3 bg-gradient-to-r from-transparent via-mystic-gold to-transparent" aria-hidden="true" />
          </header>

          <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="order-2 min-w-0 space-y-3 lg:order-1">
              <MemberProgressWindow uid={identity.uid} />
              <section className="space-y-4 rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#0d2a21]/90 to-[#120a28]/95 p-4 text-left">
        <header><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200">Private account</p><h2 className="mt-1 font-display text-lg text-white">Virtual Gem Wallet</h2></header>
        <div className="flex items-center justify-between rounded-xl border border-teal-400/30 bg-black/20 px-4 py-3"><div className="flex items-center gap-2"><Gem className="h-5 w-5 text-mystic-gold" aria-hidden="true" /><div><span className="block text-[10px] font-bold uppercase tracking-wider text-teal-300">Gem Balance</span><span className="text-[10px] text-slate-400">Virtual currency — not cash or earnings</span></div></div><strong className="font-display text-xl tabular-nums text-mystic-gold">{gemBalance.toLocaleString()}</strong></div>
        <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void onBuyGems("gems_500", 4.99, 500)} className="rounded-lg border border-mystic-gold/40 bg-mystic-gold/10 px-3 py-3 text-left text-xs text-mystic-gold transition hover:bg-mystic-gold/20"><strong className="block">500 Gems</strong><span className="text-slate-300">$4.99</span></button><button type="button" onClick={() => void onBuyGems("gems_1200", 9.99, 1200)} className="rounded-lg border border-mystic-gold/40 bg-mystic-gold/10 px-3 py-3 text-left text-xs text-mystic-gold transition hover:bg-mystic-gold/20"><strong className="block">1,200 Gems</strong><span className="text-slate-300">$9.99</span></button></div>
        <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">Your balance is spendable Gems for gifting. Gift and tip earnings are shown separately under Earnings &amp; Payouts.</p>
      </section>
            </div>
            <div className="order-1 min-w-0 lg:order-2">
      <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border-2 border-mystic-gold/70 bg-gradient-to-b from-[#0d2a21]/95 to-[#150a2e]/95 p-4 text-left shadow-[0_0_30px_rgba(52,211,153,0.25)]">
        <div className="flex flex-col items-center gap-2 border-b border-mystic-gold/20 pb-3">
          <div className="relative flex h-36 w-36 items-center justify-center overflow-hidden rounded-full border-4 border-mystic-gold ring-2 ring-emerald-400/40 bg-[#070412] shadow-[0_0_24px_rgba(243,198,95,0.18)]">
            {shownPhoto ? <img src={shownPhoto} alt={`${displayName || "Profile"} profile`} className="h-full w-full object-cover" /> : <UserRound className="h-12 w-12 text-mystic-gold/80" aria-hidden="true" />}
            <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border border-mystic-gold/50 bg-[#120a26] text-mystic-gold"><Camera className="h-3.5 w-3.5" aria-hidden="true" /></span>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-mystic-gold/50 bg-mystic-gold/10 px-4 py-2 text-xs font-semibold text-mystic-gold transition hover:bg-mystic-gold/20 focus-within:ring-2 focus-within:ring-mystic-gold/60">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />{shownPhoto ? "Change Photo" : "Add Photo"}
            <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} aria-label="Choose a profile photo" />
          </label>
          <p className="text-[10px] text-slate-500">Choose a photo from your device (up to 5 MB).</p>
        </div>

        <label className="block space-y-2"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-300">Chosen Name</span><input type="text" value={displayName} onChange={(event) => { setDisplayName(event.target.value); setPhotoError(""); }} maxLength={100} required autoComplete="nickname" className="w-full rounded-lg border border-[#2c1654] bg-[#070412] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mystic-gold" /></label>
        <label className="block space-y-2"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-300">Bio</span><textarea value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} rows={3} placeholder="Share a little about your spiritual path." className="w-full resize-y rounded-lg border border-[#2c1654] bg-[#070412] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-mystic-gold" /><span className="block text-right text-[10px] text-slate-500">{bio.length}/500</span></label>
        <label className="block space-y-2"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-300">Spiritual Interests</span><input type="text" value={spiritualInterests} onChange={(event) => setSpiritualInterests(event.target.value)} maxLength={500} placeholder="Tarot, meditation, astrology" className="w-full rounded-lg border border-[#2c1654] bg-[#070412] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-mystic-gold" /><span className="block text-[10px] text-slate-500">Separate interests with commas.</span>{interests.length > 0 && <div className="flex flex-wrap gap-1.5">{interests.map((interest) => <span key={interest} className="rounded-full border border-teal-300/25 bg-teal-950/25 px-2 py-1 text-[10px] text-teal-200">{interest}</span>)}</div>}</label>
        {(photoError || saveError) && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">{photoError || saveError}</p>}
        {saveMessage && <p role="status" className="rounded-lg border border-teal-400/30 bg-teal-950/30 px-3 py-2 text-xs text-teal-300">{saveMessage}</p>}
        <button type="submit" disabled={isSaving} className="mx-auto flex min-h-11 items-center justify-center gap-2 rounded-lg bg-mystic-gold px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0b081c] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60">{isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{isSaving ? "Saving Profile..." : "Save Profile"}</button>
      </form>
            </div>
            <div className="order-3 min-w-0 space-y-3">
      <EmailPreference key={identity.uid} uid={identity.uid} />
      <div className="rounded-xl border border-[#2c1654] p-4"><PolicyLinks newTab /></div>

      <section className="relative space-y-3 rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#0d2a21]/90 to-[#120a28]/95 p-4 text-left">
        <header className="flex items-center gap-2"><Eye className="h-5 w-5 text-mystic-gold" aria-hidden="true" /><div><h2 className="font-display text-base text-white">Public Profile Visibility</h2><p className="text-[10px] text-slate-400">Choose what other members can see. Your name is always shown; email, readings, and finances are never public.</p></div></header>
        {!draftSettings ? <p role="status" className="text-xs text-slate-400">{privacyMessage || "Loading privacy settings…"}</p> : <>
          <label className="block space-y-1"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-300">Zodiac sign (optional)</span>
            <select value={draftSettings.zodiacSign} disabled={privacyBusy} onChange={(event) => { setPrivacyMessage(""); setDraftSettings({ ...draftSettings, zodiacSign: event.target.value }); }} className="w-full rounded-lg border border-[#2c1654] bg-[#070412] px-3 py-2.5 text-sm text-white outline-none focus:border-mystic-gold"><option value="">Not set</option>{ZODIAC_SIGNS.map((sign) => <option key={sign} value={sign}>{ZODIAC_GLYPHS[sign]} {sign}</option>)}</select></label>
          <div className="grid gap-2">{(([["avatar", "Profile photo"], ["bio", "Bio"], ["spiritualInterests", "Spiritual interests"], ["zodiac", "Zodiac sign"], ["readerStatus", "Authorized reader status"], ["rank", "Broadcaster rank"], ["clout", "Clout points"], ["liveStatus", "Live status"]]) as [VisibilityKey, string][]).map(([key, label]) => (
            <label key={key} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-slate-200"><span>{label}</span><input type="checkbox" checked={draftSettings.visibility[key]} disabled={privacyBusy} onChange={(event) => { setPrivacyMessage(""); setDraftSettings({ ...draftSettings, visibility: { ...draftSettings.visibility, [key]: event.target.checked } }); }} className="h-5 w-5 accent-[#f3c65f]" aria-label={`Show ${label} publicly`} /></label>
          ))}</div>
          {privacyMessage && <p role="status" className="text-[11px] text-teal-300">{privacyMessage}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void persistSettings()} disabled={privacyBusy || !settingsDirty} className="min-h-10 rounded-lg bg-mystic-gold px-4 py-2 text-xs font-bold uppercase tracking-wider text-[#0b081c] disabled:opacity-50">{privacyBusy ? "Saving…" : "Save visibility"}</button>
            <button type="button" onClick={onPreviewPublicProfile} disabled={settingsDirty || privacyBusy} title={settingsDirty ? "Save your visibility changes first" : undefined} className="min-h-10 rounded-lg border border-mystic-gold/50 px-4 py-2 text-xs font-semibold text-mystic-gold disabled:opacity-50">Preview Public Profile</button>
          </div>
        </>}
      </section>
            </div>
          </div>
          <MemberEarnings uid={identity.uid} canReceivePayouts={canReceivePayouts} returnedFromStripe={returnedFromStripe} />
          {onOpenAdminAccess && (
            <button type="button" onClick={onOpenAdminAccess} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-teal-400/40 bg-teal-400/5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-teal-300 hover:bg-teal-400/10">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" /> Admin Access
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
