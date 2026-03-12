import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/StatusBadge.tsx";
import {
  createBooking,
  createTicket,
  extractArray,
  getAllConsultants,
  getConsultantById,
  getCurrentUser,
  getMyBookings,
  getPriorityStyle,
  getSlaInfo,
  getStatusStyle,
  getTicketComments,
  getTicketsByUser,
  logoutUser,
  postTicketComment,
  submitTicketFeedback,
  updateTicketStatus,
} from "../services/api";
import styles from "../styles/UserPage.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL API HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = "http://52.55.178.31:8081/api";
const getToken = () => localStorage.getItem("fin_token");

const apiFetch = async (url: string, options?: RequestInit) => {
  const token = getToken();
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
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
    throw new Error(data?.message || data?.error || `Request failed ${res.status}`);
  return data;
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOKING EXPIRY HELPER
// ─────────────────────────────────────────────────────────────────────────────
const isBookingExpired = (b: any, now: Date = new Date()): boolean => {
  const dateStr = b?.slotDate || b?.bookingDate || b?.date || "";
  const timeStr = b?.timeRange || b?.slotTime || "";
  if (!dateStr) return false;
  try {
    const rangeMatch = timeStr.match(/[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    let endH = -1, endM = 0;
    if (rangeMatch) {
      endH = parseInt(rangeMatch[1]);
      endM = parseInt(rangeMatch[2]);
      const ap = rangeMatch[3]?.toUpperCase();
      if (ap === "PM" && endH !== 12) endH += 12;
      if (ap === "AM" && endH === 12) endH = 0;
    } else {
      const startMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (startMatch) {
        let sh = parseInt(startMatch[1]);
        const sm = parseInt(startMatch[2]);
        const ap = startMatch[3]?.toUpperCase();
        if (ap === "PM" && sh !== 12) sh += 12;
        if (ap === "AM" && sh === 12) sh = 0;
        const totalEnd = sh * 60 + sm + 60;
        endH = Math.floor(totalEnd / 60) % 24;
        endM = totalEnd % 60;
      }
    }
    if (endH === -1) return new Date(`${dateStr}T23:59:59`) < now;
    const sessionEnd = new Date(
      `${dateStr}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`
    );
    return sessionEnd < now;
  } catch { return false; }
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Consultant {
  id: number; name: string; role: string; fee: number; tags: string[];
  rating: number; exp: number; reviews: number; avatar?: string;
  shiftStartTime?: string; shiftEndTime?: string; shiftTimings?: string;
  location?: string; about?: string; languages?: string; phone?: string;
  email?: string;
}
interface MasterSlot { id: number; timeRange: string; isActive?: boolean; }
interface TimeSlotRecord { id: number; slotDate: string; slotTime: string; status: string; masterTimeSlotId?: number; }
interface Booking {
  id: number; consultantId: number; timeSlotId: number; amount: number;
  BookingStatus: string; paymentStatus: string; consultantName?: string;
  slotDate?: string; slotTime?: string; timeRange?: string; meetingMode?: string;
}
interface FeedbackData {
  bookingId: number; consultantId: number; consultantName: string;
  slotDate: string; timeRange: string;
  existingFeedback?: { id: number; rating: number; comments: string } | null;
}
interface SelectedSlot { start24h: string; label: string; masterId: number; timeslotId?: number; }

type TicketStatus = "NEW" | "OPEN" | "IN_PROGRESS" | "PENDING" | "RESOLVED" | "CLOSED" | "ESCALATED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT" | "CRITICAL";

interface TicketComment {
  id: number; ticketId: number;
  authorName?: string;
  authorRole?: "CUSTOMER" | "AGENT" | "CONSULTANT" | "ADMIN" | string;
  isConsultantReply?: boolean;
  isPrivateNote?: boolean;
  senderId?: number;
  userId?: number;
  consultantId?: number;
  senderType?: "USER" | "CONSULTANT" | "ADMIN" | string;
  message: string;
  createdAt: string;
}

const isStaffComment = (c: TicketComment, myUserId: number | null): boolean => {
  if (c.isConsultantReply === true) return true;
  if (c.senderType === "CONSULTANT" || c.senderType === "ADMIN") return true;
  if (c.authorRole === "AGENT" || c.authorRole === "CONSULTANT" || c.authorRole === "ADMIN") return true;
  if (c.consultantId && c.consultantId > 0) return true;
  if (myUserId && c.senderId && c.senderId !== myUserId) return true;
  return false;
};
interface Ticket {
  id: number; userId?: number; description: string; category: string;
  priority: TicketPriority; status: TicketStatus; createdAt: string;
  attachmentUrl?: string; agentName?: string;
  feedbackRating?: number; feedbackText?: string;
  isSlaBreached?: boolean; slaRespondBy?: string;
}

interface IncomeItem { incomeType: string; incomeAmount: number }
interface ExpenseItem { expenseType: string; expenseAmount: number }
interface UserProfile {
  id?: number; name?: string; email?: string; dob?: string; location?: string;
  identifier?: string; role?: string; subscribed?: boolean; subscriptionPlanName?: string;
  phone?: string; incomes?: IncomeItem[]; expenses?: ExpenseItem[]; createdAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIME / DATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const toAmPm = (time: string): string => {
  if (!time) return "";
  const [h24, m24] = time.split(":").map(Number);
  if (isNaN(h24)) return time;
  return `${h24 % 12 || 12}:${String(m24 || 0).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
};
const fmt24to12 = (t: string): string => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const generateHourlySlots = (start: string, end: string): string[] => {
  if (!start || !end) return [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startM = sh * 60 + (isNaN(sm) ? 0 : sm);
  const endM = eh * 60 + (isNaN(em) ? 0 : em);
  const slots: string[] = [];
  for (let m = startM; m + 60 <= endM; m += 60)
    slots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return slots;
};
const normalise24 = (raw: string): string => {
  if (!raw) return "";
  const iso = raw.match(/^(\d{1,2}):(\d{2})/);
  if (iso) return `${iso[1].padStart(2, "0")}:${iso[2]}`;
  const ampm = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const m = parseInt(ampm[2] || "0");
    if (ampm[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (ampm[3].toUpperCase() === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return "";
};
const parseLocalTime = (t: any): string => {
  if (!t) return "";
  if (typeof t === "object" && t.hour !== undefined) {
    const h = String(t.hour).padStart(2, "0");
    const m = String(t.minute).padStart(2, "0");
    return `${h}:${m}`;
  };
  if (typeof t === "string") return t.substring(0, 5);
  return "";
};

// ─────────────────────────────────────────────────────────────────────────────
// DATE CAROUSEL
// ─────────────────────────────────────────────────────────────────────────────
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
interface DayItem { iso: string; day: string; date: string; month: string }
const buildDays = (n: number): DayItem[] => {
  const out: DayItem[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    out.push({
      iso: d.toISOString().split("T")[0],
      day: DAY_NAMES[d.getDay()],
      date: String(d.getDate()).padStart(2, "0"),
      month: MONTH_NAMES[d.getMonth()],
    });
  }
  return out;
};
const ALL_DAYS = buildDays(30);
const VISIBLE_DAYS = 7;
const DEFAULT_DAY = ALL_DAYS.find(d => d.day !== "SUN") ?? ALL_DAYS[0];

const resolvePhotoUrl = (path?: string | null): string => {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("blob:")) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `http://52.55.178.31:8081${clean}`;
};
const fetchMasterTimeslots = async (): Promise<MasterSlot[]> => {
  try { const data = await apiFetch(`${BASE_URL}/master-timeslots`); return Array.isArray(data) ? data : data?.content || []; }
  catch { return []; }
};
const JITSI_URL = (bookingId: number) => `https://meet.jit.si/finadvise-booking-${bookingId}`;
const PENDING_FEEDBACK_KEY = "finadvise_pending_feedback_bookingId";

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL NOTIFICATION HELPER
// ─────────────────────────────────────────────────────────────────────────────
const sendBookingEmails = async (params: {
  bookingId: number; slotDate: string; timeRange: string; meetingMode: string; amount: number;
  userName: string; userEmail: string; consultantName: string; consultantEmail: string; userNotes: string;
}): Promise<void> => {
  const jitsiLink = JITSI_URL(params.bookingId);
  try {
    await apiFetch(`${BASE_URL}/notifications/booking-confirmation`, {
      method: "POST",
      body: JSON.stringify({ ...params, jitsiLink }),
    });
  } catch {
    try {
      const body = (recipient: "user" | "consultant") => ({
        to: recipient === "user" ? params.userEmail : params.consultantEmail,
        subject: `Booking Confirmed — ${params.slotDate} · ${params.timeRange}`,
        body:
          `Hi ${recipient === "user" ? params.userName : params.consultantName},\n\n` +
          `Your session has been confirmed.\n\n📅 Date : ${params.slotDate}\n🕐 Time : ${params.timeRange}\n💻 Mode : ${params.meetingMode}\n🔗 Join : ${jitsiLink}\n` +
          (params.userNotes ? `📝 Notes: ${params.userNotes}\n` : "") + `\nThank you,\nFinAdvise Team`,
      });
      await Promise.allSettled([
        apiFetch(`${BASE_URL}/email/send`, { method: "POST", body: JSON.stringify(body("user")) }),
        apiFetch(`${BASE_URL}/email/send`, { method: "POST", body: JSON.stringify(body("consultant")) }),
      ]);
    } catch { }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TICKET_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  NEW: { label: "New", color: "#6366F1", bg: "#EEF2FF", border: "#C7D2FE", icon: "✦" },
  OPEN: { label: "Open", color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD", icon: "◉" },
  IN_PROGRESS: { label: "In Progress", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "◔" },
  PENDING: { label: "Pending", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "◔" },
  RESOLVED: { label: "Resolved", color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: "✓" },
  CLOSED: { label: "Closed", color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1", icon: "✕" },
  ESCALATED: { label: "Escalated", color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5", icon: "🚨" },
};

const TICKET_PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  LOW: { label: "Low", color: "#16A34A", bg: "#F0FDF4" },
  MEDIUM: { label: "Medium", color: "#D97706", bg: "#FFFBEB" },
  HIGH: { label: "High", color: "#EA580C", bg: "#FFF7ED" },
  URGENT: { label: "Urgent", color: "#DC2626", bg: "#FEF2F2" },
  CRITICAL: { label: "Critical", color: "#7C3AED", bg: "#F5F3FF" },
};

const TICKET_CATEGORIES = ["Billing", "Technical", "Account", "Investment", "KYC", "Consultation", "Feedback", "General", "Other"];
const TICKET_PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const TICKET_STEPS = [
  { key: "NEW", label: "Submitted", icon: "📝" },
  { key: "OPEN", label: "Assigned", icon: "👤" },
  { key: "IN_PROGRESS", label: "In Progress", icon: "⚙️" },
  { key: "RESOLVED", label: "Resolved", icon: "✅" },
  { key: "CLOSED", label: "Closed", icon: "🔒" },
];
const getStepIndex = (status: string) => {
  const idx = TICKET_STEPS.findIndex(s => s.key === status);
  if (idx === -1) {
    if (status === "PENDING") return 2;
    if (status === "ESCALATED") return 1;
  }
  return Math.max(idx, 0);
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED BADGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const Badge: React.FC<{ label: string; style: { bg: string; color: string; border: string } }> = ({ label, style }) => (
  <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
    {label.replace(/_/g, " ")}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// TICKET STEPPER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const TicketStepper: React.FC<{ status: string }> = ({ status }) => {
  const currentIdx = getStepIndex(status);
  return (
    <div style={{ padding: "16px 0 8px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", position: "relative" }}>
        <div style={{ position: "absolute", top: 16, left: 16, width: "calc(100% - 32px)", height: 2, background: "#E2E8F0", zIndex: 0 }} />
        <div style={{ position: "absolute", top: 16, left: 16, width: `calc((100% - 32px) * ${currentIdx / (TICKET_STEPS.length - 1)})`, height: 2, background: "#2563EB", zIndex: 1, transition: "width 0.4s ease" }} />
        {TICKET_STEPS.map((step, idx) => {
          const isDone = idx < currentIdx, isCurrent = idx === currentIdx;
          return (
            <div key={step.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative", zIndex: 2 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: isDone ? "#2563EB" : isCurrent ? "#EFF6FF" : "#F1F5F9", border: `2px solid ${isDone || isCurrent ? "#2563EB" : "#CBD5E1"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, boxShadow: isCurrent ? "0 0 0 4px rgba(37,99,235,0.15)" : "none" }}>
                {isDone ? <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span> : <span>{step.icon}</span>}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: isDone || isCurrent ? "#1E40AF" : "#94A3B8", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center" }}>{step.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STAR RATING COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const StarRating: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div style={{ display: "flex", gap: 4 }}>
    {[1, 2, 3, 4, 5].map(s => (
      <svg key={s} onClick={() => onChange(s)} width="28" height="28" viewBox="0 0 24 24" style={{ cursor: "pointer" }}
        fill={s <= value ? "#F59E0B" : "#E2E8F0"} stroke={s <= value ? "#D97706" : "#CBD5E1"} strokeWidth="1.5">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// CREATE TICKET MODAL  
// ─────────────────────────────────────────────────────────────────────────────
const CreateTicketModal: React.FC<{
  userId: number | null;
  onCreated: (t: Ticket) => void;
  onClose: () => void;
}> = ({ userId, onCreated, onClose }) => {
  const [form, setForm] = useState({ category: "", description: "", priority: "MEDIUM" as TicketPriority });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.category || !form.description.trim()) { setError("Category and description are required."); return; }
    if (form.description.trim().length < 10) { setError("Description must be at least 10 characters."); return; }
    setSaving(true); setError("");
    try {
      const saved = await createTicket({ userId: userId ?? 0, ...form }, file);
      onCreated(saved as Ticket);
    } catch (e: any) { setError(e.message || "Failed to create ticket."); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 20, width: 500, maxWidth: "95vw", boxShadow: "0 24px 80px rgba(0,0,0,0.3)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)", padding: "22px 24px" }}>
          <h3 style={{ margin: 0, color: "#fff", fontSize: 17, fontWeight: 800 }}>🎫 Raise a Support Ticket</h3>
          <p style={{ margin: "4px 0 0", color: "#BFDBFE", fontSize: 13 }}>Our team will respond within the SLA window.</p>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", color: "#B91C1C", fontSize: 13 }}>⚠️ {error}</div>
          )}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Category *</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer", boxSizing: "border-box" }}>
              <option value="">— Select category —</option>
              {TICKET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase" }}>
              Describe your issue * <span style={{ fontWeight: 400, color: "#94A3B8" }}>(min 10 chars)</span>
            </label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={5}
              placeholder="Please describe your issue in detail…"
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, resize: "vertical", fontFamily: "inherit", outline: "none", lineHeight: 1.6, boxSizing: "border-box" }} />
            <div style={{ fontSize: 11, color: "#94A3B8", textAlign: "right", marginTop: 4 }}>{form.description.length}/2000</div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as TicketPriority })}
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer", boxSizing: "border-box" }}>
                {[
                  { v: "LOW", l: "Low — within 72h" },
                  { v: "MEDIUM", l: "Medium — within 24h" },
                  { v: "HIGH", l: "High — within 8h" },
                  { v: "URGENT", l: "Urgent — within 4h" },
                ].map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Attachment (optional)</label>
              <input type="file" accept="image/*,.pdf,.csv,.doc,.docx,.txt" onChange={e => setFile(e.target.files?.[0] ?? null)}
                style={{ width: "100%", fontSize: 12, paddingTop: 10, color: "#374151" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSubmit} disabled={saving}
              style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: saving ? "#93C5FD" : "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", boxShadow: "0 2px 8px rgba(37,99,235,0.3)" }}>
              {saving ? "Submitting…" : "Submit Ticket"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET DETAIL MODAL
// ─────────────────────────────────────────────────────────────────────────────
const TicketDetailModal: React.FC<{
  ticket: Ticket;
  userId: number | null;
  currentUser?: { id?: number; name?: string; email?: string } | null;
  onClose: () => void;
  onFeedbackSubmit: (id: number, rating: number, text: string) => void;
  onStatusChange: (id: number, status: string) => void;
}> = ({ ticket, userId, currentUser, onClose, onFeedbackSubmit, onStatusChange }) => {
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackText, setFeedbackText] = useState("");
  const [submittingFb, setSubmittingFb] = useState(false);
  const [fbDone, setFbDone] = useState(!!ticket.feedbackRating);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sla = getSlaInfo(ticket);
  const sc = getStatusStyle(ticket.status);
  const pc = getPriorityStyle(ticket.priority);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const d = await getTicketComments(ticket.id); setComments(extractArray(d)); }
      catch { /* skip */ }
      finally { setLoading(false); }
    })();
  }, [ticket.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [comments]);

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    const optimistic: TicketComment = {
      id: Date.now(),
      ticketId: ticket.id,
      authorName: currentUser?.name || "You",
      authorRole: "CUSTOMER",
      senderId: userId ?? 0,
      message: message.trim(),
      createdAt: new Date().toISOString(),
    };
    try {
      const saved = await postTicketComment(ticket.id, message.trim(), {
        senderId: userId ?? 0,
        isConsultantReply: false,
        authorRole: "CUSTOMER",
      });
      setComments(p => [...p, (saved as TicketComment) || optimistic]);
      setMessage("");
      if (ticket.status === "NEW") onStatusChange(ticket.id, "OPEN");
    } catch {
      setComments(p => [...p, optimistic]);
      setMessage("");
    }
    finally { setSending(false); }
  };

  const handleFeedback = async () => {
    if (!feedbackRating) return;
    setSubmittingFb(true);
    try {
      await submitTicketFeedback(ticket.id, feedbackRating, feedbackText);
      setFbDone(true);
      onFeedbackSubmit(ticket.id, feedbackRating, feedbackText);
    } catch { /* skip */ }
    finally { setSubmittingFb(false); }
  };

  const canReply = !["CLOSED", "RESOLVED"].includes(ticket.status);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1200, backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 20, width: 560, maxWidth: "96vw", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.3)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)", padding: "18px 24px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#93C5FD", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>Ticket #{ticket.id}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", marginBottom: 6 }}>{ticket.category}</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <Badge label={ticket.status} style={sc} />
                <Badge label={ticket.priority} style={pc} />
              </div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          </div>
        </div>

        {sla && (
          <div style={{ padding: "9px 20px", background: sla.breached ? "#FEF2F2" : "#F0FDF4", borderBottom: `1px solid ${sla.breached ? "#FECACA" : "#BBF7D0"}`, flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: sla.breached ? "#B91C1C" : "#15803D", fontWeight: 600 }}>
              {sla.breached
                ? "⏰ Our team is working on your ticket — response time exceeded, we apologise."
                : `✅ Expected resolution by ${sla.deadlineStr}`}
            </div>
          </div>
        )}

        <div style={{ padding: "10px 20px 4px", borderBottom: "1px solid #F1F5F9", flexShrink: 0 }}>
          <TicketStepper status={ticket.status} />
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", marginBottom: 8 }}>Your Issue</div>
            <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.7, background: "#F8FAFC", padding: "10px 14px", borderRadius: 10, borderLeft: "3px solid #BFDBFE" }}>
              {ticket.description}
            </p>
            {ticket.attachmentUrl && (
              <a href={ticket.attachmentUrl} target="_blank" rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 12, color: "#2563EB", fontWeight: 600 }}>
                📎 View your attachment
              </a>
            )}
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
              Submitted {new Date(ticket.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              {ticket.agentName && ` · Assigned to ${ticket.agentName}`}
            </div>
          </div>

          <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 12 }}>💬 Conversation</div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 24, color: "#94A3B8", fontSize: 13 }}>Loading conversation…</div>
            ) : comments.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "#94A3B8", fontSize: 13, fontStyle: "italic" }}>
                No messages yet. Our team will reply here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {comments.map((c: TicketComment) => {
                  const isAgent = isStaffComment(c, userId);
                  const senderLabel = isAgent
                    ? (c.authorRole === "ADMIN" ? "🛡️ Admin" : "🧑‍💼 Consultant")
                    : (currentUser?.name || "You");
                  return (
                    <div key={c.id} style={{ display: "flex", justifyContent: isAgent ? "flex-start" : "flex-end", alignItems: "flex-end", gap: 7 }}>
                      {isAgent && (
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#1E3A5F,#2563EB)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                          🧑‍💼
                        </div>
                      )}
                      <div style={{
                        maxWidth: "75%",
                        padding: "10px 14px",
                        borderRadius: isAgent ? "4px 16px 16px 16px" : "16px 4px 16px 16px",
                        background: isAgent
                          ? "linear-gradient(135deg,#1E3A5F,#2563EB)"
                          : "linear-gradient(135deg,#EFF6FF,#DBEAFE)",
                        color: isAgent ? "#fff" : "#1E40AF",
                        boxShadow: isAgent
                          ? "0 2px 8px rgba(37,99,235,0.25)"
                          : "0 2px 6px rgba(37,99,235,0.1)",
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4, opacity: 0.75, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          {senderLabel}
                        </div>
                        <div style={{ fontSize: 13, lineHeight: 1.55 }}>{c.message}</div>
                        <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4, textAlign: "right" }}>
                          {new Date(c.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                      {!isAgent && (
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#2563EB,#60A5FA)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                          👤
                        </div>
                      )}
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {canReply && (
            <div style={{ padding: "14px 24px", borderBottom: "1px solid #F1F5F9", background: "#F8FAFC" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>Add a Message</div>
              <div style={{ display: "flex", gap: 8 }}>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="Type your message… (Enter to send)"
                  style={{ flex: 1, padding: "10px 12px", border: "1.5px solid #BFDBFE", borderRadius: 10, fontSize: 13, resize: "none", fontFamily: "inherit", outline: "none", background: "#fff" }} />
                <button onClick={handleSend} disabled={!message.trim() || sending}
                  style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: !message.trim() ? "#E2E8F0" : "#2563EB", color: !message.trim() ? "#94A3B8" : "#fff", fontSize: 13, fontWeight: 700, cursor: !message.trim() ? "default" : "pointer", alignSelf: "flex-end", flexShrink: 0 }}>
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </div>
          )}

          {ticket.status === "RESOLVED" && !fbDone && (
            <div style={{ padding: "18px 24px", background: "#FFFBEB", borderTop: "1px solid #FDE68A" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 12 }}>
                ⭐ How was your experience? Rate this resolution.
              </div>
              <StarRating value={feedbackRating} onChange={setFeedbackRating} />
              <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} rows={2}
                placeholder="Any comments? (optional)"
                style={{ width: "100%", marginTop: 12, padding: "10px 12px", border: "1.5px solid #FDE68A", borderRadius: 10, fontSize: 13, resize: "none", fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#fff" }} />
              <button onClick={handleFeedback} disabled={!feedbackRating || submittingFb}
                style={{ marginTop: 12, padding: "10px 24px", borderRadius: 10, border: "none", background: !feedbackRating ? "#E2E8F0" : "#D97706", color: !feedbackRating ? "#94A3B8" : "#fff", fontSize: 13, fontWeight: 700, cursor: !feedbackRating ? "default" : "pointer" }}>
                {submittingFb ? "Submitting…" : "Submit Feedback"}
              </button>
            </div>
          )}
          {fbDone && ticket.feedbackRating && (
            <div style={{ padding: "14px 24px", background: "#F0FDF4", borderTop: "1px solid #BBF7D0" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#15803D" }}>
                ✅ Feedback submitted — thank you! You rated this {ticket.feedbackRating}/5.
              </div>
            </div>
          )}

          {!["CLOSED", "RESOLVED"].includes(ticket.status) && (
            <div style={{ padding: "12px 24px" }}>
              <button onClick={async () => {
                try {
                  await updateTicketStatus(ticket.id, "CLOSED");
                  onStatusChange(ticket.id, "CLOSED");
                  onClose();
                } catch { /* skip */ }
              }} style={{ padding: "10px 20px", border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                🔒 Close Ticket
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT PROFILE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const AccountProfile: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name: "", email: "", dob: "", location: "", phone: "" });

  useEffect(() => {
    (async () => {
      try {
        let raw: any = null;
        try { raw = await apiFetch(`${BASE_URL}/users/me`); } catch {
          const sid = localStorage.getItem("fin_user_id");
          if (sid) try { raw = await apiFetch(`${BASE_URL}/users/${sid}`); } catch { }
        }
        if (!raw) { raw = { id: localStorage.getItem("fin_user_id"), role: localStorage.getItem("fin_role") }; }
        if (!raw) { setProfile(null); setLoading(false); return; }
        const userId = raw.id || raw.userId;
        let onboard: any = null;
        if (userId) { try { onboard = await apiFetch(`${BASE_URL}/onboarding/${userId}`); } catch { } }
        const merged = { ...raw, ...(onboard || {}) };
        const normalized: UserProfile = {
          id: merged.id, name: merged.name || merged.fullName || "",
          email: merged.email || merged.emailId || "",
          dob: merged.dob || merged.dateOfBirth || "",
          location: merged.location || merged.city || "",
          identifier: merged.identifier || merged.username || merged.email || "",
          role: merged.role || merged.userRole || "",
          subscribed: merged.subscribed ?? merged.isSubscribed ?? false,
          subscriptionPlanName: merged.subscriptionPlanName || merged.planName || "",
          phone: merged.phone || merged.phoneNumber || merged.mobile || "",
          createdAt: merged.createdAt || merged.registeredAt || "",
          incomes: (merged.incomes || merged.incomeItems || []).map((i: any) => ({ incomeType: i.incomeType || i.label || "Income", incomeAmount: i.incomeAmount ?? i.amount ?? 0 })),
          expenses: (merged.expenses || merged.expenseItems || []).map((e: any) => ({ expenseType: e.expenseType || e.label || "Expense", expenseAmount: e.expenseAmount ?? e.amount ?? 0 })),
        };
        const existingPhoto = merged.profilePhoto || merged.photo || merged.avatarUrl || "";
        if (existingPhoto) setAvatarPreview(resolvePhotoUrl(existingPhoto));
        setProfile(normalized);
        setForm({ name: normalized.name || "", email: normalized.email || "", dob: normalized.dob ? normalized.dob.substring(0, 10) : "", location: normalized.location || "", phone: normalized.phone || "" });
      } catch { setProfile(null); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!profile?.id) return;
    setSaving(true); setSaveMsg("");
    try {
      const payload = { name: form.name.trim(), email: form.email.trim(), dob: form.dob || null, location: form.location.trim(), phone: form.phone.trim() };
      const onboardingForm = new FormData();
      onboardingForm.append("data", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      if (avatarFile) onboardingForm.append("file", avatarFile);
      try { await apiFetch(`${BASE_URL}/onboarding/${profile.id}`, { method: "PUT", body: onboardingForm }); }
      catch { await apiFetch(`${BASE_URL}/users/${profile.id}`, { method: "PUT", body: JSON.stringify(payload) }); }
      setProfile(prev => prev ? { ...prev, ...form } : prev);
      setEditing(false); setSaveMsg("✅ Profile updated!"); setTimeout(() => setSaveMsg(""), 4000);
    } catch (err: any) { setSaveMsg(`❌ ${err.message}`); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 48, color: "#94A3B8" }}>Loading profile…</div>;
  if (!profile) return <div style={{ textAlign: "center", padding: 48, color: "#94A3B8" }}>Could not load profile.</div>;

  const isPremium = profile.subscribed === true || ["SUBSCRIBER", "SUBSCRIBED", "PREMIUM"].includes((profile.role || "").toUpperCase());
  const initials = (profile.name || "U").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const totalIncome = (profile.incomes || []).reduce((s, i) => s + (Number(i.incomeAmount) || 0), 0);
  const totalExpense = (profile.expenses || []).reduce((s, e) => s + (Number(e.expenseAmount) || 0), 0);
  const fmtDate = (d?: string) => { if (!d) return "—"; try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid #BFDBFE", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#F8FBFF", color: "#1E293B", boxSizing: "border-box" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#2563EB", fontSize: 22, padding: 0 }}>←</button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1E293B", flex: 1 }}>Account Profile</h2>
        {!editing
          ? <button onClick={() => setEditing(true)} style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #2563EB", background: "#EFF6FF", color: "#2563EB", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✏️ Edit</button>
          : <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setEditing(false)} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: saving ? "#93C5FD" : "#2563EB", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>{saving ? "Saving…" : "💾 Save"}</button>
          </div>
        }
      </div>
      {saveMsg && <div style={{ padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600, background: saveMsg.startsWith("✅") ? "#F0FDF4" : "#FEF2F2", color: saveMsg.startsWith("✅") ? "#16A34A" : "#DC2626", border: `1px solid ${saveMsg.startsWith("✅") ? "#BBF7D0" : "#FECACA"}` }}>{saveMsg}</div>}

      <div style={{ borderRadius: 20, padding: "28px 24px 24px", marginBottom: 16, background: isPremium ? "linear-gradient(135deg,#92400E,#D97706)" : "linear-gradient(135deg,#1E3A5F,#2563EB)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "3px solid rgba(255,255,255,0.45)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800, color: "#fff", overflow: "hidden" }}>
              {avatarPreview ? <img src={avatarPreview} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
            </div>
            {editing && <div onClick={() => avatarInputRef.current?.click()} style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><span style={{ fontSize: 20 }}>📷</span></div>}
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>{editing ? form.name : profile.name || "User"}</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", margin: "0 0 10px" }}>{profile.email}</p>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 14px", borderRadius: 100, fontSize: 11, fontWeight: 800, textTransform: "uppercase", background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.45)", color: "#fff" }}>
              {isPremium ? "✦ Premium Member" : "○ Free Account"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid #F1F5F9", fontWeight: 700, fontSize: 13, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>👤 Personal Details</div>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 20px" }}>
            {([{ label: "Full Name", key: "name", type: "text" }, { label: "Email", key: "email", type: "email" }, { label: "Date of Birth", key: "dob", type: "date" }, { label: "Location", key: "location", type: "text" }, { label: "Phone", key: "phone", type: "tel" }] as const).map(field => (
              <div key={field.key}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{field.label}</label>
                <input type={field.type} value={(form as any)[field.key]} onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {[{ label: "Email", value: profile.email || "—" }, { label: "Date of Birth", value: fmtDate(profile.dob) }, { label: "Location", value: profile.location || "—" }, { label: "Phone", value: profile.phone || "—" }, { label: "Plan", value: profile.subscriptionPlanName || (isPremium ? "Premium" : "Free") }, { label: "Member Since", value: fmtDate(profile.createdAt) }].map(d => (
              <div key={d.label} style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", borderRight: "1px solid #F1F5F9" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{d.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{d.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(profile.incomes?.length || profile.expenses?.length) ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div style={{ borderRadius: 12, padding: 16, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#15803D", marginBottom: 6 }}>💰 Total Income</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#16A34A" }}>₹{totalIncome.toLocaleString()}</div>
          </div>
          <div style={{ borderRadius: 12, padding: 16, background: "#FEF2F2", border: "1px solid #FECACA" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#B91C1C", marginBottom: 6 }}>💸 Total Expenses</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#DC2626" }}>₹{totalExpense.toLocaleString()}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COLLAPSIBLE ABOUT COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const LINE_LEN = 53;
const CardAbout: React.FC<{ about: string }> = ({ about }) => {
  const [expanded, setExpanded] = useState(false);
  const clean = about.trim();
  const cut1 = (() => { if (clean.length <= LINE_LEN) return clean.length; const idx = clean.lastIndexOf(" ", LINE_LEN); return idx > 20 ? idx : LINE_LEN; })();
  const rest1 = clean.substring(cut1).trimStart();
  const cut2 = (() => { if (rest1.length <= LINE_LEN) return rest1.length; const idx = rest1.lastIndexOf(" ", LINE_LEN); return idx > 10 ? idx : LINE_LEN; })();
  const line1 = clean.substring(0, cut1).trimEnd();
  const line2 = rest1.substring(0, cut2).trimEnd();
  const hasMore = clean.length > cut1 + cut2;
  const preview = expanded ? clean : (hasMore ? `${line1}\n${line2}…` : clean);
  return (
    <div style={{ margin: "4px 0 4px", padding: 0, background: "transparent", border: "none", width: "100%" }}>
      <p style={{ margin: 0, fontSize: 12, color: "#64748B", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{preview}</p>
      {hasMore && <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }} style={{ background: "none", border: "none", color: "#2563EB", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "1px 0 0", letterSpacing: "0.01em", display: "block" }}>{expanded ? "Show less ↑" : "View more ↓"}</button>}
    </div>
  );
};

const ProfileAbout: React.FC<{ about: string }> = ({ about }) => {
  const [expanded, setExpanded] = useState(false);
  const words = about.split(" ");
  const isLong = words.length > 28;
  const preview = isLong && !expanded ? words.slice(0, 28).join(" ") + "…" : about;
  return (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: "#1E293B", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>About</h3>
      <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.7, margin: "0 0 4px" }}>{preview}</p>
      {isLong && <button onClick={() => setExpanded(v => !v)} style={{ background: "none", border: "none", color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "2px 0", letterSpacing: "0.02em" }}>{expanded ? "Show less ↑" : "View more ↓"}</button>}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function UserPage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<"consultants" | "bookings" | "tickets" | "notifications" | "settings">("consultants");

  const [userNotifs, setUserNotifs] = useState<any[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Consultants");
  const [toast, setToast] = useState("");

  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingFilter, setBookingFilter] = useState<"UPCOMING" | "HISTORY">("UPCOMING");
  const [deletingBookingId, setDeletingBookingId] = useState<number | null>(null);
  const [loading, setLoading] = useState({ consultants: true, bookings: false, slots: false, tickets: false });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const [currentUser, setCurrentUser] = useState<{ id?: number; name?: string; email?: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [masterSlots, setMasterSlots] = useState<MasterSlot[]>([]);
  const [dbTimeslots, setDbTimeslots] = useState<TimeSlotRecord[]>([]);
  const [bookedSlotSet, setBookedSlotSet] = useState<Set<string>>(new Set());
  const [dayOffset, setDayOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<DayItem>(DEFAULT_DAY);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [meetingMode, setMeetingMode] = useState<"ONLINE" | "PHYSICAL" | "PHONE">("ONLINE");
  const [userNotes, setUserNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  const [profileConsultant, setProfileConsultant] = useState<Consultant | null>(null);
  const [settingsView, setSettingsView] = useState<"menu" | "profile">("menu");
  const [showSubPopup, setShowSubPopup] = useState(false);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<"ALL" | TicketStatus>("ALL");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCreateTicket, setShowCreateTicket] = useState(false);

  const [feedbackModal, setFeedbackModal] = useState<FeedbackData | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackHover, setFeedbackHover] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [submittedFeedbacks, setSubmittedFeedbacks] = useState<Set<number>>(new Set());

  const categories = ["All Consultants", "Tax Experts", "Investment", "Wealth", "Retirement"];
  const visibleDays = ALL_DAYS.slice(dayOffset, dayOffset + VISIBLE_DAYS);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };
  const spinnerStyle: React.CSSProperties = { width: 28, height: 28, border: "3px solid #DBEAFE", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" };

  const upcomingBookings = bookings.filter(b => { const st = (b.BookingStatus || "").toUpperCase(); if (st === "COMPLETED" || st === "CANCELLED") return false; return !isBookingExpired(b, now); });
  const historyBookings = bookings.filter(b => { const st = (b.BookingStatus || "").toUpperCase(); if (st === "COMPLETED" || st === "CANCELLED") return true; return isBookingExpired(b, now); });
  const displayedBookings = bookingFilter === "UPCOMING" ? upcomingBookings : historyBookings;

  const ticketCounts = {
    ALL: tickets.length,
    NEW: tickets.filter(t => t.status === "NEW").length,
    OPEN: tickets.filter(t => t.status === "OPEN").length,
    IN_PROGRESS: tickets.filter(t => t.status === "IN_PROGRESS").length,
    PENDING: tickets.filter(t => t.status === "PENDING").length,
    RESOLVED: tickets.filter(t => t.status === "RESOLVED").length,
    CLOSED: tickets.filter(t => t.status === "CLOSED").length,
    ESCALATED: tickets.filter(t => t.status === "ESCALATED").length,
  };
  const STATUS_FILTERS = ["ALL", "NEW", "OPEN", "IN_PROGRESS", "PENDING", "RESOLVED", "CLOSED", "ESCALATED"] as const;
  const filteredTickets = ticketFilter === "ALL" ? tickets : tickets.filter(t => t.status === ticketFilter);

  const unreadNotifCount = userNotifs.filter((n: any) => !n.read).length;

  // ─────────────────────────────────────────────────────────────────────────
  // FETCHERS
  // ─────────────────────────────────────────────────────────────────────────
  const mapConsultant = (d: any): Consultant => {
    let avatar = resolvePhotoUrl(d.profilePhoto || d.photo || d.avatarUrl || "");
    if (!avatar) avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name || "C")}&background=2563EB&color=fff&bold=true`;
    return {
      id: d.id, name: d.name || "Expert Consultant", role: d.designation || "Financial Consultant",
      fee: Number(d.charges || 0), tags: Array.isArray(d.skills) ? d.skills : [],
      rating: Number(d.rating || 4.8), exp: Number(d.experience || d.yearsOfExperience || 5),
      reviews: Number(d.reviewCount || d.totalReviews || 120), avatar,
      shiftStartTime: parseLocalTime(d.shiftStartTime || d.shift_start_time || d.shiftStart),
      shiftEndTime: parseLocalTime(d.shiftEndTime || d.shift_end_time || d.shiftEnd),
      shiftTimings: d.shiftTimings || "", location: d.location || d.city || "Hyderabad",
      about: d.about || d.bio || d.description || "", languages: d.languages || "", phone: d.phone || "",
      email: d.email || d.emailId || d.emailAddress || "",
    };
  };

  const fetchConsultants = async () => {
    setLoading(p => ({ ...p, consultants: true }));
    try { const res = await getAllConsultants(); setConsultants((Array.isArray(res) ? res : []).map(mapConsultant)); }
    catch { showToast("Could not load consultants."); }
    finally { setLoading(p => ({ ...p, consultants: false })); }
  };

  const fetchBookings = async () => {
    setLoading(p => ({ ...p, bookings: true }));
    try {
      const [raw, masters] = await Promise.all([getMyBookings(), fetchMasterTimeslots()]);
      if (!Array.isArray(raw)) { setBookings([]); return; }
      const masterMap: Record<string, string> = {};
      masters.forEach((ms: any) => { masterMap[String(ms.id)] = ms.timeRange; });
      const uniqueSlotIds = [...new Set(raw.map((b: any) => b.timeSlotId).filter(Boolean))] as number[];
      const slotDetailMap: Record<number, TimeSlotRecord> = {};
      await Promise.all(uniqueSlotIds.map(id =>
        apiFetch(`${BASE_URL}/timeslots/${id}`).then((s: any) => { slotDetailMap[id] = s; }).catch(() => { })
      ));
      const mapped = raw.map((b: any) => {
        const slotDetail = slotDetailMap[b.timeSlotId];
        const slotDate = slotDetail?.slotDate || b.bookingDate || b.slotDate || b.date || b.booking_date || "";
        const slotTime = (slotDetail?.slotTime || b.slotTime || "").substring(0, 5);
        const masterIdCandidates = [
          slotDetail?.masterTimeSlotId,
          b.masterTimeslotId,
          b.masterSlotId,
        ].filter(v => v != null);

        let timeRange: string = b.timeRange || b.time_range || (slotDetail as any)?.timeRange || "";

        if (!timeRange) {
          for (const c of masterIdCandidates) {
            if (masterMap[String(c)]) { timeRange = masterMap[String(c)]; break; }
          }
        }

        if (!timeRange && slotTime) {
          const [h, m] = slotTime.split(":").map(Number);
          const endH = (h + 1) % 24;
          const endStr = `${String(endH).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
          timeRange = `${fmt24to12(slotTime)} - ${fmt24to12(endStr)}`;
        }
        return { ...b, consultantName: b.consultantName || b.consultant?.name || b.advisorName || "Loading…", slotDate, slotTime, timeRange, meetingMode: b.meetingMode || b.meeting_mode || "", BookingStatus: (b.BookingStatus || b.bookingStatus || b.status || "PENDING").toUpperCase() };
      });
      mapped.sort((a: any, b: any) => (b.slotDate || "").localeCompare(a.slotDate || ""));
      setBookings(mapped);
      const needsName = mapped.filter((b: any) => b.consultantName === "Loading…" && b.consultantId);
      if (needsName.length > 0) {
        const ids = [...new Set(needsName.map((b: any) => b.consultantId))] as number[];
        const cMap: Record<number, any> = {};
        await Promise.all(ids.map(id => getConsultantById(id).then(d => { cMap[id] = d; }).catch(() => { })));
        setBookings(prev => prev.map(b => ({ ...b, consultantName: cMap[(b as any).consultantId]?.name || b.consultantName })));
      }
    } catch { setBookings([]); }
    finally { setLoading(p => ({ ...p, bookings: false })); }
  };

  const fetchTickets = async () => {
    setLoading(p => ({ ...p, tickets: true }));
    try {
      const data = await getTicketsByUser(currentUserId ?? 0);
      setTickets(extractArray(data).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as Ticket[]);
    } catch { showToast("Failed to load tickets."); }
    finally { setLoading(p => ({ ...p, tickets: false })); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // INIT & LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchConsultants();
    (async () => {
      try {
        const user = await getCurrentUser();
        const uid = user?.id ? Number(user.id) : null;
        if (uid) {
          setCurrentUserId(uid);
          try {
            const stored = JSON.parse(localStorage.getItem(`fin_notifs_USER_${uid}`) || "[]");
            setUserNotifs(stored);
          } catch { }
        }
        setCurrentUser({ id: uid ?? undefined, name: user?.name || user?.fullName || "", email: user?.email || user?.emailId || "" });
        const userRole = String(user?.role || "").trim().toUpperCase();
        if (["SUBSCRIBER", "SUBSCRIBED", "PREMIUM"].includes(userRole)) {
          if (!sessionStorage.getItem("sub_popup_shown")) { setShowSubPopup(true); sessionStorage.setItem("sub_popup_shown", "true"); }
        }
        if (uid) {
          const t = await getTicketsByUser(uid);
          setTickets(extractArray(t).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as Ticket[]);
        }
      } catch { }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (tab === "bookings") fetchBookings(); }, [tab]);
  useEffect(() => {
    if (tab === "tickets") fetchTickets();
    if (tab === "settings") setSettingsView("menu");
  }, [tab]);

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const raw = localStorage.getItem(PENDING_FEEDBACK_KEY); if (!raw) return;
      localStorage.removeItem(PENDING_FEEDBACK_KEY);
      const bookingId = Number(raw); if (!bookingId) return;
      setTab("bookings");
      const findAndOpen = (list: Booking[]) => { const found = (list as any[]).find((b: any) => b.id === bookingId); if (found) { setTimeout(() => handleOpenFeedback(found), 300); return true; } return false; };
      if (!findAndOpen(bookings)) {
        setLoading(p => ({ ...p, bookings: true }));
        try {
          const raw2 = await getMyBookings();
          if (!Array.isArray(raw2)) return;
          const mapped = raw2.map((b: any) => ({ ...b, BookingStatus: (b.BookingStatus || b.status || "PENDING").toUpperCase(), slotDate: b.bookingDate || b.slotDate || "", timeRange: b.timeRange || (b.slotTime ? toAmPm(b.slotTime) : "") }));
          setBookings(mapped as Booking[]); findAndOpen(mapped as Booking[]);
        } finally { setLoading(p => ({ ...p, bookings: false })); }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  // ─────────────────────────────────────────────────────────────────────────
  // HANDLERS
  // ─────────────────────────────────────────────────────────────────────────
  const handleDeleteBooking = async (bookingId: number) => {
    if (!window.confirm("Delete this booking? This cannot be undone.")) return;
    setDeletingBookingId(bookingId);
    try {
      const token = getToken();
      const res = await fetch(`${BASE_URL}/bookings/${bookingId}`, { method: "DELETE", headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (res.ok || res.status === 204) { setBookings(prev => prev.filter(b => b.id !== bookingId)); showToast("✅ Booking deleted."); }
      else showToast("❌ Could not delete booking.");
    } catch { showToast("❌ Network error."); }
    finally { setDeletingBookingId(null); }
  };

  const handleOpenFeedback = async (b: any) => {
    let existingFeedback = null;
    try { existingFeedback = await apiFetch(`${BASE_URL}/feedbacks/booking/${b.id}`); } catch { }
    setFeedbackModal({ bookingId: b.id, consultantId: b.consultantId, consultantName: b.consultantName || "Consultant", slotDate: b.slotDate || b.bookingDate || "", timeRange: b.timeRange || (b.slotTime ? toAmPm(b.slotTime) : ""), existingFeedback: existingFeedback || null });
    setFeedbackRating(existingFeedback?.rating || 0);
    setFeedbackComment(existingFeedback?.comments || "");
    setFeedbackHover(0);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackModal || feedbackRating === 0) { showToast("⚠️ Please select a star rating."); return; }
    setSubmittingFeedback(true);
    try {
      const user = await getCurrentUser();
      if (!user?.id) { showToast("Unable to identify user."); return; }
      const payload = { userId: user.id, consultantId: feedbackModal.consultantId, meetingId: feedbackModal.bookingId, bookingId: feedbackModal.bookingId, rating: feedbackRating, comments: feedbackComment.trim() || "" };
      if (feedbackModal.existingFeedback?.id) { await apiFetch(`${BASE_URL}/feedbacks/${feedbackModal.existingFeedback.id}`, { method: "PUT", body: JSON.stringify(payload) }); showToast("✅ Feedback updated!"); }
      else { await apiFetch(`${BASE_URL}/feedbacks`, { method: "POST", body: JSON.stringify(payload) }); showToast("✅ Thank you for your feedback!"); }
      setSubmittedFeedbacks(prev => new Set([...prev, feedbackModal.bookingId]));
      setFeedbackModal(null); setFeedbackRating(0); setFeedbackComment("");
    } catch (err: any) { showToast(`❌ ${err.message}`); }
    finally { setSubmittingFeedback(false); }
  };

  const handleOpenModal = async (c: Consultant) => {
    setSelectedConsultant(c); setMasterSlots([]); setDbTimeslots([]);
    setBookedSlotSet(new Set()); setDayOffset(0); setSelectedDay(DEFAULT_DAY);
    setSelectedSlot(null); setMeetingMode("ONLINE"); setUserNotes(""); setShowModal(true);
    setLoading(p => ({ ...p, slots: true }));
    try {
      const [masters, bookingsRaw] = await Promise.all([fetchMasterTimeslots(), apiFetch(`${BASE_URL}/bookings/consultant/${c.id}`).catch(() => [])]);
      setMasterSlots(Array.isArray(masters) ? masters : []);
      let tsRecords: TimeSlotRecord[] = [];
      try {
        const tsData = await apiFetch(`${BASE_URL}/timeslots/consultant/${c.id}`);
        tsRecords = Array.isArray(tsData) ? tsData : (tsData?.content || []);
        setDbTimeslots(tsRecords);
      } catch { }

      const bSet = new Set<string>();

      // --- FIX 1: Add user's OWN existing bookings to prevent double-booking ---
      // This prevents the user from trying to book a time they are already busy
      bookings.forEach((userBooking: any) => {
        const st = (userBooking.BookingStatus || userBooking.status || "").toUpperCase();
        if (st === "CANCELLED" || st === "COMPLETED") return; // Ignore past or cancelled
        const date = userBooking.slotDate || userBooking.bookingDate || userBooking.date || "";
        let timeKey = "";
        if (userBooking.slotTime) { timeKey = userBooking.slotTime.substring(0, 5); }
        else { timeKey = normalise24(userBooking.timeRange || ""); }
        if (date && timeKey) bSet.add(`${date}|${timeKey}`);
      });

      // --- Add Consultant's existing bookings ---
      const bArr = Array.isArray(bookingsRaw) ? bookingsRaw : (bookingsRaw?.content || []);
      bArr.forEach((b: any) => {
        const st = (b.status || b.BookingStatus || b.bookingStatus || "").toUpperCase();
        if (st === "CANCELLED") return;
        const date = b.slotDate || b.bookingDate || b.date || "";
        let timeKey = "";
        if (b.slotTime) { timeKey = b.slotTime.substring(0, 5); }
        else { const tr = b.timeSlot?.masterTimeSlot?.timeRange || b.masterTimeSlot?.timeRange || b.timeRange || ""; timeKey = normalise24(tr); }
        if (date && timeKey) bSet.add(`${date}|${timeKey}`);
      });

      // --- Add Consultant's blocked/booked timeslots ---
      tsRecords.forEach(s => {
        const st = (s.status || "").toUpperCase(); if (st === "AVAILABLE") return;
        const rawTime = (s as any).slotTime || (s as any).slot_time || "";
        let timeKey = "";
        if (typeof rawTime === "object" && rawTime?.hour !== undefined) { timeKey = `${String(rawTime.hour).padStart(2, "0")}:${String(rawTime.minute ?? 0).padStart(2, "0")}`; }
        else if (typeof rawTime === "string" && rawTime.length >= 5) { timeKey = rawTime.substring(0, 5); }
        if (!timeKey) timeKey = normalise24((s as any).timeRange || "");
        if (s.slotDate && timeKey) bSet.add(`${s.slotDate}|${timeKey}`);
      });
      setBookedSlotSet(bSet);
    } catch (e) { console.error("Modal data load failed:", e); }
    finally { setLoading(p => ({ ...p, slots: false })); }
  };

  const handleConfirm = async () => {
    if (!selectedSlot || !selectedConsultant) return;
    setConfirming(true);
    try {
      const slot24 = selectedSlot.start24h;
      const token = getToken();

      const fetchTimeslotId = async (): Promise<number | null> => {
        try {
          const data = await apiFetch(`${BASE_URL}/timeslots/consultant/${selectedConsultant.id}`);
          const arr: TimeSlotRecord[] = Array.isArray(data) ? data : (data?.content || []);
          const match = arr.find(s => s.slotDate === selectedDay.iso && (s.slotTime || "").substring(0, 5) === slot24);
          return match?.id ?? null;
        } catch { return null; }
      };

      // 2. Resolve or Create Master ID dynamically
      let effectiveMasterId = selectedSlot.masterId;
      if (!effectiveMasterId || effectiveMasterId === 0) {
        const fallbackMaster = masterSlots.find(ms => normalise24(ms.timeRange) === slot24);
        if (fallbackMaster) {
          effectiveMasterId = fallbackMaster.id;
        } else {
          // FIX: Create Master Timeslot on the fly if it doesn't exist
          try {
            const newMasterRes = await fetch(`${BASE_URL}/master-timeslots`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({ timeRange: selectedSlot.label })
            });
            if (newMasterRes.ok) {
              const newMaster = await newMasterRes.json();
              if (newMaster?.id) effectiveMasterId = newMaster.id;
            } else {
              console.error("Failed to create master timeslot:", await newMasterRes.text());
            }
          } catch (e) {
            console.error("Error creating master timeslot:", e);
          }
        }
      }

      // Try to get an existing timeslot ID
      let realTimeslotId: number | null = selectedSlot.timeslotId ?? null;
      if (!realTimeslotId) realTimeslotId = await fetchTimeslotId();

      // 3. Create actual Timeslot using the effectiveMasterId
      if (!realTimeslotId && effectiveMasterId > 0) {
        try {
          // No slotTimeObj needed at all — delete those 5 lines

          const singlePayload = {
            consultantId: selectedConsultant.id,
            slotDate: selectedDay.iso,
            durationMinutes: 60,       // ← matches your working curl exactly
            masterTimeSlotId: effectiveMasterId,
            status: "AVAILABLE",
          };
          const singleRes = await fetch(`${BASE_URL}/timeslots`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(singlePayload),
          });

          if (singleRes.ok) {
            const ct = singleRes.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const created = await singleRes.json();
              if (created?.id) realTimeslotId = created.id;
            }
          } else {
            console.error("Failed to create timeslot:", await singleRes.text());
          }
        } catch (e) {
          console.error("Error creating timeslot:", e);
        }

        // Re-check in case it was created successfully
        if (!realTimeslotId) realTimeslotId = await fetchTimeslotId();
      }

      // 🚨 CRITICAL FIX: If we STILL don't have a timeSlotId, ABORT the booking
      if (!realTimeslotId) {
        showToast("❌ Could not create time slot. Please try again.");
        setConfirming(false);
        return;
      }

      // 4. Proceed with booking using the valid realTimeslotId
      const payload: any = {
        consultantId: selectedConsultant.id,
        timeSlotId: realTimeslotId,
        amount: selectedConsultant.fee,
        userNotes: userNotes || "Booked via app",
        meetingMode,
      };
      const bookingResult = await createBooking(payload);
      const newBookingId: number = bookingResult?.id ?? bookingResult?.bookingId ?? Date.now();

      // Update UI state
      setBookedSlotSet(prev => { const next = new Set(prev); next.add(`${selectedDay.iso}|${slot24}`); return next; });
      setDbTimeslots(prev => {
        const existing = prev.find(s => s.slotDate === selectedDay.iso && (s.slotTime || "").substring(0, 5) === slot24);
        if (existing) return prev.map(s => s.slotDate === selectedDay.iso && (s.slotTime || "").substring(0, 5) === slot24 ? { ...s, status: "BOOKED" } : s);
        return [...prev, { id: realTimeslotId!, slotDate: selectedDay.iso, slotTime: `${slot24}:00`, status: "BOOKED", masterTimeSlotId: effectiveMasterId > 0 ? effectiveMasterId : undefined }];
      });

      setShowModal(false);
      showToast(`✅ Booked for ${selectedDay.date} ${selectedDay.month} · ${selectedSlot.label}`);
      setTab("bookings");
      fetchBookings();

      let consultantEmail = selectedConsultant.email || "";
      if (!consultantEmail) { try { const cData = await getConsultantById(selectedConsultant.id); consultantEmail = cData?.email || cData?.emailId || cData?.emailAddress || ""; } catch { } }
      sendBookingEmails({ bookingId: newBookingId, slotDate: selectedDay.iso, timeRange: selectedSlot.label, meetingMode, amount: selectedConsultant.fee, userName: currentUser?.name || "User", userEmail: currentUser?.email || "", consultantName: selectedConsultant.name, consultantEmail, userNotes: userNotes || "" }).catch(() => { });

    } catch (err: any) {
      const msg = (err.message || "").toLowerCase();
      if (msg.includes("already have a booking") || msg.includes("already booked")) {
        showToast("⚠️ You already have a session booked at this time. Please pick another.");
      } else if (msg.includes("no longer available") || msg.includes("conflict") || msg.includes("409")) {
        showToast("⚠️ Time conflict or slot just taken. Please pick another time.");
        if (selectedConsultant) handleOpenModal(selectedConsultant);
      } else {
        showToast(`❌ Booking failed: ${err.message}`);
      }
    } finally { setConfirming(false); }
  };
  const handleLogout = () => { logoutUser(); navigate("/login", { replace: true }); };
  const handleGoToProfile = () => { setTab("settings"); setSettingsView("profile"); };

  const filteredList = consultants.filter(c => {
    const q = search.toLowerCase();
    return (c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q)) && (category === "All Consultants" || c.role.includes(category.replace(" Experts", "")));
  });

  const hourlySlotTimes = generateHourlySlots(
    (selectedConsultant?.shiftStartTime || "").substring(0, 5),
    (selectedConsultant?.shiftEndTime || "").substring(0, 5)
  );
  const hasShift = !!(selectedConsultant?.shiftStartTime && selectedConsultant?.shiftEndTime && hourlySlotTimes.length > 0);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logoSection}>
          <div className={styles.logoText}>FINADVISE</div>
          <div className={styles.logoSub}>CONSULTANT BOOKING</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

          {/* 🔔 Notification Bell */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowNotifPanel(p => !p)}
              title="Notifications"
              style={{ position: "relative", width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #BFDBFE", background: "#EFF6FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}
            >
              🔔
              {unreadNotifCount > 0 && (
                <span style={{ position: "absolute", top: -3, right: -3, background: "#DC2626", color: "#fff", borderRadius: "50%", width: 15, height: 15, fontSize: 8, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #EFF6FF" }}>
                  {unreadNotifCount}
                </span>
              )}
            </button>

            {showNotifPanel && (
              <div style={{ position: "fixed", top: 60, right: 12, width: "min(340px,calc(100vw - 24px))", maxHeight: 420, background: "#fff", borderRadius: 16, border: "1.5px solid #E2E8F0", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", zIndex: 3000, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: "linear-gradient(135deg,#1E3A5F,#2563EB)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                  <div>
                    <span style={{ fontWeight: 800, fontSize: 13, color: "#fff" }}>My Notifications</span>
                    {unreadNotifCount > 0 && <div style={{ fontSize: 10, color: "#BFDBFE", marginTop: 1 }}>{unreadNotifCount} unread</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {unreadNotifCount > 0 && (
                      <button onClick={() => {
                        const updated = userNotifs.map((n: any) => ({ ...n, read: true }));
                        setUserNotifs(updated);
                        if (currentUserId) localStorage.setItem(`fin_notifs_USER_${currentUserId}`, JSON.stringify(updated));
                      }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                        Mark all read
                      </button>
                    )}
                    <button onClick={() => setShowNotifPanel(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: "50%", width: 22, height: 22, fontSize: 14, cursor: "pointer" }}>×</button>
                  </div>
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {userNotifs.length === 0 ? (
                    <div style={{ padding: "30px 20px", textAlign: "center", color: "#94A3B8" }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🔔</div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>No notifications yet</div>
                    </div>
                  ) : userNotifs.map((n: any) => {
                    const cfgMap: Record<string, { color: string; bg: string; icon: string }> = {
                      info: { color: "#2563EB", bg: "#EFF6FF", icon: "ℹ️" },
                      success: { color: "#16A34A", bg: "#F0FDF4", icon: "✅" },
                      warning: { color: "#D97706", bg: "#FFFBEB", icon: "⚠️" },
                      error: { color: "#DC2626", bg: "#FEF2F2", icon: "🚨" },
                    };
                    const c = cfgMap[n.type] || cfgMap.info;
                    const diff = Math.floor((Date.now() - new Date(n.timestamp).getTime()) / 1000);
                    const timeStr = diff < 60 ? "just now" : diff < 3600 ? `${Math.floor(diff / 60)}m ago` : `${Math.floor(diff / 3600)}h ago`;
                    return (
                      <div key={n.id} style={{ padding: "12px 16px", borderBottom: "1px solid #F8FAFC", background: n.read ? "#fff" : c.bg, display: "flex", gap: 10, alignItems: "flex-start", cursor: n.ticketId ? "pointer" : "default" }}
                        onClick={() => {
                          const updated = userNotifs.map((x: any) => x.id === n.id ? { ...x, read: true } : x);
                          setUserNotifs(updated);
                          if (currentUserId) localStorage.setItem(`fin_notifs_USER_${currentUserId}`, JSON.stringify(updated));
                          if (n.ticketId) { setTab("tickets"); setShowNotifPanel(false); }
                        }}>
                        <span style={{ fontSize: 16, flexShrink: 0, lineHeight: "1.2" }}>{c.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: c.color, marginBottom: 2 }}>
                            {n.title}
                            {!n.read && <span style={{ marginLeft: 5, width: 5, height: 5, borderRadius: "50%", background: c.color, display: "inline-block", verticalAlign: "middle" }} />}
                          </div>
                          <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5, wordBreak: "break-word" }}>{n.message}</div>
                          {n.ticketId && <div style={{ fontSize: 10, color: "#2563EB", fontWeight: 600, marginTop: 3 }}>Tap to view ticket →</div>}
                          <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 4 }}>{timeStr}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Profile button */}
          <button onClick={handleGoToProfile} title="My Profile"
            style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #BFDBFE", background: "linear-gradient(135deg,#1E3A5F,#2563EB)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(37,99,235,0.25)", transition: "transform 0.15s" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>
          </button>
          <button onClick={handleLogout} className={styles.backBtn}>Logout</button>
        </div>
      </header>

      {toast && <div className={styles.toast}>{toast}</div>}

      <main className={styles.content}>

        {/* ════ CONSULTANTS ════ */}
        {tab === "consultants" && (
          <div className={styles.tabPadding}>
            <div className={styles.searchWrapper}>
              <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" /></svg>
              <input className={styles.searchInput} placeholder="Search by name, specialisation..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className={styles.categoryRow}>
              {categories.map(c => <button key={c} onClick={() => setCategory(c)} className={`${styles.categoryBtn} ${category === c ? styles.categoryBtnActive : ""}`}>{c}</button>)}
            </div>
            {loading.consultants ? (
              <div className={styles.emptyState}><div className={styles.spinner} /><p style={{ color: "#94A3B8", marginTop: 12, fontSize: 14 }}>Loading consultants…</p></div>
            ) : filteredList.length === 0 ? (
              <div className={styles.emptyState}><div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div><p style={{ margin: 0, fontWeight: 600 }}>No consultants found.</p></div>
            ) : (
              <div className={styles.consultantList}>
                {filteredList.map(c => (
                  <div key={c.id} className={styles.consultantCard}>
                    <div style={{ width: 72, height: 72, borderRadius: "50%", flexShrink: 0, background: "linear-gradient(135deg,#1E3A5F,#2563EB)", border: "3px solid #DBEAFE", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "#fff", alignSelf: "center" }}>
                      {c.avatar ? <img src={c.avatar} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : c.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 2 }}>{c.name}</div>
                      <div style={{ fontSize: 13, color: "#2563EB", fontWeight: 600, marginBottom: 6 }}>{c.role}</div>
                      {c.tags.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>{c.tags.slice(0, 3).map((t, i) => <span key={i} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "#EFF6FF", color: "#2563EB", fontWeight: 600 }}>{t}</span>)}</div>}
                      {c.about && <CardAbout about={c.about} />}
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                        {c.exp > 0 && <span style={{ fontSize: 12, color: "#64748B" }}>⏱ {c.exp}+ yrs</span>}
                        <span style={{ fontSize: 12, color: "#64748B" }}>⭐ {c.rating.toFixed(1)}{c.reviews > 0 ? ` (${c.reviews})` : ""}</span>
                        <span style={{ fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 3 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3" /><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /></svg>
                          {c.location}
                        </span>
                        {c.languages && <span style={{ fontSize: 12, color: "#64748B" }}>🌐 {c.languages}</span>}
                      </div>
                    </div>
                    <div className={styles.cardRight}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", whiteSpace: "nowrap" }}>₹{c.fee.toLocaleString()}<span style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginLeft: 3 }}>/session</span></div>
                      <button className={styles.viewProfileBtn} onClick={() => setProfileConsultant(c)}>View Profile</button>
                      <button className={styles.bookBtn} onClick={() => handleOpenModal(c)}>Book Now</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ BOOKINGS ════ */}
        {tab === "bookings" && (
          <div className={styles.tabPadding}>
            <div className={styles.titleSection}>
              <h2 className={styles.sectionTitle}>My Bookings</h2>
              <button className={styles.historyButton} onClick={fetchBookings} disabled={loading.bookings} style={{ display: "flex", alignItems: "center", gap: 6 }}>{loading.bookings ? "⏳" : "↻"} Refresh</button>
            </div>
            {/* Upcoming / History toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {(["UPCOMING", "HISTORY"] as const).map(f => (
                <button key={f} onClick={() => setBookingFilter(f)} style={{ padding: "8px 20px", borderRadius: 20, border: "1.5px solid", borderColor: bookingFilter === f ? "#2563EB" : "#E2E8F0", background: bookingFilter === f ? "#2563EB" : "#fff", color: bookingFilter === f ? "#fff" : "#64748B", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {f === "UPCOMING" ? `📅 Upcoming (${upcomingBookings.length})` : `🕐 History (${historyBookings.length})`}
                </button>
              ))}
            </div>
            {loading.bookings ? (
              <div style={{ textAlign: "center", padding: 40 }}><div style={spinnerStyle} /></div>
            ) : displayedBookings.length === 0 ? (
              <div className={styles.emptyState}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>{bookingFilter === "UPCOMING" ? "📅" : "🕐"}</div>
                <p style={{ margin: 0, fontWeight: 600, color: "#64748B" }}>{bookingFilter === "UPCOMING" ? "No upcoming bookings." : "No past bookings yet."}</p>
                {bookingFilter === "UPCOMING" && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94A3B8" }}>Book from the Consultants tab.</p>}
              </div>
            ) : (
              <div className={styles.bookingsList}>
                {displayedBookings.map(b => {
                  const bAny = b as any;
                  const displayDate = bAny.slotDate || bAny.bookingDate || "—";
                  const displayTime = bAny.timeRange || (bAny.slotTime ? toAmPm(bAny.slotTime) : "");
                  const displayMode = bAny.meetingMode || "";
                  const status = (b.BookingStatus || "").toUpperCase();
                  const isCompleted = status === "COMPLETED";
                  const isCancelled = status === "CANCELLED";
                  const hasFeedback = submittedFeedbacks.has(b.id);
                  const modeLabel = displayMode === "ONLINE" ? "💻 Online" : displayMode === "PHONE" ? "📞 Phone" : displayMode === "PHYSICAL" ? "🏢 In-Person" : displayMode ? `🏢 ${displayMode}` : "";
                  return (
                    <div key={b.id} className={styles.bookingCard}>
                      <div className={styles.cardHeader}>
                        <div className={styles.calendarIcon}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg></div>
                        <div className={styles.cardInfo}>
                          <div className={styles.sessionTitle}>Session with {b.consultantName}</div>
                          <div className={styles.sessionDateTime}>
                            {displayDate}
                            {displayTime && <span className={styles.bookedTimePill}>{displayTime}</span>}
                            {modeLabel && <span> · {modeLabel}</span>}
                          </div>
                          <div style={{ marginTop: 4, fontSize: 11, color: "#94A3B8" }}>🔗 Room: <span style={{ fontFamily: "monospace", color: "#2563EB" }}>finadvise-booking-{b.id}</span></div>
                        </div>
                        <div className={styles.statusBadgeWrapper}><StatusBadge status={b.BookingStatus as any} /></div>
                      </div>
                      <div className={styles.cardActions}>
                        {!isCancelled && (
                          <button className={styles.joinButton} onClick={() => { localStorage.setItem(PENDING_FEEDBACK_KEY, String(b.id)); window.open(JITSI_URL(b.id), "_blank"); }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>
                            Join Meeting
                          </button>
                        )}
                        {isCompleted && (
                          <button onClick={() => handleOpenFeedback(bAny)} style={{ padding: "10px 16px", borderRadius: 8, border: hasFeedback ? "1.5px solid #86EFAC" : "1.5px solid #FCD34D", background: hasFeedback ? "#F0FDF4" : "#FFFBEB", color: hasFeedback ? "#16A34A" : "#D97706", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}>
                            {hasFeedback ? "⭐ Edit Feedback" : "⭐ Leave Feedback"}
                          </button>
                        )}
                        <button className={styles.rescheduleButton}>Reschedule</button>
                        <button onClick={() => handleDeleteBooking(b.id)} disabled={deletingBookingId === b.id} title="Delete booking"
                          style={{ padding: "9px 14px", borderRadius: 8, border: "1.5px solid #FECACA", background: deletingBookingId === b.id ? "#FEF2F2" : "#fff", color: "#EF4444", fontWeight: 600, fontSize: 13, cursor: deletingBookingId === b.id ? "default" : "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit" }}
                          onMouseEnter={e => { if (deletingBookingId !== b.id) (e.currentTarget as HTMLButtonElement).style.background = "#FEF2F2"; }}
                          onMouseLeave={e => { if (deletingBookingId !== b.id) (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}>
                          {deletingBookingId === b.id ? "…" : "🗑 Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ TICKETS ════ */}
        {tab === "tickets" && (
          <div className={styles.tabPadding}>
            {/* Ticket detail modal */}
            {selectedTicket && (
              <TicketDetailModal
                ticket={selectedTicket}
                userId={currentUserId}
                currentUser={currentUser}
                onClose={() => setSelectedTicket(null)}
                onFeedbackSubmit={(id, r, text) => {
                  setTickets(p => p.map(t => t.id === id ? { ...t, feedbackRating: r, feedbackText: text, status: "CLOSED" } : t));
                  setSelectedTicket(p => p?.id === id ? { ...p, feedbackRating: r, feedbackText: text, status: "CLOSED" } : p);
                }}
                onStatusChange={(id, status) => {
                  setTickets(p => p.map(t => t.id === id ? { ...t, status: status as TicketStatus } : t));
                  setSelectedTicket(p => p?.id === id ? { ...p, status: status as TicketStatus } : p);
                }}
              />
            )}
            {/* Create ticket modal */}
            {showCreateTicket && (
              <CreateTicketModal
                userId={currentUserId}
                onCreated={t => { setTickets(p => [t, ...p]); setShowCreateTicket(false); setSelectedTicket(t); }}
                onClose={() => setShowCreateTicket(false)}
              />
            )}

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
              <h2 className={styles.sectionTitle} style={{ margin: 0 }}>Support Tickets</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={fetchTickets} disabled={loading.tickets} className={styles.ticketRefreshBtn}>{loading.tickets ? "⏳" : "↻"} Refresh</button>
                <button onClick={() => setShowCreateTicket(true)} className={styles.ticketNewBtn}>+ New Ticket</button>
              </div>
            </div>

            {/* Stats strip */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(110px,1fr))", gap: 10, marginBottom: 16 }}>
              {[
                { l: "Total", v: tickets.length, c: "#2563EB", bg: "#EFF6FF" },
                { l: "Open", v: tickets.filter(t => ["NEW", "OPEN", "IN_PROGRESS", "PENDING"].includes(t.status)).length, c: "#EA580C", bg: "#FFF7ED" },
                { l: "Escalated", v: ticketCounts.ESCALATED, c: "#DC2626", bg: "#FEF2F2" },
                { l: "Resolved", v: ticketCounts.RESOLVED, c: "#16A34A", bg: "#F0FDF4" },
                { l: "Closed", v: ticketCounts.CLOSED, c: "#64748B", bg: "#F1F5F9" },
              ].map(s => (
                <div key={s.l} style={{ background: s.bg, border: `1px solid ${s.c}22`, borderRadius: 12, padding: "10px 14px" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginTop: 2 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Status filter pills */}
            <div className={styles.ticketFilterRow} style={{ flexWrap: "wrap" }}>
              {STATUS_FILTERS.map(f => {
                const cfg = f === "ALL" ? null : TICKET_STATUS_CONFIG[f];
                const count = f === "ALL" ? tickets.length : (ticketCounts[f as keyof typeof ticketCounts] ?? 0);
                return (
                  <button key={f} onClick={() => setTicketFilter(f as any)} className={`${styles.ticketFilterBtn} ${ticketFilter === f ? styles.ticketFilterBtnActive : ""}`}>
                    {cfg ? `${cfg.icon} ${cfg.label}` : "All"} ({count})
                  </button>
                );
              })}
            </div>

            {loading.tickets ? (
              <div style={{ textAlign: "center", padding: 48 }}><div style={spinnerStyle} /></div>
            ) : filteredTickets.length === 0 ? (
              <div className={styles.emptyState}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
                <p style={{ margin: 0, fontWeight: 600, color: "#64748B" }}>{tickets.length === 0 ? "No tickets yet." : "No tickets in this status."}</p>
                {tickets.length === 0 && (
                  <button onClick={() => setShowCreateTicket(true)} style={{ marginTop: 16, padding: "10px 22px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
                    Raise your first ticket
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredTickets.map(ticket => {
                  const sc = getStatusStyle(ticket.status);
                  const pc = getPriorityStyle(ticket.priority);
                  const sla = getSlaInfo(ticket);
                  return (
                    <div key={ticket.id} onClick={() => setSelectedTicket(ticket)}
                      style={{ background: "#fff", border: "1px solid #F1F5F9", borderLeft: `4px solid ${sla?.breached ? "#EF4444" : sc.border}`, borderRadius: 14, padding: "16px 20px", cursor: "pointer", boxShadow: "0 1px 3px rgba(0,0,0,0.05)", transition: "box-shadow 0.15s" }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(37,99,235,0.12)")}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.05)")}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>#{ticket.id} — {ticket.category}</div>
                          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                            {new Date(ticket.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            {ticket.agentName && ` · ${ticket.agentName}`}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <Badge label={ticket.status} style={sc} />
                          <Badge label={ticket.priority} style={pc} />
                        </div>
                      </div>
                      <p style={{ margin: "0 0 10px", fontSize: 13, color: "#374151", lineHeight: 1.6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {ticket.description}
                      </p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        {sla ? (
                          <div style={{ fontSize: 11, fontWeight: 700, color: sla.breached ? "#DC2626" : sla.warning ? "#D97706" : "#16A34A" }}>
                            {sla.breached ? "⏰ Response overdue — we're working on it" : sla.warning ? "⚠️ Response due soon" : `✅ ${sla.label}`}
                          </div>
                        ) : <div />}
                        {ticket.status === "RESOLVED" && !ticket.feedbackRating && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#D97706", background: "#FFFBEB", padding: "3px 10px", borderRadius: 10, border: "1px solid #FDE68A" }}>⭐ Rate this resolution</span>
                        )}
                      </div>
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F8FAFC" }}>
                        <TicketStepper status={ticket.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ NOTIFICATIONS (full tab) ════ */}
        {tab === "notifications" && (
          <div className={styles.tabPadding}>
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: "#0F172A" }}>My Notifications</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>
                Updates about your tickets and support requests from consultants and admin.
              </p>
            </div>
            {unreadNotifCount > 0 && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                <button onClick={() => {
                  const updated = userNotifs.map((n: any) => ({ ...n, read: true }));
                  setUserNotifs(updated);
                  if (currentUserId) localStorage.setItem(`fin_notifs_USER_${currentUserId}`, JSON.stringify(updated));
                }} style={{ padding: "7px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Mark all as read
                </button>
              </div>
            )}
            {userNotifs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", background: "#F8FAFC", borderRadius: 20, color: "#94A3B8" }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🔔</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#64748B", marginBottom: 8 }}>No notifications yet</div>
                <p style={{ margin: 0, fontSize: 13 }}>When your ticket is updated or a consultant replies, you'll receive notifications here.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {userNotifs.map((n: any) => {
                  const cfgMap: Record<string, { color: string; bg: string; border: string; icon: string }> = {
                    info: { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", icon: "ℹ️" },
                    success: { color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: "✅" },
                    warning: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "⚠️" },
                    error: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: "🚨" },
                  };
                  const c = cfgMap[n.type] || cfgMap.info;
                  const diff = Math.floor((Date.now() - new Date(n.timestamp).getTime()) / 1000);
                  const timeStr = diff < 60 ? "just now" : diff < 3600 ? `${Math.floor(diff / 60)}m ago` : diff < 86400 ? `${Math.floor(diff / 3600)}h ago` : `${Math.floor(diff / 86400)}d ago`;
                  return (
                    <div key={n.id}
                      style={{ background: n.read ? "#fff" : c.bg, border: `1.5px solid ${n.read ? "#F1F5F9" : c.border}`, borderLeft: `4px solid ${c.color}`, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start", cursor: n.ticketId ? "pointer" : "default", transition: "all 0.15s" }}
                      onClick={() => {
                        const updated = userNotifs.map((x: any) => x.id === n.id ? { ...x, read: true } : x);
                        setUserNotifs(updated);
                        if (currentUserId) localStorage.setItem(`fin_notifs_USER_${currentUserId}`, JSON.stringify(updated));
                        if (n.ticketId) setTab("tickets");
                      }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: c.bg, border: `2px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                        {c.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: c.color, marginBottom: 3 }}>
                          {n.title}
                          {!n.read && <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: "50%", background: c.color, display: "inline-block", verticalAlign: "middle" }} />}
                        </div>
                        <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6, wordBreak: "break-word" }}>{n.message}</div>
                        {n.ticketId && <div style={{ marginTop: 6, fontSize: 11, color: "#2563EB", fontWeight: 600 }}>Tap to view ticket #{n.ticketId} →</div>}
                        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>{timeStr}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ SETTINGS ════ */}
        {tab === "settings" && (
          <div className={styles.tabPadding}>
            {settingsView === "profile" ? (
              <AccountProfile onBack={() => setSettingsView("menu")} />
            ) : (
              <>
                <h2 className={styles.sectionTitle}>Settings</h2>
                <div className={styles.settingsCard}>
                  <div className={styles.settingsItem} onClick={() => setSettingsView("profile")}><span>Account Profile</span><span>›</span></div>
                  <div className={styles.settingsItem}><span>Notifications</span><span>›</span></div>
                  <div className={styles.settingsItem}><span>Privacy &amp; Security</span><span>›</span></div>
                  <div className={`${styles.settingsItem} ${styles.settingsItemDanger}`} onClick={handleLogout}><span>Log Out</span></div>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* ══ PROFILE MODAL ══ */}
      {profileConsultant && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }} onClick={() => setProfileConsultant(null)}>
          <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(15,23,42,0.3)" }} onClick={e => e.stopPropagation()}>
            <div style={{ background: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)", padding: "28px 24px 24px", position: "relative", borderRadius: "20px 20px 0 0" }}>
              <button onClick={() => setProfileConsultant(null)} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                <div style={{ width: 76, height: 76, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.45)", overflow: "hidden", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 27, fontWeight: 700, color: "#fff" }}>
                  {profileConsultant.avatar ? <img src={profileConsultant.avatar} alt={profileConsultant.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : profileConsultant.name.substring(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 21, fontWeight: 800, color: "#fff", margin: 0 }}>{profileConsultant.name}</h2>
                  <p style={{ fontSize: 13, color: "#BFDBFE", margin: "4px 0 0" }}>{profileConsultant.role}</p>
                  <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "#93C5FD" }}>⭐ {profileConsultant.rating.toFixed(1)} ({profileConsultant.reviews} reviews)</span>
                    <span style={{ fontSize: 12, color: "#93C5FD" }}>⏱ {profileConsultant.exp}+ yrs</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[{ icon: "📍", label: "Location", value: profileConsultant.location }, { icon: "🌐", label: "Languages", value: profileConsultant.languages || "English" }, { icon: "📞", label: "Contact", value: profileConsultant.phone || "On request" }, { icon: "💰", label: "Session Fee", value: `₹${profileConsultant.fee.toLocaleString()}` }].map(item => (
                  <div key={item.label} style={{ background: "#F8FAFC", borderRadius: 11, padding: "11px 13px", border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", marginBottom: 5 }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{item.value || "—"}</div>
                  </div>
                ))}
              </div>
              {profileConsultant.about && <ProfileAbout about={profileConsultant.about} />}
              {profileConsultant.tags.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: "#1E293B", marginBottom: 8, textTransform: "uppercase" }}>Expertise</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{profileConsultant.tags.map((tag, i) => <span key={i} style={{ background: "#EFF6FF", color: "#2563EB", padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1px solid #BFDBFE" }}>{tag}</span>)}</div>
                </div>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button onClick={() => { setProfileConsultant(null); handleOpenModal(profileConsultant); }} style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Book Appointment</button>
                <button onClick={() => setProfileConsultant(null)} style={{ padding: "13px 20px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ BOOKING MODAL ══ */}
      {showModal && selectedConsultant && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)", padding: "20px 24px 18px", position: "relative", flexShrink: 0 }}>
              <p style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#93C5FD", margin: "0 0 4px" }}>Schedule a Session</p>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>{selectedConsultant.name}</h3>
              <p style={{ fontSize: 13, color: "#BFDBFE", margin: "4px 0 0" }}>{selectedConsultant.role} · ₹{selectedConsultant.fee.toLocaleString()} / session</p>
              <button onClick={() => setShowModal(false)} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px 24px", overflowY: "auto", maxHeight: "calc(92vh - 100px)" }}>
              {loading.slots ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}><div style={spinnerStyle} /><p style={{ color: "#94A3B8", fontSize: 13, margin: "12px 0 0" }}>Loading available time slots…</p></div>
              ) : (
                <>
                  <p className={styles.stepLabel}>Step 1 — Select Date</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
                    <button disabled={dayOffset === 0} onClick={() => setDayOffset(o => Math.max(0, o - 1))} style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, border: `1.5px solid ${dayOffset === 0 ? "#F1F5F9" : "#BFDBFE"}`, background: "#fff", cursor: dayOffset === 0 ? "default" : "pointer", color: dayOffset === 0 ? "#CBD5E1" : "#2563EB", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                    <div className={styles.dateGrid} style={{ flex: 1 }}>
                      {visibleDays.map(d => {
                        const isSel = selectedDay.iso === d.iso;
                        const isToday = d.iso === ALL_DAYS[0].iso;
                        const isSunday = d.day === "SUN";
                        return (
                          <button key={d.iso} disabled={isSunday} onClick={() => { if (!isSunday) { setSelectedDay(d); setSelectedSlot(null); } }}
                            className={`${styles.dateGridBtn} ${isSel && !isSunday ? styles.dateGridBtnActive : ""}`}
                            title={isSunday ? "No consultations on Sundays" : undefined}
                            style={isSunday ? { opacity: 0.38, cursor: "not-allowed", background: "#F8FAFC" } : {}}>
                            <span className={styles.dateGridDay} style={isSunday ? { color: "#CBD5E1" } : {}}>{d.day}</span>
                            <span className={styles.dateGridDate} style={isSunday ? { color: "#CBD5E1" } : {}}>{d.date}</span>
                            <span className={`${styles.dateGridMonth} ${isToday && !isSel && !isSunday ? styles.todayLabel : ""}`} style={isSunday ? { color: "#CBD5E1", fontSize: 8 } : {}}>
                              {isSunday ? "OFF" : isToday && !isSel ? "TODAY" : d.month}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button disabled={dayOffset >= ALL_DAYS.length - VISIBLE_DAYS} onClick={() => setDayOffset(o => Math.min(ALL_DAYS.length - VISIBLE_DAYS, o + 1))} style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0, border: `1.5px solid ${dayOffset >= ALL_DAYS.length - VISIBLE_DAYS ? "#F1F5F9" : "#BFDBFE"}`, background: "#fff", cursor: dayOffset >= ALL_DAYS.length - VISIBLE_DAYS ? "default" : "pointer", color: dayOffset >= ALL_DAYS.length - VISIBLE_DAYS ? "#CBD5E1" : "#2563EB", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
                  </div>

                  <p className={styles.stepLabel}>Step 2 — Select Time</p>
                  {selectedDay.day === "SUN" ? (
                    <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "20px 18px", textAlign: "center" }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🚫</div>
                      <p style={{ fontWeight: 700, margin: "0 0 4px", color: "#DC2626", fontSize: 14 }}>No consultations on Sundays</p>
                    </div>
                  ) : hasShift ? (
                    <div className={styles.timeGrid}>
                      {hourlySlotTimes.map(slotStart => {
                        const isBooked = bookedSlotSet.has(`${selectedDay.iso}|${slotStart}`);
                        const endH = parseInt(slotStart.split(":")[0]) + 1;
                        const endStr = `${String(endH).padStart(2, "0")}:${slotStart.split(":")[1]}`;
                        const label = `${fmt24to12(slotStart)} - ${fmt24to12(endStr)}`;
                        const matchedMaster = masterSlots.find(ms => normalise24(ms.timeRange) === slotStart || ms.timeRange.replace(/\s/g, "").toLowerCase() === label.replace(/\s/g, "").toLowerCase());
                        const matchedTs = dbTimeslots.find(ts => ts.slotDate === selectedDay.iso && (ts.slotTime || "").substring(0, 5) === slotStart);
                        const isSel = !isBooked && selectedSlot?.start24h === slotStart;
                        return (
                          <button key={slotStart} disabled={isBooked} title={isBooked ? "Booked" : "Available"}
                            onClick={() => !isBooked && setSelectedSlot(isSel ? null : { start24h: slotStart, label, masterId: matchedMaster?.id ?? 0, timeslotId: matchedTs?.id })}
                            className={`${styles.timeBtn} ${isSel ? styles.timeBtnActive : ""} ${isBooked ? styles.timeBtnBooked : ""}`}
                            style={isBooked ? { textDecoration: "line-through", opacity: 0.6, cursor: "not-allowed", pointerEvents: "none" } : {}}>
                            {label}{isBooked && <div className={styles.unavailableLabel}>BOOKED</div>}
                          </button>
                        );
                      })}
                    </div>
                  ) : masterSlots.length === 0 ? (
                    <div className={styles.noSlotsWarning}><p style={{ fontWeight: 600, margin: "0 0 4px" }}>No time slots available yet.</p></div>
                  ) : (
                    <div className={styles.timeGrid}>
                      {masterSlots.map(ms => {
                        const slotT24 = normalise24(ms.timeRange);
                        const isBooked = bookedSlotSet.has(`${selectedDay.iso}|${slotT24}`);
                        const isSel = !isBooked && selectedSlot?.masterId === ms.id;
                        return (
                          <button key={ms.id} disabled={isBooked} title={isBooked ? "Booked" : "Available"}
                            onClick={() => !isBooked && setSelectedSlot(isSel ? null : { start24h: slotT24, label: ms.timeRange, masterId: ms.id })}
                            className={`${styles.timeBtn} ${isSel ? styles.timeBtnActive : ""} ${isBooked ? styles.timeBtnBooked : ""}`}
                            style={isBooked ? { textDecoration: "line-through", opacity: 0.6, cursor: "not-allowed", pointerEvents: "none" } : {}}>
                            {ms.timeRange}{isBooked && <div className={styles.unavailableLabel}>BOOKED</div>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <p className={styles.stepLabel}>Meeting Mode</p>
                  <div className={styles.meetingModeRow}>
                    {(["ONLINE", "PHYSICAL", "PHONE"] as const).map(mode => (
                      <button key={mode} onClick={() => setMeetingMode(mode)} className={`${styles.meetingBtn} ${meetingMode === mode ? styles.meetingBtnActive : ""}`}>
                        {mode === "ONLINE" ? "💻" : mode === "PHONE" ? "📞" : "🏢"} {mode === "PHYSICAL" ? "In-Person" : mode}
                      </button>
                    ))}
                  </div>

                  <p className={styles.stepLabel}>Notes (optional)</p>
                  <textarea className={styles.notesTextarea} value={userNotes} onChange={e => setUserNotes(e.target.value)} rows={2} placeholder="What would you like to discuss?" />

                  {selectedSlot && (
                    <div className={styles.bookingSummary}>
                      📅 {selectedDay.date} {selectedDay.month} · 🕐 {selectedSlot.label} ·{" "}
                      {meetingMode === "ONLINE" ? "💻 Online" : meetingMode === "PHONE" ? "📞 Phone" : "🏢 In-Person"} · ₹{selectedConsultant.fee.toLocaleString()}
                    </div>
                  )}

                  <button disabled={!selectedSlot || confirming} onClick={handleConfirm} className={`${styles.proceedBtn} ${selectedSlot && !confirming ? styles.proceedBtnActive : ""}`}>
                    {confirming ? "Booking…" : selectedSlot ? `Confirm & Pay ₹${selectedConsultant.fee.toLocaleString()}` : "Select a Date and Time to Continue"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Nav — 5 tabs ── */}
      <nav className={styles.bottomNav}>
        {(["consultants", "bookings", "tickets", "notifications", "settings"] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); if (t !== "notifications") setShowNotifPanel(false); }}
            className={`${styles.navBtn} ${tab === t ? styles.navBtnActive : ""}`}
            style={{ position: "relative" }}>
            <span>
              {t === "consultants" ? "Find"
                : t === "bookings" ? "Bookings"
                  : t === "tickets" ? "Tickets"
                    : t === "notifications" ? "Updates"
                      : "Settings"}
            </span>
            {t === "notifications" && unreadNotifCount > 0 && (
              <span style={{ position: "absolute", top: 2, right: 2, width: 7, height: 7, borderRadius: "50%", background: "#DC2626", border: "1.5px solid #fff" }} />
            )}
          </button>
        ))}
      </nav>

      {/* ══ BOOKING FEEDBACK MODAL ══ */}
      {feedbackModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(6px)" }} onClick={() => !submittingFeedback && setFeedbackModal(null)}>
          <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(15,23,42,0.35)" }} onClick={e => e.stopPropagation()}>
            <div style={{ background: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)", padding: "22px 24px 20px", borderRadius: "24px 24px 0 0", position: "relative" }}>
              <button onClick={() => setFeedbackModal(null)} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#93C5FD", marginBottom: 4 }}>Rate Your Session</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>{feedbackModal.existingFeedback ? "Update Your Feedback" : "Leave Feedback"}</h3>
              <p style={{ fontSize: 13, color: "#BFDBFE", margin: 0 }}>Session with {feedbackModal.consultantName}</p>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#475569" }}>📅 {feedbackModal.slotDate || "Session"}</span>
                {feedbackModal.timeRange && <span style={{ background: "#EFF6FF", color: "#2563EB", fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, border: "1px solid #BFDBFE" }}>{feedbackModal.timeRange}</span>}
                <span style={{ background: "#F0FDF4", color: "#16A34A", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>✓ Session Attended</span>
              </div>
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 12px" }}>How would you rate this session?</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 8 }}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <button key={star} onClick={() => setFeedbackRating(star)} onMouseEnter={() => setFeedbackHover(star)} onMouseLeave={() => setFeedbackHover(0)}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 4, transition: "transform 0.15s", transform: (feedbackHover || feedbackRating) >= star ? "scale(1.2)" : "scale(1)" }}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill={(feedbackHover || feedbackRating) >= star ? "#F59E0B" : "#E2E8F0"} stroke={(feedbackHover || feedbackRating) >= star ? "#D97706" : "#CBD5E1"} strokeWidth="1.5">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                      </svg>
                    </button>
                  ))}
                </div>
                <div style={{ textAlign: "center", height: 20 }}>{(feedbackHover || feedbackRating) > 0 && <span style={{ fontSize: 13, fontWeight: 600, color: "#D97706" }}>{["", "Poor", "Fair", "Good", "Very Good", "Excellent!"][feedbackHover || feedbackRating]}</span>}</div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>Comments (optional)</p>
                <textarea value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} placeholder="Share your experience…" maxLength={1000} rows={4}
                  style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E2E8F0", borderRadius: 12, fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box", color: "#1E293B", lineHeight: 1.6 }}
                  onFocus={e => (e.target.style.borderColor = "#2563EB")} onBlur={e => (e.target.style.borderColor = "#E2E8F0")} />
                <div style={{ textAlign: "right", fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{feedbackComment.length}/1000</div>
              </div>
              <button onClick={handleSubmitFeedback} disabled={submittingFeedback || feedbackRating === 0}
                style={{ width: "100%", padding: 14, background: feedbackRating === 0 || submittingFeedback ? "#E2E8F0" : "linear-gradient(135deg,#2563EB,#1D4ED8)", color: feedbackRating === 0 || submittingFeedback ? "#94A3B8" : "#fff", border: "none", borderRadius: 14, fontWeight: 700, fontSize: 15, cursor: feedbackRating === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {submittingFeedback
                  ? <><span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Submitting…</>
                  : feedbackModal.existingFeedback ? "Update Feedback" : "⭐ Submit Feedback"}
              </button>
              {feedbackRating === 0 && <p style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", margin: "10px 0 0" }}>Please select a star rating to continue</p>}
            </div>
          </div>
        </div>
      )}

      {/* ══ SUBSCRIPTION WELCOME POPUP ══ */}
      {showSubPopup && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)", background: "rgba(15,23,42,0.65)" }} onClick={() => setShowSubPopup(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 420, boxShadow: "0 32px 80px rgba(15,23,42,0.35)", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,#92400E 0%,#B45309 30%,#D97706 60%,#F59E0B 100%)", padding: "32px 28px 28px", textAlign: "center", position: "relative" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "3px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 40 }}>👑</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Welcome, Premium Member!</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>You're subscribed to FINADVISE Premium</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 20, padding: "5px 16px", marginTop: 14, fontSize: 12, fontWeight: 700, color: "#fff" }}>✦ PREMIUM PLAN ACTIVE ✦</div>
            </div>
            <div style={{ padding: "24px 28px 28px" }}>
              <div style={{ marginBottom: 22 }}>
                {[{ icon: "📅", text: "Unlimited session bookings" }, { icon: "⚡", text: "Priority support ticket handling" }, { icon: "💬", text: "Direct access to top consultants" }, { icon: "📊", text: "Exclusive financial reports & insights" }].map((perk, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, marginBottom: 8, background: i === 0 ? "#FFFBEB" : "#F8FAFC", border: `1px solid ${i === 0 ? "#FDE68A" : "#F1F5F9"}` }}>
                    <span style={{ fontSize: 18 }}>{perk.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>{perk.text}</span>
                    <span style={{ marginLeft: "auto", color: "#16A34A", fontWeight: 700, fontSize: 14 }}>✓</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowSubPopup(false)} style={{ width: "100%", padding: 14, background: "linear-gradient(135deg,#B45309,#D97706)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Start Exploring →</button>
              <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "#94A3B8" }}>Tap anywhere outside to dismiss</div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes popIn  { from { transform:scale(0.85) translateY(20px); opacity:0; } to { transform:scale(1) translateY(0); opacity:1; } }
        @keyframes spin   { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}