import { BarChart3, Calendar } from "lucide-react";
import React, { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface SummaryTicket {
  id: number;
  createdAt: string;
  category: string;
  status: string;
  agentName?: string;
  consultantId?: number | null;
  consultantName?: string;
  priority?: string;
}

type ViewMode = "daily" | "weekly";
type GroupBy = "category" | "consultant" | "status" | "priority";

interface Props {
  tickets: SummaryTicket[];
  consultantNameMap?: Record<number, string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// COLOR PALETTE  (same brand colors)
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = [
  "#0F766E", "#7C3AED", "#059669", "#D97706",
  "#DC2626", "#0891B2", "#DB2777", "#65A30D",
  "#EA580C", "#6366F1",
];

// ─────────────────────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const formatDay = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const formatWeek = (start: Date, end: Date) =>
  `${formatDay(start)} – ${formatDay(end)}`;

const startOfDay = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const TicketSummaryChart: React.FC<Props> = ({ tickets, consultantNameMap = {} }) => {
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const [groupBy, setGroupBy] = useState<GroupBy>("category");

  // ── Derive unique groups ──────────────────────────────────────────────────
  const groups = useMemo(() => {
    const set = new Set<string>();
    tickets.forEach(t => {
      const val = getGroup(t, groupBy, consultantNameMap);
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [tickets, groupBy, consultantNameMap]);

  // ── Build chart data ──────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (viewMode === "daily") {
      const periods: { label: string; start: Date; end: Date }[] = [];
      for (let i = 6; i >= 0; i--) {
        const start = startOfDay(new Date());
        start.setDate(start.getDate() - i);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        periods.push({ label: formatDay(start), start, end });
      }
      return buildData(periods, tickets, groups, groupBy, consultantNameMap);
    } else {
      const periods: { label: string; start: Date; end: Date }[] = [];
      for (let i = 7; i >= 0; i--) {
        const end = startOfDay(new Date());
        end.setDate(end.getDate() - i * 7);
        end.setHours(23, 59, 59, 999);
        const start = new Date(end);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        periods.push({ label: formatWeek(start, end), start, end });
      }
      return buildData(periods, tickets, groups, groupBy, consultantNameMap);
    }
  }, [viewMode, groupBy, tickets, groups, consultantNameMap]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalInPeriod = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (viewMode === "daily" ? 7 : 56));
    return tickets.filter(t => new Date(t.createdAt) >= cutoff).length;
  }, [tickets, viewMode]);

  const topGroup = useMemo(() => {
    const counts: Record<string, number> = {};
    tickets.forEach(t => {
      const g = getGroup(t, groupBy, consultantNameMap);
      counts[g] = (counts[g] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  }, [tickets, groupBy, consultantNameMap]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      background: "#fff",
      borderRadius: 20,
      border: "1px solid #E2E8F0",
      padding: "24px",
      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
    }}>
      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        flexWrap: "wrap", gap: 16, marginBottom: 20,
      }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <BarChart3 size={18} />
            <span>Ticket Summary</span>
          </h3>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748B" }}>
            {viewMode === "daily" ? "Last 7 days" : "Last 8 weeks"} · grouped by{" "}
            <strong style={{ color: "#0F766E", textTransform: "capitalize" }}>{groupBy}</strong>
          </p>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {/* View mode toggle */}
          <div style={{
            display: "flex", border: "1.5px solid #E2E8F0", borderRadius: 10,
            overflow: "hidden", background: "#F8FAFC",
          }}>
            {(["daily", "weekly"] as ViewMode[]).map(v => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                style={{
                  padding: "7px 16px", border: "none", cursor: "pointer",
                  background: viewMode === v
                    ? "var(--portal-profile-gradient)" : "transparent",
                  color: viewMode === v ? "#fff" : "#64748B",
                  fontSize: 12, fontWeight: 700,
                  textTransform: "capitalize", transition: "all 0.15s",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Calendar size={13} />
                  <span>{v === "daily" ? "Daily" : "Weekly"}</span>
                </span>
              </button>
            ))}
          </div>

          {/* Group-by select */}
          <select
            value={groupBy}
            onChange={e => setGroupBy(e.target.value as GroupBy)}
            style={{
              padding: "7px 32px 7px 12px",
              border: "1.5px solid #E2E8F0", borderRadius: 10,
              fontSize: 12, fontWeight: 600, color: "#374151",
              background: "#fff", cursor: "pointer", outline: "none",
              fontFamily: "inherit",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%2394A3B8' stroke-width='2' stroke-linecap='round' d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 8px center",
              backgroundSize: "16px",
              appearance: "none",
            }}
          >
            <option value="category">👁 By Category</option>
            <option value="consultant">👤 By Consultant</option>
            <option value="status">🔄 By Status</option>
            <option value="priority">⚑ By Priority</option>
          </select>
        </div>
      </div>

      {/* ── Quick stats row ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
        gap: 12, marginBottom: 24,
      }}>
        {[
          {
            label: viewMode === "daily" ? "Last 7 Days" : "Last 8 Weeks",
            value: totalInPeriod,
            color: "#0F766E", bg: "#ECFEFF",
          },
          {
            label: `Top ${groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}`,
            value: topGroup ? topGroup[0] : "—",
            color: "#7C3AED", bg: "#F5F3FF",
            small: true,
          },
          {
            label: "Top Count",
            value: topGroup ? topGroup[1] : 0,
            color: "#059669", bg: "#F0FDF4",
          },
          {
            label: "Total Tickets",
            value: tickets.length,
            color: "#D97706", bg: "#FFFBEB",
          },
        ].map((s, i) => (
          <div key={i} style={{
            background: s.bg,
            border: `1px solid ${s.color}22`,
            borderRadius: 12, padding: "12px 16px",
          }}>
            <div style={{
              fontSize: s.small ? 13 : 22,
              fontWeight: 800, color: s.color,
              overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {s.value}
            </div>
            <div style={{
              fontSize: 10, fontWeight: 700, color: "#64748B",
              textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2,
            }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {/* ── Bar Chart ── */}
      {tickets.length === 0 ? (
        <div style={{
          height: 260, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#F8FAFC", borderRadius: 14, color: "#94A3B8",
        }}>
          <div style={{ marginBottom: 12, display: "flex", justifyContent: "center" }}>
            <BarChart3 size={36} />
          </div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
            No ticket data to display
          </p>
        </div>
      ) : (
        <div style={{ width: "100%", overflowX: "auto" }}>
          <div style={{ minWidth: 480 }}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={chartData}
                margin={{ top: 4, right: 20, left: 0, bottom: 0 }}
                barCategoryGap="25%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0F172A", border: "none",
                    borderRadius: 10, color: "#F8FAFC",
                    fontSize: 12, padding: "10px 14px",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                  }}
                  labelStyle={{ fontWeight: 700, marginBottom: 6, color: "#A5F3FC" }}
                  cursor={{ fill: "rgba(15,118,110,0.06)" }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 16, fontSize: 12, fontWeight: 600 }}
                />
                {groups.slice(0, 10).map((group, i) => (
                  <Bar
                    key={group}
                    dataKey={group}
                    name={group}
                    fill={COLORS[i % COLORS.length]}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ── Group breakdown table ── */}
      {groups.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: "#64748B",
            textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12,
          }}>
            Breakdown by {groupBy}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {groups.map((g, i) => {
              const count = tickets.filter(
                t => getGroup(t, groupBy, consultantNameMap) === g
              ).length;
              return (
                <div key={g} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 14px", borderRadius: 20,
                  background: `${COLORS[i % COLORS.length]}12`,
                  border: `1.5px solid ${COLORS[i % COLORS.length]}40`,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: COLORS[i % COLORS.length], flexShrink: 0,
                  }} />
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: COLORS[i % COLORS.length],
                  }}>{g}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 800,
                    color: COLORS[i % COLORS.length],
                    background: `${COLORS[i % COLORS.length]}20`,
                    padding: "1px 7px", borderRadius: 10,
                  }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function getGroup(
  t: SummaryTicket,
  groupBy: GroupBy,
  nameMap: Record<number, string>
): string {
  switch (groupBy) {
    case "category": return t.category || "Uncategorized";
    case "status": return t.status || "Unknown";
    case "priority": return t.priority || "LOW";
    case "consultant":
      return (
        t.consultantName ||
        (t.agentName) ||
        (t.consultantId ? nameMap[t.consultantId] || "Consultant" : null) ||
        "Unassigned"
      );
    default: return "Other";
  }
}

function buildData(
  periods: { label: string; start: Date; end: Date }[],
  tickets: SummaryTicket[],
  groups: string[],
  groupBy: GroupBy,
  nameMap: Record<number, string>
) {
  return periods.map(period => {
    const row: Record<string, any> = { label: period.label };
    groups.forEach(g => { row[g] = 0; });

    tickets.forEach(t => {
      const created = new Date(t.createdAt);
      if (created >= period.start && created <= period.end) {
        const g = getGroup(t, groupBy, nameMap);
        row[g] = (row[g] || 0) + 1;
      }
    });

    return row;
  });
}

export default TicketSummaryChart;
