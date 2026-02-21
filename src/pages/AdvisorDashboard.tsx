import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/AdvisorDashboard.css'; 
import { 
  getCurrentUser, 
  getConsultantById, // ✅ Updated Import
  updateConsultant,  // ✅ Updated Import
  getTimeslotsByConsultant, 
  createTimeslot, 
  deleteTimeslot,
  getBookingsByConsultant, // ✅ New Import
  logoutUser
} from '../services/api';

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
  user: { name: string }; // Nested user object from backend
  bookingDate: string;
  bookingTime: string; // "10:30:00"
  durationMinutes: number;
  status: 'CONFIRMED' | 'PENDING' | 'COMPLETED' | 'CANCELLED';
  meetingLink?: string;
}

// --- HELPER: Format Time Range (10:00 -> 10:00 - 11:00) ---
const formatTimeRange = (timeString: string, durationMins: number = 60) => {
  if (!timeString) return "";
  
  const [hours, minutes] = timeString.split(':').map(Number);
  const start = new Date();
  start.setHours(hours, minutes, 0);

  const end = new Date(start.getTime() + durationMins * 60000);

  const format = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  
  return `${format(start)} - ${format(end)}`;
};

// --- COMPONENTS ---

// 1. SLOT MANAGEMENT VIEW
const SlotsView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');

  const fetchSlots = async () => {
    try {
      const data = await getTimeslotsByConsultant(consultantId);
      setSlots(data);
    } catch (error) {
      console.error("Error fetching slots", error);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, [consultantId]);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newTime) return;
    setLoading(true);
    try {
      const formattedTime = newTime.length === 5 ? `${newTime}:00` : newTime;
      
      await createTimeslot({
        consultantId, // ✅ Use correct field name
        slotDate: newDate,
        slotTime: formattedTime,
        durationMinutes: 60 
      });
      setNewDate('');
      setNewTime('');
      fetchSlots(); 
    } catch (error) {
      alert("Failed to add slot.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this slot?")) return;
    try {
      await deleteTimeslot(id);
      fetchSlots();
    } catch (error) {
      alert("Could not delete slot.");
    }
  };

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>Manage Availability</h2>
      </div>

      <div className="add-slot-card" style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #E2E8F0', marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#64748B' }}>DATE</label>
          <input type="date" className="form-input" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={{ display: 'block', marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#64748B' }}>TIME</label>
          <input type="time" className="form-input" value={newTime} onChange={(e) => setNewTime(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button className="btn-save" onClick={handleAddSlot} disabled={loading} style={{ height: 46 }}>
          {loading ? 'Adding...' : '+ Add Slot'}
        </button>
      </div>

      <div className="slots-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
        {slots.length === 0 ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#94A3B8', padding: 40 }}>No slots added.</div>
        ) : (
          slots.map((slot) => (
            <div key={slot.id} style={{ 
              background: slot.isBooked ? '#F1F5F9' : '#fff', 
              border: slot.isBooked ? '1px solid #E2E8F0' : '1px solid #BFDBFE',
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              opacity: slot.isBooked ? 0.7 : 1
            }}>
              <div>
                <div style={{ fontWeight: 700, color: '#0F172A' }}>{slot.slotDate}</div>
                <div style={{ fontSize: 14, color: '#64748B' }}>
                  {/* Show Time Range for Slot */}
                  {formatTimeRange(slot.slotTime, 60)}
                </div>
                {slot.isBooked && <span style={{ fontSize: 10, background: '#E2E8F0', padding: '2px 6px', borderRadius: 4, marginTop: 4, display: 'inline-block' }}>BOOKED</span>}
              </div>
              {!slot.isBooked && (
                <button onClick={() => handleDelete(slot.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: 600, fontSize: 18 }}>×</button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// 2. PROFILE VIEW
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
        skills: profile.skills.join(', ')
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
        skills: formData.skills.split(',').map((s: string) => s.trim()).filter((s: string) => s !== ''),
        charges: parseFloat(formData.charges)
      };
      await updateConsultant(profile.id, payload);
      onUpdate(); 
      setIsEditing(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <div>Loading...</div>;

  return (
    <div className="advisor-content-container">
      <div className="section-header">
        <h2>My Profile</h2>
        {!isEditing && (
          <button className="btn-save" onClick={() => setIsEditing(true)}>Edit Profile</button>
        )}
      </div>
      
      <div className="profile-card-large">
        {!isEditing ? (
          <>
            <div className="profile-header">
              <div className="avatar-circle-lg">
                {profile.name ? profile.name.charAt(0).toUpperCase() : 'C'}
              </div>
              <div className="profile-info-main">
                <h3>{profile.name}</h3>
                <span className="designation-badge">{profile.designation}</span>
              </div>
            </div>
            <div className="profile-details-grid">
              <div className="detail-item">
                <label>Email</label>
                <div className="detail-value" style={{fontSize: 14}}>{profile.email}</div>
              </div>
              <div className="detail-item">
                <label>Consultation Fee</label>
                <div className="detail-value">₹{profile.charges}</div>
              </div>
              <div className="detail-item">
                <label>Shift Timings</label>
                <div className="detail-value">{profile.shiftTimings}</div>
              </div>
              <div className="detail-item" style={{ gridColumn: '1 / -1' }}>
                <label>Expertise</label>
                <div className="skills-container">
                  {profile.skills && profile.skills.map((skill, index) => (
                    <span key={index} className="skill-tag">{skill}</span>
                  ))}
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
                <div className="form-group" style={{ gridColumn: '1 / -1' }}><label>Expertise</label><input className="form-input" name="skills" value={formData.skills} onChange={handleChange} /></div>
             </div>
             <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn-cancel" onClick={() => setIsEditing(false)} disabled={saving}>Cancel</button>
                <button className="btn-save" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 3. BOOKINGS VIEW (✅ NOW DYNAMIC)
const BookingsView: React.FC<{ consultantId: number }> = ({ consultantId }) => {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      try {
        const data = await getBookingsByConsultant(consultantId);
        setBookings(data);
      } catch (err) {
        console.error("Failed to load bookings");
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [consultantId]);

  if (loading) return <div>Loading Bookings...</div>;

  return (
    <div className="advisor-content-container">
      <div className="section-header"><h2>Upcoming Bookings</h2></div>
      
      {bookings.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#64748B', background: '#F8FAFC', borderRadius: 12 }}>
          No upcoming bookings found.
        </div>
      ) : (
        <div className="bookings-list">
          {bookings.map((booking) => (
            <div key={booking.id} className="booking-card">
              <div className="booking-left">
                <div className="calendar-icon">📅</div>
                <div className="booking-info">
                  <h4 className="booking-title">Session with {booking.user?.name || "Client"}</h4>
                  <p className="booking-time">
                    {booking.bookingDate} • 
                    <span style={{ fontWeight: 700, color: '#2563EB', marginLeft: 6 }}>
                      {/* ✅ Show Time Range (e.g., 10:00 AM - 11:00 AM) */}
                      {formatTimeRange(booking.bookingTime, booking.durationMinutes || 60)}
                    </span>
                  </p>
                </div>
              </div>
              <div className="booking-right">
                  <span className={`status-badge ${booking.status.toLowerCase()}`}>{booking.status}</span>
                  {booking.status === 'CONFIRMED' && (
                    <a href={booking.meetingLink || "#"} target="_blank" rel="noreferrer" className="btn-join">📹 Join</a>
                  )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- MAIN PAGE ---
export default function AdvisorDashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'profile' | 'slots' | 'bookings'>('profile');
  const [profileData, setProfileData] = useState<Consultant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initDashboard = async () => {
      try {
        const user = await getCurrentUser();
        // Check for 'consultantId' from the User entity (updated backend)
        if (!user || !user.consultantId) {
          alert("Access Denied: You are not registered as a Consultant.");
          navigate('/'); 
          return;
        }
        // Fetch Consultant Profile
        const consultant = await getConsultantById(user.consultantId);
        setProfileData(consultant);
      } catch (err) {
        console.error("Failed to load dashboard", err);
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
    if (profileData?.id) {
      const updated = await getConsultantById(profileData.id);
      setProfileData(updated);
    }
  };

  if (loading) return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>Loading...</div>;

  return (
    <div className="advisor-layout">
      <header className="advisor-navbar">
        <div className="nav-brand">
          <span className="brand-text">FINADVISE</span>
          <span className="brand-sub">CONSULTANT PORTAL</span>
        </div>
        <div className="nav-profile" onClick={handleLogout} style={{cursor: 'pointer'}}>
          <span style={{fontSize: 12, marginRight: 8, color: '#64748B'}}>Logout</span>
          <div className="avatar-circle-sm">
            {profileData ? profileData.name.charAt(0).toUpperCase() : 'C'}
          </div>
        </div>
      </header>

      <nav className="advisor-tabs">
        <button className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>My Profile</button>
        <button className={`tab-btn ${activeTab === 'slots' ? 'active' : ''}`} onClick={() => setActiveTab('slots')}>My Slots</button>
        <button className={`tab-btn ${activeTab === 'bookings' ? 'active' : ''}`} onClick={() => setActiveTab('bookings')}>Bookings</button>
      </nav>

      <main className="advisor-main">
        {activeTab === 'profile' && <ProfileView profile={profileData} onUpdate={refreshProfile} />}
        {activeTab === 'slots' && profileData && <SlotsView consultantId={profileData.id} />}
        {activeTab === 'bookings' && profileData && <BookingsView consultantId={profileData.id} />}
      </main>
    </div>
  );
}