import { BookingStatus } from "../types";

interface StatusBadgeProps {
  status: BookingStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  // Map the colors to the actual values defined in your types
  const colors: Record<BookingStatus, string> = {
    CONFIRMED: "#2563EB", // Blue
    COMPLETED: "#16A34A", // Green
    PENDING: "#DC2626",   // Red
  };

  return (
    <span style={{
      color: colors[status],
      fontWeight: 600,
      fontSize: 13,
      background: colors[status] + "18", // Adds 10% opacity (approx)
      padding: "4px 12px",
      borderRadius: 20,
      textTransform: 'capitalize' // Optional: Makes it look pretty
    }}>
      {status.toLowerCase()}
    </span>
  );
}