import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Camera, Check, Gem, ImagePlus, LoaderCircle, ReceiptText, Sparkles, UserRound } from "lucide-react";
import { db } from "../firebase";
import type { UserIdentity } from "../types/userProfile";
import MemberProgressWindow from "./MemberProgressWindow";

type Transaction = {
  id: string;
  type?: string;
  gemsAmount?: number;
  description?: string;
  createdAt?: string;
  status?: string;
};

type Props = {
  identity: UserIdentity;
  email: string;
  bio: string;
  spiritualInterests: string;
  gemBalance: number;
  isSaving: boolean;
  saveError: string;
  saveMessage: string;
  onSave: (displayName: string, bio: string, spiritualInterests: string, photo: File | null) => Promise<boolean>;
  onBuyGems: (packageId: string, cost: number, gemsAmount: number) => Promise<void>;
};

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

function transactionLabel(transaction: Transaction) {
  if (transaction.type === "gem_purchase") return "Gem purchase";
  if (transaction.type === "spend_gift") return "Virtual gift";
  return transaction.type?.replace(/_/g, " ") || "Account activity";
}

export default function MyProfile({
  identity,
  email,
  bio: initialBio,
  spiritualInterests: initialSpiritualInterests,
  gemBalance,
  isSaving,
  saveError,
  saveMessage,
  onSave,
  onBuyGems
}: Props) {
  const [displayName, setDisplayName] = useState(identity.displayName);
  const [bio, setBio] = useState(initialBio);
  const [spiritualInterests, setSpiritualInterests] = useState(initialSpiritualInterests);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionError, setTransactionError] = useState("");

  useEffect(() => setDisplayName(identity.displayName), [identity.displayName]);
  useEffect(() => setBio(initialBio), [initialBio]);
  useEffect(() => setSpiritualInterests(initialSpiritualInterests), [initialSpiritualInterests]);

  useEffect(() => {
    const ledgerQuery = query(
      collection(db, "users", identity.uid, "transactions"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
    return onSnapshot(ledgerQuery, (snapshot) => {
      setTransactions(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      setTransactionError("");
    }, (error) => {
      console.error("Failed to load private transaction history:", error);
      setTransactionError("Your transaction history could not be loaded.");
    });
  }, [identity.uid]);

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
    <section className="fade-in space-y-5 pb-5">
      <header className="space-y-1 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-300">Your Celestial Identity</p>
        <h1 className="font-display text-xl font-bold tracking-wide text-white">My Profile</h1>
        <p className="text-xs text-slate-400">Manage your public identity and private virtual-gem account.</p>
      </header>

      <MemberProgressWindow uid={identity.uid} />

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-mystic-gold/60 bg-gradient-to-br from-[#1d123a]/95 to-[#0a0618]/95 p-5 text-left shadow-[0_0_28px_rgba(243,198,95,0.08)]">
        <div className="flex flex-col items-center gap-3 border-b border-[#2c1654]/60 pb-5">
          <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-mystic-gold bg-[#070412] shadow-[0_0_24px_rgba(243,198,95,0.18)]">
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
        <div className="space-y-1 border-t border-[#2c1654]/50 pt-3"><span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Account Email</span><span className="block break-all text-xs text-slate-300">{email}</span></div>
        {(photoError || saveError) && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">{photoError || saveError}</p>}
        {saveMessage && <p role="status" className="rounded-lg border border-teal-400/30 bg-teal-950/30 px-3 py-2 text-xs text-teal-300">{saveMessage}</p>}
        <button type="submit" disabled={isSaving} className="mx-auto flex min-h-11 items-center justify-center gap-2 rounded-lg bg-mystic-gold px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0b081c] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60">{isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{isSaving ? "Saving Profile..." : "Save Profile"}</button>
      </form>

      <section className="space-y-4 rounded-2xl border border-teal-400/30 bg-gradient-to-br from-[#102b33]/80 to-[#0a0618]/95 p-5 text-left">
        <header><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200">Private account</p><h2 className="mt-1 font-display text-lg text-white">Virtual Gem Wallet</h2></header>
        <div className="flex items-center justify-between rounded-xl border border-teal-400/30 bg-black/20 px-4 py-3"><div className="flex items-center gap-2"><Gem className="h-5 w-5 text-mystic-gold" aria-hidden="true" /><div><span className="block text-[10px] font-bold uppercase tracking-wider text-teal-300">Gem Balance</span><span className="text-[10px] text-slate-400">Virtual currency — not cash or earnings</span></div></div><strong className="font-display text-xl tabular-nums text-mystic-gold">{gemBalance.toLocaleString()}</strong></div>
        <div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => void onBuyGems("gems_500", 4.99, 500)} className="rounded-lg border border-mystic-gold/40 bg-mystic-gold/10 px-3 py-3 text-left text-xs text-mystic-gold transition hover:bg-mystic-gold/20"><strong className="block">500 Gems</strong><span className="text-slate-300">$4.99</span></button><button type="button" onClick={() => void onBuyGems("gems_1200", 9.99, 1200)} className="rounded-lg border border-mystic-gold/40 bg-mystic-gold/10 px-3 py-3 text-left text-xs text-mystic-gold transition hover:bg-mystic-gold/20"><strong className="block">1,200 Gems</strong><span className="text-slate-300">$9.99</span></button></div>
        <p className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">Real-money tip earnings are not shown here because this account has no verified earnings ledger available to members.</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#1d123a]/90 to-[#0a0618]/95 p-5 text-left">
        <header className="flex items-center gap-2"><ReceiptText className="h-5 w-5 text-mystic-gold" aria-hidden="true" /><div><h2 className="font-display text-base text-white">Virtual Gem Activity</h2><p className="text-[10px] text-slate-400">Verified account ledger entries only.</p></div></header>
        {transactionError ? <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">{transactionError}</p> : transactions.length === 0 ? <p className="text-xs text-slate-500">No verified virtual-gem activity yet.</p> : <div className="space-y-2">{transactions.map((transaction) => <div key={transaction.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-100">{transaction.description || transactionLabel(transaction)}</p><p className="text-[10px] capitalize text-slate-500">{transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : "Recorded activity"}</p></div>{typeof transaction.gemsAmount === "number" && <strong className={transaction.gemsAmount < 0 ? "text-xs text-rose-300" : "text-xs text-teal-300"}>{transaction.gemsAmount > 0 ? "+" : ""}{transaction.gemsAmount.toLocaleString()} gems</strong>}</div>)}</div>}
      </section>
    </section>
  );
}
