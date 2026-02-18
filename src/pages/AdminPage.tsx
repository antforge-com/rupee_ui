import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AddAdvisor from "../components/AddAdvisor.tsx";
import StatusBadge from "../components/StatusBadge.tsx";
import styles from "../styles/AdminPage.module.css";
import { bookingData, advisors as initialAdvisors, pendingQueries, recentBookings } from "../data/data.ts";
import { deleteAdvisor, getAdvisors as getAllAdvisors } from "../services/api.ts";
import type { AdminNavItem, Advisor, PendingQuery, RecentBooking, StatCard } from "../types";

type AdminSectionType = "dashboard" | "advisors" | "bookings" | "queries" | "settings";

export default function AdminPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<AdminSectionType>("dashboard");
  const [queries, setQueries] = useState<PendingQuery[]>(pendingQueries);
  const [showModal, setShowModal] = useState(false);
  const [advisors, setAdvisors] = useState<Advisor[]>(initialAdvisors);
  const [loading, setLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline' | 'error' | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  
  // ✅ Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fetchAdvisors = async () => {
    setLoading(true);
    try {
      const data = await getAllAdvisors();
      if (data && Array.isArray(data)) {
        const mappedAdvisors: Advisor[] = data.map((advisor: any) => ({
          id: advisor.id,
          name: advisor.name,
          role: advisor.designation || "Financial Consultant",
          tags: advisor.skills || [],
          rating: 4.5,
          reviews: 0,
          fee: advisor.charges || 0,
          exp: advisor.experience || "5+ Years", 
          avatar: advisor.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(advisor.name)}&background=random&color=fff`, 
        }));
        setAdvisors(mappedAdvisors);
        setBackendStatus('online');
      }
    } catch (error: any) {
      setAdvisors(initialAdvisors);
      if (error.response?.status === 403) setBackendStatus('error');
      else setBackendStatus('offline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdvisors();
  }, []);

  const handleQuery = (id: number) => {
    setQueries(q => q.filter((item: PendingQuery) => item.id !== id));
  };

  const handleSaveAdvisor = () => {
    fetchAdvisors();
    setShowModal(false);
  };

  const handleDeleteAdvisor = async (id: number) => {
    if(!window.confirm("Delete this consultant?")) return;
    setDeletingId(id);
    try {
        await deleteAdvisor(id);
        fetchAdvisors();
    } catch (err) {
        alert("Failed to delete consultant");
    } finally {
        setDeletingId(null);
    }
  }

  // Close menu when navigating
  const handleNavClick = (id: AdminSectionType) => {
    setActiveSection(id);
    setIsMobileMenuOpen(false);
  };

  // ✅ ORIGINAL ICONS PRESERVED
  const navItems: AdminNavItem[] = [
    { id: "dashboard", label: "Dashboard", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/><rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2"/></svg> },
    { id: "advisors", label: "Consultants", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> },
    { id: "bookings", label: "Bookings", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> },
    { id: "queries", label: "Queries", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg> },
    { id: "settings", label: "Settings", icon: <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/></svg> },
  ];

  // ✅ ORIGINAL STAT ICONS PRESERVED
  const stats: StatCard[] = [
    { label: "TOTAL BOOKINGS", value: "1,284", change: "+12.5%", positive: true, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#2563EB" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="#2563EB" strokeWidth="2" strokeLinecap="round"/></svg> },
    { label: "ACTIVE CONSULTANTS", value: String(advisors.length), change: "+2", positive: true, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="#7C3AED" strokeWidth="2"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round"/></svg> },
    { label: "TOTAL REVENUE", value: "₹4.2L", change: "+8.2%", positive: true, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="#059669" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    { label: "PENDING QUERIES", value: String(queries.length), change: queries.length < 3 ? `-${3 - queries.length}` : "0", positive: false, icon: <svg width="24" height="24" fill="none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#F59E0B" strokeWidth="2" strokeLinejoin="round"/></svg> },
  ];

  return (
    <div className={styles.page}>
      {showModal && <AddAdvisor onClose={() => setShowModal(false)} onSave={handleSaveAdvisor} />}

      {/* ✅ Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className={styles.mobileOverlay} 
          onClick={() => setIsMobileMenuOpen(false)} 
        />
      )}

      {/* Sidebar - Dynamically uses open class */}
      <div className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.sidebarLogo}>
          <span className={styles.logoText}>FINADVISE</span>
          <span className={styles.adminBadge}>ADMIN</span>
          {/* Close button for mobile */}
          <button className={styles.closeMenuBtn} onClick={() => setIsMobileMenuOpen(false)}>×</button>
        </div>

        <nav className={styles.nav}>
          {navItems.map(n => (
            <button
              key={n.id}
              onClick={() => handleNavClick(n.id as AdminSectionType)}
              className={`${styles.navBtn} ${activeSection === n.id ? styles.navBtnActive : ""}`}
            >
              <span className={styles.navIcon}>{n.icon}</span> {n.label}
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

      {/* Main Content */}
      <div className={styles.main}>
        <div className={styles.topBar}>
          {/* ✅ Hamburger Button (SVG from Heroicons) */}
          <button className={styles.hamburgerBtn} onClick={() => setIsMobileMenuOpen(true)}>
            <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="#0F172A" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className={styles.searchWrapper}>
            <svg className={styles.searchIcon} width="16" height="16" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2"/>
              <path d="m21 21-4.35-4.35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            <input placeholder="Search..." className={styles.searchInput} />
          </div>
          
          <button className={styles.addBtn} onClick={() => setShowModal(true)}>
            + Add New Consultant
          </button>
        </div>

        {backendStatus === 'offline' && (
          <div className={styles.alertWarning}>⚠️ Backend offline. Showing demo data.</div>
        )}

        {/* ... Rest of your sections (Dashboard, Advisors, etc.) ... */}
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
                    <div className={styles.statIcon}>{s.icon}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.chartGrid}>
              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Bookings This Week</h3>
                <div style={{width:'100%', height:200}}>
                  <ResponsiveContainer>
                    <BarChart data={bookingData}>
                      <XAxis dataKey="day" stroke="#94A3B8" style={{ fontSize: 12 }} />
                      <YAxis stroke="#94A3B8" style={{ fontSize: 12 }} />
                      <Tooltip cursor={{ fill: "rgba(37,99,235,0.05)" }} />
                      <Bar dataKey="bookings" fill="#2563EB" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Top Consultants</h3>
                {advisors.slice(0, 3).map((a: Advisor, i: number) => (
                  <div key={a.id} className={styles.advisorRow}>
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
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.tableHead}>
                      {["USER", "CONSULTANT", "TIME", "STATUS", "AMOUNT", ""].map(h => (
                        <td key={h} className={styles.th}>{h}</td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.map((b: RecentBooking, i: number) => (
                      <tr key={i} className={styles.tableRow}>
                        <td className={styles.tdUser}>{b.user}</td>
                        <td className={styles.tdAdvisor}>{b.advisor}</td>
                        <td className={styles.tdTime}>🕗 {b.time}</td>
                        <td><StatusBadge status={b.status} /></td>
                        <td className={styles.tdAmount}>₹{b.amount.toLocaleString()}</td>
                        <td className={styles.tdMore}>⋮</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* CONSULTANTS SECTION */}
        {activeSection === "advisors" && (
          <div>
            <h2 className={styles.pageTitle}>Consultants {loading && "..."}</h2>
            <div className={styles.advisorsGrid}>
              {advisors.map((a: Advisor) => (
                <div key={a.id} className={styles.card}>
                  <div className={styles.advisorCardRow}>
                    <img src={a.avatar} alt={a.name} className={styles.advisorAvatarLg} />
                    <div style={{flex:1}}>
                      <div className={styles.advisorNameLg}>{a.name}</div>
                      <div className={styles.advisorRole}>{a.role}</div>
                      <div className={styles.tagRow}>
                        {a.tags.map((t: string) => <span key={t} className={styles.tag}>{t}</span>)}
                      </div>
                    </div>
                  </div>
                  <div className={styles.advisorCardFooter}>
                    <span>★ {a.rating} ({a.reviews})</span>
                    <span className={styles.advisorFee}>₹{a.fee.toLocaleString()}</span>
                  </div>
                  <button 
                    onClick={() => handleDeleteAdvisor(a.id)} 
                    className={styles.deleteBtn} 
                    disabled={deletingId === a.id}
                  >
                    {deletingId === a.id ? "Deleting..." : "Delete Consultant"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BOOKINGS SECTION */}
        {activeSection === "bookings" && (
          <div>
            <h2 className={styles.pageTitle}>All Bookings</h2>
            <div className={styles.card}>
              <div className={styles.tableResponsive}>
                <table className={styles.table}>
                  <thead>
                    <tr className={styles.tableHead}>
                      {["USER", "CONSULTANT", "TIME", "STATUS", "AMOUNT"].map(h => (
                         <td key={h} className={styles.th}>{h}</td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.map((b, i) => (
                      <tr key={i} className={styles.tableRow}>
                        <td className={styles.tdUser}>{b.user}</td>
                        <td className={styles.tdAdvisor}>{b.advisor}</td>
                        <td className={styles.tdTime}>{b.time}</td>
                        <td><StatusBadge status={b.status} /></td>
                        <td className={styles.tdAmount}>₹{b.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* QUERIES SECTION */}
        {activeSection === "queries" && (
          <div>
            <h2 className={styles.pageTitle}>Pending Queries</h2>
            {queries.map((q) => (
              <div key={q.id} className={styles.queryCard}>
                <div>
                  <div className={styles.queryQuestion}>{q.question}</div>
                  <div className={styles.queryFrom}>User #{q.id}</div>
                </div>
                <div className={styles.queryActions}>
                  <button onClick={() => handleQuery(q.id)} className={styles.approveBtn}>Approve</button>
                  <button onClick={() => handleQuery(q.id)} className={styles.rejectBtn}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SETTINGS SECTION */}
        {activeSection === "settings" && (
          <div>
            <h2 className={styles.pageTitle}>Settings</h2>
            <div className={styles.card}>
              {["General Profile", "Notifications", "Security", "Logout"].map(item => (
                <div key={item} className={styles.settingsRow}>
                  <span className={styles.settingsLabel}>{item}</span>
                  <span>›</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}