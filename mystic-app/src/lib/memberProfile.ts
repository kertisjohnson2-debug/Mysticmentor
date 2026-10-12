import { auth } from "../firebase";

export type PublicMemberProfile = {
  uid: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  spiritualInterests: string;
  tarotReader: boolean;
  broadcasterRank?: string;
  isLive: boolean;
};

export async function loadPublicMemberProfile(uid: string): Promise<PublicMemberProfile> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Sign in to view member profiles.");

  const token = await user.getIdToken();
  const response = await fetch(`/api/members/${encodeURIComponent(uid)}/profile`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await response.json().catch(() => null) as (PublicMemberProfile & { error?: string }) | null;
  if (!response.ok || !body) {
    throw new Error(body?.error || "Could not load this member profile.");
  }
  return body;
}
