import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import StatusBadge from "../components/StatusBadge.tsx";
import { advisors, bookingData, recentBookings, pendingQueries } from "../data/data.ts";
import type { AdminSectionType, AdminNavItem, StatCard, PendingQuery, RecentBooking, Advisor } from "../types";
import styles from "../css/AdminPage.module.css";

export default function AdminPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<AdminSectionType>("dashboard");
  const [queries, setQueries] = useState<PendingQuery[]>(pendingQueries);

  const handleQuery = (id: number) => {
    setQueries(q => q.filter((item: PendingQuery) => item.id !== id));
  };

  const navItems: AdminNavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/></svg> },
    { id: "advisors", label: "Advisors", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> },
    { id: "bookings", label: "Bookings", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> },
    { id: "queries", label: "Queries", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg> },
    { id: "settings", label: "Settings", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/></svg> },
  ];

  const stats: StatCard[] = [
    { label: "TOTAL BOOKINGS", value: "1,284", change: "+12.5%", positive: true, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#2563EB" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"/></svg> },
    { label: "ACTIVE ADVISORS", value: "48", change: "+2", positive: true, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="#7C3AED" strokeWidth="2"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/></svg> },
    { label: "TOTAL REVENUE", value: "₹4.2L", change: "+8.2%", positive: true, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { label: "PENDING QUERIES", value: String(queries.length), change: queries.length < 3 ? `-${3 - queries.length}` : "0", positive: false, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#F59E0B" strokeWidth="2" strokeLinejoin="round"/></svg> },
  ];

  return (
    <div className={styles.page}>

      {/* ── Sidebar ── */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarLogo}>
          <span className={styles.logoText}>FINADVISE</span>
          <span className={styles.adminBadge}>ADMIN</span>
        </div>

        <nav className={styles.nav}>
          {navItems.map(n => (
            <button
              key={n.id}
              onClick={() => setActiveSection(n.id)}
              className={`${styles.navBtn} ${activeSection === n.id ? styles.navBtnActive : ""}`}
            >
              {n.icon} {n.label}
            </button>
          ))}
        </nav>

        <div className={styles.sidebarBottom}>
          <button onClick={() => navigate("/")} className={styles.sidebarActionBtn}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Login
          </button>
          <button onClick={() => navigate("/")} className={styles.sidebarActionBtn}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Log Out
          </button>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className={styles.main}>

        {/* Top Bar */}
        <div className={styles.topBar}>
          <div className={styles.searchWrapper}>
            <svg className={styles.searchIcon} width="16" height="16" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2"/>
              <path d="m21 21-4.35-4.35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input placeholder="Search anything..." className={styles.searchInput} />
          </div>
          <button className={styles.addBtn}>+ Add New Advisor</button>
        </div>

        {/* ── DASHBOARD ── */}
        {activeSection === "dashboard" && (
          <>
            <div className={styles.statsGrid}>
              {stats.map((s: StatCard, i: number) => (
                <div key={i} className={styles.statCard}>
                  <div className={styles.statLabel}>{s.label}</div>
                  <div className={styles.statRow}>
                    <div>
                      <div className={styles.statValue}>{s.value}</div>
                      <div className={`${styles.statChange} ${s.positive ? styles.positive : styles.negative}`}>{s.change}</div>
                    </div>
                    {s.icon}
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.chartGrid}>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Bookings This Week</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={bookingData}>
                    <XAxis dataKey="day" stroke="#94A3B8" style={{ fontSize: 12 }} />
                    <YAxis stroke="#94A3B8" style={{ fontSize: 12 }} />
                    <Tooltip cursor={{ fill: "rgba(37,99,235,0.05)" }} />
                    <Bar dataKey="bookings" fill="#2563EB" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Top Advisors</h3>
                {advisors.slice(0, 3).map((a: Advisor, i: number) => (
                  <div key={a.id} className={`${styles.advisorRow} ${i < 2 ? styles.advisorRowBorder : ""}`}>
                    <img src={a.avatar} alt={a.name} className={styles.advisorAvatar} />
                    <div>
                      <div className={styles.advisorName}>{a.name}</div>
                      <div className={styles.advisorRating}>★ {a.rating}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${styles.card} ${styles.mt16}`}>
              <h3 className={styles.cardTitle}>Recent Bookings</h3>
              <table className={styles.table}>
                <thead>
                  <tr className={styles.tableHead}>
                    {["USER", "ADVISOR", "TIME", "STATUS", "AMOUNT", ""].map(h => (
                      <td key={h} className={styles.th}>{h}</td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b: RecentBooking, i: number) => (
                    <tr key={i} className={styles.tableRow}>
                      <td className={styles.tdUser}>{b.user}</td>
                      <td className={styles.tdAdvisor}>{b.advisor}</td>
                      <td className={styles.tdTime}>🕐 {b.time}</td>
                      <td><StatusBadge status={b.status} /></td>
                      <td className={styles.tdAmount}>₹{b.amount.toLocaleString()}</td>
                      <td className={styles.tdMore}>⋮</td>
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
            <h2 className={styles.pageTitle}>Advisors</h2>
            <div className={styles.advisorsGrid}>
              {advisors.map((a: Advisor) => (
                <div key={a.id} className={styles.card}>
                  <div className={styles.advisorCardRow}>
                    <img src={a.avatar} alt={a.name} className={styles.advisorAvatarLg} />
                    <div>
                      <div className={styles.advisorNameLg}>{a.name}</div>
                      <div className={styles.advisorRole}>{a.role}</div>
                      <div className={styles.tagRow}>
                        {a.tags.map((t: string) => (
                          <span key={t} className={styles.tag}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className={styles.advisorCardFooter}>
                    <span>★ {a.rating} · {a.reviews} reviews</span>
                    <span className={styles.advisorFee}>₹{a.fee.toLocaleString()}/session</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── BOOKINGS ── */}
        {activeSection === "bookings" && (
          <div>
            <h2 className={styles.pageTitle}>All Bookings</h2>
            <div className={styles.card}>
              <table className={styles.table}>
                <thead>
                  <tr className={styles.tableHead}>
                    {["USER", "ADVISOR", "TIME", "STATUS", "AMOUNT"].map(h => (
                      <td key={h} className={styles.th}>{h}</td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b: RecentBooking, i: number) => (
                    <tr key={i} className={styles.tableRow}>
                      <td className={styles.tdUser}>{b.user}</td>
                      <td className={styles.tdAdvisor}>{b.advisor}</td>
                      <td className={styles.tdTime}>🕐 {b.time}</td>
                      <td><StatusBadge status={b.status} /></td>
                      <td className={styles.tdAmount}>₹{b.amount.toLocaleString()}</td>
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
            <h2 className={styles.pageTitle}>Pending Queries</h2>
            {queries.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>✓</div>
                <div className={styles.emptyText}>All queries resolved</div>
              </div>
            ) : queries.map((q: PendingQuery) => (
              <div key={q.id} className={styles.queryCard}>
                <div>
                  <div className={styles.queryQuestion}>{q.question}</div>
                  <div className={styles.queryFrom}>From: User #{q.id}</div>
                </div>
                <div className={styles.queryActions}>
                  <button onClick={() => handleQuery(q.id)} className={styles.approveBtn}>Approve</button>
                  <button onClick={() => handleQuery(q.id)} className={styles.rejectBtn}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {activeSection === "settings" && (
          <div>
            <h2 className={styles.pageTitle}>Settings</h2>
            <div className={`${styles.card} ${styles.settingsCard}`}>
              {["General", "Notifications", "Security", "Integrations"].map(item => (
                <div key={item} className={styles.settingsRow}>
                  <span className={styles.settingsLabel}>{item}</span>
                  <span className={styles.settingsArrow}>›</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}