import { useEffect, useRef, useState } from "react";
import { Check, LoaderCircle, Search, UserPlus, Users, X } from "lucide-react";
import {
  loadConnectionState,
  loadMemberPage,
  respondToConnectionRequest,
  sendConnectionRequest,
  type ConnectionMember,
  type ConnectionRequestItem,
  type ConnectionState
} from "../lib/connections";

const emptyConnections: ConnectionState = { incoming: [], outgoing: [], connections: [] };

export default function Connections({ uid }: { uid: string }) {
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
  const [memberError, setMemberError] = useState("");

  useEffect(() => {
    let active = true;
    usedMemberCursors.current.clear();
    setConnectionsLoading(true);
    setConnectionError("");
    setMemberError("");
    const stateLoad = loadConnectionState()
      .then((state) => {
        if (active) setConnectionState(state);
      })
      .catch((error: unknown) => {
        if (active) setConnectionError(error instanceof Error ? error.message : "Could not load connections.");
      });
    const membersLoad = loadMemberPage(null)
      .then((page) => {
        if (!active) return;
        setMembers(page.members);
        setMemberCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (active) setMemberError(error instanceof Error ? error.message : "Could not load members.");
      });
    void Promise.all([stateLoad, membersLoad]).finally(() => {
      if (active) setConnectionsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [uid]);


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
      setMemberError("Member search stopped because the service returned a repeated page cursor.");
      return;
    }
    setMembersLoading(true);
    setMemberError("");
    try {
      const page = await loadMemberPage(memberCursor, submittedMemberSearch);
      usedMemberCursors.current.add(memberCursor);
      setMembers((current) => [...current, ...page.members.filter((member) => !current.some((existing) => existing.uid === member.uid))]);
      if (page.nextCursor && usedMemberCursors.current.has(page.nextCursor)) {
        setMemberCursor(null);
        setMemberError("Member search stopped because the service returned a repeated page cursor.");
      } else {
        setMemberCursor(page.nextCursor);
      }
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not load more members.");
    } finally {
      setMembersLoading(false);
    }
  };

  const searchMembers = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMembersLoading(true);
    setMemberError("");
    try {
      const search = memberSearch.trim();
      const page = await loadMemberPage(null, search);
      usedMemberCursors.current.clear();
      setMembers(page.members);
      setMemberCursor(page.nextCursor);
      setSubmittedMemberSearch(search);
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not search members.");
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
    member.uid !== uid &&
    !relatedUids.has(member.uid)
  );

  const memberRow = (member: ConnectionMember, detail?: string) => (
    <div key={member.uid} className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-mystic-gold/40 bg-[#070412] text-xs font-semibold text-mystic-gold">
        {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" /> : member.displayName.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{member.displayName}</p>
        {detail && <p className="text-xs text-slate-400">{detail}</p>}
      </div>
    </div>
  );

  return (
    <div className="fade-in pb-5">
      <section aria-labelledby="connections-heading" className="mx-auto w-full max-w-3xl space-y-5 rounded-2xl border border-mystic-gold/40 bg-gradient-to-br from-[#1d123a]/90 to-[#0a0618]/95 p-4 text-left shadow-[0_0_28px_rgba(243,198,95,0.06)] sm:p-6">
        <header className="flex items-center gap-3 border-b border-[#2c1654]/60 pb-4">
          <Users className="h-5 w-5 text-mystic-gold" aria-hidden="true" />
          <div>
            <h2 id="connections-heading" className="font-display text-xl font-semibold text-white">Connections</h2>
            <p className="text-xs text-slate-300">Find members and build your circle.</p>
          </div>
        </header>

        {connectionError && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-xs text-red-300">{connectionError}</p>}

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-teal-100">Incoming requests</h3>
          {connectionsLoading ? <p className="text-xs leading-relaxed text-slate-400">Loading requests…</p> : connectionState.incoming.length === 0 ? (
            <p className="text-xs leading-relaxed text-slate-400">No connection requests right now.</p>
          ) : connectionState.incoming.map((item: ConnectionRequestItem) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3.5">
              {memberRow(item.member, "Wants to connect")}
              <div className="ml-auto flex shrink-0 gap-2">
                <button type="button" disabled={busyKey === item.id} onClick={() => void performConnectionAction(item.id, () => respondToConnectionRequest(item.id, "accept"))} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-mystic-gold px-3.5 text-xs font-bold text-[#0b081c] disabled:opacity-50"><Check className="h-3.5 w-3.5" />Accept</button>
                <button type="button" disabled={busyKey === item.id} onClick={() => void performConnectionAction(item.id, () => respondToConnectionRequest(item.id, "decline"))} aria-label={`Decline ${item.member.displayName}'s request`} className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 text-slate-300 disabled:opacity-50"><X className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-teal-100">Your connections</h3>
          {connectionsLoading ? <p className="text-xs leading-relaxed text-slate-400">Loading connections…</p> : connectionState.connections.length === 0 ? (
            <p className="text-xs leading-relaxed text-slate-400">Accepted connections will appear here.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {connectionState.connections.map((item) => <div key={item.id} className="rounded-xl border border-teal-300/15 bg-teal-950/15 p-3">{memberRow(item.member, "Connected")}</div>)}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t border-[#2c1654]/60 pt-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-teal-100">Discover members</h3>
          <form onSubmit={searchMembers} className="flex gap-2">
            <label className="sr-only" htmlFor="connection-member-search">Search members</label>
            <input id="connection-member-search" type="search" value={memberSearch} onChange={(event) => setMemberSearch(event.target.value)} placeholder="Search by chosen name" className="min-w-0 flex-1 min-h-11 rounded-lg border border-[#2c1654] bg-[#070412] px-3 py-2.5 text-base sm:text-sm text-white outline-none placeholder:text-slate-500 focus:border-mystic-gold" />
            <button type="submit" disabled={membersLoading} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg bg-mystic-gold px-4 text-sm font-bold text-[#0b081c] disabled:cursor-wait disabled:opacity-60">
              {membersLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Search
            </button>
          </form>
          {memberError && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-950/30 px-3 py-2 text-xs text-red-200">{memberError}</p>}
          {connectionsLoading ? <p className="text-xs leading-relaxed text-slate-400">Loading members…</p> : memberError && members.length === 0 ? null : filteredMembers.length === 0 ? (
            <p className="text-xs leading-relaxed text-slate-400">{members.length ? "No new members to connect with in these results." : memberCursor ? `No matches in this batch for “${submittedMemberSearch}”. Load more to continue searching.` : submittedMemberSearch ? `No registered members match “${submittedMemberSearch}”.` : "No other members found."}</p>
          ) : (
            <div className="space-y-2">
              {filteredMembers.map((member) => (
                <div key={member.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3.5">
                  {memberRow(member)}
                  <button type="button" disabled={busyKey === member.uid} onClick={() => void performConnectionAction(member.uid, () => sendConnectionRequest(member.uid))} className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg border border-mystic-gold/40 bg-mystic-gold/10 px-3.5 text-xs font-semibold text-mystic-gold disabled:opacity-50">
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
            <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-teal-100">Sent requests</h3>
            {connectionState.outgoing.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 p-3.5">
                {memberRow(item.member, "Request pending")}
                <button type="button" disabled={busyKey === item.id} onClick={() => void performConnectionAction(item.id, () => respondToConnectionRequest(item.id, "cancel"))} className="ml-auto min-h-9 rounded-lg border border-white/15 px-3 text-[10px] font-semibold text-slate-300 disabled:opacity-50">Cancel</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
