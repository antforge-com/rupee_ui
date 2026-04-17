/**
 * AnalyticsDashboard.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Module 7 — Analytics & Reports
 *
 * Contains 5 sub-modules:
 *   1. Tickets Created/Resolved per Day/Week/Month
 *   2. Agent Performance Reports
 *   3. Customer Satisfaction Ratings
 *   4. Average Response & Resolution Time
 *   5. SLA Breach Reports
 *
 * Props:
 *   tickets          — all tickets (fetched by parent)
 *   consultants      — all consultants/advisors
 *   feedbacks        — customer satisfaction feedbacks (optional, fetched internally if missing)
 *   mode             — "admin" | "consultant"
 *   consultantId     — required when mode="consultant"
 *   consultantName   — display name for consultant mode
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { AlertTriangle, BarChart3, CheckCircle, Star } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { API_BASE_URL } from "../config/api";
import { formatIndianCurrency } from "../utils/formUtils";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface AnalyticsTicket {
  id: number;
  title?: string;
  category?: string;
  status: string;
  priority?: string;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  closedAt?: string | null;
  firstResponseAt?: string | null;
  consultantId?: number | null;
  consultantName?: string;
  agentName?: string;
  userId?: number;
  userName?: string;
  feedbackRating?: number;
  feedbackText?: string;
  slaBreached?: boolean;
}

export interface AnalyticsConsultant {
  id: number;
  name: string;
  designation?: string;
  rating?: number;
  skills?: string[];
}

export interface AnalyticsFeedback {
  id?: number;
  bookingId?: number;
  consultantId?: number;
  userId?: number;
  rating: number;
  comments?: string;
  createdAt?: string;
}

interface Props {
  tickets: AnalyticsTicket[];
  consultants?: AnalyticsConsultant[];
  bookings?: any[];
  feedbacks?: AnalyticsFeedback[];
  mode?: "admin" | "consultant";
  consultantId?: number;
  consultantName?: string;
  overviewData?: any;
  chartsData?: any;
  recentTransactions?: any[];
  upcomingAppointments?: any[];
  recentFeedbacks?: any[];
  analyticsLoading?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const COLORS = ["#0F766E", "#7C3AED", "#059669", "#D97706", "#DC2626", "#0891B2", "#DB2777", "#65A30D", "#EA580C", "#6366F1"];
const SLA_HOURS = 2; // SLA window in hours

const STATUS_COLOR: Record<string, string> = {
  NEW: "#6366F1", OPEN: "#0F766E", PENDING: "#D97706",
  RESOLVED: "#059669", CLOSED: "#64748B",
};
const PRIORITY_COLOR: Record<string, string> = {
  LOW: "#64748B", MEDIUM: "#D97706", HIGH: "#DC2626", CRITICAL: "#7C3AED",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const apiFetch = async (endpoint: string) => {
  const BASE = API_BASE_URL;
  const token = localStorage.getItem("fin_token");
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : { message: await res.text() };
  if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
  return data;
};

const extractArr = (data: any): any[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.content)) return data.content;
  if (Array.isArray(data.data)) return data.data;
  return [];
};

const dayLabel = (d: Date) => d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
const weekLabel = (s: Date, e: Date) => `${dayLabel(s)}–${dayLabel(e)}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };

const hoursElapsed = (from?: string, to?: string): number => {
  if (!from) return 0;
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  return (end - start) / 3_600_000;
};

const avgOrZero = (arr: number[]) =>
  arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

const fmtHours = (h: number) => {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
};

const formatDisplayName = (value: any): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) {
    const local = raw.split("@")[0].trim();
    if (local) {
      return local.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
    }
  }
  return raw.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
};

const isPlaceholderDisplayName = (value: string): boolean =>
  /^(agent|consultant|user|client|booking)\s*#?\s*\d+$/i.test(String(value || "").trim());

const getByPath = (source: any, path: string) =>
  path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), source);

const readFirstPresent = (source: any, paths: string[]) => {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    return value;
  }
  return undefined;
};

const readFirstNumber = (source: any, paths: string[]) => {
  for (const path of paths) {
    const value = getByPath(source, path);
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }
  return 0;
};

const splitBookingDateTime = (value: any) => {
  const raw = String(value ?? "").trim();
  if (!raw) return { date: "", time: "" };
  if (raw.includes(" • ")) {
    const [date, time] = raw.split(" • ");
    return { date: date?.trim() || "", time: time?.trim() || "" };
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const [date, time] = raw.split("T");
    return { date: date?.trim() || "", time: time?.replace("Z", "").trim().slice(0, 5) || "" };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { date: raw, time: "" };
  }
  return { date: "", time: raw };
};

const getBookingStatus = (booking: any) =>
  String(readFirstPresent(booking, ["status", "bookingStatus", "BookingStatus", "specialBookingStatus"]) ?? "")
    .trim()
    .toUpperCase();

const getBookingAmount = (booking: any) =>
  readFirstNumber(booking, [
    "totalAmount",
    "total_amount",
    "charges",
    "fee",
    "consultantCharges",
    "sessionAmount",
    "baseAmount",
    "originalAmount",
    "amount",
    "price",
    "cost",
    "payment.amount",
    "payment.totalAmount",
    "booking.amount",
    "booking.totalAmount",
  ]);

const getBookingMeetingMode = (booking: any) =>
  String(readFirstPresent(booking, [
    "meetingMode",
    "requestedMeetingMode",
    "specialBooking.meetingMode",
    "specialBooking.requestedMeetingMode",
  ]) ?? "").trim().toUpperCase();

const getBookingUserName = (booking: any) => {
  const resolved = readFirstPresent(booking, [
    "user.name",
    "user.fullName",
    "client.name",
    "client.fullName",
    "userName",
    "clientName",
    "user.username",
    "user.email",
    "email",
  ]);
  const formatted = formatDisplayName(resolved);
  return isPlaceholderDisplayName(formatted) ? "" : formatted;
};

const getBookingConsultantName = (booking: any, fallbackName = "") => {
  const resolved = readFirstPresent(booking, [
    "consultantName",
    "advisor",
    "agentName",
    "consultant.name",
    "consultant.fullName",
    "advisorName",
  ]) ?? fallbackName;
  const formatted = formatDisplayName(resolved);
  return isPlaceholderDisplayName(formatted) ? fallbackName : formatted;
};

const getBookingDateParts = (booking: any) => {
  const explicitDate = String(readFirstPresent(booking, [
    "date",
    "slotDate",
    "bookingDate",
    "scheduledDate",
    "scheduled_date",
    "preferredDate",
    "preferred_date",
    "appointmentDate",
    "timeSlot.slotDate",
    "slot.slotDate",
  ]) ?? "").trim();

  const explicitTime = String(readFirstPresent(booking, [
    "timeRange",
    "scheduledTimeRange",
    "preferredTimeRange",
    "slotTime",
    "scheduledTime",
    "scheduled_time",
    "preferredTime",
    "preferred_time",
    "timeSlot.timeRange",
    "slot.timeRange",
  ]) ?? "").trim();

  const composite = splitBookingDateTime(
    readFirstPresent(booking, [
      "time",
      "createdAt",
      "created_at",
      "updatedAt",
      "scheduledAt",
    ]),
  );

  return {
    date: explicitDate || composite.date,
    time: explicitTime || composite.time,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ── Stat Card ────────────────────────────────────────────────────────────────
const StatCard: React.FC<{ label: string; value: React.ReactNode; color: string; bg: string; sub?: string; icon?: React.ReactNode }> =
  ({ label, value, color, bg, sub, icon }) => (
    <div style={{
      background: bg, border: `1.5px solid ${color}22`, borderRadius: 16,
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: 0,
      minHeight: 130,
    }}>
      {/* Icon row — always same height so numbers line up across cards */}
      <div style={{
        width: 36, height: 36, borderRadius: 10, marginBottom: 12, flexShrink: 0,
        background: icon ? `${color}18` : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {icon || null}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 600, marginBottom: 2 }}>{sub}</div>}
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: "auto", paddingTop: 6 }}>{label}</div>
    </div>
  );

// ── Section Header ────────────────────────────────────────────────────────────
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; subtitle: string }> =
  ({ icon, title, subtitle }) => (
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 10, background: "#ECFEFF" }}>{icon}</span>
        {title}
      </h3>
      <p style={{ margin: "6px 0 0 44px", fontSize: 12, color: "#64748B" }}>{subtitle}</p>
    </div>
  );

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 1 — Tickets Created / Resolved per Day / Week / Month
// ─────────────────────────────────────────────────────────────────────────────
const TicketVolumeModule: React.FC<{ tickets: AnalyticsTicket[] }> = ({ tickets }) => {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  const chartData = useMemo(() => {
    const now = new Date();

    if (period === "daily") {
      return Array.from({ length: 14 }, (_, i) => {
        const d = startOfDay(new Date(now));
        d.setDate(d.getDate() - (13 - i));
        const e = new Date(d); e.setHours(23, 59, 59, 999);
        const created = tickets.filter(t => { const c = new Date(t.createdAt); return c >= d && c <= e; }).length;
        const resolved = tickets.filter(t => {
          const rt = t.resolvedAt || (t.status === "RESOLVED" || t.status === "CLOSED" ? t.updatedAt : undefined);
          if (!rt) return false;
          const r = new Date(rt); return r >= d && r <= e;
        }).length;
        return { label: dayLabel(d), created, resolved };
      });
    }

    if (period === "weekly") {
      return Array.from({ length: 8 }, (_, i) => {
        const end = startOfDay(new Date(now));
        end.setDate(end.getDate() - i * 7);
        end.setHours(23, 59, 59, 999);
        const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
        const created = tickets.filter(t => { const c = new Date(t.createdAt); return c >= start && c <= end; }).length;
        const resolved = tickets.filter(t => {
          const rt = t.resolvedAt || (["RESOLVED", "CLOSED"].includes(t.status) ? t.updatedAt : undefined);
          if (!rt) return false;
          const r = new Date(rt); return r >= start && r <= end;
        }).length;
        return { label: weekLabel(start, end), created, resolved };
      }).reverse();
    }

    // monthly
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
      const created = tickets.filter(t => { const c = new Date(t.createdAt); return c >= d && c <= e; }).length;
      const resolved = tickets.filter(t => {
        const rt = t.resolvedAt || (["RESOLVED", "CLOSED"].includes(t.status) ? t.updatedAt : undefined);
        if (!rt) return false;
        const r = new Date(rt); return r >= d && r <= e;
      }).length;
      return { label: monthLabel(d), created, resolved };
    });
  }, [tickets, period]);

  const totalCreated = tickets.length;
  const totalResolved = tickets.filter(t => ["RESOLVED", "CLOSED"].includes(t.status)).length;
  const totalOpen = tickets.filter(t => ["NEW", "OPEN", "PENDING"].includes(t.status)).length;
  const resolutionRate = totalCreated > 0 ? Math.round((totalResolved / totalCreated) * 100) : 0;

  return (
    <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E2E8F0", padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <SectionHeader icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>} title="Ticket Volume" subtitle="Track created vs resolved tickets over time" />
        <div style={{ display: "flex", gap: 8 }}>
          {(["daily", "weekly", "monthly"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "6px 14px", border: "1.5px solid", borderRadius: 8,
              borderColor: period === p ? "#0F766E" : "#E2E8F0",
              background: period === p ? "#0F766E" : "#fff",
              color: period === p ? "#fff" : "#64748B",
              fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "capitalize",
            }}>{p}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Created" value={totalCreated} color="#0F766E" bg="#ECFEFF" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>} />
        <StatCard label="Total Resolved" value={totalResolved} color="#059669" bg="#F0FDF4" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>} />
        <StatCard label="Open / Active" value={totalOpen} color="#D97706" bg="#FFFBEB" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>} />
        <StatCard label="Resolution Rate" value={`${resolutionRate}%`} color="#7C3AED" bg="#F5F3FF" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>} />
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0F766E" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#0F766E" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradResolved" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#059669" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: "#0F172A", border: "none", borderRadius: 10, color: "#F8FAFC", fontSize: 12 }} labelStyle={{ color: "#A5F3FC", fontWeight: 700 }} />
          <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 12 }} />
          <Area type="monotone" dataKey="created" name="Created" stroke="#0F766E" strokeWidth={2} fill="url(#gradCreated)" dot={{ r: 3, fill: "#0F766E" }} />
          <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#059669" strokeWidth={2} fill="url(#gradResolved)" dot={{ r: 3, fill: "#059669" }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 2 — Agent Performance Reports
// ─────────────────────────────────────────────────────────────────────────────
const AgentPerformanceModule: React.FC<{
  tickets: AnalyticsTicket[];
  consultants: AnalyticsConsultant[];
  bookings?: any[];
  mode?: "admin" | "consultant";
  consultantId?: number;
  consultantName?: string;
}> = ({ tickets, consultants, bookings = [], mode = "admin", consultantId, consultantName }) => {

  // ADDED: Download analytics as CSV
  const downloadCSV = (data: any[], filename: string) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? "")).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // FIX: consultantLookup MUST be declared before agentStats — it is referenced inside
  // agentStats's useMemo callback. React runs useMemo hooks in declaration order, so
  // having it after caused consultantLookup to be undefined when agentStats first ran,
  // making every ticket's consultant appear as "Unassigned" and the "My Performance"
  // tab to render a blank page.
  const consultantLookup = useMemo(() => {
    const map: Record<number, string> = {};
    consultants.forEach(c => {
      if (!c?.id) return;
      const name = formatDisplayName(c.name);
      if (name && !isPlaceholderDisplayName(name)) {
        map[Number(c.id)] = name;
      }
    });
    const currentName = formatDisplayName(consultantName);
    if (mode === "consultant" && consultantId && currentName && !isPlaceholderDisplayName(currentName)) {
      map[Number(consultantId)] = currentName;
    }
    return map;
  }, [consultants, consultantId, consultantName, mode]);

  const agentStats = useMemo(() => {
    const map: Record<string, {
      name: string; id?: number;
      total: number; resolved: number; open: number;
      // ADDED: booking metrics per agent
      totalBookings: number; acceptedBookings: number;
      attendedBookings: number; notAttendedBookings: number;
      responseTimes: number[]; resolutionTimes: number[];
      byPriority: Record<string, number>; byCategory: Record<string, number>;
    }> = {};

    tickets.forEach(t => {
      // ADDED: prefer agentName, then consultantName — ensures agent name is always shown
      const directName = formatDisplayName(t.agentName || t.consultantName);
      const lookupName = t.consultantId ? consultantLookup[Number(t.consultantId)] : "";
      const key =
        (directName && !isPlaceholderDisplayName(directName) ? directName : "") ||
        lookupName ||
        (mode === "consultant" && consultantName ? formatDisplayName(consultantName) : "") ||
        (t.consultantId ? "Consultant" : "Unassigned");
      const cId = t.consultantId;
      if (!map[key]) map[key] = {
        name: key, id: cId ?? undefined,
        total: 0, resolved: 0, open: 0,
        totalBookings: 0, acceptedBookings: 0,
        attendedBookings: 0, notAttendedBookings: 0,
        responseTimes: [], resolutionTimes: [],
        byPriority: {}, byCategory: {},
      };
      const a = map[key];
      a.total++;
      if (["RESOLVED", "CLOSED"].includes(t.status)) a.resolved++;
      else a.open++;

      if (t.firstResponseAt) a.responseTimes.push(hoursElapsed(t.createdAt, t.firstResponseAt));
      else if (t.updatedAt && t.updatedAt !== t.createdAt)
        a.responseTimes.push(hoursElapsed(t.createdAt, t.updatedAt));

      if (["RESOLVED", "CLOSED"].includes(t.status)) {
        const rt = t.resolvedAt || t.updatedAt;
        if (rt) a.resolutionTimes.push(hoursElapsed(t.createdAt, rt));
      }

      if (t.priority) a.byPriority[t.priority] = (a.byPriority[t.priority] || 0) + 1;
      if (t.category) a.byCategory[t.category] = (a.byCategory[t.category] || 0) + 1;
    });

    // ADDED: Merge booking metrics per consultant/agent
    bookings.forEach((b: any) => {
      const directName = formatDisplayName(b.consultantName || b.advisor);
      const lookupName = b.consultantId ? consultantLookup[Number(b.consultantId)] : "";
      const name =
        (directName && !isPlaceholderDisplayName(directName) ? directName : "") ||
        lookupName ||
        (mode === "consultant" && consultantName ? formatDisplayName(consultantName) : "") ||
        (b.consultantId ? "Consultant" : null);
      if (!name) return;
      if (!map[name]) map[name] = {
        name, id: b.consultantId,
        total: 0, resolved: 0, open: 0,
        totalBookings: 0, acceptedBookings: 0,
        attendedBookings: 0, notAttendedBookings: 0,
        responseTimes: [], resolutionTimes: [],
        byPriority: {}, byCategory: {},
      };
      map[name].totalBookings++;
      const st = (b.status || b.BookingStatus || b.bookingStatus || "").toUpperCase();
      if (st === "CONFIRMED") map[name].acceptedBookings++;
      if (st === "COMPLETED") map[name].attendedBookings++;
      if (st === "CANCELLED" || st === "NO_SHOW") map[name].notAttendedBookings++;
    });

    return Object.values(map)
      .filter(a => a.name !== "Unassigned" || a.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [tickets, bookings]);

  // FIX: Match consultant by ID first, then by name as fallback (ID may be undefined in agentStats)
  const matchedByIdOrName = mode === "consultant" && consultantId
    ? agentStats.filter(a =>
      a.id === consultantId ||
      String(a.id) === String(consultantId) ||
      (consultantName &&
        a.name.toLowerCase() === formatDisplayName(consultantName).toLowerCase())
    )
    : agentStats;

  // FIX: If consultant has no tickets/bookings yet, show their own row with zero stats
  // so the "My Performance" tab renders something instead of a blank empty state
  const displayStats = (mode === "consultant" && matchedByIdOrName.length === 0 && consultantName)
    ? [{
      name: formatDisplayName(consultantName),
      id: consultantId,
      total: 0, resolved: 0, open: 0,
      totalBookings: 0, acceptedBookings: 0,
      attendedBookings: 0, notAttendedBookings: 0,
      responseTimes: [] as number[], resolutionTimes: [] as number[],
      byPriority: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
    }]
    : matchedByIdOrName;

  const chartData = displayStats.slice(0, 10).map((a, i) => ({
    name: a.name.split(" ")[0],
    fullName: a.name,
    total: a.total,
    resolved: a.resolved,
    open: a.open,
    rate: a.total > 0 ? Math.round((a.resolved / a.total) * 100) : 0,
    avgResponse: parseFloat(avgOrZero(a.responseTimes).toFixed(1)),
    avgResolution: parseFloat(avgOrZero(a.resolutionTimes).toFixed(1)),
  }));

  // ADDED: Prepare CSV export data
  const csvData = displayStats.map(a => ({
    "Agent Name": a.name,
    "Total Tickets": a.total,
    "Resolved": a.resolved,
    "Open": a.open,
    "Resolution Rate (%)": a.total > 0 ? Math.round((a.resolved / a.total) * 100) : 0,
    "Avg Response (hrs)": avgOrZero(a.responseTimes).toFixed(1),
    "Avg Resolution (hrs)": avgOrZero(a.resolutionTimes).toFixed(1),
    "Total Bookings": a.totalBookings,
    "Accepted Bookings": a.acceptedBookings,
    "Attended Bookings": a.attendedBookings,
    "Not Attended": a.notAttendedBookings,
  }));

  // (consultantLookup was moved above agentStats — see comment there)

  return (
    <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E2E8F0", padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      {/* UPDATED: Header with download button */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <SectionHeader icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>} title="Agent Performance" subtitle={mode === "consultant" ? "Your ticket handling performance" : "Compare performance across all consultants"} />
        {/* ADDED: Download analytics CSV button */}
        {mode === "admin" && displayStats.length > 0 && (
          <button
            onClick={() => downloadCSV(csvData, `agent_performance_${new Date().toISOString().split("T")[0]}.csv`)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 16px", borderRadius: 10,
              border: "1.5px solid #E2E8F0", background: "#fff",
              color: "#374151", fontSize: 12, fontWeight: 700,
              cursor: "pointer", whiteSpace: "nowrap",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#F0FDF4"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#86EFAC"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E2E8F0"; }}
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Download CSV
          </button>
        )}
      </div>

      {displayStats.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
          <p style={{ margin: 0, fontWeight: 600 }}>No agent data available yet</p>
        </div>
      ) : (
        <>
          {/* Bar chart */}
          {mode === "admin" && chartData.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#0F172A", border: "none", borderRadius: 10, color: "#F8FAFC", fontSize: 12 }}
                    labelFormatter={(l: any) => chartData.find(d => d.name === l)?.fullName || l}
                    labelStyle={{ color: "#A5F3FC", fontWeight: 700 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 8 }} />
                  <Bar dataKey="total" name="Total" fill="#0F766E" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="resolved" name="Resolved" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="open" name="Open" fill="#D97706" radius={[4, 4, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* UPDATED: Agent table — now includes Agent Name prominently + Booking metrics */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {/* ADDED: Agent Name is now first and bold column header */}
                  {["Agent Name", "Total Tickets", "Resolved", "Open", "Rate", "Bookings", "Accepted", "Attended", "Not Attended", "Avg Response", "Avg Resolution"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.04em", border: "none", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayStats.map((a, i) => {
                  const rate = a.total > 0 ? Math.round((a.resolved / a.total) * 100) : 0;
                  const avgResp = avgOrZero(a.responseTimes);
                  const avgResol = avgOrZero(a.resolutionTimes);
                  return (
                    <tr key={a.name} style={{ borderTop: "1px solid #F1F5F9", transition: "background 0.1s" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      {/* ADDED: Agent Name column — clearly visible, prominent */}
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#0F172A" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${COLORS[i % COLORS.length]}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, color: COLORS[i % COLORS.length], flexShrink: 0 }}>
                            {a.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, color: "#0F172A" }}>{a.name}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#0F766E" }}>{a.total}</td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#059669" }}>{a.resolved}</td>
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#D97706" }}>{a.open}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: "#F1F5F9", borderRadius: 3, minWidth: 60 }}>
                            <div style={{ width: `${rate}%`, height: "100%", background: rate >= 80 ? "#059669" : rate >= 50 ? "#D97706" : "#DC2626", borderRadius: 3, transition: "width 0.4s" }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: rate >= 80 ? "#059669" : rate >= 50 ? "#D97706" : "#DC2626" }}>{rate}%</span>
                        </div>
                      </td>
                      {/* ADDED: Booking performance columns */}
                      <td style={{ padding: "12px 14px", fontWeight: 700, color: "#0F766E" }}>{a.totalBookings || 0}</td>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: "#16A34A" }}>{a.acceptedBookings || 0}</td>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: "#059669" }}>{a.attendedBookings || 0}</td>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: "#DC2626" }}>{a.notAttendedBookings || 0}</td>
                      <td style={{ padding: "12px 14px", color: "#475569", fontWeight: 600 }}>
                        {a.responseTimes.length > 0 ? fmtHours(avgResp) : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", color: "#475569", fontWeight: 600 }}>
                        {a.resolutionTimes.length > 0 ? fmtHours(avgResol) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 3 — Customer Satisfaction Ratings
// ─────────────────────────────────────────────────────────────────────────────
const CustomerSatisfactionModule: React.FC<{
  tickets: AnalyticsTicket[];
  feedbacks: AnalyticsFeedback[];
  mode?: "admin" | "consultant";
  consultantId?: number;
}> = ({ tickets, feedbacks, mode = "admin", consultantId }) => {

  // Build combined ratings from ticket feedback + booking feedbacks
  const ratings = useMemo(() => {
    const items: { rating: number; comment?: string; source: string; date?: string; consultantId?: number }[] = [];

    // From ticket feedback ratings
    tickets.forEach(t => {
      if (t.feedbackRating && t.feedbackRating > 0) {
        items.push({
          rating: t.feedbackRating,
          comment: t.feedbackText,
          source: `Ticket #${t.id}`,
          date: t.updatedAt || t.createdAt,
          consultantId: t.consultantId ?? undefined,
        });
      }
    });

    // From booking feedbacks
    feedbacks.forEach(f => {
      if (f.rating && f.rating > 0) {
        items.push({
          rating: f.rating,
          comment: f.comments,
          source: f.bookingId ? `Booking #${f.bookingId}` : "Session",
          date: f.createdAt,
          consultantId: f.consultantId,
        });
      }
    });

    if (mode === "consultant" && consultantId) {
      return items.filter(i => !i.consultantId || i.consultantId === consultantId);
    }
    return items;
  }, [tickets, feedbacks, mode, consultantId]);

  const ratingDist = useMemo(() => {
    const dist = [0, 0, 0, 0, 0]; // index 0 = 1 star, index 4 = 5 stars
    ratings.forEach(r => { if (r.rating >= 1 && r.rating <= 5) dist[r.rating - 1]++; });
    return dist.map((count, i) => ({
      star: i + 1,
      count,
      label: `${i + 1} Star${i > 0 ? "s" : ""}`,
      pct: ratings.length > 0 ? Math.round((count / ratings.length) * 100) : 0,
    }));
  }, [ratings]);

  const avgRating = ratings.length > 0
    ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1)
    : "—";

  const csat = ratings.length > 0
    ? Math.round((ratings.filter(r => r.rating >= 4).length / ratings.length) * 100)
    : 0;

  const pieData = ratingDist.filter(d => d.count > 0).map(d => ({
    name: `${d.star} Star${d.star > 1 ? "s" : ""}`,
    value: d.count,
  }));

  const starColors = ["#DC2626", "#EA580C", "#D97706", "#65A30D", "#059669"];

  return (
    <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E2E8F0", padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <SectionHeader icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>} title="Customer Satisfaction" subtitle="Ratings collected from ticket feedback and session reviews" />

      {ratings.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><Star size={40} color="#CBD5E1" strokeWidth={1.8} /></div>
          <p style={{ margin: 0, fontWeight: 600 }}>No feedback ratings collected yet</p>
          <p style={{ margin: "8px 0 0", fontSize: 12 }}>Ratings appear when users submit ticket feedback or session reviews</p>
        </div>
      ) : (
        <>
          {/* Top stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
            <StatCard label="Avg Rating" value={avgRating} color="#D97706" bg="#FFFBEB" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>} />
            <StatCard label="CSAT Score" value={`${csat}%`} color="#059669" bg="#F0FDF4" sub="≥4 star ratings" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} />
            <StatCard label="Total Reviews" value={ratings.length} color="#0F766E" bg="#ECFEFF" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>} />
            <StatCard label="5-Star Reviews" value={ratingDist[4].count} color="#7C3AED" bg="#F5F3FF" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="#7C3AED" stroke="#7C3AED" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, flexWrap: "wrap" }}>
            {/* Distribution bars */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>Rating Distribution</div>
              {ratingDist.slice().reverse().map(d => (
                <div key={d.star} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "#D97706", minWidth: 52, fontWeight: 700 }}>{d.label}</div>
                  <div style={{ flex: 1, height: 8, background: "#F1F5F9", borderRadius: 4 }}>
                    <div style={{ width: `${d.pct}%`, height: "100%", background: starColors[d.star - 1], borderRadius: 4, transition: "width 0.4s" }} />
                  </div>
                  <div style={{ minWidth: 40, fontSize: 12, fontWeight: 700, color: "#475569", textAlign: "right" }}>{d.count} ({d.pct}%)</div>
                </div>
              ))}
            </div>

            {/* Pie chart */}
            {pieData.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14, alignSelf: "flex-start" }}>Rating Breakdown</div>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" paddingAngle={3}>
                      {pieData.map((_, i) => <Cell key={i} fill={starColors[i % starColors.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0F172A", border: "none", borderRadius: 8, color: "#F8FAFC", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Recent reviews */}
          {ratings.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Recent Feedback</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                {[...ratings].sort((a, b) => (b.date || "") > (a.date || "") ? 1 : -1).slice(0, 8).map((r, i) => (
                  <div key={i} style={{ background: "#F8FAFC", borderRadius: 10, padding: "10px 14px", display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 112 }}>
                      {Array.from({ length: r.rating }).map((_, starIdx) => (
                        <Star key={starIdx} size={18} fill="#F59E0B" stroke="#F59E0B" strokeWidth={1.6} />
                      ))}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {r.comment && <p style={{ margin: "0 0 4px", fontSize: 13, color: "#374151", fontStyle: "italic" }}>"{r.comment}"</p>}
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>
                        {r.source}{r.date ? ` · ${new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 4 — Average Response & Resolution Time
// ─────────────────────────────────────────────────────────────────────────────
const ResponseTimeModule: React.FC<{
  tickets: AnalyticsTicket[];
  consultants: AnalyticsConsultant[];
  mode?: "admin" | "consultant";
  consultantId?: number;
}> = ({ tickets, consultants, mode = "admin", consultantId }) => {

  const filteredTickets = mode === "consultant" && consultantId
    ? tickets.filter(t => t.consultantId === consultantId)
    : tickets;

  // Calculate response times per ticket
  const timingData = useMemo(() => {
    const responseTimes: number[] = [];
    const resolutionTimes: number[] = [];

    filteredTickets.forEach(t => {
      // Response time: from creation to first update (approximation)
      if (t.updatedAt && t.updatedAt !== t.createdAt && t.firstResponseAt) {
        responseTimes.push(hoursElapsed(t.createdAt, t.firstResponseAt));
      } else if (t.updatedAt && t.updatedAt !== t.createdAt) {
        responseTimes.push(hoursElapsed(t.createdAt, t.updatedAt));
      }

      // Resolution time: from creation to resolved/closed
      if (["RESOLVED", "CLOSED"].includes(t.status)) {
        const rt = t.resolvedAt || t.updatedAt;
        if (rt) resolutionTimes.push(hoursElapsed(t.createdAt, rt));
      }
    });

    return { responseTimes, resolutionTimes };
  }, [filteredTickets]);

  const avgResponse = avgOrZero(timingData.responseTimes);
  const avgResolution = avgOrZero(timingData.resolutionTimes);
  const minResolution = timingData.resolutionTimes.length > 0 ? Math.min(...timingData.resolutionTimes) : 0;
  const maxResolution = timingData.resolutionTimes.length > 0 ? Math.max(...timingData.resolutionTimes) : 0;

  // Trend data — resolution time by week
  const trendData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 8 }, (_, i) => {
      const end = startOfDay(new Date(now)); end.setDate(end.getDate() - i * 7); end.setHours(23, 59, 59, 999);
      const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
      const weekTickets = filteredTickets.filter(t => {
        const c = new Date(t.createdAt); return c >= start && c <= end;
      });
      const times = weekTickets
        .filter(t => ["RESOLVED", "CLOSED"].includes(t.status))
        .map(t => hoursElapsed(t.createdAt, t.resolvedAt || t.updatedAt));
      return { label: weekLabel(start, end), avgResolution: parseFloat(avgOrZero(times).toFixed(1)), count: times.length };
    }).reverse();
  }, [filteredTickets]);

  // By priority analysis
  const byPriority = useMemo(() => {
    return ["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(p => {
      const pt = filteredTickets.filter(t => t.priority === p && ["RESOLVED", "CLOSED"].includes(t.status));
      const times = pt.map(t => hoursElapsed(t.createdAt, t.resolvedAt || t.updatedAt));
      return { priority: p, avg: avgOrZero(times), count: pt.length };
    }).filter(p => p.count > 0);
  }, [filteredTickets]);

  return (
    <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E2E8F0", padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <SectionHeader icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>} title="Response & Resolution Time" subtitle="How quickly tickets are handled and resolved" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Avg Response Time" value={avgResponse > 0 ? fmtHours(avgResponse) : "—"} color="#0F766E" bg="#ECFEFF" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>} />
        <StatCard label="Avg Resolution Time" value={avgResolution > 0 ? fmtHours(avgResolution) : "—"} color="#059669" bg="#F0FDF4" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>} />
        <StatCard label="Fastest Resolution" value={minResolution > 0 ? fmtHours(minResolution) : "—"} color="#7C3AED" bg="#F5F3FF" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /></svg>} />
        <StatCard label="Slowest Resolution" value={maxResolution > 0 ? fmtHours(maxResolution) : "—"} color="#D97706" bg="#FFFBEB" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>} />
      </div>

      {/* Weekly trend line */}
      {trendData.some(d => d.count > 0) && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Weekly Resolution Time Trend</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={v => v > 0 ? fmtHours(v) : "0"} />
              <Tooltip contentStyle={{ background: "#0F172A", border: "none", borderRadius: 10, color: "#F8FAFC", fontSize: 12 }} formatter={(v: any) => [fmtHours(Number(v)), "Avg Resolution"]} labelStyle={{ color: "#A5F3FC", fontWeight: 700 }} />
              <Line type="monotone" dataKey="avgResolution" name="Avg Resolution" stroke="#0F766E" strokeWidth={2.5} dot={{ r: 4, fill: "#0F766E" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By priority */}
      {byPriority.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Resolution Time by Priority</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {byPriority.map(p => (
              <div key={p.priority} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ minWidth: 80, fontSize: 12, fontWeight: 700, color: PRIORITY_COLOR[p.priority] || "#64748B" }}>
                  {p.priority}
                </div>
                <div style={{ flex: 1, height: 8, background: "#F1F5F9", borderRadius: 4 }}>
                  <div style={{ width: `${Math.min(100, (p.avg / (maxResolution || 1)) * 100)}%`, height: "100%", background: PRIORITY_COLOR[p.priority] || "#64748B", borderRadius: 4 }} />
                </div>
                <div style={{ minWidth: 90, fontSize: 12, fontWeight: 700, color: "#475569", textAlign: "right" }}>
                  {fmtHours(p.avg)} avg · {p.count} tickets
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 5 — SLA Breach Reports
// ─────────────────────────────────────────────────────────────────────────────
const SLABreachModule: React.FC<{
  tickets: AnalyticsTicket[];
  mode?: "admin" | "consultant";
  consultantId?: number;
}> = ({ tickets, mode = "admin", consultantId }) => {

  const filteredTickets = mode === "consultant" && consultantId
    ? tickets.filter(t => t.consultantId === consultantId)
    : tickets;

  const now = Date.now();

  const breached = useMemo(() => filteredTickets.filter(t => {
    if (["RESOLVED", "CLOSED"].includes(t.status)) {
      // Check if it was resolved within SLA
      const rt = t.resolvedAt || t.updatedAt;
      if (rt) return hoursElapsed(t.createdAt, rt) > SLA_HOURS;
      return false;
    }
    return hoursElapsed(t.createdAt) > SLA_HOURS;
  }), [filteredTickets]);

  const atRisk = useMemo(() => filteredTickets.filter(t => {
    if (["RESOLVED", "CLOSED"].includes(t.status)) return false;
    const elapsed = hoursElapsed(t.createdAt);
    return elapsed > (SLA_HOURS * 0.75) && elapsed <= SLA_HOURS;
  }), [filteredTickets]);

  const breachRate = filteredTickets.length > 0
    ? Math.round((breached.length / filteredTickets.length) * 100)
    : 0;

  // SLA compliance by category
  const byCategory = useMemo(() => {
    const cats: Record<string, { total: number; breached: number }> = {};
    filteredTickets.forEach(t => {
      const cat = t.category || "General";
      if (!cats[cat]) cats[cat] = { total: 0, breached: 0 };
      cats[cat].total++;
      const isBreached = ["RESOLVED", "CLOSED"].includes(t.status)
        ? hoursElapsed(t.createdAt, t.resolvedAt || t.updatedAt) > SLA_HOURS
        : hoursElapsed(t.createdAt) > SLA_HOURS;
      if (isBreached) cats[cat].breached++;
    });
    return Object.entries(cats).map(([cat, d]) => ({
      cat, ...d,
      compliance: d.total > 0 ? Math.round(((d.total - d.breached) / d.total) * 100) : 100,
    })).sort((a, b) => b.breached - a.breached);
  }, [filteredTickets]);

  return (
    <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E2E8F0", padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <SectionHeader icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} title="SLA Breach Reports" subtitle={`SLA window: ${SLA_HOURS} hours. Track compliance and identify bottlenecks.`} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="SLA Breaches" value={breached.length} color="#DC2626" bg="#FEF2F2" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} />
        <StatCard label="At Risk (>75% SLA)" value={atRisk.length} color="#D97706" bg="#FFFBEB" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>} />
        <StatCard label="Breach Rate" value={`${breachRate}%`} color="#DC2626" bg="#FEF2F2" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>} />
        <StatCard label="SLA Compliance" value={`${100 - breachRate}%`} color="#059669" bg="#F0FDF4" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>} />
      </div>

      {/* Radial gauge */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>SLA Compliance Rate</div>
          <ResponsiveContainer width="100%" height={140}>
            <RadialBarChart cx="50%" cy="70%" innerRadius="60%" outerRadius="80%" barSize={12} data={[{ name: "Compliance", value: 100 - breachRate, fill: (100 - breachRate) >= 80 ? "#059669" : (100 - breachRate) >= 60 ? "#D97706" : "#DC2626" }]} startAngle={180} endAngle={0}>
              <RadialBar background={{ fill: "#F1F5F9" }} dataKey="value" cornerRadius={6} />
              <text x="50%" y="65%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 22, fontWeight: 800, fill: (100 - breachRate) >= 80 ? "#059669" : "#DC2626" }}>
                {100 - breachRate}%
              </text>
              <text x="50%" y="80%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 10, fill: "#64748B" }}>
                Compliance
              </text>
            </RadialBarChart>
          </ResponsiveContainer>
        </div>

        {/* Category compliance bars */}
        {byCategory.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>By Category</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {byCategory.slice(0, 5).map(c => (
                <div key={c.cat}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{c.cat}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: c.compliance >= 80 ? "#059669" : c.compliance >= 60 ? "#D97706" : "#DC2626" }}>
                      {c.compliance}% · {c.breached} breach{c.breached !== 1 ? "es" : ""}
                    </span>
                  </div>
                  <div style={{ height: 6, background: "#F1F5F9", borderRadius: 3 }}>
                    <div style={{ width: `${c.compliance}%`, height: "100%", borderRadius: 3, background: c.compliance >= 80 ? "#059669" : c.compliance >= 60 ? "#D97706" : "#DC2626" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Breached tickets list */}
      {breached.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <AlertTriangle size={13} />
            <span>Breached Tickets ({breached.length})</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#FEF2F2" }}>
                  {["Ticket", "Title", "Priority", "Status", "Opened", "Time Elapsed", "Agent"].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, fontSize: 10, color: "#B91C1C", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breached.slice(0, 10).map(t => {
                  const elapsed = hoursElapsed(t.createdAt, ["RESOLVED", "CLOSED"].includes(t.status) ? (t.resolvedAt || t.updatedAt) : undefined);
                  return (
                    <tr key={t.id} style={{ borderTop: "1px solid #FEE2E2" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: "#DC2626" }}>#{t.id}</td>
                      <td style={{ padding: "8px 12px", color: "#374151", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title || t.category || "—"}</td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: `${PRIORITY_COLOR[t.priority || "LOW"]}20`, color: PRIORITY_COLOR[t.priority || "LOW"], fontWeight: 700 }}>
                          {t.priority || "LOW"}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: `${STATUS_COLOR[t.status] || "#64748B"}20`, color: STATUS_COLOR[t.status] || "#64748B", fontWeight: 700 }}>
                          {t.status}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px", color: "#64748B", whiteSpace: "nowrap" }}>
                        {new Date(t.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </td>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: "#DC2626", whiteSpace: "nowrap" }}>
                        {fmtHours(elapsed)} <span style={{ fontSize: 10, fontWeight: 600, color: "#94A3B8" }}>(SLA: {SLA_HOURS}h)</span>
                      </td>
                      <td style={{ padding: "8px 12px", color: "#475569" }}>{t.consultantName || t.agentName || "Unassigned"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {breached.length === 0 && (
        <div style={{ textAlign: "center", padding: "24px 0", background: "#F0FDF4", borderRadius: 14, border: "1px solid #86EFAC" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><CheckCircle size={32} color="#16A34A" strokeWidth={2.4} /></div>
          <div style={{ fontWeight: 700, color: "#059669", fontSize: 14 }}>All tickets are within SLA</div>
          <div style={{ fontSize: 12, color: "#16A34A", marginTop: 4 }}>No SLA breaches detected. Great work!</div>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MODULE 6 — Bookings & Revenue
// ─────────────────────────────────────────────────────────────────────────────
const BookingAnalyticsModule: React.FC<{
  bookings: any[];
  mode?: "admin" | "consultant";
  consultantName?: string;
}> = ({ bookings, mode = "admin", consultantName = "" }) => {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  // ADDED: Download bookings as CSV
  const downloadBookingsCSV = () => {
    if (!bookings.length) return;
    const data = bookings.map(b => ({
      "Booking ID": b.id || "",
      "User": getBookingUserName(b),
      "Consultant / Agent": getBookingConsultantName(b, consultantName),
      "Date": getBookingDateParts(b).date,
      "Time": getBookingDateParts(b).time,
      "Status": getBookingStatus(b),
      "Amount (₹)": getBookingAmount(b),
      "Meeting Mode": getBookingMeetingMode(b),
    }));
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => JSON.stringify((row as any)[h] ?? "")).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookings_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalBookings = bookings.length;
  const completedBookings = bookings.filter(b => ["COMPLETED", "SUCCESS"].includes(getBookingStatus(b))).length;
  const totalRevenue = bookings
    .filter(b => ["COMPLETED", "SUCCESS"].includes(getBookingStatus(b)))
    .reduce((sum, b) => sum + getBookingAmount(b), 0);
  const avgTicketSize = completedBookings > 0 ? Math.round(totalRevenue / completedBookings) : 0;

  const chartData = useMemo(() => {
    const dataMap: Record<string, { bookings: number; revenue: number; _isoKey: string }> = {};

    bookings.forEach(b => {
      const { date: bookingDate } = getBookingDateParts(b);
      const dateStr = bookingDate.trim();
      if (!dateStr || dateStr === "N/A" || dateStr.length < 8) return;

      const parsedDate = new Date(dateStr + "T00:00:00");
      if (isNaN(parsedDate.getTime())) return;

      let label = "";
      let isoKey = dateStr;
      if (period === "daily") { label = dayLabel(parsedDate); isoKey = dateStr; }
      else if (period === "weekly") {
        const start = startOfDay(new Date(parsedDate));
        start.setDate(start.getDate() - start.getDay());
        const end = new Date(start); end.setDate(end.getDate() + 6);
        label = weekLabel(start, end);
        isoKey = start.toISOString().split("T")[0];
      } else {
        label = monthLabel(parsedDate);
        isoKey = dateStr.substring(0, 7);
      }

      if (!dataMap[label]) dataMap[label] = { bookings: 0, revenue: 0, _isoKey: isoKey };
      dataMap[label].bookings++;
      // Count revenue for completed bookings; also show pending amount for trend visibility
      const st = getBookingStatus(b);
      if (st === "COMPLETED" || st === "SUCCESS" || st === "CONFIRMED") {
        dataMap[label].revenue += getBookingAmount(b);
      }
    });

    return Object.entries(dataMap)
      .map(([label, val]) => ({ label, bookings: val.bookings, revenue: val.revenue, _isoKey: val._isoKey }))
      .sort((a, b) => a._isoKey.localeCompare(b._isoKey));
  }, [bookings, period]);

  return (
    <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E2E8F0", padding: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 20 }}>
        <SectionHeader icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>} title="Bookings & Revenue" subtitle="Analyze booking trends and financial performance" />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* ADDED: Download bookings CSV */}
          {bookings.length > 0 && (
            <button
              onClick={downloadBookingsCSV}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: 10,
                border: "1.5px solid #E2E8F0", background: "#fff",
                color: "#374151", fontSize: 12, fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#F0FDF4"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#86EFAC"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fff"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#E2E8F0"; }}
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <polyline points="7 10 12 15 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Download CSV
            </button>
          )}
          {(["daily", "weekly", "monthly"] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "6px 14px", border: "1.5px solid", borderRadius: 8,
              borderColor: period === p ? "#0F766E" : "#E2E8F0",
              background: period === p ? "#0F766E" : "#fff",
              color: period === p ? "#fff" : "#64748B",
              fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "capitalize",
            }}>{p}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", gap: 12, marginBottom: 24 }}>
        <StatCard label="Total Bookings" value={totalBookings} color="#0F766E" bg="#ECFEFF" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>} />
        <StatCard label="Total Revenue" value={formatIndianCurrency(totalRevenue)} color="#059669" bg="#F0FDF4" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>} />
        <StatCard label="Completed" value={completedBookings} color="#7C3AED" bg="#F5F3FF" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} />
        <StatCard label={mode === "consultant" ? "Avg Bookings Revenue" : "Avg Ticket Size"} value={formatIndianCurrency(avgTicketSize)} color="#D97706" bg="#FFFBEB" icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Revenue Trend</div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#059669" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v}`} />
            <Tooltip contentStyle={{ background: "#0F172A", border: "none", borderRadius: 10, color: "#F8FAFC", fontSize: 12 }} formatter={(v: any) => [formatIndianCurrency(Number(v) || 0), "Revenue"]} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#059669" strokeWidth={2} fill="url(#gradRev)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Booking Activity</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#64748B" }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#0F172A", border: "none", borderRadius: 10, color: "#F8FAFC", fontSize: 12 }} />
            <Bar dataKey="bookings" name="Bookings" fill="#0F766E" radius={[4, 4, 0, 0]} barSize={30} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

const AnalyticsDashboard: React.FC<Props> = ({
  tickets: ticketsProp,
  consultants: consultantsProp = [],
  bookings: bookingsProp = [],
  feedbacks: feedbacksProp,
  mode = "admin",
  consultantId,
  consultantName,
  overviewData,
  chartsData,
  recentTransactions = [],
  upcomingAppointments = [],
  recentFeedbacks = [],
  analyticsLoading: parentAnalyticsLoading = false,
}) => {
  const [activeModule, setActiveModule] = useState<
    "volume" | "agents" | "satisfaction" | "timing" | "sla" | "bookings"
  >("volume");
  const [feedbacks, setFeedbacks] = useState<AnalyticsFeedback[]>(feedbacksProp || []);
  const [tickets, setTickets] = useState<AnalyticsTicket[]>(ticketsProp || []);
  const [bookings, setBookings] = useState<any[]>(bookingsProp || []);
  const [consultants, setConsultants] = useState<AnalyticsConsultant[]>(consultantsProp || []);
  const [loading, setLoading] = useState(false);

  // Sync from parent props
  useEffect(() => {
    if (ticketsProp && ticketsProp.length > 0) setTickets(ticketsProp);
  }, [ticketsProp]);

  useEffect(() => {
    if (consultantsProp && consultantsProp.length > 0) setConsultants(consultantsProp);
  }, [consultantsProp]);

  useEffect(() => {
    if (bookingsProp && bookingsProp.length > 0) setBookings(bookingsProp);
  }, [bookingsProp]);

  // Sync analytics enrichment data from parent (AdvisorDashboard pre-fetched)
  useEffect(() => {
    if (!overviewData) return;
    // overviewData can be used by child modules via the bookings/tickets already set;
    // if it carries a booking count or revenue, sync into bookings as a hint
  }, [overviewData]);

  useEffect(() => {
    if (!chartsData?.monthlyRevenueChart) return;
    // If parent supplies chart data and we have no bookings yet, synthesise entries
    setBookings(prev => {
      if (prev.length > 0) return prev;
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const synthetic = (chartsData.monthlyRevenueChart as number[]).map((rev: number, i: number) => ({
        status: "COMPLETED",
        amount: rev,
        time: months[i],
        consultantName: consultantName || "",
      }));
      return synthetic.some((b: any) => b.amount > 0) ? synthetic : prev;
    });
  }, [chartsData]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // ── Tickets: only fetch if parent didn't provide ─────────────────────
      if (!ticketsProp || ticketsProp.length === 0) {
        try {
          let arr: AnalyticsTicket[] = [];
          if (mode === "consultant" && consultantId) {
            // ✅ Only valid endpoint for consultant tickets
            try {
              const d = await apiFetch(`/tickets/consultant/${consultantId}`);
              arr = extractArr(d);
            } catch (e: any) {
              console.warn("Analytics: /tickets/consultant failed:", e?.message);
            }
            // Resolve consultant real name: use prop first, else fetch from API
            let resolvedName = consultantName || "";
            if (!resolvedName && consultantId) {
              try {
                const c = await apiFetch(`/consultants/${consultantId}`);
                resolvedName = c?.name || c?.fullName || c?.username || "";
              } catch {
                try {
                  const u = await apiFetch(`/users/${consultantId}`);
                  resolvedName = u?.name || u?.fullName || u?.username || "";
                } catch { }
              }
            }
            // Inject real name into every ticket so agentStats shows it correctly
            if (resolvedName) {
              arr = arr.map((t: any) => ({
                ...t,
                agentName: resolvedName,
                consultantName: resolvedName,
              }));
            }
          } else {
            // ✅ Admin: GET /tickets returns all (requires ROLE_ADMIN)
            try {
              const d = await apiFetch("/tickets");
              arr = extractArr(d);
            } catch (e: any) {
              console.warn("Analytics: /tickets failed:", e?.message);
            }
          }
          if (arr.length > 0) setTickets(arr);
        } catch { }
      }

      // ── Feedbacks ────────────────────────────────────────────────────────
      if (!feedbacksProp || feedbacksProp.length === 0) {
        try {
          const ep = mode === "consultant" && consultantId
            ? `/feedbacks/consultant/${consultantId}` : "/feedbacks";
          const data = await apiFetch(ep);
          const arr = extractArr(data);
          if (arr.length > 0) setFeedbacks(arr);
        } catch { }
      }

      // ── Bookings (consultant mode) ────────────────────────────────────────
      if (!bookingsProp || bookingsProp.length === 0) {
        try {
          const ep = mode === "consultant" && consultantId
            ? `/bookings/consultant/${consultantId}` : "/analytics/admin/recent-transactions";
          const data = await apiFetch(ep);
          const arr = extractArr(data);
          if (arr.length > 0) {
            // Normalise booking shape for BookingAnalyticsModule
            const resolvedCName = consultantName || "";
            const normalised = arr.map((b: any) => ({
              ...b,
              status: (b.bookingStatus || b.BookingStatus || b.status || "").toUpperCase(),
              amount: b.charges || b.amount || b.totalAmount || b.fee || b.consultantCharges || 0,
              // Ensure time is populated from any available date field
              time: b.slotDate || b.bookingDate || b.date || b.scheduledDate ||
                b.appointmentDate || b.createdAt || b.created_at || "",
              // Inject consultant name so AgentPerformanceModule resolves correctly
              consultantName: b.consultantName || b.advisor || resolvedCName || undefined,
            }));
            setBookings(normalised);
          }
        } catch { }
      }

      // ── Analytics-specific enrichment for consultant mode ─────────────────
      if (mode === "consultant" && consultantId) {
        try {
          const [overview, charts] = await Promise.allSettled([
            apiFetch("/analytics/consultant/overview"),
            apiFetch("/analytics/consultant/charts"),
          ]);
          if (charts.status === "fulfilled") {
            const c = charts.value;
            // Enrich bookings with monthly revenue chart data if bookings list is empty
            if (c?.monthlyRevenueChart && bookings.length === 0) {
              const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              const synthetic = (c.monthlyRevenueChart as number[]).map((rev: number, i: number) => ({
                status: "COMPLETED",
                amount: rev,
                time: months[i],
                consultantName: consultantName || "",
              }));
              if (synthetic.some((b: any) => b.amount > 0)) setBookings(prev => prev.length > 0 ? prev : synthetic);
            }
          }
          void overview; // used by parent via overviewData prop
        } catch { }
      }

      // ── Consultants (admin only) ─────────────────────────────────────────
      if (mode === "admin" && (!consultantsProp || consultantsProp.length === 0)) {
        try {
          const data = await apiFetch("/consultants");
          const arr = extractArr(data);
          if (arr.length > 0) setConsultants(arr);
        } catch { }
      }

      setLoading(false);
    })();
  }, [consultantId, mode]);

  const ModuleIcon: React.FC<{ id: string; active: boolean }> = ({ id, active }) => {
    const c = active ? "#fff" : "#64748B";
    const w = 15; const h = 15;
    switch (id) {
      case "volume": return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>;
      case "agents": return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
      case "satisfaction": return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;
      case "timing": return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>;
      case "sla": return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
      case "bookings": return <svg width={w} height={h} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>;
      default: return null;
    }
  };

  const modules = [
    { id: "volume", label: "Ticket Volume" },
    { id: "agents", label: mode === "consultant" ? "My Performance" : "Agent Performance" },
    { id: "satisfaction", label: "Customer Satisfaction" },
    { id: "timing", label: "Response Times" },
    { id: "sla", label: "SLA Breach" },
    { id: "bookings", label: "Bookings & Revenue" },
  ] as const;

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <BarChart3 size={22} />
          <span>Analytics & Reports</span>
        </h2>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>
          {mode === "consultant"
            ? `Performance analytics for ${consultantName || "your account"}`
            : "Comprehensive analytics across all tickets, agents, and customer satisfaction"}
        </p>
      </div>

      {/* Module tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 24, flexWrap: "wrap" }}>
        {modules.map(m => {
          const isActive = activeModule === m.id;
          return (
            <button
              key={m.id}
              onClick={() => setActiveModule(m.id)}
              style={{
                display: "flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: 10, border: "1.5px solid",
                borderColor: isActive ? "#0F766E" : "#E2E8F0",
                background: isActive ? "var(--portal-profile-gradient)" : "#fff",
                color: isActive ? "#fff" : "#64748B",
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                transition: "all 0.15s", whiteSpace: "nowrap",
                boxShadow: isActive ? "0 4px 12px rgba(15,118,110,0.3)" : "none",
              }}
            >
              <ModuleIcon id={m.id} active={isActive} />
              {m.label}
            </button>
          );
        })}
      </div>

      {/* Module content */}
      {activeModule === "volume" && <TicketVolumeModule tickets={tickets} />}
      {activeModule === "agents" && <AgentPerformanceModule tickets={tickets} consultants={consultants} bookings={bookings} mode={mode} consultantId={consultantId} consultantName={consultantName} />}
      {activeModule === "satisfaction" && <CustomerSatisfactionModule tickets={tickets} feedbacks={feedbacks} mode={mode} consultantId={consultantId} />}
      {activeModule === "timing" && <ResponseTimeModule tickets={tickets} consultants={consultants} mode={mode} consultantId={consultantId} />}
      {activeModule === "sla" && <SLABreachModule tickets={tickets} mode={mode} consultantId={consultantId} />}
      {activeModule === "bookings" && <BookingAnalyticsModule bookings={bookings} mode={mode} consultantName={consultantName} />}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default AnalyticsDashboard;
