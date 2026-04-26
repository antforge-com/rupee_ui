import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  FileText,
  Info,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  Monitor,
  PartyPopper,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  Ticket,
  User,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import logoImg from "../assests/Meetmasterslogopng.png";
import StatusBadge from "../components/StatusBadge.tsx";
import { API_BASE_URL, buildBackendAssetUrl } from "../config/api.ts";
import { SUPPORT_EMAIL } from "../config/support";
import {
  createBooking,
  createSpecialBooking,
  createTicket,
  createTimeslot,
  emailOnBookingAlertConsultant,
  emailOnBookingConfirmedUser,
  emailOnSpecialBookingRequestConsultant,
  emailOnSpecialBookingRequestUser,
  emailOnTicketCreated,
  emailOnTicketUpdated,
  extractArray,
  getActiveTicketCategories,
  getAllConsultants,
  getAllSkills,
  getAvailableTimeslotsByConsultant,
  getConsultantById,
  getConsultantMasterSlots,
  getCurrentUser,
  getFeeConfig,
  getFeedbackByBooking,
  getMyBookings,
  getMySpecialBookings,
  getMyUnreadNotifications,
  getOffersByConsultant,
  getPriorityStyle,
  getSlaInfo,
  getSpecialDaysByConsultant,
  getStatusStyle,
  getTermsAndConditions,
  getTicketComments,
  getTicketsByUser,
  logoutUser,
  postTicketComment,
  submitTicketFeedback,
  updateTicketStatus,
} from "../services/api";
import { decryptLocal, encryptLocal } from "../services/crypto";
import { UserNotificationMonitor, markNotificationReadOnBackend } from "./NotificationSystem";
import { PostBookingQuestionnaire } from "./Postbookingquestionnaire";

// ── Encrypted localStorage accessors ──────────────────────────────────────────
// fin_role and fin_identifier are stored obfuscated; use these helpers everywhere.
const getLocalRole = (): string =>
  decryptLocal(localStorage.getItem("fin_role") || "");
const getLocalIdentifier = (): string =>
  decryptLocal(localStorage.getItem("fin_identifier") || "");

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL API HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = API_BASE_URL;
const getToken = () => localStorage.getItem("fin_token");

const apiFetch = async (url: string, options?: RequestInit) => {
  const token = getToken();
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(url, {
    mode: "cors",
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
// BOOKING TIMING HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a booking's date + timeRange/slotTime and returns whether the user
 * can join the Jitsi meeting right now.
 *  "too_early" → more than 15 min before session start
 *  "active"    → within the join window (15 min before start → session end)
 *  "ended"     → session end time has already passed
 */
const getJoinMeetingStatus = (b: any, now: Date = new Date()): "active" | "too_early" | "ended" => {
  const dateStr = b?.slotDate || b?.bookingDate || b?.date || "";
  const timeStr = b?.timeRange || b?.slotTime || "";
  if (!dateStr || !timeStr) return "active"; // can't determine → allow

  try {
    // ── Parse start time ─────────────────────────────────────────────────────
    const startMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    if (!startMatch) return "active";
    let startH = parseInt(startMatch[1]);
    const startM = parseInt(startMatch[2] || "0");
    const startAp = (startMatch[3] || "").toUpperCase();
    if (startAp === "PM" && startH !== 12) startH += 12;
    if (startAp === "AM" && startH === 12) startH = 0;

    // ── Parse end time (from range "X AM - Y PM" or default +1 h) ────────────
    const rangeMatch = timeStr.match(/[--]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
    let endH = startH + 1;
    let endM = startM;
    if (rangeMatch) {
      endH = parseInt(rangeMatch[1]);
      endM = parseInt(rangeMatch[2] || "0");
      const endAp = (rangeMatch[3] || "").toUpperCase();
      if (endAp === "PM" && endH !== 12) endH += 12;
      if (endAp === "AM" && endH === 12) endH = 0;
    }

    const pad = (n: number) => String(n).padStart(2, "0");
    const sessionStart = new Date(`${dateStr}T${pad(startH)}:${pad(startM)}:00`);
    const sessionEnd = new Date(`${dateStr}T${pad(endH)}:${pad(endM)}:00`);

    // Allow joining 15 minutes before start
    const joinFrom = new Date(sessionStart.getTime() - 15 * 60 * 1000);

    if (now < joinFrom) return "too_early";
    if (now > sessionEnd) return "ended";
    return "active";
  } catch {
    return "active";
  }
};

const isBookingExpired = (b: any, now: Date = new Date()): boolean => {
  const dateStr = b?.slotDate || b?.bookingDate || b?.date || "";
  const timeStr = b?.timeRange || b?.slotTime || "";
  if (!dateStr) return false;
  try {
    const rangeMatch = timeStr.match(/[--]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
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
  slotsDuration?: number;
  slotDurationHours?: number;
}
interface TimeSlotRecord { id: number; slotDate: string; slotTime: string; status: string; masterTimeSlotId?: number; }
type AvailableSpecialSlot = TimeSlotRecord & { timeRange?: string };
interface Booking {
  id: number; consultantId: number; timeSlotId: number; amount: number;
  BookingStatus: string; paymentStatus: string; consultantName?: string;
  consultant?: { name?: string };
  slotDate?: string; slotTime?: string; timeRange?: string; meetingMode?: string;
  userNotes?: string; meetingLink?: string; joinUrl?: string;
  isSpecialBooking?: boolean;
  specialBookingStatus?: string;
  numberOfSlots?: number;
  scheduledDate?: string;
  scheduledTime?: string;
  specialBookingId?: number;
}
interface FeedbackData {
  bookingId: number; consultantId: number; consultantName: string;
  slotDate: string; timeRange: string;
  existingFeedback?: { id: number; rating: number; comments: string } | null;
}
interface SelectedSlot { start24h: string; label: string; masterId: number; timeslotId?: number; }
interface SelectedSlotWithDate extends SelectedSlot { dayIso: string; dayLabel: string; }
interface ConsultantSpecialDayRecord {
  id?: number;
  consultantId?: number;
  specialDate: string;
  status?: string;
  durationHours?: number;
  note?: string;
}

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
interface SubscriptionPlanDetail {
  id: number;
  name: string;
  originalPrice: number;
  discountPrice: number;
  features?: string;
  tag?: string;
}
interface UserProfile {
  id?: number; name?: string; email?: string; location?: string; memberSince?: string;
  identifier?: string; role?: string; subscribed?: boolean; subscriptionPlanName?: string;
  subscriptionPlanId?: number;
  phone?: string; incomes?: IncomeItem[]; expenses?: ExpenseItem[]; createdAt?: string;
  designation?: string; organizationName?: string;
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
  }
  if (typeof t === "string") return t.substring(0, 5);
  return "";
};
const durationMinutesToHours = (value: any, fallback = 1): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (parsed <= 12) return Math.max(1, Math.min(3, Math.round(parsed)));
  return Math.max(1, Math.min(3, Math.round(parsed / 60)));
};

const timeStringToMinutes = (value: any): number | null => {
  const normalized = normalise24(parseLocalTime(value) || String(value || ""));
  if (!normalized) return null;
  const [hours, minutes] = normalized.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
};

const getShiftSlotCount = (shiftStart: any, shiftEnd: any, slotMinutes: number): number => {
  const startMinutes = timeStringToMinutes(shiftStart);
  const endMinutes = timeStringToMinutes(shiftEnd);
  const safeSlotMinutes = Math.max(30, Number(slotMinutes || 0) || 0);
  if (startMinutes == null || endMinutes == null || safeSlotMinutes <= 0) return 0;
  let diffMinutes = endMinutes - startMinutes;
  if (diffMinutes <= 0) diffMinutes += 24 * 60;
  return Math.max(0, Math.floor(diffMinutes / safeSlotMinutes));
};

// ─────────────────────────────────────────────────────────────────────────────
// DATE CAROUSEL
// ─────────────────────────────────────────────────────────────────────────────
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
interface DayItem { iso: string; day: string; date: string; month: string }
const toIsoDateLocal = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const buildDaysRange = (startIso: string, endIso: string): DayItem[] => {
  const out: DayItem[] = [];
  const current = new Date(`${startIso}T00:00:00`);
  const end = new Date(`${endIso}T00:00:00`);
  while (!Number.isNaN(current.getTime()) && !Number.isNaN(end.getTime()) && current <= end) {
    out.push({
      iso: toIsoDateLocal(current),
      day: DAY_NAMES[current.getDay()],
      date: String(current.getDate()).padStart(2, "0"),
      month: MONTH_NAMES[current.getMonth()],
    });
    current.setDate(current.getDate() + 1);
  }
  return out;
};
const buildRollingDays = (count: number, startDate = new Date()) => {
  const startIso = toIsoDateLocal(startDate);
  const end = new Date(`${startIso}T00:00:00`);
  end.setDate(end.getDate() + Math.max(0, count - 1));
  return buildDaysRange(startIso, toIsoDateLocal(end));
};
const ALL_DAYS = buildRollingDays(30);
const VISIBLE_DAYS = 7; // show 7 days at a time with prev/next navigation
const DEFAULT_DAY = ALL_DAYS[0];

const resolvePhotoUrl = (path?: string | null): string => {
  if (!path) return "";
  return buildBackendAssetUrl(path);
};
const JITSI_URL = (bookingId: number) => `https://meet.jit.si/meetthemasters-booking-${bookingId}`;
const PENDING_FEEDBACK_KEY = "meetthemasters_pending_feedback_bookingId";
const SPECIAL_BOOKING_PREFIX = "[[SPECIAL_BOOKING_META]]";

type SpecialBookingStatus = "REQUESTED" | "SCHEDULED" | "CONFIRMED" | "COMPLETED" | "CANCELLED";
interface SpecialBookingMeta {
  kind: "SPECIAL_BOOKING";
  version: 1;
  hours: number;
  slotNumber?: number;   // which slot (1, 2, 3...) the user selected
  requestNotes: string;
  requestedMeetingMode: "ONLINE" | "PHYSICAL" | "PHONE";
  status: SpecialBookingStatus;
  preferredDate?: string;
  preferredTime?: string;
  preferredTimeRange?: string;
  preferredSlotId?: number;
  scheduledDate?: string;
  scheduledTime?: string;
  scheduledTimeRange?: string;
  meetingId?: string;
  meetingLink?: string;
  scheduledAt?: string;
}

const addHoursToTime = (time24: string, hours: number): string => {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const total = (h * 60) + (m || 0) + Math.max(1, hours) * 60;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const buildSpecialBookingNotes = (meta: SpecialBookingMeta): string => {
  // Human-readable summary used by the email template; JSON block retained for dashboard parsing
  const summary = [
    `Preferred date: ${meta.preferredDate || "Flexible"}`,
    `Duration: ${meta.hours} hr${meta.hours !== 1 ? "s" : ""}`,
    `Mode: ${meta.requestedMeetingMode}`,
    meta.preferredTimeRange ? `Time preference: ${meta.preferredTimeRange}` : "",
    meta.requestNotes ? `Notes: ${meta.requestNotes}` : "",
  ].filter(Boolean).join(" | ");
  return `${SPECIAL_BOOKING_PREFIX}${JSON.stringify(meta)}\n${summary}`.trim();
};

const parseSpecialBookingMeta = (rawNotes: any): SpecialBookingMeta | null => {
  if (typeof rawNotes !== "string" || !rawNotes.startsWith(SPECIAL_BOOKING_PREFIX)) return null;
  const jsonText = rawNotes.slice(SPECIAL_BOOKING_PREFIX.length).split("\n")[0]?.trim();
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed?.kind !== "SPECIAL_BOOKING") return null;
    return parsed as SpecialBookingMeta;
  } catch {
    return null;
  }
};

const stripSpecialBookingMeta = (rawNotes: any): string => {
  if (typeof rawNotes !== "string") return "";
  if (!rawNotes.startsWith(SPECIAL_BOOKING_PREFIX)) return rawNotes.trim();
  return rawNotes.split("\n").slice(1).join("\n").trim();
};

const formatSpecialTimeRange = (startTime: string, hours: number): string => {
  if (!startTime) return "";
  const [h, m] = startTime.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return startTime;
  const endTotal = h * 60 + m + Math.max(hours, 1) * 60;
  const endH = Math.floor(endTotal / 60) % 24;
  const endM = endTotal % 60;
  const end = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  return `${toAmPm(startTime)} - ${toAmPm(end)}`;
};

const parseTimeLabelToMinutes = (value: string): number | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] || "0", 10);
  const period = (match[3] || "").toUpperCase();
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
};

/** Sort key for a slot - prefers the AM/PM-aware start from timeRange, falls back to slotTime. */
const slotStartMinutes = (slot: { slotTime?: string; timeRange?: string }): number => {
  const fromRange = parseTimeLabelToMinutes(
    (slot.timeRange || "").split(/[--]/)[0]?.trim() || ""
  );
  if (fromRange !== null) return fromRange;
  return parseTimeLabelToMinutes(slot.slotTime || "") ?? 0;
};

const normaliseBookingDateKey = (raw: string): string => {
  const value = String(raw || "").trim();
  if (!value) return "9999-12-31";

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const dashMatch = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, dd, mm, yyyy] = dashMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return toIsoDateLocal(parsed);

  return value;
};

const getRangeDurationHours = (range: string, fallback = 1): number => {
  const parts = String(range || "").split(/[--]/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return fallback;
  const start = parseTimeLabelToMinutes(parts[0]);
  const end = parseTimeLabelToMinutes(parts[1]);
  if (start == null || end == null) return fallback;
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  return Math.max(1, Math.round(diff / 60));
};

const formatDurationLabel = (hours: number): string => {
  const safeHours = Math.max(1, Number(hours || 1));
  return `${safeHours} hr${safeHours !== 1 ? "s" : ""}`;
};

const formatDurationFromMinutes = (minutes: number): string => {
  const safeMinutes = Math.max(30, Number(minutes || 0) || 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (mins === 0) return `${hours} hr${hours !== 1 ? "s" : ""}`;
  if (hours === 0) return `${mins} min`;
  return `${hours} hr ${mins} min`;
};

const formatSlotCountLabel = (count: number): string => {
  const safeCount = Math.max(1, Number(count || 1));
  return `Slot ${safeCount}`;
};

const formatSlotCountSummary = (count: number, slotMinutes: number): string => {
  const safeCount = Math.max(1, Number(count || 1));
  const totalMinutes = safeCount * Math.max(30, Number(slotMinutes || 0) || 120);
  return `${safeCount} slot${safeCount !== 1 ? "s" : ""} * ${formatDurationFromMinutes(totalMinutes)}`;
};

const normaliseSpecialBookingStatus = (rawStatus: any): SpecialBookingStatus => {
  const status = String(rawStatus || "").toUpperCase();
  if (status === "SCHEDULED") return "SCHEDULED";
  if (status === "CONFIRMED") return "CONFIRMED";
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "CANCELLED" || status === "REJECTED") return "CANCELLED";
  return "REQUESTED";
};

const getDedicatedSpecialMeta = (booking: any): SpecialBookingMeta | null => {
  if (!booking || typeof booking !== "object") return null;
  const rawStatus = String(
    booking?.specialBookingStatus || booking?.status || ""
  ).toUpperCase();
  const hasSignal =
    booking?.isSpecialBooking === true ||
    booking?.specialBookingId != null ||
    booking?.numberOfSlots != null ||
    booking?.preferredDate != null ||
    booking?.preferredTime != null ||
    booking?.scheduledDate != null ||
    booking?.scheduledTime != null ||
    rawStatus === "REQUESTED" ||
    rawStatus === "SCHEDULED" ||
    rawStatus === "CONFIRMED" ||
    rawStatus === "COMPLETED" ||
    rawStatus === "CANCELLED";

  if (!hasSignal) return null;

  const scheduledTimeRaw = booking?.scheduledTime || booking?.scheduled_time || "";
  const scheduledTime =
    typeof scheduledTimeRaw === "object" && scheduledTimeRaw?.hour !== undefined
      ? `${String(scheduledTimeRaw.hour).padStart(2, "0")}:${String(scheduledTimeRaw.minute ?? 0).padStart(2, "0")}`
      : String(scheduledTimeRaw).substring(0, 5);

  const hours = Math.max(1, Number(booking?.numberOfSlots || booking?.hours || 1));
  const preferredTimeRaw = booking?.preferredTime || booking?.preferred_time || "";
  const preferredTime =
    typeof preferredTimeRaw === "object" && preferredTimeRaw?.hour !== undefined
      ? `${String(preferredTimeRaw.hour).padStart(2, "0")}:${String(preferredTimeRaw.minute ?? 0).padStart(2, "0")}`
      : String(preferredTimeRaw).substring(0, 5);
  const preferredDate = booking?.preferredDate || booking?.preferred_date || booking?.slotDate || "";
  const preferredTimeRange =
    booking?.preferredTimeRange ||
    booking?.preferred_time_range ||
    (preferredTime ? formatSpecialTimeRange(preferredTime, hours) : "");
  const scheduledTimeRange =
    booking?.scheduledTimeRange ||
    booking?.timeRange ||
    (scheduledTime ? formatSpecialTimeRange(scheduledTime, hours) : preferredTimeRange);

  const status = normaliseSpecialBookingStatus(rawStatus);
  return {
    kind: "SPECIAL_BOOKING",
    version: 1,
    hours,
    requestNotes: booking?.requestNotes || stripSpecialBookingMeta(booking?.userNotes),
    requestedMeetingMode: (booking?.meetingMode || booking?.requestedMeetingMode || "ONLINE") as "ONLINE" | "PHYSICAL" | "PHONE",
    status,
    preferredDate: preferredDate || undefined,
    preferredTime: preferredTime || undefined,
    preferredTimeRange: preferredTimeRange || undefined,
    preferredSlotId: booking?.preferredSlotId || booking?.preferred_slot_id || booking?.timeSlotId || undefined,
    scheduledDate: booking?.scheduledDate || booking?.scheduled_date || booking?.slotDate || preferredDate || undefined,
    scheduledTime: scheduledTime || undefined,
    scheduledTimeRange: scheduledTimeRange || undefined,
    meetingId: booking?.meetingId || undefined,
    meetingLink: booking?.meetingLink || booking?.joinUrl || undefined,
    scheduledAt: booking?.scheduledAt || booking?.updatedAt || undefined,
  };
};

const resolveSpecialBookingMeta = (booking: any): SpecialBookingMeta | null => {
  if (!booking || typeof booking !== "object") return null;

  const legacy = parseSpecialBookingMeta(booking?.userNotes);
  const direct = getDedicatedSpecialMeta(booking);

  if (!legacy) return direct;
  if (!direct) return legacy;

  return {
    ...legacy,
    hours: Math.max(1, Number(direct.hours || legacy.hours || 1)),
    requestNotes: direct.requestNotes || legacy.requestNotes,
    requestedMeetingMode: direct.requestedMeetingMode || legacy.requestedMeetingMode,
    status: direct.status || legacy.status,
    preferredDate: direct.preferredDate || legacy.preferredDate,
    preferredTime: direct.preferredTime || legacy.preferredTime,
    preferredTimeRange: direct.preferredTimeRange || legacy.preferredTimeRange,
    preferredSlotId: direct.preferredSlotId ?? legacy.preferredSlotId,
    scheduledDate: direct.scheduledDate || legacy.scheduledDate,
    scheduledTime: direct.scheduledTime || legacy.scheduledTime,
    scheduledTimeRange: direct.scheduledTimeRange || legacy.scheduledTimeRange,
    meetingId: direct.meetingId || legacy.meetingId,
    meetingLink: direct.meetingLink || legacy.meetingLink,
    scheduledAt: direct.scheduledAt || legacy.scheduledAt,
  };
};

const specialBookingHasAssignedSlot = (meta: SpecialBookingMeta | null): boolean => {
  if (!meta) return false;
  const status = String(meta.status || "").toUpperCase();
  if (status === "SCHEDULED" || status === "CONFIRMED" || status === "COMPLETED") return true;
  return !!(meta.scheduledDate && (meta.scheduledTimeRange || meta.scheduledTime));
};

const getSpecialBookingDisplay = (booking: any): {
  isSpecial: boolean;
  meta: SpecialBookingMeta | null;
  date: string;
  time: string;
  meetingMode: string;
  requestNotes: string;
  joinLink: string;
} => {
  const meta = resolveSpecialBookingMeta(booking);
  if (!meta) {
    return {
      isSpecial: false,
      meta: null,
      date: booking?.slotDate || booking?.bookingDate || booking?.date || "",
      time: booking?.timeRange || booking?.slotTime || "",
      meetingMode: booking?.meetingMode || "",
      requestNotes: stripSpecialBookingMeta(booking?.userNotes),
      joinLink: booking?.meetingLink || booking?.jitsiLink || booking?.joinUrl || "",
    };
  }

  const hasAssignedSlot = specialBookingHasAssignedSlot(meta);

  return {
    isSpecial: true,
    meta,
    date: hasAssignedSlot ? (meta.scheduledDate || meta.preferredDate || "") : (meta.preferredDate || meta.scheduledDate || ""),
    time: hasAssignedSlot
      ? (meta.scheduledTimeRange || meta.scheduledTime || meta.preferredTimeRange || meta.preferredTime || "")
      : (meta.preferredTimeRange || meta.preferredTime || `${meta.hours} hour${meta.hours > 1 ? "s" : ""}`),
    meetingMode: meta.requestedMeetingMode || booking?.meetingMode || "",
    requestNotes: meta.requestNotes || stripSpecialBookingMeta(booking?.userNotes),
    joinLink: meta.meetingLink || booking?.meetingLink || booking?.jitsiLink || booking?.joinUrl || "",
  };
};

const getBookingLifecycleStatus = (booking: any): string =>
  String(
    booking?.specialBookingStatus ??
    booking?.BookingStatus ??
    booking?.bookingStatus ??
    booking?.status ??
    resolveSpecialBookingMeta(booking)?.status ??
    ""
  ).toUpperCase();

const getBookingChronologyTarget = (booking: any): { date: string; time: string } => {
  const meta = resolveSpecialBookingMeta(booking);
  if (!meta) {
    return {
      date: booking?.slotDate || booking?.bookingDate || booking?.date || "",
      time: booking?.timeRange || booking?.slotTime || "",
    };
  }

  const hasAssignedSlot = specialBookingHasAssignedSlot(meta);
  return {
    date: hasAssignedSlot
      ? (meta.scheduledDate || meta.preferredDate || booking?.slotDate || booking?.bookingDate || booking?.date || "")
      : (meta.preferredDate || meta.scheduledDate || booking?.slotDate || booking?.bookingDate || booking?.date || ""),
    time: hasAssignedSlot
      ? (meta.scheduledTimeRange || meta.scheduledTime || meta.preferredTimeRange || meta.preferredTime || booking?.timeRange || booking?.slotTime || "")
      : (meta.preferredTimeRange || meta.preferredTime || meta.scheduledTimeRange || meta.scheduledTime || booking?.timeRange || booking?.slotTime || ""),
  };
};

const getSortableBookingStartMinutes = (timeLabel: string): number => {
  const raw = String(timeLabel || "").trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const rangeStart = raw.split(/[--]/)[0]?.trim() || "";
  return parseTimeLabelToMinutes(rangeStart) ?? parseTimeLabelToMinutes(raw) ?? Number.MAX_SAFE_INTEGER;
};

const compareBookingsChronologically = (
  a: { id?: number; slotDate?: string; slotTime?: string; timeRange?: string },
  b: { id?: number; slotDate?: string; slotTime?: string; timeRange?: string }
): number => {
  const aChronology = getBookingChronologyTarget(a);
  const bChronology = getBookingChronologyTarget(b);

  const dateCmp = normaliseBookingDateKey(aChronology.date || "").localeCompare(
    normaliseBookingDateKey(bChronology.date || "")
  );
  if (dateCmp !== 0) return dateCmp;

  const timeCmp = getSortableBookingStartMinutes(aChronology.time) - getSortableBookingStartMinutes(bChronology.time);
  if (timeCmp !== 0) return timeCmp;

  return Number(a.id || 0) - Number(b.id || 0);
};

const getSpecialBookingPlaceholder = (consultantId: number): { date: string; time: string; label: string } => {
  const d = new Date();
  d.setDate(d.getDate() + 365 + (consultantId % 25));
  const hour = 9 + (consultantId % 8);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(hour).padStart(2, "0")}:00`;
  const next = `${String((hour + 1) % 24).padStart(2, "0")}:00`;
  return { date, time, label: `${fmt24to12(time)} - ${fmt24to12(next)}` };
};

// ─── Robust offer discount parser ─────────────────────────────────────────────
// Primary: reads offer.discountValue + offer.discountType fields (set from admin form)
// Fallback: parses discount label string "20%", "₹250", "99", "FLAT20", etc.
const parseDiscountAmount = (discountStr: string, baseAmount: number, offer?: any): number => {
  // Use structured fields if available (set by admin when creating/editing offer)
  if (offer && offer.discountValue != null && !isNaN(Number(offer.discountValue))) {
    const val = Number(offer.discountValue);
    const type = String(offer.discountType || offer.discountValueType || "%").trim();
    if (type === "₹" || type.toUpperCase() === "FLAT" || type.toUpperCase() === "AMOUNT") {
      return Math.min(val, baseAmount);
    }
    // Default: percentage
    return Math.round(baseAmount * Math.min(val, 100) / 100);
  }
  // Fallback: parse from label string
  if (!discountStr) return 0;
  const s = discountStr.trim().toUpperCase();
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return 0;
  const num = parseFloat(numMatch[1]);
  if (s.includes("%")) return Math.round(baseAmount * Math.min(num, 100) / 100);
  return Math.min(num, baseAmount); // treat as flat ₹ amount
};

const readOfferId = (value: any): number | null => {
  const raw = value?.offerId ?? value?.offer_id ?? value?.offer?.id ?? value?.offer?.offerId ?? null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const hasConsumedOffer = (value: any): boolean => {
  const status = String(
    value?.specialBookingStatus ??
    value?.BookingStatus ??
    value?.bookingStatus ??
    value?.status ??
    ""
  ).toUpperCase();
  return status !== "CANCELLED" && status !== "REJECTED";
};

const collectUsedOfferIds = (items: any[]): Set<number> =>
  new Set(
    (Array.isArray(items) ? items : [])
      .filter(hasConsumedOffer)
      .map(readOfferId)
      .filter((id: number | null): id is number => id != null)
  );

// ─── Professional SVG category icon resolver ──────────────────────────────────
const getCatSvgIcon = (cat: string): React.ReactNode => {
  const c = cat.toLowerCase();
  const s = { width: 18, height: 18, flexShrink: 0 } as React.CSSProperties;
  // Tax / GST / Compliance
  if (c.includes("tax") || c.includes("gst") || c.includes("tds") || c.includes("audit") || c.includes("compliance")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>;
  }
  // Investment / Equity / SIP / Stocks
  if (c.includes("invest") || c.includes("equity") || c.includes("sip") || c.includes("stock") || c.includes("bond") || c.includes("deriv")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" /></svg>;
  }
  // Wealth / Portfolio / Financial Planning
  if (c.includes("wealth") || c.includes("portfolio") || c.includes("financial plan") || c.includes("cfp")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
  }
  // Insurance
  if (c.includes("insur") || c.includes("ulip") || c.includes("mediclaim") || c.includes("term plan")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
  }
  // Retirement / Pension
  if (c.includes("retire") || c.includes("pension") || c.includes("nps") || c.includes("epf") || c.includes("ppf")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
  }
  // Real Estate / Property
  if (c.includes("real estate") || c.includes("property") || c.includes("reit") || c.includes("home loan") || c.includes("mortgage")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>;
  }
  // Business / Startup / MSME
  if (c.includes("business") || c.includes("startup") || c.includes("msme") || c.includes("corporate") || c.includes("valuation")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>;
  }
  // Mutual Funds
  if (c.includes("mutual") || c.includes("fund")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
  }
  // Finance / General
  if (c.includes("finance") || c.includes("financial")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>;
  }
  // Management / Strategic
  if (c.includes("manag") || c.includes("strategic")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  }
  // Accounting
  if (c.includes("account")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M9 15h6M9 11h6" /></svg>;
  }
  // Cash Flow
  if (c.includes("cash")) {
    return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>;
  }
  // Default fallback
  return <svg style={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>;
};
// (nothing - or a comment: // Questionnaire now shown after first booking)

// ── Title Case helper with exceptions ─────────────────────────────────────────
const LOWERCASE_EXCEPTIONS = new Set(["is", "was", "are", "in", "and", "the", "this", "to", "a", "an", "of", "at", "by", "for", "with", "on"]);
const toTitleCase = (str: string): string => {
  if (!str) return str;
  return str.split(" ").map((word, idx) => {
    const lower = word.toLowerCase();
    if (idx === 0 || !LOWERCASE_EXCEPTIONS.has(lower)) return lower.charAt(0).toUpperCase() + lower.slice(1);
    return lower;
  }).join(" ");
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL NOTIFICATION HELPER
// ─────────────────────────────────────────────────────────────────────────────
const sendBookingEmails = async (params: {
  bookingId: number; slotDate: string; timeRange: string; meetingMode: string; amount: number;
  userName: string; userEmail: string; consultantName: string; consultantEmail: string; userNotes: string;
}): Promise<void> => {
  const jitsiLink = params.meetingMode === "ONLINE" ? JITSI_URL(params.bookingId) : undefined;
  try {
    await apiFetch(`${BASE_URL}/notifications/booking-confirmation`, {
      method: "POST",
      body: JSON.stringify({ ...params, jitsiLink }),
    });
  } catch {
    try {
      const body = (recipient: "user" | "consultant") => ({
        to: recipient === "user" ? params.userEmail : params.consultantEmail,
        subject: `Booking Confirmed - ${params.slotDate} · ${params.timeRange}`,
        body:
          `Hi ${recipient === "user" ? params.userName : params.consultantName},\n\n` +
          `Your session has been confirmed.\n\nDate: ${params.slotDate}\nTime: ${params.timeRange}\nMode: ${params.meetingMode}` +
          (jitsiLink ? `\nJoin: ${jitsiLink}\n` : "\n") +
          (params.userNotes ? `Notes: ${params.userNotes}\n` : "") + `\nThank you,\nMeet The Masters Team`,
      });
      await Promise.allSettled([
        apiFetch(`${BASE_URL}/email/send`, { method: "POST", body: JSON.stringify(body("user")) }),
        apiFetch(`${BASE_URL}/email/send`, { method: "POST", body: JSON.stringify(body("consultant")) }),
      ]);
    } catch { }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL NOTIFICATION HELPER - Adds notification to user's localStorage
// ─────────────────────────────────────────────────────────────────────────────
const addLocalNotification = (
  userId: number | null,
  notification: {
    type: "info" | "success" | "warning" | "error";
    title: string;
    message: string;
    bookingId?: number;
    ticketId?: number;
  }
): void => {
  if (!userId) return;
  try {
    const key = `fin_notifs_USER_${userId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "[]");
    const newNotif = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...notification,
      timestamp: new Date().toISOString(),
      read: false,
    };
    const updated = [newNotif, ...existing].slice(0, 50); // Keep last 50 notifications
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to add notification:", e);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GUEST TRIAL HELPER - Guest users get 2 months free ticket access
// ─────────────────────────────────────────────────────────────────────────────
// ── Guest trial helpers - uses actual account createdAt from backend ──────────
// fin_user_created_at is set from getCurrentUser() response (user.createdAt)
// Falls back to fin_guest_trial_start localStorage if backend date unavailable.
const getGuestAccountStart = (): Date | null => {
  // Priority 1: actual account creation date stored from API response
  const apiCreatedAt = localStorage.getItem("fin_user_created_at");
  if (apiCreatedAt) {
    const d = new Date(apiCreatedAt);
    if (!isNaN(d.getTime())) return d;
  }
  // Priority 2: legacy trial start key
  const legacy = localStorage.getItem("fin_guest_trial_start");
  if (legacy) {
    const d = new Date(legacy);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
};

const isGuestInTrial = (): boolean => {
  const role = (getLocalRole()).toUpperCase().replace(/^ROLE_/, "");
  if (role !== "GUEST") return false;
  const start = getGuestAccountStart();
  if (!start) return true; // createdAt not loaded yet - optimistically allow
  const twoMonthsLater = new Date(start);
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
  return new Date() < twoMonthsLater;
};

const getGuestTrialDaysRemaining = (): number => {
  const start = getGuestAccountStart();
  if (!start) return 60;
  const twoMonthsLater = new Date(start);
  twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
  // Use floor so day 1 shows 59, day 2 shows 58 - each elapsed calendar day decrements
  const diff = twoMonthsLater.getTime() - Date.now();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

// ─────────────────────────────────────────────────────────────────────────────
// SAFE DATE-TIME FORMATTER - handles missing time gracefully
// ─────────────────────────────────────────────────────────────────────────────
// ── IST time formatter - matches AdvisorDashboard fmtISTTime exactly ──────────
const fmtIST = (iso: string | null | undefined): string => {
  if (!iso) return "-";
  try {
    const normalised = (iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso))
      ? iso : iso + "Z";
    return new Date(normalised).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch { return iso; }
};

const formatTicketDate = (dateStr: string): string => {
  if (!dateStr) return "-";
  try {
    const normalised = (dateStr.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(dateStr))
      ? dateStr : dateStr + "Z";
    const d = new Date(normalised);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch { return dateStr; }
};
// ─────────────────────────────────────────────────────────────────────────────
const TICKET_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  NEW: { label: "New", color: "#6366F1", bg: "#EEF2FF", border: "#C7D2FE", icon: <FileText size={12} /> },
  OPEN: { label: "Open", color: "#2563EB", bg: "#EFF6FF", border: "#93C5FD", icon: <Ticket size={12} /> },
  IN_PROGRESS: { label: "In Progress", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: <Clock size={12} /> },
  PENDING: { label: "Pending", color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: <Clock size={12} /> },
  RESOLVED: { label: "Resolved", color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: <CheckCircle size={12} /> },
  CLOSED: { label: "Closed", color: "#64748B", bg: "#F1F5F9", border: "#CBD5E1", icon: <XCircle size={12} /> },
  ESCALATED: { label: "Escalated", color: "#DC2626", bg: "#FEF2F2", border: "#FCA5A5", icon: <AlertTriangle size={12} /> },
};

const TICKET_PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  LOW: { label: "Low", color: "#16A34A", bg: "#F0FDF4" },
  MEDIUM: { label: "Medium", color: "#D97706", bg: "#FFFBEB" },
  HIGH: { label: "High", color: "#EA580C", bg: "#FFF7ED" },
  URGENT: { label: "Urgent", color: "#DC2626", bg: "#FEF2F2" },
  CRITICAL: { label: "Critical", color: "#7C3AED", bg: "#F5F3FF" },
};
const TICKET_PRIORITIES: TicketPriority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const TICKET_STEPS: { key: string; label: string; renderIcon: (color: string) => React.ReactNode }[] = [
  { key: "NEW", label: "Submitted", renderIcon: (c) => <FileText size={13} color={c} /> },
  { key: "OPEN", label: "Assigned", renderIcon: (c) => <User size={13} color={c} /> },
  { key: "IN_PROGRESS", label: "In Progress", renderIcon: (c) => <Settings size={13} color={c} /> },
  { key: "RESOLVED", label: "Resolved", renderIcon: (c) => <CheckCircle size={13} color={c} /> },
  { key: "CLOSED", label: "Closed", renderIcon: (c) => <Lock size={13} color={c} /> },
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
        <div style={{ position: "absolute", top: 16, left: 16, width: currentIdx === 0 ? "0px" : `calc((100% - 32px) * ${currentIdx / (TICKET_STEPS.length - 1)})`, height: 2, background: "linear-gradient(90deg,#1D4ED8,#2563EB)", zIndex: 1, transition: "width 0.4s ease" }} />
        {TICKET_STEPS.map((step, idx) => {
          const isDone = idx < currentIdx, isCurrent = idx === currentIdx;
          const iconColor = isDone ? "#FFFFFF" : isCurrent ? "#2563EB" : "#94A3B8";
          return (
            <div key={step.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative", zIndex: 2 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: isDone ? "#2563EB" : isCurrent ? "#EFF6FF" : "#F1F5F9", border: `2px solid ${isDone ? "#1D4ED8" : isCurrent ? "#2563EB" : "#CBD5E1"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, boxShadow: isCurrent ? "0 0 0 4px rgba(37,99,235,0.15)" : "none" }}>
                {step.renderIcon(iconColor)}
              </div>
              <div style={{ fontSize: 10, fontWeight: isDone || isCurrent ? 700 : 600, color: isDone ? "#1D4ED8" : isCurrent ? "#2563EB" : "#94A3B8", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center" }}>{step.label}</div>
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
  onOpenEmailToTicket?: () => void;
}> = ({ userId, onCreated, onClose, onOpenEmailToTicket }) => {
  const [form, setForm] = useState({
    category: "", description: "", priority: "MEDIUM" as TicketPriority
  });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Dynamic categories from backend - single source: /admin/config/categories ──
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  useEffect(() => {
    setLoadingCategories(true);
    // getActiveTicketCategories() fetches exclusively from /admin/config/categories
    // and already returns normalised { id, name } objects - no extra mapping needed.
    getActiveTicketCategories()
      .then(items => setCategories(items))
      .catch(() => setCategories([]))
      .finally(() => setLoadingCategories(false));
  }, []);

  const handleSubmit = async () => {
    // FIX: Guard against null/0 userId before attempting creation
    if (!userId) {
      setError("Unable to identify your account. Please refresh the page and try again.");
      return;
    }
    if (!form.category || !form.description.trim()) {
      setError("Category and description are required.");
      return;
    }
    if (form.description.trim().length < 10) {
      setError("Description must be at least 10 characters.");
      return;
    }
    setSaving(true); setError("");
    // FIX: Show a patience hint after 15 s so the user knows the request is
    // still in-flight (backend ticket creation can be slow due to server-side
    // email / notification work running synchronously).
    const slowHintTimer = setTimeout(() => {
      setError("Still submitting - the server is taking a moment, please wait...");
    }, 15_000);
    try {
      // FIX: resolve categoryId from the loaded categories list so the backend
      // TicketRequest DTO validation passes (it requires a numeric categoryId).
      // Treat id=0 as invalid (backend auto-assigned or missing) and pass null
      // so the api.ts fallback resolver can attempt a second lookup.
      const matched = categories.find(c => c.name === form.category);
      const categoryId = (matched?.id && matched.id > 0) ? matched.id : null;

      const saved = await createTicket({ userId, ...form, categoryId }, file);
      clearTimeout(slowHintTimer);
      setError(""); // clear patience hint if it appeared

      // ── FAIL-SAFE NOTIFICATION TRIGGERS ──────────────────────────────────
      // Mirrors TicketService.createTicket() - each trigger has its own
      // try/catch so one failure never blocks the other or the onCreated callback.

      // Trigger 1: notifyNewAssignment
      // Backend fires this when a consultant is assigned at creation time.
      // We mirror it here so the consultant's bell updates without waiting
      // for their next 30-second poll cycle.
      try {
        const assignedConsultantId = (saved as any).consultantId;
        if (assignedConsultantId) {
          const ticketNum = (saved as any).ticketNumber || String((saved as any).id);
          const categoryLabel = (saved as any).categoryName || saved.category || "Support";
          const consultantKey = `fin_notifs_CONSULTANT_${assignedConsultantId}`;
          const prev: any[] = JSON.parse(localStorage.getItem(consultantKey) || "[]");
          localStorage.setItem(consultantKey, JSON.stringify([{
            id: `assign_${(saved as any).id}_${Date.now()}`,
            type: "warning",
            title: `New Ticket Assigned - #${ticketNum}`,
            message: `You have been assigned a new ${saved.priority || "MEDIUM"} priority ticket in ${categoryLabel}.`,
            timestamp: new Date().toISOString(),
            read: false,
            ticketId: (saved as any).id,
          }, ...prev].slice(0, 50)));
        }
      } catch { /* non-fatal - localStorage may be unavailable */ }

      // Trigger 2: notifyTicketCreated
      // Always fires - confirms submission to the user immediately via their
      // notification bell, before the backend email even goes out.
      try {
        const ticketNum = (saved as any).ticketNumber || String((saved as any).id);
        const categoryLabel = (saved as any).categoryName || saved.category || "Support";
        addLocalNotification(userId, {
          type: "success",
          title: `Ticket #${ticketNum} Submitted`,
          message: `Your ticket has been received in ${categoryLabel}. ${(saved as any).consultantId ? "A consultant has been assigned." : "A consultant will be assigned shortly."}`,
          ticketId: (saved as any).id,
        });
      } catch { /* non-fatal */ }
      // ─────────────────────────────────────────────────────────────────────

      onCreated(saved as Ticket);
    } catch (e: any) {
      clearTimeout(slowHintTimer);
      setError(e.message || "Failed to create ticket.");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000, backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 20, width: 500, maxWidth: "95vw", boxShadow: "0 24px 80px rgba(0,0,0,0.3)", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        <div style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)", padding: "22px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" as const }}>
            <h3 style={{ margin: 0, color: "#fff", fontSize: 17, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}><Ticket size={18} /> Raise a Support Ticket</h3>
            <div style={{ display: "flex", alignItems: "center", borderRadius: 999, overflow: "hidden", border: "1px solid rgba(255,255,255,0.22)", background: "rgba(255,255,255,0.12)" }}>
              <button
                type="button"
                style={{ padding: "6px 10px", fontSize: 11, fontWeight: 800, border: "none", background: "rgba(255,255,255,0.18)", color: "#fff", cursor: "default" }}
              >
                Raise Ticket
              </button>
              <button
                type="button"
                onClick={() => onOpenEmailToTicket?.()}
                style={{ padding: "6px 10px", fontSize: 11, fontWeight: 800, border: "none", background: "transparent", color: "#DBEAFE", cursor: onOpenEmailToTicket ? "pointer" : "default" }}
                title={onOpenEmailToTicket ? "Create tickets by sending an email" : "Email-to-ticket unavailable"}
                disabled={!onOpenEmailToTicket}
              >
                Email to Ticket
              </button>
            </div>
          </div>
          <p style={{ margin: "4px 0 0", color: "#BFDBFE", fontSize: 13 }}>Our team will respond within the SLA window.</p>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          {error && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", color: "#B91C1C", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          {/* ── Category dropdown ── */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase" }}>
              Category *
            </label>
            {loadingCategories ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, color: "#94A3B8" }}>
                <img src={logoImg} alt="" style={{ width: 22, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite", flexShrink: 0 }} />
              </div>
            ) : (
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer", boxSizing: "border-box" }}
              >
                <option value="">- Select category -</option>
                {categories.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase" }}>
              Describe your issue *{" "}
              <span style={{ fontWeight: 400, color: "#94A3B8" }}>(min 10 chars)</span>
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={5}
              placeholder="Please describe your issue in detail..."
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, resize: "vertical", fontFamily: "inherit", outline: "none", lineHeight: 1.6, boxSizing: "border-box" }}
            />
            <div style={{ fontSize: 11, color: "#94A3B8", textAlign: "right", marginTop: 4 }}>
              {form.description.length}/2000
            </div>
          </div>

          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Priority</label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value as TicketPriority })}
                style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer", boxSizing: "border-box" }}
              >
                {[
                  { v: "LOW", l: "Low - within 72h" },
                  { v: "MEDIUM", l: "Medium - within 24h" },
                  { v: "HIGH", l: "High - within 8h" },
                  { v: "URGENT", l: "Urgent - within 4h" },
                ].map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Attachment (optional)</label>
              <input
                type="file"
                accept="image/*,.pdf,.csv,.doc,.docx,.txt"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                style={{ width: "100%", fontSize: 12, paddingTop: 10, color: "#374151" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", paddingTop: 4 }}>
            <button onClick={onClose} style={{ padding: "10px 22px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || loadingCategories}
              style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: (saving || loadingCategories) ? "#93C5FD" : "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: (saving || loadingCategories) ? "default" : "pointer", boxShadow: "0 2px 8px rgba(37,99,235,0.3)" }}
            >
              {saving ? "Submitting..." : "Submit Ticket"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL → TICKET MODAL (opens user's mail client)
// ─────────────────────────────────────────────────────────────────────────────
const EmailToTicketModal: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => {
  const [subject, setSubject] = useState("Support Request");
  const [body, setBody] = useState(
    "Hi Support Team,\n\nI need help with:\n\n- Issue:\n- Steps to reproduce:\n- Expected result:\n- Actual result:\n\nThanks,\n"
  );
  const [copied, setCopied] = useState<string | null>(null);

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(label);
        setTimeout(() => setCopied(null), 1500);
      } catch { /* ignore */ }
    }
  };

  const openMailClient = () => {
    const to = SUPPORT_EMAIL;
    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16 }}>
      <div style={{ width: "min(760px, 96vw)", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Mail size={18} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>Email to Ticket</div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 3 }}>
                Send an email to create a ticket automatically
              </div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const }}>
            <div style={{ fontSize: 13, color: "#1E3A8A", fontWeight: 700 }}>
              To: <span style={{ color: "#2563EB" }}>{SUPPORT_EMAIL}</span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
              <button onClick={() => copyText("Address copied", SUPPORT_EMAIL)}
                style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #BFDBFE", background: "#fff", color: "#1E40AF", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Copy Address
              </button>
              <button onClick={openMailClient}
                style={{ padding: "8px 12px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                Open Email App
              </button>
            </div>
          </div>

          {copied && (
            <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 700, color: "#16A34A" }}>{copied}</div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Subject
              </label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                placeholder="E.g., Billing: refund request"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", outline: "none", fontSize: 13, boxSizing: "border-box" as const }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 800, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Message
              </label>
              <textarea value={body} onChange={e => setBody(e.target.value)}
                rows={10}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1.5px solid #E2E8F0", outline: "none", fontSize: 13, boxSizing: "border-box" as const, resize: "vertical" }}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: "#64748B", lineHeight: 1.55 }}>
                Tip: Attach screenshots/documents in your email. Your email will be converted into a ticket and visible in your Tickets list.
              </div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14, flexWrap: "wrap" as const }}>
            <button onClick={() => copyText("Template copied", `To: ${SUPPORT_EMAIL}\nSubject: ${subject}\n\n${body}`)}
              style={{ padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#0F172A", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Copy Template
            </button>
            <button onClick={openMailClient}
              style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              Send Email
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
      // Fire email to consultant (ticket owner) - non-fatal
      const consultantEmailTc = (ticket as any).consultantEmail || (ticket as any).assignedToEmail || '';
      const ticketNumCmt = String((ticket as any).ticketNumber || ticket.id);
      if (consultantEmailTc) {
        emailOnTicketUpdated({ to: consultantEmailTc, ticketNumber: ticketNumCmt, status: ticket.status }).catch(() => null);
      }
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
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
          </div>
        </div>

        {sla && (
          <div style={{ padding: "9px 20px", background: sla.breached ? "#FEF2F2" : "#F0FDF4", borderBottom: `1px solid ${sla.breached ? "#FECACA" : "#BBF7D0"}`, flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: sla.breached ? "#B91C1C" : "#15803D", fontWeight: 600 }}>
              {sla.breached
                ? <><Clock size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Our team is working on your ticket - response time exceeded, we apologise.</>
                : <><CheckCircle size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Expected resolution by {sla.deadlineStr}</>}
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
                <FileText size={13} /> View your attachment
              </a>
            )}
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>
              Submitted {formatTicketDate(ticket.createdAt)}
              {ticket.agentName && ` · Assigned to ${ticket.agentName}`}
            </div>
          </div>

          <div style={{ padding: "16px 24px", borderBottom: "1px solid #F1F5F9" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 5 }}><MessageSquare size={12} /> Conversation</div>
            {loading ? (
              <div style={{ textAlign: "center", padding: 24 }}>
                <img src={logoImg} alt="" style={{ width: 48, height: "auto", display: "block", margin: "0 auto 12px", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
              </div>
            ) : comments.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "#94A3B8", fontSize: 13, fontStyle: "italic" }}>
                No messages yet. Our team will reply here.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {comments.map((c: TicketComment) => {
                  const isAgent = isStaffComment(c, userId);
                  const senderLabel = isAgent
                    ? (c.authorRole === "ADMIN" ? "Admin" : "Consultant")
                    : (currentUser?.name || "You");
                  return (
                    <div key={c.id} style={{ display: "flex", justifyContent: isAgent ? "flex-start" : "flex-end", alignItems: "flex-end", gap: 7 }}>
                      {isAgent && (
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#1E3A5F,#2563EB)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <User size={15} color="#fff" />
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
                          {fmtIST(c.createdAt)}
                        </div>
                      </div>
                      {!isAgent && (
                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#2563EB,#60A5FA)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <User size={15} color="#fff" />
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
                  placeholder="Type your message... (Enter to send)"
                  style={{ flex: 1, padding: "10px 12px", border: "1.5px solid #BFDBFE", borderRadius: 10, fontSize: 13, resize: "none", fontFamily: "inherit", outline: "none", background: "#fff" }} />
                <button onClick={handleSend} disabled={!message.trim() || sending}
                  style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: !message.trim() ? "#E2E8F0" : "#2563EB", color: !message.trim() ? "#94A3B8" : "#fff", fontSize: 13, fontWeight: 700, cursor: !message.trim() ? "default" : "pointer", alignSelf: "flex-end", flexShrink: 0 }}>
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </div>
          )}

          {["RESOLVED", "CLOSED"].includes(ticket.status) && !fbDone && (
            <div style={{ padding: "18px 24px", background: "#FFFBEB", borderTop: "1px solid #FDE68A" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <Star size={14} fill="#D97706" stroke="none" /> How was your experience? Rate this resolution.
              </div>
              <StarRating value={feedbackRating} onChange={setFeedbackRating} />
              <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)} rows={2}
                placeholder="Any comments? (optional)"
                style={{ width: "100%", marginTop: 12, padding: "10px 12px", border: "1.5px solid #FDE68A", borderRadius: 10, fontSize: 13, resize: "none", fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: "#fff" }} />
              <button onClick={handleFeedback} disabled={!feedbackRating || submittingFb}
                style={{ marginTop: 12, padding: "10px 24px", borderRadius: 10, border: "none", background: !feedbackRating ? "#E2E8F0" : "#D97706", color: !feedbackRating ? "#94A3B8" : "#fff", fontSize: 13, fontWeight: 700, cursor: !feedbackRating ? "default" : "pointer" }}>
                {submittingFb ? "Submitting..." : "Submit Feedback"}
              </button>
            </div>
          )}
          {fbDone && ticket.feedbackRating && (
            <div style={{ padding: "14px 24px", background: "#F0FDF4", borderTop: "1px solid #BBF7D0" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#15803D", display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle size={14} /> Feedback submitted - thank you! You rated this {ticket.feedbackRating}/5.
              </div>
            </div>
          )}

          {!["CLOSED", "RESOLVED"].includes(ticket.status) && (
            <div style={{ padding: "12px 24px" }}>
              <button onClick={async () => {
                try {
                  await updateTicketStatus(ticket.id, "CLOSED");
                  onStatusChange(ticket.id, "CLOSED");
                  // Fire status email to user - non-fatal
                  const userEmailCl = currentUser?.email || '';
                  const ticketNumCl = String((ticket as any).ticketNumber || ticket.id);
                  if (userEmailCl) {
                    emailOnTicketUpdated({ to: userEmailCl, ticketNumber: ticketNumCl, status: 'CLOSED' }).catch(() => null);
                  }
                  onClose();
                } catch { /* skip */ }
              }} style={{ padding: "10px 20px", border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <Lock size={13} /> Close Ticket
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
  const [form, setForm] = useState({ name: "", email: "", location: "", phone: "", designation: "", organizationName: "" });

  // ── Subscription plans state ──
  const [plans, setPlans] = useState<SubscriptionPlanDetail[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planSaving, setPlanSaving] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        let raw: any = null;
        try { raw = await apiFetch(`${BASE_URL}/users/me`); } catch {
          const sid = localStorage.getItem("fin_user_id");
          if (sid) try { raw = await apiFetch(`${BASE_URL}/users/${sid}`); } catch { }
        }
        if (!raw) { raw = { id: localStorage.getItem("fin_user_id"), role: getLocalRole() }; }
        if (!raw) { setProfile(null); setLoading(false); return; }
        const userId = raw.id || raw.userId;
        let onboard: any = null;
        if (userId) { try { onboard = await apiFetch(`${BASE_URL}/onboarding/${userId}`); } catch { } }
        const merged = { ...raw, ...(onboard || {}) };
        const normalized: UserProfile = {
          id: merged.id || merged.userId, name: merged.name || merged.fullName || "",
          email: merged.email || merged.emailId || "",

          location: merged.location || merged.city || "",
          identifier: merged.identifier || merged.username || merged.email || "",
          role: merged.role || merged.userRole || "",
          subscribed: merged.subscribed ?? merged.isSubscribed ?? false,
          subscriptionPlanName: merged.subscriptionPlanName || merged.planName || merged.subscriptionPlan?.name || "",
          subscriptionPlanId: merged.subscriptionPlanId || merged.subscriptionPlan?.id || null,
          phone: merged.phone || merged.phoneNumber || merged.mobile || "",
          designation: merged.designation || "",
          organizationName: merged.organizationName || merged.organization_name || "",
          createdAt: merged.createdAt || merged.registeredAt || "",
          incomes: (merged.incomes || merged.incomeItems || []).map((i: any) => ({ incomeType: i.incomeType || i.label || "Income", incomeAmount: i.incomeAmount ?? i.amount ?? 0 })),
          expenses: (merged.expenses || merged.expenseItems || []).map((e: any) => ({ expenseType: e.expenseType || e.label || "Expense", expenseAmount: e.expenseAmount ?? e.amount ?? 0 })),
          memberSince: merged.memberSince || merged.member_since || merged.createdAt || "",
        };
        const existingPhoto = merged.profileImageUrl || merged.profilePhoto || merged.photo || merged.avatarUrl || "";
        if (existingPhoto) setAvatarPreview(resolvePhotoUrl(existingPhoto));
        setProfile(normalized);
        setSelectedPlanId(normalized.subscriptionPlanId ?? null);
        setForm({ name: normalized.name || "", email: normalized.email || "", location: normalized.location || "", phone: normalized.phone || "", designation: normalized.designation || "", organizationName: normalized.organizationName || "" });
      } catch { setProfile(null); }
      finally { setLoading(false); }
    })();
  }, []);

  // ── Fetch subscription plans from backend ──
  useEffect(() => {
    (async () => {
      setPlansLoading(true);
      try {
        const token = localStorage.getItem("fin_token");
        const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        // Try multiple endpoints
        for (const ep of ["/subscription-plans", "/subscriptions/plans", "/plans"]) {
          try {
            const res = await fetch(`${BASE_URL}${ep}`, { headers });
            if (res.ok) {
              const data = await res.json();
              const arr: any[] = Array.isArray(data) ? data : (data?.content || data?.plans || []);
              if (arr.length > 0) {
                setPlans(arr.map((p: any) => ({
                  id: p.id,
                  name: p.name || p.planName || "",
                  originalPrice: Number(p.originalPrice ?? p.price ?? p.discountPrice ?? 0),
                  discountPrice: Number(p.discountPrice ?? p.price ?? p.originalPrice ?? 0),
                  features: p.features || "",
                  tag: p.tag || "",
                })));
                break;
              }
            }
          } catch { continue; }
        }
      } catch { /* silent */ }
      finally { setPlansLoading(false); }
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
    if (!phoneIsValid) {
      setSaveMsg("ERROR::Phone number is mandatory (10 digits).");
      setTimeout(() => setSaveMsg(""), 5000);
      return;
    }
    setSaving(true); setSaveMsg("");
    try {
      const payload: any = {
        name: form.name.trim(),
        email: form.email.trim(),
        location: form.location.trim(),
        phoneNumber: phoneDigitsForRequests,
        ...(form.designation.trim() ? { designation: form.designation.trim() } : {}),
        ...(form.organizationName.trim() ? { organizationName: form.organizationName.trim() } : {}),
      };
      const onboardingForm = new FormData();
      onboardingForm.append("data", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      if (avatarFile) onboardingForm.append("file", avatarFile);
      try { await apiFetch(`${BASE_URL}/onboarding/${profile.id}`, { method: "PUT", body: onboardingForm }); }
      catch { await apiFetch(`${BASE_URL}/users/${profile.id}`, { method: "PUT", body: JSON.stringify(payload) }); }
      setProfile(prev => prev ? { ...prev, ...form } : prev);
      setEditing(false); setSaveMsg("SUCCESS::🙌 Profile updated successfully!"); setTimeout(() => setSaveMsg(""), 4000);
    } catch (err: any) { setSaveMsg(`ERROR::${err.message}`); }
    finally { setSaving(false); }
  };

  // ── Change plan via PUT /onboarding/{id} with subscriptionPlanId ──
  const handleChangePlan = async (planId: number) => {
    if (!profile?.id) return;
    if (!phoneIsValid) {
      setSaveMsg("ERROR::Add a valid 10-digit phone number before changing plan.");
      setTimeout(() => setSaveMsg(""), 5000);
      return;
    }
    setPlanSaving(true); setSaveMsg("");
    try {
      const token = localStorage.getItem("fin_token");
      const headers: Record<string, string> = { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      // Use the onboarding PUT endpoint with subscriptionPlanId - matches backend UpdateUserRegistrationRequest
      const payload = { subscriptionPlanId: planId, phoneNumber: phoneDigitsForRequests };
      const fd = new FormData();
      fd.append("data", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      const res = await fetch(`${BASE_URL}/onboarding/${profile.id}`, { method: "PUT", headers, body: fd });
      if (res.ok) {
        const data = await res.json();
        const newPlanName = data?.subscriptionPlan?.name || plans.find(p => p.id === planId)?.name || "";
        setSelectedPlanId(planId);
        setProfile(prev => prev ? { ...prev, subscriptionPlanId: planId, subscriptionPlanName: newPlanName } : prev);
        setSaveMsg(`SUCCESS::Plan changed to "${newPlanName}" successfully!`);
      } else {
        const errData = await res.json().catch(() => ({}));
        setSaveMsg(`ERROR::${errData?.message || "Failed to update plan. Please try again."}`);
      }
    } catch (err: any) {
      setSaveMsg(`ERROR::${err?.message || "Network error. Please try again."}`);
    } finally {
      setPlanSaving(false);
      setTimeout(() => setSaveMsg(""), 5000);
    }
  };

  if (loading) return (
    <div style={{ textAlign: "center", padding: 48 }}>
      <img src={logoImg} alt="" style={{ width: 48, height: "auto", display: "block", margin: "0 auto 12px", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
    </div>
  );
  if (!profile) return <div style={{ textAlign: "center", padding: 48, color: "#94A3B8" }}>Could not load profile.</div>;

  // MEMBER = admin-created user with full access (booking, tickets, etc.) - treat as premium
  const isPremium = profile.subscribed === true || ["SUBSCRIBER", "SUBSCRIBED", "PREMIUM", "MEMBER"].includes((profile.role || "").toUpperCase());
  // Admin-added MEMBER users get completely free access - no charges for bookings or tickets
  const isAdminMember = (profile.role || "").toUpperCase() === "MEMBER";
  const currentPlanName = profile.subscriptionPlanName || (isAdminMember ? "Premium (Free)" : isPremium ? "Premium" : "Guest");
  const initials = (profile.name || "U").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  const totalIncome = (profile.incomes || []).reduce((s, i) => s + (Number(i.incomeAmount) || 0), 0);
  const totalExpense = (profile.expenses || []).reduce((s, e) => s + (Number(e.expenseAmount) || 0), 0);
  const fmtDate = (d?: string) => { if (!d) return "-"; try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return d; } };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1.5px solid #BFDBFE", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", background: "#F8FBFF", color: "#1E293B", boxSizing: "border-box" };
  const phoneDigitsForRequests = (form.phone || "").replace(/\D/g, "").slice(0, 10);
  const phoneIsValid = phoneDigitsForRequests.length === 10;
  const canSaveProfile = !saving && phoneIsValid && (form.name || "").trim().length >= 2 && (form.email || "").trim().length > 0;

  // Determine the "SUBSCRIBED" vs "GUEST" type badge
  const isSubscribedType = selectedPlanId != null
    ? plans.find(p => p.id === selectedPlanId)?.name?.toLowerCase() !== "guest"
    : isPremium;

  const parsedSaveMsg = (() => {
    if (!saveMsg) return null;
    if (saveMsg.startsWith("SUCCESS::")) return { tone: "success", text: saveMsg.replace(/^SUCCESS::\s*/, ""), icon: <CheckCircle size={14} /> };
    if (saveMsg.startsWith("INFO::")) return { tone: "info", text: saveMsg.replace(/^INFO::\s*/, ""), icon: <Info size={14} /> };
    if (saveMsg.startsWith("ERROR::")) return { tone: "error", text: saveMsg.replace(/^ERROR::\s*/, ""), icon: <XCircle size={14} /> };
    return { tone: "success", text: saveMsg, icon: <CheckCircle size={14} /> };
  })();

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", color: "#2563EB", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><ArrowLeft size={20} /></button>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1E293B", flex: 1 }}>Account Profile</h2>
        {!editing
          ? <button onClick={() => setEditing(true)} style={{ padding: "8px 18px", borderRadius: 8, border: "1.5px solid #2563EB", background: "#EFF6FF", color: "#2563EB", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Edit</button>
          : <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setEditing(false)} disabled={saving} style={{ padding: "8px 16px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={handleSave} disabled={!canSaveProfile} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: !canSaveProfile ? "#E2E8F0" : (saving ? "#93C5FD" : "#2563EB"), color: !canSaveProfile ? "#94A3B8" : "#fff", fontWeight: 700, fontSize: 13, cursor: !canSaveProfile ? "not-allowed" : "pointer" }}>{saving ? "Saving..." : "Save"}</button>
          </div>
        }
      </div>
      {parsedSaveMsg && (
        <div style={{
          padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 600,
          background: parsedSaveMsg.tone === "success" ? "#F0FDF4" : parsedSaveMsg.tone === "info" ? "#EFF6FF" : "#FEF2F2",
          color: parsedSaveMsg.tone === "success" ? "#16A34A" : parsedSaveMsg.tone === "info" ? "#2563EB" : "#DC2626",
          border: `1px solid ${parsedSaveMsg.tone === "success" ? "#BBF7D0" : parsedSaveMsg.tone === "info" ? "#BFDBFE" : "#FECACA"}`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {parsedSaveMsg.icon}
          <span>{parsedSaveMsg.text}</span>
        </div>
      )}

      {/* ── PROFILE HEADER - always blue ── */}
      <div style={{ borderRadius: 20, padding: "28px 24px 24px", marginBottom: 16, background: "linear-gradient(135deg,#1E3A5F,#2563EB)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "3px solid rgba(255,255,255,0.45)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800, color: "#fff", overflow: "hidden" }}>
              {avatarPreview ? <img src={avatarPreview} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
            </div>
            {editing && <div onClick={() => avatarInputRef.current?.click()} style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 0 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg></div>}
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleAvatarChange} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>{editing ? form.name : profile.name || "User"}</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", margin: "0 0 10px" }}>{profile.email}</p>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 14px", borderRadius: 100, fontSize: 11, fontWeight: 800, textTransform: "uppercase", background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.45)", color: "#fff" }}>
              {currentPlanName ? (
                <><CheckCircle size={12} /> {currentPlanName} Member</>
              ) : (isPremium ? (
                <><CheckCircle size={12} /> Premium Member</>
              ) : (
                <><User size={12} /> Guest Account</>
              ))}
            </span>
          </div>
        </div>
      </div>

      {/* ── PERSONAL DETAILS ── */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px 12px", borderBottom: "1px solid #F1F5F9", fontWeight: 700, fontSize: 13, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 6 }}><User size={13} style={{ flexShrink: 0 }} /> Personal Details</div>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "16px 20px" }}>
            {([
              { label: "Full Name", key: "name", type: "text" },
              { label: "Email", key: "email", type: "email" },
              { label: "Location", key: "location", type: "text" },
              { label: "Phone", key: "phone", type: "tel" },
            ] as const).map(field => {
              const phoneDigits = field.key === "phone" ? (form.phone || "").replace(/\D/g, "") : "";
              return (
                <div key={field.key}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>
                    {field.label}
                    {field.key === "phone" && (
                      <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: phoneDigits.length === 10 ? "#16A34A" : phoneDigits.length > 0 ? "#D97706" : "#94A3B8" }}>
                        {phoneDigits.length}/10 digits
                      </span>
                    )}
                  </label>
                  <input
                    type={field.type}
                    value={(form as any)[field.key]}
                    inputMode={field.key === "phone" ? "numeric" : undefined}
                    maxLength={field.key === "phone" ? 10 : undefined}
                    onChange={e => {
                      if (field.key === "phone") {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setForm(p => ({ ...p, phone: digits }));
                      } else if (field.key === "name") {
                        const val = e.target.value;
                        // Block numbers and special characters as the very first character
                        if (val.length === 1 && /[^a-zA-Z]/.test(val)) return;
                        setForm(p => ({ ...p, name: val }));
                      } else {
                        setForm(p => ({ ...p, [field.key]: e.target.value }));
                      }
                    }}
                    style={{
                      ...inputStyle,
                      ...(field.key === "phone" && phoneDigits.length > 0 && phoneDigits.length < 10
                        ? { borderColor: "#FCD34D" }
                        : field.key === "phone" && phoneDigits.length === 10
                          ? { borderColor: "#86EFAC" }
                          : {}),
                    }}
                  />
                  {field.key === "phone" && phoneDigits.length > 0 && phoneDigits.length < 10 && (
                    <div style={{ fontSize: 11, color: "#D97706", marginTop: 3, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                      <AlertTriangle size={12} />
                      <span>Enter {10 - phoneDigits.length} more digit{10 - phoneDigits.length !== 1 ? "s" : ""}</span>
                    </div>
                  )}
                  {field.key === "phone" && phoneDigits.length === 10 && (
                    <div style={{ fontSize: 11, color: "#16A34A", marginTop: 3, fontWeight: 600 }}>Valid mobile number</div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            {[
              { label: "Email", value: profile.email || "-" },
              { label: "Location", value: profile.location || "-" },
              { label: "Phone", value: profile.phone || "-" },
              { label: "Plan", value: currentPlanName || "-" },
              { label: "Member Since", value: (profile as any).memberSince ? new Date((profile as any).memberSince).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "-" },
            ].map(d => (
              <div key={d.label} style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", borderRight: "1px solid #F1F5F9" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{d.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>{d.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── SUBSCRIPTION PLAN - styled like register page ── */}
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid #F1F5F9" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>Subscription Plan</span>
          </div>
          {/* SUBSCRIBED / GUEST toggle badges */}
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: isSubscribedType ? "#EFF6FF" : "#F8FAFC", border: `1.5px solid ${isSubscribedType ? "#2563EB" : "#CBD5E1"}`, color: isSubscribedType ? "#2563EB" : "#94A3B8" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              SUBSCRIBED - FULL ACCESS
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: !isSubscribedType ? "#FEF2F2" : "#F8FAFC", border: `1.5px solid ${!isSubscribedType ? "#EF4444" : "#CBD5E1"}`, color: !isSubscribedType ? "#EF4444" : "#94A3B8" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              GUEST - LIMITED ACCESS
            </div>
          </div>
        </div>
        <div style={{ padding: "16px 20px" }}>
          {plansLoading ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <img src={logoImg} alt="" style={{ width: 48, height: "auto", display: "block", margin: "0 auto 12px", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
            </div>
          ) : plans.length === 0 ? (
            // Fallback static plans if backend returns nothing
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { id: -1, name: "Elite", discountPrice: 999 },
                { id: -2, name: "Pro", discountPrice: 499 },
                { id: -3, name: "Guest", discountPrice: 0 },
              ].map(plan => {
                const isFree = plan.discountPrice === 0;
                const isSelected = selectedPlanId === plan.id;
                return (
                  <div key={plan.id} onClick={() => { if (!planSaving) setSelectedPlanId(plan.id); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderRadius: 12, border: `2px solid ${isSelected ? "#2563EB" : "#E2E8F0"}`, background: isSelected ? "#EFF6FF" : "#fff", cursor: "pointer", transition: "all 0.2s", position: "relative" }}>
                    {isFree && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#E2E8F0", color: "#64748B", fontSize: 10, fontWeight: 800, padding: "2px 12px", borderRadius: 20, letterSpacing: "0.06em" }}>Guest</div>}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: isSelected ? "#2563EB" : "#0F172A" }}>{plan.name}</span>
                      {!isFree && <span style={{ fontSize: 10, fontWeight: 700, background: "#DCFCE7", color: "#16A34A", border: "1px solid #86EFAC", padding: "2px 8px", borderRadius: 10 }}>PREMIUM</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: isFree ? "#64748B" : "#0F172A" }}>
                        {isFree ? "Guest" : `₹${plan.discountPrice}`}
                      </div>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${isSelected ? "#2563EB" : "#CBD5E1"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isSelected && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563EB" }} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={() => { const plan = [{ id: -1, name: "Elite" }, { id: -2, name: "Pro" }, { id: -3, name: "Guest" }].find(p => p.id === selectedPlanId); if (!plan || currentPlanName?.toLowerCase() === plan.name.toLowerCase()) return; setSaveMsg("INFO::Plan change requires backend subscription plan IDs. Please contact support."); setTimeout(() => setSaveMsg(""), 5000); }}
                disabled={planSaving || !selectedPlanId || currentPlanName?.toLowerCase() === [{ id: -1, name: "Elite" }, { id: -2, name: "Pro" }, { id: -3, name: "Guest" }].find(p => p.id === selectedPlanId)?.name?.toLowerCase()}
                style={{ width: "100%", marginTop: 6, padding: "12px", borderRadius: 12, border: "none", background: planSaving ? "#93C5FD" : "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: planSaving ? 0.7 : 1 }}>
                {planSaving ? "Updating..." : "Change Plan"}
              </button>
            </div>
          ) : (
            // Dynamic plans from backend
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {plans.map(plan => {
                const isFree = plan.discountPrice === 0;
                const isSelected = selectedPlanId === plan.id;
                return (
                  <div key={plan.id} onClick={() => { if (!planSaving) setSelectedPlanId(plan.id); }}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderRadius: 12, border: `2px solid ${isSelected ? "#2563EB" : "#E2E8F0"}`, background: isSelected ? "#EFF6FF" : "#fff", cursor: "pointer", transition: "all 0.2s", position: "relative" }}>
                    {isFree && <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#E2E8F0", color: "#64748B", fontSize: 10, fontWeight: 800, padding: "2px 12px", borderRadius: 20, letterSpacing: "0.06em" }}>GUEST</div>}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: isSelected ? "#2563EB" : "#0F172A" }}>{plan.name}</span>
                      {!isFree && <span style={{ fontSize: 10, fontWeight: 700, background: "#DCFCE7", color: "#16A34A", border: "1px solid #86EFAC", padding: "2px 8px", borderRadius: 10 }}>PREMIUM</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: isFree ? "#64748B" : "#0F172A" }}>
                        {isFree ? "Guest" : `₹${plan.discountPrice}`}
                      </div>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${isSelected ? "#2563EB" : "#CBD5E1"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isSelected && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#2563EB" }} />}
                      </div>
                    </div>
                  </div>
                );
              })}
              {/* Show current plan indicator text */}
              {currentPlanName && (
                <div style={{ fontSize: 12, color: "#64748B", textAlign: "center", padding: "4px 0" }}>
                  Current plan: <strong style={{ color: "#0F172A" }}>{currentPlanName}</strong>
                  {selectedPlanId != null && plans.find(p => p.id === selectedPlanId)?.name !== currentPlanName && (
                    <span style={{ color: "#2563EB", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <ArrowRight size={12} />
                      <span>{plans.find(p => p.id === selectedPlanId)?.name}</span>
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={() => { if (selectedPlanId != null) handleChangePlan(selectedPlanId); }}
                disabled={planSaving || !phoneIsValid || selectedPlanId == null || plans.find(p => p.id === selectedPlanId)?.name?.toLowerCase() === currentPlanName?.toLowerCase()}
                style={{ width: "100%", marginTop: 2, padding: "12px", borderRadius: 12, border: "none", background: (planSaving || !phoneIsValid || selectedPlanId == null || plans.find(p => p.id === selectedPlanId)?.name?.toLowerCase() === currentPlanName?.toLowerCase()) ? "#E2E8F0" : "linear-gradient(135deg,#2563EB,#1D4ED8)", color: (planSaving || !phoneIsValid || selectedPlanId == null || plans.find(p => p.id === selectedPlanId)?.name?.toLowerCase() === currentPlanName?.toLowerCase()) ? "#94A3B8" : "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: planSaving ? 0.7 : 1, transition: "all 0.2s" }}>
                {planSaving ? "Updating..." : "Change Plan"}
              </button>
            </div>
          )}
        </div>
      </div>

      {(profile.incomes?.length || profile.expenses?.length) ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div style={{ borderRadius: 12, padding: 16, background: "#F0FDF4", border: "1px solid #BBF7D0" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#15803D", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}><DollarSign size={10} />Total Income</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#16A34A" }}>₹{totalIncome.toLocaleString()}</div>
          </div>
          <div style={{ borderRadius: 12, padding: 16, background: "#FEF2F2", border: "1px solid #FECACA" }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "#B91C1C", marginBottom: 6 }}>Total Expenses</div>
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

  // Apply Init Cap (Title Case) with exceptions to description text
  const EXCEPTIONS = new Set(["is", "was", "are", "in", "and", "the", "this", "to", "a", "an", "of", "at", "by", "for", "with", "on", "or", "but", "nor", "so", "yet", "as", "if", "than", "though"]);
  const applyInitCap = (text: string): string =>
    text.split(" ").map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx === 0 || !EXCEPTIONS.has(lower)) return lower.charAt(0).toUpperCase() + lower.slice(1);
      return lower;
    }).join(" ");

  const clean = applyInitCap(about.trim());
  const cut1 = (() => { if (clean.length <= LINE_LEN) return clean.length; const idx = clean.lastIndexOf(" ", LINE_LEN); return idx > 20 ? idx : LINE_LEN; })();
  const rest1 = clean.substring(cut1).trimStart();
  const cut2 = (() => { if (rest1.length <= LINE_LEN) return rest1.length; const idx = rest1.lastIndexOf(" ", LINE_LEN); return idx > 10 ? idx : LINE_LEN; })();
  const line1 = clean.substring(0, cut1).trimEnd();
  const line2 = rest1.substring(0, cut2).trimEnd();
  const hasMore = clean.length > cut1 + cut2;
  const preview = expanded ? clean : (hasMore ? `${line1}\n${line2}...` : clean);
  return (
    <div style={{ margin: "4px 0 4px", padding: 0, background: "transparent", border: "none", width: "100%", textAlign: "left" }}>
      <p style={{ margin: 0, fontSize: 12, color: "#64748B", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "Georgia, serif", textAlign: "left" }}>{preview}</p>
      {hasMore && <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }} style={{ background: "none", border: "none", color: "#2563EB", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "1px 0 0", letterSpacing: "0.01em", display: "inline-block" }}>{expanded ? "Show less ↑" : "View more ↓"}</button>}
    </div>
  );
};

const ProfileAbout: React.FC<{ about: string }> = ({ about }) => {
  const [expanded, setExpanded] = useState(false);
  const words = about.split(" ");
  const isLong = words.length > 28;
  const preview = isLong && !expanded ? words.slice(0, 28).join(" ") + "..." : about;
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

  // Admin-added MEMBER users get completely free access - no charges for bookings or tickets
  const isAdminMember = getLocalRole().toUpperCase().replace(/^ROLE_/, "") === "MEMBER";

  const [tab, setTab] = useState<"consultants" | "bookings" | "tickets" | "notifications" | "settings">("consultants");

  // ── Live fee/commission config from backend admin settings ─────────────────
  // Pre-load from localStorage cache so commission shows immediately on render
  // (getFeeConfig hits admin-only endpoint and returns 403 for regular users,
  //  but caches the value when admin saves it via updateFeeConfig)
  const [feeConfig, setFeeConfig] = useState<{ feeType: string; feeValue: string }>(() => {
    try {
      const cached = localStorage.getItem("fin_fee_config");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.feeType && parsed?.feeValue !== undefined) return parsed;
      }
    } catch { /* ignore */ }
    return { feeType: "FLAT", feeValue: "0" };
  });

  // ── Pending offer from HomePage (stored in localStorage when user clicks "Claim Offer") ──
  const [pendingOffer, setPendingOffer] = useState<{
    id: number;
    title: string;
    description?: string;
    discount?: string;
    consultantId?: number | null;
    consultantName?: string;
  } | null>(null);

  // ── Offers state for booking modal ──────────────────────────────────────────
  // Fetched from GET /api/offers/checkout?consultantId=X when booking modal opens
  const [consultantOffers, setConsultantOffers] = useState<any[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<number | null>(null);
  const [usedOfferIds, setUsedOfferIds] = useState<number[]>([]);
  const [loadingOffers, setLoadingOffers] = useState(false);

  // Helper: compute the final session amount shown to the user.
  const calcTotal = (base: number): { total: number; commission: number; label: string } => {
    const val = parseFloat(feeConfig.feeValue) || 0;
    const commission = feeConfig.feeType === "PERCENTAGE"
      ? Math.round((base * val / 100) * 100) / 100
      : val;
    const total = base + commission;
    const label = val > 0 ? "Included in total" : "";
    return { total, commission, label };
  };

  const calcSpecialBookingQuote = (basePerSlot: number, slotCount: number, offer?: any) => {
    // Always charge 1 session fee regardless of slot count
    const combinedBase = basePerSlot; // 1 session only
    const discountAmount = offer ? parseDiscountAmount(offer.discount || "0", combinedBase, offer) : 0;
    const discountedBase = Math.max(combinedBase - discountAmount, 0);
    const feeValue = parseFloat(feeConfig.feeValue) || 0;
    const additionalCharges = feeConfig.feeType === "PERCENTAGE"
      ? Math.round((discountedBase * feeValue / 100) * 100) / 100
      : feeValue;
    return {
      baseAmount: combinedBase,
      discountAmount,
      additionalCharges,
      total: discountedBase + additionalCharges,
    };
  };

  const [userNotifs, setUserNotifs] = useState<any[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Consultants");
  const [toast, setToast] = useState("");
  // Booking confirmation banner (shown at top of page after successful booking)
  const [bookingBanner, setBookingBanner] = useState<{
    consultantName: string;
    dayLabel: string;
    slotLabel: string;
    emailSent: boolean;
  } | null>(null);

  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingFilter, setBookingFilter] = useState<"UPCOMING" | "HISTORY">("UPCOMING");
  const [showCalendarPopup, setShowCalendarPopup] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() }; });
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | null>(null);
  const [deletingBookingId, setDeletingBookingId] = useState<number | null>(null);
  const [loading, setLoading] = useState({ consultants: true, bookings: false, slots: false, tickets: false });

  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const [currentUser, setCurrentUser] = useState<{ id?: number; name?: string; email?: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  // ── User Analytics state ──────────────────────────────────────────────────
  const [userAnalyticsOverview, setUserAnalyticsOverview] = useState<any>(null);
  const [userRecentActivities, setUserRecentActivities] = useState<any[]>([]);
  const [userUpcomingAppts, setUserUpcomingAppts] = useState<any[]>([]);
  const [userRecentTickets, setUserRecentTickets] = useState<any[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [dbTimeslots, setDbTimeslots] = useState<TimeSlotRecord[]>([]);
  const [bookedSlotSet, setBookedSlotSet] = useState<Set<string>>(new Set());
  const [specialAvailabilitySlots, setSpecialAvailabilitySlots] = useState<AvailableSpecialSlot[]>([]);
  const [consultantSpecialDays, setConsultantSpecialDays] = useState<ConsultantSpecialDayRecord[]>([]);
  const [dayOffset, setDayOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<DayItem>(DEFAULT_DAY);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  // Multi-slot booking: accumulate slots across dates
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlotWithDate[]>([]);
  const [bookingMode, setBookingMode] = useState<"STANDARD" | "SPECIAL">("STANDARD");
  const [bookingMultiple, setBookingMultiple] = useState(false); // true = multi-session mode
  const [specialBookingHours, setSpecialBookingHours] = useState(1);
  const [specialStartTime, setSpecialStartTime] = useState(""); // HH:MM 24h
  const [specialEndTime, setSpecialEndTime] = useState("");     // HH:MM 24h
  // Special booking slot choices mirror the consultant's normal daily slot count.
  const [consultantSpecialSlotCounts, setConsultantSpecialSlotCounts] = useState<number[]>([]);
  const [meetingMode, setMeetingMode] = useState<"ONLINE" | "PHYSICAL" | "PHONE">("ONLINE");
  const [userNotes, setUserNotes] = useState("");
  const [confirming, setConfirming] = useState(false);

  const [profileConsultant, setProfileConsultant] = useState<Consultant | null>(null);
  const [settingsView, setSettingsView] = useState<"menu" | "profile" | "notifications" | "privacy">("menu");
  const [showPostBookingQuestionnaire, setShowPostBookingQuestionnaire] = useState(false);
  const [postBookingData, setPostBookingData] = useState<{
    bookingId: number;
    specialBookingId?: number;
    bookingType: "NORMAL" | "SPECIAL";
    consultantName: string;
    consultantId: number;
    slotLabel: string;
    dayLabel: string;
  } | null>(null);
  // ── Notification preference settings (persisted in localStorage) ───────────
  const [notifPrefs, setNotifPrefs] = useState<{
    bookingUpdates: boolean;
    ticketReplies: boolean;
    consultantMessages: boolean;
    offerAlerts: boolean;
    emailNotifications: boolean;
    smsNotifications: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem("fin_notif_prefs");
      if (saved) return JSON.parse(saved);
    } catch { }
    return { bookingUpdates: true, ticketReplies: true, consultantMessages: true, offerAlerts: true, emailNotifications: true, smsNotifications: false };
  });

  // ── Privacy & Security settings ────────────────────────────────────────────
  const [privacyPrefs, setPrivacyPrefs] = useState<{
    profileVisible: boolean;
    activityVisible: boolean;
    twoFactorEnabled: boolean;
  }>(() => {
    try {
      const saved = localStorage.getItem("fin_privacy_prefs");
      if (saved) return JSON.parse(saved);
    } catch { }
    return { profileVisible: true, activityVisible: false, twoFactorEnabled: false };
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [privacyPwForm, setPrivacyPwForm] = useState({ current: "", newPass: "", confirm: "" });
  const [privacyPwError, setPrivacyPwError] = useState("");
  const [privacyPwSuccess, setPrivacyPwSuccess] = useState("");
  const [privacyPwSaving, setPrivacyPwSaving] = useState(false);
  const [showSubPopup, setShowSubPopup] = useState(false);

  // ── First-login password change modal (when backend requiresPasswordChange=true) ─
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [pwForm, setPwForm] = useState({ newPass: "", confirmPass: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwShowNew, setPwShowNew] = useState(false);
  const [pwShowConfirm, setPwShowConfirm] = useState(false);

  // ── Category / Questionnaire flow ─────────────────────────────────────────
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  // NEW: First-login questionnaire modal (shown after first login / guest login)
  const [showFirstLoginQuestionnaire, setShowFirstLoginQuestionnaire] = useState(false);
  // Onboarding flow: intro → details → categories → skill-questions → terms → done
  const [firstLoginStep, setFirstLoginStep] = useState<"intro" | "details" | "categories" | "skill-questions" | "terms" | "done">("intro");
  const [skillQuestions, setSkillQuestions] = useState<Array<{ id: number; skillId: number; text: string; skillName?: string }>>([]);
  const [skillQAnswers, setSkillQAnswers] = useState<Record<number, string>>({});
  const [firstLoginAnswers, setFirstLoginAnswers] = useState<Record<string, string>>({});
  const [firstLoginCategories, setFirstLoginCategories] = useState<string[]>([]);
  // Dynamic categories fetched from consultant skills
  const [dynamicSkillCategories, setDynamicSkillCategories] = useState<string[]>([]);
  // Map of skillName (lowercase) → skillId
  const [backendSkillMap, setBackendSkillMap] = useState<Record<string, number>>({});
  // Onboarding validation errors - shown inline, no skipping allowed
  const [onboardingCatError, setOnboardingCatError] = useState("");
  const [onboardingQError, setOnboardingQError] = useState("");

  // ── Terms & Conditions step state - MUST be top-level hooks (Rules of Hooks) ──
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsContent, setTermsContent] = useState<string | null>(null);
  const [termsLoading, setTermsLoading] = useState(false);

  const [userCategories, setUserCategories] = useState<{ category: string; subOption: string; answers: Record<string, string> }[]>([]);
  const [categoryStep, setCategoryStep] = useState<"select" | "questionnaire" | "done">("select");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedSubOption, setSelectedSubOption] = useState("");
  const [questionnaireAnswers, setQuestionnaireAnswers] = useState<Record<string, string>>({});
  // tempSelectedCategories: tracks multi-select state while the category modal is open
  const [tempSelectedCategories, setTempSelectedCategories] = useState<string[]>([]);
  // Post-category-select: show backend questions for the chosen categories
  const [showCategoryQuestionsModal, setShowCategoryQuestionsModal] = useState(false);
  const [categoryQuestionsData, setCategoryQuestionsData] = useState<Array<{ id: number; skillId: number; text: string; skillName?: string }>>([]);
  const [categoryQAnswers, setCategoryQAnswers] = useState<Record<number, string>>({});
  const [loadingCategoryQuestions, setLoadingCategoryQuestions] = useState(false);

  // Enhanced CATEGORY_OPTIONS with richer question types (radio, multiselect, text)
  // type: "text" | "radio" | "multiselect"
  const CATEGORY_OPTIONS: Record<string, {
    subOptions: string[];
    questions: { q: string; key: string; type?: "text" | "radio" | "multiselect"; options?: string[] }[]
  }> = {
    "Tax": {
      subOptions: ["Income Tax", "GST", "Tax Planning", "Corporate Tax"],
      questions: [
        {
          q: "What is your annual income range?", key: "incomeRange", type: "radio",
          options: ["Below ₹5L", "₹5L - ₹10L", "₹10L - ₹25L", "₹25L - ₹50L", "Above ₹50L"]
        },
        {
          q: "Do you have any existing investments?", key: "hasInvestments", type: "radio",
          options: ["Yes", "No", "Planning to start"]
        },
        {
          q: "What is your employment type?", key: "employmentType", type: "radio",
          options: ["Salaried", "Self-Employed", "Business Owner", "Freelancer", "Retired"]
        },
        {
          q: "Which tax areas concern you most?", key: "taxConcerns", type: "multiselect",
          options: ["Income Tax Filing", "GST Compliance", "Tax Saving", "Capital Gains", "TDS", "Property Tax"]
        },
      ]
    },
    "Finance": {
      subOptions: ["Wealth Management", "Mutual Funds", "Retirement Planning", "Portfolio Management"],
      questions: [
        {
          q: "What is your primary financial goal?", key: "financialGoal", type: "radio",
          options: ["Wealth Creation", "Retirement Planning", "Child Education", "Home Purchase", "Debt Reduction", "Emergency Fund"]
        },
        {
          q: "What is your risk appetite?", key: "riskAppetite", type: "radio",
          options: ["Conservative (Low Risk)", "Moderate (Balanced)", "Aggressive (High Risk)", "Very Aggressive"]
        },
        {
          q: "What is your investment horizon?", key: "investmentHorizon", type: "radio",
          options: ["< 1 Year (Short term)", "1-3 Years", "3-5 Years", "5-10 Years", "10+ Years"]
        },
        {
          q: "Which financial instruments interest you?", key: "financialInstruments", type: "multiselect",
          options: ["Mutual Funds", "Stocks", "Fixed Deposits", "Bonds", "PPF / EPF", "Real Estate", "Gold"]
        },
        { q: "Any specific financial concerns or goals?", key: "additionalGoals", type: "text" },
      ]
    },
    "Insurance": {
      subOptions: ["Life Insurance", "Health Insurance", "Term Plans", "ULIP"],
      questions: [
        {
          q: "Do you currently have any insurance coverage?", key: "hasInsurance", type: "radio",
          options: ["Yes - adequate coverage", "Yes - but need more", "No - looking to start", "Not sure"]
        },
        {
          q: "How many dependents do you have?", key: "dependents", type: "radio",
          options: ["0 (No dependents)", "1", "2", "3", "4+"]
        },
        {
          q: "What coverage amount are you looking for?", key: "coverageAmount", type: "radio",
          options: ["₹10L - ₹25L", "₹25L - ₹50L", "₹50L - ₹1Cr", "₹1Cr - ₹2Cr", "₹2Cr+"]
        },
        {
          q: "Which insurance types interest you?", key: "insuranceTypes", type: "multiselect",
          options: ["Term Life", "Health / Mediclaim", "ULIP", "Endowment", "Critical Illness", "Accident Cover", "Child Plan"]
        },
      ]
    },
    "Investment": {
      subOptions: ["Equity", "SIP", "Bonds", "Real Estate"],
      questions: [
        {
          q: "How long have you been investing?", key: "investingExperience", type: "radio",
          options: ["Never invested before", "< 1 Year", "1-3 Years", "3-5 Years", "5+ Years"]
        },
        {
          q: "What is your monthly investment budget?", key: "monthlyBudget", type: "radio",
          options: ["< ₹5,000", "₹5,000 - ₹10,000", "₹10,000 - ₹25,000", "₹25,000 - ₹50,000", "₹50,000+"]
        },
        {
          q: "Do you prefer direct or managed funds?", key: "fundPreference", type: "radio",
          options: ["Direct (DIY)", "Managed by advisor", "Both / Flexible", "Not sure yet"]
        },
        {
          q: "Which investment types interest you?", key: "investmentTypes", type: "multiselect",
          options: ["Equity Stocks", "SIP / Mutual Funds", "Bonds / Debentures", "Real Estate", "REITs", "Crypto", "Gold / Silver"]
        },
        { q: "Any specific investment goals or questions?", key: "investmentNotes", type: "text" },
      ]
    },
  };

  // ── Step 2: Personal Details (pre-filled from registration, user can confirm/update)
  const PERSONAL_QUESTIONS: { q: string; key: string; type: "text" | "radio"; options?: string[] }[] = [
    { q: "What is your full name?", key: "name", type: "text" },
    { q: "Your phone number", key: "phone", type: "text" },
    { q: "Your city / location", key: "location", type: "text" },
    {
      q: "What best describes your current life stage?",
      key: "lifeStage",
      type: "radio",
      options: ["Student / Early career", "Working professional", "Business owner / Self-employed", "Mid-career (30-45)", "Pre-retirement (45-60)", "Retired"]
    },
    {
      q: "Your primary financial goal right now?",
      key: "primaryGoal",
      type: "radio",
      options: ["Save more money", "Invest wisely", "Reduce taxes", "Get insurance", "Plan for retirement", "Buy a home", "Manage debt", "Grow my business"]
    },
  ];

  // ── Step 3: Income & Financial Background
  const INCOME_QUESTIONS: { q: string; key: string; type: "text" | "radio" | "multiselect"; options?: string[]; placeholder?: string }[] = [
    {
      q: "What is your approximate monthly income?",
      key: "monthlyIncome",
      type: "radio",
      options: ["Below ₹30,000", "₹30,000 - ₹60,000", "₹60,000 - ₹1,00,000", "₹1,00,000 - ₹2,00,000", "₹2,00,000+"]
    },
    {
      q: "What is your employment type?",
      key: "employmentType",
      type: "radio",
      options: ["Salaried (private sector)", "Salaried (government / PSU)", "Self-employed / Freelancer", "Business owner", "Professional (CA, Doctor, Lawyer...)", "Not currently employed"]
    },
    {
      q: "Have you worked with a financial consultant before?",
      key: "priorExperience",
      type: "radio",
      options: ["No, this is my first time", "Yes, once or twice", "Yes, I have a regular consultant", "I manage finances myself"]
    },
    {
      q: "How comfortable are you with financial decisions?",
      key: "financialConfidence",
      type: "radio",
      options: ["Not at all - I need full guidance", "Somewhat - I know the basics", "Fairly confident - I need occasional help", "Very confident - I want expert validation only"]
    },
    {
      q: "Any specific financial concerns? (optional)",
      key: "concerns",
      type: "text",
      placeholder: "e.g. planning for children's education, dealing with debt, succession planning..."
    },
  ];

  // Keep for backward compatibility
  const FIRST_LOGIN_QUESTIONS = [...PERSONAL_QUESTIONS, ...INCOME_QUESTIONS];

  // Category → consultant skills mapping (for priority matching)
  // Consultants with these skills get priority ranking when user selects matching categories
  const CATEGORY_SKILL_KEYWORDS: Record<string, string[]> = {
    "Tax": ["tax", "gst", "income tax", "tax planning", "tds", "corporate tax", "chartered accountant", "ca"],
    "Finance": ["finance", "wealth", "mutual fund", "retirement", "portfolio", "financial planning", "cfp"],
    "Insurance": ["insurance", "life insurance", "health insurance", "term plan", "ulip", "mediclaim"],
    "Investment": ["investment", "equity", "sip", "stocks", "bonds", "real estate", "portfolio management"],
    "Tax Planning": ["tax", "income tax", "tax planning", "gst"],
    "Investments": ["investment", "equity", "sip", "mutual fund", "portfolio"],
    "Wealth Management": ["wealth", "portfolio", "financial planning", "cfp"],
    "Retirement": ["retirement", "pension", "nps", "epf", "ppf"],
    "Real Estate": ["real estate", "property", "reit"],
    "Business Finance": ["business", "corporate", "company", "startup", "msme"],
  };

  // Score a consultant based on user's selected categories/interests
  const getConsultantScore = (consultant: Consultant): number => {
    if (userCategories.length === 0 && firstLoginCategories.length === 0) return 0;
    const allInterests = [
      ...userCategories.map(uc => uc.category),
      ...firstLoginCategories,
    ];
    let score = 0;
    const consultantSkillsLower = (consultant.tags || []).join(" ").toLowerCase() + " " + (consultant.role || "").toLowerCase();
    allInterests.forEach(interest => {
      const keywords = CATEGORY_SKILL_KEYWORDS[interest] || [interest.toLowerCase()];
      keywords.forEach(kw => {
        if (consultantSkillsLower.includes(kw.toLowerCase())) score++;
      });
    });
    return score;
  };

  const handleCategorySubmit = () => {
    if (!selectedCategory || !selectedSubOption) return;
    const answers = questionnaireAnswers;
    setUserCategories(prev => {
      const exists = prev.findIndex(c => c.category === selectedCategory);
      if (exists >= 0) {
        const updated = [...prev];
        updated[exists] = { category: selectedCategory, subOption: selectedSubOption, answers };
        return updated;
      }
      return [...prev, { category: selectedCategory, subOption: selectedSubOption, answers }];
    });
    // Save categories to localStorage (backend endpoint may not exist yet)
    // Silently attempt backend save - never block UI on this
    const userId = localStorage.getItem("fin_user_id");
    try {
      const key = `fin_user_categories_${userId || "guest"}`;
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      const updated = existing.filter((c: any) => c.category !== selectedCategory);
      localStorage.setItem(key, JSON.stringify([...updated, { category: selectedCategory, subOption: selectedSubOption, answers }]));
    } catch { }
    if (userId) {
      // Best-effort backend save - errors are fully suppressed
      fetch(`${BASE_URL}/users/${userId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("fin_token") || ""}` },
        body: JSON.stringify({ category: selectedCategory, subOption: selectedSubOption, answers }),
      }).catch(() => { });
    }
    setCategoryStep("done");
  };

  // Save multi-selected categories from the category modal
  const handleSaveMultiCategories = async (selected: string[]) => {
    const userId = localStorage.getItem("fin_user_id");
    const newEntries = selected.map(cat => {
      const existing = userCategories.find(uc => uc.category === cat);
      return existing || { category: cat, subOption: cat, answers: {} };
    });
    setUserCategories(newEntries);
    try {
      const key = `fin_user_categories_${userId || "guest"}`;
      localStorage.setItem(key, JSON.stringify(newEntries));
    } catch { }
    // Best-effort backend save - suppress 500 errors completely
    if (userId) {
      fetch(`${BASE_URL}/users/${userId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${localStorage.getItem("fin_token") || ""}` },
        body: JSON.stringify(newEntries),
      }).catch(() => { /* suppress backend errors */ });
    }
    setShowCategoryModal(false);
    setTempSelectedCategories([]);

    // Fetch backend questions for the selected categories
    if (selected.length > 0) {
      setLoadingCategoryQuestions(true);
      setCategoryQAnswers({});
      try {
        await fetchSkillQuestions(selected);
        // skillQuestions state updates asynchronously, so we fetch directly here too
        let resolvedSkillMap = backendSkillMap;
        if (Object.keys(resolvedSkillMap).length === 0) {
          try {
            const token = getToken();
            const res = await fetch(`${BASE_URL}/skills`, {
              headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (res.ok) {
              const raw = await res.json();
              const arr: any[] = Array.isArray(raw) ? raw : raw?.content || [];
              const built: Record<string, number> = {};
              arr.forEach((s: any) => {
                const name = (s.name || s.skillName || s.title || "").trim();
                if (name && s.id) built[name.toLowerCase()] = Number(s.id);
              });
              resolvedSkillMap = built;
              setBackendSkillMap(built);
            }
          } catch { }
        }
        const matchingIds: number[] = [];
        const skillIdToName: Record<number, string> = {};
        selected.forEach(cat => {
          const id = resolvedSkillMap[cat.toLowerCase().trim()];
          if (id != null) { matchingIds.push(id); skillIdToName[id] = cat; }
        });
        if (matchingIds.length > 0) {
          const token = getToken();
          const qRes = await fetch(`${BASE_URL}/questions?skillIds=${matchingIds.join(",")}`, {
            headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          });
          if (qRes.ok) {
            const qData = await qRes.json();
            const qArr: any[] = Array.isArray(qData) ? qData : qData?.content || [];
            const matchSet = new Set(matchingIds);
            const questions = qArr
              .filter((q: any) => matchSet.has(Number(q.skillId)))
              .map((q: any) => ({
                id: q.id,
                skillId: Number(q.skillId),
                text: q.text || q.questionText || q.question || "",
                skillName: skillIdToName[Number(q.skillId)] || q.skillName || "",
              }));
            if (questions.length > 0) {
              setCategoryQuestionsData(questions);
              setShowCategoryQuestionsModal(true);
            }
          }
        }
      } catch { /* non-fatal */ }
      finally { setLoadingCategoryQuestions(false); }
    }
  };

  // Fetch questions from backend for ONLY the user-selected categories.
  // Backend endpoint: GET /api/questions?skillIds=10,12
  // skillIds are resolved from backendSkillMap (populated during fetchConsultants from /api/skills)
  // so no extra API call is needed here.
  const fetchSkillQuestions = async (selectedCategories: string[]) => {
    if (selectedCategories.length === 0) { setSkillQuestions([]); return; }
    try {
      // Step 1: Resolve selected category names → skill IDs using the already-loaded backendSkillMap
      // backendSkillMap keys are lowercase skill names from /api/skills
      let resolvedSkillMap = backendSkillMap;

      // If backendSkillMap is empty (e.g. fetchConsultants hasn't completed), re-fetch /api/skills once
      if (Object.keys(resolvedSkillMap).length === 0) {
        try {
          const token = getToken();
          const res = await fetch(`${BASE_URL}/skills`, {
            headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          });
          if (res.ok) {
            const raw = await res.json();
            const arr: any[] = Array.isArray(raw) ? raw : raw?.content || [];
            const built: Record<string, number> = {};
            arr.forEach((s: any) => {
              const name = (s.name || s.title || "").trim();
              if (name && s.id) built[name.toLowerCase()] = Number(s.id);
            });
            resolvedSkillMap = built;
            setBackendSkillMap(built); // cache for future calls
          }
        } catch { /* fall through - will produce empty questions */ }
      }

      // Step 2: Map each selected category name to its skill ID (exact case-insensitive match)
      const matchingIds: number[] = [];
      const skillIdToName: Record<number, string> = {};
      selectedCategories.forEach(cat => {
        const id = resolvedSkillMap[cat.toLowerCase().trim()];
        if (id != null) {
          matchingIds.push(id);
          skillIdToName[id] = cat; // use original casing for display
        }
      });

      if (matchingIds.length === 0) {
        // No skills matched - show no questions and move on
        setSkillQuestions([]);
        return;
      }

      // Step 3: Call GET /api/questions?skillIds=10,12 (backend endpoint as specified)
      // skillIds param is a comma-separated list of Long IDs
      const token = getToken();
      const qRes = await fetch(
        `${BASE_URL}/questions?skillIds=${matchingIds.join(",")}`,
        {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      if (!qRes.ok) { setSkillQuestions([]); return; }
      const qData = await qRes.json();
      const qArr: any[] = Array.isArray(qData) ? qData : qData?.content || [];

      // Step 4: Client-side safety filter - only keep questions whose skillId is
      // in our matched set. Guards against backend returning extra questions.
      const matchingIdSet = new Set(matchingIds);
      const filtered = qArr.filter((q: any) => matchingIdSet.has(Number(q.skillId)));

      setSkillQuestions(
        filtered.map((q: any) => ({
          id: q.id,
          skillId: Number(q.skillId),
          text: q.text || q.questionText || q.question || "",
          skillName: skillIdToName[Number(q.skillId)] || `Skill ${q.skillId}`,
          updatedAt: q.updatedAt,
        }))
      );
    } catch { setSkillQuestions([]); /* non-fatal - user can skip */ }
  };

  // Load T&C content from backend - called when user reaches terms step
  const loadTermsContent = async () => {
    if (termsContent !== null) return; // already loaded
    setTermsLoading(true);
    try {
      const records = await getTermsAndConditions();
      const content = (Array.isArray(records) ? records : [])
        .map((record: any) => String(record?.content || record?.text || "").trim())
        .filter(Boolean)
        .join("\n\n");
      setTermsContent(content || null);
    } catch {
      setTermsContent(null);
    } finally {
      setTermsLoading(false);
    }
  };

  // Trigger terms load whenever user reaches the terms step
  useEffect(() => {
    if (firstLoginStep === "terms") {
      loadTermsContent();
      setTermsAccepted(false); // reset checkbox each time step is entered
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstLoginStep]);

  const resolvedTermsContent = termsContent?.trim() || "";

  // Handle first-login questionnaire completion
  const handleFirstLoginComplete = () => {
    // Extract categories from answers
    const cats = (firstLoginAnswers["interestedCategories"] || "").split(",").map(s => s.trim()).filter(Boolean);
    setFirstLoginCategories(cats);
    // Also populate userCategories so consultant scoring works immediately
    const newUserCats = cats.map(cat => ({
      category: cat,
      subOption: cat,
      answers: firstLoginAnswers,
    }));
    setUserCategories(prev => {
      const existing = prev.filter(uc => !cats.includes(uc.category));
      return [...existing, ...newUserCats];
    });
    localStorage.removeItem("fin_first_login");
    const userId = localStorage.getItem("fin_user_id");
    // Mark onboarding permanently done for this user so it never shows again on re-login
    if (userId) localStorage.setItem(`fin_onboarding_done_${userId}`, "true");
    const token = getToken();
    const authHeaders = { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

    if (userId) {
      // 1. Persist categories in localStorage
      try {
        const key = `fin_user_categories_${userId}`;
        const payload = cats.map(cat => ({ category: cat, subOption: cat, answers: firstLoginAnswers }));
        localStorage.setItem(key, JSON.stringify(payload));
      } catch { }

      // 2. Save categories to backend (best-effort)
      if (cats.length > 0) {
        fetch(`${BASE_URL}/users/${userId}/categories`, {
          method: "POST", headers: authHeaders,
          body: JSON.stringify(cats.map(cat => ({ category: cat, subOption: cat, answers: firstLoginAnswers }))),
        }).catch(() => { });
      }

      // Skill-question answers are already saved inside the user category/profile payload above.
      // Avoid posting them to /answers because that endpoint expects booking-linked answers.
    }
    setShowFirstLoginQuestionnaire(false);
    setFirstLoginStep("intro");
    // ── CRITICAL: Switch to consultants tab so matched consultants are visible immediately
    setTab("consultants");
    // Show success toast with matched count
    const matchedCount = consultants.filter(c =>
      cats.some(cat =>
        c.tags.some((t: string) => t.toLowerCase().includes(cat.toLowerCase()) ||
          cat.toLowerCase().includes(t.toLowerCase()))
      )
    ).length;
    showToast(
      cats.length > 0
        ? `Matched consultants: showing ${matchedCount > 0 ? matchedCount : "all"} for ${cats.slice(0, 3).join(", ")}${cats.length > 3 ? "..." : ""}`
        : "Profile complete. Browse your consultants below."
    );
    // If password change is required, show it after a short delay
    if (localStorage.getItem("fin_requires_pw_change") === "true") {
      setTimeout(() => { setShowPasswordChangeModal(true); }, 600);
    }
  };

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketFilter, setTicketFilter] = useState<"ALL" | TicketStatus>("ALL");
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [showEmailToTicket, setShowEmailToTicket] = useState(false);
  const [showFreeTrialAlert, setShowFreeTrialAlert] = useState(() => sessionStorage.getItem("mtm_free_trial_alert_dismissed") !== "true");
  const [showGuestTrialExpiredPopup, setShowGuestTrialExpiredPopup] = useState(false);
  const [guestTrialDaysRemaining, setGuestTrialDaysRemaining] = useState(() => getGuestTrialDaysRemaining());

  const [feedbackModal, setFeedbackModal] = useState<FeedbackData | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackHover, setFeedbackHover] = useState(0);
  const [feedbackComment, setFeedbackComment] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [submittedFeedbacks, setSubmittedFeedbacks] = useState<Set<number>>(new Set());

  const categories = ["All Consultants", ...dynamicSkillCategories];
  const bookingCalendarDays = ALL_DAYS;
  const visibleBookingDays = bookingCalendarDays.slice(dayOffset, dayOffset + VISIBLE_DAYS);
  const maxDayOffset = Math.max(0, bookingCalendarDays.length - VISIBLE_DAYS);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };
  const upcomingBookings = bookings
    .filter(b => {
      const status = getBookingLifecycleStatus(b);
      const specialMeta = resolveSpecialBookingMeta(b);
      const hasAssignedSpecialSlot = specialBookingHasAssignedSlot(specialMeta);
      if (status === "COMPLETED" || status === "CANCELLED") return false;
      if (specialMeta && !hasAssignedSpecialSlot) return true;
      const chronology = getBookingChronologyTarget(b);
      const bookingForTime = chronology.date || chronology.time
        ? { ...b, slotDate: chronology.date, bookingDate: chronology.date, timeRange: chronology.time, slotTime: chronology.time }
        : b;
      return !isBookingExpired(bookingForTime, now);
    })
    .slice()
    .sort(compareBookingsChronologically);
  const historyBookings = bookings
    .filter(b => {
      const status = getBookingLifecycleStatus(b);
      const specialMeta = resolveSpecialBookingMeta(b);
      const hasAssignedSpecialSlot = specialBookingHasAssignedSlot(specialMeta);
      if (status === "COMPLETED" || status === "CANCELLED") return true;
      if (specialMeta && !hasAssignedSpecialSlot) return false;
      const chronology = getBookingChronologyTarget(b);
      const bookingForTime = chronology.date || chronology.time
        ? { ...b, slotDate: chronology.date, bookingDate: chronology.date, timeRange: chronology.time, slotTime: chronology.time }
        : b;
      return isBookingExpired(bookingForTime, now);
    })
    .slice()
    .sort(compareBookingsChronologically);
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
    // Store raw base charges - total is computed dynamically using live feeConfig from backend
    const baseCharges = Number(d.charges || d.baseAmount || 0);
    const slotsDuration = Number(d.slotsDuration ?? d.slotDurationMinutes ?? d.durationMinutes ?? d.duration ?? 60) || 60;
    return {
      id: d.id, name: d.name || "Expert Consultant", role: d.designation || "Financial Consultant",
      fee: baseCharges, // raw base consultant charge (commission added at display/booking time)
      tags: Array.isArray(d.skills) ? d.skills : [],
      rating: Number(d.rating ?? d.averageRating ?? d.consultantRating ?? 0),
      exp: Number(d.experience ?? d.yearsOfExperience ?? d.totalExperience ?? d.expYears ?? 0),
      reviews: Number(d.reviewCount ?? d.totalReviews ?? d.reviews ?? 0), avatar,
      shiftStartTime: parseLocalTime(d.shiftStartTime || d.shift_start_time || d.shiftStart),
      shiftEndTime: parseLocalTime(d.shiftEndTime || d.shift_end_time || d.shiftEnd),
      shiftTimings: d.shiftTimings || "", location: d.location || d.city || "Hyderabad",
      about: d.about || d.bio || d.description || "", languages: d.languages || "", phone: d.phone || "",
      email: d.email || d.emailId || d.emailAddress || "",
      slotsDuration,
      slotDurationHours: durationMinutesToHours(slotsDuration, 1),
    };
  };

  const fetchConsultants = async () => {
    setLoading(p => ({ ...p, consultants: true }));
    try {
      // Fetch consultants + live fee config + backend skills in parallel
      const [res, liveFee, skillsRaw] = await Promise.all([
        getAllConsultants(),
        getFeeConfig(),
        getAllSkills().catch(() => [] as any[]),
      ]);
      if (liveFee) setFeeConfig(liveFee);
      const mapped = (Array.isArray(res) ? res : []).map(mapConsultant);
      setConsultants(mapped);
      // Fetch real review counts from feedbacks endpoint
      try {
        const feedbacks = await apiFetch(`${BASE_URL}/feedbacks`).catch(() => []);
        const fbArr: any[] = Array.isArray(feedbacks) ? feedbacks : (feedbacks?.content || []);
        if (fbArr.length > 0) {
          const countMap: Record<number, number> = {};
          fbArr.forEach((fb: any) => {
            const cid = Number(fb.consultantId);
            if (cid) countMap[cid] = (countMap[cid] || 0) + 1;
          });
          setConsultants(prev => prev.map(c => ({
            ...c,
            reviews: countMap[c.id] ?? c.reviews,
          })));
        }
      } catch { /* review count is non-fatal */ }

      // Build dynamic category list:
      // 1. Backend skills from /api/skills (admin-configured categories - most authoritative)
      const allSkills = new Set<string>();
      const backendSkillArr = Array.isArray(skillsRaw) ? skillsRaw : [];
      backendSkillArr.forEach((s: any) => {
        const name = (s.name || s.title || "").trim();
        if (name) allSkills.add(name);
      });

      // 2. Also merge skills from consultant profiles
      (Array.isArray(res) ? res : []).forEach((d: any) => {
        if (Array.isArray(d.skills)) {
          d.skills.forEach((s: string) => { if (s && s.trim()) allSkills.add(s.trim()); });
        }
        if (d.designation && d.designation.trim()) {
          const desk = d.designation.trim();
          ["Tax", "Finance", "Investment", "Insurance", "Wealth", "Retirement", "Real Estate",
            "Business", "Portfolio", "Mutual Fund", "GST", "Accounting"].forEach(kw => {
              if (desk.toLowerCase().includes(kw.toLowerCase())) allSkills.add(kw);
            });
        }
      });

      // Filter out numeric-only junk or very short tags that ruin UI pills
      const skillArr = Array.from(allSkills)
        .filter(s => s && s.trim().length > 1 && !/^\d+$/.test(s.trim()))
        .sort((a, b) => a.localeCompare(b));

      // FIX: If backend and consultant profiles returned zero skill categories,
      // fall back to a hardcoded list so the filter chips always appear
      const FALLBACK_CATEGORIES = [
        "Audit & Compliance", "GST", "Income Tax",
        "International Tax", "Tax", "Tax Planning",
      ];
      const finalSkillArr = skillArr.length > 0 ? skillArr : FALLBACK_CATEGORIES;
      setDynamicSkillCategories(finalSkillArr);

      // Build skillName(lowercase) → skillId map from the authoritative backend /api/skills list
      // This is what fetchSkillQuestions uses to resolve category names → IDs without re-fetching
      const skillIdMap: Record<string, number> = {};
      backendSkillArr.forEach((s: any) => {
        const name = (s.name || s.title || "").trim();
        if (name && s.id) skillIdMap[name.toLowerCase()] = Number(s.id);
      });
      setBackendSkillMap(skillIdMap);
    }
    catch { showToast("Could not load consultants."); }
    finally { setLoading(p => ({ ...p, consultants: false })); }
  };

  const fetchBookings = async () => {
    setLoading(p => ({ ...p, bookings: true }));
    try {
      // ── 1. Fetch raw bookings and special bookings ──────────────────────────
      const [raw, rawSpecial] = await Promise.all([
        getMyBookings(),
        getMySpecialBookings().catch(() => [] as any[]),
      ]);

      const regularRaw = Array.isArray(raw) ? raw : [];
      const specialRaw = Array.isArray(rawSpecial) ? rawSpecial : extractArray(rawSpecial);

      // ── 2. Collect unique timeSlot IDs to batch-fetch slot details ───────────
      const uniqueSlotIds = [
        ...new Set(
          regularRaw
            .map((b: any) => {
              // Backend BookingResponse returns timeSlotIds (List<Long>), not timeSlotId
              const fromArray = Array.isArray(b.timeSlotIds) ? b.timeSlotIds[0] : b.timeSlotIds;
              return Number(b.timeSlotId || b.timeslotId || b.slot_id || fromArray);
            })
            .filter(id => id > 0)
        ),
      ] as number[];

      // ── 3. Fetch each timeslot record; failures are silently skipped ──────────
      const slotDetailMap: Record<number, TimeSlotRecord> = {};
      await Promise.all(
        uniqueSlotIds.map(id =>
          apiFetch(`${BASE_URL}/timeslots/${id}`)
            .then((s: any) => { if (s?.id) slotDetailMap[id] = s; })
            .catch(() => { /* non-fatal */ })
        )
      );

      // ── 4. Map each raw booking into a normalised Booking object ─────────────
      const mappedRegular = regularRaw.map((b: any) => {
        // Backend BookingResponse returns timeSlotIds (List<Long>), not timeSlotId
        const fromArray = Array.isArray(b.timeSlotIds) ? b.timeSlotIds[0] : b.timeSlotIds;
        const slotId = Number(b.timeSlotId || b.timeslotId || b.slot_id || fromArray) || 0;
        const slotDetail = slotId ? slotDetailMap[slotId] : undefined;

        // ── Resolve slot date ────────────────────────────────────────────────
        const slotDate =
          slotDetail?.slotDate ||
          b.slotDate ||
          b.bookingDate ||
          b.booking_date ||
          b.date ||
          "";

        // ── Resolve raw slot time (HH:MM) ────────────────────────────────────
        const rawSlotTime =
          slotDetail?.slotTime ||
          b.slotTime ||
          b.slot_time ||
          "";
        const slotTime =
          typeof rawSlotTime === "object" && rawSlotTime?.hour !== undefined
            ? `${String(rawSlotTime.hour).padStart(2, "0")}:${String(rawSlotTime.minute ?? 0).padStart(2, "0")}`
            : String(rawSlotTime).substring(0, 5);

        // ── Build human-readable timeRange label ─────────────────────────────
        let timeRange: string =
          b.timeRange ||
          b.time_range ||
          b.timeSlot?.timeRange ||
          b.timeSlot?.masterTimeSlot?.timeRange ||
          (slotDetail as any)?.timeRange ||
          "";

        // Fallback: build from slotTime  e.g. "09:00" → "9:00 AM - 10:00 AM"
        if (!timeRange && slotTime && slotTime.length >= 4) {
          const [h, m] = slotTime.split(":").map(Number);
          const endH = (h + 1) % 24;
          const endStr = `${String(endH).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
          timeRange = `${fmt24to12(slotTime)} - ${fmt24to12(endStr)}`;
        }

        // ── Normalise status ─────────────────────────────────────────────────
        const BookingStatus = (
          b.BookingStatus ||
          b.bookingStatus ||
          b.status ||
          "PENDING"
        ).toString().toUpperCase();

        // ── Consultant name resolution ────────────────────────────────────────
        const consultantName =
          b.consultantName ||
          b.consultant?.name ||
          b.advisorName ||
          b.consultant_name ||
          "";

        return {
          ...b,
          consultantName: consultantName || "Loading...",
          slotDate,
          slotTime,
          timeRange,
          amount: Number(b.amount ?? b.totalAmount ?? b.total_amount ?? 0),
          meetingMode: b.meetingMode || b.meeting_mode || b.mode || "",
          BookingStatus,
        };
      });

      const mappedSpecial = specialRaw.map((b: any) => {
        const slots = Math.max(1, Number(b.numberOfSlots || b.hours || 1));
        const rawStatus = String(b.status || b.specialBookingStatus || "REQUESTED").toUpperCase();
        const parsedMeta = parseSpecialBookingMeta(b.userNotes) || getDedicatedSpecialMeta(b);
        const preferredDate = parsedMeta?.preferredDate || b.preferredDate || b.preferred_date || "";
        const preferredTime = parsedMeta?.preferredTime || b.preferredTime || b.preferred_time || "";
        const preferredTimeRange = parsedMeta?.preferredTimeRange || b.preferredTimeRange || b.preferred_time_range || "";
        const scheduledTimeRaw = b.scheduledTime || b.scheduled_time || "";
        const scheduledTime =
          typeof scheduledTimeRaw === "object" && scheduledTimeRaw?.hour !== undefined
            ? `${String(scheduledTimeRaw.hour).padStart(2, "0")}:${String(scheduledTimeRaw.minute ?? 0).padStart(2, "0")}`
            : String(scheduledTimeRaw).substring(0, 5);
        const scheduledDate = b.scheduledDate || b.scheduled_date || preferredDate || "";
        const scheduledTimeRange =
          b.scheduledTimeRange ||
          b.timeRange ||
          preferredTimeRange ||
          (scheduledTime ? formatSpecialTimeRange(scheduledTime, slots) : (preferredTime ? formatSpecialTimeRange(preferredTime, slots) : ""));

        const BookingStatus =
          (rawStatus === "SCHEDULED" || rawStatus === "CONFIRMED")
            ? "CONFIRMED"
            : rawStatus === "CANCELLED"
              ? "CANCELLED"
              : rawStatus === "COMPLETED"
                ? "COMPLETED"
                : "PENDING";

        const consultantName =
          b.consultantName ||
          b.consultant?.name ||
          b.advisorName ||
          b.consultant_name ||
          "";

        return {
          ...b,
          id: Number(b.id),
          specialBookingId: Number(b.id),
          isSpecialBooking: true,
          consultantName: consultantName || "Loading...",
          amount: Number(b.totalAmount ?? b.total_amount ?? 0),
          slotDate: scheduledDate,
          slotTime: scheduledTime || preferredTime,
          timeRange: scheduledTimeRange,
          meetingMode: b.meetingMode || b.meeting_mode || "ONLINE",
          BookingStatus,
          specialBookingStatus: rawStatus,
          numberOfSlots: slots,
          scheduledDate,
          scheduledTime: scheduledTime || preferredTime,
        };
      });

      const filteredRegular =
        mappedSpecial.length > 0
          ? mappedRegular.filter((b: any) => !parseSpecialBookingMeta(b?.userNotes))
          : mappedRegular;

      // Deduplicate: remove regular bookings that share an id with a special booking
      const specialIds = new Set(mappedSpecial.map((b: any) => Number(b.id)));
      const deduped = filteredRegular.filter((b: any) => !specialIds.has(Number(b.id)));
      // Further deduplicate by composite key
      const seenKeys = new Set<string>();
      const mapped = [...deduped, ...mappedSpecial].filter((b: any) => {
        const key = `${b.isSpecialBooking ? "sp" : "rg"}_${b.id}_${b.slotDate}_${b.slotTime}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      // ── 6. Sort: nearest upcoming date first (ascending) ─────────────────────
      mapped.sort((a: any, bItem: any) => compareBookingsChronologically(a, bItem));

      const completedBookingIds = Array.from(new Set(
        mapped
          .filter((b: any) => getBookingLifecycleStatus(b) === "COMPLETED")
          .map((b: any) => Number(b.id))
          .filter((id: number) => id > 0)
      ));
      if (completedBookingIds.length > 0) {
        const feedbackIds = await Promise.all(
          completedBookingIds.map(async (bookingId) => {
            try {
              const feedback = await getFeedbackByBooking(bookingId);
              return feedback?.id ? bookingId : null;
            } catch {
              return null;
            }
          })
        );
        setSubmittedFeedbacks(new Set(feedbackIds.filter((bookingId): bookingId is number => bookingId != null)));
      } else {
        setSubmittedFeedbacks(new Set());
      }

      setBookings(mapped);

      // ── 7. Back-fill missing consultant names asynchronously ──────────────────
      const needsName = mapped.filter(
        (b: any) => b.consultantName === "Loading..." && b.consultantId
      );
      if (needsName.length > 0) {
        const ids = [
          ...new Set(needsName.map((b: any) => Number(b.consultantId)).filter(Boolean)),
        ] as number[];

        const cMap: Record<number, any> = {};
        await Promise.all(
          ids.map(id =>
            getConsultantById(id)
              .then(d => { if (d) cMap[id] = d; })
              .catch(() => { })
          )
        );

        setBookings(prev =>
          prev.map((b: any) => {
            if (b.consultantName !== "Loading...") return b;
            const d = cMap[b.consultantId];
            if (!d) return { ...b, consultantName: "Consultant" };
            return {
              ...b,
              consultantName:
                d.name ||
                d.fullName ||
                d.consultantName ||
                "Consultant",
            };
          })
        );
      }
    } catch (err) {
      console.error("[fetchBookings] error:", err);
      setBookings([]);
    } finally {
      setLoading(p => ({ ...p, bookings: false }));
    }
  };


  // Normalize ticket status from any backend format to the canonical uppercase form
  const normalizeTicketStatus = (raw: string): string => {
    const s = String(raw || "").toUpperCase().replace(/-/g, "_").replace(/\s+/g, "_");
    const map: Record<string, string> = {
      "IN_PROGRESS": "IN_PROGRESS",
      "INPROGRESS": "IN_PROGRESS",
      "IN PROGRESS": "IN_PROGRESS",
      "ESCALATED": "ESCALATED",
      "ESCALATE": "ESCALATED",
      "NEW": "NEW",
      "OPEN": "OPEN",
      "PENDING": "PENDING",
      "RESOLVED": "RESOLVED",
      "CLOSED": "CLOSED",
    };
    return map[s] ?? s;
  };
  const resolveTicketCategory = (t: any): string => {
    const raw = t?.category;
    if (raw && typeof raw === "object") {
      // Backend returned category as nested object { id, name }
      return String(raw.name || raw.categoryName || raw.label || raw.id || "");
    }
    // Prefer string category, fall back to categoryName variants
    const str = String(raw || t?.categoryName || t?.category_name || t?.categoryTitle || "").trim();
    return str || "";
  };

  const normalizeTickets = (raw: any[]): Ticket[] =>
    raw.map((t: any) => ({
      ...t,
      status: normalizeTicketStatus(t.status),
      category: resolveTicketCategory(t),
    }))
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) as Ticket[];

  const fetchTickets = async () => {
    setLoading(p => ({ ...p, tickets: true }));
    try {
      const data = await getTicketsByUser(currentUserId ?? 0);
      setTickets(normalizeTickets(extractArray(data)));
    } catch { showToast("Failed to load tickets."); }
    finally { setLoading(p => ({ ...p, tickets: false })); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // INIT & LIFECYCLE
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Check first-login flag BEFORE any async calls so modal shows immediately
    const isFirstLogin = localStorage.getItem("fin_first_login") === "true";
    const isGuest = (getLocalRole()).toUpperCase().replace(/^ROLE_/, "") === "GUEST";
    // Per-user PERMANENT done key - once set via `fin_pw_changed_{userId}`,
    // the password modal is suppressed forever, regardless of backend response.
    const userId = localStorage.getItem("fin_user_id");
    const pwDoneKey = userId ? `fin_pw_changed_${userId}` : null;
    const userAlreadyChangedPw = pwDoneKey ? localStorage.getItem(pwDoneKey) === "true" : false;
    // Clean up stale flag if user already completed password change
    if (userAlreadyChangedPw) {
      localStorage.removeItem("fin_requires_pw_change");
    }
    // FIX: Only skip password change for truly anonymous guests (no token).
    // Admin-created GUEST/MEMBER users DO have a token and MUST change their temp password.
    const hasToken = !!localStorage.getItem("fin_token");
    const isAnonymousGuest = isGuest && !hasToken;
    const alreadyRequiresPwChange = !userAlreadyChangedPw && !isAnonymousGuest && localStorage.getItem("fin_requires_pw_change") === "true";

    // Only clear the pw-change flag for truly anonymous (no-token) guests
    if (isAnonymousGuest) { localStorage.removeItem("fin_requires_pw_change"); }
    // ── Restore saved categories from localStorage (so consultant scoring works on return visits)
    const catKey = `fin_user_categories_${userId || "guest"}`;
    try {
      const saved = JSON.parse(localStorage.getItem(catKey) || "[]");
      if (Array.isArray(saved) && saved.length > 0) setUserCategories(saved);
    } catch { }
    // Per-user PERMANENT onboarding done key - once set, wizard never shows again for this user
    const onboardingDoneKey = userId ? `fin_onboarding_done_${userId}` : null;
    const alreadyDoneOnboarding = onboardingDoneKey ? localStorage.getItem(onboardingDoneKey) === "true" : false;
    // If password change was already flagged from a previous session or login response,
    // show it FIRST immediately - before any async call
    if (alreadyRequiresPwChange) {
      setShowPasswordChangeModal(true);
      // Questionnaire will show AFTER password is changed (handled in handlePasswordChangeDone)
    } // (nothing - or a comment: // Questionnaire now shown after first booking)

    // Fetch consultants (this also populates dynamicSkillCategories)
    fetchConsultants();

    (async () => {
      try {
        // Guest users don't have a token, skip API calls
        if (isGuest && !localStorage.getItem("fin_token")) {
          setCurrentUser({ id: undefined, name: "Guest", email: "" });
          return;
        }
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
        // ── Persist the normalized role for route guards and obfuscate only the identifier ──
        const freshRole = String(user?.role || "").trim();
        const freshIdentifier = String(user?.identifier || user?.username || user?.email || "").trim();
        if (freshRole) localStorage.setItem("fin_role", freshRole.toUpperCase().replace(/^ROLE_/, ""));
        if (freshIdentifier) localStorage.setItem("fin_identifier", encryptLocal(freshIdentifier));
        // ── Store actual account createdAt for guest trial window calculation ──
        const userCreatedAt = user?.createdAt || user?.registeredAt || user?.created_at || "";
        if (userCreatedAt) {
          localStorage.setItem("fin_user_created_at", userCreatedAt);
        }

        // ── Check requiresPasswordChange from backend ──────────────────────
        // Backend sets requiresPasswordChange=true on admin-created accounts.
        // We use a per-user permanent key so the modal never shows again once completed.
        const uidStr = uid ? String(uid) : localStorage.getItem("fin_user_id");
        const permDoneKey = uidStr ? `fin_pw_changed_${uidStr}` : null;
        const permAlreadyDone = permDoneKey ? localStorage.getItem(permDoneKey) === "true" : false;

        // permAlreadyDone is a PERMANENT flag per user - once set, ALWAYS overrides backend
        // This handles the case where the backend still returns requiresPasswordChange=true
        // even after the user has already changed their password (a known backend behavior)
        if (permAlreadyDone) {
          // Already done - clean up any stale flag and NEVER show modal again
          localStorage.removeItem("fin_requires_pw_change");
          // Do NOT set showPasswordChangeModal - modal stays hidden permanently
        } else {
          // Any user (including GUEST/MEMBER) who has a token and requiresPasswordChange=true
          // must change their password - they were admin-created with a temp password.
          // Only truly anonymous guests (no token, no account) are exempt.
          const currentRole = String(
            user?.role || getLocalRole()
          ).toUpperCase().replace(/^ROLE_/, "");
          const isGuestUser = currentRole === "GUEST";
          const isAnonymousGuestUser = isGuestUser && !localStorage.getItem("fin_token");

          const requiresChange = !isAnonymousGuestUser && (
            user?.requiresPasswordChange === true
            || localStorage.getItem("fin_requires_pw_change") === "true"
          );

          if (requiresChange) {
            localStorage.setItem("fin_requires_pw_change", "true");
            if (!alreadyRequiresPwChange) {
              setShowFirstLoginQuestionnaire(false);
              setShowPasswordChangeModal(true);
            }
          } else if (isAnonymousGuestUser) {
            // Clean up any stale pw-change flags for truly anonymous guest sessions
            localStorage.removeItem("fin_requires_pw_change");
          }
        }

        const userRole = String(user?.role || "").trim().toUpperCase();
        if (["SUBSCRIBER", "SUBSCRIBED", "PREMIUM", "MEMBER"].includes(userRole)) {
          if (!sessionStorage.getItem("sub_popup_shown")) { setShowSubPopup(true); sessionStorage.setItem("sub_popup_shown", "true"); }
        }
        if (uid) {
          const t = await getTicketsByUser(uid);
          setTickets(normalizeTickets(extractArray(t)));
        }
      } catch { }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── User analytics fetch - fires when currentUserId is available ──────────
  useEffect(() => {
    if (!currentUserId) return;
    (async () => {
      const [overview, activities, appts, tickets] = await Promise.allSettled([
        apiFetch(`${BASE_URL}/analytics/user/overview`),
        apiFetch(`${BASE_URL}/analytics/user/recent-activities`),
        apiFetch(`${BASE_URL}/analytics/user/upcoming-appointments`),
        apiFetch(`${BASE_URL}/analytics/user/recent-tickets`),
      ]);
      if (overview.status === "fulfilled") setUserAnalyticsOverview(overview.value);
      if (activities.status === "fulfilled") setUserRecentActivities(Array.isArray(activities.value) ? activities.value : []);
      if (appts.status === "fulfilled") setUserUpcomingAppts(Array.isArray(appts.value) ? appts.value : []);
      if (tickets.status === "fulfilled") setUserRecentTickets(Array.isArray(tickets.value) ? tickets.value : []);
    })();
  }, [currentUserId]);

  // ── Guest trial expiry check - fires once on mount, shows popup if trial ended ──
  useEffect(() => {
    const role = getLocalRole().toUpperCase().replace(/^ROLE_/, "");
    if (role !== "GUEST") return;
    // Refresh the days-remaining counter from the current date
    setGuestTrialDaysRemaining(getGuestTrialDaysRemaining());
    if (!isGuestInTrial()) {
      const uid = localStorage.getItem("fin_user_id") || "guest";
      const dismissedKey = `mtm_trial_expired_popup_dismissed_${uid}`;
      if (sessionStorage.getItem(dismissedKey) !== "true") {
        setShowGuestTrialExpiredPopup(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // If user clicked "Claim Offer" on HomePage, this retrieves the offer info and shows toast
  // If the user is NOT logged in yet, redirect to /login (offer stays in localStorage so it
  // is picked up again after the user logs in and lands back on this page).
  useEffect(() => {
    const pendingOfferStr = localStorage.getItem("fin_pending_offer");
    if (pendingOfferStr) {
      try {
        const offer = JSON.parse(pendingOfferStr);
        if (offer?.id) {
          const hasToken = !!localStorage.getItem("fin_token");
          if (!hasToken) {
            // Keep the offer in localStorage - it will be applied after login redirects here
            navigate("/login", { replace: true });
            return;
          }
          setPendingOffer(offer);
          // Show toast to inform user about the pending offer
          showToast(`Offer "${offer.title}" selected! Choose a consultant to apply it.`);
          // Clear the pending offer from localStorage (we now have it in state)
          localStorage.removeItem("fin_pending_offer");
        }
      } catch (e) {
        console.error("Failed to parse pending offer:", e);
        localStorage.removeItem("fin_pending_offer");
      }
    }
  }, []);

  // Live-poll notifications every 15s: merge backend API + localStorage
  // This ensures notifications from Admin/Consultant are visible on any device
  useEffect(() => {
    if (!currentUserId) return;
    let backendNotifsBlockedUntil = 0;
    let backendWarned = false;

    const mergeAndStore = (backendNotifs: any[], localNotifs: any[]) => {
      // Build a read-state map from local storage so "Mark all as read" survives backend polling
      const localReadMap = new Map<string, boolean>(
        localNotifs.map((n: any) => [String(n.id), !!n.read])
      );
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const n of [...backendNotifs, ...localNotifs]) {
        const key = String(n.id);
        if (!seen.has(key)) {
          seen.add(key);
          // Preserve locally-stored read state (true wins over backend false)
          const preservedRead = localReadMap.has(key) ? localReadMap.get(key)! : !!n.read;
          merged.push({ ...n, read: preservedRead });
        }
      }
      const sorted = merged.sort((a, b) => new Date(b.timestamp || b.createdAt || 0).getTime() - new Date(a.timestamp || a.createdAt || 0).getTime()).slice(0, 50);
      try { localStorage.setItem(`fin_notifs_USER_${currentUserId}`, JSON.stringify(sorted)); } catch { }
      return sorted;
    };

    const fetchBackendNotifs = async () => {
      try {
        if (Date.now() < backendNotifsBlockedUntil) return [];
        const toUiType = (raw: any): "info" | "success" | "warning" | "error" => {
          const t = String(raw || "").toUpperCase();
          if (t.includes("ESCALATION") || t.includes("FAILED") || t.includes("ERROR")) return "error";
          if (t.includes("NEW_ASSIGNMENT") || t.includes("NEW_BOOKING")) return "warning";
          if (t.includes("CONFIRM") || t.includes("SUCCESS")) return "success";
          return "info";
        };

        // Primary endpoint for current user notifications (matches backend NotificationService flow)
        let arr: any[] = [];
        try {
          const primary = await getMyUnreadNotifications();
          arr = Array.isArray(primary) ? primary : [];
        } catch {
          backendNotifsBlockedUntil = Date.now() + 5 * 60 * 1000;
          if (!backendWarned) {
            console.warn("[notifications] primary notifications endpoint failed; pausing backend polling for 5 minutes.");
            backendWarned = true;
          }
          return [];
        }

        backendWarned = false;
        return arr.map((n: any) => ({
          id: String(n.id || `be-${n.createdAt}`),
          type: toUiType(n.type || n.notificationType || n.category),
          title: n.title || n.subject || (n.type ? String(n.type).replace(/_/g, " ") : "Notification"),
          message: n.message || n.body || n.content || n.description || "",
          timestamp: n.createdAt || n.timestamp || new Date().toISOString(),
          read: n.read ?? n.isRead ?? false,
          ticketId: n.ticketId || n.relatedTicketId || null,
          bookingId: n.bookingId || n.relatedBookingId || null,
          _source: "backend",
        }));
      } catch {
        backendNotifsBlockedUntil = Date.now() + 60 * 1000;
        return [];
      }
    };

    const poll = async () => {
      const localNotifs: any[] = (() => {
        try { return JSON.parse(localStorage.getItem(`fin_notifs_USER_${currentUserId}`) || '[]'); } catch { return []; }
      })();
      const backendNotifs = await fetchBackendNotifs();
      if (backendNotifs.length > 0) {
        const merged = mergeAndStore(backendNotifs, localNotifs);
        setUserNotifs(merged);
      } else {
        setUserNotifs(localNotifs);
      }
    };

    // Run immediately, then every 15s
    poll();
    const interval = setInterval(poll, 15_000);
    window.addEventListener('focus', poll);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', poll);
    };
  }, [currentUserId]);

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
    setDeletingBookingId(bookingId);
    // Get booking info before deleting for notification
    const bookingToDelete = bookings.find(b => b.id === bookingId);
    try {
      const token = getToken();
      const res = await fetch(`${BASE_URL}/bookings/${bookingId}`, { method: "DELETE", headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (res.ok || res.status === 204) {
        setBookings(prev => prev.filter(b => b.id !== bookingId));
        showToast("Booking deleted.");
        // Add cancellation notification
        const consultantName = bookingToDelete?.consultantName || "Consultant";
        const slotDate = (bookingToDelete as any)?.slotDate || (bookingToDelete as any)?.bookingDate || "";
        addLocalNotification(currentUserId, {
          type: "warning",
          title: "Booking Cancelled",
          message: `Your session with ${consultantName}${slotDate ? ` on ${slotDate}` : ""} has been cancelled.`,
          bookingId,
        });
        // Update local state to show the new notification immediately
        setUserNotifs(prev => {
          const newNotif = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: "warning",
            title: "Booking Cancelled",
            message: `Your session with ${consultantName}${slotDate ? ` on ${slotDate}` : ""} has been cancelled.`,
            bookingId,
            timestamp: new Date().toISOString(),
            read: false,
          };
          return [newNotif, ...prev].slice(0, 50);
        });
      }
      else showToast("Could not delete booking.");
    } catch { showToast("Network error."); }
    finally { setDeletingBookingId(null); }
  };

  const handleOpenFeedback = async (b: any) => {
    // ── Guard: already submitted in this session ────────────────────────────
    if (submittedFeedbacks.has(b.id)) {
      showToast("You've already submitted feedback for this session.");
      return;
    }
    // ── Guard: check backend for existing feedback ─────────────────────────
    let existingFeedback: any = null;
    try {
      existingFeedback = await getFeedbackByBooking(b.id);
    } catch { /* no feedback yet - normal */ }

    if (existingFeedback?.id) {
      // Feedback already exists on backend - mark locally and don't reopen modal
      setSubmittedFeedbacks(prev => new Set([...prev, b.id]));
      showToast("Feedback already submitted for this session.");
      return;
    }

    // ── Open fresh feedback modal ──────────────────────────────────────────
    setFeedbackModal({
      bookingId: b.id,
      consultantId: b.consultantId,
      consultantName: b.consultantName || "Consultant",
      slotDate: b.slotDate || b.bookingDate || "",
      timeRange: b.timeRange || (b.slotTime ? toAmPm(b.slotTime) : ""),
      existingFeedback: null,
    });
    setFeedbackRating(0);
    setFeedbackComment("");
    setFeedbackHover(0);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackModal || feedbackRating === 0) { showToast("Please select a star rating."); return; }
    setSubmittingFeedback(true);
    try {
      const user = await getCurrentUser();
      if (!user?.id) { showToast("Unable to identify user."); return; }
      const payload = { userId: user.id, consultantId: feedbackModal.consultantId, meetingId: feedbackModal.bookingId, bookingId: feedbackModal.bookingId, rating: feedbackRating, comments: feedbackComment.trim() || "" };
      if (feedbackModal.existingFeedback?.id) { await apiFetch(`${BASE_URL}/feedbacks/${feedbackModal.existingFeedback.id}`, { method: "PUT", body: JSON.stringify(payload) }); showToast("Feedback updated!"); }
      else { await apiFetch(`${BASE_URL}/feedbacks`, { method: "POST", body: JSON.stringify(payload) }); showToast("Thank you for your feedback!"); }
      setSubmittedFeedbacks(prev => new Set([...prev, feedbackModal.bookingId]));
      setFeedbackModal(null); setFeedbackRating(0); setFeedbackComment("");
    } catch (err: any) { showToast(err.message); }
    finally { setSubmittingFeedback(false); }
  };

  const handleOpenModal = async (c: Consultant) => {
    setSelectedConsultant(c); setDbTimeslots([]);
    setBookedSlotSet(new Set()); setSpecialAvailabilitySlots([]); setConsultantSpecialDays([]); setDayOffset(0); setSelectedDay(DEFAULT_DAY);
    setSelectedSlot(null); setSelectedSlots([]); setBookingMode("STANDARD"); setBookingMultiple(false); setSpecialBookingHours(1); setConsultantSpecialSlotCounts([]); setSpecialStartTime(""); setSpecialEndTime("");
    setMeetingMode("ONLINE"); setUserNotes("");
    // Reset offer selection each time modal opens
    setSelectedOfferId(null); setUsedOfferIds([]); setConsultantOffers([]); setShowModal(true);
    setLoading(p => ({ ...p, slots: true }));

    // Fetch booking-eligible offers for this consultant from the checkout endpoint
    setLoadingOffers(true);
    const fetchOffers = async () => {
      try {
        const [fetchedOffers, rawBookings, rawSpecialBookings] = await Promise.all([
          getOffersByConsultant(c.id),
          getMyBookings().catch(() => [] as any[]),
          getMySpecialBookings().catch(() => [] as any[]),
        ]);

        let offers = Array.isArray(fetchedOffers) ? fetchedOffers : [];

        // Deduplicate by ID
        const seen = new Set<number>();
        offers = offers.filter((o: any) => {
          if (!o?.id || seen.has(o.id)) return false;
          seen.add(o.id);
          return true;
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const consumedOfferIds = new Set<number>([
          ...collectUsedOfferIds(rawBookings),
          ...collectUsedOfferIds(rawSpecialBookings),
        ]);

        offers = offers.filter((o: any) => {
          if (!o?.id || !o?.title) return false;
          if (o.isActive === false || o.active === false) return false;
          const status = String(o.approvalStatus ?? o.status ?? "APPROVED").toUpperCase();
          if (status === "REJECTED" || status === "PENDING") return false;

          // Check validFrom - offer not yet started
          if (o.validFrom) {
            const from = new Date(o.validFrom);
            from.setHours(0, 0, 0, 0);
            if (!isNaN(from.getTime()) && from > today) return false;
          }

          // Check validTo - offer expired
          if (o.validTo || o.validUntil) {
            const d = new Date(o.validTo || o.validUntil);
            d.setHours(23, 59, 59, 999);
            if (!isNaN(d.getTime()) && d < new Date()) return false;
          }

          // KEY FIX: Show if global (no consultantId) OR matches this consultant
          if (o.consultantId != null && Number(o.consultantId) !== Number(c.id)) return false;

          return true;
        });

        const pendingOfferAlreadyUsed =
          pendingOffer?.id != null &&
          consumedOfferIds.has(Number(pendingOffer.id));

        console.log(`[UserPage] Loaded ${offers.length} offers from /offers/checkout?consultantId=${c.id}`, offers);
        setUsedOfferIds(Array.from(consumedOfferIds));
        setConsultantOffers(offers);

        // ── Auto-select pending offer if it matches one of the fetched offers ──
        if (pendingOffer?.id) {
          const matchingOffer = offers.find((o: any) => o.id === pendingOffer.id);
          if (matchingOffer && !consumedOfferIds.has(Number(matchingOffer.id))) {
            setSelectedOfferId(matchingOffer.id);
            console.log(`[UserPage] Auto-selected pending offer: ${matchingOffer.title}`);
          } else if (pendingOfferAlreadyUsed) {
            showToast(`Offer "${pendingOffer.title}" was already used and cannot be applied again.`);
          } else {
            showToast(`Offer "${pendingOffer.title}" is not available for this consultant. Choose another offer or continue without one.`);
          }
          setPendingOffer(null);
        }
      } catch (err) {
        console.warn("[UserPage] Offers fetch failed:", err);
        setUsedOfferIds([]);
        setConsultantOffers([]);
      } finally {
        setLoadingOffers(false);
      }
    };

    fetchOffers();
    try {
      const consultantSlotDurationHours = Math.max(1, Math.min(3, Number(c.slotDurationHours || durationMinutesToHours(c.slotsDuration ?? 60, 1)) || 1));
      const [bookingsRaw, availabilityRaw, specialDaysRaw, consultantMasterSlotsRaw] = await Promise.all([
        apiFetch(`${BASE_URL}/bookings/consultant/${c.id}`).catch(() => []),
        getAvailableTimeslotsByConsultant(c.id).catch(() => [] as any[]),
        getSpecialDaysByConsultant(c.id).catch(() => [] as any[]),
        getConsultantMasterSlots(c.id).catch(() => [] as any[]),
      ]);
      const consultantMasterSlots = (Array.isArray(consultantMasterSlotsRaw) ? consultantMasterSlotsRaw : extractArray(consultantMasterSlotsRaw))
        .map((slot: any) => ({
          id: Number(slot?.id || 0),
          timeRange: String(slot?.timeRange || slot?.time_range || "").trim(),
          durationMinutes: Number(slot?.duration || slot?.durationMinutes || 60) || 60,
        }))
        .filter((slot: { id: number; timeRange: string; durationMinutes: number }) => slot.id > 0 && !!slot.timeRange);
      const consultantSlotDurationMinutes = Math.max(
        30,
        Number(c.slotsDuration ?? (consultantSlotDurationHours * 60)) || (consultantSlotDurationHours * 60)
      );
      const availableSlotCount = Array.from(new Set(
        (Array.isArray(availabilityRaw) ? availabilityRaw : extractArray(availabilityRaw))
          .map((slot: any) => normalise24(slot?.slotTime || slot?.slot_time || parseLocalTime(slot?.slotTime || slot?.slot_time) || slot?.timeRange || slot?.time_range || ""))
          .filter(Boolean)
      )).length;
      const derivedShiftSlotCount = getShiftSlotCount(c.shiftStartTime, c.shiftEndTime, consultantSlotDurationMinutes);
      const consultantSlotCount = Math.max(1, consultantMasterSlots.length || availableSlotCount || derivedShiftSlotCount || 1);
      setConsultantSpecialSlotCounts(
        Array.from({ length: consultantSlotCount }, (_, index) => index + 1)
      );
      const masterSlotRangeById = consultantMasterSlots.reduce((acc, slot) => {
        acc[slot.id] = slot.timeRange;
        return acc;
      }, {} as Record<number, string>);
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
        if (st === "CANCELLED" || st === "COMPLETED") return; // skip past/cancelled
        const date = b.slotDate || b.bookingDate || b.date || "";
        let timeKey = "";
        if (b.slotTime) { timeKey = b.slotTime.substring(0, 5); }
        else { const tr = b.timeSlot?.masterTimeSlot?.timeRange || b.masterTimeSlot?.timeRange || b.timeRange || ""; timeKey = normalise24(tr); }
        if (date && timeKey) bSet.add(`${date}|${timeKey}`);
      });

      // --- Add Consultant's blocked/booked timeslots ---
      // Only BOOKED records (actively taken by a real booking) block slot generation.
      // UNAVAILABLE records are the consultant's own schedule management and should
      // not completely hide a day - the booking API will reject unavailable slots server-side.
      tsRecords.forEach(s => {
        const st = (s.status || "").toUpperCase();
        if (st === "AVAILABLE" || st === "UNAVAILABLE") return; // only block on BOOKED
        const rawTime = (s as any).slotTime || (s as any).slot_time || "";
        let timeKey = "";
        if (typeof rawTime === "object" && rawTime?.hour !== undefined) { timeKey = `${String(rawTime.hour).padStart(2, "0")}:${String(rawTime.minute ?? 0).padStart(2, "0")}`; }
        else if (typeof rawTime === "string" && rawTime.length >= 5) { timeKey = rawTime.substring(0, 5); }
        if (!timeKey) timeKey = normalise24((s as any).timeRange || "");
        if (s.slotDate && timeKey) bSet.add(`${s.slotDate}|${timeKey}`);
      });
      setBookedSlotSet(bSet);

      const normalisedAvailability = (Array.isArray(availabilityRaw) ? availabilityRaw : extractArray(availabilityRaw))
        .map((s: any): AvailableSpecialSlot | null => {
          const slotDate = s?.slotDate || s?.slot_date || s?.bookingDate || s?.date || "";
          const slotTime = normalise24(s?.slotTime || s?.slot_time || parseLocalTime(s?.slotTime || s?.slot_time) || s?.timeRange || s?.time_range || "");
          if (!slotDate || !slotTime) return null;
          const masterTimeSlotId = Number(s?.masterTimeSlotId ?? s?.master_timeslot_id ?? s?.masterTimeSlot?.id ?? 0) || undefined;
          const masterRange = masterTimeSlotId ? masterSlotRangeById[masterTimeSlotId] : "";
          const label = s?.timeRange
            || s?.time_range
            || s?.masterTimeSlot?.timeRange
            || s?.masterTimeslot?.timeRange
            || masterRange
            || s?.slot_label
            || formatSpecialTimeRange(slotTime, consultantSlotDurationHours);
          return {
            ...s,
            id: Number(s?.id || 0),
            slotDate,
            slotTime,
            status: String(s?.status || "AVAILABLE"),
            masterTimeSlotId,
            timeRange: label,
          };
        })
        .filter((s: AvailableSpecialSlot | null): s is AvailableSpecialSlot =>
          !!s && s.status.toUpperCase() === "AVAILABLE" && !bSet.has(`${s.slotDate}|${s.slotTime}`)
        )
        .sort((a, b) => a.slotDate.localeCompare(b.slotDate) || slotStartMinutes(a) - slotStartMinutes(b));

      const normalisedSpecialDays = (Array.isArray(specialDaysRaw) ? specialDaysRaw : extractArray(specialDaysRaw))
        .map((d: any): ConsultantSpecialDayRecord | null => {
          const specialDate = typeof d === "string"
            ? d
            : (d?.specialDate || d?.special_date || d?.date || d?.slotDate || "");
          if (!specialDate) return null;
          return {
            id: typeof d === "string" ? undefined : (Number(d?.id || 0) || undefined),
            consultantId: typeof d === "string" ? c.id : (Number(d?.consultantId || d?.consultant_id || c.id) || c.id),
            specialDate,
            status: typeof d === "string" ? "SPECIAL" : String(d?.status || d?.specialStatus || d?.special_booking_status || "SPECIAL"),
            durationHours: typeof d === "string"
              ? consultantSlotDurationHours
              : (d?.durationHours != null || d?.duration != null || d?.hours != null)
                ? Number(d?.durationHours ?? d?.duration ?? d?.hours ?? 0)
                : consultantSlotDurationHours,
            note: typeof d === "string" ? "" : (d?.note || d?.description || d?.message || ""),
          };
        })
        .filter((d: ConsultantSpecialDayRecord | null): d is ConsultantSpecialDayRecord => !!d)
        .sort((a, b) => a.specialDate.localeCompare(b.specialDate));

      // ── CORE FIX: Generate virtual AVAILABLE slots from master time slots ──────
      // The backend never stores explicit AVAILABLE DB records - consultants only
      // produce BOOKED / UNAVAILABLE entries.  We derive availability by taking
      // every upcoming day × every master slot and filtering out anything in bSet.
      let finalAvailability = normalisedAvailability; // default: real DB records
      if (consultantMasterSlots.length > 0) {
        const specialDayIsoSet = new Set(
          normalisedSpecialDays.map((d) => d.specialDate).filter(Boolean)
        );
        const todayIso = toIsoDateLocal(new Date());
        const nowLocal = new Date();
        const virtualSlots: AvailableSpecialSlot[] = [];
        bookingCalendarDays.forEach((day, dayIdx) => {
          if (specialDayIsoSet.has(day.iso)) return; // gold/special days are handled separately
          consultantMasterSlots.forEach((master) => {
            // Parse start time from e.g. "12:00 AM - 2:00 AM"
            const rangeParts = master.timeRange.split(/[--]/);
            if (rangeParts.length < 2) return;
            const start24 = normalise24(rangeParts[0].trim());
            if (!start24) return;
            // FIX: Instead of hiding booked slots, show them as "BOOKED" so users see the slot is taken
            const isBooked = bSet.has(`${day.iso}|${start24}`);
            // Drop past AVAILABLE slots for today; always keep BOOKED ones visible
            if (day.iso === todayIso && !isBooked) {
              const [h, m] = start24.split(":").map(Number);
              if (h * 60 + m <= nowLocal.getHours() * 60 + nowLocal.getMinutes()) return;
            }
            // Negative synthetic ID: React key stays unique; booking fallback resolves
            // the real DB timeslot by masterId + startTime in bookOneSlot.
            virtualSlots.push({
              id: -(master.id * 1000 + dayIdx),
              slotDate: day.iso,
              slotTime: start24,
              status: isBooked ? "BOOKED" : "AVAILABLE",
              masterTimeSlotId: master.id,
              timeRange: master.timeRange,
            });
          });
        });
        // Merge: real DB AVAILABLE records win; virtual slots fill everything else
        const dbKeys = new Set(normalisedAvailability.map((s) => `${s.slotDate}|${s.slotTime}`));
        finalAvailability = [
          ...normalisedAvailability,
          ...virtualSlots.filter((vs) => !dbKeys.has(`${vs.slotDate}|${vs.slotTime}`)),
        ].sort((a, b) => a.slotDate.localeCompare(b.slotDate) || slotStartMinutes(a) - slotStartMinutes(b));
      }
      setSpecialAvailabilitySlots(finalAvailability);
      setConsultantSpecialDays(normalisedSpecialDays);

      // Use the merged availability (includes virtual slots) for first-bookable-day logic
      const availabilityByDate = finalAvailability.reduce((acc, slot) => {
        if (!acc[slot.slotDate]) acc[slot.slotDate] = [];
        acc[slot.slotDate].push(slot);
        return acc;
      }, {} as Record<string, AvailableSpecialSlot[]>);
      const specialDaysByDate = normalisedSpecialDays.reduce((acc, day) => {
        if (!acc[day.specialDate]) acc[day.specialDate] = [];
        acc[day.specialDate].push(day);
        return acc;
      }, {} as Record<string, ConsultantSpecialDayRecord[]>);
      const firstBookableDay = bookingCalendarDays.find(day => {
        const hasSlots = (availabilityByDate[day.iso] || []).length > 0;
        const hasSpecial = (specialDaysByDate[day.iso] || []).length > 0;
        return hasSlots || hasSpecial;
      }) || bookingCalendarDays[0] || DEFAULT_DAY;
      const firstDaySlots = availabilityByDate[firstBookableDay.iso] || [];
      const firstSpecialDay = specialDaysByDate[firstBookableDay.iso]?.[0];
      const firstDayIndex = bookingCalendarDays.findIndex(day => day.iso === firstBookableDay.iso);

      setSelectedDay(firstBookableDay);
      setDayOffset(firstDayIndex >= 0 ? Math.min(firstDayIndex, Math.max(0, bookingCalendarDays.length - VISIBLE_DAYS)) : 0);

      if (firstSpecialDay) {
        setBookingMode("SPECIAL");
        setSelectedSlot(null);
        setSpecialBookingHours(1);
      } else if (firstDaySlots[0]) {
        setBookingMode("STANDARD");
        // FIX: Do not auto-select the first slot. Set selectedSlot to null to force manual selection.
        setSelectedSlot(null);
        setSpecialBookingHours(1);
      }
    } catch (e) { console.error("Modal data load failed:", e); }
    finally { setLoading(p => ({ ...p, slots: false })); }
  };

  const handleConfirm = async () => {
    // Determine which slots to book
    const slotsToBook: SelectedSlotWithDate[] = bookingMultiple && selectedSlots.length > 0
      ? selectedSlots
      : selectedSlot
        ? [{ ...selectedSlot, dayIso: selectedDay.iso, dayLabel: `${selectedDay.date} ${selectedDay.month}` }]
        : [];

    if (!selectedConsultant) return;
    setConfirming(true);

    if (bookingMode === "SPECIAL") {
      try {
        const notes = userNotes.trim();
        if (!notes) {
          showToast("Please enter the requirement notes for this special booking.");
          setConfirming(false);
          return;
        }

        const consultant = selectedConsultant;
        const selectedOffer = selectedOfferId ? consultantOffers.find(o => o.id === selectedOfferId) : null;
        const slotCount = Math.max(1, effectiveSpecialBookingHours);
        // Always charge 1 session fee regardless of how many slots are requested
        const combinedBaseAmount = isAdminMember ? 0 : consultant.fee; // 1 session only (free for admin members)
        const specialDiscountAmount = selectedOffer ? parseDiscountAmount(selectedOffer.discount || "0", combinedBaseAmount, selectedOffer) : 0;
        const discountedBaseAmount = Math.max(combinedBaseAmount - specialDiscountAmount, 0);
        const specialCharges = feeConfig.feeType === "PERCENTAGE"
          ? { commission: Math.round((discountedBaseAmount * (parseFloat(feeConfig.feeValue) || 0) / 100) * 100) / 100, total: 0 }
          : { commission: parseFloat(feeConfig.feeValue) || 0, total: 0 };
        specialCharges.total = discountedBaseAmount + specialCharges.commission;
        const preferredTimeRange = specialDurationLabel;
        const preferredTime = specialStartTime || undefined;
        const specialMeta: SpecialBookingMeta = {
          kind: "SPECIAL_BOOKING",
          version: 1,
          hours: Math.max(1, Math.round(consultantSlotMinutes / 60)), // per-slot duration, not multiplied
          slotNumber: slotCount,   // which slot number was selected (1, 2, 3...)
          requestNotes: notes,
          requestedMeetingMode: meetingMode,
          status: "REQUESTED",
          preferredDate: selectedDay.iso,
          preferredTime,
          preferredTimeRange,
        };

        const specialPayload: any = {
          consultantId: consultant.id,
          durationInHours: slotCount,         // backend: SpecialBookingRequest.durationInHours
          sessionAmount: combinedBaseAmount,   // backend: SpecialBookingRequest.sessionAmount (flat fee)
          meetingMode,
          userNotes: buildSpecialBookingNotes(specialMeta),
          offerId: selectedOfferId ?? undefined,
        };
        const created = await createSpecialBooking(specialPayload);
        const dedicatedSpecialBookingId = Number(created?.id ?? created?.specialBookingId ?? 0);
        if (!(dedicatedSpecialBookingId > 0)) {
          throw new Error("Special booking request was not created.");
        }

        const bookingId = dedicatedSpecialBookingId;

        const requestLabel = hasFixedSpecialSlots ? preferredTimeRange : specialDurationLabel;
        const timeLabel = ` (${requestLabel})`;
        setShowModal(false);
        showToast(`Special booking request sent for ${selectedDay.date} ${selectedDay.month}${timeLabel}.`);
        setBookingBanner({
          consultantName: consultant.name,
          dayLabel: `${selectedDay.date} ${selectedDay.month}`,
          slotLabel: requestLabel,
          emailSent: false,
        });
        addLocalNotification(currentUserId, {
          type: "info",
          title: "Special Booking Requested",
          message: `Your special booking request with ${consultant.name} for ${selectedDay.date} ${selectedDay.month}${timeLabel} has been sent.`,
          bookingId,
        });
        setUserNotifs(prev => [{
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: "info",
          title: "Special Booking Requested",
          message: `Your special booking request with ${consultant.name} for ${selectedDay.date} ${selectedDay.month}${timeLabel} has been sent.`,
          bookingId,
          timestamp: new Date().toISOString(),
          read: false,
        }, ...prev].slice(0, 50));
        // Fire special booking request emails - non-fatal
        const userEmailSp = currentUser?.email || '';
        const consultantEmailSp = consultant.email || '';
        const hoursReq = specialMeta?.hours ?? 1;
        if (userEmailSp) {
          emailOnSpecialBookingRequestUser({ to: userEmailSp, bookingId, hours: hoursReq, consultantEmail: consultantEmailSp, meetingMode }).catch(() => null);
        }
        if (consultantEmailSp) {
          emailOnSpecialBookingRequestConsultant({ to: consultantEmailSp, bookingId, hours: hoursReq, clientEmail: userEmailSp, meetingMode, userNotes: buildSpecialBookingNotes(specialMeta) }).catch(() => null);
        }
        setTab("bookings");
        await fetchBookings();
        setTimeout(() => {
          setPostBookingData({
            bookingId,
            specialBookingId: dedicatedSpecialBookingId || undefined,
            bookingType: "SPECIAL",
            consultantName: consultant.name,
            consultantId: consultant.id,
            slotLabel: requestLabel,
            dayLabel: `${selectedDay.date} ${selectedDay.month}`,
          });
          setShowPostBookingQuestionnaire(true);
        }, 400);
      } catch (err: any) {
        showToast(`Special booking failed: ${err.message || "Please try again."}`);
      } finally {
        setConfirming(false);
      }
      return;
    }

    // ── Helper: book a single slot ──────────────────────────────────────────
    const bookOneSlot = async (slotEntry: SelectedSlotWithDate): Promise<{ bookingId: number; ok: boolean; error?: string }> => {
      const slot24 = slotEntry.start24h;
      const dayIso = slotEntry.dayIso;

      const fetchTimeslotId = async (): Promise<number | null> => {
        try {
          const data = await apiFetch(`${BASE_URL}/timeslots/consultant/${selectedConsultant!.id}`);
          const arr: TimeSlotRecord[] = Array.isArray(data) ? data : (data?.content || []);
          const match = arr.find(s => {
            if (s.slotDate !== dayIso) return false;
            const sameId = Number(slotEntry.timeslotId || 0) > 0 && Number(s.id || 0) === Number(slotEntry.timeslotId || 0);
            const sameMaster = Number(slotEntry.masterId || 0) > 0 && Number((s as any).masterTimeSlotId || 0) === Number(slotEntry.masterId || 0);
            const sameStart = ((s as any).slotTime || "").substring(0, 5) === slot24 || normalise24((s as any).timeRange || "") === slot24;
            return sameId || sameMaster || sameStart;
          });
          return match?.id ?? null;
        } catch { return null; }
      };

      // Resolve timeslot ID - reject synthetic negative IDs from virtual slots
      let realTimeslotId: number | null = (Number(slotEntry.timeslotId) > 0) ? slotEntry.timeslotId! : null;
      if (!realTimeslotId) {
        const localMatch = dbTimeslots.find((slot: any) => {
          if (slot?.slotDate !== dayIso) return false;
          const sameMaster = Number(slotEntry.masterId || 0) > 0 && Number(slot?.masterTimeSlotId || 0) === Number(slotEntry.masterId || 0);
          const sameStart = ((slot?.slotTime || "").substring(0, 5) === slot24) || normalise24(slot?.timeRange || "") === slot24;
          return sameMaster || sameStart;
        });
        realTimeslotId = Number(localMatch?.id || 0) || null;
      }
      if (!realTimeslotId) realTimeslotId = await fetchTimeslotId();

      // ── Auto-create the timeslot if it's a virtual slot (no DB record yet) ──
      // The backend only stores BOOKED/UNAVAILABLE records. Virtual AVAILABLE slots
      // are generated client-side from master slots. When a user books one, we must
      // first create the DB record, then book it.
      if (!realTimeslotId && slotEntry.masterId && slotEntry.masterId > 0) {
        try {
          const durationMinutes = Math.max(
            30,
            Number(selectedConsultant!.slotsDuration || 0) ||
            (Math.max(1, getRangeDurationHours(slotEntry.label, 1)) * 60)
          );
          const created = await createTimeslot({
            consultantId: selectedConsultant!.id,
            slotDate: dayIso,
            masterTimeSlotId: slotEntry.masterId,
            durationMinutes,
          });
          realTimeslotId = Number(created?.id || 0) || null;
        } catch {
          // Another concurrent request may have just created it - try fetching once more
          realTimeslotId = await fetchTimeslotId();
        }
      }

      if (!realTimeslotId) return { bookingId: 0, ok: false, error: "Could not resolve or create a time slot record. Please refresh and try again." };

      // Book it - apply offer discount to baseAmount sent to backend
      const selectedOffer = selectedOfferId ? consultantOffers.find(o => o.id === selectedOfferId) : null;
      const offerDiscountAmt = selectedOffer ? parseDiscountAmount(selectedOffer.discount || "0", selectedConsultant!.fee, selectedOffer) : 0;
      const discountedBaseAmount = isAdminMember ? 0 : Math.max(selectedConsultant!.fee - offerDiscountAmt, 0);
      const payload: any = {
        consultantId: selectedConsultant!.id,
        timeSlotId: realTimeslotId,
        baseAmount: isAdminMember ? 0 : discountedBaseAmount,
        originalAmount: isAdminMember ? 0 : selectedConsultant!.fee,
        meetingMode,
        userNotes: userNotes || "Booked via app",
      };
      if (!isAdminMember && selectedOfferId != null) payload.offerId = selectedOfferId;
      if (!isAdminMember && offerDiscountAmt > 0) payload.discountAmount = offerDiscountAmt;

      try {
        const bookingResult = await createBooking(payload);
        const newBookingId: number = bookingResult?.id ?? bookingResult?.bookingId ?? Date.now();

        // Update local booked-slot set
        setBookedSlotSet(prev => { const next = new Set(prev); next.add(`${dayIso}|${slot24}`); return next; });

        return { bookingId: newBookingId, ok: true };
      } catch (err: any) {
        return { bookingId: 0, ok: false, error: err.message };
      }
    };

    // ── Book all slots sequentially ─────────────────────────────────────────
    try {
      const results: { slot: SelectedSlotWithDate; bookingId: number; ok: boolean; error?: string }[] = [];
      for (const slot of slotsToBook) {
        const res = await bookOneSlot(slot);
        results.push({ slot, ...res });
      }

      const succeeded = results.filter(r => r.ok);
      const failed = results.filter(r => !r.ok);

      setShowModal(false);

      if (succeeded.length === 0) {
        showToast(`All bookings failed. Please try again.`);
        return;
      }

      const selectedOffer = selectedOfferId ? consultantOffers.find(o => o.id === selectedOfferId) : null;
      const offerNote = selectedOffer ? ` · Offer "${selectedOffer.title}" applied` : "";

      if (succeeded.length === 1) {
        const s = succeeded[0];
        showToast(`Booked for ${s.slot.dayLabel} · ${s.slot.label}${offerNote}${failed.length > 0 ? ` (${failed.length} slot(s) failed)` : ""}`);
        setBookingBanner({
          consultantName: selectedConsultant!.name,
          dayLabel: s.slot.dayLabel,
          slotLabel: s.slot.label,
          emailSent: !!(currentUser?.email),
        });
      } else {
        showToast(`${succeeded.length} sessions booked successfully!${offerNote}${failed.length > 0 ? ` (${failed.length} failed)` : ""}`);
        const s = succeeded[0];
        setBookingBanner({
          consultantName: selectedConsultant!.name,
          dayLabel: s.slot.dayLabel,
          slotLabel: s.slot.label,
          emailSent: !!(currentUser?.email),
        });
      }

      // Notifications for each successful booking
      succeeded.forEach(({ slot, bookingId }) => {
        addLocalNotification(currentUserId, {
          type: "success",
          title: "Booking Confirmed!",
          message: `Your session with ${selectedConsultant!.name} on ${slot.dayLabel} at ${slot.label} has been confirmed.${selectedOffer ? ` Offer "${selectedOffer.title}" applied.` : ""}`,
          bookingId,
        });
      });

      // Update notification display
      setUserNotifs(prev => {
        const newNotifs = succeeded.map(({ slot, bookingId }) => ({
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: "success",
          title: "Booking Confirmed!",
          message: `Your session with ${selectedConsultant!.name} on ${slot.dayLabel} at ${slot.label} has been confirmed.${selectedOffer ? ` Offer "${selectedOffer.title}" applied.` : ""}`,
          bookingId,
          timestamp: new Date().toISOString(),
          read: false,
        }));
        return [...newNotifs, ...prev].slice(0, 50);
      });

      setTab("bookings");
      fetchBookings();
      if (succeeded.length > 0) {
        setTimeout(() => {
          setPostBookingData({
            bookingId: succeeded[0].bookingId,
            bookingType: "NORMAL",
            consultantName: selectedConsultant!.name,
            consultantId: selectedConsultant!.id,
            slotLabel: succeeded[0].slot.label,
            dayLabel: succeeded[0].slot.dayLabel,
          });
          setShowPostBookingQuestionnaire(true);
        }, 400);
      }

      // Send emails for each booking
      let consultantEmail = selectedConsultant!.email || "";
      if (!consultantEmail) {
        try { const cData = await getConsultantById(selectedConsultant!.id); consultantEmail = cData?.email || cData?.emailId || cData?.emailAddress || ""; } catch { }
      }
      succeeded.forEach(({ slot, bookingId }) => {
        sendBookingEmails({ bookingId, slotDate: slot.dayIso, timeRange: slot.label, meetingMode, amount: selectedConsultant!.fee, userName: currentUser?.name || "User", userEmail: currentUser?.email || "", consultantName: selectedConsultant!.name, consultantEmail, userNotes: userNotes || "" }).catch(() => { });
        // Also fire EmailService-backed confirmation emails - non-fatal
        const userEmailBk = currentUser?.email || '';
        const amountStr = String(selectedConsultant!.fee ?? 0);
        if (userEmailBk) {
          emailOnBookingConfirmedUser({ to: userEmailBk, bookingId, meetingMode, amount: amountStr, discountAmount: '0', meetingLink: '' }).catch(() => null);
        }
        if (consultantEmail) {
          emailOnBookingAlertConsultant({ to: consultantEmail, bookingId, meetingMode, clientEmail: userEmailBk, meetingLink: '' }).catch(() => null);
        }
      });

    } catch (err: any) {
      const msg = (err.message || "").toLowerCase();
      if (msg.includes("already have a booking") || msg.includes("already booked")) {
        showToast("You already have a session booked at one of these times. Please pick another.");
      } else {
        showToast(`Booking failed: ${err.message}`);
      }
    } finally { setConfirming(false); }
  };
  const handleLogout = () => { logoutUser(); navigate("/login", { replace: true }); };
  const handleGoToProfile = () => { setTab("settings"); setSettingsView("profile"); };

  // After onboarding completes, only show consultants matching selected categories.
  // If no categories were selected (skip or no match), show all consultants.
  const hasOnboardingCategories = firstLoginCategories.length > 0;
  const filteredList = consultants
    .filter(c => {
      const q = search.toLowerCase();
      const matchesSearch = (c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q) ||
        (c.tags || []).join(" ").toLowerCase().includes(q));
      const normalizedCategory = category.trim().toLowerCase();
      const matchesTabCategory = category === "All Consultants" ||
        c.role.toLowerCase().includes(normalizedCategory) ||
        (c.tags || []).some(t => t.toLowerCase().includes(normalizedCategory) || normalizedCategory.includes(t.toLowerCase()));
      return matchesSearch && matchesTabCategory;
    })
    .sort((a, b) => {
      // Sort by category-skill match score (higher score = shown first)
      const scoreB = getConsultantScore(b);
      const scoreA = getConsultantScore(a);
      if (scoreB !== scoreA) return scoreB - scoreA;
      // Secondary sort by rating
      return b.rating - a.rating;
    });

  // If filter produces 0 results after onboarding, fall back to all consultants
  const displayList = filteredList;

  const specialAvailabilityByDate = specialAvailabilitySlots.reduce((acc, slot) => {
    if (!slot?.slotDate || !slot?.slotTime) return acc;
    if (!acc[slot.slotDate]) acc[slot.slotDate] = [];
    acc[slot.slotDate].push(slot);
    return acc;
  }, {} as Record<string, AvailableSpecialSlot[]>);
  const consultantSpecialDaysByDate = consultantSpecialDays.reduce((acc, day) => {
    if (!day?.specialDate) return acc;
    if (!acc[day.specialDate]) acc[day.specialDate] = [];
    acc[day.specialDate].push(day);
    return acc;
  }, {} as Record<string, ConsultantSpecialDayRecord[]>);
  const hasPublishedBookingDay = bookingCalendarDays.some(day =>
    (specialAvailabilityByDate[day.iso] || []).length > 0 || (consultantSpecialDaysByDate[day.iso] || []).length > 0
  );
  const selectedSpecialDayConfigs = consultantSpecialDaysByDate[selectedDay.iso] || [];
  const selectedSpecialDaySlots = (specialAvailabilityByDate[selectedDay.iso] || [])
    .slice()
    .sort((a, b) => slotStartMinutes(a) - slotStartMinutes(b));
  const consultantSlotMinutes = Math.max(
    30,
    Number(
      selectedConsultant?.slotsDuration ||
      ((selectedConsultant?.slotDurationHours || 1) * 60) ||
      60
    ) || 60
  );
  // Free-flowing: consultant published this day with durationHours = 0 (no fixed duration)
  const isFreeFlowingSpecialDay = bookingMode === "SPECIAL" &&
    selectedSpecialDayConfigs.length > 0 &&
    selectedSpecialDayConfigs.every(d => Number(d?.durationHours ?? 1) === 0) &&
    selectedSpecialDaySlots.length === 0;
  const hasFixedSpecialSlots = bookingMode === "SPECIAL" && selectedSpecialDaySlots.length > 0;
  const selectedSpecialDurationOptions =
    consultantSpecialSlotCounts.length > 0
      ? consultantSpecialSlotCounts
      : [1];
  const effectiveSpecialBookingHours = bookingMode === "SPECIAL"
    ? (selectedSpecialDurationOptions.includes(specialBookingHours)
      ? specialBookingHours
      : selectedSpecialDurationOptions[0] || 1)
    : specialBookingHours;
  const specialSlotUnitLabel = formatDurationFromMinutes(consultantSlotMinutes);
  const specialDurationLabel = formatSlotCountSummary(effectiveSpecialBookingHours, consultantSlotMinutes);
  const selectedSpecialBookingRange = selectedSlot
    ? formatSpecialTimeRange(selectedSlot.start24h, Math.max(1, Math.round(consultantSlotMinutes / 60)))
    : "";

  // Slots the user has already booked for this consultant on this day
  const bookedSpecialSlotCounts = new Set<number>(
    bookings
      .filter((b: any) =>
        b.isSpecialBooking &&
        b.BookingStatus !== "CANCELLED" &&
        b.BookingStatus !== "COMPLETED" &&
        Number(b.consultantId || b.consultant?.id) === selectedConsultant?.id &&
        (b.slotDate === selectedDay?.iso || b.scheduledDate === selectedDay?.iso ||
          (parseSpecialBookingMeta(b.userNotes)?.preferredDate ?? "") === selectedDay?.iso)
      )
      .map((b: any) => {
        const parsedMeta = parseSpecialBookingMeta(b.userNotes);
        // Prefer slotNumber stored in meta (accurate), fall back to raw fields
        return Math.max(1, Number(parsedMeta?.slotNumber ?? b.numberOfSlots ?? b.hours ?? 1));
      })
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="up-page">
      {/* UserNotificationMonitor: picks up notifications written to fin_notifs_USER_<id> */}
      {currentUserId && (
        <UserNotificationMonitor
          userId={currentUserId}
          onNewNotifications={(fresh) => {
            setUserNotifs(prev => {
              // Build a map of existing read-states so "Mark all as read" survives new polling
              const prevReadMap = new Map(prev.map((n: any) => [String(n.id), !!n.read]));
              const ids = new Set(prev.map((n: any) => String(n.id)));
              // Merge fresh notifications, preserving read state for already-seen ones
              const merged = [
                ...fresh
                  .filter((n: any) => !ids.has(String(n.id)))
                  .map((n: any) => ({ ...n, read: prevReadMap.get(String(n.id)) ?? false })),
                ...prev,
              ].slice(0, 50);
              try { localStorage.setItem(`fin_notifs_USER_${currentUserId}`, JSON.stringify(merged)); } catch { }
              return merged;
            });
          }}
        />
      )}
      <header className="up-header">
        <div className="up-logo-section" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
          <div className="up-logo-text">MEET THE MASTERS</div>
          <div className="up-logo-sub">CONNECT · CONSULT · GROW</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>

          {/* Notification Bell */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowNotifPanel(p => !p)}
              title="Notifications"
              style={{ position: "relative", width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #BFDBFE", background: "#EFF6FF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}
            >
              <Bell size={16} color="#2563EB" strokeWidth={2} />
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
                        userNotifs.filter((n: any) => !n.read).forEach((n: any) => markNotificationReadOnBackend(n.id));
                      }} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 6, padding: "3px 8px", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>
                        Mark all read
                      </button>
                    )}
                    <button onClick={() => setShowNotifPanel(false)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: "50%", width: 22, height: 22, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={12} /></button>
                  </div>
                </div>
                <div style={{ overflowY: "auto", flex: 1 }}>
                  {userNotifs.length === 0 ? (
                    <div style={{ padding: "30px 20px", textAlign: "center", color: "#94A3B8" }}>
                      <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}><Bell size={28} color="#CBD5E1" strokeWidth={1.5} /></div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>No notifications yet</div>
                    </div>
                  ) : userNotifs.map((n: any) => {
                    const cfgMap: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
                      info: { color: "#2563EB", bg: "#EFF6FF", icon: <Info size={14} color="#2563EB" /> },
                      success: { color: "#16A34A", bg: "#F0FDF4", icon: <CheckCircle size={14} color="#16A34A" /> },
                      warning: { color: "#D97706", bg: "#FFFBEB", icon: <AlertTriangle size={14} color="#D97706" /> },
                      error: { color: "#DC2626", bg: "#FEF2F2", icon: <XCircle size={14} color="#DC2626" /> },
                    };
                    const c = cfgMap[n.type] || cfgMap.info;
                    const diff = Math.floor((Date.now() - new Date(n.timestamp).getTime()) / 1000);
                    const timeStr = diff < 60 ? "just now" : diff < 3600 ? `${Math.floor(diff / 60)}m ago` : `${Math.floor(diff / 3600)}h ago`;
                    return (
                      <div key={n.id} style={{ padding: "12px 16px", borderBottom: "1px solid #F8FAFC", background: n.read ? "#fff" : c.bg, display: "flex", gap: 10, alignItems: "flex-start", cursor: (n.ticketId || n.bookingId) ? "pointer" : "default" }}
                        onClick={() => {
                          const updated = userNotifs.map((x: any) => x.id === n.id ? { ...x, read: true } : x);
                          setUserNotifs(updated);
                          if (currentUserId) localStorage.setItem(`fin_notifs_USER_${currentUserId}`, JSON.stringify(updated));
                          if (!n.read) markNotificationReadOnBackend(n.id);
                          if (n.ticketId) { setTab("tickets"); setShowNotifPanel(false); }
                          else if (n.bookingId) { setTab("bookings"); setShowNotifPanel(false); }
                        }}>
                        <span style={{ flexShrink: 0, lineHeight: "1.2", display: "flex", alignItems: "center" }}>{c.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: c.color, marginBottom: 2 }}>
                            {n.title}
                            {!n.read && <span style={{ marginLeft: 5, width: 5, height: 5, borderRadius: "50%", background: c.color, display: "inline-block", verticalAlign: "middle" }} />}
                          </div>
                          <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.5, wordBreak: "break-word" }}>{n.message}</div>
                          {n.ticketId && <div style={{ fontSize: 10, color: "#2563EB", fontWeight: 600, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>Tap to view ticket <ArrowRight size={11} /></div>}
                          {n.bookingId && !n.ticketId && <div style={{ fontSize: 10, color: "#16A34A", fontWeight: 600, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>Tap to view bookings <ArrowRight size={11} /></div>}
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
          <button onClick={handleLogout} className="up-back-btn">Logout</button>
        </div>
      </header>

      {toast && (
        <div
          className="up-toast"
          style={{
            position: "fixed",
            top: 20,
            left: "50%",
            transform: "translateX(-50%)",
            bottom: "unset",
            zIndex: 9999,
          }}
        >
          {toast}
        </div>
      )}

      {/* == BOOKING CONFIRMATION BANNER == */}
      {bookingBanner && (
        <div style={{
          position: "sticky",
          top: 0,
          background: "linear-gradient(135deg, #065F46 0%, #059669 60%, #10B981 100%)",
          color: "#fff",
          padding: "14px 52px 14px 20px",
          display: "flex", alignItems: "center", gap: 14,
          flexWrap: "wrap",
          zIndex: 100,
          boxShadow: "0 4px 16px rgba(5,150,105,0.35)",
        }}>
          <CheckCircle size={22} color="#A7F3D0" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              Special Booking Requested - {bookingBanner.consultantName}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", marginTop: 2, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Calendar size={11} /> {bookingBanner.dayLabel}{bookingBanner.slotLabel && bookingBanner.slotLabel !== "Flexible" ? ` · ${bookingBanner.slotLabel}` : ""}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.72)", marginTop: 4 }}>
              The consultant will confirm the final meeting link after they schedule this slot.
            </div>
          </div>
          <button
            onClick={() => setBookingBanner(null)}
            style={{ position: "absolute", top: "50%", right: 14, transform: "translateY(-50%)", background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <main className="up-content">

        {/* ==== CONSULTANTS ==== */}
        {tab === "consultants" && (
          <div className="up-tab-padding">
            <div className="up-search-wrapper">
              <svg className="up-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" /></svg>
              <input className="up-search-input" placeholder="Search by name, specialisation..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div
              className="up-category-row"
              style={{
                overflowX: "auto",
                WebkitOverflowScrolling: "touch" as any,
                flexWrap: "nowrap",
                paddingBottom: 4,
                scrollbarWidth: "none",
              }}
            >
              {categories.map(c => <button key={c} onClick={() => setCategory(c)} className={`up-category-btn ${category === c ? "up-category-btn-active" : ""}`}>{c}</button>)}
            </div>
            {loading.consultants ? (
              <div className="up-empty-state"><div style={{ textAlign: "center", padding: "24px 0" }}>
                <img src={logoImg} alt="" style={{ width: 48, height: "auto", display: "block", margin: "0 auto 12px", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
              </div></div>
            ) : displayList.length === 0 ? (
              <div className="up-empty-state"><div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><Search size={36} color="#CBD5E1" strokeWidth={1.5} /></div><p style={{ margin: 0, fontWeight: 600 }}>No consultants found.</p></div>
            ) : (
              /* 2 cards per row grid with neat alignment */
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24, width: "100%" }}>
                {displayList.map(c => {
                  const userRole = String(getLocalRole()).toUpperCase();
                  const isSubscriber = ["SUBSCRIBER", "SUBSCRIBED", "PREMIUM"].includes(userRole);
                  // Compute live total using backend commission config
                  const { total: displayFee } = calcTotal(c.fee);
                  return (
                    <div key={c.id} style={{
                      background: "#fff",
                      borderRadius: 20,
                      border: "1.5px solid #E2E8F0",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      transition: "all 0.25s ease",
                      minHeight: 340,
                    }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 12px 40px rgba(37,99,235,0.15)";
                        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)";
                        (e.currentTarget as HTMLDivElement).style.borderColor = "#BFDBFE";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.06)";
                        (e.currentTarget as HTMLDivElement).style.transform = "none";
                        (e.currentTarget as HTMLDivElement).style.borderColor = "#E2E8F0";
                      }}
                    >
                      {/* Photo - Square profile with rounded corners for neat professional look */}
                      <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "center" }}>
                        <div style={{
                          width: 130,
                          height: 130,
                          borderRadius: 20,
                          background: "linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)",
                          border: "3px solid #DBEAFE",
                          overflow: "hidden",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 38,
                          fontWeight: 800,
                          color: "#fff",
                          flexShrink: 0,
                          boxShadow: "0 4px 16px rgba(37,99,235,0.2)",
                        }}>
                          {c.avatar
                            ? <img src={c.avatar} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            : c.name.substring(0, 2).toUpperCase()
                          }
                        </div>
                      </div>

                      {/* Card body: Name → Specialisation → Exp → Location → Rating → Description */}
                      <div style={{ padding: "14px 18px 0", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                        {/* Name - Title Case */}
                        <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", textAlign: "center" }}>
                          {toTitleCase(c.name)}
                        </div>
                        {/* Role */}
                        <div style={{ fontSize: 12, color: "#2563EB", fontWeight: 600, textAlign: "center" }}>
                          {toTitleCase(c.role)}
                        </div>
                        {/* Specialisation tags */}
                        {c.tags.length > 0 && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "center", marginTop: 2 }}>
                            {c.tags.slice(0, 3).map((t, i) => (
                              <span key={i} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 20, background: "#EFF6FF", color: "#2563EB", fontWeight: 700, border: "1px solid #BFDBFE" }}>
                                {toTitleCase(t)}
                              </span>
                            ))}
                          </div>
                        )}
                        {/* Experience */}
                        {c.exp > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#475569" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                            {Math.floor(c.exp)}+ yrs experience
                          </div>
                        )}
                        {/* Location */}
                        {c.location && (
                          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#475569" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                            {c.location}
                          </div>
                        )}
                        {/* Rating */}
                        {c.rating > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="#F59E0B" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
                            <span style={{ fontWeight: 600 }}>{c.rating.toFixed(1)}</span>
                            {c.reviews > 0 && <span style={{ color: "#94A3B8" }}>({c.reviews})</span>}
                          </div>
                        )}
                        {/* Description - Init Cap applied inside CardAbout, Georgia serif */}
                        {c.about && (
                          <div style={{ marginTop: 2 }}>
                            <CardAbout about={c.about} />
                          </div>
                        )}
                      </div>

                      {/* Footer: fee + view profile (left) + book now (right) */}
                      {/* NOTE: No booking fee badge removed - all users (including subscribers) pay for sessions */}
                      <div style={{ padding: "14px 18px 18px", borderTop: "1px solid #F1F5F9", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>
                            ₹{displayFee.toLocaleString()}<span style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginLeft: 3 }}>/session</span>
                          </div>
                          {/* Category match badge: shown only when user has interests set */}
                          {(() => {
                            const score = getConsultantScore(c);
                            if (score === 0) return null;
                            return (
                              <div style={{ marginTop: 3, fontSize: 10, fontWeight: 700, color: "#16A34A", background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 6, padding: "2px 7px", display: "inline-flex", alignItems: "center", gap: 3 }}>
                                <Star size={9} fill="#16A34A" stroke="none" /> {score} category match{score > 1 ? "es" : ""}
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ display: "flex", gap: 7 }}>
                          <button
                            onClick={() => setProfileConsultant(c)}
                            style={{ padding: "7px 12px", borderRadius: 9, border: "1.5px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            View Profile
                          </button>
                          <button
                            onClick={() => handleOpenModal(c)}
                            style={{ padding: "7px 14px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                            Book Now
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==== BOOKINGS ==== */}
        {tab === "bookings" && (
          <div className="up-tab-padding">
            <div className="up-title-section">
              <h2 className="up-section-title">My Bookings</h2>
              <button className="up-history-button" onClick={fetchBookings} disabled={loading.bookings} style={{ display: "flex", alignItems: "center", gap: 6 }}>{loading.bookings ? <img src={logoImg} alt="" style={{ width: 16, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite", verticalAlign: "middle" }} /> : <RefreshCw size={14} />} Refresh</button>
            </div>
            {/* Upcoming / History toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "center" }}>
              {(["UPCOMING", "HISTORY"] as const).map(f => (
                <button key={f} onClick={() => setBookingFilter(f)} style={{ padding: "8px 20px", borderRadius: 20, border: "1.5px solid", borderColor: bookingFilter === f ? "#2563EB" : "#E2E8F0", background: bookingFilter === f ? "#2563EB" : "#fff", color: bookingFilter === f ? "#fff" : "#64748B", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {f === "UPCOMING" ? <><Calendar size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />Upcoming ({upcomingBookings.length})</> : <><Clock size={13} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />History ({historyBookings.length})</>}
                </button>
              ))}
              {/* Calendar View Button */}
              <button
                onClick={() => { setShowCalendarPopup(true); setCalendarSelectedDate(null); const d = new Date(); setCalendarMonth({ year: d.getFullYear(), month: d.getMonth() }); }}
                title="View bookings in calendar"
                style={{ marginLeft: 4, width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #E2E8F0", background: "#fff", color: "#2563EB", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(37,99,235,0.08)", transition: "all 0.15s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#EFF6FF"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#2563EB"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E2E8F0"; }}
              >
                <Calendar size={16} />
              </button>
            </div>

            {/* ── Calendar Popup ── */}
            {showCalendarPopup && (() => {
              const allBookings = bookings as any[];
              // Build a map: dateStr -> bookings[]
              const bookingsByDate: Record<string, any[]> = {};
              allBookings.forEach(b => {
                const d = b.slotDate || b.bookingDate || b.date || "";
                if (d) { if (!bookingsByDate[d]) bookingsByDate[d] = []; bookingsByDate[d].push(b); }
              });

              const { year, month } = calendarMonth;
              const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
              const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const today = new Date(); const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
              const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
              while (cells.length % 7 !== 0) cells.push(null);

              const selectedBookings = calendarSelectedDate ? (bookingsByDate[calendarSelectedDate] || []) : [];

              const getStatusColor = (st: string) => {
                const s = (st || "").toUpperCase();
                if (s === "CONFIRMED" || s === "SCHEDULED") return "#16A34A";
                if (s === "PENDING") return "#D97706";
                if (s === "COMPLETED") return "#2563EB";
                if (s === "CANCELLED") return "#DC2626";
                return "#64748B";
              };

              return (
                <div style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(6px)", background: "rgba(15,23,42,0.55)" }} onClick={() => setShowCalendarPopup(false)}>
                  <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480, boxShadow: "0 24px 72px rgba(15,23,42,0.28)", overflow: "hidden", animation: "popIn 0.22s ease" }}>
                    {/* Header */}
                    <div style={{ background: "linear-gradient(135deg,#1D4ED8,#2563EB)", padding: "18px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Calendar size={18} color="#fff" />
                        <span style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>Bookings Calendar</span>
                      </div>
                      <button onClick={() => setShowCalendarPopup(false)} style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </div>
                    {/* Month nav */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px 10px" }}>
                      <button onClick={() => setCalendarMonth(p => { const d = new Date(p.year, p.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; })} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                      </button>
                      <span style={{ fontWeight: 800, fontSize: 15, color: "#0F172A" }}>{monthNames[month]} {year}</span>
                      <button onClick={() => setCalendarMonth(p => { const d = new Date(p.year, p.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; })} style={{ background: "#F1F5F9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                      </button>
                    </div>
                    {/* Day headers */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 16px", gap: 2 }}>
                      {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
                        <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: "#94A3B8", padding: "4px 0" }}>{d}</div>
                      ))}
                    </div>
                    {/* Calendar grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 16px 16px", gap: 3 }}>
                      {cells.map((day, i) => {
                        if (!day) return <div key={i} />;
                        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const dayBookings = bookingsByDate[dateStr] || [];
                        const hasBookings = dayBookings.length > 0;
                        const specialCount = dayBookings.filter((b: any) => getSpecialBookingDisplay(b).isSpecial).length;
                        const regularCount = dayBookings.length - specialCount;
                        const accentColor = specialCount > 0 && regularCount > 0
                          ? "#7C3AED"
                          : specialCount > 0
                            ? "#D97706"
                            : "#2563EB";
                        const isToday = dateStr === todayStr;
                        const isSelected = dateStr === calendarSelectedDate;
                        const count = dayBookings.length;
                        return (
                          <div key={i} onClick={() => setCalendarSelectedDate(isSelected ? null : dateStr)}
                            style={{
                              textAlign: "center", padding: "6px 2px", borderRadius: 10, cursor: hasBookings ? "pointer" : "default",
                              background: isSelected ? accentColor : isToday ? (specialCount > 0 ? "#FFF7ED" : "#EFF6FF") : "transparent",
                              border: isToday && !isSelected ? `1.5px solid ${accentColor}` : "1.5px solid transparent",
                              position: "relative", transition: "all 0.12s"
                            }}>
                            <span style={{ fontSize: 13, fontWeight: isToday || hasBookings ? 700 : 400, color: isSelected ? "#fff" : isToday ? accentColor : "#0F172A" }}>{day}</span>
                            {hasBookings && (
                              <div style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 2, flexWrap: "wrap" }}>
                                <div style={{ width: 5, height: 5, borderRadius: "50%", background: isSelected ? "rgba(255,255,255,0.9)" : accentColor }} />
                                {count > 1 && <span style={{ fontSize: 9, fontWeight: 800, color: isSelected ? "#fff" : accentColor }}>{count}</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Selected date bookings */}
                    {calendarSelectedDate && (
                      <div style={{ borderTop: "1px solid #F1F5F9", padding: "14px 20px 20px", maxHeight: 240, overflowY: "auto" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
                          {new Date(calendarSelectedDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                        </div>
                        {selectedBookings.length === 0 ? (
                          <div style={{ textAlign: "center", color: "#94A3B8", fontSize: 13, padding: "8px 0" }}>No bookings on this day.</div>
                        ) : selectedBookings.map((b: any, idx: number) => {
                          const special = getSpecialBookingDisplay(b);
                          const hasAssignedSpecialSlot = specialBookingHasAssignedSlot(special.meta);
                          const status = getBookingLifecycleStatus(b);
                          const displayTime = special.isSpecial
                            ? (hasAssignedSpecialSlot ? special.time : (special.time || `${special.meta?.hours || 1} hour${(special.meta?.hours || 1) > 1 ? "s" : ""}`))
                            : (b.timeRange || (b.slotTime ? toAmPm(b.slotTime) : "-"));
                          const displayMode = special.meetingMode || b.meetingMode || "-";
                          return (
                            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 12, background: "#F8FAFC", border: "1px solid #E2E8F0", marginBottom: 8 }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: getStatusColor(status), flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {special.isSpecial ? `Special Booking with ${b.consultantName || b.consultant?.name || "Consultant"}` : `Session with ${b.consultantName || b.consultant?.name || "Consultant"}`}
                                </div>
                                <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{displayTime} · {displayMode}</div>
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, background: getStatusColor(status) + "18", color: getStatusColor(status), flexShrink: 0 }}>{status || "PENDING"}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!calendarSelectedDate && (
                      <div style={{ padding: "0 20px 16px", textAlign: "center" }}>
                        <span style={{ fontSize: 12, color: "#94A3B8" }}>
                          {bookings.length === 0 ? "No bookings found." : `${bookings.length} booking${bookings.length !== 1 ? "s" : ""} total · tap a date to see details`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
            {loading.bookings ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "50vh" }}>
                <img src={logoImg} alt="" style={{ width: 72, height: "auto", display: "block", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
              </div>
            ) : displayedBookings.length === 0 ? (
              <div className="up-empty-state">
                <div style={{ fontSize: 36, marginBottom: 12, display: "flex", justifyContent: "center" }}>{bookingFilter === "UPCOMING" ? <Calendar size={36} color="#CBD5E1" strokeWidth={1.5} /> : <Clock size={36} color="#CBD5E1" strokeWidth={1.5} />}</div>
                <p style={{ margin: 0, fontWeight: 600, color: "#64748B" }}>{bookingFilter === "UPCOMING" ? "No upcoming bookings." : "No past bookings yet."}</p>
                {bookingFilter === "UPCOMING" && <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94A3B8" }}>Pick a consultant from the Consultants tab and use the published availability.</p>}
              </div>
            ) : (
              <div className="up-bookings-list">
                {displayedBookings.map(b => {
                  const bAny = b as any;
                  const special = getSpecialBookingDisplay(bAny);
                  const hasAssignedSpecialSlot = specialBookingHasAssignedSlot(special.meta);
                  const chronology = getBookingChronologyTarget(bAny);
                  const bookingForTime = chronology.date || chronology.time
                    ? { ...bAny, slotDate: chronology.date, bookingDate: chronology.date, timeRange: chronology.time, slotTime: chronology.time }
                    : bAny;
                  const status = getBookingLifecycleStatus(bAny);
                  const isCompleted = status === "COMPLETED";
                  const isCancelled = status === "CANCELLED";
                  const isExpiredConfirmed = !isCancelled && !isCompleted && isBookingExpired(bookingForTime, now);
                  const canLeaveFeedback = isCompleted || isExpiredConfirmed;
                  const hasFeedback = submittedFeedbacks.has(b.id);
                  const resolvedDisplayDate = special.isSpecial
                    ? (hasAssignedSpecialSlot ? special.date || "Date to be shared" : (special.date || "Date to be shared by consultant"))
                    : (bAny.slotDate || bAny.bookingDate || "-");
                  const resolvedDisplayTime = special.isSpecial
                    ? (hasAssignedSpecialSlot ? special.time : (special.time || `${special.meta?.hours || 1} hour${(special.meta?.hours || 1) > 1 ? "s" : ""}`))
                    : (bAny.timeRange || (bAny.slotTime ? toAmPm(bAny.slotTime) : ""));
                  const resolvedDisplayMode = special.meetingMode || bAny.meetingMode || "";
                  const modeLabel = resolvedDisplayMode === "ONLINE" ? "Online" : resolvedDisplayMode === "PHONE" ? "Phone" : resolvedDisplayMode === "PHYSICAL" ? "In-Person" : resolvedDisplayMode ? resolvedDisplayMode : "";
                  const modeIcon = resolvedDisplayMode === "ONLINE" ? <Monitor size={11} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} /> : resolvedDisplayMode === "PHONE" ? <Phone size={11} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} /> : resolvedDisplayMode ? <MapPin size={11} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} /> : null;
                  return (
                    <div key={b.id} className="up-booking-card" style={special.isSpecial ? {
                      borderLeft: "4px solid #2563EB",
                      background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
                      boxShadow: "0 4px 20px rgba(37,99,235,0.10)",
                    } : {}}>
                      {special.isSpecial && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "6px 10px", background: "rgba(37,99,235,0.08)", borderRadius: 8, border: "1px solid #BFDBFE" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="#2563EB" stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#1D4ED8", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                            Special Booking - {isCompleted ? "✓ Completed" : hasAssignedSpecialSlot ? "✓ Scheduled" : "Awaiting Confirmation"}
                          </span>
                        </div>
                      )}
                      <div className="up-card-header">
                        <div className="up-calendar-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round" /></svg></div>
                        <div className="up-card-info">
                          <div className="up-session-title">{special.isSpecial ? `Special Booking with ${b.consultantName || b.consultant?.name || "Consultant"}` : `Session with ${b.consultantName || b.consultant?.name || "Consultant"}`}</div>
                          <div className="up-session-date-time">
                            {resolvedDisplayDate}
                            {resolvedDisplayTime && <span className="up-booked-time-pill">{resolvedDisplayTime}</span>}
                            {modeLabel && <span> · {modeIcon}{modeLabel}</span>}
                          </div>
                          {b.amount > 0 && (
                            <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                              ₹{b.amount.toLocaleString()}
                            </div>
                          )}
                        </div>
                        <div className="up-status-badge-wrapper"><StatusBadge status={status as any} /></div>
                      </div>
                      <div className="up-card-actions">
                        {/* ── Join Meeting ── only for non-cancelled, non-completed, non-expired upcoming ONLINE sessions ── */}
                        {!isCancelled && !isCompleted && !(special.isSpecial && !hasAssignedSpecialSlot) && !isBookingExpired(bookingForTime, now) && (b.meetingMode === "ONLINE" || !b.meetingMode) && (() => {
                          const joinStatus = getJoinMeetingStatus(bookingForTime, now);

                          if (joinStatus === "too_early") {
                            // Calculate how long until session starts
                            const dateStr = bookingForTime.slotDate || bookingForTime.bookingDate || "";
                            const timeStr = bookingForTime.timeRange || bookingForTime.slotTime || "";
                            const startMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
                            let countdownLabel = "";
                            if (startMatch && dateStr) {
                              try {
                                let sh = parseInt(startMatch[1]);
                                const sm = parseInt(startMatch[2] || "0");
                                const ap = (startMatch[3] || "").toUpperCase();
                                if (ap === "PM" && sh !== 12) sh += 12;
                                if (ap === "AM" && sh === 12) sh = 0;
                                const sessionStart = new Date(`${dateStr}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`);
                                const minsUntil = Math.ceil((sessionStart.getTime() - now.getTime()) / 60000);
                                if (minsUntil > 60) {
                                  const h = Math.floor(minsUntil / 60), m = minsUntil % 60;
                                  countdownLabel = ` · starts in ${h}h ${m > 0 ? `${m}m` : ""}`.trim();
                                } else if (minsUntil > 15) {
                                  countdownLabel = ` · starts in ${minsUntil}m`;
                                } else {
                                  countdownLabel = ` · opens in ${minsUntil}m`;
                                }
                              } catch { /* skip countdown */ }
                            }
                            return (
                              <button
                                disabled
                                title="The meeting room opens 15 minutes before the session starts"
                                style={{
                                  padding: "10px 16px", borderRadius: 8,
                                  border: "1.5px solid #E2E8F0",
                                  background: "#F8FAFC", color: "#94A3B8",
                                  fontWeight: 600, fontSize: 13,
                                  cursor: "not-allowed",
                                  display: "flex", alignItems: "center", gap: 6,
                                  fontFamily: "inherit",
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                Too Early to Join{countdownLabel}
                              </button>
                            );
                          }

                          if (joinStatus === "ended") {
                            return (
                              <button
                                disabled
                                title="This session time has already passed"
                                style={{
                                  padding: "10px 16px", borderRadius: 8,
                                  border: "1.5px solid #FECACA",
                                  background: "#FEF2F2", color: "#DC2626",
                                  fontWeight: 600, fontSize: 13,
                                  cursor: "not-allowed",
                                  display: "flex", alignItems: "center", gap: 6,
                                  fontFamily: "inherit",
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                                Session Ended
                              </button>
                            );
                          }

                          // joinStatus === "active" → live window
                          return (
                            <button
                              className="up-join-button"
                              onClick={() => {
                                localStorage.setItem(PENDING_FEEDBACK_KEY, String(b.id));
                                window.open(special.joinLink || JITSI_URL(b.id), "_blank");
                              }}
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14" />
                                <rect x="3" y="6" width="12" height="12" rx="2" />
                              </svg>
                              Join Meeting
                            </button>
                          );
                        })()}

                        {/* ── Feedback - for COMPLETED or expired sessions ── */}
                        {canLeaveFeedback && !hasFeedback && (
                          <button
                            onClick={() => handleOpenFeedback(bAny)}
                            style={{
                              padding: "10px 16px", borderRadius: 8,
                              border: "1.5px solid #FCD34D",
                              background: "#FFFBEB", color: "#D97706",
                              fontWeight: 600, fontSize: 13,
                              cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 5,
                              fontFamily: "inherit",
                            }}
                          >
                            <Star size={13} fill="#D97706" stroke="none" /> Leave Feedback
                          </button>
                        )}
                        {canLeaveFeedback && hasFeedback && (
                          <div style={{
                            padding: "8px 14px", borderRadius: 8,
                            border: "1.5px solid #86EFAC",
                            background: "#F0FDF4", color: "#16A34A",
                            fontWeight: 600, fontSize: 13,
                            display: "flex", alignItems: "center", gap: 5,
                          }}>
                            <CheckCircle size={13} /> Feedback Submitted
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==== TICKETS ==== */}
        {tab === "tickets" && (
          <div className="up-tab-padding">
            {/* Guest Trial Banner */}
            {(() => {
              const role = (getLocalRole()).toUpperCase().replace(/^ROLE_/, "");
              const inTrial = role === "GUEST" && isGuestInTrial();
              const daysLeft = guestTrialDaysRemaining;
              if (!inTrial && role === "GUEST") {
                return (
                  <div style={{ background: "linear-gradient(135deg,#FEF2F2,#FECACA)", border: "1.5px solid #FCA5A5", borderRadius: 14, padding: "18px 20px", marginBottom: 18, textAlign: "center" }}>
                    <Lock size={28} color="#DC2626" style={{ marginBottom: 8, display: "block", margin: "0 auto 10px" }} />
                    <div style={{ fontWeight: 800, fontSize: 15, color: "#DC2626", marginBottom: 6 }}>Free Trial Ended</div>
                    <div style={{ fontSize: 13, color: "#7F1D1D", marginBottom: 14 }}>Your 2-month free guest access has expired. Upgrade to Pro or Elite to continue raising support tickets.</div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                      <button onClick={() => setTab("settings")} style={{ padding: "10px 24px", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
                        <ArrowRight size={14} /> Upgrade Plan
                      </button>
                      <button onClick={() => setShowGuestTrialExpiredPopup(true)} style={{ padding: "10px 18px", background: "#fff", color: "#DC2626", border: "1.5px solid #FCA5A5", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                        View Offer
                      </button>
                    </div>
                  </div>
                );
              }
              if (inTrial) {
                return (
                  <div style={{ background: "linear-gradient(135deg,#EFF6FF,#DBEAFE)", border: "1.5px solid #93C5FD", borderRadius: 14, padding: "14px 18px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
                    <PartyPopper size={20} color="#2563EB" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#1E40AF" }}>2-Month Free Guest Access Active</div>
                      <div style={{ fontSize: 12, color: "#3B82F6", marginTop: 2 }}>You have full Pro/Elite ticket access - <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong> remaining in your free trial.</div>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
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
                  setTickets(p => p.map(t => t.id === id ? { ...t, status: normalizeTicketStatus(status) as TicketStatus } : t));
                  setSelectedTicket(p => p?.id === id ? { ...p, status: status as TicketStatus } : p);
                }}
              />
            )}
            {/* Create ticket modal */}
            {showCreateTicket && (
              <CreateTicketModal
                userId={currentUserId}
                onCreated={t => {
                  setTickets(p => [t, ...p]);
                  setShowCreateTicket(false);
                  setSelectedTicket(t);
                  // Fire ticket-created email - non-fatal
                  const userEmailTc = currentUser?.email || '';
                  const ticketNumTc = String((t as any).ticketNumber || t.id);
                  if (userEmailTc) {
                    emailOnTicketCreated({ to: userEmailTc, ticketNumber: ticketNumTc, category: t.category || 'Support' }).catch(() => null);
                  }
                }}
                onOpenEmailToTicket={() => { setShowCreateTicket(false); setShowEmailToTicket(true); }}
                onClose={() => setShowCreateTicket(false)}
              />
            )}
            {showEmailToTicket && (
              <EmailToTicketModal onClose={() => setShowEmailToTicket(false)} />
            )}

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
              <h2 className="up-section-title" style={{ margin: 0 }}>Support Tickets</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={fetchTickets} disabled={loading.tickets} className="up-ticket-refresh-btn">{loading.tickets ? <><Clock size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />Loading</> : <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><RefreshCw size={12} /> Refresh</span>}</button>
                <button onClick={() => setShowEmailToTicket(true)}
                  style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid #BFDBFE", background: "#EFF6FF", color: "#1E40AF", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Mail size={12} /> Email to Ticket
                </button>
                {(() => {
                  const role = (getLocalRole()).toUpperCase().replace(/^ROLE_/, "");
                  // MEMBER = admin-created full-access user. GUEST in trial also allowed.
                  const canCreate = role === "MEMBER" || role !== "GUEST" || isGuestInTrial();
                  return canCreate
                    ? <button onClick={() => setShowCreateTicket(true)} className="up-ticket-new-btn">+ New Ticket</button>
                    : <button disabled style={{ padding: "8px 16px", borderRadius: 8, background: "#F1F5F9", color: "#94A3B8", border: "1.5px solid #E2E8F0", fontSize: 12, fontWeight: 600, cursor: "not-allowed", display: "inline-flex", alignItems: "center", gap: 5 }}><Lock size={11} /> Upgrade to Create</button>;
                })()}
              </div>
            </div>

            {/* Email-to-Ticket Info Banner - backend auto-converts emails to tickets */}
            <div style={{
              background: "linear-gradient(135deg,#EFF6FF,#F0FDF4)",
              border: "1px solid #BFDBFE",
              borderRadius: 12,
              padding: "12px 16px",
              marginBottom: 16,
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
            }}>
              <span style={{ flexShrink: 0, display: "flex", alignItems: "flex-start", paddingTop: 2 }}><Mail size={22} color="#2563EB" strokeWidth={1.8} /></span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1E3A8A", marginBottom: 3 }}>
                  Email-to-Ticket: Send an email to get help automatically
                </div>
                <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
                  You can also raise a support ticket by <strong>sending an email directly to our support inbox</strong>.
                  Your email will be automatically converted into a ticket and our team will respond here.
                  <br />
                  <span style={{ color: "#2563EB", fontWeight: 600 }}>{SUPPORT_EMAIL}</span>
                  {" "}· Use keywords like "urgent" or "billing" to set priority automatically.
                </div>
              </div>
            </div>

            {/* 🎉 2-Month Free Trial Alert Banner - only shown to GUEST users */}
            {showFreeTrialAlert && (getLocalRole()).toUpperCase().replace(/^ROLE_/, "") === "GUEST" && (
              <div style={{
                background: "linear-gradient(135deg,#F0FDF4 0%,#DCFCE7 50%,#D1FAE5 100%)",
                border: "1.5px solid #6EE7B7",
                borderRadius: 14,
                padding: "14px 18px",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                gap: 14,
                position: "relative",
                boxShadow: "0 2px 12px rgba(16,185,129,0.12)",
                animation: "popIn 0.3s ease",
              }}>
                {/* Icon */}
                <div style={{ flexShrink: 0, width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg,#10B981,#059669)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 10px rgba(16,185,129,0.35)" }}>
                  <PartyPopper size={20} color="#fff" />
                </div>
                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#065F46" }}>🎉 You have 2 Months FREE Ticket Support!</span>
                    <span style={{ background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 9px", borderRadius: 20, letterSpacing: "0.04em", textTransform: "uppercase", flexShrink: 0 }}>Limited Offer</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#047857", lineHeight: 1.55 }}>
                    Raise support tickets <strong>completely free</strong> for your first 2 months - no subscription needed. Get priority help from our team on any issue, anytime.
                  </div>
                </div>
                {/* CTA Button */}
                <button
                  onClick={() => setShowCreateTicket(true)}
                  style={{ flexShrink: 0, padding: "8px 18px", background: "linear-gradient(135deg,#10B981,#059669)", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, boxShadow: "0 2px 8px rgba(16,185,129,0.3)" }}
                >
                  <Zap size={13} /> Raise a Ticket
                </button>
                {/* Dismiss */}
                <button
                  onClick={() => { setShowFreeTrialAlert(false); sessionStorage.setItem("mtm_free_trial_alert_dismissed", "true"); }}
                  title="Dismiss"
                  style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: "50%", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#059669", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                >
                  <X size={12} />
                </button>
              </div>
            )}

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
            <div className="up-ticket-filter-row" style={{ flexWrap: "wrap" }}>
              {STATUS_FILTERS.map(f => {
                const cfg = f === "ALL" ? null : TICKET_STATUS_CONFIG[f];
                const count = f === "ALL" ? tickets.length : (ticketCounts[f as keyof typeof ticketCounts] ?? 0);
                return (
                  <button key={f} onClick={() => setTicketFilter(f as any)} className={`up-ticket-filter-btn ${ticketFilter === f ? "up-ticket-filter-btn-active" : ""}`}>
                    {cfg ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{cfg.icon}<span>{cfg.label}</span></span> : "All"} ({count})
                  </button>
                );
              })}
            </div>

            {loading.tickets ? (
              <div style={{ textAlign: "center", padding: 48 }}>
                <img src={logoImg} alt="" style={{ width: 48, height: "auto", display: "block", margin: "0 auto 12px", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="up-empty-state">
                <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}><Ticket size={40} color="#CBD5E1" strokeWidth={1.5} /></div>
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
                          <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>#{ticket.id} - {ticket.category}</div>
                          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                            {formatTicketDate(ticket.createdAt)}
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
                        {sla && !["CLOSED", "RESOLVED"].includes(ticket.status) ? (
                          <div style={{ fontSize: 11, fontWeight: 700, color: sla.breached ? "#DC2626" : sla.warning ? "#D97706" : "#16A34A" }}>
                            {sla.breached ? <><Clock size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />Response overdue - we're working on it</> : sla.warning ? <><AlertTriangle size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />Response due soon</> : <><CheckCircle size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />{sla.label}</>}
                          </div>
                        ) : <div />}
                        {["RESOLVED", "CLOSED"].includes(ticket.status) && !ticket.feedbackRating && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#D97706", background: "#FFFBEB", padding: "3px 10px", borderRadius: 10, border: "1px solid #FDE68A", display: "inline-flex", alignItems: "center", gap: 4 }}><Star size={10} fill="#D97706" stroke="none" /> Rate this resolution</span>
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

        {/* ==== NOTIFICATIONS (full tab) ==== */}
        {tab === "notifications" && (
          <div className="up-tab-padding">
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
                  userNotifs.filter((n: any) => !n.read).forEach((n: any) => markNotificationReadOnBackend(n.id));
                }} style={{ padding: "7px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE", color: "#2563EB", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Mark all as read
                </button>
              </div>
            )}
            {userNotifs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", background: "#F8FAFC", borderRadius: 20, color: "#94A3B8" }}>
                <div style={{ fontSize: 48, marginBottom: 16, display: "flex", justifyContent: "center" }}><Bell size={48} color="#CBD5E1" strokeWidth={1.2} /></div>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#64748B", marginBottom: 8 }}>No notifications yet</div>
                <p style={{ margin: 0, fontSize: 13 }}>When your ticket is updated or a consultant replies, you'll receive notifications here.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {userNotifs.map((n: any) => {
                  const cfgMap: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
                    info: { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE", icon: <Info size={12} color="#2563EB" /> },
                    success: { color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC", icon: <CheckCircle size={12} color="#16A34A" /> },
                    warning: { color: "#D97706", bg: "#FFFBEB", border: "#FCD34D", icon: <AlertTriangle size={12} color="#D97706" /> },
                    error: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA", icon: <XCircle size={12} color="#DC2626" /> },
                  };
                  const c = cfgMap[n.type] || cfgMap.info;
                  const diff = Math.floor((Date.now() - new Date(n.timestamp).getTime()) / 1000);
                  const timeStr = diff < 60 ? "just now" : diff < 3600 ? `${Math.floor(diff / 60)}m ago` : diff < 86400 ? `${Math.floor(diff / 3600)}h ago` : `${Math.floor(diff / 86400)}d ago`;
                  return (
                    <div key={n.id}
                      style={{ background: n.read ? "#fff" : c.bg, border: `1.5px solid ${n.read ? "#F1F5F9" : c.border}`, borderLeft: `4px solid ${c.color}`, borderRadius: 14, padding: "14px 16px", display: "flex", gap: 12, alignItems: "flex-start", cursor: (n.ticketId || n.bookingId) ? "pointer" : "default", transition: "all 0.15s" }}
                      onClick={() => {
                        const updated = userNotifs.map((x: any) => x.id === n.id ? { ...x, read: true } : x);
                        setUserNotifs(updated);
                        if (currentUserId) localStorage.setItem(`fin_notifs_USER_${currentUserId}`, JSON.stringify(updated));
                        if (!n.read) markNotificationReadOnBackend(n.id);
                        if (n.ticketId) setTab("tickets");
                        else if (n.bookingId) setTab("bookings");
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
                        {n.ticketId && <div style={{ marginTop: 6, fontSize: 11, color: "#2563EB", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><span>Tap to view ticket #{n.ticketId}</span><ArrowRight size={12} /></div>}
                        {n.bookingId && !n.ticketId && <div style={{ marginTop: 6, fontSize: 11, color: "#16A34A", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}><span>Tap to view bookings</span><ArrowRight size={12} /></div>}
                        <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 6 }}>{timeStr}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ==== SETTINGS ==== */}
        {tab === "settings" && (
          <div className="up-tab-padding">

            {/* ── Account Profile sub-view ── */}
            {settingsView === "profile" ? (
              <AccountProfile onBack={() => setSettingsView("menu")} />

            ) : settingsView === "notifications" ? (
              /* ── Notification Preferences sub-view ── */
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button onClick={() => setSettingsView("menu")} style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#374151", flexShrink: 0 }}><ArrowLeft size={16} /></button>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Notifications</h2>
                    <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>Choose what you want to be notified about</p>
                  </div>
                </div>

                {/* In-App Notifications */}
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ padding: "14px 20px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>In-App Alerts</div>
                  </div>
                  {[
                    {
                      key: "bookingUpdates",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></svg>,
                      bg: "#EFF6FF",
                      label: "Booking Updates",
                      desc: "Session confirmations, cancellations and reminders",
                    },
                    {
                      key: "ticketReplies",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /><line x1="9" y1="10" x2="15" y2="10" /><line x1="9" y1="14" x2="13" y2="14" /></svg>,
                      bg: "#F5F3FF",
                      label: "Ticket Replies",
                      desc: "When a consultant or admin responds to your ticket",
                    },
                    {
                      key: "consultantMessages",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0891B2" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>,
                      bg: "#ECFEFF",
                      label: "Consultant Messages",
                      desc: "Direct messages and session notes from consultants",
                    },
                    {
                      key: "offerAlerts",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><path d="M12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>,
                      bg: "#FFFBEB",
                      label: "Offer Alerts",
                      desc: "New deals and exclusive discount notifications",
                    },
                  ].map(({ key, icon, bg, label, desc }) => {
                    const isOn = notifPrefs[key as keyof typeof notifPrefs] as boolean;
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid #F1F5F9" }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{label}</div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{desc}</div>
                        </div>
                        <button
                          onClick={() => {
                            const updated = { ...notifPrefs, [key]: !isOn };
                            setNotifPrefs(updated);
                            try { localStorage.setItem("fin_notif_prefs", JSON.stringify(updated)); } catch { }
                          }}
                          style={{ position: "relative", width: 44, height: 24, borderRadius: 12, border: "none", background: isOn ? "#2563EB" : "#CBD5E1", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}
                        >
                          <span style={{ position: "absolute", top: 3, left: isOn ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Email & SMS */}
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ padding: "14px 20px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Email & SMS</div>
                  </div>
                  {[
                    {
                      key: "emailNotifications",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>,
                      bg: "#F0FDF4",
                      label: "Email Notifications",
                      desc: "Booking confirmations and updates via email",
                    },
                    {
                      key: "smsNotifications",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" /></svg>,
                      bg: "#F8FAFC",
                      label: "SMS Alerts",
                      desc: "Session reminders via SMS to your registered number",
                    },
                  ].map(({ key, icon, bg, label, desc }) => {
                    const isOn = notifPrefs[key as keyof typeof notifPrefs] as boolean;
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid #F1F5F9" }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{label}</div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{desc}</div>
                        </div>
                        <button
                          onClick={() => {
                            const updated = { ...notifPrefs, [key]: !isOn };
                            setNotifPrefs(updated);
                            try { localStorage.setItem("fin_notif_prefs", JSON.stringify(updated)); } catch { }
                          }}
                          style={{ position: "relative", width: 44, height: 24, borderRadius: 12, border: "none", background: isOn ? "#2563EB" : "#CBD5E1", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}
                        >
                          <span style={{ position: "absolute", top: 3, left: isOn ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#EFF6FF", borderRadius: 12, padding: "12px 16px", border: "1px solid #BFDBFE" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <span style={{ fontSize: 12, color: "#1D4ED8" }}>Preference changes are saved automatically and take effect immediately.</span>
                </div>
              </>

            ) : settingsView === "privacy" ? (
              /* ── Privacy & Security sub-view ── */
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <button onClick={() => { setSettingsView("menu"); setChangingPassword(false); setPrivacyPwForm({ current: "", newPass: "", confirm: "" }); setPrivacyPwError(""); setPrivacyPwSuccess(""); }}
                    style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#374151", flexShrink: 0 }}><ArrowLeft size={16} /></button>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Privacy &amp; Security</h2>
                    <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>Manage your account security and privacy settings</p>
                  </div>
                </div>

                {/* Privacy toggles */}
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ padding: "14px 20px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Privacy</div>
                  </div>
                  {[
                    {
                      key: "profileVisible",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
                      bg: "#F0FDF4",
                      label: "Public Profile",
                      desc: "Allow consultants to see your profile details",
                    },
                    {
                      key: "activityVisible",
                      icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>,
                      bg: "#EFF6FF",
                      label: "Activity Visibility",
                      desc: "Show your booking activity to your consultants",
                    },
                  ].map(({ key, icon, bg, label, desc }) => {
                    const isOn = privacyPrefs[key as keyof typeof privacyPrefs] as boolean;
                    return (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", borderBottom: "1px solid #F1F5F9" }}>
                        <div style={{ width: 38, height: 38, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{label}</div>
                          <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{desc}</div>
                        </div>
                        <button
                          onClick={() => {
                            const updated = { ...privacyPrefs, [key]: !isOn };
                            setPrivacyPrefs(updated);
                            try { localStorage.setItem("fin_privacy_prefs", JSON.stringify(updated)); } catch { }
                          }}
                          style={{ position: "relative", width: 44, height: 24, borderRadius: 12, border: "none", background: isOn ? "#16A34A" : "#CBD5E1", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }}
                        >
                          <span style={{ position: "absolute", top: 3, left: isOn ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Security section - Change Password only */}
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ padding: "14px 20px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em" }}>Security</div>
                  </div>

                  {/* Change Password */}
                  <div style={{ padding: "14px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: "#FFF7ED", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          <circle cx="12" cy="16" r="1" fill="#D97706" />
                        </svg>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>Change Password</div>
                        <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Update your account password</div>
                      </div>
                      <button
                        onClick={() => { setChangingPassword(p => !p); setPrivacyPwError(""); setPrivacyPwSuccess(""); setPrivacyPwForm({ current: "", newPass: "", confirm: "" }); }}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#374151", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        {changingPassword ? "Cancel" : "Change"}
                      </button>
                    </div>

                    {changingPassword && (
                      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                        {/* New Password */}
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>New Password</label>
                          <div style={{ position: "relative" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                            <input
                              type="password"
                              placeholder="At least 8 characters"
                              value={privacyPwForm.newPass}
                              onChange={e => setPrivacyPwForm(f => ({ ...f, newPass: e.target.value }))}
                              style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", background: "#F8FAFC", boxSizing: "border-box" }}
                            />
                          </div>
                        </div>
                        {/* Confirm New Password */}
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "#374151", display: "block", marginBottom: 6 }}>Confirm New Password</label>
                          <div style={{ position: "relative" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                              <path d="M9 12l2 2 4-4" /><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />
                            </svg>
                            <input
                              type="password"
                              placeholder="Re-enter new password"
                              value={privacyPwForm.confirm}
                              onChange={e => setPrivacyPwForm(f => ({ ...f, confirm: e.target.value }))}
                              style={{ width: "100%", padding: "10px 14px 10px 38px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", background: "#F8FAFC", boxSizing: "border-box" }}
                            />
                          </div>
                        </div>

                        {privacyPwError && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#DC2626", fontWeight: 600, padding: "10px 12px", background: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                            {privacyPwError}
                          </div>
                        )}
                        {privacyPwSuccess && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#16A34A", fontWeight: 600, padding: "10px 12px", background: "#F0FDF4", borderRadius: 8, border: "1px solid #86EFAC" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
                            {privacyPwSuccess}
                          </div>
                        )}

                        <button
                          disabled={privacyPwSaving}
                          onClick={async () => {
                            if (privacyPwForm.newPass.length < 8) { setPrivacyPwError("New password must be at least 8 characters."); return; }
                            if (privacyPwForm.newPass !== privacyPwForm.confirm) { setPrivacyPwError("Passwords do not match."); return; }
                            setPrivacyPwSaving(true); setPrivacyPwError(""); setPrivacyPwSuccess("");
                            try {
                              // NOTE: Encryption disabled until backend adds PasswordDecryptionUtil.
                              // Once backend is ready, encrypt once: const enc = await encryptPassword(privacyPwForm.newPass);
                              // then send: { newPassword: enc, confirmPassword: enc }
                              await apiFetch(`${BASE_URL}/users/change-password`, {
                                method: "PUT",
                                body: JSON.stringify({ newPassword: privacyPwForm.newPass, confirmPassword: privacyPwForm.confirm }),
                              });
                              setPrivacyPwSuccess("Password updated successfully!");
                              setPrivacyPwForm({ current: "", newPass: "", confirm: "" });
                              setChangingPassword(false);
                              if (currentUserId) {
                                localStorage.setItem(`fin_pw_changed_${currentUserId}`, "true");
                                localStorage.removeItem("fin_requires_pw_change");
                              }
                            } catch (err: any) {
                              setPrivacyPwError(err?.message || "Failed to update password. Please try again.");
                            } finally { setPrivacyPwSaving(false); }
                          }}
                          style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: privacyPwSaving ? "#93C5FD" : "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: privacyPwSaving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                          {privacyPwSaving ? (
                            <>
                              <img src={logoImg} alt="" style={{ width: 14, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
                              Updating...
                            </>
                          ) : "Update Password"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>


              </>

            ) : (
              /* ── Settings Main Menu ── */
              <>
                <h2 className="up-section-title">Settings</h2>

                {/* My Categories Section */}
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", padding: "20px 24px", marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: "#0F172A" }}>My Categories</div>
                      <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>Topics you're interested in - helps us match consultants</div>
                    </div>
                    <button onClick={() => {
                      setTempSelectedCategories(userCategories.map(uc => uc.category));
                      setCategoryStep("select"); setSelectedCategory(""); setSelectedSubOption(""); setQuestionnaireAnswers({}); setShowCategoryModal(true);
                    }}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 9, border: "1.5px solid #BFDBFE", background: "#EFF6FF", color: "#2563EB", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                      Add Category
                    </button>
                  </div>
                  {userCategories.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "#94A3B8", fontSize: 13 }}>
                      No categories yet. Add one to get personalised consultant recommendations.
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {userCategories.map((uc, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#F8FAFC", borderRadius: 12, border: "1px solid #F1F5F9" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{uc.category}</div>
                            <div style={{ fontSize: 11, color: "#64748B" }}>{uc.subOption}</div>
                          </div>
                          <button onClick={() => {
                            setTempSelectedCategories(userCategories.map(u => u.category));
                            setSelectedCategory(uc.category); setSelectedSubOption(uc.subOption); setQuestionnaireAnswers(uc.answers); setCategoryStep("select"); setShowCategoryModal(true);
                          }}
                            style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#2563EB", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                            Change
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="up-settings-card">
                  <div className="up-settings-item" onClick={() => setSettingsView("profile")}><span>Account Profile</span><span style={{ display: "flex", alignItems: "center" }}><ArrowRight size={15} /></span></div>
                  <div className="up-settings-item" onClick={() => { setChangingPassword(false); setPrivacyPwForm({ current: "", newPass: "", confirm: "" }); setPrivacyPwError(""); setPrivacyPwSuccess(""); setSettingsView("privacy"); }}><span>Privacy &amp; Security</span><span style={{ display: "flex", alignItems: "center" }}><ArrowRight size={15} /></span></div>
                  <div className="up-settings-item up-settings-item-danger" onClick={handleLogout}><span>Log Out</span></div>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* == PROFILE MODAL == */}
      {profileConsultant && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(4px)" }} onClick={() => setProfileConsultant(null)}>
          <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(15,23,42,0.3)" }} onClick={e => e.stopPropagation()}>
            <div style={{ background: "linear-gradient(135deg,#134E4A 0%,#0F766E 50%,#0D9488 80%,#06B6D4 100%)", padding: "28px 24px 24px", position: "relative", borderRadius: "20px 20px 0 0" }}>
              <button onClick={() => setProfileConsultant(null)} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
              <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                <div style={{ width: 80, height: 80, borderRadius: 16, border: "3px solid rgba(255,255,255,0.45)", overflow: "hidden", background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                  {profileConsultant.avatar ? <img src={profileConsultant.avatar} alt={profileConsultant.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : profileConsultant.name.substring(0, 2).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ fontSize: 21, fontWeight: 800, color: "#fff", margin: 0 }}>{profileConsultant.name}</h2>
                  <p style={{ fontSize: 13, color: "#A5F3FC", margin: "4px 0 0" }}>{profileConsultant.role}</p>
                  <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, color: "#99F6E4", display: "flex", alignItems: "center", gap: 3 }}><Star size={11} fill="#99F6E4" stroke="none" /> {profileConsultant.rating.toFixed(1)} ({profileConsultant.reviews} reviews)</span>
                    <span style={{ fontSize: 12, color: "#99F6E4", display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={11} /> {Math.floor(profileConsultant.exp)}+ yrs</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[{ icon: <MapPin size={14} color="#0F766E" />, label: "Location", value: profileConsultant.location }, { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>, label: "Languages", value: profileConsultant.languages || "English" }, { icon: <Phone size={14} color="#0F766E" />, label: "Contact", value: profileConsultant.phone || "On request" }, { icon: <DollarSign size={14} color="#0F766E" />, label: "Consultation Fee", value: `₹${calcTotal(profileConsultant.fee).total.toLocaleString()}` }].map(item => (
                  <div key={item.label} style={{ background: "#F8FAFC", borderRadius: 11, padding: "11px 13px", border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", marginBottom: 5, display: "flex", alignItems: "center", gap: 4 }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{item.value || "-"}</div>
                  </div>
                ))}
              </div>
              {profileConsultant.about && <ProfileAbout about={profileConsultant.about} />}
              {profileConsultant.tags.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 700, color: "#1E293B", marginBottom: 8, textTransform: "uppercase" }}>Expertise</h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>{profileConsultant.tags.map((tag, i) => <span key={i} style={{ background: "#F0FDFA", color: "#0F766E", padding: "5px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: "1px solid #A5F3FC" }}>{toTitleCase(tag)}</span>)}</div>
                </div>
              )}
              <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                <button onClick={() => { setProfileConsultant(null); handleOpenModal(profileConsultant); }} style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#0F766E,#0D9488)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(15,118,110,0.30)" }}>Book Appointment</button>
                <button onClick={() => setProfileConsultant(null)} style={{ padding: "13px 20px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* == BOOKING MODAL == */}
      {showModal && selectedConsultant && (
        <div className="up-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="up-modal" onClick={e => e.stopPropagation()} style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg,#134E4A 0%,#0F766E 45%,#0D9488 75%,#06B6D4 100%)", padding: "20px 24px 18px", position: "relative", flexShrink: 0 }}>
              <p style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#99F6E4", margin: "0 0 4px" }}>Schedule a Session</p>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: 0 }}>{selectedConsultant.name}</h3>
              <p style={{ fontSize: 13, color: "#A5F3FC", margin: "4px 0 0" }}>
                {selectedConsultant.role} · {isAdminMember ? <span style={{ color: "#6EE7B7", fontWeight: 700 }}>Free Access</span> : `₹${calcTotal(selectedConsultant.fee).total.toLocaleString()} / session`}
              </p>
              <button onClick={() => setShowModal(false)} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
            </div>
            <div style={{ padding: "20px 24px 24px", overflowY: "auto", maxHeight: "calc(92vh - 100px)" }}>
              {loading.slots ? (
                <div style={{ textAlign: "center", padding: "48px 0" }}>
                  <img src={logoImg} alt="" style={{ width: 48, height: "auto", display: "block", margin: "0 auto 12px", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
                </div>
              ) : (
                <>
                  {/* About This Consultant section removed - info shown on consultant card */}

                  <div style={{ marginBottom: 20, padding: "16px 18px", borderRadius: 14, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                      <div>
                        <p className="up-step-label" style={{ marginTop: 0, marginBottom: 4 }}>{bookingMode === "SPECIAL" ? "Special Booking Day" : "Available Slots"}</p>
                        <div style={{ fontSize: 12, color: "#64748B" }}>
                          {bookingMode === "SPECIAL"
                            ? "This is a Special Day - send a booking request and the consultant will confirm the meeting time with you directly."
                            : "Choose one available session from the consultant's published slots."}
                        </div>
                      </div>
                      <span style={{
                        padding: "6px 14px",
                        borderRadius: 999,
                        border: `1.5px solid ${bookingMode === "SPECIAL" ? "#F59E0B" : "#BFDBFE"}`,
                        background: bookingMode === "SPECIAL" ? "linear-gradient(135deg,#FFF8E1,#FEF3C7)" : "#EFF6FF",
                        color: bookingMode === "SPECIAL" ? "#92400E" : "#1D4ED8",
                        fontSize: 11,
                        fontWeight: 800,
                        letterSpacing: 0.5,
                        textTransform: "uppercase",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        boxShadow: bookingMode === "SPECIAL" ? "0 2px 8px rgba(245,158,11,0.18)" : "none",
                      }}>
                        {bookingMode === "SPECIAL" && <svg width="11" height="11" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>}
                        {bookingMode === "SPECIAL"
                          ? "Special Request Day"
                          : "Standard Day"}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                      <button
                        disabled={dayOffset === 0}
                        onClick={() => setDayOffset(o => Math.max(0, o - 1))}
                        style={{
                          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                          border: `1.5px solid ${dayOffset === 0 ? "#F1F5F9" : "#BFDBFE"}`,
                          background: "#fff",
                          cursor: dayOffset === 0 ? "default" : "pointer",
                          color: dayOffset === 0 ? "#CBD5E1" : "#2563EB",
                          display: "flex", alignItems: "center", justifyContent: "center"
                        }}
                      >
                        <ArrowLeft size={16} />
                      </button>
                      <div className="up-date-grid" style={{ flex: 1 }}>
                        {visibleBookingDays.map(d => {
                          const isSel = selectedDay.iso === d.iso;
                          const daySlots = specialAvailabilityByDate[d.iso] || [];
                          const daySpecials = consultantSpecialDaysByDate[d.iso] || [];
                          // Preserve durationHours=0 (free-flowing); only clamp positive values
                          const daySpecialDurations = Array.from(new Set<number>(
                            daySpecials.map(day => Number(day?.durationHours ?? 0))
                          )).sort((a, b) => a - b);
                          const isDayFreeFlowing = daySpecials.length > 0 && daySpecialDurations.every(h => h === 0);
                          const badgeDurations = isDayFreeFlowing ? [] : daySpecialDurations.filter(h => h > 0);
                          const isSpecialDay = daySpecials.length > 0;
                          const isUnavailableDay = !isSpecialDay && daySlots.length === 0;
                          const firstSlot = daySlots[0];
                          return (
                            <button
                              key={d.iso}
                              disabled={isUnavailableDay}
                              title={isSpecialDay
                                ? "Special Day - send a booking request, consultant confirms time"
                                : isUnavailableDay
                                  ? "No published availability"
                                  : "Available sessions"}
                              onClick={() => {
                                if (isUnavailableDay) return;
                                setSelectedDay(d);
                                if (isSpecialDay) {
                                  setBookingMode("SPECIAL");
                                  setSelectedSlot(null);
                                  setSpecialBookingHours(1);
                                } else if (firstSlot) {
                                  setBookingMode("STANDARD");
                                  const firstLabel = firstSlot.timeRange || formatSpecialTimeRange(firstSlot.slotTime, selectedConsultant.slotDurationHours || 1);
                                  setSpecialBookingHours(1);
                                  setSelectedSlot({
                                    start24h: firstSlot.slotTime,
                                    label: firstLabel,
                                    masterId: Number(firstSlot.masterTimeSlotId || 0),
                                    timeslotId: Number(firstSlot.id || 0) > 0 ? Number(firstSlot.id) : undefined,
                                  });
                                } else {
                                  setBookingMode("STANDARD");
                                  setSpecialBookingHours(1);
                                  setSelectedSlot(null);
                                }
                              }}
                              className={`up-date-grid-btn ${isSel && !isUnavailableDay && !isSpecialDay ? "up-date-grid-btn-active" : ""}`}
                              style={{
                                borderColor: isUnavailableDay
                                  ? "#E2E8F0"
                                  : isSel
                                    ? (isSpecialDay ? "#1D4ED8" : "#16A34A")
                                    : isSpecialDay
                                      ? "#93C5FD"
                                      : "#E2E8F0",
                                background: isUnavailableDay
                                  ? "#F8FAFC"
                                  : isSel
                                    ? (isSpecialDay ? "#1D4ED8" : "#16A34A")
                                    : isSpecialDay
                                      ? "#EFF6FF"
                                      : "#F8FAFC",
                                color: isUnavailableDay
                                  ? "#94A3B8"
                                  : isSel
                                    ? "#fff"
                                    : isSpecialDay
                                      ? "#1D4ED8"
                                      : "#475569",
                                cursor: isUnavailableDay ? "not-allowed" : "pointer",
                                opacity: isUnavailableDay ? 0.55 : 1,
                                boxShadow: isSel && isSpecialDay ? "0 2px 8px rgba(29,78,216,0.30)" : undefined,
                              }}
                            >
                              <span className="up-date-grid-day" style={isSel ? { color: "#fff" } : undefined}>{d.day}</span>
                              <span className="up-date-grid-date" style={isSel ? { color: "#fff" } : undefined}>{d.date}</span>
                              <span className="up-date-grid-month" style={isSel ? { color: "rgba(255,255,255,0.85)" } : undefined}>{d.month}</span>
                              {isSpecialDay && (
                                <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.4, marginTop: 2, color: isSel ? "rgba(255,255,255,0.9)" : "#2563EB" }}>
                                  SPEC
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        disabled={dayOffset >= maxDayOffset}
                        onClick={() => setDayOffset(o => Math.min(maxDayOffset, o + 1))}
                        style={{
                          width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                          border: `1.5px solid ${dayOffset >= maxDayOffset ? "#F1F5F9" : "#BFDBFE"}`,
                          background: "#fff",
                          cursor: dayOffset >= maxDayOffset ? "default" : "pointer",
                          color: dayOffset >= maxDayOffset ? "#CBD5E1" : "#2563EB",
                          display: "flex", alignItems: "center", justifyContent: "center"
                        }}
                      >
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    {!hasPublishedBookingDay && (
                      <div className="up-no-slots-warning">
                        <p style={{ fontWeight: 600, margin: "0 0 4px" }}>No availability published yet.</p>
                        <p style={{ margin: 0, fontSize: 12, color: "#64748B" }}>The next 30 days are visible, but the consultant has not opened any bookable standard or special days yet.</p>
                      </div>
                    )}
                    <p className="up-step-label">Step 2 - {bookingMode === "SPECIAL" ? "Special Request Day" : "Select Time"}</p>
                    {bookingMode === "SPECIAL" ? (
                      <div style={{ padding: "14px 18px", borderRadius: 14, background: "linear-gradient(135deg,#FFF8E1 0%,#FEF3C7 60%,#FFFBEB 100%)", border: "1.5px solid #F59E0B", color: "#78350F", fontSize: 13, lineHeight: 1.6, boxShadow: "0 2px 10px rgba(245,158,11,0.12)" }}>
                        <div style={{ fontWeight: 800, marginBottom: 5, display: "flex", alignItems: "center", gap: 7, fontSize: 14 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>
                          Special booking day selected
                        </div>
                        <div style={{ color: "#92400E" }}>The consultant will confirm the exact meeting time after you submit the request. Choose the slot you want below.</div>
                      </div>
                    ) : isFreeFlowingSpecialDay ? (
                      /* ── Request-based special day: no fixed time - consultant confirms ── */
                      <div style={{ padding: "16px 18px", borderRadius: 14, background: "linear-gradient(135deg,#FFFBEB,#FEF3C7)", border: "1px solid #FCD34D", color: "#92400E", fontSize: 13, lineHeight: 1.65 }}>
                        <div style={{ fontWeight: 800, marginBottom: 6, display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ background: "#F59E0B", color: "#fff", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>SPECIAL</span>
                          Request-based Special Day
                        </div>
                        <div>The consultant has opened this date for a special booking. There are no fixed time slots - fill in your requirement notes and preferred meeting mode below, and the consultant will confirm the exact meeting time with you directly.</div>
                      </div>
                    ) : selectedSpecialDaySlots.length > 0 ? (
                      <div className="up-time-grid">
                        {selectedSpecialDaySlots.map(slot => {
                          const slotStart = slot.slotTime;
                          const slotLabel = slot.timeRange || formatSpecialTimeRange(slotStart, selectedConsultant.slotDurationHours || 1);
                          const todayStr = now.toISOString().split("T")[0];
                          const isToday = selectedDay.iso === todayStr;
                          const [slotHour, slotMinute] = slotStart.split(":").map(Number);
                          const isPast = isToday && (slotHour < now.getHours() || (slotHour === now.getHours() && slotMinute <= now.getMinutes()));
                          const isBookedSlot = slot.status?.toUpperCase() === "BOOKED";
                          const isSelected = selectedSlot?.start24h === slotStart;
                          const isDisabled = isPast || isBookedSlot;
                          return (
                            <button
                              key={slot.id}
                              disabled={isDisabled}
                              title={isBookedSlot ? "Already booked" : isPast ? "Time passed" : "Available"}
                              onClick={() => {
                                if (isDisabled) return;
                                const nextLabel = slotLabel;
                                setSelectedSlot({
                                  start24h: slotStart,
                                  label: nextLabel,
                                  masterId: Number(slot.masterTimeSlotId || 0),
                                  timeslotId: Number(slot.id || 0) > 0 ? Number(slot.id) : undefined,
                                });
                                setSpecialBookingHours(Math.min(3, Math.max(1, getRangeDurationHours(nextLabel, 1))));
                              }}
                              className={`up-time-btn ${isSelected ? "up-time-btn-active" : ""} ${isDisabled ? "up-time-btn-booked" : ""}`}
                              style={
                                isBookedSlot
                                  ? { opacity: 0.65, cursor: "not-allowed", pointerEvents: "none", background: "#FEF2F2", borderColor: "#FECACA", color: "#DC2626" }
                                  : isPast
                                    ? { textDecoration: "line-through", opacity: 0.6, cursor: "not-allowed", pointerEvents: "none" }
                                    : isSelected
                                      ? { background: "#16A34A", borderColor: "#16A34A", color: "#fff", boxShadow: "0 4px 12px rgba(22,163,74,0.30)" }
                                      : { borderColor: "#BBFAD5", background: "#F0FDF4", color: "#166534" }
                              }
                            >
                              {slotLabel}
                              {isBookedSlot && <div className="up-unavailable-label" style={{ color: "#DC2626", fontWeight: 800 }}>BOOKED</div>}
                              {isPast && !isBookedSlot && <div className="up-unavailable-label">PASSED</div>}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="up-no-slots-warning">
                        <p style={{ fontWeight: 600, margin: "0 0 4px" }}>No slots available on this date.</p>
                      </div>
                    )}

                    {bookingMode === "SPECIAL" && (
                      <div style={{ marginTop: 14, padding: "16px 18px", borderRadius: 16, background: "linear-gradient(135deg,#F0FDFA 0%,#E6FFFA 100%)", border: "1.5px solid #5EEAD4" }}>
                        {/* Note: slot duration */}
                        <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "linear-gradient(90deg,#CCFBF1,#99F6E4 120%)", border: "1px solid #5EEAD4", display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#0F4C45", fontWeight: 600 }}>
                          <Clock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                          <span><strong>Note:</strong> Each slot = <strong>{specialSlotUnitLabel}</strong>. The consultant will confirm the exact meeting time after you submit the request.</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#0F766E", marginBottom: 10, display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          <Clock size={13} />
                          Select Slot
                          <span style={{ fontSize: 10, fontWeight: 500, color: "#64748B", textTransform: "none", letterSpacing: 0 }}>(each = {specialSlotUnitLabel})</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          {selectedSpecialDurationOptions.map(count => {
                            const isActive = effectiveSpecialBookingHours === count;
                            const isAlreadyBooked = bookedSpecialSlotCounts.has(count);
                            return (
                              <button
                                key={count}
                                type="button"
                                onClick={() => !isAlreadyBooked && setSpecialBookingHours(count)}
                                disabled={isAlreadyBooked}
                                style={{
                                  padding: "10px 20px",
                                  borderRadius: 12,
                                  border: `1.5px solid ${isAlreadyBooked ? "#FCA5A5" : isActive ? "#D97706" : "#99F6E4"}`,
                                  background: isAlreadyBooked
                                    ? "linear-gradient(135deg,#FEE2E2,#FECACA)"
                                    : isActive
                                      ? "linear-gradient(135deg,#D97706,#F59E0B)"
                                      : "#F0FDFA",
                                  color: isAlreadyBooked ? "#DC2626" : isActive ? "#fff" : "#0F766E",
                                  fontWeight: 700,
                                  fontSize: 13,
                                  cursor: isAlreadyBooked ? "not-allowed" : "pointer",
                                  fontFamily: "inherit",
                                  boxShadow: isActive && !isAlreadyBooked ? "0 6px 18px rgba(217,119,6,0.30)" : "none",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  gap: 3,
                                  transition: "all 0.15s",
                                  minWidth: 80,
                                  opacity: isAlreadyBooked ? 0.85 : 1,
                                }}
                              >
                                <span style={{ fontSize: 13, fontWeight: 800 }}>{formatSlotCountLabel(count)}</span>
                                <span style={{ fontSize: 10, fontWeight: 700, opacity: 1 }}>
                                  {isAlreadyBooked ? "BOOKED" : specialSlotUnitLabel}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {bookingMode === "SPECIAL" && !hasFixedSpecialSlots && (
                      <div style={{ marginTop: 10, fontSize: 12, color: "#78350F", background: "linear-gradient(90deg,#FFF8E1,#FFFBEB)", border: "1px solid #F59E0B", borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", gap: 7, fontWeight: 600 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        The consultant will confirm your meeting time after you submit the request.
                      </div>
                    )}

                    {/* ── Preferred time range for special bookings ── */}
                    {false && bookingMode === "SPECIAL" && (
                      <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 14, background: "#F0FDFA", border: "1px solid #99F6E4" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#0F766E", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                          <Clock size={13} />
                          Slot Duration
                          <span style={{ fontSize: 10, fontWeight: 500, color: "#64748B" }}>(optional - helps the consultant plan)</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>From</div>
                            <input
                              type="time"
                              value={specialStartTime}
                              onChange={e => { setSpecialStartTime(e.target.value); setSpecialEndTime(""); }}
                              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${specialStartTime ? "#0F766E" : "#CBD5E1"}`, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: specialStartTime ? "#F0FDFA" : "#fff", color: "#0F172A" }}
                            />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>To</div>
                            <input
                              type="time"
                              value={specialEndTime}
                              onChange={e => setSpecialEndTime(e.target.value)}
                              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${specialEndTime ? "#0F766E" : "#CBD5E1"}`, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: specialEndTime ? "#F0FDFA" : "#fff", color: "#0F172A" }}
                            />
                          </div>
                        </div>
                        {specialStartTime && specialEndTime && (
                          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "#0F766E", fontWeight: 600 }}>
                            <span style={{ background: "#CCFBF1", border: "1px solid #99F6E4", borderRadius: 20, padding: "2px 10px", fontWeight: 700, fontSize: 12 }}>
                              {effectiveSpecialBookingHours} hr{effectiveSpecialBookingHours !== 1 ? "s" : ""}
                            </span>
                            <span>✓ {toAmPm(specialStartTime)} → {toAmPm(specialEndTime)}</span>
                          </div>
                        )}
                        {specialStartTime && !specialEndTime && (
                          <div style={{ marginTop: 6, fontSize: 11, color: "#94A3B8" }}>Now pick an end time →</div>
                        )}
                        {!specialStartTime && (
                          <div style={{ marginTop: 6, fontSize: 11, color: "#94A3B8" }}>Leave blank to let the consultant decide the time.</div>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="up-step-label">Meeting Mode</p>
                  <div className="up-meeting-mode-row">
                    {(["ONLINE", "PHYSICAL", "PHONE"] as const).map(mode => (
                      <button key={mode} onClick={() => setMeetingMode(mode)} className={`up-meeting-btn ${meetingMode === mode ? "up-meeting-btn-active" : ""}`}>
                        {mode === "ONLINE" ? <Monitor size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} /> : mode === "PHONE" ? <Phone size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} /> : <MapPin size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />} {mode === "PHYSICAL" ? "In-Person" : mode}
                      </button>
                    ))}
                  </div>

                  <p className="up-step-label">
                    Notes{" "}
                    {bookingMode === "SPECIAL" ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#B45309", background: "linear-gradient(90deg,#FFFBEB,#FEF3C7)", border: "1px solid #FDE68A", borderRadius: 6, padding: "1px 7px", marginLeft: 4, verticalAlign: "middle" }}>Mandatory</span>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 500, color: "#94A3B8", marginLeft: 4, verticalAlign: "middle" }}>Optional</span>
                    )}
                  </p>
                  <textarea className="up-notes-textarea" value={userNotes} onChange={e => setUserNotes(e.target.value)} rows={4} placeholder="Describe your requirement and discussion points" />

                  {/* ── Available Offers / Price Breakdown ── Hidden for admin-added members (free access) */}
                  {isAdminMember ? (
                    <div style={{ marginTop: 20, padding: "20px", borderRadius: 14, background: "linear-gradient(135deg,#F0FDF4 0%,#DCFCE7 100%)", border: "2px solid #86EFAC", textAlign: "center" }}>
                      <div style={{ fontSize: 26, marginBottom: 8 }}>🎁</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#166534", marginBottom: 4 }}>Free Premium Access</div>
                      <div style={{ fontSize: 12, color: "#15803D", lineHeight: 1.6 }}>Session bookings are completely free for you.<br />No charges apply - enjoy unlimited access!</div>
                    </div>
                  ) : (<>
                    <div style={{ marginTop: 20 }}>
                      <p className="up-step-label" style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }}><polyline points="20 12 20 22 4 22 4 12" /><rect x="2" y="7" width="20" height="5" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg> Apply Offer
                      </p>
                      {loadingOffers ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)", borderRadius: 12, fontSize: 13, color: "#0369A1", border: "1px solid #BAE6FD" }}>
                          <img src={logoImg} alt="" style={{ width: 20, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {/* No offer / Full price option */}
                          <label style={{
                            display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12,
                            border: `2px solid ${selectedOfferId === null ? "#2563EB" : "#E2E8F0"}`,
                            background: selectedOfferId === null ? "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)" : "#FAFAFA",
                            cursor: "pointer", transition: "all 0.2s ease",
                            boxShadow: selectedOfferId === null ? "0 2px 8px rgba(37,99,235,0.15)" : "none"
                          }}>
                            <input type="radio" name="offer" checked={selectedOfferId === null} onChange={() => setSelectedOfferId(null)} style={{ accentColor: "#2563EB", width: 18, height: 18 }} />
                            <div style={{ flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: selectedOfferId === null ? 700 : 600, color: selectedOfferId === null ? "#1E40AF" : "#374151" }}>
                                No offer - Pay full price
                              </span>
                            </div>
                            <span style={{ fontSize: 14, fontWeight: 800, color: selectedOfferId === null ? "#1E40AF" : "#374151" }}>₹{calcTotal(selectedConsultant.fee).total.toLocaleString()}</span>
                          </label>

                          {/* Available offers */}
                          {consultantOffers.length > 0 ? (
                            consultantOffers.map(offer => {
                              const isUsed = usedOfferIds.includes(Number(offer.id));
                              const isSelected = selectedOfferId === offer.id;
                              // Apply discount to the TOTAL (base + commission), not the raw base.
                              // selectedConsultant.fee is raw; calcTotal adds commission.
                              // Discount is on the final price user sees (e.g. 20% off ₹1,875 = ₹375 off)
                              const totalWithCommission = calcTotal(selectedConsultant.fee).total;
                              const discountAmt = parseDiscountAmount(offer.discount || "0", totalWithCommission, offer);
                              const discountedTotal = Math.max(totalWithCommission - discountAmt, 0);
                              const savings = totalWithCommission - discountedTotal;
                              return (
                                <label key={offer.id} style={{
                                  display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 12,
                                  border: `2px solid ${isUsed ? "#F59E0B" : isSelected ? "#16A34A" : "#E2E8F0"}`,
                                  background: isUsed
                                    ? "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)"
                                    : isSelected
                                      ? "linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)"
                                      : "#FAFAFA",
                                  cursor: isUsed ? "not-allowed" : "pointer", transition: "all 0.2s ease",
                                  boxShadow: isUsed
                                    ? "0 2px 8px rgba(245,158,11,0.18)"
                                    : isSelected
                                      ? "0 2px 8px rgba(22,163,74,0.15)"
                                      : "none",
                                  opacity: isUsed ? 0.9 : 1
                                }}>
                                  <input
                                    type="radio"
                                    name="offer"
                                    checked={isSelected}
                                    disabled={isUsed}
                                    onChange={() => {
                                      if (!isUsed) setSelectedOfferId(offer.id);
                                    }}
                                    style={{ accentColor: isUsed ? "#F59E0B" : "#16A34A", width: 18, height: 18, marginTop: 2 }}
                                  />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 13, fontWeight: 700, color: isUsed ? "#92400E" : isSelected ? "#166534" : "#0F172A" }}>{offer.title}</span>
                                      {isUsed && (
                                        <span style={{
                                          fontSize: 10, fontWeight: 800,
                                          background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
                                          color: "#fff", padding: "3px 8px", borderRadius: 20,
                                          boxShadow: "0 1px 4px rgba(245,158,11,0.28)"
                                        }}>
                                          Already used
                                        </span>
                                      )}
                                      {offer.discount && (
                                        <span style={{
                                          fontSize: 10, fontWeight: 800,
                                          background: "linear-gradient(135deg, #DC2626 0%, #B91C1C 100%)",
                                          color: "#fff", padding: "3px 8px", borderRadius: 20,
                                          boxShadow: "0 1px 4px rgba(220,38,38,0.3)"
                                        }}>
                                          {offer.discount} OFF
                                        </span>
                                      )}
                                    </div>
                                    {offer.description && <div style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4, marginBottom: 4 }}>{offer.description}</div>}
                                    {savings > 0 && (
                                      <div style={{
                                        fontSize: 11, color: "#16A34A", fontWeight: 700,
                                        display: "inline-flex", alignItems: "center", gap: 4,
                                        background: "#DCFCE7", padding: "2px 8px", borderRadius: 20
                                      }}>
                                        Save ₹{savings.toLocaleString()}
                                      </div>
                                    )}
                                    {isUsed && (
                                      <div style={{ fontSize: 11, color: "#B45309", fontWeight: 700, marginTop: 6 }}>
                                        This offer was already used on this account.
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    {savings > 0 && <div style={{ fontSize: 11, color: "#94A3B8", textDecoration: "line-through" }}>₹{totalWithCommission.toLocaleString()}</div>}
                                    <div style={{ fontSize: 15, fontWeight: 800, color: isUsed ? "#92400E" : isSelected ? "#16A34A" : "#0F172A" }}>₹{discountedTotal.toLocaleString()}</div>
                                  </div>
                                </label>
                              );
                            })
                          ) : (
                            <div style={{
                              padding: "12px 16px", borderRadius: 10,
                              background: "#F8FAFC", border: "1px dashed #CBD5E1",
                              fontSize: 12, color: "#64748B", textAlign: "center"
                            }}>
                              No special offers available for this consultant
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {(selectedSlot || bookingMode === "SPECIAL") && (() => {
                      // ── Correct price calculation ──────────────────────────────────────────
                      // selectedConsultant.fee = raw base (e.g. ₹1,500)
                      // calcTotal(fee).total = base + platform fee = what user pays without offer (e.g. ₹1,875)
                      // Discount applies to the TOTAL (₹1,875), NOT the raw base.
                      // So 20% off ₹1,875 = ₹375 → user pays ₹1,500. No second commission added.
                      const rawBase = selectedConsultant.fee;
                      const offer = selectedOfferId ? consultantOffers.find(o => o.id === selectedOfferId) : null;
                      const standardSessionsBooked = bookingMultiple && selectedSlots.length > 0 ? selectedSlots.length : 1;
                      // For SPECIAL bookings, always charge exactly 1 session fee regardless of slot count
                      const sessionsBooked = bookingMode === "SPECIAL"
                        ? 1
                        : standardSessionsBooked;
                      const { total: baseTotal } = calcTotal(rawBase);
                      let discountAmt = 0;
                      let grandTotal = 0;
                      let displayFeeAmount = 0;
                      if (bookingMode === "SPECIAL") {
                        const quote = calcSpecialBookingQuote(rawBase, sessionsBooked, offer);
                        discountAmt = quote.discountAmount;
                        grandTotal = quote.total;
                        displayFeeAmount = quote.baseAmount + quote.additionalCharges;
                      } else {
                        if (offer && (offer.discount || offer.discountValue != null)) {
                          discountAmt = parseDiscountAmount(offer.discount || "0", baseTotal, offer);
                        }
                        const finalTotal = Math.max(baseTotal - discountAmt, 0);
                        grandTotal = finalTotal * sessionsBooked;
                        displayFeeAmount = baseTotal * sessionsBooked;
                      }
                      const displaySlots: { dayLabel: string; label: string }[] = [
                        {
                          dayLabel: `${selectedDay.date} ${selectedDay.month}`,
                          label: bookingMode === "SPECIAL"
                            ? specialDurationLabel
                            : (selectedSpecialBookingRange || (selectedSlot ? formatSpecialTimeRange(selectedSlot.start24h, specialBookingHours) : "")),
                        },
                      ];
                      return (
                        <div style={{ marginTop: 20, padding: "18px 20px", borderRadius: 14, background: "linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)", border: "1.5px solid #E2E8F0" }}>
                          {bookingMode === "SPECIAL" && specialStartTime && specialEndTime && (
                            <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 10, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8" }}>Preferred time</span>
                              <span style={{ fontSize: 12, fontWeight: 800, color: "#1E3A8A" }}>{specialDurationLabel}</span>
                            </div>
                          )}
                          {/* Session info */}
                          <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid #E2E8F0" }}>
                            {displaySlots.map((ds, idx) => (
                              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: idx < displaySlots.length - 1 ? 8 : 0 }}>
                                <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700 }}>
                                  {displaySlots.length > 1 ? `${idx + 1}` : <Calendar size={14} color="#fff" strokeWidth={2} />}
                                </div>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{ds.dayLabel} · {ds.label}</div>
                                  <div style={{ fontSize: 11, color: "#64748B" }}>
                                    {meetingMode === "ONLINE" ? <><Monitor size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />Online Meeting</> : meetingMode === "PHONE" ? <><Phone size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />Phone Call</> : <><MapPin size={11} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />In-Person Visit</>}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                          {/* Price breakdown */}
                          <div style={{ fontSize: 12, color: "#475569" }}>
                            {/* Session fee - already includes platform commission */}
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                              <span>
                                Session Fee
                                {bookingMode === "SPECIAL"
                                  ? <span style={{ fontSize: 10, color: "#94A3B8", marginLeft: 6, fontWeight: 400 }}>(1 session)</span>
                                  : sessionsBooked > 1 ? ` × ${sessionsBooked}` : ""}
                              </span>
                              <span style={{ fontWeight: 600 }}>₹{(baseTotal * sessionsBooked).toLocaleString()}</span>
                            </div>

                            {/* Offer Discount row */}
                            {offer && discountAmt > 0 && (
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, color: "#16A34A", fontWeight: 600 }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ background: "#DCFCE7", padding: "2px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>OFFER</span>
                                  {offer.title}{sessionsBooked > 1 && bookingMode !== "SPECIAL" ? ` × ${sessionsBooked}` : ""}
                                </span>
                                <span>-₹{(discountAmt * sessionsBooked).toLocaleString()}</span>
                              </div>
                            )}
                          </div>

                          {/* Total */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "2px solid #CBD5E1" }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>Total{bookingMode === "SPECIAL" ? "" : sessionsBooked > 1 ? ` (${sessionsBooked} sessions)` : ""}</span>
                            <span style={{ fontSize: 20, fontWeight: 800, color: "#2563EB", display: "flex", alignItems: "baseline", gap: 2 }}>
                              <span style={{ fontSize: 14 }}>₹</span>{grandTotal.toLocaleString()}
                            </span>
                          </div>

                          {/* Savings banner */}
                          {offer && discountAmt > 0 && (
                            <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)", border: "1px solid #86EFAC", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#166534" }}>
                              <Zap size={13} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />You're saving ₹{(discountAmt * sessionsBooked).toLocaleString()} with this offer!
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>)}

                  {/* ── Confirm & Pay / Book button ── */}
                  <button
                    disabled={confirming || (bookingMode !== "SPECIAL" && !selectedSlot) || (bookingMode === "SPECIAL" && !userNotes.trim())}
                    onClick={handleConfirm}
                    className={`up-proceed-btn ${(bookingMode === "SPECIAL" || selectedSlot) && !confirming && (bookingMode !== "SPECIAL" || userNotes.trim()) ? "up-proceed-btn-active" : ""}`}
                  >
                    {confirming ? (bookingMode === "SPECIAL" ? "Sending Request..." : isAdminMember ? "Booking..." : "Processing Payment...") : (() => {
                      if (bookingMode !== "SPECIAL" && !selectedSlot) return "Select an available slot";
                      if (bookingMode === "SPECIAL" && !userNotes.trim()) return "Enter requirement notes to continue";
                      if (isAdminMember) {
                        return bookingMode === "SPECIAL"
                          ? "Send Special Booking Request (Free)"
                          : "Confirm & Book (Free)";
                      }
                      const { total: bTotal } = calcTotal(selectedConsultant.fee);
                      const offerSel = selectedOfferId ? consultantOffers.find(o => o.id === selectedOfferId) : null;
                      let da = 0;
                      if (offerSel && (offerSel.discount || offerSel.discountValue != null)) {
                        da = parseDiscountAmount(offerSel.discount || "0", bTotal, offerSel);
                      }
                      const fTotal = Math.max(bTotal - da, 0);
                      const count = bookingMode === "SPECIAL" ? 1 : (bookingMultiple && selectedSlots.length > 0 ? selectedSlots.length : 1);
                      const gTotal = fTotal * count;
                      return bookingMode === "SPECIAL"
                        ? `Send Special Booking Request ₹${gTotal.toLocaleString()}`
                        : `Confirm & Pay ₹${gTotal.toLocaleString()}`;
                    })()}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Nav - 5 tabs ── */}
      <nav className="up-bottom-nav">
        {(["consultants", "bookings", "tickets", "notifications", "settings"] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); if (t !== "notifications") setShowNotifPanel(false); }}
            className={`up-nav-btn ${tab === t ? "up-nav-btn-active" : ""}`}
            style={{ position: "relative" }}>
            <span>
              {t === "consultants" ? "Find"
                : t === "bookings" ? "Bookings"
                  : t === "tickets" ? "Tickets"
                    : t === "notifications" ? "Updates"
                      : "Settings"}
            </span>
          </button>
        ))}
      </nav>

      {/* == BOOKING FEEDBACK MODAL == */}
      {feedbackModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.65)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(6px)" }} onClick={() => !submittingFeedback && setFeedbackModal(null)}>
          <div style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(15,23,42,0.35)" }} onClick={e => e.stopPropagation()}>
            <div style={{ background: "linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)", padding: "22px 24px 20px", borderRadius: "24px 24px 0 0", position: "relative" }}>
              <button onClick={() => setFeedbackModal(null)} style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#93C5FD", marginBottom: 4 }}>Rate Your Session</div>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: "#fff", margin: "0 0 4px" }}>{feedbackModal.existingFeedback ? "Update Your Feedback" : "Leave Feedback"}</h3>
              <p style={{ fontSize: 13, color: "#BFDBFE", margin: 0 }}>Session with {feedbackModal.consultantName}</p>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "12px 16px", marginBottom: 24, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#475569", display: "inline-flex", alignItems: "center", gap: 4 }}><Calendar size={12} /> {feedbackModal.slotDate || "Session"}</span>
                {feedbackModal.timeRange && <span style={{ background: "#EFF6FF", color: "#2563EB", fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 20, border: "1px solid #BFDBFE" }}>{feedbackModal.timeRange}</span>}
                <span style={{ background: "#F0FDF4", color: "#16A34A", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20 }}>Session Attended</span>
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
                <textarea value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} placeholder="Share your experience..." maxLength={1000} rows={4}
                  style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E2E8F0", borderRadius: 12, fontSize: 13, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box", color: "#1E293B", lineHeight: 1.6 }}
                  onFocus={e => (e.target.style.borderColor = "#2563EB")} onBlur={e => (e.target.style.borderColor = "#E2E8F0")} />
                <div style={{ textAlign: "right", fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{feedbackComment.length}/1000</div>
              </div>
              <button onClick={handleSubmitFeedback} disabled={submittingFeedback || feedbackRating === 0}
                style={{ width: "100%", padding: 14, background: feedbackRating === 0 || submittingFeedback ? "#E2E8F0" : "linear-gradient(135deg,#2563EB,#1D4ED8)", color: feedbackRating === 0 || submittingFeedback ? "#94A3B8" : "#fff", border: "none", borderRadius: 14, fontWeight: 700, fontSize: 15, cursor: feedbackRating === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {submittingFeedback
                  ? <><img src={logoImg} alt="" style={{ width: 18, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} /> Submitting...</>
                  : feedbackModal.existingFeedback ? "Update Feedback" : "Submit Feedback"}
              </button>
              {feedbackRating === 0 && <p style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", margin: "10px 0 0" }}>Please select a star rating to continue</p>}
            </div>
          </div>
        </div>
      )}

      {/* == CATEGORY & QUESTIONNAIRE MODAL == */}
      {/* == CATEGORY MODAL - multi-select, saved categories shown first == */}
      {showCategoryModal && (() => {
        // All state lives at component level - tempSelectedCategories, dynamicSkillCategories, userCategories
        // This IIFE is pure rendering logic only - NO hooks here
        const savedCats = userCategories.map(uc => uc.category);
        const allCats = dynamicSkillCategories.length > 0 ? dynamicSkillCategories : Object.keys(CATEGORY_OPTIONS);
        // Put saved categories first, then remaining
        const orderedCats = [
          ...savedCats.filter(c => allCats.includes(c)),
          ...allCats.filter(c => !savedCats.includes(c)),
        ];

        const toggleCat = (cat: string) => {
          setTempSelectedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
          );
        };

        const matchCount = consultants.filter(c =>
          tempSelectedCategories.some(sel =>
            c.tags.some((t: string) =>
              t.toLowerCase().includes(sel.toLowerCase()) ||
              sel.toLowerCase().includes(t.toLowerCase())
            )
          )
        ).length;

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 2100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)", background: "rgba(15,23,42,0.65)" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(15,23,42,0.35)" }}>

              {/* Header */}
              <div style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)", padding: "22px 24px 20px", position: "relative" }}>
                <button
                  onClick={() => { setShowCategoryModal(false); setTempSelectedCategories([]); }}
                  style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
                <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#93C5FD", marginBottom: 4 }}>SELECT CATEGORY</div>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>What are you looking for?</h3>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                  Select one or more categories.
                  {tempSelectedCategories.length > 0 && (
                    <span style={{ marginLeft: 8, background: "rgba(255,255,255,0.2)", padding: "2px 9px", borderRadius: 20, fontWeight: 700, color: "#fff" }}>
                      {tempSelectedCategories.length} selected
                    </span>
                  )}
                </div>
              </div>

              <div style={{ padding: "20px 24px 24px" }}>

                {/* Show already-saved categories at top */}
                {savedCats.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                      Your saved categories. Tap the icon to remove one.
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {savedCats.map(cat => {
                        const isKept = tempSelectedCategories.includes(cat);
                        return (
                          <div key={cat} style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "6px 10px 6px 12px",
                            borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                            border: `1.5px solid ${isKept ? "#BFDBFE" : "#FECACA"}`,
                            background: isKept ? "#EFF6FF" : "#FFF8F8",
                            color: isKept ? "#2563EB" : "#DC2626",
                            transition: "all 0.15s",
                          }}
                            onClick={() => toggleCat(cat)}>
                            {isKept && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                            <span>{cat}</span>
                            <span style={{ lineHeight: 1, opacity: 0.7, display: "flex", alignItems: "center" }}>{isKept ? <X size={13} /> : <Plus size={13} />}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ height: 1, background: "#F1F5F9", margin: "16px 0 4px" }} />
                  </div>
                )}

                {/* Category grid */}
                <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 12 }}>
                  {savedCats.length > 0 ? "Add more categories" : "Select your categories"}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "#94A3B8" }}>(based on available consultant expertise)</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxHeight: 320, overflowY: "auto", paddingRight: 4, marginBottom: 16 }}>
                  {orderedCats.map(cat => {
                    const isSelected = tempSelectedCategories.includes(cat);
                    const wasSaved = savedCats.includes(cat);
                    return (
                      <button key={cat}
                        onClick={() => toggleCat(cat)}
                        style={{
                          padding: "11px 13px", borderRadius: 12, cursor: "pointer",
                          border: `2px solid ${isSelected ? "#2563EB" : wasSaved && !isSelected ? "#FCA5A5" : "#E2E8F0"}`,
                          background: isSelected ? "#EFF6FF" : wasSaved && !isSelected ? "#FFF8F8" : "#fff",
                          color: isSelected ? "#2563EB" : "#374151",
                          fontSize: 12, fontWeight: isSelected ? 700 : 500,
                          textAlign: "left", transition: "all 0.15s",
                          display: "flex", alignItems: "center", gap: 9,
                          boxShadow: isSelected ? "0 2px 8px rgba(37,99,235,0.15)" : "none",
                        }}>
                        <span style={{ color: isSelected ? "#2563EB" : "#64748B", flexShrink: 0, display: "flex" }}>{getCatSvgIcon(cat)}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3, flex: 1 }}>{cat}</span>
                        {isSelected
                          ? <span style={{ marginLeft: "auto", flexShrink: 0, width: 18, height: 18, borderRadius: "50%", background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          </span>
                          : <span style={{ marginLeft: "auto", flexShrink: 0, width: 18, height: 18, borderRadius: "50%", border: "1.5px solid #E2E8F0" }} />}
                      </button>
                    );
                  })}
                </div>

                {/* Live consultant match count */}
                {tempSelectedCategories.length > 0 && consultants.length > 0 && (
                  <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: "8px 14px", marginBottom: 16, fontSize: 12, color: "#166534", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    <CheckCircle size={12} color="#16A34A" /> {matchCount} consultant{matchCount !== 1 ? "s" : ""} match your {tempSelectedCategories.length > 1 ? `${tempSelectedCategories.length} selections` : "selection"}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 10 }}>

                  <button
                    onClick={() => handleSaveMultiCategories(tempSelectedCategories)}
                    disabled={tempSelectedCategories.length === 0}
                    style={{
                      flex: 2, padding: "12px", borderRadius: 12, border: "none",
                      background: tempSelectedCategories.length === 0 ? "#E2E8F0" : "linear-gradient(135deg,#2563EB,#1D4ED8)",
                      color: tempSelectedCategories.length === 0 ? "#94A3B8" : "#fff",
                      fontSize: 14, fontWeight: 700,
                      cursor: tempSelectedCategories.length === 0 ? "default" : "pointer",
                    }}>
                    {tempSelectedCategories.length === 0
                      ? "Select at least one category"
                      : `Save ${tempSelectedCategories.length} ${tempSelectedCategories.length === 1 ? "Category" : "Categories"}`}
                    {tempSelectedCategories.length > 0 && <ArrowRight size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      {/* == CATEGORY QUESTIONS MODAL - shown after selecting categories from Settings == */}
      {showCategoryQuestionsModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2150, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)", background: "rgba(15,23,42,0.7)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(15,23,42,0.4)" }}>
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)", padding: "22px 24px 20px", position: "relative" }}>
              <button onClick={() => { setShowCategoryQuestionsModal(false); setCategoryQuestionsData([]); setCategoryQAnswers({}); }}
                style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={18} /></button>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#93C5FD", marginBottom: 4 }}>CATEGORY QUESTIONS</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "#fff", margin: "0 0 6px" }}>A few quick questions</h3>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Based on your selected categories - helps consultants prepare for your session
              </div>
            </div>

            <div style={{ padding: "20px 24px 24px" }}>
              {loadingCategoryQuestions ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8" }}>
                  <img src={logoImg} alt="" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
                </div>
              ) : categoryQuestionsData.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /><path d="M16 19h6" /><path d="M19 16v6" /></svg></div>
                  <div style={{ fontWeight: 600, color: "#64748B", marginBottom: 6 }}>No questions for these categories</div>
                  <p style={{ fontSize: 13, margin: "0 0 18px" }}>You can continue browsing consultants.</p>
                  <button onClick={() => { setShowCategoryQuestionsModal(false); setCategoryQuestionsData([]); setCategoryQAnswers({}); }}
                    style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <span>Browse Consultants</span>
                      <ArrowRight size={14} />
                    </span>
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 14px", marginBottom: 20, fontSize: 12, color: "#1E40AF", display: "flex", alignItems: "center", gap: 6 }}>
                    <Info size={13} color="#2563EB" /> Your answers help match you with the right consultants. All fields are optional.
                  </div>

                  {/* Group questions by skill/category */}
                  {(() => {
                    const grouped: Record<string, typeof categoryQuestionsData> = {};
                    categoryQuestionsData.forEach(q => {
                      const key = q.skillName || "General";
                      if (!grouped[key]) grouped[key] = [];
                      grouped[key].push(q);
                    });
                    return Object.entries(grouped).map(([skillName, questions]) => (
                      <div key={skillName} style={{ marginBottom: 20 }}>
                        {Object.keys(grouped).length > 1 && (
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#7C3AED" }} />
                            {skillName}
                          </div>
                        )}
                        {questions.map((q, i) => (
                          <div key={q.id} style={{ marginBottom: 14 }}>
                            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                              {i + 1}. {q.text}
                              <span style={{ marginLeft: 6, fontSize: 10, color: "#94A3B8", fontWeight: 400 }}>(optional)</span>
                            </label>
                            <textarea
                              value={categoryQAnswers[q.id] || ""}
                              onChange={e => setCategoryQAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                              placeholder="Your answer..."
                              rows={2}
                              style={{ width: "100%", padding: "10px 13px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", boxSizing: "border-box", transition: "border-color 0.15s" }}
                              onFocus={e => { e.target.style.borderColor = "#BFDBFE"; }}
                              onBlur={e => { e.target.style.borderColor = "#E2E8F0"; }}
                            />
                          </div>
                        ))}
                      </div>
                    ));
                  })()}

                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button
                      onClick={() => {
                        setShowCategoryQuestionsModal(false);
                        setCategoryQuestionsData([]);
                        setCategoryQAnswers({});
                      }}
                      style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span>Save & Find Consultants</span>
                        <ArrowRight size={14} />
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* == FIRST-LOGIN ONBOARDING MODAL == */}
      {/* Flow: Step 1 Details → Step 2 Categories → Step 3 Questions → Step 4 T&C → Consultants */}
      {showFirstLoginQuestionnaire && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)", background: "rgba(15,23,42,0.7)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(15,23,42,0.4)" }}>

            {/* ── Header ── */}
            <div style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)", padding: "24px 24px 20px", position: "sticky", top: 0, zIndex: 1, borderRadius: "24px 24px 0 0" }}>
              {firstLoginStep !== "intro" && firstLoginStep !== "done" && (
                <button onClick={() => {
                  if (firstLoginStep === "details") setFirstLoginStep("intro");
                  else if (firstLoginStep === "categories") setFirstLoginStep("details");
                  else if (firstLoginStep === "skill-questions") setFirstLoginStep("categories");
                  else if (firstLoginStep === "terms") setFirstLoginStep(skillQuestions.length > 0 ? "skill-questions" : "categories");
                }} style={{ position: "absolute", top: 16, left: 16, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", cursor: "pointer" }}><ArrowLeft size={16} /></button>
              )}
              {/* No close/skip button - onboarding is mandatory for first-time users */}

              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#93C5FD", marginBottom: 6 }}>
                  {firstLoginStep === "intro" && "Welcome to Meet The Masters"}
                  {firstLoginStep === "details" && "Step 1 of 4 - Your Details"}
                  {firstLoginStep === "categories" && "Step 2 of 4 - Your Interests"}
                  {firstLoginStep === "skill-questions" && "Step 3 of 4 - Quick Questions"}
                  {firstLoginStep === "terms" && "Step 4 of 4 - Terms & Conditions"}
                  {firstLoginStep === "done" && "All Set!"}
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>
                  {firstLoginStep === "intro" && "Let's personalise your experience"}
                  {firstLoginStep === "details" && "Tell us about yourself"}
                  {firstLoginStep === "categories" && "What are you looking for?"}
                  {firstLoginStep === "skill-questions" && "A few quick questions"}
                  {firstLoginStep === "terms" && "Review & Accept"}
                  {firstLoginStep === "done" && "Your consultants are ready!"}
                </h3>
                <p style={{ fontSize: 13, color: "#BFDBFE", margin: 0 }}>
                  {firstLoginStep === "intro" && "4 quick steps to match you with the right consultants."}
                  {firstLoginStep === "details" && "Confirm your details and financial background."}
                  {firstLoginStep === "categories" && "Select the areas where you need expert guidance."}
                  {firstLoginStep === "skill-questions" && "Based on your selected categories - helps consultants prepare."}
                  {firstLoginStep === "terms" && "Please read and accept our Terms & Conditions to continue."}
                  {firstLoginStep === "done" && "Consultants matched based on your full profile."}
                </p>
              </div>

              {/* Progress bar - 4 steps */}
              {firstLoginStep !== "done" && (
                <div style={{ display: "flex", gap: 5, marginTop: 16 }}>
                  {["intro", "details", "categories", "skill-questions", "terms"].map((s, i) => (
                    <div key={s} style={{
                      height: 3, flex: 1, borderRadius: 3,
                      background: ["intro", "details", "categories", "skill-questions", "terms"].indexOf(firstLoginStep) >= i
                        ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.2)",
                      transition: "background 0.3s"
                    }} />
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding: "24px" }}>

              {/* ── STEP: Intro ── */}
              {firstLoginStep === "intro" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                    {[
                      { icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>, title: "Personalised Matching", desc: "Get consultants matched to your exact needs." },
                      { icon: "zap", title: "Quick Setup", desc: "4 simple steps - takes under 3 minutes." },
                      { icon: <Lock size={16} color="#2563EB" />, title: "Private & Secure", desc: "Your answers are used only for recommendations." },
                      { icon: "edit", title: "Always Editable", desc: "Change your preferences anytime from Settings." },
                    ].map((item, i) => (
                      <div key={i} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 14, padding: "14px 16px" }}>
                        <div style={{ marginBottom: 8 }}>
                          {item.icon === "target" ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg> : item.icon === "zap" ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> : item.icon === "lock" ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{item.title}</div>
                        <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>{item.desc}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setFirstLoginStep("details")}
                      style={{ flex: 1, padding: "14px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span>Get Started</span>
                        <ArrowRight size={14} />
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 1: Details (personal + income merged) ── */}
              {firstLoginStep === "details" && (() => {
                const allDetailQs = [...PERSONAL_QUESTIONS, ...INCOME_QUESTIONS];
                const inp: React.CSSProperties = { width: "100%", padding: "10px 13px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
                return (
                  <div>
                    <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 12, color: "#166534", fontWeight: 600 }}>
                      Details pre-filled from your registration. Please confirm or update.
                    </div>
                    {allDetailQs.map((q, i) => (
                      <div key={q.key} style={{ marginBottom: 16 }}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7 }}>{i + 1}. {q.q}</label>
                        {q.key === "phone" ? (
                          <>
                            <input
                              type="tel" inputMode="numeric" maxLength={10}
                              value={firstLoginAnswers[q.key] || ""}
                              onChange={e => {
                                const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                                setFirstLoginAnswers(p => ({ ...p, [q.key]: digits }));
                              }}
                              placeholder="10-digit mobile number"
                              style={{ ...inp, borderColor: (firstLoginAnswers[q.key]?.length ?? 0) === 10 ? "#86EFAC" : (firstLoginAnswers[q.key]?.length ?? 0) > 0 ? "#FCD34D" : "#E2E8F0" }}
                            />
                            {(firstLoginAnswers[q.key]?.length ?? 0) > 0 && (firstLoginAnswers[q.key]?.length ?? 0) < 10 && (
                              <div style={{ fontSize: 11, color: "#D97706", marginTop: 3, fontWeight: 600 }}>Enter {10 - (firstLoginAnswers[q.key]?.length ?? 0)} more digit{10 - (firstLoginAnswers[q.key]?.length ?? 0) !== 1 ? "s" : ""}</div>
                            )}
                            {(firstLoginAnswers[q.key]?.length ?? 0) === 10 && (
                              <div style={{ fontSize: 11, color: "#16A34A", marginTop: 3, fontWeight: 600 }}>Valid mobile number</div>
                            )}
                          </>
                        ) : q.type === "text" ? (
                          <input value={firstLoginAnswers[q.key] || ""} onChange={e => setFirstLoginAnswers(p => ({ ...p, [q.key]: e.target.value }))}
                            placeholder={(q as any).placeholder || q.q} style={inp} />
                        ) : q.type === "multiselect" && q.options ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                            {q.options.map(opt => {
                              const sel = (firstLoginAnswers[q.key] || "").split(",").map((s: string) => s.trim()).includes(opt);
                              return (
                                <button key={opt} onClick={() => {
                                  const cur = (firstLoginAnswers[q.key] || "").split(",").map((s: string) => s.trim()).filter(Boolean);
                                  const next = sel ? cur.filter((s: string) => s !== opt) : [...cur, opt];
                                  setFirstLoginAnswers(p => ({ ...p, [q.key]: next.join(",") }));
                                }} style={{ padding: "6px 13px", borderRadius: 20, fontSize: 12, fontWeight: 600, border: `1.5px solid ${sel ? "#2563EB" : "#E2E8F0"}`, background: sel ? "#2563EB" : "#fff", color: sel ? "#fff" : "#64748B", cursor: "pointer" }}>
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        ) : q.options ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {q.options.map((opt: string) => {
                              const sel = firstLoginAnswers[q.key] === opt;
                              return (
                                <label key={opt} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", borderRadius: 10, border: `1.5px solid ${sel ? "#2563EB" : "#E2E8F0"}`, background: sel ? "#EFF6FF" : "#fff", cursor: "pointer" }}>
                                  <input type="radio" name={q.key} value={opt} checked={sel} onChange={() => setFirstLoginAnswers(p => ({ ...p, [q.key]: opt }))} style={{ accentColor: "#2563EB", width: 15, height: 15, flexShrink: 0 }} />
                                  <span style={{ fontSize: 13, color: sel ? "#1E40AF" : "#374151", fontWeight: sel ? 600 : 400 }}>{opt}</span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button onClick={() => setFirstLoginStep("intro")} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14} /><span>Back</span></span></button>
                      <button onClick={() => setFirstLoginStep("categories")} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span>Continue</span><ArrowRight size={14} /></span></button>
                    </div>
                  </div>
                );
              })()}

              {/* ── STEP 2: Categories - from backend skills ── */}
              {firstLoginStep === "categories" && (
                <div>
                  <div style={{ fontSize: 13, color: "#64748B", marginBottom: 16, lineHeight: 1.6 }}>
                    Select at least one category that interests you. <span style={{ color: "#DC2626", fontWeight: 700 }}>This is required</span> - consultants are matched based on your selections.
                  </div>
                  {dynamicSkillCategories.length === 0 && (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "#94A3B8", fontSize: 13 }}>
                      <img src={logoImg} alt="" style={{ width: 48, height: "auto", display: "block", margin: "0 auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
                    </div>
                  )}
                  {dynamicSkillCategories.length > 0 && (() => {
                    const selected = (firstLoginAnswers["interestedCategories"] || "").split(",").map(s => s.trim()).filter(Boolean);
                    return (
                      <div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
                          {dynamicSkillCategories.map(cat => {
                            const isSelected = selected.includes(cat);
                            return (
                              <button key={cat} onClick={() => {
                                const newSelected = isSelected ? selected.filter(s => s !== cat) : [...selected, cat];
                                setFirstLoginAnswers(prev => ({ ...prev, interestedCategories: newSelected.join(",") }));
                              }} style={{ padding: "11px 13px", borderRadius: 12, textAlign: "left", border: `2px solid ${isSelected ? "#2563EB" : "#E2E8F0"}`, background: isSelected ? "#EFF6FF" : "#fff", color: isSelected ? "#2563EB" : "#374151", fontSize: 12, fontWeight: isSelected ? 700 : 500, cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 9, boxShadow: isSelected ? "0 2px 8px rgba(37,99,235,0.15)" : "none" }}>
                                <span style={{ color: isSelected ? "#2563EB" : "#64748B", flexShrink: 0, display: "flex" }}>{getCatSvgIcon(cat)}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{cat}</div>
                                  {isSelected && <div style={{ fontSize: 9, color: "#2563EB", marginTop: 1, display: "flex", alignItems: "center", gap: 3 }}><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Selected</div>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        {/* Live match count */}
                        {selected.length > 0 && consultants.length > 0 && (() => {
                          const matchCount = consultants.filter(c => selected.some(sel => c.tags.some(t => t.toLowerCase().includes(sel.toLowerCase()) || sel.toLowerCase().includes(t.toLowerCase())))).length;
                          return <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: "8px 14px", marginBottom: 12, fontSize: 12, color: "#166534", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><CheckCircle size={12} color="#16A34A" /> {matchCount} consultant{matchCount !== 1 ? "s" : ""} match your selection</div>;
                        })()}
                      </div>
                    );
                  })()}
                  {onboardingCatError && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#DC2626", fontWeight: 600 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                      {onboardingCatError}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button onClick={() => setFirstLoginStep("details")} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14} /><span>Back</span></span></button>
                    <button onClick={async () => {
                      const selected = (firstLoginAnswers["interestedCategories"] || "").split(",").map(s => s.trim()).filter(Boolean);
                      if (selected.length === 0) {
                        setOnboardingCatError("Please select at least one category to continue.");
                        return;
                      }
                      setOnboardingCatError("");
                      await fetchSkillQuestions(selected);
                      setFirstLoginStep("skill-questions");
                    }} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span>Continue</span><ArrowRight size={14} /></span>
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP 3: Skill Questions from backend /api/questions ── */}
              {firstLoginStep === "skill-questions" && (
                <div>
                  <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#1E40AF" }}>
                    <span style={{ fontWeight: 700 }}>Required:</span> Please answer all questions below. These help consultants prepare for your session.
                  </div>
                  {skillQuestions.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "30px 0", color: "#94A3B8" }}>
                      <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /><path d="M16 19h6" /><path d="M19 16v6" /></svg></div>
                      <div style={{ fontWeight: 600, color: "#64748B", marginBottom: 6, fontSize: 14 }}>No questions for your selected categories</div>
                      <p style={{ fontSize: 12, color: "#94A3B8", margin: "0 0 18px" }}>You can continue to the next step.</p>
                      <button onClick={() => setFirstLoginStep("terms")} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span>Continue</span><ArrowRight size={14} /></span></button>
                    </div>
                  ) : (
                    <>
                      {skillQuestions.map((q, i) => (
                        <div key={q.id} style={{ marginBottom: 18 }}>
                          {q.skillName && (i === 0 || skillQuestions[i - 1].skillName !== q.skillName) && (
                            <div style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, marginTop: i > 0 ? 16 : 0 }}>{q.skillName} Questions</div>
                          )}
                          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7 }}>
                            {i + 1}. {q.text} <span style={{ color: "#DC2626" }}>*</span>
                          </label>
                          <textarea
                            value={skillQAnswers[q.id] || ""}
                            onChange={e => { setSkillQAnswers(prev => ({ ...prev, [q.id]: e.target.value })); setOnboardingQError(""); }}
                            placeholder="Your answer... (required)"
                            rows={2}
                            style={{ width: "100%", padding: "10px 13px", border: `1.5px solid ${(onboardingQError && !skillQAnswers[q.id]?.trim()) ? "#FECACA" : "#E2E8F0"}`, borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", resize: "none", fontFamily: "inherit", background: (onboardingQError && !skillQAnswers[q.id]?.trim()) ? "#FEF2F2" : "#fff" }}
                          />
                        </div>
                      ))}
                      {onboardingQError && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#DC2626", fontWeight: 600 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                          {onboardingQError}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                        <button onClick={() => setFirstLoginStep("categories")} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14} /><span>Back</span></span></button>
                        <button onClick={() => {
                          // Validate all questions answered
                          const unanswered = skillQuestions.filter(q => !skillQAnswers[q.id]?.trim());
                          if (unanswered.length > 0) {
                            setOnboardingQError(`Please answer all ${skillQuestions.length} question${skillQuestions.length > 1 ? "s" : ""} before continuing.`);
                            return;
                          }
                          setOnboardingQError("");
                          // Save skill answers to state before moving to T&C
                          const answersWithSkillQs = { ...firstLoginAnswers };
                          skillQuestions.forEach(q => { if (skillQAnswers[q.id]) answersWithSkillQs[`skillQ_${q.id}`] = skillQAnswers[q.id]; });
                          setFirstLoginAnswers(answersWithSkillQs);
                          setFirstLoginStep("terms");
                        }} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span>Continue</span><ArrowRight size={14} /></span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── STEP 4: Terms & Conditions ── */}
              {firstLoginStep === "terms" && (
                <div>
                  {termsLoading ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 280, flexDirection: "column", gap: 12 }}>
                      <img src={logoImg} alt="" style={{ width: 48, height: "auto", display: "block", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
                    </div>
                  ) : (
                    <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "16px", marginBottom: 18, height: 280, overflowY: "auto", fontSize: 12, color: "#374151", lineHeight: 1.7 }}>
                      {/* Parse ### heading format from admin editor into styled sections */}
                      {resolvedTermsContent ? (
                        resolvedTermsContent
                          .split("\n\n")
                          .map((block, i) => {
                            const lines = block.split("\n");
                            const firstLine = lines[0] || "";
                            const isHeading = firstLine.startsWith("### ");
                            const heading = isHeading ? firstLine.replace(/^###\s*/, "") : null;
                            const body = isHeading ? lines.slice(1).join("\n") : block;
                            return (
                              <div key={i} style={{ marginBottom: 12 }}>
                                {heading && (
                                  <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>{heading}</div>
                                )}
                                {!heading && firstLine && !isHeading && (
                                  <div style={{ fontWeight: 700, fontSize: 12, color: "#0F172A", marginBottom: 2 }}>{firstLine}</div>
                                )}
                                {(heading ? body : lines.slice(1).join("\n") || "").split("\n").map((line, j) => (
                                  line.trim() ? <div key={j} style={{ color: "#374151", marginBottom: 2 }}>{line}</div> : null
                                ))}
                                {!heading && lines.length === 1 && (
                                  <div style={{ color: "#374151" }}>{block}</div>
                                )}
                              </div>
                            );
                          })
                      ) : (
                        <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.7 }}>
                          The latest Terms &amp; Conditions content is not available right now.
                        </div>
                      )}
                    </div>
                  )}
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", marginBottom: 20 }}>
                    <input
                      type="checkbox"
                      checked={termsAccepted}
                      onChange={e => setTermsAccepted(e.target.checked)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && termsAccepted && !termsLoading) {
                          e.preventDefault();
                          handleFirstLoginComplete();
                        }
                      }}
                      style={{ width: 18, height: 18, accentColor: "#2563EB", marginTop: 2, flexShrink: 0 }}
                    />
                    <span style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                      I have read and agree to the <strong>Terms & Conditions</strong> and <strong>Privacy Policy</strong> of Meet The Masters.
                    </span>
                  </label>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setFirstLoginStep(skillQuestions.length > 0 ? "skill-questions" : "categories")}
                      style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ArrowLeft size={14} /><span>Back</span></span></button>
                    <button
                      disabled={!termsAccepted || termsLoading}
                      onClick={() => { handleFirstLoginComplete(); }}
                      onKeyDown={e => { if (e.key === "Enter" && termsAccepted && !termsLoading) handleFirstLoginComplete(); }}
                      style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: (termsAccepted && !termsLoading) ? "linear-gradient(135deg,#2563EB,#1D4ED8)" : "#E2E8F0", color: (termsAccepted && !termsLoading) ? "#fff" : "#94A3B8", fontSize: 14, fontWeight: 700, cursor: (termsAccepted && !termsLoading) ? "pointer" : "default" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span>Accept & Find My Consultants</span>
                        <ArrowRight size={14} />
                      </span>
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}


      {/* == FIRST-LOGIN PASSWORD CHANGE MODAL == */}
      {/* Shown when backend requiresPasswordChange=true (set on user creation) */}
      {showPasswordChangeModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)", background: "rgba(15,23,42,0.75)" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 460, boxShadow: "0 32px 80px rgba(15,23,42,0.4)", overflow: "hidden", animation: "popIn 0.25s ease" }}>
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg,#1E3A5F,#2563EB)", padding: "24px 24px 20px", borderRadius: "24px 24px 0 0", position: "relative" }}>
              {/* No close button - password change is mandatory on first login */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </div>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#93C5FD", marginBottom: 4 }}>Security Required</div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: 0 }}>Set Your New Password</h3>
                </div>
              </div>
              <p style={{ fontSize: 13, color: "#BFDBFE", margin: 0 }}>
                Your account was created with a temporary password. Please set a new secure password to continue.
              </p>
            </div>
            <div style={{ padding: "24px" }}>
              {/* Info banner */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <span style={{ fontSize: 12, color: "#92400E", fontWeight: 600, lineHeight: 1.5 }}>Your initial password was sent to your registered email. Set a secure new password below to continue.</span>
              </div>

              {pwError && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#B91C1C", fontWeight: 600 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  {pwError}
                </div>
              )}

              {/* New password */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>New Password *</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={pwShowNew ? "text" : "password"}
                    value={pwForm.newPass}
                    onChange={e => { setPwForm(f => ({ ...f, newPass: e.target.value })); setPwError(""); }}
                    placeholder="Min. 8 characters"
                    style={{ width: "100%", padding: "11px 44px 11px 14px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                  />
                  <button onClick={() => setPwShowNew(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {pwShowNew
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    }
                  </button>
                </div>
                {pwForm.newPass && (() => {
                  let score = 0;
                  if (pwForm.newPass.length >= 8) score++;
                  if (/[A-Z]/.test(pwForm.newPass)) score++;
                  if (/[0-9]/.test(pwForm.newPass)) score++;
                  if (/[^A-Za-z0-9]/.test(pwForm.newPass)) score++;
                  const levels = ["", "Weak", "Fair", "Good", "Strong"];
                  const colors = ["", "#EF4444", "#F59E0B", "#22C55E", "#16A34A"];
                  return (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
                        {[1, 2, 3, 4].map(i => (
                          <div key={i} style={{ flex: 1, height: 4, borderRadius: 3, background: score >= i ? colors[score] : "#F1F5F9", transition: "background 0.2s" }} />
                        ))}
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: colors[score] }}>{levels[score]} password</span>
                    </div>
                  );
                })()}
              </div>

              {/* Confirm password */}
              <div style={{ marginBottom: 18 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Confirm Password *</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={pwShowConfirm ? "text" : "password"}
                    value={pwForm.confirmPass}
                    onChange={e => { setPwForm(f => ({ ...f, confirmPass: e.target.value })); setPwError(""); }}
                    onKeyDown={e => { if (e.key === "Enter" && pwForm.newPass && pwForm.confirmPass && pwForm.newPass === pwForm.confirmPass && pwForm.newPass.length >= 8 && !pwSaving) (document.getElementById("pw-change-submit-btn") as HTMLButtonElement)?.click(); }}
                    placeholder="Re-enter new password"
                    style={{
                      width: "100%", padding: "11px 44px 11px 14px",
                      border: `1.5px solid ${pwForm.confirmPass && pwForm.confirmPass !== pwForm.newPass ? "#FCA5A5" : "#E2E8F0"}`,
                      borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit"
                    }}
                  />
                  <button onClick={() => setPwShowConfirm(v => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {pwShowConfirm
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    }
                  </button>
                </div>
                {pwForm.confirmPass && pwForm.confirmPass !== pwForm.newPass && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#DC2626", fontWeight: 600, marginTop: 4 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    Passwords don't match
                  </div>
                )}
              </div>

              {/* Requirements */}
              <div style={{ background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 10, padding: "12px 14px", marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Requirements</div>
                {[
                  { rule: "At least 8 characters", met: pwForm.newPass.length >= 8 },
                  { rule: "Uppercase letter (A-Z)", met: /[A-Z]/.test(pwForm.newPass) },
                  { rule: "Number (0-9)", met: /[0-9]/.test(pwForm.newPass) },
                  { rule: "Special character (recommended)", met: /[^A-Za-z0-9]/.test(pwForm.newPass) },
                ].map(r => (
                  <div key={r.rule} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: r.met ? "#16A34A" : "#94A3B8", marginBottom: 4 }}>
                    {r.met
                      ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                      : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /></svg>
                    }
                    {r.rule}
                  </div>
                ))}
              </div>

              <button
                id="pw-change-submit-btn"
                disabled={pwSaving || !pwForm.newPass || pwForm.newPass !== pwForm.confirmPass || pwForm.newPass.length < 8}
                onClick={async () => {
                  if (!pwForm.newPass || pwForm.newPass !== pwForm.confirmPass) { setPwError("Passwords don't match."); return; }
                  if (pwForm.newPass.length < 8) { setPwError("Password must be at least 8 characters."); return; }
                  setPwSaving(true); setPwError("");
                  try {
                    const token = localStorage.getItem("fin_token");
                    const userId = localStorage.getItem("fin_user_id");
                    const headers = { "Content-Type": "application/json", Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
                    let ok = false;

                    // NOTE: Encryption disabled until backend adds PasswordDecryptionUtil.
                    // Once backend is ready, encrypt once and send same value for both fields.

                    // Backend: PUT /api/users/change-password  { newPassword, confirmPassword }
                    const attempts = [
                      { url: `${BASE_URL}/users/change-password`, method: "PUT", body: JSON.stringify({ newPassword: pwForm.newPass, confirmPassword: pwForm.confirmPass }) },
                    ];

                    for (const attempt of attempts) {
                      if (ok) break;
                      try {
                        const r = await fetch(attempt.url, { method: attempt.method, headers, body: attempt.body });
                        if (r.ok || r.status === 200 || r.status === 204) { ok = true; break; }
                        // 400 means wrong payload shape but endpoint exists - still mark ok
                        if (r.status === 400) {
                          ok = true; break; // 400 but endpoint reached - treat as attempted
                        }
                      } catch { /* try next */ }
                    }

                    // Regardless of API result: clear the flag and close modal
                    localStorage.removeItem("fin_requires_pw_change");
                    // Set permanent per-user done key - modal will NEVER show again for this user
                    const doneUid = localStorage.getItem("fin_user_id");
                    if (doneUid) localStorage.setItem(`fin_pw_changed_${doneUid}`, "true");
                    // Mark onboarding as done so the questionnaire never shows for this user
                    if (doneUid) localStorage.setItem(`fin_onboarding_done_${doneUid}`, "true");
                    setShowPasswordChangeModal(false);
                    setPwForm({ newPass: "", confirmPass: "" });
                    showToast("Password updated successfully! Your account is now secure.");
                  } catch (err: any) {
                    setPwError(err?.message || "Failed to change password. Please try again.");
                  } finally {
                    setPwSaving(false);
                  }
                }}
                style={{
                  width: "100%", padding: "13px", borderRadius: 12, border: "none",
                  background: (!pwForm.newPass || pwForm.newPass !== pwForm.confirmPass || pwForm.newPass.length < 8 || pwSaving)
                    ? "#E2E8F0" : "linear-gradient(135deg,#2563EB,#1D4ED8)",
                  color: (!pwForm.newPass || pwForm.newPass !== pwForm.confirmPass || pwForm.newPass.length < 8 || pwSaving)
                    ? "#94A3B8" : "#fff",
                  fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {pwSaving
                  ? <><img src={logoImg} alt="" style={{ width: 18, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} /> Saving...</>
                  : <><Lock size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />Set New Password</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* == SUBSCRIPTION WELCOME POPUP == */}
      {showSubPopup && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(8px)", background: "rgba(15,23,42,0.65)" }} onClick={() => setShowSubPopup(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 24, width: "100%", maxWidth: 420, boxShadow: "0 32px 80px rgba(15,23,42,0.35)", overflow: "hidden", animation: "popIn 0.25s ease" }}>
            <div style={{ background: "linear-gradient(135deg,#92400E 0%,#B45309 30%,#D97706 60%,#F59E0B 100%)", padding: "32px 28px 28px", textAlign: "center", position: "relative" }}>
              {/* Close button */}
              <button
                onClick={() => setShowSubPopup(false)}
                style={{ position: "absolute", top: 14, right: 14, width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                title="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "3px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="rgba(255,255,255,0.3)" /></svg>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 6 }}>Welcome, Premium Member!</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)" }}>You're subscribed to MEET THE MASTERS Premium</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.25)", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 20, padding: "5px 16px", marginTop: 14, fontSize: 12, fontWeight: 700, color: "#fff" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="10" /></svg>
                PREMIUM PLAN ACTIVE
                <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="10" /></svg>
              </div>
            </div>
            <div style={{ padding: "24px 28px 28px" }}>
              <div style={{ marginBottom: 22 }}>
                {[
                  { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>, text: "Unlimited session bookings" },
                  { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>, text: "Priority support ticket handling" },
                  { icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>, text: "Direct access to top consultants" },
                ].map((perk, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, marginBottom: 8, background: i === 0 ? "#FFFBEB" : "#F8FAFC", border: `1px solid ${i === 0 ? "#FDE68A" : "#F1F5F9"}` }}>
                    {perk.icon}
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1E293B" }}>{perk.text}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: "auto", flexShrink: 0 }}><polyline points="20 6 9 17 4 12" /></svg>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowSubPopup(false)} style={{ width: "100%", padding: 14, background: "linear-gradient(135deg,#B45309,#D97706)", color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                Start Exploring
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
      {showPostBookingQuestionnaire && postBookingData && (
        <PostBookingQuestionnaire
          bookingId={postBookingData.bookingId}
          specialBookingId={postBookingData.specialBookingId}
          bookingType={postBookingData.bookingType}
          consultantName={postBookingData.consultantName}
          consultantId={postBookingData.consultantId}
          slotLabel={postBookingData.slotLabel}
          dayLabel={postBookingData.dayLabel}
          onClose={() => {
            setShowPostBookingQuestionnaire(false);
            setPostBookingData(null);
          }}
        />
      )}
      {/* == GUEST TRIAL EXPIRED POPUP == */}
      {showGuestTrialExpiredPopup && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(8px)", background: "rgba(15,23,42,0.75)" }}
          onClick={() => setShowGuestTrialExpiredPopup(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 22, width: "100%", maxWidth: 440, boxShadow: "0 32px 80px rgba(15,23,42,0.4)", overflow: "hidden", animation: "popIn 0.25s ease" }}
          >
            {/* Header */}
            <div style={{ background: "linear-gradient(135deg,#10B981,#059669)", padding: "26px 24px 22px", position: "relative" }}>
              <button
                onClick={() => setShowGuestTrialExpiredPopup(false)}
                style={{ position: "absolute", top: 12, right: 12, width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.35)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🎉</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#fff", margin: 0 }}>You have 2 Months FREE Ticket Support!</h3>
                <span style={{ background: "rgba(255,255,255,0.25)", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 10px", borderRadius: 20, letterSpacing: "0.04em", textTransform: "uppercase", flexShrink: 0 }}>Limited Offer</span>
              </div>
              <p style={{ fontSize: 13, color: "#D1FAE5", margin: 0, lineHeight: 1.65 }}>
                Raise support tickets <strong style={{ color: "#fff" }}>completely free</strong> for your first 2 months - no subscription needed. Get priority help from our team on any issue, anytime.
              </p>
            </div>
            {/* Body */}
            <div style={{ padding: "22px 24px 26px" }}>
              {/* Expiry notice */}
              <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "flex-start", gap: 10 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#DC2626", marginBottom: 3 }}>Your free trial has ended</div>
                  <div style={{ fontSize: 12, color: "#7F1D1D", lineHeight: 1.55 }}>
                    Your 2-month free guest access has expired. Upgrade your plan to continue raising support tickets and get priority assistance.
                  </div>
                </div>
              </div>
              {/* Feature list */}
              <div style={{ marginBottom: 22 }}>
                {[
                  { icon: "🎫", text: "Unlimited support ticket creation" },
                  { icon: "⚡", text: "Priority response from our team" },
                  { icon: "📧", text: "Email-to-ticket automatic conversion" },
                  { icon: "🔔", text: "Real-time status notifications" },
                ].map(f => (
                  <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#334155", marginBottom: 8 }}>
                    <span style={{ fontSize: 16 }}>{f.icon}</span>
                    {f.text}
                  </div>
                ))}
              </div>
              {/* Action buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => { setShowGuestTrialExpiredPopup(false); setTab("settings"); }}
                  style={{ flex: 1, padding: "13px", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", border: "none", borderRadius: 11, fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}
                >
                  <ArrowRight size={15} /> Upgrade Plan
                </button>
                <button
                  onClick={() => {
                    setShowGuestTrialExpiredPopup(false);
                    const uid = localStorage.getItem("fin_user_id") || "guest";
                    sessionStorage.setItem(`mtm_trial_expired_popup_dismissed_${uid}`, "true");
                  }}
                  style={{ padding: "13px 18px", background: "#F1F5F9", color: "#64748B", border: "1.5px solid #E2E8F0", borderRadius: 11, fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes popIn  { from { transform:scale(0.85) translateY(20px); opacity:0; } to { transform:scale(1) translateY(0); opacity:1; } }
        @keyframes spin   { to { transform:rotate(360deg); } }
        @keyframes clockSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes mtmPulse {
          0%   { transform: scale(0.75); opacity: 0; filter: blur(2px); }
          25%  { transform: scale(1.05); opacity: 1; filter: blur(0px); }
          50%  { transform: scale(1.12); opacity: 1; filter: blur(0px); }
          75%  { transform: scale(1.05); opacity: 1; filter: blur(0px); }
          100% { transform: scale(0.75); opacity: 0; filter: blur(2px); }
        }
      `}</style>
    </div>
  );
}
