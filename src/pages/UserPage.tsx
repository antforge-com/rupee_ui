import { useState } from "react";
import type { ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/StatusBadge.tsx";
import { advisors, categories } from "../data/data.ts";
import type { Advisor, TabType, UserBooking, UserQuery, NavItem } from "/workspaces/finco1/finadvise-ts/src/types";

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
    {
      id: "advisors", label: "Advisors",
      icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="19" cy="8" r="3" stroke="currentColor" strokeWidth="2"/><path d="M22 20c0-2.8-1.8-5-4-5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
    },
    {
      id: "bookings", label: "Bookings",
      icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
    },
    {
      id: "queries", label: "Queries",
      icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>
    },
    {
      id: "settings", label: "Settings",
      icon: <svg width="20" height="20" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" strokeWidth="2"/></svg>
    },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap'); *, *::before, *::after { box-sizing: border-box; } body { margin: 0; padding: 0; } input:focus, textarea:focus { border-color: #2563EB !important; outline: none; }`}</style>

      {/* ── Header ── */}
      <div style={{ background: "#fff", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #F1F5F9", position: "sticky", top: 0, zIndex: 100 }}>
        {/* Back Button */}
        <button
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: 10, color: "#64748B" }}
        >
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Logo - centered */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 18, color: "#2563EB", letterSpacing: 1 }}>FINADVISE</div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: "#94A3B8", fontWeight: 600 }}>EXPERT FINANCIAL GUIDANCE</div>
        </div>

        {/* Right: Bell + Avatar */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, background: "#EF4444", borderRadius: "50%" }} />
          </div>
          <img src="https://randomuser.me/api/portraits/men/85.jpg" alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid #E2E8F0" }} />
        </div>
      </div>

      {/* ── Toast ── */}
      {bookedAdvisor && (
        <div style={{ position: "fixed", top: 20, right: 20, background: "#16A34A", color: "#fff", padding: "12px 20px", borderRadius: 12, fontWeight: 600, fontSize: 14, zIndex: 9999, boxShadow: "0 8px 24px rgba(22,163,74,0.3)" }}>
          ✓ Booked with {bookedAdvisor}!
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: "auto", paddingBottom: 80 }}>

        {/* ADVISORS TAB */}
        {tab === "advisors" && (
          <div style={{ padding: "16px" }}>
            {/* Search */}
            <div style={{ position: "relative", marginBottom: 14 }}>
              <svg style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} width="16" height="16" fill="none" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8" stroke="#94A3B8" strokeWidth="2"/>
                <path d="m21 21-4.35-4.35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input
                value={search}
                onChange={handleSearchChange}
                placeholder="Search advisors, expertise..."
                style={{ width: "100%", padding: "13px 16px 13px 42px", borderRadius: 12, border: "1.5px solid #E2E8F0", fontSize: 14, fontFamily: "inherit", background: "#fff" }}
              />
            </div>

            {/* Category Tabs */}
            <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 20, paddingBottom: 4 }}>
              {categories.map(c => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  style={{ whiteSpace: "nowrap", padding: "8px 16px", borderRadius: 20, border: category === c ? "none" : "1.5px solid #E2E8F0", background: category === c ? "#EFF6FF" : "#fff", color: category === c ? "#2563EB" : "#64748B", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {c}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11, letterSpacing: 2, fontWeight: 700, color: "#94A3B8", marginBottom: 12 }}>AVAILABLE ADVISORS</div>

            {/* Advisor Cards */}
            {filtered.map((a: Advisor) => (
              <div key={a.id} style={{ background: "#fff", borderRadius: 16, padding: "20px", marginBottom: 12, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <img src={a.avatar} alt={a.name} style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
                    <div style={{ position: "absolute", bottom: -6, right: -6, background: "#16A34A", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 10 }}>
                      ★ {a.rating}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 17, color: "#0F172A" }}>{a.name}</div>
                    <div style={{ fontSize: 13, color: "#64748B", marginBottom: 8 }}>{a.role}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {a.tags.map(t => (
                        <span key={t} style={{ fontSize: 11, padding: "3px 10px", background: "#F1F5F9", borderRadius: 20, color: "#475569", fontWeight: 500 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>Consultation Fee</div>
                    <div style={{ fontWeight: 700, fontSize: 20, color: "#0F172A" }}>₹{a.fee.toLocaleString()}</div>
                  </div>
                  <button
                    onClick={() => handleBook(a)}
                    style={{ background: "#2563EB", color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    Book Now <span>›</span>
                  </button>
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "#64748B" }}>
                  <span>📋 {a.exp} Yrs Exp.</span>
                  <span>⭐ {a.reviews} Reviews</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* BOOKINGS TAB */}
        {tab === "bookings" && (
          <div style={{ padding: 16 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#0F172A" }}>My Bookings</h2>
            {bookings.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#94A3B8" }}>
                <div style={{ fontSize: 40 }}>📅</div>
                <div style={{ marginTop: 12, fontWeight: 600 }}>No bookings yet</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Book a consultation from the Advisors tab</div>
              </div>
            ) : bookings.map((b, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 12, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A" }}>{b.name}</div>
                  <StatusBadge status={b.status} />
                </div>
                <div style={{ fontSize: 13, color: "#64748B" }}>{b.role}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 13, color: "#64748B" }}>
                  <span>🕐 {b.time}</span>
                  <span style={{ fontWeight: 700, color: "#0F172A" }}>₹{b.fee.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* QUERIES TAB */}
        {tab === "queries" && (
          <div style={{ padding: 16 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#0F172A" }}>My Queries</h2>
            <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <textarea
                value={queryText}
                onChange={handleQueryTextChange}
                placeholder="Ask your financial question..."
                style={{ width: "100%", minHeight: 100, padding: 12, borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
              />
              <button
                onClick={handleSubmitQuery}
                style={{ marginTop: 12, background: "#2563EB", color: "#fff", border: "none", borderRadius: 10, padding: "12px 24px", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
              >
                Submit Query
              </button>
            </div>
            {queries.map((q, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 16, padding: 16, marginBottom: 10, boxShadow: "0 1px 8px rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 14, color: "#1E293B", flex: 1 }}>{q.text}</div>
                <StatusBadge status={q.status} />
              </div>
            ))}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === "settings" && (
          <div style={{ padding: 16 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, marginBottom: 20, color: "#0F172A" }}>Settings</h2>
            <div style={{ background: "#fff", borderRadius: 16, padding: 20, marginBottom: 16, boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
                <img src="https://randomuser.me/api/portraits/men/85.jpg" alt="" style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 18, color: "#0F172A" }}>Alex Morgan</div>
                  <div style={{ fontSize: 13, color: "#64748B" }}>alex.morgan@email.com</div>
                </div>
              </div>
              {["Notifications", "Privacy & Security", "Payment Methods", "Help & Support"].map(item => (
                <div key={item} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid #F1F5F9" }}>
                  <span style={{ fontSize: 15, color: "#1E293B" }}>{item}</span>
                  <span style={{ color: "#94A3B8" }}>›</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate("/")}
              style={{ width: "100%", background: "#FEE2E2", color: "#DC2626", border: "none", borderRadius: 12, padding: 14, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}
            >
              Log Out
            </button>
          </div>
        )}
      </div>

      {/* ── Bottom Nav ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: "1px solid #F1F5F9", display: "flex", padding: "8px 0 12px" }}>
        {navItems.map(n => (
          <button
            key={n.id}
            onClick={() => setTab(n.id)}
            style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, color: tab === n.id ? "#2563EB" : "#94A3B8", fontFamily: "'DM Sans', sans-serif" }}
          >
            {n.icon}
            <span style={{ fontSize: 11, fontWeight: 600 }}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
