import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createTimeslot,
  deleteTimeslot,
  getAdvisorById,
  getBookingsByConsultant,
  getCurrentUser,
  getTimeslotsByConsultant,
  logoutUser,
  updateAdvisor
} from '../services/api';
import '../styles/AdvisorDashboard.css';

// --- TYPES ---
interface Consultant {
  id: number;
  name: string;
  designation: string;
  charges: number;
  shiftTimings: string;
  skills: string[];
  email: string;
}

interface TimeSlot {
  id: number;
  slotDate: string;
  slotTime: string;
  isBooked: boolean;
}

interface Booking {
  id: number;
  // All possible nested user shapes from backend
  user?: { id?: number; name?: string; email?: string; username?: string } | null;
  client?: { id?: number; name?: string; email?: string } | null;
  // Flat name fields
  userName?: string;
  clientName?: string;
  userEmail?: string;
  name?: string;           // some backends just put name at top level
  // ID fields to look up name
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

// --- HELPERS ---
const formatTimeRange = (timeString: string, durationMins: number = 60) => {
  if (!timeString) return '—';
  const [hours, minutes] = timeString.split(':').map(Number);
  const start = new Date();
  start.setHours(hours, minutes, 0);
  const end = new Date(start.getTime() + durationMins * 60000);
  const fmt = (d: Date) =>
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${fmt(start)} – ${fmt(end)}`;
};

const getClientName = (b: Booking): string => {
  // Try every possible field the backend might use
  return (
    b.user?.name ||
    b.user?.username ||
    b.client?.name ||
    b.userName ||
    b.clientName ||
    b.name ||
    b.userEmail?.split('@')[0] ||   // email prefix as last resort before ID
    (b.userId ? `User #${b.userId}` : null) ||
    (b.clientId ? `Client #${b.clientId}` : null) ||
    `Booking #${b.id}`
  );
};

const getBookingDate = (b: Booking) =>
  b.bookingDate || b.slotDate || b.date || '—';

const getBookingTime = (b: Booking) =>
  b.bookingTime || b.slotTime || '';

const getStatusColor = (status: string) => {
  switch (status?.toUpperCase()) {
    case 'CONFIRMED':  return { bg: '#ECFDF5', color: '#059669', border: '#6EE7B7' };
    case 'PENDING':    return { bg: '#FFFBEB', color: '#D97706', border: '#FCD34D' };
    case 'COMPLETED':  return { bg: '#EFF6FF', color: '#2563EB', border: '#93C5FD' };
    case 'CANCELLED':  return { bg: '#FEF2F2', color: '#EF4444', border: '#FCA5A5' };
    default:           return { bg: '#F1F5F9', color: '#64748B', border: '#CBD5E1' };
  }
};

// ─────────────────────────────────────────────
// 1. BOOKINGS VIEW (Consultant's own bookings)
// ─────────────────────────────────────────────
const BookingsView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'>('ALL');

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getBookingsByConsultant(consultantId);
        const arr = Array.isArray(data)
          ? data
          : Array.isArray(data?.content)
          ? data.content
          : [];
        // 🔍 Log raw booking so you can see exact field names from backend
        if (arr.length > 0) console.log('📋 Raw booking sample:', arr[0]);
        setBookings(arr);
      } catch (err: any) {
        setError('Could not load bookings. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [consultantId]);

  const filtered =
    filter === 'ALL'
      ? bookings
      : bookings.filter((b) => b.status?.toUpperCase() === filter);

  const counts = {
    ALL: bookings.length,
    PENDING:   bookings.filter((b) => b.status === 'PENDING').length,
    CONFIRMED: bookings.filter((b) => b.status === 'CONFIRMED').length,
    COMPLETED: bookings.filter((b) => b.status === 'COMPLETED').length,
    CANCELLED: bookings.filter((b) => b.status === 'CANCELLED').length,
  };

  const totalRevenue = bookings
    .filter((b) => b.status === 'COMPLETED')
    .reduce((sum, b) => sum + Number(b.amount || b.charges || 0), 0);

  return (
    <div className="advisor-content-container">
      {/* Header */}
      <div className="section-header">
        <h2>My Bookings</h2>
        <span style={{ fontSize: 13, color: '#64748B' }}>
          {bookings.length} total session{bookings.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total',     value: counts.ALL,       color: '#2563EB', bg: '#EFF6FF' },
          { label: 'Pending',   value: counts.PENDING,   color: '#D97706', bg: '#FFFBEB' },
          { label: 'Confirmed', value: counts.CONFIRMED, color: '#059669', bg: '#ECFDF5' },
          { label: 'Completed', value: counts.COMPLETED, color: '#7C3AED', bg: '#F5F3FF' },
          { label: 'Revenue',   value: `₹${totalRevenue.toLocaleString()}`, color: '#059669', bg: '#ECFDF5' },
        ].map((s) => (
          <div key={s.label} style={{
            background: s.bg,
            border: `1px solid ${s.color}22`,
            borderRadius: 12,
            padding: '14px 16px',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['ALL', 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 16px',
              borderRadius: 20,
              border: '1.5px solid',
              borderColor: filter === f ? '#2563EB' : '#E2E8F0',
              background: filter === f ? '#2563EB' : '#fff',
              color: filter === f ? '#fff' : '#64748B',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {f} ({counts[f]})
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', color: '#B91C1C', fontSize: 13, marginBottom: 16 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Loading */}
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
          {filtered.map((booking) => {
            const sc = getStatusColor(booking.status);
            const clientName = getClientName(booking);
            const date = getBookingDate(booking);
            const timeRange = formatTimeRange(getBookingTime(booking), booking.durationMinutes || 60);
            const amount = Number(booking.amount || booking.charges || 0);

            return (
              <div
                key={booking.id}
                style={{
                  background: '#fff',
                  border: '1px solid #F1F5F9',
                  borderLeft: `4px solid ${sc.border}`,
                  borderRadius: 14,
                  padding: '18px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {clientName.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A', marginBottom: 4 }}>
                    Session with {clientName}
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>📅 {date}</span>
                    <span>🕐 {timeRange}</span>
                    {amount > 0 && <span style={{ color: '#059669', fontWeight: 600 }}>₹{amount.toLocaleString()}</span>}
                  </div>
                </div>

                {/* Status Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{
                    padding: '5px 14px',
                    borderRadius: 20,
                    background: sc.bg,
                    color: sc.color,
                    border: `1px solid ${sc.border}`,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                  }}>
                    {booking.status}
                  </span>

                  {booking.status === 'CONFIRMED' && (booking.meetingLink || booking.jitsiLink || booking.joinUrl) && (
                    <a
                      href={booking.meetingLink || booking.jitsiLink || booking.joinUrl || '#'}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '6px 16px',
                        background: '#2563EB',
                        color: '#fff',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
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

// ─────────────────────────────────────────────
// 2. SLOT MANAGEMENT VIEW
// ─────────────────────────────────────────────
const SlotsView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  const fetchSlots = async () => {
    try {
      const data = await getTimeslotsByConsultant(consultantId);
      setSlots(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching slots', err);
    }
  };

  useEffect(() => { fetchSlots(); }, [consultantId]);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newTime) return;
    setLoading(true);
    try {
      const formattedTime = newTime.length === 5 ? `${newTime}:00` : newTime;
      await createTimeslot({ consultantId, slotDate: newDate, slotTime: formattedTime, durationMinutes: 60 });
      setNewDate('');
      setNewTime('');
      fetchSlots();
    } catch {
      alert('Failed to add slot.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this slot?')) return;
    try {
      await deleteTimeslot(id);
      fetchSlots();
    } catch {
      alert('Could not delete slot.');
    }
  };

  return (
    <div className="advisor-content-container">
      <div className="section-header"><h2>Manage Availability</h2></div>

      <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #E2E8F0', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#64748B' }}>DATE</label>
          <input type="date" className="form-input" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#64748B' }}>TIME</label>
          <input type="time" className="form-input" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button className="btn-save" onClick={handleAddSlot} disabled={loading} style={{ height: 46 }}>
          {loading ? 'Adding…' : '+ Add Slot'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {slots.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#94A3B8', padding: 40 }}>No slots added.</div>
        ) : slots.map((slot) => (
          <div key={slot.id} style={{
            background: slot.isBooked ? '#F1F5F9' : '#fff',
            border: slot.isBooked ? '1px solid #E2E8F0' : '1px solid #BFDBFE',
            borderRadius: 12, padding: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            opacity: slot.isBooked ? 0.75 : 1,
          }}>
            <div>
              <div style={{ fontWeight: 700, color: '#0F172A' }}>{slot.slotDate}</div>
              <div style={{ fontSize: 14, color: '#64748B' }}>{formatTimeRange(slot.slotTime, 60)}</div>
              {slot.isBooked && <span style={{ fontSize: 10, background: '#E2E8F0', padding: '2px 6px', borderRadius: 4, marginTop: 4, display: 'inline-block' }}>BOOKED</span>}
            </div>
            {!slot.isBooked && (
              <button onClick={() => handleDelete(slot.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 700, fontSize: 20 }}>×</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────
// 3. PROFILE VIEW
// ─────────────────────────────────────────────
const ProfileView: React.FC<{ profile: Consultant | null; onUpdate: () => void }> = ({ profile, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name,
        designation: profile.designation,
        charges: profile.charges,
        shiftTimings: profile.shiftTimings,
        skills: Array.isArray(profile.skills) ? profile.skills.join(', ') : '',
      });
    }
  }, [profile, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const payload = {
        ...formData,
        email: profile.email,
        skills: formData.skills.split(',').map((s: string) => s.trim()).filter(Boolean),
        charges: parseFloat(formData.charges),
      };
      await updateAdvisor(profile.id, payload);
      onUpdate();
      setIsEditing(false);
    } catch {
      alert('Failed to save changes.');
    } finally {
      setSaving(false);
    }
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
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
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
              <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Skills (comma separated)</label><input className="form-input" name="skills" value={formData.skills} onChange={handleChange} /></div>
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

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function AdvisorDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'slots' | 'bookings'>('bookings');
  const [profileData, setProfileData] = useState<Consultant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingBookings, setPendingBookings] = useState<Booking[]>([]);

  useEffect(() => {
    const initDashboard = async () => {
      try {
        const user = await getCurrentUser();
        console.log('Current user:', user);

        const advisorId = user?.consultantId || user?.advisorId || user?.id;

        if (!advisorId) {
          setError('No consultant profile linked to this account. Contact admin.');
          setLoading(false);
          return;
        }

        const consultant = await getAdvisorById(advisorId);
        setProfileData(consultant);

        // Fetch bookings to show pending count in header banner
        try {
          const bookingData = await getBookingsByConsultant(advisorId);
          const arr: Booking[] = Array.isArray(bookingData)
            ? bookingData
            : Array.isArray((bookingData as any)?.content)
            ? (bookingData as any).content
            : [];
          setPendingBookings(arr.filter((b) => b.status?.toUpperCase() === 'PENDING'));
        } catch {
          // non-critical
        }
      } catch (err) {
        console.error('Failed to load dashboard:', err);
        setError('Failed to load your dashboard. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    initDashboard();
  }, [navigate]);

  const handleLogout = () => {
    logoutUser();
    navigate('/');
  };

  const refreshProfile = async () => {
    if (!profileData?.id) return;
    const updated = await getAdvisorById(profileData.id);
    setProfileData(updated);
  };

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#64748B' }}>
      <div style={{ width: 36, height: 36, border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
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
    { id: 'bookings', label: 'My Bookings', icon: '📅' },
    { id: 'slots',    label: 'My Slots',    icon: '🕐' },
    { id: 'profile',  label: 'Profile',     icon: '👤' },
  ] as const;

  return (
    <div className="advisor-layout">
      <header className="advisor-navbar">
        <div className="nav-brand">
          <span className="brand-text">FINADVISE</span>
          <span className="brand-sub">CONSULTANT PORTAL</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {profileData && (
            <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
              {profileData.name}
            </span>
          )}
          <div className="nav-profile" onClick={handleLogout} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#64748B' }}>Logout</span>
            <div className="avatar-circle-sm">
              {profileData?.name?.charAt(0).toUpperCase() ?? 'C'}
            </div>
          </div>
        </div>
      </header>

      {/* ── PENDING BOOKINGS BANNER (below header, above tabs) ── */}
      {pendingBookings.length > 0 && (
        <div
          style={{
            background: 'linear-gradient(90deg, #FFFBEB 0%, #FEF3C7 100%)',
            borderBottom: '1px solid #FCD34D',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* Left: count + label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              background: '#F59E0B',
              color: '#fff',
              borderRadius: '50%',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
            }}>
              {pendingBookings.length}
            </div>
            <div>
              <span style={{ fontWeight: 700, color: '#92400E', fontSize: 14 }}>
                Pending Session{pendingBookings.length !== 1 ? 's' : ''} Awaiting Your Attention
              </span>
              <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                {pendingBookings.slice(0, 3).map((b) => (
                  <span key={b.id} style={{ fontSize: 12, color: '#78350F', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>
                      {b.user?.name || b.userName || b.clientName || `Client #${b.userId || b.id}`}
                    </span>
                    <span style={{ color: '#B45309' }}>
                      · {b.bookingDate || b.slotDate || b.date || '—'}
                    </span>
                  </span>
                ))}
                {pendingBookings.length > 3 && (
                  <span style={{ fontSize: 12, color: '#92400E', fontWeight: 600 }}>
                    +{pendingBookings.length - 3} more
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: CTA button */}
          <button
            onClick={() => setActiveTab('bookings')}
            style={{
              padding: '7px 18px',
              background: '#F59E0B',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 4px rgba(245,158,11,0.3)',
            }}
          >
            View Bookings →
          </button>
        </div>
      )}

      <nav className="advisor-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            <span style={{ marginRight: 6 }}>{t.icon}</span>
            {t.label}
            {/* Badge on My Bookings tab when there are pending */}
            {t.id === 'bookings' && pendingBookings.length > 0 && (
              <span style={{
                marginLeft: 8,
                background: '#F59E0B',
                color: '#fff',
                borderRadius: 10,
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 7px',
              }}>
                {pendingBookings.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      <main className="advisor-main">
        {activeTab === 'bookings' && profileData && <BookingsView consultantId={profileData.id} />}
        {activeTab === 'slots'    && profileData && <SlotsView    consultantId={profileData.id} />}
        {activeTab === 'profile'  && <ProfileView profile={profileData} onUpdate={refreshProfile} />}
      </main>
    </div>
  );
}