import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import logoImg from '../assests/Meetmasterslogopng.png';
import { API_BASE_URL, buildBackendAssetUrl } from "../config/api";
import AddAdvisor from "../components/AddAdvisor";
import ForcePasswordChangeModal from "../components/ForcePasswordChangeModal";
import StatusBadge from "../components/StatusBadge";

import {
  addHoliday as apiAddHoliday,
  deleteHoliday as apiDeleteHoliday,
  apiFetch,
  approveOffer,
  assignTicketToConsultant,
  calculateTotalPrice,
  clientExportTicketsExcel,
  clientExportTicketsPdf,
  createSkill,
  createTicket,
  createTicketCategory,
  deleteAdvisor,
  deleteSkill,
  deleteTicket,
  escalateTicket,
  exportSingleTicketExcel,
  exportSingleTicketPdf,
  exportTicketsExcel,
  exportTicketsPdf,
  extractArray,
  FeeConfig,
  getAllAdvisors,
  getAllBookings,
  getAllSkills,
  getAllTickets,
  getAutoResponder,
  getBookingSummary,
  getBookingsPage,
  getBusinessHours,
  getConsultantSubmittedOffers,
  getEscalationBlocks,
  getFeeConfig,
  getHolidays,
  getPublicReviews,
  getSlaInfo,
  getTicketCategories,
  getTicketComments,
  getTicketSummary,
  getTicketsPage,
  postInternalNote,
  postTicketComment,
  rejectOffer,
  SLA_HOURS,
  toggleTicketCategory,
  updateAutoResponder,
  updateBusinessHours,
  updateFeeConfig,
  updateSkill,
  updateTicketStatus
} from "../services/api";
import BookingsPage from "./BookingsPage";
import {
  EscalationMonitor,
  NotificationBell,
  NotificationProvider,
  ToastContainer,
  useNotifications,
} from "./NotificationSystem";
import { SubscriptionPlansPanel } from "./SubscriptionPlansPanel";
import TicketSummaryChart from "./TicketSummaryChart";

const BASE_URL = API_BASE_URL;

// ─── IST Time Formatter ────────────────────────────────────────────────────
// Always display times in India Standard Time (UTC+5:30) regardless of the
// browser's locale/timezone. The backend stores timestamps in UTC; we convert
// explicitly to IST (Asia/Kolkata = UTC+5:30) for all display.
const IST_OPTS_DATE: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Kolkata",
  day: "2-digit", month: "short", year: "numeric",
};
const IST_OPTS_DATETIME: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Kolkata",
  day: "2-digit", month: "short", year: "numeric",
  hour: "2-digit", minute: "2-digit", hour12: true,
};
const IST_OPTS_TIME: Intl.DateTimeFormatOptions = {
  timeZone: "Asia/Kolkata",
  hour: "2-digit", minute: "2-digit", hour12: true,
};

/**
 * Format any ISO / epoch timestamp as IST.
 * Works even if the backend sends timestamps WITHOUT a timezone suffix
 * (i.e. "2026-03-21T10:01:00" instead of "2026-03-21T10:01:00Z").
 * Such strings are treated as LOCAL time by JS Date — we correct that by
 * appending "Z" only when the string has no offset, so JS always parses UTC
 * and then we render in IST (UTC+5:30).
 */
const fmtIST = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = IST_OPTS_DATETIME): string => {
  if (!iso) return "--";
  try {
    // Same logic as api.ts toUTC: backend returns timestamps WITHOUT Z suffix
    // We must append Z to force UTC parsing before converting to IST
    const normalised = (iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso)) ? iso : iso + "Z";
    return new Date(normalised).toLocaleString("en-IN", opts);
  } catch { return iso; }
};
// ─────────────────────────────────────────────────────────────────────────────



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
  ticketNumber?: string;
  title?: string;
  description: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  updatedAt?: string;
  userId?: number;
  userName?: string;
  user?: { id?: number; name?: string; fullName?: string; firstName?: string; username?: string; email?: string } | null;
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
  // Extra fields some backends include
  raisedByName?: string;
  clientName?: string;
  raisedBy?: string;
  submittedBy?: string;
  createdByName?: string;
  assignedTo?: { name?: string; id?: number } | null;
}

const getTicketDisplayId = (ticketLike: { id?: number | string; ticketNumber?: string | null }) => {
  const ticketNumber = String(ticketLike.ticketNumber || "").trim();
  if (ticketNumber) return ticketNumber;
  return ticketLike.id != null ? `#${ticketLike.id}` : "—";
};

type AdminSectionType =
  | "dashboard"
  | "advisors"
  | "bookings"
  | "tickets"
  | "analytics"
  | "summary"
  | "add-member"
  | "support-config"
  | "time-ranges"
  | "offers"
  | "offer-approval"
  | "questions"
  | "commission"
  | "terms-conditions"
  | "contact-submissions"
  | "subscription-plans"
  | "settings";

// ─────────────────────────────────────────────────────────────────────────────
// TICKET STATUS / PRIORITY CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const TICKET_STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  NEW: { label: "New", color: "#6366F1", bg: "#EEF2FF", border: "#C7D2FE", icon: "" },
  OPEN: { label: "Open", color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD", icon: "" },
  IN_PROGRESS: { label: "In Progress", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "" },
  PENDING: { label: "Pending", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: "" },
  RESOLVED: { label: "Resolved", color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: "" },
  CLOSED: { label: "Closed", color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1", icon: "" },
  ESCALATED: { label: "Escalated", color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5", icon: "" },
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
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: sla.breached ? "#DC2626" : sla.warning ? "#F59E0B" : "#16A34A", display: "inline-block", flexShrink: 0 }} />
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
// SVG ICON HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const SvgIcon: React.FC<{ d: string | string[]; size?: number; color?: string; fill?: string; strokeWidth?: number; viewBox?: string }> =
  ({ d, size = 14, color = "currentColor", fill = "none", strokeWidth = 2, viewBox = "0 0 24 24" }) => (
    <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );

const SVGS = {
  person: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  lock: "M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4",
  bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  tag: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01",
  bot: "M12 8V4H8 M12 8H8a4 4 0 0 0-4 4v4a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-4a4 4 0 0 0-4-4h-4z M9 15v-2 M15 15v-2",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  pencil: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z M17 21v-8H7v8 M7 3v5h8",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 12m-3 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  eyeOff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24 M1 1l22 22",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  trash: "M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  paperclip: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48",
  envelope: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  search: "M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z M21 21l-4.35-4.35",
  warning: "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  alert: "M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z M12 8v4 M12 16h.01",
  checkCircle: "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
  slash: "M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10z M4.93 4.93l14.14 14.14",
  barChart: "M12 20V10 M18 20V4 M6 20v-4",
  lightbulb: "M9 18h6 M10 22h4 M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z",
  pin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 10m-3 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7",
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  clipboard: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  handWave: "M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2 M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2 M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8 M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
  calendarDots: "M3 4h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z M16 2v4 M8 2v4 M3 10h18 M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01 M16 18h.01",
  escalate: "M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5",
};

const getStepSvg = (key: string) => {
  const s = 13;
  const props = { size: s, strokeWidth: 2 };
  if (key === "NEW") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
  if (key === "OPEN") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
  if (key === "IN_PROGRESS") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
  if (key === "RESOLVED") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>;
  if (key === "CLOSED") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
  return null;
};

const getSettingsTabSvg = (id: string, active: boolean) => {
  const color = active ? "#2563EB" : "#64748B";
  const s = 20;
  if (id === "profile") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
  if (id === "notifications") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
  if (id === "security") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
  if (id === "logout") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
  return null;
};

const getConfigTabSvg = (id: string, active: boolean) => {
  const color = active ? "#2563EB" : "#94A3B8";
  const s = 15;
  if (id === "canned") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
  if (id === "categories") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>;
  if (id === "autoresponder") return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2" /><path d="M12 11V7" /><path d="M8 7h8" /><circle cx="12" cy="4" r="1" /></svg>;
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET PROGRESS STEPPER
// ─────────────────────────────────────────────────────────────────────────────
const STEPS = [
  { key: "NEW", label: "Submitted", icon: "NEW" },
  { key: "OPEN", label: "Assigned", icon: "OPEN" },
  { key: "IN_PROGRESS", label: "Pending", icon: "IN_PROGRESS" },
  { key: "RESOLVED", label: "Resolved", icon: "RESOLVED" },
  { key: "CLOSED", label: "Closed", icon: "CLOSED" },
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
                  ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", color: current ? "#2563EB" : "#94A3B8" }}>{getStepSvg(step.key)}</span>}
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
  const ticketDisplayId = getTicketDisplayId(ticket);
  const blockedIds = useMemo(() => {
    const blocks = getEscalationBlocks();
    return new Set(
      blocks
        .filter((b) => Number(b.ticketId) === Number(ticket.id))
        .map((b) => Number(b.consultantId))
    );
  }, [ticket.id]);

  const handleAssign = async () => {
    if (!selected) return;
    if (blockedIds.has(selected)) {
      setError("This consultant escalated the ticket and cannot be reassigned to it.");
      return;
    }
    setAssigning(true); setError(null);
    try {
      await assignTicketToConsultant(ticket.id, selected);
      const consultant = consultants.find((c: any) => Number(c.id) === Number(selected));
      const consultantName = consultant?.name || (consultant as any)?.fullName || `Consultant #${selected}`;

      const assignKey = `fin_notifs_CONSULTANT_${selected}`;
      const existing = JSON.parse(localStorage.getItem(assignKey) || "[]");
      const newNotif = {
        id: `${Date.now()}`,
        type: "info",
        title: `New Ticket Assigned — ${ticketDisplayId}`,
        message: `You have been assigned: "${ticket.title || ticket.category}" (${ticket.category}). Priority: ${ticket.priority}.`,
        timestamp: new Date().toISOString(),
        read: false,
        ticketId: ticket.id,
      };
      localStorage.setItem(assignKey, JSON.stringify([newNotif, ...existing].slice(0, 50)));

      addNotification({
        type: "success",
        title: `Ticket ${ticketDisplayId} Assigned`,
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
                Assign Ticket {ticketDisplayId}
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> {error}</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto", paddingRight: 4 }}>
            {consultants.length === 0 ? (
              <div style={{ textAlign: "center", color: "#94A3B8", padding: 24, fontSize: 13 }}>No consultants available.</div>
            ) : consultants.map(c => {
              const isBlocked = blockedIds.has(c.id);
              return (
                <div
                  key={c.id}
                  onClick={() => !isBlocked && setSelected(c.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "12px 16px", borderRadius: 12,
                    cursor: isBlocked ? "not-allowed" : "pointer",
                    border: `2px solid ${isBlocked ? "#FCA5A5" : selected === c.id ? "#2563EB" : "#E2E8F0"}`,
                    background: isBlocked ? "#FEF2F2" : selected === c.id ? "#EFF6FF" : "#fff",
                    opacity: isBlocked ? 0.75 : 1,
                    transition: "all 0.15s",
                  }}
                >
                  <img src={c.avatar} alt={c.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: `2px solid ${isBlocked ? "#FCA5A5" : "#BFDBFE"}` }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: isBlocked ? "#991B1B" : "#0F172A", display: "flex", alignItems: "center", gap: 8 }}>
                      {c.name}
                      {isBlocked && (
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#FEE2E2", color: "#DC2626", fontWeight: 700, border: "1px solid #FECACA" }}>
                          🚫 ESCALATED - BLOCKED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: isBlocked ? "#B91C1C" : "#64748B", marginTop: 2 }}>
                      {isBlocked ? "This consultant escalated this ticket - cannot reassign" : `${c.role}${c.shiftStartTime ? ` · ${c.shiftStartTime}–${c.shiftEndTime}` : ""}`}
                    </div>
                    {!isBlocked && (
                      <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                        {c.tags.slice(0, 3).map(t => (
                          <span key={t} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#F1F5F9", color: "#475569", fontWeight: 600 }}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {selected === c.id && !isBlocked && (
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </div>
                  )}
                </div>
              );
            })}
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
  const ticketDisplayId = getTicketDisplayId(ticket);

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

  // Poll every 20s so admin sees status changes made by the user in real time
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const fresh = await apiFetch(`/tickets/${ticket.id}`);
        if (fresh?.status && fresh.status !== localStatus) {
          setLocalStatus(fresh.status as TicketStatus);
          onStatusChange(ticket.id, fresh.status);
        }
        if (fresh?.consultantName && fresh.consultantName !== ticket.consultantName) {
          onAssigned(ticket.id, fresh.consultantId ?? 0, fresh.consultantName);
        }
      } catch { /* silent poll */ }
    }, 20000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          title: `Admin replied on Ticket ${ticketDisplayId}`,
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
          title: `${cfg?.icon || "↺"} Ticket ${ticketDisplayId} ${cfg?.label || newStatus}`,
          message: `Your ticket "${ticket.title || ticket.category}" is now ${cfg?.label || newStatus}.`,
          timestamp: new Date().toISOString(),
          read: false,
          ticketId: ticket.id,
        };
        localStorage.setItem(userKey, JSON.stringify([notif, ...existing].slice(0, 50)));
      }

      addNotification({
        type: newStatus === "RESOLVED" ? "success" : "info",
        title: `Ticket ${ticketDisplayId} → ${TICKET_STATUS_CFG[newStatus]?.label || newStatus}`,
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
        await await apiFetch(`/tickets/${ticket.id}/priority`, {
          method: "PATCH",
          body: JSON.stringify({ priority: newPriority }),
        });
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
          title: `Ticket ${ticketDisplayId} Priority Updated`,
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
    const capturedNote = noteText.trim();
    try {
      const saved = await postInternalNote(ticket.id, capturedNote, currentAdminId);
      setNotes(p => [...p, saved]);
      setNoteText("");
      showToast("Note saved");
    } catch {
      setNotes(p => [...p, {
        id: Date.now(), ticketId: ticket.id, authorId: currentAdminId,
        noteText: capturedNote, createdAt: new Date().toISOString(),
      }]);
      setNoteText("");
      showToast("Note saved locally");
    } finally {
      // ── Notify assigned consultant about new admin internal note ──
      const consultantId = ticket.consultantId;
      if (consultantId) {
        try {
          const consultantKey = `fin_notifs_CONSULTANT_${consultantId}`;
          const prev = JSON.parse(localStorage.getItem(consultantKey) || "[]");
          localStorage.setItem(consultantKey, JSON.stringify([{
            id: `admin_note_${ticket.id}_${Date.now()}`,
            type: "info",
            ticketId: ticket.id,
            title: `🔒 Admin Note on Ticket ${ticketDisplayId}`,
            message: `Admin added a private note: "${capturedNote.substring(0, 80)}${capturedNote.length > 80 ? "…" : ""}"`,
            timestamp: new Date().toISOString(),
            read: false,
          }, ...prev].slice(0, 50)));
        } catch { /* localStorage unavailable */ }
      }
      setPostingNote(false);
    }
  };

  const handleEscalate = async () => {
    if (localStatus === "ESCALATED") return;
    setEscalating(true);
    try {
      await escalateTicket(ticket.id, "Customer requested urgent attention");
      setLocalStatus("ESCALATED");
      onStatusChange(ticket.id, "ESCALATED");
      addNotification({ type: "warning", title: `Ticket ${ticketDisplayId} Escalated`, message: `"${ticket.title || ticket.category}" has been escalated.`, ticketId: ticket.id });
      showToast("Ticket escalated");

      // ── Notify assigned consultant about escalation ──
      const consultantId = ticket.consultantId;
      if (consultantId) {
        try {
          const consultantKey = `fin_notifs_CONSULTANT_${consultantId}`;
          const prev = JSON.parse(localStorage.getItem(consultantKey) || "[]");
          localStorage.setItem(consultantKey, JSON.stringify([{
            id: `esc_admin_${ticket.id}_${Date.now()}`,
            type: "error",
            ticketId: ticket.id,
            title: `🚨 Ticket ${ticketDisplayId} Escalated`,
            message: `Ticket "${ticket.title || ticket.category}" has been escalated by admin and requires your urgent attention.`,
            timestamp: new Date().toISOString(),
            read: false,
          }, ...prev].slice(0, 50)));
        } catch { /* localStorage unavailable */ }
      }
    } catch (e: any) { showToast(e.message || "Escalation failed.", false); }
    finally { setEscalating(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Permanently delete ticket ${ticketDisplayId}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteTicket(ticket.id);
      onDeleted(ticket.id);
    } catch (e: any) { showToast(e.message || "Delete failed.", false); setDeleting(false); }
  };

  const sc = TICKET_STATUS_CFG[localStatus] ?? TICKET_STATUS_CFG.NEW;
  const pc = TICKET_PRIORITY_CFG[localPriority] ?? TICKET_PRIORITY_CFG.MEDIUM;

  const getUserLabel = () => {
    const name =
      ticket.user?.name || ticket.user?.fullName || ticket.user?.firstName ||
      ticket.user?.username ||
      (ticket.user?.email ? ticket.user.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : null) ||
      ticket.userName || ticket.raisedByName || ticket.clientName;
    return name || (ticket.userId ? `User #${ticket.userId}` : "—");
  };

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
                  Ticket {ticketDisplayId}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", lineHeight: 1.35, wordBreak: "break-word", marginBottom: 6 }}>
                  {ticket.title || ticket.category}
                </div>
                <div style={{ fontSize: 12, color: "#BFDBFE" }}>
                  {getUserLabel()} · {ticket.category}
                  {(ticket.agentName || ticket.consultantName) &&
                    ` · Assigned to ${ticket.agentName || ticket.consultantName}`}
                  {!(ticket.agentName || ticket.consultantName) && ticket.consultantId &&
                    ` · Agent #${ticket.consultantId}`}
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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> Escalated</span>
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
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg>}
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
                          {isActive && <span style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <span style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(255,255,255,0.15)", color: "#E0F2FE", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#E0F2FE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                {fmtIST(ticket.createdAt, IST_OPTS_DATE)}
              </span>
              <ExportDropdown tickets={[ticket]} label="Export" compact={true} />
              {(localStatus === "CLOSED" || localStatus === "RESOLVED") ? (
                <span style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 20, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 600, cursor: "not-allowed", display: "inline-flex", alignItems: "center", gap: 5 }}
                  title={`Ticket is ${localStatus} — cannot reassign`}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> {localStatus === "CLOSED" ? "Closed" : "Resolved"} — No Reassign</span>
                </span>
              ) : (
                <button
                  onClick={() => setShowAssign(true)}
                  style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", marginLeft: "auto" }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> Assign Consultant</span>
                </button>
              )}
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
                      {cfg.label}{isActive && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><path d="M20 6L9 17l-5-5" /></svg>}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#94A3B8", display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                Customer will receive an in-app notification when status changes.
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
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" /></svg> {cfg.label}{isActive && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 3 }}><path d="M20 6L9 17l-5-5" /></svg>}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#94A3B8", display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                Priority change is reflected immediately in the ticket list.
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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg> View attachment</span>
                </a>
              )}
            </div>

            {/* Conversation thread */}
            <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9", flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg> Conversation ({comments.length})</span>
              </div>
              {loadingThread ? (
                <div style={{ textAlign: "center", padding: 24 }}>
                  <img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
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
                            {" · "}{fmtIST(c.createdAt, IST_OPTS_TIME)}
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> Internal Notes</span> <span style={{ fontSize: 10, fontWeight: 500, color: "#B45309", textTransform: "none" }}>(never visible to user)</span>
              </div>
              {notes.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {notes.map(n => (
                    <div key={n.id} style={{ background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, padding: "9px 12px" }}>
                      <div style={{ fontSize: 12, color: "#1E293B", lineHeight: 1.55 }}>{n.noteText}</div>
                      <div style={{ fontSize: 10, color: "#92400E", marginTop: 4 }}>
                        Agent #{n.authorId} · {fmtIST(n.createdAt, { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> Escalate Ticket</span>
              </div>
              {localStatus === "ESCALATED" ? (
                <div style={{ fontSize: 12, color: "#B91C1C", fontWeight: 600, padding: "8px 12px", background: "#FEE2E2", borderRadius: 8, border: "1px solid #FECACA" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> Already escalated</span>
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
                {deleting ? "Deleting…" : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg> Delete Ticket {ticketDisplayId}</>}
              </button>
            </div>
          </div>

          {/* Toast */}
          {toast && (
            <div style={{ position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.ok ? "#0F172A" : "#7F1D1D", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 9999, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
              {toast.ok
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FCA5A5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>}
              {toast.msg}
            </div>
          )}
        </div>

        <style>{`
          @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes mtmPulse {
            0%   { transform: scale(0.82); filter: blur(5px) drop-shadow(0 0 6px rgba(37,99,235,0.20));  opacity: 0.55; }
            50%  { transform: scale(1.12); filter: blur(0px) drop-shadow(0 0 26px rgba(37,99,235,0.65)); opacity: 1.00; }
            100% { transform: scale(0.82); filter: blur(5px) drop-shadow(0 0 6px rgba(37,99,235,0.20));  opacity: 0.55; }
          }
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
          <h3 style={{ margin: 0, color: "#fff", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /></svg>
            Create New Ticket
          </h3>
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
  const singleTicketDisplayId = isSingle ? getTicketDisplayId(tickets[0] ?? {}) : "";

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
      try { await exportSingleTicketExcel(tickets[0].id); setStatus("done"); setStatusMsg("Excel downloaded"); }
      catch { await clientExportTicketsExcel(tickets, `ticket_${tickets[0].id}.xlsx`); setStatus("done"); setStatusMsg("Excel downloaded"); }
    } else {
      try { await exportTicketsExcel(); setStatus("done"); setStatusMsg(`${tickets.length} tickets → Excel`); }
      catch { await clientExportTicketsExcel(tickets); setStatus("done"); setStatusMsg(`${tickets.length} tickets → Excel`); }
    }
  };

  const handlePdf = async () => {
    if (isSingle) {
      try { await exportSingleTicketPdf(tickets[0].id); setStatus("done"); setStatusMsg("PDF downloaded"); }
      catch { await clientExportTicketsPdf(tickets, `ticket_${tickets[0].id}.pdf`); setStatus("done"); setStatusMsg("PDF downloaded"); }
    } else {
      try { await exportTicketsPdf(); setStatus("done"); setStatusMsg(`${tickets.length} tickets → PDF`); }
      catch { await clientExportTicketsPdf(tickets); setStatus("done"); setStatusMsg(`${tickets.length} tickets → PDF`); }
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
      <button onClick={() => status === "idle" && setOpen(o => !o)} style={btnStyle} title={isSingle ? `Export Ticket ${singleTicketDisplayId}` : `Export ${tickets.length} tickets`}>
        {status === "loading" ? (
          <><span style={{ width: 12, height: 12, border: "2px solid #CBD5E1", borderTopColor: "#2563EB", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />Exporting…</>
        ) : status === "done" ? (<><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> {statusMsg}</>
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
              {isSingle ? `Export Ticket ${singleTicketDisplayId}` : `Export ${tickets.length} Tickets`}
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
            <div style={{ fontSize: 10, color: "#94A3B8", display: "flex", alignItems: "center", gap: 4 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="18" x2="15" y2="18" /><line x1="10" y1="22" x2="14" y2="22" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg> {isSingle ? "Includes all ticket details & comments" : "Includes all filtered tickets"}</div>
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
  const ticketTableColumns = "78px minmax(260px,1.8fr) 110px 72px 140px 120px 92px 110px";

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
    // First pass: extract names from ALL embedded data fields the backend may return
    // Build consultant name lookup from consultants prop
    const consultantLookup: Record<number, string> = {};
    consultants.forEach((c: any) => {
      if (c.id) consultantLookup[Number(c.id)] = c.name || c.fullName || `Consultant #${c.id}`;
    });

    const firstPass = arr.map((t: any) => {
      // Already has a real name (not a placeholder)
      if (t.userName && !t.userName.startsWith("User #")) return t;
      const name =
        t.user?.name || t.user?.fullName || t.user?.firstName ||
        t.user?.username ||
        (t.user?.email ? t.user.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : null) ||
        t.clientName || t.raisedBy || t.submittedBy ||
        t.raisedByName || t.createdByName || null;
      // Also grab consultant/agent name if missing
      const consultantName =
        t.consultantName || t.agentName ||
        t.consultant?.name || t.agent?.name ||
        t.assignedTo?.name ||
        (t.consultantId ? (consultantLookup[Number(t.consultantId)] || null) : null) || null;
      return {
        ...t,
        userName: name || (t.userId ? `User #${t.userId}` : "—"),
        ...(consultantName && !t.consultantName ? { consultantName, agentName: consultantName } : {}),
      };
    });

    // Second pass: for tickets still showing "User #N", try multiple endpoints
    const needsFetch = firstPass.filter((t: any) => t.userName?.startsWith("User #") && t.userId);
    if (needsFetch.length > 0) {
      const uniqueIds = [...new Set(needsFetch.map((t: any) => t.userId))] as number[];
      const userMap: Record<number, string> = {};
      await Promise.all(uniqueIds.slice(0, 30).map(async (uid) => {
        // Try multiple endpoints — backend may expose user info via different routes
        for (const endpoint of [`/users/${uid}`, `/onboarding/${uid}`, `/members/${uid}`]) {
          try {
            const data = await apiFetch(endpoint);
            const name =
              data?.name || data?.fullName || data?.firstName ||
              data?.username || data?.displayName ||
              (data?.email ? data.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : null) ||
              (data?.phoneNumber ? `User ${data.phoneNumber.slice(-4)}` : null);
            if (name) { userMap[uid] = name; break; }
          } catch { /* try next endpoint */ }
        }
      }));
      return firstPass.map((t: any) =>
        userMap[t.userId] ? { ...t, userName: userMap[t.userId] } : t
      );
    }
    return firstPass;
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
    const updateFn = (t: Ticket) =>
      t.id === ticketId
        ? { ...t, consultantId, consultantName, agentName: consultantName, status: "OPEN" as TicketStatus }
        : t;
    setTickets(prev => prev.map(updateFn));
    // Also update the page cache so the name persists when switching pages
    setPageCache(prev => {
      const updated: Record<number, Ticket[]> = {};
      Object.entries(prev).forEach(([k, v]) => { updated[Number(k)] = v.map(updateFn); });
      return updated;
    });
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

  const getUserDisplay = (t: Ticket) => {
    const name =
      t.user?.name || t.user?.fullName || t.user?.firstName ||
      t.user?.username ||
      (t.user?.email ? t.user.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : null) ||
      t.userName || t.raisedByName || t.clientName;
    return name || (t.userId ? `User #${t.userId}` : "—");
  };

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
        <span style={{ display: "flex", alignItems: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg></span>
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

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {(["ALL", ...ALL_TICKET_STATUSES] as const).map(f => {
          const cfg = f !== "ALL" ? TICKET_STATUS_CFG[f] : null;
          const cnt = f === "ALL" ? totalElements : (counts[f as keyof typeof counts] ?? 0);
          const isActive = filterStatus === f;
          return (
            <button key={f} onClick={() => { setFilterStatus(f as any); setTicketPage(0); setPageCache({}); }}
              style={{
                padding: "4px 12px", borderRadius: 20, border: "1.5px solid",
                borderColor: isActive ? (cfg?.color ?? "#2563EB") : "#E2E8F0",
                background: isActive ? (cfg?.bg ?? "#EFF6FF") : "#fff",
                color: isActive ? (cfg?.color ?? "#2563EB") : "#64748B",
                fontSize: 11, fontWeight: isActive ? 700 : 500, cursor: "pointer", transition: "all 0.15s",
                display: "flex", alignItems: "center", gap: 5,
              }}>
              {f !== "ALL" && isActive && <span style={{ width: 6, height: 6, borderRadius: "50%", background: cfg?.color ?? "#2563EB", flexShrink: 0 }} />}
              {f === "ALL" ? "All" : (cfg?.label ?? f)}
              <span style={{ background: isActive ? "rgba(0,0,0,0.1)" : "#F1F5F9", color: isActive ? "inherit" : "#94A3B8", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "0 5px", minWidth: 16, textAlign: "center" }}>{cnt}</span>
            </button>
          );
        })}
      </div>

      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", color: "#B91C1C", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> {error}</span>
          <button onClick={load} style={{ marginLeft: "auto", padding: "4px 12px", background: "#B91C1C", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#F8FAFC", borderRadius: 16, color: "#94A3B8" }}>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
            <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /></svg>
          </div>
          <p style={{ margin: 0, fontWeight: 600, color: "#64748B" }}>
            {tickets.length === 0 ? "No tickets found." : "No tickets match your filters."}
          </p>
        </div>
      ) : (
        <>
          <div style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 16, overflowX: "auto", overflowY: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <div style={{ minWidth: 980 }}>
            <div style={{ display: "grid", gridTemplateColumns: ticketTableColumns, columnGap: 10, padding: "10px 18px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", alignItems: "center" }}>
              <div style={{ paddingLeft: 2 }}>ID</div><div>TITLE / USER</div><div>CATEGORY</div><div>PRIO</div>
              <div>ASSIGNED TO</div><div>STATUS</div><div style={{ textAlign: "left" }}>CREATED</div>
              <div style={{ textAlign: "right" }}>ACTION</div>
            </div>
            {visible.map((ticket, idx) => {
              const sc = TICKET_STATUS_CFG[ticket.status] ?? TICKET_STATUS_CFG.NEW;
              const pc = TICKET_PRIORITY_CFG[ticket.priority] ?? TICKET_PRIORITY_CFG.MEDIUM;
              const sla = getSlaInfo(ticket);
              const hoursOpen = (Date.now() - new Date(ticket.createdAt).getTime()) / 3_600_000;
              const isOverdue = !["RESOLVED", "CLOSED"].includes(ticket.status) && hoursOpen >= SLA_HOURS_LOCAL;
              const ticketDisplayId = getTicketDisplayId(ticket);
              return (
                <div key={ticket.id}
                  style={{ display: "grid", gridTemplateColumns: ticketTableColumns, columnGap: 10, padding: "12px 18px", borderBottom: idx < visible.length - 1 ? "1px solid #F8FAFC" : "none", borderLeft: `3px solid ${isOverdue ? "#DC2626" : sla?.breached ? "#EF4444" : sla?.warning ? "#F59E0B" : "transparent"}`, background: isOverdue ? "#FFF8F8" : "transparent", transition: "background 0.1s", cursor: "pointer", alignItems: "center" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFF")}
                  onMouseLeave={e => (e.currentTarget.style.background = isOverdue ? "#FFF8F8" : "transparent")}
                  onClick={() => setSelectedTicket(ticket)}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: isOverdue ? "#DC2626" : "#94A3B8", fontFamily: "monospace", lineHeight: 1.35, paddingLeft: 2 }}>
                    {ticketDisplayId}
                    {isOverdue && <div style={{ fontSize: 9, color: "#DC2626", fontWeight: 800 }}>⏰ SLA</div>}
                  </div>
                  <div style={{ minWidth: 0, paddingRight: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ticket.title || ticket.category}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> {getUserDisplay(ticket)}</div>
                    {sla && (
                      <div style={{ fontSize: 10, color: sla.breached ? "#DC2626" : sla.warning ? "#D97706" : "#16A34A", fontWeight: 700, marginTop: 2 }}>
                        {sla.breached ? "SLA BREACHED" : sla.warning ? `⚠️ ${sla.label}` : `${sla.label}`}
                      </div>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}><span style={{ display: "inline-flex", maxWidth: "100%", fontSize: 11, padding: "3px 8px", borderRadius: 6, background: "#F1F5F9", color: "#475569", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.category}</span></div>
                  <div style={{ justifySelf: "start" }}>
                    <span
                      title={pc.label}
                      style={{ fontSize: 11, padding: "3px 7px", borderRadius: 6, background: pc.bg, color: pc.color, fontWeight: 800, cursor: "default", letterSpacing: "0.02em" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.minWidth = "fit-content"; (e.currentTarget as HTMLElement).textContent = pc.label; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).textContent = pc.label.charAt(0); }}
                    >{pc.label.charAt(0)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                    {(() => {
                      const cname = ticket.consultantName || ticket.agentName ||
                        (ticket as any).assignedTo?.name || (ticket as any).consultant?.name ||
                        (ticket.consultantId ? (consultants.find((c: any) => Number(c.id) === Number(ticket.consultantId))?.name || null) : null);
                      return cname
                        ? <span style={{ color: "#16A34A", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", display: "block", whiteSpace: "nowrap" }}>{cname}</span>
                        : <span style={{ color: "#94A3B8", fontWeight: 500 }}>Unassigned</span>;
                    })()}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start", minWidth: 0 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "3px 9px", borderRadius: 6, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontWeight: 700, whiteSpace: "nowrap", lineHeight: "1.4" }}>{sc.icon} {sc.label}</span>
                    {ticket.isEscalated && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, padding: "2px 7px", borderRadius: 6, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FCA5A5", fontWeight: 700, whiteSpace: "nowrap", lineHeight: "1.4" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> Escalated</span>}
                  </div>
                  <div style={{ fontSize: 11, color: "#94A3B8", lineHeight: 1.4 }}>
                    {fmtIST(ticket.createdAt, { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })}
                    {isOverdue && <div style={{ fontSize: 10, color: "#DC2626", fontWeight: 600 }}>{Math.floor(hoursOpen)}h open</div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifySelf: "end", gap: 3 }}>
                    <button onClick={e => { e.stopPropagation(); setSelectedTicket(ticket); }}
                      style={{ width: 68, padding: "4px 0", background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                      Open →
                    </button>
                    <div style={{ display: "flex", gap: 3 }}>
                      <button onClick={async e => {
                        e.stopPropagation();
                        try { await exportSingleTicketExcel(ticket.id); }
                        catch { await clientExportTicketsExcel([ticket], `ticket_${ticket.id}.xlsx`); }
                      }} style={{ width: 32, padding: "3px 0", background: "#F0FDF4", border: "1px solid #86EFAC", color: "#16A34A", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                        XLS
                      </button>
                      <button onClick={async e => {
                        e.stopPropagation();
                        try { await exportSingleTicketPdf(ticket.id); }
                        catch { await clientExportTicketsPdf([ticket], `ticket_${ticket.id}.pdf`); }
                      }} style={{ width: 32, padding: "3px 0", background: "#FEF2F2", border: "1px solid #FCA5A5", color: "#DC2626", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer", textAlign: "center" }}>
                        PDF
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
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

  // Load latest profile from backend on mount — GET /api/onboarding/{adminId}
  React.useEffect(() => {
    if (!adminId) return;
    const token = localStorage.getItem("fin_token") || "";
    fetch(`${BASE_URL}/onboarding/${adminId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (!data) return;
        const updated: AdminProfile = {
          name: data.name || profile.name,
          email: data.email || profile.email,
          phone: data.phoneNumber || profile.phone,
          orgName: profile.orgName, // not in onboarding response — keep local
          designation: profile.designation,
          avatarUrl: data.profileImageUrl || profile.avatarUrl,
        };
        setProfile(updated);
        setAvatarPreview(updated.avatarUrl);
        // Sync to localStorage cache
        localStorage.setItem("fin_user_name", updated.name);
        localStorage.setItem("fin_user_email", updated.email);
        localStorage.setItem("fin_user_phone", updated.phone);
        if (updated.avatarUrl) localStorage.setItem("fin_avatar_url", updated.avatarUrl);
      })
      .catch(() => { /* use localStorage values */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminId]);

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
  const [secForm, setSecForm] = React.useState({ newPass: "", confirm: "" });
  const [secSaving, setSecSaving] = React.useState(false);
  const [secMsg, setSecMsg] = React.useState<{ text: string; ok: boolean } | null>(null);
  const [showPasswords, setShowPasswords] = React.useState({ newPass: false, confirm: false });

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

      // Build multipart/form-data request as required by:
      // PUT /api/onboarding/{id}  — consumes multipart/form-data
      // "data" part: UpdateUserRegistrationRequest JSON
      // "file" part: optional profile image file
      const onboardingPayload = {
        name: profile.name.trim(),
        email: profile.email.trim(),
        phoneNumber: profile.phone.trim(),
        location: profile.orgName.trim(), // map orgName → location field
      };

      const fd = new FormData();
      fd.append("data", new Blob([JSON.stringify(onboardingPayload)], { type: "application/json" }));

      // If user selected a new avatar file, attach it
      const fileInput = avatarInputRef.current;
      if (fileInput?.files?.[0]) {
        fd.append("file", fileInput.files[0]);
      }

      let backendSaved = false;
      try {
        const res = await fetch(`${BASE_URL}/onboarding/${adminId}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          // Do NOT set Content-Type — browser sets it automatically with multipart boundary
          body: fd,
        });
        if (res.ok) {
          backendSaved = true;
          const data = await res.json().catch(() => ({}));
          // Update local state from backend response
          if (data.name) setProfile(prev => ({ ...prev, name: data.name }));
          if (data.profileImageUrl) {
            setAvatarPreview(data.profileImageUrl);
            localStorage.setItem("fin_avatar_url", data.profileImageUrl);
          }
        } else if (res.status === 403) {
          showMsg(setProfileMsg, "Not authorised to update this profile.", false);
          return;
        }
      } catch { /* network error — fall through to localStorage */ }

      // Also try PUT /api/users/{id} to update the core login identifier (email)
      try {
        const userRes = await fetch(`${BASE_URL}/users/${adminId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ identifier: profile.email.trim() }),
        });
        if (userRes.ok) backendSaved = true;
      } catch { /* non-fatal */ }

      // Always persist to localStorage as cache / fallback
      localStorage.setItem("fin_user_name", profile.name.trim());
      localStorage.setItem("fin_user_email", profile.email.trim());
      localStorage.setItem("fin_user_phone", profile.phone.trim());
      localStorage.setItem("fin_org_name", profile.orgName.trim());
      localStorage.setItem("fin_designation", profile.designation.trim());
      if (avatarPreview) localStorage.setItem("fin_avatar_url", avatarPreview);

      showMsg(setProfileMsg,
        backendSaved ? "Profile saved successfully!" : "Saved locally — backend sync failed.",
        backendSaved
      );
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
      // NOTE: The provided backend OpenAPI spec does not define
      //   PUT /api/users/notification-preferences
      // so we persist preferences locally only.
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
    if (secForm.newPass.length < 8) { showMsg(setSecMsg, "New password must be at least 8 characters.", false); return; }
    if (secForm.newPass !== secForm.confirm) { showMsg(setSecMsg, "Passwords do not match.", false); return; }
    setSecSaving(true);
    try {
      const token = localStorage.getItem("fin_token") || "";
      // NOTE: Encryption disabled until backend adds PasswordDecryptionUtil.
      // Once backend is ready, encrypt once: const enc = await encryptPassword(secForm.newPass);
      // then send: { newPassword: enc, confirmPassword: enc }
      // Backend: PUT /api/users/change-password  { newPassword, confirmPassword }
      const res = await fetch(`${BASE_URL}/users/change-password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: secForm.newPass, confirmPassword: secForm.confirm }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        // Surface field-level errors from backend
        const msg = err.fieldErrors?.confirmPassword || err.fieldErrors?.newPassword ||
          err.message || `Request failed (HTTP ${res.status})`;
        throw new Error(msg);
      }
      setSecForm({ newPass: "", confirm: "" });
      showMsg(setSecMsg, "Password changed successfully! Please log in again if prompted.", true);
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
    { id: "profile", icon: "profile", label: "General Profile", desc: "Update your name, email, organisation details and avatar" },
    { id: "notifications", icon: "notifications", label: "Notifications", desc: "Control which alerts you receive via email and in-app" },
    { id: "security", icon: "security", label: "Security", desc: "Change your password and manage account security" },
    { id: "logout", icon: "logout", label: "Logout", desc: "Sign out of your admin account" },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A", display: "flex", alignItems: "center", gap: 10 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg> Settings</h2>
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
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}>
                  {getSettingsTabSvg(tab.id, activeTab === tab.id)}
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
                    ><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg></button>
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
                    {profileMsg.ok ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} {profileMsg.text}
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
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg></div>
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
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: "#F5F3FF", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg></div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>In-App Notifications</div>
                    </div>
                    <Toggle checked={notifPrefs.inAppNewTicket} onChange={v => setNotifPrefs({ ...notifPrefs, inAppNewTicket: v })} label="New tickets bell alert" sub="Shows in the top notification bell" />
                    <Toggle checked={notifPrefs.inAppSlaBreaches} onChange={v => setNotifPrefs({ ...notifPrefs, inAppSlaBreaches: v })} label="SLA breach warnings" sub="Red alert when a ticket crosses SLA window" />
                    <Toggle checked={notifPrefs.inAppAssignments} onChange={v => setNotifPrefs({ ...notifPrefs, inAppAssignments: v })} label="Consultant assignments" sub="Confirmation toast on successful assign" />
                  </div>
                </div>

                {notifMsg && (
                  <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 9, background: notifMsg.ok ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${notifMsg.ok ? "#86EFAC" : "#FECACA"}`, color: notifMsg.ok ? "#166534" : "#B91C1C", fontSize: 13, fontWeight: 600 }}>
                    {notifMsg.ok ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} {notifMsg.text}
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
                  <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#1E40AF", fontWeight: 600 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> Set a new password for your admin account. Make sure it meets all the requirements below.</span>
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
                        {showPasswords.newPass ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
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
                        {showPasswords.confirm ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
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
                        {r.met ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8" /></svg>} {r.rule}
                      </div>
                    ))}
                  </div>

                  {secMsg && (
                    <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, background: secMsg.ok ? "#F0FDF4" : "#FEF2F2", border: `1px solid ${secMsg.ok ? "#86EFAC" : "#FECACA"}`, color: secMsg.ok ? "#166534" : "#B91C1C", fontSize: 13, fontWeight: 600 }}>
                      {secMsg.ok ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} {secMsg.text}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => { setSecForm({ newPass: "", confirm: "" }); setActiveTab(null); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                    <button
                      onClick={handleChangePassword}
                      disabled={secSaving || !secForm.newPass || secForm.newPass.length < 8 || secForm.newPass !== secForm.confirm}
                      style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: (secSaving || !secForm.newPass || secForm.newPass.length < 8 || secForm.newPass !== secForm.confirm) ? "#E2E8F0" : "#0F172A", color: (secSaving || !secForm.newPass || secForm.newPass.length < 8 || secForm.newPass !== secForm.confirm) ? "#94A3B8" : "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
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
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg> Logout</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "10px 0" }}>
                    <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v0" /><path d="M14 10V4a2 2 0 0 0-4 0v2" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg></div>
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
  <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: ok ? "#0F172A" : "#7F1D1D", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 9999, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8 }}>
    {ok
      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FCA5A5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>}
    {msg}
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
          {filtered.length === 0 && <div style={{ ...sc_styles.emptyState, display: "flex", alignItems: "center", gap: 6 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> All tickets assigned for this filter.</div>}
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
                    {breached && <span style={{ ...sc_styles.badge, background: "#FEF2F2", color: "#DC2626", display: "inline-flex", alignItems: "center", gap: 3 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>SLA</span>}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", marginBottom: 2 }}>{t.title || t.category}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", display: "flex", alignItems: "center", gap: 4 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> {t.userName || `User #${t.userId}`} · {t.category}</div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {t.agentName
                    ? <span style={{ fontSize: 11, color: "#16A34A", fontWeight: 600, background: "#F0FDF4", padding: "3px 8px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> {t.agentName}</span>
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
          {selTicket && <div style={{ fontSize: 11, color: "#2563EB", textAlign: "center", fontWeight: 600, padding: "8px 0" }}>Click agent to assign Ticket {getTicketDisplayId(selTicket)}</div>}
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
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<Omit<CannedResponse, "id">>({ title: "", category: "General", body: "" });
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  const openNewModal = () => { setEditing(null); setForm({ title: "", category: "General", body: "" }); setShowModal(true); };
  const openEditModal = (r: CannedResponse) => { setEditing(r.id); setForm({ title: r.title, category: r.category, body: r.body }); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setEditing(null); };

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
        closeModal();
        showToast("Response updated");
      } else {
        const created = await apiFetch("/admin/config/canned-responses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: form.title, content: form.body, category: form.category }),
        });
        setResponses(p => [...p, { ...form, id: created?.id ?? Date.now() }]);
        closeModal();
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
      {/* ── Modal Popup ── */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={closeModal} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(4px)" }} />
          <div style={{
            position: "relative", width: "min(520px, 95vw)", background: "#fff",
            borderRadius: 18, boxShadow: "0 24px 60px rgba(0,0,0,0.22)",
            animation: "slideInRight 0.2s ease", overflow: "hidden",
          }}>
            {/* Modal header */}
            <div style={{ background: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)", padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{editing !== null ? "Edit Canned Response" : "New Canned Response"}</div>
                  <div style={{ fontSize: 11, color: "#93C5FD" }}>Predefined reply for quick use in tickets</div>
                </div>
              </div>
              <button onClick={closeModal} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            {/* Modal body */}
            <div style={{ padding: "24px" }}>
              <label style={sc_styles.label}>Title</label>
              <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Billing Refund" style={{ ...sc_styles.input, marginBottom: 14 }} />
              <label style={sc_styles.label}>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} style={{ ...sc_styles.select, marginBottom: 14 }}>
                {["General", "Billing", "Technical", "Escalation", "Advisory", "Compliance"].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <label style={sc_styles.label}>Body</label>
              <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={6} placeholder="Use #{ticket_id}, #{user_name}" style={{ ...sc_styles.input, resize: "vertical" as any, marginBottom: 0 }} />
            </div>
            {/* Modal footer */}
            <div style={{ padding: "16px 24px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 10 }}>
              <button onClick={closeModal} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={save} style={{ ...sc_styles.primaryBtn, flex: 2, padding: "10px", borderRadius: 10, justifyContent: "center", display: "flex", alignItems: "center", gap: 6 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                </svg>
                {editing !== null ? "Save Changes" : "Create Response"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={sc_styles.panelHeader}>
        <div>
          <h3 style={sc_styles.panelTitle}>Canned Responses</h3>
          <p style={sc_styles.panelSub}>Predefined replies · use shortcuts while typing in ticket replies</p>
        </div>
        <button onClick={openNewModal} style={{ ...sc_styles.primaryBtn, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          New Response
        </button>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search responses…" style={{ ...sc_styles.input, marginBottom: 16 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
            <img src={logoImg} alt="Meet The Masters" style={{ width: 56, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: 40 }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>No canned responses found</div>
            <div style={{ fontSize: 12 }}>Click "New Response" to create your first one.</div>
          </div>
        ) : filtered.map(r => (
          <div key={r.id} style={{ ...sc_styles.cannedCard, cursor: "default" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>{r.title}</span>
                <span style={{ fontSize: 11, background: "#EFF6FF", color: "#2563EB", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{r.category}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => openEditModal(r)} title="Edit" style={{ ...sc_styles.iconBtn, color: "#2563EB" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button onClick={() => deleteResponse(r.id)} title="Delete" style={{ ...sc_styles.iconBtn, color: "#DC2626" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#64748B", margin: 0, lineHeight: 1.5, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box" as any, WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{r.body}</p>
          </div>
        ))}
      </div>
      {toast && <MiniToast msg={toast} />}
    </div>
  );
};

interface TicketCategory { id: number; name: string; color: string; icon: string; slaOverride: number | null; defaultPriority: string; }

const CategoriesConfig: React.FC<{}> = () => {
  const [cats, setCats] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCat, setNewCat] = useState({ name: "", color: "#2563EB", icon: "pin", slaOverride: "", defaultPriority: "MEDIUM" });
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };
  const PRIOS = ["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"];

  useEffect(() => {
    setLoading(true);
    getTicketCategories()
      .then(arr => setCats(arr.map((c: any) => ({ id: c.id, name: c.name, color: c.color || "#2563EB", icon: c.icon || "pin", slaOverride: c.slaOverride ?? null, defaultPriority: c.defaultPriority || "MEDIUM" }))))
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
      setNewCat({ name: "", color: "#2563EB", icon: "pin", slaOverride: "", defaultPriority: "MEDIUM" });
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
                  <span style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", fontFamily: "monospace" }}>{CFG_SLA_HOURS[p]}</span>
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
        {loading ? <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}><img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} /></div>
          : cats.map((c, i) => (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "40px 1fr 80px 130px 120px 80px", padding: "12px 16px", borderTop: i > 0 ? "1px solid #F8FAFC" : "none", alignItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.color || "#2563EB"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z" /><circle cx="12" cy="9" r="2.5" fill={c.color || "#2563EB"} stroke="none" /></svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{c.name}</span>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.color, border: "2px solid #E2E8F0" }} />
              <select value={c.defaultPriority} onChange={e => updateCat(c.id, { defaultPriority: e.target.value })} style={{ ...sc_styles.select, fontSize: 11, padding: "4px 8px" }}>
                {PRIOS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <input type="number" value={c.slaOverride ?? ""} onChange={e => updateCat(c.id, { slaOverride: e.target.value ? Number(e.target.value) : null })} placeholder="Global" style={{ ...sc_styles.input, fontSize: 11, padding: "4px 8px", width: 80, fontFamily: "monospace" }} />
              <button onClick={() => deleteCat(c.id)} style={{ ...sc_styles.iconBtn, color: "#DC2626" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg></button>
            </div>
          ))}
      </div>
      <div style={{ ...sc_styles.editorCard, display: "grid", gridTemplateColumns: "60px 1fr 80px 130px 100px auto", gap: 10, alignItems: "flex-end" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 6 }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={newCat.color || "#2563EB"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 5.25-7 13-7 13S5 14.25 5 9a7 7 0 0 1 7-7z" /><circle cx="12" cy="9" r="2.5" fill={newCat.color || "#2563EB"} stroke="none" /></svg>
        </div>
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
    { label: "Total Tickets", value: total, color: "#2563EB", icon: "ticket" },
    { label: "Resolved", value: resolved, color: "#16A34A", icon: "resolved", sub: `${total ? Math.round(resolved / total * 100) : 0}% rate` },
    { label: "SLA Breaches", value: breached, color: "#DC2626", icon: "breach" },
    { label: "Escalated", value: escalated, color: "#D97706", icon: "escalate" },
    { label: "Avg First Response", value: avgResp === "—" ? "—" : `${avgResp}m`, color: "#7C3AED", icon: "response" },
    { label: "Avg Resolution", value: avgRes === "—" ? "—" : `${avgRes}h`, color: "#059669", icon: "clock" },
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
            <div style={{ width: 32, height: 32, borderRadius: 8, background: `${k.color}18`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              {k.icon === "ticket" && <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={k.color} strokeWidth="2" strokeLinecap="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /></svg>}
              {k.icon === "breach" && <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={k.color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>}
              {k.icon === "escalate" && <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={k.color} strokeWidth="2" strokeLinecap="round"><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></svg>}
              {k.icon === "response" && <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={k.color} strokeWidth="2" strokeLinecap="round"><polyline points="13 2 13 9 20 9" /><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /></svg>}
              {k.icon === "clock" && <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={k.color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
              {k.icon === "resolved" && <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={k.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
              {!["ticket", "breach", "escalate", "response", "clock", "resolved"].includes(k.icon as string) && <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke={k.color} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
            </div>
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
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#64748B" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                  {s.assigned} assigned
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "#16A34A" }}>
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  {s.resolved} resolved
                </span>
              </div>
              {s.resCount > 0 && <div style={{ fontSize: 11, color: "#059669", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}><svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> Avg {(s.totalRes / s.resCount).toFixed(1)}h resolution</div>}
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

  if (loadingInit) return (<div style={{ textAlign: "center", padding: 48 }}><img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} /></div>);

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
                    <span style={{ display: "flex", alignItems: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg></span>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{h.name}</div><div style={{ fontSize: 11, color: "#94A3B8", fontFamily: "monospace" }}>{h.date}</div></div>
                    <button onClick={() => deleteHoliday(h.id)} style={{ ...sc_styles.iconBtn, color: "#DC2626" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
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

type ConfigTab = "canned" | "categories" | "autoresponder";
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
    // Load localStorage history first so we always have version history
    const localData = localStorage.getItem("fin_terms_versions");
    let localVers: TermsVersion[] = [];
    if (localData) {
      try { localVers = JSON.parse(localData); } catch { }
    }

    apiFetch("/static-content/TERMS_AND_CONDITIONS")
      .then((data: any) => {
        if (data && (data.content || data.text)) {
          const ver: TermsVersion = {
            id: data.contentId || 1,
            version: data.version || "1.0",
            content: data.content || data.text || "",
            updatedAt: data.lastUpdatedDate || data.updatedAt || new Date().toISOString(),
            updatedBy: data.lastUpdatedBy || "Admin",
            isActive: true,
          };
          if (localVers.length > 0) {
            // Use localStorage active flag — don't let backend override "Set as Active" choice
            const activeId = localVers.find(v => v.isActive)?.id;
            const merged = localVers.map(v => ({ ...v, isActive: v.id === (activeId ?? ver.id) }));
            const alreadyExists = merged.some(v => v.id === ver.id);
            if (!alreadyExists) {
              // Add backend version, mark active only if no other is active
              merged.push({ ...ver, isActive: !activeId });
            } else {
              // Update content but keep isActive from localStorage
              const idx = merged.findIndex(v => v.id === ver.id);
              merged[idx] = { ...ver, isActive: merged[idx].isActive };
            }
            setVersions(merged.sort((a, b) => a.id - b.id));
            return;
          }
          setVersions([ver]);
        } else {
          throw new Error("empty");
        }
      })
      .catch(() => {
        if (localVers.length > 0) { setVersions(localVers); return; }
        const defaultVer: TermsVersion = {
          id: 1, version: "1.0", content: DEFAULT_TERMS,
          updatedAt: new Date().toISOString(), updatedBy: "Admin", isActive: true,
        };
        setVersions([defaultVer]);
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
      // POST /api/static-content — StaticContentController upsert
      await apiFetch("/static-content", {
        method: "POST",
        body: JSON.stringify({
          contentType: "TERMS_AND_CONDITIONS",
          content: editContent,
          lastUpdatedBy: "Admin",
        }),
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
    showToast(`Terms & Conditions v${editVersion} saved and published.`);
    setSaving(false);
  };

  const handleSetActive = (id: number) => {
    const updated = versions.map(v => ({ ...v, isActive: v.id === id }));
    setVersions(updated);
    localStorage.setItem("fin_terms_versions", JSON.stringify(updated));
    showToast("Active version updated.");
    // NOTE: The provided backend OpenAPI spec does not define
    //   PUT /api/admin/terms-and-conditions/{id}/activate
    // We keep the active version locally; publishing happens via POST /api/static-content.
    try {
      const active = updated.find(v => v.isActive);
      if (active?.content) {
        apiFetch("/static-content", {
          method: "POST",
          body: JSON.stringify({
            contentType: "TERMS_AND_CONDITIONS",
            content: active.content,
            lastUpdatedBy: "Admin",
          }),
        }).catch(() => { });
      }
    } catch { }
  };

  const fmtDate = (iso: string) => {
    try { return fmtIST(iso, IST_OPTS_DATETIME); }
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
          <button onClick={handleStartEdit} style={sc_styles.primaryBtn}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg> Edit &amp; Publish New Version</span></button>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 20, alignItems: "start" }}>

        {/* Version history table */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Version History
          </div>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
              <img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
            </div>
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
                      style={{ ...sc_styles.filterPill, ...(previewMode ? {} : sc_styles.filterPillActive) }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg> Edit</span></button>
                    <button onClick={() => setPreviewMode(true)}
                      style={{ ...sc_styles.filterPill, ...(previewMode ? sc_styles.filterPillActive : {}) }}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg> Preview</span></button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setEditing(false)} style={sc_styles.ghostBtn}>Cancel</button>
                  <button onClick={handleSave} disabled={saving}
                    style={{ ...sc_styles.primaryBtn, opacity: saving ? 0.7 : 1 }}>
                    {saving ? "Saving…" : <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg> Save &amp; Publish</span>}
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
                <button onClick={handleStartEdit} style={sc_styles.primaryBtn}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg> Edit</span></button>
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
      const BASE_INNER = API_BASE_URL;

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

      showToast(`Member "${form.name.trim()}" added! Login credentials sent to ${form.email.trim().toLowerCase()}.`);
      setForm({ name: "", email: "", mobileNumber: "", location: "" });
      setErrors({});
    } catch (err: any) {
      showToast(`${err?.message || "Failed to add member."}`, false);
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
            Create new user accounts. Login credentials will be emailed to the member automatically.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>

        {/* Form */}
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "22px 24px" }}>
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

          {/* Simple info */}
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "12px 16px", marginTop: 16, fontSize: 12, color: "#1E40AF", lineHeight: 1.6 }}>
            <strong>How it works:</strong> A secure password is automatically created and the member's login details are sent to their email. They can log in immediately and update their password from their profile.
          </div>

          {/* Submit */}
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={() => { setForm({ name: "", email: "", mobileNumber: "", location: "" }); setErrors({}); }}
              style={sc_styles.ghostBtn}>Reset</button>
            <button onClick={handleAddMember} disabled={saving}
              style={{ ...sc_styles.primaryBtn, flex: 1, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Adding…" : <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg> Add Member</span>}
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
                      Added {fmtIST(m.addedAt, IST_OPTS_DATE)}
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
  { id: "canned", label: "Canned Responses", icon: "canned" },
  { id: "categories", label: "Categories", icon: "categories" },
  { id: "autoresponder", label: "Auto-Responders", icon: "autoresponder" },
];

const AutoResponderPanel: React.FC = () => {
  // ── Responder 1 (New Ticket) ──────────────────────────────────────────────
  const [ar1Enabled, setAr1Enabled] = useState(false);
  const [ar1Message, setAr1Message] = useState("Thank you for reaching out! We will review your ticket shortly.");
  const [ar1Saving, setAr1Saving] = useState(false);

  // ── Responder 2 (Resolved Ticket) ─────────────────────────────────────────
  const [ar2Enabled, setAr2Enabled] = useState(false);
  const [ar2Message, setAr2Message] = useState("Your ticket has been resolved. Please let us know if you need further assistance.");
  const [ar2Saving, setAr2Saving] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  useEffect(() => {
    (async () => {
      try {
        const d = await getAutoResponder();
        setAr1Enabled(d.enabled ?? false);
        if (d.message) setAr1Message(d.message);
      } catch { }
      try {
        const d2 = await apiFetch("/admin/settings/auto-responder-resolved");
        setAr2Enabled(d2.enabled ?? false);
        if (d2.message) setAr2Message(d2.message);
      } catch {
        // backend may not have this endpoint yet — use localStorage fallback
        try {
          const stored = localStorage.getItem("ar2_config");
          if (stored) { const p = JSON.parse(stored); setAr2Enabled(p.enabled ?? false); if (p.message) setAr2Message(p.message); }
        } catch { }
      }
    })();
  }, []);

  const saveAr1 = async () => {
    setAr1Saving(true);
    try { await updateAutoResponder({ enabled: ar1Enabled, message: ar1Message }); showToast("Auto-responder 1 saved."); }
    catch { showToast("Failed to save responder 1."); }
    finally { setAr1Saving(false); }
  };

  const saveAr2 = async () => {
    setAr2Saving(true);
    try {
      await apiFetch("/admin/settings/auto-responder-resolved", {
        method: "POST",
        body: JSON.stringify({ enabled: ar2Enabled, message: ar2Message }),
      });
      showToast("Auto-responder 2 saved.");
    } catch {
      // Fallback: persist to localStorage if backend endpoint not available yet
      try { localStorage.setItem("ar2_config", JSON.stringify({ enabled: ar2Enabled, message: ar2Message })); showToast("Auto-responder 2 saved (local)."); }
      catch { showToast("Failed to save responder 2."); }
    } finally { setAr2Saving(false); }
  };

  const Toggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
    <label style={{ position: "relative", display: "inline-block", width: 44, height: 24, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: "absolute", inset: 0, background: checked ? "#2563EB" : "#CBD5E1", borderRadius: 24, transition: "0.2s" }}>
        <span style={{ position: "absolute", left: checked ? 22 : 2, top: 2, width: 20, height: 20, background: "#fff", borderRadius: "50%", transition: "0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
      </span>
    </label>
  );

  const ResponderCard = ({
    title, subtitle, tag, tagColor, enabled, onToggle, message, onMessageChange, saving, onSave,
  }: {
    title: string; subtitle: string; tag: string; tagColor: string;
    enabled: boolean; onToggle: (v: boolean) => void;
    message: string; onMessageChange: (v: string) => void;
    saving: boolean; onSave: () => void;
  }) => (
    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 24, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{title}</span>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: tagColor + "22", color: tagColor, letterSpacing: "0.05em", textTransform: "uppercase" }}>{tag}</span>
          </div>
          <div style={{ fontSize: 12, color: "#64748B" }}>{subtitle}</div>
        </div>
        <Toggle checked={enabled} onChange={onToggle} />
      </div>
      <div>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>Message</label>
        <textarea
          value={message}
          onChange={e => onMessageChange(e.target.value)}
          rows={5}
          style={{ width: "100%", border: "1.5px solid #E2E8F0", borderRadius: 10, padding: "10px 14px", fontSize: 13, fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", opacity: enabled ? 1 : 0.5 }}
          placeholder="Auto-response message..."
          disabled={!enabled}
        />
      </div>
      <button onClick={onSave} disabled={saving}
        style={{ alignSelf: "flex-start", padding: "10px 24px", background: saving ? "#E2E8F0" : "#2563EB", color: saving ? "#94A3B8" : "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: saving ? "default" : "pointer", transition: "all 0.15s" }}>
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Auto-Responders</div>
        <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>Automated replies sent to customers at different ticket stages</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 20 }}>
        <ResponderCard
          title="New Ticket Responder"
          subtitle="Sent automatically when a ticket is created"
          tag="On Create"
          tagColor="#2563EB"
          enabled={ar1Enabled} onToggle={setAr1Enabled}
          message={ar1Message} onMessageChange={setAr1Message}
          saving={ar1Saving} onSave={saveAr1}
        />
        <ResponderCard
          title="Resolved Ticket Responder"
          subtitle="Sent automatically when a ticket is resolved or closed"
          tag="On Resolve"
          tagColor="#16A34A"
          enabled={ar2Enabled} onToggle={setAr2Enabled}
          message={ar2Message} onMessageChange={setAr2Message}
          saving={ar2Saving} onSave={saveAr2}
        />
      </div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#0F172A", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast}</div>}
    </div>
  );
};

const SupportConfigPanel: React.FC<SupportConfigProps> = ({ tickets, advisors, onAssign }) => {
  const [tab, setTab] = useState<ConfigTab>("canned");
  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Support Configuration</h2>
        <p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>Manage canned responses, ticket categories, and auto-responder settings</p>
      </div>
      <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
        <div style={{ display: "flex", borderBottom: "1px solid #E2E8F0", overflowX: "auto" }}>
          {SUPPORT_CONFIG_TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: "13px 20px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === t.id ? 700 : 500, color: tab === t.id ? "#2563EB" : "#64748B", borderBottom: tab === t.id ? "2px solid #2563EB" : "2px solid transparent", display: "flex", alignItems: "center", gap: 7, transition: "all 0.15s", whiteSpace: "nowrap", fontFamily: "inherit" }}>
              <span style={{ color: tab === t.id ? "#2563EB" : "#94A3B8", display: "flex", alignItems: "center" }}>{getConfigTabSvg(t.id, tab === t.id)}</span>{t.label}
            </button>
          ))}
        </div>
        <div style={{ padding: "24px" }}>
          {tab === "canned" && <CannedResponses />}
          {tab === "categories" && <CategoriesConfig />}
          {tab === "autoresponder" && <AutoResponderPanel />}
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
  const BASE_ADMIN = API_BASE_URL;
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
    const status = (b.BookingStatus || b.bookingStatus || b.status || "").toUpperCase();
    return statusFilter === "ALL" || status === statusFilter;
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
        showToast(`Booking #${id} deleted successfully.`);
      } else {
        showToast(`Failed to delete booking #${id}.`);
      }
    } catch {
      showToast(`Network error. Could not delete booking.`);
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
            <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg></div>
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
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
            </svg>
          </div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>No bookings yet</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#94A3B8" }}>
          <div style={{ marginBottom: 10, display: "flex", justifyContent: "center" }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg></div>
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
            const consultantName =
              b.consultantName || b.consultant?.name ||
              b.advisorName || b.advisor?.name ||
              advisorMap[b.consultantId] ||
              (b.consultantId ? `Consultant #${b.consultantId}` : "—");
            const userName =
              b.userName || b.user?.name || b.user?.fullName ||
              b.user?.username || b.clientName || b.bookedByName ||
              b.raisedByName ||
              (b.user?.email ? b.user.email.split("@")[0] : null) ||
              (b.userId ? `User #${b.userId}` : "—");
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
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>
                    {slotDate && slotDate.includes("T") ? fmtIST(slotDate, IST_OPTS_DATE) : slotDate}
                  </div>
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
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg> Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {toast && <MiniToast msg={toast} />}
    </div>
  );
};


// ─────────────────────────────────────────────────────────────────────────────
// INNER ADMIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION CONFIG PANEL — uses getFeeConfig/updateFeeConfig from api.ts
// Backend: GET/POST /api/admin/settings/additional-charges
// ─────────────────────────────────────────────────────────────────────────────
const CommissionConfigPanel: React.FC = () => {
  const [feeConfig, setFeeConfig] = React.useState<FeeConfig>({ feeType: "FLAT", feeValue: "0" });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<number | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const config = await getFeeConfig();
        setFeeConfig(config);
      } catch { /* getFeeConfig is already safe */ }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    const val = parseFloat(feeConfig.feeValue);
    if (isNaN(val) || val < 0) { showToast("Please enter a valid commission value (0 or greater)."); return; }
    if (feeConfig.feeType === "PERCENTAGE" && val > 100) { showToast("Percentage cannot exceed 100%."); return; }
    setSaving(true);
    try {
      const saved = await updateFeeConfig(feeConfig);
      setFeeConfig(saved);
      showToast("Commission settings saved successfully.");
    } catch (e: any) { showToast(e?.message || "Failed to save commission."); }
    finally { setSaving(false); }
  };

  const inp: React.CSSProperties = { width: "100%", padding: "10px 14px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const exampleBase = preview ?? 1000;
  const { commission: exCommission, total: exTotal } = calculateTotalPrice(exampleBase, feeConfig);

  return (
    <div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#0F172A", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>{toast}</div>}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Commission Configuration</h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>
          Set the platform commission added on top of each consultant's base fee. The backend (BookingService) adds this automatically when a booking is created.
        </p>
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, padding: 28, maxWidth: 540, boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
          {/* Commission Type */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Commission Type</div>
            <div style={{ display: "flex", gap: 10 }}>
              {(["FLAT", "PERCENTAGE"] as const).map(type => (
                <button key={type} onClick={() => setFeeConfig(f => ({ ...f, feeType: type }))}
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: `2px solid ${feeConfig.feeType === type ? "#2563EB" : "#E2E8F0"}`, background: feeConfig.feeType === type ? "#EFF6FF" : "#fff", color: feeConfig.feeType === type ? "#2563EB" : "#64748B", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                  {type === "FLAT" ? "Fixed Amount (₹)" : "Percentage (%)"}
                </button>
              ))}
            </div>
          </div>
          {/* Commission Value */}
          <div style={{ marginBottom: 22 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 8 }}>
              Commission Value <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              {feeConfig.feeType === "FLAT" && (
                <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "#64748B", pointerEvents: "none" }}>
                  ₹
                </span>
              )}
              <input
                value={feeConfig.feeValue}
                onChange={e => setFeeConfig(f => ({ ...f, feeValue: e.target.value }))}
                placeholder={feeConfig.feeType === "PERCENTAGE" ? "e.g. 15" : "e.g. 200"}
                type="number"
                min="0"
                max={feeConfig.feeType === "PERCENTAGE" ? "100" : undefined}
                style={{ ...inp, paddingLeft: feeConfig.feeType === "FLAT" ? 40 : 14, paddingRight: feeConfig.feeType === "PERCENTAGE" ? 40 : 14 }}
              />
              {feeConfig.feeType === "PERCENTAGE" && (
                <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "#64748B", pointerEvents: "none" }}>
                  %
                </span>
              )}
            </div>
          </div>
          {/* Preview calculator */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Live Preview</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#64748B" }}>If consultant charges ₹</span>
              <input
                value={preview ?? 1000}
                onChange={e => setPreview(Number(e.target.value) || 0)}
                type="number"
                min="0"
                style={{ width: 100, padding: "6px 10px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, outline: "none" }}
              />
              <span style={{ fontSize: 13, color: "#64748B" }}>the customer pays:</span>
            </div>
            <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#475569" }}>Consultant Base</span>
                <span style={{ fontWeight: 600 }}>₹{exampleBase.toLocaleString()}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#475569" }}>Platform Commission</span>
                <span style={{ fontWeight: 600, color: "#2563EB" }}>₹{exCommission.toLocaleString()}</span>
              </div>
              <div style={{ height: 1, background: "#BBF7D0", margin: "6px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span style={{ fontWeight: 700, color: "#166534" }}>Total Customer Pays</span>
                <span style={{ fontWeight: 800, color: "#166534" }}>₹{exTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: "12px 28px", borderRadius: 10, border: "none", background: saving ? "#93C5FD" : "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Saving…" : "Save Commission Settings"}
          </button>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOKINGS SECTION WRAPPER — header with inline Refresh button on the left
// ─────────────────────────────────────────────────────────────────────────────
const BookingsSectionWrapper: React.FC<{ allBookings: any[] }> = ({ allBookings }) => {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setRefreshKey(k => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #E2E8F0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#065F46,#059669)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(5,150,105,0.3)", flexShrink: 0 }}>
            <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
            </svg>
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.4px" }}>Bookings</h2>
              {/* Refresh button — inline beside the title */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh bookings"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "5px 13px", borderRadius: 8,
                  border: "1.5px solid #D1FAE5", background: "#F0FDF4",
                  color: "#059669", fontSize: 12, fontWeight: 700,
                  cursor: refreshing ? "default" : "pointer",
                  fontFamily: "inherit", transition: "all 0.15s",
                  opacity: refreshing ? 0.7 : 1,
                }}
              >
                <svg
                  width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  style={{ transition: "transform 0.5s", transform: refreshing ? "rotate(360deg)" : "rotate(0deg)" }}
                >
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "#64748B" }}>
              {allBookings.length > 0 ? `${allBookings.length} booking${allBookings.length !== 1 ? "s" : ""} total` : "All scheduled sessions"}
            </p>
          </div>
        </div>
      </div>
      <BookingsPage key={refreshKey} isAdmin={true} />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SKILLS & QUESTIONS MANAGEMENT PANEL
// Skills tab: full CRUD for skill categories (linked to consultant tags & onboarding)
// Questions tab: post-booking questions shown to clients (NOT linked to skills)
//   Question types: radio | multiselect | text | mobile (with 10-digit IN validation)
// ─────────────────────────────────────────────────────────────────────────────
const QuestionsManagementPanel: React.FC = () => {
  type QType = "radio" | "multiselect" | "text" | "mobile";
  interface QItem { id?: number; text: string; type: QType; options?: string[]; placeholder?: string; updatedAt?: string; }
  interface SkillItem { id: number; name: string; skillName?: string; description?: string; isActive?: boolean; }
  const QUESTIONS_CACHE_KEY = "fin_admin_questions_cache";

  // ── State ──
  const [panelTab, setPanelTab] = React.useState<"skills" | "questions">("skills");
  const [skills, setSkills] = React.useState<SkillItem[]>([]);
  const [questions, setQuestions] = React.useState<QItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Skill form
  const [showSkillForm, setShowSkillForm] = React.useState(false);
  const [editingSkill, setEditingSkill] = React.useState<SkillItem | null>(null);
  const [savingSkill, setSavingSkill] = React.useState(false);
  const [deletingSkill, setDeletingSkill] = React.useState<number | null>(null);
  const [skillForm, setSkillForm] = React.useState<{ name: string; description: string }>({ name: "", description: "" });

  // Question form
  const [showQForm, setShowQForm] = React.useState(false);
  const [editingQ, setEditingQ] = React.useState<QItem | null>(null);
  const [savingQ, setSavingQ] = React.useState(false);
  const [deletingQ, setDeletingQ] = React.useState<number | null>(null);
  const [qForm, setQForm] = React.useState<{ text: string; type: QType; optionsRaw: string; placeholder: string }>({
    text: "", type: "radio", optionsRaw: "", placeholder: "",
  });

  const [toast, setToast] = React.useState<string | null>(null);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const parseOptions = (raw: string): string[] => raw.split("\n").map(s => s.trim()).filter(Boolean);
  const cacheQuestions = (items: QItem[]) => {
    try {
      localStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify(items));
    } catch {
      // storage unavailable
    }
  };

  // Default questions (shown when backend is empty)
  const DEFAULT_QUESTIONS: QItem[] = [
    { text: "Please enter your mobile number", type: "mobile", placeholder: "e.g. 9876543210" },
    { text: "What is your primary goal for this consultation?", type: "radio", options: ["Tax planning & savings", "Investment strategy", "Retirement planning", "Insurance review", "Wealth management", "Business finance", "General financial advice"] },
    { text: "What is your approximate annual income?", type: "radio", options: ["Below Rs. 5 Lakhs", "Rs. 5L - Rs. 10L", "Rs. 10L - Rs. 25L", "Rs. 25L - Rs. 50L", "Above Rs. 50L"] },
    { text: "What best describes your employment?", type: "radio", options: ["Salaried (private sector)", "Salaried (government / PSU)", "Self-employed / Freelancer", "Business owner", "Professional (CA, Doctor, Lawyer)", "Not currently employed"] },
    { text: "Do you currently have existing investments?", type: "radio", options: ["Yes - stocks / mutual funds", "Yes - fixed deposits / bonds", "Yes - real estate", "Yes - mix of the above", "No investments yet"] },
    { text: "What are your biggest financial challenges right now?", type: "multiselect", options: ["High tax burden", "Not saving enough", "Managing debt / EMIs", "No clear investment plan", "Planning for child's education", "Retirement corpus gap", "Business cash flow"] },
    { text: "How do you prefer to receive advice?", type: "radio", options: ["Step-by-step guidance", "High-level summary only", "Detailed reports & analysis", "Action items with deadlines"] },
    { text: "Anything specific you want the consultant to know before the session? (optional)", type: "text", placeholder: "e.g. I have a loan coming up, planning to buy a house next year..." },
  ];

  // ── Load ──
  const load = async () => {
    setLoading(true);
    try {
      const skillArr: SkillItem[] = await getAllSkills();
      setSkills(skillArr);
      try {
        const data = await apiFetch("/questions");
        const arr: any[] = Array.isArray(data) ? data : extractArray(data);
        if (arr.length > 0) {
          const mapped = arr.map(q => ({
            ...q,
            type: (q.type || "radio") as QType,
            options: q.options ? (Array.isArray(q.options) ? q.options : String(q.options).split("|||").map((s: string) => s.trim()).filter(Boolean)) : [],
          }));
          setQuestions(mapped);
          cacheQuestions(mapped);
        } else {
          setQuestions(DEFAULT_QUESTIONS);
          cacheQuestions(DEFAULT_QUESTIONS);
        }
      } catch { setQuestions(DEFAULT_QUESTIONS); cacheQuestions(DEFAULT_QUESTIONS); }
    } catch (e: any) { console.warn("Load failed:", e?.message); setSkills([]); setQuestions(DEFAULT_QUESTIONS); cacheQuestions(DEFAULT_QUESTIONS); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { load(); }, []);

  // ── Skill CRUD ──
  const openNewSkill = () => { setSkillForm({ name: "", description: "" }); setEditingSkill(null); setShowSkillForm(true); };
  const openEditSkill = (s: SkillItem) => { setSkillForm({ name: s.name, description: s.description || "" }); setEditingSkill(s); setShowSkillForm(true); };

  const handleSaveSkill = async () => {
    if (!skillForm.name.trim()) { showToast("Skill name is required."); return; }
    setSavingSkill(true);
    try {
      const payload = { name: skillForm.name.trim(), description: skillForm.description.trim() || undefined };
      if (editingSkill?.id) { await updateSkill(editingSkill.id, payload); showToast("Skill updated."); }
      else { await createSkill(payload); showToast("Skill created."); }
      await load(); setShowSkillForm(false);
    } catch (e: any) {
      const msg = String(e?.message || "");
      showToast(msg.includes("500") || msg.includes("Internal Server") ? "Server error — check /api/skills endpoint." : e?.message || "Failed to save skill.");
    } finally { setSavingSkill(false); }
  };

  const handleDeleteSkill = async (id: number) => {
    if (!window.confirm("Delete this skill? Consultant tags linked to it may be affected.")) return;
    setDeletingSkill(id);
    try { await deleteSkill(id); await load(); showToast("Skill deleted."); }
    catch (e: any) { showToast(e?.message || "Delete failed."); } finally { setDeletingSkill(null); }
  };

  // ── Question CRUD ──
  const openNewQ = () => { setQForm({ text: "", type: "radio", optionsRaw: "", placeholder: "" }); setEditingQ(null); setShowQForm(true); };
  const openEditQ = (q: QItem) => {
    setQForm({ text: q.text, type: q.type, optionsRaw: (q.options || []).join("\n"), placeholder: q.placeholder || "" });
    setEditingQ(q); setShowQForm(true);
  };

  const handleSaveQ = async () => {
    if (!qForm.text.trim()) { showToast("Question text is required."); return; }
    if (qForm.type === "radio" || qForm.type === "multiselect") {
      if (parseOptions(qForm.optionsRaw).length < 2) { showToast("Please add at least 2 options (one per line)."); return; }
    }
    setSavingQ(true);
    try {
      const needsOptions = qForm.type === "radio" || qForm.type === "multiselect";
      const options = needsOptions ? parseOptions(qForm.optionsRaw) : [];
      const payload: any = {
        text: qForm.text.trim(),
        type: qForm.type,
        options: options.join("|||"),
        placeholder: (qForm.type === "text" || qForm.type === "mobile") ? qForm.placeholder.trim() : undefined,
      };
      if (editingQ?.id) { await apiFetch(`/questions/${editingQ.id}`, { method: "PUT", body: JSON.stringify(payload) }); showToast("Question updated."); }
      else { await apiFetch("/questions", { method: "POST", body: JSON.stringify(payload) }); showToast("Question created."); }
      await load(); setShowQForm(false);
    } catch (e: any) { showToast(e?.message || "Failed to save question."); }
    finally { setSavingQ(false); }
  };

  const handleDeleteQ = async (id: number) => {
    if (!window.confirm("Delete this question? Client answers linked to it will also be removed.")) return;
    setDeletingQ(id);
    try { await apiFetch(`/questions/${id}`, { method: "DELETE" }); showToast("Question deleted."); await load(); }
    catch (e: any) { showToast(e?.message || "Failed to delete question."); }
    finally { setDeletingQ(null); }
  };

  const handleSeedDefaults = async () => {
    if (!window.confirm("Seed default questions to the backend? This will create 8 core questions.")) return;
    setSavingQ(true);
    let successCount = 0;
    try {
      for (const q of DEFAULT_QUESTIONS) {
        const payload: any = {
          text: q.text,
          type: q.type,
          options: (q.options || []).join("|||"),
          placeholder: q.placeholder || undefined,
        };
        await apiFetch("/questions", { method: "POST", body: JSON.stringify(payload) });
        successCount++;
      }
      showToast(`Successfully seeded ${successCount} questions!`);
      await load();
    } catch (e: any) {
      showToast(e?.message || "Failed to seed some questions.");
    } finally {
      setSavingQ(false);
    }
  };

  const TYPE_CFG: Record<QType, { label: string; icon: string; color: string; bg: string; border: string }> = {
    radio: { label: "Single choice", icon: "●", color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
    multiselect: { label: "Multi-select", icon: "☑", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
    text: { label: "Free text", icon: "✏", color: "#0F766E", bg: "#F0FDFA", border: "#99F6E4" },
    mobile: { label: "Mobile number", icon: "📱", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D" },
  };

  const inp: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid #E2E8F0", borderRadius: 9, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 };

  return (
    <div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#0F172A", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast}</div>}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Skills & Questions</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>
            Manage skill categories and post-booking client questions
          </p>
        </div>
        <button onClick={panelTab === "skills" ? openNewSkill : openNewQ}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 18px", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          {panelTab === "skills" ? "New Skill" : "Add Question"}
        </button>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#F1F5F9", borderRadius: 12, padding: 4 }}>
        {(["skills", "questions"] as const).map(t => (
          <button key={t} onClick={() => setPanelTab(t)}
            style={{ flex: 1, padding: "9px", borderRadius: 9, border: "none", background: panelTab === t ? "#fff" : "transparent", color: panelTab === t ? "#0F172A" : "#64748B", fontSize: 13, fontWeight: panelTab === t ? 700 : 500, cursor: "pointer", fontFamily: "inherit", boxShadow: panelTab === t ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s", textTransform: "capitalize" }}>
            {t === "skills" ? `Skills (${skills.length})` : `Questions (${questions.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}><img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} /></div>
      ) : panelTab === "skills" ? (

        // ══════════════════════════════════════════
        // SKILLS TAB
        // ══════════════════════════════════════════
        <div>
          {/* Info banner */}
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#1E40AF" }}>
            <strong>Skills</strong> are categories shown to users during onboarding (e.g. "Tax Planning", "Investment").
            Consultants are matched to clients based on their skill tags.
          </div>

          {showSkillForm && (
            <div style={{ background: "#F8FAFC", border: "1.5px solid #BFDBFE", borderRadius: 16, padding: 24, marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>{editingSkill ? "Edit Skill" : "Create New Skill"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                <div><label style={lbl}>Skill Name *</label><input value={skillForm.name} onChange={e => setSkillForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Tax Planning, Investment, Insurance" style={inp} /></div>
                <div><label style={lbl}>Description</label><input value={skillForm.description} onChange={e => setSkillForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description (optional)" style={inp} /></div>
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setShowSkillForm(false)} style={{ padding: "9px 20px", borderRadius: 9, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={handleSaveSkill} disabled={savingSkill} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: savingSkill ? "#93C5FD" : "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{savingSkill ? "Saving…" : editingSkill ? "Update" : "Create Skill"}</button>
              </div>
            </div>
          )}

          {skills.length === 0 && !showSkillForm ? (
            <div style={{ textAlign: "center", padding: "60px 20px", background: "#F8FAFC", borderRadius: 16, color: "#94A3B8" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
              <div style={{ fontWeight: 600, color: "#64748B", marginBottom: 8 }}>No skills yet</div>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: "0 0 16px" }}>Create your first skill category for consultant matching</p>
              <button onClick={openNewSkill} style={{ padding: "10px 22px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Create First Skill</button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {skills.map(skill => (
                <div key={skill.id} style={{ background: "#fff", border: "1px solid #F1F5F9", borderLeft: "4px solid #7C3AED", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16 }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFF")}
                  onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{skill.name}</div>
                    {skill.description && <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{skill.description}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => openEditSkill(skill)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#2563EB", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                    <button onClick={() => handleDeleteSkill(skill.id)} disabled={deletingSkill === skill.id}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: deletingSkill === skill.id ? 0.6 : 1 }}>
                      {deletingSkill === skill.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      ) : (

        // ══════════════════════════════════════════
        // QUESTIONS TAB — no skill linkage
        // ══════════════════════════════════════════
        <div>
          {/* Info banner */}
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#1E40AF" }}>
            <strong>Post-booking questions</strong> are shown to clients right after booking. Answers are visible to the consultant before the session.
          </div>

          {/* Question form */}
          {showQForm && (
            <div style={{ background: "#F8FAFC", border: "1.5px solid #BFDBFE", borderRadius: 16, padding: 24, marginBottom: 24 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A", marginBottom: 18 }}>
                {editingQ ? "Edit Question" : "Add New Question"}
              </div>

              {/* Question text */}
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Question Text *</label>
                <input value={qForm.text} onChange={e => setQForm(f => ({ ...f, text: e.target.value }))}
                  placeholder="e.g. What is your primary goal for this consultation?"
                  style={inp} />
              </div>

              {/* Answer type — 4 types including mobile */}
              <div style={{ marginBottom: 14 }}>
                <label style={lbl}>Answer Type *</label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(["radio", "multiselect", "text", "mobile"] as QType[]).map(t => {
                    const cfg = TYPE_CFG[t];
                    const sel = qForm.type === t;
                    return (
                      <button key={t} onClick={() => setQForm(f => ({ ...f, type: t }))}
                        style={{ flex: "1 1 calc(25% - 6px)", minWidth: 110, padding: "9px 10px", borderRadius: 9, border: `1.5px solid ${sel ? cfg.color : "#E2E8F0"}`, background: sel ? cfg.bg : "#fff", color: sel ? cfg.color : "#64748B", fontSize: 12, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <span>{cfg.icon}</span>
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
                {/* Mobile type hint */}
                {qForm.type === "mobile" && (
                  <div style={{ marginTop: 8, padding: "8px 12px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 8, fontSize: 12, color: "#92400E", display: "flex", alignItems: "center", gap: 6 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                    Clients must enter a valid 10-digit Indian mobile number (starts with 6–9). Validated before submission.
                  </div>
                )}
              </div>

              {/* Options — radio / multiselect only */}
              {(qForm.type === "radio" || qForm.type === "multiselect") && (
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Options * <span style={{ fontWeight: 400, textTransform: "none", color: "#94A3B8" }}>(one per line, min. 2)</span></label>
                  <textarea value={qForm.optionsRaw} onChange={e => setQForm(f => ({ ...f, optionsRaw: e.target.value }))}
                    placeholder={"Option 1\nOption 2\nOption 3"}
                    rows={5} style={{ ...inp, resize: "vertical", lineHeight: 1.7 }} />
                  {qForm.optionsRaw.trim() && (
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {parseOptions(qForm.optionsRaw).map((o, i) => (
                        <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: TYPE_CFG[qForm.type].bg, color: TYPE_CFG[qForm.type].color, border: `1px solid ${TYPE_CFG[qForm.type].border}`, fontWeight: 600 }}>{o}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Placeholder — text / mobile */}
              {(qForm.type === "text" || qForm.type === "mobile") && (
                <div style={{ marginBottom: 14 }}>
                  <label style={lbl}>Placeholder Text <span style={{ fontWeight: 400, textTransform: "none", color: "#94A3B8" }}>(optional)</span></label>
                  <input value={qForm.placeholder} onChange={e => setQForm(f => ({ ...f, placeholder: e.target.value }))}
                    placeholder={qForm.type === "mobile" ? "e.g. 9876543210" : "e.g. Share any details the consultant should know..."}
                    style={inp} />
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button onClick={() => setShowQForm(false)}
                  style={{ padding: "9px 20px", borderRadius: 9, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                  Cancel
                </button>
                <button onClick={handleSaveQ} disabled={savingQ}
                  style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: savingQ ? "#93C5FD" : "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: savingQ ? "default" : "pointer", fontFamily: "inherit" }}>
                  {savingQ ? "Saving…" : editingQ ? "Update Question" : "Add Question"}
                </button>
              </div>
            </div>
          )}

          {/* Questions list */}
          {questions.length === 0 && !showQForm ? (
            <div style={{ textAlign: "center", padding: "60px 20px", background: "#F8FAFC", borderRadius: 16, color: "#94A3B8" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <div style={{ fontWeight: 600, color: "#64748B", marginBottom: 8 }}>No questions yet</div>
              <p style={{ fontSize: 13, color: "#94A3B8", margin: "0 0 16px" }}>Add post-booking questions for clients to answer.</p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                <button onClick={openNewQ} style={{ padding: "10px 22px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Add First Question</button>
                <button onClick={handleSeedDefaults} disabled={savingQ} style={{ padding: "10px 22px", background: "#fff", color: "#0F766E", border: "1.5px solid #99F6E4", borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: savingQ ? "default" : "pointer", fontFamily: "inherit", opacity: savingQ ? 0.7 : 1 }}>{savingQ ? "Seeding..." : "Auto-Seed Defaults"}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {questions.map((q, idx) => {
                const cfg = TYPE_CFG[q.type] || TYPE_CFG.radio;
                return (
                  <div key={q.id ?? idx}
                    style={{ background: "#fff", border: "1px solid #F1F5F9", borderLeft: `4px solid ${cfg.color}`, borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", transition: "box-shadow 0.15s" }}
                    onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)")}
                    onMouseLeave={e => (e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.04)")}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 700 }}>Q{idx + 1}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {cfg.icon} {cfg.label}
                          </span>
                          {q.type === "mobile" && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#FEF3C7", color: "#92400E", border: "1px solid #FDE68A" }}>
                              ✓ 10-digit validation
                            </span>
                          )}
                          {q.updatedAt && <span style={{ fontSize: 11, color: "#CBD5E1" }}>Updated {new Date(q.updatedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</span>}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", lineHeight: 1.5 }}>{q.text}</div>

                        {/* Options preview */}
                        {q.options && q.options.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                            {q.options.slice(0, 6).map((opt, i) => (
                              <span key={i} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "#F8FAFC", color: "#475569", border: "1px solid #E2E8F0", fontWeight: 500 }}>
                                <span style={{ marginRight: 4, fontSize: 9 }}>{q.type === "radio" ? "●" : "☑"}</span>{opt}
                              </span>
                            ))}
                            {q.options.length > 6 && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "#F1F5F9", color: "#94A3B8", fontWeight: 600 }}>+{q.options.length - 6} more</span>}
                          </div>
                        )}

                        {/* Mobile type preview */}
                        {q.type === "mobile" && (
                          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ padding: "6px 14px", border: "1.5px solid #E2E8F0", borderRadius: 8, fontSize: 13, color: "#94A3B8", background: "#F8FAFC", fontFamily: "monospace" }}>
                              {q.placeholder || "9876543210"}
                            </div>
                            <span style={{ fontSize: 11, color: "#94A3B8" }}>Validates: starts with 6-9, exactly 10 digits</span>
                          </div>
                        )}

                        {/* Text placeholder preview */}
                        {q.type === "text" && q.placeholder && (
                          <div style={{ marginTop: 8, fontSize: 12, color: "#94A3B8", fontStyle: "italic" }}>Placeholder: "{q.placeholder}"</div>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button onClick={() => openEditQ(q)}
                          style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#2563EB", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                        {q.id && (
                          <button onClick={() => handleDeleteQ(q.id!)} disabled={deletingQ === q.id}
                            style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: deletingQ === q.id ? 0.6 : 1 }}>
                            {deletingQ === q.id ? "…" : "Delete"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// OFFER APPROVAL PANEL — uses approveOffer/rejectOffer from api.ts
// Backend: GET /api/offers/consultant-offers, PUT /api/offers/:id/approve|reject
// ─────────────────────────────────────────────────────────────────────────────
const OfferApprovalPanel: React.FC = () => {
  const [offers, setOffers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("PENDING");

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      // GET /api/offers/admin — all offers; filter by consultantId for consultant-submitted ones
      const data = await getConsultantSubmittedOffers();
      setOffers(data);
    }
    catch { setOffers([]); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { load(); }, []);

  const handleAction = async (id: number, action: "approve" | "reject") => {
    setProcessing(id);
    try {
      if (action === "approve") {
        await approveOffer(id);
        showToast("Offer approved and is now live.");
        setOffers(prev => prev.map(o => o.id === id ? { ...o, status: "APPROVED", approvalStatus: "APPROVED", isActive: true } : o));
      } else {
        await rejectOffer(id);
        showToast("Offer rejected.");
        setOffers(prev => prev.map(o => o.id === id ? { ...o, status: "REJECTED", approvalStatus: "REJECTED", isActive: false } : o));
      }
    } catch (e: any) { showToast(e?.message || "Action failed."); }
    finally { setProcessing(null); }
  };

  // Backend OfferResponse.status field: PENDING | APPROVED | REJECTED
  const getOfferStatus = (o: any) => (o.status || o.approvalStatus || "PENDING").toUpperCase();
  const filtered = filter === "ALL" ? offers : offers.filter(o => getOfferStatus(o) === filter);
  const pendingCount = offers.filter(o => getOfferStatus(o) === "PENDING").length;
  const statusCfg: Record<string, { color: string; bg: string; border: string; label: string }> = {
    PENDING: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", label: "Pending" },
    APPROVED: { color: "#16A34A", bg: "#DCFCE7", border: "#86EFAC", label: "Approved" },
    REJECTED: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", label: "Rejected" },
  };

  return (
    <div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#0F172A", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999 }}>{toast}</div>}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Offer Approvals</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>Review and approve or reject offers submitted by consultants</p>
        </div>
        {pendingCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, fontSize: 13, fontWeight: 700, color: "#D97706" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            {pendingCount} pending review
          </div>
        )}
      </div>
      <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#1E40AF" }}>
        <strong>Single-offer rule:</strong> If an admin-created offer is active, consultant offers will not apply to the same booking.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ padding: "7px 16px", borderRadius: 20, border: `1.5px solid ${filter === f ? "#2563EB" : "#E2E8F0"}`, background: filter === f ? "#EFF6FF" : "#fff", color: filter === f ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {f} ({f === "ALL" ? offers.length : offers.filter(o => getOfferStatus(o) === f).length})
          </button>
        ))}
      </div>
      {loading ? (
        <div style={{ textAlign: "center", padding: 60 }}>
          <img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", background: "#F8FAFC", borderRadius: 16, color: "#94A3B8" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 14 }}><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><line x1="12" y1="22" x2="12" y2="7" /></svg>
          <div style={{ fontWeight: 600, color: "#64748B" }}>No {filter !== "ALL" ? filter.toLowerCase() : ""} offers found</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map(offer => {
            const status = (offer.status || offer.approvalStatus || "PENDING").toUpperCase();
            const cfg = statusCfg[status] || statusCfg.PENDING;
            return (
              <div key={offer.id} style={{ background: "#fff", border: `1px solid ${status === "PENDING" ? "#FCD34D" : "#F1F5F9"}`, borderLeft: `4px solid ${cfg.color}`, borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>{offer.title}</div>
                      {offer.discount && <span style={{ fontSize: 11, fontWeight: 800, background: "#DC2626", color: "#fff", padding: "2px 8px", borderRadius: 20 }}>{offer.discount}</span>}
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>{cfg.label}</span>
                    </div>
                    {offer.description && <div style={{ fontSize: 13, color: "#64748B", marginBottom: 8 }}>{offer.description}</div>}
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#94A3B8", flexWrap: "wrap" }}>
                      <span>Consultant: <strong style={{ color: "#374151" }}>{offer.consultantName || `#${offer.consultantId}`}</strong></span>
                      {offer.validFrom && <span>From: {offer.validFrom}</span>}
                      {offer.validTo && <span>Until: {offer.validTo}</span>}
                    </div>
                  </div>
                  {status === "PENDING" && (
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => handleAction(offer.id, "approve")} disabled={processing === offer.id}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 9, border: "none", background: "#16A34A", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: processing === offer.id ? 0.6 : 1 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                        Approve
                      </button>
                      <button onClick={() => handleAction(offer.id, "reject")} disabled={processing === offer.id}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 9, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: processing === offer.id ? 0.6 : 1 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

interface AdminMasterSlot {
  id: number;
  timeRange: string;
}

const formatHourRangeLabel = (startHour24: number) => {
  const formatHour = (hour24: number) => {
    const normalizedHour = ((hour24 % 24) + 24) % 24;
    const period = normalizedHour >= 12 ? "PM" : "AM";
    const hour12 = normalizedHour % 12 || 12;
    return `${hour12}:00 ${period}`;
  };

  return `${formatHour(startHour24)} - ${formatHour(startHour24 + 1)}`;
};

const parseStartHourFromRange = (timeRange: string) => {
  const match = String(timeRange || "").trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  const [, startHourText, startMinuteText, startPeriod] = match;
  if (startMinuteText !== "00") return null;

  let startHour = Number(startHourText) % 12;
  if (startPeriod.toUpperCase() === "PM") startHour += 12;
  return startHour;
};

const HourRangeClockPicker: React.FC<{
  isOpen: boolean;
  title: string;
  initialHour: number | null;
  onClose: () => void;
  onSave: (startHour24: number) => void;
}> = ({ isOpen, title, initialHour, onClose, onSave }) => {
  const [selectedHour, setSelectedHour] = React.useState(12);
  const [period, setPeriod] = React.useState<"AM" | "PM">("PM");

  React.useEffect(() => {
    if (!isOpen) return;
    const baseHour = initialHour ?? 12;
    setSelectedHour(baseHour % 12 || 12);
    setPeriod(baseHour >= 12 ? "PM" : "AM");
  }, [initialHour, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    let startHour24 = selectedHour % 12;
    if (period === "PM") startHour24 += 12;
    onSave(startHour24);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(circle at top, rgba(59,130,246,0.16), rgba(15,23,42,0.68))",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 3000,
        backdropFilter: "blur(10px)",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 344, maxWidth: "100%", background: "linear-gradient(180deg, #FFFFFF 0%, #F8FBFF 100%)", borderRadius: 24, overflow: "hidden", boxShadow: "0 30px 80px rgba(15,23,42,0.34)", border: "1px solid rgba(255,255,255,0.6)" }}
      >
        <div style={{ position: "relative", background: "linear-gradient(145deg,#0F3CC9 0%,#2563EB 58%,#60A5FA 100%)", padding: "18px 20px 16px", color: "#fff" }}>
          <div style={{ position: "absolute", top: -70, right: -40, width: 150, height: 150, borderRadius: "50%", background: "rgba(255,255,255,0.10)" }} />
          <div style={{ position: "absolute", bottom: -60, left: -30, width: 110, height: 110, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 999, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.18)", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FDE68A", boxShadow: "0 0 16px rgba(253,230,138,0.9)" }} />
              {title}
            </div>

            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "start" }}>
              <div>
                <div style={{ fontSize: 34, lineHeight: 1.05, fontWeight: 900, letterSpacing: "-0.04em" }}>
                  {formatHourRangeLabel((selectedHour % 12) + (period === "PM" ? 12 : 0))}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.45, color: "rgba(255,255,255,0.88)", maxWidth: 210 }}>
                  Pick the starting hour. End time is added automatically.
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 2 }}>
                <button type="button" onClick={() => setPeriod("AM")} style={{ minWidth: 48, padding: "8px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.28)", background: period === "AM" ? "#fff" : "rgba(255,255,255,0.08)", color: period === "AM" ? "#1D4ED8" : "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", boxShadow: period === "AM" ? "0 10px 22px rgba(15,23,42,0.18)" : "none" }}>AM</button>
                <button type="button" onClick={() => setPeriod("PM")} style={{ minWidth: 48, padding: "8px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.28)", background: period === "PM" ? "#fff" : "rgba(255,255,255,0.08)", color: period === "PM" ? "#1D4ED8" : "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", boxShadow: period === "PM" ? "0 10px 22px rgba(15,23,42,0.18)" : "none" }}>PM</button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "18px 18px 4px", display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: 220, height: 220, borderRadius: "50%", background: "radial-gradient(circle at center, #FFFFFF 0%, #F6FAFF 68%, #EDF4FF 100%)", border: "1px solid #D7E6FF", boxShadow: "inset 0 12px 30px rgba(255,255,255,0.95), 0 18px 40px rgba(37,99,235,0.10)" }}>
            <div style={{ position: "absolute", inset: 15, borderRadius: "50%", border: "1px dashed rgba(148,163,184,0.25)" }} />
            <div style={{ position: "absolute", top: "50%", left: "50%", width: 12, height: 12, borderRadius: "50%", background: "#2563EB", border: "3px solid #DBEAFE", transform: "translate(-50%, -50%)", zIndex: 3, boxShadow: "0 0 0 6px rgba(37,99,235,0.08)" }} />
            {([12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] as const).map((hour, index) => {
              const angle = index * 30 * (Math.PI / 180);
              const radius = 83;
              const x = 110 + radius * Math.sin(angle);
              const y = 110 - radius * Math.cos(angle);
              const isActive = selectedHour === hour;
              return (
                <React.Fragment key={hour}>
                  {isActive && (
                    <>
                      <div style={{ position: "absolute", top: "50%", left: "50%", width: 3, height: radius, background: "linear-gradient(180deg, #60A5FA 0%, #2563EB 100%)", borderRadius: 999, transformOrigin: "bottom center", transform: `translate(-50%,-100%) rotate(${index * 30}deg)`, zIndex: 1, boxShadow: "0 0 14px rgba(37,99,235,0.18)" }} />
                      <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -50%)", width: 44, height: 44, borderRadius: "50%", background: "rgba(37,99,235,0.12)", zIndex: 1 }} />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedHour(hour)}
                    style={{
                      position: "absolute",
                      left: x,
                      top: y,
                      transform: "translate(-50%, -50%)",
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      border: isActive ? "none" : "1px solid transparent",
                      background: isActive ? "linear-gradient(145deg,#2563EB,#1D4ED8)" : "transparent",
                      color: isActive ? "#fff" : "#334155",
                      fontSize: 16,
                      fontWeight: isActive ? 800 : 700,
                      cursor: "pointer",
                      zIndex: 3,
                      boxShadow: isActive ? "0 12px 28px rgba(37,99,235,0.30)" : "none",
                    }}
                  >
                    {hour}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div style={{ padding: "10px 18px 18px" }}>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid #CBD5E1", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Cancel</button>
            <button type="button" onClick={handleSave} style={{ padding: "10px 16px", borderRadius: 12, border: "none", background: "linear-gradient(145deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 12px 24px rgba(37,99,235,0.26)" }}>Use This Slot</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminMasterTimeSlotsPanel: React.FC = () => {
  const [slots, setSlots] = React.useState<AdminMasterSlot[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedStartHour, setSelectedStartHour] = React.useState<number | null>(null);
  const [editingId, setEditingId] = React.useState<number | null>(null);
  const [editingStartHour, setEditingStartHour] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [pickerMode, setPickerMode] = React.useState<"create" | "edit" | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/master-timeslots?page=0&size=200&sortBy=id");
      const rows = extractArray(data).map((slot: any) => ({
        id: Number(slot.id),
        timeRange: String(slot.timeRange || "").trim(),
      })).filter((slot: AdminMasterSlot) => slot.id && slot.timeRange);
      setSlots(rows);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (selectedStartHour === null) return showToast("Select a start time from the clock.");
    const nextRange = formatHourRangeLabel(selectedStartHour);
    if (slots.some((slot) => slot.timeRange.toLowerCase() === nextRange.toLowerCase())) {
      return showToast("This 1-hour slot already exists.");
    }
    setSaving(true);
    try {
      await apiFetch("/master-timeslots", {
        method: "POST",
        body: JSON.stringify({ timeRange: nextRange }),
      });
      setSelectedStartHour(null);
      await load();
      showToast("Time range created.");
    } catch (e: any) {
      showToast(e?.message || "Failed to create time range.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (id: number) => {
    if (editingStartHour === null) return showToast("Select a start time from the clock.");
    const nextRange = formatHourRangeLabel(editingStartHour);
    if (slots.some((slot) => slot.id !== id && slot.timeRange.toLowerCase() === nextRange.toLowerCase())) {
      return showToast("This 1-hour slot already exists.");
    }
    setSaving(true);
    try {
      await apiFetch(`/master-timeslots/${id}`, {
        method: "PUT",
        body: JSON.stringify({ timeRange: nextRange }),
      });
      setEditingId(null);
      setEditingStartHour(null);
      await load();
      showToast("Time range updated.");
    } catch (e: any) {
      showToast(e?.message || "Failed to update time range.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this time range?")) return;
    setDeletingId(id);
    try {
      await apiFetch(`/master-timeslots/${id}`, { method: "DELETE" });
      await load();
      showToast("Time range deleted.");
    } catch (e: any) {
      showToast(e?.message || "Failed to delete time range.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {toast && (
        <div style={{ position: "fixed", top: 22, right: 22, zIndex: 2000, background: "#0F172A", color: "#fff", padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, boxShadow: "0 14px 28px rgba(15,23,42,0.18)" }}>
          {toast}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Master Time Slots</h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>Only admin can create, edit, or delete the master list of bookable time ranges. Slots are restricted to fixed 1-hour blocks.</p>
        </div>
        <div style={{ minWidth: 320, flex: "1 1 420px", maxWidth: 520, display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={() => setPickerMode("create")}
            style={{ flex: 1, padding: "11px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, color: selectedStartHour === null ? "#94A3B8" : "#0F172A", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}
          >
            <span>{selectedStartHour === null ? "Pick a 1-hour slot" : formatHourRangeLabel(selectedStartHour)}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            style={{ padding: "11px 18px", borderRadius: 10, border: "none", background: saving ? "#93C5FD" : "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: saving ? "default" : "pointer", whiteSpace: "nowrap" }}
          >
            {saving ? "Saving..." : "Add Time Range"}
          </button>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 18, border: "1px solid #E2E8F0", boxShadow: "0 10px 30px rgba(15,23,42,0.06)", overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "96px 1fr 170px", gap: 12, padding: "14px 18px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <span>ID</span>
          <span>Time Range</span>
          <span>Actions</span>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: "#64748B", fontWeight: 600 }}>Loading time ranges...</div>
        ) : slots.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: "#94A3B8", fontWeight: 600 }}>No master time slots found.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {slots.map((slot) => {
              const isEditing = editingId === slot.id;
              return (
                <div key={slot.id} style={{ display: "grid", gridTemplateColumns: "96px 1fr 170px", gap: 12, padding: "14px 18px", borderBottom: "1px solid #F1F5F9", alignItems: "center" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#2563EB" }}>#{slot.id}</span>
                  {isEditing ? (
                    <button
                      type="button"
                      onClick={() => setPickerMode("edit")}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1.5px solid #BFDBFE", fontSize: 13, color: "#0F172A", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, cursor: "pointer" }}
                    >
                      <span>{editingStartHour === null ? "Pick a 1-hour slot" : formatHourRangeLabel(editingStartHour)}</span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 6v6l4 2" strokeLinecap="round" />
                      </svg>
                    </button>
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{slot.timeRange}</span>
                  )}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-start" }}>
                    {isEditing ? (
                      <>
                        <button onClick={() => handleUpdate(slot.id)} disabled={saving} style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#16A34A", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Save</button>
                        <button onClick={() => { setEditingId(null); setEditingStartHour(null); setPickerMode(null); }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#fff", color: "#64748B", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(slot.id); setEditingStartHour(parseStartHourFromRange(slot.timeRange)); setPickerMode(null); }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => handleDelete(slot.id)} disabled={deletingId === slot.id} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: deletingId === slot.id ? 0.6 : 1 }}>
                          {deletingId === slot.id ? "..." : "Delete"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <HourRangeClockPicker
        isOpen={pickerMode === "create"}
        title="Select Start Time"
        initialHour={selectedStartHour}
        onClose={() => setPickerMode(null)}
        onSave={(hour) => {
          setSelectedStartHour(hour);
          setPickerMode(null);
        }}
      />

      <HourRangeClockPicker
        isOpen={pickerMode === "edit"}
        title="Edit Start Time"
        initialHour={editingStartHour}
        onClose={() => setPickerMode(null)}
        onSave={(hour) => {
          setEditingStartHour(hour);
          setPickerMode(null);
        }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN OFFERS PANEL — Full CRUD with working Active/Inactive toggle
// Replace everything from:
//   const AdminOffersPanel: React.FC = () => {
// up to (but NOT including):
//   // ─── INNER ADMIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

interface AdminOffer {
  id?: number;
  title: string;
  description: string;
  discount: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  active?: boolean;
  consultantId?: number | null;
  status?: string;
  discountValue?: string | number;
  discountType?: string;
}

const AdminOffersPanel: React.FC = () => {
  const [offers, setOffers] = React.useState<AdminOffer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showForm, setShowForm] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminOffer | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<number | null>(null);
  const [toggling, setToggling] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<AdminOffer>({
    title: '',
    description: '',
    discount: '',
    validFrom: '',
    validTo: '',
    isActive: true,
    consultantId: null,
    discountValue: '',
    discountType: '%',
  });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  // Convert backend LocalDateTime string to datetime-local input value
  const toDatetimeLocal = (dt: string) => (dt ? dt.substring(0, 16) : '');

  // Convert datetime-local input value to backend LocalDateTime format
  const toLocalDateTime = (dt: string) =>
    dt ? (dt.length === 16 ? dt + ':00' : dt.substring(0, 19)) : '';

  const parseDiscountForForm = (discount: string) => {
    const raw = String(discount || '').trim();
    if (!raw) return { discountLabel: '', discountValue: '', discountType: '%' };
    if (raw.includes('%')) {
      return {
        discountLabel: raw,
        discountValue: raw.replace('%', '').trim(),
        discountType: '%',
      };
    }
    return {
      discountLabel: raw,
      discountValue: raw,
      discountType: '₹',
    };
  };

  const buildDiscountString = (offer: Pick<AdminOffer, 'discount' | 'discountValue' | 'discountType'>) => {
    const explicitValue = String(offer.discountValue ?? '').trim();
    if (explicitValue) {
      return (offer.discountType || '%') === '%'
        ? `${explicitValue}%`
        : explicitValue;
    }
    return String(offer.discount || '').trim();
  };

  // Normalize backend offer — handles both isActive and active field names
  const normalizeOffer = (o: any): AdminOffer => ({
    ...o,
    isActive: o.isActive !== undefined ? o.isActive : o.active !== undefined ? o.active : false,
    status: (o.status || o.approvalStatus || 'PENDING').toUpperCase(),
    ...parseDiscountForForm(o.discount || ''),
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/offers/admin');
      const arr = Array.isArray(data) ? data : data?.content || data?.offers || [];
      const normalized = arr.map(normalizeOffer);
      setOffers(normalized);
    } catch {
      setOffers([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const [consultants, setConsultants] = React.useState<{ id: number; name: string }[]>([]);

  React.useEffect(() => {
    getAllAdvisors()
      .then((data: any) => {
        const arr = Array.isArray(data) ? data : data?.content || [];
        setConsultants(arr.map((a: any) => ({ id: a.id, name: a.name || a.fullName || `Consultant #${a.id}` })));
      })
      .catch(() => { });
  }, []);

  const openNew = () => {
    setForm({
      title: '',
      description: '',
      discount: '',
      validFrom: '',
      validTo: '',
      isActive: true,
      consultantId: null,
      discountValue: '',
      discountType: '%',
    });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (o: AdminOffer) => {
    setForm({
      ...o,
      isActive: o.isActive !== undefined ? o.isActive : (o as any).active !== undefined ? (o as any).active : false,
      validFrom: toDatetimeLocal(o.validFrom || ''),
      validTo: toDatetimeLocal(o.validTo || ''),
      ...parseDiscountForForm(o.discount || ''),
    });
    setEditing(o);
    setShowForm(true);
  };

  // Toggle active/inactive for a single offer
  const handleToggleActive = async (offer: AdminOffer) => {
    if (!offer.id) return;
    const currentActive = offer.isActive !== undefined ? offer.isActive : (offer as any).active !== undefined ? (offer as any).active : false;
    const newActive = !currentActive;
    setToggling(offer.id);
    try {
      await apiFetch(`/offers/${offer.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: offer.title,
          description: offer.description || '',
          discount: buildDiscountString(offer),
          validFrom: toLocalDateTime(offer.validFrom || ''),
          validTo: toLocalDateTime(offer.validTo || ''),
          active: newActive,
          ...(offer.consultantId != null ? { consultantId: offer.consultantId } : {}),
        }),
      });
      setOffers(prev =>
        prev.map(o =>
          o.id === offer.id ? { ...o, isActive: newActive, active: newActive } : o
        )
      );
      showToast(newActive ? 'Offer activated and visible to customers!' : 'Offer deactivated.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to toggle offer status.');
    } finally {
      setToggling(null);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) { showToast('Title is required.'); return; }
    const discountStr = buildDiscountString(form);
    if (!discountStr) { showToast('Discount is required. Use values like 20% or 500.'); return; }
    if (!form.validFrom || !form.validTo) { showToast('Valid From and Valid To dates are required.'); return; }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        title: form.title.trim(),
        description: form.description || '',
        discount: discountStr,
        validFrom: toLocalDateTime(form.validFrom),
        validTo: toLocalDateTime(form.validTo),
        active: form.isActive,
      };
      if (form.consultantId != null) payload.consultantId = form.consultantId;

      if (editing?.id) {
        await apiFetch(`/offers/${editing.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        showToast('Offer updated!');
      } else {
        await apiFetch('/offers', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Offer created!');
      }
      setShowForm(false);
      await load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to save offer.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this offer? This cannot be undone.')) return;
    setDeleting(id);
    try {
      await apiFetch(`/offers/${id}`, { method: 'DELETE' });
      setOffers(prev => prev.filter(o => o.id !== id));
      showToast('Offer deleted.');
    } catch (e: any) {
      showToast(e?.message || 'Delete failed.');
    } finally {
      setDeleting(null);
    }
  };

  const inp: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    border: '1.5px solid #E2E8F0',
    borderRadius: 9,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    background: '#fff',
    color: '#0F172A',
  };

  const lbl: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 5,
  };

  const STATUS_CFG: Record<string, { bg: string; color: string; border: string }> = {
    APPROVED: { bg: '#DCFCE7', color: '#16A34A', border: '#86EFAC' },
    PENDING: { bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' },
    REJECTED: { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  };

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#0F172A', color: '#fff', padding: '10px 22px', borderRadius: 10,
          fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0F172A' }}>Offers Management</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>
            Create, edit and manage all promotional offers shown to customers
          </p>
        </div>
        <button
          onClick={openNew}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px',
            background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Offer
        </button>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div style={{
          background: '#F8FAFC', border: '1.5px solid #BFDBFE', borderRadius: 16,
          padding: 24, marginBottom: 24, boxShadow: '0 2px 12px rgba(37,99,235,0.07)',
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 18 }}>
            {editing ? 'Edit Offer' : 'Create New Offer'}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Title */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={lbl}>Title *</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Summer Special Discount"
                style={inp}
              />
            </div>

            {/* Description */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={lbl}>Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
                placeholder="Describe what this offer includes…"
                style={{ ...inp, resize: 'none' as any }}
              />
            </div>

            {/* Discount Label */}
            <div>
              <label style={lbl}>
                Discount Label
                <span style={{ fontWeight: 400, color: '#94A3B8' }}> (auto-built from value/type below)</span>
              </label>
              <input
                type="text"
                value={form.discount}
                onChange={e => setForm(f => ({ ...f, discount: e.target.value }))}
                placeholder="e.g. 20% or 500"
                style={inp}
              />
            </div>

            {/* Discount Value */}
            <div>
              <label style={lbl}>
                Discount Value{' '}
                <span style={{ fontWeight: 400, color: '#94A3B8' }}>(actual amount applied)</span>
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={(form as any).discountType || '%'}
                  onChange={e => setForm(f => ({ ...f, discountType: e.target.value } as any))}
                  style={{ ...inp, width: 72, flexShrink: 0 }}
                >
                  <option value="%">%</option>
                  <option value="₹">₹</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={(form as any).discountValue ?? ''}
                  onChange={e => setForm(f => ({ ...f, discountValue: e.target.value } as any))}
                  placeholder={(form as any).discountType === '₹' ? 'e.g. 250' : 'e.g. 20'}
                  style={{ ...inp, flex: 1 }}
                />
              </div>
            </div>

            {/* Active Toggle — full width, prominent */}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={lbl}>Visibility</label>
              <div
                onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
                  background: form.isActive ? '#F0FDF4' : '#F8FAFC',
                  border: `1.5px solid ${form.isActive ? '#86EFAC' : '#E2E8F0'}`,
                  transition: 'all 0.2s', userSelect: 'none',
                }}
              >
                {/* Visual toggle switch */}
                <div style={{
                  position: 'relative', width: 48, height: 26, borderRadius: 26,
                  background: form.isActive ? '#16A34A' : '#CBD5E1',
                  transition: 'background 0.2s', flexShrink: 0,
                }}>
                  <div style={{
                    position: 'absolute', top: 3,
                    left: form.isActive ? 24 : 3,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
                  }} />
                </div>
                <div>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: form.isActive ? '#166534' : '#374151',
                  }}>
                    {form.isActive ? 'Active — visible to customers' : 'Inactive — hidden from customers'}
                  </div>
                  <div style={{ fontSize: 12, color: form.isActive ? '#16A34A' : '#94A3B8', marginTop: 2 }}>
                    {form.isActive
                      ? 'Customers can see and apply this offer during booking'
                      : 'Toggle on to make this offer live'}
                  </div>
                </div>
              </div>
            </div>

            {/* Valid From */}
            <div>
              <label style={lbl}>Valid From *</label>
              <input
                type="datetime-local"
                value={toDatetimeLocal(form.validFrom)}
                onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                style={inp}
              />
            </div>

            {/* Valid Until */}
            <div>
              <label style={lbl}>Valid Until *</label>
              <input
                type="datetime-local"
                value={toDatetimeLocal(form.validTo)}
                onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))}
                style={inp}
              />
            </div>

            {/* Consultant (Name Dropdown) */}
            <div>
              <label style={lbl}>
                Consultant{' '}
                <span style={{ fontWeight: 400 }}>(optional — leave blank for all)</span>
              </label>
              <select
                value={form.consultantId ?? ''}
                onChange={e => setForm(f => ({ ...f, consultantId: e.target.value ? Number(e.target.value) : null }))}
                style={inp}
              >
                <option value="">🌐 Global — visible to ALL consultants</option>
                {consultants.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Form Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowForm(false)}
              style={{
                padding: '10px 20px', borderRadius: 9,
                border: '1.5px solid #E2E8F0', background: '#fff',
                color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 24px', borderRadius: 9, border: 'none',
                background: saving ? '#93C5FD' : 'linear-gradient(135deg,#2563EB,#1D4ED8)',
                color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : editing ? 'Update Offer' : 'Create Offer'}
            </button>
          </div>
        </div>
      )}

      {/* Offers Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
          <img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
        </div>
      ) : offers.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: '#F8FAFC', borderRadius: 16, color: '#94A3B8',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
            <polyline points="20 12 20 22 4 22 4 12" />
            <rect x="2" y="7" width="20" height="5" />
            <line x1="12" y1="22" x2="12" y2="7" />
            <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
            <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
          </svg>
          <div style={{ fontWeight: 600, color: '#64748B', marginBottom: 14 }}>No offers yet</div>
          <button
            onClick={openNew}
            style={{
              padding: '10px 22px', background: '#2563EB', color: '#fff',
              border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Create First Offer
          </button>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #F1F5F9', borderRadius: 16, overflow: 'hidden' }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(180px,2fr) 100px minmax(120px,1fr) minmax(120px,1fr) 160px 140px',
            padding: '10px 20px', background: '#F8FAFC',
            borderBottom: '1px solid #F1F5F9',
            fontSize: 10, fontWeight: 700, color: '#94A3B8',
            textTransform: 'uppercase', letterSpacing: '0.06em',
            gap: 8,
          }}>
            <div>Offer</div>
            <div>Discount</div>
            <div>Valid From</div>
            <div>Valid To</div>
            <div>Status</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {/* Table Rows */}
          {offers.map((offer, idx) => {
            const st = ((offer as any).status || 'PENDING').toUpperCase();
            const stCfg = STATUS_CFG[st] || STATUS_CFG.PENDING;
            const isActive = offer.isActive !== undefined
              ? offer.isActive
              : (offer as any).active !== undefined
                ? (offer as any).active
                : false;
            const isToggling = toggling === offer.id;

            // Determine if this offer's validity period has ended
            const now = new Date();
            const isExpired = !!offer.validTo && (() => {
              const expiryDate = new Date(offer.validTo.includes('T') ? offer.validTo : offer.validTo + 'T00:00:00');
              return expiryDate < now;
            })();

            return (
              <div
                key={offer.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(180px,2fr) 100px minmax(120px,1fr) minmax(120px,1fr) 160px 140px',
                  padding: '14px 20px',
                  gap: 8,
                  borderBottom: idx < offers.length - 1 ? '1px solid #F8FAFC' : 'none',
                  alignItems: 'center', transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FAFBFF')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Offer info */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{offer.title}</div>
                  {offer.description && (
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      "{offer.description}"
                    </div>
                  )}
                  {offer.consultantId ? (
                    <div style={{ fontSize: 10, color: '#2563EB', fontWeight: 600, marginTop: 3 }}>
                      👤 {consultants.find(c => c.id === offer.consultantId)?.name || `Consultant #${offer.consultantId}`}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: '#16A34A', fontWeight: 600, marginTop: 3 }}>
                      🌐 All Consultants
                    </div>
                  )}
                </div>

                {/* Discount badge */}
                <div>
                  {offer.discount ? (
                    <span style={{
                      fontSize: 11, fontWeight: 800, background: '#DC2626',
                      color: '#fff', padding: '3px 8px', borderRadius: 20,
                      display: 'inline-block', maxWidth: '100%', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {offer.discount}
                    </span>
                  ) : (
                    <span style={{ color: '#CBD5E1', fontSize: 13 }}>—</span>
                  )}
                </div>

                {/* Valid From */}
                <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {offer.validFrom ? offer.validFrom.replace('T', ' ').substring(0, 16) : '—'}
                </div>

                {/* Valid To */}
                <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {offer.validTo ? offer.validTo.replace('T', ' ').substring(0, 16) : '—'}
                </div>

                {/* Status + Active toggle */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    background: stCfg.bg, color: stCfg.color, border: `1px solid ${stCfg.border}`,
                    whiteSpace: 'nowrap',
                  }}>
                    {st}
                  </span>
                  <button
                    onClick={() => !isExpired && handleToggleActive(offer)}
                    disabled={isToggling || isExpired}
                    title={isExpired ? 'Offer has expired — update Valid To to reactivate' : isActive ? 'Click to deactivate' : 'Click to activate'}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      padding: '3px 10px', borderRadius: 20,
                      cursor: (isToggling || isExpired) ? 'default' : 'pointer',
                      border: `1.5px solid ${isExpired ? '#FED7AA' : isActive ? '#86EFAC' : '#E2E8F0'}`,
                      background: isExpired ? '#FFF7ED' : isActive ? '#F0FDF4' : '#F8FAFC',
                      color: isExpired ? '#C2410C' : isActive ? '#16A34A' : '#94A3B8',
                      fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
                      opacity: isToggling ? 0.6 : 1, whiteSpace: 'nowrap',
                    }}
                  >
                    {isToggling ? (
                      <div style={{ width: 8, height: 8, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                    ) : (
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: isExpired ? '#C2410C' : isActive ? '#16A34A' : '#CBD5E1', flexShrink: 0 }} />
                    )}
                    {isToggling ? 'Saving…' : isExpired ? 'Expired' : isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexShrink: 0 }}>
                  <button
                    onClick={() => openEdit(offer)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '6px 12px', borderRadius: 8,
                      border: '1px solid #BFDBFE', background: '#EFF6FF',
                      color: '#2563EB', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => offer.id && handleDelete(offer.id)}
                    disabled={deleting === offer.id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '6px 12px', borderRadius: 8,
                      border: '1px solid #FECACA', background: '#FEF2F2',
                      color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      opacity: deleting === offer.id ? 0.6 : 1, whiteSpace: 'nowrap',
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                    {deleting === offer.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};



// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS DASHBOARD — inline, professional SVG tab icons, consultant performance
// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsDashboard — fully integrated with real backend data
// Tabs: Volume | Agent Performance | Customer Satisfaction | Response Times | SLA Breach | Bookings & Revenue
// ─────────────────────────────────────────────────────────────────────────────
type AnalyticsTabId = "volume" | "agents" | "satisfaction" | "sla" | "revenue";

const AnalyticsDashboard: React.FC<{ tickets: any[]; consultants: any[]; bookings: any[]; mode?: string }> = ({ tickets, consultants, bookings }) => {
  const [activeTab, setActiveTab] = React.useState<AnalyticsTabId>("volume");
  const [rangeFilter, setRangeFilter] = React.useState<"daily" | "weekly" | "monthly">("daily");
  const [localTickets, setLocalTickets] = React.useState<any[]>(tickets);
  const [localBookings, setLocalBookings] = React.useState<any[]>(bookings);
  const [localReviews, setLocalReviews] = React.useState<any[]>([]);
  const [fetching, setFetching] = React.useState(false);
  // Store resolved consultant names keyed by consultantId
  const [consultantNames, setConsultantNames] = React.useState<Record<number, string>>({});
  // Prevent parent prop re-renders from overwriting our fully-fetched local data
  const fetchDone = React.useRef(false);

  React.useEffect(() => { if (!fetchDone.current && tickets.length > 0) setLocalTickets(tickets); }, [tickets]);
  React.useEffect(() => { if (!fetchDone.current && bookings.length > 0) setLocalBookings(bookings); }, [bookings]);
  // Build name map from consultants prop
  React.useEffect(() => {
    const map: Record<number, string> = {};
    consultants.forEach((c: any) => { if (c.id) map[Number(c.id)] = c.name || c.fullName || `Consultant #${c.id}`; });
    setConsultantNames(map);
  }, [consultants]);

  const doFetch = React.useCallback(async () => {
    setFetching(true);
    try {
      // ── Fetch ALL tickets across all pages ──────────────────────────────────
      const fetchAllTickets = async (): Promise<any[]> => {
        try {
          // First try paginated endpoint to get ALL tickets (not just first page)
          const firstPage = await getTicketsPage(0, 200);
          if (firstPage.totalPages <= 1) {
            return firstPage.content.length > 0 ? firstPage.content : (await getAllTickets());
          }
          // Multiple pages — fetch them all in parallel
          const pagePromises = Array.from({ length: firstPage.totalPages - 1 }, (_, i) =>
            getTicketsPage(i + 1, 200).then(p => p.content).catch(() => [] as any[])
          );
          const restPages = await Promise.all(pagePromises);
          const all = [...firstPage.content, ...restPages.flat()];
          console.log(`[Analytics] Fetched ALL ${all.length} tickets across ${firstPage.totalPages} pages`);
          return all;
        } catch {
          return getAllTickets();
        }
      };

      // ── Fetch ALL bookings across all pages ─────────────────────────────────
      const fetchAllBookings = async (): Promise<any[]> => {
        try {
          const firstPage = await getBookingsPage(0, 200);
          if (firstPage.totalPages <= 1) {
            return firstPage.content.length > 0 ? firstPage.content : (await getAllBookings());
          }
          const pagePromises = Array.from({ length: firstPage.totalPages - 1 }, (_, i) =>
            getBookingsPage(i + 1, 200).then(p => p.content).catch(() => [] as any[])
          );
          const restPages = await Promise.all(pagePromises);
          const all = [...firstPage.content, ...restPages.flat()];
          console.log(`[Analytics] Fetched ALL ${all.length} bookings across ${firstPage.totalPages} pages`);
          return all;
        } catch {
          return getAllBookings();
        }
      };

      const [tResult, bResult, rResult] = await Promise.allSettled([
        fetchAllTickets(),
        fetchAllBookings(),
        // Try feedbacks endpoint first, then fall back to reviews
        (async () => {
          try { const d = await apiFetch("/feedbacks"); const a = Array.isArray(d) ? d : extractArray(d); if (a.length > 0) return a; } catch { }
          return getPublicReviews();
        })(),
      ]);
      if (tResult.status === "fulfilled") {
        const arr = Array.isArray(tResult.value) ? tResult.value : extractArray(tResult.value);
        if (arr.length > 0) setLocalTickets(arr);
      }
      if (bResult.status === "fulfilled") {
        const arr = Array.isArray(bResult.value) ? bResult.value : [];
        if (arr.length > 0) {
          setLocalBookings(arr);
          // Resolve consultant names: start from consultants prop, then fetch unknowns
          const cids = [...new Set(arr.map((b: any) => b.consultantId).filter(Boolean))] as number[];
          const nameMap: Record<number, string> = { ...consultantNames };
          // Pre-populate from the consultants prop (avoids extra API calls for known consultants)
          consultants.forEach((c: any) => {
            if (c.id) nameMap[Number(c.id)] = c.name || c.fullName || nameMap[Number(c.id)] || `Consultant #${c.id}`;
          });
          await Promise.all(cids.filter(id => !nameMap[id]).map(async (cid) => {
            for (const ep of [`/consultants/${cid}`, `/advisors/${cid}`, `/users/${cid}`]) {
              try {
                const d = await apiFetch(ep);
                const n = d.name || d.fullName || d.designation;
                if (n) { nameMap[cid] = n; break; }
              } catch { }
            }
          }));
          setConsultantNames(nameMap);
        }
      }
      if (rResult.status === "fulfilled") {
        const arr = Array.isArray(rResult.value) ? rResult.value : [];
        setLocalReviews(arr);
      }
    } catch { }
    finally { setFetching(false); fetchDone.current = true; }
  }, []);

  React.useEffect(() => { doFetch(); }, []);

  // ── Helpers ──
  const now = new Date();
  const daysAgo = (n: number) => { const d = new Date(now); d.setDate(d.getDate() - n); d.setHours(0, 0, 0, 0); return d; };
  const toUTCDate = (iso: string): Date => {
    if (!iso) return new Date(0);
    if (iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso)) return new Date(iso);
    return new Date(iso + "Z");
  };
  const rangeDays = rangeFilter === "daily" ? 14 : rangeFilter === "weekly" ? 60 : 180;
  const rangeStart = daysAgo(rangeDays);
  const inRange = (t: any) => { try { return toUTCDate(t.createdAt) >= rangeStart; } catch { return true; } };
  const filteredTickets = localTickets.filter(inRange);

  // ── Ticket Volume ──
  const total = filteredTickets.length;
  const totalAll = localTickets.length; // ALL tickets regardless of range
  const resolved = filteredTickets.filter(t => t.status === "RESOLVED" || t.status === "CLOSED").length;
  const resolvedAll = localTickets.filter(t => t.status === "RESOLVED" || t.status === "CLOSED").length;
  const open = filteredTickets.filter(t => ["NEW", "OPEN", "IN_PROGRESS", "PENDING"].includes(t.status)).length;
  const openAll = localTickets.filter(t => ["NEW", "OPEN", "IN_PROGRESS", "PENDING"].includes(t.status)).length;
  const resRate = total > 0 ? Math.round(resolved / total * 100) : 0;
  const resRateAll = totalAll > 0 ? Math.round(resolvedAll / totalAll * 100) : 0;

  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = daysAgo(13 - i);
    return d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
  });
  const dayMap: Record<string, { created: number; resolved: number }> = {};
  last14.forEach(d => { dayMap[d] = { created: 0, resolved: 0 }; });
  filteredTickets.forEach(t => {
    try {
      const d = toUTCDate(t.createdAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });
      if (dayMap[d]) { dayMap[d].created++; if (t.status === "RESOLVED" || t.status === "CLOSED") dayMap[d].resolved++; }
    } catch { }
  });
  const chartMax = Math.max(...Object.values(dayMap).map(v => v.created), 1);

  // ── Agent Performance ──
  // Build a consultantId → name lookup from the consultants prop so that tickets
  // which have consultantId but lack agentName/consultantName still show up
  const consultantIdToName: Record<number, string> = {};
  consultants.forEach((c: any) => {
    if (c.id) consultantIdToName[Number(c.id)] = c.name || c.fullName || c.username || `Consultant #${c.id}`;
  });

  // Use ALL localTickets (not range-filtered) so consultants are always visible
  const agentMap: Record<string, { name: string; assigned: number; resolved: number; totalResMs: number; resCount: number }> = {};
  localTickets.forEach(t => {
    // Resolve name: prefer explicit name fields, fall back to consultantId lookup from both maps
    const resolvedName =
      t.agentName || t.consultantName ||
      (t as any).assignedTo?.name || (t as any).consultant?.name ||
      (t.consultantId ? (consultantIdToName[Number(t.consultantId)] || consultantNames[Number(t.consultantId)]) : null) ||
      "";
    const name = resolvedName.trim();
    if (!name) return;
    if (!agentMap[name]) agentMap[name] = { name, assigned: 0, resolved: 0, totalResMs: 0, resCount: 0 };
    agentMap[name].assigned++;
    if (t.status === "RESOLVED" || t.status === "CLOSED") {
      agentMap[name].resolved++;
      if ((t as any).resolvedAt && t.createdAt) {
        const ms = toUTCDate((t as any).resolvedAt).getTime() - toUTCDate(t.createdAt).getTime();
        if (ms > 0) { agentMap[name].totalResMs += ms; agentMap[name].resCount++; }
      }
    }
  });
  const agents = Object.values(agentMap).sort((a, b) => b.assigned - a.assigned);

  // ── Customer Satisfaction — merge ticket feedback + public reviews ──
  // Use ALL tickets (not range-filtered) for most accurate satisfaction metrics
  const ticketRatings = localTickets
    .filter(t => t.feedbackRating && t.feedbackRating > 0)
    .map(t => ({ rating: Number(t.feedbackRating), text: t.feedbackText || "" }));

  // Also gather from reviews API (rating field may be named differently)
  const reviewRatings = localReviews
    .filter(r => (r.rating || r.feedbackRating || r.stars) > 0)
    .map(r => ({ rating: Number(r.rating || r.feedbackRating || r.stars), text: r.reviewText || r.comments || "" }));

  // Merge both sources (de-duplicate by content if needed)
  const allRatings = [...ticketRatings, ...reviewRatings];
  const avgRating = allRatings.length > 0
    ? (allRatings.reduce((s, r) => s + r.rating, 0) / allRatings.length).toFixed(1)
    : "—";
  const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  allRatings.forEach(r => { const star = Math.round(r.rating); if (star >= 1 && star <= 5) ratingDist[star]++; });
  const ratingMax = Math.max(...Object.values(ratingDist), 1);

  // ── SLA ──
  // Use ALL localTickets for SLA tracking (not range-filtered) for complete picture
  // Mirror getSlaInfo logic: breached = isSlaBreached flag OR deadline has passed
  const SLA_HOURS_MAP: Record<string, number> = { LOW: 72, MEDIUM: 24, HIGH: 8, URGENT: 4 };
  const isTicketSlaBreached = (t: any): boolean => {
    if (t.isSlaBreached) return true;
    if (!t.createdAt) return false;
    try {
      const created = new Date(t.createdAt.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(t.createdAt) ? t.createdAt : t.createdAt + "Z");
      const hours = SLA_HOURS_MAP[t.priority] ?? 24;
      const deadline = new Date(created.getTime() + hours * 3_600_000);
      return deadline.getTime() < Date.now();
    } catch { return false; }
  };
  const allSlaTracked = localTickets.length > 0 ? localTickets : filteredTickets;
  const slaBreached = allSlaTracked.filter(t => isTicketSlaBreached(t)).length;
  const slaTotal = allSlaTracked.length;
  const slaRate = slaTotal > 0 ? Math.round(slaBreached / slaTotal * 100) : 0;
  const slaByCategory: Record<string, { total: number; breached: number }> = {};
  allSlaTracked.forEach(t => {
    const cat = t.category || "General";
    if (!slaByCategory[cat]) slaByCategory[cat] = { total: 0, breached: 0 };
    slaByCategory[cat].total++;
    if (t.isSlaBreached || isTicketSlaBreached(t)) slaByCategory[cat].breached++;
  });

  // ── Bookings & Revenue ──
  const totalBookings = localBookings.length;
  const completedBookings = localBookings.filter((b: any) =>
    ["COMPLETED"].includes((b.status || b.BookingStatus || b.bookingStatus || "").toUpperCase())
  ).length;
  const pendingBookings = localBookings.filter((b: any) =>
    ["PENDING", "CONFIRMED"].includes((b.status || b.BookingStatus || b.bookingStatus || "").toUpperCase())
  ).length;
  const totalRevenue = localBookings
    .filter((b: any) => ["COMPLETED"].includes((b.status || b.BookingStatus || b.bookingStatus || "").toUpperCase()))
    .reduce((s: number, b: any) => s + Number(b.totalAmount || b.amount || b.charges || b.fee || 0), 0);

  const bookingsByConsultant: Record<string, { name: string; count: number; revenue: number; completed: number; pending: number }> = {};
  localBookings.forEach((b: any) => {
    const cid = b.consultantId;
    // Try multiple name sources including the resolved consultantNames map from doFetch
    const name =
      b.consultantName || b.advisorName || b.advisor || b.consultant?.name ||
      (cid && consultantNames[Number(cid)] ? consultantNames[Number(cid)] : null) ||
      (cid ? `Consultant #${cid}` : "Unknown");
    if (!bookingsByConsultant[name]) bookingsByConsultant[name] = { name, count: 0, revenue: 0, completed: 0, pending: 0 };
    bookingsByConsultant[name].count++;
    const statusUp = (b.status || b.BookingStatus || b.bookingStatus || "").toUpperCase();
    if (statusUp === "COMPLETED") {
      bookingsByConsultant[name].revenue += Number(b.totalAmount || b.amount || b.charges || b.fee || 0);
      bookingsByConsultant[name].completed++;
    }
    if (["PENDING", "CONFIRMED"].includes(statusUp)) {
      bookingsByConsultant[name].pending++;
    }
  });
  const topConsultants = Object.values(bookingsByConsultant).sort((a, b) => b.count - a.count).slice(0, 10);

  // ── Response Times ──
  const resTimes = filteredTickets.map(t => {
    try { if (t.resolvedAt && t.createdAt) return (toUTCDate(t.resolvedAt).getTime() - toUTCDate(t.createdAt).getTime()) / 3600000; }
    catch { } return null;
  }).filter((x): x is number => x !== null && x > 0);

  const respTimes = filteredTickets.map(t => {
    try { if (t.firstResponseAt && t.createdAt) return (toUTCDate(t.firstResponseAt).getTime() - toUTCDate(t.createdAt).getTime()) / 3600000; }
    catch { } return null;
  }).filter((x): x is number => x !== null && x > 0);

  const avgRes = resTimes.length ? (resTimes.reduce((a, b) => a + b, 0) / resTimes.length).toFixed(1) : "—";
  const avgResp = respTimes.length ? (respTimes.reduce((a, b) => a + b, 0) / respTimes.length).toFixed(1) : "—";
  const medRes = resTimes.length ? [...resTimes].sort((a, b) => a - b)[Math.floor(resTimes.length / 2)].toFixed(1) : "—";

  const byPriority: Record<string, number[]> = {};
  filteredTickets.forEach(t => {
    if (t.resolvedAt && t.createdAt) {
      const h = (toUTCDate(t.resolvedAt).getTime() - toUTCDate(t.createdAt).getTime()) / 3600000;
      if (h > 0) { if (!byPriority[t.priority]) byPriority[t.priority] = []; byPriority[t.priority].push(h); }
    }
  });

  // ── UI helpers ──
  const PRIORITY_COLORS: Record<string, string> = { CRITICAL: "#7C3AED", URGENT: "#DC2626", HIGH: "#EA580C", MEDIUM: "#D97706", LOW: "#16A34A" };

  const statCard = (label: string, value: string | number, sub?: string, color = "#2563EB", icon?: React.ReactNode) => (
    <div style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 14, padding: "18px 20px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: 110 }}>
      {icon && <div style={{ position: "absolute", right: 16, top: 16, opacity: 0.12 }}>{icon}</div>}
      <div style={{ fontSize: 26, fontWeight: 800, color, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>{value}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 5 }}>{label}</div>
      <div style={{ fontSize: 11, color: sub ? color : "transparent", marginTop: 3, fontWeight: 600, minHeight: 16 }}>{sub || " "}</div>
    </div>
  );

  const miniBar = (val: number, max: number, color: string) => (
    <div style={{ height: 7, background: "#F1F5F9", borderRadius: 4, overflow: "hidden", marginTop: 5 }}>
      <div style={{ height: "100%", width: `${Math.round((val / Math.max(max, 1)) * 100)}%`, background: color, borderRadius: 4, transition: "width 0.4s ease" }} />
    </div>
  );

  const emptyState = (msg: string, hint: string) => (
    <div style={{ textAlign: "center", padding: "48px 20px", color: "#94A3B8" }}>
      <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="20" x2="12" y2="10" /><line x1="18" y1="20" x2="18" y2="4" /><line x1="6" y1="20" x2="6" y2="16" /></svg></div>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#64748B", marginBottom: 6 }}>{msg}</div>
      <div style={{ fontSize: 12, color: "#94A3B8", maxWidth: 320, margin: "0 auto", lineHeight: 1.6 }}>{hint}</div>
      <button onClick={doFetch} disabled={fetching}
        style={{ marginTop: 16, padding: "8px 20px", borderRadius: 9, border: "1.5px solid #BFDBFE", background: "#EFF6FF", color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
        {fetching ? "Fetching..." : "Refresh Data"}
      </button>
    </div>
  );

  const TABS: { id: AnalyticsTabId; label: string; icon: React.ReactNode }[] = [
    { id: "volume", label: "Ticket Volume", icon: <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg> },
    { id: "agents", label: "Agent Performance", icon: <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="7" r="4" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" /><path d="M16 11l2 2 4-4" strokeLinejoin="round" /></svg> },
    { id: "satisfaction", label: "Customer Satisfaction", icon: <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg> },
    { id: "sla", label: "SLA Breach", icon: <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> },
    { id: "revenue", label: "Bookings & Revenue", icon: <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /><path d="M7 10.5C7 9.1 8.1 8 9.5 8S12 9.1 12 10.5 10.9 13 9.5 13H7v2h8" /></svg> },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 22, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Analytics & Reports</h2>
          <p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>Comprehensive analytics across all tickets, agents, and customer satisfaction</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginTop: 4 }}>
          {fetching && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748B" }}>
              <div style={{ width: 14, height: 14, border: "2px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              Fetching...
            </div>
          )}
          <button onClick={doFetch} disabled={fetching}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1.5px solid #E2E8F0", background: "#fff", color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: fetching ? "default" : "pointer", opacity: fetching ? 0.6 : 1 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: 4, marginBottom: 20, overflowX: "auto" }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", transition: "all 0.15s",
              background: activeTab === tab.id ? "#fff" : "transparent",
              color: activeTab === tab.id ? "#2563EB" : "#64748B",
              fontWeight: activeTab === tab.id ? 700 : 500,
              fontSize: 12,
              boxShadow: activeTab === tab.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Range filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
        {(["daily", "weekly", "monthly"] as const).map(r => (
          <button key={r} onClick={() => setRangeFilter(r)}
            style={{ padding: "6px 16px", borderRadius: 20, border: `1.5px solid ${rangeFilter === r ? "#2563EB" : "#E2E8F0"}`, background: rangeFilter === r ? "#EFF6FF" : "#fff", color: rangeFilter === r ? "#2563EB" : "#64748B", fontSize: 12, fontWeight: rangeFilter === r ? 700 : 500, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
            {r === "daily" ? "Daily (14d)" : r === "weekly" ? "Weekly (60d)" : "Monthly (180d)"}
          </button>
        ))}
      </div>

      {/* ─── TICKET VOLUME ─── */}
      {activeTab === "volume" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, alignItems: "stretch", marginBottom: 24 }}>
            {statCard("Total Tickets", totalAll, `${total} in ${rangeDays}d range`, "#2563EB")}
            {statCard("Resolved / Closed", resolvedAll, `${resRateAll}% overall rate`, "#16A34A")}
            {statCard("Open / Active", openAll, `${open} in range`, "#D97706")}
            {statCard("Resolution Rate", `${resRateAll}%`, `all-time · ${resRate}% in range`, "#7C3AED")}
          </div>
          <div style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 16, padding: "20px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 3 }}>Ticket Volume — Last 14 Days (IST)</div>
            <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 18 }}>Created vs resolved tickets per day</div>
            {total === 0 ? emptyState("No tickets in this range", "Tickets created in the selected date range will appear here.") : (
              <>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 150 }}>
                  {last14.map(d => {
                    const v = dayMap[d] || { created: 0, resolved: 0 };
                    const h = Math.round((v.created / chartMax) * 130);
                    const rh = Math.round((v.resolved / chartMax) * 130);
                    return (
                      <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{ width: "100%", display: "flex", gap: 1, alignItems: "flex-end", height: 130 }}>
                          <div style={{ flex: 1, background: "#BFDBFE", borderRadius: "3px 3px 0 0", height: Math.max(h, v.created > 0 ? 3 : 0), transition: "height 0.3s" }} title={`${v.created} created`} />
                          <div style={{ flex: 1, background: "#16A34A", borderRadius: "3px 3px 0 0", height: Math.max(rh, v.resolved > 0 ? 3 : 0), opacity: 0.75, transition: "height 0.3s" }} title={`${v.resolved} resolved`} />
                        </div>
                        <div style={{ fontSize: 8, color: "#94A3B8", textAlign: "center", transform: "rotate(-40deg)", transformOrigin: "center", marginTop: 6 }}>{d}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 11, color: "#64748B" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#BFDBFE", display: "inline-block" }} /> Created</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: "#16A34A", opacity: 0.75, display: "inline-block" }} /> Resolved/Closed</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── AGENT PERFORMANCE ─── */}
      {activeTab === "agents" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, alignItems: "stretch", marginBottom: 20 }}>
            {statCard("Total Agents", agents.length, "with assigned tickets", "#2563EB")}
            {statCard("Total Assigned", agents.reduce((s, a) => s + a.assigned, 0), `of ${localTickets.length} total tickets`, "#D97706")}
            {statCard("Avg Resolution Rate", agents.length > 0 ? `${Math.round(agents.reduce((s, a) => s + (a.assigned > 0 ? a.resolved / a.assigned * 100 : 0), 0) / agents.length)}%` : "0%", undefined, "#16A34A")}
          </div>
          <div style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9", display: "grid", gridTemplateColumns: "1fr 80px 90px 110px 100px", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <div>Consultant / Agent</div>
              <div style={{ textAlign: "center" }}>Assigned</div>
              <div style={{ textAlign: "center" }}>Resolved</div>
              <div style={{ textAlign: "center" }}>Avg Time</div>
              <div style={{ textAlign: "center" }}>Rate</div>
            </div>
            {agents.length === 0
              ? emptyState("No assigned tickets yet", "When tickets are assigned to consultants, their performance metrics will appear here. Assign tickets using the 'Assign Consultant' button in each ticket.")
              : agents.map((a, i) => {
                const rate = a.assigned > 0 ? Math.round(a.resolved / a.assigned * 100) : 0;
                const avgT = a.resCount > 0 ? (a.totalResMs / a.resCount / 3600000).toFixed(1) : null;
                const rateColor = rate >= 70 ? "#16A34A" : rate >= 40 ? "#D97706" : "#DC2626";
                return (
                  <div key={a.name} style={{ display: "grid", gridTemplateColumns: "1fr 80px 90px 110px 100px", padding: "14px 20px", borderBottom: i < agents.length - 1 ? "1px solid #F8FAFC" : "none", alignItems: "center" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFF")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 28, height: 28, borderRadius: "50%", background: `hsl(${(a.name.charCodeAt(0) * 7) % 360},60%,88%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: `hsl(${(a.name.charCodeAt(0) * 7) % 360},60%,35%)`, flexShrink: 0 }}>
                          {a.name.charAt(0).toUpperCase()}
                        </div>
                        {a.name}
                      </div>
                      <div style={{ marginTop: 5, height: 4, background: "#F1F5F9", borderRadius: 2, width: "80%", overflow: "hidden", marginLeft: 36 }}>
                        <div style={{ height: "100%", width: `${rate}%`, background: rateColor, borderRadius: 2, transition: "width 0.4s" }} />
                      </div>
                    </div>
                    <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: "#2563EB" }}>{a.assigned}</div>
                    <div style={{ textAlign: "center", fontSize: 16, fontWeight: 800, color: "#16A34A" }}>{a.resolved}</div>
                    <div style={{ textAlign: "center", fontSize: 12, color: avgT ? "#374151" : "#94A3B8", fontWeight: avgT ? 600 : 400 }}>
                      {avgT ? `${avgT}h` : "—"}
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: rate >= 70 ? "#DCFCE7" : rate >= 40 ? "#FFFBEB" : "#FEF2F2", color: rateColor }}>
                        {rate}%
                      </span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ─── CUSTOMER SATISFACTION ─── */}
      {activeTab === "satisfaction" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, alignItems: "stretch", marginBottom: 24 }}>
            {statCard("Avg Rating", avgRating === "—" ? "—" : `${avgRating} / 5`, `from ${allRatings.length} reviews`, "#F59E0B")}
            {statCard("Total Reviews", allRatings.length, `${allRatings.length} total reviews collected`, "#7C3AED")}
            {statCard("5-Star Reviews", ratingDist[5], `${allRatings.length > 0 ? Math.round(ratingDist[5] / allRatings.length * 100) : 0}% of total`, "#16A34A")}
          </div>
          <div style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 16, padding: "20px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 18 }}>Rating Distribution</div>
            {allRatings.length === 0
              ? emptyState("No reviews collected yet", "Customer ratings will appear here once users submit feedback on their tickets or completed sessions. Ticket feedback is submitted via the user's ticket detail view.")
              : [5, 4, 3, 2, 1].map(star => {
                const count = ratingDist[star];
                const pct = allRatings.length > 0 ? Math.round(count / allRatings.length * 100) : 0;
                return (
                  <div key={star} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                    <div style={{ width: 44, fontSize: 13, fontWeight: 600, color: "#374151", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      {star} <svg width="12" height="12" fill="#F59E0B" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                    </div>
                    <div style={{ flex: 1, height: 10, background: "#F1F5F9", borderRadius: 5, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: star >= 4 ? "#16A34A" : star === 3 ? "#F59E0B" : "#DC2626", borderRadius: 5, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ width: 56, fontSize: 12, color: "#64748B", textAlign: "right", fontWeight: 600 }}>{count} ({pct}%)</div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ─── RESPONSE TIMES ─── */}
      {/* ─── SLA BREACH ─── */}
      {activeTab === "sla" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, alignItems: "stretch", marginBottom: 24 }}>
            {statCard("SLA Breaches", slaBreached, `${slaRate}% breach rate`, "#DC2626")}
            {statCard("Compliant", slaTotal - slaBreached, `${100 - slaRate}% on track`, "#16A34A")}
            {statCard("Total Tracked", slaTotal, `across all tickets`, "#2563EB")}
          </div>
          {slaBreached === 0 && slaTotal > 0 && (
            <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              <div>
                <div style={{ fontWeight: 700, color: "#166534", fontSize: 13 }}>No SLA Breaches in this period</div>
                <div style={{ fontSize: 12, color: "#166534", opacity: 0.8 }}>All {slaTotal} tickets are within SLA. The isSlaBreached field is set by the backend when tickets exceed their SLA window.</div>
              </div>
            </div>
          )}
          <div style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 16, padding: "20px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 18 }}>SLA Breach by Category</div>
            {Object.entries(slaByCategory).length === 0
              ? emptyState("No tickets to analyse", "SLA breach data will appear here once tickets are created and their SLA status is tracked by the backend.")
              : Object.entries(slaByCategory).sort((a, b) => b[1].breached - a[1].breached).map(([cat, data]) => {
                const rate = data.total > 0 ? Math.round(data.breached / data.total * 100) : 0;
                const barColor = rate > 50 ? "#DC2626" : rate > 25 ? "#D97706" : "#16A34A";
                return (
                  <div key={cat} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, color: "#374151" }}>{cat}</span>
                      <span style={{ fontWeight: 600, color: rate > 0 ? barColor : "#64748B" }}>
                        {data.breached}/{data.total} breached · {rate}%
                      </span>
                    </div>
                    {miniBar(data.breached, data.total, barColor)}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ─── BOOKINGS & REVENUE ─── */}
      {activeTab === "revenue" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, alignItems: "stretch", marginBottom: 24 }}>
            {statCard("Total Bookings", totalBookings, `${pendingBookings} pending / confirmed`, "#2563EB")}
            {statCard("Completed", completedBookings, totalBookings > 0 ? `${Math.round(completedBookings / totalBookings * 100)}% completion rate` : "0% completion rate", "#16A34A")}
            {statCard("Total Revenue", totalRevenue > 0 ? `Rs. ${totalRevenue.toLocaleString("en-IN")}` : "Rs. 0", "from completed bookings", "#059669")}
            {statCard("Active Consultants", consultants.length, `${topConsultants.length} with bookings`, "#7C3AED")}
          </div>
          <div style={{ background: "#fff", border: "1px solid #F1F5F9", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", background: "#F8FAFC", borderBottom: "1px solid #F1F5F9", display: "grid", gridTemplateColumns: "1fr 70px 80px 80px 110px", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <div>Consultant</div>
              <div style={{ textAlign: "center" }}>Total</div>
              <div style={{ textAlign: "center" }}>Pending</div>
              <div style={{ textAlign: "center" }}>Completed</div>
              <div style={{ textAlign: "right" }}>Revenue (Rs.)</div>
            </div>
            {topConsultants.length === 0
              ? emptyState("No booking data available", "Booking and revenue data will appear here once consultants start receiving bookings.")
              : topConsultants.map((c, i) => (
                <div key={c.name} style={{ display: "grid", gridTemplateColumns: "1fr 70px 80px 80px 110px", padding: "13px 20px", borderBottom: i < topConsultants.length - 1 ? "1px solid #F8FAFC" : "none", alignItems: "center" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#FAFBFF")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                  <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: "#2563EB" }}>{c.count}</div>
                  <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: "#D97706" }}>{(c as any).pending ?? 0}</div>
                  <div style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: "#16A34A" }}>{c.completed}</div>
                  <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: c.revenue > 0 ? "#059669" : "#94A3B8" }}>
                    {c.revenue > 0 ? `Rs. ${c.revenue.toLocaleString("en-IN")}` : "--"}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT SUBMISSIONS PANEL — shows messages submitted via homepage Contact Us
// ─────────────────────────────────────────────────────────────────────────────
interface ContactSubmission {
  id: number;
  name: string;
  email: string;
  message: string;
  submittedAt: string;
  read: boolean;
  isRead?: boolean;
  createdAt?: string;
  syncedToBackend?: boolean;
}

const ContactSubmissionsPanel: React.FC = () => {
  const ADMIN_BASE = API_BASE_URL;
  const getAdminToken = () => localStorage.getItem("fin_token") || "";

  const [submissions, setSubmissions] = React.useState<ContactSubmission[]>([]);
  const [selected, setSelected] = React.useState<ContactSubmission | null>(null);
  const [filter, setFilter] = React.useState<"all" | "unread" | "read">("all");
  const [search, setSearch] = React.useState("");
  const [toast, setToast] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const [totalPages, setTotalPages] = React.useState(1);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // Normalise a raw API or localStorage record into ContactSubmission shape
  const normalise = (r: any): ContactSubmission => ({
    id: r.id ?? r.localId ?? Date.now(),
    name: r.name ?? "--",
    email: r.email ?? "--",
    message: r.message ?? "",
    read: r.isRead ?? r.read ?? false,
    submittedAt: r.createdAt ?? r.submittedAt ?? new Date().toISOString(),
    syncedToBackend: r.syncedToBackend ?? true,
  });

  // Load: try backend first, merge with any localStorage-only items (unsynced)
  const load = React.useCallback(async (pg = 0) => {
    setLoading(true);
    try {
      const res = await fetch(
        `${ADMIN_BASE}/contact/admin/messages?page=${pg}&size=50`,
        { headers: { Accept: "application/json", Authorization: `Bearer ${getAdminToken()}` } }
      );
      if (res.ok) {
        const data = await res.json();
        // Spring Page response: { content: [], totalPages, totalElements }
        const arr: ContactSubmission[] = (Array.isArray(data) ? data : data?.content ?? []).map(normalise);
        setTotalPages(data?.totalPages ?? 1);

        // Also merge any localStorage submissions that haven't synced yet
        try {
          const raw = localStorage.getItem("fin_contact_submissions");
          const local: any[] = raw ? JSON.parse(raw) : [];
          const unsynced = local.filter((l: any) => !l.syncedToBackend);
          const merged = [...arr];
          unsynced.forEach((u: any) => {
            if (!merged.find(m => m.email === u.email && m.message === u.message)) {
              merged.push(normalise({ ...u, syncedToBackend: false }));
            }
          });
          merged.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
          setSubmissions(merged);
        } catch {
          setSubmissions(arr);
        }
        return;
      }
    } catch { /* backend unreachable -- fall through to localStorage */ }

    // Fallback: read entirely from localStorage
    try {
      const raw = localStorage.getItem("fin_contact_submissions");
      const arr: ContactSubmission[] = raw ? JSON.parse(raw).map(normalise) : [];
      arr.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      setSubmissions(arr);
    } catch { setSubmissions([]); }
    finally { setLoading(false); }
    setLoading(false);
  }, []);

  React.useEffect(() => { load(0); }, [load]);

  // Mark a single message as read -- backend + localStorage
  const markRead = async (id: number) => {
    const updated = submissions.map(s => s.id === id ? { ...s, read: true, isRead: true } : s);
    setSubmissions(updated);
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, read: true } : prev);
    // Sync to localStorage
    try {
      const raw = localStorage.getItem("fin_contact_submissions");
      const arr = raw ? JSON.parse(raw) : [];
      localStorage.setItem("fin_contact_submissions", JSON.stringify(
        arr.map((s: any) => s.id === id ? { ...s, read: true } : s)
      ));
    } catch { }
    // Sync to backend (best-effort)
    try {
      await fetch(`${ADMIN_BASE}/contact/admin/messages/${id}/read`, {
        method: "PATCH",
        headers: { Accept: "application/json", Authorization: `Bearer ${getAdminToken()}` },
      });
    } catch { /* silent */ }
  };

  const handleSelect = (sub: ContactSubmission) => {
    setSelected(sub);
    if (!sub.read) markRead(sub.id);
  };

  const handleDelete = (id: number) => {
    const updated = submissions.filter(s => s.id !== id);
    setSubmissions(updated);
    if (selected?.id === id) setSelected(null);
    // Remove from localStorage
    try {
      const raw = localStorage.getItem("fin_contact_submissions");
      const arr = raw ? JSON.parse(raw) : [];
      localStorage.setItem("fin_contact_submissions", JSON.stringify(arr.filter((s: any) => s.id !== id)));
    } catch { }
    showToast("Message deleted.");
  };

  const handleMarkAllRead = async () => {
    const updated = submissions.map(s => ({ ...s, read: true, isRead: true }));
    setSubmissions(updated);
    try {
      const raw = localStorage.getItem("fin_contact_submissions");
      const arr = raw ? JSON.parse(raw) : [];
      localStorage.setItem("fin_contact_submissions", JSON.stringify(arr.map((s: any) => ({ ...s, read: true }))));
    } catch { }
    // Mark each unread on backend
    await Promise.all(
      submissions.filter(s => !s.read).map(s =>
        fetch(`${ADMIN_BASE}/contact/admin/messages/${s.id}/read`, {
          method: "PATCH",
          headers: { Accept: "application/json", Authorization: `Bearer ${getAdminToken()}` },
        }).catch(() => { })
      )
    );
    showToast("All marked as read.");
  };

  const handleDeleteAll = () => {
    if (!window.confirm("Delete all contact submissions from local view? This cannot be undone.")) return;
    setSubmissions([]);
    setSelected(null);
    localStorage.removeItem("fin_contact_submissions");
    showToast("All messages cleared from local view.");
  };

  const unreadCount = submissions.filter(s => !s.read).length;

  const visible = submissions.filter(s => {
    if (filter === "unread" && s.read) return false;
    if (filter === "read" && !s.read) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.email.toLowerCase().includes(q) && !s.message.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const fmtDate = (iso: string) => {
    try { return fmtIST(iso, IST_OPTS_DATETIME); }
    catch { return iso; }
  };

  return (
    <div>
      {toast && <div style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: "#0F172A", color: "#fff", padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>{toast}</div>}

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Contact Submissions</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>
            Messages from the homepage Contact Us form
            {unreadCount > 0 && <span style={{ marginLeft: 10, background: "#DC2626", color: "#fff", borderRadius: 20, fontSize: 11, fontWeight: 700, padding: "2px 8px" }}>{unreadCount} unread</span>}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => load(page)} disabled={loading}
            style={{ padding: "8px 14px", borderRadius: 9, border: "1.5px solid #E2E8F0", background: "#fff", color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            {loading ? "Loading..." : "Refresh"}
          </button>
          {unreadCount > 0 && <button onClick={handleMarkAllRead} style={{ padding: "8px 14px", borderRadius: 9, border: "1.5px solid #BFDBFE", background: "#EFF6FF", color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Mark All Read</button>}
          {submissions.length > 0 && <button onClick={handleDeleteAll} style={{ padding: "8px 14px", borderRadius: 9, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Clear All</button>}
        </div>
      </div>

      {/* Filters + search */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "unread", "read"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${filter === f ? "#2563EB" : "#E2E8F0"}`, background: filter === f ? "#2563EB" : "#fff", color: filter === f ? "#fff" : "#64748B", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize" }}>
              {f} ({f === "all" ? submissions.length : f === "unread" ? unreadCount : submissions.length - unreadCount})
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} width="13" height="13" fill="none" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2" /><path d="m21 21-4.35-4.35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, message..."
            style={{ width: "100%", paddingLeft: 30, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: "1.5px solid #E2E8F0", borderRadius: 9, fontSize: 13, outline: "none", boxSizing: "border-box" as const }} />
        </div>
      </div>

      {loading && submissions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: "#94A3B8" }}>
          <img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
        </div>
      ) : submissions.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 20px", background: "#F8FAFC", borderRadius: 16, color: "#94A3B8" }}>
          <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round" style={{ marginBottom: 14 }}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
          </svg>
          <div style={{ fontWeight: 600, fontSize: 15, color: "#64748B", marginBottom: 6 }}>No contact submissions yet</div>
          <p style={{ fontSize: 13, margin: 0 }}>When users submit the Contact Us form on the homepage, their messages will appear here.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 1fr" : "1fr", gap: 20, alignItems: "start" }}>
          {/* Message list */}
          <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
              {visible.length} message{visible.length !== 1 ? "s" : ""}
            </div>
            {visible.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>No messages match your filter.</div>
            ) : (
              <div style={{ maxHeight: 600, overflowY: "auto" }}>
                {visible.map((sub, i) => (
                  <div key={sub.id}
                    onClick={() => handleSelect(sub)}
                    style={{
                      padding: "14px 18px", borderBottom: i < visible.length - 1 ? "1px solid #F1F5F9" : "none",
                      cursor: "pointer",
                      background: selected?.id === sub.id ? "#EFF6FF" : sub.read ? "#fff" : "#FAFBFF",
                      borderLeft: `3px solid ${selected?.id === sub.id ? "#2563EB" : sub.read ? "transparent" : "#2563EB"}`,
                      transition: "all 0.1s",
                    }}
                    onMouseEnter={e => { if (selected?.id !== sub.id) (e.currentTarget as HTMLDivElement).style.background = "#F8FAFC"; }}
                    onMouseLeave={e => { if (selected?.id !== sub.id) (e.currentTarget as HTMLDivElement).style.background = sub.read ? "#fff" : "#FAFBFF"; }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#1E3A5F,#2563EB)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                            {sub.name.charAt(0).toUpperCase()}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: sub.read ? 600 : 800, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                              {sub.name}
                              {!sub.read && <span style={{ marginLeft: 6, display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#2563EB", verticalAlign: "middle" }} />}
                              {!sub.syncedToBackend && <span style={{ marginLeft: 6, fontSize: 9, color: "#F59E0B", fontWeight: 700, background: "#FFFBEB", padding: "1px 5px", borderRadius: 4, border: "1px solid #FDE68A" }}>LOCAL</span>}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{sub.email}</div>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "#374151", marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, paddingLeft: 40 }}>
                          {sub.message}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 10, color: "#94A3B8" }}>{fmtDate(sub.submittedAt)}</div>
                        <button onClick={e => { e.stopPropagation(); handleDelete(sub.id); }}
                          style={{ marginTop: 6, padding: "3px 8px", borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ padding: "10px 18px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 8, justifyContent: "center" }}>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i} onClick={() => { setPage(i); load(i); }}
                    style={{ width: 30, height: 30, borderRadius: 7, border: `1.5px solid ${page === i ? "#2563EB" : "#E2E8F0"}`, background: page === i ? "#2563EB" : "#fff", color: page === i ? "#fff" : "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Detail view */}
          {selected && (
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, overflow: "hidden", position: "sticky", top: 20 }}>
              <div style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)", padding: "18px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{selected.name}</div>
                    <div style={{ fontSize: 12, color: "#BFDBFE", marginTop: 2 }}>{selected.email}</div>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>x</button>
                </div>
                <div style={{ fontSize: 11, color: "#93C5FD", marginTop: 8 }}> {fmtDate(selected.submittedAt)}</div>
              </div>
              <div style={{ padding: "20px 22px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 10 }}>Message</div>
                <div style={{ fontSize: 14, color: "#0F172A", lineHeight: 1.75, background: "#F8FAFC", borderRadius: 12, padding: "14px 16px", borderLeft: "3px solid #BFDBFE", whiteSpace: "pre-wrap" }}>
                  {selected.message}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <a href={`mailto:${selected.email}?subject=Re: Your message to Meet The Masters`}
                    style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                    Reply via Email
                  </a>
                  <button onClick={() => handleDelete(selected.id)}
                    style={{ padding: "10px 16px", borderRadius: 10, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function AdminPageInner() {
  const navigate = useNavigate();
  const { addNotification } = useNotifications();

  useEffect(() => {
    const poll = async () => {
      const resolveConsultantName = async (consultantId?: number | null) => {
        if (!consultantId) return null;
        try {
          const c = await apiFetch(`/consultants/${consultantId}`);
          return c?.name || c?.fullName || c?.displayName || null;
        } catch {
          return null;
        }
      };

      const resolveTicketUserName = async (ticketId?: number | null) => {
        if (!ticketId) return null;
        try {
          const t = await apiFetch(`/tickets/${ticketId}`);
          return (
            t?.userName ||
            t?.user?.name ||
            t?.user?.fullName ||
            t?.clientName ||
            t?.raisedByName ||
            t?.customer?.name ||
            null
          );
        } catch {
          return null;
        }
      };

      try {
        const alerts: any[] = JSON.parse(localStorage.getItem("fin_escalations_ADMIN") || "[]");
        const unread = alerts.filter((a) => !a.read);
        for (const a of unread) {
          const consultantName = await resolveConsultantName(a.consultantId);
          const userName = await resolveTicketUserName(a.ticketId);
          const message = consultantName
            ? String(a.message || "").replace(new RegExp(`Consultant\\s*#${a.consultantId}`, "g"), consultantName)
            : a.message;
          addNotification({
            type: "error",
            title: `🚨 Escalation - Ticket #${a.ticketId}${userName ? ` - ${userName}` : ""}`,
            message: `${userName ? `User: ${userName}. ` : ""}${message}`,
            ticketId: a.ticketId,
          });
          a.read = true;
        }
        if (unread.length > 0) {
          localStorage.setItem("fin_escalations_ADMIN", JSON.stringify(alerts));
        }
      } catch {
        // localStorage unavailable
      }

      try {
        const adminNotifs: any[] = JSON.parse(localStorage.getItem("fin_notifs_ADMIN") || "[]");
        const unreadAdmin = adminNotifs.filter((n) => !n.read);
        for (const n of unreadAdmin) {
          const consultantName = await resolveConsultantName(n.consultantId);
          const userName = await resolveTicketUserName(n.ticketId);
          const message = consultantName
            ? String(n.message || "").replace(new RegExp(`Consultant\\s*#${n.consultantId}`, "g"), consultantName)
            : n.message;
          addNotification({
            type: (n.type || "info") as any,
            title: n.title || `Notification${n.ticketId ? ` - Ticket #${n.ticketId}` : ""}${userName ? ` - ${userName}` : ""}`,
            message: `${userName ? `User: ${userName}. ` : ""}${message || ""}`,
            ticketId: n.ticketId,
          });
          n.read = true;
        }
        if (unreadAdmin.length > 0) {
          localStorage.setItem("fin_notifs_ADMIN", JSON.stringify(adminNotifs));
        }
      } catch {
        // localStorage unavailable
      }
    };

    poll();
    const timer = setInterval(poll, 30_000);
    return () => clearInterval(timer);
  }, [addNotification]);

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
  // Delete consultant confirmation modal — shows booking warning or confirm dialog
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    advisor: Advisor;
    bookingCount: number;
    hasBookings: boolean;
    checking: boolean;
  } | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; label: string; sub: string; icon: string }[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = React.useRef<HTMLDivElement>(null);
  const [bookingChartData, setBookingChartData] = useState<{ day: string; bookings: number; revenue: number }[]>([
    { day: "Mon", bookings: 0, revenue: 0 }, { day: "Tue", bookings: 0, revenue: 0 }, { day: "Wed", bookings: 0, revenue: 0 },
    { day: "Thu", bookings: 0, revenue: 0 }, { day: "Fri", bookings: 0, revenue: 0 }, { day: "Sat", bookings: 0, revenue: 0 }, { day: "Sun", bookings: 0, revenue: 0 },
  ]);
  // Consultant performance: bookings per consultant for the bar chart
  const [consultantChartData, setConsultantChartData] = useState<{ name: string; bookings: number; revenue: number }[]>([]);

  const currentAdminId = Number(localStorage.getItem("fin_user_id") ?? 0);

  // ── Contact submissions unread count ──────────────────────────────────────
  const [contactUnreadCount, setContactUnreadCount] = useState(() => {
    try {
      const raw = localStorage.getItem("fin_contact_submissions");
      const arr = raw ? JSON.parse(raw) : [];
      return arr.filter((s: any) => !s.read).length;
    } catch { return 0; }
  });

  // Refresh unread count when navigating to contact-submissions
  useEffect(() => {
    if (activeSection === "contact-submissions") {
      setContactUnreadCount(0);
    } else {
      try {
        const raw = localStorage.getItem("fin_contact_submissions");
        const arr = raw ? JSON.parse(raw) : [];
        setContactUnreadCount(arr.filter((s: any) => !s.read).length);
      } catch { }
    }
  }, [activeSection]);

  // ── Logout handler ───────────────────────────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem("fin_token");
    localStorage.removeItem("fin_role");
    localStorage.removeItem("fin_user_id");
    localStorage.removeItem("fin_consultant_id");
    localStorage.removeItem("fin_user_name");
    localStorage.removeItem("fin_user_email");
    navigate("/login");
  };

  const extractUserName = (b: any): string => {
    const name =
      b.user?.name || b.user?.fullName ||
      (b.user?.firstName && b.user?.lastName ? `${b.user.firstName} ${b.user.lastName}` : b.user?.firstName) ||
      b.client?.name || b.client?.fullName ||
      b.bookedBy?.name || b.bookedBy?.fullName ||
      b.customer?.name || b.customer?.fullName ||
      b.client?.name || b.bookedBy?.name || b.customer?.name ||
      b.userName || b.clientName || b.userFullName || b.bookedByName ||
      b.raisedByName || b.memberName ||
      b.user?.displayName ||
      b.user?.username ||
      (b.user?.email ? b.user.email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : null) ||
      (b.userId ? `User #${b.userId}` : null) ||
      (b.clientId ? `User #${b.clientId}` : null);
    return name || `User #${b.id}`;
  };

  const fetchDashboardData = async () => {
    setLoading(true);

    try {
      const advData = await getAllAdvisors();
      if (Array.isArray(advData) && advData.length > 0) {
        setAdvisors(advData.map((a: any) => {
          const baseCharges = Number(a.charges || 0);
          // PRD §5.3: Display price = base + ₹200 markup
          const displayPrice = a.displayPrice ? Number(a.displayPrice) : (baseCharges > 0 ? baseCharges + 200 : 0);
          const rawAvatar =
            a.profileImageUrl ||
            a.avatarUrl ||
            a.profilePhoto ||
            a.photo ||
            "";
          const resolvedAvatar = rawAvatar
            ? (String(rawAvatar).startsWith("http")
                ? String(rawAvatar)
                : buildBackendAssetUrl(String(rawAvatar)))
            : `https://ui-avatars.com/api/?name=${encodeURIComponent(a.name)}&background=2563EB&color=fff&bold=true`;
          return {
            id: a.id, name: a.name, role: a.designation || "Financial Consultant",
            tags: Array.isArray(a.skills) ? a.skills : [],
            rating: Number(a.rating || 4.5), reviews: Number(a.reviewCount || 0),
            fee: displayPrice, exp: a.experience || "5+ Years",
            shiftStartTime: parseLocalTime(a.shiftStartTime), shiftEndTime: parseLocalTime(a.shiftEndTime),
            avatar: resolvedAvatar,
          };
        }));
        setBackendStatus("online");
      }
    } catch (err: any) {
      setBackendStatus(err?.message?.includes("403") ? "error" : "offline");
    }

    try {
      try {
        const bookingSummary = await getBookingSummary();
        setTotalBookingsCount(bookingSummary.total);
        setTotalRevenue(Number(bookingSummary.revenue || 0));
      } catch { }

      // Fetch ALL bookings across all pages (same pattern as analytics)
      let bookingsArr: any[] = [];
      try {
        const firstPage = await getBookingsPage(0, 200);
        if (firstPage.totalPages <= 1) {
          bookingsArr = firstPage.content.length > 0 ? firstPage.content : await getAllBookings();
        } else {
          const rest = await Promise.all(
            Array.from({ length: firstPage.totalPages - 1 }, (_, i) =>
              getBookingsPage(i + 1, 200).then(p => p.content).catch(() => [] as any[])
            )
          );
          bookingsArr = [...firstPage.content, ...rest.flat()];
        }
        // Update badge with real total from backend
        if (firstPage.totalElements > 0) setTotalBookingsCount(firstPage.totalElements);
      } catch {
        bookingsArr = await getAllBookings();
      }
      if (bookingsArr.length > 0) {
        const masterMap: Record<number, string> = {};
        try {
          const mData = await apiFetch("/master-timeslots");
          (Array.isArray(mData) ? mData : mData?.content || []).forEach((m: any) => { if (m.id && m.timeRange) masterMap[m.id] = m.timeRange; });
        } catch { }

        // Fetch timeslot details — Swagger: GET /api/timeslots/{id} → {slotDate, masterTimeSlotId, timeRange}
        // BookingResponse only has timeSlotId — timeslot is the source of date/time
        const bookingDetailMap: Record<number, any> = {}; // keyed by booking id for user resolution
        const timeslotMap: Record<number, any> = {}; // keyed by timeSlotId for date/time
        const uniqueSlotIds = [...new Set(bookingsArr.map((b: any) => b.timeSlotId).filter(Boolean))] as number[];
        await Promise.all([
          // Fetch timeslots for date/time (keyed by timeSlotId)
          ...uniqueSlotIds.map((tsId: number) =>
            apiFetch(`/timeslots/${tsId}`).then((ts: any) => { timeslotMap[tsId] = ts; }).catch(() => { })
          ),
        ]);
        // Fetch user names in parallel
        const userIds = [...new Set(bookingsArr.map((b: any) => b.userId || b.user?.id || b.clientId).filter(Boolean))] as number[];
        const userNameMap: Record<number, string> = {};
        await Promise.all(userIds.map(async (uid) => {
          for (const endpoint of [`/users/${uid}`, `/onboarding/${uid}`, `/members/${uid}`]) {
            try {
              const u = await apiFetch(endpoint);
              const raw =
                u.name || u.fullName || u.displayName ||
                (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName) ||
                u.clientName || u.memberName || u.bookedByName ||
                u.username || u.email || u.identifier || "";
              if (!raw) continue;
              const base = raw.includes("@") ? raw.split("@")[0] : raw;
              userNameMap[uid] = base.replace(/[._-]+/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()).trim();
              return;
            } catch { /* try next */ }
          }
          userNameMap[uid] = `User #${uid}`;
        }));

        const uniqueConsultantIds = [...new Set(bookingsArr.map((b: any) => b.consultantId).filter(Boolean))] as number[];
        const consultantNameMap: Record<number, string> = {};
        await Promise.all(uniqueConsultantIds.map(id =>
          (async (cid: number) => {
            for (const ep of [`/consultants/${cid}`, `/advisors/${cid}`, `/users/${cid}`]) {
              try {
                const c = await apiFetch(ep);
                const n = c?.name || c?.fullName || c?.username || c?.displayName;
                if (n) { consultantNameMap[cid] = n; return; }
              } catch { /* try next */ }
            }
            consultantNameMap[cid] = `Consultant #${cid}`;
          })(id)
        ));

        const mapped = bookingsArr.map((b: any) => {
          // Use timeslotMap for date/time (Swagger: TimeSlotResponse has slotDate, timeRange)
          const ts = timeslotMap[b.timeSlotId] || {};
          const slotDate = ts.slotDate || b.slotDate || b.bookingDate || b.date || "";
          const masterKey = ts.masterTimeSlotId || b.masterTimeSlotId;
          const timeRange = (masterKey && masterMap[masterKey]) ||
            ts.timeRange || b.timeRange || "";
          const advisorName = b.consultant?.name || b.consultantName || consultantNameMap[b.consultantId] || `Consultant #${b.consultantId}`;
          const uid = b.userId || b.user?.id || b.clientId;
          const resolvedUser = (uid && userNameMap[uid]) ? userNameMap[uid] : extractUserName(b);
          const timeStr = slotDate && timeRange ? `${slotDate} • ${timeRange}` : slotDate || timeRange || "";
          return { id: b.id, user: resolvedUser, advisor: advisorName, time: timeStr, status: (b.BookingStatus || b.bookingStatus || b.status || "PENDING").toUpperCase(), amount: Number(b.amount || b.charges || b.fee || b.totalAmount || 0) };
        });

        setAllBookings(mapped);
        setTotalBookingsCount(prev => prev > 0 ? prev : mapped.length);
        // Preserve summary revenue when available; otherwise fall back to derived list total
        setTotalRevenue(prev => prev > 0 ? prev : mapped.reduce((s: number, b: any) => s + (b.amount || 0), 0));
        setDashBookings(mapped.slice(0, 5));

        // Build rolling 14-day chart (today ± 7 days) so upcoming bookings always appear
        // This avoids the "empty chart" when all bookings are future dates
        const chartNow = new Date();
        chartNow.setHours(0, 0, 0, 0);
        const DAY_NAMES_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        // Generate 14 days: -3 past days + today + 10 future days
        const chartDays: { iso: string; label: string }[] = [];
        for (let i = -3; i <= 10; i++) {
          const d = new Date(chartNow);
          d.setDate(d.getDate() + i);
          const iso = d.toISOString().split("T")[0];
          const dow = DAY_NAMES_SHORT[d.getDay()];
          const date = d.getDate();
          chartDays.push({ iso, label: `${dow} ${date}` });
        }
        const dayCounts: Record<string, number> = {};
        const dayRevenue: Record<string, number> = {};
        chartDays.forEach(cd => { dayCounts[cd.iso] = 0; dayRevenue[cd.iso] = 0; });

        mapped.forEach((b: any) => {
          const datePart = (b.time?.split(" • ")[0]?.trim()) || b.slotDate || "";
          if (!datePart || datePart === "N/A") return;
          // Normalise date string — handle "25 Mar 2026" or "2026-03-25"
          const d = new Date(datePart + "T00:00:00");
          if (isNaN(d.getTime())) return;
          const iso = d.toISOString().split("T")[0];
          if (dayCounts[iso] !== undefined) {
            dayCounts[iso]++;
            dayRevenue[iso] = (dayRevenue[iso] || 0) + (b.amount || 0);
          }
        });

        setBookingChartData(
          chartDays.map(cd => ({
            day: cd.label,
            bookings: dayCounts[cd.iso] || 0,
            revenue: Math.round((dayRevenue[cd.iso] || 0) / 1000),
          }))
        );

        // Consultant performance chart: bookings and revenue per consultant
        const consultantMap: Record<string, { name: string; bookings: number; revenue: number }> = {};
        mapped.forEach((b: any) => {
          const name = b.advisor || "Unknown";
          if (!consultantMap[name]) consultantMap[name] = { name, bookings: 0, revenue: 0 };
          consultantMap[name].bookings++;
          consultantMap[name].revenue += (b.amount || 0);
        });
        const consultantArr = Object.values(consultantMap)
          .sort((a, b) => b.bookings - a.bookings)
          .slice(0, 6) // top 6 consultants
          .map(c => ({ ...c, name: c.name.split(" ")[0], revenue: Math.round(c.revenue / 1000) })); // first name only, revenue in K
        setConsultantChartData(consultantArr);
      }
    } catch (err: any) { console.warn("[Admin] Bookings failed (non-fatal):", err?.message); }

    try {
      try {
        const ticketSummary = await getTicketSummary();
        setTicketCount(ticketSummary.openActive);
      } catch { }

      const tdata = await getAllTickets();
      const tarr: Ticket[] = Array.isArray(tdata) ? tdata : extractArray(tdata);
      setTicketCount(prev => prev > 0 ? prev : tarr.filter((t: any) => ["NEW", "OPEN", "IN_PROGRESS", "PENDING"].includes(t.status)).length);
      setAllTickets(tarr);
    } catch (err) { console.warn("[Admin] Tickets failed (non-fatal):", err); }

    setLoading(false);
  };

  useEffect(() => { fetchDashboardData(); }, []);

  const handleDeleteAdvisor = async (advisor: Advisor) => {
    // Step 1: Show modal immediately with "checking…" state
    setDeleteConfirmModal({ advisor, bookingCount: 0, hasBookings: false, checking: true });

    // Step 2: Check if this consultant has any bookings
    try {
      const bookingCount = allBookings.filter((b: any) => {
        const bName = (b.advisor || b.consultantName || b.advisorName || "").toLowerCase();
        const aName = advisor.name.toLowerCase();
        return b.consultantId === advisor.id || bName === aName;
      }).length;
      setDeleteConfirmModal({ advisor, bookingCount, hasBookings: bookingCount > 0, checking: false });
    } catch {
      setDeleteConfirmModal({ advisor, bookingCount: 0, hasBookings: false, checking: false });
    }
  };

  const handleConfirmDeleteAdvisor = async (id: number) => {
    setDeletingId(id);
    setDeleteConfirmModal(null);
    try { await deleteAdvisor(id); fetchDashboardData(); }
    catch { alert("Failed to delete consultant. Please try again."); }
    finally { setDeletingId(null); }
  };

  const handleSupportAssign = (ticketId: number, agentName: string) => {
    setAllTickets(prev => prev.map(t => t.id === ticketId ? { ...t, agentName, status: "OPEN" as TicketStatus } : t));
    addNotification({ type: "success", title: `Ticket #${ticketId} Assigned`, message: `Assigned to ${agentName}.`, ticketId });
  };

  // Dashboard section search items (fixed list shown when user types)
  const DASHBOARD_SEARCH_ITEMS = [
    { id: "bookings-activity", label: "Booking Activity", sub: "14-day sessions & revenue chart", icon: "chart" },
    { id: "recent-bookings", label: "Recent Bookings", sub: `${totalBookingsCount || allBookings.length} total bookings`, icon: "booking" },
    { id: "consultant-performance", label: "Consultant Performance", sub: "Bookings & revenue per consultant", icon: "consultant" },
    { id: "ticket-summary", label: "Ticket Summary", sub: "Ticket analytics & category breakdown", icon: "ticket" },
    { id: "tickets-alert", label: "Tickets", sub: `${ticketCount} open ticket${ticketCount !== 1 ? "s" : ""} requiring attention`, icon: "ticket" },
    { id: "top-consultants", label: "Top Consultants", sub: `${advisors.length} registered consultants`, icon: "consultant" },
  ];

  // Dynamic search handler
  React.useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); setShowSearchDropdown(false); return; }
    const q = searchQuery.toLowerCase();
    const results = DASHBOARD_SEARCH_ITEMS.filter(item =>
      item.label.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q)
    );
    setSearchResults(results);
    setShowSearchDropdown(results.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, totalBookingsCount, allBookings.length, ticketCount, advisors.length]);

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
    { id: "time-ranges", label: "Time Ranges", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
    { id: "offers", label: "Offers", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><polyline points="20 12 20 22 4 22 4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><rect x="2" y="7" width="20" height="5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><line x1="12" y1="22" x2="12" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
    { id: "offer-approval", label: "Offer Approvals", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> },
    { id: "questions", label: "Questions", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> },
    { id: "terms-conditions", label: "Terms & Conditions", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><polyline points="10 9 9 9 8 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg> },
    { id: "commission", label: "Commission", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg> },
    {
      id: "subscription-plans" as AdminSectionType,
      label: "Subscription Plans",
      icon: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="6" y1="15" x2="10" y2="15" />
          <line x1="14" y1="15" x2="18" y2="15" />
        </svg>
      ),
    },
    { id: "contact-submissions", label: "Contact Messages", badge: contactUnreadCount > 0 ? contactUnreadCount : undefined, icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg> },
    { id: "settings", label: "Settings", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2" /></svg> },
  ];

  const stats = [
    { label: "TOTAL BOOKINGS", value: loading ? "…" : String(totalBookingsCount > 0 ? totalBookingsCount : allBookings.length), change: `${totalBookingsCount > 0 ? totalBookingsCount : allBookings.length} total`, positive: true, color: "#2563EB", bg: "#EFF6FF" },
    { label: "ACTIVE CONSULTANTS", value: loading ? "…" : String(advisors.length), change: `${advisors.length > 0 ? "+" + advisors.length : "0"} registered`, positive: true, color: "#7C3AED", bg: "#F5F3FF" },
    { label: "TOTAL REVENUE", value: loading ? "…" : `₹${totalRevenue.toLocaleString("en-IN")}`, change: "from completed bookings", positive: true, color: "#059669", bg: "#F0FDF4" },
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
          <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", flex: 1, minWidth: 0 }} onClick={() => navigate("/")}>
            <img src={logoImg} alt="Meet The Masters"
              style={{ height: 36, width: 36, objectFit: "contain", flexShrink: 0, borderRadius: 8 }} />
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, minWidth: 0 }}>
              <span className="adm-logo-text" style={{ fontSize: 11, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap", letterSpacing: "0.04em", color: "#fff" }}>MEET THE MASTERS</span>
              <span className="adm-badge" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: "#2563EB", color: "#fff", letterSpacing: "0.08em", alignSelf: "flex-start", lineHeight: 1.4 }}>ADMIN</span>
            </div>
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
          <button onClick={handleLogout} className="adm-sidebar-action-btn">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Sign Out
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
          <div ref={searchRef} className="adm-search-wrapper" style={{
            flex: 1, maxWidth: 480, position: "relative",
            visibility: activeSection === "dashboard" ? "visible" : "hidden",
            pointerEvents: activeSection === "dashboard" ? "auto" : "none"
          }}>
            {/* Search icon */}
            <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", zIndex: 1, pointerEvents: "none" }} width="16" height="16" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" stroke="#6366F1" strokeWidth="2" />
              <path d="m21 21-4.35-4.35" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              placeholder="Search dashboard sections…"
              style={{
                width: "100%", boxSizing: "border-box" as const,
                fontSize: 13, padding: "10px 40px 10px 42px",
                border: "1.5px solid #E0E7FF",
                borderRadius: 12,
                background: "linear-gradient(135deg,#F8F9FF,#F0F4FF)",
                color: "#1E1B4B",
                outline: "none",
                fontFamily: "inherit",
                boxShadow: "0 1px 4px rgba(99,102,241,0.08)",
                transition: "border-color 0.2s, box-shadow 0.2s",
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = "#6366F1";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.12)";
                if (searchResults.length > 0) setShowSearchDropdown(true);
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = "#E0E7FF";
                e.currentTarget.style.boxShadow = "0 1px 4px rgba(99,102,241,0.08)";
                setTimeout(() => setShowSearchDropdown(false), 180);
              }}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {/* Clear button */}
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setShowSearchDropdown(false); }}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "#E0E7FF", border: "none", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6366F1", fontSize: 12, fontWeight: 700, lineHeight: 1, padding: 0 }}>
                ×
              </button>
            )}
            {/* Dropdown */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, background: "#fff", border: "1.5px solid #E0E7FF", borderRadius: 14, boxShadow: "0 8px 32px rgba(99,102,241,0.14)", zIndex: 9999, overflow: "hidden" }}>
                <div style={{ padding: "8px 14px 6px", borderBottom: "1px solid #F0F4FF", fontSize: 10, fontWeight: 700, color: "#6366F1", textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Dashboard Sections</div>
                {searchResults.map((r, i) => (
                  <div key={r.id}
                    onMouseDown={() => {
                      setSearchQuery("");
                      setShowSearchDropdown(false);
                      // Scroll to matching section on dashboard
                      setTimeout(() => {
                        const sectionId = `dash-section-${r.id}`;
                        const el = document.getElementById(sectionId);
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 50);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", cursor: "pointer", borderBottom: i < searchResults.length - 1 ? "1px solid #F8F9FF" : "none" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#F5F3FF")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, background: r.icon === "ticket" ? "#FEF3C7" : r.icon === "consultant" ? "#EFF6FF" : "#F0F4FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {r.icon === "chart" && <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#6366F1" strokeWidth="2"><path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 4-6" strokeLinecap="round" /></svg>}
                      {r.icon === "booking" && <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#059669" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg>}
                      {r.icon === "consultant" && <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#2563EB" strokeWidth="2"><circle cx="9" cy="7" r="4" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" strokeLinecap="round" /></svg>}
                      {r.icon === "ticket" && <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#D97706" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" /></svg>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1E1B4B", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{r.sub}</div>
                    </div>
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#C7D2FE" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                  </div>
                ))}
              </div>
            )}
          </div>
          <NotificationBell onTicketClick={() => setActiveSection("tickets")} />
        </div>

        {/* ── All page content padded away from sidebar ── */}
        <div style={{ padding: "28px 32px", flex: 1, minWidth: 0, boxSizing: "border-box", overflowY: "auto" }}>

          {backendStatus === "offline" && (
            <div className="adm-alert-warning" style={{ display: "flex", alignItems: "center", gap: 8 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg> Backend offline. Showing zero data. Please start the server.</div>
          )}
          {backendStatus === "error" && (
            <div className="adm-alert-warning" style={{ background: "#FEF2F2", borderColor: "#FECACA", color: "#B91C1C" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg> 403 Forbidden — check the browser console for token debug info.</span>
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

              {/* ════ CHARTS ROW ════ */}
              <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 0 }}>

                {/* Chart 1: Weekly Bookings + Revenue — full width */}
                <div id="dash-section-bookings-activity" className="adm-card" style={{ padding: "18px 20px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div>
                      <h3 className="adm-card-title" style={{ margin: 0, fontSize: 14 }}>Booking Activity — 14 Days</h3>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Sessions · Revenue (₹K)</div>
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#64748B" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: "#2563EB", display: "inline-block" }} />
                        Sessions
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: "#10B981", display: "inline-block" }} />
                        Revenue (₹K)
                      </span>
                    </div>
                  </div>
                  <div style={{ width: "100%", height: 240 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={bookingChartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }} barCategoryGap="35%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                        <XAxis dataKey="day" stroke="#94A3B8" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis stroke="#94A3B8" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                          cursor={{ fill: "rgba(37,99,235,0.04)" }}
                          formatter={(value: any, name: any) => [
                            name === "revenue" ? `₹${(value * 1000).toLocaleString()}` : value,
                            name === "revenue" ? "Revenue" : "Sessions"
                          ]}
                        />
                        <Legend
                          verticalAlign="bottom"
                          height={28}
                          formatter={(value) => value === "revenue" ? "Revenue (₹K)" : "Sessions"}
                          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                        />
                        <Bar dataKey="bookings" fill="#2563EB" radius={[5, 5, 0, 0]} maxBarSize={32} name="bookings" />
                        <Bar dataKey="revenue" fill="#10B981" radius={[5, 5, 0, 0]} maxBarSize={32} name="revenue" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Chart 2: Consultant Performance — full width, vertical bars */}
                <div id="dash-section-consultant-performance" className="adm-card" style={{ padding: "18px 20px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div>
                      <h3 className="adm-card-title" style={{ margin: 0, fontSize: 14 }}>Consultant Performance</h3>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>Bookings · Revenue (₹K) per consultant</div>
                    </div>
                    <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#64748B" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: "#7C3AED", display: "inline-block" }} />
                        Bookings
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: "#F59E0B", display: "inline-block" }} />
                        Revenue (₹K)
                      </span>
                    </div>
                  </div>
                  <div style={{ width: "100%", height: 260 }}>
                    {consultantChartData.length === 0 ? (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#94A3B8", fontSize: 12, flexDirection: "column", gap: 8 }}>
                        <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round">
                          <circle cx="9" cy="7" r="4" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
                          <path d="M16 11l2 2 4-4" />
                        </svg>
                        <span>No booking data yet</span>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={consultantChartData}
                          margin={{ top: 4, right: 16, left: -20, bottom: 0 }}
                          barCategoryGap="35%"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis
                            dataKey="name"
                            stroke="#94A3B8"
                            tick={{ fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            stroke="#94A3B8"
                            tick={{ fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{ borderRadius: 10, border: "1px solid #E2E8F0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", fontSize: 12 }}
                            cursor={{ fill: "rgba(124,58,237,0.04)" }}
                            formatter={(value: any, name: any) => [
                              name === "revenue" ? `₹${(value * 1000).toLocaleString()}` : value,
                              name === "revenue" ? "Revenue" : "Bookings"
                            ]}
                          />
                          <Legend
                            verticalAlign="bottom"
                            height={28}
                            formatter={(value) => value === "revenue" ? "Revenue (₹K)" : "Bookings"}
                            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                          />
                          <Bar dataKey="bookings" fill="#7C3AED" radius={[5, 5, 0, 0]} maxBarSize={40} name="bookings" />
                          <Bar dataKey="revenue" fill="#F59E0B" radius={[5, 5, 0, 0]} maxBarSize={40} name="revenue" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

              </div>

              {/* Top Consultants standalone card */}
              <div style={{ marginTop: 20 }}>
                <div className="adm-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <h3 className="adm-card-title" style={{ margin: 0 }}>Top Consultants</h3>
                    <button onClick={() => setActiveSection("advisors")} style={{ background: "none", border: "none", color: "#2563EB", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>View all →</button>
                  </div>
                  {advisors.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "#94A3B8", fontSize: 13 }}>No consultants yet</div>
                  ) : advisors.slice(0, 4).map((a, idx) => {
                    // Compute bookings count per consultant
                    const consultantBookings = allBookings.filter((b: any) => b.advisor === a.name || b.advisorName === a.name).length;
                    const completedBookings = allBookings.filter((b: any) => (b.advisor === a.name || b.advisorName === a.name) && b.status === "COMPLETED").length;
                    return (
                      <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: idx < Math.min(advisors.length, 4) - 1 ? "1px solid #F1F5F9" : "none" }}>
                        <div style={{ width: 38, height: 38, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#1E3A5F,#2563EB)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <img src={a.avatar} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                          <div style={{ fontSize: 11, color: "#64748B" }}>{a.role}</div>
                          <div style={{ display: "flex", gap: 10, marginTop: 3, fontSize: 10, color: "#94A3B8" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                              <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                              {consultantBookings} bookings
                            </span>
                            {completedBookings > 0 && <span style={{ color: "#16A34A", display: "flex", alignItems: "center", gap: 3 }}>
                              <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                              {completedBookings} completed
                            </span>}
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: "#F59E0B" }}>★ {a.rating.toFixed(1)}</div>
                          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 1 }}>₹{a.fee.toLocaleString()}/session</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {ticketCount > 0 && (
                <div id="dash-section-tickets-alert" className={`adm-card `}
                  style={{ background: "linear-gradient(135deg,#FEF2F2,#FFF7F7)", border: "1px solid #FECACA", cursor: "pointer" }}
                  onClick={() => setActiveSection("tickets")}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><line x1="9" y1="12" x2="15" y2="12" /></svg>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#B91C1C" }}>{ticketCount} open ticket{ticketCount !== 1 ? "s" : ""} need attention</div>
                      <div style={{ fontSize: 12, color: "#EF4444", marginTop: 2 }}>Click to view and manage all support tickets →</div>
                    </div>
                  </div>
                </div>
              )}

              <div id="dash-section-ticket-summary" className={`adm-card `} style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "16px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h3 className="adm-card-title" style={{ margin: 0 }}>Ticket Analytics</h3>
                  <button onClick={() => setActiveSection("support-config")} style={{ background: "none", border: "none", color: "#2563EB", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Full Reports →</button>
                </div>
                <div style={{ padding: "8px 16px 16px" }}>
                  <TicketSummaryChart tickets={allTickets} consultantNameMap={consultantNameMap} />
                </div>
              </div>

              <div id="dash-section-recent-bookings" className={`adm-card `}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h3 className="adm-card-title" style={{ margin: 0 }}>Recent Bookings</h3>
                  <span style={{ background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", borderRadius: 20, fontSize: 12, fontWeight: 700, padding: "3px 12px" }}>
                    {loading ? "Loading…" : `${totalBookingsCount || allBookings.length} total`}
                  </span>
                </div>
                <div className="adm-table-responsive">
                  <table className="adm-table">
                    <thead>
                      <tr className="adm-table-head">
                        <td className="adm-th">USER</td><td className="adm-th">CONSULTANT</td>
                        <td className="adm-th">TIME</td><td className="adm-th">STATUS</td>
                        <td className="adm-th">AMOUNT</td>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={5} style={{ padding: 32, textAlign: "center" }}>
                          <img src={logoImg} alt="" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
                        </td></tr>
                      ) : dashBookings.length > 0 ? dashBookings.map((b, i) => (
                        <tr key={i} className="adm-table-row">
                          <td className="adm-td-user">{b.user}</td>
                          <td className="adm-td-advisor">{b.advisor}</td>
                          <td className="adm-td-time">{b.time}</td>
                          <td><StatusBadge status={b.status} /></td>
                          <td className="adm-td-amount">₹{b.amount.toLocaleString()}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: "#94A3B8" }}>No bookings found.</td></tr>
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

          {/* ════ DELETE CONSULTANT MODAL ════ */}
          {deleteConfirmModal && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 9999,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)",
            }}>
              <div style={{
                background: "#fff", borderRadius: 20, width: "min(480px,95vw)",
                boxShadow: "0 24px 80px rgba(0,0,0,0.22)", overflow: "hidden",
                animation: "fadeInUp 0.2s ease",
              }}>
                {/* Modal Header */}
                <div style={{
                  background: deleteConfirmModal.hasBookings
                    ? "linear-gradient(135deg,#7F1D1D,#DC2626)"
                    : "linear-gradient(135deg,#1E3A5F,#2563EB)",
                  padding: "20px 24px",
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                    background: "rgba(255,255,255,0.15)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                  }}>
                    <img
                      src={deleteConfirmModal.advisor.avatar}
                      alt={deleteConfirmModal.advisor.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = "none";
                        (e.target as HTMLImageElement).parentElement!.innerHTML =
                          `<span style="font-size:18px;font-weight:800;color:#fff">${deleteConfirmModal.advisor.name.charAt(0)}</span>`;
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>
                      Delete Consultant
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
                      {deleteConfirmModal.advisor.name}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 2 }}>
                      {deleteConfirmModal.advisor.role}
                    </div>
                  </div>
                  <button
                    onClick={() => setDeleteConfirmModal(null)}
                    style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    ×
                  </button>
                </div>

                {/* Modal Body */}
                <div style={{ padding: "24px 24px 20px" }}>
                  {deleteConfirmModal.checking ? (
                    /* Checking bookings state */
                    <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
                      <img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
                    </div>
                  ) : deleteConfirmModal.hasBookings ? (
                    /* HAS BOOKINGS — Cannot delete */
                    <>
                      <div style={{
                        background: "#FEF2F2", border: "1px solid #FECACA",
                        borderRadius: 12, padding: "14px 16px", marginBottom: 20,
                        display: "flex", gap: 12, alignItems: "flex-start",
                      }}>
                        <div style={{ flexShrink: 0, marginTop: 2 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" /></svg></div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#B91C1C", marginBottom: 5 }}>
                            Cannot Delete — Active Bookings Exist
                          </div>
                          <div style={{ fontSize: 13, color: "#7F1D1D", lineHeight: 1.6 }}>
                            <strong>{deleteConfirmModal.advisor.name}</strong> has{" "}
                            <span style={{
                              display: "inline-block", background: "#DC2626", color: "#fff",
                              borderRadius: 20, padding: "1px 9px", fontSize: 12, fontWeight: 800,
                            }}>
                              {deleteConfirmModal.bookingCount} booking{deleteConfirmModal.bookingCount !== 1 ? "s" : ""}
                            </span>{" "}
                            associated with their account. Deleting a consultant with active bookings may affect those clients.
                          </div>
                        </div>
                      </div>

                      <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#92400E", lineHeight: 1.6 }}>
                        <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 5 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><line x1="9" y1="18" x2="15" y2="18" /><line x1="10" y1="22" x2="14" y2="22" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg><strong>Recommended:</strong></span> Reassign or complete all bookings for this consultant before deleting their account. You can view their bookings in the Bookings section.
                      </div>

                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={() => setDeleteConfirmModal(null)}
                          style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            setDeleteConfirmModal(null);
                            setActiveSection("bookings");
                          }}
                          style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                          View Bookings →
                        </button>
                      </div>
                    </>
                  ) : (
                    /* NO BOOKINGS — Safe to delete */
                    <>
                      <div style={{
                        background: "#FFF7ED", border: "1px solid #FED7AA",
                        borderRadius: 12, padding: "14px 16px", marginBottom: 20,
                        display: "flex", gap: 12, alignItems: "flex-start",
                      }}>
                        <div style={{ flexShrink: 0, marginTop: 2 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg></div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "#9A3412", marginBottom: 5 }}>
                            Confirm Deletion
                          </div>
                          <div style={{ fontSize: 13, color: "#7C2D12", lineHeight: 1.6 }}>
                            Are you sure you want to permanently delete{" "}
                            <strong>{deleteConfirmModal.advisor.name}</strong>?
                            This action <strong>cannot be undone</strong> and will remove all their data from the system.
                          </div>
                        </div>
                      </div>

                      <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#166534" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg> This consultant has <strong>no active bookings</strong> — safe to delete.</span>
                      </div>

                      {/* Consultant details summary */}
                      <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 12, color: "#475569" }}>
                            <span style={{ color: "#94A3B8", fontWeight: 600 }}>Role: </span>{deleteConfirmModal.advisor.role}
                          </div>
                          <div style={{ fontSize: 12, color: "#475569" }}>
                            <span style={{ color: "#94A3B8", fontWeight: 600 }}>Fee: </span>₹{deleteConfirmModal.advisor.fee.toLocaleString()}/session
                          </div>
                          <div style={{ fontSize: 12, color: "#475569" }}>
                            <span style={{ color: "#94A3B8", fontWeight: 600 }}>Rating: </span>
                            {deleteConfirmModal.advisor.rating > 0 ? `★ ${deleteConfirmModal.advisor.rating.toFixed(1)}` : "No rating"}
                          </div>
                          {deleteConfirmModal.advisor.tags.length > 0 && (
                            <div style={{ fontSize: 12, color: "#475569", width: "100%" }}>
                              <span style={{ color: "#94A3B8", fontWeight: 600 }}>Skills: </span>
                              {deleteConfirmModal.advisor.tags.slice(0, 4).join(", ")}
                              {deleteConfirmModal.advisor.tags.length > 4 && ` +${deleteConfirmModal.advisor.tags.length - 4} more`}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={() => setDeleteConfirmModal(null)}
                          style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                          Cancel
                        </button>
                        <button
                          onClick={() => handleConfirmDeleteAdvisor(deleteConfirmModal.advisor.id)}
                          disabled={deletingId === deleteConfirmModal.advisor.id}
                          style={{
                            flex: 1, padding: "11px", borderRadius: 10, border: "none",
                            background: deletingId === deleteConfirmModal.advisor.id ? "#FEE2E2" : "#DC2626",
                            color: deletingId === deleteConfirmModal.advisor.id ? "#B91C1C" : "#fff",
                            fontSize: 13, fontWeight: 700, cursor: deletingId === deleteConfirmModal.advisor.id ? "default" : "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                          }}>
                          {deletingId === deleteConfirmModal.advisor.id ? (
                            <><div style={{ width: 14, height: 14, border: "2px solid #FECACA", borderTopColor: "#DC2626", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Deleting…</>
                          ) : (
                            <><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg> Yes, Delete Permanently</>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <style>{`@keyframes fadeInUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }`}</style>
            </div>
          )}

          {/* ════ CONSULTANTS ════ */}
          {activeSection === "advisors" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #E2E8F0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: "linear-gradient(135deg,#1E3A5F,#2563EB)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(37,99,235,0.3)", flexShrink: 0 }}>
                    <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" /><circle cx="19" cy="11" r="3" /><path d="M22 20c0-2.2-1.3-4-3-4" /></svg>
                  </div>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.4px" }}>
                      Consultants {loading && <span style={{ fontSize: 14, fontWeight: 500, color: "#94A3B8" }}>Loading…</span>}
                    </h2>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: "#64748B" }}>{advisors.length} consultant{advisors.length !== 1 ? "s" : ""} registered</p>
                  </div>
                </div>
                <button className="adm-primary-btn" onClick={() => setShowModal(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", fontSize: 14, borderRadius: 12, fontWeight: 700 }}>
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add Consultant
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 }}>
                {advisors.length > 0 ? advisors.map(a => (
                  <div key={a.id} style={{ background: "#fff", borderRadius: 20, border: "1.5px solid #E2E8F0", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden", transition: "all 0.2s ease", display: "flex", flexDirection: "column" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 30px rgba(37,99,235,0.12)"; (e.currentTarget as HTMLDivElement).style.borderColor = "#BFDBFE"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; (e.currentTarget as HTMLDivElement).style.borderColor = "#E2E8F0"; (e.currentTarget as HTMLDivElement).style.transform = "none"; }}>
                    {/* Card Header */}
                    <div style={{ background: "linear-gradient(135deg, #F8FAFF 0%, #EFF6FF 100%)", padding: "22px 22px 18px", borderBottom: "1px solid #E2E8F0" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                        {/* Avatar — photo fills full box, initial letter shown as background fallback */}
                        <div style={{ width: 68, height: 68, borderRadius: 16, overflow: "hidden", flexShrink: 0, border: "3px solid #fff", boxShadow: "0 4px 12px rgba(37,99,235,0.15)", background: "linear-gradient(135deg,#2563EB,#1E3A5F)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                          <span style={{ color: "#fff", fontSize: 22, fontWeight: 800, position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{a.name.charAt(0)}</span>
                          <img src={a.avatar} alt={a.name}
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }}
                            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                          <div style={{ fontSize: 13, color: "#2563EB", fontWeight: 600, marginBottom: 8 }}>{a.role}</div>
                          {(a.shiftStartTime || a.shiftEndTime) && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748B" }}>
                              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                              Availability: {a.shiftStartTime} – {a.shiftEndTime}
                            </div>
                          )}
                        </div>
                        {/* Fee badge */}
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: "#1D4ED8" }}>₹{a.fee.toLocaleString()}</div>
                          <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>/session</div>
                        </div>
                      </div>
                    </div>
                    {/* Card Body */}
                    <div style={{ padding: "16px 22px", flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                      {/* Tags */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {a.tags.slice(0, 4).map(t => (
                          <span key={t} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE", fontWeight: 600 }}>{t}</span>
                        ))}
                        {a.tags.length > 4 && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "#F1F5F9", color: "#64748B", fontWeight: 600 }}>+{a.tags.length - 4} more</span>}
                      </div>
                      {/* Stats row */}
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, color: "#475569" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                          <span style={{ fontWeight: 700, color: "#0F172A" }}>{a.rating > 0 ? a.rating.toFixed(1) : "New"}</span>
                          <span style={{ color: "#94A3B8" }}>({a.reviews} reviews)</span>
                        </div>
                        {(a as any).exp > 0 && (
                          <div style={{ fontSize: 12, color: "#64748B", display: "flex", alignItems: "center", gap: 4 }}>
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                            {Math.floor((a as any).exp)}+ yrs exp
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Delete */}
                    <div style={{ padding: "12px 22px", borderTop: "1px solid #F1F5F9" }}>
                      <button onClick={() => handleDeleteAdvisor(a)} disabled={deletingId === a.id}
                        style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1.5px solid #FECACA", background: deletingId === a.id ? "#FEF2F2" : "#fff", color: "#EF4444", fontWeight: 700, fontSize: 13, cursor: deletingId === a.id ? "default" : "pointer", fontFamily: "inherit", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                        onMouseEnter={e => { if (deletingId !== a.id) (e.currentTarget as HTMLButtonElement).style.background = "#FEF2F2"; }}
                        onMouseLeave={e => { if (deletingId !== a.id) (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}>
                        {deletingId === a.id ? (
                          <><div style={{ width: 14, height: 14, border: "2px solid #FECACA", borderTopColor: "#EF4444", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} /> Deleting…</>
                        ) : (
                          <><svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg> Delete Consultant</>
                        )}
                      </button>
                    </div>
                  </div>
                )) : (
                  <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#94A3B8", padding: "60px 20px", background: "#F8FAFC", borderRadius: 16, border: "1px dashed #CBD5E1" }}>
                    <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#CBD5E1" strokeWidth="1.2" style={{ marginBottom: 12 }} strokeLinecap="round"><circle cx="9" cy="7" r="4" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" /></svg>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#64748B", marginBottom: 8 }}>No consultants yet</div>
                    <p style={{ margin: 0, fontSize: 13 }}>Click "Add Consultant" to register your first consultant.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ BOOKINGS ════ */}
          {activeSection === "bookings" && (
            <BookingsSectionWrapper allBookings={allBookings} />
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
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: "#EFF6FF", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"><path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 4-6" strokeLinejoin="round" /></svg>
                  </span>
                  Ticket Reports & Analytics
                </h2>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>Daily and weekly breakdowns of tickets by category, consultant, status, and priority.</p>
              </div>
              {allTickets.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", background: "#F8FAFC", borderRadius: 20, color: "#94A3B8" }}>
                  <div style={{ marginBottom: 16, display: "flex", justifyContent: "center" }}>
                    <svg width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="#CBD5E1" strokeWidth="1.2" strokeLinecap="round"><path d="M3 3v18h18" /><path d="M7 16l4-4 4 4 4-6" strokeLinejoin="round" /></svg>
                  </div>
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
              <AddMemberPanel />
            </div>
          )}

          {/* ════ SUPPORT CONFIG ════ */}
          {activeSection === "support-config" && (
            <SupportConfigPanel tickets={allTickets} advisors={advisors} onAssign={handleSupportAssign} />
          )}

          {/* ════ TIME RANGES ════ */}
          {activeSection === "time-ranges" && <AdminMasterTimeSlotsPanel />}

          {/* ════ OFFERS ════ */}
          {activeSection === "offers" && <AdminOffersPanel />}
          {activeSection === "offer-approval" && <OfferApprovalPanel />}
          {activeSection === "questions" && <QuestionsManagementPanel />}
          {activeSection === "commission" && <CommissionConfigPanel />}
          {/* ════ SUBSCRIPTION PLANS ════ */}
          {activeSection === "subscription-plans" && <SubscriptionPlansPanel />}
          {activeSection === "terms-conditions" && <TermsConditionsEditor />}
          {activeSection === "contact-submissions" && <ContactSubmissionsPanel />}

          {/* ════ SETTINGS — FULLY DYNAMIC ════ */}
          {activeSection === "settings" && (
            <SettingsPage adminId={currentAdminId} onLogout={handleLogout} />
          )}
        </div>{/* end content-area */}
      </div>{/* end adm-main */}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes mtmPulse { 0% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(37,99,235,0.20)); opacity: 0.0; } 20% { opacity: 0.6; } 50% { transform: scale(1.10); filter: blur(0px) drop-shadow(0 0 22px rgba(37,99,235,0.65)); opacity: 1.0; } 80% { opacity: 0.6; } 100% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(37,99,235,0.20)); opacity: 0.0; } }`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT — wrapped with NotificationProvider
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminPage() {
  return (
    <NotificationProvider>
      <ForcePasswordChangeModal />
      <AdminPageInner />
    </NotificationProvider>
  );
}
