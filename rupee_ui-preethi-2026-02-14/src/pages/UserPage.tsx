import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/StatusBadge.tsx";
import {
  createBooking,
  getAllConsultants,
  getConsultantById,
  getMyBookings,
  logoutUser
} from "../services/api";
import styles from "../styles/UserPage.module.css";

// ── API Helpers ─────────────────────────────────────────────────────────────
const BASE_URL = "/api";
const getToken = () => localStorage.getItem("fin_token");

const apiFetch = async (url: string) => {
  const token = getToken();
  const res   = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : { _text: await res.text() };
};

const fetchMasterTimeslots = async (): Promise<MasterSlot[]> => {
  try {
    const data = await apiFetch(`${BASE_URL}/master-timeslots`);
    const arr  = Array.isArray(data) ? data : data?.content || [];
    return arr;
  } catch (e) {
    console.error("Master timeslots fetch failed:", e);
    return [];
  }
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Consultant {
  id: number; name: string; role: string; fee: number;
  tags: string[]; rating: number; exp: number; reviews: number;
  avatar?: string; shiftTimings?: string;
  // ✅ Added new backend time fields
  shiftStartTime?: string; 
  shiftEndTime?: string;
}

interface MasterSlot { id: number; timeRange: string; isActive?: boolean; }

interface Booking {
  id: number; consultantId: number; timeSlotId: number; amount: number;
  BookingStatus: string; paymentStatus: string;
  consultantName?: string; slotDate?: string; slotTime?: string; timeRange?: string;
}

// ── Time helpers (Synced with Advisor Dashboard) ─────────────────────────────
const toAmPm = (time: string): string => {
  if (!time) return "";
  const parts = time.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || "0", 10);
  if (isNaN(h)) return time;
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${h >= 12 ? "PM" : "AM"}`;
};

const fmt24to12 = (t: string): string => {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr   = h % 12 || 12;
  return `${hr}:${String(m).padStart(2,'0')} ${ampm}`;
};

// ✅ Generates exact 1-hour boundaries matching the consultant dashboard
const generateHourlySlots = (shiftStart: string, shiftEnd: string): string[] => {
  if (!shiftStart || !shiftEnd) return [];
  try {
    const [sh, sm] = shiftStart.split(':').map(Number);
    const [eh, em] = shiftEnd.split(':').map(Number);
    const startMins = sh * 60 + (isNaN(sm) ? 0 : sm);
    const endMins   = eh * 60 + (isNaN(em) ? 0 : em);
    const result: string[] = [];
    
    for (let m = startMins; m + 60 <= endMins; m += 60) {
      result.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`);
    }
    return result;
  } catch { return []; }
};

// ── Date carousel ─────────────────────────────────────────────────────────────
const DAY_NAMES   = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
interface DayItem { iso: string; day: string; date: string; month: string; }

const buildDays = (n: number): DayItem[] => {
  const out: DayItem[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      iso:    d.toISOString().split("T")[0],
      day:    DAY_NAMES[d.getDay()],
      date:   String(d.getDate()).padStart(2,"0"),
      month: MONTH_NAMES[d.getMonth()],
    });
  }
  return out;
};

const ALL_DAYS     = buildDays(30);
const VISIBLE_DAYS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function UserPage() {
  const navigate = useNavigate();

  const [tab, setTab]           = useState<"consultants"|"bookings"|"queries"|"settings">("consultants");
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("All Consultants");
  const [toast, setToast]       = useState("");

  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [bookings, setBookings]       = useState<Booking[]>([]);
  const [loading, setLoading] = useState({ consultants: true, bookings: false, slots: false });

  // ── Modal state ──
  const [showModal, setShowModal]                   = useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  
  const [masterSlots, setMasterSlots]               = useState<MasterSlot[]>([]);
  const [bookedSlotSet, setBookedSlotSet]           = useState<Set<string>>(new Set());

  const [dayOffset, setDayOffset]                   = useState(0);
  const [selectedDay, setSelectedDay]               = useState<DayItem>(ALL_DAYS[0]);
  
  // ✅ Track dynamically generated slots instead of rigid DB entities
  const [selectedSlot, setSelectedSlot]             = useState<{start24h: string, label: string, masterId: number} | null>(null);
  
  const [meetingMode, setMeetingMode]               = useState<"ONLINE"|"OFFLINE">("ONLINE");
  const [userNotes, setUserNotes]                   = useState("");
  const [confirming, setConfirming]                 = useState(false);

  const visibleDays = ALL_DAYS.slice(dayOffset, dayOffset + VISIBLE_DAYS);
  const categories  = ["All Consultants","Tax Experts","Investment","Wealth","Retirement"];

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  const mapConsultant = (d: any): Consultant => ({
    id: d.id, name: d.name || "Expert Consultant",
    role: d.designation || "Financial Consultant",
    fee: Number(d.charges || 0), tags: d.skills || [],
    rating: d.rating || 4.8, exp: 5, reviews: 120,
    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name||"C")}&background=2563EB&color=fff&bold=true`,
    shiftTimings: d.shiftTimings,
    // ✅ Extract proper backend fields
    shiftStartTime: d.shiftStartTime || "",
    shiftEndTime: d.shiftEndTime || "",
  });

  const fetchConsultants = async () => {
    setLoading(p => ({ ...p, consultants: true }));
    try {
      const res = await getAllConsultants();
      setConsultants((Array.isArray(res) ? res : []).map(mapConsultant));
    } catch { showToast("Could not load consultants."); }
    finally { setLoading(p => ({ ...p, consultants: false })); }
  };

  const fetchBookings = async () => {
    setLoading(p => ({ ...p, bookings: true }));
    try {
      const raw = await getMyBookings();
      if (!Array.isArray(raw)) { setBookings([]); return; }

      const mapped = raw.map((b: any) => {
        const date = b.bookingDate || b.slotDate || b.date || b.booking_date || b.sessionDate || b.appointmentDate || "";
        const consultantName = b.consultantName || b.consultant?.name || b.advisorName || b.advisor?.name || "";

        return {
          ...b,
          consultantName: consultantName || "Loading…",
          slotDate:       date,
          timeRange:      b.timeRange || b.timeSlot?.masterTimeSlot?.timeRange || b.masterTimeSlot?.timeRange || (b.slotTime ? toAmPm(b.slotTime) : ""),
          slotTime:       b.slotTime || "",
          meetingMode:    b.meetingMode || b.meeting_mode || b.mode || "",
          BookingStatus:  (b.BookingStatus || b.status || b.bookingStatus || "PENDING").toUpperCase(),
        };
      });

      mapped.sort((a: any, b: any) => (b.slotDate || "").localeCompare(a.slotDate || ""));
      setBookings(mapped);

      const needsName = mapped.filter((b: any) => b.consultantName === "Loading…" && b.consultantId);
      if (needsName.length > 0) {
        const cIds = [...new Set(needsName.map((b:any) => b.consultantId))] as number[];
        const cMap: Record<number,any> = {};
        await Promise.all(cIds.map(id =>
          getConsultantById(id).then(d => { cMap[id] = d; }).catch(() => {})
        ));
        setBookings(prev => prev.map(b => ({
          ...b,
          consultantName: cMap[(b as any).consultantId]?.name || b.consultantName,
        })));
      }

    } catch (e) {
      console.error("fetchBookings error:", e);
      setBookings([]);
    } finally {
      setLoading(p => ({ ...p, bookings: false }));
    }
  };

  useEffect(() => { fetchConsultants(); }, []);
  useEffect(() => { if (tab === "bookings") fetchBookings(); }, [tab]);

  // ✅ PERFECT SYNC: Pull global master map + specific consultant bookings
  const handleOpenModal = async (c: Consultant) => {
    setSelectedConsultant(c);
    setMasterSlots([]);
    setBookedSlotSet(new Set());
    setDayOffset(0);
    setSelectedDay(ALL_DAYS[0]);
    setSelectedSlot(null);
    setMeetingMode("ONLINE");
    setUserNotes("");
    setShowModal(true);
    setLoading(p => ({ ...p, slots: true }));
    
    try {
      const [globalMasters, bookingsData] = await Promise.all([
        fetchMasterTimeslots(), // Fetch global masters to map IDs
        apiFetch(`${BASE_URL}/bookings/consultant/${c.id}`) // Fetch actual bookings to block out UI
      ]);

      setMasterSlots(Array.isArray(globalMasters) ? globalMasters : []);

      // Build booked set exactly like AdvisorDashboard
      const bSet = new Set<string>();
      const bArr = Array.isArray(bookingsData) ? bookingsData : (bookingsData?.content || []);
      
      bArr.forEach((b: any) => {
        const st = (b.status || '').toUpperCase();
        if (st !== 'CONFIRMED' && st !== 'PENDING' && st !== 'COMPLETED') return;
        
        const date = b.slotDate || b.bookingDate || b.date || '';
        let timeKey = '';
        
        // Grab the 24h start time string to perfectly block dynamically generated slots
        if (b.slotTime) {
            timeKey = b.slotTime.substring(0, 5);
        } else {
            const tr = b.timeSlot?.masterTimeSlot?.timeRange || b.masterTimeSlot?.timeRange || b.timeRange || '';
            const match = tr.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (match) {
                let hh = parseInt(match[1]);
                if (match[3].toUpperCase() === 'PM' && hh !== 12) hh += 12;
                if (match[3].toUpperCase() === 'AM' && hh === 12) hh = 0;
                timeKey = `${String(hh).padStart(2,'0')}:${match[2]}`;
            }
        }

        if (date && timeKey) {
            bSet.add(`${date}|${timeKey}`);
        }
      });
      
      setBookedSlotSet(bSet);

    } catch (e) {
      console.error("Failed loading modal data", e);
    } finally {
      setLoading(p => ({ ...p, slots: false }));
    }
  };

  const handleConfirm = async () => {
    if (!selectedSlot || !selectedConsultant) return;
    setConfirming(true);
    try {
      await createBooking({
        consultantId:      selectedConsultant.id,
        timeSlotId:        selectedSlot.masterId, // Send resolved DB ID
        masterTimeslotId:  selectedSlot.masterId, 
        slotTime:          selectedSlot.start24h, // Send literal time for safety
        timeRange:         selectedSlot.label,
        amount:            selectedConsultant.fee,
        userNotes:         userNotes || "Booked via app",
        meetingMode:       meetingMode,
        bookingDate:       selectedDay.iso,
        slotDate:          selectedDay.iso,
      } as any);
      
      setShowModal(false);
      showToast(`✓ Session booked for ${selectedDay.date} ${selectedDay.month} · ${selectedSlot.label}`);
      setTab("bookings");
      fetchBookings();
    } catch (err: any) {
      showToast(`Booking failed: ${err.message || "Unknown error"}`);
    } finally { setConfirming(false); }
  };

  const handleLogout = () => { logoutUser(); navigate("/login", { replace: true }); };

  const filteredList = consultants.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
                        c.role.toLowerCase().includes(search.toLowerCase());
    const matchCat    = category === "All Consultants" || c.role.includes(category.replace(" Experts",""));
    return matchSearch && matchCat;
  });

  const spinnerStyle: React.CSSProperties = {
    width:28, height:28, border:"3px solid #DBEAFE",
    borderTopColor:"#2563EB", borderRadius:"50%",
    animation:"spin 0.7s linear infinite", margin:"0 auto 12px",
  };

  // ✅ Generate slots for the currently viewed consultant
  const hourlySlotTimes = generateHourlySlots(
    (selectedConsultant?.shiftStartTime || '').substring(0, 5),
    (selectedConsultant?.shiftEndTime || '').substring(0, 5)
  );
  const hasShift = !!(selectedConsultant?.shiftStartTime && selectedConsultant?.shiftEndTime && hourlySlotTimes.length > 0);

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
        {tab === "consultants" && (
          <div className={styles.tabPadding}>
            <div className={styles.searchWrapper}>
              <input className={styles.searchInput} placeholder="Search financial consultants..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className={styles.categoryRow}>
              {categories.map(c => (
                <button key={c}
                  className={`${styles.categoryBtn} ${category===c ? styles.categoryBtnActive : ""}`}
                  onClick={() => setCategory(c)}>
                  {c}
                </button>
              ))}
            </div>
            {loading.consultants ? (
              <div style={{ textAlign:"center", padding:40, color:"#64748B" }}>Loading…</div>
            ) : (
              <div className={styles.consultantList}>
                {filteredList.map(c => (
                  <div key={c.id} className={styles.consultantCard}>
                    <div className={styles.ratingBadge}>★ {c.rating}</div>
                    <div className={styles.cardLeft}>
                      <img src={c.avatar} alt={c.name} className={styles.avatarImg} />
                      <div className={styles.cardInfo}>
                        <div className={styles.consultantName}>{c.name}</div>
                        <div className={styles.consultantRole}>{c.role}</div>
                      </div>
                    </div>
                    <div className={styles.cardRight}>
                      <div className={styles.feeValue}>₹{c.fee.toLocaleString()}</div>
                      <button className={styles.bookBtn} onClick={() => handleOpenModal(c)}>Book Session</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "bookings" && (
          <div className={styles.tabPadding}>
            <div className={styles.titleSection}>
              <h2 className={styles.sectionTitle}>My Bookings</h2>
              <button className={styles.historyButton} onClick={fetchBookings} disabled={loading.bookings} style={{ display:"flex", alignItems:"center", gap:6 }}>
                {loading.bookings ? "⏳" : "↻"} Refresh
              </button>
            </div>
            {loading.bookings ? (
              <div style={{ textAlign:"center", padding:40 }}><div style={spinnerStyle}/></div>
            ) : bookings.length > 0 ? (
              <div className={styles.bookingsList}>
                {bookings.map(b => {
                  const bAny = b as any;
                  const displayDate  = bAny.slotDate || bAny.bookingDate || bAny.date || "—";
                  const displayTime  = bAny.timeRange || (bAny.slotTime ? toAmPm(bAny.slotTime) : "");
                  const displayMode  = bAny.meetingMode || "";
                  return (
                  <div key={b.id} className={styles.bookingCard}>
                    <div className={styles.cardHeader}>
                      <div className={styles.calendarIcon}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className={styles.cardInfo}>
                        <div className={styles.sessionTitle}>Session with {b.consultantName}</div>
                        <div className={styles.sessionDateTime}>
                          {displayDate}{displayTime  && ` • ${displayTime}`}{displayMode  && ` • ${displayMode === "ONLINE" ? "💻 Online" : "🏢 Offline"}`}
                        </div>
                      </div>
                      <div className={styles.statusBadgeWrapper}><StatusBadge status={b.BookingStatus as any} /></div>
                    </div>
                    <div className={styles.cardActions}>
                      <button className={styles.joinButton} onClick={() => window.open(`https://meet.jit.si/finadvise-${b.id}`,"_blank")}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}>
                          <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/>
                        </svg> Join Jitsi
                      </button>
                      <button className={styles.rescheduleButton}>Reschedule</button>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div style={{ fontSize:36, marginBottom:12 }}>📅</div>
                <p style={{ margin:0, fontWeight:600, color:"#64748B" }}>No bookings yet.</p>
                <p style={{ margin:"6px 0 0", fontSize:13, color:"#94A3B8" }}>Book a session from the Consultants tab.</p>
              </div>
            )}
          </div>
        )}

        {tab === "queries" && (
          <div className={styles.tabPadding}>
            <h2 className={styles.sectionTitle}>My Queries</h2>
            <div className={styles.emptyState}>No active queries found.</div>
          </div>
        )}

        {tab === "settings" && (
          <div className={styles.tabPadding}>
            <h2 className={styles.sectionTitle}>Settings</h2>
            <div className={styles.settingsCard}>
              <div className={styles.settingsItem}><span>Account Profile</span><span>›</span></div>
              <div className={styles.settingsItem}><span>Notifications</span><span>›</span></div>
              <div className={styles.settingsItem}><span>Privacy & Security</span><span>›</span></div>
              <div className={styles.settingsItem} onClick={handleLogout} style={{ color:"#DC2626" }}><span>Log Out</span></div>
            </div>
          </div>
        )}
      </main>

      {/* ── BOOKING MODAL ── */}
      {showModal && selectedConsultant && (
        <div onClick={() => setShowModal(false)} style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"16px" }}>
          <div onClick={e => e.stopPropagation()} style={{ background:"#fff", borderRadius:20, width:"100%", maxWidth:520, boxShadow:"0 32px 80px rgba(15,23,42,0.3)", overflow:"hidden", maxHeight:"92vh", display:"flex", flexDirection:"column" }}>
            <div style={{ background:"linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)", padding:"20px 24px 18px", position:"relative", flexShrink:0 }}>
              <p style={{ fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase", color:"#93C5FD", margin:"0 0 4px" }}>Schedule a Session</p>
              <h3 style={{ fontSize:20, fontWeight:700, color:"#fff", margin:0 }}>{selectedConsultant.name}</h3>
              <p style={{ fontSize:13, color:"#BFDBFE", margin:"4px 0 0" }}>{selectedConsultant.role}&nbsp;·&nbsp;₹{selectedConsultant.fee.toLocaleString()} / session</p>
              <button onClick={() => setShowModal(false)} style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,0.2)", border:"none", color:"#fff", width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:18 }}>×</button>
            </div>

            <div style={{ padding:"20px 24px 24px", overflowY:"auto", flex:1 }}>
              {loading.slots ? (
                <div style={{ textAlign:"center", padding:"48px 0" }}><div style={spinnerStyle}/><p style={{ color:"#94A3B8", fontSize:13, margin:0 }}>Loading available time slots…</p></div>
              ) : (
                <>
                  <p style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"#64748B", margin:"0 0 10px" }}>Step 1 — Select Date</p>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:24 }}>
                    <button disabled={dayOffset === 0} onClick={() => setDayOffset(o => Math.max(0,o-1))} style={{ width:32, height:32, borderRadius:"50%", flexShrink:0, border:`1.5px solid ${dayOffset===0?"#F1F5F9":"#BFDBFE"}`, background:"#fff", cursor:dayOffset===0?"default":"pointer", color:dayOffset===0?"#CBD5E1":"#2563EB", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
                    <div style={{ display:"flex", gap:6, flex:1 }}>
                      {visibleDays.map(d => {
                        const isSel = selectedDay.iso === d.iso;
                        return (
                          <button key={d.iso} onClick={() => { setSelectedDay(d); setSelectedSlot(null); }} style={{ flex:1, padding:"8px 0", borderRadius:10, cursor:"pointer", border:`1.5px solid ${isSel?"#2563EB":"#E2E8F0"}`, background: isSel?"#2563EB":"#fff", display:"flex", flexDirection:"column", alignItems:"center", gap:1, outline:"none" }}>
                            <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.1em", color:isSel?"#BFDBFE":"#94A3B8" }}>{d.day}</span>
                            <span style={{ fontSize:17, fontWeight:700, color:isSel?"#fff":"#0F172A", lineHeight:1 }}>{d.date}</span>
                            <span style={{ fontSize:9, color:isSel?"#BFDBFE":"#94A3B8" }}>{d.month}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button disabled={dayOffset >= ALL_DAYS.length - VISIBLE_DAYS} onClick={() => setDayOffset(o => Math.min(ALL_DAYS.length-VISIBLE_DAYS,o+1))} style={{ width:32, height:32, borderRadius:"50%", flexShrink:0, border:`1.5px solid ${dayOffset>=ALL_DAYS.length-VISIBLE_DAYS?"#F1F5F9":"#BFDBFE"}`, background:"#fff", cursor:dayOffset>=ALL_DAYS.length-VISIBLE_DAYS?"default":"pointer", color:dayOffset>=ALL_DAYS.length-VISIBLE_DAYS?"#CBD5E1":"#2563EB", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
                  </div>

                  <p style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"#64748B", margin:"0 0 10px" }}>Step 2 — Select Time</p>
                  
                  {/* ✅ DYNAMIC RENDER: Matches exact logic of Advisor Dashboard */}
                  {!hasShift ? (
                    <div style={{ padding:"12px", background:"#F8FAFC", borderRadius:8, fontSize:13, color:"#64748B", textAlign:"center", marginBottom:20 }}>
                      This consultant has not set their shift timings yet.
                    </div>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:20 }}>
                      {hourlySlotTimes.map(slotStart => {
                        // Check if this specific date + time combination is booked
                        const isBooked = bookedSlotSet.has(`${selectedDay.iso}|${slotStart}`); 
                        
                        // Generate identical label: e.g., "11:00 AM - 12:00 PM"
                        const [h, m] = slotStart.split(':').map(Number);
                        const endSlotStr = `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                        const label = `${fmt24to12(slotStart)} - ${fmt24to12(endSlotStr)}`;

                        // Resolve Master ID if available in DB, fallback to 1
                        const matchedMaster = masterSlots.find(m => m.timeRange === label || m.timeRange.replace(/\s/g,'').toLowerCase() === label.replace(/\s/g,'').toLowerCase());
                        const resolvedMasterId = matchedMaster ? matchedMaster.id : 1;

                        const isSel = selectedSlot?.start24h === slotStart;

                        return (
                          <button
                            key={slotStart}
                            disabled={isBooked}
                            title={isBooked ? "This slot is already booked" : "Available"}
                            onClick={() => setSelectedSlot(isSel ? null : { start24h: slotStart, label, masterId: resolvedMasterId })}
                            style={{
                              padding:"10px 6px", borderRadius:10, fontSize:11, fontWeight:600, 
                              textAlign:"center", whiteSpace:"normal", wordBreak:"break-word", 
                              lineHeight:1.3, cursor: isBooked ? "not-allowed" : "pointer",
                              transition:"all 0.15s", outline:"none",
                              
                              border: isSel ? "1.5px solid #2563EB" : (isBooked ? "1.5px solid #E2E8F0" : "1.5px solid #CBD5E1"),
                              color: isBooked ? "#94A3B8" : (isSel ? "#fff" : "#1E293B"),
                              background: isBooked ? "#F1F5F9" : (isSel ? "#2563EB" : "#ffffff"),
                              textDecoration: isBooked ? "line-through" : "none",
                              opacity: isBooked ? 0.75 : 1
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <p style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"#64748B", margin:"0 0 8px" }}>Meeting Mode</p>
                  <div style={{ display:"flex", gap:10, marginBottom:20 }}>
                    {(["ONLINE","OFFLINE"] as const).map(mode => (
                      <button key={mode} onClick={() => setMeetingMode(mode)} style={{ flex:1, padding:"10px 0", borderRadius:10, border:`1.5px solid ${meetingMode===mode?"#2563EB":"#E2E8F0"}`, background: meetingMode===mode?"#EFF6FF":"#fff", color: meetingMode===mode?"#1D4ED8":"#64748B", fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
                        {mode === "ONLINE" ? "💻" : "🏢"} {mode}
                      </button>
                    ))}
                  </div>

                  <p style={{ fontSize:11, fontWeight:700, letterSpacing:"0.12em", textTransform:"uppercase", color:"#64748B", margin:"0 0 8px" }}>Notes (optional)</p>
                  <textarea value={userNotes} onChange={e => setUserNotes(e.target.value)} placeholder="What would you like to discuss?" rows={2} style={{ width:"100%", padding:"10px 14px", border:"1.5px solid #E2E8F0", borderRadius:10, fontSize:13, color:"#0F172A", resize:"none", outline:"none", marginBottom:16, boxSizing:"border-box" }} />

                  {selectedSlot && (
                    <div style={{ background:"#EFF6FF", border:"1.5px solid #BFDBFE", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#1E40AF", fontWeight:600, marginBottom:14, textAlign:"center" }}>
                      📅 {selectedDay.date} {selectedDay.month} &nbsp;·&nbsp; 🕐 {selectedSlot.label} &nbsp;·&nbsp; {meetingMode === "ONLINE" ? "💻 Online" : "🏢 Offline"} &nbsp;·&nbsp; ₹{selectedConsultant.fee.toLocaleString()}
                    </div>
                  )}

                  <button disabled={!selectedSlot || confirming} onClick={handleConfirm} style={{ width:"100%", padding:"14px", borderRadius:12, border:"none", background:(!selectedSlot||confirming)?"#E2E8F0":"linear-gradient(135deg,#2563EB,#1D4ED8)", color:(!selectedSlot||confirming)?"#94A3B8":"#fff", fontSize:14, fontWeight:700, cursor:(!selectedSlot||confirming)?"not-allowed":"pointer" }}>
                    {confirming ? "Booking…" : selectedSlot ? `Confirm & Pay ₹${selectedConsultant.fee.toLocaleString()}` : "Select a Date and Time to Continue"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <nav className={styles.bottomNav}>
        <button onClick={()=>setTab("consultants")} className={`${styles.navBtn} ${tab==="consultants"?styles.navBtnActive:""}`}><span>Consultants</span></button>
        <button onClick={()=>setTab("bookings")}    className={`${styles.navBtn} ${tab==="bookings"   ?styles.navBtnActive:""}`}><span>Bookings</span></button>
        <button onClick={()=>setTab("queries")}     className={`${styles.navBtn} ${tab==="queries"    ?styles.navBtnActive:""}`}><span>Queries</span></button>
        <button onClick={()=>setTab("settings")}    className={`${styles.navBtn} ${tab==="settings"   ?styles.navBtnActive:""}`}><span>Settings</span></button>
      </nav>
    </div>
  );
}