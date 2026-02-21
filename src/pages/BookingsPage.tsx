import { useEffect, useState } from "react";
import StatusBadge from "../components/StatusBadge";
import styles from "../styles/BookingsPage.module.css";
import { getAllBookings } from "../services/api";

interface Booking {
  id: number;
  userName: string;
  consultantName: string;
  time: string;
  status: string;
  amount: number;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchBookings = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getAllBookings();
      if (Array.isArray(data)) {
        const mapped = data.map((b: any) => ({
          id: b.id,
          userName: b.user?.name || b.userName || `User #${b.userId || b.id || "Unknown"}`,
          consultantName: b.consultant?.name || b.consultantName || b.advisorName || "Consultant",
          time: `${b.slotDate || b.bookingDate || "N/A"} • ${b.slotTime || b.bookingTime?.substring(0, 5) || "N/A"}`,
          status: b.status || b.bookingStatus || "PENDING",
          amount: Number(b.amount || b.charges || 0), // ✅ FIXED: Safely forces a number
        }));
        setBookings(mapped);
      } else {
        setBookings([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch bookings:", err);
      setError("Failed to load bookings from server. Please check your connection.");
      setBookings([]); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  if (loading) {
    return <div className={styles.loading}>Loading Bookings from Database...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.pageTitle}>All Bookings</h2>
        <button onClick={fetchBookings} className={styles.refreshBtn}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>
      
      {error && <div className={styles.errorAlert}>⚠ {error}</div>}

      <div className={styles.card}>
        <div className={styles.tableResponsive}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.tableHead}>
                <td className={styles.th}>USER</td>
                <td className={styles.th}>CONSULTANT</td>
                <td className={styles.th}>TIME</td>
                <td className={styles.th}>STATUS</td>
                <td className={styles.th}>AMOUNT</td>
              </tr>
            </thead>
            <tbody>
              {bookings.length > 0 ? (
                bookings.map((b) => (
                  <tr key={b.id} className={styles.tableRow}>
                    <td className={styles.tdUser}>{b.userName}</td>
                    <td className={styles.tdAdvisor}>{b.consultantName}</td>
                    <td className={styles.tdTime}>{b.time}</td>
                    <td><StatusBadge status={b.status} /></td>
                    {/* ✅ Safe toLocaleString call */}
                    <td className={styles.tdAmount}>₹{b.amount.toLocaleString()}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className={styles.emptyState}>
                    No bookings found in the database.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}