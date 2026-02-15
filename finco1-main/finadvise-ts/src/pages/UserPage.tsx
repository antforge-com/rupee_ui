import { useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/StatusBadge.tsx";
import { advisors, categories } from "../data/data.ts";
import type { Advisor, TabType, UserBooking, UserQuery, NavItem } from "../types";
import styles from "../css/UserPage.module.css";

export default function UserPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabType>("advisors");
  const [search, setSearch] = useState<string>("");
  const [category, setCategory] = useState<string>("All Advisors");
  const [bookings, setBookings] = useState<UserBooking[]>([]);
  const [queries, setQueries] = useState<UserQuery[]>([]);
  const [queryText, setQueryText] = useState<string>("");
  const [bookedAdvisor, setBookedAdvisor] = useState<string | null>(null);

  const filtered = advisors.filter((a: Advisor) => {
    const matchSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.role.toLowerCase().includes(search.toLowerCase()) ||
      a.tags.some((t: string) => t.toLowerCase().includes(search.toLowerCase()));
    const matchCat =
      category === "All Advisors" ||
      a.tags.some((t: string) => t.toLowerCase().includes(category.toLowerCase().replace(" experts", ""))) ||
      a.role.toLowerCase().includes(category.toLowerCase().replace(" experts", ""));
    return matchSearch && matchCat;
  });

  const handleBook = (advisor: Advisor) => {
    setBookings(b => [...b, { ...advisor, time: "10:30 AM", status: "Upcoming", date: new Date().toLocaleDateString() }]);
    setBookedAdvisor(advisor.name);
    setTimeout(() => setBookedAdvisor(null), 3000);
  };

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value);
  const handleQueryTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => setQueryText(e.target.value);

  const handleSubmitQuery = () => {
    if (queryText.trim()) {
      setQueries(q => [...q, { text: queryText, status: "Pending" }]);
      setQueryText("");
    }
  };

  const navItems: NavItem[] = [
    { id: "advisors", label: "Advisors", icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="19" cy="8" r="3" stroke="currentColor" strokeWidth="2"/><path d="M22 20c0-2.8-1.8-5-4-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> },
    { id: "bookings", label: "Bookings", icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg> },
    { id: "queries", label: "Queries", icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg> },
    { id: "settings", label: "Settings", icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/></svg> },
  ];

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.header}>
        <button onClick={() => navigate("/")} className={styles.backBtn}>
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <div className={styles.logoSection}>
          <div className={styles.logoText}>FINADVISE</div>
          <div className={styles.logoSub}>EXPERT FINANCIAL GUIDANCE</div>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.bellWrapper}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div className={styles.bellDot} />
          </div>
          <img src="https://randomuser.me/api/portraits/men/85.jpg" alt="" className={styles.avatar} />
        </div>
      </div>

      {/* ── Toast ── */}
      {bookedAdvisor && (
        <div className={styles.toast}>✓ Booked with {bookedAdvisor}!</div>
      )}

      {/* ── Content ── */}
      <div className={styles.content}>

        {/* ADVISORS TAB */}
        {tab === "advisors" && (
          <div className={styles.tabPadding}>
            <div className={styles.searchWrapper}>
              <svg className={styles.searchIcon} width="16" height="16" fill="none" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2"/>
                <path d="m21 21-4.35-4.35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                value={search}
                onChange={handleSearchChange}
                placeholder="Search advisors, expertise..."
                className={styles.searchInput}
              />
            </div>

            <div className={styles.categoryRow}>
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`${styles.categoryBtn} ${category === c ? styles.categoryBtnActive : ""}`}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className={styles.sectionLabel}>AVAILABLE ADVISORS</div>

            {filtered.map((a: Advisor) => (
              <div key={a.id} className={styles.advisorCard}>
                <div className={styles.advisorCardTop}>
                  <div className={styles.advisorImgWrapper}>
                    <img src={a.avatar} alt={a.name} className={styles.advisorImg} />
                    <div className={styles.ratingBadge}>★ {a.rating}</div>
                  </div>
                  <div>
                    <div className={styles.advisorName}>{a.name}</div>
                    <div className={styles.advisorRole}>{a.role}</div>
                    <div className={styles.tagRow}>
                      {a.tags.map(t => (
                        <span key={t} className={styles.tag}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className={styles.advisorCardBottom}>
                  <div>
                    <div className={styles.feeLabel}>Consultation Fee</div>
                    <div className={styles.feeValue}>₹{a.fee.toLocaleString()}</div>
                  </div>
                  <button onClick={() => handleBook(a)} className={styles.bookBtn}>
                    Book Now <span>›</span>
                  </button>
                </div>
                <div className={styles.advisorMeta}>
                  <span>📋 {a.exp} Yrs Exp.</span>
                  <span>⭐ {a.reviews} Reviews</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* BOOKINGS TAB */}
        {tab === "bookings" && (
          <div className={styles.tabPadding}>
            <h2 className={styles.pageTitle}>My Bookings</h2>
            {bookings.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>📅</div>
                <div className={styles.emptyTitle}>No bookings yet</div>
                <div className={styles.emptySubtitle}>Book a consultation from the Advisors tab</div>
              </div>
            ) : bookings.map((b, i) => (
              <div key={i} className={styles.bookingCard}>
                <div className={styles.bookingCardTop}>
                  <div className={styles.bookingName}>{b.name}</div>
                  <StatusBadge status={b.status} />
                </div>
                <div className={styles.bookingRole}>{b.role}</div>
                <div className={styles.bookingCardBottom}>
                  <span>🕐 {b.time}</span>
                  <span className={styles.bookingAmount}>₹{b.fee.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* QUERIES TAB */}
        {tab === "queries" && (
          <div className={styles.tabPadding}>
            <h2 className={styles.pageTitle}>My Queries</h2>
            <div className={styles.queryBox}>
              <textarea
                value={queryText}
                onChange={handleQueryTextChange}
                placeholder="Ask your financial question..."
                className={styles.queryTextarea}
              />
              <button onClick={handleSubmitQuery} className={styles.submitBtn}>
                Submit Query
              </button>
            </div>
            {queries.map((q, i) => (
              <div key={i} className={styles.queryItem}>
                <div className={styles.queryText}>{q.text}</div>
                <StatusBadge status={q.status} />
              </div>
            ))}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === "settings" && (
          <div className={styles.tabPadding}>
            <h2 className={styles.pageTitle}>Settings</h2>

            <div className={styles.settingsCard}>
              {[
                { label: "Personal Information", icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" stroke="#64748B" strokeWidth="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/></svg> },
                { label: "Notification Preferences", icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/></svg> },
                { label: "Payment Methods", icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" stroke="#64748B" strokeWidth="2"/><path d="M2 10h20" stroke="#64748B" strokeWidth="2"/></svg> },
                { label: "Security & Privacy", icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M12 3l7 4v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V7l7-4z" stroke="#64748B" strokeWidth="2" strokeLinejoin="round"/></svg> },
                { label: "Support Center", icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="#64748B" strokeWidth="2"/><path d="M9 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" stroke="#64748B" strokeWidth="2" strokeLinecap="round"/></svg> },
              ].map((item, i, arr) => (
                <div key={item.label} className={`${styles.settingsRow} ${i < arr.length - 1 ? styles.settingsRowBorder : ""}`}>
                  <div className={styles.settingsRowLeft}>
                    {item.icon}
                    <span className={styles.settingsLabel}>{item.label}</span>
                  </div>
                  <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
                    <path d="M9 18l6-6-6-6" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              ))}
            </div>

            <div className={styles.signOutBtn} onClick={() => navigate("/")}>
              Sign Out
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      <div className={styles.bottomNav}>
        {navItems.map(n => (
          <button
            key={n.id}
            onClick={() => setTab(n.id)}
            className={`${styles.navBtn} ${tab === n.id ? styles.navBtnActive : ""}`}
          >
            {n.icon}
            <span className={styles.navLabel}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}