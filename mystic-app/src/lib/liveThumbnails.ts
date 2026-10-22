import { compressImage, request } from "./communityBoard";

export type LiveThumbnail = { url: string; version: number };

export async function loadLiveThumbnails(uids: string[]): Promise<Record<string, LiveThumbnail>> {
  const unique = [...new Set(uids)].slice(0, 30);
  if (!unique.length) return {};
  const { thumbnails } = await request<{ thumbnails: Record<string, LiveThumbnail> }>(`/api/live/thumbnails?uids=${encodeURIComponent(unique.join(","))}`);
  return thumbnails;
}

export async function uploadLiveThumbnail(file: File) {
  return request<{ version: number }>("/api/live/thumbnail", await compressImage(file), "PUT");
}

export function removeLiveThumbnail() {
  return request<{ deleted: boolean }>("/api/live/thumbnail", undefined, "DELETE");
}
