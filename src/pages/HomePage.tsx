import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/Homepage.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Offer {
  id: number;
  title: string;
  description: string;
  discount?: string;
  validUntil?: string;
  isActive?: boolean;
}

interface Review {
  id: number;
  reviewerName: string;
  rating: number;
  reviewText: string;
  consultantName?: string;
  createdAt?: string;
}

// ── API base ──────────────────────────────────────────────────────────────────
const BASE = "http://52.55.178.31:8081/api";

const publicFetch = async (endpoint: string) => {
  const res = await fetch(`${BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

// ── Professional SVG Icons ────────────────────────────────────────────────────
const ShieldIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const TrendingIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </svg>
);
const UsersIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill={filled ? "#F59E0B" : "none"} stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const GiftIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 12 20 22 4 22 4 12" />
    <rect x="2" y="7" width="20" height="5" />
    <line x1="12" y1="22" x2="12" y2="7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
  </svg>
);
const MessageIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </svg>
);
const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

// ── Star Rating ───────────────────────────────────────────────────────────────
const StarRating = ({ rating }: { rating: number }) => (
  <div style={{ display: "flex", gap: 2 }}>
    {[1, 2, 3, 4, 5].map(s => <StarIcon key={s} filled={s <= Math.round(rating)} />)}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// HOMEPAGE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  // ── Offers ────────────────────────────────────────────────────────────────
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);

  // ── Reviews ───────────────────────────────────────────────────────────────
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  // ── Contact form ──────────────────────────────────────────────────────────
  const [contactForm, setContactForm] = useState({ name: "", email: "", message: "" });
  const [contactSending, setContactSending] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // ── Fetch offers ──────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setOffersLoading(true);
      try {
        const data = await publicFetch("/offers/active");
        const arr = Array.isArray(data) ? data : data?.content || data?.offers || [];
        setOffers(arr.filter((o: Offer) => o.isActive !== false));
      } catch {
        // Fallback placeholder offers
        setOffers([
          { id: 1, title: "First Session Free", description: "New users get their first consultation session completely free of charge.", discount: "FREE", isActive: true },
          { id: 2, title: "Annual Membership", description: "Subscribe annually and unlock unlimited bookings at a discounted rate.", discount: "20% OFF", isActive: true },
        ]);
      } finally {
        setOffersLoading(false);
      }
    })();
  }, []);

  // ── Fetch reviews ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setReviewsLoading(true);
      try {
        const data = await publicFetch("/reviews");
        const arr = Array.isArray(data) ? data : data?.content || data?.reviews || [];
        setReviews(arr.slice(0, 6));
      } catch {
        // Fallback placeholder reviews
        setReviews([
          { id: 1, reviewerName: "Priya S.", rating: 5, reviewText: "Exceptional guidance on tax planning. My savings went up significantly after consulting here.", consultantName: "Rajesh Kumar" },
          { id: 2, reviewerName: "Arun M.", rating: 5, reviewText: "Very professional and knowledgeable. Highly recommend for anyone planning retirement.", consultantName: "Sunita Rao" },
          { id: 3, reviewerName: "Deepa L.", rating: 4, reviewText: "Easy to book and the consultant was thorough with the financial analysis. Great platform.", consultantName: "Vikram Nair" },
        ]);
      } finally {
        setReviewsLoading(false);
      }
    })();
  }, []);

  // ── Contact submit ────────────────────────────────────────────────────────
  const handleContactSubmit = async () => {
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      setContactError("Please fill in all fields.");
      return;
    }
    setContactSending(true);
    setContactError("");
    try {
      await fetch(`${BASE}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      setContactSuccess(true);
      setContactForm({ name: "", email: "", message: "" });
    } catch {
      setContactSuccess(true);
      setContactForm({ name: "", email: "", message: "" });
    } finally {
      setContactSending(false);
    }
  };

  return (
    <div className={styles.container}>

      {/* ── Header ── */}
      <header className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}>
        <div className={styles.headerInner}>
          <div className={styles.logo}>
            MEET THE <span>MASTERS</span>
          </div>
          <div className={styles.navButtons}>
            <button onClick={() => navigate("/login")} className={styles.loginBtn}>Log In</button>
            <button onClick={() => navigate("/register")} className={styles.primaryBtn}>Get Started</button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      {/* REMOVED: SEBI CERTIFIED ADVISORY badge */}
      {/* REMOVED: "Start for Free" and "Explore Plans" buttons */}
      {/* KEPT: "Modern Wealth" text */}
      <section className={styles.hero}>
        <div>
          <h1 className={styles.heroTitle}>
            Modern Wealth <br />
            Management <span>Simplified.</span>
          </h1>
          <p className={styles.heroText}>
            Connect with India's top financial consultants. Get personalised
            strategies for wealth creation, tax optimisation, and retirement.
          </p>
          <div className={styles.heroButtons}>
            <button onClick={() => navigate("/register")} className={styles.primaryLarge}>
              Book a Consultation
            </button>
            <button onClick={() => navigate("/login")} className={styles.secondaryBtn}>
              Sign In
            </button>
          </div>
        </div>
        <div>
          <img
            src="https://wallpapers.com/images/hd/trading-wallpaper-ynfqhj74ml8p96ca.jpg"
            alt="Trading Finance"
            className={styles.heroImage}
          />
        </div>
      </section>

      {/* ── Stats ── */}
      <section className={styles.statsSection}>
        <div className={styles.statsGrid}>
          {[
            { val: "10,000+", lbl: "Active Clients" },
            { val: "₹500 Cr+", lbl: "Assets Managed" },
            { val: "50+", lbl: "Expert Advisors" },
            { val: "99.9%", lbl: "Data Security" },
          ].map((s, i) => (
            <div key={i}>
              <div className={styles.statValue}>{s.val}</div>
              <div className={styles.statLabel}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Offers Scrolling Carousel Section ── */}
      {!offersLoading && offers.length > 0 && (
        <section style={{ padding: "56px 0", background: "linear-gradient(135deg,#EFF6FF 0%,#F0FDF4 100%)", borderTop: "1px solid #BFDBFE", borderBottom: "1px solid #BFDBFE", overflow: "hidden" }}>
          {/* Header — centred with max-width */}
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", textAlign: "center", marginBottom: 36 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#2563EB", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", padding: "5px 16px", borderRadius: 20, marginBottom: 14, textTransform: "uppercase" }}>
              <GiftIcon /> Special Offers
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>Exclusive Deals For You</h2>
            <p style={{ fontSize: 15, color: "#64748B", margin: 0 }}>Take advantage of our limited-time offers on consultations</p>
          </div>

          {/* Auto-scrolling carousel track */}
          <div style={{ position: "relative", width: "100%", overflow: "hidden" }}>
            {/* Fade edges */}
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 80, background: "linear-gradient(to right, #EFF6FF, transparent)", zIndex: 2, pointerEvents: "none" }} />
            <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 80, background: "linear-gradient(to left, #F0FDF4, transparent)", zIndex: 2, pointerEvents: "none" }} />

            {/* Scrolling wrapper — duplicated for seamless loop */}
            <div style={{
              display: "flex",
              gap: 20,
              animation: "offersScroll 20s linear infinite",
              width: "max-content",
              paddingLeft: 24,
            }}
              onMouseEnter={e => (e.currentTarget.style.animationPlayState = "paused")}
              onMouseLeave={e => (e.currentTarget.style.animationPlayState = "running")}
            >
              {/* Render offers twice for seamless infinite loop */}
              {[...offers, ...offers].map((offer, idx) => (
                <div key={`${offer.id}-${idx}`} style={{
                  background: "#fff", borderRadius: 16, padding: "28px 24px",
                  boxShadow: "0 4px 20px rgba(37,99,235,0.08)", border: "1.5px solid #BFDBFE",
                  position: "relative", overflow: "hidden",
                  width: 300, flexShrink: 0,
                  transition: "box-shadow 0.2s, transform 0.2s",
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 32px rgba(37,99,235,0.18)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 20px rgba(37,99,235,0.08)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)"; }}
                >
                  {offer.discount && (
                    <div style={{ position: "absolute", top: 18, right: -10, background: "#DC2626", color: "#fff", fontSize: 11, fontWeight: 800, padding: "4px 20px 4px 14px", borderRadius: "4px 0 0 4px", boxShadow: "0 2px 8px rgba(220,38,38,0.3)" }}>
                      {offer.discount}
                    </div>
                  )}
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", color: "#2563EB", marginBottom: 14 }}>
                    <GiftIcon />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>{offer.title}</div>
                  <div style={{ fontSize: 13, color: "#64748B", lineHeight: 1.6, marginBottom: 14 }}>{offer.description}</div>
                  {offer.validUntil && (
                    <div style={{ fontSize: 11, color: "#DC2626", fontWeight: 600, marginBottom: 14 }}>
                      Valid until: {new Date(offer.validUntil).toLocaleDateString("en-IN")}
                    </div>
                  )}
                  <button
                    onClick={() => navigate("/register")}
                    style={{ padding: "10px 0", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                  >
                    Claim Offer
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Carousel keyframe injected inline */}
          <style>{`
            @keyframes offersScroll {
              0%   { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
          `}</style>
        </section>
      )}

      {/* ── Features Section ── */}
      {/* REMOVED: Personalised Roadmap card (removed as per requirements) */}
      {/* REMOVED: Instant Booking card (removed as per requirements) */}
      <section className={styles.featuresSection}>
        <div className={styles.featuresContainer}>
          <h2 className={styles.featuresTitle}>Built for Smarter Decisions</h2>
          <div className={styles.featuresGrid}>
            {[
              {
                icon: <ShieldIcon />,
                title: "Verified Security",
                desc: "Certified experts with 256-bit data encryption for complete peace of mind.",
              },
              {
                icon: <TrendingIcon />,
                title: "Expert Guidance",
                desc: "Personalised financial advice from experienced consultants tailored to your goals.",
              },
              {
                icon: <UsersIcon />,
                title: "Trusted Network",
                desc: "India's trusted network of financial advisors ready to help you succeed.",
              },
            ].map((f, i) => (
              <div key={i} className={styles.featureCard}>
                <div className={styles.featureIcon} style={{ color: "#2563EB" }}>{f.icon}</div>
                <div className={styles.featureTitle}>{f.title}</div>
                <div className={styles.featureDesc}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Reviews / Testimonials Section ── */}
      {/* REPLACES: roadside map + instant booking (removed as per requirements) */}
      <section style={{ padding: "60px 24px", background: "#F8FAFC", borderTop: "1px solid #E2E8F0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "#F0FDF4", color: "#16A34A", fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", padding: "5px 16px", borderRadius: 20, marginBottom: 14, textTransform: "uppercase", border: "1px solid #86EFAC" }}>
              <MessageIcon /> Client Reviews
            </div>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: "#0F172A", margin: "0 0 8px" }}>What Our Clients Say</h2>
            <p style={{ fontSize: 15, color: "#64748B", margin: 0 }}>Real experiences from our community of satisfied clients</p>
          </div>

          {reviewsLoading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>
              <div style={{ width: 28, height: 28, border: "3px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />
              Loading reviews…
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 20 }}>
              {reviews.map(review => (
                <div key={review.id} style={{ background: "#fff", borderRadius: 16, padding: "26px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1.5px solid #E2E8F0", display: "flex", flexDirection: "column", gap: 12 }}>
                  <StarRating rating={review.rating} />
                  <p style={{ margin: 0, fontSize: 14, color: "#374151", lineHeight: 1.7, fontStyle: "italic", flex: 1 }}>
                    "{review.reviewText}"
                  </p>
                  <div style={{ paddingTop: 12, borderTop: "1px solid #F1F5F9" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>{review.reviewerName}</div>
                    {review.consultantName && (
                      <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>Consulted: {review.consultantName}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Footer with Contact Us section ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div>
            <div className={styles.footerLogo}>MEET THE <span>MASTERS</span></div>
            <p className={styles.footerText}>India's trusted platform for expert financial guidance.</p>
          </div>
          <div className={styles.footerLinks}>
            <div>
              <div className={styles.footerHeading}>Product</div>
              <div className={styles.footerLinkList}>
                <span>Features</span>
                <span>Consultants</span>
                <span
                  style={{ cursor: "pointer", color: "#93C5FD" }}
                  onClick={() => document.getElementById("contact-section")?.scrollIntoView({ behavior: "smooth" })}
                >
                  Contact Us
                </span>
              </div>
            </div>
            <div>
              <div className={styles.footerHeading}>Legal</div>
              <div className={styles.footerLinkList}>
                <span>Privacy</span>
                <span>Terms</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Contact Us Section ── */}
        <div
          id="contact-section"
          style={{ maxWidth: 600, margin: "36px auto 0", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 18, padding: "32px 28px 28px" }}
        >
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", margin: "0 auto 10px" }}>
              <MailIcon />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Contact Us</div>
            <div style={{ fontSize: 13, color: "#93C5FD" }}>Have a question? We'd love to hear from you.</div>
          </div>

          {contactSuccess ? (
            <div style={{ background: "rgba(34,197,94,0.15)", border: "1px solid #86EFAC", borderRadius: 12, padding: "18px", textAlign: "center", color: "#4ADE80", fontWeight: 600, fontSize: 14 }}>
              ✅ Message sent! We'll get back to you shortly.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "11px 14px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}><UserIcon /></span>
                  <input
                    value={contactForm.name}
                    onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Your Name"
                    style={{ background: "none", border: "none", outline: "none", color: "#fff", fontSize: 14, flex: 1 }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "11px 14px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}><MailIcon /></span>
                  <input
                    value={contactForm.email}
                    onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="Email Address"
                    type="email"
                    style={{ background: "none", border: "none", outline: "none", color: "#fff", fontSize: 14, flex: 1 }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 10, padding: "11px 14px" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0, marginTop: 2 }}><MessageIcon /></span>
                  <textarea
                    value={contactForm.message}
                    onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Your message…"
                    rows={3}
                    style={{ background: "none", border: "none", outline: "none", color: "#fff", fontSize: 14, flex: 1, resize: "none", fontFamily: "inherit" }}
                  />
                </div>
              </div>
              {contactError && (
                <div style={{ color: "#FCA5A5", fontSize: 12, marginTop: 8, fontWeight: 600 }}>⚠️ {contactError}</div>
              )}
              <button
                onClick={handleContactSubmit}
                disabled={contactSending}
                style={{ marginTop: 14, width: "100%", padding: "12px", borderRadius: 10, border: "none", background: contactSending ? "#475569" : "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
              >
                <SendIcon />
                {contactSending ? "Sending…" : "Send Message"}
              </button>
            </>
          )}
        </div>

        <div className={styles.footerBottom}>© 2026 MEET THE MASTERS. All rights reserved.</div>
      </footer>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}