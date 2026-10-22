import type { Timestamp } from "firebase/firestore";

export type NotificationType = "follow" | "live";

// Stored at users/{recipientUid}/notifications/{notificationId}; created only by trusted server code
export interface AppNotification {
  id: string;
  type: NotificationType;
  message: string;
  actorUid: string;
  actorDisplayName: string;
  actorAvatarUrl: string;
  recipientUid: string;
  broadcasterUid: string | null;
  sessionId: string | null;
  createdAt: Timestamp;
  readAt: Timestamp | null;
  dedupeKey: string;
}
