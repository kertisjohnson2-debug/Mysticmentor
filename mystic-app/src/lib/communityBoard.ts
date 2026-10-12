import { auth } from "../firebase";

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

async function request<T>(path: string, body?: Record<string, unknown> | Blob, method?: "POST" | "PUT" | "PATCH" | "DELETE"): Promise<T> {
  const user = auth.currentUser;
  if ((body || method) && (!user || user.isAnonymous)) throw new Error("Sign in with a member account to continue.");
  const token = user && !user.isAnonymous ? await user.getIdToken() : null;
  const response = await fetch(path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      ...(body instanceof Blob ? { "Content-Type": body.type } : body ? { "Content-Type": "application/json" } : {}),
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
  parentReplyId: string | null;
  depth: number;
  editedAt: number | null;
  createdAt: number | null;
};

export function loadCommunityPosts(stateCode: string, cityName: string, topic: CommunityTopic | "") {
  const params = new URLSearchParams({ stateCode, cityName });
  if (topic) params.set("topic", topic);
  return request<{ posts: CommunityPost[] }>(`/api/community/posts?${params.toString()}`);
}

export function loadCommunityReplies(postId: string) {
  return request<{ replies: CommunityReply[] }>(`/api/community/posts/${encodeURIComponent(postId)}/replies`);
}

export function loadCommunityCities(stateCode: string) {
  return request<{ cities: CommunityCity[] }>(`/api/community/states/${encodeURIComponent(stateCode)}/cities`);
}

export function createCommunityPost(input: CommunityPostInput) {
  return request<{ postId: string }>("/api/community/posts", input);
}

export function createCommunityReply(postId: string, body: string, parentReplyId: string | undefined, requestId: string) {
  return request<{ replyId: string }>(`/api/community/posts/${encodeURIComponent(postId)}/replies`, {
    body,
    requestId,
    ...(parentReplyId ? { parentReplyId } : {})
  });
}

export function reportCommunityContent(postId: string, reason: string, replyId?: string) {
  return request<{ reportId: string }>("/api/community/reports", {
    postId,
    reason,
    ...(replyId ? { replyId } : {})
  });
}

export function newRequestId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function editCommunityPost(postId: string, title: string, body: string, removeImageIds: string[]) {
  return request<{ updated: boolean }>(`/api/community/posts/${encodeURIComponent(postId)}`, { title, body, removeImageIds }, "PATCH");
}

export function deleteCommunityPost(postId: string) {
  return request<{ deleted: boolean }>(`/api/community/posts/${encodeURIComponent(postId)}`, undefined, "DELETE");
}

export function uploadCommunityImage(image: Blob) {
  return request<{ imageId: string }>("/api/community/images", image);
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

export function editCommunityReply(postId: string, replyId: string, body: string) {
  return request<{ updated: boolean }>(`/api/community/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}`, { body }, "PATCH");
}

export function deleteCommunityReply(postId: string, replyId: string) {
  return request<{ deleted: boolean; removedCount: number }>(`/api/community/posts/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}`, undefined, "DELETE");
}
