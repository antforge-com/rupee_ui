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

const getMasterTimeslots   = ()                         => apiFetch('/master-timeslots');
const createMasterTimeslot = (timeRange: string)        =>
  apiFetch('/master-timeslots', { method: 'POST', body: JSON.stringify({ timeRange }) });
const updateMasterTimeslot = (id: number, timeRange: string) =>
  apiFetch(`/master-timeslots/${id}`, { method: 'PUT', body: JSON.stringify({ timeRange }) });
const deleteMasterTimeslot = (id: number)               =>
  apiFetch(`/master-timeslots/${id}`, { method: 'DELETE' });

// ── Types ─────────────────────────────────────────────────────────────────────
interface Consultant {
  id: number;
  name: string;
  designation: string;
  charges: number;
  shiftTimings: string;        // legacy fallback (kept for compatibility)
  shiftStartTime: string;      // e.g. "09:00" — from backend LocalTime
  shiftEndTime: string;        // e.g. "18:00" — from backend LocalTime
  skills: string[];
  email: string;
}

interface MasterSlot {
  id: number;
  timeRange: string;
}

interface Booking {
  id: number;
  user?: { id?: number; name?: string; email?: string; username?: string } | null;
  client?: { id?: number; name?: string; email?: string } | null;
  userName?: string;
  clientName?: string;
  userEmail?: string;
  name?: string;
  userId?: number;
  clientId?: number;
  bookingDate?: string;
  slotDate?: string;
  date?: string;
  bookingTime?: string;
  slotTime?: string;
  durationMinutes?: number;
  amount?: number;
  charges?: number;
  fee?: number;
  status: 'CONFIRMED' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
  meetingLink?: string;
  jitsiLink?: string;
  joinUrl?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatTimeRange = (timeString: string, durationMins = 60) => {
  if (!timeString) return '—';
  
  if (timeString.includes('-') || timeString.match(/(AM|PM)/i)) return timeString;

  const [hours, minutes] = timeString.split(':').map(Number);
  const start = new Date();
  start.setHours(hours, minutes, 0);
  const end = new Date(start.getTime() + durationMins * 60000);
  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${fmt(start)} – ${fmt(end)}`;
};

const getClientName = (b: Booking): string =>
  b.user?.name || b.user?.username || b.client?.name ||
  b.userName || b.clientName || b.name ||
  b.userEmail?.split('@')[0] ||
  (b.userId   ? `User #${b.userId}`   : null) ||
  (b.clientId ? `Client #${b.clientId}` : null) ||
  `Booking #${b.id}`;

const getBookingDate = (b: Booking) => b.bookingDate || b.slotDate || b.date || '—';
const getBookingTime = (b: Booking) => {
  if ((b as any).timeSlot?.masterTimeSlot?.timeRange) return (b as any).timeSlot.masterTimeSlot.timeRange;
  if ((b as any).masterTimeSlot?.timeRange) return (b as any).masterTimeSlot.timeRange;

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

// ─────────────────────────────────────────────────────────────────────────────
// 1. BOOKINGS VIEW
// ─────────────────────────────────────────────────────────────────────────────
const BookingsView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState<'ALL'|'PENDING'|'CONFIRMED'|'COMPLETED'|'CANCELLED'>('ALL');

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await getBookingsByConsultant(consultantId);
        const arr  = Array.isArray(data) ? data : Array.isArray(data?.content) ? data.content : [];
        if (arr.length > 0) console.log('📋 Raw booking sample:', arr[0]);
        setBookings(arr);
      } catch { setError('Could not load bookings. Please try again.'); }
      finally   { setLoading(false); }
    })();
  }, [consultantId]);

  const filtered = filter === 'ALL' ? bookings : bookings.filter(b => b.status?.toUpperCase() === filter);
  const counts   = {
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
        {(['ALL','PENDING','CONFIRMED','COMPLETED','CANCELLED'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '6px 16px', borderRadius: 20, border: '1.5px solid',
            borderColor: filter === f ? '#2563EB' : '#E2E8F0',
            background: filter === f ? '#2563EB' : '#fff',
            color: filter === f ? '#fff' : '#64748B',
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
                background: '#fff', border: '1px solid #F1F5F9', borderLeft: `4px solid ${sc.border}`,
                borderRadius: 14, padding: '18px 20px', display: 'flex', alignItems: 'center',
                gap: 16, flexWrap: 'wrap', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'linear-gradient(135deg,#2563EB,#1D4ED8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                  {clientName.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 4 }}>Session with {clientName}</div>
                  <div style={{ fontSize: 13, color: '#64748B', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>📅 {date}</span>
                    <span>🕐 {timeRange}</span>
                    {amount > 0 && <span style={{ color: '#16A34A', fontWeight: 600 }}>₹{amount.toLocaleString()}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ padding: '5px 14px', borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                    {booking.status}
                  </span>
                  {booking.status === 'CONFIRMED' && (booking.meetingLink || booking.jitsiLink || booking.joinUrl) && (
                    <a href={booking.meetingLink || booking.jitsiLink || booking.joinUrl || '#'} target="_blank" rel="noreferrer"
                      style={{ padding: '6px 16px', background: '#2563EB', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
                      📹 Join
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

// ─────────────────────────────────────────────────────────────────────────────
// 2. MASTER SLOTS VIEW  
// ─────────────────────────────────────────────────────────────────────────────

interface TimeSlotRecord {
  id: number;
  consultantId: number;
  slotDate: string;
  masterTimeSlotId: number;
  timeRange: string;
  status: string;
  version?: number;
}

// ✅ FIXED LOGIC: Ensure exactly 1-hour slots are calculated within boundaries
const generateHourlySlots = (shiftStart: string, shiftEnd: string): string[] => {
  if (!shiftStart || !shiftEnd) return [];
  try {
    const [sh, sm] = shiftStart.split(':').map(Number);
    const [eh, em] = shiftEnd.split(':').map(Number);
    const startMins = sh * 60 + (isNaN(sm) ? 0 : sm);
    const endMins   = eh * 60 + (isNaN(em) ? 0 : em);
    const result: string[] = [];
    
    // Only push the start time if a full 60-minute slot can fit before the end time
    for (let m = startMins; m + 60 <= endMins; m += 60) {
      result.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`);
    }
    return result;
  } catch { return []; }
};

// "HH:MM" → "10:00 AM"
const fmt24to12 = (t: string): string => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr   = h % 12 || 12;
  return `${hr}:${String(m).padStart(2,'0')} ${ampm}`;
};

const MySlotsView: React.FC<{ consultantId: number; shiftStartTime: string; shiftEndTime: string }> = ({
  consultantId, shiftStartTime, shiftEndTime,
}) => {
  const [dbSlots,      setDbSlots]      = useState<TimeSlotRecord[]>([]);
  const [bookings,     setBookings]     = useState<any[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(''); // "YYYY-MM-DD"

  const loadData = async () => {
    setLoading(true); setError(null);
    try {
      try {
        const slotData = await apiFetch(`/timeslots/consultant/${consultantId}`);
        const slotArr  = Array.isArray(slotData) ? slotData : (slotData?.content || []);
        let masterLookup: Record<number, string> = {};
        try {
          const mData = await apiFetch('/master-timeslots');
          const mArr  = Array.isArray(mData) ? mData : (mData?.content || []);
          mArr.forEach((m: any) => { if (m.id && m.timeRange) masterLookup[m.id] = m.timeRange; });
        } catch { /* non-fatal */ }
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
    const h = parts[0];
    const m = isNaN(parts[1]) ? 0 : parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
  };

  const bookedSet = new Set<string>();

  bookings.forEach(b => {
    const st = (b.status || '').toUpperCase();
    if (st !== 'CONFIRMED' && st !== 'PENDING' && st !== 'COMPLETED') return;
    const date = b.slotDate || b.bookingDate || b.date || '';
    let timeKey = '';
    if (b.slotTime) {
      timeKey = b.slotTime.substring(0, 5);
    } else {
      const tr = b.timeSlot?.masterTimeSlot?.timeRange
                  || b.masterTimeSlot?.timeRange
                  || b.timeRange || '';
      const match = tr.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        let hh = parseInt(match[1]);
        const mm = match[2];
        const ap = match[3].toUpperCase();
        if (ap === 'PM' && hh !== 12) hh += 12;
        if (ap === 'AM' && hh === 12) hh = 0;
        timeKey = `${String(hh).padStart(2,'0')}:${mm}`;
      }
    }
    if (date && timeKey) bookedSet.add(`${date}|${timeKey}`);
  });

  dbSlots.forEach(s => {
    if ((s.status || '').toUpperCase() === 'AVAILABLE') return;
    const match = (s.timeRange || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (match && s.slotDate) {
      let hh = parseInt(match[1]);
      const ap = match[3].toUpperCase();
      if (ap === 'PM' && hh !== 12) hh += 12;
      if (ap === 'AM' && hh === 12) hh = 0;
      bookedSet.add(`${s.slotDate}|${String(hh).padStart(2,'0')}:${match[2]}`);
    }
  });

  const hourlySlotTimes = generateHourlySlots(
    shiftStartTime.substring(0, 5),
    shiftEndTime.substring(0, 5)
  );
  const hasShift = !!(shiftStartTime && shiftEndTime && hourlySlotTimes.length > 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const calendarDays: string[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    calendarDays.push(
      `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    );
  }

  const activeDateKey = selectedDate || calendarDays[0];

  const parseDateTab = (dateStr: string) => {
    const d   = new Date(dateStr + 'T00:00:00');
    const wd  = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
    const day = String(d.getDate());
    const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    return { wd, day, mon };
  };

  let totalCount = 0, availableCount = 0, bookedCount = 0;
  if (hasShift) {
    calendarDays.forEach(date => {
      hourlySlotTimes.forEach(t => {
        totalCount++;
        if (bookedSet.has(`${date}|${t}`)) bookedCount++;
        else availableCount++;
      });
    });
  }

  return (
    <div className="advisor-content-container">
      {/* Header */}
      <div className="section-header">
        <h2>Master Slots</h2>
        <button onClick={loadData} style={{ padding: '7px 16px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          🔄 Refresh
        </button>
      </div>

      {/* Shift Banner */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '12px 18px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontSize: 18 }}>🕐</span>
        <span style={{ fontSize: 13, color: '#1E40AF', fontWeight: 600 }}>
          Your Shift: {shiftStartTime ? fmtTime(shiftStartTime) : '—'} → {shiftEndTime ? fmtTime(shiftEndTime) : '—'}
        </span>
        {hasShift && (
          <span style={{ fontSize: 12, color: '#60A5FA', marginLeft: 4 }}>
            · {hourlySlotTimes.length} slot{hourlySlotTimes.length !== 1 ? 's' : ''} / day
          </span>
        )}
      </div>

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
      ) : !hasShift ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', background: '#F8FAFC', borderRadius: 14, color: '#94A3B8' }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🕐</div>
          <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#64748B', fontSize: 15 }}>Shift timings not set</p>
          <p style={{ margin: 0, fontSize: 13 }}>Go to Profile tab → set your Shift Start &amp; End times. Your slots will appear here automatically.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            {[
              { label: 'Total (30 days)', value: totalCount,     color: '#2563EB', bg: '#EFF6FF' },
              { label: 'Available',       value: availableCount, color: '#16A34A', bg: '#F0FDF4' },
              { label: 'Booked',          value: bookedCount,    color: '#64748B', bg: '#F1F5F9' },
            ].map(c => (
              <div key={c.label} style={{ background: c.bg, border: `1px solid ${c.color}22`, borderRadius: 10, padding: '10px 18px', minWidth: 115 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'stretch',
              borderBottom: '1px solid #E2E8F0',
              overflowX: 'auto',
              background: '#FAFBFC',
            }}>
              {calendarDays.map((dateStr, idx) => {
                const { wd, day, mon } = parseDateTab(dateStr);
                const isActive  = dateStr === activeDateKey;
                const isFirst   = idx === 0;

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    style={{
                      flexShrink: 0,
                      minWidth: 72,
                      padding: '12px 8px',
                      background: isActive ? '#2563EB' : 'transparent',
                      border: 'none',
                      borderRight: '1px solid #E2E8F0',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      transition: 'background 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? 'rgba(255,255,255,0.7)' : '#94A3B8', letterSpacing: '0.06em' }}>
                      {wd}
                    </span>
                    {day && (
                      <>
                        <span style={{ fontSize: 16, fontWeight: 700, color: isActive ? '#fff' : '#1E293B', lineHeight: 1.2 }}>
                          {day}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? 'rgba(255,255,255,0.8)' : (isFirst ? '#2563EB' : '#64748B'), letterSpacing: '0.04em' }}>
                          {mon}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ padding: '24px 28px' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 16 }}>
                Select Time
                <span style={{ marginLeft: 10, fontWeight: 400, color: '#94A3B8', fontSize: 12 }}>
                  {hourlySlotTimes.filter(t => !bookedSet.has(`${activeDateKey}|${t}`)).length} available
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {hourlySlotTimes.map(slotStart => {
                  const isBooked = bookedSet.has(`${activeDateKey}|${slotStart}`);
                  
                  // ✅ FIXED LOGIC: Generate full range label (e.g., "11:00 AM - 12:00 PM")
                  const [h, m] = slotStart.split(':').map(Number);
                  const endH = h + 1;
                  const endSlotStr = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                  const label = `${fmt24to12(slotStart)} - ${fmt24to12(endSlotStr)}`;

                  return (
                    <span
                      key={slotStart}
                      title={isBooked ? 'Booked / Unavailable' : 'Available'}
                      style={{
                        padding: '9px 20px',
                        borderRadius: 25,
                        fontSize: 13,
                        fontWeight: 500,
                        whiteSpace: 'nowrap',
                        cursor: 'default',
                        border: '1.5px solid',
                        background:     isBooked ? '#F1F5F9' : '#ffffff',
                        color:          isBooked ? '#94A3B8' : '#1E293B',
                        borderColor:    isBooked ? '#E2E8F0' : '#CBD5E1',
                        textDecoration: isBooked ? 'line-through' : 'none',
                        opacity:        isBooked ? 0.75 : 1,
                      }}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. PROFILE VIEW
// ─────────────────────────────────────────────────────────────────────────────
const ProfileView: React.FC<{ profile: Consultant | null; onUpdate: () => void }> = ({ profile, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData,  setFormData]  = useState<any>({});
  const [saving,    setSaving]    = useState(false);

  const fmtTime = (t: string) => {
    if (!t) return '—';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr   = h % 12 || 12;
    return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  useEffect(() => {
    if (profile) {
      setFormData({
        name:           profile.name,
        designation:    profile.designation,
        charges:        profile.charges,
        shiftStartTime: profile.shiftStartTime || '',
        shiftEndTime:   profile.shiftEndTime   || '',
        shiftTimings:   profile.shiftTimings   || '',   
        skills:         Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
      });
    }
  }, [profile, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        email:          profile.email,
        skills:         formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean),
        charges:        parseFloat(formData.charges),
        shiftStartTime: formData.shiftStartTime || null,
        shiftEndTime:   formData.shiftEndTime   || null,
      };
      await updateAdvisor(profile.id, payload);
      onUpdate();
      setIsEditing(false);
    } catch { alert('Failed to save changes.'); }
    finally { setSaving(false); }
  };

  if (!profile) return <div>Loading…</div>;

  const shiftDisplay = profile.shiftStartTime && profile.shiftEndTime
    ? `${fmtTime(profile.shiftStartTime)} – ${fmtTime(profile.shiftEndTime)}`
    : (profile.shiftTimings || '—');

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>My Profile</h2>
        {!isEditing && <button className="btn-save" onClick={() => setIsEditing(true)}>Edit Profile</button>}
      </div>
      <div className="profile-card-large">
        {!isEditing ? (
          <>
            <div className="profile-header">
              <div className="avatar-circle-lg">{profile.name?.charAt(0).toUpperCase()}</div>
              <div className="profile-info-main">
                <h3>{profile.name}</h3>
                <span className="designation-badge">{profile.designation}</span>
              </div>
            </div>
            <div className="profile-details-grid">
              <div className="detail-item"><label>Email</label><div className="detail-value" style={{ fontSize: 14 }}>{profile.email}</div></div>
              <div className="detail-item"><label>Consultation Fee</label><div className="detail-value">₹{profile.charges}</div></div>
              <div className="detail-item"><label>Shift Timings</label><div className="detail-value">{shiftDisplay}</div></div>
              <div className="detail-item" style={{ gridColumn: '1/-1' }}>
                <label>Expertise</label>
                <div className="skills-container">
                  {profile.skills?.map((skill, i) => <span key={i} className="skill-tag">{skill}</span>)}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="edit-form-wrapper">
            <div className="edit-form-grid" style={{ marginBottom: 32 }}>
              <div className="form-group"><label>Full Name</label><input className="form-input" name="name" value={formData.name} onChange={handleChange} /></div>
              <div className="form-group"><label>Designation</label><input className="form-input" name="designation" value={formData.designation} onChange={handleChange} /></div>
              <div className="form-group"><label>Consultation Fee (₹)</label><input className="form-input" name="charges" type="number" value={formData.charges} onChange={handleChange} /></div>
              <div className="form-group"><label>Shift Start Time</label><input className="form-input" name="shiftStartTime" type="time" value={formData.shiftStartTime} onChange={handleChange} /></div>
              <div className="form-group"><label>Shift End Time</label><input className="form-input" name="shiftEndTime" type="time" value={formData.shiftEndTime} onChange={handleChange} /></div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}><label>Skills (comma separated)</label><input className="form-input" name="skills" value={formData.skills} onChange={handleChange} /></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn-cancel" onClick={() => setIsEditing(false)} disabled={saving}>Cancel</button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AdvisorDashboard() {
  const navigate = useNavigate();
  const [activeTab,        setActiveTab]        = useState<'bookings'|'slots'|'profile'>('bookings');
  const [profileData,      setProfileData]      = useState<Consultant | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState<string | null>(null);
  const [pendingBookings,  setPendingBookings]  = useState<Booking[]>([]);

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
          const arr: Booking[] = Array.isArray(bookingData)
            ? bookingData
            : Array.isArray((bookingData as any)?.content) ? (bookingData as any).content : [];
          setPendingBookings(arr.filter(b => b.status?.toUpperCase() === 'PENDING'));
        } catch {}
      } catch { setError('Failed to load your dashboard. Please try again.'); }
      finally   { setLoading(false); }
    })();
  }, []);

  const handleLogout    = () => { logoutUser(); navigate('/'); };
  const refreshProfile  = async () => {
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
    { id: 'bookings', label: 'My Bookings',  icon: '📅' },
    { id: 'slots',    label: 'Master Slots', icon: '🕐' },
    { id: 'profile',  label: 'Profile',      icon: '👤' },
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
            <div style={{ background: '#2563EB', color: '#fff', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
              {pendingBookings.length}
            </div>
            <div>
              <span style={{ fontWeight: 700, color: '#1E3A5F', fontSize: 14 }}>
                Pending Session{pendingBookings.length !== 1 ? 's' : ''} Awaiting Your Attention
              </span>
              <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                {pendingBookings.slice(0, 3).map(b => (
                  <span key={b.id} style={{ fontSize: 12, color: '#1E40AF' }}>
                    <strong>{b.user?.name || b.userName || `Client #${b.userId || b.id}`}</strong>
                    &nbsp;· {b.bookingDate || b.slotDate || b.date || '—'}
                  </span>
                ))}
                {pendingBookings.length > 3 && (
                  <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}>+{pendingBookings.length - 3} more</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={() => setActiveTab('bookings')}
            style={{ padding: '7px 18px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            View Bookings →
          </button>
        </div>
      )}

      <nav className="advisor-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`tab-btn ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
            <span style={{ marginRight: 6 }}>{t.icon}</span>
            {t.label}
            {t.id === 'bookings' && pendingBookings.length > 0 && (
              <span style={{ marginLeft: 8, background: '#2563EB', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>
                {pendingBookings.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="advisor-main">
        {activeTab === 'bookings' && profileData && <BookingsView   consultantId={profileData.id} />}
        {activeTab === 'slots'    && profileData  && <MySlotsView consultantId={profileData.id} shiftStartTime={profileData.shiftStartTime || ''} shiftEndTime={profileData.shiftEndTime || ''} />}
        {activeTab === 'profile'                  && <ProfileView profile={profileData} onUpdate={refreshProfile} />}
      </main>
    </div>
  );
}