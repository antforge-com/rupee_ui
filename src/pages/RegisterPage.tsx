import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/RegisterPage.module.css";

// ── API helpers ───────────────────────────────────────────────────────────────
const BASE = "http://52.55.178.31:8081/api";

const publicFetch = async (endpoint: string, options: RequestInit = {}) => {
  const res = await fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const ct = res.headers.get("content-type");
  const data = ct?.includes("application/json") ? await res.json() : { message: await res.text() };
  if (!res.ok) {
    const fieldErrors = (data?.fieldErrors as Record<string, string> | undefined)
      ? Object.entries(data.fieldErrors as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(", ")
      : null;
    throw new Error(fieldErrors || data?.message || `Error ${res.status}`);
  }
  return data;
};

const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = localStorage.getItem("fin_token");
  const res = await fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const ct = res.headers.get("content-type");
  const data = ct?.includes("application/json") ? await res.json() : { message: await res.text() };
  if (!res.ok) {
    console.error("❌ API Error body:", JSON.stringify(data, null, 2));
    const fieldErrors = data?.fieldErrors
      ? Object.entries(data.fieldErrors).map(([k, v]) => `${k}: ${v}`).join(", ")
      : null;
    throw new Error(fieldErrors || data?.message || `Error ${res.status}`);
  }
  return data;
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Plan {
  id: number;
  name: string;
  originalPrice: number;
  discountPrice: number;
  features: string;
  tag?: string;
}

const isFree = (plan: Plan) => plan.discountPrice === 0;

const sanitizeEmail = (raw: string): string =>
  raw.trim().toLowerCase().replace(/[^\x21-\x7E]/g, "").replace(/\s/g, "");

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

// Mobile number validation — 10-digit Indian mobile
const MOBILE_REGEX = /^[6-9]\d{9}$/;

// CHANGED: "Members" → "Guest" for the free tier display
const getPlanDisplayName = (plan: Plan): string => {
  if (isFree(plan)) return "Guest";
  return plan.name;
};

export default function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState("");

  // ── Inline email OTP verification ─────────────────────────────────────────
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpBoxVisible, setOtpBoxVisible] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [sendOtpError, setSendOtpError] = useState("");
  const [inlineOtp, setInlineOtp] = useState(["", "", "", "", "", ""]);
  const [inlineOtpError, setInlineOtpError] = useState("");
  const [inlineOtpVerifying, setInlineOtpVerifying] = useState(false);
  const [inlineResendTimer, setInlineResendTimer] = useState(0);
  const [inlineResending, setInlineResending] = useState(false);
  const [otpSentToEmail, setOtpSentToEmail] = useState("");
  const [confirmedOtp, setConfirmedOtp] = useState("");
  const inlineOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Countdown timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (inlineResendTimer <= 0) return;
    const t = setTimeout(() => setInlineResendTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [inlineResendTimer]);

  // ── Fetch subscription plans ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setPlansLoading(true);

      const extractPlans = (data: any): Plan[] => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.content)) return data.content;
        for (const key of ["plans", "subscriptionPlans", "data", "items", "results", "list"]) {
          if (Array.isArray(data[key])) return data[key];
        }
        if (typeof data === "object" && data.id) return [data];
        return [];
      };

      const ENDPOINTS = ["/subscription-plans", "/subscription-plans/all", "/subscriptionplans", "/plans"];
      let fetched: Plan[] = [];

      for (const endpoint of ENDPOINTS) {
        try {
          let data: any = null;
          try { data = await publicFetch(endpoint); }
          catch { data = await apiFetch(endpoint); }
          console.log(`📋 [${endpoint}] raw:`, JSON.stringify(data, null, 2));
          fetched = extractPlans(data);
          if (fetched.length > 0) { console.log(`✅ Got ${fetched.length} plans`); break; }
        } catch (err) {
          console.warn(`⚠️ ${endpoint} failed:`, err);
        }
      }

      if (fetched.length > 0) {
        setPlans(fetched);
        setSelectedPlan(fetched.find(p => !isFree(p)) || fetched[0]);
      } else {
        setPlans([]);
        setSelectedPlan(null);
      }
      setPlansLoading(false);
    })();
  }, []);

  // ── Reset email verification when email is edited ─────────────────────────
  const resetEmailVerification = () => {
    setEmailVerified(false);
    setOtpBoxVisible(false);
    setInlineOtp(["", "", "", "", "", ""]);
    setInlineOtpError("");
    setSendOtpError("");
    setOtpSentToEmail("");
    setConfirmedOtp("");
    setInlineResendTimer(0);
  };

  // ── Send OTP to email ─────────────────────────────────────────────────────
  const handleSendEmailOtp = async () => {
    const clean = sanitizeEmail(email);
    if (!clean || !EMAIL_REGEX.test(clean)) {
      setErrors(x => ({ ...x, email: "Enter a valid email address first" }));
      return;
    }
    setSendingOtp(true);
    setSendOtpError("");
    try {
      await publicFetch("/users/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: clean }),
      });
      setOtpSentToEmail(clean);
      setInlineOtp(["", "", "", "", "", ""]);
      setInlineOtpError("");
      setInlineResendTimer(60);
      setOtpBoxVisible(true);
      setTimeout(() => inlineOtpRefs.current[0]?.focus(), 80);
    } catch (err: any) {
      setSendOtpError(err?.message || "Failed to send OTP. Please try again.");
    } finally {
      setSendingOtp(false);
    }
  };

  // ── Inline OTP input handlers ─────────────────────────────────────────────
  const handleInlineOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...inlineOtp];
    next[index] = digit;
    setInlineOtp(next);
    setInlineOtpError("");
    if (digit && index < 5) inlineOtpRefs.current[index + 1]?.focus();
  };

  const handleInlineOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (inlineOtp[index]) {
        const next = [...inlineOtp]; next[index] = ""; setInlineOtp(next);
      } else if (index > 0) {
        inlineOtpRefs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) inlineOtpRefs.current[index - 1]?.focus();
    else if (e.key === "ArrowRight" && index < 5) inlineOtpRefs.current[index + 1]?.focus();
  };

  const handleInlineOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setInlineOtp(next);
    setInlineOtpError("");
    inlineOtpRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  // ── Verify inline OTP ─────────────────────────────────────────────────────
  const handleVerifyInlineOtp = () => {
    const otp = inlineOtp.join("");
    if (otp.length < 6) { setInlineOtpError("Enter the complete 6-digit OTP."); return; }
    setConfirmedOtp(otp);
    setEmailVerified(true);
    setOtpBoxVisible(false);
    setErrors(x => ({ ...x, email: "" }));
  };

  // ── Resend inline OTP ─────────────────────────────────────────────────────
  const handleInlineResend = async () => {
    if (inlineResendTimer > 0 || inlineResending) return;
    setInlineResending(true);
    setInlineOtpError("");
    try {
      await publicFetch("/users/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: otpSentToEmail }),
      });
      setInlineOtp(["", "", "", "", "", ""]);
      setInlineResendTimer(60);
      inlineOtpRefs.current[0]?.focus();
    } catch (err: any) {
      setInlineOtpError(err?.message || "Failed to resend. Try again.");
    } finally {
      setInlineResending(false);
    }
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};

    if (!name.trim()) e.name = "Full name is required";

    const cleanMobile = mobileNumber.replace(/\s/g, "");
    if (!cleanMobile) {
      e.mobileNumber = "Mobile number is required";
    } else if (!MOBILE_REGEX.test(cleanMobile)) {
      e.mobileNumber = "Enter a valid 10-digit Indian mobile number";
    }

    const cleanedEmail = sanitizeEmail(email);
    if (!cleanedEmail) {
      e.email = "Email is required";
    } else if (!EMAIL_REGEX.test(cleanedEmail)) {
      e.email = "Enter a valid email address (e.g. user@example.com)";
    } else if (!emailVerified) {
      e.email = "Please verify your email before submitting";
    }

    if (!selectedPlan) e.plan = "Please select a subscription plan";

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setApiError("");

    try {
      const planId = selectedPlan && !isFree(selectedPlan) ? selectedPlan.id : null;
      const cleanEmail = sanitizeEmail(email);
      const cleanMobile = mobileNumber.replace(/\s/g, "");

      const registerPayload = {
        name: name.trim(),
        email: cleanEmail,
        otp: confirmedOtp,
        // Backend UserRegistrationRequest uses `phoneNumber` field (NOT mobileNumber)
        phoneNumber: cleanMobile,
        mobileNumber: cleanMobile, // Keep both for compatibility
        location: location.trim() || "",
        subscriptionPlanId: planId,
        subscribed: !isFree(selectedPlan!),
        isGuest: isFree(selectedPlan!),
      };

      console.log("📤 Sending Payload:", JSON.stringify(registerPayload, null, 2));

      const data = await publicFetch("/onboarding", {
        method: "POST",
        body: JSON.stringify(registerPayload),
      });

      if (data?.token) {
        localStorage.setItem("fin_token", data.token);
        const rawRole = data.role || data.userRole || "";
        const registeredRole = rawRole
          ? rawRole.toString().toUpperCase().trim().replace(/^ROLE_/, "")
          : (!isFree(selectedPlan!) ? "SUBSCRIBER" : "GUEST");
        localStorage.setItem("fin_role", registeredRole);
        if (data.id) localStorage.setItem("fin_user_id", String(data.id));
        if (data.userId) localStorage.setItem("fin_user_id", String(data.userId));
        // Flag first-time login so user page can show questionnaire
        localStorage.setItem("fin_first_login", "true");
      }

      setSuccess(true);
      setTimeout(() => navigate("/login"), 2500);

    } catch (err: any) {
      console.error("Registration error:", err);
      setApiError(err?.message || "Registration failed. Check your inputs.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const emailIsValid = EMAIL_REGEX.test(sanitizeEmail(email));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>

      {success && (
        <div className={styles.successOverlay}>
          <div className={styles.successBox}>
            <div className={styles.successIcon}>✓</div>
            <div className={styles.successTitle}>
              {selectedPlan && !isFree(selectedPlan)
                ? `Subscribed to ${selectedPlan.name}!`
                : "Account Created!"}
            </div>
            <div className={styles.successSub}>
              Your login credentials have been sent to your email. Redirecting to login…
            </div>
          </div>
        </div>
      )}

      <div className={styles.header}>
        <button onClick={() => navigate("/")} className={styles.backBtn}>
          <svg width="22" height="22" fill="none" viewBox="0 0 24 24">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div className={styles.logoSection}>
          <div className={styles.logoText}>MEET THE MASTERS</div>
          <div className={styles.logoSub}>CREATE YOUR ACCOUNT</div>
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div className={styles.content}>

        {/* ── Personal Details ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Personal Details</div>

          <label className={styles.label}>FULL NAME <span className={styles.required}>*</span></label>
          <input value={name} onChange={e => { setName(e.target.value); setErrors(x => ({ ...x, name: "" })); }}
            placeholder="Enter your full name" className={`${styles.input} ${errors.name ? styles.inputError : ""}`} />
          {errors.name && <div className={styles.errorMsg}>{errors.name}</div>}

          {/* Mobile Number */}
          <label className={styles.label} style={{ marginTop: 14 }}>MOBILE NUMBER <span className={styles.required}>*</span></label>
          <div style={{ display: "flex", gap: 0 }}>
            <span style={{
              display: "flex", alignItems: "center", padding: "0 12px",
              background: "#F1F5F9", border: "1.5px solid #D1D5DB",
              borderRight: "none", borderRadius: "9px 0 0 9px",
              fontSize: 14, color: "#475569", fontWeight: 600, flexShrink: 0,
            }}>
              +91
            </span>
            <input
              value={mobileNumber}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                setMobileNumber(val);
                setErrors(x => ({ ...x, mobileNumber: "" }));
              }}
              placeholder="10-digit mobile number"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              className={`${styles.input} ${errors.mobileNumber ? styles.inputError : ""}`}
              style={{ borderRadius: "0 9px 9px 0", flex: 1 }}
            />
          </div>
          {errors.mobileNumber && <div className={styles.errorMsg}>{errors.mobileNumber}</div>}

          {/* ── Email ── */}
          <label className={styles.label} style={{ marginTop: 14 }}>EMAIL <span className={styles.required}>*</span></label>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setErrors(x => ({ ...x, email: "" }));
                if (emailVerified || otpBoxVisible) resetEmailVerification();
              }}
              onBlur={e => {
                const s = sanitizeEmail(e.target.value);
                setEmail(s);
                if (s && !EMAIL_REGEX.test(s))
                  setErrors(x => ({ ...x, email: "Enter a valid email address (e.g. user@example.com)" }));
              }}
              placeholder="you@example.com"
              type="email"
              autoComplete="email"
              disabled={emailVerified}
              className={`${styles.input} ${errors.email ? styles.inputError : ""}`}
              style={{
                flex: 1,
                ...(emailVerified
                  ? { borderColor: "#16A34A", background: "#F0FDF4", color: "#166534" }
                  : {}),
              }}
            />

            {emailVerified ? (
              <div style={{
                flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
                padding: "0 14px", height: 42, borderRadius: 9,
                background: "#F0FDF4", border: "1.5px solid #86EFAC",
                color: "#16A34A", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              }}>
                ✅ Verified
              </div>
            ) : (
              <button
                onClick={handleSendEmailOtp}
                disabled={sendingOtp || !emailIsValid}
                style={{
                  flexShrink: 0, padding: "0 14px", height: 42, borderRadius: 9,
                  border: "none",
                  background: sendingOtp || !emailIsValid
                    ? "#E2E8F0"
                    : otpBoxVisible
                      ? "#F1F5F9"
                      : "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                  color: sendingOtp || !emailIsValid ? "#94A3B8" : otpBoxVisible ? "#475569" : "#fff",
                  fontSize: 12, fontWeight: 700, cursor: sendingOtp ? "wait" : "pointer",
                  whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6,
                  transition: "all 0.15s",
                }}
              >
                {sendingOtp
                  ? <><span style={{ width: 11, height: 11, border: "2px solid rgba(255,255,255,0.35)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} /> Sending…</>
                  : otpBoxVisible ? "↺ Resend" : "Send OTP"
                }
              </button>
            )}
          </div>

          {errors.email && <div className={styles.errorMsg}>{errors.email}</div>}
          {sendOtpError && !errors.email && (
            <div style={{ marginTop: 5, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>⚠️ {sendOtpError}</div>
          )}

          {/* OTP Verification Box */}
          {otpBoxVisible && !emailVerified && (
            <div style={{
              marginTop: 10,
              padding: "16px 16px 14px",
              borderRadius: 12,
              border: "1.5px solid #BFDBFE",
              background: "linear-gradient(135deg, #F8FBFF 0%, #EFF6FF 100%)",
              boxShadow: "0 2px 8px rgba(37,99,235,0.07)",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1E3A8A", marginBottom: 2 }}>
                    ✉️ Verify your email
                  </div>
                  <div style={{ fontSize: 11, color: "#64748B" }}>
                    OTP sent to <strong style={{ color: "#0F172A" }}>{otpSentToEmail}</strong>
                  </div>
                </div>
                <button
                  onClick={() => { setOtpBoxVisible(false); setInlineOtp(["", "", "", "", "", ""]); setInlineOtpError(""); }}
                  style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 4px", marginTop: -2 }}
                  title="Dismiss"
                >✕</button>
              </div>

              <div
                style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 10 }}
                onPaste={handleInlineOtpPaste}
              >
                {inlineOtp.map((val, i) => (
                  <input
                    key={i}
                    ref={el => { inlineOtpRefs.current[i] = el; }}
                    value={val}
                    maxLength={1}
                    inputMode="numeric"
                    onChange={e => handleInlineOtpChange(i, e.target.value)}
                    onKeyDown={e => handleInlineOtpKeyDown(i, e)}
                    style={{
                      width: 42, height: 50,
                      textAlign: "center",
                      fontSize: 22, fontWeight: 800,
                      border: inlineOtpError
                        ? "2px solid #EF4444"
                        : val
                          ? "2px solid #2563EB"
                          : "2px solid #CBD5E1",
                      borderRadius: 10,
                      background: val ? "#EFF6FF" : "#fff",
                      color: "#0F172A",
                      outline: "none",
                      transition: "border-color 0.12s, background 0.12s",
                      caretColor: "#2563EB",
                    }}
                  />
                ))}
              </div>

              {inlineOtpError && (
                <div style={{
                  fontSize: 12, color: "#DC2626", fontWeight: 600,
                  textAlign: "center", marginBottom: 8,
                  background: "#FEF2F2", borderRadius: 7,
                  padding: "5px 10px", border: "1px solid #FECACA",
                }}>
                  ⚠️ {inlineOtpError}
                </div>
              )}

              <button
                onClick={handleVerifyInlineOtp}
                disabled={inlineOtp.join("").length < 6}
                style={{
                  width: "100%", padding: "11px",
                  background: inlineOtp.join("").length < 6
                    ? "#93C5FD"
                    : "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                  color: "#fff", border: "none", borderRadius: 9,
                  fontSize: 13, fontWeight: 700,
                  cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "background 0.15s",
                  boxShadow: inlineOtp.join("").length === 6 ? "0 2px 8px rgba(37,99,235,0.3)" : "none",
                }}
              >
                Confirm OTP
              </button>

              <div style={{ textAlign: "center", marginTop: 10, fontSize: 12, color: "#64748B" }}>
                Didn't receive it?{" "}
                {inlineResendTimer > 0 ? (
                  <span style={{ color: "#94A3B8", fontWeight: 600 }}>Resend in {inlineResendTimer}s</span>
                ) : (
                  <button
                    onClick={handleInlineResend}
                    disabled={inlineResending}
                    style={{ background: "none", border: "none", padding: 0, color: "#2563EB", fontWeight: 700, cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
                  >
                    {inlineResending ? "Sending…" : "Resend OTP"}
                  </button>
                )}
              </div>
            </div>
          )}

          <label className={styles.label} style={{ marginTop: 14 }}>LOCATION <span className={styles.optional}>(Optional)</span></label>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City, State" className={styles.input} />
        </div>

        {/* ── Subscription Plans ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Choose Your Plan</div>

          {/* REMOVED: "Members — basic access only" chip as per requirements */}
          {/* Only show the subscribed badge */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "#1E40AF", fontWeight: 600 }}>
              ✅ Subscribed — full access to consultant bookings &amp; features
            </div>
            {/* CHANGED: "Members" → "Guest" with free access indicator */}
            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "#64748B", fontWeight: 600 }}>
              👤 Guest — explore with limited access
            </div>
          </div>

          {plansLoading ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8" }}>
              <div style={{ width: 24, height: 24, border: "3px solid #E2E8F0", borderTopColor: "#2563EB", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 10px" }} />
              Loading plans…
            </div>
          ) : plans.length === 0 ? (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "16px", color: "#B91C1C", fontSize: 13 }}>
              ⚠️ Could not load subscription plans.
              <br /><br />
              <button onClick={() => window.location.reload()} style={{ background: "#B91C1C", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Retry</button>
            </div>
          ) : (
            <div className={styles.planGrid}>
              {plans.map(plan => {
                const free = isFree(plan);
                const selected = selectedPlan?.id === plan.id;
                // CHANGED: free tier label is now "Guest"
                const displayName = getPlanDisplayName(plan);
                return (
                  <div key={plan.id}
                    onClick={() => { setSelectedPlan(plan); setErrors(x => ({ ...x, plan: "" })); }}
                    style={{ border: selected ? "2px solid #2563EB" : "1.5px solid #E2E8F0", borderRadius: 14, padding: "16px 18px", cursor: "pointer", background: selected ? "#EFF6FF" : "#fff", position: "relative", transition: "all 0.15s", boxShadow: selected ? "0 0 0 3px rgba(37,99,235,0.1)" : "0 1px 3px rgba(0,0,0,0.05)", marginBottom: 10 }}
                    className={styles.planCard}
                  >
                    {plan.tag && <span style={{ position: "absolute", top: -10, right: 14, background: "#2563EB", color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.06em" }}>{plan.tag}</span>}
                    {/* "FREE" badge for guest tier */}
                    {free && <span style={{ position: "absolute", top: -10, right: 14, background: "#64748B", color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.06em" }}>FREE</span>}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          {/* CHANGED: Show "Guest" instead of plan.name when free */}
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{displayName}</span>
                          {!free && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#DCFCE7", color: "#16A34A", border: "1px solid #86EFAC" }}>SUBSCRIBED</span>}
                          {free && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#F1F5F9", color: "#64748B", border: "1px solid #E2E8F0" }}>GUEST</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>{plan.features}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                        {/* CHANGED: Show "Guest" label for free tier price display */}
                        <div style={{ fontSize: 18, fontWeight: 800, color: free ? "#94A3B8" : "#2563EB" }}>{free ? "Free" : `₹${plan.discountPrice}`}</div>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${selected ? "#2563EB" : "#CBD5E1"}`, display: "flex", alignItems: "center", justifyContent: "center", background: selected ? "#2563EB" : "#fff" }}>
                          {selected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {errors.plan && <div className={styles.errorMsg}>{errors.plan}</div>}
          {selectedPlan && (
            <div style={{ marginTop: 12, padding: "12px 16px", background: isFree(selectedPlan) ? "#F8FAFC" : "#F0FDF4", border: `1px solid ${isFree(selectedPlan) ? "#E2E8F0" : "#86EFAC"}`, borderRadius: 10, fontSize: 13, color: isFree(selectedPlan) ? "#64748B" : "#166534", fontWeight: 600 }}>
              {/* CHANGED: "Free account" → "Guest account" */}
              {isFree(selectedPlan)
                ? "👤 You're signing up as a Guest — explore with limited features."
                : `✅ You'll be subscribed to ${selectedPlan.name} (₹${selectedPlan.discountPrice}) — full access enabled.`}
            </div>
          )}
        </div>

        {/* Note about credentials email */}
        <div style={{
          background: "#F0FDF4", border: "1px solid #86EFAC",
          borderRadius: 10, padding: "12px 16px", marginBottom: 12,
          fontSize: 13, color: "#166534",
        }}>
          📧 <strong>Note:</strong> After registration, your login credentials (username &amp; password) will be sent to your registered email address.
        </div>

        {apiError && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, padding: "12px 16px", color: "#B91C1C", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>⚠️ {apiError}</div>
        )}

        <button
          onClick={handleSubmit}
          className={styles.submitBtn}
          disabled={submitting || plans.length === 0 || !emailVerified}
        >
          {submitting
            ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
              Creating Account…
            </span>
            : !emailVerified
              ? "Verify Email to Continue"
              : selectedPlan && !isFree(selectedPlan)
                ? `Subscribe & Create Account (₹${selectedPlan.discountPrice})`
                : "Create Guest Account"
          }
        </button>

        {!emailVerified && emailIsValid && (
          <p style={{ textAlign: "center", fontSize: 12, color: "#94A3B8", marginTop: 6, marginBottom: 0 }}>
            Email verification required before account creation
          </p>
        )}

        <p className={styles.loginText}>
          Already have an account?{" "}
          <span className={styles.loginLink} onClick={() => navigate("/login")}>Sign In</span>
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}