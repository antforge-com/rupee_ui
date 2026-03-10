/**
 * NotificationSystem.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Global in-app notification system used by:
 *   - AdminPage        → ticket status updates, escalation alerts, summaries
 *   - AdvisorDashboard → new ticket assignment notifications
 *   - UserPage         → ticket update notifications for customers
 *
 * Exports:
 *   NotificationProvider      — wrap your page/app with this
 *   useNotifications          — hook to read/write notifications
 *   ToastContainer            — auto-dismiss toast stack (top-right)
 *   NotificationBell          — dropdown bell icon
 *   EscalationMonitor         — background SLA breach checker
 *   UserNotificationMonitor   — polls fin_notifs_USER_<id> for new items
 *   ConsultantNotificationMonitor — polls fin_notifs_CONSULTANT_<id>
 *   sendEmailNotification     — fire-and-forget email helper
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export type NotifType = "info" | "success" | "warning" | "error";

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  ticketId?: number;
  link?: string;
}

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  addNotification: (n: Omit<AppNotification, "id" | "timestamp" | "read">) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  clearAll: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────────────────────
const NotificationContext = createContext<NotificationContextValue | null>(null);

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used inside NotificationProvider");
  return ctx;
};

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE HELPERS (persist per role in localStorage)
// ─────────────────────────────────────────────────────────────────────────────
const STORAGE_KEY = () => `fin_notifs_${localStorage.getItem("fin_role") || "user"}`;

const loadFromStorage = (): AppNotification[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY());
    if (!raw) return [];
    return JSON.parse(raw).map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) }));
  } catch {
    return [];
  }
};

const saveToStorage = (notifs: AppNotification[]) => {
  try {
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(notifs.slice(0, 50)));
  } catch {}
};

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────
export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(loadFromStorage);

  useEffect(() => {
    saveToStorage(notifications);
  }, [notifications]);

  const addNotification = useCallback(
    (n: Omit<AppNotification, "id" | "timestamp" | "read">) => {
      const newNotif: AppNotification = {
        ...n,
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        timestamp: new Date(),
        read: false,
      };
      setNotifications(prev => [newNotif, ...prev].slice(0, 50));
    },
    []
  );

  const markRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, addNotification, markAllRead, markRead, clearAll }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COLOR CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<NotifType, { color: string; bg: string; border: string; icon: string }> = {
  info:    { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", icon: "ℹ️" },
  success: { color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: "✅" },
  warning: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "⚠️" },
  error:   { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: "🚨" },
};

// ─────────────────────────────────────────────────────────────────────────────
// TOAST CONTAINER  (renders auto-dismiss toasts top-right)
// ─────────────────────────────────────────────────────────────────────────────
interface Toast extends AppNotification { visible: boolean; }

export const ToastContainer: React.FC = () => {
  const { notifications } = useNotifications();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const latest = notifications[0];
    if (!latest || seenIds.current.has(latest.id)) return;
    seenIds.current.add(latest.id);
    const toast: Toast = { ...latest, visible: true };
    setToasts(prev => [toast, ...prev].slice(0, 5));
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === latest.id ? { ...t, visible: false } : t));
    }, 4500);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== latest.id));
    }, 5000);
  }, [notifications]);

  return (
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 9999,
      display: "flex", flexDirection: "column", gap: 10,
      maxWidth: 360, width: "calc(100vw - 40px)",
    }}>
      {toasts.map(t => {
        const cfg = TYPE_CONFIG[t.type];
        return (
          <div
            key={t.id}
            style={{
              background: cfg.bg,
              border: `1.5px solid ${cfg.border}`,
              borderLeft: `4px solid ${cfg.color}`,
              borderRadius: 12,
              padding: "13px 16px",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
              transition: "all 0.4s ease",
              opacity: t.visible ? 1 : 0,
              transform: t.visible ? "translateX(0)" : "translateX(100%)",
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.2 }}>{cfg.icon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: cfg.color, marginBottom: 2 }}>
                {t.title}
              </div>
              <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
                {t.message}
              </div>
            </div>
            <button
              onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 16, padding: 0, flexShrink: 0 }}
            >×</button>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION BELL  (dropdown panel)
// ─────────────────────────────────────────────────────────────────────────────
interface BellProps {
  onTicketClick?: (ticketId: number) => void;
}

export const NotificationBell: React.FC<BellProps> = ({ onTicketClick }) => {
  const { notifications, unreadCount, markAllRead, markRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const timeAgo = (d: Date) => {
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          position: "relative", background: open ? "#EFF6FF" : "transparent",
          border: "1.5px solid", borderColor: open ? "#BFDBFE" : "#E2E8F0",
          borderRadius: 10, padding: "8px 10px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
        }}
        title="Notifications"
      >
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            stroke="#1E3A5F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -5, right: -5,
            background: "#DC2626", color: "#fff",
            borderRadius: "50%", width: 18, height: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, fontWeight: 800, border: "2px solid #fff",
          }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 10px)", right: 0,
          width: 360, maxHeight: 480,
          background: "#fff", borderRadius: 16,
          border: "1.5px solid #E2E8F0",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          zIndex: 3000, display: "flex", flexDirection: "column",
          animation: "fadeInDown 0.15s ease",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            padding: "14px 18px", borderBottom: "1px solid #F1F5F9",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)",
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>Notifications</div>
              {unreadCount > 0 && (
                <div style={{ fontSize: 11, color: "#BFDBFE", marginTop: 1 }}>
                  {unreadCount} unread
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  style={{ background: "rgba(220,38,38,0.2)", border: "none", color: "#FCA5A5", borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#94A3B8" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>No notifications yet</div>
              </div>
            ) : (
              notifications.map(n => {
                const cfg = TYPE_CONFIG[n.type];
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      if (n.ticketId && onTicketClick) { onTicketClick(n.ticketId); setOpen(false); }
                    }}
                    style={{
                      padding: "12px 18px",
                      borderBottom: "1px solid #F8FAFC",
                      background: n.read ? "#fff" : cfg.bg,
                      cursor: n.ticketId ? "pointer" : "default",
                      display: "flex", gap: 12, alignItems: "flex-start",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
                    onMouseLeave={e => (e.currentTarget.style.background = n.read ? "#fff" : cfg.bg)}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: cfg.bg, border: `2px solid ${cfg.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                    }}>
                      {cfg.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, color: cfg.color }}>
                        {n.title}
                        {!n.read && (
                          <span style={{
                            marginLeft: 6, width: 6, height: 6, borderRadius: "50%",
                            background: cfg.color, display: "inline-block", verticalAlign: "middle",
                          }} />
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, marginTop: 2, wordBreak: "break-word" }}>
                        {n.message}
                      </div>
                      <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 4 }}>
                        {timeAgo(n.timestamp)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ESCALATION MONITOR  (checks for overdue tickets every 5 minutes)
// Mount this ONCE inside AdminPage and AdvisorDashboard
// ─────────────────────────────────────────────────────────────────────────────
interface EscalationMonitorProps {
  /** Pass the live ticket array from the parent */
  tickets: Array<{
    id: number;
    title: string;
    status: string;
    createdAt: string;
    priority?: string;
    agentName?: string;
    consultantId?: number;
  }>;
  /** SLA window in hours — default 2 */
  slaHours?: number;
}

export const EscalationMonitor: React.FC<EscalationMonitorProps> = ({
  tickets,
  slaHours = 2,
}) => {
  const { addNotification } = useNotifications();
  const alerted = useRef<Set<number>>(new Set());

  const check = useCallback(() => {
    const now = Date.now();
    tickets.forEach(t => {
      if (["RESOLVED", "CLOSED"].includes(t.status)) return;
      const created = new Date(t.createdAt).getTime();
      const hoursOpen = (now - created) / 3_600_000;
      if (hoursOpen >= slaHours && !alerted.current.has(t.id)) {
        alerted.current.add(t.id);
        addNotification({
          type: "error",
          title: `⏰ SLA Breach — Ticket #${t.id}`,
          message: `"${t.title}" has been open for ${Math.floor(hoursOpen)}h ${Math.floor((hoursOpen % 1) * 60)}m. Immediate action required!`,
          ticketId: t.id,
        });
      }
    });
  }, [tickets, slaHours, addNotification]);

  // Re-check already alerted on ticket close
  useEffect(() => {
    tickets.forEach(t => {
      if (["RESOLVED", "CLOSED"].includes(t.status)) {
        alerted.current.delete(t.id);
      }
    });
  }, [tickets]);

  useEffect(() => {
    check();
    const interval = setInterval(check, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(interval);
  }, [check]);

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// USER NOTIFICATION MONITOR
// ─────────────────────────────────────────────────────────────────────────────
// Polls `fin_notifs_USER_<userId>` in localStorage every 10 seconds and
// on window focus.  When Admin writes a new entry there (status change, reply,
// assignment), this component picks it up and fires addNotification() so the
// UserPage bell lights up immediately — no page refresh required.
//
// Usage (inside UserPage, after the <header>):
//   <UserNotificationMonitor
//     userId={currentUserId}
//     onNewNotifications={freshItems => {
//       setUserNotifs(prev => { ... merge ... });
//     }}
//   />
// ─────────────────────────────────────────────────────────────────────────────
interface UserNotificationMonitorProps {
  userId: number | null;
  /** Called with any genuinely new items (not yet seen by this session) */
  onNewNotifications?: (fresh: any[]) => void;
}

export const UserNotificationMonitor: React.FC<UserNotificationMonitorProps> = ({
  userId,
  onNewNotifications,
}) => {
  const { addNotification } = useNotifications();
  // Track IDs we have already surfaced as toasts this session
  const importedIds = useRef<Set<string>>(new Set());

  const poll = useCallback(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(`fin_notifs_USER_${userId}`);
      if (!raw) return;
      const items: any[] = JSON.parse(raw);
      const fresh = items.filter(n => n?.id && !importedIds.current.has(String(n.id)));
      if (fresh.length === 0) return;

      // Mark them as seen for this session
      fresh.forEach(n => importedIds.current.add(String(n.id)));

      // Fire toast via the provider
      fresh.forEach(n => {
        addNotification({
          type: (n.type as NotifType) || "info",
          title: n.title || "New Notification",
          message: n.message || "",
          ticketId: n.ticketId,
        });
      });

      // Let the parent component merge into its own state (e.g. userNotifs list)
      if (onNewNotifications) onNewNotifications(fresh);
    } catch {
      // Silently ignore JSON parse errors
    }
  }, [userId, addNotification, onNewNotifications]);

  useEffect(() => {
    // Seed importedIds with whatever is already stored so we only alert on
    // genuinely *new* entries written after this component mounts
    if (!userId) return;
    try {
      const raw = localStorage.getItem(`fin_notifs_USER_${userId}`);
      if (raw) {
        const items: any[] = JSON.parse(raw);
        items.forEach(n => { if (n?.id) importedIds.current.add(String(n.id)); });
      }
    } catch {}
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Poll every 10 seconds
    const interval = setInterval(poll, 10_000);
    // Also poll immediately on window focus (cross-tab scenario)
    window.addEventListener("focus", poll);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, [userId, poll]);

  return null; // Renders nothing
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTANT NOTIFICATION MONITOR
// ─────────────────────────────────────────────────────────────────────────────
// Same pattern as UserNotificationMonitor but reads
// `fin_notifs_CONSULTANT_<consultantId>`.
//
// Usage (inside AdvisorDashboard):
//   <ConsultantNotificationMonitor
//     consultantId={currentConsultantId}
//     onNewNotifications={fresh => { /* optional extra handling */ }}
//   />
// ─────────────────────────────────────────────────────────────────────────────
interface ConsultantNotificationMonitorProps {
  consultantId: number | null;
  onNewNotifications?: (fresh: any[]) => void;
}

export const ConsultantNotificationMonitor: React.FC<ConsultantNotificationMonitorProps> = ({
  consultantId,
  onNewNotifications,
}) => {
  const { addNotification } = useNotifications();
  const importedIds = useRef<Set<string>>(new Set());

  const poll = useCallback(() => {
    if (!consultantId) return;
    try {
      const raw = localStorage.getItem(`fin_notifs_CONSULTANT_${consultantId}`);
      if (!raw) return;
      const items: any[] = JSON.parse(raw);
      const fresh = items.filter(n => n?.id && !importedIds.current.has(String(n.id)));
      if (fresh.length === 0) return;

      fresh.forEach(n => importedIds.current.add(String(n.id)));
      fresh.forEach(n => {
        addNotification({
          type: (n.type as NotifType) || "info",
          title: n.title || "New Notification",
          message: n.message || "",
          ticketId: n.ticketId,
        });
      });

      if (onNewNotifications) onNewNotifications(fresh);
    } catch {}
  }, [consultantId, addNotification, onNewNotifications]);

  useEffect(() => {
    if (!consultantId) return;
    try {
      const raw = localStorage.getItem(`fin_notifs_CONSULTANT_${consultantId}`);
      if (raw) {
        const items: any[] = JSON.parse(raw);
        items.forEach(n => { if (n?.id) importedIds.current.add(String(n.id)); });
      }
    } catch {}
  }, [consultantId]);

  useEffect(() => {
    if (!consultantId) return;
    const interval = setInterval(poll, 10_000);
    window.addEventListener("focus", poll);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, [consultantId, poll]);

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL NOTIFICATION HELPER
// ─────────────────────────────────────────────────────────────────────────────
// Fire-and-forget wrapper for POST /api/notifications/email/<eventType>.
// Never throws — failures are only logged to console.
//
// Usage:
//   sendEmailNotification("ticket-update", { ticketId: 5, newStatus: "RESOLVED", userEmail: "user@example.com" });
// ─────────────────────────────────────────────────────────────────────────────
export const sendEmailNotification = async (
  eventType: string,
  payload: Record<string, any>
): Promise<void> => {
  try {
    const token = localStorage.getItem("fin_token") || "";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`/api/notifications/email/${eventType}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(
        `⚠️ [sendEmailNotification] ${eventType} returned ${res.status} (non-fatal)`
      );
    } else {
      console.log(`✉️ [sendEmailNotification] "${eventType}" sent successfully`);
    }
  } catch (err: any) {
    console.warn(`⚠️ [sendEmailNotification] "${eventType}" failed (non-fatal):`, err?.message);
  }
};

export default NotificationProvider;