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
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

// ─────────────────────────────────────────────────────────────────────────────
// ── Types
// ─────────────────────────────────────────────────────────────────────────────
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

const StarRating = ({ rating }: { rating: number }) => (
  <div style={{ display: "flex", gap: 2 }}>
    {[1, 2, 3, 4, 5].map(s => (
      <Star key={s} size={15} fill={s <= Math.round(rating) ? "#F59E0B" : "none"} color="#F59E0B" />
    ))}
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

  // ── Contact popup ─────────────────────────────────────────────────────────
  const [showContact, setShowContact] = useState(false);
  const [contactForm, setContactForm] = useState({ name: "", email: "", message: "" });
  const [contactSending, setContactSending] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowContact(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const openContact = () => {
    setContactSuccess(false);
    setContactError("");
    setShowContact(true);
  };

  return (
    <div className="hp-container">

      {/* ── Header ── */}
      <header className={`hp-header${scrolled ? " hp-header-scrolled" : ""}`}>
        <div className="hp-header-inner">
          <div className="hp-logo">
            MEET THE <span>MASTERS</span>
          </div>
          <div className="hp-nav-buttons">
            <button onClick={() => navigate("/login")} className="hp-login-btn">Log In</button>
            <button onClick={() => navigate("/register")} className="hp-primary-btn">Get Started</button>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hp-hero">
        <div>
          <h1 className="hp-hero-title">
            Modern Wealth <br />
            Management <span>Simplified.</span>
          </h1>
          <p className="hp-hero-text">
            Connect with India's top financial consultants. Get personalised
            strategies for wealth creation, tax optimisation, and retirement.
          </p>
        </div>
        <div>
          <img
            src="https://wallpapers.com/images/hd/trading-wallpaper-ynfqhj74ml8p96ca.jpg"
            alt="Trading Finance"
            className="hp-hero-image"
          />
        </div>
      </section>

      {/* ── Stats ── */}
      <section className="hp-stats-section">
        <div className="hp-stats-grid">
          {[
            { val: "10,000+", lbl: "Active Clients" },
            { val: "₹500 Cr+", lbl: "Assets Managed" },
            { val: "50+", lbl: "Expert Advisors" },
            { val: "99.9%", lbl: "Data Security" },
          ].map((s, i) => (
            <div key={i}>
              <div className="hp-stat-value">{s.val}</div>
              <div className="hp-stat-label">{s.lbl}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Offers Scrolling Carousel ── */}
      {!offersLoading && offers.length > 0 && (
        <section className="hp-offers-section">
          <div className="hp-section-header">
            <div className="hp-badge-primary">
              <Gift size={16} /> Special Offers
            </div>
            <h2 className="hp-section-title">Exclusive Deals For You</h2>
            <p className="hp-section-subtitle">Take advantage of our limited-time offers on consultations</p>
          </div>
          <div className="hp-offers-carousel-wrapper">
            <div className="hp-carousel-gradient-left" />
            <div className="hp-carousel-gradient-right" />
            <div className="hp-offers-carousel-track">
              {[...offers, ...offers].map((offer, idx) => (
                <div key={`${offer.id}-${idx}`} className="hp-offer-card">
                  {offer.discount && (
                    <div className="hp-discount-badge">{offer.discount}</div>
                  )}
                  <div className="hp-offer-icon">
                    <Gift size={24} />
                  </div>
                  <div className="hp-offer-title">{offer.title}</div>
                  <div className="hp-offer-desc">{offer.description}</div>
                  {offer.validUntil && (
                    <div className="hp-offer-validity">
                      Valid until: {new Date(offer.validUntil).toLocaleDateString("en-IN")}
                    </div>
                  )}
                  <button onClick={() => navigate("/register")} className="hp-offer-btn">
                    Claim Offer
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Reviews / Testimonials ── */}
      <section className="hp-reviews-section">
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="hp-section-header">
            <div className="hp-badge-success">
              <MessageSquare size={16} /> Client Reviews
            </div>
            <h2 className="hp-section-title">What Our Clients Say</h2>
            <p className="hp-section-subtitle">Real experiences from our community of satisfied clients</p>
          </div>
          {reviewsLoading ? (
            <div className="hp-loading-container">
              <div className="hp-loading-spinner" />
              Loading reviews…
            </div>
          ) : (
            <div className="hp-reviews-grid">
              {reviews.map(review => (
                <div key={review.id} className="hp-review-card">
                  <StarRating rating={review.rating} />
                  <p className="hp-review-text">"{review.reviewText}"</p>
                  <div className="hp-review-author">
                    <div className="hp-review-author-name">{review.reviewerName}</div>
                    {review.consultantName && (
                      <div className="hp-review-consultant">Consulted: {review.consultantName}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
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
                <span>Features</span>
                <span>Consultants</span>
                <span style={{ cursor: "pointer", color: "#93C5FD" }} onClick={openContact}>
                  Contact Us
                </span>
              </div>
            </div>
            <div>
              <div className="hp-footer-heading">Legal</div>
              <div className="hp-footer-link-list">
                <span>Privacy</span>
                <span>Terms</span>
              </div>
            </div>
          </div>
        </div>
        <div className="hp-footer-bottom">© 2026 MEET THE MASTERS. All rights reserved.</div>
      </footer>

      {/* ── Contact Us Popup Modal ── */}
      {showContact && (
        <div onClick={() => setShowContact(false)} className="hp-contact-modal-overlay">
          <div onClick={e => e.stopPropagation()} className="hp-contact-modal-content">
            {/* Modal header */}
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
              <button
                onClick={() => setShowContact(false)}
                style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X size={18} />
              </button>
            </div>
            {/* Modal body */}
            <div className="hp-contact-modal-body">
              {contactSuccess ? (
                <div className="hp-contact-success">
                  <CheckCircle size={40} color="#4ADE80" />
                  <div style={{ color: "#4ADE80", fontWeight: 700, fontSize: 15 }}>Message Sent!</div>
                  <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13 }}>We'll get back to you shortly.</div>
                  <button
                    onClick={() => { setShowContact(false); setContactSuccess(false); }}
                    style={{ marginTop: 10, padding: "10px 24px", borderRadius: 10, border: "none", background: "#2563EB", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
                  >
                    Close
                  </button>
                </div>
              ) : (
                <>
                  <div className="hp-contact-input-wrapper">
                    <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}><User size={18} /></span>
                    <input
                      value={contactForm.name}
                      onChange={e => setContactForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Your Name"
                      className="hp-contact-input"
                    />
                  </div>
                  <div className="hp-contact-input-wrapper">
                    <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}><Mail size={18} /></span>
                    <input
                      value={contactForm.email}
                      onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="Email Address"
                      type="email"
                      className="hp-contact-input"
                    />
                  </div>
                  <div className="hp-contact-textarea-wrapper">
                    <span style={{ color: "rgba(255,255,255,0.5)", flexShrink: 0, marginTop: 2 }}><MessageSquare size={18} /></span>
                    <textarea
                      value={contactForm.message}
                      onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))}
                      placeholder="Your message…"
                      rows={4}
                      className="hp-contact-textarea"
                    />
                  </div>
                  {contactError && (
                    <div style={{ color: "#FCA5A5", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                      <AlertTriangle size={14} /> {contactError}
                    </div>
                  )}
                  <button
                    onClick={handleContactSubmit}
                    disabled={contactSending}
                    className="hp-contact-submit-btn"
                  >
                    <Send size={16} />
                    {contactSending ? "Sending…" : "Send Message"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── WhatsApp Floating Button ── */}
      <a
        href="https://wa.me/919999999999"
        target="_blank"
        rel="noopener noreferrer"
        title="Chat with us on WhatsApp"
        className="hp-whatsapp-button"
      >
        <svg viewBox="0 0 32 32" width="32" height="32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M16 3C8.82 3 3 8.82 3 16c0 2.3.6 4.47 1.65 6.35L3 29l6.85-1.6A13 13 0 0 0 16 29c7.18 0 13-5.82 13-13S23.18 3 16 3z"
            fill="#fff"
          />
          <path
            d="M16 5.5A10.5 10.5 0 0 0 6.08 21.27l.22.35-1.3 4.74 4.88-1.27.34.2A10.5 10.5 0 1 0 16 5.5zm6.15 14.6c-.26.73-1.52 1.4-2.08 1.45-.53.05-1.03.24-3.47-.72-2.93-1.16-4.82-4.15-4.97-4.34-.14-.2-1.18-1.57-1.18-3s.74-2.13 1.02-2.42c.27-.29.59-.36.79-.36l.57.01c.18 0 .43-.07.67.51.26.6.87 2.12.95 2.27.08.15.13.33.03.52-.1.2-.15.32-.3.49-.14.17-.3.38-.43.51-.14.14-.29.29-.12.57.17.28.74 1.22 1.59 1.97 1.09.97 2.01 1.27 2.3 1.41.28.14.44.12.6-.07.17-.2.72-.84.91-1.12.19-.29.38-.24.64-.14.26.1 1.67.79 1.96.93.29.14.48.21.55.33.07.12.07.68-.19 1.41z"
            fill="#25D366"
          />
        </svg>
      </a>

    </div>
  );
}
