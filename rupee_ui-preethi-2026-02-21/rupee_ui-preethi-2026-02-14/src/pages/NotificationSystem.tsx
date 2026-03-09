/**
 * NotificationSystem.tsx
 * Uses api.ts helpers (getTicketsByUser, getUserId) directly —
 * no duplicate fetch logic, no silent auth failures.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { getTicketsByUser, getUserId } from "../services/api";

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
// STORAGE HELPERS  — keyed per user ID so multiple accounts don't collide
// ─────────────────────────────────────────────────────────────────────────────
const storageKey = () => {
  const uid = getUserId();
  return uid ? `fin_notifs_USER_${uid}` : "fin_notifs_guest";
};

const loadFromStorage = (): AppNotification[] => {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return [];
    return JSON.parse(raw).map((n: any) => ({
      ...n,
      timestamp: new Date(n.timestamp),
    }));
  } catch {
    return [];
  }
};

const saveToStorage = (notifs: AppNotification[]) => {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(notifs.slice(0, 50)));
  } catch { }
};

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────────────────────
export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
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
      setNotifications((prev) => [newNotif, ...prev].slice(0, 50));
    },
    []
  );

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAllRead,
        markRead,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STATUS → notification metadata
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { title: string; type: NotifType; emoji: string }> = {
  OPEN: { title: "Ticket Opened", type: "info", emoji: "📂" },
  IN_PROGRESS: { title: "In Progress", type: "info", emoji: "🔧" },
  PENDING: { title: "Pending Review", type: "warning", emoji: "⏳" },
  RESOLVED: { title: "Ticket Resolved 🎉", type: "success", emoji: "✅" },
  CLOSED: { title: "Ticket Closed", type: "success", emoji: "🔒" },
  ESCALATED: { title: "Ticket Escalated", type: "error", emoji: "⚠️" },
};

// ─────────────────────────────────────────────────────────────────────────────
// USER TICKET MONITOR
// Mount once inside UserPage — polls every 30 s using your api.ts functions.
// ─────────────────────────────────────────────────────────────────────────────
interface TicketSnapshot {
  status: string;
  assignedTo: string | null;
  commentCount: number;
}

interface UserTicketMonitorProps {
  pollIntervalMs?: number;
  onTicketClick?: (ticketId: number) => void;
}

export const UserTicketMonitor: React.FC<UserTicketMonitorProps> = ({
  pollIntervalMs = 30_000,
  onTicketClick,
}) => {
  const { addNotification } = useNotifications();
  const snapshots = useRef<Map<number, TicketSnapshot>>(new Map());
  const isFirstRun = useRef(true);

  const poll = useCallback(async () => {
    // getUserId() reads fin_user_id from localStorage — set by loginUser() in api.ts
    const uid = getUserId();
    if (!uid) {
      console.warn("[UserTicketMonitor] fin_user_id not set — skipping poll");
      return;
    }

    let tickets: any[] = [];
    try {
      tickets = await getTicketsByUser(Number(uid));
    } catch (err) {
      console.warn("[UserTicketMonitor] poll failed:", err);
      return;
    }

    if (tickets.length === 0 && isFirstRun.current) {
      console.log("[UserTicketMonitor] No tickets found on first run — will retry on next poll");
      isFirstRun.current = false;
      return;
    }

    for (const ticket of tickets) {
      const id: number = ticket.id;
      const currentStatus: string = (ticket.status || "NEW").toUpperCase();
      const currentAssigned: string | null =
        ticket.assignedTo || ticket.consultantName || ticket.agentName || null;
      const currentComments: number =
        ticket.commentCount ?? ticket.comments?.length ?? ticket.commentsCount ?? 0;

      // ── First run: seed snapshots silently, no notifications ──────────────
      if (isFirstRun.current) {
        snapshots.current.set(id, {
          status: currentStatus,
          assignedTo: currentAssigned,
          commentCount: currentComments,
        });
        continue;
      }

      const prev = snapshots.current.get(id);

      // Brand new ticket appeared since last poll
      if (!prev) {
        snapshots.current.set(id, {
          status: currentStatus,
          assignedTo: currentAssigned,
          commentCount: currentComments,
        });
        addNotification({
          type: "info",
          title: `📋 Ticket #${id} Submitted`,
          message: `Your ticket "${ticket.category || `#${id}`}" has been received.`,
          ticketId: id,
        });
        continue;
      }

      // ── Status changed ────────────────────────────────────────────────────
      if (prev.status !== currentStatus) {
        const meta = STATUS_META[currentStatus];
        if (meta) {
          addNotification({
            type: meta.type,
            title: `${meta.emoji} ${meta.title} — #${id}`,
            message: `Your ticket "${ticket.category || `#${id}`}" is now ${currentStatus
              .toLowerCase()
              .replace(/_/g, " ")}.`,
            ticketId: id,
          });
        }
      }

      // ── Newly assigned to an agent ────────────────────────────────────────
      if (!prev.assignedTo && currentAssigned) {
        addNotification({
          type: "info",
          title: `👤 Ticket #${id} Assigned`,
          message: `Your ticket has been assigned to ${currentAssigned}.`,
          ticketId: id,
        });
      }

      // ── New comment / reply from agent ────────────────────────────────────
      if (currentComments > prev.commentCount) {
        const newCount = currentComments - prev.commentCount;
        addNotification({
          type: "info",
          title: `💬 New Repl${newCount > 1 ? "ies" : "y"} on Ticket #${id}`,
          message: `${newCount} new message${newCount > 1 ? "s" : ""} on "${ticket.category || `#${id}`}".`,
          ticketId: id,
        });
      }

      // Update snapshot
      snapshots.current.set(id, {
        status: currentStatus,
        assignedTo: currentAssigned,
        commentCount: currentComments,
      });
    }

    if (isFirstRun.current) {
      isFirstRun.current = false;
      console.log(
        `[UserTicketMonitor] Seeded ${tickets.length} ticket snapshots for user ${uid}`
      );
    }
  }, [addNotification]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, pollIntervalMs);
    return () => clearInterval(interval);
  }, [poll, pollIntervalMs]);

  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// COLOR CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<
  NotifType,
  { color: string; bg: string; border: string; icon: string }
> = {
  info: { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", icon: "ℹ️" },
  success: { color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: "✅" },
  warning: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "⚠️" },
  error: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: "🚨" },
};

// ─────────────────────────────────────────────────────────────────────────────
// TOAST CONTAINER
// ─────────────────────────────────────────────────────────────────────────────
interface Toast extends AppNotification { visible: boolean }

export const ToastContainer: React.FC = () => {
  const { notifications } = useNotifications();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const latest = notifications[0];
    if (!latest || seenIds.current.has(latest.id)) return;
    seenIds.current.add(latest.id);
    setToasts((prev) => [{ ...latest, visible: true }, ...prev].slice(0, 5));
    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === latest.id ? { ...t, visible: false } : t))
      );
    }, 4500);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== latest.id));
    }, 5000);
  }, [notifications]);

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        maxWidth: 360,
        width: "calc(100vw - 40px)",
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => {
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
              pointerEvents: "all",
            }}
          >
            <span style={{ fontSize: 18, flexShrink: 0, lineHeight: 1.2 }}>
              {cfg.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{ fontWeight: 700, fontSize: 13, color: cfg.color, marginBottom: 2 }}
              >
                {t.title}
              </div>
              <div style={{ fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
                {t.message}
              </div>
            </div>
            <button
              onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#94A3B8",
                fontSize: 16,
                padding: 0,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION BELL DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────
interface BellProps {
  onTicketClick?: (ticketId: number) => void;
}

export const NotificationBell: React.FC<BellProps> = ({ onTicketClick }) => {
  const { notifications, unreadCount, markAllRead, markRead, clearAll } =
    useNotifications();
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
        onClick={() => setOpen((p) => !p)}
        title="Notifications"
        style={{
          position: "relative",
          width: 36,
          height: 36,
          borderRadius: "50%",
          border: "1.5px solid #BFDBFE",
          background: "#EFF6FF",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 16,
        }}
      >
        🔔
        {unreadCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              background: "#DC2626",
              color: "#fff",
              borderRadius: "50%",
              width: 16,
              height: 16,
              fontSize: 9,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #EFF6FF",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            top: 60,
            right: 12,
            width: "min(340px,calc(100vw - 24px))",
            maxHeight: 420,
            background: "#fff",
            borderRadius: 16,
            border: "1.5px solid #E2E8F0",
            boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            zIndex: 3000,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "12px 16px",
              background: "linear-gradient(135deg,#1E3A5F,#2563EB)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <div>
              <span style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>
                My Notifications
              </span>
              {unreadCount > 0 && (
                <div style={{ fontSize: 10, color: "#BFDBFE", marginTop: 1 }}>
                  {unreadCount} unread
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  style={{
                    background: "rgba(255,255,255,0.15)",
                    border: "none",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  style={{
                    background: "rgba(220,38,38,0.2)",
                    border: "none",
                    color: "#FCA5A5",
                    borderRadius: 6,
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  border: "none",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 22,
                  height: 22,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: "30px 20px",
                  textAlign: "center",
                  color: "#94A3B8",
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  No notifications yet
                </div>
                <div style={{ fontSize: 11, marginTop: 4, color: "#CBD5E1" }}>
                  Ticket updates appear here automatically
                </div>
              </div>
            ) : (
              notifications.map((n) => {
                const cfg = TYPE_CONFIG[n.type];
                return (
                  <div
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      if (n.ticketId && onTicketClick) {
                        onTicketClick(n.ticketId);
                        setOpen(false);
                      }
                    }}
                    style={{
                      padding: "12px 16px",
                      borderBottom: "1px solid #F8FAFC",
                      background: n.read ? "#fff" : cfg.bg,
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      cursor: n.ticketId ? "pointer" : "default",
                    }}
                  >
                    <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.2 }}>
                      {cfg.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 12,
                          color: cfg.color,
                          marginBottom: 2,
                        }}
                      >
                        {n.title}
                        {!n.read && (
                          <span
                            style={{
                              marginLeft: 5,
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              background: cfg.color,
                              display: "inline-block",
                              verticalAlign: "middle",
                            }}
                          />
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#374151",
                          lineHeight: 1.5,
                          wordBreak: "break-word",
                        }}
                      >
                        {n.message}
                      </div>
                      {n.ticketId && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "#2563EB",
                            fontWeight: 600,
                            marginTop: 3,
                          }}
                        >
                          Tap to view ticket →
                        </div>
                      )}
                      <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 4 }}>
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
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ESCALATION MONITOR  (admin / advisor use)
// ─────────────────────────────────────────────────────────────────────────────
interface EscalationMonitorProps {
  tickets: Array<{
    id: number;
    title?: string;
    category?: string;
    status: string;
    createdAt: string;
    priority?: string;
  }>;
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
    tickets.forEach((t) => {
      if (["RESOLVED", "CLOSED"].includes(t.status)) return;
      const created = new Date(t.createdAt).getTime();
      const hoursOpen = (now - created) / 3_600_000;
      if (hoursOpen >= slaHours && !alerted.current.has(t.id)) {
        alerted.current.add(t.id);
        addNotification({
          type: "error",
          title: `⏰ SLA Breach — Ticket #${t.id}`,
          message: `"${t.title || t.category || `#${t.id}`}" has been open for ${Math.floor(
            hoursOpen
          )}h. Immediate action required!`,
          ticketId: t.id,
        });
      }
    });
  }, [tickets, slaHours, addNotification]);

  useEffect(() => {
    tickets.forEach((t) => {
      if (["RESOLVED", "CLOSED"].includes(t.status)) alerted.current.delete(t.id);
    });
  }, [tickets]);

  useEffect(() => {
    check();
    const interval = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [check]);

  return null;
};

export default NotificationProvider;