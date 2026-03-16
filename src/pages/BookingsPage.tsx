import { useEffect, useState } from "react";
import {
  getBookingsPage,
  getConsultantId,
  getToken
} from "../services/api";

// ── Types ─────────────────────────────────────────────────────────────────────
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
}

interface Props {
  isAdmin?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const toAmPm = (t: string): string => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return t;
  return `${h % 12 || 12}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const prettifyName = (raw: string): string => {
  if (!raw) return raw;
  if (raw.includes("@")) {
    return raw.split("@")[0]
      .replace(/[._\-]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return raw;
};

const extractUserName = (b: any): string => {
  const raw =
    b.user?.name || b.user?.fullName || b.user?.username ||
    b.client?.name || b.bookedBy?.name || b.customer?.name ||
    b.userName || b.clientName || b.userFullName ||
    b.bookedByName || b.user?.email || b.userEmail ||
    (b.userId ? `User #${b.userId}` : null) ||
    (b.clientId ? `User #${b.clientId}` : null) ||
    `Booking #${b.id}`;
  return prettifyName(raw);
};

const extractAdvisorName = (b: any, consultantNameMap: Record<number, string> = {}): string =>
  b.consultant?.name ||
  b.consultant?.fullName ||
  b.advisor?.name ||
  b.consultantName ||
  b.advisorName ||
  b.providerName ||
  consultantNameMap[b.consultantId] ||
  (b.consultantId ? `Consultant #${b.consultantId}` : null) ||
  "Consultant";

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  CONFIRMED: { bg: "#EFF6FF", color: "#2563EB", border: "#93C5FD" },
  PENDING: { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D" },
  COMPLETED: { bg: "#F0FDF4", color: "#16A34A", border: "#86EFAC" },
  CANCELLED: { bg: "#FEF2F2", color: "#EF4444", border: "#FCA5A5" },
  DEFAULT: { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" },
};
const getStatus = (s: string) => STATUS_STYLES[s] || STATUS_STYLES.DEFAULT;

// ── Auth fetch helper ─────────────────────────────────────────────────────────
const authFetch = async (url: string) => {
  const token = getToken();
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// ── Module-level caches (survive re-renders — make 2nd+ page loads instant) ──
const _masterMapCache: Record<number, string> = {};
let _masterMapLoaded = false;
const _consultantCache: Record<number, string> = {};
const _userCache: Record<number, string> = {};


// ─────────────────────────────────────────────────────────────────────────────
export default function BookingsPage({ isAdmin = false }: Props) {
  const PAGE_SIZE = 10;

  // ── pagination & data state ───────────────────────────────────────────────
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);        // 0-based (Spring)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED">("ALL");

  // ── cache: page-number → Booking[] (enables instant adjacent-page jumps) ─
  const [pageCache, setPageCache] = useState<Record<number, Booking[]>>({});

  // ADDED: Delete and Edit state for admin
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editForm, setEditForm] = useState<{ status: string; date: string; time: string }>({ status: "", date: "", time: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const showMsg = (text: string, ok = true) => {
    setActionMsg({ text, ok });
    setTimeout(() => setActionMsg(null), 3000);
  };

  // ADDED: Delete booking handler (admin only)
  const handleDeleteBooking = async (id: number) => {
    if (!window.confirm(`Delete booking #${id}? This cannot be undone.`)) return;
    setDeletingId(id);
    try {
      const token = getToken();
      const res = await fetch(`http://52.55.178.31:8081/api/bookings/${id}`, {
        method: "DELETE",
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

  // ADDED: Open edit modal
  const openEditModal = (b: Booking) => {
    setEditingBooking(b);
    setEditForm({ status: b.status, date: b.date || "", time: b.time || "" });
  };

  // ADDED: Save edit handler (admin only)
  const handleSaveEdit = async () => {
    if (!editingBooking) return;
    setSavingEdit(true);
    try {
      const token = getToken();
      const res = await fetch(`http://52.55.178.31:8081/api/bookings/${editingBooking.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          BookingStatus: editForm.status,
          bookingStatus: editForm.status,
          status: editForm.status,
        }),
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

  // Reset on isAdmin / filter change
  useEffect(() => { setCurrentPage(0); setPageCache({}); }, [isAdmin, filter]);

  // Load whenever currentPage changes
  useEffect(() => { loadPage(currentPage); }, [currentPage, isAdmin]);

  // Pre-fetch adjacent pages silently after current page loads
  useEffect(() => {
    if (loading) return;
    const prefetch = async (p: number) => {
      if (p < 0 || (totalPages > 0 && p >= totalPages) || pageCache[p]) return;
      try {
        const consultantId = !isAdmin ? Number(getConsultantId()) : undefined;
        const result = await getBookingsPage(p, PAGE_SIZE, consultantId || undefined);
        const mapped = await mapRaw(result.content);
        setPageCache(prev => ({ ...prev, [p]: mapped }));
      } catch { /* silent */ }
    };
    prefetch(currentPage - 1);
    prefetch(currentPage + 1);
  }, [currentPage, loading, totalPages]);

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
      const result = await getBookingsPage(page, PAGE_SIZE, consultantId || undefined);
      setTotalElements(result.totalElements);
      setTotalPages(result.totalPages);
      const mapped = await mapRaw(result.content);
      setBookings(mapped);
      setPageCache(prev => ({ ...prev, [page]: mapped }));
    } catch (err: any) {
      console.error("BookingsPage error:", err);
      setError(err.message || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  };

  // ── Map raw API items → Booking[] using module caches + all-parallel fetch ─
  const mapRaw = async (raw: any[]): Promise<Booking[]> => {
    if (!Array.isArray(raw) || raw.length === 0) return [];
    if (raw.length > 0) console.log("📋 Booking sample:", JSON.stringify(raw[0], null, 2));

    // 1. Timeslot details — per-page, always fresh
    const uniqueSlotIds = [...new Set(raw.map((b: any) => b.timeSlotId).filter(Boolean))] as number[];
    const slotMap: Record<number, any> = {};
    const slotFetches = uniqueSlotIds.map(id =>
      authFetch(`/api/timeslots/${id}`).then(s => { slotMap[id] = s; }).catch(() => { })
    );

    // 2. Master timeslots — fetched ONCE ever, then served from module cache
    const masterFetch = _masterMapLoaded
      ? Promise.resolve()
      : authFetch("/api/master-timeslots?page=0&size=1000")
        .then(mData => {
          (Array.isArray(mData) ? mData : mData?.content || [])
            .forEach((m: any) => { if (m.id && m.timeRange) _masterMapCache[m.id] = m.timeRange; });
          _masterMapLoaded = true;
        }).catch(() => { });

    // 3. Consultant names — only fetch IDs not already cached
    const uncachedCids = [...new Set(
      raw.map((b: any) => b.consultantId).filter((id: any) => id && !_consultantCache[id])
    )] as number[];
    const consultantFetches = uncachedCids.map(async (id) => {
      try {
        const c = await authFetch(`/api/consultants/${id}`);
        if (c?.name || c?.fullName) { _consultantCache[id] = c.name || c.fullName; return; }
      } catch { /* 404 */ }
      try {
        const u = await authFetch(`/api/users/${id}`);
        _consultantCache[id] = u?.name || u?.fullName || u?.username || `Consultant #${id}`;
      } catch { _consultantCache[id] = `Consultant #${id}`; }
    });

    // 4. User names — only fetch IDs not already cached
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
        _userCache[uid] = prettifyName(u.name || u.fullName || u.email || u.username || u.identifier || "") || `User #${uid}`;
      } catch { _userCache[uid] = `User #${uid}`; }
    });

    // ── Fire ALL fetch groups simultaneously ─────────────────────────────────
    await Promise.all([...slotFetches, masterFetch, ...consultantFetches, ...userFetches]);

    // 5. Map everything together
    const mapped: Booking[] = raw.map((b: any) => {
      const slot = slotMap[b.timeSlotId];
      const date = slot?.slotDate || b.slotDate || b.bookingDate || b.date || b.scheduledDate || "";
      const time =
        (slot?.masterTimeslotId && _masterMapCache[slot.masterTimeslotId] ? _masterMapCache[slot.masterTimeslotId] : "") ||
        (b.timeRange || "") ||
        (b.masterTimeslotId && _masterMapCache[b.masterTimeslotId] ? _masterMapCache[b.masterTimeslotId] : "") ||
        (slot?.slotTime ? toAmPm(slot.slotTime.substring(0, 5)) : "") ||
        (b.slotTime ? toAmPm(b.slotTime.substring(0, 5)) : "") ||
        (b.bookingTime ? toAmPm(b.bookingTime.substring(0, 5)) : "") ||
        "";
      const uid = b.userId || b.user?.id || b.clientId;
      const rawUserName =
        b.user?.name || b.user?.fullName || b.user?.username ||
        b.client?.name || b.userName || b.clientName || (uid && _userCache[uid]) || "";
      const userName = prettifyName(rawUserName) || (uid ? `User #${uid}` : `Booking #${b.id}`);
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
        amount: Number(b.amount || b.charges || b.fee || b.consultantCharges || 0),
        meetingMode: b.meetingMode || b.meeting_mode || b.mode || "",
      };
    });

    // ── Sort: latest date first, then latest booking ID as tiebreaker ────────
    mapped.sort((a, b) => {
      const dateCmp = (b.date || "").localeCompare(a.date || "");
      if (dateCmp !== 0) return dateCmp;
      return b.id - a.id;
    });
    return mapped;
  };

  const filtered = filter === "ALL" ? bookings : bookings.filter(b => b.status === filter);

  const counts = {
    ALL: totalElements,
    PENDING: bookings.filter(b => b.status === "PENDING").length,
    CONFIRMED: bookings.filter(b => b.status === "CONFIRMED").length,
    COMPLETED: bookings.filter(b => b.status === "COMPLETED").length,
    CANCELLED: bookings.filter(b => b.status === "CANCELLED").length,
  };

  const revenue = bookings.filter(b => b.status === "COMPLETED").reduce((s, b) => s + b.amount, 0);

  // ── Page-number list with smart ellipsis ─────────────────────────────────
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
      {/* ADDED: Action toast message */}
      {actionMsg && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: actionMsg.ok ? "#0F172A" : "#7F1D1D", color: "#fff",
          padding: "10px 22px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)", zIndex: 9999, whiteSpace: "nowrap",
        }}>
          {actionMsg.ok ? "✓" : "✕"} {actionMsg.text}
        </div>
      )}

      {/* ADDED: Edit Booking Modal (admin only) */}
      {isAdmin && editingBooking && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setEditingBooking(null); }}>
          <div style={{ background: "#fff", borderRadius: 18, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg, #1E3A5F, #2563EB)", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 10, color: "#93C5FD", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>Edit Booking</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#fff", marginTop: 4 }}>Booking #{editingBooking.id}</div>
              </div>
              <button onClick={() => setEditingBooking(null)} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 18 }}>×</button>
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
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  style={{ width: "100%", padding: "10px 13px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, background: "#fff", fontFamily: "inherit", outline: "none", cursor: "pointer" }}
                >
                  {["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                <button onClick={() => setEditingBooking(null)} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                <button
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: savingEdit ? "#93C5FD" : "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                >
                  {savingEdit ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 className="adm-page-title" style={{ margin: 0 }}>
          {isAdmin ? "All Bookings" : "My Bookings"}
        </h2>
        <button onClick={() => { setPageCache({}); loadPage(currentPage); }} style={{
          background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE",
          borderRadius: 8, padding: "6px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer",
        }}>↻ Refresh</button>
      </div>

      {/* ── Stats strip ── */}
      {!loading && bookings.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total", value: counts.ALL, color: "#2563EB", bg: "#EFF6FF" },
            { label: "Pending", value: counts.PENDING, color: "#D97706", bg: "#FFFBEB" },
            { label: "Confirmed", value: counts.CONFIRMED, color: "#2563EB", bg: "#EFF6FF" },
            { label: "Completed", value: counts.COMPLETED, color: "#16A34A", bg: "#F0FDF4" },
            { label: "Revenue", value: `₹${revenue.toLocaleString()}`, color: "#16A34A", bg: "#F0FDF4" },
          ].map(s => (
            <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.color}22`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Error banner ── */}
      {error && (
        <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", marginBottom: 16, color: "#B91C1C", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>⚠️ {error}</span>
          <button onClick={() => loadPage(currentPage)} style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      )}

      {/* ── Filter pills ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["ALL", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"] as const).map(f => (
          <button key={f} onClick={() => { setFilter(f); setCurrentPage(0); setPageCache({}); }} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: filter === f ? "#2563EB" : "#F1F5F9",
            color: filter === f ? "#fff" : "#64748B",
            border: filter === f ? "1px solid #2563EB" : "1px solid #E2E8F0",
          }}>
            {f} {f === "ALL" ? `(${counts.ALL})` : `(${counts[f]})`}
          </button>
        ))}
      </div>

      {/* ── Cards ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>
          <div style={{ width: 28, height: 28, border: "3px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />
          Loading bookings…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "48px 20px", background: "#F8FAFC", borderRadius: 14, color: "#94A3B8" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📅</div>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {totalElements === 0 ? "No bookings yet." : `No ${filter.toLowerCase()} bookings on this page.`}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((b, idx) => {
            const sc = getStatus(b.status);
            return (
              <div key={b.id} style={{
                background: "#fff",
                border: "1px solid #F1F5F9",
                borderLeft: `4px solid ${sc.border}`,
                borderRadius: 14,
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
                boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
              }}>
                {/* Avatar */}
                <div style={{
                  width: 46, height: 46, borderRadius: "50%", flexShrink: 0,
                  background: "linear-gradient(135deg,#2563EB,#1D4ED8)",
                  color: "#fff", fontWeight: 700, fontSize: 18,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {b.userInitial}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#0F172A", marginBottom: 4 }}>
                    {isAdmin ? b.user : `Session with ${b.advisor}`}
                  </div>
                  {isAdmin && (
                    <div style={{ fontSize: 12, color: "#2563EB", fontWeight: 600, marginBottom: 4 }}>
                      Consultant: {b.advisor}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: "#64748B", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {b.date && <span>📅 {b.date}</span>}
                    {b.time && (
                      <span style={{
                        background: "#EFF6FF", color: "#2563EB", fontWeight: 600,
                        padding: "2px 10px", borderRadius: 20, fontSize: 12,
                      }}>{b.time}</span>
                    )}
                    {b.meetingMode && (
                      <span>{b.meetingMode === "ONLINE" ? "💻 Online" : "🏢 Offline"}</span>
                    )}
                    {b.amount > 0 && (
                      <span style={{ color: "#16A34A", fontWeight: 600 }}>
                        ₹{b.amount.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status + global serial */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#CBD5E1" }}>#{currentPage * PAGE_SIZE + idx + 1}</span>
                  <span style={{
                    padding: "5px 14px", borderRadius: 20,
                    background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
                  }}>
                    {b.status}
                  </span>
                  {/* ADDED: Admin delete and edit buttons */}
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => openEditModal(b)}
                        style={{
                          padding: "4px 10px", borderRadius: 7,
                          border: "1px solid #BFDBFE", background: "#EFF6FF",
                          color: "#2563EB", fontSize: 11, fontWeight: 700,
                          cursor: "pointer", whiteSpace: "nowrap",
                        }}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={() => handleDeleteBooking(b.id)}
                        disabled={deletingId === b.id}
                        style={{
                          padding: "4px 10px", borderRadius: 7,
                          border: "1px solid #FECACA", background: "#FEF2F2",
                          color: "#DC2626", fontSize: 11, fontWeight: 700,
                          cursor: deletingId === b.id ? "not-allowed" : "pointer",
                          whiteSpace: "nowrap", opacity: deletingId === b.id ? 0.6 : 1,
                        }}
                      >
                        {deletingId === b.id ? "…" : "🗑 Delete"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pagination Bar ── */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 24, flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>
            Page {currentPage + 1} of {totalPages} &nbsp;·&nbsp; {totalElements} total bookings
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
              style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: currentPage === 0 ? "not-allowed" : "pointer", border: "1.5px solid #E2E8F0", background: currentPage === 0 ? "#F8FAFC" : "#fff", color: currentPage === 0 ? "#CBD5E1" : "#2563EB", transition: "all 0.15s" }}
            >← Prev</button>

            {pageNums().map((pg, i) =>
              pg === "…" ? (
                <span key={`ellipsis-${i}`} style={{ padding: "0 6px", color: "#94A3B8", fontSize: 14, userSelect: "none" }}>…</span>
              ) : (
                <button
                  key={pg}
                  onClick={() => goToPage(pg as number)}
                  style={{
                    width: 36, height: 36, borderRadius: 8, fontSize: 13,
                    fontWeight: pg === currentPage ? 800 : 600, cursor: "pointer",
                    border: pg === currentPage ? "2px solid #2563EB" : pageCache[pg as number] ? "1.5px solid #BFDBFE" : "1.5px solid #E2E8F0",
                    background: pg === currentPage ? "#2563EB" : pageCache[pg as number] ? "#EFF6FF" : "#fff",
                    color: pg === currentPage ? "#fff" : pageCache[pg as number] ? "#2563EB" : "#374151",
                    transition: "all 0.15s",
                  }}
                >{(pg as number) + 1}</button>
              )
            )}

            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage >= totalPages - 1}
              style={{ padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: currentPage >= totalPages - 1 ? "not-allowed" : "pointer", border: "1.5px solid #E2E8F0", background: currentPage >= totalPages - 1 ? "#F8FAFC" : "#fff", color: currentPage >= totalPages - 1 ? "#CBD5E1" : "#2563EB", transition: "all 0.15s" }}
            >Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}