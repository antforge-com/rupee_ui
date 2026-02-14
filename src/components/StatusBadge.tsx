import { BookingStatus } from "/workspaces/finco1/finadvise-ts/src/types";

interface StatusBadgeProps {
  status: BookingStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const colors: Record<BookingStatus, string> = {
    Upcoming: "#2563EB",
    Completed: "#16A34A",
    Pending: "#DC2626",
  };

  return (
    <span style={{
      color: colors[status],
      fontWeight: 600,
      fontSize: 13,
      background: colors[status] + "18",
      padding: "3px 10px",
      borderRadius: 20,
    }}>
      {status}
    </span>
  );
}
