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
  shiftTimings: string;
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
const getBookingTime = (b: Booking) => b.bookingTime || b.slotTime || '';

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
// 1. BOOKINGS VIEW  (unchanged from original)
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

      {/* Summary Cards */}
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

      {/* Filter Chips */}
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
// 2. MASTER TIME RANGES VIEW  (replaces "My Slots" tab entirely)
//    — Full CRUD for /api/master-timeslots
//    — These ranges are what users see in the booking modal time picker
// ─────────────────────────────────────────────────────────────────────────────
const MasterSlotsView: React.FC = () => {
  const [masterSlots,   setMasterSlots]   = useState<MasterSlot[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [masterError,   setMasterError]   = useState<string | null>(null);
  const [newRange,      setNewRange]      = useState('');
  const [editingId,     setEditingId]     = useState<number | null>(null);
  const [editValue,     setEditValue]     = useState('');
  const [toast,         setToast]         = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const loadMasterSlots = async () => {
    setLoading(true); setMasterError(null);
    try {
      const data = await getMasterTimeslots();
      setMasterSlots(Array.isArray(data) ? data : data?.content || []);
    } catch (e: any) {
      setMasterError(e?.message || 'Failed to load master time ranges.');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadMasterSlots(); }, []);

  const handleAdd = async () => {
    if (!newRange.trim()) return;
    try {
      await createMasterTimeslot(newRange.trim());
      setNewRange('');
      await loadMasterSlots();
      showToast('Time range added! Users can now book this slot.');
    } catch (e: any) { showToast(e?.message || 'Failed to add.', false); }
  };

  const handleUpdate = async (id: number) => {
    if (!editValue.trim()) return;
    try {
      await updateMasterTimeslot(id, editValue.trim());
      setEditingId(null);
      await loadMasterSlots();
      showToast('Updated!');
    } catch (e: any) { showToast(e?.message || 'Failed to update.', false); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this time range? Users will no longer be able to book this slot.')) return;
    try {
      await deleteMasterTimeslot(id);
      await loadMasterSlots();
      showToast('Deleted!');
    } catch (e: any) { showToast(e?.message || 'Failed to delete.', false); }
  };

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>Master Time Ranges</h2>
        <span style={{ fontSize: 13, color: '#64748B' }}>{masterSlots.length} slot{masterSlots.length !== 1 ? 's' : ''} defined</span>
      </div>

      {/* How it works banner */}
      <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 12, padding: '14px 18px', marginBottom: 24, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>ℹ️</span>
        <div style={{ fontSize: 13, color: '#1E40AF', lineHeight: 1.6 }}>
          <strong>How it works:</strong> The time ranges you add here appear as bookable time slots in the user booking modal.
          When a user clicks "Book Session", they pick a date and then choose from these master time ranges.
          Add ranges like <em>"9 AM – 10 AM"</em>, <em>"2 PM – 3 PM"</em>, etc.
        </div>
      </div>

      {masterError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          ⚠️ {masterError}
          <button onClick={loadMasterSlots} style={{ marginLeft: 'auto', padding: '4px 12px', background: '#B91C1C', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      )}

      {/* ── Slot list ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94A3B8' }}>
          <div style={{ width: 28, height: 28, border: '3px solid #DBEAFE', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
          Loading…
        </div>
      ) : masterSlots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#F8FAFC', borderRadius: 14, color: '#94A3B8', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🕐</div>
          <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#64748B' }}>No time ranges yet</p>
          <p style={{ margin: 0, fontSize: 13 }}>Add your first range below — users won't see any time options until you do.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {masterSlots.map((ms, idx) => (
            <div key={ms.id} style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12,
              padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              {/* Index badge */}
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {idx + 1}
              </div>

              {editingId === ms.id ? (
                <>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleUpdate(ms.id); if (e.key === 'Escape') setEditingId(null); }}
                    placeholder="e.g. 10 AM – 11 AM"
                    style={{ flex: 1, padding: '8px 12px', border: '1.5px solid #2563EB', borderRadius: 8, fontSize: 13, color: '#0F172A', outline: 'none', background: '#F8FBFF' }}
                  />
                  <button onClick={() => handleUpdate(ms.id)}
                    style={{ padding: '7px 16px', background: '#2563EB', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)}
                    style={{ padding: '7px 14px', background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {/* Time range display */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>{ms.timeRange}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Visible to users in booking picker</div>
                  </div>
                  <button onClick={() => { setEditingId(ms.id); setEditValue(ms.timeRange); }}
                    style={{ padding: '6px 14px', border: '1px solid #DBEAFE', borderRadius: 8, background: '#EFF6FF', color: '#2563EB', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    ✎ Edit
                  </button>
                  <button onClick={() => handleDelete(ms.id)}
                    style={{ padding: '6px 14px', border: '1px solid #FECACA', borderRadius: 8, background: '#FEF2F2', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    ✕ Delete
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Add new range ── */}
      <div style={{ background: '#F8FAFC', border: '1.5px dashed #BFDBFE', borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          + Add New Time Range
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            value={newRange}
            onChange={e => setNewRange(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="e.g.  9 AM – 10 AM   or   2 PM – 3 PM"
            style={{
              flex: 1, padding: '10px 14px',
              border: '1.5px solid #BFDBFE', borderRadius: 10,
              fontSize: 14, color: '#0F172A', outline: 'none', background: '#fff',
            }}
          />
          <button
            className="btn-save"
            onClick={handleAdd}
            disabled={!newRange.trim()}
            style={{ padding: '10px 22px', whiteSpace: 'nowrap', opacity: !newRange.trim() ? 0.5 : 1 }}
          >
            Add Range
          </button>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#94A3B8' }}>
          Tip: Use clear formats like <em>"9 AM – 10 AM"</em> or <em>"14:00 – 15:00"</em>.
          These will appear exactly as written in the user's booking picker.
        </p>
      </div>

      {/* Preview */}
      {masterSlots.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
            Preview — how users see your time slots
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 8 }}>
            {masterSlots.map(ms => (
              <div key={ms.id} style={{
                padding: '10px 8px', borderRadius: 10, border: '1.5px solid #E2E8F0',
                background: '#fff', textAlign: 'center',
                fontSize: 12, fontWeight: 600, color: '#374151',
              }}>
                {ms.timeRange}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.ok ? '#0F172A' : '#7F1D1D',
          color: '#fff', padding: '10px 22px', borderRadius: 10,
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          zIndex: 9999, whiteSpace: 'nowrap',
        }}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. PROFILE VIEW  (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
const ProfileView: React.FC<{ profile: Consultant | null; onUpdate: () => void }> = ({ profile, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData,  setFormData]  = useState<any>({});
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        name:         profile.name,
        designation:  profile.designation,
        charges:      profile.charges,
        shiftTimings: profile.shiftTimings,
        skills:       Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
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
        email:   profile.email,
        skills:  formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean),
        charges: parseFloat(formData.charges),
      };
      await updateAdvisor(profile.id, payload);
      onUpdate();
      setIsEditing(false);
    } catch { alert('Failed to save changes.'); }
    finally { setSaving(false); }
  };

  if (!profile) return <div>Loading…</div>;

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
              <div className="detail-item"><label>Shift Timings</label><div className="detail-value">{profile.shiftTimings}</div></div>
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
              <div className="form-group"><label>Shift Timings</label><input className="form-input" name="shiftTimings" value={formData.shiftTimings} onChange={handleChange} /></div>
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

  // ── Tabs: "My Slots" is now "Master Slots" ──
  const tabs = [
    { id: 'bookings', label: 'My Bookings',   icon: '📅' },
    { id: 'slots',    label: 'Master Slots',   icon: '🕐' },  // ← renamed, new content
    { id: 'profile',  label: 'Profile',        icon: '👤' },
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

      {/* Pending bookings banner */}
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
        {activeTab === 'slots'                    && <MasterSlotsView />}
        {activeTab === 'profile'                  && <ProfileView profile={profileData} onUpdate={refreshProfile} />}
      </main>
    </div>
  );
}