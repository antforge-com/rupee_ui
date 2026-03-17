import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  extractArray,
  getAdvisorById,
  getBookingsByConsultant,
  getCurrentUser,
  getPriorityStyle,
  getSlaInfo,
  getStatusStyle,
  getTicketComments,
  getTicketsByConsultant,
  logoutUser,
  postInternalNote,
  postTicketComment,
  sendTicketCommentEmail,
  sendTicketStatusEmail,
  SLA_HOURS,
  updateAdvisor,
  updateTicketStatus
} from '../services/api';
import AnalyticsDashboard from './AnalyticsDashboard';
import { ConsultantNotificationMonitor } from './NotificationSystem';

// ── Photo URL resolver ────────────────────────────────────────────────────────
const resolvePhotoUrl = (path: string | null | undefined): string => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('blob:')) return path;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `http://52.55.178.31:8081${clean}`;
};

// ── Master Timeslots API ──────────────────────────────────────────────────────
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const BASE = 'http://52.55.178.31:8081/api';
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

const getMasterTimeslots = () => apiFetch('/master-timeslots');

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
const createMasterTimeslot = (timeRange: string) =>
  apiFetch('/master-timeslots', { method: 'POST', body: JSON.stringify({ timeRange }) });
const updateMasterTimeslot = (id: number, timeRange: string) =>
  apiFetch(`/master-timeslots/${id}`, { method: 'PUT', body: JSON.stringify({ timeRange }) });
const deleteMasterTimeslot = (id: number) =>
  apiFetch(`/master-timeslots/${id}`, { method: 'DELETE' });

// ── Types ─────────────────────────────────────────────────────────────────────
interface Consultant {
  id: number;
  name: string;
  designation: string;
  charges: number;
  shiftTimings: string;
  shiftStartTime: string;
  shiftEndTime: string;
  skills: string[];
  email: string;
  location?: string;
  experience?: number;
  reviewCount?: number;
  rating?: number;
  about?: string;
  description?: string;
  profilePhoto?: string;
  photo?: string;
  languages?: string;
  phone?: string;
}

interface MasterSlot { id: number; timeRange: string; }

interface TimeSlotRecord {
  id: number;
  consultantId: number;
  slotDate: string;
  masterTimeSlotId: number;
  timeRange: string;
  status: string;
  version?: number;
}

interface FeedbackItem {
  id: number;
  rating: number;
  comments?: string;
  userId?: number;
  bookingId?: number;
  createdAt?: string;
  updatedAt?: string;
  clientName?: string;
  slotDate?: string;
  timeRange?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DEEP FIELD EXTRACTORS
   ═══════════════════════════════════════════════════════════════════════════ */

const deepFindStatus = (b: any): string => {
  if (!b || typeof b !== 'object') return '';
  const keys = [
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
  const timeFields = ['timeRange', 'time_range', 'slotTime', 'slot_time', 'startTime', 'start_time', 'time'];
  for (const nk of nestedKeys) {
    if (b[nk] && typeof b[nk] === 'object') {
      for (const tf of timeFields) {
        if (b[nk][tf]) return String(b[nk][tf]);
      }
    }
  }
  const directTime = [
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

const isBookingExpired = (b: any, now: Date = new Date()): boolean => {
  const dateStr = deepFindDate(b);
  const timeStr = deepFindTime(b);
  if (!dateStr) return false;
  try {
    const rangeMatch = timeStr.match(/[-–]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
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

const deepFindAmount = (b: any): number => {
  const keys = [
    'amount', 'charges', 'fee', 'totalAmount', 'total_amount',
    'price', 'cost', 'consultationFee', 'consultation_fee',
  ];
  for (const k of keys) {
    if (b[k] !== undefined && b[k] !== null) {
      const n = Number(b[k]);
      if (!isNaN(n) && n > 0) return n;
    }
  }
  for (const nk of ['timeSlot', 'timeslot', 'slot', 'consultant']) {
    if (b[nk] && typeof b[nk] === 'object') {
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

const deepFindClientName = (b: any): string => {
  const raw =
    b?.user?.name ||
    b?.user?.username ||
    b?.user?.fullName ||
    b?.client?.name ||
    b?.client?.username ||
    b?.client?.fullName ||
    b?.userName ||
    b?.clientName ||
    b?.customerName ||
    b?.name ||
    b?.clientFullName ||
    b?.customer_name ||
    b?.user?.email ||
    b?.userEmail ||
    b?.client?.email ||
    b?.user?.identifier ||
    (b?.userId ? `User #${b.userId}` : null) ||
    (b?.clientId ? `Client #${b.clientId}` : null) ||
    (b?.user?.id ? `User #${b.user.id}` : null) ||
    `Booking #${b?.id || '?'}`;

  if (raw && raw.includes('@')) {
    return raw.split('@')[0]
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }
  return raw;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatTimeRange = (timeString: string, durationMins = 60): string => {
  if (!timeString) return '—';
  if (/[-–]/.test(timeString) && timeString.length > 5) return timeString;
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
      return `${fmt(start)} – ${fmt(end)}`;
    }
    return timeString;
  }
  const parts = timeString.split(':').map(Number);
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    const start = new Date(); start.setHours(parts[0], parts[1], 0);
    const end = new Date(start.getTime() + durationMins * 60000);
    const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${fmt(start)} – ${fmt(end)}`;
  }
  return timeString;
};

const getStatusColor = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED': return { bg: '#EFF6FF', color: '#2563EB', border: '#93C5FD' };
    case 'BOOKED': return { bg: '#EFF6FF', color: '#2563EB', border: '#93C5FD' };
    case 'PENDING': return { bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' };
    case 'COMPLETED': return { bg: '#F0FDF4', color: '#16A34A', border: '#86EFAC' };
    case 'CANCELLED': return { bg: '#FEF2F2', color: '#EF4444', border: '#FCA5A5' };
    default: return { bg: '#F1F5F9', color: '#64748B', border: '#CBD5E1' };
  }
};

const generateHourlySlots = (shiftStart: string, shiftEnd: string): string[] => {
  if (!shiftStart || !shiftEnd) return [];
  try {
    const [sh, sm] = shiftStart.split(':').map(Number);
    const [eh, em] = shiftEnd.split(':').map(Number);
    const startMins = sh * 60 + (isNaN(sm) ? 0 : sm);
    const endMins = eh * 60 + (isNaN(em) ? 0 : em);
    const result: string[] = [];
    for (let m = startMins; m + 60 <= endMins; m += 60) {
      result.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
    }
    return result;
  } catch { return []; }
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
  const iso = raw.match(/^(\d{1,2}):(\d{2})/);
  if (iso) return `${iso[1].padStart(2, '0')}:${iso[2]}`;
  const ampm = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (ampm) {
    let hh = parseInt(ampm[1]);
    const mm = ampm[2] || '00';
    const ap = ampm[3].toUpperCase();
    if (ap === 'PM' && hh !== 12) hh += 12;
    if (ap === 'AM' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${mm}`;
  }
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
                      if (mode === 'hour') { setTime({ ...time, h: val }); setTimeout(() => setMode('minute'), 300); }
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
// TICKETS TAB
// ─────────────────────────────────────────────────────────────────────────────
const AdvisorTicketsView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [search, setSearch] = useState('');

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
    escalated: tickets.filter((t: any) => t.status === 'ESCALATED').length,
    slaRisk: tickets.filter((t: any) => getSlaInfo(t)?.breached || getSlaInfo(t)?.warning).length,
  };

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: selected ? 340 : '100%', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid #E2E8F0', transition: 'width 0.2s', overflow: 'hidden' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #F1F5F9' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: '#0F172A' }}>My Tickets</h2>
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: '#1E40AF' }}>
            📧 <strong>Email-to-Ticket:</strong> Users can email <strong>support@meetthemasters.in</strong> — emails auto-convert to tickets assigned to you.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 12 }}>
            {[
              { l: 'Total', v: stats.total, c: '#2563EB', bg: '#EFF6FF' },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search…"
            style={{ width: '100%', padding: '8px 12px', border: '1.5px solid #E2E8F0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box', background: '#F8FAFC', marginBottom: 8 }} />
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
            <div style={{ textAlign: 'center', padding: 48, color: '#94A3B8' }}>
              <div style={{ width: 28, height: 28, border: '3px solid #DBEAFE', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 10px' }} />
              Loading tickets…
            </div>
          ) : error ? (
            <div style={{ padding: 20, color: '#B91C1C', fontSize: 13 }}>⚠️ {error}</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#94A3B8' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎫</div>
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
                  background: isSel ? '#EFF6FF' : '#fff',
                  borderLeft: `3px solid ${isSel ? '#2563EB' : sla?.breached ? '#EF4444' : sla?.warning ? '#F59E0B' : 'transparent'}`,
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
                    <span style={{ fontSize: 10, fontWeight: 700, color: sla.breached ? '#DC2626' : sla.warning ? '#D97706' : '#16A34A' }}>
                      {sla.breached ? '⏰ BREACHED' : sla.warning ? `⚠️ ${sla.label}` : '✓ On track'}
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
              setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
              setSelected((prev: any) => prev?.id === id ? { ...prev, status } : prev);
            }}
          />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ADVISOR TICKET DETAIL
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

  const handleSend = async () => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const saved = await postTicketComment(ticket.id, reply.trim(), consultantId, true);
      setComments(p => [...p, saved]);
      setReply('');
      if (localStatus === 'NEW') { setLocalStatus('OPEN'); onStatusChange(ticket.id, 'OPEN'); }

      const userEmail = ticket.user?.email || ticket.userEmail || ticket.email || '';
      if (userEmail) {
        sendTicketCommentEmail({
          ticketId: ticket.id,
          ticketTitle: ticket.category || ticket.title || `Ticket #${ticket.id}`,
          userEmail,
          userName: ticket.user?.name || ticket.userName || '',
          commentPreview: reply.trim().substring(0, 120),
          repliedBy: 'Consultant',
        }).catch(() => { });
      }

      const userId = ticket.userId || ticket.user?.id;
      if (userId) {
        const key = `fin_notifs_USER_${userId}`;
        try {
          const prev = JSON.parse(localStorage.getItem(key) || '[]');
          const newNotif = {
            id: `${Date.now()}_reply_${ticket.id}`,
            type: 'info',
            title: `New Reply - Ticket #${ticket.id}`,
            message: reply.trim().substring(0, 100),
            timestamp: new Date().toISOString(),
            read: false,
            ticketId: ticket.id,
          };
          localStorage.setItem(key, JSON.stringify([newNotif, ...prev].slice(0, 50)));
        } catch { }
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
      showToast(`Status → ${s.replace('_', ' ')}`);

      const userEmail = ticket.user?.email || ticket.userEmail || ticket.email || '';
      if (userEmail) {
        sendTicketStatusEmail({
          ticketId: ticket.id,
          ticketTitle: ticket.category || ticket.title || `Ticket #${ticket.id}`,
          newStatus: s,
          userEmail,
          userName: ticket.user?.name || ticket.userName || '',
          updatedBy: 'Consultant',
        }).catch(() => { });
      }

      const userId = ticket.userId || ticket.user?.id;
      if (userId) {
        const key = `fin_notifs_USER_${userId}`;
        try {
          const prev = JSON.parse(localStorage.getItem(key) || '[]');
          const newNotif = {
            id: `${Date.now()}_status_${ticket.id}`,
            type: s === 'RESOLVED' ? 'success' : s === 'ESCALATED' ? 'error' : 'info',
            title: `Ticket #${ticket.id} Status: ${s.replace('_', ' ')}`,
            message: `Your ticket status has been updated to ${s.replace('_', ' ')}.`,
            timestamp: new Date().toISOString(),
            read: false,
            ticketId: ticket.id,
          };
          localStorage.setItem(key, JSON.stringify([newNotif, ...prev].slice(0, 50)));
        } catch { }
      }
    } catch (e: any) { showToast(e.message || 'Failed.', false); }
    finally { setUpdatingSt(false); }
  };

  const handleNote = async () => {
    if (!noteText.trim()) return;
    setPostingNote(true);
    try {
      const saved = await postInternalNote(ticket.id, noteText.trim(), consultantId);
      setNotes(p => [...p, saved]);
      setNoteText('');
      showToast('🔒 Note saved');
    } catch {
      setNotes(p => [...p, { id: Date.now(), ticketId: ticket.id, authorId: consultantId, noteText: noteText.trim(), createdAt: new Date().toISOString() }]);
      setNoteText(''); showToast('Note saved locally');
    } finally { setPostingNote(false); }
  };

  const handleEscalate = async () => {
    setEscalating(true);
    try {
      await updateTicketStatus(ticket.id, 'ESCALATED');
      setLocalStatus('ESCALATED');
      onStatusChange(ticket.id, 'ESCALATED');
      showToast('🚨 Escalated — supervisor notified');
    } catch (e: any) { showToast(e.message || 'Failed.', false); }
    finally { setEscalating(false); }
  };

  const sla = getSlaInfo({ ...ticket, status: localStatus });
  const sc = getStatusStyle(localStatus);
  const pc = getPriorityStyle(ticket.priority);
  const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      <div style={{ padding: '16px 20px', background: 'linear-gradient(135deg,#1E3A5F,#2563EB)', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#93C5FD', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>Ticket #{ticket.id}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{ticket.category}</div>
            <div style={{ display: 'flex', gap: 5 }}>
              <Badge label={localStatus} style={sc} />
              <Badge label={ticket.priority} style={pc} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 30, height: 30, borderRadius: 8, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
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
          <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.7, background: '#F8FAFC', padding: '10px 14px', borderRadius: 10, borderLeft: '3px solid #BFDBFE' }}>
            {ticket.description}
          </p>
          {ticket.attachmentUrl && (
            <a href={ticket.attachmentUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, fontSize: 12, color: '#2563EB', fontWeight: 600 }}>
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
                  {s.replace('_', ' ')}{active && ' ✓'}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #F1F5F9', background: '#E5DDD5', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16, background: 'rgba(255,255,255,0.7)', padding: '4px 8px', borderRadius: 4, alignSelf: 'center' }}>
            💬 Thread
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#94A3B8', fontSize: 12 }}>Loading…</div>
          ) : comments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#94A3B8', fontSize: 12, fontStyle: 'italic' }}>No messages yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {comments.map((c: any) => {
                const isAgent = c.isConsultantReply || c.authorRole === 'AGENT';
                return (
                  <div key={c.id} style={{ display: 'flex', justifyContent: isAgent ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '85%', padding: '8px 12px', borderRadius: 8,
                      background: isAgent ? '#DCF8C6' : '#FFFFFF',
                      boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)',
                      borderTopRightRadius: isAgent ? 0 : 8,
                      borderTopLeftRadius: isAgent ? 8 : 0,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: isAgent ? '#075E54' : '#2563EB', marginBottom: 2 }}>
                        {isAgent ? 'You (Agent)' : (ticket.user?.name || ticket.userName || 'User')}
                      </div>
                      <div style={{ fontSize: 13, color: '#111', lineHeight: 1.55, wordBreak: 'break-word' }}>{c.message}</div>
                      <div style={{ fontSize: 10, color: '#667781', marginTop: 4, textAlign: 'right' }}>
                        {new Date(c.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
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
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: 8 }}>Reply to Customer</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <textarea value={reply} onChange={e => setReply(e.target.value)} rows={2}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Type reply… (Enter to send)"
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #BFDBFE', borderRadius: 10, fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none', background: '#fff' }} />
            <button onClick={handleSend} disabled={!reply.trim() || sending}
              style={{ padding: '9px 14px', borderRadius: 10, border: 'none', background: !reply.trim() ? '#E2E8F0' : '#2563EB', color: !reply.trim() ? '#94A3B8' : '#fff', fontSize: 13, fontWeight: 700, cursor: !reply.trim() ? 'default' : 'pointer', alignSelf: 'flex-end' }}>
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #FEF9C3', background: '#FFFBEB' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', marginBottom: 10 }}>
            🔒 Internal Notes <span style={{ fontSize: 10, fontWeight: 400, color: '#B45309', textTransform: 'none' }}>(private)</span>
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
              placeholder="Add private note… (Enter to save)"
              style={{ flex: 1, padding: '9px 12px', border: '1.5px solid #FDE68A', borderRadius: 10, fontSize: 13, resize: 'none', fontFamily: 'inherit', outline: 'none', background: '#fff' }} />
            <button onClick={handleNote} disabled={!noteText.trim() || postingNote}
              style={{ padding: '9px 13px', borderRadius: 10, border: 'none', background: !noteText.trim() ? '#F1F5F9' : '#D97706', color: !noteText.trim() ? '#94A3B8' : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-end' }}>
              {postingNote ? '…' : 'Save'}
            </button>
          </div>
        </div>
        <div style={{ padding: '14px 20px', background: '#FFF7ED' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9A3412', textTransform: 'uppercase', marginBottom: 10 }}>🚨 Escalate</div>
          {localStatus === 'ESCALATED' ? (
            <div style={{ fontSize: 12, color: '#B91C1C', fontWeight: 600, padding: '8px 12px', background: '#FEE2E2', borderRadius: 8, border: '1px solid #FECACA' }}>⚠️ Already escalated</div>
          ) : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 12, color: '#78350F', lineHeight: 1.5 }}>
                Can't resolve this? Escalate to supervisor for priority handling.
              </div>
              <button onClick={handleEscalate} disabled={escalating}
                style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                {escalating ? '…' : 'Escalate'}
              </button>
            </div>
          )}
        </div>
      </div>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999 }}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTANT NOTIFICATIONS VIEW
// ─────────────────────────────────────────────────────────────────────────────
const ConsultantNotificationsView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const STORAGE_KEY = `fin_notifs_CONSULTANT_${consultantId}`;

  interface LocalNotif {
    id: string; type: string; title: string; message: string;
    timestamp: string; read: boolean; ticketId?: number;
  }

  const [notifs, setNotifs] = useState<LocalNotif[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    const poll = () => {
      try {
        const fresh: LocalNotif[] = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        setNotifs(fresh);
      } catch { }
    };
    const interval = setInterval(poll, 10_000);
    window.addEventListener('focus', poll);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', poll);
    };
  }, [STORAGE_KEY]);

  const markAllRead = () => {
    const updated = notifs.map(n => ({ ...n, read: true }));
    setNotifs(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const clearAll = () => {
    setNotifs([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  const unread = notifs.filter(n => !n.read).length;

  const TYPE_CFG: Record<string, { color: string; bg: string; border: string; icon: string }> = {
    info: { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: 'ℹ️' },
    success: { color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC', icon: '✅' },
    warning: { color: '#D97706', bg: '#FFFBEB', border: '#FCD34D', icon: '⚠️' },
    error: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: '🚨' },
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
            <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}>
              {unread} unread notification{unread !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {unread > 0 && (
            <button onClick={markAllRead} style={{ padding: '7px 14px', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
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
      {notifs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: 16, color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
          <p style={{ margin: 0, fontWeight: 600, color: '#64748B' }}>No notifications yet</p>
          <p style={{ fontSize: 12, marginTop: 8 }}>When the admin assigns a ticket or sends an update, you'll see it here.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {notifs.map(n => {
            const cfg = TYPE_CFG[n.type] || TYPE_CFG.info;
            return (
              <div key={n.id} style={{
                background: n.read ? '#fff' : cfg.bg,
                border: `1.5px solid ${n.read ? '#F1F5F9' : cfg.border}`,
                borderLeft: `4px solid ${cfg.color}`,
                borderRadius: 12, padding: '14px 18px',
                display: 'flex', gap: 14, alignItems: 'flex-start',
              }}>
                <div style={{ fontSize: 22, flexShrink: 0, lineHeight: 1.2 }}>{cfg.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: cfg.color, marginBottom: 3 }}>
                    {n.title}
                    {!n.read && <span style={{ marginLeft: 6, width: 6, height: 6, borderRadius: '50%', background: cfg.color, display: 'inline-block', verticalAlign: 'middle' }} />}
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, wordBreak: 'break-word' }}>{n.message}</div>
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 6 }}>{timeAgo(n.timestamp)}</div>
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
const BookingsView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleDelete = async (bookingId: number) => {
    if (!window.confirm('Delete this booking? This cannot be undone.')) return;
    setDeletingId(bookingId);
    try {
      const token = localStorage.getItem('fin_token');
      const res = await fetch(`http://52.55.178.31:8081/api/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok || res.status === 204) {
        setBookings(prev => prev.filter(b => b.id !== bookingId));
      } else {
        alert('Could not delete booking. Please try again.');
      }
    } catch {
      alert('Network error — could not delete booking.');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await getBookingsByConsultant(consultantId);
        const arr = extractArray(data);
        if (arr.length > 0) console.log('📋 FIRST BOOKING (raw):', JSON.stringify(arr[0], null, 2));

        const token = localStorage.getItem('fin_token');
        const authHeaders = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

        const enriched = await Promise.all(arr.map(async (b: any) => {
          let enrichedBooking = { ...b };
          if (!b.user?.name && !b.user?.username && !b.userName && !b.clientName && !b.client?.name) {
            const uid = b.userId || b.user?.id || b.clientId;
            if (uid) {
              try {
                const res = await fetch(`http://52.55.178.31:8081/api/users/${uid}`, { headers: authHeaders });
                if (res.ok) {
                  const u = await res.json();
                  enrichedBooking.user = { id: u.id, name: u.name || u.fullName || u.identifier, email: u.email || u.identifier, username: u.username || u.identifier };
                }
              } catch { /* skip */ }
            }
          }
          const hasDate = deepFindDate(enrichedBooking);
          const hasTime = deepFindTime(enrichedBooking);
          if (!hasDate || !hasTime) {
            const tsId = b.timeSlotId || b.timeslotId || b.time_slot_id || b.slotId || b.slot_id || b.timeSlot?.id || b.timeslot?.id || b.slot?.id;
            if (tsId) {
              try {
                const tsRes = await fetch(`http://52.55.178.31:8081/api/timeslots/${tsId}`, { headers: authHeaders });
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
        setBookings(enriched);
      } catch (e: any) {
        setError(e?.message || 'Could not load bookings. Please try again.');
      } finally { setLoading(false); }
    })();
  }, [consultantId]);

  const activeBookings = bookings.filter((b: any) => {
    const st = deepFindStatus(b);
    if (st === 'COMPLETED' || st === 'CANCELLED') return false;
    return !isBookingExpired(b, now);
  });
  const historyBookings = bookings.filter((b: any) => {
    const st = deepFindStatus(b);
    if (st === 'COMPLETED' || st === 'CANCELLED') return true;
    return isBookingExpired(b, now);
  });

  const visibleBookings = filter === 'HISTORY' ? historyBookings : activeBookings;
  const filtered = filter === 'ALL'
    ? visibleBookings
    : filter === 'HISTORY'
      ? historyBookings
      : visibleBookings.filter((b: any) => {
        const st = deepFindStatus(b);
        if (filter === 'CONFIRMED') return st === 'CONFIRMED' || st === 'BOOKED';
        return st === filter;
      });

  const counts: Record<string, number> = {
    ALL: activeBookings.length,
    PENDING: activeBookings.filter((b: any) => deepFindStatus(b) === 'PENDING').length,
    CONFIRMED: activeBookings.filter((b: any) => ['CONFIRMED', 'BOOKED'].includes(deepFindStatus(b))).length,
    COMPLETED: bookings.filter((b: any) => deepFindStatus(b) === 'COMPLETED').length,
    CANCELLED: bookings.filter((b: any) => deepFindStatus(b) === 'CANCELLED').length,
    HISTORY: historyBookings.length,
  };

  const totalRevenue = bookings
    .filter((b: any) => deepFindStatus(b) === 'COMPLETED')
    .reduce((sum: number, b: any) => sum + deepFindAmount(b), 0);

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>My Bookings</h2>
        <span style={{ fontSize: 13, color: '#64748B' }}>{bookings.length} total session{bookings.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12, marginBottom: 22 }}>
        {[
          { label: 'Upcoming', value: String(counts.ALL), color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Pending', value: String(counts.PENDING), color: '#D97706', bg: '#FFFBEB' },
          { label: 'Confirmed', value: String(counts.CONFIRMED), color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Completed', value: String(counts.COMPLETED), color: '#16A34A', bg: '#F0FDF4' },
          { label: 'Revenue', value: `₹${totalRevenue.toLocaleString()}`, color: '#16A34A', bg: '#F0FDF4' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'ALL', label: `ALL (${counts.ALL})` },
          { key: 'PENDING', label: `PENDING (${counts.PENDING})` },
          { key: 'CONFIRMED', label: `CONFIRMED (${counts.CONFIRMED})` },
          { key: 'HISTORY', label: `HISTORY (${counts.HISTORY})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '6px 16px', borderRadius: 20, border: '1.5px solid',
            borderColor: filter === f.key ? '#2563EB' : '#E2E8F0',
            background: filter === f.key ? '#2563EB' : '#fff',
            color: filter === f.key ? '#fff' : '#64748B',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {f.label}
          </button>
        ))}
      </div>
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
          Loading your bookings…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: 16, color: '#94A3B8' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {bookings.length === 0 ? 'No bookings yet.' : `No ${filter.toLowerCase()} bookings.`}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map((booking: any, idx: number) => {
            const status = deepFindStatus(booking);
            const sc = getStatusColor(status);
            const clientName = deepFindClientName(booking);
            const date = deepFindDate(booking) || '—';
            const rawTime = deepFindTime(booking);
            const timeDisplay = rawTime ? formatTimeRange(rawTime, booking.durationMinutes || 60) : '—';
            const amount = deepFindAmount(booking);
            return (
              <div key={booking.id || idx} style={{
                background: '#fff', border: '1px solid #F1F5F9',
                borderLeft: `4px solid ${sc.border}`, borderRadius: 14,
                padding: '18px 20px', display: 'flex', alignItems: 'center',
                gap: 16, flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                  {clientName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 4 }}>Session with {clientName}</div>
                  <div style={{ fontSize: 13, color: '#64748B', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span>📅 {date}</span>
                    <span>🕐 {timeDisplay}</span>
                    {amount > 0 && <span style={{ color: '#16A34A', fontWeight: 600 }}>₹{amount.toLocaleString()}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>
                    🔗 Room: <span style={{ fontFamily: 'monospace', color: '#2563EB' }}>meetthemasters-booking-{booking.id}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ padding: '5px 14px', borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                    {status || 'UNKNOWN'}
                  </span>
                  {status !== 'CANCELLED' && (
                    <a href={booking.meetingLink || booking.jitsiLink || booking.joinUrl || `https://meet.jit.si/meetthemasters-booking-${booking.id}`}
                      target="_blank" rel="noreferrer"
                      style={{ padding: '7px 16px', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 2px 8px rgba(37,99,235,0.3)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14" />
                        <rect x="3" y="6" width="12" height="12" rx="2" />
                      </svg>
                      Join Meeting
                    </a>
                  )}
                  <button onClick={() => handleDelete(booking.id)} disabled={deletingId === booking.id} title="Delete this booking"
                    style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid #FECACA', background: deletingId === booking.id ? '#FEF2F2' : '#fff', color: '#EF4444', cursor: deletingId === booking.id ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0, transition: 'all 0.15s' }}>
                    {deletingId === booking.id ? '…' : '🗑'}
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

// ── 30-day pool + 7-visible window ───────────────────────────────────────────
const ALL_SCHEDULE_DAYS = (() => {
  const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const out: { iso: string; wd: string; day: string; mon: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      wd: DAY_NAMES[d.getDay()],
      day: String(d.getDate()).padStart(2, '0'),
      mon: MONTH_NAMES[d.getMonth()],
    });
  }
  return out;
})();
const SCHEDULE_VISIBLE = 7;
const DEFAULT_SCHEDULE_DAY = ALL_SCHEDULE_DAYS.find(d => d.wd !== 'SUN')?.iso ?? ALL_SCHEDULE_DAYS[0].iso;

// ─────────────────────────────────────────────────────────────────────────────
// MY SCHEDULE
// ─────────────────────────────────────────────────────────────────────────────
const MySlotsView: React.FC<{
  consultantId: number;
  shiftStartTime: string;
  shiftEndTime: string;
}> = ({ consultantId, shiftStartTime, shiftEndTime }) => {
  const [dbSlots, setDbSlots] = useState<TimeSlotRecord[]>([]);
  const [masterSlots, setMasterSlots] = useState<MasterSlot[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayOffset, setDayOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState<string>(DEFAULT_SCHEDULE_DAY);
  const [togglingSlot, setTogglingSlot] = useState<string | null>(null);
  const [slotToast, setSlotToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [newSlotTime, setNewSlotTime] = useState('');
  const [addingSlot, setAddingSlot] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<{ slotDate: string; slotTime: string }[]>([]);
  const [unavailableSlots, setUnavailableSlots] = useState<{ slotDate: string; slotTime: string }[]>([]);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const showSlotToast = (msg: string, ok = true) => {
    setSlotToast({ msg, ok });
    setTimeout(() => setSlotToast(null), 3000);
  };

  const handleMarkUnavailable = async (slotDate: string, slotStart: string) => {
    const key = `${slotDate}|${slotStart}`;
    setActionLoading(key);
    try {
      const slotTimeFull = slotStart.length === 5 ? `${slotStart}:00` : slotStart;
      const matchedMaster = masterSlots.find(ms => {
        const startPart = ms.timeRange.split(/[-–]/)[0].trim();
        return normaliseTimeKey(startPart) === slotStart;
      });
      const existing = dbSlots.find(s => {
        if (s.slotDate !== slotDate) return false;
        const dbSlotTime = (s as any).slotTime ? String((s as any).slotTime).substring(0, 5) : '';
        if (dbSlotTime && dbSlotTime === slotStart) return true;
        if (matchedMaster && s.masterTimeSlotId === matchedMaster.id) return true;
        const normTR = normaliseTimeKey((s.timeRange || '').split(/[-–]/)[0].trim());
        return normTR === slotStart;
      });
      if (existing) {
        await apiFetch(`/timeslots/${existing.id}`, { method: 'PUT', body: JSON.stringify({ ...existing, status: 'UNAVAILABLE' }) });
      } else {
        if (!matchedMaster) {
          showSlotToast('⚠️ No matching master time range found. Add it in "Master Time Ranges" tab first.', false);
          setActionLoading(null);
          return;
        }
        await apiFetch('/timeslots', { method: 'POST', body: JSON.stringify({ consultantId, slotDate, slotTime: slotTimeFull, durationMinutes: 60, status: 'UNAVAILABLE', masterTimeSlotId: matchedMaster.id }) });
      }
      setUnavailableSlots(prev => [...prev, { slotDate, slotTime: slotStart }]);
      showSlotToast('✓ Slot blocked');
      await loadData();
    } catch (err: any) {
      showSlotToast(`Failed to block slot: ${err.message}`, false);
    } finally { setActionLoading(null); }
  };

  const handleMarkAvailable = async (slotDate: string, slotStart: string) => {
    const key = `${slotDate}|${slotStart}`;
    setActionLoading(key);
    try {
      const matchedMaster = masterSlots.find(ms => {
        const startPart = ms.timeRange.split(/[-–]/)[0].trim();
        return normaliseTimeKey(startPart) === slotStart;
      });
      const existing = dbSlots.find(s => {
        if (s.slotDate !== slotDate) return false;
        const dbSlotTime = (s as any).slotTime ? String((s as any).slotTime).substring(0, 5) : '';
        if (dbSlotTime && dbSlotTime === slotStart) return true;
        if (matchedMaster && s.masterTimeSlotId === matchedMaster.id) return true;
        const normTR = normaliseTimeKey((s.timeRange || '').split(/[-–]/)[0].trim());
        return normTR === slotStart;
      });
      if (existing) {
        await apiFetch(`/timeslots/${existing.id}`, { method: 'PUT', body: JSON.stringify({ ...existing, status: 'AVAILABLE' }) });
        setUnavailableSlots(prev => prev.filter(u => !(u.slotDate === slotDate && u.slotTime === slotStart)));
        showSlotToast('✓ Slot restored');
        await loadData();
      } else {
        showSlotToast('⚠️ Slot record not found to restore.', false);
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
      let masterLookup: Record<number, string> = {};
      try {
        const mData = await apiFetch('/master-timeslots?page=0&size=100');
        const mArr = extractArray(mData);
        mArr.forEach((m: any) => { if (m.id && m.timeRange) masterLookup[m.id] = m.timeRange; });
        setMasterSlots(mArr);
      } catch { }
      try {
        const slotData = await apiFetch(`/timeslots/consultant/${consultantId}`);
        slotArr = extractArray(slotData);
        setDbSlots(slotArr.map((s: any) => ({ ...s, timeRange: (s.timeRange && s.timeRange !== 'Unknown Time') ? s.timeRange : (masterLookup[s.masterTimeSlotId] || '') })));
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
            const r = await fetch(`http://52.55.178.31:8081/api/timeslots/${tsId}`, { headers: authH });
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

  useEffect(() => { if (consultantId) loadData(); }, [consultantId]);

  const fmtTime = (t: string) => {
    if (!t) return '—';
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

  const hourlySlotTimes = generateHourlySlots(shiftStartTime.substring(0, 5), shiftEndTime.substring(0, 5));

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
  const visibleDays = ALL_SCHEDULE_DAYS.slice(dayOffset, dayOffset + SCHEDULE_VISIBLE);
  const activeDateKey = selectedDate || DEFAULT_SCHEDULE_DAY;
  const isActiveSunday = ALL_SCHEDULE_DAYS.find(d => d.iso === activeDateKey)?.wd === 'SUN';

  let totalCount = 0, availableCount = 0, bookedCount = 0;
  if (hasShift) {
    visibleDays.forEach(d => {
      if (d.wd === 'SUN') return;
      hourlySlotTimes.forEach(t => {
        totalCount++;
        const key = `${d.iso}|${t}`;
        if (bookedSlotSet.has(key) || unavailSlotSet.has(key) || bookedByClientSet.has(key) || manuallyDisabledSet.has(key)) bookedCount++;
        else availableCount++;
      });
    });
  }

  const handleToggleSlot = async (slotStart: string) => {
    const key = `${activeDateKey}|${slotStart}`;
    if (bookedByClientSet.has(key)) {
      showSlotToast('⚠️ This slot is booked by a client and cannot be changed.', false);
      return;
    }
    setTogglingSlot(key);
    const slotTimeFull = slotStart.length === 5 ? `${slotStart}:00` : slotStart;
    const isCurrentlyUnavailable = manuallyDisabledSet.has(key);
    const newStatus = isCurrentlyUnavailable ? 'AVAILABLE' : 'UNAVAILABLE';
    const matchedMaster = masterSlots.find(ms => {
      const startPart = ms.timeRange.split(/[-–]/)[0].trim();
      return normaliseTimeKey(startPart) === slotStart;
    });
    try {
      const existing = dbSlots.find(s => {
        if (s.slotDate !== activeDateKey) return false;
        const dbSlotTime = (s as any).slotTime ? String((s as any).slotTime).substring(0, 5) : '';
        if (dbSlotTime && dbSlotTime === slotStart) return true;
        if (matchedMaster && s.masterTimeSlotId === matchedMaster.id) return true;
        const normTR = normaliseTimeKey((s.timeRange || '').split(/[-–]/)[0].trim());
        if (normTR && normTR === slotStart) return true;
        return false;
      });
      if (existing) {
        await apiFetch(`/timeslots/${existing.id}`, { method: 'PUT', body: JSON.stringify({ ...existing, status: newStatus }) });
      } else {
        if (!matchedMaster) {
          showSlotToast('⚠️ No matching master time range. Add this time in "Master Time Ranges" tab first.', false);
          setTogglingSlot(null);
          return;
        }
        await apiFetch('/timeslots', { method: 'POST', body: JSON.stringify({ consultantId, slotDate: activeDateKey, slotTime: slotTimeFull, durationMinutes: 60, status: newStatus, masterTimeSlotId: matchedMaster.id }) });
      }
      showSlotToast(newStatus === 'AVAILABLE' ? '✓ Slot marked as available' : '✓ Slot marked as unavailable');
      await loadData();
    } catch (e: any) {
      showSlotToast(e?.message || 'Failed to update slot.', false);
    } finally { setTogglingSlot(null); }
  };

  const handleAddCustomSlot = async () => {
    if (!newSlotTime) return;
    setAddingSlot(true);
    const slotTimeFull = newSlotTime.length === 5 ? `${newSlotTime}:00` : newSlotTime;
    const matchedMaster = masterSlots.find(ms => normaliseTimeKey(ms.timeRange.split(/[-–]/)[0].trim()) === newSlotTime);
    try {
      const payload: any = { consultantId, slotDate: activeDateKey, slotTime: slotTimeFull, durationMinutes: 60, status: 'AVAILABLE' };
      if (matchedMaster) payload.masterTimeSlotId = matchedMaster.id;
      await apiFetch('/timeslots', { method: 'POST', body: JSON.stringify(payload) });
      showSlotToast('✓ New slot added successfully!');
      setNewSlotTime('');
      setShowAddSlot(false);
      await loadData();
    } catch (e: any) {
      showSlotToast(e?.message || 'Failed to add slot.', false);
    } finally { setAddingSlot(false); }
  };

  const customSlots = getCustomSlotsForDate(activeDateKey);
  const allSlotTimes = [...new Set([...hourlySlotTimes, ...customSlots])].sort();

  const renderSlotButton = (slotDate: string, slotStart: string) => {
    const key = `${slotDate}|${slotStart}`;
    const isBooked = bookedSlotSet.has(key) || bookedByClientSet.has(key);
    const isUnavail = !isBooked && (unavailSlotSet.has(key) || manuallyDisabledSet.has(key));
    const isLoading = actionLoading === key || togglingSlot === key;
    const isCustom = !hourlySlotTimes.includes(slotStart);
    const endH = parseInt(slotStart.split(':')[0]) + 1;
    const endStr = `${String(endH).padStart(2, '0')}:${slotStart.split(':')[1]}`;
    const label = `${fmt24to12(slotStart)} – ${fmt24to12(endStr)}`;

    if (isBooked) {
      return (
        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ padding: '10px 6px', borderRadius: 100, background: '#2563EB', border: '1.5px solid #1D4ED8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
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
            {isLoading ? '…' : '✓ Restore'}
          </button>
        </div>
      );
    }
    return (
      <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ padding: '10px 6px', borderRadius: 100, background: '#fff', border: '1.5px solid #BFDBFE', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#334155' }}>{label}</span>
          {isCustom && <span style={{ fontSize: 8, fontWeight: 800, color: '#10B981', background: '#D1FAE5', borderRadius: 4, padding: '1px 5px' }}>CUSTOM</span>}
        </div>
        <button onClick={() => handleMarkUnavailable(slotDate, slotStart)} disabled={isLoading} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #FBBF24', background: '#FFFBEB', color: '#92400E', fontSize: 9, fontWeight: 700, cursor: isLoading ? 'default' : 'pointer', fontFamily: 'inherit', width: '100%', opacity: isLoading ? 0.6 : 1 }}>
          {isLoading ? '…' : 'Block'}
        </button>
      </div>
    );
  };

  return (
    <div className="advisor-content-container">
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setShowAddSlot(v => !v)} style={{ padding: '7px 14px', background: showAddSlot ? '#F1F5F9' : '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {showAddSlot ? '✕ Cancel' : '+ Add Slot'}
        </button>
        <button onClick={loadData} style={{ padding: '7px 16px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          🔄 Refresh
        </button>
      </div>
      {showAddSlot && (
        <div style={{ background: '#F8FAFC', border: '1.5px dashed #BFDBFE', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Add Custom Slot for {activeDateKey}</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="time" value={newSlotTime} onChange={e => setNewSlotTime(e.target.value)} style={{ padding: '9px 14px', border: '1.5px solid #BFDBFE', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff' }} />
            <button onClick={handleAddCustomSlot} disabled={!newSlotTime || addingSlot} style={{ padding: '9px 20px', background: !newSlotTime || addingSlot ? '#E2E8F0' : '#2563EB', color: !newSlotTime || addingSlot ? '#94A3B8' : '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: !newSlotTime || addingSlot ? 'default' : 'pointer' }}>
              {addingSlot ? 'Adding…' : '+ Add Slot'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
          <button onClick={loadData} style={{ marginLeft: 'auto', padding: '4px 12px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer', float: 'right' }}>Retry</button>
        </div>
      )}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #DBEAFE', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
          Loading your slots…
        </div>
      ) : !hasShift && allSlotTimes.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: 14, color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🗓️</div>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#64748B', fontSize: 15 }}>Shift timings not set</p>
          <p style={{ margin: 0, fontSize: 13 }}>Go to Profile tab → set Shift Start &amp; End.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { label: 'Total (7 days)', value: totalCount, color: '#2563EB', bg: '#EFF6FF' },
              { label: 'Available', value: availableCount, color: '#16A34A', bg: '#F0FDF4' },
              { label: 'Unavailable', value: bookedCount, color: '#64748B', bg: '#F1F5F9' },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}22`, borderRadius: 10, padding: '10px 18px', minWidth: 115 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(37,99,235,0.12)' }}>
            <div style={{ background: 'linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)', padding: '20px 24px 18px' }}>
              <p style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#93C5FD', margin: '0 0 4px', fontWeight: 700 }}>My Schedule</p>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>My Schedule Slots</h3>
              <p style={{ fontSize: 13, color: '#BFDBFE', margin: 0 }}>
                {shiftStartTime ? `Shift: ${fmtTime(shiftStartTime)} → ${fmtTime(shiftEndTime)}` : 'Configure your shift in Profile tab'}
                {hasShift && <span style={{ marginLeft: 10, fontSize: 12, color: '#60A5FA' }}>· {hourlySlotTimes.length} slots/day</span>}
              </p>
            </div>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 12px' }}>Step 1 — Select Date</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button disabled={dayOffset === 0} onClick={() => setDayOffset(o => Math.max(0, o - 1))} style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, border: `1.5px solid ${dayOffset === 0 ? '#F1F5F9' : '#BFDBFE'}`, background: '#fff', cursor: dayOffset === 0 ? 'default' : 'pointer', color: dayOffset === 0 ? '#CBD5E1' : '#2563EB', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
                <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                  {visibleDays.map(d => {
                    const isActive = d.iso === activeDateKey;
                    const isToday = d.iso === ALL_SCHEDULE_DAYS[0].iso;
                    const isSunday = d.wd === 'SUN';
                    return (
                      <button key={d.iso} disabled={isSunday} onClick={() => !isSunday && setSelectedDate(d.iso)} title={isSunday ? 'No slots on Sundays' : undefined} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px', borderRadius: 10, gap: 2, border: `1.5px solid ${isActive && !isSunday ? '#2563EB' : '#E2E8F0'}`, background: isSunday ? '#F8FAFC' : isActive ? '#2563EB' : '#F8FAFC', cursor: isSunday ? 'not-allowed' : 'pointer', fontFamily: 'inherit', outline: 'none', transition: 'all 0.2s', minHeight: 72, opacity: isSunday ? 0.38 : 1 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: isSunday ? '#CBD5E1' : isActive ? '#BFDBFE' : '#94A3B8' }}>{d.wd}</span>
                        <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1, color: isSunday ? '#CBD5E1' : isActive ? '#fff' : '#0F172A' }}>{d.day}</span>
                        {isSunday ? <span style={{ fontSize: 8, fontWeight: 800, color: '#CBD5E1' }}>OFF</span> : isToday && !isActive ? <span style={{ fontSize: 8, fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '1px 4px', borderRadius: 4 }}>TODAY</span> : <span style={{ fontSize: 9, color: isActive ? '#BFDBFE' : '#94A3B8' }}>{d.mon}</span>}
                      </button>
                    );
                  })}
                </div>
                <button disabled={dayOffset >= ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE} onClick={() => setDayOffset(o => Math.min(ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE, o + 1))} style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, border: `1.5px solid ${dayOffset >= ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE ? '#F1F5F9' : '#BFDBFE'}`, background: '#fff', cursor: dayOffset >= ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE ? 'default' : 'pointer', color: dayOffset >= ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE ? '#CBD5E1' : '#2563EB', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
              </div>
            </div>
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 10px' }}>Step 2 — Select Time</p>
              {isActiveSunday ? (
                <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 12, padding: '20px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🚫</div>
                  <p style={{ fontWeight: 700, margin: '0 0 4px', color: '#DC2626', fontSize: 14 }}>No slots on Sundays</p>
                  <p style={{ fontSize: 12, margin: 0, color: '#EF4444' }}>Please select a weekday (Monday – Saturday).</p>
                </div>
              ) : allSlotTimes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 20px', color: '#94A3B8', fontSize: 13 }}>No slots for this date.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
                    {[{ label: 'Available', bg: '#fff', border: '#BFDBFE' }, { label: 'Booked', bg: '#2563EB', border: '#1D4ED8' }, { label: 'Unavailable', bg: '#FEE2E2', border: '#FCA5A5' }].map(l => (
                      <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 13, height: 13, borderRadius: 3, background: l.bg, border: `1.5px solid ${l.border}` }} />
                        <span style={{ fontSize: 11, color: '#64748B' }}>{l.label}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                    {allSlotTimes.map(slotStart => renderSlotButton(activeDateKey, slotStart))}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
      {slotToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: slotToast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999 }}>
          {slotToast.msg}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MASTER TIME RANGES
// ─────────────────────────────────────────────────────────────────────────────
const MasterSlotsView: React.FC = () => {
  const [masterSlots, setMasterSlots] = useState<MasterSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [newRange, setNewRange] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const load = async () => {
    setLoading(true); setMasterError(null);
    try { const data = await getMasterTimeslots(); setMasterSlots(extractArray(data)); }
    catch (e: any) { setMasterError(e?.message || 'Failed.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => { if (!newRange.trim()) return; try { await createMasterTimeslot(newRange.trim()); setNewRange(''); await load(); showToast('Added!'); } catch (e: any) { showToast(e?.message || 'Failed.', false); } };
  const handleUpdate = async (id: number) => { if (!editValue.trim()) return; try { await updateMasterTimeslot(id, editValue.trim()); setEditingId(null); await load(); showToast('Updated!'); } catch (e: any) { showToast(e?.message || 'Failed.', false); } };
  const handleDelete = async (id: number) => { if (!window.confirm('Delete this time range?')) return; try { await deleteMasterTimeslot(id); await load(); showToast('Deleted!'); } catch (e: any) { showToast(e?.message || 'Failed.', false); } };

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>Master Time Ranges</h2>
        <span style={{ fontSize: 13, color: '#64748B' }}>{masterSlots.length} defined</span>
      </div>
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 20 }}>ℹ️</span>
        <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>
          <strong>How it works:</strong> These ranges appear in the user booking picker. Add formats like <em>"9 AM – 10 AM"</em>.
        </div>
      </div>
      {masterError && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>⚠️ {masterError}</div>}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94A3B8' }}><div style={{ width: 28, height: 28, border: '3px solid #DBEAFE', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />Loading…</div>
      ) : masterSlots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#F8FAFC', borderRadius: 14, color: '#94A3B8', marginBottom: 24 }}><div style={{ fontSize: 40, marginBottom: 10 }}>🕐</div><p style={{ margin: 0, fontWeight: 600, color: '#64748B' }}>No time ranges yet</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {masterSlots.map((ms, idx) => (
            <div key={ms.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</div>
              {editingId === ms.id ? (
                <>
                  <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleUpdate(ms.id); if (e.key === 'Escape') setEditingId(null); }} style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #2563EB', borderRadius: 8, fontSize: 13, outline: 'none' }} />
                  <button onClick={() => handleUpdate(ms.id)} style={{ padding: '7px 16px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingId(null)} style={{ padding: '7px 14px', background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{ms.timeRange}</div></div>
                  <button onClick={() => { setEditingId(ms.id); setEditValue(ms.timeRange); }} style={{ padding: '6px 14px', border: '1px solid #DBEAFE', borderRadius: 8, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✎ Edit</button>
                  <button onClick={() => handleDelete(ms.id)} style={{ padding: '6px 14px', border: '1px solid #FECACA', borderRadius: 8, background: '#FEF2F2', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✕ Delete</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ background: '#F8FAFC', border: '1.5px dashed #BFDBFE', borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', marginBottom: 12, textTransform: 'uppercase' }}>+ Add New Time Range</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={newRange} onChange={e => setNewRange(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} placeholder='e.g. 9 AM – 10 AM' style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #BFDBFE', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff' }} />
          <button onClick={handleAdd} disabled={!newRange.trim()} style={{ padding: '10px 22px', background: !newRange.trim() ? '#E2E8F0' : '#2563EB', color: !newRange.trim() ? '#94A3B8' : '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: !newRange.trim() ? 'default' : 'pointer' }}>Add Range</button>
        </div>
      </div>
      {toast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999 }}>{toast.ok ? '✓' : '✕'} {toast.msg}</div>}
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

  const loadFeedbacks = async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiFetch(`/feedbacks/consultant/${consultantId}`);
      const arr = extractArray(data);
      if (arr.length === 0) { setFeedbacks([]); return; }
      let bookingMap: Record<number, { clientName: string; slotDate: string; timeRange: string }> = {};
      try {
        const bData = await apiFetch(`/bookings/consultant/${consultantId}`);
        const bArr = extractArray(bData);
        bArr.forEach((b: any) => { bookingMap[b.id] = { clientName: deepFindClientName(b), slotDate: deepFindDate(b), timeRange: deepFindTime(b) }; });
      } catch { }
      const enriched: FeedbackItem[] = await Promise.all(arr.map(async (f: any) => {
        const ctx = f.bookingId ? bookingMap[f.bookingId] : undefined;
        let clientName = ctx?.clientName || '';
        if (!clientName && f.userId) {
          try {
            const token = localStorage.getItem('fin_token');
            const res = await fetch(`http://52.55.178.31:8081/api/users/${f.userId}`, { headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
            if (res.ok) {
              const u = await res.json();
              const raw = u.name || u.fullName || u.username || u.email || '';
              clientName = raw.includes('@') ? raw.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : raw;
            }
          } catch { }
        }
        if (!clientName && f.userId) clientName = `User #${f.userId}`;
        return { ...f, rating: Number(f.rating || 0), clientName: clientName || 'Anonymous', slotDate: ctx?.slotDate || f.createdAt?.split('T')[0] || '', timeRange: ctx?.timeRange || '' };
      }));
      enriched.sort((a, b) => b.id - a.id);
      setFeedbacks(enriched);
    } catch (e: any) {
      setError(e?.message || 'Failed to load feedbacks.');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (consultantId) loadFeedbacks(); }, [consultantId]);

  const displayed = filterRating === 0 ? feedbacks : feedbacks.filter(f => Math.round(f.rating) === filterRating);
  const avgRating = feedbacks.length > 0 ? (feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1) : '—';
  const ratingCounts = [5, 4, 3, 2, 1].map(r => ({ r, count: feedbacks.filter(f => Math.round(f.rating) === r).length }));

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>Client Feedbacks</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#64748B' }}>{feedbacks.length} review{feedbacks.length !== 1 ? 's' : ''}</span>
          <button onClick={loadFeedbacks} style={{ padding: '7px 16px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>🔄 Refresh</button>
        </div>
      </div>
      {feedbacks.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)', borderRadius: 16, padding: '22px 24px', marginBottom: 24, display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap', color: '#fff' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: '#FCD34D' }}>{avgRating}</div>
            <StarDisplay rating={Math.round(Number(avgRating))} size={18} />
            <div style={{ fontSize: 12, color: '#93C5FD', marginTop: 4 }}>Overall</div>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            {ratingCounts.map(({ r, count }) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#BFDBFE', width: 6 }}>{r}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B" strokeWidth="0"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${feedbacks.length ? (count / feedbacks.length) * 100 : 0}%`, height: '100%', background: '#FCD34D', borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 12, color: '#93C5FD', width: 20, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 28, fontWeight: 700 }}>{feedbacks.length}</div><div style={{ fontSize: 12, color: '#93C5FD' }}>Total</div></div>
        </div>
      )}
      {feedbacks.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[0, 5, 4, 3, 2, 1].map(r => (
            <button key={r} onClick={() => setFilterRating(r)} style={{ padding: '6px 16px', borderRadius: 20, border: '1.5px solid', borderColor: filterRating === r ? '#2563EB' : '#E2E8F0', background: filterRating === r ? '#2563EB' : '#fff', color: filterRating === r ? '#fff' : '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {r === 0 ? `All (${feedbacks.length})` : <>{r}★ ({ratingCounts.find(x => x.r === r)?.count || 0})</>}
            </button>
          ))}
        </div>
      )}
      {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>⚠️ {error}</div>}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}><div style={{ width: 32, height: 32, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />Loading…</div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: 16, color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
          <p style={{ margin: 0, fontWeight: 600 }}>{feedbacks.length === 0 ? 'No feedbacks yet.' : `No ${filterRating}-star reviews.`}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {displayed.map(fb => (
            <div key={fb.id} style={{ background: '#fff', border: '1px solid #F1F5F9', borderLeft: `4px solid ${fb.rating >= 4 ? '#86EFAC' : fb.rating >= 3 ? '#FCD34D' : '#FCA5A5'}`, borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, flexShrink: 0 }}>
                  {(fb.clientName || 'A').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{fb.clientName}</span>
                    <StarDisplay rating={Math.round(fb.rating)} size={15} />
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: fb.rating >= 4 ? '#F0FDF4' : fb.rating >= 3 ? '#FFFBEB' : '#FEF2F2', color: fb.rating >= 4 ? '#16A34A' : fb.rating >= 3 ? '#D97706' : '#EF4444' }}>
                      {ratingLabel(Math.round(fb.rating))}
                    </span>
                  </div>
                  {(fb.slotDate || fb.timeRange) && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      {fb.slotDate && <span style={{ fontSize: 12, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 10px', borderRadius: 20 }}>📅 {fb.slotDate}</span>}
                      {fb.timeRange && <span style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px 10px', borderRadius: 20 }}>🕐 {fb.timeRange}</span>}
                    </div>
                  )}
                  {fb.comments ? <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.65, background: '#F8FAFC', borderRadius: 10, padding: '10px 14px', borderLeft: '3px solid #DBEAFE' }}>"{fb.comments}"</p>
                    : <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>No written comment.</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE VIEW
// ─────────────────────────────────────────────────────────────────────────────
const ProfileView: React.FC<{ profile: Consultant | null; onUpdate: () => void }> = ({ profile, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saveToast, setSaveToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [formError, setFormError] = useState<string>('');
  const [timePickerConfig, setTimePickerConfig] = useState<{ isOpen: boolean; field: 'shiftStart' | 'shiftEnd' | null; value: string }>({ isOpen: false, field: null, value: '' });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const showSaveToast = (msg: string, ok = true) => { setSaveToast({ msg, ok }); setTimeout(() => setSaveToast(null), 3500); };

  const initForm = (p: any) => {
    const trimTime = (t: string | null | undefined) => t ? String(t).substring(0, 5) : '';
    const base = parseFloat(p.charges || '0');
    setFormData({
      name: p.name || '', designation: p.designation || '', charges: p.charges || '',
      displayPrice: p.displayPrice ? String(p.displayPrice) : String(base + 200),
      shiftStart: trimTime(p.shiftStartTime || p.shift_start_time),
      shiftEnd: trimTime(p.shiftEndTime || p.shift_end_time),
      skills: Array.isArray(p.skills) ? p.skills.join(', ') : (p.skills || ''),
      description: p.description || p.about || p.bio || '',
      rating: p.rating || '', email: p.email || '',
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
    if (!formData.name?.trim()) { setFormError('Name required.'); return; }
    if (!formData.designation?.trim()) { setFormError('Designation required.'); return; }
    if (!formData.charges) { setFormError('Fee required.'); return; }
    if (!formData.shiftStart) { setFormError('Shift start required.'); return; }
    if (!formData.shiftEnd) { setFormError('Shift end required.'); return; }
    setSaving(true); setFormError('');
    try {
      const skillsList: string[] = typeof formData.skills === 'string' ? formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : (formData.skills || []);
      const toLocalTime = (t: string) => t.length === 5 ? `${t}:00` : t;
      await updateAdvisor(profile.id, {
        name: formData.name.trim(), designation: formData.designation.trim(),
        charges: parseFloat(formData.charges) || 0,
        displayPrice: formData.displayPrice ? parseFloat(formData.displayPrice) : (parseFloat(formData.charges) || 0) + 200,
        email: profile.email, skills: skillsList, description: formData.description?.trim() || '',
        rating: formData.rating ? parseFloat(formData.rating) : null,
        shiftStartTime: toLocalTime(formData.shiftStart), shiftEndTime: toLocalTime(formData.shiftEnd),
      }, photoFile ?? undefined);
      await onUpdate();
      setIsEditing(false); setPhotoFile(null);
      showSaveToast('✓ Profile saved!');
    } catch (e: any) { setFormError(e?.message || 'Failed to save.'); }
    finally { setSaving(false); }
  };

  if (!profile) return <div>Loading…</div>;

  const avatarInitials = profile.name?.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2) || 'C';
  const displayTime = (t: string) => {
    if (!t) return '--:--';
    const [h, m] = t.split(':').map(Number);
    return `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  };

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>My Profile</h2>
        {!isEditing ? (
          <button onClick={() => setIsEditing(true)} style={{ padding: '6px 14px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✎ Edit Profile</button>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setIsEditing(false); setFormError(''); }} disabled={saving} style={{ padding: '6px 14px', background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '6px 14px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving…' : '✓ Save'}</button>
          </div>
        )}
      </div>
      {formError && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>⚠️ {formError}</div>}
      {saveToast && <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: saveToast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '12px 24px', borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999 }}>{saveToast.msg}</div>}
      {!isEditing ? (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)', padding: '28px 28px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#93C5FD', marginBottom: 16 }}>Consultant Profile</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ width: 104, height: 104, borderRadius: '50%', flexShrink: 0, background: (profile as any).profilePhoto ? 'transparent' : 'rgba(255,255,255,0.15)', border: '3px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {(profile as any).profilePhoto ? <img src={resolvePhotoUrl((profile as any).profilePhoto)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span style={{ fontSize: 34, fontWeight: 700, color: '#fff' }}>{avatarInitials}</span>}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{profile.name}</div>
                <div style={{ fontSize: 14, color: '#BFDBFE', marginBottom: 6 }}>{profile.designation}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(i => <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= Math.round(profile.rating || 0) ? '#F59E0B' : 'rgba(255,255,255,0.25)'}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>)}
                  {profile.rating ? <span style={{ fontSize: 13, fontWeight: 700, color: '#FCD34D' }}>{Number(profile.rating).toFixed(1)}</span> : <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>No rating</span>}
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '12px 20px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>₹{Number(profile.charges).toLocaleString()}</div>
                <div style={{ fontSize: 11, color: '#BFDBFE', fontWeight: 600, marginTop: 2 }}>per session</div>
              </div>
            </div>
          </div>
          <div style={{ padding: '20px 28px 28px' }}>
            {(profile as any).description && (<><div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', margin: '0 0 10px' }}>About</div><p style={{ margin: '0 0 20px', fontSize: 14, color: '#374151', lineHeight: 1.7 }}>{(profile as any).description}</p></>)}
            {profile.skills?.length > 0 && (<><div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', margin: '0 0 10px' }}>Skills</div><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>{profile.skills.map((s, i) => <span key={i} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 20, background: '#EFF6FF', color: '#2563EB', fontWeight: 600, border: '1px solid #BFDBFE' }}>{s}</span>)}</div></>)}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', margin: '0 0 12px' }}>Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 14 }}>
              {[
                { label: 'Email', value: profile.email },
                { label: 'Fee', value: profile.charges ? `₹${Number(profile.charges).toLocaleString()}` : null },
                { label: 'Availability Start', value: (profile as any).shiftStartTime ? String((profile as any).shiftStartTime).substring(0, 5) : null },
                { label: 'Availability End', value: (profile as any).shiftEndTime ? String((profile as any).shiftEndTime).substring(0, 5) : null },
              ].filter(i => i.value).map(i => (
                <div key={i.label} style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 }}>{i.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{i.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: 28 }}>
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div onClick={() => fileInputRef.current?.click()} style={{ width: 104, height: 104, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', background: photoPreview ? 'transparent' : 'linear-gradient(135deg,#1E3A5F,#2563EB)', border: '3px solid #DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              {photoPreview ? <img src={photoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setPhotoPreview('')} /> : <span style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>{avatarInitials}</span>}
            </div>
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: '6px 14px', border: '1.5px solid #BFDBFE', borderRadius: 6, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                {photoFile ? '✓ Selected' : '📁 Choose Photo'}
              </button>
              {photoFile && <span style={{ marginLeft: 10, fontSize: 12, color: '#16A34A', fontWeight: 600 }}>{photoFile.name}</span>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 24 }}>
            <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Name *</label><input name="name" value={formData.name || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} /></div>
            <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Designation *</label><input name="designation" value={formData.designation || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} /></div>
            <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Fee (₹) *</label>
              <input name="charges" type="number" value={formData.charges || ''} onChange={e => { handleChange(e); const base = parseFloat(e.target.value) || 0; setFormData((prev: any) => ({ ...prev, charges: e.target.value, displayPrice: String(base + 200) })); }} style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              {formData.charges && <div style={{ marginTop: 4, fontSize: 11, color: '#16A34A', fontWeight: 600 }}>✓ Customer sees: ₹{(parseFloat(formData.charges || '0') + 200).toLocaleString()}</div>}
            </div>
            <div><label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Rating (0-5)</label><input name="rating" type="number" step="0.1" min="0" max="5" value={formData.rating || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} /></div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Availability Start *</label>
              <div onClick={() => !saving && setTimePickerConfig({ isOpen: true, field: 'shiftStart', value: formData.shiftStart })} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${!formData.shiftStart ? '#FCA5A5' : '#CBD5E1'}`, borderRadius: 6, fontSize: 13, boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: saving ? 'not-allowed' : 'pointer', background: '#fff', color: formData.shiftStart ? '#0F172A' : '#94A3B8' }}>
                <span>{displayTime(formData.shiftStart)}</span>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Availability End *</label>
              <div onClick={() => !saving && setTimePickerConfig({ isOpen: true, field: 'shiftEnd', value: formData.shiftEnd })} style={{ width: '100%', padding: '8px 12px', border: `1px solid ${!formData.shiftEnd ? '#FCA5A5' : '#CBD5E1'}`, borderRadius: 6, fontSize: 13, boxSizing: 'border-box', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: saving ? 'not-allowed' : 'pointer', background: '#fff', color: formData.shiftEnd ? '#0F172A' : '#94A3B8' }}>
                <span>{displayTime(formData.shiftEnd)}</span>
              </div>
            </div>
            <div style={{ gridColumn: '1/-1' }}><label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Skills (comma separated)</label><input name="skills" value={formData.skills || ''} onChange={handleChange} style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} /></div>
            <div style={{ gridColumn: '1/-1' }}><label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 4 }}>Description</label><textarea name="description" value={formData.description || ''} onChange={handleChange} rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid #CBD5E1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', outline: 'none' }} /></div>
          </div>
          <MaterialTimePicker isOpen={timePickerConfig.isOpen} initialTime={timePickerConfig.value} onClose={() => setTimePickerConfig({ ...timePickerConfig, isOpen: false })} onSave={t => { if (timePickerConfig.field) { setFormData({ ...formData, [timePickerConfig.field]: t }); setFormError(''); } setTimePickerConfig({ ...timePickerConfig, isOpen: false }); }} />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTANT OFFERS VIEW — FIXED: Sends only fields the backend OfferRequest DTO accepts
// Root cause of 500: backend OfferRequest doesn't have approvalStatus/consultantName fields
// Fix: send only title, description, discount, validFrom, validTo, isActive, consultantId
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
  const [toast, setToast] = React.useState<{ msg: string; ok: boolean } | null>(null);
  const [form, setForm] = React.useState<ConsultantOffer>({ title: '', description: '', discount: '', validFrom: '', validTo: '', isActive: true });
  const [showForm, setShowForm] = React.useState(false);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2500); };

  const loadOffers = async () => {
    setLoading(true);
    try {
      // Try fetching offers for this consultant
      let loaded: ConsultantOffer[] = [];
      try {
        const data = await apiFetch(`/offers/consultant/${consultantId}`);
        loaded = Array.isArray(data) ? data : extractArray(data);
      } catch {
        try {
          const data = await apiFetch(`/offers?consultantId=${consultantId}`);
          const arr = Array.isArray(data) ? data : extractArray(data);
          loaded = arr.filter((o: any) => o.consultantId === consultantId || !o.consultantId);
        } catch {
          try {
            const data = await apiFetch('/offers/admin');
            const arr = Array.isArray(data) ? data : extractArray(data);
            loaded = arr.filter((o: any) => o.consultantId === consultantId);
          } catch { loaded = []; }
        }
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
    if (!form.title.trim()) { showToast('Title is required.', false); return; }
    setSaving(true);

    // Helper: convert "YYYY-MM-DD" → try multiple formats the backend might need
    const fmtDate = (d: string) => d ? d : undefined; // ISO "2026-03-18" — primary
    const fmtDatetime = (d: string) => d ? `${d}T00:00:00` : undefined; // "2026-03-18T00:00:00"

    // Build minimal base payload — NEVER include approvalStatus / consultantName / status / active
    const buildPayload = (useDatetime: boolean, includeConsultantId: boolean) => {
      const p: Record<string, any> = {
        title: form.title.trim(),
        description: form.description?.trim() || '',
        discount: form.discount?.trim() || '',
        isActive: Boolean(form.isActive),
      };
      if (includeConsultantId) p.consultantId = consultantId;
      const fmt = useDatetime ? fmtDatetime : fmtDate;
      const vf = fmt(form.validFrom);
      const vt = fmt(form.validTo);
      if (vf) p.validFrom = vf;
      if (vt) p.validTo = vt;
      return p;
    };

    // Try strategies in order until one succeeds:
    // 1. ISO date + consultantId in body
    // 2. ISO datetime + consultantId in body
    // 3. ISO date, consultantId as query param
    // 4. ISO datetime, consultantId as query param
    // 5. No dates at all + consultantId in body
    const isEdit = Boolean(editing?.id);
    const url = (withId: boolean) => isEdit
      ? `/offers/${editing!.id}${withId ? '' : `?consultantId=${consultantId}`}`
      : `/offers${withId ? '' : `?consultantId=${consultantId}`}`;
    const method = isEdit ? 'PUT' : 'POST';

    const strategies = [
      buildPayload(false, true),    // ISO date + id in body
      buildPayload(true, true),     // datetime + id in body
      buildPayload(false, false),   // ISO date + id as query param (tried separately)
      buildPayload(true, false),    // datetime + id as query param
      { title: form.title.trim(), description: form.description?.trim() || '', discount: form.discount?.trim() || '', isActive: Boolean(form.isActive), consultantId }, // no dates
    ];

    let savedOffer: any = null;
    let lastError = '';
    for (let i = 0; i < strategies.length; i++) {
      const noIdInBody = i === 2 || i === 3;
      const endpoint = isEdit
        ? `/offers/${editing!.id}${noIdInBody ? `?consultantId=${consultantId}` : ''}`
        : `/offers${noIdInBody ? `?consultantId=${consultantId}` : ''}`;
      try {
        savedOffer = await apiFetch(endpoint, { method, body: JSON.stringify(strategies[i]) });
        break; // success
      } catch (e: any) {
        lastError = e?.message || 'Failed';
        if (!lastError.includes('500') && !lastError.includes('deserializ') && !lastError.includes('parse')) {
          break; // non-serialization error, don't retry
        }
      }
    }

    try {
      if (savedOffer == null) throw new Error(lastError || 'Failed to save offer');
      if (isEdit) {
        setOffers(prev => prev.map(o => o.id === editing!.id ? { ...o, ...form, ...savedOffer, approvalStatus: 'PENDING' as const } : o));
        showToast('Offer updated. Pending admin approval.');
      } else {
        const newOffer: ConsultantOffer = {
          ...form,
          id: savedOffer?.id ?? Date.now(),
          consultantId,
          approvalStatus: (savedOffer?.approvalStatus || 'PENDING') as 'PENDING' | 'APPROVED' | 'REJECTED',
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
    if (!window.confirm('Delete this offer?')) return;
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
    const status = (offer.approvalStatus || '').toUpperCase();
    if (status === 'APPROVED') return { label: 'Approved', bg: '#DCFCE7', color: '#16A34A', border: '#86EFAC' };
    if (status === 'REJECTED') return { label: 'Rejected', bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' };
    if (status === 'PENDING') return { label: 'Pending Approval', bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' };
    return offer.isActive
      ? { label: 'Active', bg: '#DCFCE7', color: '#16A34A', border: '#86EFAC' }
      : { label: 'Inactive', bg: '#F1F5F9', color: '#94A3B8', border: '#E2E8F0' };
  };

  return (
    <div style={{ padding: 24, fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0F172A' }}>My Offers</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>Create and manage promotional offers for your services</p>
        </div>
        <button onClick={openNew} style={{ padding: '10px 18px', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          + New Offer
        </button>
      </div>

      {/* Approval workflow info banner */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>ℹ️</span>
        <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>
          <strong>How offers work:</strong> Offers you create are submitted to admin for approval. Once approved, they appear on the home page and booking page for customers.
        </div>
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div style={{ background: '#F8FAFC', border: '1.5px solid #BFDBFE', borderRadius: 16, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginBottom: 18 }}>{editing ? 'Edit Offer' : 'Create New Offer'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Title *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. First Session Free" style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={labelStyle}>Description</label>
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Describe the offer…" style={{ ...inputStyle, resize: 'none' as any }} />
            </div>
            <div>
              <label style={labelStyle}>Discount Label</label>
              <input value={form.discount} onChange={e => setForm(f => ({ ...f, discount: e.target.value }))} placeholder="e.g. 20% OFF / FREE" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 22 }}>
              <input type="checkbox" id="offer-active" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#2563EB' }} />
              <label htmlFor="offer-active" style={{ fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' }}>Active (visible after approval)</label>
            </div>
            <div>
              <label style={labelStyle}>Valid From</label>
              <input type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Valid Until</label>
              <input type="date" value={form.validTo} onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: saving ? '#93C5FD' : '#2563EB', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
              {saving ? 'Saving…' : editing ? 'Update Offer' : 'Create Offer'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
          Loading offers…
        </div>
      ) : offers.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#F8FAFC', borderRadius: 16, color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎁</div>
          <div style={{ fontWeight: 600, color: '#64748B', marginBottom: 12 }}>No offers yet</div>
          <button onClick={openNew} style={{ padding: '9px 20px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Create Your First Offer</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {offers.map(offer => {
            const badge = getApprovalBadge(offer);
            return (
              <div key={offer.id} style={{ background: '#fff', borderRadius: 14, border: '1.5px solid #E2E8F0', padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: offer.isActive ? '#EFF6FF' : '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 20 }}>
                  🎁
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{offer.title}</span>
                    {offer.discount && <span style={{ fontSize: 11, fontWeight: 800, background: '#DC2626', color: '#fff', padding: '2px 8px', borderRadius: 20 }}>{offer.discount}</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>
                  </div>
                  {offer.description && <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.5, marginBottom: 4 }}>{offer.description}</div>}
                  {(offer.validFrom || offer.validTo) && (
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>
                      {offer.validFrom && `From: ${offer.validFrom}`}{offer.validFrom && offer.validTo && ' · '}{offer.validTo && `Until: ${offer.validTo}`}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => openEdit(offer)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Edit</button>
                  <button onClick={() => offer.id && handleDelete(offer.id)} disabled={deleting === offer.id} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: deleting === offer.id ? 0.6 : 1 }}>
                    {deleting === offer.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTANT SIDEBAR — Professional text-only, no icons
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
    { id: 'master-slots', label: 'Time Ranges' },
    { id: 'feedbacks', label: 'Feedbacks' },
    { id: 'profile', label: 'Profile' },
    { id: 'offers', label: 'My Offers' },
  ];

  return (
    <aside style={{
      width: 220,
      height: '100%',
      background: '#0f1117',
      borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 16px 8px' }} />

      {/* Nav Items */}
      <nav style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
        {sidebarItems.map(({ id, label }) => {
          const isActive = activeItem === id;
          const badge = badges[id] ?? null;
          return (
            <div
              key={id}
              onClick={() => onNavigate?.(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                borderRadius: 8,
                cursor: 'pointer',
                background: isActive ? '#2563EB' : 'transparent',
                border: `1px solid ${isActive ? 'rgba(59,130,246,0.3)' : 'transparent'}`,
                position: 'relative',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: '60%', background: '#60A5FA',
                  borderRadius: '0 2px 2px 0',
                }} />
              )}
              <span style={{
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? '#fff' : '#94A3B8',
                letterSpacing: '0.01em',
                transition: 'color 0.15s',
              }}>
                {label}
              </span>
              {badge !== null && (
                <span style={{
                  background: '#EF4444', color: '#fff',
                  fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', borderRadius: 20,
                  minWidth: 18, textAlign: 'center',
                  boxShadow: '0 0 6px rgba(239,68,68,0.4)',
                }}>
                  {badge}
                </span>
              )}
            </div>
          );
        })}
      </nav>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '6px 16px' }} />

      {/* Logout */}
      <div style={{ padding: '8px 8px 18px' }}>
        <div
          onClick={onLogout}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 14px', borderRadius: 8, cursor: 'pointer',
            color: '#64748B', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = '#fff'; (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = '#64748B'; (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        >
          <span style={{ fontSize: 13, fontWeight: 400 }}>Sign Out</span>
          <span style={{ fontSize: 16 }}>→</span>
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
    'bookings' | 'tickets' | 'analytics' | 'notifications' | 'calendar' | 'master-slots' | 'feedbacks' | 'profile' | 'offers'
  >('bookings');
  const [profileData, setProfileData] = useState<Consultant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingBookings, setPendingBookings] = useState<any[]>([]);
  const [ticketCounts, setTicketCounts] = useState({ open: 0, slaRisk: 0 });
  const [newNotifCount, setNewNotifCount] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const user = await getCurrentUser();
        const advisorId = user?.consultantId || user?.advisorId || user?.id;
        if (!advisorId) { setError('No consultant profile linked.'); setLoading(false); return; }
        const [consultantRes, bRes, tRes] = await Promise.allSettled([
          getAdvisorById(advisorId),
          getBookingsByConsultant(advisorId),
          getTicketsByConsultant(advisorId),
        ]);
        if (consultantRes.status !== 'fulfilled') throw new Error('Profile load failed');
        const consultant = consultantRes.value;
        setProfileData(consultant);
        if (tRes.status === 'fulfilled') {
          const tickets = extractArray(tRes.value);
          setTicketCounts({
            open: tickets.filter((t: any) => ['NEW', 'OPEN', 'IN_PROGRESS'].includes(t.status)).length,
            slaRisk: tickets.filter((t: any) => getSlaInfo(t)?.breached || getSlaInfo(t)?.warning).length,
          });
        }
        if (bRes.status === 'fulfilled') {
          const arr = extractArray(bRes.value);
          const token = localStorage.getItem('fin_token');
          const authH = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
          const missingIds = [...new Set(arr.filter((b: any) => !deepFindDate(b) || !deepFindTime(b)).map((b: any) => b.timeSlotId || b.timeslotId || b.slotId || b.timeSlot?.id).filter(Boolean).map(Number))];
          const tsCache: Record<number, any> = {};
          for (let i = 0; i < missingIds.length; i += 6) {
            const batch = missingIds.slice(i, i + 6);
            const fetched = await Promise.allSettled(batch.map(id => fetch(`http://52.55.178.31:8081/api/timeslots/${id}`, { headers: authH }).then(r => r.ok ? r.json() : null)));
            fetched.forEach((r, j) => { if (r.status === 'fulfilled' && r.value) tsCache[batch[j]] = r.value; });
          }
          const enriched = arr.map((b: any) => {
            if (deepFindDate(b) && deepFindTime(b)) return b;
            const ts = tsCache[Number(b.timeSlotId || b.timeslotId || b.slotId || b.timeSlot?.id)];
            return ts ? { ...b, slotDate: b.slotDate || ts.slotDate || '', bookingDate: b.bookingDate || ts.slotDate || '', slotTime: b.slotTime || ts.slotTime || '', timeRange: b.timeRange || ts.timeRange || ts.masterTimeSlot?.timeRange || '', timeSlot: { ...(b.timeSlot || {}), ...ts } } : b;
          });
          setPendingBookings(enriched.filter((b: any) => deepFindStatus(b) === 'PENDING'));
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

  const handleLogout = () => { logoutUser(); navigate('/'); };
  const refreshProfile = async () => {
    if (profileData?.id) {
      const u = await getAdvisorById(profileData.id);
      setProfileData(u);
    }
  };

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#64748B' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #DBEAFE', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading dashboard…
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <p style={{ color: '#EF4444', fontWeight: 600 }}>{error}</p>
      <button onClick={() => navigate('/')} style={{ padding: '10px 24px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Back to Login</button>
    </div>
  );

  const ticketBadge = ticketCounts.slaRisk > 0 ? ticketCounts.slaRisk : ticketCounts.open > 0 ? ticketCounts.open : null;

  // Professional SVG icon components for mobile tabs
  const TabIcon: React.FC<{ id: string; active: boolean }> = ({ id, active }) => {
    const c = active ? '#2563EB' : '#64748B';
    const w = 18; const h = 18;
    switch (id) {
      case 'bookings': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
      case 'tickets': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>;
      case 'analytics': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
      case 'notifications': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
      case 'calendar': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="12" cy="16" r="1" fill={c}/></svg>;
      case 'master-slots': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
      case 'feedbacks': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
      case 'profile': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
      case 'offers': return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
      default: return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>;
    }
  };

  const tabs = [
    { id: 'bookings' as const, label: 'Bookings', badge: pendingBookings.length > 0 ? pendingBookings.length : null, badgeColor: '#2563EB' },
    { id: 'tickets' as const, label: 'Tickets', badge: ticketBadge, badgeColor: ticketCounts.slaRisk > 0 ? '#DC2626' : '#2563EB' },
    { id: 'analytics' as const, label: 'Analytics', badge: null, badgeColor: '#2563EB' },
    { id: 'notifications' as const, label: 'Alerts', badge: newNotifCount > 0 ? newNotifCount : null, badgeColor: '#DC2626' },
    { id: 'calendar' as const, label: 'Schedule', badge: null, badgeColor: '#2563EB' },
    { id: 'master-slots' as const, label: 'Time', badge: null, badgeColor: '#2563EB' },
    { id: 'feedbacks' as const, label: 'Feedback', badge: null, badgeColor: '#2563EB' },
    { id: 'profile' as const, label: 'Profile', badge: null, badgeColor: '#2563EB' },
    { id: 'offers' as const, label: 'Offers', badge: null, badgeColor: '#16A34A' },
  ];

  return (
    <div className="advisor-layout">
      {/* ── Top Navbar ── */}
      <header className="advisor-navbar">
        <button onClick={() => setSidebarOpen(s => !s)} className="hamburger-btn" style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', fontSize: 22, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>☰</button>
        <div className="nav-brand">
          <span className="brand-text" style={{ color: '#fff', letterSpacing: '0.06em' }}>MEET THE MASTERS</span>
          <span className="brand-sub" style={{ color: 'rgba(255,255,255,0.65)' }}>CONSULTANT PORTAL</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {profileData && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px 4px 6px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 20 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                {profileData.name?.charAt(0).toUpperCase() ?? 'C'}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>{profileData.name}</div>
                {profileData.designation && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', lineHeight: 1.1 }}>{profileData.designation}</div>}
              </div>
            </div>
          )}
          <div onClick={() => setActiveTab('notifications')} style={{ position: 'relative', width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} title="Notifications">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            {newNotifCount > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#EF4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #1E3A5F' }}>
                {newNotifCount > 9 ? '9+' : newNotifCount}
              </span>
            )}
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
              tickets: ticketBadge,
              notifications: newNotifCount > 0 ? newNotifCount : null,
            }}
          />
        </div>

        <main className="advisor-main" style={{ overflow: activeTab === 'tickets' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column' }}>
          {ticketCounts.open > 0 && activeTab !== 'tickets' && (
            <div style={{ background: 'linear-gradient(90deg,#FEF9C3,#FFFBEB)', border: '1px solid #FCD34D', borderRadius: 12, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                <span style={{ fontWeight: 700, color: '#92400E', fontSize: 13 }}>
                  {ticketCounts.open} active ticket{ticketCounts.open !== 1 ? 's' : ''} — please review and respond.
                  {ticketCounts.slaRisk > 0 && <span style={{ marginLeft: 8, color: '#DC2626' }}>{ticketCounts.slaRisk} at SLA risk</span>}
                </span>
              </div>
              <button onClick={() => setActiveTab('tickets')} style={{ padding: '6px 16px', background: '#D97706', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>View Tickets</button>
            </div>
          )}

          {activeTab === 'bookings' && profileData && <BookingsView consultantId={profileData.id} />}
          {activeTab === 'tickets' && profileData && <AdvisorTicketsView consultantId={profileData.id} />}
          {activeTab === 'analytics' && profileData && (
            <AnalyticsDashboard tickets={[]} consultants={[]} mode="consultant" consultantId={profileData.id} consultantName={profileData.name} />
          )}
          {activeTab === 'notifications' && profileData && <ConsultantNotificationsView consultantId={profileData.id} />}
          {activeTab === 'calendar' && profileData && (
            <MySlotsView consultantId={profileData.id} shiftStartTime={profileData.shiftStartTime || ''} shiftEndTime={profileData.shiftEndTime || ''} />
          )}
          {activeTab === 'master-slots' && <MasterSlotsView />}
          {activeTab === 'feedbacks' && profileData && <FeedbacksView consultantId={profileData.id} />}
          {activeTab === 'profile' && <ProfileView profile={profileData} onUpdate={refreshProfile} />}
          {activeTab === 'offers' && profileData && <ConsultantOffersView consultantId={profileData.id} consultantName={profileData.name} />}

          {/* Mobile Bottom Tab Bar */}
          <nav className="advisor-tabs-mobile">
            {tabs.map(t => {
              const isActive = activeTab === t.id;
              return (
                <button key={t.id} className={`tab-btn ${isActive ? 'active' : ''}`} onClick={() => setActiveTab(t.id)} style={{ position: 'relative', flexShrink: 0 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <TabIcon id={t.id} active={isActive} />
                    <span style={{ fontSize: 9, fontWeight: isActive ? 700 : 500, color: isActive ? '#2563EB' : '#64748B' }}>{t.label}</span>
                  </div>
                  {t.badge !== null && (
                    <span style={{ position: 'absolute', top: 4, right: 4, background: t.badgeColor, color: '#fff', fontSize: 9, fontWeight: 800, minWidth: 14, height: 14, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </main>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}