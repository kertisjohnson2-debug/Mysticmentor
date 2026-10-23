import { useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { auth } from "../firebase";
import { loadLiveThumbnails, removeLiveThumbnail, uploadLiveThumbnail, type LiveThumbnail } from "../lib/liveThumbnails";

// Uploads go straight to shared storage and apply to the member's own broadcast, before or during a live session.
export default function LiveThumbnailPicker({ defaultImage }: { defaultImage: string }) {
  const uid = auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null;
  const [thumbnail, setThumbnail] = useState<LiveThumbnail | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    if (!uid) return;
    const result = await loadLiveThumbnails([uid]);
    setThumbnail(result[uid] ?? null);
  };

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [uid]);

  if (!uid) return null;

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the thumbnail.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold text-slate-300">Promotional thumbnail</span>
      <div className="flex items-center gap-3">
        <img src={thumbnail?.url ?? defaultImage} alt="Broadcast thumbnail preview" className="aspect-video w-32 shrink-0 rounded-lg border border-white/10 object-cover" />
        <div className="flex min-w-0 flex-col gap-2">
          <label className={`flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-mystic-gold/40 px-3 text-xs text-mystic-gold ${busy ? "pointer-events-none opacity-50" : "hover:bg-mystic-gold/10"}`}>
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {thumbnail ? "Change image" : "Upload image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void run(() => uploadLiveThumbnail(file), "Thumbnail updated.");
              }}
            />
          </label>
          {thumbnail && <button type="button" disabled={busy} onClick={() => void run(removeLiveThumbnail, "Using the default thumbnail.")} className="flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-slate-300 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" />Use default</button>}
        </div>
      </div>
      <p className="text-[11px] text-slate-500">JPEG, PNG or WebP, up to 2.5 MB after resizing. Leave empty to use the default mystical artwork.</p>
      {message && <p role="status" className="text-xs text-mystic-gold">{message}</p>}
    </div>
  );
}
