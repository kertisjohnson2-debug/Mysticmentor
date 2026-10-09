import { useEffect, useRef, useState } from "react";
import { Camera, Check, Gem, ImagePlus, LoaderCircle, Search, UserRound, UserPlus, Users, X } from "lucide-react";
import type { UserIdentity } from "../types/userProfile";
import {
  loadConnectionState,
  loadMemberPage,
  respondToConnectionRequest,
  sendConnectionRequest,
  type ConnectionMember,
  type ConnectionRequestItem,
  type ConnectionState
} from "../lib/connections";

type Props = {
  identity: UserIdentity;
  email: string;
  gemBalance: number;
  isSaving: boolean;
  saveError: string;
  saveMessage: string;
  onSave: (displayName: string, photo: File | null) => Promise<boolean>;
};

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;

const emptyConnections: ConnectionState = { incoming: [], outgoing: [], connections: [] };

export default function MyProfile({
  identity,
  email,
  gemBalance,
  isSaving,
  saveError,
  saveMessage,
  onSave
}: Props) {
  const [displayName, setDisplayName] = useState(identity.displayName);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [connectionState, setConnectionState] = useState(emptyConnections);
  const [members, setMembers] = useState<ConnectionMember[]>([]);
  const [memberCursor, setMemberCursor] = useState<string | null>(null);
  const usedMemberCursors = useRef(new Set<string>());
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [submittedMemberSearch, setSubmittedMemberSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(identity.displayName);
  }, [identity.displayName]);

  useEffect(() => {
    let active = true;
    usedMemberCursors.current.clear();
    setConnectionsLoading(true);
    setConnectionError("");
    void Promise.all([loadConnectionState(), loadMemberPage(null)])
      .then(([state, page]) => {
        if (!active) return;
        setConnectionState(state);
        setMembers(page.members);
        setMemberCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setConnectionError(error instanceof Error ? error.message : "Could not load connections.");
      })
      .finally(() => {
        if (active) setConnectionsLoading(false);
      });
    return () => {
      active = false;
    };
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
    if (await onSave(chosenName, photo)) setPhoto(null);
  };

  const performConnectionAction = async (key: string, action: () => Promise<unknown>) => {
    setBusyKey(key);
    setConnectionError("");
    try {
      await action();
      setConnectionState(await loadConnectionState());
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not update connections.");
    } finally {
      setBusyKey(null);
    }
  };

  const loadMoreMembers = async () => {
    if (!memberCursor || membersLoading) return;
    if (usedMemberCursors.current.has(memberCursor)) {
      setMemberCursor(null);
      setConnectionError("Member search stopped because the service returned a repeated page cursor.");
      return;
    }
    setMembersLoading(true);
    setConnectionError("");
    try {
      const page = await loadMemberPage(memberCursor, submittedMemberSearch);
      usedMemberCursors.current.add(memberCursor);
      setMembers((current) => [...current, ...page.members.filter((member) => !current.some((existing) => existing.uid === member.uid))]);
      if (page.nextCursor && usedMemberCursors.current.has(page.nextCursor)) {
        setMemberCursor(null);
        setConnectionError("Member search stopped because the service returned a repeated page cursor.");
      } else {
        setMemberCursor(page.nextCursor);
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not load more members.");
    } finally {
      setMembersLoading(false);
    }
  };

  const searchMembers = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMembersLoading(true);
    setConnectionError("");
    try {
      const search = memberSearch.trim();
      const page = await loadMemberPage(null, search);
      usedMemberCursors.current.clear();
      setMembers(page.members);
      setMemberCursor(page.nextCursor);
      setSubmittedMemberSearch(search);
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Could not search members.");
    } finally {
      setMembersLoading(false);
    }
  };

  const relatedUids = new Set([
    ...connectionState.incoming.map((item) => item.member.uid),
    ...connectionState.outgoing.map((item) => item.member.uid),
    ...connectionState.connections.map((item) => item.member.uid)
  ]);
  const filteredMembers = members.filter((member) =>
    member.uid !== identity.uid &&
    !relatedUids.has(member.uid)
  );

  const memberRow = (member: ConnectionMember, detail?: string) => (
    <div key={member.uid} className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-mystic-gold/40 bg-[#070412] text-xs font-semibold text-mystic-gold">
        {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" /> : member.displayName.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{member.displayName}</p>
        {detail && <p className="text-[10px] text-slate-500">{detail}</p>}
      </div>
    </div>
  );

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
          <p className="flex justify-between gap-2 text-[10px] text-slate-500">
            <span>This name is part of your reusable profile identity.</span>
            <span className="shrink-0 tabular-nums">{displayName.length}/100</span>
          </p>
        </div>

        <div className="space-y-1 border-t border-[#2c1654]/50 pt-3">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Account Email</span>
          <span className="block break-all text-xs text-slate-300">{email}</span>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-teal-400/30 bg-teal-950/20 px-4 py-3">
          <div className="flex items-center gap-2">
            <Gem className="h-5 w-5 text-mystic-gold" aria-hidden="true" />
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-teal-300">Gem Balance</span>
              <span className="text-[10px] text-slate-400">Private to your account</span>
            </div>
          </div>
          <strong className="font-display text-xl tabular-nums text-mystic-gold">{gemBalance.toLocaleString()}</strong>
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
          className="mx-auto flex min-h-11 items-center justify-center gap-2 rounded-lg bg-mystic-gold px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#0b081c] transition hover:brightness-110 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
        >
          {isSaving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {isSaving ? "Saving Profile..." : "Save Profile"}
        </button>
      </form>

      <section aria-labelledby="connections-heading" className="space-y-4 rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#1d123a]/90 to-[#0a0618]/95 p-4 text-left shadow-[0_0_28px_rgba(243,198,95,0.06)] sm:p-5">
        <header className="flex items-center gap-2 border-b border-[#2c1654]/60 pb-3">
          <Users className="h-5 w-5 text-mystic-gold" aria-hidden="true" />
          <div>
            <h2 id="connections-heading" className="font-display text-base font-semibold text-white">Connections</h2>
            <p className="text-[10px] text-slate-400">Find members and build your circle.</p>
          </div>
        </header>

        {connectionError && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">{connectionError}</p>}

        <div className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200">Incoming requests</h3>
          {connectionsLoading ? <p className="text-xs text-slate-500">Loading requests…</p> : connectionState.incoming.length === 0 ? (
            <p className="text-xs text-slate-500">No connection requests right now.</p>
          ) : connectionState.incoming.map((item: ConnectionRequestItem) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
              {memberRow(item.member, "Wants to connect")}
              <div className="ml-auto flex shrink-0 gap-2">
                <button type="button" disabled={busyKey === item.id} onClick={() => void performConnectionAction(item.id, () => respondToConnectionRequest(item.id, "accept"))} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-mystic-gold px-3 text-[10px] font-bold text-[#0b081c] disabled:opacity-50"><Check className="h-3.5 w-3.5" />Accept</button>
                <button type="button" disabled={busyKey === item.id} onClick={() => void performConnectionAction(item.id, () => respondToConnectionRequest(item.id, "decline"))} aria-label={`Decline ${item.member.displayName}'s request`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-300 disabled:opacity-50"><X className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200">Your connections</h3>
          {connectionsLoading ? <p className="text-xs text-slate-500">Loading connections…</p> : connectionState.connections.length === 0 ? (
            <p className="text-xs text-slate-500">Accepted connections will appear here.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {connectionState.connections.map((item) => <div key={item.id} className="rounded-xl border border-teal-300/15 bg-teal-950/15 p-3">{memberRow(item.member, "Connected")}</div>)}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-[#2c1654]/60 pt-4">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200">Discover members</h3>
          <form onSubmit={searchMembers} className="flex gap-2">
            <label className="sr-only" htmlFor="connection-member-search">Search members</label>
            <input id="connection-member-search" type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search by chosen name" className="min-w-0 flex-1 rounded-lg border border-[#2c1654] bg-[#070412] px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-mystic-gold" />
            <button type="submit" disabled={membersLoading} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg bg-mystic-gold px-3 text-xs font-bold text-[#0b081c] disabled:cursor-wait disabled:opacity-60">
              {membersLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Search
            </button>
          </form>
          {connectionsLoading ? <p className="text-xs text-slate-500">Loading members…</p> : filteredMembers.length === 0 ? (
            <p className="text-xs text-slate-500">{members.length ? "No new members to connect with in these results." : memberCursor ? `No matches in this batch for “${submittedMemberSearch}”. Load more to continue searching.` : submittedMemberSearch ? `No registered members match “${submittedMemberSearch}”.` : "No other members found."}</p>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => (
                <div key={member.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  {memberRow(member)}
                  <button type="button" disabled={busyKey === member.uid} onClick={() => void performConnectionAction(member.uid, () => sendConnectionRequest(member.uid))} className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg border border-mystic-gold/40 bg-mystic-gold/10 px-3 text-[10px] font-semibold text-mystic-gold disabled:opacity-50">
                    {busyKey === member.uid ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}Connect
                  </button>
                </div>
              ))}
            </div>
          )}
          {memberCursor && <button type="button" disabled={membersLoading} onClick={() => void loadMoreMembers()} className="w-full rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50">{membersLoading ? "Loading…" : "Load more members"}</button>}
        </div>

        {!connectionsLoading && connectionState.outgoing.length > 0 && (
          <div className="space-y-3 border-t border-[#2c1654]/60 pt-4">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200">Sent requests</h3>
            {connectionState.outgoing.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 p-3">
                {memberRow(item.member, "Request pending")}
                <button type="button" disabled={busyKey === item.id} onClick={() => void performConnectionAction(item.id, () => respondToConnectionRequest(item.id, "cancel"))} className="ml-auto min-h-9 rounded-lg border border-white/15 px-3 text-[10px] font-semibold text-slate-300 disabled:opacity-50">Cancel</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
