import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe
} from "firebase/firestore";
import { auth, db } from "../firebase";
import type { AppNotification } from "../types/notification";

const NOTIFICATION_LIMIT = 50;

const notificationsRef = (recipientUid: string) => collection(db, "users", recipientUid, "notifications");

/** Subscribes to a user's notifications, newest first. */
export function subscribeToNotifications(
  recipientUid: string,
  onChange: (notifications: AppNotification[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const notificationsQuery = query(notificationsRef(recipientUid), orderBy("createdAt", "desc"), limit(NOTIFICATION_LIMIT));
  return onSnapshot(
    notificationsQuery,
    (snapshot) => onChange(snapshot.docs.map((item) => ({ ...(item.data() as Omit<AppNotification, "id">), id: item.id }))),
    (error) => onError?.(error)
  );
}

export const countUnread = (notifications: AppNotification[]) => notifications.filter((item) => !item.readAt).length;

/** Sets readAt on one of the signed-in user's own notifications. */
export function markNotificationRead(recipientUid: string, notificationId: string) {
  return updateDoc(doc(notificationsRef(recipientUid), notificationId), { readAt: serverTimestamp() });
}

/** Asks the trusted server to create notifications; failures never affect the calling feature. */
export function requestNotification(endpoint: "/api/notify-follow" | "/api/notify-live", body: Record<string, string>) {
  (async () => {
    const token = await auth.currentUser?.getIdToken();
    if (!token) return;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });
    if (!response.ok) console.error(`Notification request failed (${response.status})`);
  })().catch((error) => console.error("Notification request failed:", error));
}

/** Live notifications and unread count for the signed-in (non-anonymous) user. */
export function useNotifications(recipientUid: string | null) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    setNotifications([]);
    if (!recipientUid) return;
    return subscribeToNotifications(recipientUid, setNotifications, (error) => console.error("Could not load notifications:", error));
  }, [recipientUid]);

  const unreadCount = useMemo(() => countUnread(notifications), [notifications]);

  return {
    notifications,
    unreadCount,
    markAsRead: (notificationId: string) => (recipientUid ? markNotificationRead(recipientUid, notificationId) : Promise.resolve())
  };
}
