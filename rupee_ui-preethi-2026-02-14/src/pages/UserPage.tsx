import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/StatusBadge.tsx";
import {
  createBooking,
  getAllConsultants,
  getConsultantById,
  getCurrentUser,
  getMyBookings,
  getMyQueries,
  logoutUser,
  submitQuery,
} from "../services/api";
import styles from "../styles/UserPage.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = "/api";
const getToken = () => localStorage.getItem("fin_token");

const apiFetch = async (url: string, options?: RequestInit) => {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options?.headers as Record<string, string>) || {}),
    },
  });
  const ct   = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json()
    : { message: await res.text() };
  if (!res.ok)
    throw new Error(data?.message || data?.error || `Request failed ${res.status}`);
  return data;
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
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
  shiftStartTime?: string;
  shiftEndTime?: string;
  shiftTimings?: string;
  location?: string;
  about?: string;
  languages?: string;
  phone?: string;
}

interface MasterSlot {
  id: number;
  timeRange: string;
  isActive?: boolean;
}

interface TimeSlotRecord {
  id: number;
  slotDate: string;
  slotTime: string;
  status: string;
  masterTimeSlotId?: number;
}

interface Booking {
  id: number;
  consultantId: number;
  timeSlotId: number;
  amount: number;
  BookingStatus: string;
  paymentStatus: string;
  consultantName?: string;
  slotDate?: string;
  slotTime?: string;
  timeRange?: string;
  meetingMode?: string;
}

interface FeedbackData {
  bookingId: number;
  consultantId: number;
  consultantName: string;
  slotDate: string;
  timeRange: string;
  existingFeedback?: { id: number; rating: number; comments: string } | null;
}

interface SelectedSlot {
  start24h: string;     // "14:00"
  label: string;        // "2:00 PM - 3:00 PM"
  masterId: number;     // real master timeslot DB id (0 if unknown)
  timeslotId?: number;  // real timeslot DB row id (if pre-existing)
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
  const startM   = sh * 60 + (isNaN(sm) ? 0 : sm);
  const endM     = eh * 60 + (isNaN(em) ? 0 : em);
  const slots: string[] = [];
  for (let m = startM; m + 60 <= endM; m += 60)
    slots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return slots;
};

/** Convert any time to "HH:MM" 24hr for comparison */
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

// ─────────────────────────────────────────────────────────────────────────────
// DATE CAROUSEL — 7 days grid + 30-day carousel
// ─────────────────────────────────────────────────────────────────────────────
const DAY_NAMES   = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

interface DayItem { iso: string; day: string; date: string; month: string }

const buildDays = (n: number): DayItem[] => {
  const out: DayItem[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    out.push({
      iso:   d.toISOString().split("T")[0],
      day:   DAY_NAMES[d.getDay()],
      date:  String(d.getDate()).padStart(2, "0"),
      month: MONTH_NAMES[d.getMonth()],
    });
  }
  return out;
};

const ALL_DAYS     = buildDays(30);
const VISIBLE_DAYS = 7;

// ─────────────────────────────────────────────────────────────────────────────
// PHOTO HELPER
// ─────────────────────────────────────────────────────────────────────────────
const resolvePhotoUrl = (path?: string | null): string => {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("blob:")) return path;
  return path.startsWith("/") ? path : `/${path}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// MASTER TIMESLOTS FETCH
// ─────────────────────────────────────────────────────────────────────────────
const fetchMasterTimeslots = async (): Promise<MasterSlot[]> => {
  try {
    const data = await apiFetch(`${BASE_URL}/master-timeslots`);
    const arr  = Array.isArray(data) ? data : data?.content || [];
    console.log("⏰ Master timeslots:", arr);
    return arr;
  } catch (e) {
    console.error("Master timeslots fetch failed:", e);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// JITSI — deterministic shared room name
// Both USER and CONSULTANT land in the SAME room for the same booking.
// Room = "finadvise-booking-{bookingId}" — never changes, always joinable.
// ─────────────────────────────────────────────────────────────────────────────
const JITSI_URL = (bookingId: number) =>
  `https://meet.jit.si/finadvise-booking-${bookingId}`;

// After closing Jitsi, we auto-open the feedback modal.
// We store the bookingId here so the visibilitychange listener can pick it up.
const PENDING_FEEDBACK_KEY = "finadvise_pending_feedback_bookingId";

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function UserPage() {
  const navigate = useNavigate();

  const [tab, setTab]       = useState<"consultants"|"bookings"|"queries"|"settings">("consultants");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All Consultants");
  const [toast, setToast]   = useState("");

  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [bookings, setBookings]       = useState<Booking[]>([]);
  const [loading, setLoading]         = useState({
    consultants: true,
    bookings: false,
    slots: false,
    queries: false,
  });

  // ── Booking modal state ──
  const [showModal, setShowModal]               = useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [masterSlots, setMasterSlots]           = useState<MasterSlot[]>([]);
  const [dbTimeslots, setDbTimeslots]           = useState<TimeSlotRecord[]>([]);
  const [bookedSlotSet, setBookedSlotSet]       = useState<Set<string>>(new Set());
  const [dayOffset, setDayOffset]               = useState(0);
  const [selectedDay, setSelectedDay]           = useState<DayItem>(ALL_DAYS[0]);
  const [selectedSlot, setSelectedSlot]         = useState<SelectedSlot | null>(null);
  const [meetingMode, setMeetingMode]           = useState<"ONLINE"|"OFFLINE">("ONLINE");
  const [userNotes, setUserNotes]               = useState("");
  const [confirming, setConfirming]             = useState(false);

  // ── Profile modal state ──
  const [profileConsultant, setProfileConsultant] = useState<Consultant | null>(null);

  // ── Queries state ──
  const [queries, setQueries]                   = useState<any[]>([]);
  const [newQueryText, setNewQueryText]         = useState("");
  const [queryCategory, setQueryCategory]       = useState("General");
  const [isSubmittingQuery, setIsSubmittingQuery] = useState(false);

  // ── Feedback state ──
  const [feedbackModal, setFeedbackModal]       = useState<FeedbackData | null>(null);
  const [feedbackRating, setFeedbackRating]     = useState(0);
  const [feedbackHover, setFeedbackHover]       = useState(0);
  const [feedbackComment, setFeedbackComment]   = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [submittedFeedbacks, setSubmittedFeedbacks] = useState<Set<number>>(new Set());

  const categories   = ["All Consultants","Tax Experts","Investment","Wealth","Retirement"];
  const visibleDays  = ALL_DAYS.slice(dayOffset, dayOffset + VISIBLE_DAYS);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };

  const spinnerStyle: React.CSSProperties = {
    width: 28, height: 28, border: "3px solid #DBEAFE",
    borderTopColor: "#2563EB", borderRadius: "50%",
    animation: "spin 0.7s linear infinite", margin: "0 auto 12px",
  };

  // ─────────────────────────────────────────────────────────────────────────
  // MAP CONSULTANT
  // ─────────────────────────────────────────────────────────────────────────
  const mapConsultant = (d: any): Consultant => {
    let avatar = resolvePhotoUrl(d.profilePhoto || d.photo || d.avatarUrl || "");
    if (!avatar)
      avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name || "C")}&background=2563EB&color=fff&bold=true`;
    return {
      id:             d.id,
      name:           d.name || "Expert Consultant",
      role:           d.designation || "Financial Consultant",
      fee:            Number(d.charges || 0),
      tags:           Array.isArray(d.skills) ? d.skills : [],
      rating:         Number(d.rating || 4.8),
      exp:            Number(d.experience || d.yearsOfExperience || 5),
      reviews:        Number(d.reviewCount || d.totalReviews || 120),
      avatar,
      shiftStartTime: d.shiftStartTime || "",
      shiftEndTime:   d.shiftEndTime   || "",
      shiftTimings:   d.shiftTimings   || "",
      location:       d.location || d.city || "Hyderabad",
      about:          d.about || d.bio || d.description || "",
      languages:      d.languages || "",
      phone:          d.phone || "",
    };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FETCH CONSULTANTS
  // ─────────────────────────────────────────────────────────────────────────
  const fetchConsultants = async () => {
    setLoading(p => ({ ...p, consultants: true }));
    try {
      const res = await getAllConsultants();
      setConsultants((Array.isArray(res) ? res : []).map(mapConsultant));
    } catch { showToast("Could not load consultants."); }
    finally { setLoading(p => ({ ...p, consultants: false })); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FETCH BOOKINGS — enriches time range via master map
  // ─────────────────────────────────────────────────────────────────────────
  const fetchBookings = async () => {
    setLoading(p => ({ ...p, bookings: true }));
    try {
      const [raw, masters] = await Promise.all([getMyBookings(), fetchMasterTimeslots()]);
      if (!Array.isArray(raw)) { setBookings([]); return; }

      // 🔍 Log FULL first booking so we can see every field name
      if (raw.length > 0) {
        console.log("📋 Full booking[0] keys:", Object.keys(raw[0]));
        console.log("📋 Full booking[0]:", JSON.stringify(raw[0], null, 2));
      }

      // Build master id → timeRange lookup
      const masterMap: Record<string, string> = {};
      masters.forEach(ms => { masterMap[String(ms.id)] = ms.timeRange; });
      console.log("🗂 masterMap:", masterMap);

      const mapped = raw.map((b: any) => {
        const date =
          b.bookingDate     ||
          b.slotDate        ||
          b.date            ||
          b.booking_date    ||
          b.sessionDate     ||
          b.appointmentDate ||
          "";

        // Resolve time range via master lookup first
        const masterIdCandidates = [
          b.masterTimeslotId,
          b.masterSlotId,
          b.master_timeslot_id,
          b.timeSlotId,
          b.timeslot_id,
          b.slotId,
          b.slot_id,
        ].filter(v => v !== undefined && v !== null);

        let timeRange = "";
        for (const candidate of masterIdCandidates) {
          if (masterMap[String(candidate)]) { timeRange = masterMap[String(candidate)]; break; }
        }

        if (!timeRange)
          timeRange =
            b.timeRange                               ||
            b.timeSlot?.masterTimeSlot?.timeRange     ||
            b.masterTimeSlot?.timeRange               ||
            b.time_range                              ||
            b.slotTimeRange                           ||
            (b.slotTime  ? toAmPm(b.slotTime)  : "") ||
            (b.startTime ? toAmPm(b.startTime) : "") ||
            "";

        const consultantName =
          b.consultantName   ||
          b.consultant?.name ||
          b.advisorName      ||
          b.advisor?.name    ||
          "";

        console.log(`📌 Booking #${b.id}: date=${date}, masterIds=${masterIdCandidates}, timeRange=${timeRange}`);

        return {
          ...b,
          consultantName: consultantName || "Loading…",
          slotDate:       date,
          timeRange,
          slotTime:       b.slotTime || "",
          meetingMode:    b.meetingMode || b.meeting_mode || b.mode || "",
          BookingStatus:  (b.BookingStatus || b.status || b.bookingStatus || "PENDING").toUpperCase(),
        };
      });

      mapped.sort((a: any, b: any) => (b.slotDate || "").localeCompare(a.slotDate || ""));
      setBookings(mapped);

      // Background-enrich consultant names if missing
      const needsName = mapped.filter((b: any) => b.consultantName === "Loading…" && b.consultantId);
      if (needsName.length > 0) {
        const ids = [...new Set(needsName.map((b: any) => b.consultantId))] as number[];
        const cMap: Record<number, any> = {};
        await Promise.all(ids.map(id =>
          getConsultantById(id).then(d => { cMap[id] = d; }).catch(() => {})
        ));
        setBookings(prev => prev.map(b => ({
          ...b, consultantName: cMap[(b as any).consultantId]?.name || b.consultantName,
        })));
      }
    } catch (e) {
      console.error("fetchBookings error:", e);
      setBookings([]);
    } finally {
      setLoading(p => ({ ...p, bookings: false }));
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FETCH QUERIES
  // ─────────────────────────────────────────────────────────────────────────
  const fetchQueries = async () => {
    setLoading(p => ({ ...p, queries: true }));
    try {
      const user = await getCurrentUser();
      if (!user?.id) { showToast("Unable to identify user."); return; }
      const data = await getMyQueries(user.id);
      setQueries(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load queries.");
    } finally {
      setLoading(p => ({ ...p, queries: false }));
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // POST QUERY
  // ─────────────────────────────────────────────────────────────────────────
  const handlePostQuery = async () => {
    if (!newQueryText.trim()) return;
    setIsSubmittingQuery(true);
    try {
      const user = await getCurrentUser();
      if (!user?.id) { showToast("Unable to identify user."); return; }
      await submitQuery({
        userId:      user.id,
        consultantId: 1,          // 🔁 Replace with dynamic advisor if needed
        category:    queryCategory,
        queryText:   newQueryText,
        status:      "PENDING",
      });
      setNewQueryText("");
      showToast("Query submitted successfully!");
      fetchQueries();
    } catch {
      showToast("Failed to submit query.");
    } finally {
      setIsSubmittingQuery(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FEEDBACK HANDLERS
  // ─────────────────────────────────────────────────────────────────────────
  const handleOpenFeedback = async (b: any) => {
    let existingFeedback = null;
    try {
      existingFeedback = await apiFetch(`${BASE_URL}/feedbacks/booking/${b.id}`);
    } catch { /* no prior feedback */ }

    setFeedbackModal({
      bookingId:        b.id,
      consultantId:     b.consultantId,
      consultantName:   b.consultantName || "Consultant",
      slotDate:         b.slotDate || b.bookingDate || "",
      timeRange:        b.timeRange || (b.slotTime ? toAmPm(b.slotTime) : ""),
      existingFeedback: existingFeedback || null,
    });
    setFeedbackRating(existingFeedback?.rating || 0);
    setFeedbackComment(existingFeedback?.comments || "");
    setFeedbackHover(0);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackModal || feedbackRating === 0) {
      showToast("⚠️ Please select a star rating before submitting.");
      return;
    }
    setSubmittingFeedback(true);
    try {
      const user = await getCurrentUser();
      if (!user?.id) { showToast("Unable to identify user."); return; }

      const payload = {
        userId:       user.id,
        consultantId: feedbackModal.consultantId,
        meetingId:    feedbackModal.bookingId, // use bookingId as meetingId fallback
        bookingId:    feedbackModal.bookingId,
        rating:       feedbackRating,
        comments:     feedbackComment.trim() || "",
      };

      if (feedbackModal.existingFeedback?.id) {
        await apiFetch(`${BASE_URL}/feedbacks/${feedbackModal.existingFeedback.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        showToast("✅ Feedback updated successfully!");
      } else {
        await apiFetch(`${BASE_URL}/feedbacks`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showToast("✅ Thank you for your feedback!");
      }

      setSubmittedFeedbacks(prev => new Set([...prev, feedbackModal.bookingId]));
      setFeedbackModal(null);
      setFeedbackRating(0);
      setFeedbackComment("");
    } catch (err: any) {
      showToast(`❌ Failed to submit feedback: ${err.message}`);
    } finally {
      setSubmittingFeedback(false);
    }
  };

  useEffect(() => { fetchConsultants(); }, []);
  useEffect(() => { if (tab === "bookings") fetchBookings(); }, [tab]);
  useEffect(() => { if (tab === "queries")  fetchQueries();  }, [tab]);

  // ── Auto-open feedback when user returns from Jitsi tab ──────────────────
  // When "Join Jitsi" is clicked, we write the bookingId to localStorage.
  // When the user switches back to this tab (visibilitychange → "visible"),
  // we read that key and immediately open the feedback modal for that booking.
  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState !== "visible") return;
      const raw = localStorage.getItem(PENDING_FEEDBACK_KEY);
      if (!raw) return;
      localStorage.removeItem(PENDING_FEEDBACK_KEY);
      const bookingId = Number(raw);
      if (!bookingId) return;

      // Make sure we are on the bookings tab
      setTab("bookings");

      // Try to find the booking in the already-loaded list first
      const findAndOpen = (list: Booking[]) => {
        const found = (list as any[]).find((b: any) => b.id === bookingId);
        if (found) {
          setTimeout(() => handleOpenFeedback(found), 300);
          return true;
        }
        return false;
      };

      if (!findAndOpen(bookings)) {
        // Not loaded yet — fetch then try again
        setLoading(p => ({ ...p, bookings: true }));
        try {
          const [raw2, masters] = await Promise.all([getMyBookings(), fetchMasterTimeslots()]);
          if (!Array.isArray(raw2)) return;
          const masterMap: Record<string, string> = {};
          masters.forEach((ms: any) => { masterMap[String(ms.id)] = ms.timeRange; });
          const mapped = raw2.map((b: any) => ({
            ...b,
            BookingStatus: (b.BookingStatus || b.status || b.bookingStatus || "PENDING").toUpperCase(),
            slotDate: b.bookingDate || b.slotDate || b.date || "",
            timeRange: b.timeRange || b.timeSlot?.masterTimeSlot?.timeRange || (b.slotTime ? toAmPm(b.slotTime) : ""),
          }));
          setBookings(mapped as Booking[]);
          findAndOpen(mapped as Booking[]);
        } finally {
          setLoading(p => ({ ...p, bookings: false }));
        }
      }
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  // ─────────────────────────────────────────────────────────────────────────
  // OPEN BOOKING MODAL — fetch masters + bookings + DB timeslots
  // ─────────────────────────────────────────────────────────────────────────
  const handleOpenModal = async (c: Consultant) => {
    setSelectedConsultant(c);
    setMasterSlots([]);
    setDbTimeslots([]);
    setBookedSlotSet(new Set());
    setDayOffset(0);
    setSelectedDay(ALL_DAYS[0]);
    setSelectedSlot(null);
    setMeetingMode("ONLINE");
    setUserNotes("");
    setShowModal(true);
    setLoading(p => ({ ...p, slots: true }));

    try {
      const [masters, bookingsRaw] = await Promise.all([
        fetchMasterTimeslots(),
        apiFetch(`${BASE_URL}/bookings/consultant/${c.id}`).catch(() => []),
      ]);
      setMasterSlots(Array.isArray(masters) ? masters : []);

      // Load DB timeslot rows
      let tsRecords: TimeSlotRecord[] = [];
      try {
        const tsData = await apiFetch(`${BASE_URL}/timeslots/consultant/${c.id}`);
        tsRecords = Array.isArray(tsData) ? tsData : (tsData?.content || []);
        setDbTimeslots(tsRecords);
      } catch { /* non-fatal */ }

      // Build booked key set: "YYYY-MM-DD|HH:MM"
      const bSet = new Set<string>();
      const bArr = Array.isArray(bookingsRaw) ? bookingsRaw : (bookingsRaw?.content || []);

      // Mark slots that have ACTIVE bookings (not cancelled)
      bArr.forEach((b: any) => {
        const st = (b.status || b.BookingStatus || b.bookingStatus || "").toUpperCase();
        if (st === "CANCELLED") return;
        const date = b.slotDate || b.bookingDate || b.date || "";
        let timeKey = "";
        if (b.slotTime) {
          timeKey = b.slotTime.substring(0, 5);
        } else {
          const tr = b.timeSlot?.masterTimeSlot?.timeRange
                  || b.masterTimeSlot?.timeRange || b.timeRange || "";
          timeKey = normalise24(tr);
        }
        if (date && timeKey) bSet.add(`${date}|${timeKey}`);
      });

      // Also mark ANY DB timeslot that is NOT "AVAILABLE" — this covers:
      //   - slots marked BOOKED/UNAVAILABLE by the consultant
      //   - slots already booked by another user and marked BOOKED by backend
      tsRecords.forEach(s => {
        const st = (s.status || "").toUpperCase();
        if (st === "AVAILABLE") return; // still available — skip
        // slotTime can be "HH:mm:ss" — take first 5 chars
        const rawTime = (s.slotTime || "").substring(0, 5);
        const k = rawTime || normalise24((s as any).timeRange || "");
        if (s.slotDate && k) bSet.add(`${s.slotDate}|${k}`);
      });

      console.log("🚫 Booked slot keys:", [...bSet]);
      setBookedSlotSet(bSet);
    } catch (e) {
      console.error("Modal data load failed:", e);
    } finally {
      setLoading(p => ({ ...p, slots: false }));
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // CONFIRM BOOKING — bulletproof 3-step flow
  // 1) Find existing timeslot row  2) Bulk-create if needed  3) Book with real ID
  // ─────────────────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!selectedSlot || !selectedConsultant) return;
    setConfirming(true);
    try {
      const slot24       = selectedSlot.start24h;
      const slotTimeFull = slot24.length === 5 ? `${slot24}:00` : slot24;

      // Helper: fetch consultant timeslots and return matching row ID
      const fetchTimeslotId = async (): Promise<number | null> => {
        try {
          const data = await apiFetch(`${BASE_URL}/timeslots/consultant/${selectedConsultant.id}`);
          const arr: TimeSlotRecord[] = Array.isArray(data) ? data : (data?.content || []);
          const match = arr.find(
            s => s.slotDate === selectedDay.iso && (s.slotTime || "").substring(0, 5) === slot24
          );
          return match?.id || null;
        } catch { return null; }
      };

      // ── Step 1: pre-loaded or fresh fetch ──
      let realTimeslotId: number | null = selectedSlot.timeslotId || null;
      if (!realTimeslotId) realTimeslotId = await fetchTimeslotId();

      // ── Step 2: create timeslot if still not found ──
      if (!realTimeslotId) {
        console.log("🆕 Creating timeslot for:", selectedDay.iso, slot24, "masterId:", selectedSlot.masterId);
        const token = getToken();

        // Strategy A: Try single timeslot creation first (most reliable)
        try {
          const singlePayload: any = {
            consultantId:    selectedConsultant.id,
            slotDate:        selectedDay.iso,
            slotTime:        slotTimeFull,
            durationMinutes: 60,
            status:          "AVAILABLE",
          };
          if (selectedSlot.masterId > 0) singlePayload.masterTimeSlotId = selectedSlot.masterId;

          const singleRes = await fetch(`${BASE_URL}/timeslots`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(singlePayload),
          });
          if (singleRes.ok) {
            const ct = singleRes.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const created = await singleRes.json();
              if (created?.id) realTimeslotId = created.id;
            }
          }
        } catch { /* try bulk next */ }

        // Strategy B: Try bulk if single failed and we have masterId
        if (!realTimeslotId && selectedSlot.masterId > 0) {
          try {
            const rawRes = await fetch(`${BASE_URL}/timeslots/bulk`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                timeSlots: [{
                  consultantId:     selectedConsultant.id,
                  slotDate:         selectedDay.iso,
                  slotTime:         slotTimeFull,
                  durationMinutes:  60,
                  masterTimeSlotId: selectedSlot.masterId,
                  status:           "AVAILABLE",
                }],
              }),
            });
            const ct = rawRes.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
              const bulkData = await rawRes.json();
              const items: any[] =
                Array.isArray(bulkData)              ? bulkData
                : Array.isArray(bulkData?.created)   ? bulkData.created
                : Array.isArray(bulkData?.timeSlots) ? bulkData.timeSlots
                : bulkData?.id                       ? [bulkData]
                : [];
              const found = items.find(
                s => s.slotDate === selectedDay.iso && (s.slotTime || "").substring(0, 5) === slot24
              ) || items[0];
              if (found?.id) realTimeslotId = found.id;
            }
          } catch { /* bulk failed; re-fetch anyway below */ }
        }

        // Always re-fetch — row may exist even if 500 returned
        if (!realTimeslotId) realTimeslotId = await fetchTimeslotId();
      }

      // ── Step 3: require a real ID before booking ──
      if (!realTimeslotId) {
        showToast("❌ Could not resolve time slot. Please try again or contact support.");
        return;
      }

      // ── Step 4: create booking ──
      const payload: any = {
        consultantId:    selectedConsultant.id,
        timeSlotId:      realTimeslotId,
        amount:          selectedConsultant.fee,
        userNotes:       userNotes || "Booked via app",
        meetingMode:     meetingMode,
        bookingDate:     selectedDay.iso,
        slotDate:        selectedDay.iso,
        slotTime:        slotTimeFull,
        timeRange:       selectedSlot.label,
        masterTimeslotId: selectedSlot.masterId > 0 ? selectedSlot.masterId : undefined,
      };

      console.log("📤 Final booking payload:", payload);
      await createBooking(payload);

      // ── Step 5: optimistic UI update ──
      // Mark the slot as booked immediately so user can't re-book it
      setBookedSlotSet(prev => {
        const next = new Set(prev);
        next.add(`${selectedDay.iso}|${slot24}`);
        return next;
      });
      // Also update dbTimeslots to reflect this slot is now BOOKED
      setDbTimeslots(prev => {
        // Find if there's already a record for this slot
        const existing = prev.find(
          s => s.slotDate === selectedDay.iso && (s.slotTime || "").substring(0, 5) === slot24
        );
        if (existing) {
          return prev.map(s =>
            s.slotDate === selectedDay.iso && (s.slotTime || "").substring(0, 5) === slot24
              ? { ...s, status: "BOOKED" }
              : s
          );
        }
        // Add a new record with BOOKED status
        return [...prev, {
          id: realTimeslotId!,
          slotDate: selectedDay.iso,
          slotTime: slotTimeFull,
          status: "BOOKED",
          masterTimeSlotId: selectedSlot.masterId > 0 ? selectedSlot.masterId : undefined,
        }];
      });
      setShowModal(false);
      showToast(`✅ Booked for ${selectedDay.date} ${selectedDay.month} · ${selectedSlot.label}`);
      setTab("bookings");
      fetchBookings();

    } catch (err: any) {
      const msg = (err.message || "").toLowerCase();
      if (msg.includes("no longer available") || msg.includes("conflict") || msg.includes("409")) {
        showToast("⚠️ Slot just taken. Please pick another time.");
        if (selectedConsultant) handleOpenModal(selectedConsultant);
      } else {
        showToast(`❌ Booking failed: ${err.message}`);
      }
    } finally {
      setConfirming(false);
    }
  };

  const handleLogout = () => { logoutUser(); navigate("/login", { replace: true }); };

  const filteredList = consultants.filter(c => {
    const q = search.toLowerCase();
    return (
      (c.name.toLowerCase().includes(q) || c.role.toLowerCase().includes(q)) &&
      (category === "All Consultants" || c.role.includes(category.replace(" Experts", "")))
    );
  });

  // Derived: hourly slots from consultant shift
  const hourlySlotTimes = generateHourlySlots(
    (selectedConsultant?.shiftStartTime || "").substring(0, 5),
    (selectedConsultant?.shiftEndTime   || "").substring(0, 5)
  );
  const hasShift = !!(
    selectedConsultant?.shiftStartTime &&
    selectedConsultant?.shiftEndTime   &&
    hourlySlotTimes.length > 0
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.logoSection}>
          <div className={styles.logoText}>FINADVISE</div>
          <div className={styles.logoSub}>CONSULTANT BOOKING</div>
        </div>
        <button onClick={handleLogout} className={styles.backBtn}>Logout</button>
      </header>

      {toast && <div className={styles.toast}>{toast}</div>}

      <main className={styles.content}>

        {/* ════════════════════════════════════════
            CONSULTANTS TAB
            ════════════════════════════════════════ */}
        {tab === "consultants" && (
          <div className={styles.tabPadding}>

            {/* Search bar */}
            <div className={styles.searchWrapper}>
              <svg className={styles.searchIcon} width="16" height="16"
                viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="M21 21l-4.35-4.35" strokeLinecap="round"/>
              </svg>
              <input className={styles.searchInput}
                placeholder="Search by name, specialisation..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>

            {/* Category filter pills */}
            <div className={styles.categoryRow}>
              {categories.map(c => (
                <button key={c} onClick={() => setCategory(c)}
                  className={`${styles.categoryBtn} ${category === c ? styles.categoryBtnActive : ""}`}>
                  {c}
                </button>
              ))}
            </div>

            {loading.consultants ? (
              <div className={styles.emptyState}>
                <div className={styles.spinner}/>
                <p style={{ color:"#94A3B8", marginTop:12, fontSize:14 }}>Loading consultants…</p>
              </div>
            ) : filteredList.length === 0 ? (
              <div className={styles.emptyState}>
                <div style={{ fontSize:36, marginBottom:12 }}>🔍</div>
                <p style={{ margin:0, fontWeight:600 }}>No consultants found.</p>
              </div>
            ) : (
              <div className={styles.consultantList}>
                {filteredList.map(c => (
                  <div key={c.id} className={styles.consultantCard}>

                    {/* Avatar */}
                    <div style={{
                      width:72, height:72, borderRadius:"50%", flexShrink:0,
                      background:"linear-gradient(135deg,#1E3A5F,#2563EB)",
                      border:"3px solid #DBEAFE", overflow:"hidden",
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:26, fontWeight:700, color:"#fff",
                      alignSelf:"flex-start",
                    }}>
                      {c.avatar
                        ? <img src={c.avatar} alt={c.name}
                            style={{ width:"100%", height:"100%", objectFit:"cover" }}
                            onError={e => { (e.target as HTMLImageElement).style.display="none"; }}/>
                        : c.name.substring(0, 2).toUpperCase()
                      }
                    </div>

                    {/* Info section — takes remaining space */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:16, fontWeight:700, color:"#0F172A", marginBottom:2 }}>{c.name}</div>
                      <div style={{ fontSize:13, color:"#2563EB", fontWeight:600, marginBottom:6 }}>{c.role}</div>

                      {/* Skill tags */}
                      {c.tags.length > 0 && (
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:6 }}>
                          {c.tags.slice(0, 3).map((t, i) => (
                            <span key={i} style={{
                              fontSize:11, padding:"2px 8px", borderRadius:20,
                              background:"#EFF6FF", color:"#2563EB", fontWeight:600,
                            }}>{t}</span>
                          ))}
                        </div>
                      )}

                      {/* Meta row */}
                      <div style={{ display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
                        {c.exp > 0 && <span style={{ fontSize:12, color:"#64748B" }}>⏱ {c.exp}+ yrs</span>}
                        <span style={{ fontSize:12, color:"#64748B" }}>
                          ⭐ {c.rating.toFixed(1)}{c.reviews > 0 ? ` (${c.reviews})` : ""}
                        </span>
                        <span style={{ fontSize:12, color:"#64748B" }}>📍 {c.location}</span>
                        {c.languages && <span style={{ fontSize:12, color:"#64748B" }}>🌐 {c.languages}</span>}
                      </div>

                      {/* About snippet */}
                      {c.about && (
                        <p style={{
                          margin:"6px 0 0", fontSize:12, color:"#64748B", lineHeight:1.5,
                          display:"-webkit-box", WebkitLineClamp:2,
                          WebkitBoxOrient:"vertical", overflow:"hidden",
                        }}>
                          {c.about}
                        </p>
                      )}
                    </div>

                    {/* Right: price + buttons */}
                    <div className={styles.cardRight}>
                      <div style={{ fontSize:18, fontWeight:800, color:"#0F172A", whiteSpace:"nowrap" }}>
                        ₹{c.fee.toLocaleString()}
                        <span style={{ fontSize:11, fontWeight:500, color:"#94A3B8", marginLeft:3 }}>/session</span>
                      </div>
                      <button className={styles.viewProfileBtn}
                        onClick={() => setProfileConsultant(c)}>
                        View Profile
                      </button>
                      <button className={styles.bookBtn}
                        onClick={() => handleOpenModal(c)}>
                        Book Now
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            BOOKINGS TAB
            ════════════════════════════════════════ */}
        {tab === "bookings" && (
          <div className={styles.tabPadding}>
            <div className={styles.titleSection}>
              <h2 className={styles.sectionTitle}>My Bookings</h2>
              <button className={styles.historyButton}
                onClick={fetchBookings} disabled={loading.bookings}
                style={{ display:"flex", alignItems:"center", gap:6 }}>
                {loading.bookings ? "⏳" : "↻"} Refresh
              </button>
            </div>

            {loading.bookings ? (
              <div style={{ textAlign:"center", padding:40 }}><div style={spinnerStyle}/></div>
            ) : bookings.length === 0 ? (
              <div className={styles.emptyState}>
                <div style={{ fontSize:36, marginBottom:12 }}>📅</div>
                <p style={{ margin:0, fontWeight:600, color:"#64748B" }}>No bookings yet.</p>
                <p style={{ margin:"6px 0 0", fontSize:13, color:"#94A3B8" }}>Book from the Consultants tab.</p>
              </div>
            ) : (
              <div className={styles.bookingsList}>
                {bookings.map(b => {
                  const bAny        = b as any;
                  const displayDate = bAny.slotDate || bAny.bookingDate || "—";
                  const displayTime = bAny.timeRange || (bAny.slotTime ? toAmPm(bAny.slotTime) : "");
                  const displayMode = bAny.meetingMode || "";
                  const status      = (b.BookingStatus || "").toUpperCase();
                  const isCompleted = status === "COMPLETED";
                  const isCancelled = status === "CANCELLED";
                  const hasFeedback = submittedFeedbacks.has(b.id);
                  const jitsiUrl    = JITSI_URL(b.id);

                  return (
                    <div key={b.id} className={styles.bookingCard}>
                      <div className={styles.cardHeader}>
                        <div className={styles.calendarIcon}>
                          <svg width="24" height="24" viewBox="0 0 24 24"
                            fill="none" stroke="#2563EB" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2"/>
                            <path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round"/>
                          </svg>
                        </div>
                        <div className={styles.cardInfo}>
                          <div className={styles.sessionTitle}>Session with {b.consultantName}</div>
                          <div className={styles.sessionDateTime}>
                            {displayDate}
                            {displayTime && <span className={styles.bookedTimePill}>{displayTime}</span>}
                            {displayMode && (
                              <span> · {displayMode === "ONLINE" ? "💻 Online" : "🏢 Offline"}</span>
                            )}
                          </div>
                          {/* Jitsi room info — visible so user can copy/share */}
                          <div style={{ marginTop:4, fontSize:11, color:"#94A3B8" }}>
                            🔗 Room: <span style={{ fontFamily:"monospace", color:"#2563EB" }}>
                              finadvise-booking-{b.id}
                            </span>
                          </div>
                        </div>
                        <div className={styles.statusBadgeWrapper}>
                          <StatusBadge status={b.BookingStatus as any}/>
                        </div>
                      </div>

                      <div className={styles.cardActions}>
                        {/* Join Jitsi — available for all non-cancelled bookings */}
                        {!isCancelled && (
                          <button
                            className={styles.joinButton}
                            onClick={() => {
                              // Store bookingId → visibilitychange listener opens feedback on return
                              localStorage.setItem(PENDING_FEEDBACK_KEY, String(b.id));
                              window.open(jitsiUrl, "_blank");
                            }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}>
                              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14"/>
                              <rect x="3" y="6" width="12" height="12" rx="2"/>
                            </svg>
                            Join Meeting
                          </button>
                        )}

                        {/* Feedback — shown for COMPLETED bookings (also manually accessible) */}
                        {isCompleted && (
                          <button
                            onClick={() => handleOpenFeedback(bAny)}
                            style={{
                              padding: "10px 16px",
                              borderRadius: 8,
                              border: hasFeedback ? "1.5px solid #86EFAC" : "1.5px solid #FCD34D",
                              background: hasFeedback ? "#F0FDF4" : "#FFFBEB",
                              color: hasFeedback ? "#16A34A" : "#D97706",
                              fontWeight: 600, fontSize: 13, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: 5,
                              fontFamily: "inherit",
                            }}>
                            {hasFeedback ? "⭐ Edit Feedback" : "⭐ Leave Feedback"}
                          </button>
                        )}

                        <button className={styles.rescheduleButton}>Reschedule</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            QUERIES TAB
            ════════════════════════════════════════ */}
        {tab === "queries" && (
          <div className={styles.tabPadding}>
            <h2 className={styles.sectionTitle}>My Queries</h2>

            {/* ── Submit New Query Form ── */}
            <div style={{
              background:"#F8FAFC", padding:20, borderRadius:16,
              marginBottom:24, border:"1px solid #E2E8F0",
            }}>
              <p style={{ fontSize:13, fontWeight:700, color:"#475569", marginBottom:12 }}>
                Post a New Question
              </p>
              <select
                value={queryCategory}
                onChange={e => setQueryCategory(e.target.value)}
                style={{
                  width:"100%", padding:"10px", borderRadius:8,
                  border:"1px solid #CBD5E1", marginBottom:10,
                }}
              >
                <option>General</option>
                <option>Tax Planning</option>
                <option>Investment</option>
                <option>Retirement</option>
              </select>
              <textarea
                placeholder="Describe your financial concern..."
                value={newQueryText}
                onChange={e => setNewQueryText(e.target.value)}
                style={{
                  width:"100%", height:80, padding:12, borderRadius:8,
                  border:"1px solid #CBD5E1", marginBottom:12,
                  resize:"none", boxSizing:"border-box",
                }}
              />
              <button
                onClick={handlePostQuery}
                disabled={isSubmittingQuery || !newQueryText}
                style={{
                  background:"#2563EB", color:"#fff", border:"none",
                  padding:"10px 20px", borderRadius:8,
                  fontWeight:600, cursor:"pointer",
                }}
              >
                {isSubmittingQuery ? "Posting..." : "Post Query"}
              </button>
            </div>

            {/* ── Query List ── */}
            {loading.queries ? (
              <div style={{ textAlign:"center", padding:40 }}><div style={spinnerStyle}/></div>
            ) : queries.length > 0 ? (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {queries.map(q => (
                  <div key={q.id} style={{
                    background:"#fff", border:"1px solid #E2E8F0",
                    borderRadius:12, padding:16,
                  }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                      <span style={{
                        fontSize:12, fontWeight:700, color:"#2563EB",
                        background:"#EFF6FF", padding:"2px 8px", borderRadius:4,
                      }}>
                        {q.category}
                      </span>
                      <StatusBadge status={q.status}/>
                    </div>
                    <p style={{ fontSize:14, color:"#1E293B", margin:"0 0 8px" }}>{q.queryText}</p>
                    <div style={{ fontSize:11, color:"#94A3B8" }}>
                      Posted on: {new Date(q.createdAt || Date.now()).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>No active queries found.</div>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === "settings" && (
          <div className={styles.tabPadding}>
            <h2 className={styles.sectionTitle}>Settings</h2>
            <div className={styles.settingsCard}>
              <div className={styles.settingsItem}><span>Account Profile</span><span>›</span></div>
              <div className={styles.settingsItem}><span>Notifications</span><span>›</span></div>
              <div className={styles.settingsItem}><span>Privacy &amp; Security</span><span>›</span></div>
              <div className={styles.settingsItem}
                onClick={handleLogout}
                style={{ color:"#DC2626", cursor:"pointer" }}>
                <span>Log Out</span>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ══════════════════════════════════════════════════════
          PROFILE MODAL
          ══════════════════════════════════════════════════════ */}
      {profileConsultant && (
        <div
          style={{
            position:"fixed", inset:0, background:"rgba(15,23,42,0.65)",
            zIndex:1100, display:"flex", alignItems:"center", justifyContent:"center",
            padding:16, backdropFilter:"blur(4px)",
          }}
          onClick={() => setProfileConsultant(null)}
        >
          <div
            style={{
              background:"#fff", borderRadius:20, width:"100%", maxWidth:560,
              maxHeight:"90vh", overflowY:"auto",
              boxShadow:"0 32px 80px rgba(15,23,42,0.3)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              background:"linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)",
              padding:"28px 24px 24px", position:"relative", borderRadius:"20px 20px 0 0",
            }}>
              <button onClick={() => setProfileConsultant(null)} style={{
                position:"absolute", top:14, right:14,
                background:"rgba(255,255,255,0.2)", border:"none", color:"#fff",
                width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:18,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>×</button>

              <div style={{ display:"flex", gap:18, alignItems:"center" }}>
                <div style={{
                  width:72, height:72, borderRadius:"50%", flexShrink:0,
                  border:"3px solid rgba(255,255,255,0.4)", overflow:"hidden",
                  background:"rgba(255,255,255,0.2)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:26, fontWeight:700, color:"#fff",
                }}>
                  {profileConsultant.avatar
                    ? <img src={profileConsultant.avatar} alt={profileConsultant.name}
                        style={{ width:"100%", height:"100%", objectFit:"cover" }}
                        onError={e => { (e.target as HTMLImageElement).style.display="none"; }}/>
                    : profileConsultant.name.substring(0, 2).toUpperCase()
                  }
                </div>
                <div>
                  <h2 style={{ fontSize:22, fontWeight:800, color:"#fff", margin:"0 0 4px" }}>
                    {profileConsultant.name}
                  </h2>
                  <p style={{ fontSize:14, color:"#BFDBFE", margin:"0 0 6px" }}>
                    {profileConsultant.role}
                  </p>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                    <span style={{ fontSize:13, color:"#93C5FD" }}>
                      ⭐ {profileConsultant.rating.toFixed(1)} ({profileConsultant.reviews} reviews)
                    </span>
                    <span style={{ fontSize:13, color:"#93C5FD" }}>
                      ⏱ {profileConsultant.exp}+ yrs exp
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding:"24px" }}>
              {/* Info grid */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
                {[
                  { icon:"📍", label:"Location",    value: profileConsultant.location },
                  { icon:"🌐", label:"Languages",   value: profileConsultant.languages || "English" },
                  { icon:"📞", label:"Contact",     value: profileConsultant.phone || "On request" },
                  { icon:"💰", label:"Session Fee", value: `₹${profileConsultant.fee.toLocaleString()}` },
                ].map(item => (
                  <div key={item.label} style={{
                    background:"#F8FAFC", borderRadius:12, padding:"12px 14px",
                    border:"1px solid #E2E8F0",
                  }}>
                    <div style={{
                      fontSize:11, color:"#94A3B8", fontWeight:600, marginBottom:4,
                      textTransform:"uppercase", letterSpacing:"0.05em",
                    }}>
                      {item.icon} {item.label}
                    </div>
                    <div style={{ fontSize:14, fontWeight:600, color:"#0F172A" }}>
                      {item.value || "—"}
                    </div>
                  </div>
                ))}
              </div>

              {/* About */}
              {profileConsultant.about && (
                <div style={{ marginBottom:20 }}>
                  <h3 style={{
                    fontSize:14, fontWeight:700, color:"#1E293B", marginBottom:8,
                    textTransform:"uppercase", letterSpacing:"0.05em",
                  }}>About</h3>
                  <p style={{ fontSize:14, color:"#475569", lineHeight:1.7, margin:0 }}>
                    {profileConsultant.about}
                  </p>
                </div>
              )}

              {/* Expertise tags */}
              {profileConsultant.tags.length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <h3 style={{
                    fontSize:14, fontWeight:700, color:"#1E293B", marginBottom:10,
                    textTransform:"uppercase", letterSpacing:"0.05em",
                  }}>Areas of Expertise</h3>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {profileConsultant.tags.map((tag, i) => (
                      <span key={i} style={{
                        background:"#EFF6FF", color:"#2563EB", padding:"6px 14px",
                        borderRadius:20, fontSize:13, fontWeight:600, border:"1px solid #BFDBFE",
                      }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Availability */}
              {(profileConsultant.shiftStartTime || profileConsultant.shiftEndTime) && (
                <div style={{ marginBottom:20 }}>
                  <h3 style={{
                    fontSize:14, fontWeight:700, color:"#1E293B", marginBottom:8,
                    textTransform:"uppercase", letterSpacing:"0.05em",
                  }}>Availability</h3>
                  <div style={{
                    background:"#F0FDF4", border:"1px solid #BBF7D0",
                    borderRadius:10, padding:"12px 16px", fontSize:14, color:"#166534", fontWeight:600,
                  }}>
                    🕐 {profileConsultant.shiftStartTime
                      ? `${profileConsultant.shiftStartTime.substring(0, 5)} – ${profileConsultant.shiftEndTime?.substring(0, 5) || ""}`
                      : "Contact for availability"}
                  </div>
                </div>
              )}

              {/* CTA */}
              <div style={{ display:"flex", gap:12, marginTop:8 }}>
                <button
                  onClick={() => { setProfileConsultant(null); handleOpenModal(profileConsultant); }}
                  style={{
                    flex:1, padding:"13px 0", borderRadius:12, border:"none",
                    background:"linear-gradient(135deg,#2563EB,#1D4ED8)",
                    color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer",
                    boxShadow:"0 4px 14px rgba(37,99,235,0.3)",
                  }}>
                  Book Appointment
                </button>
                <button
                  onClick={() => setProfileConsultant(null)}
                  style={{
                    padding:"13px 20px", borderRadius:12,
                    border:"1.5px solid #E2E8F0", background:"#fff",
                    color:"#64748B", fontSize:14, fontWeight:600, cursor:"pointer",
                  }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          BOOKING MODAL
          ══════════════════════════════════════════════════════ */}
      {showModal && selectedConsultant && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal}
            onClick={e => e.stopPropagation()}
            style={{ padding:0, overflow:"hidden" }}>

            {/* Gradient header */}
            <div style={{
              background:"linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)",
              padding:"20px 24px 18px", position:"relative", flexShrink:0,
            }}>
              <p style={{
                fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase",
                color:"#93C5FD", margin:"0 0 4px",
              }}>
                Schedule a Session
              </p>
              <h3 style={{ fontSize:20, fontWeight:700, color:"#fff", margin:0 }}>
                {selectedConsultant.name}
              </h3>
              <p style={{ fontSize:13, color:"#BFDBFE", margin:"4px 0 0" }}>
                {selectedConsultant.role}&nbsp;·&nbsp;₹{selectedConsultant.fee.toLocaleString()} / session
              </p>
              <button onClick={() => setShowModal(false)} style={{
                position:"absolute", top:14, right:14,
                background:"rgba(255,255,255,0.2)", border:"none", color:"#fff",
                width:30, height:30, borderRadius:"50%", cursor:"pointer", fontSize:18,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>×</button>
            </div>

            {/* Modal scrollable body */}
            <div style={{ padding:"20px 24px 24px", overflowY:"auto", maxHeight:"calc(92vh - 100px)" }}>
              {loading.slots ? (
                <div style={{ textAlign:"center", padding:"48px 0" }}>
                  <div style={spinnerStyle}/>
                  <p style={{ color:"#94A3B8", fontSize:13, margin:"12px 0 0" }}>
                    Loading available time slots…
                  </p>
                </div>
              ) : (
                <>
                  {/* ── Step 1: Date selector (carousel with arrows) ── */}
                  <p className={styles.stepLabel}>Step 1 — Select Date</p>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:24 }}>

                    {/* PREV */}
                    <button
                      disabled={dayOffset === 0}
                      onClick={() => setDayOffset(o => Math.max(0, o - 1))}
                      style={{
                        width:32, height:32, borderRadius:"50%", flexShrink:0,
                        border:`1.5px solid ${dayOffset === 0 ? "#F1F5F9" : "#BFDBFE"}`,
                        background:"#fff", cursor:dayOffset === 0 ? "default" : "pointer",
                        color:dayOffset === 0 ? "#CBD5E1" : "#2563EB",
                        fontSize:18, display:"flex", alignItems:"center", justifyContent:"center",
                      }}
                    >‹</button>

                    <div className={styles.dateGrid} style={{ flex:1 }}>
                      {visibleDays.map(d => {
                        const isSel   = selectedDay.iso === d.iso;
                        const isToday = d.iso === ALL_DAYS[0].iso;
                        return (
                          <button key={d.iso}
                            onClick={() => { setSelectedDay(d); setSelectedSlot(null); }}
                            className={`${styles.dateGridBtn} ${isSel ? styles.dateGridBtnActive : ""}`}>
                            <span className={styles.dateGridDay}>{d.day}</span>
                            <span className={styles.dateGridDate}>{d.date}</span>
                            <span className={`${styles.dateGridMonth} ${isToday && !isSel ? styles.todayLabel : ""}`}>
                              {isToday && !isSel ? "TODAY" : d.month}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* NEXT */}
                    <button
                      disabled={dayOffset >= ALL_DAYS.length - VISIBLE_DAYS}
                      onClick={() => setDayOffset(o => Math.min(ALL_DAYS.length - VISIBLE_DAYS, o + 1))}
                      style={{
                        width:32, height:32, borderRadius:"50%", flexShrink:0,
                        border:`1.5px solid ${dayOffset >= ALL_DAYS.length - VISIBLE_DAYS ? "#F1F5F9" : "#BFDBFE"}`,
                        background:"#fff",
                        cursor:dayOffset >= ALL_DAYS.length - VISIBLE_DAYS ? "default" : "pointer",
                        color:dayOffset >= ALL_DAYS.length - VISIBLE_DAYS ? "#CBD5E1" : "#2563EB",
                        fontSize:18, display:"flex", alignItems:"center", justifyContent:"center",
                      }}
                    >›</button>
                  </div>

                  {/* ── Step 2: Time selector ── */}
                  <p className={styles.stepLabel}>Step 2 — Select Time</p>

                  {hasShift ? (
                    // Consultant has shift hours → generate hourly slots
                    <div className={styles.timeGrid}>
                      {hourlySlotTimes.map(slotStart => {
                        const isBooked = bookedSlotSet.has(`${selectedDay.iso}|${slotStart}`);
                        const endH     = parseInt(slotStart.split(":")[0]) + 1;
                        const endStr   = `${String(endH).padStart(2, "0")}:${slotStart.split(":")[1]}`;
                        const label    = `${fmt24to12(slotStart)} - ${fmt24to12(endStr)}`;

                        const matchedMaster = masterSlots.find(ms =>
                          normalise24(ms.timeRange) === slotStart ||
                          ms.timeRange.replace(/\s/g, "").toLowerCase() === label.replace(/\s/g, "").toLowerCase()
                        );
                        const matchedTs = dbTimeslots.find(
                          ts => ts.slotDate === selectedDay.iso && (ts.slotTime || "").substring(0, 5) === slotStart
                        );
                        const isSel = !isBooked && selectedSlot?.start24h === slotStart;

                        return (
                          <button key={slotStart}
                            disabled={isBooked}
                            title={isBooked ? "This slot is already booked or unavailable" : "Available — click to select"}
                            onClick={() => !isBooked && setSelectedSlot(isSel ? null : {
                              start24h:   slotStart,
                              label,
                              masterId:   matchedMaster?.id ?? 0,
                              timeslotId: matchedTs?.id,
                            })}
                            className={`${styles.timeBtn} ${isSel ? styles.timeBtnActive : ""} ${isBooked ? styles.timeBtnBooked : ""}`}
                            style={isBooked ? {
                              textDecoration: "line-through",
                              opacity: 0.6,
                              cursor: "not-allowed",
                              pointerEvents: "none",
                            } : {}}>
                            {label}
                            {isBooked && <div className={styles.unavailableLabel}>BOOKED</div>}
                          </button>
                        );
                      })}
                    </div>
                  ) : masterSlots.length === 0 ? (
                    // No shift AND no master slots
                    <div className={styles.noSlotsWarning}>
                      <p style={{ fontWeight:600, margin:"0 0 4px" }}>No time slots available yet.</p>
                      <p style={{ fontSize:12, margin:0 }}>
                        The advisor hasn't configured their available time ranges.
                      </p>
                    </div>
                  ) : (
                    // No shift but master slots exist → show them
                    <div className={styles.timeGrid}>
                      {masterSlots.map(ms => {
                        const slotT24  = normalise24(ms.timeRange);
                        const isBooked = bookedSlotSet.has(`${selectedDay.iso}|${slotT24}`);
                        const isSel    = !isBooked && selectedSlot?.masterId === ms.id;
                        return (
                          <button key={ms.id}
                            disabled={isBooked}
                            title={isBooked ? "This slot is already booked or unavailable" : "Available — click to select"}
                            onClick={() => !isBooked && setSelectedSlot(isSel ? null : {
                              start24h: slotT24,
                              label:    ms.timeRange,
                              masterId: ms.id,
                            })}
                            className={`${styles.timeBtn} ${isSel ? styles.timeBtnActive : ""} ${isBooked ? styles.timeBtnBooked : ""}`}
                            style={isBooked ? {
                              textDecoration: "line-through",
                              opacity: 0.6,
                              cursor: "not-allowed",
                              pointerEvents: "none",
                            } : {}}>
                            {ms.timeRange}
                            {isBooked && <div className={styles.unavailableLabel}>BOOKED</div>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Meeting mode ── */}
                  <p className={styles.stepLabel}>Meeting Mode</p>
                  <div className={styles.meetingModeRow}>
                    {(["ONLINE","OFFLINE"] as const).map(mode => (
                      <button key={mode} onClick={() => setMeetingMode(mode)}
                        className={`${styles.meetingBtn} ${meetingMode === mode ? styles.meetingBtnActive : ""}`}>
                        {mode === "ONLINE" ? "💻" : "🏢"} {mode}
                      </button>
                    ))}
                  </div>

                  {/* ── Notes ── */}
                  <p className={styles.stepLabel}>Notes (optional)</p>
                  <textarea className={styles.notesTextarea}
                    value={userNotes} onChange={e => setUserNotes(e.target.value)}
                    rows={2}
                    placeholder="What would you like to discuss in this session?" />

                  {/* ── Booking summary ── */}
                  {selectedSlot && (
                    <div className={styles.bookingSummary}>
                      📅 {selectedDay.date} {selectedDay.month}
                      &nbsp;·&nbsp; 🕐 {selectedSlot.label}
                      &nbsp;·&nbsp; {meetingMode === "ONLINE" ? "💻 Online" : "🏢 Offline"}
                      &nbsp;·&nbsp; ₹{selectedConsultant.fee.toLocaleString()}
                    </div>
                  )}

                  {/* ── Confirm button ── */}
                  <button
                    disabled={!selectedSlot || confirming}
                    onClick={handleConfirm}
                    className={`${styles.proceedBtn} ${selectedSlot && !confirming ? styles.proceedBtnActive : ""}`}>
                    {confirming
                      ? "Booking…"
                      : selectedSlot
                        ? `Confirm & Pay ₹${selectedConsultant.fee.toLocaleString()}`
                        : "Select a Date and Time to Continue"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom navigation ── */}
      <nav className={styles.bottomNav}>
        {(["consultants","bookings","queries","settings"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`${styles.navBtn} ${tab === t ? styles.navBtnActive : ""}`}>
            <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
          </button>
        ))}
      </nav>

      {/* ══════════════════════════════════════════════════════
          FEEDBACK MODAL
          ══════════════════════════════════════════════════════ */}
      {feedbackModal && (
        <div
          style={{
            position:"fixed", inset:0,
            background:"rgba(15,23,42,0.65)",
            zIndex:1200, display:"flex",
            alignItems:"center", justifyContent:"center",
            padding:16, backdropFilter:"blur(6px)",
          }}
          onClick={() => !submittingFeedback && setFeedbackModal(null)}
        >
          <div
            style={{
              background:"#fff", borderRadius:24, width:"100%", maxWidth:480,
              maxHeight:"90vh", overflowY:"auto",
              boxShadow:"0 32px 80px rgba(15,23,42,0.35)",
              animation:"popIn 0.3s cubic-bezier(0.16,1,0.3,1)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              background:"linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)",
              padding:"22px 24px 20px", borderRadius:"24px 24px 0 0",
              position:"relative",
            }}>
              <button
                onClick={() => setFeedbackModal(null)}
                style={{
                  position:"absolute", top:14, right:14,
                  background:"rgba(255,255,255,0.2)", border:"none",
                  color:"#fff", width:30, height:30, borderRadius:"50%",
                  cursor:"pointer", fontSize:18,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>×</button>
              <div style={{ fontSize:10, letterSpacing:"0.16em", textTransform:"uppercase", color:"#93C5FD", marginBottom:4 }}>
                Rate Your Session
              </div>
              <h3 style={{ fontSize:20, fontWeight:700, color:"#fff", margin:"0 0 4px" }}>
                {feedbackModal.existingFeedback ? "Update Your Feedback" : "Leave Feedback"}
              </h3>
              <p style={{ fontSize:13, color:"#BFDBFE", margin:0 }}>
                Session with {feedbackModal.consultantName}
              </p>
            </div>

            {/* Modal Body */}
            <div style={{ padding:"24px" }}>
              {/* Session info pill */}
              <div style={{
                background:"#F8FAFC", border:"1px solid #E2E8F0",
                borderRadius:12, padding:"12px 16px", marginBottom:24,
                display:"flex", gap:12, alignItems:"center", flexWrap:"wrap",
              }}>
                <span style={{ fontSize:13, color:"#475569" }}>📅 {feedbackModal.slotDate || "Session"}</span>
                {feedbackModal.timeRange && (
                  <span style={{
                    background:"#EFF6FF", color:"#2563EB",
                    fontSize:12, fontWeight:700, padding:"2px 10px",
                    borderRadius:20, border:"1px solid #BFDBFE",
                  }}>{feedbackModal.timeRange}</span>
                )}
                <span style={{ background:"#F0FDF4", color:"#16A34A", fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20 }}>✓ Session Attended</span>
              </div>

              {/* Star rating */}
              <div style={{ marginBottom:24 }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 12px" }}>
                  How would you rate this session?
                </p>
                <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:8 }}>
                  {[1,2,3,4,5].map(star => (
                    <button
                      key={star}
                      onClick={() => setFeedbackRating(star)}
                      onMouseEnter={() => setFeedbackHover(star)}
                      onMouseLeave={() => setFeedbackHover(0)}
                      style={{
                        background:"none", border:"none", cursor:"pointer",
                        padding:4, transition:"transform 0.15s",
                        transform: (feedbackHover || feedbackRating) >= star ? "scale(1.2)" : "scale(1)",
                      }}>
                      <svg width="36" height="36" viewBox="0 0 24 24"
                        fill={(feedbackHover || feedbackRating) >= star ? "#F59E0B" : "#E2E8F0"}
                        stroke={(feedbackHover || feedbackRating) >= star ? "#D97706" : "#CBD5E1"}
                        strokeWidth="1.5">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                    </button>
                  ))}
                </div>
                <div style={{ textAlign:"center", height:20 }}>
                  {(feedbackHover || feedbackRating) > 0 && (
                    <span style={{ fontSize:13, fontWeight:600, color:"#D97706" }}>
                      {["","Poor","Fair","Good","Very Good","Excellent!"][feedbackHover || feedbackRating]}
                    </span>
                  )}
                </div>
              </div>

              {/* Comment */}
              <div style={{ marginBottom:24 }}>
                <p style={{ fontSize:12, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.08em", margin:"0 0 8px" }}>
                  Comments (optional)
                </p>
                <textarea
                  value={feedbackComment}
                  onChange={e => setFeedbackComment(e.target.value)}
                  placeholder="Share your experience — what was helpful, what could be improved..."
                  maxLength={1000}
                  rows={4}
                  style={{
                    width:"100%", padding:"12px 14px",
                    border:"1.5px solid #E2E8F0", borderRadius:12,
                    fontSize:13, fontFamily:"inherit", resize:"none",
                    outline:"none", boxSizing:"border-box",
                    color:"#1E293B", lineHeight:1.6,
                    transition:"border-color 0.2s",
                  }}
                  onFocus={e => (e.target.style.borderColor = "#2563EB")}
                  onBlur={e => (e.target.style.borderColor = "#E2E8F0")}
                />
                <div style={{ textAlign:"right", fontSize:11, color:"#94A3B8", marginTop:4 }}>
                  {feedbackComment.length}/1000
                </div>
              </div>

              {/* Submit button */}
              <button
                onClick={handleSubmitFeedback}
                disabled={submittingFeedback || feedbackRating === 0}
                style={{
                  width:"100%", padding:"14px",
                  background: feedbackRating === 0 || submittingFeedback
                    ? "#E2E8F0"
                    : "linear-gradient(135deg,#2563EB,#1D4ED8)",
                  color: feedbackRating === 0 || submittingFeedback ? "#94A3B8" : "#fff",
                  border:"none", borderRadius:14,
                  fontWeight:700, fontSize:15, cursor: feedbackRating === 0 ? "not-allowed" : "pointer",
                  fontFamily:"inherit", letterSpacing:"0.02em",
                  boxShadow: feedbackRating > 0 && !submittingFeedback
                    ? "0 4px 14px rgba(37,99,235,0.35)" : "none",
                  transition:"all 0.2s", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                }}>
                {submittingFeedback ? (
                  <>
                    <span style={{ width:16, height:16, border:"2px solid rgba(255,255,255,0.4)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.7s linear infinite", display:"inline-block" }}/>
                    Submitting…
                  </>
                ) : feedbackModal.existingFeedback ? "Update Feedback" : "⭐ Submit Feedback"}
              </button>

              {feedbackRating === 0 && (
                <p style={{ textAlign:"center", fontSize:12, color:"#94A3B8", margin:"10px 0 0" }}>
                  Please select a star rating to continue
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}