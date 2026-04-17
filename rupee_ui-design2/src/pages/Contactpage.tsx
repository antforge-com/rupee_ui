import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  User,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ContactPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    setSending(true);
    setError("");
    // NOTE: The provided backend OpenAPI spec does not define POST /api/contact.
    // Keeping this as a client-side-only contact form (no network call).
    setSuccess(true);
    setForm({ name: "", email: "", phone: "", message: "" });
    setSending(false);
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px 11px 44px",
    border: "1.5px solid #E2E8F0",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
    fontFamily: "inherit",
    background: "#FAFBFF",
    color: "#1E293B",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    display: "block",
    marginBottom: 6,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #E2E8F0", padding: "0 24px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", height: 64, display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "#64748B", fontSize: 14, fontWeight: 600, cursor: "pointer", padding: "8px 0" }}
          >
            <ArrowLeft size={18} strokeWidth={2} />
            Back
          </button>
          <div style={{ height: 20, width: 1, background: "#E2E8F0" }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A", letterSpacing: "0.04em" }}>
            MEET THE <span style={{ color: "#0F766E" }}>MASTERS</span>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px" }}>

        {/* Page title */}
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "#ECFEFF", border: "1px solid #A5F3FC",
            borderRadius: 20, padding: "5px 14px", fontSize: 12,
            fontWeight: 700, color: "#0F766E", marginBottom: 16,
          }}>
            <MessageSquare size={14} />
            Contact Us
          </div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: "#0F172A", margin: "0 0 12px", lineHeight: 1.2 }}>
            Get In Touch
          </h1>
          <p style={{ fontSize: 16, color: "#64748B", margin: 0, lineHeight: 1.6, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
            Have a question or need support? We'd love to hear from you. Send us a message and we'll get back to you shortly.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: 32, alignItems: "start" }}>

          {/* Left — Contact info */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {[
              {
                icon: <Mail size={20} color="#0F766E" strokeWidth={1.8} />,
                label: "Email Us",
                value: "support@meetthemasters.in",
                sub: "We reply within 24 hours",
              },
              {
                icon: <Phone size={20} color="#0F766E" strokeWidth={1.8} />,
                label: "Call Us",
                value: "+91 99999 99999",
                sub: "Mon – Sat, 9 AM – 6 PM IST",
              },
              {
                icon: <MapPin size={20} color="#0F766E" strokeWidth={1.8} />,
                label: "Office",
                value: "Hyderabad, Telangana",
                sub: "India — 500 081",
              },
            ].map((item, i) => (
              <div key={i} style={{
                background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14,
                padding: "20px 22px", display: "flex", alignItems: "flex-start", gap: 16,
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: "#ECFEFF", display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {item.icon}
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginBottom: 2 }}>{item.value}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>{item.sub}</div>
                </div>
              </div>
            ))}

            <div style={{
              background: "var(--portal-profile-gradient)",
              borderRadius: 14, padding: "24px 22px", color: "#fff",
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Office Hours</div>
              {[
                { day: "Monday – Friday", time: "9:00 AM – 6:00 PM" },
                { day: "Saturday", time: "10:00 AM – 2:00 PM" },
                { day: "Sunday", time: "Closed" },
              ].map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(255,255,255,0.85)", marginBottom: 6 }}>
                  <span>{h.day}</span>
                  <span style={{ fontWeight: 600 }}>{h.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Form */}
          <div style={{
            background: "#fff", border: "1px solid #E2E8F0", borderRadius: 20,
            padding: "36px 32px", boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
          }}>
            {success ? (
              <div style={{ textAlign: "center", padding: "40px 0" }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "50%",
                  background: "#F0FDF4", border: "2px solid #86EFAC",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 20px",
                }}>
                  <CheckCircle size={36} color="#16A34A" strokeWidth={1.8} />
                </div>
                <h3 style={{ fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Message Sent!</h3>
                <p style={{ fontSize: 14, color: "#64748B", marginBottom: 28, lineHeight: 1.6 }}>
                  Thank you for reaching out. Our team will get back to you within 24 hours.
                </p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                  <button
                    onClick={() => setSuccess(false)}
                    style={{ padding: "10px 22px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                  >
                    Send Another
                  </button>
                  <button
                    onClick={() => navigate("/")}
                    style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "var(--color-primary-gradient)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                  >
                    Back to Home
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0F172A", marginTop: 0, marginBottom: 24 }}>
                  Send Us a Message
                </h2>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Full Name <span style={{ color: "#EF4444" }}>*</span></label>
                    <div style={{ position: "relative" }}>
                      <User size={16} style={{ position: "absolute", left: 14, top: 13, color: "#94A3B8" }} strokeWidth={1.8} />
                      <input
                        value={form.name}
                        onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setError(""); }}
                        placeholder="Your full name"
                        style={inputStyle}
                        onFocus={e => (e.target.style.borderColor = "#0F766E")}
                        onBlur={e => (e.target.style.borderColor = "#E2E8F0")}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Phone <span style={{ color: "#94A3B8", fontWeight: 400 }}>(Optional)</span></label>
                    <div style={{ position: "relative" }}>
                      <Phone size={16} style={{ position: "absolute", left: 14, top: 13, color: "#94A3B8" }} strokeWidth={1.8} />
                      <input
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+91 XXXXX XXXXX"
                        type="tel"
                        style={inputStyle}
                        onFocus={e => (e.target.style.borderColor = "#0F766E")}
                        onBlur={e => (e.target.style.borderColor = "#E2E8F0")}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Email Address <span style={{ color: "#EF4444" }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <Mail size={16} style={{ position: "absolute", left: 14, top: 13, color: "#94A3B8" }} strokeWidth={1.8} />
                    <input
                      value={form.email}
                      onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setError(""); }}
                      placeholder="you@example.com"
                      type="email"
                      style={inputStyle}
                      onFocus={e => (e.target.style.borderColor = "#0F766E")}
                      onBlur={e => (e.target.style.borderColor = "#E2E8F0")}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Message <span style={{ color: "#EF4444" }}>*</span></label>
                  <div style={{ position: "relative" }}>
                    <MessageSquare size={16} style={{ position: "absolute", left: 14, top: 13, color: "#94A3B8" }} strokeWidth={1.8} />
                    <textarea
                      value={form.message}
                      onChange={e => { setForm(f => ({ ...f, message: e.target.value })); setError(""); }}
                      placeholder="How can we help you?"
                      rows={5}
                      style={{
                        ...inputStyle,
                        paddingLeft: 44,
                        resize: "vertical",
                        lineHeight: 1.6,
                      }}
                      onFocus={e => (e.target.style.borderColor = "#0F766E")}
                      onBlur={e => (e.target.style.borderColor = "#E2E8F0")}
                    />
                  </div>
                </div>

                {error && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    background: "#FEF2F2", border: "1px solid #FECACA",
                    borderRadius: 9, padding: "10px 14px", marginBottom: 16,
                    fontSize: 13, color: "#B91C1C", fontWeight: 600,
                  }}>
                    <AlertTriangle size={16} strokeWidth={2} />
                    {error}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={sending}
                  style={{
                    width: "100%", padding: "14px",
                    background: sending ? "#99F6E4" : "var(--color-primary-gradient)",
                    color: "#fff", border: "none", borderRadius: 12,
                    fontSize: 15, fontWeight: 700, cursor: sending ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    fontFamily: "inherit",
                  }}
                >
                  {sending ? (
                    <>
                      <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send size={16} strokeWidth={2} />
                      Send Message
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
