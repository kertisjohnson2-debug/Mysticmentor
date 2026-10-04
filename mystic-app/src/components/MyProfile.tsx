import { useEffect, useState } from "react";
import { Camera, Check, ImagePlus, LoaderCircle, UserRound } from "lucide-react";
import type { UserIdentity } from "../types/userProfile";

type Props = {
  identity: UserIdentity;
  email: string;
  isSaving: boolean;
  saveError: string;
  saveMessage: string;
  onSave: (displayName: string, photo: File | null) => Promise<boolean>;
};

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

export default function MyProfile({
  identity,
  email,
  isSaving,
  saveError,
  saveMessage,
  onSave
}: Props) {
  const [displayName, setDisplayName] = useState(identity.displayName);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");

  useEffect(() => {
    setDisplayName(identity.displayName);
  }, [identity.displayName]);

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
    if (await onSave(chosenName, photo)) setPhoto(null);
  };

  const shownPhoto = photoPreview || identity.avatarUrl;

  return (
    <section className="fade-in space-y-5 pb-5">
      <header className="space-y-1 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-teal-300">Your Celestial Identity</p>
        <h1 className="font-display text-xl font-bold tracking-wide text-white">My Profile</h1>
        <p className="text-xs text-slate-400">Shape how you appear throughout the Sanctuary.</p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-mystic-gold/60 bg-gradient-to-br from-[#1d123a]/95 to-[#0a0618]/95 p-5 text-left shadow-[0_0_28px_rgba(243,198,95,0.08)]"
      >
        <div className="flex flex-col items-center gap-3 border-b border-[#2c1654]/60 pb-5">
          <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-mystic-gold bg-[#070412] shadow-[0_0_24px_rgba(243,198,95,0.18)]">
            {shownPhoto ? (
              <img src={shownPhoto} alt={`${displayName || "Profile"} profile`} className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-12 w-12 text-mystic-gold/80" aria-hidden="true" />
            )}
            <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border border-mystic-gold/50 bg-[#120a26] text-mystic-gold">
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-mystic-gold/50 bg-mystic-gold/10 px-4 py-2 text-xs font-semibold text-mystic-gold transition hover:bg-mystic-gold/20 focus-within:ring-2 focus-within:ring-mystic-gold/60">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
            {shownPhoto ? "Change Photo" : "Add Photo"}
            <input type="file" accept="image/*" className="sr-only" onChange={handlePhotoChange} aria-label="Choose a profile photo" />
          </label>
          <p className="text-[10px] text-slate-500">Choose a photo from your device (up to 5 MB).</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="profile-chosen-name" className="block text-[10px] font-bold uppercase tracking-wider text-slate-300">
            Chosen Name
          </label>
          <input
            id="profile-chosen-name"
            type="text"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setPhotoError("");
            }}
            maxLength={100}
            required
            autoComplete="nickname"
            className="w-full rounded-lg border border-[#2c1654] bg-[#070412] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-mystic-gold"
          />
          <p className="text-[10px] text-slate-500">This name is part of your reusable profile identity.</p>
        </div>

        <div className="space-y-1 border-t border-[#2c1654]/50 pt-3">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Account Email</span>
          <span className="block break-all text-xs text-slate-300">{email}</span>
        </div>

        {(photoError || saveError) && (
          <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">
            {photoError || saveError}
          </p>
        )}
        {saveMessage && (
          <p role="status" className="rounded-lg border border-teal-400/30 bg-teal-950/30 px-3 py-2 text-xs text-teal-300">
            {saveMessage}
          </p>
        )}

        <button
          type="submit"
          disabled={isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-mystic-gold px-4 py-3 text-xs font-bold uppercase tracking-wider text-[#0b081c] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
        >
          {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {isSaving ? "Saving Profile..." : "Save Profile"}
        </button>
      </form>
    </section>
  );
}
