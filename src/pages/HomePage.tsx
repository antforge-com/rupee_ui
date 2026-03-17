import {
  AlertTriangle,
  CheckCircle,
  Gift,
  Mail,
  MessageSquare,
  Send,
  Star,
  User,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Offer {
  id: number;
  title: string;
  description: string;
  discount?: string;
  validUntil?: string;
  validTo?: string;
  validFrom?: string;
  isActive?: boolean;
  active?: boolean;
  approvalStatus?: string;
  status?: string;
  consultantId?: number | null;
  consultantName?: string;
}

interface Review {
  id: number;
  reviewerName: string;
  rating: number;
  reviewText: string;
  consultantName?: string;
  createdAt?: string;
  isApproved?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const BASE = "http://52.55.178.31:8081/api";

// ─────────────────────────────────────────────────────────────────────────────
// FETCH HELPER
// ─────────────────────────────────────────────────────────────────────────────
const safeFetch = async (ep: string): Promise<{ ok: boolean; status: number; data: any }> => {
  try {
    const token = localStorage.getItem("fin_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${ep}`, { headers });
    let data: any = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    return { ok: false, status: 0, data: null };
  }
};

const toArray = (data: any): any[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.content)) return data.content;
  const keys = ["offers", "reviews", "feedbacks", "data", "items", "results"];
  for (const k of keys) if (Array.isArray(data[k])) return data[k];
  if (typeof data === "object" && data.id != null) return [data];
  return [];
};

// ─────────────────────────────────────────────────────────────────────────────
// LOAD OFFERS — only /offers/admin returns 200
// ─────────────────────────────────────────────────────────────────────────────
const loadAllActiveOffers = async (): Promise<Offer[]> => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const { data: adminRaw, status } = await safeFetch("/offers/admin");
  const allOffers = toArray(adminRaw);

  const result = allOffers.filter((o: any) => {
    if (!o?.id || !o?.title) return false;
    if (o.isActive === false && o.active === false) return false;
    const rawStatus = String(o.approvalStatus ?? o.status ?? "").toUpperCase().trim();
    if (rawStatus === "REJECTED") return false;

    const validToRaw = o.validTo ?? o.validUntil;
    if (validToRaw) {
      const d = new Date(validToRaw);
      d.setHours(23, 59, 59, 999);
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      if (!isNaN(d.getTime()) && d < yesterday) return false;
    }
    return true;
  });

  return result as Offer[];
};

// ─────────────────────────────────────────────────────────────────────────────
// LOAD REVIEWS
// ─────────────────────────────────────────────────────────────────────────────
const loadReviews = async (): Promise<Review[]> => {
  const { data: feedbacksData } = await safeFetch("/feedbacks");
  const combined = toArray(feedbacksData);
  const seen = new Set<number>();
  const result: Review[] = [];

  for (const r of combined) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.isApproved === false) continue;
    const reviewText = r.reviewText ?? r.comment ?? r.text ?? r.message ?? r.comments ?? "";
    const rating = Number(r.rating ?? r.feedbackRating ?? r.stars ?? 0);
    if (!reviewText.trim() || !(rating > 0)) continue;
    result.push({
      id: r.id,
      reviewerName: r.reviewerName ?? r.userName ?? r.user?.name ?? r.clientName ?? "Verified Client",
      rating,
      reviewText,
      consultantName: r.consultantName ?? r.consultant?.name ?? "",
      createdAt: r.createdAt ?? r.created_at ?? "",
      isApproved: r.isApproved !== false,
    });
  }

  return result.sort((a, b) => b.rating - a.rating).slice(0, 9);
};

// ─────────────────────────────────────────────────────────────────────────────
// OFFER CARD THEMES — premium professional palette
// ─────────────────────────────────────────────────────────────────────────────
const CARD_THEMES = [
  {
    bg: "linear-gradient(135deg, #0F2557 0%, #1A3A8F 60%, #2563EB 100%)",
    accent: "#60A5FA",
    badge: "#3B82F6",
    shimmer: "rgba(96,165,250,0.15)",
  },
  {
    bg: "linear-gradient(135deg, #064E3B 0%, #065F46 60%, #059669 100%)",
    accent: "#34D399",
    badge: "#10B981",
    shimmer: "rgba(52,211,153,0.15)",
  },
  {
    bg: "linear-gradient(135deg, #1E1B4B 0%, #312E81 60%, #4F46E5 100%)",
    accent: "#A5B4FC",
    badge: "#6366F1",
    shimmer: "rgba(165,180,252,0.15)",
  },
  {
    bg: "linear-gradient(135deg, #7C1D1D 0%, #991B1B 60%, #DC2626 100%)",
    accent: "#FCA5A5",
    badge: "#EF4444",
    shimmer: "rgba(252,165,165,0.15)",
  },
  {
    bg: "linear-gradient(135deg, #78350F 0%, #92400E 60%, #D97706 100%)",
    accent: "#FCD34D",
    badge: "#F59E0B",
    shimmer: "rgba(252,211,77,0.15)",
  },
  {
    bg: "linear-gradient(135deg, #134E4A 0%, #115E59 60%, #0D9488 100%)",
    accent: "#5EEAD4",
    badge: "#14B8A6",
    shimmer: "rgba(94,234,212,0.15)",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const StarRating = ({ rating }: { rating: number }) => (
  <div style={{ display: "flex", gap: 2 }}>
    {[1, 2, 3, 4, 5].map((s) => (
      <Star key={s} size={14}
        fill={s <= Math.round(rating) ? "#F59E0B" : "none"}
        color={s <= Math.round(rating) ? "#F59E0B" : "#D1D5DB"}
        strokeWidth={1.5} />
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const pausedRef = useRef(false);

  const [offers, setOffers]               = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError]     = useState(false);

  const [reviews, setReviews]               = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  const [showContact, setShowContact]       = useState(false);
  const [contactForm, setContactForm]       = useState({ name: "", email: "", message: "" });
  const [contactSending, setContactSending] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError]     = useState("");

  // ── scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  // ── ESC ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setShowContact(false); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  // ── Continuous auto-scroll carousel ────────────────────────────────────
  useEffect(() => {
    const el = carouselRef.current;
    if (!el || offers.length === 0) return;

    const SPEED = 0.6; // px per frame — slow, smooth, premium feel

    const animate = () => {
      if (!pausedRef.current && el) {
        el.scrollLeft += SPEED;
        // When we've scrolled through the first half (original set), snap back silently
        const halfWidth = el.scrollWidth / 2;
        if (el.scrollLeft >= halfWidth) {
          el.scrollLeft -= halfWidth;
        }
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [offers]);

  // ── load offers ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setOffersLoading(true);
    setOffersError(false);
    loadAllActiveOffers()
      .then((data) => { if (!cancelled) setOffers(data); })
      .catch(() => { if (!cancelled) setOffersError(true); })
      .finally(() => { if (!cancelled) setOffersLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── load reviews ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setReviewsLoading(true);
    loadReviews()
      .then((data) => { if (!cancelled) setReviews(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setReviewsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── contact submit ────────────────────────────────────────────────────────
  const handleContactSubmit = async () => {
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      setContactError("Please fill in all fields.");
      return;
    }
    setContactSending(true);
    setContactError("");
    try { await fetch(`${BASE}/contact`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(contactForm) }); } catch {}
    setContactSuccess(true);
    setContactForm({ name: "", email: "", message: "" });
    setContactSending(false);
  };

  return (
    <div className="hp-container">

      {/* ── HEADER ── */}
      <header className={`hp-header${scrolled ? " hp-header-scrolled" : ""}`}>
        <div className="hp-header-inner">
          <div className="hp-logo" style={{ cursor: "pointer" }} onClick={() => navigate("/")}>
            MEET THE <span>MASTERS</span>
          </div>
          <div className="hp-nav-buttons">
            <button onClick={() => navigate("/login")} className="hp-login-btn">Log In</button>
            <button onClick={() => navigate("/register")} className="hp-primary-btn">Get Started</button>
          </div>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="hp-hero">
        <div>
          <h1 className="hp-hero-title">
            Modern Wealth <br />Management <span>Simplified.</span>
          </h1>
          <p className="hp-hero-text">
            Connect with India's top financial consultants. Get personalised
            strategies for wealth creation, tax optimisation, and retirement planning.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 28, flexWrap: "wrap" }}>
            <button onClick={() => navigate("/register")} className="hp-primary-btn"
              style={{ padding: "13px 28px", fontSize: 15, fontWeight: 700 }}>
              Get Started Free
            </button>
            <button onClick={() => navigate("/login")} className="hp-login-btn"
              style={{ padding: "13px 24px", fontSize: 15 }}>
              Log In →
            </button>
          </div>
        </div>
        <div>
          <img
            src="https://wallpapers.com/images/hd/trading-wallpaper-ynfqhj74ml8p96ca.jpg"
            alt="Trading Finance" className="hp-hero-image" />
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="hp-stats-section">
        <div className="hp-stats-grid">
          {[
            { val: "10,000+", lbl: "Active Clients" },
            { val: "₹500 Cr+", lbl: "Assets Managed" },
            { val: "50+",      lbl: "Expert Advisors" },
            { val: "99.9%",    lbl: "Data Security" },
          ].map((s, i) => (
            <div key={i}>
              <div className="hp-stat-value">{s.val}</div>
              <div className="hp-stat-label">{s.lbl}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── OFFERS SECTION ── */}
      <section className="hp-offers-section">
        <div className="hp-section-header">
          <div className="hp-badge-primary"><Gift size={16} /> Special Offers</div>
          <h2 className="hp-section-title">Exclusive Deals For You</h2>
          <p className="hp-section-subtitle">Take advantage of our limited-time offers on consultations</p>
        </div>

        {offersLoading ? (
          <div style={{ display: "flex", gap: 20, padding: "0 40px", overflow: "hidden" }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ flexShrink: 0, width: 300, height: 240, borderRadius: 20,
                background: "linear-gradient(90deg,#E2E8F0 25%,#F1F5F9 50%,#E2E8F0 75%)",
                backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
            ))}
          </div>
        ) : offersError ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: "#94A3B8", fontSize: 14 }}>
            <Gift size={36} style={{ marginBottom: 10, opacity: 0.4 }} />
            <div>Could not load offers. Please try again later.</div>
          </div>
        ) : offers.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 20px", color: "#94A3B8" }}>
            <Gift size={48} style={{ opacity: 0.25, display: "block", margin: "0 auto 14px" }} />
            <div style={{ fontSize: 15, fontWeight: 600, color: "#64748B" }}>No active offers right now</div>
            <p style={{ fontSize: 13, marginTop: 6 }}>Check back soon — new offers are added regularly.</p>
          </div>
        ) : (
          /* ── CAROUSEL WRAPPER ── */
          <div style={{ position: "relative", overflow: "hidden" }}>
            {/* Left fade */}
            <div style={{
              position: "absolute", left: 0, top: 0, bottom: 0, width: 80, zIndex: 2, pointerEvents: "none",
              background: "linear-gradient(to right, var(--hp-bg, #F8FAFC), transparent)",
            }} />
            {/* Right fade */}
            <div style={{
              position: "absolute", right: 0, top: 0, bottom: 0, width: 80, zIndex: 2, pointerEvents: "none",
              background: "linear-gradient(to left, var(--hp-bg, #F8FAFC), transparent)",
            }} />

            {/* Track */}
            <div
              ref={carouselRef}
              onMouseEnter={() => { pausedRef.current = true; }}
              onMouseLeave={() => { pausedRef.current = false; }}
              style={{
                display: "flex",
                gap: 20,
                padding: "12px 40px 24px",
                overflowX: "hidden",
                scrollBehavior: "auto",
                WebkitOverflowScrolling: "touch",
              }}
            >
              {/* Duplicate for seamless loop */}
              {[...offers, ...offers].map((offer, idx) => {
                const theme = CARD_THEMES[offer.id % CARD_THEMES.length];
                return (
                  <div
                    key={`${offer.id}-${idx}`}
                    style={{
                      flexShrink: 0,
                      width: 300,
                      borderRadius: 20,
                      background: theme.bg,
                      padding: "26px 24px 22px",
                      position: "relative",
                      overflow: "hidden",
                      boxShadow: "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.12)",
                      cursor: "pointer",
                      transition: "transform 0.25s ease, box-shadow 0.25s ease",
                      display: "flex",
                      flexDirection: "column",
                      gap: 0,
                      minHeight: 240,
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLDivElement).style.transform = "translateY(-4px) scale(1.015)";
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 16px 48px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.15)";
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLDivElement).style.transform = "none";
                      (e.currentTarget as HTMLDivElement).style.boxShadow = "0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.12)";
                    }}
                  >
                    {/* Decorative circle top-right */}
                    <div style={{
                      position: "absolute", top: -28, right: -28,
                      width: 110, height: 110, borderRadius: "50%",
                      background: theme.shimmer,
                      border: `1.5px solid ${theme.accent}22`,
                    }} />
                    {/* Decorative circle bottom-left */}
                    <div style={{
                      position: "absolute", bottom: -20, left: -16,
                      width: 80, height: 80, borderRadius: "50%",
                      background: theme.shimmer,
                    }} />
                    {/* Subtle dot pattern */}
                    <div style={{
                      position: "absolute", inset: 0, opacity: 0.04,
                      backgroundImage: `radial-gradient(circle, #fff 1px, transparent 1px)`,
                      backgroundSize: "20px 20px",
                      pointerEvents: "none",
                    }} />

                    {/* Top row: icon + discount badge */}
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, position: "relative", zIndex: 1 }}>
                      {/* Icon */}
                      <div style={{
                        width: 42, height: 42, borderRadius: 12,
                        background: "rgba(255,255,255,0.15)",
                        backdropFilter: "blur(8px)",
                        border: `1px solid rgba(255,255,255,0.2)`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <Gift size={20} color="#fff" strokeWidth={1.8} />
                      </div>

                      {/* Discount badge */}
                      {offer.discount && (
                        <div style={{
                          background: "rgba(255,255,255,0.22)",
                          backdropFilter: "blur(8px)",
                          border: "1px solid rgba(255,255,255,0.3)",
                          borderRadius: 30,
                          padding: "5px 12px",
                          fontSize: 11,
                          fontWeight: 800,
                          color: "#fff",
                          letterSpacing: "0.04em",
                          whiteSpace: "nowrap",
                        }}>
                          {offer.discount}
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <div style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: "#fff",
                      lineHeight: 1.3,
                      marginBottom: 8,
                      position: "relative", zIndex: 1,
                      letterSpacing: "-0.01em",
                    }}>
                      {offer.title}
                    </div>

                    {/* Description */}
                    <div style={{
                      fontSize: 12.5,
                      color: "rgba(255,255,255,0.72)",
                      lineHeight: 1.55,
                      marginBottom: 14,
                      position: "relative", zIndex: 1,
                      flex: 1,
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    } as any}>
                      {offer.description || "Limited time offer — book your session today."}
                    </div>

                    {/* Footer row: validity + consultant */}
                    <div style={{ position: "relative", zIndex: 1, marginBottom: 14 }}>
                      {(offer.validUntil || offer.validTo) && (
                        <div style={{
                          display: "inline-flex", alignItems: "center", gap: 5,
                          background: "rgba(255,255,255,0.12)",
                          borderRadius: 20,
                          padding: "4px 10px",
                          fontSize: 11,
                          color: "rgba(255,255,255,0.85)",
                          fontWeight: 600,
                        }}>
                          <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                          </svg>
                          Until {new Date(offer.validUntil || offer.validTo || "").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </div>
                      )}
                      {offer.consultantName && (
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 5 }}>
                          by {offer.consultantName}
                        </div>
                      )}
                    </div>

                    {/* CTA Button */}
                    <button
                      onClick={() => navigate("/register")}
                      style={{
                        width: "100%",
                        padding: "11px 0",
                        borderRadius: 12,
                        border: "1.5px solid rgba(255,255,255,0.35)",
                        background: "rgba(255,255,255,0.15)",
                        backdropFilter: "blur(10px)",
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                        letterSpacing: "0.03em",
                        position: "relative", zIndex: 1,
                        transition: "background 0.2s, border-color 0.2s",
                      }}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.28)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.6)";
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)";
                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.35)";
                      }}
                    >
                      Claim Offer →
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── REVIEWS SECTION ── */}
      <section className="hp-reviews-section">
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="hp-section-header">
            <div className="hp-badge-success"><MessageSquare size={16} /> Client Reviews</div>
            <h2 className="hp-section-title">What Our Clients Say</h2>
            <p className="hp-section-subtitle">Real experiences from our community of satisfied clients</p>
          </div>

          {reviewsLoading ? (
            <div className="hp-reviews-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} style={{ height: 160, borderRadius: 14,
                  background: "linear-gradient(90deg,#F1F5F9 25%,#E2E8F0 50%,#F1F5F9 75%)",
                  backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite" }} />
              ))}
            </div>
          ) : reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "52px 20px", color: "#94A3B8" }}>
              <MessageSquare size={44} style={{ opacity: 0.35, display: "block", margin: "0 auto 12px" }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: "#64748B" }}>No reviews yet</div>
              <p style={{ fontSize: 13, marginTop: 6 }}>Be the first to share your experience after a session.</p>
              <button onClick={() => navigate("/register")}
                style={{ marginTop: 16, padding: "10px 24px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Book a Session →
              </button>
            </div>
          ) : (
            <div className="hp-reviews-grid">
              {reviews.map((review) => (
                <div key={review.id} className="hp-review-card">
                  <StarRating rating={review.rating} />
                  <p className="hp-review-text">"{review.reviewText}"</p>
                  <div className="hp-review-author">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#1E3A5F,#2563EB)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                        {(review.reviewerName || "U").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="hp-review-author-name">{review.reviewerName}</div>
                        {review.consultantName && <div className="hp-review-consultant">Session with {review.consultantName}</div>}
                        {review.createdAt && (
                          <div style={{ fontSize: 10, color: "#9CA3AF", marginTop: 1 }}>
                            {new Date(review.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="hp-footer">
        <div className="hp-footer-inner">
          <div>
            <div className="hp-footer-logo">MEET THE <span>MASTERS</span></div>
            <p className="hp-footer-text">India's trusted platform for expert financial guidance.</p>
          </div>
          <div className="hp-footer-links">
            <div>
              <div className="hp-footer-heading">Product</div>
              <div className="hp-footer-link-list">
                <span>Features</span><span>Consultants</span>
                <span style={{ cursor: "pointer", color: "#93C5FD" }}
                  onClick={() => { setContactSuccess(false); setContactError(""); setShowContact(true); }}>
                  Contact Us
                </span>
              </div>
            </div>
            <div>
              <div className="hp-footer-heading">Legal</div>
              <div className="hp-footer-link-list"><span>Privacy</span><span>Terms</span></div>
            </div>
          </div>
        </div>
        <div className="hp-footer-bottom">© 2026 MEET THE MASTERS. All rights reserved.</div>
      </footer>

      {/* ── CONTACT MODAL ── */}
      {showContact && (
        <div onClick={() => setShowContact(false)} className="hp-contact-modal-overlay">
          <div onClick={(e) => e.stopPropagation()} className="hp-contact-modal-content">
            <div className="hp-contact-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Mail size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Contact Us</div>
                  <div style={{ fontSize: 12, color: "#93C5FD" }}>We'd love to hear from you</div>
                </div>
              </div>
              <button onClick={() => setShowContact(false)}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={18} />
              </button>
            </div>
            <div className="hp-contact-modal-body">
              {contactSuccess ? (
                <div className="hp-contact-success">
                  <CheckCircle size={40} color="#4ADE80" />
                  <div style={{ color: "#4ADE80", fontWeight: 700, fontSize: 15 }}>Message Sent!</div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>We'll get back to you shortly.</div>
                  <button onClick={() => { setShowContact(false); setContactSuccess(false); }}
                    style={{ marginTop: 10, padding: "10px 24px", borderRadius: 10, border: "none", background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="hp-contact-input-wrapper">
                    <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}><User size={18} /></span>
                    <input value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} placeholder="Your Name" className="hp-contact-input" />
                  </div>
                  <div className="hp-contact-input-wrapper">
                    <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}><Mail size={18} /></span>
                    <input value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email Address" type="email" className="hp-contact-input" />
                  </div>
                  <div className="hp-contact-textarea-wrapper">
                    <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0, marginTop: 2 }}><MessageSquare size={18} /></span>
                    <textarea value={contactForm.message} onChange={(e) => setContactForm((f) => ({ ...f, message: e.target.value }))} placeholder="Your message…" rows={4} className="hp-contact-textarea" />
                  </div>
                  {contactError && (
                    <div style={{ color: "#FCA5A5", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <AlertTriangle size={14} /> {contactError}
                    </div>
                  )}
                  <button onClick={handleContactSubmit} disabled={contactSending} className="hp-contact-submit-btn">
                    <Send size={16} />
                    {contactSending ? "Sending…" : "Send Message"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── WHATSAPP ── */}
      <a href="https://wa.me/919999999999" target="_blank" rel="noopener noreferrer"
        title="Chat with us on WhatsApp" className="hp-whatsapp-button">
        <svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 3C8.82 3 3 8.82 3 16c0 2.3.6 4.47 1.65 6.35L3 29l6.85-1.6A13 13 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3z" fill="#fff" />
          <path d="M16 5.5A10.5 10.5 0 0 0 6.08 21.27l.22.35-1.3 4.74 4.88-1.27.34.2A10.5 10.5 0 1 0 16 5.5zm6.15 14.6c-.26.73-1.52 1.4-2.08 1.45-.53.05-1.03.24-3.47-.72-2.93-1.16-4.82-4.15-4.97-4.34-.14-.2-1.18-1.57-1.18-3s.74-2.13 1.02-2.42c.27-.29.59-.36.79-.36l.57.01c.18 0 .43-.07.67.51.26.6.87 2.12.95 2.27.08.15.13.33.03.52-.1.2-.15.32-.3.49-.14.17-.3.38-.43.51-.14.14-.29.29-.12.57.17.28.74 1.22 1.59 1.97 1.09.97 2.01 1.27 2.3 1.41.28.14.44.12.6-.07.17-.2.72-.84.91-1.12.19-.29.38-.24.64-.14.26.1 1.67.79 1.96.93.29.14.48.21.55.33.07.12.07.68-.19 1.41z" fill="#25D366" />
        </svg>
      </a>

      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes spin    { to{transform:rotate(360deg)} }
      `}</style>
    </div>
  );
}