import { useEffect, useState } from "react";
import { loadCommunitySettings, loadStorageUsage, saveReplyImagesEnabled, type StorageUsage } from "../lib/communityBoard";

const GB = 1024 ** 3;

export default function AdminImageControls() {
  const [replyImages, setReplyImages] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState("");
  const [usageError, setUsageError] = useState("");
  const [saving, setSaving] = useState(false);

  const refreshUsage = (force: boolean) => loadStorageUsage(force).then((result) => { setUsage(result); setUsageError(""); }).catch((reason) => setUsageError(reason instanceof Error ? reason.message : "Could not read storage usage."));

  useEffect(() => {
    void loadCommunitySettings().then((settings) => setReplyImages(settings.replyImagesEnabled)).catch(() => setError("Could not load the current setting."));
    void refreshUsage(false);
  }, []);

  const toggle = async () => {
    if (replyImages === null || saving) return;
    setSaving(true);
    setError("");
    try {
      setReplyImages((await saveReplyImagesEnabled(!replyImages)).replyImagesEnabled);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save the setting.");
    } finally {
      setSaving(false);
    }
  };

  const percent = usage ? Math.min(100, (usage.usedBytes / usage.limitBytes) * 100) : 0;
  const barColor = usage?.level === "full" ? "bg-rose-500" : usage?.level === "warning" ? "bg-amber-400" : "bg-teal-400";

  return (
    <div className="space-y-4 fade-in text-left text-xs">
      <div className="rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-white">Community reply images</h3>
        <p className="text-slate-400">Posts can always include up to 3 images. When this is off, replies are text only and the server rejects reply image uploads.</p>
        <button type="button" role="switch" aria-checked={replyImages === true} disabled={replyImages === null || saving} onClick={() => void toggle()} className={`flex h-10 w-full items-center justify-between rounded-lg border px-3 font-semibold disabled:opacity-50 ${replyImages ? "border-teal-400/50 text-teal-200" : "border-white/15 text-slate-300"}`}>
          <span>Reply images: {replyImages === null ? "Loading…" : replyImages ? "Enabled" : "Disabled"}</span>
          <span>{replyImages ? "Turn off" : "Turn on"}</span>
        </button>
        {error && <p role="alert" className="text-rose-300">{error}</p>}
      </div>

      <div className="rounded-xl border border-[#2c1654] bg-[#120a26]/40 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">R2 storage</h3>
          <button type="button" onClick={() => void refreshUsage(true)} className="text-mystic-gold underline">Refresh</button>
        </div>
        {usage && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full ${barColor}`} style={{ width: `${percent}%` }} /></div>
            <p className="text-slate-300">{(usage.usedBytes / GB).toFixed(2)} GB of {usage.limitBytes / GB} GB free allowance · {usage.objectCount} files{usage.truncated ? "+" : ""}</p>
            {usage.level === "warning" && <p role="alert" className="text-amber-300">Storage is above {usage.warnBytes / GB} GB. Remove old images or review your Cloudflare plan before it reaches {usage.limitBytes / GB} GB.</p>}
            {usage.level === "full" && <p role="alert" className="text-rose-300">The free allowance is used up. New image uploads are paused to avoid charges.</p>}
          </>
        )}
        {usageError && <p role="alert" className="text-slate-400">{usageError}</p>}
      </div>
    </div>
  );
}
