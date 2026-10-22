import { auth } from "../firebase";

export type PublicMemberProfile = {
  uid: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  spiritualInterests: string;
  tarotReader: boolean;
  cloutPoints?: number;
  zodiacSign?: string;
  broadcasterRank?: string;
  createdAt?: string;
  isLive?: boolean;
};

export async function loadPublicMemberProfile(uid: string, preview = false): Promise<PublicMemberProfile> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Sign in to view member profiles.");

  const token = await user.getIdToken();
  const response = await fetch(`/api/members/${encodeURIComponent(uid)}/profile${preview ? "?preview=1" : ""}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => null) as (PublicMemberProfile & { error?: string }) | null;
  if (!response.ok || !body) {
    throw new Error(body?.error || "Could not load this member profile.");
  }
  return body;
}

export const ZODIAC_SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"] as const;
export const ZODIAC_GLYPHS: Record<string, string> = { Aries: "♈", Taurus: "♉", Gemini: "♊", Cancer: "♋", Leo: "♌", Virgo: "♍", Libra: "♎", Scorpio: "♏", Sagittarius: "♐", Capricorn: "♑", Aquarius: "♒", Pisces: "♓" };

export type VisibilityKey = "avatar" | "bio" | "spiritualInterests" | "zodiac" | "readerStatus" | "rank" | "clout" | "liveStatus";
export type PublicSettings = { zodiacSign: string; visibility: Record<VisibilityKey, boolean> };

async function settingsRequest(method: "GET" | "PUT", body?: PublicSettings): Promise<PublicSettings> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Sign in to manage profile privacy.");
  const token = await user.getIdToken();
  const response = await fetch("/api/members/me/public-settings", {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not update profile privacy settings.");
  return data as PublicSettings;
}

export const loadPublicSettings = () => settingsRequest("GET");
export const savePublicSettings = (settings: PublicSettings) => settingsRequest("PUT", settings);
