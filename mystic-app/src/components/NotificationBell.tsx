import { useState } from "react";
import { Bell, X } from "lucide-react";
import { useNotifications } from "../lib/notifications";

function formatWhen(createdAt: { toMillis?: () => number } | null | undefined) {
  const millis = createdAt?.toMillis?.();
  return millis ? new Date(millis).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
}

export default function NotificationBell({ recipientUid }: { recipientUid: string }) {
  const { notifications, unreadCount, markAsRead } = useNotifications(recipientUid);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={isOpen}
        title="Notifications"
        className="relative flex min-h-12 min-w-12 flex-col items-center justify-center gap-1 rounded-full border border-mystic-gold/40 bg-black/35 text-mystic-gold shadow-lg backdrop-blur-md transition hover:bg-black/55 active:scale-90"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          role="dialog"
          aria-label="Notifications"
          className="absolute right-14 top-0 z-30 w-64 overflow-hidden rounded-2xl border border-mystic-gold/30 bg-[#100c18]/95 text-left shadow-2xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <h2 className="font-display text-sm text-mystic-gold">Notifications</h2>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close notifications" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-400">No notifications yet</p>
          ) : (
            <ul className="max-h-[50dvh] divide-y divide-white/5 overflow-y-auto overscroll-contain">
              {notifications.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => { if (!item.readAt) markAsRead(item.id).catch((error) => console.error("Could not mark notification read:", error)); }}
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition hover:bg-white/5 ${item.readAt ? "opacity-60" : ""}`}
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-mystic-gold"}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-white">{item.message}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">{formatWhen(item.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
