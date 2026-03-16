import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AddAdvisor from "../components/AddAdvisor";
import StatusBadge from "../components/StatusBadge";

import {
  addHoliday as apiAddHoliday,
  deleteHoliday as apiDeleteHoliday,
  apiFetch,
  assignTicketToConsultant,
  clientExportTicketsExcel,
  clientExportTicketsPdf,
  createTicket,
  createTicketCategory,
  debugToken,
  deleteAdvisor,
  deleteTicket,
  escalateTicket,
  exportSingleTicketExcel,
  exportSingleTicketPdf,
  exportTicketsExcel,
  exportTicketsPdf,
  extractArray,
  getAllAdvisors,
  getAllBookings,
  getAllTickets,
  getAutoResponder,
  getBusinessHours,
  getHolidays,
  getSlaInfo,
  getTicketCategories,
  getTicketComments,
  getTicketsPage,
  postInternalNote,
  postTicketComment,
  SLA_HOURS,
  toggleTicketCategory,
  updateAutoResponder,
  updateBusinessHours,
  updateTicketStatus
} from "../services/api";
import AnalyticsDashboard from "./AnalyticsDashboard";
import BookingsPage from "./BookingsPage";
import {
  EscalationMonitor,
  NotificationBell,
  NotificationProvider,
  ToastContainer,
  useNotifications,
} from "./NotificationSystem";
import TicketSummaryChart from "./TicketSummaryChart";

const BASE_URL = "http://52.55.178.31:8081/api";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES  (previously in types.ts)
// ─────────────────────────────────────────────────────────────────────────────

export type BookingStatus = "CONFIRMED" | "PENDING" | "COMPLETED";

export interface Booking {
  id: number;
  userName: string;
  userAvatar?: string;
  date: string;
  time: string;
  status: BookingStatus;
  meetingLink: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL-TIME PARSER
// ─────────────────────────────────────────────────────────────────────────────
const parseLocalTime = (t: any): string => {
  if (!t) return "";
  if (typeof t === "object" && t.hour !== undefined)
    return `${String(t.hour).padStart(2, "0")}:${String(t.minute ?? 0).padStart(2, "0")}`;
  if (typeof t === "string") return t.substring(0, 5);
  return "";
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL TYPES
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

type TicketStatus = "NEW" | "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" | "ESCALATED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT" | "CRITICAL";

interface TicketComment {
  id: number;
  ticketId: number;
  senderId?: number;
  authorName?: string;
  authorRole?: "CUSTOMER" | "AGENT";
  isConsultantReply?: boolean;
  message: string;
  createdAt: string;
}

interface InternalNote {
  id: number;
  ticketId: number;
  authorId: number;
  noteText: string;
  createdAt: string;
}
interface Ticket {
  id: number;
  title?: string;
  description: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt?: string;
  userId?: number;
  userName?: string;
  user?: { id?: number; name?: string; username?: string; email?: string } | null;
  consultantId?: number | null;
  consultantName?: string;
  agentName?: string;
  attachmentUrl?: string;
  isSlaBreached?: boolean;
  isEscalated?: boolean;
  slaRespondBy?: string;
  slaResolveBy?: string;
  feedbackRating?: number;
  feedbackText?: string;
  notes?: InternalNote[];
  internalNotes?: InternalNote[];
  comments?: TicketComment[];
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
}

type AdminSectionType =
  | "dashboard"
  | "advisors"
  | "bookings"
  | "tickets"
  | "analytics"
  | "summary"
  | "add-member"
  | "support-config"
  | "offers"
  | "settings";

// ─────────────────────────────────────────────────────────────────────────────
// TICKET STATUS / PRIORITY CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TICKET_STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  NEW: { label: "New", color: "#6366F1", bg: "#EEF2FF", border: "#C7D2FE", icon: "✦" },
  OPEN: { label: "Open", color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD", icon: "◉" },
  IN_PROGRESS: { label: "In Progress", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "◔" },
  PENDING: { label: "Pending", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "◔" },
  RESOLVED: { label: "Resolved", color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: "✓" },
  CLOSED: { label: "Closed", color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1", icon: "✕" },
  ESCALATED: { label: "Escalated", color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5", icon: "🚨" },
};

const TICKET_PRIORITY_CFG: Record<string, { label: string; color: string; bg: string; border?: string; dot?: string }> = {
  LOW: { label: "Low", color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", dot: "#22C55E" },
  MEDIUM: { label: "Medium", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", dot: "#F59E0B" },
  HIGH: { label: "High", color: "#EA580C", bg: "#FFF7ED", border: "#FED7AA", dot: "#F97316" },
  URGENT: { label: "Urgent", color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5", dot: "#EF4444" },
  CRITICAL: { label: "Critical", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE", dot: "#8B5CF6" },
};

const ALL_TICKET_STATUSES = ["NEW", "OPEN", "PENDING", "RESOLVED", "CLOSED"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SHARED BADGE
// ─────────────────────────────────────────────────────────────────────────────
const Badge: React.FC<{ label: string; style: { bg: string; color: string; border: string } }> = ({ label, style }) => (
  <span style={{
    padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
    letterSpacing: "0.05em", background: style.bg, color: style.color,
    border: `1px solid ${style.border}`,
  }}>
    {label.replace(/_/g, " ")}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// SLA STRIP
// ─────────────────────────────────────────────────────────────────────────────
const SlaStrip: React.FC<{ ticket: Ticket; compact?: boolean }> = ({ ticket, compact }) => {
  const sla = getSlaInfo(ticket);
  if (!sla) return null;
  return (
    <div style={{
      padding: compact ? "8px 16px" : "10px 24px",
      background: sla.breached ? "#FEF2F2" : sla.warning ? "#FFFBEB" : "#F0FDF4",
      borderTop: `1px solid ${sla.breached ? "#FECACA" : sla.warning ? "#FDE68A" : "#BBF7D0"}`,
      display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
    }}>
      <span>{sla.breached ? "🔴" : sla.warning ? "🟡" : "🟢"}</span>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: sla.breached ? "#B91C1C" : sla.warning ? "#92400E" : "#15803D" }}>
          SLA {sla.breached ? "BREACHED" : sla.warning ? "WARNING" : "ON TRACK"}
          {" · "}{ticket.priority} — {SLA_HOURS[ticket.priority] ?? 24}h window
        </div>
        <div style={{ fontSize: 11, color: "#64748B" }}>
          {sla.breached
            ? `Overdue by ${Math.abs(sla.minsLeft)} min`
            : `Due ${sla.deadlineStr} · ${sla.label}`}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET PROGRESS STEPPER
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  { key: "NEW", label: "Submitted", icon: "📝" },
  { key: "OPEN", label: "Assigned", icon: "👤" },
  { key: "IN_PROGRESS", label: "In Progress", icon: "⚙️" },
  { key: "RESOLVED", label: "Resolved", icon: "✅" },
  { key: "CLOSED", label: "Closed", icon: "🔒" },
];

const TicketStepper: React.FC<{ status: string }> = ({ status }) => {
  const currentIdx = Math.max(STEPS.findIndex(s => s.key === status), 0);
  return (
    <div style={{ padding: "14px 0 6px", position: "relative" }}>
      <div style={{ position: "absolute", top: 30, left: 16, width: "calc(100% - 32px)", height: 2, background: "#E2E8F0", zIndex: 0 }} />
      <div style={{
        position: "absolute", top: 30, left: 16,
        width: `calc((100% - 32px) * ${currentIdx / (STEPS.length - 1)})`,
        height: 2, background: "#2563EB", zIndex: 1, transition: "width 0.4s ease",
      }} />
      <div style={{ display: "flex", position: "relative", zIndex: 2 }}>
        {STEPS.map((step, idx) => {
          const done = idx < currentIdx;
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
                  : <span style={{ fontSize: 13 }}>{step.icon}</span>}
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
// ASSIGN CONSULTANT MODAL
// ─────────────────────────────────────────────────────────────────────────────
interface AssignModalProps {
  ticket: Ticket;
  consultants: Advisor[];
  onClose: () => void;
  onAssigned: (ticketId: number, consultantId: number, consultantName: string) => void;
}

const AssignConsultantModal: React.FC<AssignModalProps> = ({ ticket, consultants, onClose, onAssigned }) => {
  const { addNotification } = useNotifications();
  const [selected, setSelected] = useState<number | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAssign = async () => {
    if (!selected) return;
    setAssigning(true); setError(null);
    try {
      await assignTicketToConsultant(ticket.id, selected);
      const consultant = consultants.find(c => c.id === selected);
      const consultantName = consultant?.name || `Consultant #${selected}`;

      const assignKey = `fin_notifs_CONSULTANT_${selected}`;
      const existing = JSON.parse(localStorage.getItem(assignKey) || "[]");
      const newNotif = {
        id: `${Date.now()}`,
        type: "info",
        title: `📋 New Ticket Assigned — #${ticket.id}`,
        message: `You have been assigned: "${ticket.title || ticket.category}" (${ticket.category}). Priority: ${ticket.priority}.`,
        timestamp: new Date().toISOString(),
        read: false,
        ticketId: ticket.id,
      };
      localStorage.setItem(assignKey, JSON.stringify([newNotif, ...existing].slice(0, 50)));

      addNotification({
        type: "success",
        title: `✅ Ticket #${ticket.id} Assigned`,
        message: `Assigned to ${consultantName}. They have been notified.`,
        ticketId: ticket.id,
      });

      onAssigned(ticket.id, selected, consultantName);
      onClose();
    } catch (e: any) {
      setError(e.message || "Assignment failed. Please try again.");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2000,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, width: "min(520px,95vw)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden",
        animation: "fadeInUp 0.2s ease",
      }}>
        <div style={{ background: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)", padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 10, color: "#93C5FD", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                Assign Ticket #{ticket.id}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 4 }}>
                {ticket.title || ticket.category}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
        </div>

        <div style={{ padding: "20px 24px" }}>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748B" }}>
            Select a consultant to assign this ticket. They will receive an in-app notification immediately.
          </p>

          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", color: "#DC2626", fontSize: 12, marginBottom: 14 }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
            {consultants.length === 0 ? (
              <div style={{ textAlign: "center", color: "#94A3B8", padding: 24, fontSize: 13 }}>No consultants available.</div>
            ) : consultants.map(c => (
              <div
                key={c.id}
                onClick={() => setSelected(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 16px", borderRadius: 12, cursor: "pointer",
                  border: `2px solid ${selected === c.id ? "#2563EB" : "#E2E8F0"}`,
                  background: selected === c.id ? "#EFF6FF" : "#fff",
                  transition: "all 0.15s",
                }}
              >
                <img src={c.avatar} alt={c.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "2px solid #BFDBFE" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                    {c.role}{c.shiftStartTime && ` · ${c.shiftStartTime}–${c.shiftEndTime}`}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    {c.tags.slice(0, 3).map(t => (
                      <span key={t} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#F1F5F9", color: "#475569", fontWeight: 600 }}>{t}</span>
                    ))}
                  </div>
                </div>
                {selected === c.id && (
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button
              onClick={handleAssign}
              disabled={!selected || assigning}
              style={{
                flex: 2, padding: "11px", borderRadius: 10, border: "none",
                background: (!selected || assigning) ? "#E2E8F0" : "linear-gradient(135deg,#2563EB,#1D4ED8)",
                color: (!selected || assigning) ? "#94A3B8" : "#fff",
                fontSize: 13, fontWeight: 700, cursor: (!selected || assigning) ? "default" : "pointer",
              }}
            >
              {assigning ? "Assigning…" : `Assign to ${consultants.find(c => c.id === selected)?.name || "Consultant"}`}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET DETAIL PANEL
// ─────────────────────────────────────────────────────────────────────────────
interface TicketDetailProps {
  ticket: Ticket;
  consultants: Advisor[];
  currentAdminId: number;
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
  onDeleted: (id: number) => void;
  onAssigned: (ticketId: number, consultantId: number, consultantName: string) => void;
}

const TicketDetailPanel: React.FC<TicketDetailProps> = ({
  ticket, consultants, currentAdminId, onClose, onStatusChange, onDeleted, onAssigned,
}) => {
  const { addNotification } = useNotifications();

  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loadingThread, setLoadingThread] = useState(true);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [localStatus, setLocalStatus] = useState<TicketStatus>(ticket.status);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // ── Priority editing (Admin can change priority inline) ───────────────────
  const [localPriority, setLocalPriority] = useState<TicketPriority>(ticket.priority);
  const [updatingPriority, setUpdatingPriority] = useState(false);
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);

  const [notes, setNotes] = useState<InternalNote[]>(ticket.internalNotes ?? ticket.notes ?? []);
  const [noteText, setNoteText] = useState("");
  const [postingNote, setPostingNote] = useState(false);

  const [showAssign, setShowAssign] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    (async () => {
      setLoadingThread(true);
      try {
        const data = await getTicketComments(ticket.id);
        setComments(extractArray(data));
      } catch { }
      finally { setLoadingThread(false); }
    })();
  }, [ticket.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const handleSendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const saved = await postTicketComment(ticket.id, reply.trim(), currentAdminId, true);
      setComments(p => [...p, saved]);
      setReply("");

      const userId = ticket.userId || ticket.user?.id;
      if (userId) {
        const userKey = `fin_notifs_USER_${userId}`;
        const existing = JSON.parse(localStorage.getItem(userKey) || "[]");
        const notif = {
          id: `${Date.now()}`,
          type: "info",
          title: `💬 Admin replied on Ticket #${ticket.id}`,
          message: `Your ticket "${ticket.title || ticket.category}" has a new reply from support.`,
          timestamp: new Date().toISOString(),
          read: false,
          ticketId: ticket.id,
        };
        localStorage.setItem(userKey, JSON.stringify([notif, ...existing].slice(0, 50)));
      }

      if (localStatus === "NEW") {
        setLocalStatus("OPEN");
        onStatusChange(ticket.id, "OPEN");
      }
    } catch (e: any) { showToast(e.message || "Failed to send.", false); }
    finally { setSending(false); }
  };

  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      await updateTicketStatus(ticket.id, newStatus);
      setLocalStatus(newStatus as TicketStatus);
      onStatusChange(ticket.id, newStatus);

      const userId = ticket.userId || ticket.user?.id;
      if (userId) {
        const userKey = `fin_notifs_USER_${userId}`;
        const existing = JSON.parse(localStorage.getItem(userKey) || "[]");
        const cfg = TICKET_STATUS_CFG[newStatus];
        const notif = {
          id: `${Date.now()}`,
          type: newStatus === "RESOLVED" ? "success" : "info",
          title: `${cfg?.icon || "🔄"} Ticket #${ticket.id} ${cfg?.label || newStatus}`,
          message: `Your ticket "${ticket.title || ticket.category}" is now ${cfg?.label || newStatus}.`,
          timestamp: new Date().toISOString(),
          read: false,
          ticketId: ticket.id,
        };
        localStorage.setItem(userKey, JSON.stringify([notif, ...existing].slice(0, 50)));
      }

      addNotification({
        type: newStatus === "RESOLVED" ? "success" : "info",
        title: `Ticket #${ticket.id} → ${TICKET_STATUS_CFG[newStatus]?.label || newStatus}`,
        message: `Status updated. Customer has been notified.`,
        ticketId: ticket.id,
      });
      showToast(`Status updated to ${newStatus.replace(/_/g, " ")}`);
    } catch (e: any) { showToast(e.message || "Failed.", false); }
    finally { setUpdatingStatus(false); }
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (newPriority === localPriority) return;
    setUpdatingPriority(true);
    try {
      // Try PATCH /tickets/:id/priority first, fallback to PATCH /tickets/:id
      try {
        await apiFetch(`/tickets/${ticket.id}/priority?priority=${encodeURIComponent(newPriority)}`, { method: "PATCH" });
      } catch {
        await apiFetch(`/tickets/${ticket.id}`, {
          method: "PATCH",
          body: JSON.stringify({ priority: newPriority }),
        });
      }
      setLocalPriority(newPriority as TicketPriority);
      // Notify user of priority change
      const userId = ticket.userId || ticket.user?.id;
      if (userId) {
        const userKey = `fin_notifs_USER_${userId}`;
        const existing = JSON.parse(localStorage.getItem(userKey) || "[]");
        const notif = {
          id: `${Date.now()}_prio_${ticket.id}`,
          type: "info",
          title: `🎯 Ticket #${ticket.id} Priority Updated`,
          message: `Your ticket "${ticket.title || ticket.category}" priority has been changed to ${newPriority}.`,
          timestamp: new Date().toISOString(),
          read: false,
          ticketId: ticket.id,
        };
        localStorage.setItem(userKey, JSON.stringify([notif, ...existing].slice(0, 50)));
      }
      showToast(`Priority updated to ${newPriority}`);
    } catch (e: any) { showToast(e.message || "Priority update failed.", false); }
    finally { setUpdatingPriority(false); }
  };

  const handlePostNote = async () => {
    if (!noteText.trim()) return;
    setPostingNote(true);
    try {
      const saved = await postInternalNote(ticket.id, noteText.trim(), currentAdminId);
      setNotes(p => [...p, saved]);
      setNoteText("");
      showToast("🔒 Note saved");
    } catch {
      setNotes(p => [...p, {
        id: Date.now(), ticketId: ticket.id, authorId: currentAdminId,
        noteText: noteText.trim(), createdAt: new Date().toISOString(),
      }]);
      setNoteText("");
      showToast("Note saved locally");
    } finally { setPostingNote(false); }
  };

  const handleEscalate = async () => {
    if (localStatus === "ESCALATED") return;
    setEscalating(true);
    try {
      await escalateTicket(ticket.id, "Customer requested urgent attention");
      setLocalStatus("ESCALATED");
      onStatusChange(ticket.id, "ESCALATED");
      addNotification({ type: "warning", title: `🚨 Ticket #${ticket.id} Escalated`, message: `"${ticket.title || ticket.category}" has been escalated.`, ticketId: ticket.id });
      showToast("🚨 Ticket escalated");
    } catch (e: any) { showToast(e.message || "Escalation failed.", false); }
    finally { setEscalating(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete ticket #${ticket.id}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteTicket(ticket.id);
      onDeleted(ticket.id);
    } catch (e: any) { showToast(e.message || "Delete failed.", false); setDeleting(false); }
  };

  const sc = TICKET_STATUS_CFG[localStatus] ?? TICKET_STATUS_CFG.NEW;
  const pc = TICKET_PRIORITY_CFG[localPriority] ?? TICKET_PRIORITY_CFG.MEDIUM;

  const getUserLabel = () =>
    ticket.user?.name || ticket.user?.username ||
    (ticket.user?.email ? ticket.user.email.split("@")[0] : null) ||
    ticket.userName || (ticket.userId ? `User #${ticket.userId}` : "—");

  return (
    <>
      {showAssign && (
        <AssignConsultantModal
          ticket={ticket}
          consultants={consultants}
          onClose={() => setShowAssign(false)}
          onAssigned={(tid, cid, cname) => { onAssigned(tid, cid, cname); setShowAssign(false); }}
        />
      )}

      <div style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "stretch", justifyContent: "flex-end" }}>
        <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(3px)" }} />

        <div style={{
          position: "relative", width: "min(620px, 100vw)", height: "100%",
          background: "#fff", display: "flex", flexDirection: "column",
          boxShadow: "-8px 0 40px rgba(0,0,0,0.18)", overflowY: "hidden",
          animation: "slideInRight 0.22s ease",
        }}>
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)", padding: "20px 24px", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
                <div style={{ fontSize: 10, color: "#93C5FD", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                  Ticket #{ticket.id}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1.35, wordBreak: "break-word", marginBottom: 6 }}>
                  {ticket.title || ticket.category}
                </div>
                <div style={{ fontSize: 12, color: "#BFDBFE" }}>
                  {getUserLabel()} · {ticket.category}
                  {ticket.agentName && ` · Assigned to ${ticket.agentName}`}
                  {ticket.consultantName && !ticket.agentName && ` · Assigned to ${ticket.consultantName}`}
                  {ticket.consultantId && !ticket.agentName && !ticket.consultantName && ` · Agent #${ticket.consultantId}`}
                </div>
              </div>
              <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <span style={{ padding: "4px 12px", borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontSize: 11, fontWeight: 700 }}>
                {sc.icon} {sc.label}
              </span>
              {ticket.isEscalated && (
                <span style={{ padding: "4px 12px", borderRadius: 20, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FCA5A5", fontSize: 11, fontWeight: 700 }}>
                  🚨 Escalated
                </span>
              )}
              {/* ── PRIORITY — clickable dropdown for inline edit ── */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowPriorityDropdown(v => !v)}
                  disabled={updatingPriority}
                  title="Click to change priority"
                  style={{
                    padding: "4px 12px", borderRadius: 20, background: pc.bg,
                    color: pc.color, border: `2px solid ${pc.border ?? pc.color}`,
                    fontSize: 11, fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 5,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
                    opacity: updatingPriority ? 0.7 : 1,
                    transition: "all 0.15s",
                  }}>
                  {updatingPriority
                    ? <span style={{ width: 10, height: 10, border: "2px solid rgba(0,0,0,0.2)", borderTopColor: pc.color, borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                    : "⚑"}
                  {pc.label}
                  <span style={{ fontSize: 9, opacity: 0.7 }}>▼</span>
                </button>
                {showPriorityDropdown && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 999,
                    background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.18)", minWidth: 130, overflow: "hidden",
                  }}>
                    <div style={{ padding: "6px 10px 4px", fontSize: 9, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Set Priority
                    </div>
                    {(["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"] as const).map(p => {
                      const cfg = TICKET_PRIORITY_CFG[p];
                      const isActive = localPriority === p;
                      return (
                        <button key={p} onClick={() => { handlePriorityChange(p); setShowPriorityDropdown(false); }}
                          style={{
                            width: "100%", padding: "8px 12px", border: "none", textAlign: "left",
                            background: isActive ? cfg.bg : "transparent",
                            color: isActive ? cfg.color : "#374151",
                            fontSize: 12, fontWeight: isActive ? 800 : 600,
                            cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
                            borderLeft: isActive ? `3px solid ${cfg.color}` : "3px solid transparent",
                          }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F8FAFC"; }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot ?? cfg.color, flexShrink: 0 }} />
                          {cfg.label}
                          {isActive && <span style={{ marginLeft: "auto", fontSize: 10 }}>✓</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", color: "#E0F2FE", fontSize: 11, fontWeight: 600 }}>
                📅 {new Date(ticket.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
              <ExportDropdown tickets={[ticket]} label="Export" compact={true} />
              <button
                onClick={() => setShowAssign(true)}
                style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}
              >
                👤 Assign Consultant
              </button>
            </div>
          </div>

          {/* SLA strip */}
          <SlaStrip ticket={{ ...ticket, status: localStatus }} />

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

            {/* Progress stepper */}
            <div style={{ padding: "16px 24px 8px", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Progress</div>
              <TicketStepper status={localStatus} />
            </div>

            {/* Status changer */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid #F1F5F9", background: "#FAFAFA" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Change Status {updatingStatus && <span style={{ color: "#2563EB" }}>· updating…</span>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {ALL_TICKET_STATUSES.map(s => {
                  const cfg = TICKET_STATUS_CFG[s];
                  const isActive = localStatus === s;
                  return (
                    <button key={s} onClick={() => !isActive && handleStatusChange(s)}
                      disabled={updatingStatus || isActive}
                      style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        cursor: isActive ? "default" : "pointer",
                        background: isActive ? cfg.bg : "#fff",
                        color: isActive ? cfg.color : "#64748B",
                        border: `1.5px solid ${isActive ? cfg.border : "#E2E8F0"}`,
                        opacity: updatingStatus ? 0.6 : 1, transition: "all 0.15s",
                      }}>
                      {cfg.icon} {cfg.label}{isActive && " ✓"}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#94A3B8" }}>
                ℹ️ Customer will receive an in-app notification when status changes.
              </div>
            </div>

            {/* ── Priority changer (Admin only) ── */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid #F1F5F9", background: "#FAFAFA" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                Change Priority {updatingPriority && <span style={{ color: "#D97706" }}>· updating…</span>}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"] as const).map(p => {
                  const cfg = TICKET_PRIORITY_CFG[p];
                  const isActive = localPriority === p;
                  return (
                    <button key={p} onClick={() => !isActive && handlePriorityChange(p)}
                      disabled={updatingPriority || isActive}
                      style={{
                        padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700,
                        cursor: isActive ? "default" : "pointer",
                        background: isActive ? cfg.bg : "#fff",
                        color: isActive ? cfg.color : "#64748B",
                        border: `1.5px solid ${isActive ? (cfg.border ?? "#E2E8F0") : "#E2E8F0"}`,
                        opacity: updatingPriority ? 0.6 : 1, transition: "all 0.15s",
                      }}>
                      ⚑ {cfg.label}{isActive && " ✓"}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#94A3B8" }}>
                ℹ️ Priority change is reflected immediately in the ticket list.
              </div>
            </div>

            {/* Description */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", marginBottom: 8 }}>Description</div>
              <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.7, background: "#F8FAFC", borderRadius: 10, padding: "10px 14px", borderLeft: "3px solid #BFDBFE" }}>
                {ticket.description}
              </p>
              {ticket.attachmentUrl && (
                <a href={ticket.attachmentUrl} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: "#2563EB", fontWeight: 600, textDecoration: "none" }}>
                  📎 View attachment
                </a>
              )}
            </div>

            {/* Conversation thread */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                💬 Conversation ({comments.length})
              </div>
              {loadingThread ? (
                <div style={{ textAlign: "center", padding: 24, color: "#94A3B8", fontSize: 13 }}>
                  <div style={{ width: 20, height: 20, border: "2px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 8px" }} />
                  Loading thread…
                </div>
              ) : comments.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "#94A3B8", fontSize: 13, fontStyle: "italic" }}>No messages yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
                  {comments.map(c => {
                    const isAgent =
                      c.isConsultantReply === true ||
                      c.authorRole === "AGENT" ||
                      (c.isConsultantReply !== false && c.senderId != null && c.senderId !== ticket.userId);

                    const senderLabel = c.authorName
                      ? c.authorName
                      : isAgent
                        ? (c.senderId === currentAdminId ? "Admin" : "Agent")
                        : (ticket.userName || (ticket.userId ? `User #${ticket.userId}` : "Customer"));

                    return (
                      <div key={c.id} style={{ display: "flex", gap: 10, flexDirection: isAgent ? "row-reverse" : "row" }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                          background: isAgent
                            ? "linear-gradient(135deg,#1E3A5F,#2563EB)"
                            : "linear-gradient(135deg,#F59E0B,#D97706)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 12, fontWeight: 700, color: "#fff",
                        }}>
                          {senderLabel.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ maxWidth: "76%" }}>
                          <div style={{ fontSize: 10, color: "#94A3B8", marginBottom: 3, textAlign: isAgent ? "right" : "left" }}>
                            <strong style={{ color: "#475569" }}>{senderLabel}</strong>
                            {isAgent && (
                              <span style={{ marginLeft: 5, background: "#EFF6FF", color: "#2563EB", padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
                                {c.senderId === currentAdminId ? "ADMIN" : "AGENT"}
                              </span>
                            )}
                            {!isAgent && (
                              <span style={{ marginLeft: 5, background: "#FFF7ED", color: "#D97706", padding: "1px 5px", borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
                                CUSTOMER
                              </span>
                            )}
                            {" · "}{new Date(c.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </div>
                          <div style={{
                            padding: "10px 13px", borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                            background: isAgent ? "#EFF6FF" : "#FFF7ED",
                            color: isAgent ? "#1E3A5F" : "#92400E",
                            border: `1px solid ${isAgent ? "#BFDBFE" : "#FED7AA"}`,
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

            {/* Reply box */}
            <div style={{ padding: "12px 24px", borderBottom: "1px solid #F1F5F9", background: "#F8FAFC", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Reply to Customer</div>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  value={reply} onChange={e => setReply(e.target.value)} rows={2}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendReply(); } }}
                  placeholder="Type a reply… (Enter to send, customer will be notified)"
                  style={{ flex: 1, padding: "9px 12px", border: "1.5px solid #BFDBFE", borderRadius: 10, fontSize: 13, resize: "none", fontFamily: "inherit", outline: "none", background: "#fff" }}
                />
                <button onClick={handleSendReply} disabled={!reply.trim() || sending}
                  style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: !reply.trim() ? "#E2E8F0" : "#2563EB", color: !reply.trim() ? "#94A3B8" : "#fff", fontSize: 13, fontWeight: 700, cursor: !reply.trim() ? "default" : "pointer", flexShrink: 0, alignSelf: "flex-end" }}>
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </div>

            {/* Internal Notes */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #FEF9C3", background: "#FFFBEB", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#92400E", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                🔒 Internal Notes <span style={{ fontSize: 10, fontWeight: 500, color: "#B45309", textTransform: "none" }}>(never visible to user)</span>
              </div>
              {notes.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {notes.map(n => (
                    <div key={n.id} style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "9px 12px" }}>
                      <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.55 }}>{n.noteText}</div>
                      <div style={{ fontSize: 10, color: "#92400E", marginTop: 4 }}>
                        Agent #{n.authorId} · {new Date(n.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <textarea
                  value={noteText} onChange={e => setNoteText(e.target.value)} rows={2}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handlePostNote(); } }}
                  placeholder="Add a private note… (Enter to save)"
                  style={{ flex: 1, padding: "9px 12px", border: "1.5px solid #FDE68A", borderRadius: 10, fontSize: 13, resize: "none", fontFamily: "inherit", outline: "none", background: "#fff" }}
                />
                <button onClick={handlePostNote} disabled={!noteText.trim() || postingNote}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "none", background: !noteText.trim() ? "#F1F5F9" : "#D97706", color: !noteText.trim() ? "#94A3B8" : "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", alignSelf: "flex-end", flexShrink: 0 }}>
                  {postingNote ? "…" : "Save"}
                </button>
              </div>
            </div>

            {/* Escalate */}
            <div style={{ padding: "14px 24px", borderBottom: "1px solid #FED7AA", background: "#FFF7ED", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9A3412", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                🚨 Escalate Ticket
              </div>
              {localStatus === "ESCALATED" ? (
                <div style={{ fontSize: 12, color: "#B91C1C", fontWeight: 600, padding: "8px 12px", background: "#FEE2E2", borderRadius: 8, border: "1px solid #FECACA" }}>
                  ⚠️ Already escalated
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, fontSize: 12, color: "#78350F", lineHeight: 1.5 }}>
                    Marks as <strong>ESCALATED</strong> and triggers urgent SLA. Senior agents will be notified.
                  </div>
                  <button onClick={handleEscalate} disabled={escalating}
                    style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                    {escalating ? "…" : "Escalate"}
                  </button>
                </div>
              )}
            </div>

            {/* Danger zone */}
            <div style={{ padding: "14px 24px 20px", background: "#FEF2F2", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#B91C1C", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Danger Zone</div>
              <button onClick={handleDelete} disabled={deleting}
                style={{ padding: "9px 18px", borderRadius: 10, border: "1.5px solid #FECACA", background: deleting ? "#FEE2E2" : "#fff", color: "#DC2626", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                {deleting ? "Deleting…" : `🗑 Delete Ticket #${ticket.id}`}
              </button>
            </div>
          </div>

          {/* Toast */}
          {toast && (
            <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.ok ? "#0F172A" : "#7F1D1D", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 9999, whiteSpace: "nowrap" }}>
              {toast.ok ? "✓" : "✕"} {toast.msg}
            </div>
          )}
        </div>

        <style>{`
          @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE TICKET MODAL
// ─────────────────────────────────────────────────────────────────────────────
export const CreateTicketModal: React.FC<{
  currentUserId: number;
  onCreated: (t: any) => void;
  onClose: () => void;
}> = ({ currentUserId, onCreated, onClose }) => {
  const [form, setForm] = useState({ category: "", description: "", priority: "MEDIUM", consultantId: "" });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.category.trim() || !form.description.trim()) { setError("Category and description are required."); return; }
    setSaving(true); setError("");
    try {
      const saved = await createTicket({
        userId: currentUserId,
        category: form.category.trim(),
        description: form.description.trim(),
        priority: form.priority,
        consultantId: form.consultantId ? Number(form.consultantId) : null,
      }, file);
      onCreated(saved);
    } catch (e: any) { setError(e.message || "Failed to create ticket."); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: 480, maxWidth: "95vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)", padding: "20px 24px" }}>
          <h3 style={{ margin: 0, color: "#fff", fontSize: 16, fontWeight: 700 }}>🎫 Create New Ticket</h3>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {error && <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", color: "#B91C1C", fontSize: 13 }}>{error}</div>}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>Category *</label>
            <input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Billing, Technical, Account"
              style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>Description *</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} placeholder="Describe the issue in detail…"
              style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}
                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>Agent ID (optional)</label>
              <input type="number" value={form.consultantId} onChange={e => setForm({ ...form, consultantId: e.target.value })} placeholder="Assign to agent…"
                style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6 }}>Attachment (optional)</label>
            <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} style={{ fontSize: 13, color: "#374151" }} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving}
              style={{ padding: "9px 24px", borderRadius: 10, border: "none", background: saving ? "#93C5FD" : "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {saving ? "Creating…" : "Create Ticket"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────
interface ExportDropdownProps {
  tickets: any[];
  label?: string;
  compact?: boolean;
}

const ExportDropdown: React.FC<ExportDropdownProps> = ({ tickets, label = "Export", compact = false }) => {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<"idle" | "loading" | "done" | "error">("idle");
  const [statusMsg, setStatusMsg] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const isSingle = tickets.length === 1;

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const run = async (action: () => Promise<void>, successMsg: string) => {
    setOpen(false);
    setStatus("loading");
    setStatusMsg("Generating…");
    try {
      await action();
      setStatus("done");
      setStatusMsg(successMsg);
    } catch (err: any) {
      setStatus("error");
      setStatusMsg(err?.message || "Export failed");
    } finally {
      setTimeout(() => setStatus("idle"), 3500);
    }
  };

  const handleExcel = async () => {
    if (isSingle) {
      try { await exportSingleTicketExcel(tickets[0].id); setStatus("done"); setStatusMsg("Excel downloaded ✓"); }
      catch { await clientExportTicketsExcel(tickets, `ticket_${tickets[0].id}.xlsx`); setStatus("done"); setStatusMsg("Excel downloaded ✓"); }
    } else {
      try { await exportTicketsExcel(); setStatus("done"); setStatusMsg(`${tickets.length} tickets → Excel ✓`); }
      catch { await clientExportTicketsExcel(tickets); setStatus("done"); setStatusMsg(`${tickets.length} tickets → Excel ✓`); }
    }
  };

  const handlePdf = async () => {
    if (isSingle) {
      try { await exportSingleTicketPdf(tickets[0].id); setStatus("done"); setStatusMsg("PDF downloaded ✓"); }
      catch { await clientExportTicketsPdf(tickets, `ticket_${tickets[0].id}.pdf`); setStatus("done"); setStatusMsg("PDF downloaded ✓"); }
    } else {
      try { await exportTicketsPdf(); setStatus("done"); setStatusMsg(`${tickets.length} tickets → PDF ✓`); }
      catch { await clientExportTicketsPdf(tickets); setStatus("done"); setStatusMsg(`${tickets.length} tickets → PDF ✓`); }
    }
  };

  const btnStyle: React.CSSProperties = {
    padding: compact ? "5px 12px" : "8px 16px", borderRadius: 8,
    border: "1.5px solid #E2E8F0",
    background: status === "loading" ? "#F8FAFC" : status === "done" ? "#F0FDF4" : status === "error" ? "#FEF2F2" : "#fff",
    color: status === "done" ? "#16A34A" : status === "error" ? "#DC2626" : "#374151",
    fontSize: compact ? 11 : 13, fontWeight: 600,
    cursor: status === "loading" ? "default" : "pointer",
    display: "flex", alignItems: "center", gap: 6,
    transition: "all 0.15s", whiteSpace: "nowrap" as const,
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => status === "idle" && setOpen(o => !o)} style={btnStyle} title={isSingle ? `Export Ticket #${tickets[0]?.id}` : `Export ${tickets.length} tickets`}>
        {status === "loading" ? (
          <><span style={{ width: 12, height: 12, border: "2px solid #CBD5E1", borderTopColor: "#2563EB", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />Exporting…</>
        ) : status === "done" ? (<>✓ {statusMsg}</>
        ) : status === "error" ? (<>⚠ {statusMsg.slice(0, 28)}</>
        ) : (
          <>
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {label}
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </button>

      {open && status === "idle" && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "#fff", border: "1.5px solid #E2E8F0", borderRadius: 12, boxShadow: "0 8px 28px rgba(0,0,0,0.12)", minWidth: 210, zIndex: 500, overflow: "hidden", animation: "fadeInUp 0.12s ease" }}>
          <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {isSingle ? `Export Ticket #${tickets[0]?.id}` : `Export ${tickets.length} Tickets`}
            </div>
          </div>
          <button onClick={() => run(handleExcel, isSingle ? "Excel saved" : `${tickets.length} tickets saved`)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: "none", background: "none", cursor: "pointer", textAlign: "left", transition: "background 0.1s" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#F0FDF4")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#DCFCE7", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="6" fill="#16A34A" /><text x="5" y="22" fontSize="14" fontWeight="800" fill="white" fontFamily="Arial">XL</text></svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Download Excel</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{isSingle ? "Single ticket .xlsx file" : `.xlsx · ${tickets.length} rows`}</div>
            </div>
          </button>
          <div style={{ height: 1, background: "#F1F5F9", margin: "0 14px" }} />
          <button onClick={() => run(handlePdf, isSingle ? "PDF saved" : `${tickets.length} tickets saved`)}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", border: "none", background: "none", cursor: "pointer", textAlign: "left", transition: "background 0.1s" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#FFF7ED")}
            onMouseLeave={e => (e.currentTarget.style.background = "none")}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "#FFEDD5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="6" fill="#EA580C" /><text x="4" y="22" fontSize="12" fontWeight="800" fill="white" fontFamily="Arial">PDF</text></svg>
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Download PDF</div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 1 }}>{isSingle ? "Formatted ticket report" : `Printable report · ${tickets.length} tickets`}</div>
            </div>
          </button>
          <div style={{ padding: "8px 14px 10px", borderTop: "1px solid #F1F5F9", background: "#F8FAFC" }}>
            <div style={{ fontSize: 10, color: "#94A3B8" }}>💡 {isSingle ? "Includes all ticket details & comments" : "Includes all filtered tickets"}</div>
          </div>
        </div>
      )}
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// TICKETS SECTION
// ─────────────────────────────────────────────────────────────────────────────
interface TicketsSectionProps {
  consultants: Advisor[];
  currentAdminId: number;
  onTicketsLoaded?: (tickets: Ticket[]) => void;
}

const TicketsSection: React.FC<TicketsSectionProps> = ({ consultants, currentAdminId, onTicketsLoaded }) => {
  const { addNotification } = useNotifications();
  const TICKET_PAGE_SIZE = 10;

  const [tickets, setTickets] = useState<Ticket[]>([]);   // current page items
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [ticketPage, setTicketPage] = useState(0);              // 0-based (Spring)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"ALL" | TicketStatus>("ALL");
  const [filterPriority, setFilterPriority] = useState<"ALL" | TicketPriority>("ALL");
  const [searchQ, setSearchQ] = useState("");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Cache: page-number → Ticket[] for instant adjacent-page navigation
  const [pageCache, setPageCache] = useState<Record<number, Ticket[]>>({});

  // Reset to page 0 when filters/search change
  useEffect(() => { setTicketPage(0); setPageCache({}); }, [filterStatus, filterPriority, searchQ]);

  useEffect(() => { loadPage(ticketPage); }, [ticketPage]);

  // Silently pre-fetch adjacent pages after current page loads
  useEffect(() => {
    if (loading) return;
    const prefetch = async (p: number) => {
      if (p < 0 || (totalPages > 0 && p >= totalPages) || pageCache[p]) return;
      try {
        const result = await getTicketsPage(p, TICKET_PAGE_SIZE);
        const arr: Ticket[] = Array.isArray(result.content) ? result.content : extractArray(result.content);
        const enriched = await enrichTickets(arr);
        setPageCache(prev => ({ ...prev, [p]: enriched }));
      } catch { /* silent prefetch failure */ }
    };
    prefetch(ticketPage - 1);
    prefetch(ticketPage + 1);
  }, [ticketPage, loading, totalPages]);

  const enrichTickets = async (arr: Ticket[]): Promise<Ticket[]> => {
    // Extract user name purely from ticket data — NO /api/users/:id calls.
    // Those endpoints return 404 when the user record was soft-deleted or is on a different
    // DB table. Using ticket.user / ticket.userName / ticket.userId is sufficient.
    return arr.map((t: any) => {
      if (t.userName) return t; // already enriched
      const name =
        t.user?.name || t.user?.fullName || t.user?.username ||
        (t.user?.email ? t.user.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : null) ||
        t.clientName || t.raisedBy || t.submittedBy ||
        (t.userId ? `User #${t.userId}` : "—");
      return { ...t, userName: name };
    });
  };

  // load() — used by Refresh button and after ticket create/delete
  const load = async () => { setPageCache({}); setTicketPage(0); };

  const loadPage = async (page: number) => {
    if (pageCache[page]) {
      setTickets(pageCache[page]);
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const result = await getTicketsPage(page, TICKET_PAGE_SIZE);
      setTotalElements(result.totalElements);
      setTotalPages(result.totalPages);
      const arr: Ticket[] = Array.isArray(result.content) ? result.content : extractArray(result.content);
      const enriched = await enrichTickets(arr);
      setTickets(enriched);
      setPageCache(prev => ({ ...prev, [page]: enriched }));
      onTicketsLoaded?.(enriched);
    } catch (e: any) {
      setError(e?.message || "Failed to load tickets.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleStatusChange = (id: number, status: string) =>
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status: status as TicketStatus } : t));

  const handleDeleted = (id: number) => {
    setTickets(prev => prev.filter(t => t.id !== id));
    setSelectedTicket(null);
  };

  const handleAssigned = (ticketId: number, consultantId: number, consultantName: string) => {
    setTickets(prev => prev.map(t =>
      t.id === ticketId
        ? { ...t, consultantId, consultantName, agentName: consultantName, status: "OPEN" as TicketStatus }
        : t
    ));
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket(p => p ? { ...p, consultantId, consultantName, agentName: consultantName } : p);
    }
  };

  const counts = {
    ALL: totalElements,
    NEW: tickets.filter(t => t.status === "NEW").length,
    OPEN: tickets.filter(t => t.status === "OPEN").length,
    IN_PROGRESS: tickets.filter(t => t.status === "IN_PROGRESS").length,
    PENDING: tickets.filter(t => t.status === "PENDING").length,
    RESOLVED: tickets.filter(t => t.status === "RESOLVED").length,
    CLOSED: tickets.filter(t => t.status === "CLOSED").length,
    ESCALATED: tickets.filter(t => t.status === "ESCALATED" || t.isEscalated).length,
  };

  const openCount = tickets.filter(t => ["OPEN", "NEW", "IN_PROGRESS", "PENDING"].includes(t.status)).length;
  const resolvedToday = tickets.filter(t =>
    t.status === "RESOLVED" && t.updatedAt &&
    new Date(t.updatedAt).toDateString() === new Date().toDateString()
  ).length;

  const getUserDisplay = (t: Ticket) =>
    t.user?.name || t.user?.username ||
    (t.user?.email ? t.user.email.split("@")[0] : null) ||
    t.userName || (t.userId ? `User #${t.userId}` : "—");

  const visible = tickets.filter(t => {
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    if (filterPriority !== "ALL" && t.priority !== filterPriority) return false;
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      const user = getUserDisplay(t).toLowerCase();
      if (
        !t.description.toLowerCase().includes(q) &&
        !(t.title ?? "").toLowerCase().includes(q) &&
        !t.category.toLowerCase().includes(q) &&
        !user.includes(q) &&
        !String(t.id).includes(q)
      ) return false;
    }
    return true;
  });

  const SLA_HOURS_LOCAL = 2;
  const overdueTickets = tickets.filter(t => {
    if (["RESOLVED", "CLOSED"].includes(t.status)) return false;
    return (Date.now() - new Date(t.createdAt).getTime()) / 3_600_000 >= SLA_HOURS_LOCAL;
  });

  return (
    <>
      <EscalationMonitor tickets={tickets.map(t => ({ ...t, title: t.title ?? "", consultantId: t.consultantId ?? undefined }))} slaHours={SLA_HOURS_LOCAL} />
      {selectedTicket && (
        <TicketDetailPanel
          ticket={selectedTicket}
          consultants={consultants}
          currentAdminId={currentAdminId}
          onClose={() => setSelectedTicket(null)}
          onStatusChange={handleStatusChange}
          onDeleted={handleDeleted}
          onAssigned={handleAssigned}
        />
      )}
      {showCreate && (
        <CreateTicketModal
          currentUserId={currentAdminId}
          onCreated={t => { setTickets(p => [t, ...p]); setShowCreate(false); }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Email-to-Ticket feature notice */}
      <div style={{ background: "linear-gradient(135deg,#EFF6FF,#F0FDF4)", border: "1px solid #BFDBFE", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 22, flexShrink: 0 }}>📧</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1E3A8A", marginBottom: 2 }}>Email-to-Ticket is Active</div>
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>
            Emails sent to <strong style={{ color: "#2563EB" }}>support@meetthemasters.in</strong> are automatically converted to tickets.
            Priority and category are auto-detected from email content. Duplicate emails are ignored.
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>
          Support Tickets
          <span style={{ marginLeft: 10, fontSize: 14, fontWeight: 600, color: "#64748B" }}>
            {loading ? "" : `(${totalElements} total)`}
          </span>
        </h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          <button onClick={() => setShowCreate(true)}
            style={{ padding: "8px 16px", background: "#2563EB", border: "none", color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            + New Ticket
          </button>
          <ExportDropdown
            tickets={visible.length > 0 ? visible : tickets}
            label={visible.length !== tickets.length ? `Export (${visible.length})` : `Export All (${tickets.length})`}
          />
          <button onClick={load} disabled={loading}
            style={{ padding: "8px 16px", background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "⏳" : "↻"} Refresh
          </button>
        </div>
      </div>

      {overdueTickets.length > 0 && (
        <div style={{ background: "linear-gradient(135deg,#FEF2F2,#FFF5F5)", border: "2px solid #FECACA", borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", gap: 14, alignItems: "center", animation: "pulse 2s infinite" }}>
          <div style={{ fontSize: 28, flexShrink: 0 }}>🚨</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: "#B91C1C" }}>SLA Breach Alert — {overdueTickets.length} Overdue Ticket{overdueTickets.length !== 1 ? "s" : ""}</div>
            <div style={{ fontSize: 12, color: "#EF4444", marginTop: 4 }}>
              {overdueTickets.slice(0, 3).map(t => `#${t.id} "${t.title || t.category}"`).join(", ")}
              {overdueTickets.length > 3 && ` +${overdueTickets.length - 3} more`}
            </div>
          </div>
          <button onClick={() => setFilterStatus("NEW")}
            style={{ padding: "8px 16px", background: "#DC2626", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
            View Overdue
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total", value: tickets.length, color: "#2563EB", bg: "#EFF6FF" },
          { label: "Open / Active", value: openCount, color: "#D97706", bg: "#FFFBEB" },
          { label: "Overdue (SLA)", value: overdueTickets.length, color: "#DC2626", bg: "#FEF2F2" },
          { label: "Escalated", value: counts.ESCALATED, color: "#DC2626", bg: "#FEF2F2" },
          { label: "Resolved", value: counts.RESOLVED, color: "#16A34A", bg: "#F0FDF4" },
          { label: "Resolved Today", value: resolvedToday, color: "#16A34A", bg: "#F0FDF4" },
          { label: "Closed", value: counts.CLOSED, color: "#64748B", bg: "#F1F5F9" },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 12, padding: "12px 16px" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{loading ? "…" : s.value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} width="14" height="14" fill="none" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2" />
            <path d="m21 21-4.35-4.35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input value={searchQ} onChange={e => { setSearchQ(e.target.value); setTicketPage(0); setPageCache({}); }} placeholder="Search by title, user, category, ID…"
            style={{ width: "100%", paddingLeft: 32, paddingRight: 12, paddingTop: 9, paddingBottom: 9, border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
        <select value={filterPriority} onChange={e => { setFilterPriority(e.target.value as any); setTicketPage(0); setPageCache({}); }}
          style={{ padding: "9px 14px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
          <option value="ALL">All Priorities</option>
          {(["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"] as TicketPriority[]).map(p => (
            <option key={p} value={p}>{TICKET_PRIORITY_CFG[p]?.label ?? p}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {(["ALL", ...ALL_TICKET_STATUSES] as const).map(f => (
          <button key={f} onClick={() => { setFilterStatus(f as any); setTicketPage(0); setPageCache({}); }}
            style={{
              padding: "5px 14px", borderRadius: 20, border: "1.5px solid",
              borderColor: filterStatus === f ? "#2563EB" : "#E2E8F0",
              background: filterStatus === f ? "#2563EB" : "#fff",
              color: filterStatus === f ? "#fff" : "#64748B",
              fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
            }}>
            {f === "ALL" ? "All" : (TICKET_STATUS_CFG[f]?.label ?? f)} ({f === "ALL" ? tickets.length : (counts[f as keyof typeof counts] ?? 0)})
          </button>
        ))}
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", color: "#B91C1C", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          ⚠️ {error}
          <button onClick={load} style={{ marginLeft: "auto", padding: "4px 12px", background: "#B91C1C", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Retry</button>
        </div>
      )}

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
        <>
          <div style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 110px 90px 100px 110px 100px 140px", padding: "10px 20px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <div>ID</div><div>TITLE / USER</div><div>CATEGORY</div><div>PRIORITY</div>
              <div>ASSIGNED TO</div><div>STATUS</div><div>CREATED</div>
              <div style={{ textAlign: "right" }}>ACTION</div>
            </div>
            {visible.map((ticket, idx) => {
              const sc = TICKET_STATUS_CFG[ticket.status] ?? TICKET_STATUS_CFG.NEW;
              const pc = TICKET_PRIORITY_CFG[ticket.priority] ?? TICKET_PRIORITY_CFG.MEDIUM;
              const sla = getSlaInfo(ticket);
              const hoursOpen = (Date.now() - new Date(ticket.createdAt).getTime()) / 3_600_000;
              const isOverdue = !["RESOLVED", "CLOSED"].includes(ticket.status) && hoursOpen >= SLA_HOURS_LOCAL;
              return (
                <div key={ticket.id}
                  style={{ display: "grid", gridTemplateColumns: "60px 1fr 110px 90px 100px 110px 100px 140px", padding: "14px 20px", borderBottom: idx < visible.length - 1 ? "1px solid #F8FAFC" : "none", borderLeft: `3px solid ${isOverdue ? "#DC2626" : sla?.breached ? "#EF4444" : sla?.warning ? "#F59E0B" : "transparent"}`, background: isOverdue ? "#FFF8F8" : "transparent", transition: "background 0.1s", cursor: "pointer", alignItems: "center" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFF")}
                  onMouseLeave={e => (e.currentTarget.style.background = isOverdue ? "#FFF8F8" : "transparent")}
                  onClick={() => setSelectedTicket(ticket)}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isOverdue ? "#DC2626" : "#94A3B8", fontFamily: "monospace" }}>
                    #{ticket.id}
                    {isOverdue && <div style={{ fontSize: 9, color: "#DC2626", fontWeight: 800 }}>⏰ SLA</div>}
                  </div>
                  <div style={{ minWidth: 0, paddingRight: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ticket.title || ticket.category}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>👤 {getUserDisplay(ticket)}</div>
                    {sla && (
                      <div style={{ fontSize: 10, color: sla.breached ? "#DC2626" : sla.warning ? "#D97706" : "#16A34A", fontWeight: 700, marginTop: 2 }}>
                        {sla.breached ? "⏰ SLA BREACHED" : sla.warning ? `⚠️ ${sla.label}` : `✓ ${sla.label}`}
                      </div>
                    )}
                  </div>
                  <div><span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "#F1F5F9", color: "#475569", fontWeight: 600 }}>{ticket.category}</span></div>
                  <div><span style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, background: pc.bg, color: pc.color, fontWeight: 700 }}>⚑ {pc.label}</span></div>
                  <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ticket.consultantName || ticket.agentName || <span style={{ color: "#DC2626", fontWeight: 600 }}>Unassigned</span>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontWeight: 700 }}>{sc.icon} {sc.label}</span>
                    {ticket.isEscalated && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FCA5A5", fontWeight: 700 }}>🚨 Escalated</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>
                    {new Date(ticket.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                    {isOverdue && <div style={{ fontSize: 10, color: "#DC2626", fontWeight: 600 }}>{Math.floor(hoursOpen)}h open</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <button onClick={e => { e.stopPropagation(); setSelectedTicket(ticket); }}
                      style={{ padding: "4px 10px", background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Open →
                    </button>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={async e => {
                        e.stopPropagation();
                        try { await exportSingleTicketExcel(ticket.id); }
                        catch { await clientExportTicketsExcel([ticket], `ticket_${ticket.id}.xlsx`); }
                      }} style={{ padding: "3px 7px", background: "#F0FDF4", border: "1px solid #86EFAC", color: "#16A34A", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        📊 XLS
                      </button>
                      <button onClick={async e => {
                        e.stopPropagation();
                        try { await exportSingleTicketPdf(ticket.id); }
                        catch { await clientExportTicketsPdf([ticket], `ticket_${ticket.id}.pdf`); }
                      }} style={{ padding: "3px 7px", background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#DC2626", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        📄 PDF
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Pagination Bar ── */}
          {totalPages > 1 && (() => {
            const pageNums = (): (number | "…")[] => {
              if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
              const set = new Set([0, totalPages - 1, ticketPage - 1, ticketPage, ticketPage + 1]
                .filter(p => p >= 0 && p < totalPages));
              const sorted = [...set].sort((a, b) => a - b);
              const result: (number | "…")[] = [];
              sorted.forEach((p, i) => {
                if (i > 0 && p - (sorted[i - 1] as number) > 1) result.push("…");
                result.push(p);
              });
              return result;
            };
            const goToPage = (p: number) => { if (p >= 0 && p < totalPages && p !== ticketPage) setTicketPage(p); };
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>
                  Page {ticketPage + 1} of {totalPages} &nbsp;·&nbsp; {totalElements} total tickets
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button onClick={() => goToPage(ticketPage - 1)} disabled={ticketPage === 0}
                    style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: ticketPage === 0 ? "not-allowed" : "pointer", border: "1.5px solid #E2E8F0", background: ticketPage === 0 ? "#F8FAFC" : "#fff", color: ticketPage === 0 ? "#CBD5E1" : "#2563EB", transition: "all 0.15s" }}
                  >← Prev</button>

                  {pageNums().map((pg, i) =>
                    pg === "…" ? (
                      <span key={`ellipsis-${i}`} style={{ padding: "0 6px", color: "#94A3B8", fontSize: 14, userSelect: "none" }}>…</span>
                    ) : (
                      <button key={pg} onClick={() => goToPage(pg as number)}
                        style={{
                          width: 36, height: 36, borderRadius: 8, fontSize: 13,
                          fontWeight: pg === ticketPage ? 800 : 600, cursor: "pointer",
                          border: pg === ticketPage ? "2px solid #2563EB" : pageCache[pg as number] ? "1.5px solid #BFDBFE" : "1.5px solid #E2E8F0",
                          background: pg === ticketPage ? "#2563EB" : pageCache[pg as number] ? "#EFF6FF" : "#fff",
                          color: pg === ticketPage ? "#fff" : pageCache[pg as number] ? "#2563EB" : "#374151",
                          transition: "all 0.15s",
                        }}
                      >{(pg as number) + 1}</button>
                    )
                  )}

                  <button onClick={() => goToPage(ticketPage + 1)} disabled={ticketPage >= totalPages - 1}
                    style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: ticketPage >= totalPages - 1 ? "not-allowed" : "pointer", border: "1.5px solid #E2E8F0", background: ticketPage >= totalPages - 1 ? "#F8FAFC" : "#fff", color: ticketPage >= totalPages - 1 ? "#CBD5E1" : "#2563EB", transition: "all 0.15s" }}
                  >Next →</button>
                </div>
              </div>
            );
          })()}
        </>
      )}

      <style>{`@keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.15); } 50% { box-shadow: 0 0 0 8px rgba(220,38,38,0); } }`}</style>
    </>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DYNAMIC SETTINGS PAGE
// ─────────────────────────────────────────────────────────────────────────────

type SettingsTab = "profile" | "notifications" | "security" | "logout";

interface AdminProfile {
  name: string;
  email: string;
  phone: string;
  orgName: string;
  designation: string;
  avatarUrl: string;
}

interface NotificationPrefs {
  emailOnNewTicket: boolean;
  emailOnStatusChange: boolean;
  emailOnEscalation: boolean;
  inAppNewTicket: boolean;
  inAppSlaBreaches: boolean;
  inAppAssignments: boolean;
  dailySummaryEmail: boolean;
  weeklySummaryEmail: boolean;
}

const SettingsPage: React.FC<{ adminId: number; onLogout: () => void }> = ({ adminId, onLogout }) => {
  const [activeTab, setActiveTab] = React.useState<SettingsTab | null>(null);

  // ── Profile state ──────────────────────────────────────────────────────────
  const [profile, setProfile] = React.useState<AdminProfile>({
    name: localStorage.getItem("fin_user_name") || "",
    email: localStorage.getItem("fin_user_email") || "",
    phone: localStorage.getItem("fin_user_phone") || "",
    orgName: localStorage.getItem("fin_org_name") || "MEET THE MASTERS",
    designation: localStorage.getItem("fin_designation") || "Admin",
    avatarUrl: localStorage.getItem("fin_avatar_url") || "",
  });
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileMsg, setProfileMsg] = React.useState<{ text: string; ok: boolean } | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string>(profile.avatarUrl);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  // ── Notification prefs ─────────────────────────────────────────────────────
  const loadNotifPrefs = (): NotificationPrefs => {
    try {
      const raw = localStorage.getItem("fin_notif_prefs");
      if (raw) return JSON.parse(raw);
    } catch { }
    return {
      emailOnNewTicket: true,
      emailOnStatusChange: true,
      emailOnEscalation: true,
      inAppNewTicket: true,
      inAppSlaBreaches: true,
      inAppAssignments: true,
      dailySummaryEmail: false,
      weeklySummaryEmail: true,
    };
  };
  const [notifPrefs, setNotifPrefs] = React.useState<NotificationPrefs>(loadNotifPrefs);
  const [notifSaving, setNotifSaving] = React.useState(false);
  const [notifMsg, setNotifMsg] = React.useState<{ text: string; ok: boolean } | null>(null);

  // ── Security state ─────────────────────────────────────────────────────────
  const [secForm, setSecForm] = React.useState({ current: "", newPass: "", confirm: "" });
  const [secSaving, setSecSaving] = React.useState(false);
  const [secMsg, setSecMsg] = React.useState<{ text: string; ok: boolean } | null>(null);
  const [showPasswords, setShowPasswords] = React.useState({ current: false, newPass: false, confirm: false });

  // ── Logout confirm ─────────────────────────────────────────────────────────
  const [logoutConfirm, setLogoutConfirm] = React.useState(false);

  // ── Auto-dismiss messages ──────────────────────────────────────────────────
  const showMsg = (setter: React.Dispatch<React.SetStateAction<{ text: string; ok: boolean } | null>>, text: string, ok: boolean) => {
    setter({ text, ok });
    setTimeout(() => setter(null), 3500);
  };

  // ── Profile handlers ───────────────────────────────────────────────────────
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setAvatarPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!profile.name.trim() || !profile.email.trim()) {
      showMsg(setProfileMsg, "Name and email are required.", false);
      return;
    }
    setProfileSaving(true);
    try {
      const token = localStorage.getItem("fin_token") || "";
      const payload: any = {
        name: profile.name.trim(),
        email: profile.email.trim(),
        phone: profile.phone.trim(),
        orgName: profile.orgName.trim(),
        designation: profile.designation.trim(),
      };
      if (avatarPreview && avatarPreview !== profile.avatarUrl) {
        payload.avatarUrl = avatarPreview;
      }

      // Try PATCH /api/users/{id} first, fallback to PUT /api/users/me
      let saved = false;
      for (const endpoint of [`/api/users/${adminId}`, "/api/users/me", "/api/auth/me"]) {
        try {
          const res = await fetch(endpoint, {
            method: endpoint.includes(`/${adminId}`) ? "PATCH" : "PUT",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(payload),
          });
          if (res.ok) { saved = true; break; }
          if (res.status === 404) continue;
          const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
          throw new Error(err.message || `HTTP ${res.status}`);
        } catch (e: any) {
          if (e.message?.includes("404")) continue;
          throw e;
        }
      }

      // Persist to localStorage regardless of backend success
      localStorage.setItem("fin_user_name", profile.name.trim());
      localStorage.setItem("fin_user_email", profile.email.trim());
      localStorage.setItem("fin_user_phone", profile.phone.trim());
      localStorage.setItem("fin_org_name", profile.orgName.trim());
      localStorage.setItem("fin_designation", profile.designation.trim());
      if (avatarPreview) localStorage.setItem("fin_avatar_url", avatarPreview);

      showMsg(setProfileMsg, saved ? "Profile saved successfully!" : "Saved locally (backend endpoint not found).", saved);
    } catch (e: any) {
      showMsg(setProfileMsg, e.message || "Failed to save profile.", false);
    } finally {
      setProfileSaving(false);
    }
  };

  // ── Notification prefs handler ─────────────────────────────────────────────
  const handleSaveNotifPrefs = async () => {
    setNotifSaving(true);
    try {
      const token = localStorage.getItem("fin_token") || "";
      try {
        const res = await fetch("/api/users/notification-preferences", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(notifPrefs),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        // Backend might not have this endpoint — save to localStorage only
      }
      localStorage.setItem("fin_notif_prefs", JSON.stringify(notifPrefs));
      showMsg(setNotifMsg, "Notification preferences saved!", true);
    } catch (e: any) {
      showMsg(setNotifMsg, e.message || "Failed to save preferences.", false);
    } finally {
      setNotifSaving(false);
    }
  };

  // ── Security handler ────────────────────────────────────────────────────────
  const handleChangePassword = async () => {
    if (!secForm.current.trim()) { showMsg(setSecMsg, "Current password is required.", false); return; }
    if (secForm.newPass.length < 8) { showMsg(setSecMsg, "New password must be at least 8 characters.", false); return; }
    if (secForm.newPass !== secForm.confirm) { showMsg(setSecMsg, "Passwords do not match.", false); return; }
    setSecSaving(true);
    try {
      const token = localStorage.getItem("fin_token") || "";
      let changed = false;
      for (const endpoint of ["/api/users/change-password", "/api/auth/change-password", `/api/users/${adminId}/password`]) {
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ currentPassword: secForm.current, newPassword: secForm.newPass }),
          });
          if (res.ok) { changed = true; break; }
          if (res.status === 404) continue;
          const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
          throw new Error(err.message || `HTTP ${res.status}`);
        } catch (e: any) {
          if (e.message?.includes("404")) continue;
          throw e;
        }
      }
      if (!changed) throw new Error("Password change endpoint not found. Contact backend developer.");
      setSecForm({ current: "", newPass: "", confirm: "" });
      showMsg(setSecMsg, "Password changed successfully!", true);
    } catch (e: any) {
      showMsg(setSecMsg, e.message || "Failed to change password.", false);
    } finally {
      setSecSaving(false);
    }
  };

  // ── Password strength ───────────────────────────────────────────────────────
  const getPasswordStrength = (p: string): { label: string; color: string; pct: number } => {
    if (!p) return { label: "", color: "#E2E8F0", pct: 0 };
    let score = 0;
    if (p.length >= 8) score++;
    if (p.length >= 12) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 1) return { label: "Weak", color: "#DC2626", pct: 20 };
    if (score <= 2) return { label: "Fair", color: "#D97706", pct: 45 };
    if (score <= 3) return { label: "Good", color: "#2563EB", pct: 70 };
    return { label: "Strong", color: "#16A34A", pct: 100 };
  };
  const strength = getPasswordStrength(secForm.newPass);

  // ── Shared styles ───────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 13px", border: "1.5px solid #E2E8F0",
    borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit", background: "#fff", color: "#0F172A", transition: "border-color 0.15s",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "#64748B",
    textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5,
  };
  const sectionBtnStyle = (active: boolean): React.CSSProperties => ({
    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "16px 20px", border: "none", background: active ? "#EFF6FF" : "#fff",
    cursor: "pointer", fontSize: 14, fontWeight: active ? 700 : 500,
    color: active ? "#2563EB" : "#0F172A", fontFamily: "inherit",
    borderBottom: "1px solid #F1F5F9", transition: "all 0.15s",
  });
  const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; sub?: string }> = ({ checked, onChange, label, sub }) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #F8FAFC" }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{sub}</div>}
      </div>
      <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, cursor: "pointer", flexShrink: 0 }}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
        <span style={{ position: "absolute", inset: 0, background: checked ? "#2563EB" : "#CBD5E1", borderRadius: 24, transition: "0.2s" }}>
          <span style={{ position: "absolute", left: checked ? 22 : 2, top: 2, width: 20, height: 20, background: "#fff", borderRadius: "50%", transition: "0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
        </span>
      </label>
    </div>
  );

  const TABS: { id: SettingsTab; label: string; icon: string; desc: string }[] = [
    { id: "profile", icon: "👤", label: "General Profile", desc: "Update your name, email, organisation details and avatar" },
    { id: "notifications", icon: "🔔", label: "Notifications", desc: "Control which alerts you receive via email and in-app" },
    { id: "security", icon: "🔒", label: "Security", desc: "Change your password and manage account security" },
    { id: "logout", icon: "🚪", label: "Logout", desc: "Sign out of your admin account" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>⚙️ Settings</h2>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>Manage your profile, notifications, and account security</p>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
        {TABS.map((tab, idx) => (
          <div key={tab.id}>
            {/* ── Row button ── */}
            <button
              onClick={() => setActiveTab(activeTab === tab.id ? null : tab.id)}
              style={sectionBtnStyle(activeTab === tab.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: activeTab === tab.id ? "#EFF6FF" : "#F8FAFC",
                  border: `1.5px solid ${activeTab === tab.id ? "#BFDBFE" : "#E2E8F0"}`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
                  transition: "all 0.15s",
                }}>
                  {tab.icon}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: activeTab === tab.id ? 700 : 600, color: activeTab === tab.id ? "#2563EB" : "#0F172A" }}>
                    {tab.label}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{tab.desc}</div>
                </div>
              </div>
              <span style={{
                fontSize: 18, color: activeTab === tab.id ? "#2563EB" : "#CBD5E1",
                transform: activeTab === tab.id ? "rotate(90deg)" : "none",
                transition: "transform 0.2s",
                display: "inline-block",
              }}>›</span>
            </button>

            {/* ══════════════ PROFILE PANEL ══════════════ */}
            {activeTab === "profile" && tab.id === "profile" && (
              <div style={{ padding: "24px 28px", borderBottom: "1px solid #F1F5F9", background: "#FAFBFF", animation: "fadeInDown 0.18s ease" }}>
                {/* Avatar */}
                <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 24, padding: "16px 18px", background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0" }}>
                  <div style={{ position: "relative" }}>
                    <div style={{
                      width: 72, height: 72, borderRadius: "50%", overflow: "hidden",
                      border: "3px solid #BFDBFE",
                      background: avatarPreview ? "transparent" : "linear-gradient(135deg,#1E3A5F,#2563EB)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 28, color: "#fff", fontWeight: 800, flexShrink: 0,
                    }}>
                      {avatarPreview
                        ? <img src={avatarPreview} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : (profile.name.charAt(0).toUpperCase() || "A")}
                    </div>
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      style={{
                        position: "absolute", bottom: -2, right: -2,
                        width: 24, height: 24, borderRadius: "50%", border: "2px solid #fff",
                        background: "#2563EB", cursor: "pointer", display: "flex",
                        alignItems: "center", justifyContent: "center", fontSize: 11,
                      }}
                      title="Change avatar"
                    >📷</button>
                  </div>
                  <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#0F172A" }}>{profile.name || "Admin"}</div>
                    <div style={{ fontSize: 12, color: "#64748B" }}>{profile.designation} · {profile.orgName}</div>
                    <button onClick={() => avatarInputRef.current?.click()} style={{ marginTop: 6, fontSize: 11, color: "#2563EB", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      Change photo
                    </button>
                  </div>
                </div>

                {/* Form grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
                  <div>
                    <label style={labelStyle}>Full Name *</label>
                    <input value={profile.name} onChange={e => setProfile({ ...profile, name: e.target.value })} placeholder="Admin name" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Email Address *</label>
                    <input value={profile.email} onChange={e => setProfile({ ...profile, email: e.target.value })} placeholder="admin@example.com" type="email" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone Number</label>
                    <input value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} placeholder="+91 98765 43210" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Designation</label>
                    <input value={profile.designation} onChange={e => setProfile({ ...profile, designation: e.target.value })} placeholder="Admin, Manager…" style={inputStyle} />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Organisation Name</label>
                    <input value={profile.orgName} onChange={e => setProfile({ ...profile, orgName: e.target.value })} placeholder="Your company name" style={inputStyle} />
                  </div>
                </div>

                {profileMsg && (
                  <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 9, background: profileMsg.ok ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${profileMsg.ok ? "#86EFAC" : "#FECACA"}`, color: profileMsg.ok ? "#166534" : "#B91C1C", fontSize: 13, fontWeight: 600 }}>
                    {profileMsg.ok ? "✅" : "⚠️"} {profileMsg.text}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                  <button onClick={() => setActiveTab(null)} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSaveProfile} disabled={profileSaving} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: profileSaving ? "#93C5FD" : "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {profileSaving ? "Saving…" : "Save Profile"}
                  </button>
                </div>
              </div>
            )}

            {/* ══════════════ NOTIFICATIONS PANEL ══════════════ */}
            {activeTab === "notifications" && tab.id === "notifications" && (
              <div style={{ padding: "24px 28px", borderBottom: "1px solid #F1F5F9", background: "#FAFBFF", animation: "fadeInDown 0.18s ease" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  {/* Email Notifications */}
                  <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📧</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>Email Notifications</div>
                    </div>
                    <Toggle checked={notifPrefs.emailOnNewTicket} onChange={v => setNotifPrefs({ ...notifPrefs, emailOnNewTicket: v })} label="New ticket submitted" sub="Get emailed when a user raises a ticket" />
                    <Toggle checked={notifPrefs.emailOnStatusChange} onChange={v => setNotifPrefs({ ...notifPrefs, emailOnStatusChange: v })} label="Ticket status changes" sub="Notify when a ticket moves to RESOLVED or CLOSED" />
                    <Toggle checked={notifPrefs.emailOnEscalation} onChange={v => setNotifPrefs({ ...notifPrefs, emailOnEscalation: v })} label="Escalations" sub="Immediate alert on ticket escalation" />
                    <Toggle checked={notifPrefs.dailySummaryEmail} onChange={v => setNotifPrefs({ ...notifPrefs, dailySummaryEmail: v })} label="Daily summary email" sub="Digest of open tickets every morning" />
                    <Toggle checked={notifPrefs.weeklySummaryEmail} onChange={v => setNotifPrefs({ ...notifPrefs, weeklySummaryEmail: v })} label="Weekly report email" sub="Full analytics sent every Monday" />
                  </div>

                  {/* In-App Notifications */}
                  <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "16px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: "#F5F3FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🔔</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>In-App Notifications</div>
                    </div>
                    <Toggle checked={notifPrefs.inAppNewTicket} onChange={v => setNotifPrefs({ ...notifPrefs, inAppNewTicket: v })} label="New tickets bell alert" sub="Shows in the top notification bell" />
                    <Toggle checked={notifPrefs.inAppSlaBreaches} onChange={v => setNotifPrefs({ ...notifPrefs, inAppSlaBreaches: v })} label="SLA breach warnings" sub="Red alert when a ticket crosses SLA window" />
                    <Toggle checked={notifPrefs.inAppAssignments} onChange={v => setNotifPrefs({ ...notifPrefs, inAppAssignments: v })} label="Consultant assignments" sub="Confirmation toast on successful assign" />
                  </div>
                </div>

                {notifMsg && (
                  <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 9, background: notifMsg.ok ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${notifMsg.ok ? "#86EFAC" : "#FECACA"}`, color: notifMsg.ok ? "#166534" : "#B91C1C", fontSize: 13, fontWeight: 600 }}>
                    {notifMsg.ok ? "✅" : "⚠️"} {notifMsg.text}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
                  <button onClick={() => setActiveTab(null)} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                  <button onClick={handleSaveNotifPrefs} disabled={notifSaving} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: notifSaving ? "#A78BFA" : "#7C3AED", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    {notifSaving ? "Saving…" : "Save Preferences"}
                  </button>
                </div>
              </div>
            )}

            {/* ══════════════ SECURITY PANEL ══════════════ */}
            {activeTab === "security" && tab.id === "security" && (
              <div style={{ padding: "24px 28px", borderBottom: "1px solid #F1F5F9", background: "#FAFBFF", animation: "fadeInDown 0.18s ease" }}>
                <div style={{ maxWidth: 480 }}>
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#92400E", fontWeight: 600 }}>
                    🔐 For your security, please enter your current password before setting a new one.
                  </div>

                  {/* Current Password */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Current Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        value={secForm.current}
                        onChange={e => setSecForm({ ...secForm, current: e.target.value })}
                        type={showPasswords.current ? "text" : "password"}
                        placeholder="Your current password"
                        style={{ ...inputStyle, paddingRight: 42 }}
                      />
                      <button onClick={() => setShowPasswords(s => ({ ...s, current: !s.current }))} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#94A3B8" }}>
                        {showPasswords.current ? "🙈" : "👁"}
                      </button>
                    </div>
                  </div>

                  {/* New Password */}
                  <div style={{ marginBottom: 8 }}>
                    <label style={labelStyle}>New Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        value={secForm.newPass}
                        onChange={e => setSecForm({ ...secForm, newPass: e.target.value })}
                        type={showPasswords.newPass ? "text" : "password"}
                        placeholder="Min. 8 characters"
                        style={{ ...inputStyle, paddingRight: 42 }}
                      />
                      <button onClick={() => setShowPasswords(s => ({ ...s, newPass: !s.newPass }))} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#94A3B8" }}>
                        {showPasswords.newPass ? "🙈" : "👁"}
                      </button>
                    </div>
                    {/* Strength bar */}
                    {secForm.newPass && (
                      <div style={{ marginTop: 7 }}>
                        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                          {[20, 45, 70, 100].map((threshold, i) => (
                            <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: strength.pct >= threshold ? strength.color : "#F1F5F9", transition: "background 0.3s" }} />
                          ))}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: strength.color }}>{strength.label} password</div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={labelStyle}>Confirm New Password</label>
                    <div style={{ position: "relative" }}>
                      <input
                        value={secForm.confirm}
                        onChange={e => setSecForm({ ...secForm, confirm: e.target.value })}
                        type={showPasswords.confirm ? "text" : "password"}
                        placeholder="Re-enter new password"
                        style={{ ...inputStyle, paddingRight: 42, borderColor: secForm.confirm && secForm.confirm !== secForm.newPass ? "#FCA5A5" : "#E2E8F0" }}
                      />
                      <button onClick={() => setShowPasswords(s => ({ ...s, confirm: !s.confirm }))} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#94A3B8" }}>
                        {showPasswords.confirm ? "🙈" : "👁"}
                      </button>
                    </div>
                    {secForm.confirm && secForm.confirm !== secForm.newPass && (
                      <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 600, marginTop: 4 }}>⚠ Passwords do not match</div>
                    )}
                  </div>

                  {/* Password rules */}
                  <div style={{ background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 9, padding: "10px 14px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", marginBottom: 6 }}>PASSWORD REQUIREMENTS</div>
                    {[
                      { rule: "At least 8 characters", met: secForm.newPass.length >= 8 },
                      { rule: "At least one uppercase letter", met: /[A-Z]/.test(secForm.newPass) },
                      { rule: "At least one number", met: /[0-9]/.test(secForm.newPass) },
                      { rule: "At least one special character", met: /[^A-Za-z0-9]/.test(secForm.newPass) },
                    ].map(r => (
                      <div key={r.rule} style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 11, color: r.met ? "#16A34A" : "#94A3B8", marginBottom: 3 }}>
                        <span>{r.met ? "✅" : "○"}</span> {r.rule}
                      </div>
                    ))}
                  </div>

                  {secMsg && (
                    <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: secMsg.ok ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${secMsg.ok ? "#86EFAC" : "#FECACA"}`, color: secMsg.ok ? "#166534" : "#B91C1C", fontSize: 13, fontWeight: 600 }}>
                      {secMsg.ok ? "✅" : "⚠️"} {secMsg.text}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => { setSecForm({ current: "", newPass: "", confirm: "" }); setActiveTab(null); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                    <button
                      onClick={handleChangePassword}
                      disabled={secSaving || !secForm.current || !secForm.newPass || secForm.newPass !== secForm.confirm}
                      style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: (secSaving || !secForm.current || !secForm.newPass || secForm.newPass !== secForm.confirm) ? "#E2E8F0" : "#0F172A", color: (secSaving || !secForm.current || !secForm.newPass || secForm.newPass !== secForm.confirm) ? "#94A3B8" : "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      {secSaving ? "Updating…" : "Update Password"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════ LOGOUT PANEL ══════════════ */}
            {activeTab === "logout" && tab.id === "logout" && (
              <div style={{ padding: "24px 28px", background: "#FAFBFF", animation: "fadeInDown 0.18s ease" }}>
                {!logoutConfirm ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Sign out of Admin Panel</div>
                      <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>
                        You'll be redirected to the login page. Any unsaved changes in other sections will be lost.
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => setActiveTab(null)} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Cancel
                      </button>
                      <button onClick={() => setLogoutConfirm(true)} // Remove the first `border: "none"`, keep only:
                        style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 13, fontWeight: 700, cursor: "pointer" } as any}>
                        🚪 Logout
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "10px 0" }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", marginBottom: 6 }}>Are you sure you want to logout?</div>
                    <div style={{ fontSize: 13, color: "#64748B", marginBottom: 22 }}>This will clear your session and redirect you to the login page.</div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      <button onClick={() => { setLogoutConfirm(false); setActiveTab(null); }} style={{ padding: "11px 24px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        Stay Logged In
                      </button>
                      <button onClick={onLogout} style={{ padding: "11px 28px", borderRadius: 10, border: "none", background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                        Yes, Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <style>{`@keyframes fadeInDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORT CONFIG PANEL
// ─────────────────────────────────────────────────────────────────────────────
const sc_styles: Record<string, React.CSSProperties> = {
  panelWrap: { padding: "0 0 40px" },
  panelHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 },
  panelTitle: { margin: 0, fontSize: 20, fontWeight: 800, color: "#0F172A" },
  panelSub: { margin: "4px 0 0", fontSize: 13, color: "#64748B" },
  filterPill: { padding: "5px 14px", borderRadius: 20, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" },
  filterPillActive: { borderColor: "#2563EB", background: "#2563EB", color: "#fff" },
  primaryBtn: { padding: "9px 18px", borderRadius: 10, border: "none", background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  ghostBtn: { padding: "9px 16px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "4px 6px", borderRadius: 6 },
  input: { width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit", background: "#fff", color: "#0F172A" },
  select: { width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer" },
  label: { fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 },
  badge: { fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 700 },
  ticketRow: { display: "flex", alignItems: "center", gap: 14, padding: "13px 16px", border: "1px solid #F1F5F9", borderRadius: 12, cursor: "pointer", transition: "all 0.15s" },
  agentCard: { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", border: "1.5px solid #E2E8F0", borderRadius: 12, background: "#fff", transition: "all 0.15s" },
  cannedCard: { background: "#fff", border: "1px solid #F1F5F9", borderRadius: 12, padding: "14px 16px" },
  editorCard: { background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 14, padding: "18px 20px" },
  chartCard: { background: "#fff", border: "1px solid #F1F5F9", borderRadius: 14, padding: "16px 20px" },
  chartTitle: { fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 },
  emptyState: { padding: "40px 20px", textAlign: "center", color: "#94A3B8", fontSize: 13, background: "#F8FAFC", borderRadius: 12 },
  sectionLabel: { fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 },
};

const CFG_SLA_HOURS: Record<string, number> = { LOW: 72, MEDIUM: 24, HIGH: 8, URGENT: 4, CRITICAL: 2 };
const CFG_PRIORITY_CFG: Record<string, { color: string; bg: string }> = {
  LOW: { color: "#16A34A", bg: "#F0FDF4" },
  MEDIUM: { color: "#D97706", bg: "#FFFBEB" },
  HIGH: { color: "#EA580C", bg: "#FFF7ED" },
  URGENT: { color: "#DC2626", bg: "#FEF2F2" },
  CRITICAL: { color: "#7C3AED", bg: "#F5F3FF" },
};

const cfgHoursAgo = (iso: string | null | undefined) => iso ? Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000) : null;
const cfgCalcResponse = (t: Ticket) => t.firstResponseAt && t.createdAt ? Math.round((new Date(t.firstResponseAt).getTime() - new Date(t.createdAt).getTime()) / 60_000) : null;
const cfgCalcResolution = (t: Ticket) => t.resolvedAt && t.createdAt ? Math.round((new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()) / 3_600_000 * 10) / 10 : null;
const cfgIsSlaBreached = (t: Ticket) => {
  if (["RESOLVED", "CLOSED"].includes(t.status)) return false;
  const h = cfgHoursAgo(t.createdAt);
  return h !== null && h > (CFG_SLA_HOURS[t.priority] || 24);
};

const MiniToast: React.FC<{ msg: string; ok?: boolean }> = ({ msg, ok = true }) => (
  <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: ok ? "#0F172A" : "#7F1D1D", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 9999, whiteSpace: "nowrap" }}>
    {ok ? "✓" : "✕"} {msg}
  </div>
);

const MiniBar: React.FC<{ val: number; max: number; color: string }> = ({ val, max, color }) => {
  const pct = Math.min((val / Math.max(max, 1)) * 100, 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
      <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
      <span style={{ fontSize: 11, fontFamily: "monospace", color: "#64748B", minWidth: 24, textAlign: "right" }}>{val}</span>
    </div>
  );
};

interface AgentInfo { id: number; name: string; load: number; avatar: string; }

const AssignmentPanel: React.FC<{ tickets: Ticket[]; agents: AgentInfo[]; onAssign: (ticketId: number, agent: AgentInfo) => void }> = ({ tickets, agents, onAssign }) => {
  const [selTicket, setSelTicket] = useState<Ticket | null>(null);
  const [filter, setFilter] = useState("unassigned");
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const filtered = tickets.filter(t => {
    if (filter === "unassigned") return !t.agentName && !["RESOLVED", "CLOSED"].includes(t.status);
    if (filter === "all") return !["RESOLVED", "CLOSED"].includes(t.status);
    if (filter === "escalated") return t.status === "ESCALATED" || !!t.isEscalated;
    return true;
  });

  return (
    <div style={sc_styles.panelWrap}>
      <div style={sc_styles.panelHeader}>
        <div>
          <h3 style={sc_styles.panelTitle}>Manual Assignment</h3>
          <p style={sc_styles.panelSub}>Select a ticket then click an agent to assign instantly</p>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["unassigned", "all", "escalated"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ ...sc_styles.filterPill, ...(filter === f ? sc_styles.filterPillActive : {}) }}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && <div style={sc_styles.emptyState}>✅ All tickets assigned for this filter.</div>}
          {filtered.map(t => {
            const tsc = TICKET_STATUS_CFG[t.status] || TICKET_STATUS_CFG.NEW;
            const tpc = TICKET_PRIORITY_CFG[t.priority] || TICKET_PRIORITY_CFG.MEDIUM;
            const breached = cfgIsSlaBreached(t);
            const selected = selTicket?.id === t.id;
            return (
              <div key={t.id} onClick={() => setSelTicket(selected ? null : t)}
                style={{ ...sc_styles.ticketRow, borderLeft: `4px solid ${breached ? "#DC2626" : tsc.color}`, background: selected ? "#EFF6FF" : breached ? "#FFF8F8" : "#fff", outline: selected ? "2px solid #2563EB" : "none" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#94A3B8" }}>#{t.id}</span>
                    <span style={{ ...sc_styles.badge, background: tpc.bg, color: tpc.color }}>{t.priority}</span>
                    <span style={{ ...sc_styles.badge, background: tsc.bg, color: tsc.color }}>{tsc.label}</span>
                    {breached && <span style={{ ...sc_styles.badge, background: "#FEF2F2", color: "#DC2626" }}>⏰ SLA</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", marginBottom: 2 }}>{t.title || t.category}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>👤 {t.userName || `User #${t.userId}`} · {t.category}</div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {t.agentName
                    ? <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600, background: "#F0FDF4", padding: "3px 8px", borderRadius: 6 }}>✓ {t.agentName}</span>
                    : <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 600 }}>Unassigned</span>}
                  {selected && <div style={{ fontSize: 10, color: "#2563EB", fontWeight: 700, marginTop: 4 }}>← Click agent</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Agents</div>
          {agents.map(a => (
            <div key={a.id} onClick={() => {
              if (!selTicket) return;
              onAssign(selTicket.id, a);
              showToast(`#${selTicket.id} assigned to ${a.name}`);
              setSelTicket(null);
            }} style={{ ...sc_styles.agentCard, cursor: selTicket ? "pointer" : "default", opacity: selTicket ? 1 : 0.7 }}>
              <img src={a.avatar} alt={a.name} style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{a.name}</div>
                <div style={{ fontSize: 11, color: "#64748B" }}>{a.load} active tickets</div>
              </div>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: a.load <= 3 ? "#22C55E" : a.load <= 5 ? "#F59E0B" : "#EF4444", flexShrink: 0 }} />
            </div>
          ))}
          {selTicket && <div style={{ fontSize: 11, color: "#2563EB", textAlign: "center", fontWeight: 600, padding: "8px 0" }}>Click agent to assign Ticket #{selTicket.id}</div>}
        </div>
      </div>
      {toast && <MiniToast msg={toast} />}
    </div>
  );
};

interface CannedResponse { id: number; title: string; category: string; body: string; }

// ─────────────────────────────────────────────────────────────────────────────
// CANNED RESPONSES  ← THE 3 FIXED API CALLS ARE HERE
// ─────────────────────────────────────────────────────────────────────────────
const CannedResponses: React.FC<{}> = () => {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState<Omit<CannedResponse, "id">>({ title: "", category: "General", body: "" });
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  // ── FIX 1: Load canned responses from the correct backend path ──────────────
  useEffect(() => {
    setLoading(true);
    apiFetch("/admin/config/canned-responses")
      .then((arr: any) => {
        const list = Array.isArray(arr) ? arr : (arr?.content || arr?.data || []);
        setResponses(list.map((r: any) => ({ id: r.id, title: r.title, category: r.category || "General", body: r.content || r.body || "", shortcut: r.shortcut || "" })));
      })
      .catch((e: any) => {
        showToast(e?.message || "Failed to load canned responses");
        setResponses([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = responses.filter(r => r.title.toLowerCase().includes(search.toLowerCase()) || r.body.toLowerCase().includes(search.toLowerCase()));

  // ── FIX 2: Save (create / update) via the correct backend path ─────────────
  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    try {
      if (editing !== null) {
        await apiFetch("/admin/config/canned-responses/" + editing, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: form.title, content: form.body, category: form.category }),
        }).catch(() => null);
        setResponses(p => p.map(r => r.id === editing ? { ...r, ...form } : r));
        setEditing(null);
        showToast("Response updated");
      } else {
        const created = await apiFetch("/admin/config/canned-responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: form.title, content: form.body, category: form.category }),
        });
        setResponses(p => [...p, { ...form, id: created?.id ?? Date.now() }]);
        showToast("Response created");
      }
    } catch (e: any) { showToast(e?.message || "Save failed"); }
  };

  // ── FIX 3: Delete via the correct backend path ─────────────────────────────
  const deleteResponse = async (id: number) => {
    try {
      await apiFetch("/admin/config/canned-responses/" + id, { method: "DELETE" }).catch(() => null);
      setResponses(p => p.filter(x => x.id !== id));
      showToast("Deleted");
    } catch { showToast("Delete failed"); }
  };

  return (
    <div style={sc_styles.panelWrap}>
      <div style={sc_styles.panelHeader}>
        <div>
          <h3 style={sc_styles.panelTitle}>Canned Responses</h3>
          <p style={sc_styles.panelSub}>Predefined replies · use shortcuts while typing in ticket replies</p>
        </div>
        <button onClick={() => { setEditing(null); setForm({ title: "", category: "General", body: "" }); }} style={sc_styles.primaryBtn}>+ New Response</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
        <div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search responses…" style={sc_styles.input} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {loading ? (
              <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 32 }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 32 }}>No canned responses found</div>
            ) : filtered.map(r => (
              <div key={r.id} style={sc_styles.cannedCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>{r.title}</span>
                    <span style={{ marginLeft: 8, fontSize: 11, background: "#EFF6FF", color: "#2563EB", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{r.category}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => deleteResponse(r.id)} style={{ ...sc_styles.iconBtn, color: "#DC2626" }}>🗑</button>
                  </div>
                </div>
                <p style={{ fontSize: 12, color: "#64748B", margin: 0, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box" as any, WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{r.body}</p>
              </div>
            ))}
          </div>
        </div>
        <div style={sc_styles.editorCard}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>{editing !== null ? "Edit Response" : "New Response"}</div>
          <label style={sc_styles.label}>Title</label>
          <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Billing Refund" style={sc_styles.input} />
          <label style={{ ...sc_styles.label, marginTop: 10 }}>Category</label>
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={sc_styles.select}>
            {["General", "Billing", "Technical", "Escalation", "Advisory", "Compliance"].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <label style={{ ...sc_styles.label, marginTop: 10 }}>Body</label>
          <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={6} placeholder="Use #{ticket_id}, #{user_name}" style={{ ...sc_styles.input, resize: "vertical" as any }} />
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={save} style={{ ...sc_styles.primaryBtn, flex: 1 }}>{editing !== null ? "Save Changes" : "Create"}</button>
          </div>
        </div>
      </div>
      {toast && <MiniToast msg={toast} />}
    </div>
  );
};

interface TicketCategory { id: number; name: string; color: string; icon: string; slaOverride: number | null; defaultPriority: string; }

const CategoriesConfig: React.FC<{}> = () => {
  const [cats, setCats] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCat, setNewCat] = useState({ name: "", color: "#2563EB", icon: "📌", slaOverride: "", defaultPriority: "MEDIUM" });
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };
  const PRIOS = ["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"];

  useEffect(() => {
    setLoading(true);
    getTicketCategories()
      .then(arr => setCats(arr.map((c: any) => ({ id: c.id, name: c.name, color: c.color || "#2563EB", icon: c.icon || "📌", slaOverride: c.slaOverride ?? null, defaultPriority: c.defaultPriority || "MEDIUM" }))))
      .catch(() => showToast("Failed to load categories"))
      .finally(() => setLoading(false));
  }, []);

  const updateCat = (id: number, changes: Partial<TicketCategory>) => setCats(p => p.map(x => x.id === id ? { ...x, ...changes } : x));
  const deleteCat = async (id: number) => {
    try { await toggleTicketCategory(id); setCats(p => p.filter(x => x.id !== id)); showToast("Category toggled/removed"); }
    catch { showToast("Toggle failed"); }
  };
  const addCat = async () => {
    if (!newCat.name.trim()) return;
    try {
      const created = await createTicketCategory({ name: newCat.name, description: newCat.defaultPriority });
      setCats(p => [...p, { id: created.id ?? Date.now(), name: newCat.name, color: newCat.color, icon: newCat.icon, slaOverride: newCat.slaOverride ? Number(newCat.slaOverride) : null, defaultPriority: newCat.defaultPriority }]);
      setNewCat({ name: "", color: "#2563EB", icon: "📌", slaOverride: "", defaultPriority: "MEDIUM" });
      showToast("Category added");
    } catch (e: any) { showToast(e?.message || "Failed to add category"); }
  };

  return (
    <div style={sc_styles.panelWrap}>
      <div style={sc_styles.panelHeader}>
        <div><h3 style={sc_styles.panelTitle}>Categories & Priorities</h3><p style={sc_styles.panelSub}>Configure categories, default priorities, and per-category SLA overrides</p></div>
      </div>
      <div style={{ marginBottom: 28 }}>
        <div style={sc_styles.sectionLabel}>Global SLA Targets (hours)</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
          {PRIOS.map(p => {
            const pc = CFG_PRIORITY_CFG[p];
            return (
              <div key={p} style={{ background: pc.bg, border: `1px solid ${pc.color}33`, borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: pc.color }}>{p}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                  <input type="number" defaultValue={CFG_SLA_HOURS[p]} min={1} max={168} style={{ width: 52, padding: "4px 6px", border: `1px solid ${pc.color}44`, borderRadius: 6, fontSize: 12, fontFamily: "monospace", background: "#fff", color: "#0F172A", outline: "none" }} />
                  <span style={{ fontSize: 11, color: pc.color, fontWeight: 600 }}>h</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={sc_styles.sectionLabel}>Ticket Categories</div>
      <div style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "40px 1fr 80px 130px 120px 80px", padding: "10px 16px", background: "#F8FAFC", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <div>Icon</div><div>Category</div><div>Color</div><div>Default Priority</div><div>SLA Override</div><div></div>
        </div>
        {loading ? <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 24 }}>Loading…</div>
          : cats.map((c, i) => (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr 80px 130px 120px 80px", padding: "12px 16px", borderTop: i > 0 ? "1px solid #F8FAFC" : "none", alignItems: "center" }}>
              <span style={{ fontSize: 18 }}>{c.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{c.name}</span>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.color, border: "2px solid #E2E8F0" }} />
              <select value={c.defaultPriority} onChange={e => updateCat(c.id, { defaultPriority: e.target.value })} style={{ ...sc_styles.select, fontSize: 11, padding: "4px 8px" }}>
                {PRIOS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input type="number" value={c.slaOverride ?? ""} onChange={e => updateCat(c.id, { slaOverride: e.target.value ? Number(e.target.value) : null })} placeholder="Global" style={{ ...sc_styles.input, fontSize: 11, padding: "4px 8px", width: 80, fontFamily: "monospace" }} />
              <button onClick={() => deleteCat(c.id)} style={{ ...sc_styles.iconBtn, color: "#DC2626" }}>🗑</button>
            </div>
          ))}
      </div>
      <div style={{ ...sc_styles.editorCard, display: "grid", gridTemplateColumns: "60px 1fr 80px 130px 100px auto", gap: 10, alignItems: "flex-end" }}>
        <div><label style={sc_styles.label}>Icon</label><input value={newCat.icon} onChange={e => setNewCat({ ...newCat, icon: e.target.value })} style={{ ...sc_styles.input, textAlign: "center", fontSize: 18 }} /></div>
        <div><label style={sc_styles.label}>Name</label><input value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} placeholder="Category name" style={sc_styles.input} /></div>
        <div><label style={sc_styles.label}>Color</label><input type="color" value={newCat.color} onChange={e => setNewCat({ ...newCat, color: e.target.value })} style={{ width: "100%", height: 36, border: "1.5px solid #E2E8F0", borderRadius: 8, cursor: "pointer", padding: 2 }} /></div>
        <div><label style={sc_styles.label}>Priority</label>
          <select value={newCat.defaultPriority} onChange={e => setNewCat({ ...newCat, defaultPriority: e.target.value })} style={sc_styles.select}>
            {PRIOS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><label style={sc_styles.label}>SLA (h)</label><input type="number" value={newCat.slaOverride} onChange={e => setNewCat({ ...newCat, slaOverride: e.target.value })} placeholder="—" style={{ ...sc_styles.input, fontFamily: "monospace" }} /></div>
        <button onClick={addCat} style={{ ...sc_styles.primaryBtn, alignSelf: "flex-end" }}>+ Add</button>
      </div>
      {toast && <MiniToast msg={toast} />}
    </div>
  );
};

const ReportsAnalytics: React.FC<{ tickets: Ticket[] }> = ({ tickets }) => {
  const [range, setRange] = useState("7d");
  const total = tickets.length;
  const resolved = tickets.filter(t => t.status === "RESOLVED").length;
  const breached = tickets.filter(cfgIsSlaBreached).length;
  const escalated = tickets.filter(t => t.status === "ESCALATED" || t.isEscalated).length;
  const resTimes = tickets.map(cfgCalcResolution).filter((x): x is number => x !== null);
  const respTimes = tickets.map(cfgCalcResponse).filter((x): x is number => x !== null);
  const avgRes = resTimes.length ? (resTimes.reduce((a, b) => a + b, 0) / resTimes.length).toFixed(1) : "—";
  const avgResp = respTimes.length ? Math.round(respTimes.reduce((a, b) => a + b, 0) / respTimes.length) : "—";
  const catCounts: Record<string, number> = {};
  tickets.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1; });
  const catMax = Math.max(...Object.values(catCounts), 1);
  const priCounts: Record<string, number> = {};
  tickets.forEach(t => { priCounts[t.priority] = (priCounts[t.priority] || 0) + 1; });
  const agentStats: Record<string, { assigned: number; resolved: number; totalRes: number; resCount: number }> = {};
  tickets.forEach(t => {
    const name = t.agentName || t.consultantName;
    if (name) {
      if (!agentStats[name]) agentStats[name] = { assigned: 0, resolved: 0, totalRes: 0, resCount: 0 };
      agentStats[name].assigned++;
      if (t.status === "RESOLVED") { agentStats[name].resolved++; const rt = cfgCalcResolution(t); if (rt) { agentStats[name].totalRes += rt; agentStats[name].resCount++; } }
    }
  });
  const kpis = [
    { label: "Total Tickets", value: total, color: "#2563EB", icon: "🎫" },
    { label: "Resolved", value: resolved, color: "#16A34A", icon: "✅", sub: `${total ? Math.round(resolved / total * 100) : 0}% rate` },
    { label: "SLA Breaches", value: breached, color: "#DC2626", icon: "🚨" },
    { label: "Escalated", value: escalated, color: "#D97706", icon: "⬆️" },
    { label: "Avg First Response", value: avgResp === "—" ? "—" : `${avgResp}m`, color: "#7C3AED", icon: "⚡" },
    { label: "Avg Resolution", value: avgRes === "—" ? "—" : `${avgRes}h`, color: "#059669", icon: "⏱️" },
  ];
  return (
    <div style={sc_styles.panelWrap}>
      <div style={sc_styles.panelHeader}>
        <div><h3 style={sc_styles.panelTitle}>Reports & Analytics</h3><p style={sc_styles.panelSub}>Response time, resolution time, SLA compliance, agent performance</p></div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["7d", "30d", "90d"] as const).map(r => (<button key={r} onClick={() => setRange(r)} style={{ ...sc_styles.filterPill, ...(range === r ? sc_styles.filterPillActive : {}) }}>{r}</button>))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 12, marginBottom: 24 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 14, padding: "14px 16px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>{k.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, fontFamily: "monospace" }}>{k.value}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>{k.label}</div>
            {(k as any).sub && <div style={{ fontSize: 10, color: k.color, marginTop: 2 }}>{(k as any).sub}</div>}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <div style={sc_styles.chartCard}>
          <div style={sc_styles.chartTitle}>By Category</div>
          {Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 600, color: "#374151" }}>{cat}</div>
              <MiniBar val={count} max={catMax} color="#2563EB" />
            </div>
          ))}
          {Object.keys(catCounts).length === 0 && <div style={{ color: "#94A3B8", fontSize: 12 }}>No data yet.</div>}
        </div>
        <div style={sc_styles.chartCard}>
          <div style={sc_styles.chartTitle}>By Priority</div>
          {Object.entries(priCounts).map(([p, count]) => {
            const pc = CFG_PRIORITY_CFG[p] || CFG_PRIORITY_CFG.MEDIUM;
            return (<div key={p} style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: pc.color, marginBottom: 4 }}>{p}</div><MiniBar val={count} max={total} color={pc.color} /></div>);
          })}
        </div>
        <div style={sc_styles.chartCard}>
          <div style={sc_styles.chartTitle}>Agent Performance</div>
          {Object.keys(agentStats).length === 0 && <div style={{ color: "#94A3B8", fontSize: 12 }}>No assigned tickets yet.</div>}
          {Object.entries(agentStats).map(([agent, s]) => (
            <div key={agent} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #F1F5F9" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{agent}</div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#64748B" }}><span>📥 {s.assigned}</span><span>✅ {s.resolved}</span></div>
              {s.resCount > 0 && <div style={{ fontSize: 11, color: "#059669", marginTop: 2 }}>⏱ Avg {(s.totalRes / s.resCount).toFixed(1)}h</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAY_TO_JAVA: Record<string, string> = { Monday: "MONDAY", Tuesday: "TUESDAY", Wednesday: "WEDNESDAY", Thursday: "THURSDAY", Friday: "FRIDAY", Saturday: "SATURDAY", Sunday: "SUNDAY" };
interface BusinessHour { day: string; enabled: boolean; start: string; end: string; }
interface Holiday { id: number; name: string; date: string; }

const BusinessSettings: React.FC<{}> = () => {
  const DEFAULT_HOURS: BusinessHour[] = DAYS.map((d, i) => ({ day: d, enabled: i < 5, start: "09:00", end: "18:00" }));
  const [hours, setHours] = useState<BusinessHour[]>(DEFAULT_HOURS);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [saving, setSaving] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ name: "", date: "" });
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };
  const [loadingInit, setLoadingInit] = useState(true);
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoMessage, setAutoMessage] = useState("Thank you for reaching out! We will review your ticket shortly.");

  useEffect(() => {
    (async () => {
      setLoadingInit(true);
      try { const bhData = await getBusinessHours(); if (bhData.length > 0) { setHours(DAYS.map(d => { const found = bhData.find((b: any) => b.dayOfWeek === DAY_TO_JAVA[d]); return found ? { day: d, enabled: found.isWorkingDay, start: parseLocalTime(found.startTime) || "09:00", end: parseLocalTime(found.endTime) || "18:00" } : DEFAULT_HOURS.find(x => x.day === d)!; })); } } catch { }
      try { const hData = await getHolidays(); setHolidays(hData.map((h: any) => ({ id: h.id, name: h.name, date: h.holidayDate }))); } catch { }
      try { const arData = await getAutoResponder(); setAutoEnabled(arData.enabled); if (arData.message) setAutoMessage(arData.message); } catch { }
      setLoadingInit(false);
    })();
  }, []);

  const saveAll = async () => {
    setSaving(true); let saved = 0, failed = 0;
    try { await updateBusinessHours(hours.map(h => ({ dayOfWeek: DAY_TO_JAVA[h.day], openTime: h.start + ":00", closeTime: h.end + ":00", isOpen: h.enabled }))); saved++; } catch { failed++; }
    try { await updateAutoResponder({ enabled: autoEnabled, message: autoMessage }); saved++; } catch { failed++; }
    setSaving(false);
    showToast(failed === 0 ? "Settings saved" : `${saved} saved, ${failed} failed`);
  };

  const addHoliday = async () => {
    if (!newHoliday.name || !newHoliday.date) return;
    try { const created = await apiAddHoliday({ name: newHoliday.name, holidayDate: newHoliday.date }); setHolidays(p => [...p, { id: created.id, name: created.name, date: created.holidayDate }]); setNewHoliday({ name: "", date: "" }); showToast("Holiday added"); }
    catch { showToast("Failed to add holiday"); }
  };

  const deleteHoliday = async (id: number) => {
    try { await apiDeleteHoliday(id); setHolidays(p => p.filter(x => x.id !== id)); showToast("Holiday removed"); }
    catch { showToast("Failed to remove holiday"); }
  };

  const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
    <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, cursor: "pointer", flexShrink: 0 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: "absolute", inset: 0, background: checked ? "#2563EB" : "#CBD5E1", borderRadius: 24, transition: "0.2s" }}>
        <span style={{ position: "absolute", left: checked ? 22 : 2, top: 2, width: 20, height: 20, background: "#fff", borderRadius: "50%", transition: "0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
      </span>
    </label>
  );

  if (loadingInit) return (<div style={{ textAlign: "center", padding: 48, color: "#94A3B8" }}><div style={{ width: 28, height: 28, border: "3px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />Loading settings...</div>);

  return (
    <div style={sc_styles.panelWrap}>
      <div style={sc_styles.panelHeader}>
        <div><h3 style={sc_styles.panelTitle}>Business Hours & Auto-Responders</h3><p style={sc_styles.panelSub}>Define when your team is available and set automated replies for off-hours</p></div>
        <button onClick={saveAll} disabled={saving} style={{ ...sc_styles.primaryBtn, opacity: saving ? 0.7 : 1 }}>{saving ? "Saving..." : "Save All Settings"}</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
        <div>
          <div style={sc_styles.sectionLabel}>Weekly Schedule</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hours.map((h, i) => (
              <div key={h.day} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: "#fff", border: "1px solid " + (h.enabled ? "#E2E8F0" : "#F1F5F9"), borderRadius: 12, opacity: h.enabled ? 1 : 0.6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: h.enabled ? "#0F172A" : "#94A3B8", width: 90 }}>{h.day}</span>
                <Toggle checked={h.enabled} onChange={v => setHours(p => p.map((x, j) => j === i ? { ...x, enabled: v } : x))} />
                {h.enabled ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                    <input type="time" value={h.start} onChange={e => setHours(p => p.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} style={{ ...sc_styles.input, padding: "5px 10px", fontSize: 13, width: 110, fontFamily: "monospace" }} />
                    <span style={{ color: "#94A3B8", fontSize: 12 }}>to</span>
                    <input type="time" value={h.end} onChange={e => setHours(p => p.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} style={{ ...sc_styles.input, padding: "5px 10px", fontSize: 13, width: 110, fontFamily: "monospace" }} />
                  </div>
                ) : (<span style={{ fontSize: 12, color: "#CBD5E1", fontStyle: "italic", flex: 1 }}>Closed</span>)}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: autoEnabled ? 14 : 0 }}>
              <div style={sc_styles.sectionLabel}>Auto-Responder</div>
              <Toggle checked={autoEnabled} onChange={v => setAutoEnabled(v)} />
            </div>
            {autoEnabled && (<>
              <textarea value={autoMessage} onChange={e => setAutoMessage(e.target.value)} rows={4} style={{ ...sc_styles.input, resize: "vertical" as any, fontSize: 12, lineHeight: 1.5 }} placeholder="Thank you for reaching out!" />
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                <button onClick={async () => { try { await updateAutoResponder({ enabled: autoEnabled, message: autoMessage }); showToast("Auto-responder saved"); } catch { showToast("Failed to save auto-responder"); } }} style={{ ...sc_styles.primaryBtn, fontSize: 12, padding: "6px 14px" }}>Save</button>
                <span style={{ fontSize: 11, color: "#94A3B8" }}>Sent automatically to new tickets outside business hours.</span>
              </div>
            </>)}
            {!autoEnabled && <p style={{ fontSize: 12, color: "#94A3B8", margin: "10px 0 0", fontStyle: "italic" }}>Enable to send an automated reply when a new ticket is submitted.</p>}
          </div>
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "18px 20px" }}>
            <div style={sc_styles.sectionLabel}>Public Holidays</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12, minHeight: 32 }}>
              {holidays.length === 0 ? <div style={{ fontSize: 12, color: "#94A3B8", fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>No holidays added</div>
                : holidays.map(h => (
                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8 }}>
                    <span style={{ fontSize: 14 }}>🗓</span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{h.name}</div><div style={{ fontSize: 11, color: "#94A3B8", fontFamily: "monospace" }}>{h.date}</div></div>
                    <button onClick={() => deleteHoliday(h.id)} style={{ ...sc_styles.iconBtn, color: "#DC2626", fontSize: 13 }}>✕</button>
                  </div>
                ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6 }}>
                <div>
                  <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Name</div>
                  <input value={newHoliday.name} onChange={e => setNewHoliday({ ...newHoliday, name: e.target.value })} placeholder="Diwali" style={{ ...sc_styles.input, fontSize: 12 }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>Date</div>
                  <input type="date" value={newHoliday.date} onChange={e => setNewHoliday({ ...newHoliday, date: e.target.value })} style={{ ...sc_styles.input, fontSize: 12, fontFamily: "monospace" }} />
                </div>
              </div>
              <button onClick={addHoliday} style={{ ...sc_styles.primaryBtn, alignSelf: "flex-end", padding: "7px 14px", fontSize: 13 }}>+</button>
            </div>
          </div>
        </div>
      </div>
      {toast && <MiniToast msg={toast} />}
    </div>
  );
};

type ConfigTab = "canned" | "categories" | "reports" | "bizHours" | "terms" | "members";
// ─────────────────────────────────────────────────────────────────────────────
// TERMS & CONDITIONS EDITOR — Admin can edit T&C, versioned table, prev. data stored
// ─────────────────────────────────────────────────────────────────────────────

interface TermsVersion {
  id: number;
  version: string;
  content: string;
  updatedAt: string;
  updatedBy: string;
  isActive: boolean;
}

const TermsConditionsEditor: React.FC = () => {
  const [versions, setVersions] = useState<TermsVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editVersion, setEditVersion] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState(false);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  // Default T&C sections if API not available
  const DEFAULT_TERMS = [
    { title: "1. Acceptance of Terms", body: "By accessing and using Meet The Masters, you accept and agree to be bound by these Terms & Conditions." },
    { title: "2. Use of Services", body: "Our platform provides access to certified financial consultants for lawful purposes only." },
    { title: "3. Confidentiality", body: "All consultation sessions and related information are strictly confidential." },
    { title: "4. Booking & Payments", body: "Bookings are confirmed upon successful payment. Cancellations must be made at least 24 hours prior." },
    { title: "5. Disclaimer", body: "Financial advice provided is for informational purposes only and does not guarantee specific outcomes." },
    { title: "6. Privacy Policy", body: "We collect and store your personal data securely in accordance with applicable data protection laws." },
    { title: "7. Governing Law", body: "These Terms are governed by the laws of India, jurisdiction: Hyderabad, Telangana." },
  ].map(s => `### ${s.title}\n${s.body}`).join("\n\n");

  useEffect(() => {
    setLoading(true);
    apiFetch("/admin/terms-and-conditions")
      .then((data: any) => {
        const list = Array.isArray(data) ? data : (Array.isArray(data?.content) ? data.content : []);
        if (list.length > 0) {
          setVersions(list.map((v: any) => ({
            id: v.id,
            version: v.version || v.versionNumber || "1.0",
            content: v.content || v.termsText || v.text || "",
            updatedAt: v.updatedAt || v.createdAt || new Date().toISOString(),
            updatedBy: v.updatedBy || v.adminName || "Admin",
            isActive: v.isActive ?? v.active ?? false,
          })));
        } else {
          // Seed with a default version
          const defaultVer: TermsVersion = {
            id: 1,
            version: "1.0",
            content: DEFAULT_TERMS,
            updatedAt: new Date().toISOString(),
            updatedBy: "Admin",
            isActive: true,
          };
          setVersions([defaultVer]);
        }
      })
      .catch(() => {
        // Fallback to stored local or default
        const localData = localStorage.getItem("fin_terms_versions");
        if (localData) {
          try { setVersions(JSON.parse(localData)); } catch { setVersions([]); }
        } else {
          const defaultVer: TermsVersion = {
            id: Date.now(),
            version: "1.0",
            content: DEFAULT_TERMS,
            updatedAt: new Date().toISOString(),
            updatedBy: "Admin",
            isActive: true,
          };
          setVersions([defaultVer]);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const activeVersion = versions.find(v => v.isActive) || versions[versions.length - 1] || null;
  const selectedVersion = selectedVersionId != null ? versions.find(v => v.id === selectedVersionId) : activeVersion;

  const handleStartEdit = () => {
    setEditContent(activeVersion?.content || DEFAULT_TERMS);
    // Auto-increment version
    const currentVer = parseFloat(activeVersion?.version || "1.0");
    setEditVersion((Math.round((currentVer + 0.1) * 10) / 10).toFixed(1));
    setEditing(true);
    setPreviewMode(false);
  };

  const handleSave = async () => {
    if (!editContent.trim()) { showToast("Content cannot be empty.", false); return; }
    setSaving(true);
    const newVer: TermsVersion = {
      id: Date.now(),
      version: editVersion || "1.0",
      content: editContent,
      updatedAt: new Date().toISOString(),
      updatedBy: "Admin",
      isActive: true,
    };
    try {
      await apiFetch("/admin/terms-and-conditions", {
        method: "POST",
        body: JSON.stringify({ version: editVersion, content: editContent, isActive: true }),
      });
    } catch {
      // Silently ignore if endpoint doesn't exist; store locally
    }
    // Deactivate old versions, store previous data
    const updated = versions.map(v => ({ ...v, isActive: false }));
    updated.push(newVer);
    setVersions(updated);
    // Store in localStorage as fallback/history
    localStorage.setItem("fin_terms_versions", JSON.stringify(updated));
    setEditing(false);
    setSelectedVersionId(newVer.id);
    showToast(`✅ Terms & Conditions v${editVersion} saved and published.`);
    setSaving(false);
  };

  const handleSetActive = (id: number) => {
    const updated = versions.map(v => ({ ...v, isActive: v.id === id }));
    setVersions(updated);
    localStorage.setItem("fin_terms_versions", JSON.stringify(updated));
    showToast("Active version updated.");
    try {
      apiFetch(`/admin/terms-and-conditions/${id}/activate`, { method: "PUT" }).catch(() => { });
    } catch { }
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  };

  return (
    <div style={sc_styles.panelWrap}>
      <div style={sc_styles.panelHeader}>
        <div>
          <h3 style={sc_styles.panelTitle}>Terms &amp; Conditions</h3>
          <p style={sc_styles.panelSub}>Edit and version-manage your Terms &amp; Conditions — previous versions are preserved</p>
        </div>
        {!editing && (
          <button onClick={handleStartEdit} style={sc_styles.primaryBtn}>✏️ Edit &amp; Publish New Version</button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>

        {/* Version history table */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Version History
          </div>
          {loading ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#94A3B8", fontSize: 12 }}>Loading…</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[...versions].reverse().map((v, i) => (
                <div key={v.id}
                  onClick={() => setSelectedVersionId(v.id)}
                  style={{
                    padding: "12px 16px",
                    borderBottom: i < versions.length - 1 ? "1px solid #F1F5F9" : "none",
                    cursor: "pointer",
                    background: selectedVersion?.id === v.id ? "#EFF6FF" : "transparent",
                    borderLeft: `3px solid ${v.isActive ? "#16A34A" : selectedVersion?.id === v.id ? "#2563EB" : "transparent"}`,
                    transition: "all 0.12s",
                  }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>v{v.version}</span>
                    {v.isActive && (
                      <span style={{ fontSize: 9, fontWeight: 700, background: "#DCFCE7", color: "#16A34A", padding: "2px 6px", borderRadius: 10, border: "1px solid #86EFAC" }}>LIVE</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>{fmtDate(v.updatedAt)}</div>
                  <div style={{ fontSize: 10, color: "#64748B", marginTop: 1 }}>by {v.updatedBy}</div>
                  {!v.isActive && (
                    <button onClick={e => { e.stopPropagation(); handleSetActive(v.id); }}
                      style={{ marginTop: 6, fontSize: 10, color: "#2563EB", fontWeight: 700, background: "none", border: "1px solid #BFDBFE", borderRadius: 6, padding: "2px 7px", cursor: "pointer" }}>
                      Set as Active
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Content panel */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
          {editing ? (
            <div>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div>
                    <label style={sc_styles.label}>Version Number</label>
                    <input value={editVersion} onChange={e => setEditVersion(e.target.value)}
                      style={{ ...sc_styles.input, width: 90, padding: "5px 10px", fontFamily: "monospace" }} />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-end", paddingBottom: 2 }}>
                    <button onClick={() => setPreviewMode(false)}
                      style={{ ...sc_styles.filterPill, ...(previewMode ? {} : sc_styles.filterPillActive) }}>✏️ Edit</button>
                    <button onClick={() => setPreviewMode(true)}
                      style={{ ...sc_styles.filterPill, ...(previewMode ? sc_styles.filterPillActive : {}) }}>👁 Preview</button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditing(false)} style={sc_styles.ghostBtn}>Cancel</button>
                  <button onClick={handleSave} disabled={saving}
                    style={{ ...sc_styles.primaryBtn, opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Saving…" : "💾 Save & Publish"}
                  </button>
                </div>
              </div>
              {previewMode ? (
                <div style={{ padding: "20px 24px", fontSize: 13, color: "#374151", lineHeight: 1.8, minHeight: 420 }}>
                  {editContent.split("\n\n").map((block, i) => {
                    if (block.startsWith("### ")) {
                      return (
                        <div key={i} style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{block.replace("### ", "")}</div>
                        </div>
                      );
                    }
                    const lines = block.split("\n");
                    const title = lines[0]?.startsWith("### ") ? lines[0].replace("### ", "") : null;
                    const body = title ? lines.slice(1).join("\n") : block;
                    return (
                      <div key={i} style={{ marginBottom: 18 }}>
                        {title && <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{title}</div>}
                        <div style={{ color: "#374151" }}>{body}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  style={{ width: "100%", padding: "20px 24px", border: "none", fontSize: 13, fontFamily: "monospace", lineHeight: 1.7, resize: "none", outline: "none", minHeight: 480, boxSizing: "border-box", color: "#1E293B" }}
                  placeholder={`### 1. Acceptance of Terms\nYour terms content here...\n\n### 2. Use of Services\nMore content...`}
                />
              )}
              <div style={{ padding: "10px 18px", background: "#F8FAFC", borderTop: "1px solid #F1F5F9", fontSize: 11, color: "#94A3B8" }}>
                Use <code>### Section Title</code> for headings. Each section separated by blank line. Previous versions are preserved automatically.
              </div>
            </div>
          ) : selectedVersion ? (
            <div>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>Version {selectedVersion.version}</span>
                  {selectedVersion.isActive && <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: "#DCFCE7", color: "#16A34A", padding: "2px 8px", borderRadius: 10 }}>● LIVE</span>}
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                    Last updated {fmtDate(selectedVersion.updatedAt)} by {selectedVersion.updatedBy}
                  </div>
                </div>
                <button onClick={handleStartEdit} style={sc_styles.primaryBtn}>✏️ Edit</button>
              </div>
              <div style={{ padding: "20px 24px", fontSize: 13, color: "#374151", lineHeight: 1.8, minHeight: 420 }}>
                {selectedVersion.content.split("\n\n").map((block, i) => {
                  const lines = block.split("\n");
                  const title = lines[0]?.startsWith("### ") ? lines[0].replace("### ", "") : null;
                  const body = title ? lines.slice(1).join(" ") : block;
                  return (
                    <div key={i} style={{ marginBottom: 18 }}>
                      {title && <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{title}</div>}
                      <div>{body}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={sc_styles.emptyState}>No terms available. Click "Edit &amp; Publish" to create one.</div>
          )}
        </div>
      </div>

      {toast && <MiniToast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ADD MEMBER PANEL — Admin adds members with encrypted password & first-login flag
// ─────────────────────────────────────────────────────────────────────────────
const AddMemberPanel: React.FC = () => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    mobileNumber: "",
    location: "",
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Table of recently added members
  const [addedMembers, setAddedMembers] = useState<{ id: number; name: string; email: string; role: string; addedAt: string }[]>([]);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {

    // Load saved members from localStorage
    try {
      const stored = JSON.parse(localStorage.getItem("fin_admin_added_members") || "[]");
      setAddedMembers(stored);
    } catch { }
  }, []);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Full name is required";
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Valid email required";
    if (!form.mobileNumber.trim() || !/^[6-9]\d{9}$/.test(form.mobileNumber)) e.mobileNumber = "Valid 10-digit mobile required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAddMember = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("fin_token");
      const BASE_INNER = "http://52.55.178.31:8081/api";

      // Backend endpoint: POST /api/onboarding/admin/member  (multipart/form-data)
      // Requires: data (JSON part with MemberRegistrationRequest) + optional file
      // Backend auto-generates password from email prefix, sends welcome email with credentials
      // No manual password needed — backend handles bcrypt encryption via createCoreUser()
      const memberData = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phoneNumber: form.mobileNumber.trim(),  // backend uses phoneNumber
        location: form.location.trim() || "",
        profileImageUrl: null,
      };

      const fd = new FormData();
      fd.append("data", new Blob([JSON.stringify(memberData)], { type: "application/json" }));
      // No file upload in this form — file is optional per @RequestPart(required=false)

      const res = await fetch(`${BASE_INNER}/onboarding/admin/member`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          // NOTE: Do NOT set Content-Type manually — browser sets it with boundary for FormData
        },
        body: fd,
      });

      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await res.json() : { message: await res.text() };

      if (!res.ok) {
        if (res.status === 409) throw new Error("Email or phone number already registered.");
        if (res.status === 403) throw new Error("Access denied. Admin role required.");
        throw new Error(data?.message || `Error ${res.status}`);
      }

      const newMember = {
        id: data?.userId || data?.id || Date.now(),
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        role: "MEMBER",
        addedAt: new Date().toISOString(),
      };
      const updated = [newMember, ...addedMembers];
      setAddedMembers(updated);
      localStorage.setItem("fin_admin_added_members", JSON.stringify(updated));

      showToast(`✅ Member "${form.name.trim()}" added! Login credentials sent to ${form.email.trim().toLowerCase()}.`);
      setForm({ name: "", email: "", mobileNumber: "", location: "" });
      setErrors({});
    } catch (err: any) {
      showToast(`❌ ${err?.message || "Failed to add member."}`, false);
    } finally {
      setSaving(false);
    }
  };

  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 5 };
  const inputStyle: React.CSSProperties = { ...sc_styles.input, marginBottom: 0 };
  const errorStyle: React.CSSProperties = { fontSize: 11, color: "#DC2626", fontWeight: 600, marginTop: 3 };

  return (
    <div style={sc_styles.panelWrap}>
      <div style={sc_styles.panelHeader}>
        <div>
          <h3 style={sc_styles.panelTitle}>Add Member</h3>
          <p style={sc_styles.panelSub}>
            Create user accounts manually. Passwords are encrypted (bcrypt) server-side.
            A first-login flag is set so users are prompted to change their password.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>

        {/* Form */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "22px 24px" }}>
          {/* Security notice */}
          <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#92400E", fontWeight: 600 }}>
            🔐 Passwords are encrypted using bcrypt before storage. The user will be required to change their password on first login.
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 18px" }}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Member's full name" style={inputStyle} />
              {errors.name && <div style={errorStyle}>{errors.name}</div>}
            </div>
            <div>
              <label style={labelStyle}>Email Address *</label>
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="member@example.com" type="email" style={inputStyle} />
              {errors.email && <div style={errorStyle}>{errors.email}</div>}
            </div>
            <div>
              <label style={labelStyle}>Mobile Number *</label>
              <div style={{ display: "flex" }}>
                <span style={{ display: "flex", alignItems: "center", padding: "0 10px", background: "#F1F5F9", border: "1.5px solid #E2E8F0", borderRight: "none", borderRadius: "9px 0 0 9px", fontSize: 13, color: "#475569", fontWeight: 600, flexShrink: 0 }}>+91</span>
                <input value={form.mobileNumber}
                  onChange={e => setForm(f => ({ ...f, mobileNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                  placeholder="10-digit number" type="tel" inputMode="numeric" maxLength={10}
                  style={{ ...inputStyle, borderRadius: "0 9px 9px 0", flex: 1 }} />
              </div>
              {errors.mobileNumber && <div style={errorStyle}>{errors.mobileNumber}</div>}
            </div>
            <div>
              <label style={labelStyle}>Location</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="City, State" style={inputStyle} />
            </div>
          </div>

          {/* Auto-password info */}
          <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: "12px 16px", marginTop: 16, fontSize: 12, color: "#166534", lineHeight: 1.6 }}>
            🔐 <strong>How it works:</strong> The backend auto-generates a secure password from the member's email prefix.
            An encrypted (bcrypt) password is stored and <strong>login credentials are emailed automatically</strong> to <em>{form.email || "the registered email"}</em>.
            The member will be required to change their password on first login.
          </div>

          {/* Submit */}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={() => { setForm({ name: "", email: "", mobileNumber: "", location: "" }); setErrors({}); }}
              style={sc_styles.ghostBtn}>Reset</button>
            <button onClick={handleAddMember} disabled={saving}
              style={{ ...sc_styles.primaryBtn, flex: 1, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Adding…" : "👤 Add Member"}
            </button>
          </div>
        </div>

        {/* Recently added members table */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Recently Added ({addedMembers.length})
          </div>
          {addedMembers.length === 0 ? (
            <div style={sc_styles.emptyState}>No members added yet.</div>
          ) : (
            <div style={{ maxHeight: 440, overflowY: "auto" }}>
              {addedMembers.map((m, i) => {
                return (
                  <div key={m.id} style={{ padding: "12px 16px", borderBottom: i < addedMembers.length - 1 ? "1px solid #F1F5F9" : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "linear-gradient(135deg,#1E3A5F,#2563EB)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.email}</div>
                      </div>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", flexShrink: 0 }}>
                        MEMBER
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 5, marginLeft: 44 }}>
                      Added {new Date(m.addedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {toast && <MiniToast msg={toast.msg} ok={toast.ok} />}
    </div>
  );
};

interface SupportConfigProps { tickets: Ticket[]; advisors: Advisor[]; onAssign: (ticketId: number, agentName: string) => void; }
const SUPPORT_CONFIG_TABS: { id: ConfigTab; label: string; icon: string }[] = [
  { id: "canned", label: "Canned Responses", icon: "💬" },
  { id: "categories", label: "Categories", icon: "🏷️" },
  { id: "reports", label: "Reports", icon: "📊" },
  { id: "bizHours", label: "Business Hours", icon: "⏰" },
  { id: "terms", label: "Terms & Conditions", icon: "📋" },
  { id: "members", label: "Add Member", icon: "👤" },
];

const SupportConfigPanel: React.FC<SupportConfigProps> = ({ tickets, advisors, onAssign }) => {
  const [tab, setTab] = useState<ConfigTab>("canned");
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Support Configuration</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>Manage canned responses, categories, analytics, and business hours</p>
      </div>
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ display: "flex", borderBottom: "1px solid #E2E8F0", overflowX: "auto" }}>
          {SUPPORT_CONFIG_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "13px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? "#2563EB" : "#64748B", borderBottom: tab === t.id ? "2px solid #2563EB" : "2px solid transparent", display: "flex", alignItems: "center", gap: 7, transition: "all 0.15s", whiteSpace: "nowrap", fontFamily: "inherit" }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "24px" }}>
          {tab === "canned" && <CannedResponses />}
          {tab === "categories" && <CategoriesConfig />}
          {tab === "reports" && <ReportsAnalytics tickets={tickets} />}
          {tab === "bizHours" && <BusinessSettings />}
          {tab === "terms" && <TermsConditionsEditor />}
          {tab === "members" && <AddMemberPanel />}
        </div>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// ADMIN BOOKINGS PANEL — Full list with delete capability (PRD §7.4)
// ─────────────────────────────────────────────────────────────────────────────
const AdminBookingsPanel: React.FC<{
  bookings: any[];
  advisors: Advisor[];
  onDeleted: (id: number) => void;
}> = ({ bookings, advisors, onDeleted }) => {
  const BASE_ADMIN = "http://52.55.178.31:8081/api";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const advisorMap: Record<number, string> = {};
  advisors.forEach(a => { advisorMap[a.id] = a.name; });

  const statuses = ["ALL", "CONFIRMED", "PENDING", "COMPLETED", "CANCELLED"];

  const filtered = bookings.filter((b: any) => {
    const name = (b.userName || b.user?.name || "").toLowerCase();
    const consultant = (b.consultantName || b.advisorName || advisorMap[b.consultantId] || "").toLowerCase();
    const q = search.toLowerCase();
    const matchSearch = !q || name.includes(q) || consultant.includes(q) || String(b.id).includes(q);
    const status = (b.BookingStatus || b.bookingStatus || b.status || "").toUpperCase();
    const matchStatus = statusFilter === "ALL" || status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const token = localStorage.getItem("fin_token");
      const res = await fetch(`${BASE_ADMIN}/bookings/${id}`, {
        method: "DELETE",
        headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok || res.status === 204) {
        onDeleted(id);
        showToast(`✅ Booking #${id} deleted successfully.`);
      } else {
        showToast(`❌ Failed to delete booking #${id}.`);
      }
    } catch {
      showToast(`❌ Network error. Could not delete booking.`);
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const statusColor: Record<string, { color: string; bg: string; border: string }> = {
    CONFIRMED: { color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
    PENDING: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" },
    COMPLETED: { color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD" },
    CANCELLED: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  };

  return (
    <div style={{ padding: "0 0 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Bookings</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>
            {filtered.length} of {bookings.length} booking{bookings.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search user, consultant, ID…"
            style={{ padding: "9px 14px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", width: 220, fontFamily: "inherit" }}
          />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
            {statuses.map(s => <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s}</option>)}
          </select>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {confirmDeleteId !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 400, width: "90%", textAlign: "center", boxShadow: "0 16px 48px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Delete Booking #{confirmDeleteId}?</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 24 }}>This action cannot be undone. The booking record will be permanently removed.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDeleteId(null)}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDeleteId)}
                disabled={deletingId === confirmDeleteId}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: deletingId === confirmDeleteId ? 0.7 : 1 }}>
                {deletingId === confirmDeleteId ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bookings.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#94A3B8" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>No bookings yet</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#94A3B8" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
          <div style={{ fontWeight: 600 }}>No bookings match your search.</div>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 140px 120px 110px 90px", padding: "10px 18px", background: "#F8FAFC", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid #F1F5F9" }}>
            <div>#ID</div>
            <div>User</div>
            <div>Consultant</div>
            <div>Date & Time</div>
            <div>Amount</div>
            <div>Status</div>
            <div>Action</div>
          </div>
          {filtered.map((b: any, i: number) => {
            const status = (b.BookingStatus || b.bookingStatus || b.status || "PENDING").toUpperCase();
            const sc = statusColor[status] || { color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1" };
            const consultantName = b.consultantName || b.advisorName || advisorMap[b.consultantId] || `Consultant #${b.consultantId || "?"}`;
            const userName = b.userName || b.user?.name || b.clientName || `User #${b.userId || "?"}`;
            const slotDate = b.slotDate || b.bookingDate || b.date || "—";
            const timeRange = b.timeRange || b.slotTime || "—";
            const amount = Number(b.amount || b.charges || b.fee || 0);
            return (
              <div key={b.id}
                style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 140px 120px 110px 90px", padding: "13px 18px", borderBottom: i < filtered.length - 1 ? "1px solid #F8FAFC" : "none", alignItems: "center", transition: "background 0.1s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFF")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: "#94A3B8" }}>#{b.id}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{userName}</div>
                <div style={{ fontSize: 13, color: "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{consultantName}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{slotDate}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8" }}>{timeRange}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                  {amount > 0 ? `₹${amount.toLocaleString()}` : "—"}
                </div>
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>
                    {status}
                  </span>
                </div>
                <div>
                  <button
                    onClick={() => setConfirmDeleteId(b.id)}
                    disabled={deletingId === b.id}
                    title="Delete this booking"
                    style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    🗑 Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {toast && <MiniToast msg={toast} ok={!toast.startsWith("❌")} />}
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// INNER ADMIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ADMIN OFFERS PANEL — Full CRUD for offers management
// ─────────────────────────────────────────────────────────────────────────────
interface AdminOffer { id?: number; title: string; description: string; discount: string; validFrom: string; validTo: string; isActive: boolean; consultantId?: number | null; }

const AdminOffersPanel: React.FC = () => {
  const [offers, setOffers] = React.useState<AdminOffer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminOffer | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<AdminOffer>({ title: '', description: '', discount: '', validFrom: '', validTo: '', isActive: true, consultantId: null });

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2800); };

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/offers');
      const arr = Array.isArray(data) ? data : data?.content || data?.offers || [];
      setOffers(arr);
    } catch { setOffers([]); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm({ title: '', description: '', discount: '', validFrom: '', validTo: '', isActive: true, consultantId: null });
    setEditing(null); setShowForm(true);
  };
  const openEdit = (o: AdminOffer) => { setForm({ ...o }); setEditing(o); setShowForm(true); };

  const handleSave = async () => {
    if (!form.title.trim()) { showToast('Title is required.'); return; }
    setSaving(true);
    try {
      if (editing?.id) {
        await apiFetch(`/offers/${editing.id}`, { method: 'PUT', body: JSON.stringify(form) });
        setOffers(prev => prev.map(o => o.id === editing.id ? { ...o, ...form } : o));
        showToast('✓ Offer updated!');
      } else {
        const created = await apiFetch('/offers', { method: 'POST', body: JSON.stringify(form) });
        setOffers(prev => [...prev, { ...form, id: created?.id ?? Date.now() }]);
        showToast('✓ Offer created!');
      }
      setShowForm(false);
    } catch (e: any) { showToast(e?.message || 'Failed to save.'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this offer? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await apiFetch(`/offers/${id}`, { method: 'DELETE' });
      setOffers(prev => prev.filter(o => o.id !== id));
      showToast('Offer deleted.');
    } catch (e: any) { showToast(e?.message || 'Delete failed.'); }
    finally { setDeleting(null); }
  };

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0', borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' };
  const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };

  return (
    <div>
      {toast && <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: '#0F172A', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>{toast}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0F172A' }}>Offers Management</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>Create, edit and manage all promotional offers shown to customers</p>
        </div>
        <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New Offer
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#F8FAFC', border: '1.5px solid #BFDBFE', borderRadius: 16, padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(37,99,235,0.07)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 18 }}>{editing ? 'Edit Offer' : 'Create New Offer'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Title *</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Summer Special Discount" style={inp} /></div>
            <div style={{ gridColumn: '1/-1' }}><label style={lbl}>Description</label><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Describe what this offer includes…" style={{ ...inp, resize: 'none' as any }} /></div>
            <div><label style={lbl}>Discount Label</label><input value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} placeholder="e.g. 25% OFF / FREE / ₹500 OFF" style={inp} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
              <input type="checkbox" id="admin-offer-active" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563EB' }} />
              <label htmlFor="admin-offer-active" style={{ fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Active (show to customers)</label>
            </div>
            <div><label style={lbl}>Valid From</label><input type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} style={inp} /></div>
            <div><label style={lbl}>Valid Until</label><input type="date" value={form.validTo} onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} style={inp} /></div>
            <div><label style={lbl}>Consultant ID <span style={{ fontWeight: 400 }}>(optional — leave blank for all)</span></label><input type="number" value={form.consultantId ?? ''} onChange={e => setForm(f => ({ ...f, consultantId: e.target.value ? Number(e.target.value) : null }))} placeholder="Link to specific consultant" style={inp} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: saving ? '#93C5FD' : '#2563EB', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : editing ? 'Update Offer' : 'Create Offer'}</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />Loading offers…
        </div>
      ) : offers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: 16, color: '#94A3B8' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
          <div style={{ fontWeight: 600, color: '#64748B', marginBottom: 14 }}>No offers yet</div>
          <button onClick={openNew} style={{ padding: '10px 22px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Create First Offer</button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 16, overflow: 'hidden' }}>
          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 120px 120px 140px', padding: '10px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9', fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <div>Offer</div><div>Discount</div><div>Valid From</div><div>Valid To</div><div>Status</div><div style={{ textAlign: 'right' }}>Actions</div>
          </div>
          {offers.map((offer, idx) => (
            <div key={offer.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 120px 120px 140px', padding: '14px 20px', borderBottom: idx < offers.length - 1 ? '1px solid #F8FAFC' : 'none', alignItems: 'center', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FAFBFF')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{offer.title}</div>
                {offer.description && <div style={{ fontSize: 11, color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{offer.description}</div>}
                {offer.consultantId && <div style={{ fontSize: 10, color: '#2563EB', fontWeight: 600, marginTop: 2 }}>Consultant #{offer.consultantId}</div>}
              </div>
              <div>{offer.discount ? <span style={{ fontSize: 11, fontWeight: 800, background: '#DC2626', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>{offer.discount}</span> : <span style={{ color: '#CBD5E1' }}>—</span>}</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>{offer.validFrom || '—'}</div>
              <div style={{ fontSize: 12, color: '#64748B' }}>{offer.validTo || '—'}</div>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: offer.isActive ? '#DCFCE7' : '#F1F5F9', color: offer.isActive ? '#16A34A' : '#94A3B8', border: `1px solid ${offer.isActive ? '#86EFAC' : '#E2E8F0'}` }}>
                  {offer.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => openEdit(offer)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#2563EB', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  Edit
                </button>
                <button onClick={() => offer.id && handleDelete(offer.id)} disabled={deleting === offer.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: deleting === offer.id ? 0.6 : 1 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
                  {deleting === offer.id ? '…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function AdminPageInner() {
  const navigate = useNavigate();
  const { addNotification } = useNotifications();

  const [activeSection, setActiveSection] = useState<AdminSectionType>("dashboard");
  const [showModal, setShowModal] = useState(false);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [dashBookings, setDashBookings] = useState<any[]>([]);
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [totalBookingsCount, setTotalBookingsCount] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [ticketCount, setTicketCount] = useState(0);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"online" | "offline" | "error" | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [bookingChartData, setBookingChartData] = useState<{ day: string; bookings: number }[]>([
    { day: "Mon", bookings: 0 }, { day: "Tue", bookings: 0 }, { day: "Wed", bookings: 0 },
    { day: "Thu", bookings: 0 }, { day: "Fri", bookings: 0 }, { day: "Sat", bookings: 0 }, { day: "Sun", bookings: 0 },
  ]);

  const currentAdminId = Number(localStorage.getItem("fin_user_id") ?? 0);

  useEffect(() => { debugToken(); }, []);

  // ── Logout handler ───────────────────────────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem("fin_token");
    localStorage.removeItem("fin_role");
    localStorage.removeItem("fin_user_id");
    localStorage.removeItem("fin_consultant_id");
    localStorage.removeItem("fin_user_name");
    localStorage.removeItem("fin_user_email");
    navigate("/");
  };

  const extractUserName = (b: any): string =>
    b.user?.name || b.user?.username || b.user?.fullName ||
    b.user?.firstName || b.client?.name || b.bookedBy?.name ||
    b.customer?.name || b.userName || b.clientName ||
    b.userFullName || b.bookedByName ||
    (b.user?.email ? b.user.email.split("@")[0] : null) ||
    (b.userId ? `User #${b.userId}` : null) ||
    (b.clientId ? `User #${b.clientId}` : null) ||
    `User #${b.id}`;

  const fetchDashboardData = async () => {
    setLoading(true);

    try {
      const advData = await getAllAdvisors();
      if (Array.isArray(advData) && advData.length > 0) {
        setAdvisors(advData.map((a: any) => {
          const baseCharges = Number(a.charges || 0);
          // PRD §5.3: Display price = base + ₹200 markup
          const displayPrice = a.displayPrice ? Number(a.displayPrice) : (baseCharges > 0 ? baseCharges + 200 : 0);
          return {
            id: a.id, name: a.name, role: a.designation || "Financial Consultant",
            tags: Array.isArray(a.skills) ? a.skills : [],
            rating: Number(a.rating || 4.5), reviews: Number(a.reviewCount || 0),
            fee: displayPrice, exp: a.experience || "5+ Years",
            shiftStartTime: parseLocalTime(a.shiftStartTime), shiftEndTime: parseLocalTime(a.shiftEndTime),
            avatar: a.profilePhoto ? (a.profilePhoto.startsWith('http') ? a.profilePhoto : `http://52.55.178.31:8081/${a.profilePhoto.startsWith('/') ? a.profilePhoto.slice(1) : a.profilePhoto}`) : a.photo ? (a.photo.startsWith('http') ? a.photo : `http://52.55.178.31:8081/${a.photo.startsWith('/') ? a.photo.slice(1) : a.photo}`) : `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=2563EB&color=fff&bold=true`,
          };
        }));
        setBackendStatus("online");
      }
    } catch (err: any) {
      setBackendStatus(err?.message?.includes("403") ? "error" : "offline");
    }

    try {
      const bookingsArr: any[] = await getAllBookings();
      if (bookingsArr.length > 0) {
        const masterMap: Record<number, string> = {};
        try {
          const mData = await apiFetch("/master-timeslots");
          (Array.isArray(mData) ? mData : mData?.content || []).forEach((m: any) => { if (m.id && m.timeRange) masterMap[m.id] = m.timeRange; });
        } catch { }

        const uniqueSlotIds = [...new Set(bookingsArr.map((b: any) => b.timeSlotId).filter(Boolean))] as number[];
        const slotMap: Record<number, any> = {};
        await Promise.all(uniqueSlotIds.map(id => apiFetch(`/timeslots/${id}`).then(s => { slotMap[id] = s; }).catch(() => { })));

        const uniqueConsultantIds = [...new Set(bookingsArr.map((b: any) => b.consultantId).filter(Boolean))] as number[];
        const consultantNameMap: Record<number, string> = {};
        await Promise.all(uniqueConsultantIds.map(id =>
          apiFetch(`/consultants/${id}`).then(c => { consultantNameMap[id] = c?.name || c?.username || `Consultant #${id}`; }).catch(() => { consultantNameMap[id] = `Deleted Consultant (#${id})`; })
        ));

        const mapped = bookingsArr.map((b: any) => {
          const slot = slotMap[b.timeSlotId];
          const slotDate = slot?.slotDate || b.slotDate || b.bookingDate || b.date || "N/A";
          const slotTime = slot?.slotTime || b.slotTime || b.bookingTime || "";
          const masterKey = slot?.masterTimeSlotId || slot?.masterSlotId;
          const timeRange = (masterKey && masterMap[masterKey]) || b.timeRange || (slotTime ? slotTime.substring(0, 5) : "N/A");
          const advisorName = b.consultant?.name || b.consultantName || consultantNameMap[b.consultantId] || `Deleted Consultant (#${b.consultantId})`;
          return { id: b.id, user: extractUserName(b), advisor: advisorName, time: `${slotDate} • ${timeRange}`, status: (b.BookingStatus || b.bookingStatus || b.status || "PENDING").toUpperCase(), amount: Number(b.amount || b.charges || b.fee || 0) };
        });

        setAllBookings(mapped);
        setTotalBookingsCount(mapped.length);
        setTotalRevenue(mapped.filter(b => b.status === "COMPLETED").reduce((s: number, b: any) => s + b.amount, 0));
        setDashBookings(mapped.slice(0, 5));

        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dayCounts: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        mapped.forEach((b: any) => {
          const datePart = b.time?.split(" • ")[0]?.trim();
          if (!datePart || datePart === "N/A") return;
          const d = new Date(datePart);
          if (isNaN(d.getTime())) return;
          if (d >= monday && d <= sunday) { const k = dayNames[d.getDay()]; dayCounts[k] = (dayCounts[k] || 0) + 1; }
        });

        setBookingChartData([
          { day: "Mon", bookings: dayCounts.Mon }, { day: "Tue", bookings: dayCounts.Tue },
          { day: "Wed", bookings: dayCounts.Wed }, { day: "Thu", bookings: dayCounts.Thu },
          { day: "Fri", bookings: dayCounts.Fri }, { day: "Sat", bookings: dayCounts.Sat },
          { day: "Sun", bookings: dayCounts.Sun },
        ]);
      }
    } catch (err: any) { console.warn("[Admin] Bookings failed (non-fatal):", err?.message); }

    try {
      const tdata = await getAllTickets();
      const tarr: Ticket[] = Array.isArray(tdata) ? tdata : extractArray(tdata);
      setTicketCount(tarr.filter((t: any) => ["NEW", "OPEN", "IN_PROGRESS", "PENDING"].includes(t.status)).length);
      setAllTickets(tarr);
    } catch (err) { console.warn("[Admin] Tickets failed (non-fatal):", err); }

    setLoading(false);
  };

  useEffect(() => { fetchDashboardData(); }, []);

  const handleDeleteAdvisor = async (id: number) => {
    if (!window.confirm("Delete this consultant?")) return;
    setDeletingId(id);
    try { await deleteAdvisor(id); fetchDashboardData(); }
    catch { alert("Failed to delete consultant"); }
    finally { setDeletingId(null); }
  };

  const handleSupportAssign = (ticketId: number, agentName: string) => {
    setAllTickets(prev => prev.map(t => t.id === ticketId ? { ...t, agentName, status: "OPEN" as TicketStatus } : t));
    addNotification({ type: "success", title: `Ticket #${ticketId} Assigned`, message: `Assigned to ${agentName}.`, ticketId });
  };

  const handleNavClick = (id: AdminSectionType) => {
    setActiveSection(id);
    setIsMobileMenuOpen(false);
  };

  const navItems: { id: AdminSectionType; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "dashboard", label: "Dashboard", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" /><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" /><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" /><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" /></svg> },
    { id: "advisors", label: "Consultants", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> },
    { id: "bookings", label: "Bookings", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>, badge: totalBookingsCount },
    { id: "tickets", label: "Tickets", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>, badge: ticketCount },
    { id: "analytics", label: "Analytics", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M3 3v18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M7 16l4-4 4 4 4-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
    { id: "summary", label: "Reports", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 17v-4M12 17V9M16 17v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> },
    { id: "add-member", label: "Add Member", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><line x1="19" y1="8" x2="19" y2="14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><line x1="16" y1="11" x2="22" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> },
    { id: "support-config", label: "Support Config", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" stroke="currentColor" strokeWidth="2" /><path d="M12 8v4l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> },
    { id: "offers", label: "Offers", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><polyline points="20 12 20 22 4 22 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><rect x="2" y="7" width="20" height="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><line x1="12" y1="22" x2="12" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
    { id: "settings", label: "Settings", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" /></svg> },
  ];

  const stats = [
    { label: "TOTAL BOOKINGS", value: loading ? "…" : String(totalBookingsCount), change: "+12.5%", positive: true, color: "#2563EB", bg: "#EFF6FF" },
    { label: "ACTIVE CONSULTANTS", value: loading ? "…" : String(advisors.length), change: "+2", positive: true, color: "#7C3AED", bg: "#F5F3FF" },
    { label: "TOTAL REVENUE", value: loading ? "…" : `₹${totalRevenue.toLocaleString()}`, change: "+8.2%", positive: true, color: "#059669", bg: "#F0FDF4" },
  ];

  const consultantNameMap: Record<number, string> = {};
  advisors.forEach(a => { consultantNameMap[a.id] = a.name; });

  return (
    <div className="adm-page">
      <ToastContainer />

      {showModal && <AddAdvisor onClose={() => setShowModal(false)} onSave={() => { fetchDashboardData(); setShowModal(false); }} />}
      {isMobileMenuOpen && <div className="adm-mobile-overlay" onClick={() => setIsMobileMenuOpen(false)} />}

      {/* Sidebar */}
      <div className={`adm-sidebar ${isMobileMenuOpen ? "adm-sidebar-open" : ""}`}>
        <div className="adm-sidebar-logo">
          <div style={{ display: "flex", alignItems: "center" }}>
            <span className="adm-logo-text" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>MEET THE MASTERS</span>
            <span className="adm-badge">ADMIN</span>
          </div>
          <button className="adm-close-menu-btn" onClick={() => setIsMobileMenuOpen(false)}>×</button>
        </div>
        <nav className="adm-nav">
          {navItems.map(n => (
            <button key={n.id} onClick={() => handleNavClick(n.id)}
              className={`adm-nav-btn ${activeSection === n.id ? "adm-nav-btn-active" : ""}`}>
              <span className="adm-nav-icon">{n.icon}</span>
              {n.label}
              {n.badge != null && n.badge > 0 && (
                <span style={{ marginLeft: "auto", background: n.id === "tickets" ? "#DC2626" : "#2563EB", color: "#fff", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "1px 7px", minWidth: 18, textAlign: "center" }}>{n.badge}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="adm-sidebar-bottom">
          <button onClick={() => navigate("/")} className="adm-sidebar-action-btn">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back to Login
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="adm-main">
        <div className="adm-top-bar">
          <button className="adm-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#0F172A" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="adm-search-wrapper">
            <svg className="adm-search-icon" width="16" height="16" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2" />
              <path d="m21 21-4.35-4.35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input placeholder="Search..." className="adm-search-input" />
          </div>
          <NotificationBell onTicketClick={() => setActiveSection("tickets")} />
          <button className="adm-primary-btn" onClick={() => setShowModal(true)}>+ Add New Consultant</button>
        </div>

        {backendStatus === "offline" && (
          <div className="adm-alert-warning">⚠️ Backend offline. Showing zero data. Please start the server.</div>
        )}
        {backendStatus === "error" && (
          <div className="adm-alert-warning" style={{ background: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }}>
            🚫 403 Forbidden — check the browser console for token debug info.
          </div>
        )}

        {/* ════ DASHBOARD ════ */}
        {activeSection === "dashboard" && (
          <>
            <div className="adm-stats-grid">
              {stats.map((s, i) => (
                <div key={i} className="adm-stat-card">
                  <div className="adm-stat-label">{s.label}</div>
                  <div className="adm-stat-row">
                    <div>
                      <div className="adm-stat-value">{s.value}</div>
                      <div className={`adm-stat-change ${s.positive ? "adm-positive" : "adm-negative"}`}>{s.change}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="adm-chart-grid">
              <div className="adm-card">
                <h3 className="adm-card-title">Bookings This Week</h3>
                <div style={{ width: "100%", height: 200 }}>
                  <ResponsiveContainer>
                    <BarChart data={bookingChartData}>
                      <XAxis dataKey="day" stroke="#94A3B8" style={{ fontSize: 12 }} />
                      <YAxis stroke="#94A3B8" style={{ fontSize: 12 }} />
                      <Tooltip cursor={{ fill: "rgba(37,99,235,0.05)" }} />
                      <Bar dataKey="bookings" fill="#2563EB" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="adm-card">
                <h3 className="adm-card-title">Top Consultants</h3>
                {advisors.slice(0, 3).map(a => (
                  <div key={a.id} className="adm-advisor-row">
                    <img src={a.avatar} alt={a.name} className="adm-advisor-avatar" />
                    <div>
                      <div className="adm-advisor-name">{a.name}</div>
                      <div className="adm-advisor-rating">★ {a.rating}
                        {(a.shiftStartTime || a.shiftEndTime) && (<span style={{ marginLeft: 8, color: "#94A3B8", fontWeight: 400 }}>Avail: {a.shiftStartTime} – {a.shiftEndTime}</span>)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {ticketCount > 0 && (
              <div className={`adm-card `}
                style={{ background: "linear-gradient(135deg,#FEF2F2,#FFF7F7)", border: "1px solid #FECACA", cursor: "pointer" }}
                onClick={() => setActiveSection("tickets")}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎫</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#B91C1C" }}>{ticketCount} open ticket{ticketCount !== 1 ? "s" : ""} need attention</div>
                    <div style={{ fontSize: 12, color: "#EF4444", marginTop: 2 }}>Click to view and manage all support tickets →</div>
                  </div>
                </div>
              </div>
            )}

            <div className={`adm-card `} style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 className="adm-card-title" style={{ margin: 0 }}>Ticket Analytics</h3>
                <button onClick={() => setActiveSection("support-config")} style={{ background: "none", border: "none", color: "#2563EB", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Full Reports →</button>
              </div>
              <div style={{ padding: "8px 16px 16px" }}>
                <TicketSummaryChart tickets={allTickets} consultantNameMap={consultantNameMap} />
              </div>
            </div>

            <div className={`adm-card `}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 className="adm-card-title" style={{ margin: 0 }}>Recent Bookings</h3>
                <span style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", borderRadius: 20, fontSize: 12, fontWeight: 700, padding: "3px 12px" }}>
                  {loading ? "Loading…" : `${totalBookingsCount} total`}
                </span>
              </div>
              <div className="adm-table-responsive">
                <table className="adm-table">
                  <thead>
                    <tr className="adm-table-head">
                      <td className="adm-th">USER</td><td className="adm-th">CONSULTANT</td>
                      <td className="adm-th">TIME</td><td className="adm-th">STATUS</td>
                      <td className="adm-th">AMOUNT</td><td className="adm-th"></td>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#94A3B8" }}>
                        <div style={{ display: "inline-block", width: 20, height: 20, border: "2px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite", marginRight: 8, verticalAlign: "middle" }} />
                        Fetching bookings…
                      </td></tr>
                    ) : dashBookings.length > 0 ? dashBookings.map((b, i) => (
                      <tr key={i} className="adm-table-row">
                        <td className="adm-td-user">{b.user}</td>
                        <td className="adm-td-advisor">{b.advisor}</td>
                        <td className="adm-td-time">{b.time}</td>
                        <td><StatusBadge status={b.status} /></td>
                        <td className="adm-td-amount">₹{b.amount.toLocaleString()}</td>
                        <td className="adm-td-more">⋮</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>No bookings found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalBookingsCount > 5 && (
                <div style={{ textAlign: "center", padding: "12px 0 4px" }}>
                  <button onClick={() => setActiveSection("bookings")} style={{ background: "none", border: "none", color: "#2563EB", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                    View all {totalBookingsCount} bookings →
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ════ CONSULTANTS ════ */}
        {activeSection === "advisors" && (
          <div>
            <h2 className="adm-page-title">Consultants {loading && "…"}</h2>
            <div className="adm-advisors-grid">
              {advisors.length > 0 ? advisors.map(a => (
                <div key={a.id} className="adm-card">
                  <div className="adm-advisor-card-row">
                    <img src={a.avatar} alt={a.name} className="adm-advisor-avatar-lg" />
                    <div style={{ flex: 1 }}>
                      <div className="adm-advisor-name-lg">{a.name}</div>
                      <div className="adm-advisor-role">{a.role}</div>
                      {(a.shiftStartTime || a.shiftEndTime) && (<div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>🕐 Availability: {a.shiftStartTime} – {a.shiftEndTime}</div>)}
                      <div className="adm-tag-row">{a.tags.map(t => <span key={t} className="adm-tag">{t}</span>)}</div>
                    </div>
                  </div>
                  <div className="adm-advisor-card-footer">
                    <span>★ {a.rating} ({a.reviews})</span>
                    <span className="adm-advisor-fee">₹{a.fee.toLocaleString()}</span>
                  </div>
                  <button onClick={() => handleDeleteAdvisor(a.id)} className="adm-delete-btn" disabled={deletingId === a.id}>
                    {deletingId === a.id ? "Deleting…" : "Delete Consultant"}
                  </button>
                </div>
              )) : (
                <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#94A3B8", padding: 40 }}>No consultants found.</div>
              )}
            </div>
          </div>
        )}

        {/* ════ BOOKINGS ════ */}
        {activeSection === "bookings" && (
          <BookingsPage isAdmin={true} />
        )}

        {/* ════ TICKETS ════ */}
        {activeSection === "tickets" && (
          <TicketsSection
            consultants={advisors}
            currentAdminId={currentAdminId}
            onTicketsLoaded={(ts) => {
              setAllTickets(ts);
              setTicketCount(ts.filter(t => ["NEW", "OPEN", "IN_PROGRESS", "PENDING"].includes(t.status)).length);
            }}
          />
        )}

        {/* ════ ANALYTICS ════ */}
        {activeSection === "analytics" && (
          <AnalyticsDashboard tickets={allTickets} consultants={advisors} bookings={allBookings} mode="admin" />
        )}

        {/* ════ REPORTS ════ */}
        {activeSection === "summary" && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>📊 Ticket Reports & Analytics</h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>Daily and weekly breakdowns of tickets by category, consultant, status, and priority.</p>
            </div>
            {allTickets.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", background: "#F8FAFC", borderRadius: 20, color: "#94A3B8" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#64748B", marginBottom: 8 }}>No ticket data available yet</div>
                <p style={{ margin: 0, fontSize: 13 }}>Navigate to the Tickets tab to load data, then come back here.</p>
                <button onClick={() => setActiveSection("tickets")} style={{ marginTop: 16, padding: "10px 24px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Go to Tickets →</button>
              </div>
            ) : (
              <TicketSummaryChart tickets={allTickets} consultantNameMap={consultantNameMap} />
            )}
          </div>
        )}

        {/* ════ ADD MEMBER ════ */}
        {activeSection === "add-member" && (
          <div>
            <h2 style={{ margin: "0 0 20px", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Add Member</h2>
            <AddMemberPanel />
          </div>
        )}

        {/* ════ SUPPORT CONFIG ════ */}
        {activeSection === "support-config" && (
          <SupportConfigPanel tickets={allTickets} advisors={advisors} onAssign={handleSupportAssign} />
        )}

        {/* ════ OFFERS ════ */}
        {activeSection === "offers" && <AdminOffersPanel />}

        {/* ════ SETTINGS — FULLY DYNAMIC ════ */}
        {activeSection === "settings" && (
          <SettingsPage adminId={currentAdminId} onLogout={handleLogout} />
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — wrapped with NotificationProvider
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  return (
    <NotificationProvider>
      <AdminPageInner />
    </NotificationProvider>
  );
}