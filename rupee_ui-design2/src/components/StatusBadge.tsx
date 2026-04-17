
interface StatusBadgeProps {
  status: string; // Using string to allow backend values like 'AVAILABLE'
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const normalized = (status || "PENDING").toString().toUpperCase();

  const colors: Record<string, string> = {
    CONFIRMED: "#0F766E",
    SCHEDULED: "#0F766E",
    COMPLETED: "#16A34A",
    PENDING: "#DC2626",
    CANCELLED: "#DC2626",
    AVAILABLE: "#16A34A",
  };

  const badgeColor = colors[normalized] || "#64748B";

  return (
    <span style={{
      color: badgeColor,
      fontWeight: 600,
      fontSize: 12,
      background: badgeColor + "18", // 10% opacity
      padding: "4px 12px",
      borderRadius: 20,
      textTransform: 'uppercase',
      display: 'inline-block',
      textAlign: 'center',
      minWidth: '85px'
    }}>
      {normalized.toLowerCase()}
    </span>
  );
}
