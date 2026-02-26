import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AddAdvisor from "../components/AddAdvisor";
import StatusBadge from "../components/StatusBadge";
import { bookingData } from "../data/data";
import {
  debugToken,
  deleteAdvisor,
  getAllAdvisors,
  getAllBookings,
} from "../services/api";
import styles from "../styles/AdminPage.module.css";
import BookingsPage from "./BookingsPage";

// ─────────────────────────────────────────────────────────────────────────────
// API HELPER
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = "/api";
const getToken = () => localStorage.getItem("fin_token");

const apiFetch = async (url: string, options?: RequestInit) => {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options?.headers as Record<string, string>) || {}),
    },
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json()
    : { message: await res.text() };
  if (!res.ok)
    throw new Error(data?.message || data?.error || `HTTP ${res.status}`);
  return data;
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET API CALLS  (all endpoints from ticket-controller in Swagger)
// ─────────────────────────────────────────────────────────────────────────────
const ticketApi = {
  getAll:        ()                                       => apiFetch(`${BASE_URL}/tickets`),
  getById:       (id: number)                             => apiFetch(`${BASE_URL}/tickets/${id}`),
  deleteById:    (id: number)                             => apiFetch(`${BASE_URL}/tickets/${id}`, { method: "DELETE" }),
  patchStatus:   (id: number, status: string)             =>
    apiFetch(`${BASE_URL}/tickets/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  getComments:   (ticketId: number)                       => apiFetch(`${BASE_URL}/tickets/${ticketId}/comments`),
  postComment:   (ticketId: number, message: string)      =>
    apiFetch(`${BASE_URL}/tickets/comments`, { method: "POST", body: JSON.stringify({ ticketId, message, authorRole: "AGENT" }) }),
};

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL-TIME PARSER  (Spring LocalTime object OR "HH:mm:ss" string → "HH:mm")
// ─────────────────────────────────────────────────────────────────────────────
const parseLocalTime = (t: any): string => {
  if (!t) return "";
  if (typeof t === "object" && t.hour !== undefined)
    return `${String(t.hour).padStart(2, "0")}:${String(t.minute ?? 0).padStart(2, "0")}`;
  if (typeof t === "string") return t.substring(0, 5);
  return "";
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Advisor {
  id: number;
  name: string;
  role: string;
  tags: string[];
  rating: number;
  reviews: number;
  fee: number;
  exp: string | number;
  avatar: string;
  shiftStartTime?: string;
  shiftEndTime?: string;
}

type TicketStatus   = "NEW" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface TicketComment {
  id: number;
  ticketId: number;
  authorName: string;
  authorRole: "CUSTOMER" | "AGENT";
  message: string;
  createdAt: string;
}

interface Ticket {
  id: number;
  title: string;
  description: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt?: string;
  userId?: number;
  userName?: string;
  user?: { id?: number; name?: string; username?: string; email?: string } | null;
  agentName?: string;
  attachmentUrl?: string;
  comments?: TicketComment[];
}

type AdminSectionType = "dashboard" | "advisors" | "bookings" | "tickets" | "settings";

// ─────────────────────────────────────────────────────────────────────────────
// TICKET CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TICKET_STATUS_CFG: Record<TicketStatus, { label: string; color: string; bg: string; border: string; icon: string }> = {
  NEW:      { label: "New",      color: "#6366F1", bg: "#EEF2FF", border: "#C7D2FE", icon: "✦" },
  OPEN:     { label: "Open",     color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD", icon: "◉" },
  PENDING:  { label: "Pending",  color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "◔" },
  RESOLVED: { label: "Resolved", color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: "✓" },
  CLOSED:   { label: "Closed",   color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1", icon: "✕" },
};

const TICKET_PRIORITY_CFG: Record<TicketPriority, { label: string; color: string; bg: string }> = {
  LOW:      { label: "Low",      color: "#64748B", bg: "#F1F5F9" },
  MEDIUM:   { label: "Medium",   color: "#D97706", bg: "#FFFBEB" },
  HIGH:     { label: "High",     color: "#DC2626", bg: "#FEF2F2" },
  CRITICAL: { label: "Critical", color: "#7C3AED", bg: "#F5F3FF" },
};

const ALL_TICKET_STATUSES: TicketStatus[] = ["NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"];

// ─────────────────────────────────────────────────────────────────────────────
// TICKET PROGRESS STEPPER
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  { key: "NEW",      label: "Submitted",   icon: "📝" },
  { key: "OPEN",     label: "Assigned",    icon: "👤" },
  { key: "PENDING",  label: "In Progress", icon: "⚙️" },
  { key: "RESOLVED", label: "Resolved",    icon: "✅" },
  { key: "CLOSED",   label: "Closed",      icon: "🔒" },
];

const TicketStepper: React.FC<{ status: TicketStatus }> = ({ status }) => {
  const currentIdx = STEPS.findIndex(s => s.key === status);
  return (
    <div style={{ padding: "14px 0 6px", position: "relative" }}>
      {/* background track */}
      <div style={{ position: "absolute", top: 30, left: 16, width: "calc(100% - 32px)", height: 2, background: "#E2E8F0", zIndex: 0 }} />
      {/* filled track */}
      <div style={{
        position: "absolute", top: 30, left: 16,
        width: `calc((100% - 32px) * ${Math.max(0, currentIdx) / (STEPS.length - 1)})`,
        height: 2, background: "#2563EB", zIndex: 1, transition: "width 0.4s ease",
      }} />
      <div style={{ display: "flex", position: "relative", zIndex: 2 }}>
        {STEPS.map((step, idx) => {
          const done    = idx < currentIdx;
          const current = idx === currentIdx;
          return (
            <div key={step.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 30, height: 30, borderRadius: "50%",
                background: done ? "#2563EB" : current ? "#EFF6FF" : "#F8FAFC",
                border: `2px solid ${done || current ? "#2563EB" : "#CBD5E1"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, boxShadow: current ? "0 0 0 4px rgba(37,99,235,0.12)" : "none",
                transition: "all 0.25s",
              }}>
                {done
                  ? <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>
                  : <span style={{ fontSize: 13 }}>{step.icon}</span>
                }
              </div>
              <span style={{
                fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "0.04em", color: done || current ? "#1E40AF" : "#94A3B8",
                textAlign: "center",
              }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET DETAIL PANEL (side drawer-style)
// ─────────────────────────────────────────────────────────────────────────────
interface TicketDetailProps {
  ticket: Ticket;
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
}

const TicketDetailPanel: React.FC<TicketDetailProps> = ({ ticket, onClose, onStatusChange, onDelete }) => {
  const [comments, setComments]         = useState<TicketComment[]>([]);
  const [loadingComments, setLoading]   = useState(true);
  const [newMsg, setNewMsg]             = useState("");
  const [sending, setSending]           = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [localStatus, setLocalStatus]   = useState<TicketStatus>(ticket.status);
  const bottomRef                       = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await ticketApi.getComments(ticket.id);
        setComments(Array.isArray(data) ? data : []);
      } catch { setComments([]); }
      finally  { setLoading(false); }
    })();
  }, [ticket.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const handleSend = async () => {
    if (!newMsg.trim()) return;
    setSending(true);
    try {
      const saved = await ticketApi.postComment(ticket.id, newMsg);
      setComments(p => [...p, saved]);
    } catch {
      // optimistic fallback
      setComments(p => [...p, {
        id: Date.now(), ticketId: ticket.id,
        authorName: "Admin", authorRole: "AGENT",
        message: newMsg, createdAt: new Date().toISOString(),
      }]);
    } finally {
      setNewMsg("");
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setStatusChanging(true);
    try {
      await ticketApi.patchStatus(ticket.id, newStatus);
      setLocalStatus(newStatus as TicketStatus);
      onStatusChange(ticket.id, newStatus);
    } catch (e: any) {
      alert("Failed to update status: " + e.message);
    } finally {
      setStatusChanging(false);
    }
  };

  const sc = TICKET_STATUS_CFG[localStatus];
  const pc = TICKET_PRIORITY_CFG[ticket.priority] || TICKET_PRIORITY_CFG.LOW;

  const getUserLabel = () =>
    ticket.user?.name || ticket.user?.username ||
    (ticket.user?.email ? ticket.user.email.split("@")[0] : null) ||
    ticket.userName ||
    (ticket.userId ? `User #${ticket.userId}` : "—");

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1200,
      display: "flex", alignItems: "stretch", justifyContent: "flex-end",
    }}>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(3px)" }}
      />

      {/* panel */}
      <div style={{
        position: "relative", width: "min(600px, 100vw)", height: "100%",
        background: "#fff", display: "flex", flexDirection: "column",
        boxShadow: "-8px 0 40px rgba(0,0,0,0.18)", overflowY: "hidden",
        animation: "slideInRight 0.22s ease",
      }}>

        {/* ── Header ── */}
        <div style={{
          background: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)",
          padding: "20px 24px", flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <div style={{ fontSize: 10, color: "#93C5FD", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                Ticket #{ticket.id}
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", lineHeight: 1.3, wordBreak: "break-word" }}>
                {ticket.title}
              </div>
              <div style={{ fontSize: 12, color: "#BFDBFE", marginTop: 6 }}>
                {getUserLabel()} · {ticket.category}
                {ticket.agentName && ` · Assigned to ${ticket.agentName}`}
              </div>
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.15)", border: "none", color: "#fff",
              width: 32, height: 32, borderRadius: "50%", cursor: "pointer",
              fontSize: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
            }}>×</button>
          </div>

          {/* Badges row */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ padding: "4px 12px", borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontSize: 11, fontWeight: 700 }}>
              {sc.icon} {sc.label}
            </span>
            <span style={{ padding: "4px 12px", borderRadius: 20, background: pc.bg, color: pc.color, fontSize: 11, fontWeight: 700 }}>
              ⚑ {pc.label}
            </span>
            <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", color: "#E0F2FE", fontSize: 11, fontWeight: 600 }}>
              📅 {new Date(ticket.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* Progress stepper */}
          <div style={{ padding: "16px 24px 8px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Progress</div>
            <TicketStepper status={localStatus} />
          </div>

          {/* Status change */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Change Status {statusChanging && <span style={{ color: "#2563EB" }}>· updating…</span>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ALL_TICKET_STATUSES.map(s => {
                const cfg = TICKET_STATUS_CFG[s];
                const isActive = localStatus === s;
                return (
                  <button key={s}
                    disabled={isActive || statusChanging}
                    onClick={() => handleStatusChange(s)}
                    style={{
                      padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${isActive ? cfg.border : "#E2E8F0"}`,
                      background: isActive ? cfg.bg : "#fff",
                      color: isActive ? cfg.color : "#64748B",
                      fontSize: 12, fontWeight: 700, cursor: isActive ? "default" : "pointer",
                      opacity: statusChanging && !isActive ? 0.5 : 1,
                      transition: "all 0.15s",
                    }}>
                    {cfg.icon} {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Description</div>
            <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.7 }}>{ticket.description}</p>
            {ticket.attachmentUrl && (
              <a href={ticket.attachmentUrl} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 13, color: "#2563EB", fontWeight: 600, textDecoration: "none" }}>
                📎 View Attachment
              </a>
            )}
          </div>

          {/* Comment thread */}
          <div style={{ padding: "16px 24px", flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
              Conversation ({comments.length})
            </div>

            {loadingComments ? (
              <div style={{ textAlign: "center", padding: 32, color: "#94A3B8" }}>
                <div style={{ width: 20, height: 20, border: "2px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 8px" }} />
                Loading thread…
              </div>
            ) : comments.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#94A3B8", fontSize: 13 }}>
                No messages yet. Send the first reply below.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
                {comments.map(c => {
                  const isAgent = c.authorRole === "AGENT";
                  return (
                    <div key={c.id} style={{ display: "flex", gap: 10, flexDirection: isAgent ? "row-reverse" : "row" }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                        background: isAgent
                          ? "linear-gradient(135deg,#1E3A5F,#2563EB)"
                          : "linear-gradient(135deg,#F59E0B,#D97706)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, fontWeight: 700, color: "#fff",
                      }}>
                        {(c.authorName || "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{ maxWidth: "76%" }}>
                        <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 3, textAlign: isAgent ? "right" : "left" }}>
                          <strong style={{ color: "#475569" }}>{c.authorName}</strong>
                          {isAgent && (
                            <span style={{ marginLeft: 5, background: "#EFF6FF", color: "#2563EB", padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
                              AGENT
                            </span>
                          )}
                          {" · "}{new Date(c.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div style={{
                          padding: "10px 13px", borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                          background: isAgent ? "#EFF6FF" : "#F8FAFC",
                          color: isAgent ? "#1E3A5F" : "#374151",
                          border: `1px solid ${isAgent ? "#BFDBFE" : "#E2E8F0"}`,
                          borderTopRightRadius: isAgent ? 4 : 12,
                          borderTopLeftRadius: isAgent ? 12 : 4,
                        }}>
                          {c.message}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        {/* ── Reply box ── */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #F1F5F9", background: "#FAFBFC", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
              background: "linear-gradient(135deg,#1E3A5F,#2563EB)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: "#fff",
            }}>A</div>
            <textarea
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Reply to this ticket… (Enter to send)"
              rows={2}
              style={{
                flex: 1, padding: "9px 12px", border: "1.5px solid #E2E8F0",
                borderRadius: 10, fontSize: 13, resize: "none", fontFamily: "inherit",
                outline: "none", transition: "border-color 0.15s",
              }}
              onFocus={e => (e.target.style.borderColor = "#93C5FD")}
              onBlur={e  => (e.target.style.borderColor = "#E2E8F0")}
            />
            <button
              onClick={handleSend}
              disabled={!newMsg.trim() || sending}
              style={{
                padding: "9px 16px", borderRadius: 10, border: "none",
                background: !newMsg.trim() ? "#F1F5F9" : "linear-gradient(135deg,#2563EB,#1D4ED8)",
                color: !newMsg.trim() ? "#94A3B8" : "#fff",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                alignSelf: "flex-end", flexShrink: 0,
              }}>
              {sending ? "…" : "Send"}
            </button>
          </div>
        </div>

        {/* ── Danger zone ── */}
        <div style={{ padding: "12px 24px 20px", background: "#FAFBFC", borderTop: "1px solid #FEE2E2", flexShrink: 0 }}>
          <button
            onClick={() => { if (window.confirm(`Delete ticket #${ticket.id}? This cannot be undone.`)) { onDelete(ticket.id); onClose(); } }}
            style={{
              width: "100%", padding: "10px", borderRadius: 10,
              border: "1.5px solid #FECACA", background: "#FEF2F2",
              color: "#DC2626", fontSize: 13, fontWeight: 700, cursor: "pointer",
            }}>
            🗑 Delete Ticket #{ticket.id}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKETS SECTION COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const TicketsSection: React.FC = () => {
  const [tickets, setTickets]             = useState<Ticket[]>([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [filterStatus, setFilterStatus]   = useState<"ALL" | TicketStatus>("ALL");
  const [filterPriority, setFilterPriority] = useState<"ALL" | TicketPriority>("ALL");
  const [searchQ, setSearchQ]             = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const raw = await ticketApi.getAll();
      const arr: Ticket[] = Array.isArray(raw) ? raw : (raw?.content || []);
      if (arr.length > 0) console.log("🎫 Raw ticket[0]:", JSON.stringify(arr[0], null, 2));
      setTickets(arr);
    } catch (e: any) {
      setError(e?.message || "Failed to load tickets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleStatusChange = (id: number, status: string) => {
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: status as TicketStatus } : t));
  };

  const handleDelete = async (id: number) => {
    try {
      await ticketApi.deleteById(id);
      setTickets(prev => prev.filter(t => t.id !== id));
    } catch (e: any) {
      alert("Delete failed: " + e.message);
    }
  };

  // ── Counts for filter pills ──
  const counts = {
    ALL: tickets.length,
    NEW: tickets.filter(t => t.status === "NEW").length,
    OPEN: tickets.filter(t => t.status === "OPEN").length,
    PENDING: tickets.filter(t => t.status === "PENDING").length,
    RESOLVED: tickets.filter(t => t.status === "RESOLVED").length,
    CLOSED: tickets.filter(t => t.status === "CLOSED").length,
  };

  // ── Filter + search ──
  const visible = tickets.filter(t => {
    if (filterStatus !== "ALL"   && t.status   !== filterStatus)   return false;
    if (filterPriority !== "ALL" && t.priority !== filterPriority) return false;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      const userName =
        t.user?.name || t.user?.username ||
        (t.user?.email ? t.user.email.split("@")[0] : "") ||
        t.userName || "";
      if (
        !t.title.toLowerCase().includes(q) &&
        !t.category.toLowerCase().includes(q) &&
        !userName.toLowerCase().includes(q) &&
        !String(t.id).includes(q)
      ) return false;
    }
    return true;
  });

  // ── Stats ──
  const openCount     = tickets.filter(t => t.status === "OPEN" || t.status === "NEW" || t.status === "PENDING").length;
  const resolvedToday = tickets.filter(t =>
    t.status === "RESOLVED" && t.updatedAt &&
    new Date(t.updatedAt).toDateString() === new Date().toDateString()
  ).length;

  const getUserDisplay = (t: Ticket) =>
    t.user?.name || t.user?.username ||
    (t.user?.email ? t.user.email.split("@")[0] : null) ||
    t.userName ||
    (t.userId ? `User #${t.userId}` : "—");

  return (
    <>
      {/* ── Side panel ── */}
      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onStatusChange={handleStatusChange}
          onDelete={handleDelete}
        />
      )}

      {/* ── Header row ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>
          Support Tickets
          <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 600, color: "#64748B" }}>
            {loading ? "" : `(${tickets.length} total)`}
          </span>
        </h2>
        <button
          onClick={load}
          disabled={loading}
          style={{ padding: "8px 16px", background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {loading ? "⏳" : "↻"} Refresh
        </button>
      </div>

      {/* ── Stats strip ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total",        value: tickets.length,              color: "#2563EB", bg: "#EFF6FF" },
          { label: "Open / Active", value: openCount,                  color: "#D97706", bg: "#FFFBEB" },
          { label: "Resolved",     value: counts.RESOLVED,             color: "#16A34A", bg: "#F0FDF4" },
          { label: "Resolved Today", value: resolvedToday,             color: "#16A34A", bg: "#F0FDF4" },
          { label: "Closed",       value: counts.CLOSED,               color: "#64748B", bg: "#F1F5F9" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{loading ? "…" : s.value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Search + priority filter ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} width="14" height="14" fill="none" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2"/>
            <path d="m21 21-4.35-4.35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search by title, user, category, ID…"
            style={{ width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
          />
        </div>
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value as any)}
          style={{ padding: "9px 14px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
          <option value="ALL">All Priorities</option>
          {(["LOW","MEDIUM","HIGH","CRITICAL"] as TicketPriority[]).map(p => (
            <option key={p} value={p}>{TICKET_PRIORITY_CFG[p].label}</option>
          ))}
        </select>
      </div>

      {/* ── Status filter pills ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {(["ALL","NEW","OPEN","PENDING","RESOLVED","CLOSED"] as const).map(f => (
          <button key={f} onClick={() => setFilterStatus(f)}
            style={{
              padding: "5px 14px", borderRadius: 20, border: "1.5px solid",
              borderColor: filterStatus === f ? "#2563EB" : "#E2E8F0",
              background: filterStatus === f ? "#2563EB" : "#fff",
              color: filterStatus === f ? "#fff" : "#64748B",
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}>
            {f === "ALL" ? "All" : TICKET_STATUS_CFG[f as TicketStatus].label} ({counts[f as keyof typeof counts] ?? 0})
          </button>
        ))}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", color: "#B91C1C", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          ⚠️ {error}
          <button onClick={load} style={{ marginLeft: "auto", padding: "4px 12px", background: "#B91C1C", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Retry</button>
        </div>
      )}

      {/* ── Loading ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />
          Loading tickets…
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#F8FAFC", borderRadius: 16, color: "#94A3B8" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
          <p style={{ margin: 0, fontWeight: 600, color: "#64748B" }}>
            {tickets.length === 0 ? "No tickets found." : "No tickets match your filters."}
          </p>
        </div>
      ) : (
        /* ── Ticket table ── */
        <div style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 120px 90px 110px 110px 80px",
            gap: 0, padding: "10px 20px",
            background: "#F8FAFC", borderBottom: "1px solid #F1F5F9",
            fontSize: 10, fontWeight: 700, color: "#94A3B8",
            textTransform: "uppercase", letterSpacing: "0.06em",
          }}>
            <div>ID</div>
            <div>TITLE / USER</div>
            <div>CATEGORY</div>
            <div>PRIORITY</div>
            <div>STATUS</div>
            <div>CREATED</div>
            <div style={{ textAlign: "right" }}>ACTION</div>
          </div>

          {/* Rows */}
          {visible.map((ticket, idx) => {
            const sc = TICKET_STATUS_CFG[ticket.status];
            const pc = TICKET_PRIORITY_CFG[ticket.priority] || TICKET_PRIORITY_CFG.LOW;
            return (
              <div
                key={ticket.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 120px 90px 110px 110px 80px",
                  gap: 0, padding: "14px 20px",
                  borderBottom: idx < visible.length - 1 ? "1px solid #F8FAFC" : "none",
                  transition: "background 0.1s",
                  cursor: "pointer",
                  alignItems: "center",
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFF")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                onClick={() => setSelectedTicket(ticket)}
              >
                {/* ID */}
                <div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", fontFamily: "monospace" }}>
                  #{ticket.id}
                </div>

                {/* Title + user */}
                <div style={{ minWidth: 0, paddingRight: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {ticket.title}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                    👤 {getUserDisplay(ticket)}
                  </div>
                </div>

                {/* Category */}
                <div>
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "#F1F5F9", color: "#475569", fontWeight: 600 }}>
                    {ticket.category}
                  </span>
                </div>

                {/* Priority */}
                <div>
                  <span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: pc.bg, color: pc.color, fontWeight: 700 }}>
                    ⚑ {pc.label}
                  </span>
                </div>

                {/* Status */}
                <div>
                  <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontWeight: 700 }}>
                    {sc.icon} {sc.label}
                  </span>
                </div>

                {/* Date */}
                <div style={{ fontSize: 11, color: "#94A3B8" }}>
                  {new Date(ticket.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                </div>

                {/* Action */}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={e => { e.stopPropagation(); setSelectedTicket(ticket); }}
                    style={{ padding: "5px 12px", background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Open →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ADMIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState<AdminSectionType>("dashboard");
  const [showModal, setShowModal]         = useState(false);
  const [advisors, setAdvisors]           = useState<Advisor[]>([]);
  const [dashBookings, setDashBookings]   = useState<any[]>([]);
  const [totalBookingsCount, setTotalBookingsCount] = useState(0);
  const [totalRevenue, setTotalRevenue]   = useState(0);
  const [ticketCount, setTicketCount]     = useState(0);
  const [loading, setLoading]             = useState(false);
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "error" | null>(null);
  const [deletingId, setDeletingId]       = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => { debugToken(); }, []);

  // ── Name helpers ──
  const extractUserName = (b: any): string =>
    b.user?.name || b.user?.username || b.user?.fullName ||
    b.user?.firstName || b.client?.name || b.bookedBy?.name ||
    b.customer?.name || b.userName || b.clientName ||
    b.userFullName || b.bookedByName ||
    (b.user?.email ? b.user.email.split("@")[0] : null) ||
    (b.userId   ? `User #${b.userId}`   : null) ||
    (b.clientId ? `User #${b.clientId}` : null) ||
    `User #${b.id}`;

  const extractAdvisorName = (b: any): string =>
    b.consultant?.name || b.consultant?.fullName ||
    b.advisor?.name || b.consultantName ||
    b.advisorName || b.providerName ||
    b.consultant?.designation ||
    (b.consultantId ? `Consultant #${b.consultantId}` : null) ||
    "Consultant";

  const extractDateTime = (b: any): string => {
    const date =
      b.slotDate || b.bookingDate || b.date ||
      b.sessionDate || b.appointmentDate ||
      b.timeSlot?.slotDate || b.slot?.slotDate || null;
    const time =
      b.slotTime || b.bookingTime || b.sessionTime ||
      b.appointmentTime || b.timeSlot?.slotTime || b.slot?.slotTime || null;
    return `${date || "N/A"} • ${time ? time.substring(0, 5) : "N/A"}`;
  };

  // ── Fetch dashboard data ──
  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const advData = await getAllAdvisors();
      if (Array.isArray(advData)) {
        setAdvisors(advData.map((a: any) => ({
          id:    a.id,
          name:  a.name,
          role:  a.designation || "Financial Consultant",
          tags:  Array.isArray(a.skills) ? a.skills : [],
          rating:  Number(a.rating || 4.5),
          reviews: Number(a.reviewCount || 0),
          fee:     Number(a.charges || 0),
          exp:     a.experience || "5+ Years",
          shiftStartTime: parseLocalTime(a.shiftStartTime),
          shiftEndTime:   parseLocalTime(a.shiftEndTime),
          avatar:
            a.profilePhoto || a.photo || a.avatarUrl ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=2563EB&color=fff&bold=true`,
        })));
      }

      const bookingsArr: any[] = await getAllBookings();
      if (bookingsArr.length > 0) {
        const mapped = bookingsArr.map((b: any) => ({
          id:      b.id,
          user:    extractUserName(b),
          advisor: extractAdvisorName(b),
          time:    extractDateTime(b),
          status:  (b.status || b.bookingStatus || b.BookingStatus || "PENDING").toUpperCase(),
          amount:  Number(b.amount || b.charges || b.fee || 0),
        }));
        setTotalBookingsCount(mapped.length);
        setTotalRevenue(mapped.filter(b => b.status === "COMPLETED").reduce((s, b) => s + b.amount, 0));
        setDashBookings(mapped.slice(0, 5));
      }

      // Also fetch ticket count for sidebar badge
      try {
        const tdata = await ticketApi.getAll();
        const tarr: any[] = Array.isArray(tdata) ? tdata : (tdata?.content || []);
        setTicketCount(tarr.filter((t: any) =>
          t.status === "NEW" || t.status === "OPEN" || t.status === "PENDING"
        ).length);
      } catch { /* non-fatal */ }

      setBackendStatus("online");
    } catch (err: any) {
      if (err.message?.includes("403")) setBackendStatus("error");
      else setBackendStatus("offline");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDashboardData(); }, []);

  const handleDeleteAdvisor = async (id: number) => {
    if (!window.confirm("Delete this consultant?")) return;
    setDeletingId(id);
    try {
      await deleteAdvisor(id);
      fetchDashboardData();
    } catch { alert("Failed to delete consultant"); }
    finally { setDeletingId(null); }
  };

  const handleNavClick = (id: AdminSectionType) => {
    setActiveSection(id);
    setIsMobileMenuOpen(false);
  };

  const navItems: { id: AdminSectionType; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      id: "dashboard", label: "Dashboard",
      icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/></svg>,
    },
    {
      id: "advisors", label: "Consultants",
      icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
    },
    {
      id: "bookings", label: "Bookings",
      icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>,
      badge: totalBookingsCount,
    },
    {
      id: "tickets", label: "Tickets",
      icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
      badge: ticketCount,
    },
    {
      id: "settings", label: "Settings",
      icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/></svg>,
    },
  ];

  const stats = [
    { label: "TOTAL BOOKINGS",      value: loading ? "…" : String(totalBookingsCount),       change: "+12.5%", positive: true,  color: "#2563EB", bg: "#EFF6FF", iconStroke: "#2563EB" },
    { label: "ACTIVE CONSULTANTS",  value: loading ? "…" : String(advisors.length),          change: "+2",     positive: true,  color: "#7C3AED", bg: "#F5F3FF", iconStroke: "#7C3AED" },
    { label: "TOTAL REVENUE",       value: loading ? "…" : `₹${totalRevenue.toLocaleString()}`, change: "+8.2%", positive: true, color: "#059669", bg: "#F0FDF4", iconStroke: "#059669" },
  ];

  return (
    <div className={styles.page}>
      {showModal && <AddAdvisor onClose={() => setShowModal(false)} onSave={() => { fetchDashboardData(); setShowModal(false); }} />}

      {isMobileMenuOpen && (
        <div className={styles.mobileOverlay} onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* ── Sidebar ── */}
      <div className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarLogo}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className={styles.logoText}>FINADVISE</span>
            <span className={styles.adminBadge}>ADMIN</span>
          </div>
          <button className={styles.closeMenuBtn} onClick={() => setIsMobileMenuOpen(false)}>×</button>
        </div>

        <nav className={styles.nav}>
          {navItems.map(n => (
            <button
              key={n.id}
              onClick={() => handleNavClick(n.id)}
              className={`${styles.navBtn} ${activeSection === n.id ? styles.navBtnActive : ""}`}
            >
              <span className={styles.navIcon}>{n.icon}</span>
              {n.label}
              {n.badge != null && n.badge > 0 && (
                <span style={{
                  marginLeft: "auto", background: n.id === "tickets" ? "#DC2626" : "#2563EB",
                  color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700,
                  padding: "1px 7px", minWidth: 18, textAlign: "center",
                }}>
                  {n.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <button onClick={() => navigate("/")} className={styles.sidebarActionBtn}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Login
          </button>
        </div>
      </div>

      {/* ── Main ── */}
      <div className={styles.main}>
        <div className={styles.topBar}>
          <button className={styles.hamburgerBtn} onClick={() => setIsMobileMenuOpen(true)}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#0F172A" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className={styles.searchWrapper}>
            <svg className={styles.searchIcon} width="16" height="16" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2"/>
              <path d="m21 21-4.35-4.35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input placeholder="Search..." className={styles.searchInput} />
          </div>
          <button className={styles.addBtn} onClick={() => setShowModal(true)}>
            + Add New Consultant
          </button>
        </div>

        {backendStatus === "offline" && (
          <div className={styles.alertWarning}>
            ⚠️ Backend offline. Showing zero data. Please start the server.
          </div>
        )}
        {backendStatus === "error" && (
          <div className={styles.alertWarning} style={{ background: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }}>
            🚫 403 Forbidden — check the browser console for token debug info.
          </div>
        )}

        {/* ════════ DASHBOARD ════════ */}
        {activeSection === "dashboard" && (
          <>
            <div className={styles.statsGrid}>
              {stats.map((s, i) => (
                <div key={i} className={styles.statCard}>
                  <div className={styles.statLabel}>{s.label}</div>
                  <div className={styles.statRow}>
                    <div>
                      <div className={styles.statValue}>{s.value}</div>
                      <div className={`${styles.statChange} ${s.positive ? styles.positive : styles.negative}`}>
                        {s.change}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.chartGrid}>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Bookings This Week</h3>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={bookingData}>
                      <XAxis dataKey="day" stroke="#94A3B8" style={{ fontSize: 12 }} />
                      <YAxis stroke="#94A3B8" style={{ fontSize: 12 }} />
                      <Tooltip cursor={{ fill: "rgba(37,99,235,0.05)" }} />
                      <Bar dataKey="bookings" fill="#2563EB" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Top Consultants</h3>
                {advisors.slice(0, 3).map(a => (
                  <div key={a.id} className={styles.advisorRow}>
                    <img src={a.avatar} alt={a.name} className={styles.advisorAvatar} />
                    <div>
                      <div className={styles.advisorName}>{a.name}</div>
                      <div className={styles.advisorRating}>★ {a.rating}
                        {(a.shiftStartTime || a.shiftEndTime) && (
                          <span style={{ marginLeft: 8, color: "#94A3B8", fontWeight: 400 }}>
                            {a.shiftStartTime} – {a.shiftEndTime}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick ticket snapshot on dashboard */}
            {ticketCount > 0 && (
              <div className={`${styles.card} ${styles.mt16}`}
                style={{ background: "linear-gradient(135deg,#FEF2F2,#FFF7F7)", border: "1px solid #FECACA", cursor: "pointer" }}
                onClick={() => setActiveSection("tickets")}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎫</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#B91C1C" }}>
                      {ticketCount} open ticket{ticketCount !== 1 ? "s" : ""} need attention
                    </div>
                    <div style={{ fontSize: 12, color: "#EF4444", marginTop: 2 }}>
                      Click to view and manage all support tickets →
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className={`${styles.card} ${styles.mt16}`}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 className={styles.cardTitle} style={{ margin: 0 }}>Recent Bookings</h3>
                <span style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", borderRadius: 20, fontSize: 12, fontWeight: 700, padding: "3px 12px" }}>
                  {loading ? "Loading…" : `${totalBookingsCount} total`}
                </span>
              </div>
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.tableHead}>
                      <td className={styles.th}>USER</td>
                      <td className={styles.th}>CONSULTANT</td>
                      <td className={styles.th}>TIME</td>
                      <td className={styles.th}>STATUS</td>
                      <td className={styles.th}>AMOUNT</td>
                      <td className={styles.th}></td>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>
                        <div style={{ display: "inline-block", width: 20, height: 20, border: "2px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite", marginRight: 8, verticalAlign: "middle" }} />
                        Fetching bookings…
                      </td></tr>
                    ) : dashBookings.length > 0 ? dashBookings.map((b, i) => (
                      <tr key={i} className={styles.tableRow}>
                        <td className={styles.tdUser}>{b.user}</td>
                        <td className={styles.tdAdvisor}>{b.advisor}</td>
                        <td className={styles.tdTime}>{b.time}</td>
                        <td><StatusBadge status={b.status} /></td>
                        <td className={styles.tdAmount}>₹{b.amount.toLocaleString()}</td>
                        <td className={styles.tdMore}>⋮</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>No bookings found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalBookingsCount > 5 && (
                <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
                  <button onClick={() => setActiveSection("bookings")}
                    style={{ background: "none", border: "none", color: "#2563EB", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    View all {totalBookingsCount} bookings →
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ════════ CONSULTANTS ════════ */}
        {activeSection === "advisors" && (
          <div>
            <h2 className={styles.pageTitle}>Consultants {loading && "…"}</h2>
            <div className={styles.advisorsGrid}>
              {advisors.length > 0 ? advisors.map(a => (
                <div key={a.id} className={styles.card}>
                  <div className={styles.advisorCardRow}>
                    <img src={a.avatar} alt={a.name} className={styles.advisorAvatarLg} />
                    <div style={{ flex: 1 }}>
                      <div className={styles.advisorNameLg}>{a.name}</div>
                      <div className={styles.advisorRole}>{a.role}</div>
                      {(a.shiftStartTime || a.shiftEndTime) && (
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>
                          🕐 {a.shiftStartTime} – {a.shiftEndTime}
                        </div>
                      )}
                      <div className={styles.tagRow}>
                        {a.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
                      </div>
                    </div>
                  </div>
                  <div className={styles.advisorCardFooter}>
                    <span>★ {a.rating} ({a.reviews})</span>
                    <span className={styles.advisorFee}>₹{a.fee.toLocaleString()}</span>
                  </div>
                  <button onClick={() => handleDeleteAdvisor(a.id)} className={styles.deleteBtn} disabled={deletingId === a.id}>
                    {deletingId === a.id ? "Deleting…" : "Delete Consultant"}
                  </button>
                </div>
              )) : (
                <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#94A3B8", padding: 40 }}>No consultants found.</div>
              )}
            </div>
          </div>
        )}

        {/* ════════ BOOKINGS ════════ */}
        {activeSection === "bookings" && <BookingsPage isAdmin={true} />}

        {/* ════════ TICKETS ════════ */}
        {activeSection === "tickets" && <TicketsSection />}

        {/* ════════ SETTINGS ════════ */}
        {activeSection === "settings" && (
          <div>
            <h2 className={styles.pageTitle}>Settings</h2>
            <div className={styles.card}>
              {["General Profile", "Notifications", "Security", "Logout"].map(item => (
                <div key={item} className={styles.settingsRow}>
                  <span className={styles.settingsLabel}>{item}</span>
                  <span>›</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}