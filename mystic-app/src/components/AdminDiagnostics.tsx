import { useEffect, useState } from "react";
import { adminFetch, type AdminSessionInfo } from "../lib/adminAccess";

type Diagnostics = {
  server: { status: "available"; uptimeSeconds: number };
  firestore: { status: "admin-authorization-read-succeeded"; detail: string };
  configuration: {
    status: "configured" | "unavailable";
    projectId: string | null;
    firestoreDatabaseId: string | null;
  };
  checksNotRun: string[];
};
const buttonClass = "min-h-11 touch-manipulation rounded-lg border border-mystic-gold/40 px-3 py-2 text-xs text-mystic-gold disabled:opacity-50";

export default function AdminDiagnostics({ session }: { session: AdminSessionInfo | null }) {
  const [result, setResult] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    adminFetch<Diagnostics>("/api/admin/diagnostics")
      .then((value) => { if (active) setResult(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Could not load diagnostics."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refresh]);
  return <section className="space-y-4 text-left">
    <h3 className="text-sm font-bold text-white">Diagnostics</h3>
    <p className="text-xs text-slate-400">Only sanitized operational status is shown. No secrets, member records, or payment details are returned.</p>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {loading && <p role="status" className="text-xs text-slate-400">Checking protected diagnostics...</p>}
    {result && <>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4">
          <dt className="text-xs text-slate-400">Admin API</dt>
          <dd className="mt-1 text-sm text-teal-300">Available · server uptime {result.server.uptimeSeconds.toLocaleString()} seconds</dd>
        </div>
        <div className="rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4">
          <dt className="text-xs text-slate-400">Firestore access</dt>
          <dd className="mt-1 text-sm text-teal-300">Admin authorization read succeeded for this request</dd>
          <p className="mt-1 text-[10px] text-slate-500">{result.firestore.detail}</p>
        </div>
        <div className="rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4">
          <dt className="text-xs text-slate-400">Configured Firebase project</dt>
          <dd className="mt-1 break-all text-sm text-slate-200">{result.configuration.projectId || "Unavailable"}</dd>
        </div>
        <div className="rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4">
          <dt className="text-xs text-slate-400">Configured Firestore database</dt>
          <dd className="mt-1 break-all text-sm text-slate-200">{result.configuration.firestoreDatabaseId || "Unavailable"}</dd>
        </div>
        <div className="rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4">
          <dt className="text-xs text-slate-400">Admin PIN session</dt>
          <dd className="mt-1 text-sm text-teal-300">{session ? `Verified until ${new Date(session.expiresAt).toLocaleString()}` : "Session status unavailable"}</dd>
        </div>
      </dl>
      <div className="rounded-xl border border-amber-400/30 bg-amber-950/10 p-4 text-xs text-amber-100">
        <h4 className="font-semibold">Not checked</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5">{result.checksNotRun.map((check) => <li key={check}>{check}</li>)}</ul>
        <p className="mt-2">For quota or daily-read errors, verify quota usage, billing, and database status in Google Cloud Console for the project and named database shown above. This diagnostic cannot inspect those settings, and code changes alone cannot confirm or clear a project quota limit.</p>
      </div>
    </>}
    <button type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)} className={buttonClass}>Refresh diagnostics</button>
  </section>;
}
