import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  Gift,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
  Star,
  User,
  X
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import logoImg from '../assests/Meetmasterslogopng.png';
import { API_BASE_URL } from "../config/api";
import { getHighestRatedFeedbacks, getPublicHomeOffers, getRole } from "../services/api";
import { decryptLocal } from "../services/crypto";

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

const normalizeRole = (raw?: string | null) =>
  (raw || "").toUpperCase().trim().replace(/^ROLE_/, "");

const getStoredRole = () => {
  const rawRole = getRole();
  if (!rawRole) return "";
  const decodedRole = decryptLocal(rawRole);
  return normalizeRole(decodedRole || rawRole);
};

const BASE = API_BASE_URL;

const safeFetch = async (
  ep: string,
  includeAuth = false,
): Promise<{ ok: boolean; status: number; data: any }> => {
  try {
    const token = localStorage.getItem("fin_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (includeAuth && token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${BASE}${ep}`, { headers, cache: "no-store" });
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

const loadArrayFromEndpoint = async (ep: string, allowAuthFallback = false): Promise<any[]> => {
  const publicResult = await safeFetch(ep);
  if (publicResult.ok && publicResult.data) {
    const items = toArray(publicResult.data);
    if (items.length > 0) return items;
  }
  const token = localStorage.getItem("fin_token");
  if (!allowAuthFallback || !token) return [];
  const authResult = await safeFetch(ep, true);
  if (!authResult.ok || !authResult.data) return [];
  return toArray(authResult.data);
};

const loadReviews = async (): Promise<Review[]> => {
  // ── 1. Try the dedicated highest-rated public endpoint first ──────────────
  try {
    const highRated = await getHighestRatedFeedbacks(6);
    if (highRated.length > 0) {
      const seen = new Set<number>();
      const result: Review[] = [];
      for (const f of highRated) {
        if (!f?.id || seen.has(f.id)) continue;
        seen.add(f.id);
        const reviewText = f.comments ?? f.comment ?? f.text ?? f.reviewText ?? "";
        const rating = Number(f.rating ?? f.feedbackRating ?? f.stars ?? 0);
        if (!reviewText.trim() || !(rating >= 3)) continue;
        result.push({
          id: f.id,
          reviewerName: f.reviewerName ?? f.userName ?? f.user?.name ?? f.clientName ?? "Verified Client",
          rating,
          reviewText,
          consultantName: f.consultantName ?? f.consultant?.name ?? "",
          createdAt: f.createdAt ?? f.created_at ?? "",
          isApproved: true,
        });
      }
      if (result.length > 0) return result;
    }
  } catch { /* fall through to legacy logic */ }

  // ── 2. Legacy fallback (tries multiple endpoints) ─────────────────────────
  const endpoints = [
    { ep: "/reviews?approved=true", allowAuthFallback: false },
    { ep: "/reviews/approved", allowAuthFallback: false },
    { ep: "/reviews", allowAuthFallback: true },
    { ep: "/feedbacks", allowAuthFallback: true },
  ];
  let combined: any[] = [];

  for (const endpoint of endpoints) {
    combined = await loadArrayFromEndpoint(endpoint.ep, endpoint.allowAuthFallback);
    if (combined.length > 0) break;
  }

  const seen = new Set<number>();
  const result: Review[] = [];

  for (const r of combined) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    if (r.isApproved === false || r.approved === false) continue;
    const reviewText = r.reviewText ?? r.comment ?? r.text ?? r.message ?? r.comments ?? "";
    const rating = Number(r.rating ?? r.feedbackRating ?? r.stars ?? 0);
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

const CARD_THEMES = [
  {
    bg: "#FFFFFF",
    accent: "#2563EB", shimmer: "rgba(37,99,235,0.05)", border: "rgba(37,99,235,0.18)",
    glow: "rgba(37,99,235,0.0)", textColor: "#0F172A", subColor: "#475569",
    badgeBg: "rgba(37,99,235,0.06)", badgeColor: "#1D4ED8", dateBg: "rgba(15,23,42,0.03)",
    dateColor: "#334155", discountBg: "linear-gradient(135deg, #2563EB 0%, #0EA5E9 100%)", discountColor: "#fff",
    lightning: "#60A5FA", accentShape: "rgba(37,99,235,0.10)",
  },
  {
    bg: "#FFFFFF",
    accent: "#0D9488", shimmer: "rgba(13,148,136,0.05)", border: "rgba(13,148,136,0.18)",
    glow: "rgba(13,148,136,0.0)", textColor: "#0F172A", subColor: "#475569",
    badgeBg: "rgba(13,148,136,0.06)", badgeColor: "#0F766E", dateBg: "rgba(15,23,42,0.03)",
    dateColor: "#334155", discountBg: "linear-gradient(135deg, #0D9488 0%, #22C55E 100%)", discountColor: "#fff",
    lightning: "#5EEAD4", accentShape: "rgba(13,148,136,0.10)",
  },
  {
    bg: "#FFFFFF",
    accent: "#4F46E5", shimmer: "rgba(79,70,229,0.05)", border: "rgba(79,70,229,0.18)",
    glow: "rgba(79,70,229,0.0)", textColor: "#0F172A", subColor: "#475569",
    badgeBg: "rgba(79,70,229,0.06)", badgeColor: "#4338CA", dateBg: "rgba(15,23,42,0.03)",
    dateColor: "#334155", discountBg: "linear-gradient(135deg, #4F46E5 0%, #2563EB 100%)", discountColor: "#fff",
    lightning: "#A5B4FC", accentShape: "rgba(79,70,229,0.10)",
  },
  {
    bg: "#FFFFFF",
    accent: "#16A34A", shimmer: "rgba(22,163,74,0.05)", border: "rgba(22,163,74,0.18)",
    glow: "rgba(22,163,74,0.0)", textColor: "#0F172A", subColor: "#475569",
    badgeBg: "rgba(22,163,74,0.06)", badgeColor: "#15803D", dateBg: "rgba(15,23,42,0.03)",
    dateColor: "#334155", discountBg: "linear-gradient(135deg, #16A34A 0%, #22C55E 100%)", discountColor: "#fff",
    lightning: "#86EFAC", accentShape: "rgba(22,163,74,0.10)",
  },
  {
    bg: "#FFFFFF",
    accent: "#0EA5E9", shimmer: "rgba(14,165,233,0.05)", border: "rgba(14,165,233,0.18)",
    glow: "rgba(14,165,233,0.0)", textColor: "#0F172A", subColor: "#475569",
    badgeBg: "rgba(14,165,233,0.06)", badgeColor: "#0284C7", dateBg: "rgba(15,23,42,0.03)",
    dateColor: "#334155", discountBg: "linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)", discountColor: "#fff",
    lightning: "#7DD3FC", accentShape: "rgba(14,165,233,0.10)",
  },
  {
    bg: "#FFFFFF",
    accent: "#475569", shimmer: "rgba(71,85,105,0.05)", border: "rgba(71,85,105,0.18)",
    glow: "rgba(71,85,105,0.0)", textColor: "#0F172A", subColor: "#475569",
    badgeBg: "rgba(71,85,105,0.06)", badgeColor: "#334155", dateBg: "rgba(15,23,42,0.03)",
    dateColor: "#334155", discountBg: "linear-gradient(135deg, #334155 0%, #475569 100%)", discountColor: "#fff",
    lightning: "#CBD5E1", accentShape: "rgba(71,85,105,0.10)",
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
        label: "LAST CALL",
        style: {
          background: "linear-gradient(135deg, #115E59, #0F766E)",
          color: "#fff", padding: "3px 10px", borderRadius: 20,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.8px",
          animation: "pulse 1.5s ease-in-out infinite",
          boxShadow: "0 2px 12px rgba(15,118,110,0.35)",
        },
      };
    }
  }

  const validFromRaw = offer.validFrom;
  if (validFromRaw) {
    const d = new Date(validFromRaw); d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime() || d.getTime() === tomorrow.getTime()) {
      return {
        label: "NEW",
        style: {
          background: "linear-gradient(135deg, #0F766E, #2563EB)",
          color: "#fff", padding: "3px 10px", borderRadius: 20,
          fontSize: 10, fontWeight: 800, letterSpacing: "0.8px",
          boxShadow: "0 2px 12px rgba(37,99,235,0.28)",
        },
      };
    }
  }
  return null;
};

const getEndsText = (offer: Offer) => {
  const raw = offer.validUntil ?? offer.validTo;
  if (!raw) return "Ends soon";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Ends soon";
  return `Ends ${date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}`;
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

function OfferRailCard({
  offer,
  index,
  onClaim,
}: {
  offer: Offer;
  index: number;
  onClaim: (offer: Offer) => void;
}) {
  const theme = CARD_THEMES[index % CARD_THEMES.length];
  const labelInfo = getOfferLabel(offer);
  const BadgeIcon = labelInfo?.label === "LAST CALL" ? Flame : labelInfo?.label === "NEW" ? Sparkles : Gift;

  const badgeStyle: React.CSSProperties =
    labelInfo?.style ?? {
      background: theme.badgeBg,
      border: `1px solid ${theme.border}`,
      color: theme.badgeColor,
      padding: "4px 10px",
      borderRadius: 999,
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
    };

  return (
    <article className="hp-offer-card" data-offer-card style={{ background: theme.bg }}>
      <div className="hp-offer-toprow">
        <span style={{ ...badgeStyle, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <BadgeIcon size={12} />
          <span>{labelInfo?.label ?? "FEATURED"}</span>
        </span>
        {offer.discount ? (
          <span
            className="hp-offer-discount"
            style={{
              background: theme.discountBg,
              color: theme.discountColor,
            }}
          >
            {offer.discount}
          </span>
        ) : null}
      </div>

      <div className="hp-offer-body">
        <div className="hp-offer-main">
          <div
            className="hp-offer-icon"
            style={{
              background: "#fff",
              border: `1px solid ${theme.border}`,
            }}
          >
            <Gift size={24} color={theme.accent} strokeWidth={2} />
          </div>
          <div className="hp-offer-copy-text">
            <h3 className="hp-offer-title" style={{ color: theme.textColor }}>
              {offer.title}
            </h3>
            <p className="hp-offer-description" style={{ color: theme.subColor }}>
              {offer.description || "Limited-time offer - book your expert session today."}
            </p>
          </div>
        </div>
        <div
          className="hp-offer-visual"
          style={{
            border: `1px solid ${theme.border}`,
          }}
        >
          <Gift size={34} color={theme.accent} strokeWidth={2} />
        </div>
      </div>

      <div className="hp-offer-footer">
        <span
          className="hp-offer-date"
          style={{
            background: theme.dateBg,
            border: `1px solid ${theme.border}`,
            color: theme.dateColor,
          }}
        >
          <Clock3 size={11} />
          {getEndsText(offer)}
        </span>
        <button
          type="button"
          className="hp-offer-cta"
          style={{
            background: theme.discountBg,
            color: theme.discountColor,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onClaim(offer);
          }}
        >
          <span>Claim Offer</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}

const VELORAH_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';

export default function HomePage() {
  const navigate = useNavigate();
  const offersSectionRef = useRef<HTMLElement>(null);
  const reviewsSectionRef = useRef<HTMLElement>(null);
  const offersRailRef = useRef<HTMLDivElement>(null);
  const offersAutoScrollPausedRef = useRef(false);
  const offersLoopWidthRef = useRef(0);
  const offersSetsRef = useRef(10);
  const offersDragStateRef = useRef({
    active: false,
    pointerId: null as number | null,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const [scrolled, setScrolled] = useState(false);
  const [heroVisible, setHeroVisible] = useState(false);
  const [offersVisible, setOffersVisible] = useState(false);
  const [reviewsVisible, setReviewsVisible] = useState(false);
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

  const openContact = () => {
    setContactError("");
    setContactSuccess(false);
    setShowContact(true);
  };

  const closeOverlays = () => {
    setShowContact(false);
    setMobileMenuOpen(false);
  };

  const getRailStep = () => {
    const rail = offersRailRef.current;
    if (!rail) return 352;
    const card = rail.querySelector<HTMLElement>("[data-offer-card]");
    return (card?.offsetWidth ?? 336) + 16;
  };

  const scrollOffers = (direction: -1 | 1) => {
    const rail = offersRailRef.current;
    if (!rail) return;
    offersAutoScrollPausedRef.current = true;
    const step = getRailStep() * direction;
    const start = rail.scrollLeft;
    const end = start + step;
    const duration = 380;
    const startTime = performance.now();
    const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const animate = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      rail.scrollLeft = start + step * ease(t);
      const lw = offersLoopWidthRef.current;
      if (lw) {
        if (rail.scrollLeft >= lw * 7) rail.scrollLeft -= lw * 4;
        else if (rail.scrollLeft < lw * 3) rail.scrollLeft += lw * 4;
      }
      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        offersAutoScrollPausedRef.current = false;
      }
    };
    requestAnimationFrame(animate);
  };

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeOverlays();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  useEffect(() => {
    const heroTimer = setTimeout(() => setHeroVisible(true), 100);
    return () => clearTimeout(heroTimer);
  }, []);

  useEffect(() => {
    const section = offersSectionRef.current;
    if (!section) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setOffersVisible(true); },
      { threshold: 0.14 }
    );
    obs.observe(section);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const section = reviewsSectionRef.current;
    if (!section) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setReviewsVisible(true); },
      { threshold: 0.14 }
    );
    obs.observe(section);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchOffers = () => {
      setOffersError(false);
      getPublicHomeOffers()
        .then((data) => {
          if (!cancelled) {
            setOffers(Array.isArray(data) ? data as Offer[] : []);
            setOffersLoading(false);
          }
        })
        .catch(() => { if (!cancelled) { setOffersError(true); setOffersLoading(false); } });
    };
    fetchOffers();
    const interval = setInterval(fetchOffers, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReviewsLoading(true);
    loadReviews()
      .then((data) => { if (!cancelled) setReviews(data); })
      .catch(() => { })
      .finally(() => { if (!cancelled) setReviewsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const displayOffers = offers.slice(0, 6);
  const CAROUSEL_SETS = 10;
  const carouselOffers = displayOffers.length > 1
    ? Array.from({ length: CAROUSEL_SETS }, () => displayOffers).flat()
    : displayOffers;

  // ── Stop-move-stop carousel ──
  useEffect(() => {
    const rail = offersRailRef.current;
    if (!rail || displayOffers.length <= 1) return;

    const SETS = CAROUSEL_SETS;

    const syncLoopWidth = () => {
      offersLoopWidthRef.current = rail.scrollWidth / SETS;
      offersSetsRef.current = SETS;
    };

    syncLoopWidth();

    const clampToMiddle = () => {
      const lw = offersLoopWidthRef.current;
      if (!lw || rail.scrollWidth <= rail.clientWidth) return;
      if (rail.scrollLeft >= lw * 7) rail.scrollLeft -= lw * 4;
      else if (rail.scrollLeft < lw * 3) rail.scrollLeft += lw * 4;
    };

    // Defer initial anchor so layout is fully computed
    const anchorTimer = setTimeout(() => {
      syncLoopWidth();
      rail.scrollLeft = offersLoopWidthRef.current * 5;
    }, 50);

    // ── Stop → glide one card → stop → repeat ──
    const PAUSE_MS = 2200;   // idle time between slides
    const SLIDE_MS = 520;    // glide animation duration

    let rafId = 0;
    let phaseTimer: ReturnType<typeof setTimeout> | null = null;

    const ease = (t: number) =>
      t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    const slideOne = () => {
      if (offersAutoScrollPausedRef.current) {
        // User hovering/dragging — retry after a short delay
        phaseTimer = setTimeout(slideOne, 120);
        return;
      }

      const cardWidth = getRailStep();
      const start = rail.scrollLeft;
      const startTime = performance.now();

      const animate = (now: number) => {
        if (offersAutoScrollPausedRef.current) {
          // Interrupted mid-glide — snap to target and re-enter pause
          rail.scrollLeft = start + cardWidth;
          clampToMiddle();
          phaseTimer = setTimeout(slideOne, PAUSE_MS);
          return;
        }
        const t = Math.min((now - startTime) / SLIDE_MS, 1);
        rail.scrollLeft = start + cardWidth * ease(t);
        clampToMiddle();
        if (t < 1) {
          rafId = requestAnimationFrame(animate);
        } else {
          // Glide done — sit still before next slide
          phaseTimer = setTimeout(slideOne, PAUSE_MS);
        }
      };

      rafId = requestAnimationFrame(animate);
    };

    // Kick off with an initial pause
    phaseTimer = setTimeout(slideOne, PAUSE_MS);

    // ── Wheel: convert vertical scroll to horizontal card step ──
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      e.preventDefault();
      e.stopPropagation();
      rail.scrollLeft += e.deltaY > 0 ? getRailStep() : -getRailStep();
      clampToMiddle();
    };

    // ── Drag / pointer ──
    const dragState = offersDragStateRef.current;

    const beginDrag = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragState.active = true;
      dragState.pointerId = e.pointerId;
      dragState.startX = e.clientX;
      dragState.startScrollLeft = rail.scrollLeft;
      dragState.moved = false;
      offersAutoScrollPausedRef.current = true;
      rail.setPointerCapture?.(e.pointerId);
    };

    const moveDrag = (e: PointerEvent) => {
      if (!dragState.active || dragState.pointerId !== e.pointerId) return;
      const dx = e.clientX - dragState.startX;
      if (Math.abs(dx) > 4) dragState.moved = true;
      rail.scrollLeft = dragState.startScrollLeft - dx;
      clampToMiddle();
    };

    const endDrag = (event: Event) => {
      const e = event as PointerEvent;
      if (!dragState.active || dragState.pointerId !== e.pointerId) return;
      if (dragState.pointerId != null && rail.hasPointerCapture?.(dragState.pointerId)) {
        rail.releasePointerCapture(dragState.pointerId);
      }
      dragState.active = false;
      dragState.pointerId = null;
      offersAutoScrollPausedRef.current = false;
    };

    const suppressClickAfterDrag = (e: MouseEvent) => {
      if (!dragState.moved) return;
      e.preventDefault();
      e.stopPropagation();
      dragState.moved = false;
    };

    // ── Pause on hover so users can read cards ──
    const onMouseEnter = () => { offersAutoScrollPausedRef.current = true; };
    const onMouseLeave = () => { offersAutoScrollPausedRef.current = false; };

    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      syncLoopWidth();
      rail.scrollLeft = offersLoopWidthRef.current * 5;
    }) : null;
    resizeObserver?.observe(rail);

    window.addEventListener("resize", syncLoopWidth);
    rail.addEventListener("wheel", onWheel, { passive: false });
    rail.addEventListener("pointerdown", beginDrag);
    rail.addEventListener("pointermove", moveDrag);
    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);
    rail.addEventListener("lostpointercapture", endDrag);
    rail.addEventListener("click", suppressClickAfterDrag, true);
    rail.addEventListener("mouseenter", onMouseEnter);
    rail.addEventListener("mouseleave", onMouseLeave);

    return () => {
      clearTimeout(anchorTimer);
      cancelAnimationFrame(rafId);
      if (phaseTimer) clearTimeout(phaseTimer);
      rail.removeEventListener("wheel", onWheel);
      rail.removeEventListener("pointerdown", beginDrag);
      rail.removeEventListener("pointermove", moveDrag);
      rail.removeEventListener("pointerup", endDrag);
      rail.removeEventListener("pointercancel", endDrag);
      rail.removeEventListener("lostpointercapture", endDrag);
      rail.removeEventListener("click", suppressClickAfterDrag, true);
      rail.removeEventListener("mouseenter", onMouseEnter);
      rail.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", syncLoopWidth);
      resizeObserver?.disconnect();
    };
  }, [displayOffers.length]);

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
        body: JSON.stringify({
          name: contactForm.name.trim(),
          email: contactForm.email.trim(),
          message: contactForm.message.trim(),
        }),
      });
      if (res.ok || res.status === 201) backendSuccess = true;
    } catch { }
    const submission = {
      id: Date.now(), ...contactForm,
      submittedAt: new Date().toISOString(), read: false, syncedToBackend: backendSuccess,
    };
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
    const token = localStorage.getItem("fin_token");
    const role = getStoredRole();
    const canUseUserBooking = ["USER", "SUBSCRIBER", "GUEST", "MEMBER"].includes(role);
    navigate(token && canUseUserBooking ? "/user" : "/login");
  };

  return (
    <div className="hp-container">

      <svg width="0" height="0" style={{ position: "absolute" }}>
        <filter id="hp-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feBlend in="SourceGraphic" mode="overlay" result="blend" />
          <feComposite in="blend" in2="SourceGraphic" operator="in" />
        </filter>
      </svg>

      {/* ── HEADER ── */}
      <header className={`hp-header${scrolled ? " hp-header-scrolled" : ""}`}>
        <div className="hp-header-inner">
          <div className="hp-logo" style={{ cursor: "pointer" }} onClick={() => navigate("/home")}>
            <img src={logoImg} alt="Meet The Masters"
              style={{ height: 76, width: "auto", objectFit: "contain", display: "block" }} />
          </div>

          <div className="hp-nav-buttons hp-desktop-nav">
            <nav className="hp-nav-links">
              <span onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="hp-nav-link">Home</span>
              <span onClick={() => offersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="hp-nav-link">Offers</span>
              <span onClick={() => reviewsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} className="hp-nav-link">Reviews</span>
              <span onClick={openContact} className="hp-nav-link">Contact</span>
            </nav>
            <button onClick={() => navigate("/login")} className="hp-login-btn">Sign In</button>
            <button onClick={() => { navigate("/register", { replace: false, state: { reset: true } }); }} className="hp-primary-btn">Create Account</button>
          </div>

          <button className="hp-hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
            <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2, transition: "all 0.3s", transform: mobileMenuOpen ? "rotate(45deg) translateY(7px)" : "none" }} />
            <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2, marginTop: 5, transition: "all 0.3s", opacity: mobileMenuOpen ? 0 : 1 }} />
            <span style={{ display: "block", width: 22, height: 2, background: "#fff", borderRadius: 2, marginTop: 5, transition: "all 0.3s", transform: mobileMenuOpen ? "rotate(-45deg) translateY(-7px)" : "none" }} />
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="hp-mobile-menu">
            <span onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); setMobileMenuOpen(false); }} className="hp-mobile-nav-link">Home</span>
            <span onClick={() => { offersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); setMobileMenuOpen(false); }} className="hp-mobile-nav-link">Offers</span>
            <span onClick={() => { reviewsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); setMobileMenuOpen(false); }} className="hp-mobile-nav-link">Reviews</span>
            <span onClick={() => { openContact(); setMobileMenuOpen(false); }} className="hp-mobile-nav-link">Contact</span>
            <button onClick={() => { navigate("/login"); setMobileMenuOpen(false); }} className="hp-mobile-menu-btn hp-login-btn">Sign In</button>
            <button onClick={() => { navigate("/register"); setMobileMenuOpen(false); }} className="hp-mobile-menu-btn hp-primary-btn">Create Account</button>
          </div>
        )}
      </header>

      {/* ── HERO ── */}
      <div className="hp-velorah-outer">
        <video src={VELORAH_VIDEO} autoPlay loop muted playsInline className="hp-velorah-video" aria-hidden="true" />
        <div className="hp-velorah-scrim" aria-hidden="true" />
        <section className={`hp-velorah-hero${heroVisible ? " hp-hero-visible" : ""}`}>
          <div className="animate-fade-rise" style={{ marginBottom: 20 }}>
            <span className="hp-hero-eyebrow">
              MEET THE <span style={{ color: "#67E8F9" }}>MASTERS</span>
            </span>
          </div>
          <h1 className="hp-velorah-title animate-fade-rise">
            Access Industry{' '}
            <em className="hp-velorah-em">Experts,</em>{' '}
            Gain Real{' '}
            <em className="hp-velorah-em">Insights.</em>
          </h1>
          <p className="hp-velorah-sub animate-fade-rise-delay">
            Experience The Experience
          </p>
        </section>
      </div>

      {/* ── OFFERS ── */}
      <section
        className={`hp-offers-section${offersVisible ? " hp-section-visible" : ""}`}
        ref={offersSectionRef}
      >
        <div className="hp-section-shell">
          <div className="hp-offers-head">
            <div className="hp-section-header">
              <div className="hp-section-label">
                <Gift size={14} />
                Special Offers
              </div>
              <h2 className="hp-section-title">Exclusive Deals For You</h2>
            </div>
            <div className="hp-offers-head-actions">
              <span className="hp-live-pill">{displayOffers.length} live offers</span>
              <div className="hp-carousel-actions">
                <button
                  type="button"
                  className="hp-carousel-btn"
                  onClick={() => scrollOffers(-1)}
                  aria-label="Scroll offers left"
                  disabled={displayOffers.length <= 1}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className="hp-carousel-btn"
                  onClick={() => scrollOffers(1)}
                  aria-label="Scroll offers right"
                  disabled={displayOffers.length <= 1}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>

          {offersLoading ? (
            <div className="hp-state-card">
              <img src={logoImg} alt="Meet The Masters" className="hp-state-logo" />
              <h3>Loading active offers</h3>
              <p>Fetching the latest approved deals for the homepage.</p>
            </div>
          ) : offersError || displayOffers.length === 0 ? (
            <div className="hp-state-card hp-state-card-offers">
              <Gift size={34} />
              <h3>Offers Coming Soon</h3>
              <p>Once approved deals are available, they will appear here in the scrolling rail.</p>
            </div>
          ) : (
            <div className="hp-offers-rail" ref={offersRailRef}>
              {carouselOffers.map((offer, index) => (
                <OfferRailCard
                  key={`${offer.id}-${index}`}
                  offer={offer}
                  index={index % displayOffers.length}
                  onClaim={handleClaimOffer}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── REVIEWS ── */}
      <section
        className={`hp-reviews-section${reviewsVisible ? " hp-section-visible" : ""}`}
        ref={reviewsSectionRef}
        id="reviews"
      >
        <div className="hp-section-shell hp-section-shell-narrow">
          <div className="hp-section-header hp-section-header-centered">
            <div className="hp-section-label hp-section-label-success">
              <MessageSquare size={14} />
              Client Reviews
            </div>
            <h2 className="hp-section-title">What Clients Say</h2>
            <p className="hp-section-subtitle">Real experiences from our community of satisfied clients.</p>
          </div>

          {reviewsLoading ? (
            <div className="hp-state-card">
              <img src={logoImg} alt="Meet The Masters" className="hp-state-logo" />
              <h3>Loading reviews</h3>
              <p>Fetching approved client feedback for the homepage.</p>
            </div>
          ) : reviews.length === 0 ? (
            <div className="hp-empty-reviews">
              <MessageSquare size={44} />
              <div className="hp-empty-reviews-title">No reviews yet</div>
              <p>Be the first to share your experience after a session.</p>
              <button type="button" onClick={() => navigate("/register")} className="hp-empty-reviews-btn">
                Book a Session
                {/*<ArrowRight size={14} / > */}
              </button>
            </div>
          ) : (
            <div className="hp-reviews-grid">
              {reviews.map((review, idx) => (
                <div key={review.id} className="hp-review-card" style={{ animationDelay: `${idx * 0.08}s` }}>
                  <StarRating rating={review.rating} />
                  <p className="hp-review-text">"{review.reviewText}"</p>
                  <div className="hp-review-author">
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: "50%",
                        background: "linear-gradient(135deg,#0F766E,#2563EB)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 800, color: "#fff", flexShrink: 0,
                        boxShadow: "0 2px 8px rgba(15,118,110,0.35)",
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
                  <div className="hp-review-shimmer" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="hp-footer">
        <div className="hp-footer-inner">
          <div className="hp-footer-divider" />
          <div className="hp-footer-copyright-row" style={{ color: "#fff", textAlign: "center" }}>
            © 2026 Meet The Masters. All Rights Reserved To The Rupee Company. Crafted by <a href="https://antforge.com/" target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}> antforge.com</a>
          </div>
          <div className="hp-footer-divider" />
          <div className="hp-footer-bottom-row">
            <img src={logoImg} alt="Meet The Masters" className="hp-footer-logo" />
            <div className="hp-footer-links">
              <span style={{ cursor: "pointer" }} onClick={openContact}>Contact Us</span>
              <span>Privacy</span>
              <span>Terms</span>
            </div>
          </div>
        </div>
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
                  <div style={{ fontSize: 12, color: "#99F6E4" }}>We'd love to hear from you</div>
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
                    style={{ marginTop: 12, padding: "10px 28px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#0F766E,#2563EB)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
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
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Instrument+Serif:ital@0;1&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        .hp-container {
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          background: #F8FAFC; color: #0F172A;
          min-height: 100vh; overflow-x: hidden; min-width: 320px;
        }

        /* ═══ HEADER ═══ */
        .hp-header {
          position: fixed; top: 0; left: 0; right: 0; z-index: 100;
          background: linear-gradient(135deg, #0F172A 0%, #0F766E 48%, #2563EB 100%);
          backdrop-filter: blur(20px) saturate(1.6);
          -webkit-backdrop-filter: blur(20px) saturate(1.6);
          border-bottom: 1px solid rgba(255,255,255,0.18);
          transition: all 0.4s cubic-bezier(0.4,0,0.2,1);
        }
        .hp-header-scrolled {
          background: linear-gradient(135deg, #0F172A 0%, #0F766E 48%, #2563EB 100%);
          box-shadow: 0 8px 32px rgba(13,148,136,0.22), 0 2px 8px rgba(37,99,235,0.15);
          border-bottom-color: rgba(255,255,255,0.22);
        }
        .hp-header-inner {
          width: 100%; padding: 0 24px 0 20px;
          display: flex; align-items: center; justify-content: space-between;
          height: 84px; gap: 16px; position: relative;
        }
        .hp-logo { font-size: 18px; font-weight: 900; letter-spacing: -0.5px; color: #fff; flex-shrink: 0; }
        .hp-nav-buttons { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .hp-nav-links { display: flex; align-items: center; gap: 4px; margin-right: 8px; }
        .hp-nav-link {
          padding: 7px 14px; border-radius: 8px; font-size: 14px; font-weight: 600;
          color: rgba(255,255,255,0.80); cursor: pointer; transition: all 0.2s ease; white-space: nowrap;
        }
        .hp-nav-link:hover { color: #fff; background: rgba(255,255,255,0.10); }
        .hp-hamburger { display: none; flex-direction: column; background: none; border: none; cursor: pointer; padding: 4px; }
        .hp-mobile-menu {
          display: none; flex-direction: column; gap: 10px; padding: 16px 24px;
          background: linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(15,118,110,0.96) 100%);
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .hp-mobile-menu-btn { width: 100%; text-align: center; }
        .hp-mobile-nav-link {
          padding: 10px 4px; font-size: 15px; font-weight: 600;
          color: rgba(255,255,255,0.80); cursor: pointer;
          border-bottom: 1px solid rgba(255,255,255,0.07);
        }
        .hp-mobile-nav-link:hover { color: #fff; }

        /* ═══ BUTTONS ═══ */
        .hp-login-btn:hover { background: linear-gradient(135deg, #0D9488, #1D4ED8); box-shadow: 0 4px 16px rgba(15,118,110,0.45); transform: translateY(-1px); }
        .hp-login-btn {
         padding: 8px 20px; border-radius: 10px; border: none;
          background: linear-gradient(135deg, #0F766E, #2563EB);
          color: #fff; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit; transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(15,118,110,0.35);
        }
        .hp-primary-btn {
          padding: 8px 20px; border-radius: 10px; border: none;
          background: linear-gradient(135deg, #0F766E, #2563EB);
          color: #fff; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit; transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(15,118,110,0.35);
        }
        .hp-primary-btn:hover { background: linear-gradient(135deg, #0D9488, #1D4ED8); box-shadow: 0 4px 16px rgba(15,118,110,0.45); transform: translateY(-1px); }

        /* ═══ HERO ═══ */
        .hp-velorah-outer {
          position: relative; width: 100%; min-height: 100vh;
          overflow: hidden; display: flex; flex-direction: column;
        }
        .hp-velorah-video {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; z-index: 0;
        }
        .hp-velorah-scrim {
          position: absolute; inset: 0; z-index: 1;
          background: linear-gradient(to bottom, rgba(10,15,35,0.45) 0%, rgba(10,15,35,0.30) 50%, rgba(10,15,35,0.60) 100%);
        }
        .hp-velorah-hero {
          position: relative; z-index: 10; flex: 1;
          display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
          text-align: center; padding: 120px 24px 200px;
          opacity: 0; transform: translateY(28px);
          transition: opacity 0.9s cubic-bezier(0.22,1,0.36,1), transform 0.9s cubic-bezier(0.22,1,0.36,1);
        }
        .hp-hero-visible { opacity: 1 !important; transform: translateY(0) !important; }
        .hp-hero-eyebrow {
          font-size: 13px; font-weight: 800; letter-spacing: 0.28em;
          color: #fff; text-transform: uppercase; display: block;
        }
        .hp-velorah-title {
          font-family: 'Instrument Serif', serif;
          font-size: clamp(44px, 8vw, 92px); font-weight: 400;
          line-height: 0.95; letter-spacing: -2.5px; color: #fff;
          margin: 0 0 28px; max-width: 960px;
        }
        .hp-velorah-em { font-style: normal; color: #2DD4BF; }
        .hp-velorah-sub {
          font-size: clamp(14px, 1.8vw, 17px); color: #fff;
          margin: 0; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase;
        }
        @keyframes fade-rise {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-rise       { animation: fade-rise 0.8s ease-out both; }
        .animate-fade-rise-delay { animation: fade-rise 0.8s ease-out 0.2s both; }

        /* ═══ SECTION LAYOUT ═══ */
        .hp-offers-section,
        .hp-reviews-section {
          padding: 78px 24px;
          background: #F8FAFC;
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.8s cubic-bezier(0.22,1,0.36,1), transform 0.8s cubic-bezier(0.22,1,0.36,1);
          scroll-margin-top: 104px;
        }
        .hp-offers-section {
          --hp-offer-card-width: 336px;
          --hp-offer-card-height: 230px;
          --hp-offer-rail-gap: 16px;
          background: #fff;
        }
        .hp-reviews-section {
          background:
            radial-gradient(circle at top left, rgba(45,212,191,0.05), transparent 28%),
            radial-gradient(circle at top right, rgba(37,99,235,0.05), transparent 30%),
            #F8FAFC;
        }
        .hp-section-visible { opacity: 1 !important; transform: translateY(0) !important; }
        .hp-section-shell { max-width: 1440px; margin: 0 auto; }
        .hp-section-shell-narrow { max-width: 1240px; }
        .hp-offers-head {
          display: flex; justify-content: space-between; align-items: flex-start;
          gap: 20px; margin-bottom: 24px; flex-wrap: wrap;
        }
        .hp-offers-head-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .hp-carousel-actions { display: inline-flex; gap: 10px; }
        .hp-carousel-btn {
          width: 44px; height: 44px; border-radius: 14px; background: #fff;
          border: 1px solid #E2E8F0; color: #0F172A; display: inline-flex;
          align-items: center; justify-content: center;
          transition: transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease;
        }
        .hp-carousel-btn:hover:not(:disabled) {
          transform: translateY(-1px); border-color: #99F6E4; background: #F8FAFC;
        }
        .hp-carousel-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .hp-live-pill {
          display: inline-flex; align-items: center; padding: 8px 12px; border-radius: 999px;
          background: #F0FDFA; border: 1px solid #99F6E4; color: #0D9488;
          font-size: 12px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
        }
        .hp-section-header {
          display: flex; flex-direction: column; gap: 10px; align-items: flex-start;
        }
        .hp-section-header-centered { align-items: center; text-align: center; margin-bottom: 34px; }
        .hp-section-label {
          display: inline-flex; align-items: center; gap: 6px;
          background: #F0FDFA; border: 1px solid #99F6E4;
          color: #0D9488; padding: 5px 12px; border-radius: 999px;
          font-size: 12px; font-weight: 700; width: fit-content;
        }
        .hp-section-label-success { background: #F0FDF4; border-color: #BBF7D0; color: #16A34A; }
        .hp-section-title { font-size: clamp(26px, 3.4vw, 34px); font-weight: 900; color: #0F172A; margin: 0; letter-spacing: -0.04em; }
        .hp-section-subtitle { font-size: 14px; color: #64748B; margin: 0; max-width: 560px; line-height: 1.7; }
        .hp-state-card {
          min-height: 360px; border-radius: 24px; background: #fff; border: 1px solid #E2E8F0;
          box-shadow: 0 12px 28px rgba(15,23,42,0.06); display: flex; flex-direction: column;
          align-items: center; justify-content: center; text-align: center; gap: 10px; padding: 32px;
        }
        .hp-state-card h3 { margin: 0; font-size: 16px; color: #0F172A; }
        .hp-state-card p { margin: 0; color: #64748B; max-width: 420px; font-size: 13px; line-height: 1.7; }
        .hp-state-card-offers {
          background: #fff;
          color: #0F172A;
          border: 1px solid #E2E8F0;
        }
        .hp-state-card-offers h3, .hp-state-card-offers p { color: #475569; }
        .hp-state-logo { width: 52px; height: auto; display: block; animation: mtmPulse 1.8s ease-in-out infinite; }

        /* ═══ OFFERS RAIL ═══ */
        .hp-offers-rail {
          display: flex;
          gap: var(--hp-offer-rail-gap);
          overflow-x: auto;
          padding: 10px 4px 16px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
          overscroll-behavior-x: contain;
          touch-action: pan-x;
          align-items: stretch;
          scroll-padding-inline: 4px;
          cursor: grab;
          user-select: none;
        }
        .hp-offers-rail:active { cursor: grabbing; }
        .hp-offers-rail::-webkit-scrollbar { display: none; }

        /* ═══ OFFER CARD ═══ */
        .hp-offer-card {
          position: relative;
          flex: 0 0 var(--hp-offer-card-width);
          width: var(--hp-offer-card-width);
          min-width: var(--hp-offer-card-width);
          height: var(--hp-offer-card-height);
          min-height: var(--hp-offer-card-height);
          box-sizing: border-box;
          border-radius: 24px; overflow: hidden; padding: 16px 16px 14px;
          display: flex; flex-direction: column; justify-content: space-between;
          box-shadow: none; border: 1px solid #E5E7EB;
          transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease;
          animation: offerCardIn 0.56s both; animation-play-state: paused;
        }
        .hp-section-visible .hp-offer-card { animation-play-state: running; }
        .hp-offer-card:hover { transform: translateY(-1px); border-color: #CBD5E1; }
        .hp-offer-toprow {
          display: flex; justify-content: space-between; align-items: center; gap: 12px;
          margin-bottom: 10px; position: relative; z-index: 1;
        }
        .hp-offer-discount {
          border-radius: 999px; padding: 8px 16px; font-size: 15px; font-weight: 900;
          letter-spacing: -0.04em; border: 1px solid rgba(255,255,255,0.18); white-space: nowrap;
        }
        .hp-offer-body {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
          flex: 1; min-height: 0; position: relative; z-index: 1; margin-bottom: 10px;
        }
        .hp-offer-main {
          display: flex; align-items: flex-start; gap: 12px; flex: 1; min-width: 0;
        }
        .hp-offer-icon {
          width: 48px; height: 48px; border-radius: 16px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .hp-offer-copy-text { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
        .hp-offer-title {
          margin: 0; font-size: 17px; line-height: 1.15; letter-spacing: -0.04em; font-weight: 900;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .hp-offer-description {
          position: relative; z-index: 1; margin: 0; font-size: 12.5px; line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
        }
        .hp-offer-visual {
          width: 88px; height: 88px; border-radius: 24px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; position: relative;
          overflow: hidden; background: #fff;
        }
        .hp-offer-footer {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          margin-top: auto; padding-top: 12px; border-top: 1px solid #EEF2F7;
          position: relative; z-index: 1;
        }
        .hp-offer-date {
          display: inline-flex; align-items: center; gap: 6px; border-radius: 999px;
          padding: 6px 12px; font-size: 11px; font-weight: 700; white-space: nowrap;
        }
        .hp-offer-cta {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          border: 1px solid rgba(37,99,235,0.18); border-radius: 12px; padding: 10px 14px;
          font-size: 13px; font-weight: 800; cursor: pointer; transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }
        .hp-offer-cta:hover { transform: translateY(-1px); filter: brightness(1.02); }

        /* ═══ REVIEWS ═══ */
        .hp-reviews-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
        .hp-review-card {
          position: relative; background: #fff; border-radius: 20px; padding: 26px;
          border: 1px solid #EEF2F8; overflow: hidden;
          display: flex; flex-direction: column; gap: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          animation: reviewCardIn 0.55s both; animation-play-state: paused;
        }
        .hp-section-visible .hp-review-card { animation-play-state: running; }
        .hp-review-card:hover { transform: translateY(-4px); border-color: #99F6E4; box-shadow: 0 12px 32px rgba(0,0,0,0.09); }
        .hp-review-shimmer {
          position: absolute; inset: 0; left: -100%; width: 60%;
          background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.55) 50%, transparent 60%);
          pointer-events: none; transition: left 0.55s ease;
        }
        .hp-review-card:hover .hp-review-shimmer { left: 150%; }
        .hp-review-text { font-size: 14px; color: #334155; line-height: 1.7; flex: 1; margin: 0; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
        .hp-review-author { margin-top: auto; }
        .hp-review-author-name { font-size: 13px; font-weight: 700; color: #1E293B; }
        .hp-review-consultant { font-size: 11px; color: #0D9488; font-weight: 500; margin-top: 2px; }
        .hp-empty-reviews {
          text-align: center; padding: 60px 20px; color: #94A3B8;
          background: #fff; border: 1px solid #EEF2F8; border-radius: 20px; box-shadow: 0 12px 28px rgba(15,23,42,0.06);
        }
        .hp-empty-reviews svg { opacity: 0.3; display: block; margin: 0 auto 14px; }
        .hp-empty-reviews-title { font-size: 16px; font-weight: 600; color: #64748B; }
        .hp-empty-reviews p { font-size: 13px; margin: 8px 0 0; }
        .hp-empty-reviews-btn {
          margin-top: 20px; padding: 12px 28px; background: linear-gradient(135deg,#0F766E,#2563EB);
          color: #fff; border: none; border-radius: 12px; font-weight: 700; font-size: 14px; cursor: pointer;
          box-shadow: 0 10px 24px rgba(15,118,110,0.18); display: inline-flex; align-items: center; gap: 8px;
        }

        /* ═══ FOOTER ═══ */
        .hp-footer {
          background: linear-gradient(135deg, #0F172A 0%, #0F766E 48%, #2563EB 100%);
          padding: 28px 0;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        }
        .hp-footer-inner {
          width: 100%;
          display: flex; flex-direction: column; gap: 0;
        }
        .hp-footer-divider {
          width: 100%; height: 1px;
          background: rgba(255,255,255,0.15);
        }
        .hp-footer-copyright-row {
          font-size: 14px; color: rgba(224,242,254,0.80);
          padding: 14px 48px; line-height: 1.6;
          text-align: left;
        }
        .hp-footer-bottom-row {
          display: flex; align-items: center;
          justify-content: space-between; gap: 24px;
          padding: 20px 48px 0;
          width: 100%; box-sizing: border-box;
        }
        .hp-footer-logo {
          height: 70px; width: auto; object-fit: contain;
          filter: brightness(0) invert(1); display: block;
        }
        .hp-footer-links {
          display: flex; align-items: center; gap: 32px;
        }
        .hp-footer-links span {
          font-size: 14px; color: #CFFAFE; cursor: pointer;
          transition: color 0.2s; white-space: nowrap; font-weight: 500;
        }
        .hp-footer-links span:hover { color: #fff; }

        /* ═══ CONTACT MODAL ═══ */
        .hp-contact-modal-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(15,23,42,0.7);
          display: flex; align-items: center; justify-content: center;
          padding: 16px; backdrop-filter: blur(6px); animation: fadeIn 0.2s ease;
        }
        .hp-contact-modal-content {
          width: 100%; max-width: 460px;
          background: linear-gradient(145deg, #0F172A, #0F766E 60%, #1e40af);
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
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .hp-contact-input-wrapper:focus-within { border-color: rgba(94,234,212,0.55); box-shadow: 0 0 0 3px rgba(94,234,212,0.08); }
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
          background: linear-gradient(135deg, #0F766E, #2563EB); color: #fff; font-size: 14px; font-weight: 700;
          cursor: pointer; font-family: inherit;
          transition: all 0.2s ease; box-shadow: 0 4px 16px rgba(15,118,110,0.4);
        }
        .hp-contact-submit-btn:hover:not(:disabled) { background: linear-gradient(135deg, #0D9488, #1D4ED8); transform: translateY(-1px); }
        .hp-contact-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .hp-contact-success { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px 0; text-align: center; }

        /* ═══ WHATSAPP ═══ */
        .hp-whatsapp-button {
          position: fixed; bottom: 24px; right: 24px; z-index: 99;
          width: 54px; height: 54px; border-radius: 50%;
          background: #25D366; display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 20px rgba(37,211,102,0.45);
          transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.2s ease;
          text-decoration: none;
        }
        .hp-whatsapp-button:hover { transform: scale(1.12); box-shadow: 0 8px 28px rgba(37,211,102,0.55); }

        /* ═══ ANIMATIONS ═══ */
        @keyframes pulse   { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.85;transform:scale(1.04)} }
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes reviewCardIn {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes offerCardIn {
          from { opacity: 0; transform: translateY(22px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes mtmPulse {
          0%   { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; }
          20%  { opacity: 0.6; }
          50%  { transform: scale(1.10); filter: blur(0px) drop-shadow(0 0 22px rgba(15,118,110,0.65)); opacity: 1.0; }
          80%  { opacity: 0.6; }
          100% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; }
        }

        div::-webkit-scrollbar { display: none; }

        /* ═══ RESPONSIVE ═══ */
        @media (max-width: 1100px) {
          .hp-offers-head { align-items: center; }
          .hp-offers-section {
            --hp-offer-card-width: 326px;
            --hp-offer-card-height: 224px;
          }
        }
        @media (max-width: 860px) {
          .hp-offers-section,
          .hp-reviews-section { padding: 64px 16px; }
          .hp-offers-section {
            --hp-offer-card-width: 314px;
            --hp-offer-card-height: 220px;
          }
          .hp-offers-head { flex-direction: column; align-items: center; text-align: center; }
          .hp-offers-head-actions { width: 100%; justify-content: space-between; }
          .hp-offers-rail { padding-inline: 2px; }
          .hp-section-header-centered { margin-bottom: 30px; }
          .hp-reviews-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .hp-desktop-nav { display: none !important; }
          .hp-hamburger  { display: flex !important; }
          .hp-mobile-menu { display: flex !important; }
          .hp-velorah-hero { padding: 120px 20px 80px; }
          .hp-velorah-title { letter-spacing: -1px; }
          .hp-offers-section,
          .hp-reviews-section { padding: 52px 14px; }
          .hp-offers-section {
            --hp-offer-card-width: 300px;
            --hp-offer-card-height: 214px;
          }
          .hp-offers-head-actions { width: 100%; justify-content: center; gap: 10px; }
          .hp-carousel-actions { gap: 8px; }
          .hp-carousel-btn { width: 40px; height: 40px; border-radius: 12px; }
          .hp-offers-rail { padding-bottom: 8px; }
          .hp-offer-card { padding: 14px 14px 12px; border-radius: 22px; }
          .hp-offer-visual { width: 76px; height: 76px; border-radius: 20px; }
          .hp-offer-title { font-size: 16px; }
          .hp-offer-description { font-size: 12px; }
          .hp-review-card { padding: 22px; }
          .hp-reviews-grid { grid-template-columns: 1fr; }
          .hp-footer-bottom-row { flex-direction: column; align-items: center; gap: 16px; }
          .hp-footer-copyright-row { text-align: center; }
          .hp-footer-links { justify-content: center; gap: 20px; }
        }
        @media (max-width: 400px) { .hp-velorah-title { letter-spacing: -0.5px; } }
        @media (prefers-reduced-motion: reduce) {
          .hp-velorah-hero, .hp-offers-section, .hp-reviews-section, .hp-offer-card, .hp-review-card,
          .animate-fade-rise, .animate-fade-rise-delay
          { animation: none !important; transition: none !important; }
          .hp-velorah-hero, .hp-offers-section, .hp-reviews-section { opacity: 1 !important; transform: none !important; }
          .animate-fade-rise, .animate-fade-rise-delay { opacity: 1 !important; transform: none !important; }
        }
      `}</style>
    </div>
  );
}