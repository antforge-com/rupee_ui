import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import StatusBadge from "../components/StatusBadge.tsx";
import { advisors, bookingData, recentBookings, pendingQueries } from "../data/data.ts";
import type { AdminSectionType, AdminNavItem, StatCard, PendingQuery, RecentBooking, Advisor } from "/workspaces/finco1/finadvise-ts/src/types";

export default function AdminPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<AdminSectionType>("dashboard");
  const [queries, setQueries] = useState<PendingQuery[]>(pendingQueries);

  const handleQuery = (id: number) => {
    setQueries(q => q.filter((item: PendingQuery) => item.id !== id));
  };

  const navItems: AdminNavItem[] = [
    {
      id: "dashboard", label: "Dashboard",
      icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/></svg>
    },
    {
      id: "advisors", label: "Advisors",
      icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
    },
    {
      id: "bookings", label: "Bookings",
      icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
    },
    {
      id: "queries", label: "Queries",
      icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
    },
    {
      id: "settings", label: "Settings",
      icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/></svg>
    },
  ];

  const stats: StatCard[] = [
    { label: "TOTAL BOOKINGS", value: "1,284", change: "+12.5%", positive: true, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#2563EB" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"/></svg> },
    { label: "ACTIVE ADVISORS", value: "48", change: "+2", positive: true, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="#7C3AED" strokeWidth="2"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/></svg> },
    { label: "TOTAL REVENUE", value: "₹4.2L", change: "+8.2%", positive: true, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { label: "PENDING QUERIES", value: String(queries.length), change: queries.length < 3 ? `-${3 - queries.length}` : "0", positive: false, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#F59E0B" strokeWidth="2" strokeLinejoin="round"/></svg> },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'DM Sans', sans-serif", display: "flex" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap'); *, *::before, *::after { box-sizing: border-box; } body { margin: 0; padding: 0; }`}</style>

      {/* ── Sidebar ── */}
      <div style={{ width: 240, background: "#0F172A", minHeight: "100vh", display: "flex", flexDirection: "column", position: "fixed", top: 0, left: 0, bottom: 0 }}>

        {/* Logo */}
        <div style={{ padding: "24px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 16, color: "#2563EB", letterSpacing: 1 }}>FINADVISE</span>
            <span style={{ background: "#1E3A8A", color: "#93C5FD", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, letterSpacing: 1 }}>ADMIN</span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {navItems.map(n => (
            <button
              key={n.id}
              onClick={() => setActiveSection(n.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, border: "none", background: activeSection === n.id ? "#1D4ED8" : "transparent", color: activeSection === n.id ? "#fff" : "#94A3B8", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 4, textAlign: "left" }}
            >
              {n.icon} {n.label}
            </button>
          ))}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: "0 12px 24px" }}>
          {/* Back to Login */}
          <button
            onClick={() => navigate("/")}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, border: "none", background: "transparent", color: "#94A3B8", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 4 }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Login
          </button>

          {/* Log Out */}
          <button
            onClick={() => navigate("/")}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, border: "none", background: "transparent", color: "#94A3B8", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14 }}
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Log Out
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div style={{ marginLeft: 240, flex: 1, padding: "24px", minHeight: "100vh" }}>

        {/* Top Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 16 }}>
          <div style={{ position: "relative", flex: 1, maxWidth: 400 }}>
            <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} width="16" height="16" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2"/>
              <path d="m21 21-4.35-4.35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input placeholder="Search anything..." style={{ width: "100%", padding: "11px 16px 11px 40px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 14, fontFamily: "inherit", background: "#fff" }} />
          </div>
          <button style={{ background: "#2563EB", color: "#fff", border: "none", borderRadius: 12, padding: "11px 20px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
            + Add New Advisor
          </button>
        </div>

        {/* ── DASHBOARD ── */}
        {activeSection === "dashboard" && (
          <>
            {/* Stats Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              {stats.map((s: StatCard, i: number) => (
                <div key={i} style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: "#94A3B8", marginBottom: 12 }}>{s.label}</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 28, fontWeight: 700, color: "#0F172A", marginBottom: 6 }}>{s.value}</div>
                      <div style={{ fontSize: 13, color: s.positive ? "#16A34A" : "#DC2626", fontWeight: 600 }}>{s.change}</div>
                    </div>
                    {s.icon}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
              {/* Chart */}
              <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
                <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 20, color: "#0F172A" }}>Bookings This Week</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={bookingData}>
                    <XAxis dataKey="day" stroke="#94A3B8" style={{ fontSize: 12 }} />
                    <YAxis stroke="#94A3B8" style={{ fontSize: 12 }} />
                    <Tooltip cursor={{ fill: "rgba(37, 99, 235, 0.05)" }} />
                    <Bar dataKey="bookings" fill="#2563EB" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top Advisors */}
              <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
                <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#0F172A" }}>Top Advisors</h3>
                {advisors.slice(0, 3).map((a: Advisor, i: number) => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: i < 2 ? "1px solid #F1F5F9" : "none" }}>
                    <img src={a.avatar} alt={a.name} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#0F172A" }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: "#64748B" }}>★ {a.rating}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Bookings Table */}
            <div style={{ background: "#fff", borderRadius: 16, padding: 24, marginTop: 16, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
              <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 16, color: "#0F172A" }}>Recent Bookings</h3>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ fontSize: 11, letterSpacing: 1.5, color: "#94A3B8", fontWeight: 700 }}>
                    {["USER", "ADVISOR", "TIME", "STATUS", "AMOUNT", ""].map(h => (
                      <td key={h} style={{ padding: "8px 0 16px" }}>{h}</td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b: RecentBooking, i: number) => (
                    <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "16px 0", fontWeight: 600, color: "#0F172A" }}>{b.user}</td>
                      <td style={{ padding: "16px 0", color: "#2563EB", fontWeight: 500 }}>{b.advisor}</td>
                      <td style={{ padding: "16px 0", color: "#64748B", fontSize: 14 }}>🕐 {b.time}</td>
                      <td style={{ padding: "16px 0" }}><StatusBadge status={b.status} /></td>
                      <td style={{ padding: "16px 0", fontWeight: 700, color: "#0F172A" }}>₹{b.amount.toLocaleString()}</td>
                      <td style={{ padding: "16px 0", color: "#94A3B8", cursor: "pointer", fontSize: 18 }}>⋮</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ── ADVISORS ── */}
        {activeSection === "advisors" && (
          <div>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 700, marginBottom: 20, color: "#0F172A" }}>Advisors</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
              {advisors.map((a: Advisor) => (
                <div key={a.id} style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
                  <div style={{ display: "flex", gap: 16 }}>
                    <img src={a.avatar} alt={a.name} style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover" }} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A" }}>{a.name}</div>
                      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 8 }}>{a.role}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {a.tags.map((t: string) => (
                          <span key={t} style={{ fontSize: 11, padding: "2px 8px", background: "#EFF6FF", borderRadius: 20, color: "#2563EB", fontWeight: 500 }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTop: "1px solid #F1F5F9", fontSize: 13, color: "#64748B" }}>
                    <span>★ {a.rating} · {a.reviews} reviews</span>
                    <span style={{ fontWeight: 700, color: "#0F172A" }}>₹{a.fee.toLocaleString()}/session</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── BOOKINGS ── */}
        {activeSection === "bookings" && (
          <div>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 24, fontWeight: 700, marginBottom: 20, color: "#0F172A" }}>All Bookings</h2>
            <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ fontSize: 11, letterSpacing: 1.5, color: "#94A3B8", fontWeight: 700 }}>
                    {["USER", "ADVISOR", "TIME", "STATUS", "AMOUNT"].map(h => (
                      <td key={h} style={{ padding: "8px 0 16px" }}>{h}</td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b: RecentBooking, i: number) => (
                    <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                      <td style={{ padding: "16px 0", fontWeight: 600, color: "#0F172A" }}>{b.user}</td>
                      <td style={{ padding: "16px 0", color: "#2563EB" }}>{b.advisor}</td>
                      <td style={{ padding: "16px 0", color: "#64748B" }}>🕐 {b.time}</td>
                      <td style={{ padding: "16px 0" }}><StatusBadge status={b.status} /></td>
                      <td style={{ padding: "16px 0", fontWeight: 700 }}>₹{b.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── QUERIES ── */}
        {activeSection === "queries" && (
          <div>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 24, fontWeight: 700, marginBottom: 20, color: "#0F172A" }}>Pending Queries</h2>
            {queries.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#94A3B8", background: "#fff", borderRadius: 16 }}>
                <div style={{ fontSize: 40 }}>✓</div>
                <div style={{ fontWeight: 600, marginTop: 12 }}>All queries resolved</div>
              </div>
            ) : queries.map((q: PendingQuery) => (
              <div key={q.id} style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 12, boxShadow: "0 1px 8px rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: "#0F172A" }}>{q.question}</div>
                  <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>From: User #{q.id}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => handleQuery(q.id)} style={{ padding: "8px 20px", borderRadius: 10, border: "1.5px solid #16A34A", background: "none", color: "#16A34A", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Approve</button>
                  <button onClick={() => handleQuery(q.id)} style={{ padding: "8px 20px", borderRadius: 10, border: "1.5px solid #DC2626", background: "none", color: "#DC2626", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activeSection === "settings" && (
          <div>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 24, fontWeight: 700, marginBottom: 20, color: "#0F172A" }}>Settings</h2>
            <div style={{ background: "#fff", borderRadius: 16, padding: 24, maxWidth: 500, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
              {["General", "Notifications", "Security", "Integrations"].map(item => (
                <div key={item} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid #F1F5F9" }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: "#1E293B" }}>{item}</span>
                  <span style={{ color: "#94A3B8", fontSize: 18 }}>›</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
