import { AlertTriangle, ArrowLeft, ArrowRight, Calendar, CheckCircle, Clock, ImagePlus, Info, Link2, Lock, Mail, Pencil, Search, Star, Ticket, X, Zap } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoImg from '../assests/Meetmasterslogopng.png';
import ConfirmDialog from "../components/ConfirmDialog";
import ForcePasswordChangeModal from "../components/ForcePasswordChangeModal";
import { API_BASE_URL, buildApiUrl, buildBackendAssetUrl } from "../config/api";
import { SUPPORT_EMAIL } from "../config/support";
import { formatHourRangeLabel as _fmtHourRange, HourRangeClockPicker as _HourRangeClock } from "../pages/timeSlotUtils";
import {
  emailOnSpecialBookingConfirmedConsultant,
  emailOnSpecialBookingConfirmedUser,
  emailOnTicketUpdated,
  extractArray,
  getAdvisorById,
  getAllSkills,
  getBookingsByConsultant,
  getConsultantMasterSlots,
  getCurrentUser,
  getMyUnreadNotifications,
  getPriorityStyle,
  getSlaInfo,
  getSpecialBookingsByConsultant,
  getSpecialDaysByConsultant,
  getStatusStyle,
  getTicketComments,
  getTicketsByConsultant,
  getUserDisplayName,
  giveSlotSpecialBooking,
  logoutUser,
  markNotificationAsRead,
  postInternalNote,
  postTicketComment,
  recordEscalationBlock,
  removeStoredSpecialDay,
  saveStoredSpecialDay,
  sendTicketEscalatedEmail,
  SLA_HOURS,
  updateAdvisor,
  updateSpecialBooking,
  updateTicketStatus,
} from '../services/api';
import { formatNameLikeInput, formatTitleLikeInput } from "../utils/formUtils";
import AnalyticsDashboard from './AnalyticsDashboard';
import { BookingAnswersButton } from './Bookinganswersviewer';
import { ConsultantNotificationMonitor } from './NotificationSystem';
// ── Photo URL resolver ────────────────────────────────────────────────────────
const resolvePhotoUrl = (path: string | null | undefined): string => {
  if (!path) return '';
  return buildBackendAssetUrl(path);
};

// ── Local API helpers ─────────────────────────────────────────────────────────
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const BASE = API_BASE_URL;
  const token = localStorage.getItem('fin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${BASE}${endpoint}`, { ...options, headers });
  const ct = res.headers.get('content-type');
  const data = ct?.includes('application/json') ? await res.json() : { message: await res.text() };
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
};

const fetchAllPagesLocal = async (endpoint: string): Promise<any[]> => {
  const all: any[] = [];
  let page = 0;
  const size = 100;
  while (true) {
    const sep = endpoint.includes("?") ? "&" : "?";
    const data = await apiFetch(`${endpoint}${sep}page=${page}&size=${size}`);
    const items = extractArray(data);
    all.push(...items);
    const totalPages = data?.totalPages ?? data?.page?.totalPages ?? null;
    if (items.length < size || (totalPages !== null && page + 1 >= totalPages)) break;
    page++;
  }
  return all;
};

const publishConsultantSpecialDayDate = async (consultantId: number, specialDate: string) =>
  apiFetch(`/consultants/${consultantId}/special-days`, {
    method: 'POST',
    body: JSON.stringify({ dates: [specialDate] }),
  });

const deleteConsultantSpecialDayDate = async (consultantId: number, specialDate: string) =>
  apiFetch(`/consultants/${consultantId}/special-days/${encodeURIComponent(specialDate)}`, {
    method: 'DELETE',
  });

// ── IST Timestamp Formatter (matches admin page) ──────────────────────────────
const fmtISTTime = (iso: string | null | undefined): string => {
  if (!iso) return '--';
  try {
    const normalised = (iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso))
      ? iso
      : iso + 'Z';
    return new Date(normalised).toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch { return iso; }
};

const CalendarIcon: React.FC<{
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}> = ({ size = 16, color = 'currentColor', strokeWidth = 2, style }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={style}
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

// ── Types ─────────────────────────────────────────────────────────────────────
interface Consultant {
  id: number;
  name: string;
  designation: string;
  charges: number;
  shiftTimings: string;
  shiftStartTime: string;
  shiftEndTime: string;
  duration?: number;
  skills: string[];
  email: string;
  location?: number;
  experience?: number;
  reviewCount?: number;
  rating?: number;
  about?: string;
  description?: string;
  profilePhoto?: string;
  photo?: string;
  slotsDuration?: number;
  languages?: string;
  phone?: string;
}

interface TimeSlotRecord {
  id: number;
  consultantId: number;
  slotDate: string;
  masterTimeSlotId?: number;
  timeRange: string;
  status: string;
  version?: number;
}

interface MasterSlotOption {
  id: number;
  timeRange: string;
  duration: number;
  start24: string;
  end24: string;
}

interface ConsultantSpecialDayRecord {
  id?: number;
  consultantId?: number;
  specialDate: string;
  durationHours: number;
  status?: string;
  note?: string;
}

interface FeedbackItem {
  id: number;
  rating: number;
  comments?: string;
  userId?: number;
  bookingId?: number;
  ticketId?: number;
  category?: string;
  createdAt?: string;
  updatedAt?: string;
  clientName?: string;
  slotDate?: string;
  timeRange?: string;
}

/* ===========================================================================
   DEEP FIELD EXTRACTORS
   =========================================================================== */

const deepFindStatus = (b: any): string => {
  if (!b || typeof b !== 'object') return '';
  const keys = [
    'specialBookingStatus', 'special_booking_status',
    'status', 'bookingStatus', 'booking_status', 'state',
    'sessionStatus', 'session_status', 'appointmentStatus', 'appointment_status',
  ];
  for (const k of keys) {
    if (b[k] && typeof b[k] === 'string') return b[k].toUpperCase();
  }
  for (const nk of ['timeSlot', 'timeslot', 'slot', 'booking', 'appointment']) {
    if (b[nk] && typeof b[nk] === 'object') {
      for (const k of keys) {
        if (b[nk][k] && typeof b[nk][k] === 'string') return b[nk][k].toUpperCase();
      }
    }
  }
  return '';
};

const deepFindDate = (b: any): string => {
  if (!b || typeof b !== 'object') return '';
  const directKeys = [
    'preferredDate', 'preferred_date',
    'bookingDate', 'slotDate', 'date', 'booking_date', 'slot_date',
    'appointmentDate', 'sessionDate', 'scheduledDate',
    'appointment_date', 'session_date', 'scheduled_date',
  ];
  for (const k of directKeys) {
    if (b[k] && typeof b[k] === 'string') return b[k].split('T')[0];
  }
  const nestedKeys = ['timeSlot', 'timeslot', 'time_slot', 'slot', 'consultation', 'appointment', 'schedule'];
  const subDateKeys = ['slotDate', 'slot_date', 'date', 'bookingDate', 'booking_date', 'appointmentDate'];
  for (const nk of nestedKeys) {
    if (b[nk] && typeof b[nk] === 'object') {
      for (const sk of subDateKeys) {
        if (b[nk][sk] && typeof b[nk][sk] === 'string') return b[nk][sk].split('T')[0];
      }
    }
  }
  if (b.createdAt && typeof b.createdAt === 'string') return b.createdAt.split('T')[0];
  if (b.created_at && typeof b.created_at === 'string') return b.created_at.split('T')[0];
  for (const key of Object.keys(b)) {
    const val = b[key];
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.split('T')[0];
  }
  for (const key of Object.keys(b)) {
    const val = b[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const sk of Object.keys(val)) {
        const sv = val[sk];
        if (typeof sv === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sv)) return sv.split('T')[0];
      }
    }
  }
  return '';
};

const deepFindTime = (b: any): string => {
  if (!b || typeof b !== 'object') return '';
  const masterPaths: [string, string][] = [
    ['timeSlot', 'masterTimeSlot'], ['timeSlot', 'masterTimeslot'],
    ['timeSlot', 'master_time_slot'], ['timeslot', 'masterTimeSlot'],
    ['timeslot', 'masterTimeslot'], ['slot', 'masterTimeSlot'],
    ['slot', 'masterTimeslot'],
  ];
  for (const [p1, p2] of masterPaths) {
    const tr = b?.[p1]?.[p2]?.timeRange || b?.[p1]?.[p2]?.time_range;
    if (tr) return tr;
  }
  if (b.masterTimeSlot?.timeRange) return b.masterTimeSlot.timeRange;
  if (b.masterTimeslot?.timeRange) return b.masterTimeslot.timeRange;
  if (b.master_time_slot?.time_range) return b.master_time_slot.time_range;
  const nestedKeys = ['timeSlot', 'timeslot', 'time_slot', 'slot'];
  const timeFields = [
    'scheduledTimeRange', 'scheduled_time_range', 'scheduledTime', 'scheduled_time',
    'preferredTimeRange', 'preferred_time_range', 'preferredTime', 'preferred_time',
    'timeRange', 'time_range', 'slotTime', 'slot_time', 'startTime', 'start_time', 'time',
  ];
  for (const nk of nestedKeys) {
    if (b[nk] && typeof b[nk] === 'object') {
      for (const tf of timeFields) {
        if (b[nk][tf]) return String(b[nk][tf]);
      }
    }
  }
  const directTime = [
    'scheduledTimeRange', 'scheduled_time_range', 'scheduledTime', 'scheduled_time',
    'preferredTimeRange', 'preferred_time_range', 'preferredTime', 'preferred_time',
    'bookingTime', 'booking_time', 'slotTime', 'slot_time',
    'timeRange', 'time_range', 'startTime', 'start_time', 'time',
  ];
  for (const k of directTime) {
    if (b[k]) return String(b[k]);
  }
  for (const key of Object.keys(b)) {
    const val = b[key];
    if (typeof val === 'string' && (/^\d{1,2}:\d{2}/.test(val) || /\d{1,2}\s*(AM|PM)/i.test(val))) {
      if (!/^\d{4}-/.test(val)) return val;
    }
  }
  for (const key of Object.keys(b)) {
    const val = b[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const sk of Object.keys(val)) {
        const sv = val[sk];
        if (typeof sv === 'string' && (/^\d{1,2}:\d{2}/.test(sv) || /\d{1,2}\s*(AM|PM)/i.test(sv))) {
          if (!/^\d{4}-/.test(sv)) return sv;
        }
      }
    }
  }
  return '';
};

const SPECIAL_BOOKING_PREFIX = '[[SPECIAL_BOOKING_META]]';
type SpecialBookingStatus = 'REQUESTED' | 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
interface SpecialBookingMeta {
  kind: 'SPECIAL_BOOKING';
  version: 1;
  hours: number;
  requestNotes: string;
  requestedMeetingMode: 'ONLINE' | 'PHYSICAL' | 'PHONE';
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

const parseSpecialBookingMeta = (rawNotes: any): SpecialBookingMeta | null => {
  if (typeof rawNotes !== 'string' || !rawNotes.startsWith(SPECIAL_BOOKING_PREFIX)) return null;
  const jsonText = rawNotes.slice(SPECIAL_BOOKING_PREFIX.length).split('\n')[0]?.trim();
  if (!jsonText) return null;
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed?.kind !== 'SPECIAL_BOOKING') return null;
    return parsed as SpecialBookingMeta;
  } catch {
    return null;
  }
};

const stripSpecialBookingMeta = (rawNotes: any): string => {
  if (typeof rawNotes !== 'string') return '';
  if (!rawNotes.startsWith(SPECIAL_BOOKING_PREFIX)) return rawNotes.trim();
  return rawNotes.split('\n').slice(1).join('\n').trim();
};

const formatTimeRangeFromInput = (time24: string, hours: number) => {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const endTotal = (h * 60) + (m || 0) + hours * 60;
  const endH = Math.floor(endTotal / 60) % 24;
  const endM = endTotal % 60;
  const fmt = (hour: number, minute: number) => {
    const ap = hour >= 12 ? 'PM' : 'AM';
    const hr = hour % 12 || 12;
    return `${hr}:${String(minute).padStart(2, '0')} ${ap}`;
  };
  return `${fmt(h, m || 0)} - ${fmt(endH, endM)}`;
};

const to24HourTime = (time12: string, period: 'AM' | 'PM') => {
  if (!time12) return '';
  const [rawHour, rawMinute] = time12.split(':').map(Number);
  if (Number.isNaN(rawHour) || Number.isNaN(rawMinute)) return '';
  let hour = rawHour % 12;
  if (period === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${String(rawMinute).padStart(2, '0')}`;
};

const to12HourLabel = (time24: string) => {
  if (!time24) return '--';
  const [rawHour, rawMinute] = time24.split(':').map(Number);
  if (Number.isNaN(rawHour) || Number.isNaN(rawMinute)) return time24;
  const period = rawHour >= 12 ? 'PM' : 'AM';
  const hour = rawHour % 12 || 12;
  return `${hour}:${String(rawMinute).padStart(2, '0')} ${period}`;
};

const parseSpecialLocalTime = (raw: any): string => {
  if (!raw) return '';
  if (typeof raw === 'object' && raw.hour !== undefined) {
    return `${String(raw.hour).padStart(2, '0')}:${String(raw.minute ?? 0).padStart(2, '0')}`;
  }
  return String(raw).substring(0, 5);
};

const normaliseSpecialBookingStatus = (rawStatus: any): SpecialBookingStatus => {
  const status = String(rawStatus || '').toUpperCase();
  if (status === 'SCHEDULED') return 'SCHEDULED';
  if (status === 'CONFIRMED') return 'CONFIRMED';
  if (status === 'COMPLETED') return 'COMPLETED';
  if (status === 'CANCELLED' || status === 'REJECTED') return 'CANCELLED';
  return 'REQUESTED';
};

const isScheduledSpecialStatus = (status?: string | null) => {
  const value = String(status || '').toUpperCase();
  return value === 'SCHEDULED' || value === 'CONFIRMED';
};

const resolveSpecialBookingMeta = (booking: any): SpecialBookingMeta | null => {
  if (!booking || typeof booking !== 'object') return null;

  const legacy = parseSpecialBookingMeta(booking?.userNotes);

  const rawStatus = String(
    booking?.specialBookingStatus || booking?.status || ''
  ).toUpperCase();
  const hasSpecialSignal =
    booking?.isSpecialBooking === true ||
    booking?.specialBookingId != null ||
    booking?.numberOfSlots != null ||
    booking?.durationInHours != null ||
    booking?.scheduledDate != null ||
    booking?.scheduledTime != null ||
    booking?.preferredDate != null ||
    booking?.preferredTime != null ||
    booking?.preferredTimeRange != null ||
    rawStatus === 'REQUESTED' ||
    rawStatus === 'SCHEDULED' ||
    rawStatus === 'CONFIRMED' ||
    rawStatus === 'COMPLETED' ||
    rawStatus === 'CANCELLED';

  if (!legacy && !hasSpecialSignal) return null;

  // Support both old (numberOfSlots) and new (durationInHours) backend field names
  const hours = Math.max(1, Number(booking?.durationInHours || booking?.numberOfSlots || booking?.hours || legacy?.hours || 1));
  const preferredDate = booking?.preferredDate || booking?.preferred_date || legacy?.preferredDate || booking?.slotDate || '';
  const preferredTime = parseSpecialLocalTime(booking?.preferredTime || booking?.preferred_time);
  const preferredTimeRange =
    booking?.preferredTimeRange ||
    booking?.preferred_time_range ||
    legacy?.preferredTimeRange ||
    (preferredTime ? formatTimeRangeFromInput(preferredTime, hours) : '');
  const scheduledTime = parseSpecialLocalTime(booking?.scheduledTime || booking?.scheduled_time);
  const scheduledDate = booking?.scheduledDate || booking?.scheduled_date || legacy?.scheduledDate || booking?.slotDate || preferredDate || '';
  const scheduledTimeRange =
    booking?.scheduledTimeRange ||
    booking?.timeRange ||
    legacy?.scheduledTimeRange ||
    (scheduledTime ? formatTimeRangeFromInput(scheduledTime, hours) : (preferredTime ? formatTimeRangeFromInput(preferredTime, hours) : ''));

  return {
    kind: 'SPECIAL_BOOKING',
    version: 1,
    hours,
    requestNotes: booking?.requestNotes || stripSpecialBookingMeta(booking?.userNotes) || legacy?.requestNotes || '',
    requestedMeetingMode: (booking?.meetingMode || booking?.requestedMeetingMode || legacy?.requestedMeetingMode || 'ONLINE') as 'ONLINE' | 'PHYSICAL' | 'PHONE',
    status: normaliseSpecialBookingStatus(rawStatus || legacy?.status),
    preferredDate: preferredDate || undefined,
    preferredTime: preferredTime || legacy?.preferredTime || undefined,
    preferredTimeRange: preferredTimeRange || undefined,
    preferredSlotId: booking?.preferredSlotId || booking?.preferred_slot_id || legacy?.preferredSlotId || booking?.timeSlotId || undefined,
    scheduledDate: scheduledDate || undefined,
    scheduledTime: scheduledTime || legacy?.scheduledTime || undefined,
    scheduledTimeRange: scheduledTimeRange || undefined,
    meetingId: booking?.meetingId || legacy?.meetingId || undefined,
    meetingLink: booking?.meetingLink || booking?.joinUrl || legacy?.meetingLink || undefined,
    scheduledAt: booking?.scheduledAt || booking?.updatedAt || legacy?.scheduledAt || undefined,
  };
};

const getBookingLifecycleStatus = (booking: any): string =>
  String(
    booking?.specialBookingStatus ??
    resolveSpecialBookingMeta(booking)?.status ??
    deepFindStatus(booking) ??
    ''
  ).toUpperCase();

const getBookingChronologyTarget = (booking: any): { date: string; time: string } => {
  const meta = resolveSpecialBookingMeta(booking);
  if (!meta) {
    return {
      date: deepFindDate(booking),
      time: deepFindTime(booking),
    };
  }

  const scheduled = isScheduledSpecialStatus(meta.status) || meta.status === 'COMPLETED';
  return {
    date: scheduled
      ? (meta.scheduledDate || meta.preferredDate || deepFindDate(booking) || '')
      : (meta.preferredDate || meta.scheduledDate || deepFindDate(booking) || ''),
    time: scheduled
      ? (meta.scheduledTimeRange || meta.scheduledTime || meta.preferredTimeRange || meta.preferredTime || deepFindTime(booking) || '')
      : (meta.preferredTimeRange || meta.preferredTime || meta.scheduledTimeRange || meta.scheduledTime || deepFindTime(booking) || ''),
  };
};

const normaliseBookingDateKey = (raw: string): string => {
  const value = String(raw || '').trim();
  if (!value) return '9999-12-31';

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const dashMatch = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, dd, mm, yyyy] = dashMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  return value;
};

const parseTimeLabelToMinutes = (value: string): number | null => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] || '0', 10);
  const period = (match[3] || '').toUpperCase();
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return hour * 60 + minute;
};

const getSortableBookingStartMinutes = (timeLabel: string): number => {
  const raw = String(timeLabel || '').trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const rangeStart = raw.split(/[--]/)[0]?.trim() || '';
  return parseTimeLabelToMinutes(rangeStart) ?? parseTimeLabelToMinutes(raw) ?? Number.MAX_SAFE_INTEGER;
};

const compareBookingsChronologically = (a: any, b: any): number => {
  const aChronology = getBookingChronologyTarget(a);
  const bChronology = getBookingChronologyTarget(b);

  const dateCmp = normaliseBookingDateKey(aChronology.date || '').localeCompare(
    normaliseBookingDateKey(bChronology.date || '')
  );
  if (dateCmp !== 0) return dateCmp;

  const timeCmp = getSortableBookingStartMinutes(aChronology.time) - getSortableBookingStartMinutes(bChronology.time);
  if (timeCmp !== 0) return timeCmp;

  return Number(a?.id || 0) - Number(b?.id || 0);
};

const toPositiveNumber = (value: any): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const formatDurationLabel = (hours: number): string => {
  const safeHours = Math.max(1, Number(hours || 1));
  return `${safeHours} hr${safeHours !== 1 ? 's' : ''}`;
};

const getDedicatedSpecialBookingId = (booking: any): number | null => {
  if (!booking || typeof booking !== 'object') return null;

  const explicitId =
    toPositiveNumber(booking?.specialBookingId) ??
    toPositiveNumber(booking?.special_booking_id) ??
    toPositiveNumber(booking?.specialBooking?.id) ??
    toPositiveNumber(booking?.special_booking?.id) ??
    toPositiveNumber(booking?.specialBooking?.specialBookingId) ??
    toPositiveNumber(booking?.special_booking?.special_booking_id) ??
    toPositiveNumber(booking?.booking?.specialBookingId) ??
    toPositiveNumber(booking?.booking?.special_booking_id) ??
    toPositiveNumber(booking?.metadata?.specialBookingId) ??
    toPositiveNumber(booking?.specialMeta?.specialBookingId);
  if (explicitId) return explicitId;

  const rawStatus = String(booking?.status || booking?.specialBookingStatus || '').toUpperCase();
  const hasDedicatedShape =
    booking?.isSpecialBooking === true ||
    booking?.numberOfSlots != null ||
    booking?.durationInHours != null ||
    booking?.scheduledDate != null ||
    booking?.preferredDate != null ||
    booking?.scheduledTime != null ||
    booking?.preferredTime != null ||
    booking?.preferredTimeRange != null ||
    booking?.paymentStatus != null;
  const hasDedicatedStatus = ['REQUESTED', 'SCHEDULED', 'CONFIRMED', 'CANCELLED'].includes(rawStatus);

  const rawId = toPositiveNumber(booking?.id);
  if (rawId && hasDedicatedShape && hasDedicatedStatus) return rawId;

  return null;
};

const sendSpecialBookingScheduledEmail = async (params: {
  bookingId: number;
  userEmail?: string;
  userName: string;
  consultantName: string;
  meetingMode: string;
  scheduledDate: string;
  scheduledTimeRange: string;
  meetingLink: string;
  userNotes?: string;
}) => {
  const bookingConfirmationPayload = {
    bookingId: params.bookingId,
    slotDate: params.scheduledDate,
    timeRange: params.scheduledTimeRange,
    meetingMode: params.meetingMode,
    amount: 0,
    userName: params.userName,
    userEmail: params.userEmail || '',
    consultantName: params.consultantName,
    consultantEmail: '',
    userNotes: params.userNotes || '',
    jitsiLink: params.meetingLink,
  };
  const body = {
    to: params.userEmail || '',
    subject: `Special Booking Scheduled - ${params.scheduledDate} - ${params.scheduledTimeRange}`,
    body:
      `Hi ${params.userName},\n\n` +
      `Your special booking with ${params.consultantName} has been scheduled.\n\n` +
      `Date: ${params.scheduledDate}\nTime: ${params.scheduledTimeRange}\nMode: ${params.meetingMode}\nJoin: ${params.meetingLink}\n` +
      (params.userNotes ? `Consultant message: ${params.userNotes}\n` : '') +
      `\n` +
      `Thank you,\nMeet The Masters Team`,
  };
  if (!body.to) return;
  try {
    await apiFetch('/notifications/booking-confirmation', { method: 'POST', body: JSON.stringify(bookingConfirmationPayload) });
  } catch {
    try {
      await apiFetch('/email/send', { method: 'POST', body: JSON.stringify(body) });
    } catch { }
  }
};

const isBookingExpired = (b: any, now: Date = new Date()): boolean => {
  const dateStr = deepFindDate(b);
  const timeStr = deepFindTime(b);
  if (!dateStr) return false;
  try {
    const rangeMatch = timeStr.match(/[--]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    let endH = -1, endM = 0;
    if (rangeMatch) {
      endH = parseInt(rangeMatch[1]);
      endM = parseInt(rangeMatch[2]);
      const ap = rangeMatch[3]?.toUpperCase();
      if (ap === 'PM' && endH !== 12) endH += 12;
      if (ap === 'AM' && endH === 12) endH = 0;
    } else {
      const startMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
      if (startMatch) {
        let sh = parseInt(startMatch[1]);
        const sm = parseInt(startMatch[2]);
        const ap = startMatch[3]?.toUpperCase();
        if (ap === 'PM' && sh !== 12) sh += 12;
        if (ap === 'AM' && sh === 12) sh = 0;
        endH = (sh * 60 + sm + 60) >= 1440 ? 23 : Math.floor((sh * 60 + sm + 60) / 60);
        endM = (sh * 60 + sm + 60) % 60;
      }
    }
    if (endH === -1) {
      const d = new Date(`${dateStr}T23:59:59`);
      return d < now;
    }
    const sessionEnd = new Date(`${dateStr}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`);
    return sessionEnd < now;
  } catch { return false; }
};

// Returns true when current time is within 15 min BEFORE or anytime AFTER the meeting start
const canJoinMeeting = (b: any, now: Date = new Date()): boolean => {
  const dateStr = deepFindDate(b);
  const timeStr = deepFindTime(b);
  if (!dateStr || !timeStr) return true; // fallback: allow join if we can't determine time
  try {
    // Support both "10:00 AM" and "10 AM" (no colon) formats
    const startMatch = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (!startMatch) return true;
    let startH = parseInt(startMatch[1]);
    const startM = parseInt(startMatch[2] || '0');
    const ap = startMatch[3].toUpperCase();
    if (ap === 'PM' && startH !== 12) startH += 12;
    if (ap === 'AM' && startH === 12) startH = 0;
    const meetingStart = new Date(`${dateStr}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`);
    const openFrom = new Date(meetingStart.getTime() - 15 * 60 * 1000); // 15 min before
    return now >= openFrom;
  } catch { return true; }
};

const deepFindAmount = (b: any): number => {
  const readNumber = (obj: any, keys: string[]): number | null => {
    for (const k of keys) {
      if (obj?.[k] !== undefined && obj?.[k] !== null) {
        const n = Number(obj[k]);
        if (!isNaN(n) && n > 0) return n;
      }
    }
    return null;
  };

  const total = readNumber(b, ['totalAmount', 'total_amount', 'amount', 'price', 'cost']);
  if (total != null) return total;

  const base = readNumber(b, ['baseAmount', 'base_amount', 'originalAmount', 'original_amount']);
  const charges = readNumber(b, ['additionalCharges', 'additional_charges', 'charges']);
  if (base != null || charges != null) return (base || 0) + (charges || 0);

  const keys = [
    'fee', 'consultationFee', 'consultation_fee',
  ];
  for (const k of keys) {
    if (b[k] !== undefined && b[k] !== null) {
      const n = Number(b[k]);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  for (const nk of ['timeSlot', 'timeslot', 'slot', 'consultant']) {
    if (b[nk] && typeof b[nk] === 'object') {
      const nestedTotal = readNumber(b[nk], ['totalAmount', 'total_amount', 'amount', 'price', 'cost']);
      if (nestedTotal != null) return nestedTotal;

      const nestedBase = readNumber(b[nk], ['baseAmount', 'base_amount', 'originalAmount', 'original_amount']);
      const nestedCharges = readNumber(b[nk], ['additionalCharges', 'additional_charges', 'charges']);
      if (nestedBase != null || nestedCharges != null) return (nestedBase || 0) + (nestedCharges || 0);

      for (const k of keys) {
        if (b[nk][k] !== undefined && b[nk][k] !== null) {
          const n = Number(b[nk][k]);
          if (!isNaN(n) && n > 0) return n;
        }
      }
    }
  }
  return 0;
};

const formatDisplayName = (value: any): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) {
    const local = raw.split("@")[0].trim();
    if (local) {
      return local
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
        .trim();
    }
  }
  return raw
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase())
    .trim();
};

const isPlaceholderDisplayName = (value: string): boolean =>
  /^(user|client|booking)\s*#?\s*\d+$/i.test(String(value || "").trim());

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
      cache.set(id, name && !isPlaceholderDisplayName(name) ? name : "Client");
    } catch {
      cache.set(id, "Client");
    }
  }));

  return raw.replace(pattern, (_match, idText) => {
    const resolved = cache.get(Number(idText));
    return resolved && !isPlaceholderDisplayName(resolved) ? resolved : "Client";
  });
};

const deepFindClientName = (b: any): string => {
  const candidates = [
    b?.resolvedClientName,
    b?.displayClientName,
    b?.clientDisplayName,
    b?.userDisplayName,
    b?.user?.name,
    b?.user?.fullName,
    b?.client?.name,
    b?.client?.fullName,
    b?.userName,
    b?.clientName,
    b?.customerName,
    b?.name,
    b?.clientFullName,
    b?.customer_name,
    b?.user?.email,
    b?.userEmail,
    b?.client?.email,
    b?.user?.identifier,
    b?.user?.username,
    b?.client?.username,
  ];

  for (const candidate of candidates) {
    const name = formatDisplayName(candidate);
    if (name && !isPlaceholderDisplayName(name)) return name;
  }

  return "Client";
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatTimeRange = (timeString: string, durationMins = 60): string => {
  if (!timeString) return '-';
  if (/[--]/.test(timeString) && timeString.length > 5) return timeString;
  if (/\d{1,2}:\d{2}\s*(AM|PM)/i.test(timeString) && !/-/.test(timeString)) {
    const match = timeString.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (match) {
      let h = parseInt(match[1]);
      const m = parseInt(match[2]);
      const ap = match[3].toUpperCase();
      if (ap === 'PM' && h !== 12) h += 12;
      if (ap === 'AM' && h === 12) h = 0;
      const start = new Date(); start.setHours(h, m, 0);
      const end = new Date(start.getTime() + durationMins * 60000);
      const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
      return `${fmt(start)} - ${fmt(end)}`;
    }
    return timeString;
  }
  const parts = timeString.split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const start = new Date(); start.setHours(parts[0], parts[1], 0);
    const end = new Date(start.getTime() + durationMins * 60000);
    const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${fmt(start)} - ${fmt(end)}`;
  }
  return timeString;
};

const clampSessionDurationHours = (value: any, fallback = 1): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(3, Math.max(1, Math.round(parsed)));
};

const durationMinutesToHours = (value: any, fallback = 1): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (parsed <= 12) return clampSessionDurationHours(parsed, fallback);
  return clampSessionDurationHours(parsed / 60, fallback);
};

const durationHoursToMinutes = (value: any, fallbackHours = 1): number =>
  clampSessionDurationHours(value, fallbackHours) * 60;

const parseTimeToMinutes = (raw: string): number | null => {
  const text = String(raw || '').trim();
  if (!text) return null;
  const match24 = text.match(/^(\d{1,2}):(\d{2})/);
  if (match24) return Number(match24[1]) * 60 + Number(match24[2]);
  const match12 = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match12) return null;
  let hours = Number(match12[1]);
  const minutes = Number(match12[2] || '0');
  const period = match12[3].toUpperCase();
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

const addHoursToTime = (time: string, hours: number): string => {
  const parts = String(time || '').split(':').map(Number);
  if (parts.length < 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return time;
  const totalMinutes = parts[0] * 60 + parts[1] + Math.max(1, hours) * 60;
  const endHour = Math.floor(totalMinutes / 60) % 24;
  const endMinute = totalMinutes % 60;
  return `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}`;
};

const getDurationHoursFromRange = (timeRange: string, fallback = 1): number => {
  const parts = String(timeRange || '').split(/[--]/).map(p => p.trim()).filter(Boolean);
  if (parts.length < 2) return fallback;
  const start = parseTimeToMinutes(parts[0]);
  const end = parseTimeToMinutes(parts[1]);
  if (start == null || end == null) return fallback;
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  return clampSessionDurationHours(diff / 60, fallback);
};

const parseRangeStartKey = (timeRange: string): string => {
  const firstPart = String(timeRange || '').split(/[--]/)[0]?.trim() || '';
  return normaliseTimeKey(firstPart);
};

const parseRangeEndKey = (timeRange: string): string => {
  const secondPart = String(timeRange || '').split(/[--]/)[1]?.trim() || '';
  return normaliseTimeKey(secondPart);
};

const getStatusColor = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED': return { bg: '#ECFEFF', color: '#0F766E', border: '#99F6E4' };
    case 'BOOKED': return { bg: '#ECFEFF', color: '#0F766E', border: '#99F6E4' };
    case 'PENDING': return { bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' };
    case 'COMPLETED': return { bg: '#F0FDF4', color: '#16A34A', border: '#86EFAC' };
    case 'CANCELLED': return { bg: '#FEF2F2', color: '#EF4444', border: '#FCA5A5' };
    default: return { bg: '#F1F5F9', color: '#64748B', border: '#CBD5E1' };
  }
};

const generateHourlySlots = (shiftStart: string, shiftEnd: string, stepMinutes = 60): string[] => {
  if (!shiftStart || !shiftEnd) return [];
  try {
    const [sh, sm] = shiftStart.split(':').map(Number);
    const [eh, em] = shiftEnd.split(':').map(Number);
    const startMins = sh * 60 + (isNaN(sm) ? 0 : sm);
    const endMins = eh * 60 + (isNaN(em) ? 0 : em);
    const result: string[] = [];
    const step = Math.max(1, Math.round(stepMinutes || 60));
    for (let m = startMins; m + step <= endMins; m += step) {
      result.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    return result;
  } catch { return []; }
};

// Returns true if slotStart (HH:MM 24h) falls within the consultant's shift window.
// Handles overnight shifts (e.g. 11:00 → 08:00 next day) where shiftStart > shiftEnd.
const isSlotInShift = (slotStart: string, shiftStart: string, shiftEnd: string): boolean => {
  if (!shiftStart || !shiftEnd || !slotStart) return true;
  const norm = (t: string) => {
    const ampm = t.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
    if (ampm) {
      let hh = parseInt(ampm[1]);
      const mm = ampm[2] || '00';
      const ap = ampm[3].toUpperCase();
      if (ap === 'PM' && hh !== 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;
      return `${String(hh).padStart(2, '0')}:${mm}`;
    }
    const iso = t.match(/^(\d{1,2}):(\d{2})/);
    return iso ? `${iso[1].padStart(2, '0')}:${iso[2]}` : t;
  };
  const s = norm(slotStart);
  const start = norm(shiftStart);
  const end = norm(shiftEnd);
  if (start <= end) {
    // Normal shift: e.g. 09:00 to 17:00
    return s >= start && s < end;
  } else {
    // Overnight shift: e.g. 11:00 to 08:00 (next day)
    return s >= start || s < end;
  }
};

const fmt24to12 = (t: string): string => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
};

const normaliseTimeKey = (raw: string): string => {
  if (!raw) return '';
  // Check AM/PM FIRST so "12:00 AM" → "00:00" and "12:00 PM" → "12:00" correctly
  const ampm = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (ampm) {
    let hh = parseInt(ampm[1]);
    const mm = ampm[2] || '00';
    const ap = ampm[3].toUpperCase();
    if (ap === 'PM' && hh !== 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  }
  // Fallback: plain 24-hour "HH:MM"
  const iso = raw.match(/^(\d{1,2}):(\d{2})/);
  if (iso) return `${iso[1].padStart(2, '0')}:${iso[2]}`;
  return '';
};
const parseSlotTimeKey = (raw: any, fallbackRange?: string): string => {
  if (!raw && !fallbackRange) return '';
  if (typeof raw === 'object' && raw?.hour !== undefined) {
    return `${String(raw.hour).padStart(2, '0')}:${String(raw.minute ?? 0).padStart(2, '0')}`;
  }
  if (typeof raw === 'string' && raw.length >= 5) {
    return raw.substring(0, 5);
  }
  return normaliseTimeKey(fallbackRange || '');
};

// ── Shared Badge ──────────────────────────────────────────────────────────────
const Badge: React.FC<{ label: string; style: { bg: string; color: string; border: string } }> = ({ label, style }) => (
  <span style={{
    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
    letterSpacing: '0.05em', background: style.bg, color: style.color,
    border: `1px solid ${style.border}`,
  }}>
    {label.replace('_', ' ')}
  </span>
);

// ─────────────────────────────────────────────────────────────────────────────
// MATERIAL TIME PICKER (CIRCULAR CLOCK)
// ─────────────────────────────────────────────────────────────────────────────
const MaterialTimePicker: React.FC<{
  isOpen: boolean;
  initialTime: string;
  onClose: () => void;
  onSave: (time24h: string) => void;
}> = ({ isOpen, initialTime, onClose, onSave }) => {
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [time, setTime] = useState({ h: 12, m: 0, ampm: 'AM' });

  useEffect(() => {
    if (isOpen) {
      if (initialTime) {
        const [H, M] = initialTime.split(':').map(Number);
        setTime({ h: H % 12 || 12, m: M || 0, ampm: H >= 12 ? 'PM' : 'AM' });
      } else {
        setTime({ h: 12, m: 0, ampm: 'AM' });
      }
      setMode('hour');
    }
  }, [isOpen, initialTime]);

  if (!isOpen) return null;

  const handleSave = () => {
    let H = time.h;
    if (time.ampm === 'PM' && H < 12) H += 12;
    if (time.ampm === 'AM' && H === 12) H = 0;
    onSave(`${String(H).padStart(2, '0')}:${String(time.m).padStart(2, '0')}`);
  };

  const getItems = () =>
    mode === 'hour' ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const activeValue = mode === 'hour' ? time.h : time.m;
  const items = getItems();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 8, width: 300, overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ background: '#1976D2', padding: '24px 20px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span onClick={() => setMode('hour')} style={{ fontSize: 48, fontWeight: 400, color: mode === 'hour' ? '#fff' : 'rgba(255,255,255,0.6)', lineHeight: 1, cursor: 'pointer' }}>
              {String(time.h).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 48, fontWeight: 300, color: 'rgba(255,255,255,0.6)', lineHeight: 1 }}>:</span>
            <span onClick={() => setMode('minute')} style={{ fontSize: 48, fontWeight: 400, color: mode === 'minute' ? '#fff' : 'rgba(255,255,255,0.6)', lineHeight: 1, cursor: 'pointer' }}>
              {String(time.m).padStart(2, '0')}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 8, paddingBottom: 6 }}>
            <span onClick={() => setTime({ ...time, ampm: 'AM' })} style={{ fontSize: 14, fontWeight: 600, color: time.ampm === 'AM' ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>AM</span>
            <span onClick={() => setTime({ ...time, ampm: 'PM' })} style={{ fontSize: 14, fontWeight: 600, color: time.ampm === 'PM' ? '#fff' : 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>PM</span>
          </div>
        </div>

        <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 240, height: 240, borderRadius: '50%', background: '#F1F5F9' }}>
            <div style={{ position: 'absolute', top: '50%', left: '50%', width: 8, height: 8, background: '#1976D2', borderRadius: '50%', transform: 'translate(-50%,-50%)', zIndex: 10 }} />
            {items.map((val, i) => {
              const angle = (i * 30) * (Math.PI / 180);
              const r = 96;
              const x = 120 + r * Math.sin(angle);
              const y = 120 - r * Math.cos(angle);
              const isActive = activeValue === val;
              return (
                <React.Fragment key={val}>
                  {isActive && (
                    <div style={{ position: 'absolute', top: '50%', left: '50%', width: 2, height: r, background: '#1976D2', transformOrigin: 'bottom center', transform: `translate(-50%,-100%) rotate(${i * 30}deg)`, zIndex: 1 }} />
                  )}
                  <div
                    onClick={() => {
                      if (mode === 'hour') {
                        let H = val;
                        if (time.ampm === 'PM' && H < 12) H += 12;
                        if (time.ampm === 'AM' && H === 12) H = 0;
                        onSave(`${String(H).padStart(2, '0')}:00`);
                      }
                      else setTime({ ...time, m: val });
                    }}
                    style={{
                      position: 'absolute', left: x, top: y, transform: 'translate(-50%,-50%)',
                      width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isActive ? '#1976D2' : 'transparent', color: isActive ? '#fff' : '#334155',
                      fontSize: 15, fontWeight: isActive ? 600 : 400, cursor: 'pointer', zIndex: 5, transition: 'all 0.2s',
                    }}>
                    {val === 0 && mode === 'minute' ? '00' : val}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 16px 16px', gap: 16 }}>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#1976D2', fontWeight: 700, fontSize: 14, cursor: 'pointer', textTransform: 'uppercase' }}>CANCEL</button>
          <button type="button" onClick={handleSave} style={{ background: 'none', border: 'none', color: '#1976D2', fontWeight: 700, fontSize: 14, cursor: 'pointer', textTransform: 'uppercase' }}>OK</button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE HOUR RANGE CLOCK PICKER - thin alias of the shared HourRangeClockPicker
// Adds auto-set shiftEnd display note; re-uses the clock from timeSlotUtils.
// ─────────────────────────────────────────────────────────────────────────────
const ProfileHourRangeClockPicker: React.FC<{
  isOpen: boolean;
  initialHour: number | null;
  initialDuration?: number;
  onClose: () => void;
  onSave: (startHour24: number, durationHours: number) => void;
}> = (props) => (
  <_HourRangeClock
    {...props}
    title="Availability Slot"
  />
);
const AdvisorTicketsView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const ESCALATED_KEY = `fin_escalated_tickets_${consultantId}`;
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [search, setSearch] = useState('');
  // Persist escalated IDs across refreshes
  const [localEscalatedIds, setLocalEscalatedIds] = useState<Set<number>>(() => {
    try { return new Set<number>(JSON.parse(localStorage.getItem(`fin_escalated_tickets_${consultantId}`) || '[]')); }
    catch { return new Set<number>(); }
  });

  const persistEscalatedId = (id: number) => {
    setLocalEscalatedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem(ESCALATED_KEY, JSON.stringify([...next])); } catch { }
      return next;
    });
  };

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await getTicketsByConsultant(consultantId);
        setTickets(extractArray(data));
      } catch (e: any) { setError(e.message || 'Failed to load tickets.'); }
      finally { setLoading(false); }
    })();
  }, [consultantId]);

  const categories = [...new Set(tickets.map((t: any) => t.category))];

  const filtered = tickets.filter((t: any) =>
    (filterStatus === 'ALL' || t.status === filterStatus) &&
    (filterPriority === 'ALL' || t.priority === filterPriority) &&
    (filterCategory === 'ALL' || t.category === filterCategory) &&
    (search === '' || t.description?.toLowerCase().includes(search.toLowerCase()) || String(t.id).includes(search))
  );

  const stats = {
    total: tickets.length,
    open: tickets.filter((t: any) => ['NEW', 'OPEN', 'IN_PROGRESS'].includes(t.status)).length,
    escalated: tickets.filter((t: any) =>
      t.isEscalated === true ||
      localEscalatedIds.has(t.id) ||
      (t.internalNotes ?? t.notes ?? []).some((n: any) => n.noteText?.includes('🚨 ESCALATED'))
    ).length,
    slaRisk: tickets.filter((t: any) => getSlaInfo(t)?.breached || getSlaInfo(t)?.warning).length,
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: selected ? 340 : '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #E2E8F0', transition: 'width 0.2s', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #F1F5F9' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: '#0F172A' }}>My Tickets</h2>
          <div style={{ background: '#ECFEFF', border: '1px solid #A5F3FC', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#115E59', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Mail size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span><strong>Email-to-Ticket:</strong> Users can email <strong>{SUPPORT_EMAIL}</strong>. Emails are auto-converted into tickets assigned to your queue.</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { l: 'Total', v: stats.total, c: '#0F766E', bg: '#ECFEFF' },
              { l: 'Active', v: stats.open, c: '#EA580C', bg: '#FFF7ED' },
              { l: 'Escalated', v: stats.escalated, c: '#DC2626', bg: '#FEF2F2' },
              { l: 'SLA Risk', v: stats.slaRisk, c: '#D97706', bg: '#FFFBEB' },
            ].map(s => (
              <div key={s.l} style={{ background: s.bg, borderRadius: 8, padding: '7px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.c }}>{s.v}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{s.l}</div>
              </div>
            ))}
          </div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={14} color="#64748B" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets"
              style={{ width: '100%', padding: '8px 12px 8px 34px', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#F8FAFC' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { v: filterStatus, s: setFilterStatus, opts: ['ALL', 'NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ESCALATED'] },
              { v: filterPriority, s: setFilterPriority, opts: ['ALL', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] },
              { v: filterCategory, s: setFilterCategory, opts: ['ALL', ...categories] },
            ].map((f, i) => (
              <select key={i} value={f.v} onChange={e => f.s(e.target.value)}
                style={{ flex: 1, minWidth: 80, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 11, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                {f.opts.map(o => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
              </select>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48 }}>
              <img src={logoImg} alt="Meet The Masters" style={{ width: 56, height: 'auto', animation: 'mtmPulse 1.8s ease-in-out infinite' }} />
            </div>
          ) : error ? (
            <div style={{ padding: 20, color: '#B91C1C', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={14} /> {error}</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94A3B8' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Ticket size={32} color="#CBD5E1" strokeWidth={1.7} /></div>
              <p style={{ margin: 0, fontWeight: 600 }}>No tickets match.</p>
            </div>
          ) : filtered.map((t: any) => {
            const sc = getStatusStyle(t.status);
            const pc = getPriorityStyle(t.priority);
            const sla = getSlaInfo(t);
            const isSel = selected?.id === t.id;
            return (
              <div key={t.id} onClick={() => setSelected(isSel ? null : t)}
                style={{
                  padding: '14px 16px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer',
                  background: isSel ? '#ECFEFF' : '#fff',
                  borderLeft: `3px solid ${isSel ? '#0F766E' : sla?.breached ? '#EF4444' : sla?.warning ? '#F59E0B' : 'transparent'}`,
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>#{t.id} · {t.category}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <Badge label={t.status} style={sc} />
                    <Badge label={t.priority} style={pc} />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, marginBottom: 5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {t.description}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: '#94A3B8' }}>{new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  {sla && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: sla.breached ? '#DC2626' : sla.warning ? '#D97706' : '#16A34A', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {sla.breached ? <Clock size={10} /> : sla.warning ? <AlertTriangle size={10} /> : <CheckCircle size={10} />}
                      <span>{sla.breached ? 'BREACHED' : sla.warning ? sla.label : 'On track'}</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selected && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <AdvisorTicketDetail
            ticket={selected}
            consultantId={consultantId}
            onClose={() => setSelected(null)}
            onStatusChange={(id, status) => {
              if (status === '__ESCALATED__' || status === 'ESCALATED') {
                persistEscalatedId(id);
                setTickets(prev => prev.map(t => t.id === id ? { ...t, isEscalated: true } : t));
                setSelected((prev: any) => prev?.id === id ? { ...prev, isEscalated: true } : prev);
              } else {
                setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
                setSelected((prev: any) => prev?.id === id ? { ...prev, status } : prev);
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ADVISOR TICKET DETAIL - Admin-style layout with IST timestamps
// ─────────────────────────────────────────────────────────────────────────────
const AdvisorTicketDetail: React.FC<{
  ticket: any;
  consultantId: number;
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
}> = ({ ticket, consultantId, onClose, onStatusChange }) => {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [localStatus, setLocalStatus] = useState(ticket.status);
  const [updatingSt, setUpdatingSt] = useState(false);
  const [notes, setNotes] = useState<any[]>(ticket.internalNotes ?? []);
  const [noteText, setNoteText] = useState('');
  const [postingNote, setPostingNote] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [cannedResponses, setCannedResponses] = useState<{ id: number; title: string; category: string; body: string }[]>([]);
  const [cannedSearch, setCannedSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { const d = await getTicketComments(ticket.id); setComments(extractArray(d)); }
      catch { /* skip */ }
      finally { setLoading(false); }
    })();
    setLocalStatus(ticket.status);
    setNotes(ticket.notes ?? []);
  }, [ticket.id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comments]);

  // ── Fetch canned responses for this consultant ──
  useEffect(() => {
    apiFetch('/admin/config/canned-responses')
      .then((data: any) => {
        const arr = Array.isArray(data) ? data : data?.content || [];
        setCannedResponses(arr);
      })
      .catch(() => { });
  }, []);

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const saved = await postTicketComment(ticket.id, reply.trim(), consultantId, true);
      setComments(p => [...p, saved]);
      setReply('');
      if (localStatus === 'NEW') { setLocalStatus('OPEN'); onStatusChange(ticket.id, 'OPEN'); }

      const userId = ticket.userId || ticket.user?.id;
      if (userId) {
        const key = `fin_notifs_USER_${userId}`;
        try {
          const prev = JSON.parse(localStorage.getItem(key) || '[]');
          const newNotif = {
            id: `${Date.now()}_reply_${ticket.id}`,
            type: 'info',
            title: `New Reply - ${ticket.category || ticket.title || "Ticket"}`,
            message: reply.trim().substring(0, 100),
            timestamp: new Date().toISOString(),
            read: false,
            ticketId: ticket.id,
          };
          localStorage.setItem(key, JSON.stringify([newNotif, ...prev].slice(0, 50)));
        } catch { }
      }
      // Fire email to user - non-fatal
      const userEmail = ticket.userEmail || ticket.user?.email || ticket.email || '';
      const ticketNum = String(ticket.ticketNumber || ticket.id);
      if (userEmail) {
        emailOnTicketUpdated({ to: userEmail, ticketNumber: ticketNum, status: localStatus }).catch(() => null);
      }
    } catch (e: any) { showToast(e.message || 'Failed.', false); }
    finally { setSending(false); }
  };

  const handleStatus = async (s: string) => {
    setUpdatingSt(true);
    try {
      await updateTicketStatus(ticket.id, s);
      setLocalStatus(s);
      onStatusChange(ticket.id, s);
      showToast(`Status updated to ${s.replace('_', ' ')}`);

      const userId = ticket.userId || ticket.user?.id;
      if (userId) {
        const key = `fin_notifs_USER_${userId}`;
        try {
          const prev = JSON.parse(localStorage.getItem(key) || '[]');
          const newNotif = {
            id: `${Date.now()}_status_${ticket.id}`,
            type: s === 'RESOLVED' ? 'success' : s === 'ESCALATED' ? 'error' : 'info',
            title: `Ticket Status: ${s.replace('_', ' ')}`,
            message: `Your ticket status has been updated to ${s.replace('_', ' ')}.`,
            timestamp: new Date().toISOString(),
            read: false,
            ticketId: ticket.id,
          };
          localStorage.setItem(key, JSON.stringify([newNotif, ...prev].slice(0, 50)));
        } catch { }
      }
      // Fire status-change email to user - non-fatal
      const userEmailSt = ticket.userEmail || ticket.user?.email || ticket.email || '';
      const ticketNumSt = String(ticket.ticketNumber || ticket.id);
      if (userEmailSt) {
        emailOnTicketUpdated({ to: userEmailSt, ticketNumber: ticketNumSt, status: s }).catch(() => null);
      }
    } catch (e: any) { showToast(e.message || 'Failed.', false); }
    finally { setUpdatingSt(false); }
  };

  const handleNote = async () => {
    if (!noteText.trim()) return;
    setPostingNote(true);
    const noteContent = noteText.trim();
    try {
      const saved = await postInternalNote(ticket.id, noteContent, consultantId);
      setNotes(p => [...p, saved]);
      setNoteText('');
      showToast('Note saved');
    } catch {
      setNotes(p => [...p, { id: Date.now(), ticketId: ticket.id, authorId: consultantId, noteText: noteContent, createdAt: new Date().toISOString() }]);
      setNoteText(''); showToast('Note saved locally');
    } finally { setPostingNote(false); }
    // Notify admin via localStorage so it appears in admin notifications panel
    try {
      const adminKey = 'fin_notifs_ADMIN';
      const prev: any[] = JSON.parse(localStorage.getItem(adminKey) || '[]');
      const adminNotif = {
        id: `note_ticket_${ticket.id}_${Date.now()}`,
        type: 'info',
        title: `Internal Note - Ticket #${ticket.id}`,
        message: `Consultant added a note on Ticket #${ticket.id} (${ticket.category || 'Support'}): "${noteContent.substring(0, 100)}${noteContent.length > 100 ? '...' : ''}"`,
        timestamp: new Date().toISOString(),
        read: false,
        ticketId: ticket.id,
      };
      localStorage.setItem(adminKey, JSON.stringify([adminNotif, ...prev].slice(0, 50)));
    } catch { }
  };

  const handleEscalate = async () => {
    setEscalating(true);
    try {
      try {
        const marker = `[ESCALATED_BY:${consultantId}]`;
        await postInternalNote(
          ticket.id,
          `🚨 ESCALATED ${marker} on ${new Date().toLocaleString('en-IN')}: This ticket requires supervisor attention. Consultant has escalated it for priority handling.`,
          consultantId
        );
        setNotes(p => [...p, {
          id: Date.now(), ticketId: ticket.id, authorId: consultantId,
          noteText: `🚨 ESCALATED ${marker}: Supervisor attention required.`,
          createdAt: new Date().toISOString()
        }]);
      } catch { }
      // Record the escalation block so admin can't reassign the same consultant
      recordEscalationBlock(ticket.id, consultantId, {
        consultantName: undefined,
        ticketTitle: ticket.category || ticket.title,
      });

      // Try to set the real ESCALATED status; fall back gracefully if backend rejects it
      try {
        await updateTicketStatus(ticket.id, 'ESCALATED');
        setLocalStatus('ESCALATED');
        onStatusChange(ticket.id, 'ESCALATED');
      } catch {
        // Backend may not support ESCALATED - signal via __ESCALATED__ for UI only
        onStatusChange(ticket.id, '__ESCALATED__');
      }
      showToast('Escalated. Supervisor notified.');
      // Fire escalation email to user - non-fatal
      const userEmailEsc = ticket.userEmail || ticket.user?.email || ticket.email || '';
      const ticketNumEsc = String(ticket.ticketNumber || ticket.id);
      if (userEmailEsc) {
        sendTicketEscalatedEmail({
          ticketId: ticket.id,
          ticketTitle: ticket.title || ticket.category || `Ticket #${ticketNumEsc}`,
          userEmail: userEmailEsc,
        }).catch(() => null);
      }
    } catch (e: any) { showToast(e.message || 'Failed.', false); }
    finally { setEscalating(false); }
  };

  const sla = getSlaInfo({ ...ticket, status: localStatus });
  const sc = getStatusStyle(localStatus);
  const pc = getPriorityStyle(ticket.priority);
  const STATUSES = ['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ padding: '16px 20px', background: 'var(--portal-profile-gradient)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#99F6E4', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Ticket #{ticket.id}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{ticket.category}</div>
            <div style={{ display: 'flex', gap: 5 }}>
              <Badge label={localStatus} style={sc} />
              <Badge label={ticket.priority} style={pc} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
        </div>
      </div>
      {sla && (
        <div style={{ padding: '8px 16px', background: sla.breached ? '#FEF2F2' : sla.warning ? '#FFFBEB' : '#F0FDF4', borderBottom: `1px solid ${sla.breached ? '#FECACA' : sla.warning ? '#FDE68A' : '#BBF7D0'}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span>{sla.breached ? '🔴' : sla.warning ? '🟡' : '🟢'}</span>
          <div style={{ fontSize: 11 }}>
            <span style={{ fontWeight: 700, color: sla.breached ? '#B91C1C' : sla.warning ? '#92400E' : '#15803D' }}>
              SLA {sla.breached ? 'BREACHED' : sla.warning ? 'WARNING' : 'ON TRACK'}
            </span>
            <span style={{ color: '#64748B' }}> · {sla.breached ? `Overdue ${Math.abs(sla.minsLeft)}min` : `Due ${sla.deadlineStr}`} · {ticket.priority} ({SLA_HOURS[ticket.priority]}h)</span>
          </div>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8 }}>Description</div>
          <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.7, background: '#F8FAFC', padding: '10px 14px', borderRadius: 10, borderLeft: '3px solid #A5F3FC' }}>
            {ticket.description}
          </p>
          {ticket.attachmentUrl && (
            <a href={ticket.attachmentUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12, color: '#0F766E', fontWeight: 600 }}>
              📎 Attachment
            </a>
          )}
        </div>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>Update Status</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUSES.map(s => {
              const st = getStatusStyle(s);
              const active = localStatus === s;
              return (
                <button key={s} onClick={() => !active && handleStatus(s)} disabled={updatingSt || active}
                  style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: active ? 'default' : 'pointer', background: active ? st.bg : '#fff', color: active ? st.color : '#64748B', border: `1.5px solid ${active ? st.border : '#E2E8F0'}`, opacity: updatingSt ? 0.6 : 1 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span>{s.replace('_', ' ')}</span>
                    {active && <CheckCircle size={10} />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── CONVERSATION THREAD - Admin-style layout ── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            💬 Conversation ({comments.length})
          </div>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
              <img src={logoImg} alt="Meet The Masters" style={{ width: 48, height: 'auto', animation: 'mtmPulse 1.8s ease-in-out infinite' }} />
            </div>
          ) : comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24, color: '#94A3B8', fontSize: 12, fontStyle: 'italic' }}>No messages yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
              {comments.map((c: any) => {
                const isAgent =
                  c.isConsultantReply === true ||
                  c.authorRole === 'AGENT' ||
                  (c.isConsultantReply !== false && c.senderId != null && c.senderId !== ticket.userId);

                const senderLabel = c.authorName
                  ? c.authorName
                  : isAgent
                    ? 'You (Agent)'
                    : (ticket.user?.name || ticket.userName || 'Customer');

                return (
                  <div key={c.id} style={{ display: 'flex', gap: 10, flexDirection: isAgent ? 'row-reverse' : 'row' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                      background: isAgent
                        ? 'var(--portal-profile-gradient)'
                        : 'linear-gradient(135deg,#F59E0B,#D97706)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: 700, color: '#fff',
                    }}>
                      {senderLabel.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ maxWidth: '76%' }}>
                      <div style={{ fontSize: 10, color: '#94A3B8', marginBottom: 3, textAlign: isAgent ? 'right' : 'left' }}>
                        <strong style={{ color: '#475569' }}>{senderLabel}</strong>
                        {isAgent && (
                          <span style={{ marginLeft: 5, background: '#ECFEFF', color: '#0F766E', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
                            AGENT
                          </span>
                        )}
                        {!isAgent && (
                          <span style={{ marginLeft: 5, background: '#FFF7ED', color: '#D97706', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700 }}>
                            CUSTOMER
                          </span>
                        )}
                        {' · '}{fmtISTTime(c.createdAt)}
                      </div>
                      <div style={{
                        padding: '10px 13px', borderRadius: 12, fontSize: 13, lineHeight: 1.6,
                        background: isAgent ? '#ECFEFF' : '#FFF7ED',
                        color: isAgent ? '#0F172A' : '#92400E',
                        border: `1px solid ${isAgent ? '#A5F3FC' : '#FED7AA'}`,
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

        <div style={{ padding: '12px 20px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
          {/* ── Header row ── */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Mail size={12} /> Reply to Customer</span>
            </div>
          </div>

          {/* ── Canned Responses Dropdown ── */}
          {cannedResponses.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <select
                value=""
                onChange={e => { if (e.target.value) { setReply(e.target.value); } }}
                style={{
                  width: '100%', padding: '8px 12px', border: '1.5px solid #A5F3FC',
                  borderRadius: 10, fontSize: 13, fontFamily: 'inherit', outline: 'none',
                  background: '#fff', cursor: 'pointer', color: '#0F172A',
                  boxSizing: 'border-box' as any,
                }}
              >
                <option value="">⚡ Canned Responses - select to insert...</option>
                {cannedResponses.map(r => (
                  <option key={r.id} value={r.body || (r as any).content || (r as any).message || ''}>
                    {r.category ? `[${r.category}] ` : ''}{r.title || '-'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── HIDDEN old chip panel placeholder ── */}
          {false && (
            <div style={{ marginBottom: 10, border: '1.5px solid #A5F3FC', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
              {/* Panel header with search */}
              <div style={{
                padding: '7px 12px', background: 'var(--portal-profile-gradient)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#99F6E4', letterSpacing: '0.07em', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <Zap size={12} /> Canned Responses
                </span>
                <input
                  value={cannedSearch}
                  onChange={e => setCannedSearch(e.target.value)}
                  placeholder="Search..."
                  style={{
                    flex: 1, padding: '3px 9px', border: '1px solid rgba(255,255,255,0.28)',
                    borderRadius: 7, fontSize: 11, outline: 'none',
                    background: 'rgba(255,255,255,0.15)', color: '#fff',
                    fontFamily: 'inherit', boxSizing: 'border-box' as any,
                  }}
                />
              </div>
              {/* Scrollable chips row */}
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 10px', scrollbarWidth: 'thin' as any }}>
                {cannedResponses
                  .filter(r =>
                    !cannedSearch.trim() ||
                    (r.title || '').toLowerCase().includes(cannedSearch.toLowerCase()) ||
                    (r.category || '').toLowerCase().includes(cannedSearch.toLowerCase()) ||
                    (r.body || '').toLowerCase().includes(cannedSearch.toLowerCase())
                  )
                  .map(r => (
                    <button
                      key={r.id}
                      title={r.body || (r as any).content || ''}
                      onClick={() => { setReply(r.body || (r as any).content || (r as any).message || ''); setCannedSearch(''); }}
                      style={{
                        flexShrink: 0, padding: '5px 11px', borderRadius: 20,
                        border: '1.5px solid #A5F3FC',
                        background: reply === (r.body || (r as any).content || '') ? '#CCFBF1' : '#ECFEFF',
                        color: '#0F766E', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'all 0.12s',
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        whiteSpace: 'nowrap', outline: 'none',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#99F6E4'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#0F766E'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = reply === (r.body || (r as any).content || '') ? '#CCFBF1' : '#ECFEFF'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#A5F3FC'; }}
                    >
                      {r.category && (
                        <span style={{ fontSize: 9, background: '#0F766E', color: '#fff', borderRadius: 4, padding: '1px 5px', fontWeight: 700, textTransform: 'uppercase' as any, letterSpacing: '0.04em' }}>
                          {r.category}
                        </span>
                      )}
                      {r.title || '-'}
                    </button>
                  ))}
                {cannedResponses.filter(r =>
                  !cannedSearch.trim() ||
                  (r.title || '').toLowerCase().includes(cannedSearch.toLowerCase()) ||
                  (r.category || '').toLowerCase().includes(cannedSearch.toLowerCase()) ||
                  (r.body || '').toLowerCase().includes(cannedSearch.toLowerCase())
                ).length === 0 && (
                    <span style={{ fontSize: 11, color: '#94A3B8', padding: '4px 2px', fontStyle: 'italic' }}>
                      No responses match "{cannedSearch}"
                    </span>
                  )}
              </div>
            </div>
          )}

          {/* ── Reply textarea + Send button ── */}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea
              value={reply}
              onChange={e => setReply(e.target.value)}
              rows={3}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Type reply... (Enter to send)"
              style={{
                flex: 1, padding: '9px 12px', border: '1.5px solid #A5F3FC',
                borderRadius: 10, fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
                outline: 'none', background: '#fff', minHeight: 68,
              }}
            />
            <button
              onClick={handleSend}
              disabled={!reply.trim() || sending}
              style={{
                padding: '9px 16px', borderRadius: 10, border: 'none',
                background: !reply.trim() || sending ? '#E2E8F0' : 'var(--color-primary-gradient)',
                color: !reply.trim() || sending ? '#94A3B8' : '#fff',
                fontSize: 13, fontWeight: 700,
                cursor: !reply.trim() || sending ? 'default' : 'pointer',
                alignSelf: 'flex-end', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
              {sending
                ? <><span style={{ width: 12, height: 12, border: '2px solid #CBD5E1', borderTopColor: '#94A3B8', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Sending</>
                : <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                  Send
                </>}
            </button>
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #FEF9C3', background: '#FFFBEB' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', marginBottom: 10 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Lock size={12} /> Internal Notes</span> <span style={{ fontSize: 10, fontWeight: 400, color: '#B45309', textTransform: 'none' }}>(private)</span>
          </div>
          {notes.map((n: any) => (
            <div key={n.id} style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#1E293B', lineHeight: 1.5 }}>{n.noteText}</div>
              <div style={{ fontSize: 10, color: '#92400E', marginTop: 4 }}>
                {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleNote(); } }}
              placeholder="Add private note... (Enter to save)"
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #FDE68A', borderRadius: 10, fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none', background: '#fff' }} />
            <button onClick={handleNote} disabled={!noteText.trim() || postingNote}
              style={{ padding: '9px 13px', borderRadius: 10, border: 'none', background: !noteText.trim() ? '#F1F5F9' : '#D97706', color: !noteText.trim() ? '#94A3B8' : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end' }}>
              {postingNote ? '...' : 'Save'}
            </button>
          </div>
        </div>
        <div style={{ padding: '14px 20px', background: '#FFF7ED' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9A3412', textTransform: 'uppercase', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={12} /> Escalate</div>
          {localStatus === 'ESCALATED' || (notes && notes.some((n: any) => n.noteText?.includes('🚨 ESCALATED'))) ? (
            <div style={{ fontSize: 12, color: '#B91C1C', fontWeight: 600, padding: '8px 12px', background: '#FEE2E2', borderRadius: 8, border: '1px solid #FECACA', display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={13} /> Already escalated</div>
          ) : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 12, color: '#78350F', lineHeight: 1.5 }}>
                Can't resolve this? Escalate to supervisor for priority handling.
              </div>
              <button onClick={handleEscalate} disabled={escalating}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                {escalating ? '...' : 'Escalate'}
              </button>
            </div>
          )}
        </div>
      </div>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTANT NOTIFICATIONS VIEW
// ─────────────────────────────────────────────────────────────────────────────
const ConsultantNotificationsView: React.FC<{
  consultantId: number;
  onNavigate?: (tab: string) => void;
}> = ({ consultantId, onNavigate }) => {
  const STORAGE_KEY = `fin_notifs_CONSULTANT_${consultantId}`;

  interface LocalNotif {
    id: string; type: string; title: string; message: string;
    timestamp: string; read: boolean; ticketId?: number; bookingId?: number;
  }

  const CLEARED_AT_KEY = `${STORAGE_KEY}_CLEARED_AT`;

  const [notifs, setNotifs] = useState<LocalNotif[]>(() => {
    try {
      const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const clearedAt = Number(localStorage.getItem(CLEARED_AT_KEY) || 0);
      return local.filter((n: any) => new Date(n.timestamp || 0).getTime() > clearedAt);
    }
    catch { return []; }
  });
  const [displayNotifs, setDisplayNotifs] = useState<LocalNotif[]>(() => {
    try {
      const local = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const clearedAt = Number(localStorage.getItem(CLEARED_AT_KEY) || 0);
      return local.filter((n: any) => new Date(n.timestamp || 0).getTime() > clearedAt);
    }
    catch { return []; }
  });

  // ── Merge helper: deduplicate by id, newest first, preserve local read state ──
  const mergeNotifs = (backend: LocalNotif[], local: LocalNotif[]): LocalNotif[] => {
    // Build a map of IDs that were locally marked as read - never let backend override these
    const localReadIds = new Set(local.filter(n => n.read).map(n => String(n.id)));
    const seen = new Set<string>();
    const merged: LocalNotif[] = [];
    for (const n of [...backend, ...local]) {
      if (n?.id && !seen.has(String(n.id))) {
        seen.add(String(n.id));
        // If this notification was locally marked as read, keep it read
        merged.push({ ...n, read: localReadIds.has(String(n.id)) ? true : n.read });
      }
    }
    return merged
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
      .slice(0, 50);
  };

  // ── Poll backend API + localStorage and merge ─────────────────────────────
  const pollAll = React.useCallback(async () => {
    const toUiType = (raw: any): string => {
      const t = String(raw || '').toUpperCase();
      if (t.includes('ERROR') || t.includes('FAIL') || t.includes('ESCALAT')) return 'error';
      if (t.includes('CONFIRM') || t.includes('SUCCESS') || t.includes('SCHEDULED')) return 'success';
      if (t.includes('WARNING') || t.includes('PENDING') || t.includes('NEW_BOOKING')) return 'warning';
      return 'info';
    };
    let backendNotifs: LocalNotif[] = [];
    try {
      const raw = await getMyUnreadNotifications();
      const arr = Array.isArray(raw) ? raw : [];
      backendNotifs = arr.map((n: any) => ({
        id: String(n.id || `be-${n.createdAt}`),
        type: toUiType(n.type || n.notificationType || n.category),
        title: n.title || n.subject || String(n.type || 'Notification').replace(/_/g, ' '),
        message: n.message || n.body || n.content || '',
        timestamp: n.createdAt || n.timestamp || new Date().toISOString(),
        read: n.read ?? n.isRead ?? false,
        ticketId: n.ticketId || n.relatedTicketId || undefined,
        bookingId: n.bookingId || n.relatedBookingId || undefined,
      }));
    } catch { /* backend unavailable - fall back to localStorage only */ }
    const clearedAt = Number(localStorage.getItem(CLEARED_AT_KEY) || 0);
    const local: LocalNotif[] = (() => {
      try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return raw.filter((n: any) => new Date(n.timestamp || 0).getTime() > clearedAt);
      } catch { return []; }
    })();
    // Filter backend notifications by clearedAt before merging
    const freshBackend = backendNotifs.filter(n => new Date(n.timestamp || 0).getTime() > clearedAt);
    const merged = mergeNotifs(freshBackend, local);
    // Persist merged list so future polls include backend items
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { }
    setNotifs(merged);
  }, [STORAGE_KEY]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const normalized = await Promise.all(notifs.map(async (n: LocalNotif) => ({
        ...n,
        title: await resolvePlaceholderNameText(n.title),
        message: await resolvePlaceholderNameText(n.message),
      })));
      if (!cancelled) setDisplayNotifs(normalized);
    })();
    return () => { cancelled = true; };
  }, [notifs]);

  useEffect(() => {
    pollAll(); // immediate fetch on mount
    const interval = setInterval(pollAll, 15_000); // poll every 15s like UserPage
    window.addEventListener('focus', pollAll);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', pollAll);
    };
  }, [pollAll]);

  const markRead = (id: string) => {
    const updated = notifs.map(n => n.id === id ? { ...n, read: true } : n);
    setNotifs(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { }
    // If it's a backend notification (numeric ID), notify server
    const numericId = Number(id);
    if (!isNaN(numericId)) {
      markNotificationAsRead(numericId).catch(() => { });
    }
  };

  const handleCardClick = (n: LocalNotif) => {
    markRead(n.id);
    if (!onNavigate) return;
    // Determine destination tab from notification content
    const isTicket = n.ticketId != null ||
      /ticket|sla|escalat/i.test(n.title + n.message);
    const isBooking = n.bookingId != null ||
      /booking|session|meeting|confirmed|cancel/i.test(n.title + n.message);
    if (isTicket) onNavigate('tickets');
    else if (isBooking) onNavigate('bookings');
  };

  const markAllRead = () => {
    const updated = notifs.map(n => ({ ...n, read: true }));
    setNotifs(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { }
    // Mark ALL unread ones as read on backend too
    notifs.forEach(n => {
      if (!n.read) {
        const nid = Number(n.id);
        if (!isNaN(nid)) markNotificationAsRead(nid).catch(() => { });
      }
    });
  };

  const clearAll = () => {
    localStorage.setItem(CLEARED_AT_KEY, String(Date.now()));
    setNotifs([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { }
  };

  const unread = notifs.filter(n => !n.read).length;

  const TYPE_CFG: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
    info: { color: '#0F766E', bg: '#ECFEFF', border: '#A5F3FC', icon: <Info size={18} color="#0F766E" /> },
    success: { color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC', icon: <CheckCircle size={18} color="#16A34A" /> },
    warning: { color: '#D97706', bg: '#FFFBEB', border: '#FCD34D', icon: <AlertTriangle size={18} color="#D97706" /> },
    error: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: <AlertTriangle size={18} color="#DC2626" /> },
  };

  const timeAgo = (d: string) => {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className="advisor-content-container">
      <div className="section-header" style={{ marginBottom: 20 }}>
        <div>
          <h2>My Notifications</h2>
          {unread > 0 && (
            <span style={{ fontSize: 12, color: '#0F766E', fontWeight: 600 }}>
              {unread} unread notification{unread !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {unread > 0 && (
            <button onClick={markAllRead} style={{ padding: '7px 14px', background: '#ECFEFF', border: '1px solid #A5F3FC', color: '#0F766E', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Mark all read
            </button>
          )}
          {notifs.length > 0 && (
            <button onClick={clearAll} style={{ padding: '7px 14px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Clear all
            </button>
          )}
        </div>
      </div>
      {displayNotifs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: 16, color: '#94A3B8' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <p style={{ margin: 0, fontWeight: 600, color: '#64748B', fontSize: 15 }}>No notifications yet</p>
          <p style={{ fontSize: 12, marginTop: 8, color: '#94A3B8', lineHeight: 1.6, maxWidth: 280, margin: '8px auto 0' }}>
            Booking confirmations, cancellations, ticket assignments and admin updates will appear here automatically.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayNotifs.map(n => {
            const cfg = TYPE_CFG[n.type] || TYPE_CFG.info;
            const isTicket = n.ticketId != null || /ticket|sla|escalat/i.test(n.title + n.message);
            const isBooking = n.bookingId != null || /booking|session|meeting|confirmed|cancel/i.test(n.title + n.message);
            const navLabel = isTicket ? 'View tickets' : isBooking ? 'View bookings' : null;
            return (
              <div key={n.id}
                onClick={() => handleCardClick(n)}
                style={{
                  background: n.read ? '#fff' : cfg.bg,
                  border: `1.5px solid ${n.read ? '#F1F5F9' : cfg.border}`,
                  borderLeft: `4px solid ${cfg.color}`,
                  borderRadius: 12, padding: '14px 18px',
                  display: 'flex', gap: 14, alignItems: 'flex-start',
                  cursor: onNavigate && navLabel ? 'pointer' : 'default',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={e => { if (onNavigate && navLabel) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 10px rgba(15,118,110,0.12)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
              >
                <div style={{ flexShrink: 0, lineHeight: 1.2, display: 'flex', alignItems: 'center' }}>{cfg.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: cfg.color, marginBottom: 3 }}>
                    {n.title}
                    {!n.read && <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block', verticalAlign: 'middle' }} />}
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, wordBreak: 'break-word' }}>{n.message}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{timeAgo(n.timestamp)}</span>
                    {onNavigate && navLabel && (
                      <span style={{ color: cfg.color, fontWeight: 700, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span>{navLabel}</span>
                        <ArrowRight size={11} />
                      </span>
                    )}
                  </div>
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
// BOOKINGS VIEW
// ─────────────────────────────────────────────────────────────────────────────
const BookingsView: React.FC<{ consultantId: number; onNavigateToSchedule?: () => void; shiftStartTime?: string; shiftEndTime?: string; slotDurationMinutes?: number; onBookingsLoaded?: (bookings: any[]) => void }> = ({ consultantId, onNavigateToSchedule, shiftStartTime = '', shiftEndTime = '', slotDurationMinutes = 60, onBookingsLoaded }) => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  // AFTER - fetches both regular AND dedicated special bookings in parallel
  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const [data, specialData] = await Promise.all([
          getBookingsByConsultant(consultantId),
          getSpecialBookingsByConsultant(consultantId).catch(() => []),
        ]);
        const arr = extractArray(data);

        const specialArr = extractArray(specialData).map((b: any) => {
          const dedicatedId = getDedicatedSpecialBookingId(b) ?? toPositiveNumber(b?.id);
          return { ...b, isSpecialBooking: true, specialBookingId: dedicatedId ?? undefined };
        });

        if (arr.length > 0) console.log('📋 FIRST BOOKING (raw):', JSON.stringify(arr[0], null, 2));

        const token = localStorage.getItem('fin_token');
        const authHeaders = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

        // ✅ Actual enrichment - NOT a placeholder comment
        const enriched = await Promise.all(arr.map(async (b: any) => {
          let enrichedBooking = { ...b };
          if (!b.user?.name && !b.user?.fullName && !b.userName && !b.clientName && !b.client?.name && !b.client?.fullName) {
            const uid = b.userId || b.user?.id || b.clientId;
            if (uid) {
              try {
                const res = await fetch(buildApiUrl(`/users/${uid}`), { headers: authHeaders });
                if (res.ok) {
                  const resp = await res.json();
                  const u = resp?.data || resp?.user || resp?.content?.[0] || resp;
                  const rawName = u.name || u.fullName || u.displayName || u.givenName ||
                    (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : '') ||
                    u.firstName || u.lastName || u.username || u.loginId || u.email || u.identifier || '';
                  enrichedBooking.user = { id: u.id, name: rawName, email: u.email || u.identifier, username: u.username || u.identifier };
                }
              } catch { /* skip */ }
            }
          }
          const hasDate = deepFindDate(enrichedBooking);
          const hasTime = deepFindTime(enrichedBooking);
          if (!hasDate || !hasTime) {
            // Backend BookingResponse returns timeSlotIds (List<Long>), not timeSlotId
            const fromArray = Array.isArray(b.timeSlotIds) ? b.timeSlotIds[0] : b.timeSlotIds;
            const tsId = b.timeSlotId || b.timeslotId || b.time_slot_id || b.slotId || b.slot_id || b.timeSlot?.id || b.timeslot?.id || b.slot?.id || fromArray;
            if (tsId) {
              try {
                const tsRes = await fetch(buildApiUrl(`/timeslots/${tsId}`), { headers: authHeaders });
                if (tsRes.ok) {
                  const ts = await tsRes.json();
                  enrichedBooking = {
                    ...enrichedBooking,
                    slotDate: enrichedBooking.slotDate || ts.slotDate || ts.slot_date || ts.date || '',
                    bookingDate: enrichedBooking.bookingDate || ts.slotDate || ts.slot_date || ts.date || '',
                    slotTime: enrichedBooking.slotTime || ts.slotTime || ts.slot_time || '',
                    timeRange: enrichedBooking.timeRange || ts.timeRange || ts.time_range || ts.masterTimeSlot?.timeRange || ts.masterTimeslot?.timeRange || '',
                    timeSlot: { ...(enrichedBooking.timeSlot || {}), ...ts },
                  };
                }
              } catch { /* skip */ }
            }
          }
          return enrichedBooking;
        }));

        // ── Enrich special bookings with user names (same as regular bookings) ──
        const enrichedSpecial = await Promise.all(specialArr.map(async (b: any) => {
          if (b.user?.name || b.user?.fullName || b.userName || b.clientName || b.client?.name) {
            return b; // already has a name
          }
          const uid = b.userId || b.user?.id || b.clientId;
          if (!uid) return b;
          try {
            const res = await fetch(buildApiUrl(`/users/${uid}`), { headers: authHeaders });
            if (!res.ok) return b;
            const resp = await res.json();
            const u = resp?.data || resp?.user || resp?.content?.[0] || resp;
            const rawName = u.name || u.fullName || u.displayName ||
              (u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : '') ||
              u.firstName || u.lastName || u.username || u.email || '';
            return {
              ...b,
              userName: rawName || b.userName,
              clientName: rawName || b.clientName,
              user: { id: u.id, name: rawName, email: u.email || u.identifier, username: u.username || u.identifier },
            };
          } catch { return b; }
        }));

        const finalBookings = [...enriched, ...enrichedSpecial];
        setBookings(finalBookings);
        if (onBookingsLoaded) onBookingsLoaded(finalBookings);
      } catch (e: any) {
        setError(e?.message || 'Could not load bookings. Please try again.');
      } finally { setLoading(false); }
    })();
  }, [consultantId]);
  // Separate regular vs special bookings
  const regularBookings = bookings.filter((b: any) => !resolveSpecialBookingMeta(b));
  const specialBookingsAll = bookings.filter((b: any) => !!resolveSpecialBookingMeta(b));

  // Scheduled/confirmed special bookings have a confirmed date/time - show them in the main bookings list too
  const scheduledSpecialBookings = specialBookingsAll.filter(
    (b: any) => isScheduledSpecialStatus(resolveSpecialBookingMeta(b)?.status)
  );

  const activeBookings = regularBookings.filter((b: any) => {
    const st = getBookingLifecycleStatus(b);
    if (st === 'COMPLETED' || st === 'CANCELLED') return false;
    return !isBookingExpired(b, now);
  });
  const regularHistoryBookings = regularBookings.filter((b: any) => {
    const st = getBookingLifecycleStatus(b);
    if (st === 'COMPLETED' || st === 'CANCELLED') return true;
    return isBookingExpired(b, now);
  });
  const historySpecialBookings = specialBookingsAll.filter((b: any) => {
    const status = getBookingLifecycleStatus(b);
    if (status === 'COMPLETED' || status === 'CANCELLED') return true;
    if (!isScheduledSpecialStatus(resolveSpecialBookingMeta(b)?.status)) return false;
    const chronology = getBookingChronologyTarget(b);
    const bookingForTime = chronology.date || chronology.time
      ? { ...b, slotDate: chronology.date, bookingDate: chronology.date, timeRange: chronology.time, slotTime: chronology.time }
      : b;
    return isBookingExpired(bookingForTime, now);
  });
  const historyBookings = [...regularHistoryBookings, ...historySpecialBookings]
    .slice()
    .sort(compareBookingsChronologically);

  const activeScheduledSpecialBookings = scheduledSpecialBookings.filter((b: any) => {
    const chronology = getBookingChronologyTarget(b);
    const bookingForTime = chronology.date || chronology.time
      ? { ...b, slotDate: chronology.date, bookingDate: chronology.date, timeRange: chronology.time, slotTime: chronology.time }
      : b;
    return !isBookingExpired(bookingForTime, now);
  });

  // Combine active regular bookings + scheduled special bookings for the main view
  const activeBookingsWithScheduled = [
    ...activeBookings,
    ...activeScheduledSpecialBookings,
  ].slice().sort(compareBookingsChronologically);

  // Filter out any bookings for days that have completely passed
  const activeBookingsStrict = activeBookingsWithScheduled.filter(b => !isBookingExpired(b, now));

  const visibleBookings = filter === 'HISTORY' ? historyBookings : activeBookingsStrict;
  const filtered = (filter === 'ALL'
    ? visibleBookings
    : filter === 'HISTORY'
      ? historyBookings
      : visibleBookings.filter((b: any) => {
        const st = getBookingLifecycleStatus(b);
        const meta = resolveSpecialBookingMeta(b);
        // Scheduled special bookings show under CONFIRMED tab
        if (filter === 'CONFIRMED') return st === 'CONFIRMED' || st === 'BOOKED' || st === 'SCHEDULED' || isScheduledSpecialStatus(meta?.status);
        return st === filter;
      })
  ).slice().sort(compareBookingsChronologically);

  const counts: Record<string, number> = {
    ALL: activeBookingsWithScheduled.length,
    PENDING: activeBookings.filter((b: any) => getBookingLifecycleStatus(b) === 'PENDING').length,
    CONFIRMED: activeBookings.filter((b: any) => ['CONFIRMED', 'BOOKED'].includes(getBookingLifecycleStatus(b))).length
      + activeScheduledSpecialBookings.length,
    COMPLETED: bookings.filter((b: any) => getBookingLifecycleStatus(b) === 'COMPLETED').length,
    CANCELLED: bookings.filter((b: any) => getBookingLifecycleStatus(b) === 'CANCELLED').length,
    HISTORY: historyBookings.length,
    SPECIAL: specialBookingsAll.length,
  };

  const totalRevenue = bookings
    .filter((b: any) => getBookingLifecycleStatus(b) === 'COMPLETED')
    .reduce((sum: number, b: any) => sum + deepFindAmount(b), 0);

  return (
    <div className="advisor-content-container">
      <div className="section-header" style={{ alignItems: 'flex-end', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0F766E', marginBottom: 8 }}>
            Consultant Dashboard
          </div>
          <h2>My Bookings</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: '#0D9488', fontWeight: 700, padding: '8px 14px', background: '#ECFEFF', border: '1px solid #A5F3FC', borderRadius: 999, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)' }}>
            {activeBookingsWithScheduled.length} session{activeBookingsWithScheduled.length !== 1 ? 's' : ''}
          </span>
          {specialBookingsAll.length > 0 && (
            <button
              onClick={() => setFilter('SPECIAL')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '8px 16px', borderRadius: 999, border: '1.5px solid #F59E0B',
                background: filter === 'SPECIAL' ? 'linear-gradient(135deg,#D97706,#B45309)' : 'linear-gradient(135deg,#FFF8E1,#FEF3C7)',
                color: filter === 'SPECIAL' ? '#fff' : '#92400E', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(245,158,11,0.18)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={filter === 'SPECIAL' ? '#FDE68A' : '#F59E0B'} stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>
              {specialBookingsAll.length} Special{specialBookingsAll.length !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 12, marginBottom: 22 }}>
        {[
          { label: 'Upcoming', value: String(counts.ALL), color: '#0F766E' },
          { label: 'Pending', value: String(counts.PENDING), color: '#D97706' },
          { label: 'Confirmed', value: String(counts.CONFIRMED), color: '#0F766E' },
          { label: 'Completed', value: String(counts.COMPLETED), color: '#16A34A' },
          { label: 'Revenue', value: `₹${totalRevenue.toLocaleString("en-IN")}`, color: '#16A34A' },
        ].map(s => (
          <div key={s.label} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 18, padding: '16px 16px 14px', boxShadow: '0 18px 36px rgba(15,23,42,0.06)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: `linear-gradient(90deg, ${s.color}, ${s.color}55)` }} />
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Live overview</div>
          </div>
        ))}
        {/* Special Bookings stat card - clickable to show inline */}
        <div
          onClick={() => setFilter('SPECIAL')}
          style={{ background: filter === 'SPECIAL' ? 'linear-gradient(135deg,#D97706,#B45309)' : 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', border: `1.5px solid ${filter === 'SPECIAL' ? '#B45309' : '#F59E0B'}`, borderRadius: 18, padding: '16px 16px 14px', boxShadow: '0 6px 20px rgba(245,158,11,0.15)', position: 'relative', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.18s' }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg,#F59E0B,#D97706)' }} />
          <div style={{ fontSize: 11, color: filter === 'SPECIAL' ? '#FDE68A' : '#B45309', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill={filter === 'SPECIAL' ? '#FDE68A' : '#F59E0B'} stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>
            Special
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: filter === 'SPECIAL' ? '#fff' : '#B45309', letterSpacing: '-0.03em' }}>{counts.SPECIAL}</div>
          <div style={{ fontSize: 11, color: filter === 'SPECIAL' ? '#FDE68A' : '#D97706', marginTop: 4, fontWeight: 600 }}>{filter === 'SPECIAL' ? '✓ Viewing' : 'Manage →'}</div>
        </div>
      </div>
      <div style={{ display: 'inline-flex', gap: 8, marginBottom: 22, flexWrap: 'wrap', padding: 6, background: '#F0FDFA', border: '1px solid #CFFAFE', borderRadius: 999, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)' }}>
        {[
          { key: 'ALL', label: `ALL (${counts.ALL})` },
          { key: 'PENDING', label: `PENDING (${counts.PENDING})` },
          { key: 'CONFIRMED', label: `CONFIRMED (${counts.CONFIRMED})` },
          { key: 'HISTORY', label: `HISTORY (${counts.HISTORY})` },
          { key: 'SPECIAL', label: `⭐ SPECIAL (${counts.SPECIAL})`, special: true },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '8px 16px', borderRadius: 999, border: '1px solid',
            borderColor: filter === f.key ? (f.special ? '#D97706' : '#0F766E') : '#E2E8F0',
            background: filter === f.key ? (f.special ? 'linear-gradient(135deg,#D97706,#B45309)' : 'var(--color-primary-gradient)') : 'transparent',
            color: filter === f.key ? '#fff' : (f.special ? '#92400E' : '#64748B'),
            fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: filter === f.key ? (f.special ? '0 12px 22px rgba(217,119,6,0.28)' : '0 12px 22px rgba(15,118,110,0.22)') : 'none',
          }}>
            {f.label}
          </button>
        ))}
      </div>
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {error}</span>
        </div>
      )}
      {filter === 'SPECIAL' ? (
        <div>
          <SpecialBookingsView consultantId={consultantId} consultantName="" />

        </div>
      ) : loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
          <img src={logoImg} alt="Meet The Masters" style={{ width: 64, height: 'auto', animation: 'mtmPulse 1.8s ease-in-out infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '68px 24px', background: 'linear-gradient(180deg,#F0FDFA,#ECFEFF)', borderRadius: 24, color: '#94A3B8', border: '1px solid #CFFAFE', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.85)' }}>
          <div style={{ width: 74, height: 74, margin: '0 auto 16px', borderRadius: 24, background: 'var(--color-primary-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 18px 34px rgba(15,118,110,0.24)' }}>
            <CalendarIcon size={32} color="#FFFFFF" strokeWidth={2.2} />
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: '#0F172A' }}>
            {bookings.length === 0 ? 'No bookings yet.' : `No ${filter.toLowerCase()} bookings.`}
          </p>
          <p style={{ margin: '10px auto 0', maxWidth: 360, fontSize: 13, lineHeight: 1.7, color: '#64748B' }}>
            New appointments will appear here with session details, join links, and payment information.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map((booking: any, idx: number) => {
            const status = getBookingLifecycleStatus(booking);
            const sc = getStatusColor(status);
            const clientName = deepFindClientName(booking);
            const specialMeta = resolveSpecialBookingMeta(booking);
            const chronology = getBookingChronologyTarget(booking);
            const bookingForTime = chronology.date || chronology.time
              ? { ...booking, slotDate: chronology.date, bookingDate: chronology.date, timeRange: chronology.time, slotTime: chronology.time }
              : booking;
            const date = chronology.date || '-';
            const rawTime = chronology.time;
            const durationMinutes = booking.durationMinutes || Math.max(1, Number(specialMeta?.hours || 1)) * 60;
            const timeDisplay = rawTime ? formatTimeRange(rawTime, durationMinutes) : '-';
            const amount = deepFindAmount(booking);
            const isSpecial = !!specialMeta;
            const specialScheduled = isScheduledSpecialStatus(specialMeta?.status);
            return (
              <div key={booking.id || idx} style={{
                background: isSpecial ? 'linear-gradient(135deg,#FFF8F0 0%,#FEF3C7 60%,#FFFBEB 100%)' : 'linear-gradient(180deg,#FFFFFF 0%,#F0FDFA 100%)',
                border: isSpecial ? '1.5px solid #F59E0B' : '1px solid #E2E8F0',
                borderLeft: `4px solid ${isSpecial ? '#B45309' : sc.border}`, borderRadius: 20,
                padding: '18px 20px', display: 'flex', alignItems: 'center',
                gap: 16, flexWrap: 'wrap', boxShadow: isSpecial ? '0 6px 24px rgba(180,83,9,0.12)' : '0 18px 34px rgba(15,23,42,0.06)',
              }}>
                {isSpecial && (
                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, padding: '6px 12px', background: 'linear-gradient(90deg,rgba(180,83,9,0.10),rgba(217,119,6,0.06))', borderRadius: 9, border: '1px solid #FCD34D' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="#B45309" stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#7C2D12', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Special Booking - {status === 'COMPLETED' ? '✓ Completed' : status === 'CANCELLED' ? 'Cancelled' : specialScheduled ? '✓ Scheduled' : 'Awaiting Schedule'}
                    </span>
                  </div>
                )}
                <div style={{ width: 50, height: 50, borderRadius: 16, background: 'var(--color-primary-gradient)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0, boxShadow: '0 14px 26px rgba(15,118,110,0.2)' }}>
                  {clientName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 4 }}>Session with {clientName}</div>
                  <div style={{ fontSize: 13, color: '#64748B', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <CalendarIcon size={14} color="#64748B" />
                      {date}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Clock size={13} /> {timeDisplay}</span>
                    {amount > 0 && <span style={{ color: '#16A34A', fontWeight: 600 }}>₹{amount.toLocaleString("en-IN")}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Link2 size={12} /> Room: <span style={{ fontFamily: 'monospace', color: '#0F766E' }}>meetthemasters-booking-{booking.id}</span></span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ padding: '5px 14px', borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                    {status || 'UNKNOWN'}
                  </span>
                  {status !== 'CANCELLED' && status !== 'COMPLETED' && (!isSpecial || specialScheduled) && (() => {
                    const joinable = canJoinMeeting(bookingForTime, now);
                    return joinable ? (
                      <a href={booking.meetingLink || booking.jitsiLink || booking.joinUrl || `https://meet.jit.si/meetthemasters-booking-${booking.id}`}
                        target="_blank" rel="noreferrer"
                        style={{ padding: '7px 16px', background: 'var(--color-primary-gradient)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(15,118,110,0.3)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14" />
                          <rect x="3" y="6" width="12" height="12" rx="2" />
                        </svg>
                        Join Meeting
                      </a>
                    ) : (
                      <div title={`Join available 15 min before the session`} style={{ padding: '7px 16px', background: '#E2E8F0', color: '#94A3B8', borderRadius: 8, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, cursor: 'not-allowed', userSelect: 'none' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        Join Meeting
                        <span style={{ fontSize: 10, background: '#CBD5E1', color: '#64748B', borderRadius: 10, padding: '1px 6px', marginLeft: 2 }}>Opens 15 min before</span>
                      </div>
                    );
                  })()}
                  {/* Reschedule button for confirmed/booked bookings */}
                  {(status === 'CONFIRMED' || status === 'BOOKED' || specialScheduled) && (
                    <button
                      onClick={() => {
                        if (onNavigateToSchedule) onNavigateToSchedule();
                      }}
                      title="Request a different time slot for this session"
                      style={{
                        padding: '7px 14px', borderRadius: 8, border: '1.5px solid #A5F3FC',
                        background: '#ECFEFF', color: '#0F766E', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                      Reschedule
                    </button>
                  )}
                  <BookingAnswersButton
                    bookingId={booking.id}
                    userId={booking.userId || booking.user?.id || booking.clientId}
                    clientName={clientName}
                    bookingType="NORMAL"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Special Bookings Summary Banner ─────────────────────────────────── */}
      {filter !== 'SPECIAL' && specialBookingsAll.length > 0 && (
        <div style={{ marginTop: 24, borderRadius: 20, overflow: 'hidden', border: '1.5px solid #F59E0B', boxShadow: '0 6px 24px rgba(245,158,11,0.14)' }}>
          <div style={{ background: 'linear-gradient(135deg,#92400E 0%,#B45309 40%,#D97706 80%,#F59E0B 100%)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#FDE68A" stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>
              <div>
                <div style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>Special Bookings</div>
                <div style={{ color: '#FDE68A', fontSize: 12, marginTop: 2 }}>
                  {specialBookingsAll.length} request{specialBookingsAll.length !== 1 ? 's' : ''} - click to schedule slots inline
                </div>
              </div>
            </div>
            <button
              onClick={() => setFilter('SPECIAL')}
              style={{ padding: '9px 20px', borderRadius: 10, border: '2px solid rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.18)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}
            >
              <CalendarIcon size={14} color="#fff" />
              View & Schedule →
            </button>
          </div>
          <div style={{ background: '#FFFBEB', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {specialBookingsAll.slice(0, 4).map((booking: any, idx: number) => {
              const meta = resolveSpecialBookingMeta(booking);
              if (!meta) return null;
              const clientName = deepFindClientName(booking);
              const dateKey = meta.preferredDate || meta.scheduledDate || deepFindDate(booking) || 'TBD';
              const isScheduled = isScheduledSpecialStatus(meta.status);
              return (
                <div key={booking.id || idx} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12, background: '#fff', border: `1px solid ${isScheduled ? '#86EFAC' : '#FDE68A'}` }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: isScheduled ? 'linear-gradient(135deg,#16A34A,#15803D)' : 'linear-gradient(135deg,#D97706,#B45309)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                    {clientName.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', marginBottom: 2 }}>{clientName}</div>
                    <div style={{ fontSize: 11, color: '#92400E', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span>{dateKey}</span>
                      <span>·</span>
                      <span>{meta.requestedMeetingMode}</span>
                      <span>·</span>
                      <span>{meta.hours} hr{Number(meta.hours) !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: isScheduled ? '#DCFCE7' : '#FEF3C7', color: isScheduled ? '#166534' : '#B45309', border: `1px solid ${isScheduled ? '#86EFAC' : '#FCD34D'}`, flexShrink: 0 }}>
                    {isScheduled ? '✓ Scheduled' : 'Requested'}
                  </span>
                  <button onClick={() => setFilter('SPECIAL')} style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #A5F3FC', background: '#ECFEFF', color: '#0F766E', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {isScheduled ? 'View →' : 'Schedule →'}
                  </button>
                </div>
              );
            })}
            {specialBookingsAll.length > 4 && (
              <div style={{ textAlign: 'center', fontSize: 12, color: '#94A3B8', padding: '4px 0' }}>
                +{specialBookingsAll.length - 4} more - click "View & Schedule" to see all
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const SpecialBookingsView: React.FC<{ consultantId: number; consultantName?: string; defaultDurationHours?: number }> = ({
  consultantId,
  consultantName = 'Consultant',
  defaultDurationHours = 1,
}) => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [specialDays, setSpecialDays] = useState<ConsultantSpecialDayRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [schedulingBookingId, setSchedulingBookingId] = useState<number | null>(null);
  const [publishingDateBusy, setPublishingDateBusy] = useState<string | null>(null);
  const [unpublishingDate, setUnpublishingDate] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [form, setForm] = useState({ date: '', time: '', endTime: '' });
  const [timePicker, setTimePicker] = useState<{ open: boolean; field: 'start' | 'end'; value: string }>({ open: false, field: 'start', value: '' });
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string | null>(null);
  // Master time slots no longer needed - time is now picked via clock

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        const rawSpecialDays = await getSpecialDaysByConsultant(consultantId);
        const normalisedSpecialDays = extractArray(rawSpecialDays)
          .map((d: any): ConsultantSpecialDayRecord | null => {
            const specialDate = typeof d === 'string'
              ? d
              : (d?.specialDate || d?.special_date || d?.date || d?.slotDate || '');
            if (!specialDate) return null;
            return {
              id: typeof d === 'string' ? undefined : (Number(d?.id || 0) || undefined),
              consultantId: typeof d === 'string'
                ? consultantId
                : (Number(d?.consultantId || d?.consultant_id || consultantId) || consultantId),
              specialDate,
              durationHours: typeof d === 'string'
                ? defaultDurationHours
                : (d?.durationHours != null || d?.duration != null || d?.hours != null)
                  ? Number(d?.durationHours ?? d?.duration ?? d?.hours ?? 0)
                  : defaultDurationHours,
              status: typeof d === 'string'
                ? 'SPECIAL'
                : String(d?.status || d?.specialStatus || d?.special_booking_status || 'SPECIAL'),
              note: typeof d === 'string' ? '' : (d?.note || d?.description || d?.message || ''),
            };
          })
          .filter((d: ConsultantSpecialDayRecord | null): d is ConsultantSpecialDayRecord => !!d)
          .sort((a, b) => a.specialDate.localeCompare(b.specialDate) || a.durationHours - b.durationHours);
        setSpecialDays(normalisedSpecialDays);
      } catch {
        setSpecialDays([]);
      }

      const specialData = await getSpecialBookingsByConsultant(consultantId).catch(() => []);
      const dedicatedSpecial = extractArray(specialData).map((b: any) => {
        const dedicatedId = getDedicatedSpecialBookingId(b) ?? toPositiveNumber(b?.id);
        return {
          ...b,
          isSpecialBooking: dedicatedId != null,
          specialBookingId: dedicatedId ?? undefined,
        };
      });
      if (dedicatedSpecial.length > 0) {
        const enrichedSpecial = await Promise.all(dedicatedSpecial.map(async (b: any) => {
          const embeddedName = formatDisplayName(
            b.user?.name ||
            b.user?.fullName ||
            b.userName ||
            b.clientName ||
            b.client?.name ||
            b.client?.fullName ||
            ''
          );
          if (embeddedName && !isPlaceholderDisplayName(embeddedName)) {
            return {
              ...b,
              resolvedClientName: embeddedName,
              userName: b.userName || embeddedName,
              clientName: b.clientName || embeddedName,
              user: {
                ...(b.user || {}),
                name: b.user?.name || embeddedName,
                email: b.user?.email || b.user?.identifier || b.email || b.userEmail || '',
              },
            };
          }
          const uid = b.userId || b.user?.id || b.clientId;
          const resolvedName = uid ? await getUserDisplayName(Number(uid)) : 'Client';
          return {
            ...b,
            resolvedClientName: resolvedName,
            user: {
              ...(b.user || {}),
              id: b.user?.id || uid,
              name: resolvedName,
              email: b?.user?.email || b?.user?.identifier || b?.email || b?.userEmail || '',
            },
            userName: b.userName || resolvedName,
            clientName: b.clientName || resolvedName,
          };
        }));
        setBookings(enrichedSpecial);
      } else {
        const data = await getBookingsByConsultant(consultantId);
        const arr = extractArray(data).filter((b: any) => resolveSpecialBookingMeta(b));
        const enrichedArr = await Promise.all(arr.map(async (b: any) => {
          const embeddedName = formatDisplayName(
            b.user?.name ||
            b.user?.fullName ||
            b.userName ||
            b.clientName ||
            b.client?.name ||
            b.client?.fullName ||
            ''
          );
          if (embeddedName && !isPlaceholderDisplayName(embeddedName)) {
            return {
              ...b,
              resolvedClientName: embeddedName,
              userName: b.userName || embeddedName,
              clientName: b.clientName || embeddedName,
              user: {
                ...(b.user || {}),
                name: b.user?.name || embeddedName,
                email: b.user?.email || b.user?.identifier || b.email || b.userEmail || '',
              },
            };
          }
          const uid = b.userId || b.user?.id || b.clientId;
          const resolvedName = uid ? await getUserDisplayName(Number(uid)) : 'Client';
          return {
            ...b,
            resolvedClientName: resolvedName,
            userName: b.userName || resolvedName,
            clientName: b.clientName || resolvedName,
            user: {
              ...(b.user || {}),
              id: b.user?.id || uid,
              name: resolvedName,
              email: b?.user?.email || b?.user?.identifier || b?.email || b?.userEmail || '',
            },
          };
        }));
        setBookings(enrichedArr);
      }
    } catch (e: any) {
      setError(e?.message || 'Could not load special bookings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadBookings(); }, [consultantId]);

  const specialDaysByDate = specialDays.reduce((acc, day) => {
    if (!day.specialDate) return acc;
    if (!acc[day.specialDate]) acc[day.specialDate] = [];
    acc[day.specialDate].push(day);
    return acc;
  }, {} as Record<string, ConsultantSpecialDayRecord[]>);

  const savePublishedSpecialDay = async () => {
    if (!calendarSelectedDate) return;
    if (isDateAlreadyPublished) {
      showToast('Already published - no changes needed.', false);
      return;
    }
    setPublishingDateBusy(calendarSelectedDate);
    try {
      await publishConsultantSpecialDayDate(consultantId, calendarSelectedDate);
      // Always publish as free-flowing (no fixed duration - time is agreed with the user directly)
      saveStoredSpecialDay({
        consultantId,
        specialDate: calendarSelectedDate,
        durationHours: 0,
        status: 'SPECIAL',
      });
      showToast('Special day published. Users can now request a booking for this date.');
      await loadBookings();
    } catch (e: any) {
      showToast(e?.message || 'Failed to publish special day.', false);
    } finally {
      setPublishingDateBusy(null);
    }
  };

  const unpublishSpecialDay = async () => {
    if (!calendarSelectedDate) return;
    setUnpublishingDate(calendarSelectedDate);
    try {
      await deleteConsultantSpecialDayDate(consultantId, calendarSelectedDate);
      const existingForDate = specialDaysByDate[calendarSelectedDate] || [];
      existingForDate.forEach(day => {
        removeStoredSpecialDay(consultantId, {
          id: day.id,
          specialDate: calendarSelectedDate,
          durationHours: day.durationHours,
        });
      });
      showToast('Special day unpublished.');
      setCalendarSelectedDate(null);
      await loadBookings();
    } catch (e: any) {
      showToast(e?.message || 'Failed to unpublish special day.', false);
    } finally {
      setUnpublishingDate(null);
    }
  };

  const scheduleBooking = async (booking: any) => {
    const meta = resolveSpecialBookingMeta(booking);
    const requestedDate = form.date || meta?.preferredDate || meta?.scheduledDate || '';
    const startTime24 = form.time || meta?.preferredTime || meta?.scheduledTime || '';
    const endTime24 = form.endTime || '';
    if (!meta || !requestedDate || !startTime24 || !endTime24) return;

    // Compute hours from start→end diff (supports crossing midnight)
    const [sh, sm] = startTime24.split(':').map(Number);
    const [eh, em] = endTime24.split(':').map(Number);
    let diffMins = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMins <= 0) diffMins += 24 * 60; // overnight
    const computedHours = Math.max(1, Math.round(diffMins / 60));

    const dedicatedSpecialId =
      getDedicatedSpecialBookingId(booking) ??
      toPositiveNumber(booking?.specialBookingId) ??
      (booking?.isSpecialBooking ? toPositiveNumber(booking?.id) : null);
    const schedulingRefId = dedicatedSpecialId ?? Date.now();
    const meetingId = `meetthemasters-special-${schedulingRefId}-${Date.now()}`;
    const meetingLink = `https://meet.jit.si/${meetingId}`;
    const scheduledTimeRange = `${to12HourLabel(startTime24)} - ${to12HourLabel(endTime24)}`;
    const consultantMessage = `Consultant ${consultantName} confirmed your ${formatDurationLabel(computedHours)} session for ${requestedDate} at ${scheduledTimeRange}. Join here: ${meetingLink}`;

    try {
      if (!dedicatedSpecialId) {
        throw new Error('Special booking id missing. Please refresh and try again.');
      }
      const startTimeWithSeconds = `${startTime24.length === 5 ? `${startTime24}:00` : startTime24}`;
      try {
        await giveSlotSpecialBooking(dedicatedSpecialId, {
          date: requestedDate,
          startTime: startTimeWithSeconds,
          meetingLink,
          meetingId,
        });
      } catch (giveSlotErr: any) {
        const alreadyGiven = typeof giveSlotErr?.message === 'string' &&
          (giveSlotErr.message.toLowerCase().includes('already been given') ||
            giveSlotErr.message.toLowerCase().includes('already given') ||
            giveSlotErr.message.toLowerCase().includes('already scheduled'));
        if (!alreadyGiven) {
          try {
            await updateSpecialBooking(dedicatedSpecialId, {
              scheduledDate: requestedDate,
              scheduledTime: startTimeWithSeconds,
              scheduledTimeRange,
              numberOfSlots: computedHours,
              meetingLink,
              meetingId,
              status: 'SCHEDULED',
            });
          } catch {
            throw new Error('Could not confirm the booking with the server. Please try again or contact support.');
          }
        }
        // If already given - slot is confirmed, continue to send notification
      }

      const requestId = dedicatedSpecialId;
      const userId = booking.userId || booking.user?.id || booking.clientId;
      if (userId) {
        try {
          const key = `fin_notifs_USER_${userId}`;
          const existing = JSON.parse(localStorage.getItem(key) || '[]');
          existing.unshift({
            id: `special_booking_${requestId}_${Date.now()}`,
            type: 'success',
            title: 'Special Booking Scheduled',
            message: consultantMessage,
            bookingId: requestId,
            timestamp: new Date().toISOString(),
            read: false,
          });
          localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
        } catch { }
      }

      await sendSpecialBookingScheduledEmail({
        bookingId: requestId,
        userEmail: booking.user?.email || booking.email || booking.userEmail,
        userName: deepFindClientName(booking),
        consultantName,
        meetingMode: meta.requestedMeetingMode,
        scheduledDate: requestedDate,
        scheduledTimeRange,
        meetingLink,
        userNotes: consultantMessage,
      });

      // Also fire EmailService-backed confirmation emails - non-fatal
      const userEmailSb = booking.user?.email || booking.email || booking.userEmail || '';
      const consultantEmailSb = booking.consultantEmail || booking.advisor?.email || '';
      if (userEmailSb) {
        emailOnSpecialBookingConfirmedUser({
          to: userEmailSb,
          bookingId: requestId,
          date: requestedDate,
          time: scheduledTimeRange,
          hours: computedHours,
          meetingMode: meta.requestedMeetingMode,
          meetingLink,
          consultantEmail: consultantEmailSb,
        }).catch(() => null);
      }
      if (consultantEmailSb) {
        emailOnSpecialBookingConfirmedConsultant({
          to: consultantEmailSb,
          bookingId: requestId,
          date: requestedDate,
          time: scheduledTimeRange,
          hours: computedHours,
          meetingMode: meta.requestedMeetingMode,
          meetingLink,
          clientEmail: userEmailSb,
        }).catch(() => null);
      }

      setSchedulingBookingId(null);
      setForm({ date: '', time: '', endTime: '' });
      setTimePicker({ open: false, field: 'start', value: '' });
      showToast('✅ Special booking scheduled! User notified via email & in-app notification.');
      await loadBookings();
    } catch (e: any) {
      showToast(e?.message || 'Could not schedule this booking.', false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><img src={logoImg} alt="" style={{ width: 64, animation: 'mtmPulse 1.8s ease-in-out infinite' }} /></div>;
  }

  const requests = bookings
    .map((b: any) => ({ booking: b, meta: resolveSpecialBookingMeta(b) }))
    .filter((row: any) => !!row.meta) as Array<{ booking: any; meta: SpecialBookingMeta }>;
  const requestsByDate = requests.reduce((acc, row) => {
    const dateKey = row.meta.preferredDate || row.meta.scheduledDate || row.booking?.slotDate || row.booking?.bookingDate || '';
    if (!dateKey) return acc;
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(row);
    return acc;
  }, {} as Record<string, Array<{ booking: any; meta: SpecialBookingMeta }>>);
  const visibleRequests = calendarSelectedDate ? (requestsByDate[calendarSelectedDate] || []) : requests;
  const publishedSpecialCount = Object.keys(specialDaysByDate).length;
  const isDateAlreadyPublished = calendarSelectedDate ? (specialDaysByDate[calendarSelectedDate] || []).length > 0 : false;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const visiblePublishDays = ALL_SCHEDULE_DAYS.slice(dayOffset, dayOffset + SCHEDULE_VISIBLE);
  const maxPublishOffset = Math.max(0, ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#D97706" stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0F172A' }}>Special Bookings</h2>
          </div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Manage slot scheduling, publish special dates, and send confirmations to clients.</div>
        </div>
        <span style={{ fontSize: 12, color: '#0D9488', fontWeight: 700, padding: '8px 14px', background: '#ECFEFF', border: '1px solid #A5F3FC', borderRadius: 999 }}>
          {requests.length} request{requests.length !== 1 ? 's' : ''} · {publishedSpecialCount} published date{publishedSpecialCount !== 1 ? 's' : ''}
        </span>
      </div>
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} /> {error}
        </div>
      )}
      <div style={{ marginBottom: 18, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 20, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#0F766E', marginBottom: 6 }}>
              Special Booking Dates
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#475569' }}>
              Mark a date as a Special Day - users can request a booking for that date, and you confirm the time directly with them.
            </div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: '#FFF7ED', border: '1px solid #FCD34D', fontSize: 12, fontWeight: 700, color: '#B45309' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D97706' }} />
            Gold on user side
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <button
            disabled={dayOffset === 0}
            onClick={() => setDayOffset(offset => Math.max(0, offset - 1))}
            style={{ width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${dayOffset === 0 ? '#F1F5F9' : '#BFDBFE'}`, background: '#fff', color: dayOffset === 0 ? '#CBD5E1' : '#2563EB', cursor: dayOffset === 0 ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
            {visiblePublishDays.map(d => {
              const dayRows = requestsByDate[d.iso] || [];
              const daySpecialRows = specialDaysByDate[d.iso] || [];
              const publishedDurations = Array.from(new Set<number>(daySpecialRows.map(row => Number(row.durationHours ?? 0)))).sort((a, b) => a - b);
              const isDayFreeFlowing = daySpecialRows.length > 0 && publishedDurations.every(h => h === 0);
              const hasPublished = publishedDurations.length > 0;
              const hasRequests = dayRows.length > 0;
              const isSelected = calendarSelectedDate === d.iso;
              const isToday = d.iso === todayStr;
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => setCalendarSelectedDate(isSelected ? null : d.iso)}
                  style={{
                    flex: 1,
                    minHeight: 78,
                    borderRadius: 12,
                    border: `1.5px solid ${isSelected ? '#D97706' : hasPublished ? '#FCD34D' : '#E2E8F0'}`,
                    background: isSelected ? '#D97706' : hasPublished ? '#FFFBEB' : '#F8FAFC',
                    color: isSelected ? '#fff' : hasPublished ? '#B45309' : '#475569',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    padding: '8px 4px',
                  }}
                >
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: isSelected ? '#FDE68A' : '#94A3B8' }}>{d.wd}</span>
                  <span style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{d.day}</span>
                  {hasPublished ? (
                    <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', color: isSelected ? '#fff' : '#B45309' }}>
                      SPEC
                    </span>
                  ) : isToday ? (
                    <span style={{ fontSize: 8, fontWeight: 800, color: isSelected ? '#fff' : '#2563EB' }}>TODAY</span>
                  ) : (
                    <span style={{ fontSize: 9, color: isSelected ? '#FDE68A' : '#94A3B8' }}>{d.mon}</span>
                  )}
                  {hasRequests && (
                    <span style={{ fontSize: 8, fontWeight: 800, color: isSelected ? '#fff' : '#2563EB' }}>
                      {dayRows.length} REQ
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <button
            disabled={dayOffset >= maxPublishOffset}
            onClick={() => setDayOffset(offset => Math.min(maxPublishOffset, offset + 1))}
            style={{ width: 32, height: 32, borderRadius: '50%', border: `1.5px solid ${dayOffset >= maxPublishOffset ? '#F1F5F9' : '#BFDBFE'}`, background: '#fff', color: dayOffset >= maxPublishOffset ? '#CBD5E1' : '#2563EB', cursor: dayOffset >= maxPublishOffset ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <ArrowRight size={16} />
          </button>
        </div>

      </div>
      {requests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '68px 24px', background: 'linear-gradient(180deg,#F0FDFA,#ECFEFF)', borderRadius: 24, color: '#94A3B8', border: '1px solid #CFFAFE' }}>
          <div style={{ width: 74, height: 74, margin: '0 auto 16px', borderRadius: 24, background: 'var(--color-primary-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 18px 34px rgba(15,118,110,0.24)' }}>
            <Star size={28} color="#FFFFFF" strokeWidth={2.1} />
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: '#0F172A' }}>No special booking requests yet</p>
          <p style={{ margin: '10px auto 0', maxWidth: 360, fontSize: 13, lineHeight: 1.7, color: '#64748B' }}>
            Requests created by users will appear here for manual scheduling.
          </p>
        </div>
      ) : visibleRequests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '68px 24px', background: 'linear-gradient(180deg,#F0FDFA,#ECFEFF)', borderRadius: 24, color: '#94A3B8', border: '1px solid #CFFAFE' }}>
          <div style={{ width: 74, height: 74, margin: '0 auto 16px', borderRadius: 24, background: 'var(--color-primary-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 18px 34px rgba(15,118,110,0.24)' }}>
            <Clock size={28} color="#FFFFFF" strokeWidth={2.1} />
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 18, color: '#0F172A' }}>No special bookings on this date</p>
          <p style={{ margin: '10px auto 0', maxWidth: 360, fontSize: 13, lineHeight: 1.7, color: '#64748B' }}>
            Pick another colored day in the month view to see the requests and schedule them.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibleRequests.map(({ booking, meta }) => {
            const scheduled = isScheduledSpecialStatus(meta.status);
            const dedicatedSpecialId = getDedicatedSpecialBookingId(booking);
            const isDedicatedSpecial = dedicatedSpecialId != null;
            return (
              <div key={booking.id} style={{ background: 'linear-gradient(180deg,#FFFFFF 0%,#F0FDFA 100%)', border: '1px solid #E2E8F0', borderRadius: 20, padding: 20, boxShadow: '0 18px 34px rgba(15,23,42,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Special Booking with {deepFindClientName(booking)}</div>
                    <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                      {meta.requestedMeetingMode} · ₹{deepFindAmount(booking).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <span style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: scheduled ? '#DCFCE7' : '#FEF3C7', color: scheduled ? '#166534' : '#92400E', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {scheduled ? <CheckCircle size={13} /> : <Clock size={13} />}
                    <span>{scheduled ? '✓ Scheduled' : 'Requested'}</span>
                  </span>
                  {!scheduled && (
                    <button
                      onClick={() => {
                        setSchedulingBookingId(booking.id);
                        setForm({ date: meta.scheduledDate || meta.preferredDate || '', time: '', endTime: '' });
                        setTimePicker({ open: false, field: 'start', value: '' });
                      }}
                      title="Schedule a time slot for this booking"
                      style={{ padding: '6px 14px', borderRadius: 8, border: '1.5px solid #A5F3FC', background: '#ECFEFF', color: '#0F766E', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M23 4v6h-6" /><path d="M1 20v-6h6" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
                      Schedule
                    </button>
                  )}
                </div>
                <div style={{ marginTop: 12, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                  <strong>Requirement:</strong> {meta.requestNotes || stripSpecialBookingMeta(booking.userNotes) || 'No notes'}
                </div>
                {!scheduled && (meta.preferredDate || meta.preferredTimeRange || meta.preferredTime) && (() => {
                  const rawTime = meta.preferredTimeRange || meta.preferredTime || '';
                  const isRealRange = rawTime && /AM|PM|:/i.test(rawTime);
                  return (
                    <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 13, color: '#334155', display: 'grid', gap: 8 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Calendar size={14} /> <strong>Requested Date:</strong> <span>{meta.preferredDate || '-'}</span></div>
                      {isRealRange && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Clock size={14} /> <strong>Preferred Time:</strong> <span>{rawTime}</span></div>
                      )}
                    </div>
                  );
                })()}
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-start' }}>
                  <BookingAnswersButton
                    bookingId={!isDedicatedSpecial ? Number(booking?.id ?? 0) || undefined : undefined}
                    specialBookingId={isDedicatedSpecial ? dedicatedSpecialId ?? undefined : undefined}
                    userId={booking.userId || booking.user?.id || booking.clientId}
                    clientName={deepFindClientName(booking)}
                    bookingType={isDedicatedSpecial ? "SPECIAL" : "NORMAL"}
                  />
                </div>
                {scheduled && (
                  <div style={{ marginTop: 14, padding: '14px 16px', borderRadius: 14, background: '#F8FAFC', border: '1px solid #E2E8F0', fontSize: 13, color: '#334155', display: 'grid', gap: 8 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Calendar size={14} /> <strong>Date:</strong> <span>{meta.scheduledDate}</span></div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Clock size={14} /> <strong>Time:</strong> <span>{meta.scheduledTimeRange || meta.scheduledTime}</span></div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Link2 size={14} /> <strong>Meeting ID:</strong> <span style={{ fontFamily: 'monospace' }}>{meta.meetingId}</span></div>
                  </div>
                )}
                {!scheduled && (
                  <div style={{ marginTop: 16 }}>
                    {schedulingBookingId === booking.id ? (
                      <>
                        {/* ── Date picker - constrained to published special days ── */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                            <Calendar size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
                            Date
                            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: '#94A3B8' }}>
                              (only your published special dates)
                            </span>
                          </div>
                          {(() => {
                            const today = new Date().toISOString().split('T')[0];
                            const publishedFutureDates = Array.from(
                              new Set(specialDays.map(d => d.specialDate).filter(d => d >= today))
                            ).sort();
                            if (publishedFutureDates.length === 0) {
                              return (
                                <div style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #FDE68A', background: '#FFFBEB', color: '#92400E', fontSize: 12, fontWeight: 600 }}>
                                  No published special dates found. Go to the Special Bookings tab and publish a date first.
                                </div>
                              );
                            }
                            return (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                                {publishedFutureDates.map(dateIso => {
                                  const d = new Date(`${dateIso}T00:00:00`);
                                  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
                                  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
                                  const label = `${DAY} ${d.getDate()} ${MON}`;
                                  const isActive = form.date === dateIso;
                                  return (
                                    <button
                                      key={dateIso}
                                      type="button"
                                      onClick={() => setForm(prev => ({ ...prev, date: dateIso, time: '' }))}
                                      style={{
                                        padding: '10px 8px', borderRadius: 10, textAlign: 'center', cursor: 'pointer',
                                        border: `1.5px solid ${isActive ? '#0F766E' : '#FCD34D'}`,
                                        background: isActive ? '#0F766E' : '#FFFBEB',
                                        color: isActive ? '#fff' : '#92400E',
                                        fontSize: 12, fontWeight: isActive ? 700 : 600,
                                        transition: 'all 0.15s', fontFamily: 'inherit',
                                        boxShadow: isActive ? '0 4px 12px rgba(15,118,110,0.25)' : 'none',
                                      }}
                                    >
                                      {label}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          {form.date && (
                            <div style={{ marginTop: 6, fontSize: 11, color: '#0F766E', fontWeight: 600 }}>
                              ✓ {form.date}
                            </div>
                          )}
                        </div>

                        {/* ── From / To time pickers ── */}
                        <div style={{ marginBottom: 14 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
                            <Clock size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
                            Session Time
                            {(() => {
                              const rt = meta.preferredTimeRange || meta.preferredTime || '';
                              return rt && /AM|PM|:/i.test(rt) ? (
                                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, color: '#0F766E', background: '#ECFEFF', border: '1px solid #A5F3FC', borderRadius: 6, padding: '2px 7px' }}>
                                  User preferred: {rt}
                                </span>
                              ) : null;
                            })()}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {/* FROM */}
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>From</div>
                              <button
                                type="button"
                                onClick={() => setTimePicker({ open: true, field: 'start', value: form.time })}
                                style={{
                                  width: '100%', padding: '11px 12px', borderRadius: 10,
                                  border: `2px solid ${form.time ? '#0F766E' : '#CBD5E1'}`,
                                  background: form.time ? '#F0FDFA' : '#fff',
                                  color: form.time ? '#0F172A' : '#94A3B8',
                                  cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit',
                                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                                  transition: 'all 0.15s',
                                }}
                              >
                                <Clock size={15} color={form.time ? '#0F766E' : '#94A3B8'} />
                                <span>{form.time ? to12HourLabel(form.time) : 'Start...'}</span>
                              </button>
                            </div>
                            {/* TO */}
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>To</div>
                              <button
                                type="button"
                                onClick={() => setTimePicker({ open: true, field: 'end', value: form.endTime })}
                                style={{
                                  width: '100%', padding: '11px 12px', borderRadius: 10,
                                  border: `2px solid ${form.endTime ? '#0F766E' : '#CBD5E1'}`,
                                  background: form.endTime ? '#F0FDFA' : '#fff',
                                  color: form.endTime ? '#0F172A' : '#94A3B8',
                                  cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit',
                                  display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                                  transition: 'all 0.15s',
                                }}
                              >
                                <Clock size={15} color={form.endTime ? '#0F766E' : '#94A3B8'} />
                                <span>{form.endTime ? to12HourLabel(form.endTime) : 'End...'}</span>
                              </button>
                            </div>
                          </div>
                          {/* Duration badge + confirmation line */}
                          {form.time && form.endTime && (() => {
                            const [sh, sm] = form.time.split(':').map(Number);
                            const [eh, em] = form.endTime.split(':').map(Number);
                            let diff = (eh * 60 + em) - (sh * 60 + sm);
                            if (diff <= 0) diff += 24 * 60;
                            const hrs = Math.floor(diff / 60);
                            const mins = diff % 60;
                            const durationLabel = mins === 0 ? `${hrs} hr${hrs !== 1 ? 's' : ''}` : `${hrs}h ${mins}m`;
                            return (
                              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#0F766E', fontWeight: 600 }}>
                                <span style={{ background: '#ECFEFF', border: '1px solid #A5F3FC', borderRadius: 20, padding: '2px 10px', fontWeight: 700, fontSize: 12 }}>
                                  {durationLabel}
                                </span>
                                <span>✓ {to12HourLabel(form.time)} → {to12HourLabel(form.endTime)}</span>
                              </div>
                            );
                          })()}
                          {form.time && !form.endTime && (
                            <div style={{ marginTop: 6, fontSize: 11, color: '#94A3B8' }}>Now pick an end time →</div>
                          )}
                        </div>

                        {/* ── Confirm button ── */}
                        <button
                          onClick={() => scheduleBooking(booking)}
                          disabled={!form.date || !form.time || !form.endTime}
                          style={{
                            width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
                            background: !form.date || !form.time || !form.endTime ? '#94A3B8' : '#0F766E',
                            color: '#fff', fontWeight: 700, fontSize: 13,
                            cursor: !form.date || !form.time || !form.endTime ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            transition: 'background 0.15s',
                          }}
                        >
                          <CheckCircle size={15} />
                          Create Meeting & Confirm Booking
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSchedulingBookingId(null); setForm({ date: '', time: '', endTime: '' }); }}
                          style={{ marginTop: 8, width: '100%', padding: '9px', borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setSchedulingBookingId(booking.id);
                          setForm({ date: meta.preferredDate || meta.scheduledDate || '', time: '', endTime: '' });
                          setTimePicker({ open: false, field: 'start', value: '' });
                        }}
                        style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid #A5F3FC', background: '#ECFEFF', color: '#0F766E', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
                      >
                        <Calendar size={14} />
                        <span>Schedule Request</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <MaterialTimePicker
        isOpen={timePicker.open}
        initialTime={timePicker.value}
        onClose={() => setTimePicker(prev => ({ ...prev, open: false }))}
        onSave={(t) => {
          if (timePicker.field === 'end') {
            setForm(prev => ({ ...prev, endTime: t }));
          } else {
            setForm(prev => ({ ...prev, time: t, endTime: '' })); // reset end when start changes
          }
          setTimePicker(prev => ({ ...prev, open: false, value: t }));
        }}
      />
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
};

type ScheduleDayItem = { iso: string; wd: string; day: string; mon: string };
const SCHEDULE_DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const SCHEDULE_MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const SCHEDULE_HISTORY_DAYS = 7;
const SCHEDULE_FUTURE_DAYS = 30;
const toScheduleIsoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const toScheduleDayItem = (value: Date | string): ScheduleDayItem | null => {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return {
    iso: toScheduleIsoDate(date),
    wd: SCHEDULE_DAY_NAMES[date.getDay()],
    day: String(date.getDate()).padStart(2, '0'),
    mon: SCHEDULE_MONTH_NAMES[date.getMonth()],
  };
};
const buildScheduleDays = (startOffset: number, count: number): ScheduleDayItem[] => {
  const out: ScheduleDayItem[] = [];
  for (let i = 0; i < count; i++) {
    const date = new Date();
    date.setDate(date.getDate() + startOffset + i);
    const item = toScheduleDayItem(date);
    if (item) out.push(item);
  }
  return out;
};
const ALL_SCHEDULE_DAYS = buildScheduleDays(0, SCHEDULE_FUTURE_DAYS);
const SCHEDULE_VISIBLE = 7;
const DEFAULT_SCHEDULE_DAY = toScheduleIsoDate(new Date());

// ─────────────────────────────────────────────────────────────────────────────
// MY SCHEDULE
// ─────────────────────────────────────────────────────────────────────────────
const MySlotsView: React.FC<{
  consultantId: number;
  shiftStartTime: string;
  shiftEndTime: string;
  slotDurationMinutes: number;
}> = ({ consultantId, shiftStartTime, shiftEndTime, slotDurationMinutes }) => {
  const [dbSlots, setDbSlots] = useState<TimeSlotRecord[]>([]);
  const [masterSlots, setMasterSlots] = useState<MasterSlotOption[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>(DEFAULT_SCHEDULE_DAY);
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null);
  const [slotToast, setSlotToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [bookedSlots, setBookedSlots] = useState<{ slotDate: string; slotTime: string }[]>([]);
  const [unavailableSlots, setUnavailableSlots] = useState<{ slotDate: string; slotTime: string }[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // ── Special Day state merged from SpecialBookingsView ───────────────────────
  const [publishedSpecialDays, setPublishedSpecialDays] = useState<ConsultantSpecialDayRecord[]>([]);
  const [publishingSpecial, setPublishingSpecial] = useState(false);
  const [unpublishingSpecial, setUnpublishingSpecial] = useState(false);
  const [specialBookingRequests, setSpecialBookingRequests] = useState<any[]>([]);
  const [schedulingBookingId, setSchedulingBookingId] = useState<number | null>(null);
  const [schedForm, setSchedForm] = useState({ date: '', time: '', endTime: '' });
  const [schedTimePicker, setSchedTimePicker] = useState<{ open: boolean; field: 'start' | 'end'; value: string }>({ open: false, field: 'start', value: '' });

  const showSlotToast = (msg: string, ok = true) => {
    setSlotToast({ msg, ok });
    setTimeout(() => setSlotToast(null), 3000);
  };

  // ── Special Day helpers ──────────────────────────────────────────────────────
  const loadSpecialDays = async () => {
    try {
      const raw = await getSpecialDaysByConsultant(consultantId);
      const arr = extractArray(raw).map((d: any): ConsultantSpecialDayRecord | null => {
        const specialDate = typeof d === 'string' ? d : (d?.specialDate || d?.special_date || d?.date || d?.slotDate || '');
        if (!specialDate) return null;
        return {
          id: typeof d === 'string' ? undefined : (Number(d?.id || 0) || undefined),
          consultantId,
          specialDate,
          durationHours: typeof d === 'string' ? 0 : Number(d?.durationHours ?? d?.duration ?? d?.hours ?? 0),
          status: typeof d === 'string' ? 'SPECIAL' : String(d?.status || 'SPECIAL'),
          note: typeof d === 'string' ? '' : (d?.note || ''),
        };
      }).filter((d: ConsultantSpecialDayRecord | null): d is ConsultantSpecialDayRecord => !!d);
      setPublishedSpecialDays(arr);
      // Also load special booking requests
      const sbRaw = await getSpecialBookingsByConsultant(consultantId).catch(() => []);
      const sbArr = extractArray(sbRaw).map((b: any) => {
        const dedicatedId = getDedicatedSpecialBookingId(b) ?? toPositiveNumber(b?.id);
        return { ...b, isSpecialBooking: dedicatedId != null, specialBookingId: dedicatedId ?? undefined };
      });
      const enriched = await Promise.all(sbArr.map(async (b: any) => {
        const uid = b.userId || b.user?.id || b.clientId;
        const name = uid ? await getUserDisplayName(Number(uid)).catch(() => 'Client') : deepFindClientName(b) || 'Client';
        return { ...b, resolvedClientName: name };
      }));
      setSpecialBookingRequests(enriched.filter((b: any) => resolveSpecialBookingMeta(b)));
    } catch { /* ignore */ }
  };

  const publishAsSpecialDay = async (dateStr: string) => {
    setPublishingSpecial(true);
    try {
      await publishConsultantSpecialDayDate(consultantId, dateStr);
      saveStoredSpecialDay({ consultantId, specialDate: dateStr, durationHours: 0, status: 'SPECIAL' });
      showSlotToast('Date published as Special Day - users can now request bookings.');
      await loadSpecialDays();
    } catch (e: any) {
      showSlotToast(e?.message || 'Failed to publish special day.', false);
    } finally { setPublishingSpecial(false); }
  };

  const unpublishSpecialDay = async (dateStr: string) => {
    setUnpublishingSpecial(true);
    try {
      await deleteConsultantSpecialDayDate(consultantId, dateStr);
      const existing = publishedSpecialDays.filter(d => d.specialDate === dateStr);
      existing.forEach(d => removeStoredSpecialDay(consultantId, { id: d.id, specialDate: dateStr, durationHours: d.durationHours }));
      showSlotToast('Special day unpublished.');
      await loadSpecialDays();
    } catch (e: any) {
      showSlotToast(e?.message || 'Failed to unpublish special day.', false);
    } finally { setUnpublishingSpecial(false); }
  };

  const scheduleSpecialRequest = async (booking: any) => {
    const meta = resolveSpecialBookingMeta(booking);
    const requestedDate = schedForm.date || meta?.preferredDate || meta?.scheduledDate || '';
    const startTime24 = schedForm.time || meta?.preferredTime || meta?.scheduledTime || '';
    const endTime24 = schedForm.endTime || '';
    if (!meta || !requestedDate || !startTime24 || !endTime24) return;
    const [sh, sm] = startTime24.split(':').map(Number);
    const [eh, em] = endTime24.split(':').map(Number);
    let diffMins = (eh * 60 + em) - (sh * 60 + sm);
    if (diffMins <= 0) diffMins += 24 * 60;
    const computedHours = Math.max(1, Math.round(diffMins / 60));
    const dedicatedSpecialId = getDedicatedSpecialBookingId(booking) ?? toPositiveNumber(booking?.specialBookingId) ?? (booking?.isSpecialBooking ? toPositiveNumber(booking?.id) : null);
    if (!dedicatedSpecialId) { showSlotToast('Special booking id missing. Refresh and try again.', false); return; }
    const meetingId = `meetthemasters-special-${dedicatedSpecialId}-${Date.now()}`;
    const meetingLink = `https://meet.jit.si/${meetingId}`;
    const scheduledTimeRange = `${to12HourLabel(startTime24)} - ${to12HourLabel(endTime24)}`;
    const consultantMessage = `Your special booking session has been scheduled for ${requestedDate} at ${scheduledTimeRange}. Join: ${meetingLink}`;
    try {
      try {
        await giveSlotSpecialBooking(dedicatedSpecialId, { date: requestedDate, startTime: `${startTime24}:00`, meetingLink, meetingId });
      } catch (giveSlotErr: any) {
        const alreadyGiven = typeof giveSlotErr?.message === 'string' &&
          (giveSlotErr.message.toLowerCase().includes('already been given') ||
            giveSlotErr.message.toLowerCase().includes('already given') ||
            giveSlotErr.message.toLowerCase().includes('already scheduled'));
        if (!alreadyGiven) {
          throw new Error('Could not confirm the booking with the server. Please try again or contact support.');
        }
      }
      // ✅ Immediately flip the booking to CONFIRMED in local state so the
      //    "Schedule Request" button disappears before the full reload completes.
      setSpecialBookingRequests(prev =>
        prev.map(b =>
          (b.specialBookingId === dedicatedSpecialId || b.id === dedicatedSpecialId)
            ? { ...b, status: 'CONFIRMED', scheduledDate: requestedDate, scheduledTime: `${startTime24}:00`, scheduledTimeRange, meetingLink, meetingId }
            : b
        )
      );
      setSchedulingBookingId(null);
      setSchedForm({ date: '', time: '', endTime: '' });
      showSlotToast('Special booking confirmed! User will be notified.');

      // Fire email + reload in background - UI is already updated above
      const userId = booking.userId || booking.user?.id || booking.clientId;
      if (userId) {
        try {
          const key = `fin_notifs_USER_${userId}`;
          const existing = JSON.parse(localStorage.getItem(key) || '[]');
          existing.unshift({ id: `special_booking_${dedicatedSpecialId}_${Date.now()}`, type: 'success', title: 'Special Booking Confirmed', message: consultantMessage, bookingId: dedicatedSpecialId, timestamp: new Date().toISOString(), read: false });
          localStorage.setItem(key, JSON.stringify(existing.slice(0, 50)));
        } catch { }
      }
      try {
        await sendSpecialBookingScheduledEmail({ bookingId: dedicatedSpecialId, userEmail: booking.user?.email || booking.email || booking.userEmail, userName: deepFindClientName(booking), consultantName: '', meetingMode: meta.requestedMeetingMode, scheduledDate: requestedDate, scheduledTimeRange, meetingLink, userNotes: consultantMessage });
      } catch { /* email failure is non-fatal - booking is already confirmed */ }
      // Also fire EmailService-backed confirmation emails - non-fatal
      const userEmailSb2 = booking.user?.email || booking.email || booking.userEmail || '';
      const consultantEmailSb2 = booking.consultantEmail || booking.advisor?.email || '';
      if (userEmailSb2) {
        emailOnSpecialBookingConfirmedUser({
          to: userEmailSb2,
          bookingId: dedicatedSpecialId,
          date: requestedDate,
          time: scheduledTimeRange,
          hours: computedHours,
          meetingMode: meta.requestedMeetingMode,
          meetingLink,
          consultantEmail: consultantEmailSb2,
        }).catch(() => null);
      }
      if (consultantEmailSb2) {
        emailOnSpecialBookingConfirmedConsultant({
          to: consultantEmailSb2,
          bookingId: dedicatedSpecialId,
          date: requestedDate,
          time: scheduledTimeRange,
          hours: computedHours,
          meetingMode: meta.requestedMeetingMode,
          meetingLink,
          clientEmail: userEmailSb2,
        }).catch(() => null);
      }
      await loadSpecialDays(); // sync fresh data from backend
    } catch (e: any) {
      showSlotToast(e?.message || 'Could not schedule.', false);
    }
  };

  const sessionDurationHours = durationMinutesToHours(slotDurationMinutes, 1);
  const sessionDurationMinutes = durationHoursToMinutes(sessionDurationHours, 1);
  const masterSlotsByStart = useMemo(
    () => masterSlots.reduce((acc, slot) => {
      if (slot.start24) acc[slot.start24] = slot;
      return acc;
    }, {} as Record<string, MasterSlotOption>),
    [masterSlots]
  );
  const buildRangeLabel = (slotStart: string) =>
    masterSlotsByStart[slotStart]?.timeRange || formatTimeRangeFromInput(slotStart, sessionDurationHours);

  const handleMarkUnavailable = async (slotDate: string, slotStart: string) => {
    const key = `${slotDate}|${slotStart}`;
    setActionLoading(key);
    try {
      const existing = dbSlots.find(s => {
        if (s.slotDate !== slotDate) return false;
        const dbSlotTime = (s as any).slotTime ? String((s as any).slotTime).substring(0, 5) : '';
        if (dbSlotTime && dbSlotTime === slotStart) return true;
        const normTR = normaliseTimeKey((s.timeRange || '').split(/[--]/)[0].trim());
        return normTR === slotStart;
      });
      if (existing) {
        await apiFetch(`/timeslots/${existing.id}`, { method: 'PUT', body: JSON.stringify({ ...existing, status: 'UNAVAILABLE' }) });
      } else {
        const masterSlot = masterSlotsByStart[slotStart];
        if (!masterSlot?.id) {
          throw new Error('No backend master slot exists for this time range. Ask admin to create it first.');
        }
        await apiFetch('/timeslots', {
          method: 'POST',
          body: JSON.stringify({
            consultantId,
            slotDate,
            masterTimeSlotId: masterSlot.id,
            durationMinutes: masterSlot.duration || sessionDurationMinutes,
            status: 'UNAVAILABLE',
          })
        });
      }
      setUnavailableSlots(prev => [...prev, { slotDate, slotTime: slotStart }]);
      showSlotToast('Slot blocked');
      await loadData();
    } catch (err: any) {
      showSlotToast(`Failed to block slot: ${err.message}`, false);
    } finally { setActionLoading(null); }
  };

  const handleMarkAvailable = async (slotDate: string, slotStart: string) => {
    const key = `${slotDate}|${slotStart}`;
    setActionLoading(key);
    try {
      const existing = dbSlots.find(s => {
        if (s.slotDate !== slotDate) return false;
        const dbSlotTime = (s as any).slotTime ? String((s as any).slotTime).substring(0, 5) : '';
        if (dbSlotTime && dbSlotTime === slotStart) return true;
        const normTR = normaliseTimeKey((s.timeRange || '').split(/[--]/)[0].trim());
        return normTR === slotStart;
      });
      if (existing) {
        await apiFetch(`/timeslots/${existing.id}`, { method: 'PUT', body: JSON.stringify({ ...existing, status: 'AVAILABLE' }) });
        setUnavailableSlots(prev => prev.filter(u => !(u.slotDate === slotDate && u.slotTime === slotStart)));
        showSlotToast('Slot restored');
        await loadData();
      } else {
        showSlotToast('Slot record not found to restore.', false);
      }
    } catch (err: any) {
      showSlotToast(`Failed to restore slot: ${err.message}`, false);
    } finally { setActionLoading(null); }
  };

  const bookedSlotSet = useMemo(() => new Set(bookedSlots.map(b => `${b.slotDate}|${b.slotTime}`)), [bookedSlots]);
  const unavailSlotSet = useMemo(() => new Set(unavailableSlots.map(u => `${u.slotDate}|${u.slotTime}`)), [unavailableSlots]);

  const loadData = async () => {
    setLoading(true); setError(null);
    let slotArr: any[] = [];
    try {
      try {
        // Try consultant-specific first; fall back to all global master slots so that
        // time ranges the admin creates in the admin panel are always visible.
        let rawMasterData = await getConsultantMasterSlots(consultantId).catch(() => []);
        if (extractArray(rawMasterData).length === 0) {
          rawMasterData = await apiFetch('/master-timeslots?page=0&size=200&sortBy=id').catch(() => []);
        }
        const parsedMasterSlots = extractArray(rawMasterData)
          .map((slot: any): MasterSlotOption | null => {
            const timeRange = String(slot?.timeRange || '').trim();
            const start24 = parseRangeStartKey(timeRange);
            if (!slot?.id || !timeRange || !start24) return null;
            return {
              id: Number(slot.id),
              timeRange,
              duration: Number(slot?.duration || sessionDurationMinutes) || sessionDurationMinutes,
              start24,
              end24: parseRangeEndKey(timeRange),
            };
          })
          .filter((slot: MasterSlotOption | null): slot is MasterSlotOption => !!slot)
          // Only keep slots whose start falls inside the consultant's shift window
          .filter((slot: MasterSlotOption) => isSlotInShift(slot.start24, shiftStartTime, shiftEndTime))
          .sort((a, b) => a.start24.localeCompare(b.start24));
        setMasterSlots(parsedMasterSlots);
      } catch { setMasterSlots([]); }
      try {
        const slotData = await apiFetch(`/timeslots/consultant/${consultantId}`);
        slotArr = extractArray(slotData);
        setDbSlots(slotArr.map((s: any) => {
          const slotStart = parseSlotTimeKey(s.slotTime, s.timeRange || '');
          const fallbackRange = slotStart ? buildRangeLabel(slotStart) : '';
          return {
            ...s,
            timeRange: (s.timeRange && s.timeRange !== 'Unknown Time') ? s.timeRange : fallbackRange,
          };
        }));
      } catch { setDbSlots([]); }
      try {
        const bData = await apiFetch(`/bookings/consultant/${consultantId}`);
        const bArr = extractArray(bData);
        const token = localStorage.getItem('fin_token');
        const authH = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
        const enrichedB = await Promise.all(bArr.map(async (b: any) => {
          if (deepFindDate(b) && deepFindTime(b)) return b;
          const tsId = b.timeSlotId || b.timeslotId || b.time_slot_id || b.slotId || b.timeSlot?.id;
          if (!tsId) return b;
          try {
            const r = await fetch(buildApiUrl(`/timeslots/${tsId}`), { headers: authH });
            if (!r.ok) return b;
            const ts = await r.json();
            return { ...b, slotDate: b.slotDate || ts.slotDate || ts.date || '', bookingDate: b.bookingDate || ts.slotDate || ts.date || '', slotTime: b.slotTime || ts.slotTime || '', timeRange: b.timeRange || ts.timeRange || ts.masterTimeSlot?.timeRange || '', timeSlot: { ...(b.timeSlot || {}), ...ts } };
          } catch { return b; }
        }));
        setBookings(enrichedB);
        const mapped = enrichedB.map((b: any) => ({ slotDate: deepFindDate(b), slotTime: parseSlotTimeKey(b.slotTime, deepFindTime(b)) })).filter(b => b.slotDate && b.slotTime);
        setBookedSlots(mapped);
      } catch { setBookings([]); }
      setUnavailableSlots(slotArr.map((s: any) => ({ slotDate: s.slotDate || '', slotTime: parseSlotTimeKey(s.slotTime, s.timeRange), status: (s.status || '').toUpperCase() })).filter((s: any) => s.slotDate && s.slotTime && !['AVAILABLE', 'BOOKED'].includes(s.status)).map((s: any) => ({ slotDate: s.slotDate, slotTime: s.slotTime })));
    } catch (e: any) {
      setError(e?.message || 'Failed to load slots.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (consultantId) {
      loadData();
      loadSpecialDays();
    }
  }, [consultantId]);

  const fmtTime = (t: string) => {
    if (!t) return '-';
    const parts = t.split(':').map(Number);
    const h = parts[0]; const m = isNaN(parts[1]) ? 0 : parts[1];
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  const bookedByClientSet = new Set<string>();
  bookings.forEach(b => {
    const st = deepFindStatus(b);
    if (st === 'CANCELLED') return;
    const date = deepFindDate(b);
    if (!date) return;
    const timeKey = parseSlotTimeKey(b.slotTime, deepFindTime(b));
    if (date && timeKey) bookedByClientSet.add(`${date}|${timeKey}`);
  });
  dbSlots.forEach(s => {
    const st = (s.status || '').toUpperCase();
    if (st !== 'BOOKED') return;
    const timeKey = parseSlotTimeKey((s as any).slotTime, s.timeRange || '');
    if (s.slotDate && timeKey) bookedByClientSet.add(`${s.slotDate}|${timeKey}`);
  });

  const manuallyDisabledSet = new Set<string>();
  dbSlots.forEach(s => {
    const st = (s.status || '').toUpperCase();
    if (st === 'AVAILABLE' || st === 'BOOKED') return;
    const timeKey = parseSlotTimeKey((s as any).slotTime, s.timeRange || '');
    if (s.slotDate && timeKey && !bookedByClientSet.has(`${s.slotDate}|${timeKey}`)) {
      manuallyDisabledSet.add(`${s.slotDate}|${timeKey}`);
    }
  });

  // Only show slots that the admin has explicitly created as master time slots.
  // If no master slots exist yet, show nothing - never generate slots automatically
  // from shift times, as that produces random/static slots the admin didn't configure.
  const hourlySlotTimes = (
    masterSlots.length > 0
      ? masterSlots.map(slot => slot.start24)
      : []
  ).sort();

  const getCustomSlotsForDate = (dateStr: string): string[] => {
    const extras: string[] = [];
    dbSlots.forEach(s => {
      if (s.slotDate !== dateStr) return;
      const slotT = parseSlotTimeKey((s as any).slotTime, s.timeRange || '');
      if (slotT && !hourlySlotTimes.includes(slotT)) extras.push(slotT);
    });
    return [...new Set(extras)].sort();
  };

  const hasShift = !!(shiftStartTime && shiftEndTime && hourlySlotTimes.length > 0);
  const scheduleDays = useMemo(() => {
    const dateKeys = new Set<string>();
    const addDate = (value: string | undefined | null) => {
      if (!value) return;
      const item = toScheduleDayItem(value);
      if (item) dateKeys.add(item.iso);
    };
    buildScheduleDays(-SCHEDULE_HISTORY_DAYS, SCHEDULE_HISTORY_DAYS + SCHEDULE_FUTURE_DAYS).forEach(day => dateKeys.add(day.iso));
    publishedSpecialDays.forEach(day => addDate(day.specialDate));
    bookings.forEach(booking => addDate(deepFindDate(booking)));
    specialBookingRequests.forEach(booking => {
      const meta = resolveSpecialBookingMeta(booking);
      addDate(meta?.preferredDate || meta?.scheduledDate || deepFindDate(booking));
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from(dateKeys)
      .sort((a, b) => a.localeCompare(b))
      .map(dateKey => toScheduleDayItem(dateKey))
      .filter((day): day is ScheduleDayItem => !!day)
      .filter(day => new Date(day.iso).getTime() >= today.getTime());
  }, [bookings, publishedSpecialDays, specialBookingRequests]);
  const maxDayOffset = Math.max(0, scheduleDays.length - SCHEDULE_VISIBLE);
  const visibleDays = scheduleDays.slice(dayOffset, dayOffset + SCHEDULE_VISIBLE);
  const activeDateKey = scheduleDays.some(day => day.iso === selectedDate)
    ? selectedDate
    : (scheduleDays[0]?.iso || DEFAULT_SCHEDULE_DAY);

  useEffect(() => {
    if (scheduleDays.length === 0) return;
    if (!scheduleDays.some(day => day.iso === selectedDate)) {
      const nextDate = scheduleDays.find(day => day.iso === DEFAULT_SCHEDULE_DAY)?.iso || scheduleDays[0].iso;
      setSelectedDate(nextDate);
      return;
    }
    const selectedIndex = scheduleDays.findIndex(day => day.iso === selectedDate);
    if (selectedIndex < 0) return;
    const nextOffset = Math.max(0, Math.min(maxDayOffset, selectedIndex > 0 ? selectedIndex - 1 : 0));
    if (selectedIndex < dayOffset || selectedIndex >= dayOffset + SCHEDULE_VISIBLE) {
      setDayOffset(nextOffset);
      return;
    }
    if (dayOffset > maxDayOffset) {
      setDayOffset(maxDayOffset);
    }
  }, [dayOffset, maxDayOffset, scheduleDays, selectedDate]);

  // ── Special day helpers ──────────────────────────────────────────────────────
  const publishedSpecialDaySet = useMemo(
    () => new Set(publishedSpecialDays.map(d => d.specialDate)),
    [publishedSpecialDays]
  );
  const isSelectedDateSpecial = publishedSpecialDaySet.has(activeDateKey);
  const specialRequestsForDate = specialBookingRequests.filter(b => {
    const meta = resolveSpecialBookingMeta(b);
    const dateKey = meta?.preferredDate || meta?.scheduledDate || deepFindDate(b) || '';
    return dateKey === activeDateKey;
  });

  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Avoid carrying a previous date's selected slots into the current date.
    setSelectedSlots(new Set());
  }, [activeDateKey]);

  let totalCount = 0, availableCount = 0, bookedCount = 0;
  if (hasShift) {
    visibleDays.forEach(d => {
      hourlySlotTimes.forEach(t => {
        totalCount++;
        const key = `${d.iso}|${t}`;
        if (bookedSlotSet.has(key) || unavailSlotSet.has(key) || bookedByClientSet.has(key) || manuallyDisabledSet.has(key)) bookedCount++;
        else availableCount++;
      });
    });
  }

  const handleBulkStatusChange = async (targetStatus: 'AVAILABLE' | 'UNAVAILABLE') => {
    if (selectedSlots.size === 0) return;
    const selectedKeys = Array.from(selectedSlots);
    const actionableKeys = selectedKeys.filter((key) => {
      const isCurrentlyUnavailable = unavailSlotSet.has(key) || manuallyDisabledSet.has(key);
      return targetStatus === 'AVAILABLE' ? isCurrentlyUnavailable : !isCurrentlyUnavailable;
    });
    if (actionableKeys.length === 0) {
      showSlotToast(
        targetStatus === 'AVAILABLE'
          ? 'All selected slots are already available.'
          : 'All selected slots are already blocked.'
      );
      return;
    }

    setLoading(true);
    try {
      const slotsToUpdate = actionableKeys.map(key => {
        const [date, time] = key.split('|');
        const existing = dbSlots.find(s => {
          if (s.slotDate !== date) return false;
          const dbSlotTime = (s as any).slotTime ? String((s as any).slotTime).substring(0, 5) : '';
          if (dbSlotTime && dbSlotTime === time) return true;
          const normTR = normaliseTimeKey((s.timeRange || '').split(/[--]/)[0].trim());
          if (normTR && normTR === time) return true;
          return false;
        });
        return { key, existing, date, time };
      });

      for (const item of slotsToUpdate) {
        if (item.existing) {
          await apiFetch(`/timeslots/${item.existing.id}`, { method: 'PUT', body: JSON.stringify({ ...item.existing, status: targetStatus }) });
        } else {
          if (targetStatus === 'AVAILABLE') continue;
          const masterSlot = masterSlotsByStart[item.time];
          if (masterSlot?.id) {
            await apiFetch('/timeslots', {
              method: 'POST',
              body: JSON.stringify({
                consultantId,
                slotDate: item.date,
                masterTimeSlotId: masterSlot.id,
                durationMinutes: masterSlot.duration || sessionDurationMinutes,
                status: targetStatus,
              })
            });
          }
        }
      }
      showSlotToast(`Updated ${actionableKeys.length} slots to ${targetStatus.toLowerCase()}.`);
      setSelectedSlots(new Set());
      await loadData();
    } catch (e: any) {
      showSlotToast(e?.message || 'Failed to update some slots.', false);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSlot = async (slotStart: string) => {
    const key = `${activeDateKey}|${slotStart}`;
    if (bookedByClientSet.has(key)) {
      showSlotToast('This slot is booked by a client and cannot be changed.', false);
      return;
    }
    setTogglingSlot(key);
    const isCurrentlyUnavailable = manuallyDisabledSet.has(key);
    const newStatus = isCurrentlyUnavailable ? 'AVAILABLE' : 'UNAVAILABLE';
    try {
      const existing = dbSlots.find(s => {
        if (s.slotDate !== activeDateKey) return false;
        const dbSlotTime = (s as any).slotTime ? String((s as any).slotTime).substring(0, 5) : '';
        if (dbSlotTime && dbSlotTime === slotStart) return true;
        const normTR = normaliseTimeKey((s.timeRange || '').split(/[--]/)[0].trim());
        if (normTR && normTR === slotStart) return true;
        return false;
      });
      if (existing) {
        await apiFetch(`/timeslots/${existing.id}`, { method: 'PUT', body: JSON.stringify({ ...existing, status: newStatus }) });
      } else {
        const masterSlot = masterSlotsByStart[slotStart];
        if (!masterSlot?.id) {
          throw new Error('No backend master slot exists for this time range. Ask admin to create it first.');
        }
        await apiFetch('/timeslots', {
          method: 'POST',
          body: JSON.stringify({
            consultantId,
            slotDate: activeDateKey,
            masterTimeSlotId: masterSlot.id,
            durationMinutes: masterSlot.duration || sessionDurationMinutes,
            status: newStatus,
          })
        });
      }
      showSlotToast(newStatus === 'AVAILABLE' ? 'Slot marked as available' : 'Slot marked as unavailable');
      await loadData();
    } catch (e: any) {
      showSlotToast(e?.message || 'Failed to update slot.', false);
    } finally { setTogglingSlot(null); }
  };

  const allSlotTimes = [...hourlySlotTimes];
  const selectedKeys = Array.from(selectedSlots);
  const selectedUnavailableCount = selectedKeys.filter((key) => unavailSlotSet.has(key) || manuallyDisabledSet.has(key)).length;
  const selectedAvailableCount = selectedKeys.length - selectedUnavailableCount;

  const renderSlotButton = (slotDate: string, slotStart: string) => {
    const key = `${slotDate}|${slotStart}`;
    const isBooked = bookedSlotSet.has(key) || bookedByClientSet.has(key);
    const isUnavail = !isBooked && (unavailSlotSet.has(key) || manuallyDisabledSet.has(key));
    const isLoading = actionLoading === key || togglingSlot === key;
    const label = buildRangeLabel(slotStart);

    if (isBooked) {
      return (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ padding: '10px 6px', borderRadius: 100, background: '#0F766E', border: '1.5px solid #0D9488', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>{label}</span>
            <span style={{ fontSize: 8, fontWeight: 800, color: 'rgba(255,255,255,0.85)', letterSpacing: '0.08em' }}>BOOKED</span>
          </div>
        </div>
      );
    }
    if (isUnavail) {
      return (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ padding: '10px 6px', borderRadius: 100, background: '#FEE2E2', border: '1.5px solid #FCA5A5', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#DC2626' }}>{label}</span>
            <span style={{ fontSize: 8, fontWeight: 800, color: '#DC2626', letterSpacing: '0.08em' }}>UNAVAILABLE</span>
          </div>
          <button onClick={() => handleMarkAvailable(slotDate, slotStart)} disabled={isLoading} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #86EFAC', background: '#F0FDF4', color: '#15803D', fontSize: 9, fontWeight: 700, cursor: isLoading ? 'default' : 'pointer', fontFamily: 'inherit', width: '100%', opacity: isLoading ? 0.6 : 1 }}>
            {isLoading ? '...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle size={11} /> Restore</span>}
          </button>
        </div>
      );
    }
    return (
      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ padding: '10px 6px', borderRadius: 100, background: '#fff', border: '1.5px solid #A5F3FC', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{label}</span>
        </div>
        <button onClick={() => handleMarkUnavailable(slotDate, slotStart)} disabled={isLoading} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #FBBF24', background: '#FFFBEB', color: '#92400E', fontSize: 9, fontWeight: 700, cursor: isLoading ? 'default' : 'pointer', fontFamily: 'inherit', width: '100%', opacity: isLoading ? 0.6 : 1 }}>
          {isLoading ? '...' : 'Block'}
        </button>
      </div>
    );
  };

  return (
    <div className="advisor-content-container">
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {error}</span>
          <button onClick={loadData} style={{ marginLeft: 'auto', padding: '4px 12px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', float: 'right' }}>Retry</button>
        </div>
      )}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
          <img src={logoImg} alt="Meet The Masters" style={{ width: 64, height: 'auto', animation: 'mtmPulse 1.8s ease-in-out infinite' }} />
        </div>
      ) : !hasShift && allSlotTimes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: 14, color: '#94A3B8' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}><Calendar size={40} color="#CBD5E1" strokeWidth={1.7} /></div>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#64748B', fontSize: 15 }}>Shift timings not set</p>
          <p style={{ margin: 0, fontSize: 13 }}>Go to Profile tab and set Shift Start &amp; End.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1 }}>
              {[
                { label: 'Total (7 days)', value: totalCount, color: '#0F766E', bg: '#ECFEFF' },
                { label: 'Available', value: availableCount, color: '#16A34A', bg: '#F0FDF4' },
                { label: 'Unavailable', value: bookedCount, color: '#64748B', bg: '#F1F5F9' },
                { label: 'Special Days', value: publishedSpecialDays.length, color: '#D97706', bg: '#FFFBEB' },
              ].map(c => (
                <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}22`, borderRadius: 10, padding: '10px 18px', minWidth: 100 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{c.label}</div>
                </div>
              ))}
            </div>
            <button onClick={() => { loadData(); loadSpecialDays(); }} style={{ padding: '8px 16px', background: '#ECFEFF', color: '#0F766E', border: '1px solid #A5F3FC', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
              Refresh
            </button>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(15,118,110,0.12)' }}>
            <div style={{ background: 'var(--portal-profile-gradient)', padding: '20px 24px 18px' }}>
              <p style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#99F6E4', margin: '0 0 4px', fontWeight: 700 }}>My Schedule</p>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>My Schedule Slots</h3>
              <p style={{ fontSize: 13, color: '#A5F3FC', margin: 0 }}>
                {shiftStartTime ? `Shift: ${fmtTime(shiftStartTime)} to ${fmtTime(shiftEndTime)}` : 'Configure your shift in Profile tab'}
                {hasShift && <span style={{ marginLeft: 10, fontSize: 12, color: '#2DD4BF' }}>· {hourlySlotTimes.length} slots/day · {sessionDurationHours} hr sessions</span>}
              </p>
            </div>

            {/* ── Step 1: Date Selection ── */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 12px' }}>Step 1 - Select Date</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button disabled={dayOffset === 0} onClick={() => setDayOffset(o => Math.max(0, o - 1))} style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, border: `1.5px solid ${dayOffset === 0 ? '#F1F5F9' : '#A5F3FC'}`, background: '#fff', cursor: dayOffset === 0 ? 'default' : 'pointer', color: dayOffset === 0 ? '#CBD5E1' : '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowLeft size={16} /></button>
                <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                  {visibleDays.map(d => {
                    const isActive = d.iso === activeDateKey;
                    const isToday = d.iso === DEFAULT_SCHEDULE_DAY;
                    const isSpecial = publishedSpecialDaySet.has(d.iso);
                    const reqCount = specialBookingRequests.filter(b => {
                      const meta = resolveSpecialBookingMeta(b);
                      const dk = meta?.preferredDate || meta?.scheduledDate || deepFindDate(b) || '';
                      return dk === d.iso;
                    }).length;
                    return (
                      <button key={d.iso} onClick={() => setSelectedDate(d.iso)} style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        padding: '8px 4px', borderRadius: 10, gap: 2, minHeight: 72,
                        border: `1.5px solid ${isActive ? (isSpecial ? '#D97706' : '#0F766E') : isSpecial ? '#FCD34D' : '#E2E8F0'}`,
                        background: isActive ? (isSpecial ? '#D97706' : '#0F766E') : isSpecial ? '#FFFBEB' : '#F8FAFC',
                        cursor: 'pointer', fontFamily: 'inherit', outline: 'none', transition: 'all 0.2s',
                      }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: isActive ? (isSpecial ? '#FDE68A' : '#A5F3FC') : '#94A3B8' }}>{d.wd}</span>
                        <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1, color: isActive ? '#fff' : isSpecial ? '#92400E' : '#0F172A' }}>{d.day}</span>
                        {isSpecial ? (
                          <span style={{ fontSize: 8, fontWeight: 800, color: isActive ? '#fff' : '#D97706' }}>SPEC</span>
                        ) : isToday && !isActive ? (
                          <span style={{ fontSize: 8, fontWeight: 800, color: '#0F766E', background: '#ECFEFF', padding: '1px 4px', borderRadius: 4 }}>TODAY</span>
                        ) : (
                          <span style={{ fontSize: 9, color: isActive ? '#A5F3FC' : '#94A3B8' }}>{d.mon}</span>
                        )}
                        {reqCount > 0 && (
                          <span style={{ fontSize: 8, fontWeight: 800, color: isActive ? '#fff' : '#2563EB' }}>{reqCount} REQ</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button disabled={dayOffset >= maxDayOffset} onClick={() => setDayOffset(o => Math.min(maxDayOffset, o + 1))} style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, border: `1.5px solid ${dayOffset >= maxDayOffset ? '#F1F5F9' : '#A5F3FC'}`, background: '#fff', cursor: dayOffset >= maxDayOffset ? 'default' : 'pointer', color: dayOffset >= maxDayOffset ? '#CBD5E1' : '#0F766E', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ArrowRight size={16} /></button>
              </div>

              {/* ── Publish as Special Day section ── */}
              <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 12, background: isSelectedDateSpecial ? 'linear-gradient(135deg,#FFFBEB,#FEF3C7)' : '#F8FAFC', border: `1px solid ${isSelectedDateSpecial ? '#FCD34D' : '#E2E8F0'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: isSelectedDateSpecial ? '#92400E' : '#475569', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={isSelectedDateSpecial ? '#D97706' : '#94A3B8'} stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>
                      {isSelectedDateSpecial ? 'Published as Special Day' : 'Special Day'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      {isSelectedDateSpecial
                        ? 'Users can request a booking for this date. All regular slots are suspended.'
                        : 'Mark this date as a Special Day - users can request bookings and you confirm the time directly.'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {isSelectedDateSpecial ? (
                      <>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, background: '#D97706', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                          <CheckCircle size={13} /> Active
                        </span>
                        <button
                          onClick={() => unpublishSpecialDay(activeDateKey)}
                          disabled={unpublishingSpecial}
                          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #FECACA', background: '#fff', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: unpublishingSpecial ? 0.6 : 1 }}
                        >
                          {unpublishingSpecial ? '...' : 'Unpublish'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => publishAsSpecialDay(activeDateKey)}
                        disabled={publishingSpecial}
                        style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: publishingSpecial ? '#E2E8F0' : 'linear-gradient(135deg,#D97706,#B45309)', color: publishingSpecial ? '#94A3B8' : '#fff', fontSize: 13, fontWeight: 700, cursor: publishingSpecial ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>
                        {publishingSpecial ? 'Publishing...' : 'Publish as Special Day'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Step 2: Time Slots ── */}
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 10px' }}>Step 2 - Select Time</p>
              {isSelectedDateSpecial ? (
                /* ── Special day: all slots suspended, show requests panel ── */
                <div>
                  <div style={{ padding: '14px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', border: '1px solid #FCD34D', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#D97706" stroke="none"><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>
                      <span style={{ fontWeight: 800, fontSize: 13, color: '#92400E' }}>Special Booking Day Active</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#B45309', lineHeight: 1.6 }}>
                      All regular time slots for this date are suspended. Users can only send special booking requests, and you confirm the meeting time directly with them.
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 12, opacity: 0.4, pointerEvents: 'none' }}>
                      {allSlotTimes.slice(0, 3).map(slotStart => (
                        <div key={slotStart} style={{ padding: '10px 6px', borderRadius: 100, background: '#F1F5F9', border: '1.5px solid #E2E8F0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>{buildRangeLabel(slotStart)}</span>
                          <span style={{ fontSize: 8, fontWeight: 800, color: '#CBD5E1', letterSpacing: '0.08em' }}>SUSPENDED</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Special Booking Requests for this date ── */}
                  {specialRequestsForDate.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#D97706', marginBottom: 12 }}>
                        {specialRequestsForDate.length} Special Request{specialRequestsForDate.length !== 1 ? 's' : ''} for this Date
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {specialRequestsForDate.map((booking: any) => {
                          const meta = resolveSpecialBookingMeta(booking);
                          if (!meta) return null;
                          const clientName = booking.resolvedClientName || deepFindClientName(booking);
                          const isScheduling = schedulingBookingId === (booking.specialBookingId || booking.id);
                          const isScheduled = isScheduledSpecialStatus(meta.status);
                          return (
                            <div key={booking.id} style={{ background: isScheduled ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${isScheduled ? '#86EFAC' : '#FCD34D'}`, borderRadius: 14, padding: '16px 18px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: isScheduled ? 0 : 10 }}>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', marginBottom: 3 }}>Special Booking with {clientName}</div>
                                  <div style={{ fontSize: 12, color: '#64748B', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    <span>{meta.requestedMeetingMode} · ₹{Number(booking.totalAmount || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                  {meta.requestNotes && (
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#475569', background: '#fff', borderRadius: 8, padding: '8px 12px', border: '1px solid #E2E8F0', maxWidth: 400 }}>
                                      <strong>Requirement:</strong> {meta.requestNotes}
                                    </div>
                                  )}
                                  {isScheduled && (
                                    <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: 'linear-gradient(135deg,#F0FDF4,#DCFCE7)', border: '1.5px solid #86EFAC' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: '#166534', letterSpacing: '0.04em' }}>Booking Confirmed</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 12, background: '#fff', color: '#166534', border: '1px solid #86EFAC', borderRadius: 8, padding: '4px 12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                                          📅 {meta.scheduledDate || booking.scheduledDate || '-'}
                                        </span>
                                        {(meta.scheduledTimeRange || booking.scheduledTimeRange || booking.scheduledTime) && (
                                          <span style={{ fontSize: 12, background: '#fff', color: '#0F766E', border: '1px solid #A5F3FC', borderRadius: 8, padding: '4px 12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                                            🕐 {meta.scheduledTimeRange || booking.scheduledTimeRange || booking.scheduledTime}
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {!isScheduled && meta.preferredDate && (
                                    <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, background: '#FFF7ED', color: '#C2410C', border: '1px solid #FDBA74', borderRadius: 8, padding: '4px 10px' }}>
                                      📅 Requested Date: {meta.preferredDate}
                                    </div>
                                  )}
                                </div>
                                <span style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: isScheduled ? '#DCFCE7' : '#FEF3C7', color: isScheduled ? '#166534' : '#B45309', border: `1px solid ${isScheduled ? '#86EFAC' : '#FCD34D'}`, whiteSpace: 'nowrap' }}>
                                  {isScheduled ? '✓ Confirmed' : '⏳ Requested'}
                                </span>
                              </div>
                              {!isScheduled && (
                                isScheduling ? (
                                  <div style={{ padding: '14px 16px', borderRadius: 12, background: '#F8FAFC', border: '1px solid #E2E8F0', marginTop: 10 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#0F766E', marginBottom: 10 }}>Schedule this request</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                                      <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>Date</div>
                                        <input type="date" value={schedForm.date || meta.preferredDate || ''} onChange={e => setSchedForm(f => ({ ...f, date: e.target.value }))} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #A5F3FC', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>Start Time</div>
                                        <button type="button" onClick={() => setSchedTimePicker({ open: true, field: 'start', value: schedForm.time || '' })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #A5F3FC', fontSize: 13, fontFamily: 'inherit', background: '#fff', textAlign: 'left', cursor: 'pointer' }}>
                                          {schedForm.time ? to12HourLabel(schedForm.time) : 'Pick start time'}
                                        </button>
                                      </div>
                                      <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: '#64748B', marginBottom: 4, textTransform: 'uppercase' }}>End Time</div>
                                        <button type="button" onClick={() => setSchedTimePicker({ open: true, field: 'end', value: schedForm.endTime || '' })} style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #A5F3FC', fontSize: 13, fontFamily: 'inherit', background: '#fff', textAlign: 'left', cursor: 'pointer' }}>
                                          {schedForm.endTime ? to12HourLabel(schedForm.endTime) : 'Pick end time'}
                                        </button>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <button
                                        onClick={() => scheduleSpecialRequest(booking)}
                                        disabled={!schedForm.date || !schedForm.time || !schedForm.endTime}
                                        style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', background: (!schedForm.date || !schedForm.time || !schedForm.endTime) ? '#E2E8F0' : '#0F766E', color: (!schedForm.date || !schedForm.time || !schedForm.endTime) ? '#94A3B8' : '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                                      >
                                        Confirm & Send Email
                                      </button>
                                      <button onClick={() => { setSchedulingBookingId(null); setSchedForm({ date: '', time: '', endTime: '' }); }} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setSchedulingBookingId(booking.specialBookingId || booking.id); setSchedForm({ date: meta.preferredDate || '', time: meta.preferredTime || '', endTime: '' }); }}
                                    style={{ padding: '8px 18px', borderRadius: 9, border: '1px solid #A5F3FC', background: '#ECFEFF', color: '#0F766E', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                                  >
                                    <CalendarIcon size={13} color="#0F766E" /> Schedule Request
                                  </button>
                                )
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {specialRequestsForDate.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '20px', color: '#94A3B8', fontSize: 13 }}>
                      No booking requests yet for this date. Users will see it highlighted on their side.
                    </div>
                  )}
                </div>
              ) : allSlotTimes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 20px', color: '#94A3B8', fontSize: 13 }}>No slots for this date.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {[{ label: 'Available', bg: '#fff', border: '#A5F3FC' }, { label: 'Booked', bg: '#0F766E', border: '#0D9488' }, { label: 'Unavailable', bg: '#FEE2E2', border: '#FCA5A5' }].map(l => (
                        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 13, height: 13, borderRadius: 3, background: l.bg, border: `1.5px solid ${l.border}` }} />
                          <span style={{ fontSize: 11, color: '#64748B' }}>{l.label}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => {
                          const allAvailable = allSlotTimes.filter(t => !bookedSlotSet.has(`${activeDateKey}|${t}`) && !bookedByClientSet.has(`${activeDateKey}|${t}`));
                          if (selectedSlots.size === allAvailable.length) {
                            setSelectedSlots(new Set());
                          } else {
                            setSelectedSlots(new Set(allAvailable.map(t => `${activeDateKey}|${t}`)));
                          }
                        }}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                      >
                        {selectedSlots.size > 0 ? `Deselect All (${selectedSlots.size})` : 'Select All'}
                      </button>
                      {selectedSlots.size > 0 && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button
                            onClick={() => handleBulkStatusChange('AVAILABLE')}
                            disabled={selectedUnavailableCount === 0}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: selectedUnavailableCount === 0 ? '#E2E8F0' : '#16A34A',
                              color: selectedUnavailableCount === 0 ? '#94A3B8' : '#fff',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: selectedUnavailableCount === 0 ? 'default' : 'pointer'
                            }}
                          >
                            Make Available
                          </button>
                          <button
                            onClick={() => handleBulkStatusChange('UNAVAILABLE')}
                            disabled={selectedAvailableCount === 0}
                            style={{
                              padding: '6px 12px',
                              borderRadius: 8,
                              border: 'none',
                              background: selectedAvailableCount === 0 ? '#E2E8F0' : '#DC2626',
                              color: selectedAvailableCount === 0 ? '#94A3B8' : '#fff',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: selectedAvailableCount === 0 ? 'default' : 'pointer'
                            }}
                          >
                            Block All
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {allSlotTimes.map(slotStart => {
                      const key = `${activeDateKey}|${slotStart}`;
                      const isSelectable = !bookedSlotSet.has(key) && !bookedByClientSet.has(key);
                      return (
                        <div key={key} style={{ position: 'relative' }}>
                          {isSelectable && (
                            <input
                              type="checkbox"
                              checked={selectedSlots.has(key)}
                              onChange={(e) => {
                                const next = new Set(selectedSlots);
                                if (e.target.checked) next.add(key);
                                else next.delete(key);
                                setSelectedSlots(next);
                              }}
                              style={{ position: 'absolute', top: 10, right: 10, zIndex: 5, width: 16, height: 16, cursor: 'pointer', accentColor: '#0F766E' }}
                            />
                          )}
                          {renderSlotButton(activeDateKey, slotStart)}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      <MaterialTimePicker
        isOpen={schedTimePicker.open}
        initialTime={schedTimePicker.value}
        onClose={() => setSchedTimePicker(p => ({ ...p, open: false }))}
        onSave={(t) => {
          if (schedTimePicker.field === 'start') setSchedForm(f => ({ ...f, time: t }));
          else setSchedForm(f => ({ ...f, endTime: t }));
          setSchedTimePicker(p => ({ ...p, open: false }));
        }}
      />

      {slotToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: slotToast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8 }}>
          {slotToast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {slotToast.msg}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACKS VIEW
// ─────────────────────────────────────────────────────────────────────────────
const StarDisplay: React.FC<{ rating: number; size?: number }> = ({ rating, size = 16 }) => (
  <div style={{ display: 'flex', gap: 2 }}>
    {[1, 2, 3, 4, 5].map(s => (
      <svg key={s} width={size} height={size} viewBox="0 0 24 24" fill={s <= rating ? '#F59E0B' : '#E2E8F0'} stroke={s <= rating ? '#D97706' : '#CBD5E1'} strokeWidth="1.5">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ))}
  </div>
);

const ratingLabel = (r: number) => ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][r] || '';

const FeedbacksView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterRating, setFilterRating] = useState<number>(0);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BOOKING' | 'TICKET'>('ALL');

  const loadFeedbacks = async () => {
    setLoading(true); setError(null);
    try {
      const [fData, tData] = await Promise.all([
        apiFetch(`/feedbacks/consultant/${consultantId}`),
        getTicketsByConsultant(consultantId)
      ]);
      const sessionArr = extractArray(fData);
      const ticketArr = extractArray(tData);

      let bookingMap: Record<number, { clientName: string; slotDate: string; timeRange: string }> = {};
      try {
        const bData = await apiFetch(`/bookings/consultant/${consultantId}`);
        const bArr = extractArray(bData);
        bArr.forEach((b: any) => {
          bookingMap[b.id] = { clientName: deepFindClientName(b), slotDate: deepFindDate(b), timeRange: deepFindTime(b) };
        });
      } catch { }

      const enrichedSessions: FeedbackItem[] = await Promise.all(sessionArr.map(async (f: any) => {
        const ctx = f.bookingId ? bookingMap[f.bookingId] : undefined;
        let clientName = '';
        const namingFields = [
          (f as any).user?.name, (f as any).user?.fullName, (f as any).user?.displayName,
          (f as any).userName, (f as any).clientName
        ];
        const directName = namingFields.find(n => n && !isPlaceholderDisplayName(formatDisplayName(n)));
        if (directName) clientName = formatDisplayName(directName);
        if (!clientName && f.userId) clientName = await getUserDisplayName(Number(f.userId));
        if (!clientName && ctx?.clientName) clientName = formatDisplayName(ctx.clientName);
        if (!clientName) clientName = 'Client';

        return {
          ...f,
          category: 'BOOKING',
          rating: Number(f.rating || 0),
          clientName,
          slotDate: ctx?.slotDate || f.createdAt?.split('T')[0] || '',
          timeRange: ctx?.timeRange || '',
        };
      }));

      const ticketFeedbacks: FeedbackItem[] = ticketArr
        .filter((t: any) => t.feedbackRating && t.feedbackRating > 0)
        .map((t: any) => ({
          id: t.id + 1000000,
          rating: Number(t.feedbackRating || 0),
          comments: t.feedbackText,
          ticketId: t.id,
          category: 'TICKET',
          clientName: formatDisplayName(t.user?.name || t.user?.fullName || t.clientName || t.userName || 'Client'),
          slotDate: t.updatedAt?.split('T')[0] || t.createdAt?.split('T')[0] || '',
          timeRange: '',
          createdAt: t.createdAt
        }));

      const combined = [...enrichedSessions, ...ticketFeedbacks];
      combined.sort((a, b) => {
        const dateA = a.createdAt || a.slotDate || '';
        const dateB = b.createdAt || b.slotDate || '';
        return dateB.localeCompare(dateA);
      });
      setFeedbacks(combined);
    } catch (e: any) {
      setError(e?.message || 'Failed to load feedbacks.');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (consultantId) loadFeedbacks(); }, [consultantId]);

  const displayed = feedbacks.filter(f => {
    const matchesRating = filterRating === 0 || Math.round(f.rating) === filterRating;
    const matchesType = typeFilter === 'ALL' || f.category === typeFilter;
    return matchesRating && matchesType;
  });

  const avgRating = feedbacks.length > 0 ? (feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1) : '-';
  const ratingCounts = [5, 4, 3, 2, 1].map(r => ({ r, count: feedbacks.filter(f => Math.round(f.rating) === r).length }));

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>Client Feedbacks</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#64748B' }}>{feedbacks.length} review{feedbacks.length !== 1 ? 's' : ''}</span>
          <button onClick={loadFeedbacks} style={{ padding: '7px 16px', background: '#ECFEFF', color: '#0F766E', border: '1px solid #A5F3FC', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>🔄 Refresh</button>
        </div>
      </div>
      {feedbacks.length > 0 && (
        <div style={{ background: 'var(--portal-profile-gradient)', borderRadius: 16, padding: '22px 24px', marginBottom: 24, display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap', color: '#fff' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: '#FCD34D' }}>{avgRating}</div>
            <StarDisplay rating={Math.round(Number(avgRating))} size={18} />
            <div style={{ fontSize: 12, color: '#99F6E4', marginTop: 4 }}>Overall</div>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            {ratingCounts.map(({ r, count }) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#A5F3FC', width: 6 }}>{r}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B" strokeWidth="0"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${feedbacks.length ? (count / feedbacks.length) * 100 : 0}%`, height: '100%', background: '#FCD34D', borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, color: '#99F6E4', width: 20, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700 }}>{feedbacks.length}</div><div style={{ fontSize: 12, color: '#99F6E4' }}>Total</div></div>
        </div>
      )}
      {feedbacks.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 5, 4, 3, 2, 1].map(r => (
              <button key={r} onClick={() => setFilterRating(r)} style={{ padding: '6px 12px', borderRadius: 20, border: '1.5px solid', borderColor: filterRating === r ? '#0F766E' : '#E2E8F0', background: filterRating === r ? '#0F766E' : '#fff', color: filterRating === r ? '#fff' : '#64748B', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                {r === 0 ? `All (${feedbacks.length})` : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{r}<Star size={11} fill="currentColor" stroke="none" /></span>}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 20, background: '#E2E8F0' }} />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            style={{ padding: '6px 12px', borderRadius: 10, border: '1.5px solid #CFFAFE', fontSize: 12, fontWeight: 600, color: '#0F766E', outline: 'none', background: '#fff', cursor: 'pointer' }}
          >
            <option value="ALL">Overall Feedback</option>
            <option value="BOOKING">Booking Reviews</option>
            <option value="TICKET">Ticket Reviews</option>
          </select>
        </div>
      )}
      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {error}</div>}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
          <img src={logoImg} alt="Meet The Masters" style={{ width: 64, height: 'auto', animation: 'mtmPulse 1.8s ease-in-out infinite' }} />
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: 16, color: '#94A3B8' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><Star size={40} color="#CBD5E1" strokeWidth={1.8} /></div>
          <p style={{ margin: 0, fontWeight: 600 }}>{feedbacks.length === 0 ? 'No feedbacks yet.' : `No ${filterRating}-star ${typeFilter !== 'ALL' ? typeFilter.toLowerCase() : ''} reviews.`}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {displayed.map(fb => (
            <div key={fb.id} style={{ background: '#fff', border: '1px solid #F1F5F9', borderLeft: `4px solid ${fb.rating >= 4 ? '#86EFAC' : fb.rating >= 3 ? '#FCD34D' : '#FCA5A5'}`, borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--color-primary-gradient)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, flexShrink: 0 }}>
                  {(fb.clientName || 'A').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{fb.clientName}</span>
                    <StarDisplay rating={Math.round(fb.rating)} size={15} />
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: fb.rating >= 4 ? '#F0FDF4' : fb.rating >= 3 ? '#FFFBEB' : '#FEF2F2', color: fb.rating >= 4 ? '#16A34A' : fb.rating >= 3 ? '#D97706' : '#EF4444' }}>
                      {ratingLabel(Math.round(fb.rating))}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: fb.category === 'TICKET' ? '#FEF2F2' : '#ECFEFF', color: fb.category === 'TICKET' ? '#B91C1C' : '#0F766E', border: '1px solid currentColor', letterSpacing: '0.04em' }}>
                      {fb.category === 'TICKET' ? 'TICKET FEEDBACK' : 'SESSION REVIEW'}
                    </span>
                    <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700 }}>#{fb.ticketId || fb.bookingId}</span>
                  </div>
                  {(fb.slotDate || fb.timeRange) && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      {fb.slotDate && (
                        <span style={{ fontSize: 12, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <CalendarIcon size={12} color="#64748B" />
                          {fb.slotDate}
                        </span>
                      )}
                      {fb.timeRange && <span style={{ fontSize: 12, fontWeight: 700, color: '#0F766E', background: '#ECFEFF', border: '1px solid #A5F3FC', padding: '2px 10px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 5 }}><Clock size={12} /> {fb.timeRange}</span>}
                    </div>
                  )}
                  {fb.comments ? <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.65, background: '#F8FAFC', borderRadius: 10, padding: '10px 14px', borderLeft: '3px solid #CFFAFE' }}>"{fb.comments}"</p>
                    : <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>No written comment.</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )
      }
    </div>
  );
};
// ─────────────────────────────────────────────────────────────────────────────
// PROFILE VIEW
// ─────────────────────────────────────────────────────────────────────────────
const ProfileView: React.FC<{ profile: Consultant | null; onUpdate: () => void }> = ({ profile, onUpdate }) => {
  const profileRating = useMemo(() => profile?.rating || 0, [profile]);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saveToast, setSaveToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [formError, setFormError] = useState<string>('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [newSkill, setNewSkill] = useState("");
  const [skillOptions, setSkillOptions] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [timePickerConfig, setTimePickerConfig] = useState<{ isOpen: boolean; field: 'shiftStart' | 'shiftEnd' | null; value: string; durationHours?: number }>({ isOpen: false, field: null, value: '', durationHours: 1 });

  useEffect(() => {
    let active = true;
    setSkillsLoading(true);
    getAllSkills()
      .then((items: any[]) => {
        if (!active) return;
        const names = Array.from(new Set(
          (Array.isArray(items) ? items : [])
            .map((s: any) => String(s?.skillName || s?.name || s?.title || "").trim())
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b));
        setSkillOptions(names);
      })
      .catch(() => {
        if (active) setSkillOptions([]);
      })
      .finally(() => {
        if (active) setSkillsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = "Name is required.";
    if (!formData.email?.trim() || !/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(formData.email)) errors.email = "Valid email is required.";
    const expRaw = Number(formData.experience);
    if (!Number.isFinite(expRaw) || expRaw <= 0 || !Number.isInteger(expRaw)) {
      errors.experience = "Experience must be a whole number greater than 0.";
    }
    if (Number(formData.charges) <= 0) errors.charges = "Charges must be greater than 0.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // ── 1-month session duration lock ────────────────────────────────────────────
  const durationLockKey = profile?.id ? `fin_duration_lock_${profile.id}` : null;
  const durationLockedUntil = durationLockKey ? localStorage.getItem(durationLockKey) : null;
  const isSessionDurationLocked = durationLockedUntil ? new Date() < new Date(durationLockedUntil) : false;
  const durationLockedUntilLabel = durationLockedUntil
    ? new Date(durationLockedUntil).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const showSaveToast = (msg: string, ok = true) => { setSaveToast({ msg, ok }); setTimeout(() => setSaveToast(null), 3500); };

  const initForm = (p: any) => {
    const trimTime = (t: string | null | undefined) => t ? String(t).substring(0, 5) : '';
    const base = parseFloat(p.charges || '0');
    setFormData({
      name: p.name || '',
      charges: p.charges || '',
      displayPrice: p.displayPrice ? String(p.displayPrice) : String(base + 200),
      shiftStart: trimTime(p.shiftStartTime || p.shift_start_time),
      shiftEnd: trimTime(p.shiftEndTime || p.shift_end_time),
      durationHours: durationMinutesToHours(
        p.slotsDuration ?? p.duration ?? p.durationHours ?? p.sessionDurationHours ?? p.slotDurationHours ?? 60,
        1
      ),
      skills: Array.isArray(p.skills) ? p.skills.join(', ') : (p.skills || ''),
      description: p.description || p.about || p.bio || '',
      rating: p.rating || '',
      email: p.email || '',
      experience: p.yearsOfExperience != null ? String(p.yearsOfExperience) : (p.experience != null ? String(p.experience) : ''),
    });
    setPhotoPreview(resolvePhotoUrl(p.profilePhoto || p.photo || ''));
    setPhotoFile(null);
  };

  useEffect(() => { if (profile) initForm(profile); }, [profile, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormError('');
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setFormError('Photo must be under 5 MB.'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setFormError('');
  };

  const handleSave = async () => {
    if (!profile) return;
    if (!validateForm()) { setFormError('Please fix the highlighted profile fields.'); return; }
    if (!formData.name?.trim()) { setFormError('Name required.'); return; }
    if (!formData.charges) { setFormError('Fee required.'); return; }
    if (!formData.shiftStart) { setFormError('Shift start required.'); return; }
    if (!formData.shiftEnd) { setFormError('Shift end required.'); return; }
    if (!formData.durationHours) { setFormError('Session duration required.'); return; }
    setSaving(true); setFormError('');
    try {
      const skillsList: string[] = typeof formData.skills === 'string' ? formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : (formData.skills || []);
      const toLocalTime = (t: string) => t.length === 5 ? `${t}:00` : t;
      const experienceYears = Number.parseInt(String(formData.experience || ''), 10);
      await updateAdvisor(profile.id, {
        name: formData.name.trim(),
        designation: profile.designation || '',
        charges: parseFloat(formData.charges) || 0,
        displayPrice: formData.displayPrice ? parseFloat(formData.displayPrice) : (parseFloat(formData.charges) || 0) + 200,
        email: profile.email,
        skills: skillsList,
        description: formData.description?.trim() || '',
        rating: formData.rating ? parseFloat(formData.rating) : null,
        shiftStartTime: toLocalTime(formData.shiftStart),
        shiftEndTime: toLocalTime(formData.shiftEnd),
        slotsDuration: durationHoursToMinutes(formData.durationHours, 1),
        yearsOfExperience: Number.isFinite(experienceYears) && experienceYears > 0
          ? experienceYears
          : ((profile as any).yearsOfExperience || profile.experience || 0),
      }, photoFile ?? undefined);
      await onUpdate();
      // Set 1-month session duration lock after any save
      if (durationLockKey) {
        const lockUntil = new Date();
        lockUntil.setMonth(lockUntil.getMonth() + 1);
        localStorage.setItem(durationLockKey, lockUntil.toISOString());
      }
      setIsEditing(false); setPhotoFile(null);
      showSaveToast('Profile saved!');
    } catch (e: any) { setFormError(e?.message || 'Failed to save.'); }
    finally { setSaving(false); }
  };

  if (!profile) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
    <img src={logoImg} alt="Meet The Masters" style={{ width: 64, height: 'auto', animation: 'mtmPulse 1.8s ease-in-out infinite' }} />
  </div>;

  const avatarInitials = profile.name?.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2) || 'C';
  const profileDescription = (profile as any).description || (profile as any).about || (profile as any).bio || '';
  const displayTime = (t: string) => {
    if (!t) return '--:--';
    const [h, m] = t.split(':').map(Number);
    return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };
  const detailCards = [
    { label: 'Email', value: profile.email, bg: '#ECFEFF', border: '#A5F3FC', labelColor: '#0F766E' },
    { label: 'Fee', value: profile.charges ? `₹${Number(profile.charges).toLocaleString("en-IN")}` : null, bg: '#ECFDF5', border: '#A7F3D0', labelColor: '#059669' },
    { label: 'Availability Start', value: (profile as any).shiftStartTime ? displayTime(String((profile as any).shiftStartTime)) : null, bg: '#ECFEFF', border: '#A5F3FC', labelColor: '#0891B2' },
    { label: 'Availability End', value: (profile as any).shiftEndTime ? displayTime(String((profile as any).shiftEndTime)) : null, bg: '#EEF2FF', border: '#C7D2FE', labelColor: '#4F46E5' },
    {
      label: 'Session Duration',
      value: `${durationMinutesToHours((profile as any).slotsDuration ?? (profile as any).duration ?? 60, 1)} hr`,
      bg: '#FFF7ED',
      border: '#FED7AA',
      labelColor: '#EA580C'
    },
    { label: 'Experience', value: (profile as any).yearsOfExperience != null ? `${(profile as any).yearsOfExperience} yrs` : profile.experience ? `${profile.experience} yrs` : null, bg: '#FFF7ED', border: '#FED7AA', labelColor: '#EA580C' },
  ].filter(i => i.value);

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>My Profile</h2>
        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} style={{ padding: '8px 16px', background: 'linear-gradient(135deg,#F0FDFA,#ECFEFF)', color: '#0F766E', border: '1px solid #A5F3FC', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 22px rgba(8,145,178,0.10)', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Pencil size={12} /> Edit Profile</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setIsEditing(false); setFormError(''); }} disabled={saving} style={{ padding: '8px 16px', background: '#F1F5F9', color: '#64748B', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', background: 'var(--color-primary-gradient)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 24px rgba(15,118,110,0.18)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>{saving ? 'Saving...' : <><CheckCircle size={13} /> Save</>}</button>
          </div>
        )}
      </div>
      {formError && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle size={14} /> {formError}</div>}
      {saveToast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: saveToast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '12px 24px', borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999 }}>{saveToast.msg}</div>}
      {!isEditing ? (
        <div style={{ background: 'linear-gradient(180deg,#F8FAFC 0%,#FFFFFF 42%)', borderRadius: 20, border: '1px solid #CFFAFE', overflow: 'hidden', boxShadow: '0 18px 48px rgba(15,23,42,0.08)' }}>
          <div style={{ background: 'var(--portal-profile-gradient)', padding: '30px 28px 26px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A5F3FC', marginBottom: 16 }}>Consultant Profile</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ width: 104, height: 104, borderRadius: '50%', flexShrink: 0, background: (profile as any).profilePhoto ? 'transparent' : 'rgba(255,255,255,0.15)', border: '3px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 10px 28px rgba(15,23,42,0.25)' }}>
                {(profile as any).profilePhoto ? <img src={resolvePhotoUrl((profile as any).profilePhoto)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span style={{ fontSize: 34, fontWeight: 700, color: '#fff' }}>{avatarInitials}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{profile.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(i => <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= Math.round(profileRating) ? '#F59E0B' : 'rgba(255,255,255,0.25)'}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>)}
                  {profileRating ? <span style={{ fontSize: 13, fontWeight: 700, color: '#FCD34D' }}>{(profileRating).toFixed(1)} <span style={{ fontSize: 10, fontWeight: 500, color: '#CCFBF1', marginLeft: 4 }}>(Read-only)</span></span> : <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>No rating</span>}
                </div>
              </div>
              <div style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.10))', border: '1px solid rgba(255,255,255,0.28)', borderRadius: 16, padding: '14px 20px', textAlign: 'center', boxShadow: '0 12px 28px rgba(15,23,42,0.18)' }}>
                <div style={{ fontSize: 11, color: '#A7F3D0', fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Session Fee</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', marginTop: 4 }}>₹{Number(profile.charges).toLocaleString("en-IN")}</div>
                <div style={{ fontSize: 11, color: '#CFFAFE', fontWeight: 600, marginTop: 2 }}>per session</div>
              </div>
            </div>
          </div>
          <div style={{ padding: '22px 28px 28px' }}>
            {profileDescription && (
              <div style={{ marginBottom: 20, background: 'linear-gradient(135deg,#F0FDFA 0%,#ECFEFF 100%)', border: '1px solid #A5F3FC', borderRadius: 16, padding: '16px 18px' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>About</div>
                <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.75 }}>{profileDescription}</p>
              </div>
            )}
            {profile.skills?.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Skills</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>{profile.skills.map((s, i) => <span key={i} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 999, background: 'linear-gradient(135deg,#CFFAFE,#ECFEFF)', color: '#0F766E', fontWeight: 700, border: '1px solid #A5F3FC' }}>{s}</span>)}</div>
              </>
            )}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', margin: '0 0 12px' }}>Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
              {detailCards.map(i => (
                <div key={i.label} style={{ background: i.bg, borderRadius: 14, padding: '14px 16px', border: `1px solid ${i.border}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: i.labelColor, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{i.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{i.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <><div style={{ background: '#fff', borderRadius: 20, border: '1px solid #CFFAFE', padding: 28, boxShadow: '0 18px 48px rgba(15,23,42,0.06)' }}>
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20, padding: '16px 18px', borderRadius: 18, background: 'linear-gradient(135deg,#F0FDFA 0%,#ECFEFF 100%)', border: '1px solid #A5F3FC' }}>
            <div onClick={() => fileInputRef.current?.click()} style={{ width: 104, height: 104, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', background: photoPreview ? 'transparent' : 'var(--portal-profile-gradient)', border: '3px solid #CFFAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {photoPreview ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setPhotoPreview('')} /> : <span style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>{avatarInitials}</span>}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#0F766E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Profile Styling</div>
              <div style={{ fontSize: 14, color: '#334155', marginBottom: 10 }}>Update your public-facing details and make sure your description is ready for users before they book a session.</div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: '6px 14px', border: '1.5px solid #A5F3FC', borderRadius: 6, background: '#ECFEFF', color: '#0F766E', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {photoFile ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><CheckCircle size={12} /> Selected</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><ImagePlus size={12} /> Choose Photo</span>}
              </button>
              {photoFile && <span style={{ marginLeft: 10, fontSize: 12, color: '#16A34A', fontWeight: 600 }}>{photoFile.name}</span>}
            </div>
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Full Name *</label>
            <input name="name" value={formData.name || ''} onChange={e => { const val = e.target.value; if (val.length === 1 && /[^a-zA-Z]/.test(val)) return; handleChange({ ...e, target: { ...e.target, value: val } } as any); }} style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${fieldErrors.name ? '#EF4444' : '#CBD5E1'}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
            {fieldErrors.name && <div style={{ color: '#EF4444', fontSize: 10, marginTop: 4, fontWeight: 600 }}>{fieldErrors.name}</div>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Email Address *</label>
            <input
              name="email"
              value={formData.email || ''}
              readOnly
              disabled
              style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${fieldErrors.email ? '#EF4444' : '#CBD5E1'}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none', background: '#F8FAFC', color: '#64748B', cursor: 'not-allowed' }}
            />
            <div style={{ marginTop: 4, fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>
              Email updates are locked to protect existing bookings and communication history.
            </div>
            {fieldErrors.email && <div style={{ color: '#EF4444', fontSize: 10, marginTop: 4, fontWeight: 600 }}>{fieldErrors.email}</div>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Fee (₹) *</label>
            <input name="charges" type="number" value={formData.charges || ''} onChange={e => { handleChange(e); const base = parseFloat(e.target.value) || 0; setFormData((prev: any) => ({ ...prev, charges: e.target.value, displayPrice: String(base + 200) })); if (fieldErrors.charges) setFieldErrors({ ...fieldErrors, charges: '' }); }} style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${fieldErrors.charges ? '#EF4444' : '#CBD5E1'}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
            {fieldErrors.charges && <div style={{ color: '#EF4444', fontSize: 10, marginTop: 4, fontWeight: 600 }}>{fieldErrors.charges}</div>}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Rating</label>
            <div style={{ width: '100%', padding: '8px 12px', background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', color: '#94A3B8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Star size={13} fill="#CBD5E1" stroke="none" /> {profileRating.toFixed(1)} <span style={{ fontSize: 10, fontWeight: 500, fontStyle: 'italic' }}>(Read-only)</span>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Availability Start *</label>
            <div
              onClick={() => {
                if (saving) return;
                // Parse current shiftStart HH:MM into an hour24 for the picker
                const curHour = formData.shiftStart ? parseInt(formData.shiftStart.split(':')[0], 10) : 9;
                setTimePickerConfig({ isOpen: true, field: 'shiftStart', value: formData.shiftStart, durationHours: Number(formData.durationHours) || 1 });
              }}
              style={{ width: '100%', padding: '8px 12px', border: `1px solid ${!formData.shiftStart ? '#FCA5A5' : '#CBD5E1'}`, borderRadius: 6, fontSize: 13, boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: saving ? 'not-allowed' : 'pointer', background: '#fff', color: formData.shiftStart ? '#0F172A' : '#94A3B8' }}
            >
              <span>{formData.shiftStart ? (() => {
                // Show as "Start - End" range based on current duration
                const [h, m] = formData.shiftStart.split(':').map(Number);
                const dur = Number(formData.durationHours) || 1;
                const endH = h + dur;
                const fmt = (hour: number, min: number) => {
                  const h12 = hour % 12 || 12;
                  const ampm = hour >= 12 ? 'PM' : 'AM';
                  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
                };
                return `${fmt(h, m)} - ${fmt(endH, m)}`;
              })() : `Pick availability slot`}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2" strokeLinecap="round"/></svg>
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
              Session Duration *
              {isSessionDurationLocked && (
                <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 6, padding: '2px 7px' }}>
                  🔒 Locked until {durationLockedUntilLabel}
                </span>
              )}
            </label>
            {isSessionDurationLocked ? (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 13, color: '#92400E', fontWeight: 700 }}>
                {formData.durationHours} hr - Session duration is locked for 1 month after each change to ensure booking consistency.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                {[1, 2, 3].map(hours => {
                  const active = Number(formData.durationHours || 1) === hours;
                  return (
                    <button
                      type="button"
                      key={hours}
                      onClick={() => setFormData((prev: any) => ({ ...prev, durationHours: hours }))}
                      style={{
                        padding: '9px 10px',
                        borderRadius: 8,
                        border: `1.5px solid ${active ? '#0F766E' : '#CBD5E1'}`,
                        background: active ? '#ECFEFF' : '#fff',
                        color: active ? '#0F766E' : '#334155',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {hours} hr
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Experience (years) *</label>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={formData.experience ?? ''}
              onChange={e => {
                const digitsOnly = e.target.value.replace(/\D/g, '');
                setFormData((p: any) => ({ ...p, experience: digitsOnly }));
                if (fieldErrors.experience) setFieldErrors({ ...fieldErrors, experience: '' });
              }}
              style={{ width: '100%', padding: '8px 12px', border: `1.5px solid ${fieldErrors.experience ? '#EF4444' : '#CBD5E1'}`, borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
              placeholder="e.g. 5"
            />
            {fieldErrors.experience && <div style={{ color: '#EF4444', fontSize: 10, marginTop: 4, fontWeight: 600 }}>{fieldErrors.experience}</div>}
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Skills</label>
            <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: '16px 18px', marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px 16px', maxHeight: 200, overflowY: 'auto', paddingRight: 8 }}>
                {skillOptions.map(skill => {
                  const currentSkills = Array.isArray(formData.skills) ? formData.skills : (typeof formData.skills === 'string' ? formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
                  const isChecked = currentSkills.includes(skill);
                  return (
                    <label key={skill} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '4px 0' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          const next = e.target.checked ? [...currentSkills, skill] : currentSkills.filter((s: string) => s !== skill);
                          setFormData({ ...formData, skills: next });
                        }}
                        style={{ width: 15, height: 15, accentColor: '#0F766E' }} />
                      <span style={{ fontSize: 12, color: '#334155', fontWeight: 500 }}>{skill}</span>
                    </label>
                  );
                })}
                {!skillsLoading && skillOptions.length === 0 && (
                  <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#94A3B8' }}>
                    No skills configured in Skills & Questions yet.
                  </div>
                )}
              </div>
              <div style={{ height: 1, background: '#E2E8F0', margin: '14px 0' }} />
              <div style={{ display: 'flex', gap: 10 }}>
                <input
                  type="text"
                  placeholder="Add a custom skill..."
                  value={newSkill}
                  onChange={e => setNewSkill(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = newSkill.trim();
                      if (val) {
                        const current = Array.isArray(formData.skills) ? formData.skills : (typeof formData.skills === 'string' ? formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
                        if (!current.includes(val)) setFormData({ ...formData, skills: [...current, val] });
                        setNewSkill("");
                      }
                    }
                  }}
                  style={{ flex: 1, padding: '8px 14px', borderRadius: 10, border: '1.5px solid #CFFAFE', fontSize: 13, outline: 'none' }} />
                <button type="button" onClick={() => {
                  const val = newSkill.trim();
                  if (val) {
                    const current = Array.isArray(formData.skills) ? formData.skills : (typeof formData.skills === 'string' ? formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
                    if (!current.includes(val)) setFormData({ ...formData, skills: [...current, val] });
                    setNewSkill("");
                  }
                }} style={{ padding: '8px 16px', borderRadius: 10, background: '#0F766E', color: '#fff', border: 'none', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Add</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {(Array.isArray(formData.skills) ? formData.skills : (typeof formData.skills === 'string' ? formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : [])).map((skill: string) => (
                <span key={skill} style={{ padding: '4px 12px', background: '#ECFEFF', border: '1px solid #A5F3FC', color: '#0F766E', borderRadius: 999, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {skill}
                  <X size={10} strokeWidth={3} style={{ cursor: 'pointer' }} onClick={() => {
                    const current = Array.isArray(formData.skills) ? formData.skills : (typeof formData.skills === 'string' ? formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : []);
                    setFormData({ ...formData, skills: current.filter((s: string) => s !== skill) });
                  }} />
                </span>
              ))}
            </div>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Description</label>
            <textarea name="description" value={formData.description || ''} onChange={handleChange} rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }} />
          </div>
        </div>
          <ProfileHourRangeClockPicker
            isOpen={timePickerConfig.isOpen}
            initialHour={timePickerConfig.value ? parseInt(timePickerConfig.value.split(':')[0], 10) : null}
            initialDuration={timePickerConfig.durationHours ?? Number(formData.durationHours) ?? 1}
            onClose={() => setTimePickerConfig({ ...timePickerConfig, isOpen: false })}
            onSave={(startHour24, durHours) => {
              const hh = String(startHour24).padStart(2, '0');
              const endH = startHour24 + durHours;
              const ehh = String(endH).padStart(2, '0');
              setFormData((prev: any) => ({
                ...prev,
                shiftStart: `${hh}:00`,
                shiftEnd: `${ehh}:00`,
                durationHours: durHours,
              }));
              setFormError('');
              setTimePickerConfig({ ...timePickerConfig, isOpen: false });
            }}
          />
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTANT OFFERS VIEW
// ─────────────────────────────────────────────────────────────────────────────
interface ConsultantOffer {
  id?: number;
  title: string;
  description: string;
  discount: string;
  validFrom: string;
  validTo: string;
  isActive: boolean;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  consultantId?: number;
  consultantName?: string;
}

const ConsultantOffersView: React.FC<{ consultantId: number; consultantName: string }> = ({ consultantId, consultantName }) => {
  const [offers, setOffers] = React.useState<ConsultantOffer[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editing, setEditing] = React.useState<ConsultantOffer | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<number | null>(null);
  const [deleteOfferConfirmId, setDeleteOfferConfirmId] = React.useState<number | null>(null);
  const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | null>(null);
  const [form, setForm] = React.useState<ConsultantOffer>({ title: '', description: '', discount: '', validFrom: '', validTo: '', isActive: true });
  const [showForm, setShowForm] = React.useState(false);
  const [offerError, setOfferError] = React.useState<string | null>(null);
  const todayIso = React.useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const validateOfferForm = () => {
    const title = form.title.trim();
    if (!title) return "Title is required.";
    if (!/^[A-Za-z\s]+$/.test(title)) {
      return "Title can contain letters and spaces only.";
    }
    if (!form.discount.trim()) return "Discount label is required.";

    const d = form.discount.trim();
    const compact = d.replace(/\s+/g, "");
    const isPercentPattern = /^\d+(\.\d+)?%$/.test(compact);
    const isFlatAmountPattern = /^\d+(\.\d+)?$/.test(compact);

    if (!isPercentPattern && !isFlatAmountPattern) {
      return "Discount label must be a percentage (e.g., 20%) or a flat amount (e.g., 500).";
    }

    const isPercent = compact.endsWith('%');
    const numericMatch = compact.match(/\d+(\.\d+)?/);
    const val = numericMatch ? parseFloat(numericMatch[0]) : NaN;

    if (!isNaN(val) && isPercent) {
      if (val > 100) return "Percentage discount cannot exceed 100%.";
      if (val < 0) return "Discount cannot be negative.";
    } else if (!isNaN(val)) {
      if (val > 100000) return "Flat discount cannot exceed ₹1,00,000.";
      if (val < 0) return "Discount cannot be negative.";
    } else if (d.length < 3) {
      return "Discount label must be at least 3 characters.";
    }

    const parseDateOnly = (value: string): Date | null => {
      if (!value) return null;
      const parsed = new Date(`${value}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) return null;
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const validFromDate = parseDateOnly(form.validFrom);
    const validToDate = parseDateOnly(form.validTo);

    if (form.validFrom && !validFromDate) return "Valid From date is invalid.";
    if (form.validTo && !validToDate) return "Valid Until date is invalid.";
    if (validFromDate && validFromDate < today) return "Valid From cannot be in the past.";
    if (validToDate && validToDate < today) return "Valid Until cannot be in the past.";
    if (validFromDate && validToDate && validToDate < validFromDate) {
      return "Valid Until must be same as or after Valid From.";
    }

    return null;
  };

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2500); };

  // Normalize raw API offer object → ConsultantOffer (handles backend field aliases)
  const normalizeOffer = (o: any): ConsultantOffer => {
    const approvalStatus = (
      o.approvalStatus || o.approval_status || o.status || ''
    ).toUpperCase() as ConsultantOffer['approvalStatus'];

    const isActive =
      o.isActive !== undefined ? Boolean(o.isActive) :
        (o as any).active !== undefined ? Boolean((o as any).active) :
          false;

    const fmtDate = (d: any) => {
      if (!d) return '';
      const s = String(d);
      // strip time part e.g. 2026-04-14T00:00:00 → 2026-04-14
      return s.includes('T') ? s.split('T')[0] : s;
    };

    return {
      ...o,
      isActive,
      approvalStatus: ['APPROVED', 'REJECTED', 'PENDING'].includes(approvalStatus as string)
        ? approvalStatus as 'APPROVED' | 'REJECTED' | 'PENDING'
        : undefined,
      validFrom: fmtDate(o.validFrom || o.valid_from),
      validTo: fmtDate(o.validTo || o.valid_to || o.validUntil || o.valid_until),
    };
  };

  const loadOffers = async () => {
    setLoading(true);
    try {
      let loaded: ConsultantOffer[] = [];
      try {
        const data = await apiFetch(`/offers/my-offers`);
        const raw = Array.isArray(data) ? data : extractArray(data);
        loaded = raw.map(normalizeOffer);
      } catch {
        try {
          const data = await apiFetch('/offers/admin');
          const arr = Array.isArray(data) ? data : extractArray(data);
          loaded = arr.filter((o: any) => o.consultantId === consultantId).map(normalizeOffer);
        } catch { loaded = []; }
      }
      setOffers(loaded);
    } finally { setLoading(false); }
  };

  React.useEffect(() => { loadOffers(); }, [consultantId]);

  const openNew = () => {
    setForm({ title: '', description: '', discount: '', validFrom: '', validTo: '', isActive: true });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (o: ConsultantOffer) => {
    setForm({ ...o });
    setEditing(o);
    setShowForm(true);
  };

  const handleSave = async () => {
    const err = validateOfferForm();
    if (err) { setOfferError(err); return; }
    setOfferError(null);
    setSaving(true);

    const isEdit = Boolean(editing?.id);
    const endpoint = isEdit ? `/offers/${editing!.id}` : `/offers`;

    const payload: Record<string, any> = {
      title: form.title.trim(),
      description: form.description?.trim() || '',
      discount: form.discount?.trim() || '',
      isActive: Boolean(form.isActive),
      active: Boolean(form.isActive),
      consultantId: consultantId
    };

    const toLocalDateTime = (dt: string) => {
      if (!dt) return undefined;
      return dt.length === 10 ? `${dt}T00:00:00` : dt;
    };

    const vf = toLocalDateTime(form.validFrom);
    const vt = toLocalDateTime(form.validTo);
    if (vf) payload.validFrom = vf;
    if (vt) payload.validTo = vt;

    let savedOffer: any = null;
    try {
      savedOffer = await apiFetch(endpoint, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      const normalizedSaved = normalizeOffer({ ...form, ...savedOffer });
      if (isEdit) {
        setOffers(prev => prev.map(o => o.id === editing!.id
          ? { ...normalizedSaved, id: editing!.id, approvalStatus: normalizedSaved.approvalStatus ?? 'PENDING' }
          : o));
        showToast('Offer updated. Pending admin approval.');
      } else {
        const newOffer: ConsultantOffer = {
          ...normalizedSaved,
          id: savedOffer?.id ?? Date.now(),
          consultantId,
          approvalStatus: normalizedSaved.approvalStatus ?? 'PENDING',
        };
        setOffers(prev => [...prev, newOffer]);
        showToast('Offer submitted for admin approval.');
      }
      setShowForm(false);
      setTimeout(() => loadOffers(), 800);
    } catch (e: any) {
      showToast(e?.message || 'Failed to save offer.', false);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await apiFetch(`/offers/${id}`, { method: 'DELETE' });
      setOffers(prev => prev.filter(o => o.id !== id));
      showToast('Offer deleted.');
    } catch (e: any) { showToast(e?.message || 'Delete failed.', false); }
    finally { setDeleting(null); }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1.5px solid #E2E8F0',
    borderRadius: 9, fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5,
  };

  const getApprovalBadge = (offer: ConsultantOffer) => {
    const status = (offer.approvalStatus || (offer as any).status || '').toUpperCase();
    if (status === 'APPROVED') return { label: 'Approved', bg: '#DCFCE7', color: '#16A34A', border: '#86EFAC' };
    if (status === 'REJECTED') return { label: 'Rejected', bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' };
    if (status === 'PENDING') return { label: 'Pending Approval', bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' };
    const active = offer.isActive !== undefined ? offer.isActive : Boolean((offer as any).active);
    return active
      ? { label: 'Active', bg: '#DCFCE7', color: '#16A34A', border: '#86EFAC' }
      : { label: 'Inactive', bg: '#F1F5F9', color: '#94A3B8', border: '#E2E8F0' };
  };

  return (
    <div style={{ padding: 24, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      {deleteOfferConfirmId !== null && (
        <ConfirmDialog
          open={true}
          title="Delete Offer"
          message="Delete this offer?"
          confirmLabel={deleting === deleteOfferConfirmId ? "Deleting..." : "Delete"}
          cancelLabel="Cancel"
          danger={true}
          busy={deleting === deleteOfferConfirmId}
          onClose={() => setDeleteOfferConfirmId(null)}
          onConfirm={async () => {
            const id = deleteOfferConfirmId;
            setDeleteOfferConfirmId(null);
            await handleDelete(id);
          }}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />} {toast.msg}
        </div>
      )}

      <div className="offers-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0F172A' }}>My Offers</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>Create and manage promotional offers for your services</p>
        </div>
        <button onClick={openNew} style={{ padding: '10px 18px', background: 'var(--color-primary-gradient)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + New Offer
        </button>
      </div>

      <div style={{ background: '#ECFEFF', border: '1px solid #A5F3FC', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 13, color: '#115E59', lineHeight: 1.6 }}>
          <strong>How offers work:</strong> Offers you create are submitted to admin for approval. Once approved, they appear on the home page and booking page for customers.
        </div>
      </div>

      {showForm && (
        <div style={{ background: '#F8FAFC', border: '1.5px solid #A5F3FC', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 18 }}>{editing ? 'Edit Offer' : 'Create New Offer'}</div>
          <div className="offers-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {offerError && (
              <div style={{ gridColumn: '1/-1', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', color: '#B91C1C', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} /> {offerError}
              </div>
            )}
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Title *</label>
              <input
                value={form.title}
                onChange={e => {
                  setForm(f => ({ ...f, title: formatTitleLikeInput(e.target.value) }));
                  if (offerError) setOfferError(null);
                }}
                placeholder="e.g. First Session Free"
                style={{ ...inputStyle, borderColor: offerError && !form.title.trim() ? '#EF4444' : '#E2E8F0' }}
              />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Describe the offer..." style={{ ...inputStyle, height: 80, resize: 'none' as any }} />
            </div>
            <div>
              <label style={labelStyle}>Discount Label *</label>
              <input value={form.discount} onChange={e => { setForm(f => ({ ...f, discount: e.target.value })); if (offerError) setOfferError(null); }} placeholder="e.g. 20% or 500" style={{ ...inputStyle, borderColor: offerError && offerError.includes('Discount') ? '#EF4444' : '#E2E8F0' }} />
              <div style={{ marginTop: 4, fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                <Info size={11} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>Use a value like <strong>20%</strong> or <strong>500</strong>.</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
              <input type="checkbox" id="offer-active" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0F766E' }} />
              <label htmlFor="offer-active" style={{ fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Active (visible after approval)</label>
            </div>
            <div>
              <label style={labelStyle}>Valid From</label>
              <input
                type="date"
                value={form.validFrom}
                min={todayIso}
                onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Valid Until</label>
              <input
                type="date"
                value={form.validTo}
                min={todayIso}
                onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: saving ? '#99F6E4' : '#0F766E', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Saving...' : editing ? 'Update Offer' : 'Create Offer'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <img src={logoImg} alt="Meet The Masters" style={{ width: 64, height: 'auto', animation: 'mtmPulse 1.8s ease-in-out infinite' }} />
        </div>
      ) : offers.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#F8FAFC', borderRadius: 16, color: '#94A3B8' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </div>
          <div style={{ fontWeight: 600, color: '#64748B', marginBottom: 12 }}>No offers yet</div>
          <button onClick={openNew} style={{ padding: '9px 20px', background: '#0F766E', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Create Your First Offer</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[...offers].sort((a, b) => {
            const rank = (o: ConsultantOffer) => {
              const s = (o.approvalStatus || (o as any).status || '').toUpperCase();
              if (s === 'APPROVED') return 0;
              if (s === 'PENDING') return 1;
              if (s === 'REJECTED') return 3;
              const active = o.isActive !== undefined ? o.isActive : Boolean((o as any).active);
              return active ? 0 : 2;
            };
            return rank(a) - rank(b);
          }).map(offer => {
            const badge = getApprovalBadge(offer);
            const resolvedStatus = (offer.approvalStatus || (offer as any).status || '').toUpperCase();
            const isApproved = resolvedStatus === 'APPROVED';
            return (
              <div key={offer.id} style={{ position: 'relative', overflow: 'hidden', background: isApproved ? '#F0FDF4' : '#fff', borderRadius: 14, border: isApproved ? '1.5px solid #86EFAC' : '1.5px solid #E2E8F0', padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 16, boxShadow: isApproved ? '0 2px 12px rgba(22,163,74,0.10)' : '0 1px 6px rgba(0,0,0,0.05)' }}>
                {isApproved && (
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '14px 14px 0 0', background: 'linear-gradient(90deg,#16A34A,#22C55E)' }} />
                )}
                <div style={{ width: 44, height: 44, borderRadius: 12, background: isApproved ? '#DCFCE7' : offer.isActive ? '#ECFEFF' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isApproved ? (
                    <CheckCircle size={22} color="#16A34A" />
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={offer.isActive ? '#0F766E' : '#94A3B8'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{offer.title}</span>
                    {offer.discount && <span style={{ fontSize: 11, fontWeight: 800, background: '#DC2626', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>{offer.discount}</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>
                    {isApproved && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: '#ECFEFF', color: '#0F766E', border: '1px solid #A5F3FC' }}>✓ Live on Platform</span>}
                  </div>
                  {offer.description && <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, marginBottom: 4 }}>{offer.description}</div>}
                  {(offer.validFrom || offer.validTo) && (
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>
                      {offer.validFrom && `From: ${offer.validFrom}`}{offer.validFrom && offer.validTo && ' · '}{offer.validTo && `Until: ${offer.validTo}`}
                    </div>
                  )}
                </div>
                <div className="offers-card-actions" style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => openEdit(offer)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #A5F3FC', background: '#ECFEFF', color: '#0F766E', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => offer.id && setDeleteOfferConfirmId(offer.id)} disabled={deleting === offer.id} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: deleting === offer.id ? 0.6 : 1 }}>
                    {deleting === offer.id ? '...' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes clockSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} } @keyframes mtmPulse { 0% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } 20% { opacity: 0.6; } 50% { transform: scale(1.10); filter: blur(0px) drop-shadow(0 0 22px rgba(15,118,110,0.65)); opacity: 1.0; } 80% { opacity: 0.6; } 100% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } }`}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTANT SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────
interface ConsultantSidebarProps {
  consultantName?: string;
  activeItem?: string;
  onNavigate?: (id: string) => void;
  onLogout?: () => void;
  badges?: Record<string, number | null>;
  onClose?: () => void;
}

const ConsultantSidebar: React.FC<ConsultantSidebarProps> = ({
  activeItem = 'bookings',
  onNavigate,
  onLogout,
  badges = {},
  onClose,
}) => {
  const sidebarItems = [
    { id: 'bookings', label: 'My Bookings' },
    { id: 'tickets', label: 'My Tickets' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'calendar', label: 'My Schedule' },
    { id: 'feedbacks', label: 'Feedbacks' },
    { id: 'profile', label: 'Profile' },
    { id: 'offers', label: 'My Offers' },
  ];

  return (
    <aside style={{
      width: '100%',
      height: '100%',
      background: 'var(--adm-sidebar-bg)',
      borderRight: '1px solid var(--adm-sidebar-border)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      flexShrink: 0,
      boxShadow: '18px 0 42px rgba(15, 23, 42, 0.12)',
    }}>
      <nav style={{ flex: 1, padding: '16px 8px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {sidebarItems.map(({ id, label }) => {
          const isActive = activeItem === id;
          return (
            <div
              key={id}
              onClick={() => onNavigate?.(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '11px 14px',
                borderRadius: 16,
                cursor: 'pointer',
                background: isActive ? 'var(--adm-sidebar-active-bg)' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(191,219,254,0.42)' : 'transparent'}`,
                position: 'relative',
                boxShadow: isActive ? '0 14px 28px rgba(15,118,110,0.28)' : 'none',
                transition: 'background 0.15s, border-color 0.15s, transform 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLDivElement).style.background = 'var(--adm-sidebar-hover-bg)';
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(96,165,250,0.24)';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateX(2px)';
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                  (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
                  (e.currentTarget as HTMLDivElement).style.transform = 'translateX(0)';
                }
              }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: '60%', background: '#CFFAFE',
                  borderRadius: '0 2px 2px 0',
                }} />
              )}
              <span style={{
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--adm-sidebar-text-active)' : 'var(--adm-sidebar-text)',
                letterSpacing: '0.01em',
                transition: 'color 0.15s',
              }}>
                {label}
              </span>
            </div>
          );
        })}
      </nav>
      <div style={{ height: 1, background: 'var(--adm-sidebar-border)', margin: '6px 16px' }} />
      <div style={{ padding: '8px 8px 18px' }}>
        <div
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
            color: 'var(--adm-sidebar-text)', transition: 'all 0.15s',
            background: 'transparent',
            border: '1px solid transparent',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLDivElement).style.color = '#EF4444';
            (e.currentTarget as HTMLDivElement).style.background = 'rgba(239,68,68,0.08)';
            (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLDivElement).style.color = 'var(--adm-sidebar-text)';
            (e.currentTarget as HTMLDivElement).style.background = 'transparent';
            (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>Sign Out</span>
          <ArrowRight size={16} />
        </div>
      </div>
    </aside>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AdvisorDashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'bookings' | 'tickets' | 'analytics' | 'notifications' | 'calendar' | 'feedbacks' | 'profile' | 'offers'
  >('bookings');
  const [profileData, setProfileData] = useState<Consultant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [specialBookingCount, setSpecialBookingCount] = useState(0);
  const [ticketCounts, setTicketCounts] = useState({ open: 0, slaRisk: 0 });
  const [newNotifCount, setNewNotifCount] = useState(0);
  const [activeConsultantId, setActiveConsultantId] = useState<number | null>(null);
  const [consultantTickets, setConsultantTickets] = useState<any[]>([]);
  const [bookingsForAnalytics, setBookingsForAnalytics] = useState<any[]>([]);
  const [analyticsOverview, setAnalyticsOverview] = useState<any>(null);
  const [analyticsCharts, setAnalyticsCharts] = useState<any>(null);
  const [analyticsTransactions, setAnalyticsTransactions] = useState<any[]>([]);
  const [analyticsAppointments, setAnalyticsAppointments] = useState<any[]>([]);
  const [analyticsFeedbacks, setAnalyticsFeedbacks] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        const advisorId = user?.consultantId || user?.advisorId || user?.id;
        if (!advisorId) { setError('No consultant profile linked.'); setLoading(false); return; }
        setActiveConsultantId(Number(advisorId));
        const [consultantRes, bRes, tRes, sbRes] = await Promise.allSettled([
          getAdvisorById(advisorId),
          getBookingsByConsultant(advisorId),
          getTicketsByConsultant(advisorId),
          getSpecialBookingsByConsultant(advisorId),
        ]);
        if (consultantRes.status !== 'fulfilled') throw new Error('Profile load failed');
        const consultantDurationMinutes = durationHoursToMinutes(
          durationMinutesToHours(
            (consultantRes.value as any)?.slotsDuration
            ?? (consultantRes.value as any)?.duration
            ?? (consultantRes.value as any)?.durationHours
            ?? (consultantRes.value as any)?.slotDurationHours
            ?? 60,
            1
          ),
          1
        );
        const consultant = {
          ...consultantRes.value,
          slotsDuration: consultantDurationMinutes,
          duration: durationMinutesToHours(consultantDurationMinutes, 1),
        };
        setProfileData(consultant);
        if (tRes.status === 'fulfilled') {
          const tickets = extractArray(tRes.value);
          setConsultantTickets(tickets);
          setTicketCounts({
            open: tickets.filter((t: any) => ['NEW', 'OPEN', 'IN_PROGRESS'].includes(t.status)).length,
            slaRisk: tickets.filter((t: any) => getSlaInfo(t)?.breached || getSlaInfo(t)?.warning).length,
          });
          // Write booking notifications for ticket events
          try {
            const notifKey = `fin_notifs_CONSULTANT_${advisorId}`;
            const existing: any[] = JSON.parse(localStorage.getItem(notifKey) || '[]');
            const existingIds = new Set(existing.map((n: any) => n.id));
            const newNotifs: any[] = [];
            tickets.filter((t: any) => ['NEW', 'OPEN'].includes(t.status)).forEach((t: any) => {
              const notifId = `ticket_open_${t.id}`;
              if (!existingIds.has(notifId)) {
                newNotifs.push({ id: notifId, type: 'warning', title: `Open Ticket${t.title ? ` - ${t.title}` : ""}`, message: `"${t.title || t.description || 'Support ticket'}" is awaiting your response. Priority: ${t.priority || 'MEDIUM'}.`, timestamp: t.createdAt || new Date().toISOString(), read: false, ticketId: t.id });
              }
            });
            if (newNotifs.length > 0) {
              localStorage.setItem(notifKey, JSON.stringify([...newNotifs, ...existing].slice(0, 50)));
            }
          } catch { }
        }
        if (bRes.status === 'fulfilled') {
          const arr = extractArray(bRes.value);
          const token = localStorage.getItem('fin_token');
          const authH = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
          const missingIds = [...new Set(arr.filter((b: any) => !deepFindDate(b) || !deepFindTime(b)).map((b: any) => b.timeSlotId || b.timeslotId || b.slotId || b.timeSlot?.id).filter(Boolean).map(Number))];
          const tsCache: Record<number, any> = {};
          for (let i = 0; i < missingIds.length; i += 6) {
            const batch = missingIds.slice(i, i + 6);
            const fetched = await Promise.allSettled(batch.map(id => fetch(buildApiUrl(`/timeslots/${id}`), { headers: authH }).then(r => r.ok ? r.json() : null)));
            fetched.forEach((r, j) => { if (r.status === 'fulfilled' && r.value) tsCache[batch[j]] = r.value; });
          }
          const enriched = arr.map((b: any) => {
            if (deepFindDate(b) && deepFindTime(b)) return b;
            const ts = tsCache[Number(b.timeSlotId || b.timeslotId || b.slotId || b.timeSlot?.id)];
            return ts ? { ...b, slotDate: b.slotDate || ts.slotDate || '', bookingDate: b.bookingDate || ts.slotDate || '', slotTime: b.slotTime || ts.slotTime || '', timeRange: b.timeRange || ts.timeRange || ts.masterTimeSlot?.timeRange || '', timeSlot: { ...(b.timeSlot || {}), ...ts } } : b;
          });
          const dedicatedSpecial = sbRes.status === 'fulfilled'
            ? extractArray(sbRes.value).map((b: any) => {
              const dedicatedId = getDedicatedSpecialBookingId(b);
              return { ...b, isSpecialBooking: dedicatedId != null, specialBookingId: dedicatedId ?? undefined };
            })
            : [];
          const specialBookings = dedicatedSpecial.length > 0
            ? dedicatedSpecial
            : enriched.filter((b: any) => resolveSpecialBookingMeta(b));
          setSpecialBookingCount(specialBookings.filter((b: any) => {
            const meta = resolveSpecialBookingMeta(b);
            const status = getBookingLifecycleStatus(b);
            const closed = status === 'CANCELLED' || status === 'COMPLETED';
            return !!meta && !isScheduledSpecialStatus(meta.status) && !closed;
          }).length);
          setPendingBookings(enriched.filter((b: any) => getBookingLifecycleStatus(b) === 'PENDING' && !resolveSpecialBookingMeta(b)));
          setBookingsForAnalytics(enriched); // ← fix: populate analytics data on initial load
          // Write notifications for booking events
          try {
            const notifKey = `fin_notifs_CONSULTANT_${advisorId}`;
            const existing: any[] = JSON.parse(localStorage.getItem(notifKey) || '[]');
            const existingIds = new Set(existing.map((n: any) => n.id));
            const bookingNotifs: any[] = [];
            enriched.forEach((b: any) => {
              const st = deepFindStatus(b);
              const clientName = deepFindClientName(b);
              const userId = b.userId || b.user?.id || b.clientId || null;
              const date = deepFindDate(b);
              if (st === 'PENDING') {
                const nid = `booking_pending_${b.id}`;
                if (!existingIds.has(nid)) bookingNotifs.push({ id: nid, type: 'info', title: `New Booking Request`, message: `${clientName} has requested a session on ${date}. Please review and confirm.`, timestamp: b.createdAt || new Date().toISOString(), read: false, bookingId: b.id, userId, clientName });
              } else if (st === 'CONFIRMED' || st === 'BOOKED') {
                const nid = `booking_confirmed_${b.id}`;
                if (!existingIds.has(nid)) bookingNotifs.push({ id: nid, type: 'success', title: `Booking Confirmed`, message: `Session with ${clientName} on ${date} is confirmed.`, timestamp: b.updatedAt || b.createdAt || new Date().toISOString(), read: false, bookingId: b.id, userId, clientName });
              } else if (st === 'CANCELLED') {
                const nid = `booking_cancelled_${b.id}`;
                if (!existingIds.has(nid)) bookingNotifs.push({ id: nid, type: 'error', title: `Booking Cancelled`, message: `Session with ${clientName} on ${date} has been cancelled.`, timestamp: b.updatedAt || b.createdAt || new Date().toISOString(), read: false, bookingId: b.id, userId, clientName });
              }
            });
            if (bookingNotifs.length > 0) {
              localStorage.setItem(notifKey, JSON.stringify([...bookingNotifs, ...existing].slice(0, 50)));
              setNewNotifCount(prev => prev + bookingNotifs.length);
            }
          } catch { }
        }
        if (bRes.status !== 'fulfilled' && sbRes.status === 'fulfilled') {
          const dedicatedSpecial = extractArray(sbRes.value).map((b: any) => {
            const dedicatedId = getDedicatedSpecialBookingId(b);
            return {
              ...b,
              isSpecialBooking: dedicatedId != null,
              specialBookingId: dedicatedId ?? undefined,
            };
          });
          setSpecialBookingCount(dedicatedSpecial.filter((b: any) => {
            const meta = resolveSpecialBookingMeta(b);
            const status = getBookingLifecycleStatus(b);
            const closed = status === 'CANCELLED' || status === 'COMPLETED';
            return !!meta && !isScheduledSpecialStatus(meta.status) && !closed;
          }).length);
        }
        try {
          const notifs = JSON.parse(localStorage.getItem(`fin_notifs_CONSULTANT_${advisorId}`) || '[]');
          setNewNotifCount(notifs.filter((n: any) => !n.read).length);
        } catch { }
      } catch {
        setError('Failed to load dashboard.');
      } finally { setLoading(false); }
    })();
  }, []);

  // ── Analytics tab: fetch from analytics endpoints when tab activates ──────
  useEffect(() => {
    if (activeTab !== 'analytics' || !activeConsultantId) return;
    (async () => {
      setAnalyticsLoading(true);
      const [overview, charts, txns, appts, feedbacks] = await Promise.allSettled([
        apiFetch("/analytics/consultant/overview"),
        apiFetch("/analytics/consultant/charts"),
        apiFetch("/analytics/consultant/recent-transactions"),
        apiFetch("/analytics/consultant/upcoming-appointments"),
        apiFetch("/analytics/consultant/recent-feedbacks"),
      ]);
      if (overview.status === "fulfilled") setAnalyticsOverview(overview.value);
      if (charts.status === "fulfilled") setAnalyticsCharts(charts.value);
      if (txns.status === "fulfilled") setAnalyticsTransactions(Array.isArray(txns.value) ? txns.value : []);
      if (appts.status === "fulfilled") setAnalyticsAppointments(Array.isArray(appts.value) ? appts.value : []);
      if (feedbacks.status === "fulfilled") setAnalyticsFeedbacks(Array.isArray(feedbacks.value) ? feedbacks.value : []);
      setAnalyticsLoading(false);
    })();
  }, [activeTab, activeConsultantId]);

  const handleLogout = () => { logoutUser(); navigate('/login'); };
  const refreshProfile = async () => {
    if (profileData?.id) {
      const u = await getAdvisorById(profileData.id);
      const slotsDuration = durationHoursToMinutes(
        durationMinutesToHours((u as any)?.slotsDuration ?? (u as any)?.duration ?? (u as any)?.durationHours ?? (u as any)?.slotDurationHours ?? 60, 1),
        1
      );
      setProfileData({
        ...u,
        slotsDuration,
        duration: durationMinutesToHours(slotsDuration, 1),
      });
    }
  };

  if (loading) return (
    <>
      <ForcePasswordChangeModal />
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src={logoImg} alt="Meet The Masters" style={{ width: 72, height: 'auto', animation: 'mtmPulse 1.8s ease-in-out infinite' }} />
        <style>{`@keyframes mtmPulse { 0% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } 20% { opacity: 0.6; } 50% { transform: scale(1.10); filter: blur(0px) drop-shadow(0 0 22px rgba(15,118,110,0.65)); opacity: 1.0; } 80% { opacity: 0.6; } 100% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } }`}</style>
      </div>
    </>
  );

  if (error) return (
    <>
      <ForcePasswordChangeModal />
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
        <AlertTriangle size={40} color="#EF4444" />
        <p style={{ color: '#EF4444', fontWeight: 600 }}>{error}</p>
        <button onClick={() => navigate('/')} style={{ padding: '10px 24px', background: '#0F766E', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Back to Login</button>
      </div>
    </>
  );

  const ticketBadge = ticketCounts.slaRisk > 0 ? ticketCounts.slaRisk : ticketCounts.open > 0 ? ticketCounts.open : null;

  const TabIcon: React.FC<{ id: string; active: boolean }> = ({ id, active }) => {
    const c = active ? '#FFFFFF' : 'rgba(255,255,255,0.94)';
    const w = 19; const h = 19;
    const sw = active ? 2.3 : 2.2;
    const iconStyle: React.CSSProperties = { filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.28))' };
    switch (id) {
      case 'bookings': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
      case 'special-bookings': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}><path d="M12 2l2.7 5.47L21 8.38l-4.5 4.39 1.06 6.23L12 16.9 6.44 19l1.06-6.23L3 8.38l6.3-.91L12 2z" /></svg>;
      case 'tickets': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /></svg>;
      case 'analytics': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
      case 'notifications': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
      case 'calendar': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><circle cx="12" cy="16" r="1" fill={c} /></svg>;
      case 'feedbacks': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
      case 'profile': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
      case 'offers': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={iconStyle}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>;
      default: return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} style={iconStyle}><circle cx="12" cy="12" r="10" /></svg>;
    }
  };

  const tabs = [
    { id: 'bookings' as const, label: 'Bookings', badge: pendingBookings.length > 0 ? pendingBookings.length : null, badgeColor: '#0F766E' },
    { id: 'tickets' as const, label: 'Tickets', badge: ticketBadge, badgeColor: ticketCounts.slaRisk > 0 ? '#DC2626' : '#0F766E' },
    { id: 'analytics' as const, label: 'Analytics', badge: null, badgeColor: '#0F766E' },
    { id: 'notifications' as const, label: 'Alerts', badge: newNotifCount > 0 ? newNotifCount : null, badgeColor: '#DC2626' },
    { id: 'calendar' as const, label: 'Schedule', badge: specialBookingCount > 0 ? specialBookingCount : null, badgeColor: '#D97706' },
    { id: 'feedbacks' as const, label: 'Feedback', badge: null, badgeColor: '#0F766E' },
    { id: 'profile' as const, label: 'Profile', badge: null, badgeColor: '#0F766E' },
    { id: 'offers' as const, label: 'Offers', badge: null, badgeColor: '#16A34A' },
  ];

  return (
    <div className="advisor-layout">
      <ForcePasswordChangeModal />
      <header className="advisor-navbar">

        <div className="nav-brand" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => navigate('/')}>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
            <span className="brand-text" style={{ color: '#fff', letterSpacing: '0.06em' }}>MEET THE MASTERS</span>
            <span className="brand-sub" style={{ color: 'rgba(255,255,255,0.65)' }}>CONSULTANT PORTAL</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {profileData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px 6px 7px', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 22, boxShadow: '0 10px 24px rgba(15,23,42,0.14)', backdropFilter: 'blur(10px)' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.26)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {profileData.name?.charAt(0).toUpperCase() ?? 'C'}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{profileData.name}</div>
                {profileData.designation && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.72)', lineHeight: 1.1 }}>{profileData.designation}</div>}
              </div>
            </div>
          )}
          <div onClick={() => setActiveTab('notifications')} style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.16)', border: '1.5px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 10px 18px rgba(15,23,42,0.14)', backdropFilter: 'blur(10px)' }} title="Notifications">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
          </div>
          <div className="avatar-circle-sm" onClick={() => setActiveTab('profile')} style={{ cursor: 'pointer' }} title="My Profile">
            {profileData?.name?.charAt(0).toUpperCase() ?? 'C'}
          </div>
        </div>
      </header>

      {profileData && (
        <ConsultantNotificationMonitor
          consultantId={profileData.id}
          onNewNotifications={(fresh) => {
            setNewNotifCount(prev => prev + fresh.filter((n: any) => !n.read).length);
          }}
        />
      )}

      <div className="advisor-body">
        {sidebarOpen && (
          <div onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200 }} />
        )}
        <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <ConsultantSidebar
            activeItem={activeTab}
            onNavigate={(id: string) => { setActiveTab(id as typeof activeTab); setSidebarOpen(false); }}
            onLogout={handleLogout}
            consultantName={profileData?.name || 'Consultant'}
            onClose={() => setSidebarOpen(false)}
            badges={{
              bookings: pendingBookings.length > 0 ? pendingBookings.length : null,
              calendar: specialBookingCount > 0 ? specialBookingCount : null,
              tickets: ticketBadge,
              notifications: newNotifCount > 0 ? newNotifCount : null,
            }}
          />
        </div>

        <main
          className="advisor-main"
          style={{
            overflowY: activeTab === 'tickets' ? 'hidden' : 'auto',
            overflowX: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
          {ticketCounts.open > 0 && activeTab !== 'tickets' && (
            <div style={{ background: 'linear-gradient(90deg,#FEF9C3,#FFFBEB)', border: '1px solid #FCD34D', borderRadius: 12, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                <span style={{ fontWeight: 700, color: '#92400E', fontSize: 13 }}>
                  {ticketCounts.open} active ticket{ticketCounts.open !== 1 ? 's' : ''} - please review and respond.
                  {ticketCounts.slaRisk > 0 && <span style={{ marginLeft: 8, color: '#DC2626' }}>{ticketCounts.slaRisk} at SLA risk</span>}
                </span>
              </div>
              <button onClick={() => setActiveTab('tickets')} style={{ padding: '6px 16px', background: '#D97706', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>View Tickets</button>
            </div>
          )}

          {activeTab === 'bookings' && activeConsultantId && <BookingsView consultantId={activeConsultantId} onNavigateToSchedule={() => setActiveTab('calendar')} shiftStartTime={profileData?.shiftStartTime || ''} shiftEndTime={profileData?.shiftEndTime || ''} slotDurationMinutes={Number((profileData as any)?.slotsDuration || durationHoursToMinutes((profileData as any)?.duration ?? 1, 1))} onBookingsLoaded={setBookingsForAnalytics} />}
          {activeTab === 'tickets' && activeConsultantId && <AdvisorTicketsView consultantId={activeConsultantId} />}
          {activeTab === 'analytics' && profileData && (
            <AnalyticsDashboard tickets={consultantTickets} consultants={[]} bookings={bookingsForAnalytics} mode="consultant" consultantId={activeConsultantId!} consultantName={profileData.name} overviewData={analyticsOverview} chartsData={analyticsCharts} recentTransactions={analyticsTransactions} upcomingAppointments={analyticsAppointments} recentFeedbacks={analyticsFeedbacks} analyticsLoading={analyticsLoading} />
          )}
          {activeTab === 'notifications' && activeConsultantId && <ConsultantNotificationsView consultantId={activeConsultantId} onNavigate={(tab) => setActiveTab(tab as typeof activeTab)} />}
          {activeTab === 'calendar' && profileData && (
            <MySlotsView
              consultantId={activeConsultantId!}
              shiftStartTime={profileData.shiftStartTime || ''}
              shiftEndTime={profileData.shiftEndTime || ''}
              slotDurationMinutes={Number((profileData as any)?.slotsDuration || durationHoursToMinutes((profileData as any)?.duration ?? 1, 1))}
            />
          )}
          {activeTab === 'feedbacks' && activeConsultantId && <FeedbacksView consultantId={activeConsultantId} />}
          {activeTab === 'profile' && <ProfileView profile={profileData} onUpdate={refreshProfile} />}
          {activeTab === 'offers' && profileData && <ConsultantOffersView consultantId={activeConsultantId!} consultantName={profileData.name} />}

          <nav className="advisor-tabs-mobile">
            {tabs.map(t => {
              const isActive = activeTab === t.id;
              return (
                <button key={t.id} className={`tab-btn ${isActive ? 'active' : ''}`} onClick={() => setActiveTab(t.id)} style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <TabIcon id={t.id} active={isActive} />
                    <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 500, color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.82)' }}>{t.label}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </main>
      </div>
      <nav className="advisor-tabs-mobile">
        {tabs.map(t => {
          const isActive = activeTab === t.id;
          return (
            <button key={t.id} className={`tab-btn ${isActive ? 'active' : ''}`} onClick={() => setActiveTab(t.id)} style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <TabIcon id={t.id} active={isActive} />
                <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 500, color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.82)' }}>{t.label}</span>
              </div>
            </button>
          );
        })}

        {/* ── Sign Out button - mobile only ── */}
        <button
          className="tab-btn tab-btn-signout"
          onClick={handleLogout}
          style={{ position: 'relative', flexShrink: 0 }}
          title="Sign Out"
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,160,160,0.95)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span style={{ fontSize: 9, fontWeight: 500, color: 'rgba(255,160,160,0.9)' }}>Sign Out</span>
          </div>
        </button>
      </nav>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes clockSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} } @keyframes mtmPulse { 0% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } 20% { opacity: 0.6; } 50% { transform: scale(1.10); filter: blur(0px) drop-shadow(0 0 22px rgba(15,118,110,0.65)); opacity: 1.0; } 80% { opacity: 0.6; } 100% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } }`}</style>
    </div>
  );
}
