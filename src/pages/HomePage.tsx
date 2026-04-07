import {
  AlertTriangle,
  CheckCircle,
  Gift,
  Mail,
  MessageSquare,
  Send,
  Star,
  User,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import logoImg from '../assests/Meetmasterslogopng.png';

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

const BASE = "http://35.154.251.25:8080/api";

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
  } catch {
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

const loadAllActiveOffers = async (): Promise<Offer[]> => {
  const token = localStorage.getItem("fin_token");
  const authH: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const pubH: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const results = await Promise.allSettled([
    fetch(`${BASE}/offers/public`, { headers: pubH, cache: "no-store" }),
    fetch(`${BASE}/offers/admin`, { headers: authH, cache: "no-store" }),
    fetch(`${BASE}/offers`, { headers: authH, cache: "no-store" }),
    fetch(`${BASE}/offers/checkout`, { headers: authH, cache: "no-store" }),
  ]);

  const all: any[] = [];
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const res = r.value;
    if (!res.ok) continue;
    try {
      const data = await res.json();
      all.push(...toArray(data));
    } catch { }
  }

  const seen = new Set<number>();
  const unique = all.filter((o: any) => {
    if (!o?.id || !o?.title) return false;
    const id = Number(o.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return unique.filter((o: any) => {
    const s = String(o.approvalStatus ?? o.status ?? "APPROVED").toUpperCase().trim();
    if (s === "REJECTED" || s === "PENDING") return false;
    // Also respect explicit active/isActive flags when the backend supplies them
    if (o.isActive === false || o.active === false) return false;
    return true;
  }) as Offer[];
};

const loadReviews = async (): Promise<Review[]> => {
  const endpoints = ["/reviews?approved=true", "/reviews", "/feedbacks"];
  let combined: any[] = [];

  for (const ep of endpoints) {
    const { ok, status, data } = await safeFetch(ep);
    if (status === 500) continue;
    if (ok && data) {
      combined = toArray(data);
      if (combined.length > 0) break;
    }
  }

  const seen = new Set<number>();
  const result: Review[] = [];

  for (const r of combined) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.isApproved === false || r.approved === false) continue;
    const reviewText = r.reviewText ?? r.comment ?? r.text ?? r.message ?? r.comments ?? "";
    const rating = Number(r.rating ?? r.feedbackRating ?? r.stars ?? 0);
    // Skip blank content, zero ratings, and low-star entries (< 3) on the public homepage
    if (!reviewText.trim() || !(rating >= 3)) continue;
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

  return result.sort((a, b) => b.rating - a.rating).slice(0, 6);
};

// ── Bold vivid distinct card palette ──
const CARD_THEMES = [
  {
    // Deep Purple → Vivid Violet
    bg: "linear-gradient(145deg, #3B0764 0%, #6B21A8 50%, #7C3AED 100%)",
    accent: "#E879F9", shimmer: "rgba(232,121,249,0.25)", border: "rgba(232,121,249,0.45)",
    glow: "rgba(124,58,237,0.65)", textColor: "#fff", subColor: "rgba(255,255,255,0.80)",
    badgeBg: "rgba(255,255,255,0.14)", badgeColor: "#F0ABFC", dateBg: "rgba(0,0,0,0.20)",
    dateColor: "#F0ABFC", discountBg: "#A855F7", discountColor: "#fff",
    lightning: "#E879F9", accentShape: "#581C87",
  },
  {
    // Vivid Teal → Cyan
    bg: "linear-gradient(145deg, #0C4A6E 0%, #0369A1 50%, #0EA5E9 100%)",
    accent: "#38BDF8", shimmer: "rgba(56,189,248,0.25)", border: "rgba(56,189,248,0.45)",
    glow: "rgba(14,165,233,0.65)", textColor: "#fff", subColor: "rgba(255,255,255,0.80)",
    badgeBg: "rgba(255,255,255,0.14)", badgeColor: "#BAE6FD", dateBg: "rgba(0,0,0,0.20)",
    dateColor: "#BAE6FD", discountBg: "#0284C7", discountColor: "#fff",
    lightning: "#38BDF8", accentShape: "#075985",
  },
  {
    // Vivid Emerald → Green
    bg: "linear-gradient(145deg, #064E3B 0%, #065F46 50%, #059669 100%)",
    accent: "#34D399", shimmer: "rgba(52,211,153,0.25)", border: "rgba(52,211,153,0.45)",
    glow: "rgba(5,150,105,0.65)", textColor: "#fff", subColor: "rgba(255,255,255,0.80)",
    badgeBg: "rgba(255,255,255,0.14)", badgeColor: "#A7F3D0", dateBg: "rgba(0,0,0,0.20)",
    dateColor: "#A7F3D0", discountBg: "#059669", discountColor: "#fff",
    lightning: "#34D399", accentShape: "#065F46",
  },
  {
    // Deep Orange → Red-Orange
    bg: "linear-gradient(145deg, #7C2D12 0%, #C2410C 50%, #EA580C 100%)",
    accent: "#FB923C", shimmer: "rgba(251,146,60,0.25)", border: "rgba(251,146,60,0.45)",
    glow: "rgba(234,88,12,0.65)", textColor: "#fff", subColor: "rgba(255,255,255,0.80)",
    badgeBg: "rgba(255,255,255,0.14)", badgeColor: "#FED7AA", dateBg: "rgba(0,0,0,0.20)",
    dateColor: "#FED7AA", discountBg: "#EA580C", discountColor: "#fff",
    lightning: "#FB923C", accentShape: "#9A3412",
  },
  {
    // Deep Indigo → Blue
    bg: "linear-gradient(145deg, #1E1B4B 0%, #3730A3 50%, #4F46E5 100%)",
    accent: "#818CF8", shimmer: "rgba(129,140,248,0.25)", border: "rgba(129,140,248,0.45)",
    glow: "rgba(79,70,229,0.65)", textColor: "#fff", subColor: "rgba(255,255,255,0.80)",
    badgeBg: "rgba(255,255,255,0.14)", badgeColor: "#C7D2FE", dateBg: "rgba(0,0,0,0.20)",
    dateColor: "#C7D2FE", discountBg: "#4F46E5", discountColor: "#fff",
    lightning: "#818CF8", accentShape: "#312E81",
  },
  {
    // Deep Rose → Pink
    bg: "linear-gradient(145deg, #881337 0%, #BE123C 50%, #E11D48 100%)",
    accent: "#FB7185", shimmer: "rgba(251,113,133,0.25)", border: "rgba(251,113,133,0.45)",
    glow: "rgba(225,29,72,0.65)", textColor: "#fff", subColor: "rgba(255,255,255,0.80)",
    badgeBg: "rgba(255,255,255,0.14)", badgeColor: "#FECDD3", dateBg: "rgba(0,0,0,0.20)",
    dateColor: "#FECDD3", discountBg: "#E11D48", discountColor: "#fff",
    lightning: "#FB7185", accentShape: "#9F1239",
  },
];
const getOfferLabel = (offer: Offer): { label: string; style: React.CSSProperties } | null => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

  const validToRaw = offer.validTo ?? offer.validUntil;
  if (validToRaw) {
    const d = new Date(validToRaw); d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) {
      return {
        label: "🔥 LAST CALL",
        style: {
          background: "linear-gradient(135deg, #DC2626, #EF4444)",
          color: "#fff", padding: "3px 10px", borderRadius: 20,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.8px",
          animation: "pulse 1.5s ease-in-out infinite",
          boxShadow: "0 2px 12px rgba(220,38,38,0.5)",
        },
      };
    }
  }

  const validFromRaw = offer.validFrom;
  if (validFromRaw) {
    const d = new Date(validFromRaw); d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime() || d.getTime() === tomorrow.getTime()) {
      return {
        label: "✨ NEW",
        style: {
          background: "linear-gradient(135deg, #0891B2, #06B6D4)",
          color: "#fff", padding: "3px 10px", borderRadius: 20,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.8px",
          boxShadow: "0 2px 12px rgba(6,182,212,0.5)",
        },
      };
    }
  }
  return null;
};

const StarRating: React.FC<{ rating: number }> = ({ rating }) => (
  <div style={{ display: "flex", gap: 2 }}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} size={13}
        fill={i <= rating ? "#F59E0B" : "#E2E8F0"}
        stroke={i <= rating ? "#F59E0B" : "#E2E8F0"}
        strokeWidth={1.5} />
    ))}
  </div>
);

export default function HomePage() {
  const navigate = useNavigate();
  const offersRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [contactForm, setContactForm] = useState({ name: "", email: "", message: "" });
  const [contactError, setContactError] = useState("");
  const [contactSending, setContactSending] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState(false);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);

  const [slideIdx, setSlideIdx] = useState(0);
  const [slideAnimating, setSlideAnimating] = useState(false);
  const slideTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const offersPanelRef = useRef<HTMLDivElement>(null);
  const isWheelLocked = useRef(false);

  // ── Drag-to-scroll state ──
  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);

  const goToSlide = (idx: number, total: number) => {
    if (slideAnimating) return;
    setSlideAnimating(true);
    setSlideIdx(((idx % total) + total) % total);
    setTimeout(() => setSlideAnimating(false), 400);
  };

  const resetTimer = (total: number) => {
    if (slideTimerRef.current) clearInterval(slideTimerRef.current);
    if (total <= 1) return;
    slideTimerRef.current = setInterval(() => {
      setSlideIdx(prev => (prev + 1) % total);
    }, 4000);
  };

  const handleDragStart = (clientX: number) => {
    dragStartX.current = clientX;
    isDragging.current = false;
    if (slideTimerRef.current) clearInterval(slideTimerRef.current);
  };

  const handleDragMove = (clientX: number) => {
    if (dragStartX.current === null) return;
    if (Math.abs(clientX - dragStartX.current) > 8) {
      isDragging.current = true;
    }
  };

  const handleDragEnd = (clientX: number, total: number) => {
    if (dragStartX.current === null) return;
    const diff = clientX - dragStartX.current;
    if (isDragging.current && Math.abs(diff) > 40) {
      const direction = diff < 0 ? 1 : -1;
      goToSlide(slideIdx + direction, total);
    }
    dragStartX.current = null;
    isDragging.current = false;
    resetTimer(total);
  };

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") { setShowContact(false); setMobileMenuOpen(false); } };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchOffers = () => {
      setOffersError(false);
      loadAllActiveOffers()
        .then((data) => { if (!cancelled) { setOffers(data); setOffersLoading(false); } })
        .catch(() => { if (!cancelled) { setOffersError(true); setOffersLoading(false); } });
    };
    fetchOffers();
    const interval = setInterval(fetchOffers, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    const total = Math.min(offers.length, 6);
    if (total > 1) {
      resetTimer(total);
      return () => { if (slideTimerRef.current) clearInterval(slideTimerRef.current); };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers.length]);

  // Clamp slideIdx when the offer count shrinks (e.g. after a background refresh).
  // Use offers.length directly — totalSlides is derived below this block and
  // cannot be referenced here without a TS2448 "used before declaration" error.
  useEffect(() => {
    const total = Math.min(offers.length, 6);
    if (total > 0 && slideIdx >= total) {
      setSlideIdx(total - 1);
    }
  }, [offers.length, slideIdx]);

  useEffect(() => {
    let cancelled = false;
    setReviewsLoading(true);
    loadReviews()
      .then((data) => { if (!cancelled) setReviews(data); })
      .catch(() => { })
      .finally(() => { if (!cancelled) setReviewsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Derived slide count — must be before any useEffect that uses it ──
  const displayOffers = offers.slice(0, 6);
  const totalSlides = displayOffers.length;

  // ── Scroll-wheel to flip offer cards ──
  useEffect(() => {
    const el = offersPanelRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (totalSlides <= 1) return;
      e.preventDefault();
      e.stopPropagation();
      if (isWheelLocked.current) return;
      isWheelLocked.current = true;
      const dir = e.deltaY > 0 ? 1 : -1;
      setSlideIdx(prev => ((prev + dir) % totalSlides + totalSlides) % totalSlides);
      if (slideTimerRef.current) clearInterval(slideTimerRef.current);
      setTimeout(() => {
        isWheelLocked.current = false;
        resetTimer(totalSlides);
      }, 650);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalSlides]);

  const handleContactSubmit = async () => {
    if (!contactForm.name.trim() || !contactForm.email.trim() || !contactForm.message.trim()) {
      setContactError("Please fill in all fields.");
      return;
    }
    setContactSending(true);
    setContactError("");
    let backendSuccess = false;
    try {
      const res = await fetch(`${BASE}/contact/public/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: contactForm.name.trim(), email: contactForm.email.trim(), message: contactForm.message.trim() }),
      });
      if (res.ok || res.status === 201) backendSuccess = true;
    } catch { }
    const submission = { id: Date.now(), ...contactForm, submittedAt: new Date().toISOString(), read: false, syncedToBackend: backendSuccess };
    try {
      const existing = JSON.parse(localStorage.getItem("fin_contact_submissions") || "[]");
      localStorage.setItem("fin_contact_submissions", JSON.stringify([submission, ...existing]));
    } catch { }
    setContactSuccess(true);
    setContactForm({ name: "", email: "", message: "" });
    setContactSending(false);
  };

  const handleClaimOffer = (offer: Offer) => {
    localStorage.setItem("fin_pending_offer", JSON.stringify({
      id: offer.id, title: offer.title, description: offer.description,
      discount: offer.discount, consultantId: offer.consultantId, consultantName: offer.consultantName,
    }));
    // If already authenticated, go straight to the user dashboard where they can book
    const token = localStorage.getItem("fin_token");
    navigate(token ? "/user" : "/login");
  };

  return (
    <div className="hp-container">

      {/* ── HEADER ── */}
      <header className={`hp-header${scrolled ? " hp-header-scrolled" : ""}`}>
        <div className="hp-header-inner">

          <div className="hp-logo"
            style={{ cursor: "pointer" }}
            onClick={() => navigate("/")}>
            <img src={logoImg} alt="Meet The Masters"
              style={{ height: 76, width: "auto", objectFit: "contain", display: "block" }} />
          </div>

          {/* ── MEET THE MASTERS — perfectly centred in the header ── */}
          <div style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", pointerEvents: "none",
          }}>
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "0.08em", color: "#fff", whiteSpace: "nowrap" }}>
              MEET THE <span style={{ color: "#60A5FA" }}>MASTERS</span>
            </span>
          </div>

          <div className="hp-nav-buttons hp-desktop-nav">
            <button onClick={() => navigate("/login")} className="hp-login-btn">Sign In</button>
            <button onClick={() => navigate("/register")} className="hp-primary-btn">Create Account</button>
          </div>

          <button
            className="hp-hamburger"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2, transition: "all 0.3s", transform: mobileMenuOpen ? "rotate(45deg) translateY(7px)" : "none" }} />
            <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2, marginTop: 5, transition: "all 0.3s", opacity: mobileMenuOpen ? 0 : 1 }} />
            <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2, marginTop: 5, transition: "all 0.3s", transform: mobileMenuOpen ? "rotate(-45deg) translateY(-7px)" : "none" }} />
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="hp-mobile-menu">
            <button onClick={() => { navigate("/login"); setMobileMenuOpen(false); }} className="hp-mobile-menu-btn hp-login-btn">Log In</button>
            <button onClick={() => { navigate("/register"); setMobileMenuOpen(false); }} className="hp-mobile-menu-btn hp-primary-btn">Get Started</button>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <section className="hp-hero">

        {/* LEFT: hero card */}
        <div className="hp-hero-left">
          {/* invisible spacer — matches the height of the offers header so both cards align */}
          <div className="hp-hero-spacer" aria-hidden="true">
            <div className="hp-badge-primary" style={{ opacity: 0, pointerEvents: "none" }}><Gift size={13} /> Special Offers</div>
            <h2 className="hp-offers-title" style={{ opacity: 0, pointerEvents: "none" }}>Exclusive Deals For You</h2>
            <p className="hp-offers-subtitle" style={{ opacity: 0, pointerEvents: "none" }}>Limited-time offers on expert consultations</p>
          </div>
          <div className="hp-hero-text-block">
            <h1 className="hp-hero-title">
              Access Industry
              Experts, <br />
              Gain Real<span> Insights.</span>
            </h1>
            <p className="hp-hero-sub">Experience The Experience</p>
          </div>
        </div>

        {/* RIGHT: offers panel */}
        <div className="hp-hero-right" ref={offersRef}>
          <div className="hp-offers-header">
            <div className="hp-badge-primary">
              <Gift size={13} /> Special Offers
            </div>
            <h2 className="hp-offers-title">Exclusive Deals For You</h2>
            <p className="hp-offers-subtitle">Limited-time offers on expert consultations</p>
          </div>

          {offersLoading ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 320, background: "#fff", borderRadius: 20,
              boxShadow: "0 4px 24px rgba(37,99,235,0.08)", border: "1px solid #EEF2F8"
            }}>
              <img src={logoImg} alt="Meet The Masters"
                style={{
                  width: 48, height: "auto", display: "block",
                  animation: "mtmPulse 1.8s ease-in-out infinite"
                }} />
            </div>
          ) : offersError || displayOffers.length === 0 ? (
            <div style={{
              borderRadius: 20, padding: 32,
              background: "linear-gradient(145deg,#134E4A,#0D9488)",
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: 10, color: "#fff", textAlign: "center",
            }}>
              <Gift size={36} style={{ opacity: 0.7 }} />
              <div style={{ fontWeight: 700, fontSize: 15 }}>Offers Coming Soon</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Check back for exclusive deals on expert sessions</div>
            </div>
          ) : (
            /* ── PEEK CAROUSEL ── */
            <div
              ref={offersPanelRef}
              style={{
                position: "relative", userSelect: "none", flex: 1, display: "flex", flexDirection: "column",
                borderRadius: 24,
                overflow: "hidden",
                padding: "14px 0",
              }}
              onMouseDown={(e) => handleDragStart(e.clientX)}
              onMouseMove={(e) => handleDragMove(e.clientX)}
              onMouseUp={(e) => handleDragEnd(e.clientX, totalSlides)}
              onMouseLeave={(e) => { if (dragStartX.current !== null) handleDragEnd(e.clientX, totalSlides); }}
              onTouchStart={(e) => handleDragStart(e.touches[0].clientX)}
              onTouchMove={(e) => handleDragMove(e.touches[0].clientX)}
              onTouchEnd={(e) => handleDragEnd(e.changedTouches[0].clientX, totalSlides)}
            >
              {/* Card viewport */}
              <div style={{
                position: "relative",
                flex: 1,
                minHeight: 360,
                overflow: "hidden",
                borderRadius: 20,
              }}
              >
                {displayOffers.map((offer, i) => {
                  const theme = CARD_THEMES[i % CARD_THEMES.length];
                  const labelInfo = getOfferLabel(offer);

                  // Normalise offset so we always pick shortest arc
                  let offset = i - slideIdx;
                  if (offset > totalSlides / 2) offset -= totalSlides;
                  if (offset < -totalSlides / 2) offset += totalSlides;

                  const isActive = offset === 0;
                  const isNext = offset === 1;
                  const isPrev = offset === -1;

                  // Peek carousel — side cards clearly visible at edges
                  let tx = "0%", sc = 1, op = 0, zi = 0;
                  if (isActive) { tx = "0%"; sc = 1; op = 1; zi = 3; }
                  else if (isNext) { tx = "68%"; sc = 0.90; op = 1; zi = 2; }
                  else if (isPrev) { tx = "-68%"; sc = 0.90; op = 1; zi = 2; }
                  else { tx = offset > 0 ? "200%" : "-200%"; sc = 0.85; op = 0; zi = 1; }

                  return (
                    <div
                      key={offer.id}
                      onClick={() => {
                        if (!isActive && (isNext || isPrev)) {
                          setSlideIdx(i);
                          if (slideTimerRef.current) clearInterval(slideTimerRef.current);
                          resetTimer(totalSlides);
                        }
                      }}
                      style={{
                        position: "absolute",
                        top: "4%", bottom: "4%",
                        left: "6%",
                        width: "88%",
                        display: "flex",
                        flexDirection: "column",
                        background: theme.bg,
                        padding: "28px 28px 22px",
                        overflow: "hidden",
                        borderRadius: 20,
                        border: "none",
                        opacity: op,
                        transform: `translateX(${tx}) scale(${sc})`,
                        filter: isActive ? "none" : "brightness(0.75)",
                        transformOrigin: isNext ? "left center" : isPrev ? "right center" : "center center",
                        transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease, filter 0.35s ease",
                        zIndex: zi,
                        pointerEvents: (isActive || isNext || isPrev) ? "auto" : "none",
                        cursor: isActive ? "default" : "pointer",
                        boxShadow: isActive ? "0 8px 32px rgba(0,0,0,0.18)" : "0 4px 16px rgba(0,0,0,0.10)",
                      }}
                    >
                      {/* ── Geometric decorations (lightning bolts + shapes) ── */}
                      {/* Big glow orb */}
                      <div style={{ position: "absolute", top: -50, right: -50, width: 200, height: 200, borderRadius: "50%", background: theme.shimmer, filter: "blur(32px)", pointerEvents: "none" }} />
                      <div style={{ position: "absolute", bottom: -40, left: -30, width: 150, height: 150, borderRadius: "50%", background: theme.shimmer, filter: "blur(24px)", pointerEvents: "none" }} />

                      {/* Lightning bolt top-right */}
                      <svg style={{ position: "absolute", top: 14, right: 18, opacity: 0.55, pointerEvents: "none" }} width="22" height="38" viewBox="0 0 22 38" fill="none">
                        <path d="M13 0L0 22H10L9 38L22 16H12L13 0Z" fill={theme.lightning} />
                      </svg>
                      {/* Lightning bolt bottom-left small */}
                      <svg style={{ position: "absolute", bottom: 52, left: 14, opacity: 0.35, pointerEvents: "none" }} width="14" height="24" viewBox="0 0 22 38" fill="none">
                        <path d="M13 0L0 22H10L9 38L22 16H12L13 0Z" fill={theme.lightning} />
                      </svg>
                      {/* Arrow right */}
                      <svg style={{ position: "absolute", top: "50%", right: 10, opacity: 0.22, pointerEvents: "none", transform: "translateY(-50%)" }} width="18" height="18" viewBox="0 0 24 24" fill={theme.accent}>
                        <path d="M5 12h14M13 6l6 6-6 6" stroke={theme.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </svg>
                      {/* Accent square top-left rotated */}
                      <div style={{ position: "absolute", top: -14, left: 36, width: 32, height: 32, background: theme.accentShape, opacity: 0.45, transform: "rotate(20deg)", borderRadius: 4, pointerEvents: "none" }} />
                      {/* Small circle accent */}
                      <div style={{ position: "absolute", bottom: 38, right: 52, width: 12, height: 12, borderRadius: "50%", background: theme.accent, opacity: 0.5, pointerEvents: "none" }} />

                      {/* ── Top row: badge + discount pill ── */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, position: "relative", zIndex: 1 }}>
                        {labelInfo ? (
                          <div style={labelInfo.style}>{labelInfo.label}</div>
                        ) : (
                          <div style={{ background: theme.badgeBg, borderRadius: 20, padding: "4px 12px", fontSize: 10, fontWeight: 800, color: theme.badgeColor, letterSpacing: "1px", border: `1px solid ${theme.border}`, textTransform: "uppercase" }}>
                            ✦ Exclusive Offer
                          </div>
                        )}
                        {offer.discount && (
                          <div style={{ background: theme.discountBg, borderRadius: 22, padding: "6px 18px", fontSize: 16, fontWeight: 900, color: theme.discountColor, letterSpacing: "-0.5px", boxShadow: `0 4px 16px ${theme.glow}`, border: `1.5px solid rgba(255,255,255,0.2)` }}>
                            {offer.discount}
                          </div>
                        )}
                      </div>

                      {/* ── Central icon (large, bold, centered-ish) ── */}
                      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12, position: "relative", zIndex: 1 }}>
                        <div style={{
                          width: 56, height: 56, borderRadius: 16, flexShrink: 0,
                          background: `linear-gradient(135deg, ${theme.accentShape}, ${theme.discountBg})`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          border: `2px solid ${theme.border}`,
                          boxShadow: `0 6px 24px ${theme.glow}, inset 0 1px 0 rgba(255,255,255,0.18)`,
                        }}>
                          <Gift size={26} color="#fff" strokeWidth={2} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: theme.textColor, lineHeight: 1.25, letterSpacing: "-0.3px", textShadow: `0 2px 16px ${theme.glow}` }}>
                            {offer.title}
                          </div>
                        </div>
                      </div>

                      {/* ── Description ── */}
                      <div style={{ fontSize: 12.5, color: theme.subColor, lineHeight: 1.65, position: "relative", zIndex: 1, marginBottom: 4 }}>
                        {offer.description || "Limited-time offer — book your expert session today."}
                      </div>

                      {/* ── Bottom: expiry + CTA ── */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: 16, position: "relative", zIndex: 1 }}>
                        {(offer.validUntil || offer.validTo) ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: theme.dateBg, borderRadius: 20, padding: "5px 12px", fontSize: 11, color: theme.dateColor, fontWeight: 700, border: `1px solid ${theme.border}` }}>
                            <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                            Ends {new Date(offer.validUntil || offer.validTo || "").toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                          </div>
                        ) : <div />}
                        <button
                          onClick={(e) => { e.stopPropagation(); if (isActive) handleClaimOffer(offer); }}
                          style={{ padding: "10px 24px", borderRadius: 12, border: `1.5px solid rgba(255,255,255,0.25)`, background: theme.discountBg, color: theme.discountColor, fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all 0.2s", letterSpacing: "0.04em", boxShadow: `0 4px 20px ${theme.glow}` }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 28px ${theme.glow}`; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 20px ${theme.glow}`; }}
                        >
                          Claim Offer →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Scroll hint label */}
              {totalSlides > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14 }}>
                  {displayOffers.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setSlideIdx(i); if (slideTimerRef.current) clearInterval(slideTimerRef.current); resetTimer(totalSlides); }}
                      style={{
                        width: i === slideIdx ? 22 : 7,
                        height: 7,
                        borderRadius: 4,
                        border: "none",
                        background: i === slideIdx ? "#2563EB" : "#CBD5E1",
                        cursor: "pointer",
                        padding: 0,
                        transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
                        boxShadow: i === slideIdx ? "0 2px 8px rgba(37,99,235,0.45)" : "none",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>



      {/* ── REVIEWS ── */}
      <section id="reviews" className="hp-reviews-section">
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="hp-section-header">
            <div className="hp-badge-success"><MessageSquare size={14} /> Client Reviews</div>
            <h2 className="hp-section-title">What Our Clients Say</h2>
            <p className="hp-section-subtitle">Real experiences from our community of satisfied clients</p>
          </div>

          {reviewsLoading ? (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 200, background: "#fff", borderRadius: 20,
              boxShadow: "0 4px 24px rgba(37,99,235,0.08)", border: "1px solid #EEF2F8"
            }}>
              <img src={logoImg} alt="Meet The Masters"
                style={{
                  width: 48, height: "auto", display: "block",
                  animation: "mtmPulse 1.8s ease-in-out infinite"
                }} />
            </div>
          ) : reviews.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: "#94A3B8" }}>
              <MessageSquare size={44} style={{ opacity: 0.3, display: "block", margin: "0 auto 14px" }} />
              <div style={{ fontSize: 16, fontWeight: 600, color: "#64748B" }}>No reviews yet</div>
              <p style={{ fontSize: 13, marginTop: 8 }}>Be the first to share your experience after a session.</p>
              <button onClick={() => navigate("/register")}
                style={{ marginTop: 20, padding: "12px 28px", background: "#2563EB", color: "#fff", border: "none", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
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
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%",
                        background: "linear-gradient(135deg,#1D4ED8,#2563EB)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0,
                        boxShadow: "0 2px 8px rgba(37,99,235,0.35)",
                      }}>
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
            <div className="hp-footer-logo" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <img src={logoImg} alt="Meet The Masters"
                style={{
                  height: 64, width: "auto", objectFit: "contain",
                  filter: "brightness(0) invert(1)", display: "block"
                }} />
            </div>
          </div>
          <div className="hp-footer-links">
            <div>
              <div className="hp-footer-heading">Product</div>
              <div className="hp-footer-link-list">
                <span>Features</span>
                <span>Consultants</span>
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
                <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(255,255,255,0.12)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Mail size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Contact Us</div>
                  <div style={{ fontSize: 12, color: "#93C5FD" }}>We'd love to hear from you</div>
                </div>
              </div>
              <button onClick={() => setShowContact(false)} style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 34, height: 34, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <X size={16} />
              </button>
            </div>
            <div className="hp-contact-modal-body">
              {contactSuccess ? (
                <div className="hp-contact-success">
                  <CheckCircle size={44} color="#4ADE80" />
                  <div style={{ color: "#4ADE80", fontWeight: 700, fontSize: 16 }}>Message Sent!</div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>We'll get back to you shortly.</div>
                  <button onClick={() => { setShowContact(false); setContactSuccess(false); }}
                    style={{ marginTop: 12, padding: "10px 28px", borderRadius: 12, border: "none", background: "#2563EB", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="hp-contact-input-wrapper">
                    <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}><User size={17} /></span>
                    <input value={contactForm.name} onChange={(e) => setContactForm(f => ({ ...f, name: e.target.value }))} placeholder="Your Name" className="hp-contact-input" />
                  </div>
                  <div className="hp-contact-input-wrapper">
                    <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}><Mail size={17} /></span>
                    <input value={contactForm.email} onChange={(e) => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="Email Address" type="email" className="hp-contact-input" />
                  </div>
                  <div className="hp-contact-textarea-wrapper">
                    <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0, marginTop: 2 }}><MessageSquare size={17} /></span>
                    <textarea value={contactForm.message} onChange={(e) => setContactForm(f => ({ ...f, message: e.target.value }))} placeholder="Your message…" rows={4} className="hp-contact-textarea" />
                  </div>
                  {contactError && (
                    <div style={{ color: "#FCA5A5", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <AlertTriangle size={13} /> {contactError}
                    </div>
                  )}
                  <button onClick={handleContactSubmit} disabled={contactSending} className="hp-contact-submit-btn">
                    <Send size={15} />
                    {contactSending ? "Sending…" : "Send Message"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── WHATSAPP ── */}
      <a href="https://wa.me/919553453534" target="_blank" rel="noopener noreferrer" title="Chat with us on WhatsApp" className="hp-whatsapp-button">
        <svg viewBox="0 0 32 32" width="28" height="28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16 3C8.82 3 3 8.82 3 16c0 2.3.6 4.47 1.65 6.35L3 29l6.85-1.6A13 13 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3z" fill="#fff" />
          <path d="M16 5.5A10.5 10.5 0 0 0 6.08 21.27l.22.35-1.3 4.74 4.88-1.27.34.2A10.5 10.5 0 1 0 16 5.5zm6.15 14.6c-.26.73-1.52 1.4-2.08 1.45-.53.05-1.03.24-3.47-.72-2.93-1.16-4.82-4.15-4.97-4.34-.14-.2-1.18-1.57-1.18-3s.74-2.13 1.02-2.42c.27-.29.59-.36.79-.36l.57.01c.18 0 .43-.07.67.51.26.6.87 2.12.95 2.27.08.15.13.33.03.52-.1.2-.15.32-.3.49-.14.17-.3.38-.43.51-.14.14-.29.29-.12.57.17.28.74 1.22 1.59 1.97 1.09.97 2.01 1.27 2.3 1.41.28.14.44.12.6-.07.17-.2.72-.84.91-1.12.19-.29.38-.24.64-.14.26.1 1.67.79 1.96.93.29.14.48.21.55.33.07.12.07.68-.19 1.41z" fill="#25D366" />
        </svg>
      </a>

      {/* ── STYLES ── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        .hp-container {
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          background: var(--hp-bg, #F8FAFC);
          color: #0F172A;
          min-height: 100vh;
          overflow-x: hidden;
          min-width: 320px;
        }

        /* ═══════════════ HEADER ═══════════════ */
        .hp-header {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          background: #0F172A;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          transition: all 0.3s ease;
        }
        .hp-header-scrolled {
          background: #0F172A;
          box-shadow: 0 2px 32px rgba(0,0,0,0.4);
        }
        .hp-header-inner {
          width: 100%;
          padding: 0 24px 0 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 84px;
          gap: 16px;
          position: relative;
        }
        .hp-logo {
          font-size: 18px; font-weight: 900; letter-spacing: -0.5px;
          color: #fff; flex-shrink: 0;
        }
        .hp-logo span { color: #60A5FA; }

        .hp-nav-buttons { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

        .hp-hamburger {
          display: none;
          flex-direction: column;
          background: none; border: none; cursor: pointer;
          padding: 4px;
        }
        .hp-mobile-menu {
          display: none;
          flex-direction: column; gap: 10px;
          padding: 16px 24px;
          background: rgba(4,8,24,0.98);
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .hp-mobile-menu-btn { width: 100%; text-align: center; }

        /* ═══════════════ BUTTONS ═══════════════ */
        .hp-login-btn {
          padding: 8px 20px; border-radius: 10px;
          border: 1.5px solid rgba(255,255,255,0.25); background: transparent;
          color: rgba(255,255,255,0.85); font-size: 14px; font-weight: 600;
          cursor: pointer; font-family: inherit;
          transition: all 0.2s ease;
        }
        .hp-login-btn:hover { border-color: rgba(255,255,255,0.6); color: #fff; background: rgba(255,255,255,0.08); }

        .hp-primary-btn {
          padding: 8px 20px; border-radius: 10px;
          border: none; background: #2563EB;
          color: #fff; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(37,99,235,0.3);
        }
        .hp-primary-btn:hover { background: #1D4ED8; box-shadow: 0 4px 16px rgba(37,99,235,0.4); transform: translateY(-1px); }

        .hp-cta-btn {
          padding: 10px 24px !important;
          font-size: 14px !important;
          border-radius: 12px !important;
          box-shadow: 0 4px 20px rgba(37,99,235,0.35) !important;
        }

        .hp-ghost-btn {
          padding: 10px 20px; border-radius: 12px;
          border: 1.5px solid #CBD5E1; background: transparent;
          color: #475569; font-size: 14px; font-weight: 600;
          cursor: pointer; font-family: inherit;
          transition: all 0.2s ease;
        }
        .hp-ghost-btn:hover { border-color: #2563EB; color: #2563EB; background: #EFF6FF; }

        .hp-hero-btn-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 8px;
          flex-wrap: wrap;
        }

        /* ═══════════════ HERO ═══════════════ */
        .hp-hero {
          width: 100%;
          padding: 128px 32px 60px 32px;
          display: flex;
          align-items: stretch;
          gap: 48px;
          max-width: 1280px;
          margin: 0 auto;
          box-sizing: border-box;
        }

        /* Left col: stretches to fill, hero card fills full height */
        .hp-hero-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* invisible spacer — same element structure as hp-offers-header */
        .hp-hero-spacer {
          display: flex;
          flex-direction: column;
          gap: 6px;
          visibility: hidden;
          pointer-events: none;
          flex-shrink: 0;
        }

        /* Hero text block — plain, no card background */
        .hp-hero-text-block { display: flex; flex-direction: column; gap: 24px; padding: 36px 0 32px; }

        .hp-hero-title {
          font-size: 54px;
          font-weight: 900;
          line-height: 1.08;
          letter-spacing: -2px;
          color: #1E3A5F;
          margin: 0;
        }
        .hp-hero-title span { color: #2563EB; }
        .hp-hero-sub {
          font-size: 20px;
          color: #3B5EAE;
          margin: 0;
          font-weight: 600;
          letter-spacing: -0.2px;
        }

        .hp-ghost-btn-card {
          border-color: #93C5FD !important;
          color: #1D4ED8 !important; background: rgba(255,255,255,0.65) !important;
        }
        .hp-ghost-btn-card:hover {
          border-color: #2563EB !important;
          color: #1E40AF !important; background: rgba(255,255,255,0.9) !important;
        }
        .hp-cta-btn-card {
          background: #2563EB !important; color: #fff !important;
          box-shadow: 0 4px 20px rgba(37,99,235,0.35) !important;
        }
        .hp-cta-btn-card:hover {
          background: #1D4ED8 !important; color: #fff !important;
          transform: translateY(-2px) !important; box-shadow: 0 8px 28px rgba(37,99,235,0.45) !important;
        }

        /* Right col: fixed width */
        .hp-hero-right {
          width: 420px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        /* Offers header */
        .hp-offers-header { display: flex; flex-direction: column; gap: 6px; }
        .hp-offers-title { font-size: 24px; font-weight: 800; color: #0F172A; margin: 0; letter-spacing: -0.6px; }
        .hp-offers-subtitle { font-size: 13px; color: #64748B; margin: 0; font-weight: 500; }

        /* ═══════════════ BADGES ═══════════════ */
        .hp-badge-primary {
          display: inline-flex; align-items: center; gap: 6px;
          background: #F0FDFA; border: 1px solid #99F6E4;
          color: #0D9488; padding: 5px 12px; border-radius: 20px;
          font-size: 12px; font-weight: 700; width: fit-content;
        }
        .hp-badge-success {
          display: inline-flex; align-items: center; gap: 6px;
          background: #F0FDF4; border: 1px solid #BBF7D0;
          color: #16A34A; padding: 5px 12px; border-radius: 20px;
          font-size: 12px; font-weight: 700; width: fit-content;
        }

        /* ═══════════════ STATS ═══════════════ */
        .hp-stats-section {
          background: #F8FAFC;
          border-top: 1px solid #E8EEF5; border-bottom: 1px solid #E8EEF5;
          padding: 52px 32px;
        }
        .hp-stats-grid {
          max-width: 1200px; margin: 0 auto;
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
        }
        .hp-stat-card {
          display: flex; flex-direction: column; align-items: center;
          gap: 8px; padding: 28px 16px;
          background: #fff; border-radius: 18px; border: 1px solid #E2E8F0;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .hp-stat-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.08); }
        .hp-stat-icon {
          width: 44px; height: 44px; border-radius: 12px;
          background: #fff; border: 1px solid #E2E8F0;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .hp-stat-value { font-size: 26px; font-weight: 900; color: #0F172A; letter-spacing: -0.8px; }
        .hp-stat-label { font-size: 13px; color: #64748B; font-weight: 500; }

        /* ═══════════════ REVIEWS ═══════════════ */
        .hp-reviews-section { padding: 80px 24px; background: var(--hp-bg, #F8FAFC); }
        .hp-section-header {
          text-align: center; margin-bottom: 48px;
          display: flex; flex-direction: column; align-items: center; gap: 12px;
        }
        .hp-section-title { font-size: 30px; font-weight: 900; color: #0F172A; margin: 0; letter-spacing: -0.8px; }
        .hp-section-subtitle { font-size: 15px; color: #64748B; margin: 0; max-width: 480px; }
        .hp-reviews-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .hp-review-card {
          background: #fff; border-radius: 20px; padding: 26px;
          border: 1px solid #EEF2F8;
          display: flex; flex-direction: column; gap: 12px;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .hp-review-card:hover { transform: translateY(-4px); box-shadow: 0 12px 32px rgba(0,0,0,0.09); }
        .hp-review-text {
          font-size: 14px; color: #334155; line-height: 1.7; flex: 1; margin: 0;
          display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden;
        }
        .hp-review-author { margin-top: auto; }
        .hp-review-author-name { font-size: 13px; font-weight: 700; color: #1E293B; }
        .hp-review-consultant { font-size: 11px; color: #0D9488; font-weight: 500; margin-top: 2px; }

        /* ═══════════════ FOOTER ═══════════════ */
        .hp-footer { background: #0F172A; padding: 60px 24px 24px; }
        .hp-footer-inner {
          max-width: 1200px; margin: 0 auto;
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 40px; padding-bottom: 40px;
          border-bottom: 1px solid rgba(255,255,255,0.08); flex-wrap: wrap;
        }
        .hp-footer-logo { font-size: 18px; font-weight: 900; color: #fff; letter-spacing: -0.5px; margin-bottom: 8px; }
        .hp-footer-logo span { color: #60A5FA; }
        .hp-footer-text { font-size: 13px; color: #94A3B8; margin: 0; max-width: 280px; line-height: 1.6; }
        .hp-footer-links { display: flex; gap: 48px; }
        .hp-footer-heading { font-size: 12px; font-weight: 700; color: #fff; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 12px; }
        .hp-footer-link-list { display: flex; flex-direction: column; gap: 8px; }
        .hp-footer-link-list span { font-size: 13px; color: #94A3B8; cursor: pointer; transition: color 0.2s; }
        .hp-footer-link-list span:hover { color: #E2E8F0; }
        .hp-footer-bottom { max-width: 1200px; margin: 24px auto 0; font-size: 12px; color: #475569; text-align: center; }

        /* ═══════════════ CONTACT MODAL ═══════════════ */
        .hp-contact-modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(15,23,42,0.7);
          display: flex; align-items: center; justify-content: center;
          padding: 16px; backdrop-filter: blur(4px);
          animation: fadeIn 0.2s ease;
        }
        .hp-contact-modal-content {
          width: 100%; max-width: 460px;
          background: linear-gradient(145deg, #1E3A5F, #1e40af);
          border-radius: 20px; overflow: hidden;
          box-shadow: 0 24px 64px rgba(0,0,0,0.4);
          animation: slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1);
        }
        .hp-contact-modal-header {
          padding: 20px 24px; display: flex; justify-content: space-between; align-items: center;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .hp-contact-modal-body { padding: 24px; display: flex; flex-direction: column; gap: 14px; }
        .hp-contact-input-wrapper {
          display: flex; align-items: center; gap: 10px;
          background: rgba(255,255,255,0.08); border-radius: 12px;
          padding: 10px 14px; border: 1px solid rgba(255,255,255,0.12);
          transition: border-color 0.2s;
        }
        .hp-contact-input-wrapper:focus-within { border-color: rgba(94,234,212,0.5); }
        .hp-contact-textarea-wrapper {
          display: flex; align-items: flex-start; gap: 10px;
          background: rgba(255,255,255,0.08); border-radius: 12px;
          padding: 10px 14px; border: 1px solid rgba(255,255,255,0.12);
        }
        .hp-contact-input { background: none; border: none; outline: none; color: #fff; font-size: 14px; font-family: inherit; width: 100%; }
        .hp-contact-input::placeholder { color: rgba(255,255,255,0.4); }
        .hp-contact-textarea { background: none; border: none; outline: none; color: #fff; font-size: 14px; font-family: inherit; width: 100%; resize: none; }
        .hp-contact-textarea::placeholder { color: rgba(255,255,255,0.4); }
        .hp-contact-submit-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          padding: 13px; border-radius: 12px; border: none;
          background: #0D9488; color: #fff; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          transition: all 0.2s ease; box-shadow: 0 4px 16px rgba(13,148,136,0.4);
        }
        .hp-contact-submit-btn:hover:not(:disabled) { background: #0F766E; transform: translateY(-1px); }
        .hp-contact-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .hp-contact-success { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 0; text-align: center; }

        /* ═══════════════ WHATSAPP ═══════════════ */
        .hp-whatsapp-button {
          position: fixed; bottom: 24px; right: 24px; z-index: 99;
          width: 54px; height: 54px; border-radius: 50%;
          background: #25D366; display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 20px rgba(37,211,102,0.45);
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease;
          text-decoration: none;
        }
        .hp-whatsapp-button:hover { transform: scale(1.12); box-shadow: 0 8px 28px rgba(37,211,102,0.55); }

        /* ═══════════════ ANIMATIONS ═══════════════ */
        @keyframes pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.85;transform:scale(1.04)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(18px) scale(0.98); }
          to   { opacity: 1; transform: translateX(0)    scale(1); }
        }
        @keyframes clockSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes mtmPulse {
          0%   { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(37,99,235,0.20));  opacity: 0.0; }
          20%  { opacity: 0.6; }
          50%  { transform: scale(1.10); filter: blur(0px) drop-shadow(0 0 22px rgba(37,99,235,0.65)); opacity: 1.0; }
          80%  { opacity: 0.6; }
          100% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(37,99,235,0.20));  opacity: 0.0; }
        }

        div::-webkit-scrollbar { display: none; }

        /* ═══════════════ RESPONSIVE ═══════════════ */
        @media (max-width: 1024px) {
          .hp-hero-right { width: 360px; }
          .hp-hero-title { font-size: 42px; }
        }
        @media (max-width: 860px) {
          .hp-hero {
            flex-direction: column;
            gap: 32px; padding: 120px 16px 48px;
          }
          .hp-hero-left { padding-top: 0; }
          .hp-hero-card { max-width: 100%; }
          .hp-hero-right { width: 100%; }
          .hp-hero-spacer { display: none; }
          .hp-stats-grid { grid-template-columns: repeat(2, 1fr); }
          .hp-reviews-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .hp-desktop-nav { display: none !important; }
          .hp-hamburger  { display: flex !important; }
          .hp-mobile-menu { display: flex !important; }
          .hp-hero { padding: 108px 16px 40px; }
          .hp-hero-card { padding: 28px 22px; border-radius: 20px; max-width: 100%; }
          .hp-hero-title { font-size: 34px; letter-spacing: -1px; }
          .hp-hero-sub { font-size: 16px; }
          .hp-stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .hp-stat-card { padding: 20px 12px; }
          .hp-stat-value { font-size: 22px; }
          .hp-reviews-grid { grid-template-columns: 1fr; }
          .hp-footer-inner { flex-direction: column; gap: 28px; }
          .hp-footer-links { flex-direction: column; gap: 24px; }
          .hp-stats-section { padding: 36px 16px; }
          .hp-reviews-section { padding: 56px 16px; }
        }
        @media (max-width: 400px) {
          .hp-hero-title { font-size: 28px; }
        }
      `}</style>
    </div>
  );
}