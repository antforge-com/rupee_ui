import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/StatusBadge.tsx";
import styles from "../styles/UserPage.module.css";
import {
  createBooking,
  getAllConsultants,
  getAvailableTimeslotsByConsultant,
  getMyBookings,
  logoutUser
} from "../services/api";

interface Consultant {
  id: number;
  name: string;
  role: string;
  fee: number;
  tags: string[];
  rating: number;
  exp: number;
  reviews: number;
  avatar?: string;
  shiftTimings?: string;
}

interface Timeslot {
  id: number;
  consultantId: number;
  slotDate: string;
  slotTime: string;
  durationMinutes: number;
}

interface Booking {
  id: number;
  consultantId: number;
  timeSlotId: number;
  amount: number;
  bookingStatus: string;
  paymentStatus: string;
  consultantName?: string;
  slotDate?: string;
  slotTime?: string;
}

export default function UserPage() {
  const navigate = useNavigate();

  const [tab, setTab] = useState<"consultants" | "bookings" | "queries" | "settings">("consultants");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Consultants");
  const [toast, setToast] = useState("");

  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState({ consultants: true, bookings: false, slots: false });

  // Modal State
  const [showSlotModal, setShowSlotModal] = useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [allTimeslots, setAllTimeslots] = useState<Timeslot[]>([]);
  
  // Date & Time Selection
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [filteredSlots, setFilteredSlots] = useState<Timeslot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<Timeslot | null>(null);
  
  const [userNotes, setUserNotes] = useState("");

  const categories = ["All Consultants", "Tax Experts", "Investment", "Wealth", "Retirement"];

  const mapConsultant = (data: any): Consultant => ({
    id: data.id,
    name: data.name || "Expert Consultant",
    role: data.designation || "Financial Consultant",
    fee: Number(data.charges || 0),
    tags: data.skills || [],
    rating: 4.8, 
    exp: 5,
    reviews: 120,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=random&color=fff`,
    shiftTimings: data.shiftTimings,
  });

  const fetchConsultants = async () => {
    setLoading(prev => ({ ...prev, consultants: true }));
    try {
      const response = await getAllConsultants();
      const list = Array.isArray(response) ? response : [];
      setConsultants(list.map(mapConsultant));
    } catch (err: any) {
      console.error("Fetch Error:", err);
      setToast("Could not load consultants.");
    } finally {
      setLoading(prev => ({ ...prev, consultants: false }));
    }
  };

  const fetchBookings = async () => {
    setLoading(prev => ({ ...prev, bookings: true }));
    try {
      const response = await getMyBookings();
      const mappedBookings = (response as any[]).map(b => ({
        ...b,
        consultantName: b.consultantName || b.advisorName || "Consultant"
      }));
      setBookings(mappedBookings);
    } catch (err) {
      setBookings([]);
    } finally {
      setLoading(prev => ({ ...prev, bookings: false }));
    }
  };

  useEffect(() => {
    fetchConsultants();
  }, []);

  useEffect(() => {
    if (tab === "bookings") fetchBookings();
  }, [tab]);

  // Open Modal and Fetch Slots
  const handleOpenModal = async (c: Consultant) => {
    setSelectedConsultant(c);
    setShowSlotModal(true);
    setLoading(prev => ({ ...prev, slots: true }));
    
    // Reset states
    setSelectedSlot(null);
    setUserNotes("");
    
    try {
      const response = await getAvailableTimeslotsByConsultant(c.id);
      const slots = Array.isArray(response) ? response : [];
      
      setAllTimeslots(slots);

      // Extract unique dates
      const uniqueDates = Array.from(new Set(slots.map(s => s.slotDate))).sort();
      setAvailableDates(uniqueDates);

      // Auto-select first available date
      if (uniqueDates.length > 0) {
        setSelectedDate(uniqueDates[0]);
      } else {
        setSelectedDate("");
      }

    } catch {
      setAllTimeslots([]);
      setAvailableDates([]);
    } finally {
      setLoading(prev => ({ ...prev, slots: false }));
    }
  };

  // Filter slots when selected date changes
  useEffect(() => {
    if (selectedDate) {
      const slotsForDate = allTimeslots.filter(s => s.slotDate === selectedDate);
      setFilteredSlots(slotsForDate);
      setSelectedSlot(null); // Clear time selection when date changes
    } else {
      setFilteredSlots([]);
    }
  }, [selectedDate, allTimeslots]);

  const handleBookingConfirm = async () => {
    if (!selectedSlot || !selectedConsultant) return;
    try {
      await createBooking({
        consultantId: selectedConsultant.id,
        timeSlotId: selectedSlot.id,
        amount: selectedConsultant.fee,
        userNotes: userNotes || "User App Booking"
      });
      setShowSlotModal(false);
      setToast("✓ Session Booked Successfully!");
      if (tab === "bookings") fetchBookings();
    } catch (err: any) {
      setToast(`Booking Failed: ${err.message || "Unknown error"}`);
    } finally {
      setTimeout(() => setToast(""), 3000);
    }
  };

  // ✅ Logout Handler Fix
  const handleLogout = () => {
    logoutUser();
    navigate("/login", { replace: true });
  };

  const filteredList = consultants.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase()) || 
                          c.role.toLowerCase().includes(search.toLowerCase());
    const matchesCat = category === "All Consultants" || c.role.includes(category.replace(" Experts", ""));
    return matchesSearch && matchesCat;
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logoSection}>
          <div className={styles.logoText}>FINADVISE</div>
          <div className={styles.logoSub}>CONSULTANT BOOKING</div>
        </div>
        <button onClick={handleLogout} className={styles.backBtn}>Logout</button>
      </header>

      {toast && <div className={styles.toast}>{toast}</div>}

      <main className={styles.content}>
        {/* ── CONSULTANTS TAB ── */}
        {tab === "consultants" && (
          <div className={styles.tabPadding}>
            <div className={styles.searchWrapper}>
              <input 
                className={styles.searchInput} 
                placeholder="Search financial consultants..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
            </div>

            <div className={styles.categoryRow}>
              {categories.map(c => (
                <button 
                  key={c} 
                  className={`${styles.categoryBtn} ${category === c ? styles.categoryBtnActive : ""}`}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            {loading.consultants ? (
              <div style={{textAlign: 'center', padding: 40, color: '#64748B'}}>Loading Consultants...</div>
            ) : (
              <div className={styles.consultantList}>
                {filteredList.length > 0 ? (
                  filteredList.map(c => (
                    <div key={c.id} className={styles.consultantCard}>
                      
                      <div className={styles.ratingBadge}>★ {c.rating}</div>

                      {/* Left Side */}
                      <div className={styles.cardLeft}>
                        <img src={c.avatar} alt={c.name} className={styles.avatarImg} />
                        <div className={styles.cardInfo}>
                          <div className={styles.consultantName}>{c.name}</div>
                          <div className={styles.consultantRole}>{c.role}</div>
                        </div>
                      </div>

                      {/* Right Side */}
                      <div className={styles.cardRight}>
                        <div className={styles.feeValue}>₹{c.fee.toLocaleString()}</div>
                        <button className={styles.bookBtn} onClick={() => handleOpenModal(c)}>Book Session</button>
                      </div>

                    </div>
                  ))
                ) : (
                  <div style={{textAlign: 'center', padding: 40, color: '#94A3B8'}}>No consultants found.</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── BOOKINGS TAB ── */}
        {tab === "bookings" && (
          <div className={styles.tabPadding}>
            <h2 className={styles.sectionTitle}>Your Appointments</h2>
            {bookings.length > 0 ? (
              bookings.map(b => (
                <div key={b.id} className={styles.bookingCard}>
                  <div className={styles.bookingName}>{b.consultantName || "Consultation Session"}</div>
                  <div className={styles.bookingMeta}>
                    📅 {b.slotDate || "Date TBD"} | ⏰ {b.slotTime ? b.slotTime.substring(0, 5) : "Time TBD"}
                  </div>
                  <StatusBadge status={b.bookingStatus || "PENDING"} />
                </div>
              ))
            ) : (
              <div className={styles.emptyState}>No bookings yet.</div>
            )}
          </div>
        )}

        {/* ── QUERIES TAB ── */}
        {tab === "queries" && (
          <div className={styles.tabPadding}>
            <h2 className={styles.sectionTitle}>My Queries</h2>
            <div className={styles.emptyState}>No active queries found.</div>
          </div>
        )}

        {/* ── SETTINGS TAB ── */}
        {tab === "settings" && (
          <div className={styles.tabPadding}>
            <h2 className={styles.sectionTitle}>Settings</h2>
            <div className={styles.settingsCard}>
              <div className={styles.settingsItem}><span>Account Profile</span> <span>›</span></div>
              <div className={styles.settingsItem}><span>Notifications</span> <span>›</span></div>
              <div className={styles.settingsItem}><span>Privacy & Security</span> <span>›</span></div>
              <div className={styles.settingsItem} onClick={handleLogout} style={{color: '#DC2626'}}><span>Log Out</span></div>
            </div>
          </div>
        )}
      </main>

      {/* ── Modal ── */}
      {showSlotModal && selectedConsultant && (
        <div className={styles.modalOverlay} onClick={() => setShowSlotModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Schedule with {selectedConsultant.name}</h3>
              <button className={styles.modalClose} onClick={() => setShowSlotModal(false)}>×</button>
            </div>
            
            {loading.slots ? <p style={{textAlign: 'center', color: '#64748B'}}>Loading available dates...</p> : (
              <>
                {/* ── Date Selection Row ── */}
                {availableDates.length > 0 ? (
                  <>
                    <div style={{marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#64748B'}}>SELECT DATE</div>
                    <div className={styles.dateRow}>
                      {availableDates.map(date => {
                        // Format date to show Day and short date (e.g. Mon, 14)
                        const d = new Date(date);
                        const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                        const dateNum = d.toLocaleDateString('en-US', { day: '2-digit' });

                        return (
                          <button 
                            key={date}
                            className={`${styles.dateBtn} ${selectedDate === date ? styles.dateBtnActive : ""}`}
                            onClick={() => setSelectedDate(date)}
                          >
                            <span className={styles.dateBtnDay}>{dayName}</span>
                            <span className={styles.dateBtnDate}>{dateNum}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div style={{textAlign:'center', color:'#EF4444', fontSize:14, padding: 20}}>No dates available for this consultant.</div>
                )}

                {/* ── Time Selection Grid ── */}
                {selectedDate && (
                  <>
                    <div style={{marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#64748B'}}>SELECT TIME</div>
                    <div className={styles.timeGrid}>
                      {filteredSlots.length > 0 ? filteredSlots.map(s => (
                        <button 
                          key={s.id} 
                          className={`${styles.timeBtn} ${selectedSlot?.id === s.id ? styles.timeBtnActive : ""}`}
                          onClick={() => setSelectedSlot(s)}
                        >
                          {s.slotTime.substring(0, 5)}
                        </button>
                      )) : <div style={{gridColumn:'1/-1', textAlign:'center', color:'#94A3B8', fontSize:13}}>No slots for this date.</div>}
                    </div>
                  </>
                )}
                
                {selectedSlot && (
                  <div style={{marginBottom: 16}}>
                    <textarea 
                      placeholder="Add a note (optional)..." 
                      className={styles.notesTextarea}
                      value={userNotes}
                      onChange={(e) => setUserNotes(e.target.value)}
                    />
                  </div>
                )}

                <button 
                  className={styles.proceedBtn} 
                  disabled={!selectedSlot}
                  onClick={handleBookingConfirm}
                >
                  Confirm & Pay ₹{selectedConsultant.fee}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Bottom Nav ── */}
      <nav className={styles.bottomNav}>
        <button onClick={() => setTab("consultants")} className={`${styles.navBtn} ${tab === "consultants" ? styles.navBtnActive : ""}`}>
          <span>Consultants</span>
        </button>
        <button onClick={() => setTab("bookings")} className={`${styles.navBtn} ${tab === "bookings" ? styles.navBtnActive : ""}`}>
          <span>Bookings</span>
        </button>
        <button onClick={() => setTab("queries")} className={`${styles.navBtn} ${tab === "queries" ? styles.navBtnActive : ""}`}>
          <span>Queries</span>
        </button>
        <button onClick={() => setTab("settings")} className={`${styles.navBtn} ${tab === "settings" ? styles.navBtnActive : ""}`}>
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}