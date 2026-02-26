import { useEffect, useState } from "react";
import {
  getAllBookings,
  getBookingsByConsultant,
  getConsultantId,
  getToken,
} from "../services/api";
import styles from "../styles/AdminPage.module.css";

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
    b.user?.name       || b.user?.fullName    || b.user?.username   ||
    b.client?.name     || b.bookedBy?.name    || b.customer?.name   ||
    b.userName         || b.clientName        || b.userFullName      ||
    b.bookedByName     || b.user?.email       || b.userEmail        ||
    (b.userId   ? `User #${b.userId}`   : null) ||
    (b.clientId ? `User #${b.clientId}` : null) ||
    `Booking #${b.id}`;
  return prettifyName(raw);
};

const extractAdvisorName = (b: any): string =>
  b.consultant?.name    || b.consultant?.fullName ||
  b.advisor?.name       || b.consultantName       ||
  b.advisorName         || b.providerName         ||
  (b.consultantId ? `Consultant #${b.consultantId}` : null) ||
  "Consultant";

const extractDate = (b: any): string =>
  b.slotDate || b.bookingDate || b.booking_date || b.date ||
  b.sessionDate || b.appointmentDate ||
  b.timeSlot?.slotDate || b.slot?.slotDate || "";

const extractTime = (b: any): string => {
  if (b.timeSlot?.masterTimeSlot?.timeRange) return b.timeSlot.masterTimeSlot.timeRange;
  if (b.masterTimeSlot?.timeRange)           return b.masterTimeSlot.timeRange;
  if (b.timeRange)                           return b.timeRange;
  const t = b.slotTime || b.bookingTime || b.sessionTime || b.appointmentTime ||
    b.timeSlot?.slotTime || b.slot?.slotTime || "";
  return t ? toAmPm(t.substring(0, 5)) : "";
};

const mapBooking = (b: any): Booking => {
  const user = extractUserName(b);
  return {
    id:          b.id,
    user,
    userInitial: user.charAt(0).toUpperCase(),
    advisor:     extractAdvisorName(b),
    date:        extractDate(b),
    time:        extractTime(b),
    status:      (b.status || b.bookingStatus || b.BookingStatus || "PENDING").toUpperCase(),
    amount:      Number(b.amount || b.charges || b.fee || b.consultantCharges || 0),
    meetingMode: b.meetingMode || b.meeting_mode || b.mode || "",
  };
};

const STATUS_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  CONFIRMED:  { bg: "#EFF6FF", color: "#2563EB", border: "#93C5FD" },
  PENDING:    { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D" },
  COMPLETED:  { bg: "#F0FDF4", color: "#16A34A", border: "#86EFAC" },
  CANCELLED:  { bg: "#FEF2F2", color: "#EF4444", border: "#FCA5A5" },
  DEFAULT:    { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" },
};
const getStatus = (s: string) => STATUS_STYLES[s] || STATUS_STYLES.DEFAULT;

// ─────────────────────────────────────────────────────────────────────────────
export default function BookingsPage({ isAdmin = false }: Props) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [filter,   setFilter]   = useState<"ALL"|"PENDING"|"CONFIRMED"|"COMPLETED"|"CANCELLED">("ALL");

  useEffect(() => { fetchBookings(); }, [isAdmin]);

  const fetchBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      let raw: any[] = [];

      if (isAdmin) {
        raw = await getAllBookings();
      } else {
        const consultantId = getConsultantId();
        if (!consultantId) {
          setError("Consultant ID not found. Please log in again.");
          setLoading(false);
          return;
        }
        const data = await getBookingsByConsultant(Number(consultantId));
        raw = Array.isArray(data) ? data : data?.content ?? [];
      }

      if (raw.length > 0) console.log("📋 Booking sample:", JSON.stringify(raw[0], null, 2));

      let mapped = raw.map(mapBooking);

      // ── Enrich missing user names via /api/users/{id} ────────────────────
      if (isAdmin) {
        const needsEnrichment = raw.filter((b: any) => {
          const hasName = b.user?.name || b.user?.fullName || b.user?.username ||
                          b.userName  || b.clientName;
          const uid = b.userId || b.user?.id || b.clientId;
          return !hasName && uid;
        });

        if (needsEnrichment.length > 0) {
          const token = getToken();
          const ids = [...new Set(needsEnrichment.map((b: any) =>
            b.userId || b.user?.id || b.clientId
          ))] as number[];

          const userMap: Record<number, string> = {};
          await Promise.all(ids.map(async (uid) => {
            try {
              const res = await fetch(`/api/users/${uid}`, {
                headers: {
                  Accept: "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
              });
              if (res.ok) {
                const u = await res.json();
                const name = u.name || u.fullName || u.email || u.username || u.identifier || "";
                userMap[uid] = prettifyName(name);
              }
            } catch { /* skip */ }
          }));

          mapped = raw.map((b: any) => {
            const uid = b.userId || b.user?.id || b.clientId;
            const enrichedName = uid && userMap[uid] ? userMap[uid] : null;
            const base = mapBooking(b);
            return enrichedName
              ? { ...base, user: enrichedName, userInitial: enrichedName.charAt(0).toUpperCase() }
              : base;
          });
        }
      }

      mapped.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setBookings(mapped);
    } catch (err: any) {
      console.error("BookingsPage error:", err);
      setError(err.message || "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === "ALL" ? bookings : bookings.filter(b => b.status === filter);

  const counts = {
    ALL:       bookings.length,
    PENDING:   bookings.filter(b => b.status === "PENDING").length,
    CONFIRMED: bookings.filter(b => b.status === "CONFIRMED").length,
    COMPLETED: bookings.filter(b => b.status === "COMPLETED").length,
    CANCELLED: bookings.filter(b => b.status === "CANCELLED").length,
  };

  const revenue = bookings
    .filter(b => b.status === "COMPLETED")
    .reduce((s, b) => s + b.amount, 0);

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <h2 className={styles.pageTitle} style={{ margin: 0 }}>
          {isAdmin ? "All Bookings" : "My Bookings"}
        </h2>
        <button onClick={fetchBookings} style={{
          background: "#EFF6FF", color: "#2563EB", border: "1px solid #BFDBFE",
          borderRadius: 8, padding: "6px 14px", fontWeight: 600, fontSize: 13, cursor: "pointer",
        }}>↻ Refresh</button>
      </div>

      {/* ── Stats strip ── */}
      {!loading && bookings.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 12, marginBottom: 20 }}>
          {[
            { label: "Total",     value: counts.ALL,                          color: "#2563EB", bg: "#EFF6FF" },
            { label: "Pending",   value: counts.PENDING,                      color: "#D97706", bg: "#FFFBEB" },
            { label: "Confirmed", value: counts.CONFIRMED,                    color: "#2563EB", bg: "#EFF6FF" },
            { label: "Completed", value: counts.COMPLETED,                    color: "#16A34A", bg: "#F0FDF4" },
            { label: "Revenue",   value: `₹${revenue.toLocaleString()}`,      color: "#16A34A", bg: "#F0FDF4" },
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
          <button onClick={fetchBookings} style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      )}

      {/* ── Filter pills ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {(["ALL","PENDING","CONFIRMED","COMPLETED","CANCELLED"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: filter === f ? "#2563EB" : "#F1F5F9",
            color:      filter === f ? "#fff"    : "#64748B",
            border:     filter === f ? "1px solid #2563EB" : "1px solid #E2E8F0",
          }}>
            {f} ({counts[f]})
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
            {bookings.length === 0 ? "No bookings yet." : `No ${filter.toLowerCase()} bookings.`}
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
                    {isAdmin ? `${b.user}` : `Session with ${b.advisor}`}
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

                {/* Status + serial */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: "#CBD5E1" }}>#{idx + 1}</span>
                  <span style={{
                    padding: "5px 14px", borderRadius: 20,
                    background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                    fontSize: 12, fontWeight: 700, letterSpacing: "0.04em",
                  }}>
                    {b.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}