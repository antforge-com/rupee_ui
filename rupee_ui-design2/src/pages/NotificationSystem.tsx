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

import { AlertTriangle, CheckCircle, Info, X, XCircle } from "lucide-react";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { buildApiUrl } from "../config/api";
import { getUserDisplayName } from "../services/api";
import { decryptLocal } from "../services/crypto";

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
const STORAGE_KEY = () =>
  `fin_notifs_${decryptLocal(localStorage.getItem("fin_role") || "").toUpperCase().replace(/^ROLE_/, "") || "user"}`;

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
  } catch { }
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
      setNotifications(prev => {
        // Deduplicate: skip if an identical title+message notification was added in the last 60 seconds
        const cutoff = Date.now() - 60_000;
        const isDuplicate = prev.some(
          existing =>
            existing.title === n.title &&
            existing.message === n.message &&
            existing.timestamp.getTime() > cutoff
        );
        if (isDuplicate) return prev;

        const newNotif: AppNotification = {
          ...n,
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          timestamp: new Date(),
          read: false,
        };
        return [newNotif, ...prev].slice(0, 50);
      });
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
    // Clear from localStorage immediately so EscalationMonitor re-seed finds nothing
    try { localStorage.removeItem(STORAGE_KEY()); } catch { }
    // Persist a sentinel so EscalationMonitor doesn't immediately re-fire on same session
    try { localStorage.setItem("fin_notifs_alerted_cleared", String(Date.now())); } catch { }
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
const TYPE_CONFIG: Record<NotifType, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  info: { color: "#0F766E", bg: "#ECFEFF", border: "#A5F3FC", icon: <Info size={18} color="#0F766E" /> },
  success: { color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: <CheckCircle size={18} color="#16A34A" /> },
  warning: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: <AlertTriangle size={18} color="#D97706" /> },
  error: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: <XCircle size={18} color="#DC2626" /> },
};

const resolvePlaceholderNameText = async (text: string): Promise<string> => {
  const raw = String(text ?? "");
  if (!raw) return "";

  const pattern = /\b(?:User|Client|Consultant)\s*#\s*(\d+)\b/gi;
  const ids = [...new Set([...raw.matchAll(pattern)].map(match => Number(match[1])).filter(id => id > 0))];
  if (ids.length === 0) return raw;

  const cache = new Map<number, string>();
  await Promise.all(ids.map(async (id) => {
    try {
      const name = await getUserDisplayName(id);
      cache.set(id, name && !/^(user|client|booking)\s*#?\s*\d+$/i.test(String(name || "").trim()) ? name : "Client");
    } catch {
      cache.set(id, "Client");
    }
  }));

  return raw.replace(pattern, (_match, idText) => {
    const resolved = cache.get(Number(idText));
    return resolved || "Client";
  });
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
            <span style={{ flexShrink: 0, lineHeight: 1.2, display: "flex", alignItems: "center" }}>{cfg.icon}</span>
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
              style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 0, flexShrink: 0, display: "flex", alignItems: "center" }}
            >
              <X size={16} />
            </button>
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
  const [displayNotifications, setDisplayNotifications] = useState<AppNotification[]>(notifications);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const normalized = await Promise.all(notifications.map(async (n) => ({
        ...n,
        title: await resolvePlaceholderNameText(n.title),
        message: await resolvePlaceholderNameText(n.message),
      })));
      if (!cancelled) setDisplayNotifications(normalized);
    })();
    return () => { cancelled = true; };
  }, [notifications]);

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
          position: "relative", background: open ? "#ECFEFF" : "transparent",
          border: "1.5px solid", borderColor: open ? "#A5F3FC" : "#E2E8F0",
          borderRadius: 10, padding: "8px 10px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
        }}
        title="Notifications"
      >
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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
            background: "var(--portal-profile-gradient)",
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, color: "#fff" }}>Notifications</div>
              {unreadCount > 0 && (
                <div style={{ fontSize: 11, color: "#A5F3FC", marginTop: 1 }}>
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
              {displayNotifications.length > 0 && (
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
            {displayNotifications.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#94A3B8" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>No notifications yet</div>
              </div>
            ) : (
              displayNotifications.map(n => {
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
  const seeded = useRef(false);

  // ── Seed alerted from localStorage on first mount ──────────────────────────
  // Without this, every remount (navigation, tab switch) resets alerted to
  // empty and re-fires SLA breach notifications for ALL overdue tickets again.
  // We read previously stored notifications and pre-populate alerted so only
  // genuinely NEW breaches (tickets not yet seen this session or in storage)
  // will fire a toast.
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    try {
      // If clearAll was called recently (within the same session day), pre-populate
      // alerted with ALL currently-overdue ticket IDs so they don't immediately re-fire.
      const clearedAt = Number(localStorage.getItem("fin_notifs_alerted_cleared") || "0");
      const clearedRecently = clearedAt > Date.now() - 24 * 3_600_000;
      if (clearedRecently) {
        // Seed ALL current overdue tickets so they don't re-alert immediately after clear
        const now = Date.now();
        tickets.forEach(t => {
          if (!["RESOLVED", "CLOSED"].includes(t.status)) {
            const hoursOpen = (now - new Date(t.createdAt).getTime()) / 3_600_000;
            if (hoursOpen >= slaHours) alerted.current.add(t.id);
          }
        });
        return;
      }
      const key = STORAGE_KEY();
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const stored: AppNotification[] = JSON.parse(raw);
      stored.forEach(n => {
        if (n.ticketId) alerted.current.add(n.ticketId);
      });
    } catch { /* ignore parse errors */ }
  }, []);

  const check = useCallback(() => {
    if (!seeded.current) return; // wait until seed is done
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

  // Re-enable alerting when a ticket is resolved/closed (so it can fire again
  // if it's somehow re-opened in the future).
  useEffect(() => {
    tickets.forEach(t => {
      if (["RESOLVED", "CLOSED"].includes(t.status)) {
        alerted.current.delete(t.id);
      }
    });
  }, [tickets]);

  useEffect(() => {
    // Defer first check by one tick so the seed useEffect runs first
    const firstCheck = setTimeout(check, 0);
    const interval = setInterval(check, 5 * 60 * 1000); // every 5 min
    return () => {
      clearTimeout(firstCheck);
      clearInterval(interval);
    };
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
    } catch { }
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
  const seenBookingIds = useRef<Map<string, string>>(new Map()); // bookingId → status
  const seenTicketIds = useRef<Map<string, string>>(new Map());  // ticketId → status
  // Prevents firing stale toasts for all pre-existing data on every mount.
  const isSeeding = useRef(true);

  // Fetch a user's name by ID, caching the result to avoid repeated requests
  const resolveUserName = useCallback(async (userId: number | undefined | null): Promise<string> => {
    if (!userId) return "Client";
    try { return await getUserDisplayName(userId); } catch { return "Client"; }
  }, []);

  // ── Poll localStorage (admin-written notifications) ──
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
    } catch { }
  }, [consultantId, addNotification, onNewNotifications]);

  // ── Poll bookings API for status changes ──
  const pollBookings = useCallback(async () => {
    if (!consultantId) return;
    try {
      const token = localStorage.getItem("fin_token");
      const res = await fetch(buildApiUrl(`/bookings/consultant/${consultantId}`), {
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) return;
      const data = await res.json();
      const bookings: any[] = Array.isArray(data) ? data : (data?.content || data?.bookings || []);

      const newNotifs: any[] = [];
      const pendingResolutions: Promise<void>[] = [];

      bookings.forEach((b: any) => {
        const id = String(b.id);
        const st = (b.status || b.bookingStatus || b.booking_status || "").toUpperCase();
        const prevStatus = seenBookingIds.current.get(id);

        // Immediately use whatever name is embedded in the booking object
        const embeddedNameRaw =
          b.user?.name || b.user?.fullName || b.userName || b.clientName || b.user?.username || null;
        const embeddedName = embeddedNameRaw && !/^(user|client|booking)\s*#?\s*\d+$/i.test(String(embeddedNameRaw).trim())
          ? embeddedNameRaw
          : null;
        const userId: number | null = b.userId || b.user?.id || null;
        const dateStr = b.slotDate || b.bookingDate || b.date || "";

        const buildNotif = (clientName: string) => {
          const notifId = `booking_${id}_${st}_${Date.now()}`;
          if (prevStatus !== undefined && prevStatus !== st) {
            if (st === "CONFIRMED" || st === "BOOKED") {
              newNotifs.push({ id: notifId, type: "success", title: "Booking Confirmed", message: `Session with ${clientName}${dateStr ? ` on ${dateStr}` : ""} has been confirmed.`, timestamp: new Date().toISOString(), read: false });
            } else if (st === "CANCELLED") {
              newNotifs.push({ id: notifId, type: "error", title: "Booking Cancelled", message: `Session with ${clientName}${dateStr ? ` on ${dateStr}` : ""} was cancelled.`, timestamp: new Date().toISOString(), read: false });
            } else if (st === "COMPLETED") {
              newNotifs.push({ id: notifId, type: "info", title: "Session Completed", message: `Your session with ${clientName}${dateStr ? ` on ${dateStr}` : ""} has been marked as completed.`, timestamp: new Date().toISOString(), read: false });
            }
          } else if (prevStatus === undefined && (st === "PENDING" || st === "CONFIRMED" || st === "BOOKED")) {
            const newNotifId = `booking_new_${id}`;
            if (!importedIds.current.has(newNotifId)) {
              importedIds.current.add(newNotifId);
              if (st === "PENDING") {
                newNotifs.push({ id: newNotifId, type: "info", title: "New Booking Request", message: `${clientName} has requested a session${dateStr ? ` on ${dateStr}` : ""}. Please review and confirm.`, timestamp: b.createdAt || new Date().toISOString(), read: false });
              } else if (st === "CONFIRMED" || st === "BOOKED") {
                newNotifs.push({ id: newNotifId, type: "success", title: "Booking Confirmed", message: `Session with ${clientName}${dateStr ? ` on ${dateStr}` : ""} is confirmed.`, timestamp: b.createdAt || new Date().toISOString(), read: false });
              }
            }
          }
        };

        const needsNotif =
          (prevStatus !== undefined && prevStatus !== st) ||
          (prevStatus === undefined && (st === "PENDING" || st === "CONFIRMED" || st === "BOOKED"));

        if (needsNotif && !isSeeding.current) {
          if (embeddedName) {
            // Name already in booking — use it directly
            buildNotif(embeddedName);
          } else {
            // Fetch name from /api/users/:id then build the notif
            pendingResolutions.push(
              resolveUserName(userId).then(name => buildNotif(name))
            );
          }
        }

        seenBookingIds.current.set(id, st);
      });

      // Wait for any async name resolutions before persisting/firing toasts
      await Promise.allSettled(pendingResolutions);

      if (newNotifs.length > 0) {
        // Persist to localStorage
        try {
          const key = `fin_notifs_CONSULTANT_${consultantId}`;
          const existing: any[] = JSON.parse(localStorage.getItem(key) || "[]");
          const existingIds = new Set(existing.map((n: any) => n.id));
          const toWrite = newNotifs.filter(n => !existingIds.has(n.id));
          if (toWrite.length > 0) {
            localStorage.setItem(key, JSON.stringify([...toWrite, ...existing].slice(0, 50)));
          }
        } catch { }
        // Fire toast notifications
        newNotifs.forEach(n => {
          addNotification({ type: n.type as NotifType, title: n.title, message: n.message });
        });
        if (onNewNotifications) onNewNotifications(newNotifs);
      }
    } catch { }
  }, [consultantId, addNotification, onNewNotifications]);

  // ── Poll tickets API for assignment and status changes ──
  const pollTickets = useCallback(async () => {
    if (!consultantId) return;
    try {
      const token = localStorage.getItem("fin_token");
      const res = await fetch(buildApiUrl(`/tickets/consultant/${consultantId}`), {
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) return;
      const data = await res.json();
      const tickets: any[] = Array.isArray(data) ? data : (data?.content || data?.tickets || []);

      const newNotifs: any[] = [];
      tickets.forEach((t: any) => {
        const id = String(t.id);
        const st = (t.status || "").toUpperCase();
        const prevStatus = seenTicketIds.current.get(id);
        const title = t.title || t.description || "Ticket";

        if (prevStatus === undefined) {
          // First time seeing — only notify after the initial seed pass
          const notifId = `ticket_new_${id}`;
          if (!isSeeding.current && !importedIds.current.has(notifId) && ["NEW", "OPEN", "IN_PROGRESS"].includes(st)) {
            importedIds.current.add(notifId);
            newNotifs.push({ id: notifId, type: "warning", title: `Ticket Assigned${title ? ` — ${title}` : ""}`, message: `"${title}" has been assigned to you. Priority: ${t.priority || "MEDIUM"}.`, timestamp: t.createdAt || new Date().toISOString(), read: false, ticketId: t.id });
          }
        } else if (prevStatus !== st) {
          // Status changed
          const notifId = `ticket_${id}_${st}_${Date.now()}`;
          if (st === "RESOLVED") {
            newNotifs.push({ id: notifId, type: "success", title: `Ticket Resolved${title ? ` — ${title}` : ""}`, message: `"${title}" has been marked as resolved.`, timestamp: new Date().toISOString(), read: false, ticketId: t.id });
          } else if (st === "ESCALATED") {
            newNotifs.push({ id: notifId, type: "error", title: `Ticket Escalated${title ? ` — ${title}` : ""}`, message: `"${title}" has been escalated. Immediate action required.`, timestamp: new Date().toISOString(), read: false, ticketId: t.id });
          } else if (st === "CLOSED") {
            newNotifs.push({ id: notifId, type: "info", title: `Ticket Closed${title ? ` — ${title}` : ""}`, message: `"${title}" has been closed.`, timestamp: new Date().toISOString(), read: false, ticketId: t.id });
          }
        }
        seenTicketIds.current.set(id, st);
      });

      if (newNotifs.length > 0) {
        try {
          const key = `fin_notifs_CONSULTANT_${consultantId}`;
          const existing: any[] = JSON.parse(localStorage.getItem(key) || "[]");
          const existingIds = new Set(existing.map((n: any) => n.id));
          const toWrite = newNotifs.filter(n => !existingIds.has(n.id));
          if (toWrite.length > 0) {
            localStorage.setItem(key, JSON.stringify([...toWrite, ...existing].slice(0, 50)));
          }
        } catch { }
        newNotifs.forEach(n => {
          addNotification({ type: n.type as NotifType, title: n.title, message: n.message, ticketId: n.ticketId });
        });
        if (onNewNotifications) onNewNotifications(newNotifs);
      }
    } catch { }
  }, [consultantId, addNotification, onNewNotifications]);

  // Seed importedIds with whatever is already stored
  useEffect(() => {
    if (!consultantId) return;
    try {
      const raw = localStorage.getItem(`fin_notifs_CONSULTANT_${consultantId}`);
      if (raw) {
        const items: any[] = JSON.parse(raw);
        items.forEach(n => { if (n?.id) importedIds.current.add(String(n.id)); });
      }
    } catch { }
  }, [consultantId]);

  useEffect(() => {
    if (!consultantId) return;

    // Initial load: populate seen maps silently (isSeeding=true suppresses toasts),
    // then flip isSeeding off so all subsequent polls fire toasts normally.
    isSeeding.current = true;
    Promise.allSettled([pollBookings(), pollTickets()]).then(() => {
      isSeeding.current = false;
    });

    // Poll localStorage every 10s, APIs every 30s
    const localInterval = setInterval(poll, 10_000);
    const apiInterval = setInterval(() => {
      pollBookings();
      pollTickets();
    }, 30_000);

    window.addEventListener("focus", poll);
    window.addEventListener("focus", pollBookings);
    window.addEventListener("focus", pollTickets);

    return () => {
      clearInterval(localInterval);
      clearInterval(apiInterval);
      window.removeEventListener("focus", poll);
      window.removeEventListener("focus", pollBookings);
      window.removeEventListener("focus", pollTickets);
    };
  }, [consultantId, poll, pollBookings, pollTickets]);

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL NOTIFICATION HELPER
// ─────────────────────────────────────────────────────────────────────────────
// Backend email delivery is handled by Spring NotificationService.
// Client code should not try to send ticket emails directly because that can
// duplicate server-triggered notifications. This helper remains a no-op.
// ─────────────────────────────────────────────────────────────────────────────
export const markNotificationReadOnBackend = async (notifId: string | number): Promise<void> => {
  const token = localStorage.getItem("fin_token");
  try {
    await fetch(buildApiUrl(`/notifications/${notifId}/mark-read`), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch { /* non-fatal */ }
};

export const sendEmailNotification = async (
  eventType: string,
  payload: Record<string, any>
): Promise<void> => {
  const token = localStorage.getItem("fin_token");
  try {
    await fetch(buildApiUrl(`/notifications/send`), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ eventType, ...payload }),
    });
  } catch { /* non-fatal, fire-and-forget */ }
};

export default NotificationProvider;