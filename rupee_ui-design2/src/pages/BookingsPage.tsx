import { AlertTriangle, Building2, Calendar, Check, ChevronLeft, ChevronRight, Monitor, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import logoImg from "../assests/Meetmasterslogopng.png";
import { API_ORIGIN } from "../config/api";
import {
  extractArray,
  getBookingsPage,
  getConsultantId,
  getSpecialBookingsByConsultant,
  getToken,
} from "../services/api";

const API_BASE = API_ORIGIN;

interface Booking {
  id: number;
  user: string;
  userInitial: string;
  advisor: string;
  date: string;
  time: string;
  status: string;
  amount: number;
  meetingMode: string;
  isSpecial?: boolean;
  duration?: string;        // e.g. "1 hr", "2 hrs"
  specialStatus?: string;   // raw SpecialBookingStatus: REQUESTED | SCHEDULED | CONFIRMED | COMPLETED | CANCELLED
}

interface Props {
  isAdmin?: boolean;
}

const SPECIAL_BOOKING_PREFIX = "[[SPECIAL_BOOKING_META]]";

interface SpecialBookingMeta {
  preferredDate?: string;
  preferredTime?: string;
  preferredTimeRange?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  scheduledTimeRange?: string;
}

const prettifyName = (raw: string): string => {
  if (!raw) return raw;
  if (raw.includes("@")) {
    return raw.split("@")[0]
      .replace(/[._\-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return raw;
};

const extractAdvisorName = (b: any, consultantNameMap: Record<number, string> = {}): string =>
  b.consultant?.name ||
  b.consultant?.fullName ||
  b.advisor?.name ||
  b.consultantName ||
  b.advisorName ||
  b.providerName ||
  consultantNameMap[b.consultantId] ||
  (b.consultantId ? "Consultant" : null) ||
  "Consultant";

const parseSpecialBookingMeta = (rawNotes: any): SpecialBookingMeta | null => {
  if (typeof rawNotes !== "string" || !rawNotes.startsWith(SPECIAL_BOOKING_PREFIX)) return null;
  const jsonText = rawNotes.slice(SPECIAL_BOOKING_PREFIX.length).split("\n")[0]?.trim();
  if (!jsonText) return null;
  try {
    return JSON.parse(jsonText) as SpecialBookingMeta;
  } catch {
    return null;
  }
};

const normaliseBookingDateKey = (raw: string): string => {
  const value = String(raw || "").trim();
  if (!value) return "9999-12-31";

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const dashMatch = value.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, dd, mm, yyyy] = dashMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const slashMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split("T")[0];

  return value;
};

const parseTimeLabelToMinutes = (value: string): number | null => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (!match) return null;
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] || "0", 10);
  const period = (match[3] || "").toUpperCase();
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
};

const bookingStartMinutes = (booking: Pick<Booking, "time">): number => {
  const fromRange = parseTimeLabelToMinutes(
    String(booking.time || "").split(/[-–]/)[0]?.trim() || ""
  );
  if (fromRange !== null) return fromRange;
  return parseTimeLabelToMinutes(booking.time || "") ?? Number.MAX_SAFE_INTEGER;
};

const sortBookingsChronologically = (items: Booking[]): Booking[] =>
  [...items].sort((a, b) => {
    const dateCmp = normaliseBookingDateKey(a.date || "").localeCompare(
      normaliseBookingDateKey(b.date || "")
    );
    if (dateCmp !== 0) return dateCmp;

    const timeCmp = bookingStartMinutes(a) - bookingStartMinutes(b);
    if (timeCmp !== 0) return timeCmp;

    return Number(a.id || 0) - Number(b.id || 0);
  });

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  CONFIRMED: { bg: "#ECFEFF", color: "#0F766E", border: "#99F6E4" },
  PENDING: { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D" },
  REQUESTED: { bg: "#FFF7ED", color: "#C2410C", border: "#FDBA74" },
  COMPLETED: { bg: "#F0FDF4", color: "#16A34A", border: "#86EFAC" },
  CANCELLED: { bg: "#FEF2F2", color: "#EF4444", border: "#FCA5A5" },
  DEFAULT: { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" },
};
const getStatus = (s: string) => STATUS_STYLES[s] || STATUS_STYLES.DEFAULT;

const authFetch = async (url: string) => {
  const token = getToken();
  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
  const res = await fetch(fullUrl, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const _masterMapCache: Record<number, string> = {};
let _masterMapLoaded = false;
const _consultantCache: Record<number, string> = {};
const _userCache: Record<number, string> = {};

export default function BookingsPage({ isAdmin = false }: Props) {
  const PAGE_SIZE = 10;

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "SPECIAL">("ALL");
  const [pageCache, setPageCache] = useState<Record<number, Booking[]>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editForm, setEditForm] = useState<{ status: string; date: string; time: string }>({ status: "", date: "", time: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [changingStatusId, setChangingStatusId] = useState<number | null>(null);
  const [specialTotal, setSpecialTotal] = useState(0);

  const showMsg = (text: string, ok = true) => {
    setActionMsg({ text, ok });
    setTimeout(() => setActionMsg(null), 3000);
  };

  const handleDeleteBooking = async (id: number) => {
    setDeletingId(id);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/bookings/${id}/cancel`, {
        method: "PATCH",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      setBookings(prev => prev.filter(b => b.id !== id));
      setTotalElements(p => p - 1);
      showMsg(`Booking #${id} deleted.`);
    } catch (e: any) {
      showMsg(e?.message || "Delete failed.", false);
    } finally {
      setDeletingId(null);
    }
  };

  const handleStatusChange = async (bookingId: number, newStatus: string) => {
    setChangingStatusId(bookingId);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/bookings/${bookingId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ bookingStatus: newStatus }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
      setPageCache(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(k => {
          updated[Number(k)] = updated[Number(k)]?.map(b =>
            b.id === bookingId ? { ...b, status: newStatus } : b
          );
        });
        return updated;
      });
      showMsg(`Booking #${bookingId} updated to ${newStatus}`);
    } catch (e: any) {
      showMsg(e?.message || "Status update failed.", false);
    } finally {
      setChangingStatusId(null);
    }
  };

  const openEditModal = (b: Booking) => {
    setEditingBooking(b);
    setEditForm({ status: b.status, date: b.date || "", time: b.time || "" });
  };

  const handleSaveEdit = async () => {
    if (!editingBooking) return;
    setSavingEdit(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/bookings/${editingBooking.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ bookingStatus: editForm.status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setBookings(prev => prev.map(b =>
        b.id === editingBooking.id ? { ...b, status: editForm.status as any } : b
      ));
      setEditingBooking(null);
      showMsg(`Booking #${editingBooking.id} updated.`);
    } catch (e: any) {
      showMsg(e?.message || "Update failed.", false);
    } finally {
      setSavingEdit(false);
    }
  };

  useEffect(() => { setCurrentPage(0); setPageCache({}); }, [isAdmin, filter]);
  useEffect(() => { loadPage(currentPage); }, [currentPage, isAdmin]);

  useEffect(() => {
    if (loading) return;
    const prefetch = async (p: number) => {
      if (p < 0 || (totalPages > 0 && p >= totalPages) || pageCache[p]) return;
      try {
        const consultantId = !isAdmin ? Number(getConsultantId()) : undefined;
        const result = await getBookingsPage(p, PAGE_SIZE, consultantId || undefined);
        const mapped = await mapRaw(result.content);
        setPageCache(prev => ({ ...prev, [p]: mapped }));
      } catch { }
    };
    prefetch(currentPage - 1);
    prefetch(currentPage + 1);
  }, [currentPage, loading, totalPages]);

  // ── Fetch all special bookings for this consultant / admin ──
  const fetchSpecialBookings = async (consultantId?: number): Promise<Booking[]> => {
    try {
      let raw: any[] = [];
      if (isAdmin) {
        // Admin: try a few endpoint variants for all special bookings
        for (const ep of ["/special-bookings?page=0&size=200", "/special-bookings/all", "/special-bookings"]) {
          try { raw = extractArray(await authFetch(`/api${ep}`)); if (raw.length >= 0) break; } catch { }
        }
      } else if (consultantId) {
        raw = await getSpecialBookingsByConsultant(consultantId);
      }
      return mapSpecialRaw(raw, consultantId);
    } catch { return []; }
  };

  const mapSpecialRaw = (raw: any[], consultantId?: number): Booking[] => {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((b: any) => {
        const hrs = Number(b.durationInHours || b.duration_in_hours || 1);
        const duration = hrs === 1 ? "1 hr" : `${hrs} hrs`;
        const rawStatus = (b.status || "REQUESTED").toUpperCase();
        const meta = parseSpecialBookingMeta(b.userNotes);
        // Map SpecialBookingStatus → display status
        const displayStatus =
          rawStatus === "REQUESTED"
            ? "PENDING"
            : rawStatus === "SCHEDULED"
              ? "CONFIRMED"
              : rawStatus;
        const scheduledDate =
          b.scheduledDate ||
          b.scheduled_date ||
          meta?.scheduledDate ||
          meta?.preferredDate ||
          "";
        const scheduledTimeRaw =
          b.scheduledTime ||
          b.scheduled_time ||
          meta?.scheduledTime ||
          meta?.preferredTime ||
          "";
        const scheduledTime =
          typeof scheduledTimeRaw === "object" && scheduledTimeRaw?.hour !== undefined
            ? `${String(scheduledTimeRaw.hour).padStart(2, "0")}:${String(scheduledTimeRaw.minute ?? 0).padStart(2, "0")}`
            : String(scheduledTimeRaw).substring(0, 5);
        // Format time as "12:00 AM - 1:00 AM" (start → end based on duration)
        const fmt12 = (h: number, m: number) => {
          const ampm = h >= 12 ? "PM" : "AM";
          const h12 = h % 12 || 12;
          return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
        };
        let timeDisplay =
          String(
            b.scheduledTimeRange ||
            b.timeRange ||
            meta?.scheduledTimeRange ||
            meta?.preferredTimeRange ||
            ""
          ).trim();
        if (!timeDisplay && scheduledTime) {
          try {
            const [hh, mm] = String(scheduledTime).split(":");
            const startH = parseInt(hh, 10), startM = parseInt(mm, 10);
            const endTotalM = startH * 60 + startM + hrs * 60;
            const endH = Math.floor(endTotalM / 60) % 24;
            const endM = endTotalM % 60;
            timeDisplay = `${fmt12(startH, startM)} - ${fmt12(endH, endM)}`;
          } catch { timeDisplay = String(scheduledTime).substring(0, 5); }
        }
        const uid = b.userId || b.user_id;
        const userName = prettifyName(
          b.user?.name || b.user?.fullName || b.user?.username ||
          b.userName || b.clientName || (uid && _userCache[uid]) || ""
        ) || "Client";
        const advisorName = _consultantCache[b.consultantId] || "Consultant";
        return {
          id: b.id,
          user: userName,
          userInitial: userName.charAt(0).toUpperCase(),
          advisor: advisorName,
          date: scheduledDate,
          time: timeDisplay,
          status: displayStatus,
          amount: Number(b.sessionAmount || b.totalAmount || b.total_amount || b.amount || b.charges || 0),
          meetingMode: (b.meetingMode || b.meeting_mode || "ONLINE").toUpperCase(),
          isSpecial: true,
          duration,
          specialStatus: rawStatus,
        } as Booking;
      });
  };

  const loadPage = async (page: number) => {
    if (pageCache[page]) {
      setBookings(pageCache[page]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const consultantId = !isAdmin ? Number(getConsultantId()) : undefined;
      if (!isAdmin && !consultantId) {
        setError("Consultant ID not found. Please log in again.");
        setLoading(false);
        return;
      }
      // Fetch regular bookings + special bookings in parallel
      const [result, specialMapped] = await Promise.all([
        getBookingsPage(page, PAGE_SIZE, consultantId || undefined),
        fetchSpecialBookings(consultantId),
      ]);
      setTotalElements(result.totalElements);
      setTotalPages(result.totalPages);
      setSpecialTotal(specialMapped.length);
      const regularMapped = await mapRaw(result.content);
      const merged = sortBookingsChronologically([...specialMapped, ...regularMapped]);
      setBookings(merged);
      setPageCache(prev => ({ ...prev, [page]: merged }));
    } catch (err: any) {
      console.error("BookingsPage error:", err);
      setError(err.message || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  };

  // ── Robust date parser — handles "2026-03-25", "25 Mar 2026", "Mar 25, 2026" etc.
  const parseBookingDate = (raw: string): string => {
    if (!raw) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw; // already ISO
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    // Handle "25 Mar 2026"
    const m = raw.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/);
    if (m) {
      const d2 = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
      if (!isNaN(d2.getTime())) return d2.toISOString().split("T")[0];
    }
    return raw; // return as-is if unparseable
  };

  const mapRaw = async (raw: any[]): Promise<Booking[]> => {
    if (!Array.isArray(raw) || raw.length === 0) return [];

    const slotMap: Record<number, any> = {};
    const uniqueSlotIds = [...new Set(raw.map((b: any) => b.timeSlotId).filter(Boolean))] as number[];
    const slotFetches = uniqueSlotIds.map(async (tsId: number) => {
      try { const ts = await authFetch(`/api/timeslots/${tsId}`); if (ts) slotMap[tsId] = ts; } catch { }
    });

    const masterFetch = _masterMapLoaded
      ? Promise.resolve()
      : authFetch("/api/master-timeslots?page=0&size=1000")
        .then(mData => {
          (Array.isArray(mData) ? mData : mData?.content || [])
            .forEach((m: any) => { if (m.id && m.timeRange) _masterMapCache[m.id] = m.timeRange; });
          _masterMapLoaded = true;
        }).catch(() => { });

    const uncachedCids = [...new Set(
      raw.map((b: any) => b.consultantId).filter((id: any) => id && !_consultantCache[id])
    )] as number[];
    const consultantFetches = uncachedCids.map(async (id) => {
      try {
        const c = await authFetch(`/api/consultants/${id}`);
        if (c?.name || c?.fullName) { _consultantCache[id] = c.name || c.fullName; return; }
      } catch { }
      try {
        const u = await authFetch(`/api/users/${id}`);
        _consultantCache[id] = u?.name || u?.fullName || u?.username || "Consultant";
      } catch { _consultantCache[id] = "Consultant"; }
    });

    const needsUserEnrichment = raw.filter((b: any) => {
      const hasName = b.user?.name || b.user?.fullName || b.user?.username || b.userName || b.clientName;
      const uid = b.userId || b.user?.id || b.clientId;
      return !hasName && uid && !_userCache[uid];
    });
    const uncachedUids = [...new Set(
      needsUserEnrichment.map((b: any) => b.userId || b.user?.id || b.clientId)
    )] as number[];
    const userFetches = uncachedUids.map(async (uid) => {
      try {
        const u = await authFetch(`/api/users/${uid}`);
        _userCache[uid] = prettifyName(u.name || u.fullName || u.email || u.username || u.identifier || "") || "Client";
      } catch { _userCache[uid] = "Client"; }
    });

    await Promise.all([...slotFetches, masterFetch, ...consultantFetches, ...userFetches]);

    const mapped: Booking[] = raw.map((b: any) => {
      const ts = slotMap[b.timeSlotId] || {};
      const rawDate = ts.slotDate || b.slotDate || b.bookingDate || b.date || "";
      const date = parseBookingDate(rawDate);
      const masterKey = ts.masterTimeSlotId || b.masterTimeSlotId;
      // Helper to format HH:MM → 12-hr and optionally build start–end range
      const fmt12 = (h: number, m: number) => {
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
      };
      const buildTimeRange = (startRaw: string, endRaw?: string): string => {
        if (!startRaw) return "";
        try {
          const [sh, sm] = startRaw.split(":").map(Number);
          const startStr = fmt12(sh, sm);
          if (endRaw) {
            const [eh, em] = endRaw.split(":").map(Number);
            return `${startStr} - ${fmt12(eh, em)}`;
          }
          return startStr;
        } catch { return startRaw.substring(0, 5); }
      };
      const time =
        (masterKey && _masterMapCache[masterKey] ? _masterMapCache[masterKey] : "") ||
        ts.timeRange ||
        (ts.startTime ? buildTimeRange(ts.startTime, ts.endTime) : "") ||
        b.timeRange ||
        (b.startTime ? buildTimeRange(b.startTime, b.endTime) : "") ||
        (b.scheduledTime ? buildTimeRange(b.scheduledTime) : "") ||
        (b.slotTime ? buildTimeRange(b.slotTime) : "") ||
        "";
      const uid = b.userId || b.user?.id || b.clientId;
      const rawUserName =
        b.user?.name || b.user?.fullName || b.user?.username ||
        b.client?.name || b.userName || b.clientName || (uid && _userCache[uid]) || "";
      const userName = prettifyName(rawUserName) || (uid ? "Client" : `Booking #${b.id}`);
      const advisorName = extractAdvisorName(b, _consultantCache);
      const status = (b.BookingStatus || b.bookingStatus || b.status || "PENDING").toUpperCase();
      return {
        id: b.id,
        user: userName,
        userInitial: userName.charAt(0).toUpperCase(),
        advisor: advisorName,
        date,
        time,
        status,
        amount: Number(b.totalAmount || b.amount || b.charges || b.fee || b.consultantCharges || 0),
        meetingMode: b.meetingMode || b.meeting_mode || b.mode || "",
      };
    });

    return sortBookingsChronologically(mapped);
  };

  const filtered =
    filter === "ALL" ? bookings :
      filter === "SPECIAL" ? bookings.filter(b => b.isSpecial) :
        bookings.filter(b => b.status === filter);
  const regularBookings = bookings.filter(b => !b.isSpecial);
  const specialBookings = bookings.filter(b => b.isSpecial);
  const counts = {
    ALL: totalElements + specialTotal,
    PENDING: bookings.filter(b => b.status === "PENDING").length,
    CONFIRMED: bookings.filter(b => b.status === "CONFIRMED").length,
    COMPLETED: bookings.filter(b => b.status === "COMPLETED").length,
    CANCELLED: bookings.filter(b => b.status === "CANCELLED").length,
    SPECIAL: specialTotal,
  };
  const revenue = bookings.filter(b => b.status === "COMPLETED").reduce((s, b) => s + b.amount, 0);

  const pageNums = (): (number | "…")[] => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const set = new Set([0, totalPages - 1, currentPage - 1, currentPage, currentPage + 1]
      .filter(p => p >= 0 && p < totalPages));
    const sorted = [...set].sort((a, b) => a - b);
    const result: (number | "…")[] = [];
    sorted.forEach((p, i) => {
      if (i > 0 && p - (sorted[i - 1] as number) > 1) result.push("…");
      result.push(p);
    });
    return result;
  };

  const goToPage = (p: number) => {
    if (p < 0 || p >= totalPages || p === currentPage) return;
    setCurrentPage(p);
  };

  return (
    <div>
      {/* Toast */}
      {actionMsg && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: actionMsg.ok ? "#0F172A" : "#7F1D1D", color: "#fff",
          padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 9999, whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {actionMsg.ok ? <Check size={14} /> : <X size={14} />}
          {actionMsg.text}
        </div>
      )}

      {/* Edit modal (admin only) */}
      {isAdmin && editingBooking && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setEditingBooking(null); }}>
          <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ background: "var(--portal-profile-gradient)", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: "#99F6E4", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Edit Booking</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 4 }}>Booking #{editingBooking.id}</div>
              </div>
              <button onClick={() => setEditingBooking(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><X size={16} /></button>
            </div>
            <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>User</div>
                <div style={{ fontSize: 14, color: "#0F172A", fontWeight: 600 }}>{editingBooking.user}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Consultant</div>
                <div style={{ fontSize: 14, color: "#0F172A", fontWeight: 600 }}>{editingBooking.advisor}</div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Booking Status</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  style={{ width: "100%", padding: "10px 13px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
                  {["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button onClick={() => setEditingBooking(null)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button onClick={handleSaveEdit} disabled={savingEdit}
                  style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: savingEdit ? "#99F6E4" : "linear-gradient(135deg, #0F766E, #0D9488)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {savingEdit ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Refresh button — consultant dashboard only.
           Admin view omits this; the parent BookingsSectionWrapper header provides it. ── */}
      {!isAdmin && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 20 }}>
          <button onClick={() => { setPageCache({}); loadPage(currentPage); }} style={{
            background: "#ECFEFF", color: "#0F766E", border: "1px solid #A5F3FC",
            borderRadius: 8, padding: "6px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}><RefreshCw size={14} /> Refresh</button>
        </div>
      )}

      {/* Stats strip */}
      {!loading && bookings.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 20, overflowX: "auto" }}>
          {[
            { label: "Total", value: counts.ALL, color: "#0F766E", bg: "#ECFEFF" },
            { label: "Pending", value: counts.PENDING, color: "#D97706", bg: "#FFFBEB" },
            { label: "Confirmed", value: counts.CONFIRMED, color: "#0F766E", bg: "#ECFEFF" },
            { label: "Completed", value: counts.COMPLETED, color: "#16A34A", bg: "#F0FDF4" },
            { label: "Special", value: specialTotal, color: "#B45309", bg: "#FFF7ED" },
            { label: "Revenue", value: `₹${revenue.toLocaleString("en-IN")}`, color: "#16A34A", bg: "#F0FDF4" },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 10, padding: "12px 14px", minWidth: 90, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#64748B", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4, lineHeight: 1.3 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", marginBottom: 16, color: "#B91C1C", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><AlertTriangle size={14} /> {error}</span>
          <button onClick={() => loadPage(currentPage)} style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      )}

      {/* Filter pills */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        {(["ALL", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"] as const).map(f => (
          <button key={f} onClick={() => { setFilter(f); setCurrentPage(0); setPageCache({}); }} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: filter === f ? "#0F766E" : "#F1F5F9",
            color: filter === f ? "#fff" : "#64748B",
            border: filter === f ? "1px solid #0F766E" : "1px solid #E2E8F0",
            display: "inline-flex", alignItems: "center", gap: 6, transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}>
            {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            <span style={{ background: filter === f ? "rgba(255,255,255,0.25)" : "#E2E8F0", color: filter === f ? "#fff" : "#94A3B8", borderRadius: 10, fontSize: 10, fontWeight: 700, padding: "0 6px", minWidth: 18, textAlign: "center" }}>
              {f === "ALL" ? counts.ALL : counts[f]}
            </span>
          </button>
        ))}
        {specialTotal > 0 && (
          <button onClick={() => { setFilter("SPECIAL" as any); setCurrentPage(0); setPageCache({}); }} style={{ fontSize: 11, fontWeight: 700, color: filter === "SPECIAL" ? "#fff" : "#B45309", background: filter === "SPECIAL" ? "linear-gradient(135deg,#B45309,#D97706)" : "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 20, padding: "4px 12px", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", cursor: "pointer", transition: "all 0.15s" }}>
            ⭐ {specialTotal} special booking{specialTotal !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
          <img src={logoImg} alt="Meet The Masters" style={{ width: 72, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "#F8FAFC", borderRadius: 14, color: "#94A3B8" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><Calendar size={36} color="#CBD5E1" strokeWidth={1.7} /></div>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {totalElements === 0 ? "No bookings yet." : filter === "SPECIAL" ? "No special bookings found." : `No ${filter.toLowerCase()} bookings on this page.`}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((b, idx) => {
            const sc = getStatus(b.status);
            return (
              <div key={b.id} style={{
                background: "#fff", border: "1px solid #F1F5F9",
                borderLeft: `4px solid ${sc.border}`, borderRadius: 14,
                padding: "16px 20px", display: "flex", alignItems: "flex-start",
                gap: 14, flexWrap: "wrap", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}>
                {/* Avatar */}
                <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: "var(--color-primary-gradient)", color: "#fff", fontWeight: 700, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {b.userInitial}
                </div>
                {/* Main info */}
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0F172A", marginBottom: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {isAdmin ? b.user : `Session with ${b.advisor}`}
                    {b.isSpecial && (
                      <span style={{ fontSize: 10, fontWeight: 800, background: "linear-gradient(135deg,#B45309,#D97706)", color: "#fff", padding: "2px 8px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        ⭐ Special
                      </span>
                    )}
                  </div>
                  {isAdmin && (
                    <div style={{ fontSize: 12, color: "#0F766E", fontWeight: 600, marginBottom: 4 }}>
                      Consultant: {b.advisor}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: "#64748B", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {b.isSpecial && b.specialStatus === "REQUESTED" && !b.date ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#C2410C", fontWeight: 600 }}>
                        <Calendar size={13} /> Awaiting schedule from consultant
                      </span>
                    ) : b.date ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Calendar size={13} /> {b.date}</span>
                    ) : null}
                    {b.time && <span style={{ background: "#ECFEFF", color: "#0F766E", fontWeight: 600, padding: "2px 10px", borderRadius: 20, fontSize: 12 }}>{b.time}</span>}
                    {b.isSpecial && b.duration && !b.time && (
                      <span style={{ background: "#FFF7ED", color: "#C2410C", fontWeight: 600, padding: "2px 10px", borderRadius: 20, fontSize: 12 }}>{b.duration}</span>
                    )}
                    {b.meetingMode && (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        {b.meetingMode === "ONLINE" ? <Monitor size={13} /> : <Building2 size={13} />}
                        {b.meetingMode === "ONLINE" ? "Online" : "Offline"}
                      </span>
                    )}
                    {b.amount > 0 && <span style={{ color: "#16A34A", fontWeight: 700 }}>₹{b.amount.toLocaleString("en-IN")}</span>}
                  </div>
                </div>
                {/* Status / action */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, color: "#CBD5E1" }}>#{currentPage * PAGE_SIZE + idx + 1}</span>
                  {isAdmin && !b.isSpecial ? (
                    <div style={{ position: "relative" }}>
                      <select value={b.status} disabled={changingStatusId === b.id} onChange={e => handleStatusChange(b.id, e.target.value)}
                        style={{ padding: "5px 28px 5px 12px", borderRadius: 20, border: `1.5px solid ${sc.border}`, background: changingStatusId === b.id ? "#F8FAFC" : sc.bg, color: changingStatusId === b.id ? "#94A3B8" : sc.color, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", cursor: changingStatusId === b.id ? "not-allowed" : "pointer", outline: "none", appearance: "none", WebkitAppearance: "none", fontFamily: "inherit", transition: "all 0.15s", minWidth: 110 }}>
                        {["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", fontSize: 9, color: sc.color }}>▼</span>
                      {changingStatusId === b.id && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, border: "2px solid #E2E8F0", borderTopColor: "#0F766E", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
                    </div>
                  ) : (
                    <span style={{ padding: "5px 14px", borderRadius: 20, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                      {b.isSpecial && b.specialStatus === "REQUESTED" ? "REQUESTED" : b.status}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>
            Page {currentPage + 1} of {totalPages} &nbsp;·&nbsp; {counts.ALL} total bookings
            {specialTotal > 0 && <span style={{ color: "#B45309" }}> ({specialTotal} special)</span>}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 0}
              style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: currentPage === 0 ? "not-allowed" : "pointer", border: "1.5px solid #E2E8F0", background: currentPage === 0 ? "#F8FAFC" : "#fff", color: currentPage === 0 ? "#CBD5E1" : "#0F766E", display: "inline-flex", alignItems: "center", gap: 6 }}><ChevronLeft size={14} /> Prev</button>
            {pageNums().map((pg, i) =>
              pg === "…" ? (
                <span key={`e-${i}`} style={{ padding: "0 6px", color: "#94A3B8", fontSize: 14, userSelect: "none" }}>…</span>
              ) : (
                <button key={pg} onClick={() => goToPage(pg as number)}
                  style={{ width: 36, height: 36, borderRadius: 8, fontSize: 13, fontWeight: pg === currentPage ? 800 : 600, cursor: "pointer", border: pg === currentPage ? "2px solid #0F766E" : pageCache[pg as number] ? "1.5px solid #A5F3FC" : "1.5px solid #E2E8F0", background: pg === currentPage ? "#0F766E" : pageCache[pg as number] ? "#ECFEFF" : "#fff", color: pg === currentPage ? "#fff" : pageCache[pg as number] ? "#0F766E" : "#374151" }}>
                  {(pg as number) + 1}
                </button>
              )
            )}
            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages - 1}
              style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: currentPage >= totalPages - 1 ? "not-allowed" : "pointer", border: "1.5px solid #E2E8F0", background: currentPage >= totalPages - 1 ? "#F8FAFC" : "#fff", color: currentPage >= totalPages - 1 ? "#CBD5E1" : "#0F766E", display: "inline-flex", alignItems: "center", gap: 6 }}>Next <ChevronRight size={14} /></button>
          </div>
        </div>
      )}
      <style>{`@keyframes mtmPulse { 0% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } 20% { opacity: 0.6; } 50% { transform: scale(1.10); filter: blur(0px) drop-shadow(0 0 22px rgba(15,118,110,0.65)); opacity: 1.0; } 80% { opacity: 0.6; } 100% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
