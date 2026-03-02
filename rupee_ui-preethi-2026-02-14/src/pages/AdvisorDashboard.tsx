import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAdvisorById,
  getBookingsByConsultant,
  getCurrentUser,
  logoutUser,
  updateAdvisor,
} from '../services/api';
import '../styles/AdvisorDashboard.css';

// ── Photo URL resolver ────────────────────────────────────────────────────────
const resolvePhotoUrl = (path: string | null | undefined): string => {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('blob:')) return path;
  return path.startsWith('/') ? path : `/${path}`;
};

// ── Master Timeslots API ──────────────────────────────────────────────────────
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const BASE  = '/api';
  const token = localStorage.getItem('fin_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  const res  = await fetch(`${BASE}${endpoint}`, { ...options, headers });
  const ct   = res.headers.get('content-type');
  const data = ct?.includes('application/json') ? await res.json() : { message: await res.text() };
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
};

const getMasterTimeslots   = ()                              => apiFetch('/master-timeslots');
const createMasterTimeslot = (timeRange: string)             =>
  apiFetch('/master-timeslots', { method: 'POST', body: JSON.stringify({ timeRange }) });
const updateMasterTimeslot = (id: number, timeRange: string) =>
  apiFetch(`/master-timeslots/${id}`, { method: 'PUT', body: JSON.stringify({ timeRange }) });
const deleteMasterTimeslot = (id: number)                    =>
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

interface Booking {
  id: number;
  user?: { id?: number; name?: string; email?: string; username?: string; identifier?: string } | null;
  client?: { id?: number; name?: string; email?: string; username?: string } | null;
  userName?: string; clientName?: string; userEmail?: string; name?: string;
  userId?: number; clientId?: number;
  bookingDate?: string; slotDate?: string; date?: string;
  bookingTime?: string; slotTime?: string;
  durationMinutes?: number; amount?: number; charges?: number; fee?: number;
  status: 'CONFIRMED' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
  meetingLink?: string; jitsiLink?: string; joinUrl?: string;
}

// ── Feedback Types ────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatTimeRange = (timeString: string, durationMins = 60) => {
  if (!timeString) return '—';
  if (timeString.includes('-') || timeString.match(/(AM|PM)/i)) return timeString;
  const [hours, minutes] = timeString.split(':').map(Number);
  const start = new Date(); start.setHours(hours, minutes, 0);
  const end   = new Date(start.getTime() + durationMins * 60000);
  const fmt   = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${fmt(start)} – ${fmt(end)}`;
};

const getClientName = (b: Booking): string => {
  const raw =
    b.user?.name        ||
    b.user?.username    ||
    b.client?.name      ||
    b.client?.username  ||
    b.userName          ||
    b.clientName        ||
    b.name              ||
    b.user?.email       ||
    b.userEmail         ||
    b.client?.email     ||
    (b.userId   ? `User #${b.userId}`   : null) ||
    (b.clientId ? `Client #${b.clientId}` : null) ||
    `Booking #${b.id}`;

  if (raw && raw.includes('@')) {
    const namePart = raw.split('@')[0];
    return namePart
      .replace(/[._-]/g, ' ')
      .replace(/\b\w/g, (c: string) => c.toUpperCase());
  }
  return raw;
};

const getBookingDate = (b: Booking) => b.bookingDate || b.slotDate || b.date || '—';

const getBookingTime = (b: Booking) => {
  if ((b as any).timeSlot?.masterTimeSlot?.timeRange) return (b as any).timeSlot.masterTimeSlot.timeRange;
  if ((b as any).masterTimeSlot?.timeRange)           return (b as any).masterTimeSlot.timeRange;
  return b.bookingTime || b.slotTime || '';
};

const getStatusColor = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':  return { bg: '#EFF6FF', color: '#2563EB', border: '#93C5FD' };
    case 'PENDING':    return { bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' };
    case 'COMPLETED':  return { bg: '#F0FDF4', color: '#16A34A', border: '#86EFAC' };
    case 'CANCELLED':  return { bg: '#FEF2F2', color: '#EF4444', border: '#FCA5A5' };
    default:           return { bg: '#F1F5F9', color: '#64748B', border: '#CBD5E1' };
  }
};

const generateHourlySlots = (shiftStart: string, shiftEnd: string): string[] => {
  if (!shiftStart || !shiftEnd) return [];
  try {
    const [sh, sm] = shiftStart.split(':').map(Number);
    const [eh, em] = shiftEnd.split(':').map(Number);
    const startMins = sh * 60 + (isNaN(sm) ? 0 : sm);
    const endMins   = eh * 60 + (isNaN(em) ? 0 : em);
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
  const hr   = h % 12 || 12;
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
};

// ── normalise AM/PM or HH:MM time string to "HH:MM" ──────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. BOOKINGS VIEW
// ─────────────────────────────────────────────────────────────────────────────
const BookingsView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'>('ALL');

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await getBookingsByConsultant(consultantId);
        const arr: Booking[] = Array.isArray(data) ? data
          : Array.isArray(data?.content) ? data.content : [];

        if (arr.length > 0) console.log('📋 Raw booking sample:', arr[0]);

        const enriched = await Promise.all(arr.map(async (b) => {
          if (b.user?.name || b.user?.username || b.userName || b.clientName || b.client?.name) {
            return b;
          }
          const uid = b.userId || b.user?.id || b.clientId;
          if (uid) {
            try {
              const token = localStorage.getItem('fin_token');
              const res = await fetch(`/api/users/${uid}`, {
                headers: {
                  Accept: 'application/json',
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              });
              if (res.ok) {
                const u = await res.json();
                return {
                  ...b,
                  user: {
                    id:       u.id,
                    name:     u.name || u.fullName || u.identifier,
                    email:    u.email || u.identifier,
                    username: u.username || u.identifier,
                  },
                };
              }
            } catch { /* silently skip */ }
          }
          return b;
        }));

        setBookings(enriched);
      } catch { setError('Could not load bookings. Please try again.'); }
      finally  { setLoading(false); }
    })();
  }, [consultantId]);

  const filtered = filter === 'ALL' ? bookings : bookings.filter(b => b.status?.toUpperCase() === filter);
  const counts = {
    ALL:       bookings.length,
    PENDING:   bookings.filter(b => b.status === 'PENDING').length,
    CONFIRMED: bookings.filter(b => b.status === 'CONFIRMED').length,
    COMPLETED: bookings.filter(b => b.status === 'COMPLETED').length,
    CANCELLED: bookings.filter(b => b.status === 'CANCELLED').length,
  };
  const totalRevenue = bookings
    .filter(b => b.status === 'COMPLETED')
    .reduce((sum, b) => sum + Number(b.amount || b.charges || 0), 0);

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>My Bookings</h2>
        <span style={{ fontSize: 13, color: '#64748B' }}>
          {bookings.length} total session{bookings.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total',     value: counts.ALL,                          color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Pending',   value: counts.PENDING,                      color: '#D97706', bg: '#FFFBEB' },
          { label: 'Confirmed', value: counts.CONFIRMED,                    color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Completed', value: counts.COMPLETED,                    color: '#16A34A', bg: '#F0FDF4' },
          { label: 'Revenue',   value: `₹${totalRevenue.toLocaleString()}`, color: '#16A34A', bg: '#F0FDF4' },
        ].map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 16px', borderRadius: 20, border: '1.5px solid',
            borderColor: filter === f ? '#2563EB' : '#E2E8F0',
            background:  filter === f ? '#2563EB' : '#fff',
            color:       filter === f ? '#fff'    : '#64748B',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {f} ({counts[f]})
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
          {filtered.map(booking => {
            const sc         = getStatusColor(booking.status);
            const clientName = getClientName(booking);
            const date       = getBookingDate(booking);
            const timeRange  = formatTimeRange(getBookingTime(booking), booking.durationMinutes || 60);
            const amount     = Number(booking.amount || booking.charges || 0);
            return (
              <div key={booking.id} style={{
                background: '#fff', border: '1px solid #F1F5F9',
                borderLeft: `4px solid ${sc.border}`, borderRadius: 14,
                padding: '18px 20px', display: 'flex', alignItems: 'center',
                gap: 16, flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                  {clientName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 4 }}>
                    Session with {clientName}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
                    <span>📅 {date}</span>
                    <span>🕐 {timeRange}</span>
                    {amount > 0 && <span style={{ color: '#16A34A', fontWeight: 600 }}>₹{amount.toLocaleString()}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: '#94A3B8' }}>
                    🔗 Room: <span style={{ fontFamily: 'monospace', color: '#2563EB' }}>
                      finadvise-booking-{booking.id}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ padding: '5px 14px', borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                    {booking.status}
                  </span>
                  {booking.status?.toUpperCase() !== 'CANCELLED' && (
                    <a
                      href={booking.meetingLink || booking.jitsiLink || booking.joinUrl || `https://meet.jit.si/finadvise-booking-${booking.id}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '7px 16px',
                        background: 'linear-gradient(135deg,#2563EB,#1D4ED8)',
                        color: '#fff', borderRadius: 8, fontSize: 13,
                        fontWeight: 600, textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 2px 8px rgba(37,99,235,0.3)',
                      }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14"/>
                        <rect x="3" y="6" width="12" height="12" rx="2"/>
                      </svg>
                      Join Meeting
                    </a>
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

// ── 30-day pool + 7-visible window ───────────────────────────────────────────
const ALL_SCHEDULE_DAYS = (() => {
  const DAY_NAMES   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const MONTH_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const out: { iso: string; wd: string; day: string; mon: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      iso: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
      wd:  DAY_NAMES[d.getDay()],
      day: String(d.getDate()).padStart(2,'0'),
      mon: MONTH_NAMES[d.getMonth()],
    });
  }
  return out;
})();
const SCHEDULE_VISIBLE = 7;
// Skip Sunday as default — if today is Sunday, start on Monday
const DEFAULT_SCHEDULE_DAY = ALL_SCHEDULE_DAYS.find(d => d.wd !== 'SUN')?.iso ?? ALL_SCHEDULE_DAYS[0].iso;

// ─────────────────────────────────────────────────────────────────────────────
// 2. MY SCHEDULE
// ─────────────────────────────────────────────────────────────────────────────
const MySlotsView: React.FC<{
  consultantId: number;
  shiftStartTime: string;
  shiftEndTime: string;
}> = ({ consultantId, shiftStartTime, shiftEndTime }) => {
  const [dbSlots,       setDbSlots]       = useState<TimeSlotRecord[]>([]);
  const [masterSlots,   setMasterSlots]   = useState<MasterSlot[]>([]);
  const [bookings,      setBookings]      = useState<any[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [dayOffset,     setDayOffset]     = useState(0);
  const [selectedDate,  setSelectedDate]  = useState<string>(DEFAULT_SCHEDULE_DAY);
  const [togglingSlot,  setTogglingSlot]  = useState<string | null>(null);
  const [slotToast,     setSlotToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [showAddSlot,   setShowAddSlot]   = useState(false);
  const [newSlotTime,   setNewSlotTime]   = useState('');
  const [addingSlot,    setAddingSlot]    = useState(false);

  const showSlotToast = (msg: string, ok = true) => {
    setSlotToast({ msg, ok });
    setTimeout(() => setSlotToast(null), 3000);
  };

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      let masterLookup: Record<number, string> = {};
      try {
        const mData = await apiFetch('/master-timeslots');
        const mArr  = Array.isArray(mData) ? mData : (mData?.content || []);
        mArr.forEach((m: any) => { if (m.id && m.timeRange) masterLookup[m.id] = m.timeRange; });
        setMasterSlots(mArr);
      } catch { /* non-fatal */ }

      try {
        const slotData = await apiFetch(`/timeslots/consultant/${consultantId}`);
        const slotArr  = Array.isArray(slotData) ? slotData : (slotData?.content || []);
        setDbSlots(slotArr.map((s: any) => ({
          ...s,
          timeRange: (s.timeRange && s.timeRange !== 'Unknown Time')
            ? s.timeRange
            : (masterLookup[s.masterTimeSlotId] || ''),
        })));
      } catch { setDbSlots([]); }

      try {
        const bData = await apiFetch(`/bookings/consultant/${consultantId}`);
        setBookings(Array.isArray(bData) ? bData : (bData?.content || []));
      } catch { setBookings([]); }
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
    const st = (b.status || '').toUpperCase();
    if (st === 'CANCELLED') return;
    const date = b.slotDate || b.bookingDate || b.date || '';
    let timeKey = '';
    if (b.slotTime) {
      timeKey = b.slotTime.substring(0, 5);
    } else {
      const tr = b.timeSlot?.masterTimeSlot?.timeRange || b.masterTimeSlot?.timeRange || b.timeRange || '';
      timeKey = normaliseTimeKey(tr);
    }
    if (date && timeKey) bookedByClientSet.add(`${date}|${timeKey}`);
  });

  dbSlots.forEach(s => {
    const st = (s.status || '').toUpperCase();
    if (st !== 'BOOKED') return;
    const slotTime = (s as any).slotTime ? String((s as any).slotTime).substring(0, 5) : '';
    const timeKey = slotTime || normaliseTimeKey(s.timeRange || '');
    if (s.slotDate && timeKey) bookedByClientSet.add(`${s.slotDate}|${timeKey}`);
  });

  const manuallyDisabledSet = new Set<string>();
  dbSlots.forEach(s => {
    const st = (s.status || '').toUpperCase();
    if (st === 'AVAILABLE' || st === 'BOOKED') return;
    const slotTime = (s as any).slotTime ? String((s as any).slotTime).substring(0, 5) : '';
    const timeKey = slotTime || normaliseTimeKey(s.timeRange || '');
    if (s.slotDate && timeKey && !bookedByClientSet.has(`${s.slotDate}|${timeKey}`)) {
      manuallyDisabledSet.add(`${s.slotDate}|${timeKey}`);
    }
  });

  const unavailableSet = new Set([...bookedByClientSet, ...manuallyDisabledSet]);

  const hourlySlotTimes = generateHourlySlots(shiftStartTime.substring(0, 5), shiftEndTime.substring(0, 5));

  const getCustomSlotsForDate = (dateStr: string): string[] => {
    const extras: string[] = [];
    dbSlots.forEach(s => {
      if (s.slotDate !== dateStr) return;
      const slotT = (s as any).slotTime ? String((s as any).slotTime).substring(0, 5) : '';
      if (slotT && !hourlySlotTimes.includes(slotT)) extras.push(slotT);
    });
    return [...new Set(extras)].sort();
  };

  const hasShift = !!(shiftStartTime && shiftEndTime && hourlySlotTimes.length > 0);

  const visibleDays   = ALL_SCHEDULE_DAYS.slice(dayOffset, dayOffset + SCHEDULE_VISIBLE);
  const activeDateKey = selectedDate || DEFAULT_SCHEDULE_DAY;
  const isActiveSunday = ALL_SCHEDULE_DAYS.find(d => d.iso === activeDateKey)?.wd === 'SUN';

  let totalCount = 0, availableCount = 0, bookedCount = 0;
  if (hasShift) {
    visibleDays.forEach(d => {
      if (d.wd === 'SUN') return; // Sundays don't count
      hourlySlotTimes.forEach(t => {
        totalCount++;
        if (unavailableSet.has(`${d.iso}|${t}`)) bookedCount++;
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
      const normStart = normaliseTimeKey(startPart);
      return normStart === slotStart;
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
        await apiFetch(`/timeslots/${existing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...existing, status: newStatus }),
        });
      } else {
        if (!matchedMaster) {
          showSlotToast('⚠️ No matching master time range found. Add this time in "Master Time Ranges" tab first.', false);
          setTogglingSlot(null);
          return;
        }
        const payload: any = {
          consultantId,
          slotDate:         activeDateKey,
          slotTime:         slotTimeFull,
          durationMinutes:  60,
          status:           newStatus,
          masterTimeSlotId: matchedMaster.id,
        };
        await apiFetch('/timeslots', { method: 'POST', body: JSON.stringify(payload) });
      }
      showSlotToast(newStatus === 'AVAILABLE' ? '✓ Slot marked as available' : '✓ Slot marked as unavailable');
      await loadData();
    } catch (e: any) {
      showSlotToast(e?.message || 'Failed to update slot.', false);
    } finally {
      setTogglingSlot(null);
    }
  };

  const handleAddCustomSlot = async () => {
    if (!newSlotTime) return;
    setAddingSlot(true);
    const slotTimeFull = newSlotTime.length === 5 ? `${newSlotTime}:00` : newSlotTime;

    const matchedMaster = masterSlots.find(ms => {
      const startPart = ms.timeRange.split(/[-–]/)[0].trim();
      const normStart = normaliseTimeKey(startPart);
      return normStart === newSlotTime;
    });

    try {
      const payload: any = {
        consultantId,
        slotDate:        activeDateKey,
        slotTime:        slotTimeFull,
        durationMinutes: 60,
        status:          'AVAILABLE',
      };
      if (matchedMaster) payload.masterTimeSlotId = matchedMaster.id;
      await apiFetch('/timeslots', { method: 'POST', body: JSON.stringify(payload) });
      showSlotToast('✓ New slot added successfully!');
      setNewSlotTime('');
      setShowAddSlot(false);
      await loadData();
    } catch (e: any) {
      showSlotToast(e?.message || 'Failed to add slot.', false);
    } finally {
      setAddingSlot(false);
    }
  };

  const customSlots    = getCustomSlotsForDate(activeDateKey);
  const allSlotTimes   = [...new Set([...hourlySlotTimes, ...customSlots])].sort();

  return (
    <div className="advisor-content-container">
      {/* Top action bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 20 }}>
        <button onClick={() => setShowAddSlot(v => !v)} style={{ padding: '7px 14px', background: showAddSlot ? '#F1F5F9' : '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          {showAddSlot ? '✕ Cancel' : '+ Add Slot'}
        </button>
        <button onClick={loadData} style={{ padding: '7px 16px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          🔄 Refresh
        </button>
      </div>

      {/* Add custom slot panel */}
      {showAddSlot && (
        <div style={{ background: '#F8FAFC', border: '1.5px dashed #BFDBFE', borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            Add Custom Slot for {activeDateKey}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="time" value={newSlotTime} onChange={e => setNewSlotTime(e.target.value)}
              style={{ padding: '9px 14px', border: '1.5px solid #BFDBFE', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff', fontFamily: 'inherit' }} />
            <button onClick={handleAddCustomSlot} disabled={!newSlotTime || addingSlot}
              style={{ padding: '9px 20px', background: addingSlot || !newSlotTime ? '#E2E8F0' : '#2563EB', color: addingSlot || !newSlotTime ? '#94A3B8' : '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: !newSlotTime || addingSlot ? 'default' : 'pointer' }}>
              {addingSlot ? 'Adding…' : '+ Add Slot'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#94A3B8' }}>This slot will be available to users for booking on the selected date.</p>
        </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          ⚠️ {error}
          <button onClick={loadData} style={{ marginLeft: 'auto', padding: '4px 12px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Retry</button>
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
          <p style={{ margin: 0, fontSize: 13 }}>Go to the Profile tab → set your Shift Start &amp; End times. Your slots will appear here automatically. Or use "+ Add Slot" to add manual slots.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { label: 'Total (7 days)', value: totalCount,     color: '#2563EB', bg: '#EFF6FF' },
              { label: 'Available',      value: availableCount, color: '#16A34A', bg: '#F0FDF4' },
              { label: 'Unavailable',    value: bookedCount,    color: '#64748B', bg: '#F1F5F9' },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}22`, borderRadius: 10, padding: '10px 18px', minWidth: 115 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(37,99,235,0.12)' }}>

            {/* Blue gradient header */}
            <div style={{
              background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)',
              padding: '20px 24px 18px',
              position: 'relative',
            }}>
              <p style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#93C5FD', margin: '0 0 4px', fontWeight: 700 }}>
                My Schedule
              </p>
              <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 4px' }}>
                My Schedule Slots
              </h3>
              <p style={{ fontSize: 13, color: '#BFDBFE', margin: 0 }}>
                {shiftStartTime ? `Shift: ${fmtTime(shiftStartTime)} → ${fmtTime(shiftEndTime)}` : 'Configure your shift in Profile tab'}
                {hasShift && <span style={{ marginLeft: 10, fontSize: 12, color: '#60A5FA' }}>· {hourlySlotTimes.length} slots/day</span>}
              </p>
            </div>

            {/* Step 1 — Select Date */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #F1F5F9' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 12px' }}>
                Step 1 — Select Date
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  disabled={dayOffset === 0}
                  onClick={() => setDayOffset(o => Math.max(0, o - 1))}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    border: `1.5px solid ${dayOffset === 0 ? '#F1F5F9' : '#BFDBFE'}`,
                    background: '#fff',
                    cursor: dayOffset === 0 ? 'default' : 'pointer',
                    color: dayOffset === 0 ? '#CBD5E1' : '#2563EB',
                    fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>‹</button>

                <div style={{ display: 'flex', gap: 6, flex: 1 }}>
                  {visibleDays.map((d) => {
                    const isActive  = d.iso === activeDateKey;
                    const isToday   = d.iso === ALL_SCHEDULE_DAYS[0].iso;
                    const isSunday  = d.wd === 'SUN';
                    return (
                      <button
                        key={d.iso}
                        disabled={isSunday}
                        onClick={() => { if (!isSunday) setSelectedDate(d.iso); }}
                        title={isSunday ? 'No slots on Sundays' : undefined}
                        style={{
                          flex: 1,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          padding: '8px 4px', borderRadius: 10, gap: 2,
                          border: `1.5px solid ${isActive && !isSunday ? '#2563EB' : '#E2E8F0'}`,
                          background: isSunday ? '#F8FAFC' : isActive ? '#2563EB' : '#F8FAFC',
                          cursor: isSunday ? 'not-allowed' : 'pointer',
                          fontFamily: 'inherit', outline: 'none',
                          transition: 'all 0.2s', minHeight: 72,
                          opacity: isSunday ? 0.38 : 1,
                        }}>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: isSunday ? '#CBD5E1' : isActive ? '#BFDBFE' : '#94A3B8' }}>
                          {d.wd}
                        </span>
                        <span style={{ fontSize: 17, fontWeight: 700, lineHeight: 1, color: isSunday ? '#CBD5E1' : isActive ? '#fff' : '#0F172A' }}>
                          {d.day}
                        </span>
                        {isSunday ? (
                          <span style={{ fontSize: 8, fontWeight: 800, color: '#CBD5E1' }}>OFF</span>
                        ) : isToday && !isActive ? (
                          <span style={{ fontSize: 8, fontWeight: 800, color: '#2563EB', background: '#EFF6FF', padding: '1px 4px', borderRadius: 4 }}>
                            TODAY
                          </span>
                        ) : (
                          <span style={{ fontSize: 9, color: isActive ? '#BFDBFE' : '#94A3B8' }}>
                            {d.mon}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  disabled={dayOffset >= ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE}
                  onClick={() => setDayOffset(o => Math.min(ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE, o + 1))}
                  style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    border: `1.5px solid ${dayOffset >= ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE ? '#F1F5F9' : '#BFDBFE'}`,
                    background: '#fff',
                    cursor: dayOffset >= ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE ? 'default' : 'pointer',
                    color: dayOffset >= ALL_SCHEDULE_DAYS.length - SCHEDULE_VISIBLE ? '#CBD5E1' : '#2563EB',
                    fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>›</button>
              </div>
            </div>

            {/* Step 2 — Select Time */}
            <div style={{ padding: '20px 24px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748B', margin: '0 0 10px' }}>
                Step 2 — Select Time
              </p>

              {/* ── SUNDAY: show "no slots" banner instead of time grid ── */}
              {isActiveSunday ? (
                <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 12, padding: '20px 18px', textAlign: 'center' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🚫</div>
                  <p style={{ fontWeight: 700, margin: '0 0 4px', color: '#DC2626', fontSize: 14 }}>No slots on Sundays</p>
                  <p style={{ fontSize: 12, margin: 0, color: '#EF4444' }}>Sundays are off — please select a weekday (Monday – Saturday).</p>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: '#94A3B8', marginBottom: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span>{allSlotTimes.filter(t => !unavailableSet.has(`${activeDateKey}|${t}`)).length} available</span>
                    <span>· {allSlotTimes.filter(t => bookedByClientSet.has(`${activeDateKey}|${t}`)).length} booked by clients</span>
                    <span>· {allSlotTimes.filter(t => manuallyDisabledSet.has(`${activeDateKey}|${t}`)).length} marked unavailable (click to restore)</span>
                  </div>

                  <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    {[
                      { label: 'Available (click to disable)',                          bg: '#fff',    border: '#BFDBFE' },
                      { label: 'Booked by client',                                     bg: '#2563EB', border: '#1D4ED8' },
                      { label: 'Unavailable — click ↺ Mark Available to restore',      bg: '#F1F5F9', border: '#CBD5E1' },
                    ].map(l => (
                      <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 13, height: 13, borderRadius: 3, background: l.bg, border: `1.5px solid ${l.border}` }} />
                        <span style={{ fontSize: 11, color: '#64748B' }}>{l.label}</span>
                      </div>
                    ))}
                  </div>

                  {allSlotTimes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 20px', color: '#94A3B8', fontSize: 13 }}>
                      No slots for this date. Use "+ Add Slot" to add a custom slot.
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 4 }}>
                      {allSlotTimes.map(slotStart => {
                        const key                = `${activeDateKey}|${slotStart}`;
                        const isBookedByClient   = bookedByClientSet.has(key);
                        const isManuallyDisabled = manuallyDisabledSet.has(key);
                        const isUnavailable      = unavailableSet.has(key);
                        const isToggling         = togglingSlot === key;
                        const isCustom           = !hourlySlotTimes.includes(slotStart);

                        const [h, m_]    = slotStart.split(':').map(Number);
                        const endSlotStr = `${String(h + 1).padStart(2, '0')}:${String(m_).padStart(2, '0')}`;
                        const timeLabel  = `${fmt24to12(slotStart)} - ${fmt24to12(endSlotStr)}`;

                        let bg = '#fff', borderCol = '#BFDBFE', textCol = '#334155', textDec = 'none', opacity: number = 1;
                        if (isBookedByClient) {
                          bg = '#2563EB'; borderCol = '#1D4ED8'; textCol = '#fff'; textDec = 'none'; opacity = 1;
                        } else if (isManuallyDisabled) {
                          bg = '#F1F5F9'; borderCol = '#CBD5E1'; textCol = '#94A3B8'; textDec = 'line-through'; opacity = 1;
                        }

                        return (
                          <button
                            key={slotStart}
                            disabled={isBookedByClient || isToggling}
                            onClick={() => handleToggleSlot(slotStart)}
                            title={
                              isBookedByClient
                                ? 'Booked by a client — cannot change'
                                : isManuallyDisabled
                                ? 'Click to mark as AVAILABLE again'
                                : 'Click to mark as UNAVAILABLE'
                            }
                            style={{
                              position: 'relative',
                              padding: '10px 6px',
                              borderRadius: 100,
                              border: `1.5px solid ${borderCol}`,
                              background: bg,
                              fontSize: 11,
                              fontWeight: 600,
                              color: textCol,
                              cursor: isBookedByClient ? 'not-allowed' : 'pointer',
                              fontFamily: 'inherit',
                              textAlign: 'center',
                              lineHeight: 1.3,
                              transition: 'all 0.15s',
                              outline: 'none',
                              textDecoration: textDec,
                              opacity: isToggling ? 0.5 : opacity,
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 2,
                              width: '100%',
                              pointerEvents: isBookedByClient ? 'none' : 'auto',
                            }}>
                            <span>{isToggling ? '…' : timeLabel}</span>

                            {isBookedByClient && (
                              <span style={{
                                fontSize: 8, fontWeight: 800, color: 'rgba(255,255,255,0.85)',
                                letterSpacing: '0.05em', textTransform: 'uppercase',
                                textDecoration: 'none', display: 'block', marginTop: 2,
                              }}>BOOKED</span>
                            )}
                            {isManuallyDisabled && !isBookedByClient && (
                              <>
                                <span style={{
                                  fontSize: 8, fontWeight: 800, color: '#94A3B8',
                                  letterSpacing: '0.05em', textTransform: 'uppercase',
                                  textDecoration: 'none', display: 'block',
                                }}>UNAVAILABLE</span>
                                <span style={{
                                  fontSize: 8, fontWeight: 800, color: '#16A34A',
                                  background: '#F0FDF4', border: '1px solid #86EFAC',
                                  borderRadius: 5, padding: '1px 6px',
                                  letterSpacing: '0.04em', textTransform: 'uppercase',
                                  textDecoration: 'none', display: 'block', marginTop: 2,
                                }}>↺ Mark Available</span>
                              </>
                            )}
                            {isCustom && !isUnavailable && !isBookedByClient && (
                              <span style={{
                                fontSize: 8, fontWeight: 800, color: '#10B981',
                                background: '#D1FAE5', borderRadius: 4, padding: '1px 5px',
                                textDecoration: 'none', display: 'block', marginTop: 2,
                              }}>CUSTOM</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}{slotToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: slotToast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999, whiteSpace: 'nowrap' }}>
          {slotToast.msg}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. MASTER TIME RANGES CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────
const MasterSlotsView: React.FC = () => {
  const [masterSlots, setMasterSlots] = useState<MasterSlot[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [newRange,    setNewRange]    = useState('');
  const [editingId,   setEditingId]   = useState<number | null>(null);
  const [editValue,   setEditValue]   = useState('');
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };

  const loadMasterSlots = async () => {
    setLoading(true); setMasterError(null);
    try {
      const data = await getMasterTimeslots();
      setMasterSlots(Array.isArray(data) ? data : data?.content || []);
    } catch (e: any) { setMasterError(e?.message || 'Failed to load.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadMasterSlots(); }, []);

  const handleAdd = async () => {
    if (!newRange.trim()) return;
    try { await createMasterTimeslot(newRange.trim()); setNewRange(''); await loadMasterSlots(); showToast('Time range added!'); }
    catch (e: any) { showToast(e?.message || 'Failed to add.', false); }
  };
  const handleUpdate = async (id: number) => {
    if (!editValue.trim()) return;
    try { await updateMasterTimeslot(id, editValue.trim()); setEditingId(null); await loadMasterSlots(); showToast('Updated!'); }
    catch (e: any) { showToast(e?.message || 'Failed to update.', false); }
  };
  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this time range?')) return;
    try { await deleteMasterTimeslot(id); await loadMasterSlots(); showToast('Deleted!'); }
    catch (e: any) { showToast(e?.message || 'Failed to delete.', false); }
  };

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>Master Time Ranges Config</h2>
        <span style={{ fontSize: 13, color: '#64748B' }}>
          {masterSlots.length} slot{masterSlots.length !== 1 ? 's' : ''} defined globally
        </span>
      </div>

      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 12 }}>
        <span style={{ fontSize: 20 }}>ℹ️</span>
        <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>
          <strong>How it works:</strong> These static ranges appear as options in the user booking modal as predefined global options. Add formats like <em>"9 AM – 10 AM"</em>.
        </div>
      </div>
      {masterError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {masterError}
          <button onClick={loadMasterSlots} style={{ marginLeft: 12, padding: '3px 10px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Retry</button>
        </div>
      )}{loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94A3B8' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #DBEAFE', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
          Loading…
        </div>
      ) : masterSlots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#F8FAFC', borderRadius: 14, color: '#94A3B8', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🕐</div>
          <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#64748B' }}>No static time ranges yet</p>
          <p style={{ margin: 0, fontSize: 13 }}>Add your first global range below.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {masterSlots.map((ms, idx) => (
            <div key={ms.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{idx + 1}</div>
              {editingId === ms.id ? (
                <>
                  <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleUpdate(ms.id); if (e.key === 'Escape') setEditingId(null); }}
                    placeholder="e.g. 10 AM – 11 AM"
                    style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #2563EB', borderRadius: 8, fontSize: 13, outline: 'none', background: '#F8FBFF' }} />
                  <button onClick={() => handleUpdate(ms.id)} style={{ padding: '7px 16px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingId(null)}  style={{ padding: '7px 14px', background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{ms.timeRange}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Visible to users in booking picker</div>
                  </div>
                  <button onClick={() => { setEditingId(ms.id); setEditValue(ms.timeRange); }}
                    style={{ padding: '6px 14px', border: '1px solid #DBEAFE', borderRadius: 8, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✎ Edit</button>
                  <button onClick={() => handleDelete(ms.id)}
                    style={{ padding: '6px 14px', border: '1px solid #FECACA', borderRadius: 8, background: '#FEF2F2', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✕ Delete</button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ background: '#F8FAFC', border: '1.5px dashed #BFDBFE', borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>+ Add New Time Range</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input value={newRange} onChange={e => setNewRange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g.  9 AM – 10 AM   or   2 PM – 3 PM"
            style={{ flex: 1, padding: '10px 14px', border: '1.5px solid #BFDBFE', borderRadius: 10, fontSize: 14, outline: 'none', background: '#fff' }} />
          <button className="btn-save" onClick={handleAdd} disabled={!newRange.trim()}
            style={{ padding: '10px 22px', whiteSpace: 'nowrap', opacity: !newRange.trim() ? 0.5 : 1 }}>
            Add Range
          </button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#94A3B8' }}>
          Tip: Use formats like <em>"9 AM – 10 AM"</em> or <em>"14:00 – 15:00"</em>.
        </p>
      </div>

      {masterSlots.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Preview — how users see your time slots
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8 }}>
            {masterSlots.map(ms => (
              <div key={ms.id} style={{ padding: '10px 8px', borderRadius: 10, border: '1.5px solid #E2E8F0', background: '#fff', textAlign: 'center', fontSize: 12, fontWeight: 600, color: '#374151' }}>
                {ms.timeRange}
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: toast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '10px 22px', borderRadius: 10, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', zIndex: 9999, whiteSpace: 'nowrap' }}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. FEEDBACKS VIEW
// ─────────────────────────────────────────────────────────────────────────────
const StarDisplay: React.FC<{ rating: number; size?: number }> = ({ rating, size = 16 }) => (
  <div style={{ display: 'flex', gap: 2 }}>
    {[1, 2, 3, 4, 5].map(s => (
      <svg key={s} width={size} height={size} viewBox="0 0 24 24"
        fill={s <= rating ? '#F59E0B' : '#E2E8F0'}
        stroke={s <= rating ? '#D97706' : '#CBD5E1'}
        strokeWidth="1.5">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    ))}
  </div>
);

const ratingLabel = (r: number) => ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][r] || '';

const FeedbacksView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const [feedbacks,    setFeedbacks]    = useState<FeedbackItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [filterRating, setFilterRating] = useState<number>(0);

  const loadFeedbacks = async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiFetch(`/feedbacks/consultant/${consultantId}`);
      const arr: FeedbackItem[] = Array.isArray(data) ? data
        : Array.isArray(data?.content) ? data.content
        : Array.isArray(data?.data)    ? data.data
        : [];

      if (arr.length === 0) { setFeedbacks([]); return; }

      let bookingMap: Record<number, { clientName: string; slotDate: string; timeRange: string }> = {};
      try {
        const bData = await apiFetch(`/bookings/consultant/${consultantId}`);
        const bArr  = Array.isArray(bData) ? bData : (bData?.content || []);

        let masterMap: Record<number, string> = {};
        try {
          const mData = await apiFetch('/master-timeslots');
          const mArr  = Array.isArray(mData) ? mData : (mData?.content || []);
          mArr.forEach((m: any) => { if (m.id && m.timeRange) masterMap[m.id] = m.timeRange; });
        } catch { /* non-fatal */ }

        bArr.forEach((b: any) => {
          const rawName =
            b.user?.name || b.user?.username || b.userName || b.clientName ||
            b.client?.name || b.user?.email || (b.userId ? `User #${b.userId}` : `Booking #${b.id}`);
          let clientName = rawName;
          if (rawName && rawName.includes('@')) {
            clientName = rawName.split('@')[0].replace(/[._-]/g, ' ')
              .replace(/\b\w/g, (c: string) => c.toUpperCase());
          }
          const slotDate  = b.bookingDate || b.slotDate || b.date || '';
          const timeRange =
            b.timeSlot?.masterTimeSlot?.timeRange ||
            b.masterTimeSlot?.timeRange           ||
            masterMap[b.masterTimeslotId]         ||
            masterMap[b.masterSlotId]             ||
            b.timeRange                           ||
            (b.slotTime ? (() => {
              const [h, mm] = (b.slotTime || '').split(':').map(Number);
              const ampm = h >= 12 ? 'PM' : 'AM'; const hr = h % 12 || 12;
              return `${hr}:${String(mm || 0).padStart(2,'0')} ${ampm}`;
            })() : '');

          bookingMap[b.id] = { clientName, slotDate, timeRange };
        });
      } catch { /* non-fatal */ }

      const enriched: FeedbackItem[] = await Promise.all(arr.map(async (f: any) => {
        const ctx = f.bookingId ? bookingMap[f.bookingId] : undefined;
        let clientName = ctx?.clientName || '';
        if (!clientName && f.userId) {
          try {
            const token = localStorage.getItem('fin_token');
            const res = await fetch(`/api/users/${f.userId}`, {
              headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            });
            if (res.ok) {
              const u = await res.json();
              const raw = u.name || u.fullName || u.username || u.email || u.identifier || '';
              clientName = raw.includes('@')
                ? raw.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
                : raw;
            }
          } catch { /* silently skip */ }
        }
        if (!clientName && f.userId) clientName = `User #${f.userId}`;
        return {
          ...f,
          rating:     Number(f.rating || 0),
          clientName: clientName || 'Anonymous',
          slotDate:   ctx?.slotDate  || f.createdAt?.split('T')[0] || '',
          timeRange:  ctx?.timeRange || '',
        };
      }));

      enriched.sort((a, b) => b.id - a.id);
      setFeedbacks(enriched);
    } catch (e: any) {
      setError(e?.message || 'Failed to load feedbacks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (consultantId) loadFeedbacks(); }, [consultantId]);

  const displayed = filterRating === 0
    ? feedbacks
    : feedbacks.filter(f => Math.round(f.rating) === filterRating);

  const avgRating = feedbacks.length > 0
    ? (feedbacks.reduce((s, f) => s + f.rating, 0) / feedbacks.length).toFixed(1)
    : '—';

  const ratingCounts = [5,4,3,2,1].map(r => ({
    r,
    count: feedbacks.filter(f => Math.round(f.rating) === r).length,
  }));

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>Client Feedbacks</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: '#64748B' }}>
            {feedbacks.length} review{feedbacks.length !== 1 ? 's' : ''}
          </span>
          <button onClick={loadFeedbacks} style={{ padding: '7px 16px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            🔄 Refresh
          </button>
        </div>
      </div>

      {feedbacks.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)', borderRadius: 16, padding: '22px 24px', marginBottom: 24, display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap', color: '#fff' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1, color: '#FCD34D' }}>{avgRating}</div>
            <StarDisplay rating={Math.round(Number(avgRating))} size={18} />
            <div style={{ fontSize: 12, color: '#93C5FD', marginTop: 4 }}>Overall Rating</div>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            {ratingCounts.map(({ r, count }) => (
              <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#BFDBFE', width: 6 }}>{r}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="#F59E0B" strokeWidth="0"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.15)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${feedbacks.length ? (count / feedbacks.length) * 100 : 0}%`, height: '100%', background: '#FCD34D', borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
                <span style={{ fontSize: 12, color: '#93C5FD', width: 20, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{feedbacks.length}</div>
            <div style={{ fontSize: 12, color: '#93C5FD' }}>Total Reviews</div>
          </div>
        </div>
      )}

      {feedbacks.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          {[0,5,4,3,2,1].map(r => (
            <button key={r} onClick={() => setFilterRating(r)} style={{
              padding: '6px 16px', borderRadius: 20, border: '1.5px solid',
              borderColor: filterRating === r ? '#2563EB' : '#E2E8F0',
              background:  filterRating === r ? '#2563EB' : '#fff',
              color:       filterRating === r ? '#fff'    : '#64748B',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              {r === 0 ? `All (${feedbacks.length})` : (
                <>{r}★ ({ratingCounts.find(x => x.r === r)?.count || 0})</>
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
          <button onClick={loadFeedbacks} style={{ marginLeft: 12, padding: '3px 10px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
          Loading feedbacks…
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: 16, color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⭐</div>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#64748B', fontSize: 15 }}>
            {feedbacks.length === 0 ? 'No feedbacks yet.' : `No ${filterRating}-star reviews.`}
          </p>
          <p style={{ margin: 0, fontSize: 13 }}>
            {feedbacks.length === 0
              ? 'Feedback from clients will appear here after completed sessions.'
              : 'Try a different filter.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {displayed.map(fb => (
            <div key={fb.id} style={{
              background: '#fff', border: '1px solid #F1F5F9',
              borderLeft: `4px solid ${fb.rating >= 4 ? '#86EFAC' : fb.rating >= 3 ? '#FCD34D' : '#FCA5A5'}`,
              borderRadius: 14, padding: '18px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, flexShrink: 0 }}>
                  {(fb.clientName || 'A').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{fb.clientName}</span>
                    <StarDisplay rating={Math.round(fb.rating)} size={15} />
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                      background: fb.rating >= 4 ? '#F0FDF4' : fb.rating >= 3 ? '#FFFBEB' : '#FEF2F2',
                      color:      fb.rating >= 4 ? '#16A34A' : fb.rating >= 3 ? '#D97706' : '#EF4444',
                    }}>
                      {ratingLabel(Math.round(fb.rating))}
                    </span>
                  </div>
                  {(fb.slotDate || fb.timeRange) && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      {fb.slotDate && (
                        <span style={{ fontSize: 12, color: '#64748B', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '2px 10px', borderRadius: 20 }}>
                          📅 {fb.slotDate}
                        </span>
                      )}
                      {fb.timeRange && (
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '2px 10px', borderRadius: 20 }}>
                          🕐 {fb.timeRange}
                        </span>
                      )}
                    </div>
                  )}
                  {fb.comments ? (
                    <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.65, background: '#F8FAFC', borderRadius: 10, padding: '10px 14px', borderLeft: '3px solid #DBEAFE' }}>
                      "{fb.comments}"
                    </p>
                  ) : (
                    <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>No written comment.</p>
                  )}
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
// 5. PROFILE VIEW
// ─────────────────────────────────────────────────────────────────────────────
const ProfileView: React.FC<{ profile: Consultant | null; onUpdate: () => void }> = ({ profile, onUpdate }) => {
  const [isEditing,    setIsEditing]    = useState(false);
  const [formData,     setFormData]     = useState<any>({});
  const [saving,       setSaving]       = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [photoFile,    setPhotoFile]    = useState<File | null>(null);
  const [saveToast,    setSaveToast]    = useState<{ msg: string; ok: boolean } | null>(null);
  const [formError,    setFormError]    = useState<string>('');

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const showSaveToast = (msg: string, ok = true) => {
    setSaveToast({ msg, ok });
    setTimeout(() => setSaveToast(null), 3500);
  };

  const initForm = (p: any) => {
    const trimTime = (t: string | null | undefined) => {
      if (!t) return '';
      return String(t).substring(0, 5);
    };
    setFormData({
      name:        p.name        || '',
      designation: p.designation || '',
      charges:     p.charges     || '',
      shiftStart:  trimTime(p.shiftStartTime || p.shift_start_time),
      shiftEnd:    trimTime(p.shiftEndTime   || p.shift_end_time),
      skills:      Array.isArray(p.skills) ? p.skills.join(', ') : (p.skills || ''),
      description: p.description || p.about || p.bio || '',
      rating:      p.rating      || '',
      email:       p.email       || '',
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
    if (!formData.name?.trim())        { setFormError('Name is required.'); return; }
    if (!formData.designation?.trim()) { setFormError('Designation is required.'); return; }
    if (!formData.charges)             { setFormError('Consultation fee is required.'); return; }
    if (!formData.shiftStart)          { setFormError('Shift start time is required.'); return; }
    if (!formData.shiftEnd)            { setFormError('Shift end time is required.'); return; }

    setSaving(true); setFormError('');
    try {
      const skillsList: string[] = typeof formData.skills === 'string'
        ? formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
        : (formData.skills || []);

      const toLocalTime = (t: string) => t.length === 5 ? `${t}:00` : t;

      const dataPayload = {
        name:           formData.name.trim(),
        designation:    formData.designation.trim(),
        charges:        parseFloat(formData.charges) || 0,
        email:          profile.email,
        skills:         skillsList,
        description:    formData.description?.trim() || '',
        rating:         formData.rating ? parseFloat(formData.rating) : null,
        shiftStartTime: toLocalTime(formData.shiftStart),
        shiftEndTime:   toLocalTime(formData.shiftEnd),
      };

      await updateAdvisor(profile.id, dataPayload, photoFile ?? undefined);
      await onUpdate();
      setIsEditing(false);
      setPhotoFile(null);
      showSaveToast('✓ Profile saved! Changes are now visible to users.');
    } catch (e: any) {
      setFormError(e?.message || 'Failed to save. Please try again.');
    } finally { setSaving(false); }
  };

  if (!profile) return <div>Loading…</div>;

  const avatarInitials = profile.name?.split(' ').map(w => w[0]).join('').toUpperCase().substring(0, 2) || 'C';

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '24px 0 12px', paddingBottom: 8, borderBottom: '1px solid #F1F5F9' }}>
      {children}
    </div>
  );

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>My Profile</h2>
        {!isEditing
          ? <button className="btn-save" onClick={() => setIsEditing(true)}>✎ Edit Profile</button>
          : <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-cancel" onClick={() => { setIsEditing(false); setFormError(''); }} disabled={saving}>Cancel</button>
              <button className="btn-save"   onClick={handleSave} disabled={saving}>
                {saving
                  ? <><span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite', marginRight: 6, verticalAlign: 'middle' }} />Saving…</>
                  : '✓ Save Changes'}
              </button>
            </div>
        }
      </div>

      {formError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {formError}
        </div>
      )}

      {saveToast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: saveToast.ok ? '#0F172A' : '#7F1D1D', color: '#fff', padding: '12px 24px', borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 9999, whiteSpace: 'nowrap', maxWidth: '90vw' }}>
          {saveToast.msg}
        </div>
      )}

      {!isEditing ? (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)', padding: '28px 28px 24px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#93C5FD', marginBottom: 16 }}>
              Consultant Profile
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', flexShrink: 0, background: (profile as any).profilePhoto ? 'transparent' : 'rgba(255,255,255,0.15)', border: '3px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backdropFilter: 'blur(4px)' }}>
                {(profile as any).profilePhoto
                  ? <img src={resolvePhotoUrl((profile as any).profilePhoto)} alt={profile.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  : <span style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>{avatarInitials}</span>
                }
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>{profile.name}</div>
                <div style={{ fontSize: 14, color: '#BFDBFE', marginBottom: 10 }}>{profile.designation}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {[1, 2, 3, 4, 5].map(i => (
                    <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill={i <= Math.round(profile.rating || 0) ? '#F59E0B' : 'rgba(255,255,255,0.25)'}>
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" />
                    </svg>
                  ))}
                  {profile.rating
                    ? <span style={{ fontSize: 13, fontWeight: 700, color: '#FCD34D' }}>{Number(profile.rating).toFixed(1)}</span>
                    : <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>No rating yet</span>
                  }
                  {profile.reviewCount ? <span style={{ fontSize: 12, color: '#BFDBFE' }}>({profile.reviewCount} reviews)</span> : null}
                </div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 14, padding: '12px 20px', textAlign: 'center', backdropFilter: 'blur(4px)' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>₹{Number(profile.charges).toLocaleString()}</div>
                <div style={{ fontSize: 11, color: '#BFDBFE', fontWeight: 600, marginTop: 2 }}>per session</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
              {profile.experience && <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600, border: '1px solid rgba(255,255,255,0.2)' }}>⏱ {profile.experience}+ yrs experience</span>}
              {profile.location   && <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600, border: '1px solid rgba(255,255,255,0.2)' }}>📍 {profile.location}</span>}
              {profile.languages  && <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600, border: '1px solid rgba(255,255,255,0.2)' }}>🌐 {profile.languages}</span>}
              {profile.phone      && <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 20, background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600, border: '1px solid rgba(255,255,255,0.2)' }}>📞 {profile.phone}</span>}
            </div>
          </div>

          <div style={{ padding: '0 28px 28px' }}>
            {(profile as any).description && (
              <>
                <SectionLabel>About</SectionLabel>
                <p style={{ margin: 0, fontSize: 14, color: '#374151', lineHeight: 1.7 }}>{(profile as any).description}</p>
              </>
            )}
            {profile.skills?.length > 0 && (
              <>
                <SectionLabel>Areas of Expertise</SectionLabel>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {profile.skills.map((skill, i) => (
                    <span key={i} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 20, background: '#EFF6FF', color: '#2563EB', fontWeight: 600, border: '1px solid #BFDBFE' }}>{skill}</span>
                  ))}
                </div>
              </>
            )}
            <SectionLabel>Details</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 16 }}>
              {[
                { label: 'Email',            value: profile.email,          icon: '✉️' },
                { label: 'Consultation Fee', value: profile.charges ? `₹${Number(profile.charges).toLocaleString()}` : null, icon: '💰' },
                { label: 'Rating',           value: profile.rating ? `${Number(profile.rating).toFixed(1)} / 5.0` : null, icon: '⭐' },
                { label: 'Shift Start',      value: (profile as any).shiftStartTime ? String((profile as any).shiftStartTime).substring(0, 5) : null, icon: '🕐' },
                { label: 'Shift End',        value: (profile as any).shiftEndTime   ? String((profile as any).shiftEndTime).substring(0, 5)   : null, icon: '🕕' },
              ].filter(item => item.value).map(item => (
                <div key={item.label} style={{ background: '#F8FAFC', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{item.icon} {item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', padding: 28 }}>
          <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20 }}>
            <div onClick={() => fileInputRef.current?.click()} style={{ width: 80, height: 80, borderRadius: '50%', flexShrink: 0, cursor: 'pointer', background: photoPreview ? 'transparent' : 'linear-gradient(135deg,#1E3A5F,#2563EB)', border: '3px solid #DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}>
              {photoPreview
                ? <img src={photoPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setPhotoPreview('')} />
                : <span style={{ fontSize: 24, fontWeight: 700, color: '#fff' }}>{avatarInitials}</span>
              }
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: '0.2s' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
              >
                <span style={{ fontSize: 20 }}>📷</span>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Profile Photo</label>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ padding: '8px 18px', border: '1.5px solid #BFDBFE', borderRadius: 8, background: '#EFF6FF', color: '#2563EB', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {photoFile ? '✓ Photo selected' : '📁 Choose Photo'}
              </button>
              {photoFile && <span style={{ marginLeft: 10, fontSize: 12, color: '#16A34A', fontWeight: 600 }}>{photoFile.name} ({(photoFile.size / 1024).toFixed(0)} KB)</span>}
              <p style={{ margin: '6px 0 0', fontSize: 11, color: '#94A3B8' }}>JPG, PNG, WebP — max 5 MB. Click the avatar or the button to upload.</p>
            </div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Basic Information</div>
          <div className="edit-form-grid" style={{ marginBottom: 24 }}>
            <div className="form-group">
              <label>Full Name *</label>
              <input className="form-input" name="name" value={formData.name || ''} onChange={handleChange} placeholder="e.g. Sreeja Reddy" />
            </div>
            <div className="form-group">
              <label>Designation *</label>
              <input className="form-input" name="designation" value={formData.designation || ''} onChange={handleChange} placeholder="e.g. Senior Financial Planner" />
            </div>
            <div className="form-group">
              <label>Consultation Fee (₹) *</label>
              <input className="form-input" name="charges" type="number" value={formData.charges || ''} onChange={handleChange} placeholder="2000" />
            </div>
            <div className="form-group">
              <label>⭐ Rating (0–5)</label>
              <input className="form-input" name="rating" type="number" step="0.1" min="0" max="5" value={formData.rating || ''} onChange={handleChange} placeholder="4.8" />
            </div>
            <div className="form-group">
              <label>🕐 Shift Start Time *</label>
              <input className="form-input" name="shiftStart" type="time" value={formData.shiftStart || ''} onChange={handleChange} style={{ borderColor: !formData.shiftStart ? '#FCA5A5' : undefined }} />
            </div>
            <div className="form-group">
              <label>🕕 Shift End Time *</label>
              <input className="form-input" name="shiftEnd" type="time" value={formData.shiftEnd || ''} onChange={handleChange} style={{ borderColor: !formData.shiftEnd ? '#FCA5A5' : undefined }} />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label>Skills / Expertise (comma separated) *</label>
              <input className="form-input" name="skills" value={formData.skills || ''} onChange={handleChange} placeholder="Tax Planning, Mutual Funds, Retirement Planning" />
            </div>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label>📝 Description / Bio</label>
              <textarea className="form-input" name="description" value={formData.description || ''} onChange={handleChange} rows={3} placeholder="Describe your expertise, experience and approach for clients." style={{ resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
          </div>

          <div style={{ paddingTop: 8, borderTop: '1px solid #F1F5F9' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#94A3B8' }}>
              💡 Fields marked with * are required. Your photo and description appear on the public consultant listing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AdvisorDashboard() {
  const navigate = useNavigate();
  const [activeTab,       setActiveTab]       = useState<'bookings' | 'calendar' | 'master-slots' | 'feedbacks' | 'profile'>('bookings');
  const [profileData,     setProfileData]     = useState<Consultant | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState<string | null>(null);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const user      = await getCurrentUser();
        const advisorId = user?.consultantId || user?.advisorId || user?.id;
        if (!advisorId) { setError('No consultant profile linked to this account.'); setLoading(false); return; }
        const consultant = await getAdvisorById(advisorId);
        setProfileData(consultant);
        try {
          const bookingData = await getBookingsByConsultant(advisorId);
          const arr: Booking[] = Array.isArray(bookingData) ? bookingData
            : Array.isArray((bookingData as any)?.content) ? (bookingData as any).content : [];
          setPendingBookings(arr.filter(b => b.status?.toUpperCase() === 'PENDING'));
        } catch { /* non-fatal */ }
      } catch { setError('Failed to load your dashboard. Please try again.'); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleLogout   = () => { logoutUser(); navigate('/'); };
  const refreshProfile = async () => {
    if (!profileData?.id) return;
    const updated = await getAdvisorById(profileData.id);
    setProfileData(updated);
  };

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#64748B' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #DBEAFE', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading your dashboard…
    </div>
  );

  if (error) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>⚠️</div>
      <p style={{ color: '#EF4444', fontWeight: 600 }}>{error}</p>
      <button onClick={() => navigate('/')} style={{ padding: '10px 24px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Back to Login</button>
    </div>
  );

  const tabs = [
    { id: 'bookings',     label: 'My Bookings',        icon: '📅' },
    { id: 'calendar',     label: 'My Schedule',        icon: '🗓️' },
    { id: 'master-slots', label: 'Master Time Ranges', icon: '🕐' },
    { id: 'feedbacks',    label: 'Feedbacks',          icon: '⭐' },
    { id: 'profile',      label: 'Profile',            icon: '👤' },
  ] as const;

  return (
    <div className="advisor-layout">
      <header className="advisor-navbar">
        <div className="nav-brand">
          <span className="brand-text">FINADVISE</span>
          <span className="brand-sub">CONSULTANT PORTAL</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {profileData && <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>{profileData.name}</span>}
          <div className="nav-profile" onClick={handleLogout} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748B' }}>Logout</span>
            <div className="avatar-circle-sm">{profileData?.name?.charAt(0).toUpperCase() ?? 'C'}</div>
          </div>
        </div>
      </header>

      {pendingBookings.length > 0 && (
        <div style={{ background: 'linear-gradient(90deg,#EFF6FF 0%,#DBEAFE 100%)', borderBottom: '1px solid #BFDBFE', padding: '10px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: '#2563EB', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{pendingBookings.length}</div>
            <div>
              <span style={{ fontWeight: 700, color: '#1E3A5F', fontSize: 14 }}>Pending Session{pendingBookings.length !== 1 ? 's' : ''} Awaiting Your Attention</span>
              <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                {pendingBookings.slice(0, 3).map(b => (
                  <span key={b.id} style={{ fontSize: 12, color: '#1E40AF' }}>
                    <strong>{b.user?.name || b.userName || `Client #${b.userId || b.id}`}</strong>
                    &nbsp;· {b.bookingDate || b.slotDate || b.date || '—'}
                  </span>
                ))}
                {pendingBookings.length > 3 && <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}>+{pendingBookings.length - 3} more</span>}
              </div>
            </div>
          </div>
          <button onClick={() => setActiveTab('bookings')} style={{ padding: '7px 18px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            View Bookings →
          </button>
        </div>
      )}

      <nav className="advisor-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`tab-btn ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
            {t.id === 'bookings' && pendingBookings.length > 0 && (
              <span style={{ marginLeft: 8, background: '#2563EB', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>{pendingBookings.length}</span>
            )}
          </button>
        ))}
      </nav>

      <main className="advisor-main">
        {activeTab === 'bookings'     && profileData && <BookingsView consultantId={profileData.id} />}
        {activeTab === 'calendar'     && profileData && (
          <MySlotsView
            consultantId={profileData.id}
            shiftStartTime={profileData.shiftStartTime || ''}
            shiftEndTime={profileData.shiftEndTime   || ''}
          />
        )}
        {activeTab === 'master-slots' && <MasterSlotsView />}
        {activeTab === 'feedbacks'    && profileData && <FeedbacksView consultantId={profileData.id} />}
        {activeTab === 'profile'      && <ProfileView profile={profileData} onUpdate={refreshProfile} />}
      </main>
    </div>
  );
}