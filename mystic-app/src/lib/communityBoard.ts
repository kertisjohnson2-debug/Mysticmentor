import { auth } from "../firebase";
import { readAdminSessionToken } from "./adminAccess";
import type { ReportReason } from "./communityReports";

export type CommunityState = {
  code: string;
  name: string;
};

export type CommunityCity = string;

export const COMMUNITY_TOPICS = [
  "General",
  "Spirituality",
  "Tarot",
  "Wellness",
  "Events",
  "Friendship",
  "Local Gems",
  "Introductions"
] as const;

export type CommunityTopic = typeof COMMUNITY_TOPICS[number];
export type CommunityPostInput = {
  stateCode: string;
  cityName: string;
  topic: CommunityTopic;
  title: string;
  body: string;
  imageIds?: string[];
  requestId?: string;
};

export async function request<T>(path: string, body?: Record<string, unknown> | Blob, method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"): Promise<T> {
  const user = auth.currentUser;
  if ((body || method) && (!user || user.isAnonymous)) throw new Error("Sign in with a member account to continue.");
  const token = user && !user.isAnonymous ? await user.getIdToken() : null;
  const adminSession = path.startsWith("/api/admin/") ? readAdminSessionToken(user?.uid) : null;
  const response = await fetch(path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      ...(body instanceof Blob ? { "Content-Type": body.type } : body ? { "Content-Type": "application/json" } : {}),
      ...(adminSession ? { "X-Admin-Session": adminSession } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body ? { body: body instanceof Blob ? body : JSON.stringify(body) } : {})
  });
  const result = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok || !result) {
    if (result?.error) throw new Error(result.error);
    throw new Error(response.status >= 502 && response.status <= 504
      ? "The Community service is unreachable right now. Please try again shortly."
      : `Community service request failed (${response.status}).`);
  }
  return result;
}

export function loadCommunityStates() {
  return request<{ states: CommunityState[] }>("/api/community/states");
}

export type CommunityAuthor = {
  uid: string;
  displayName: string;
  avatarUrl: string;
};

export type CommunityPost = {
  id: string;
  authorUid: string;
  author: CommunityAuthor;
  stateCode: string;
  stateName: string;
  cityName: string;
  topic: CommunityTopic;
  title: string;
  body: string;
  replyCount: number;
  images: { id: string; url: string }[];
  editedAt: number | null;
  createdAt: number | null;
};

export type CommunityReply = {
  id: string;
  authorUid: string;
  author: CommunityAuthor;
  body: string;
  images: { id: string; url: string }[];
  parentReplyId: string | null;
  depth: number;
  editedAt: number | null;
  createdAt: number | null;
};

// The server sends each author's profile photo once per response; attach it by that item's own authorUid only.
export function withAuthorAvatars<T extends { authorUid: string; author: CommunityAuthor }>(items: T[], authorAvatars: unknown): T[] {
  const avatars = authorAvatars && typeof authorAvatars === "object" ? authorAvatars as Record<string, unknown> : {};
  return items.map((item) => {
    const avatar = Object.prototype.hasOwnProperty.call(avatars, item.authorUid) ? avatars[item.authorUid] : undefined;
    return typeof avatar === "string" && avatar ? { ...item, author: { ...item.author, avatarUrl: avatar } } : item;
  });
}

export async function loadCommunityPosts(stateCode: string, cityName: string, topic: CommunityTopic | "") {
  const params = new URLSearchParams({ stateCode, cityName });
  if (topic) params.set("topic", topic);
  const result = await request<{ posts: CommunityPost[]; authorAvatars?: Record<string, string> }>(`/api/community/posts?${params.toString()}`);
  return { posts: withAuthorAvatars(result.posts, result.authorAvatars) };
}

export async function loadCommunityReplies(postId: string) {
  const result = await request<{ replies: CommunityReply[]; authorAvatars?: Record<string, string> }>(`/api/community/posts/${encodeURIComponent(postId)}/replies`);
  return { replies: withAuthorAvatars(result.replies, result.authorAvatars) };
}

export function loadCommunityCities(stateCode: string) {
  return request<{ cities: CommunityCity[] }>(`/api/community/states/${encodeURIComponent(stateCode)}/cities`);
}

export function createCommunityPost(input: CommunityPostInput) {
  return request<{ postId: string }>("/api/community/posts", input);
}

export function createCommunityReply(postId: string, body: string, parentReplyId: string | undefined, requestId: string, imageIds: string[] = []) {
  return request<{ replyId: string }>(`/api/community/posts/${encodeURIComponent(postId)}/replies`, {
    body,
    requestId,
    imageIds,
    ...(parentReplyId ? { parentReplyId } : {})
  });
}

export function reportCommunityContent(postId: string, reason: ReportReason, details: string, replyId?: string) {
  return request<{ reportId: string }>("/api/community/reports", {
    postId,
    reason,
    ...(details.trim() ? { details: details.trim() } : {}),
    ...(replyId ? { replyId } : {})
  });
}

export function newRequestId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function editCommunityPost(postId: string, title: string, body: string, removeImageIds: string[], addImageIds: string[] = []) {
  return request<{ updated: boolean }>(`/api/community/posts/${encodeURIComponent(postId)}`, { title, body, removeImageIds, addImageIds }, "PATCH");
}

export function deleteCommunityPost(postId: string) {
  return request<{ deleted: boolean }>(`/api/community/posts/${encodeURIComponent(postId)}`, undefined, "DELETE");
}

export function uploadCommunityImage(image: Blob, target: "post" | "reply" = "post") {
  return request<{ imageId: string }>(`/api/community/images?target=${target}`, image);
}

export function loadCommunitySettings() {
  return request<{ replyImagesEnabled: boolean; maxImagesPerPost: number }>("/api/community/settings");
}

export function saveReplyImagesEnabled(replyImagesEnabled: boolean) {
  return request<{ replyImagesEnabled: boolean }>("/api/admin/community-settings", { replyImagesEnabled }, "PUT");
}

export type StorageUsage = {
  usedBytes: number;
  objectCount: number;
  truncated: boolean;
  checkedAt: number;
  limitBytes: number;
  warnBytes: number;
  level: "ok" | "warning" | "full";
};

export function loadStorageUsage(refresh = false) {
  return request<StorageUsage>(`/api/admin/storage-usage${refresh ? "?refresh=1" : ""}`, undefined, "GET");
}

export function discardCommunityImage(imageId: string) {
  return request<{ deleted: boolean }>(`/api/community/images/${encodeURIComponent(imageId)}`, undefined, "DELETE");
}

export function loadCommunityLocation() {
  return request<{ stateCode: string; cityName: string }>("/api/community/preferences");
}

export function saveCommunityLocation(stateCode: string, cityName: string) {
  return request<{ stateCode: string; cityName: string }>("/api/community/preferences", { stateCode, cityName }, "PUT");
}

const MAX_IMAGE_EDGE = 1600;
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024;

export async function compressImage(file: File): Promise<Blob> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP image.");
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("That image is larger than 15 MB.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("That image could not be read.");
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable in this browser.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= 2.4 * 1024 * 1024) return blob;
  }
  throw new Error("That image is too large even after compression.");
}

export function editCommunityReply(postId: string, replyId: string, body: string, removeImageIds: string[] = [], addImageIds: string[] = []) {
  return request<{ updated: boolean }>(`/api/community/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}`, { body, removeImageIds, addImageIds }, "PATCH");
}

export function deleteCommunityReply(postId: string, replyId: string) {
  return request<{ deleted: boolean; removedCount: number }>(`/api/community/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}`, undefined, "DELETE");
}
