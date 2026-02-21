import { useEffect, useState } from "react";
import { deleteBooking, getAllBookings, updateBooking } from "../services/api";
import styles from "../styles/BookingsPage.module.css";

interface Booking {
  id: number;
  user: string;
  advisor: string;
  time: string;
  status: string;
  amount: number;
  rawStatus: string;
}

const STATUS_OPTIONS = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED"];

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [filtered, setFiltered] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const mapBooking = (b: any): Booking => ({
    id: b.id,
    user:
      b.user?.name ||
      b.userName ||
      b.clientName ||
      `User #${b.userId || b.id || "?"}`,
    advisor:
      b.consultant?.name ||
      b.consultantName ||
      b.advisorName ||
      "Consultant",
    time: [
      b.slotDate || b.bookingDate || b.date || "—",
      b.slotTime
        ? b.slotTime.substring(0, 5)
        : b.bookingTime
        ? b.bookingTime.substring(0, 5)
        : null,
    ]
      .filter(Boolean)
      .join(" • "),
    status: b.status || b.bookingStatus || "PENDING",
    rawStatus: b.status || b.bookingStatus || "PENDING",
    amount: Number(b.amount || b.charges || b.fee || 0),
  });

  const fetchBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllBookings();
      const mapped = Array.isArray(data) ? data.map(mapBooking) : [];
      setBookings(mapped);
      setFiltered(applyFilters(mapped, search, statusFilter));
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(
        err?.message ||
          "Failed to fetch bookings. Is the backend running?"
      );
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = (
    data: Booking[],
    q: string,
    status: string
  ): Booking[] => {
    return data.filter((b) => {
      const matchSearch =
        !q ||
        b.user.toLowerCase().includes(q.toLowerCase()) ||
        b.advisor.toLowerCase().includes(q.toLowerCase()) ||
        String(b.id).includes(q);
      const matchStatus =
        status === "ALL" || b.rawStatus === status;
      return matchSearch && matchStatus;
    });
  };

  useEffect(() => {
    fetchBookings();
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    setFiltered(applyFilters(bookings, search, statusFilter));
  }, [search, statusFilter, bookings]);

  const handleStatusChange = async (id: number, newStatus: string) => {
    setUpdatingId(id);
    try {
      await updateBooking(id, { status: newStatus });
      setBookings((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, status: newStatus, rawStatus: newStatus } : b
        )
      );
    } catch {
      alert("Failed to update booking status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this booking?")) return;
    setDeletingId(id);
    try {
      await deleteBooking(id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
    } catch {
      alert("Failed to delete booking.");
    } finally {
      setDeletingId(null);
    }
  };

  const totalRevenue = bookings
    .filter((b) => b.rawStatus === "COMPLETED")
    .reduce((sum, b) => sum + b.amount, 0);

  const countByStatus = (s: string) =>
    bookings.filter((b) => b.rawStatus === s).length;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>All Bookings</h2>
          <p className={styles.subtitle}>
            Last refreshed:{" "}
            {lastRefreshed.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={fetchBookings}
          disabled={loading}
        >
          <svg
            width="15"
            height="15"
            fill="none"
            viewBox="0 0 24 24"
            style={{ marginRight: 6 }}
          >
            <path
              d="M1 4v6h6M23 20v-6h-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4-4.64 4.36A9 9 0 013.51 15"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        {[
          {
            label: "Total Bookings",
            value: bookings.length,
            color: "#2563EB",
            bg: "#EFF6FF",
          },
          {
            label: "Confirmed",
            value: countByStatus("CONFIRMED"),
            color: "#059669",
            bg: "#ECFDF5",
          },
          {
            label: "Pending",
            value: countByStatus("PENDING"),
            color: "#D97706",
            bg: "#FFFBEB",
          },
          {
            label: "Revenue (Completed)",
            value: `₹${totalRevenue.toLocaleString()}`,
            color: "#7C3AED",
            bg: "#F5F3FF",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={styles.summaryCard}
            style={{ borderTop: `3px solid ${s.color}` }}
          >
            <div
              className={styles.summaryValue}
              style={{ color: s.color }}
            >
              {s.value}
            </div>
            <div className={styles.summaryLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrap}>
          <svg
            width="14"
            height="14"
            fill="none"
            viewBox="0 0 24 24"
            className={styles.searchIcon}
          >
            <circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2" />
            <path
              d="m21 21-4.35-4.35"
              stroke="#94A3B8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search by user, consultant, or ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className={styles.statusFilters}>
          {["ALL", ...STATUS_OPTIONS].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`${styles.filterChip} ${
                statusFilter === s ? styles.filterChipActive : ""
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className={styles.errorBox}>
          ⚠️ {error}
          <button className={styles.retryBtn} onClick={fetchBookings}>
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className={styles.card}>
        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span>Fetching bookings from database…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <svg
              width="48"
              height="48"
              fill="none"
              viewBox="0 0 24 24"
              style={{ margin: "0 auto 12px", display: "block" }}
            >
              <rect
                x="3"
                y="4"
                width="18"
                height="18"
                rx="2"
                stroke="#CBD5E1"
                strokeWidth="1.5"
              />
              <path
                d="M16 2v4M8 2v4M3 10h18"
                stroke="#CBD5E1"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <p style={{ color: "#94A3B8", margin: 0 }}>
              {bookings.length === 0
                ? "No bookings found in the database."
                : "No bookings match your filters."}
            </p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.thead}>
                  <th className={styles.th}>#ID</th>
                  <th className={styles.th}>USER</th>
                  <th className={styles.th}>CONSULTANT</th>
                  <th className={styles.th}>TIME</th>
                  <th className={styles.th}>STATUS</th>
                  <th className={styles.th}>AMOUNT</th>
                  <th className={styles.th}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className={styles.tr}>
                    <td className={styles.td} style={{ color: "#94A3B8", fontSize: 12 }}>
                      #{b.id}
                    </td>
                    <td className={styles.td}>
                      <div className={styles.userCell}>
                        <div className={styles.userAvatar}>
                          {b.user.charAt(0).toUpperCase()}
                        </div>
                        <span>{b.user}</span>
                      </div>
                    </td>
                    <td className={styles.td}>{b.advisor}</td>
                    <td className={styles.td} style={{ fontSize: 13, color: "#64748B" }}>
                      {b.time}
                    </td>
                    <td className={styles.td}>
                      <select
                        className={styles.statusSelect}
                        value={b.rawStatus}
                        disabled={updatingId === b.id}
                        onChange={(e) =>
                          handleStatusChange(b.id, e.target.value)
                        }
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={styles.td}>
                      <span className={styles.amount}>
                        ₹{b.amount.toLocaleString()}
                      </span>
                    </td>
                    <td className={styles.td}>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDelete(b.id)}
                        disabled={deletingId === b.id}
                        title="Delete booking"
                      >
                        {deletingId === b.id ? "…" : (
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className={styles.tableFooter}>
            Showing {filtered.length} of {bookings.length} bookings
          </div>
        )}
      </div>
    </div>
  );
}
