import { auth } from "../firebase";

export type ConnectionMember = {
  uid: string;
  displayName: string;
  avatarUrl: string;
};

export type ConnectionRequestItem = {
  id: string;
  member: ConnectionMember;
  createdAt: string | null;
};

export type ConnectionState = {
  incoming: ConnectionRequestItem[];
  outgoing: ConnectionRequestItem[];
  connections: ConnectionRequestItem[];
};

export type MemberPage = {
  members: ConnectionMember[];
  nextCursor: string | null;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error("Sign in to use member connections.");
  const token = await user.getIdToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers
    }
  });
  const responseText = await response.text();
  let body: (T & { error?: string }) | null = null;
  if (responseText) {
    try {
      body = JSON.parse(responseText) as T & { error?: string };
    } catch {
      throw new Error(`Member service returned an invalid response (HTTP ${response.status}).`);
    }
  }
  if (!body) {
    throw new Error(response.ok
      ? "Member service returned an empty response."
      : `Member service returned an empty error response (HTTP ${response.status}).`);
  }
  if (!response.ok) throw new Error(body.error || "The connections request could not be completed.");
  return body;
}

export function loadConnectionState() {
  return request<ConnectionState>("/api/connections");
}

export function loadMemberPage(cursor: string | null, search = "") {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (search.trim()) params.set("search", search.trim());
  const query = params.size ? `?${params.toString()}` : "";
  return request<MemberPage>(`/api/connections/members${query}`).then((page) => {
    if (!Array.isArray(page.members) || !(page.nextCursor === null || typeof page.nextCursor === "string")) {
      throw new Error("Member service returned an invalid member list.");
    }
    return page;
  });
}

export function sendConnectionRequest(recipientUid: string) {
  return request<{ sent: boolean }>("/api/connections/request", {
    method: "POST",
    body: JSON.stringify({ recipientUid })
  });
}

export function respondToConnectionRequest(requestId: string, action: "accept" | "decline" | "cancel") {
  return request<{ updated: boolean }>("/api/connections/respond", {
    method: "POST",
    body: JSON.stringify({ requestId, action })
  });
}
