import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Mail,
  MapPin,
  RotateCcw,
  ShieldCheck,
  User,
  UserCheck,
  X
} from "lucide-react";
import { MouseEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import logoImg from '../assests/Meetmasterslogopng.png';
import { API_BASE_URL } from "../config/api";
import { checkOtp as apiCheckOtp, sendRegistrationOtp } from "../services/api";
import { formatNameLikeInput, startsWithNumber } from "../utils/formUtils";

// ── API helpers ───────────────────────────────────────────────────────────────
const BASE = API_BASE_URL;

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
  //features: string;
  tag?: string;
}

const isFree = (plan: Plan) => plan.discountPrice === 0;

const sanitizeEmail = (raw: string): string =>
  raw.trim().toLowerCase().replace(/[^\x21-\x7E]/g, "").replace(/\s/g, "");

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const MOBILE_REGEX = /^[6-9]\d{9}$/;
const MIN_TEXT_LENGTH = 2;

const capitalizeFirstLetter = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

const getPlanDisplayName = (plan: Plan): string => {
  if (isFree(plan)) return "Guest";
  return capitalizeFirstLetter(plan.name);
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

  // The backend validates the registration OTP only on /onboarding.
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

  useEffect(() => {
    if (inlineResendTimer <= 0) return;
    const t = setTimeout(() => setInlineResendTimer(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [inlineResendTimer]);

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
        return [];
      };

      const ENDPOINTS = ["/subscription-plans", "/subscription-plans/all"];
      let fetched: Plan[] = [];

      for (const endpoint of ENDPOINTS) {
        try {
          let data: any = null;
          try { data = await publicFetch(endpoint); }
          catch { data = await apiFetch(endpoint); }
          fetched = extractPlans(data);
          if (fetched.length > 0) break;
        } catch (err) { }
      }

      if (fetched.length > 0) {
        setPlans(fetched);
        // Default to the most expensive (highest tier) plan
        const highestPlan = [...fetched].sort((a, b) => (b.discountPrice || 0) - (a.discountPrice || 0))[0];
        setSelectedPlan(highestPlan || fetched[0]);
      } else {
        setPlans([]); setSelectedPlan(null);
      }
      setPlansLoading(false);
    })();
  }, []);

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

  const handleSendEmailOtp = async () => {
    const clean = sanitizeEmail(email);
    if (!clean || !EMAIL_REGEX.test(clean)) {
      setErrors(x => ({ ...x, email: "Enter a valid email address first" }));
      return;
    }
    setSendingOtp(true); setSendOtpError(""); setErrors(x => ({ ...x, email: "" }));
    try {
      // Pass the mobile number so the backend can also dispatch an SMS OTP when
      // SMS is enabled.  sendRegistrationOtp treats phoneNumber as optional -
      // if the user hasn't filled it in yet we simply omit it.
      const cleanMobile = mobileNumber.replace(/\s/g, "");
      await sendRegistrationOtp(clean, cleanMobile || undefined);
      setOtpSentToEmail(clean);
      setInlineOtp(["", "", "", "", "", ""]);
      setInlineOtpError("");
      setInlineResendTimer(60);
      setOtpBoxVisible(true);
      setTimeout(() => inlineOtpRefs.current[0]?.focus(), 80);
    } catch (err: any) {
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exist") || msg.includes("400") || msg.includes("duplicate")) {
        // Set inline field error and do NOT show OTP box
        setErrors(x => ({ ...x, email: "This email is already registered. Please log in instead." }));
        setSendOtpError(""); // clear generic error
      } else {
        setSendOtpError(err?.message || "Failed to send OTP. Please try again.");
      }
    } finally { setSendingOtp(false); }
  };

  const handleInlineOtpChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const next = [...inlineOtp];
    next[index] = digit;
    setInlineOtp(next); setInlineOtpError("");
    if (digit && index < 5) inlineOtpRefs.current[index + 1]?.focus();
  };

  const handleInlineOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (inlineOtp[index]) {
        const next = [...inlineOtp]; next[index] = ""; setInlineOtp(next);
      } else if (index > 0) inlineOtpRefs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) inlineOtpRefs.current[index - 1]?.focus();
    else if (e.key === "ArrowRight" && index < 5) inlineOtpRefs.current[index + 1]?.focus();
  };

  const handleInlineOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setInlineOtp(next); setInlineOtpError("");
    inlineOtpRefs.current[pasted.length >= 6 ? 5 : pasted.length]?.focus();
  };

  const handleVerifyInlineOtp = async () => {
    const otp = inlineOtp.join("");
    if (otp.length < 6) {
      setInlineOtpError("Enter the complete 6-digit OTP.");
      return;
    }

    setInlineOtpVerifying(true);
    setInlineOtpError("");

    try {
      // POST /api/users/check-otp - validates the OTP against the backend without
      // consuming it. The OTP is marked as used later when /onboarding is called.
      // This gives the user immediate feedback if they typed the wrong code.
      await apiCheckOtp(sanitizeEmail(email), otp);

      // Backend confirmed the OTP is valid - store it so handleSubmit can forward
      // it to /onboarding which will do the final consume (verifyAndMarkOtpUsed).
      setConfirmedOtp(otp);
      setEmailVerified(true);
      setOtpBoxVisible(false);
      setErrors((x) => ({ ...x, email: "" }));
    } catch (err: any) {
      const raw = String(err?.message || "").toLowerCase();
      if (raw.includes("expired")) {
        setInlineOtpError("This OTP has expired. Please request a new one.");
      } else if (raw.includes("attempt") || raw.includes("maximum")) {
        setInlineOtpError(err?.message || "Too many incorrect attempts. Please request a new OTP.");
      } else if (raw.includes("403") || raw.includes("forbidden")) {
        setInlineOtpError("Verification service unavailable. Please contact support.");
      } else {
        setInlineOtpError(err?.message || "The OTP entered is incorrect. Please try again.");
      }
    } finally {
      setInlineOtpVerifying(false);
    }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const cleanedName = name.trim().replace(/\s+/g, " ");
    const cleanedLocation = location.trim().replace(/\s+/g, " ");
    if (!cleanedName) e.name = "Full name is required";
    else if (startsWithNumber(cleanedName)) e.name = "Full name cannot start with a number";
    else if (cleanedName.length < MIN_TEXT_LENGTH) e.name = "Enter your full name";
    const cleanMobile = mobileNumber.replace(/\s/g, "");
    if (!cleanMobile) e.mobileNumber = "Mobile number is required";
    else if (!MOBILE_REGEX.test(cleanMobile)) e.mobileNumber = "Enter a valid 10-digit mobile number";
    const cleanedEmail = sanitizeEmail(email);
    if (!cleanedEmail) e.email = "Email is required";
    else if (!EMAIL_REGEX.test(cleanedEmail)) e.email = "Enter a valid email address";
    if (cleanedLocation && startsWithNumber(cleanedLocation)) e.location = "Location cannot start with a number";
    if (cleanedLocation && cleanedLocation.length < MIN_TEXT_LENGTH) e.location = "Enter a valid location";
    // FIX: emailVerified check removed here - handled separately in handleSubmit to avoid leaking error outside OTP box
    if (!selectedPlan) e.plan = "Please select a subscription plan";
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    // FIX: Check OTP verification BEFORE validate() and show error inside OTP box only
    if (!emailVerified) {
      setOtpBoxVisible(true);
      setInlineOtpError("Please enter the OTP before registering.");
      return;
    }
    if (!validate()) return;
    setSubmitting(true); setApiError("");
    try {
      const planId = selectedPlan && !isFree(selectedPlan) ? selectedPlan.id : null;
      const cleanEmail = sanitizeEmail(email);
      const cleanMobile = mobileNumber.replace(/\s/g, "");
      const registerPayload = {
        name: name.trim().replace(/\s+/g, " "), email: cleanEmail, otp: confirmedOtp,
        phoneNumber: cleanMobile, mobileNumber: cleanMobile,
        location: location.trim().replace(/\s+/g, " "), subscriptionPlanId: planId,
        subscribed: !isFree(selectedPlan!), isGuest: isFree(selectedPlan!),
      };
      await publicFetch("/onboarding", { method: "POST", body: JSON.stringify(registerPayload) });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err: any) {
      const raw = String(err?.message || "").toLowerCase();
      if (raw.includes("otp") || raw.includes("expired") || raw.includes("invalid") || raw.includes("incorrect")) {
        setEmailVerified(false);
        setOtpBoxVisible(true);
        setConfirmedOtp("");
        setInlineOtp(["", "", "", "", "", ""]);
        setInlineOtpError(raw.includes("expired")
          ? "Your OTP has expired. Please request a new one."
          : "The OTP you entered is incorrect. Please enter the correct OTP.");
        setApiError("");
        setTimeout(() => inlineOtpRefs.current[0]?.focus(), 80);
      } else {
        setApiError(err?.message || "Registration failed.");
      }
    } finally { setSubmitting(false); }
  };

  const emailIsValid = EMAIL_REGEX.test(sanitizeEmail(email));
  const cleanMobile = mobileNumber.replace(/\s/g, "");
  const mobileIsValid = MOBILE_REGEX.test(cleanMobile);
  const cleanedName = name.trim().replace(/\s+/g, " ");
  const nameIsValid = !!cleanedName && cleanedName.length >= MIN_TEXT_LENGTH && !startsWithNumber(cleanedName);
  const canRegister =
    !submitting &&
    plans.length > 0 &&
    !!selectedPlan &&
    emailVerified &&
    emailIsValid &&
    mobileIsValid &&
    nameIsValid;

  const handleInlineResend = async (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setInlineResending(true);
    try {
      await handleSendEmailOtp();
    } finally {
      setInlineResending(false);
    }
  };

  return (
    <div
      className="auth-page"
      style={{
        alignItems: 'flex-start',
        paddingTop: '40px',
        paddingBottom: '40px',
        overflowY: 'auto',
        background:
          'radial-gradient(circle at top center, rgba(255,255,255,0.22), transparent 22%), linear-gradient(180deg, #0F766E 0%, #2563EB 28%, #93C5FD 64%, #EFF6FF 100%)',
      }}
    >
      {success && (
        <div className="overlay-success">
          <div className="success-card">
            <div className="success-icon-circle"><CheckCircle size={40} /></div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--color-primary)', marginBottom: '8px' }}>
              {selectedPlan && !isFree(selectedPlan) ? "Subscribed!" : "Account Created!"}
            </div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '32px' }}>
              Login credentials sent to your email. Redirecting to login...
            </p>
            <div className="animate-spin" style={{ width: 24, height: 24, border: '3px solid var(--color-primary-light)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', margin: '0 auto' }} />
          </div>
        </div>
      )}

      <div style={{ maxWidth: '600px', width: '100%', margin: '0 auto' }} className="animate-fade-up">

        <div className="section-modern" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <button onClick={() => navigate("/")} className="icon-button-circle" style={{ background: 'var(--bg-body)' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <img src={logoImg} alt="Meet The Masters"
              style={{ height: 40, width: 'auto', objectFit: 'contain', display: 'block' }} />
            <div className="auth-brand" style={{ fontSize: '13px', marginBottom: 0 }}>MEET THE MASTERS</div>
            <div className="auth-tagline" style={{ fontSize: '9px', marginBottom: 0 }}>Create Your Account</div>
          </div>
          <div style={{ width: 36 }} />
        </div>

        <div className="section-modern">
          <h2 className="section-modern-title"><User size={20} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} /> Personal Details</h2>

          <div className="auth-input-group">
            <label className="label-base">FULL NAME <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <input value={name} onChange={e => { setName(formatNameLikeInput(e.target.value)); setErrors(x => ({ ...x, name: "" })); }}
              placeholder="Enter your full name" className={`input-base ${errors.name ? "input-error" : ""}`} />
            {errors.name && <div className="error-banner" style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, height: 'auto' }}><AlertTriangle size={14} /> {errors.name}</div>}
          </div>

          <div className="auth-input-group">
            <label className="label-base">MOBILE NUMBER <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <div style={{ display: "flex" }}>
              <span style={{ display: "flex", alignItems: "center", padding: "0 14px", background: "var(--bg-body)", border: "1.5px solid var(--border-color)", borderRight: "none", borderRadius: "var(--radius-md) 0 0 var(--radius-md)", fontSize: 14, color: "var(--text-muted)", fontWeight: 700 }}>+91</span>
              <input
                value={mobileNumber}
                onChange={e => { setMobileNumber(e.target.value.replace(/\D/g, "").slice(0, 10)); setErrors(x => ({ ...x, mobileNumber: "" })); }}
                placeholder="10-digit mobile number"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                className={`input-base ${errors.mobileNumber ? "input-error" : ""}`}
                style={{ borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}
              />
            </div>
            {mobileNumber.replace(/\D/g, "").length > 0 && mobileNumber.replace(/\D/g, "").length < 10 && !errors.mobileNumber && (
              <div style={{ fontSize: 11, color: "#D97706", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                <AlertTriangle size={12} />
                <span>Enter {10 - mobileNumber.replace(/\D/g, "").length} more digit{10 - mobileNumber.replace(/\D/g, "").length !== 1 ? "s" : ""}</span>
              </div>
            )}
            {mobileNumber.replace(/\D/g, "").length === 10 && !errors.mobileNumber && (
              <div style={{ fontSize: 11, color: "#16A34A", marginTop: 4, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                <CheckCircle size={12} />
                <span>Valid mobile number</span>
              </div>
            )}
            {errors.mobileNumber && <div className="error-banner" style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, height: 'auto' }}><AlertTriangle size={14} /> {errors.mobileNumber}</div>}
          </div>

          <div className="auth-input-group" style={{ marginBottom: 0 }}>
            <label className="label-base">EMAIL ADDRESS <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                value={email}
                onChange={e => { setEmail(e.target.value); if (emailVerified || otpBoxVisible) resetEmailVerification(); }}
                placeholder="you@example.com"
                type="email"
                disabled={emailVerified}
                className={`input-base ${errors.email ? "input-error" : ""}`}
                style={{ flex: 1, ...(emailVerified ? { borderColor: 'var(--color-primary)', background: 'var(--color-primary-light)' } : {}) }}
              />
              {emailVerified ? (
                <div className="badge badge-info" style={{ height: 42, paddingLeft: 16, paddingRight: 16 }}>
                  <ShieldCheck size={16} /> OTP Added
                </div>
              ) : (
                <button
                  onClick={handleSendEmailOtp}
                  disabled={sendingOtp || !emailIsValid || !mobileIsValid}
                  className="btn-primary"
                  style={{ height: 42, padding: '0 20px', whiteSpace: 'nowrap', fontSize: '13px' }}
                >
                  {sendingOtp ? <><span className="animate-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} /> Sending...</> : otpBoxVisible ? "Resend" : "Send OTP"}
                </button>
              )}
            </div>
            {errors.email && <div className="error-banner" style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, height: 'auto' }}><AlertTriangle size={14} /> {errors.email}</div>}
            {emailVerified && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontWeight: 600 }}>
                The OTP will be checked when you create the account.
              </div>
            )}
          </div>

          {otpBoxVisible && !emailVerified && (
            <div className="section-modern animate-fade-up" style={{ marginTop: 16, background: 'var(--color-primary-light)', border: '1px solid var(--color-info-border)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '14px' }}><Mail size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> Verify Email</div>
                  <div style={{ color: 'var(--text-muted)', textTransform: 'none', lineHeight: 1.4 }}>
                    <span style={{ fontSize: '12px' }}>OTP sent to </span>
                    <span style={{ fontSize: '11px', fontWeight: 700 }}>{otpSentToEmail}</span>
                  </div>
                </div>
                <button onClick={() => setOtpBoxVisible(false)} className="icon-button-circle" style={{ width: 28, height: 28 }}><X size={14} /></button>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }} onPaste={handleInlineOtpPaste}>
                {inlineOtp.map((val, i) => (
                  <input key={i} ref={el => { inlineOtpRefs.current[i] = el; }} value={val} maxLength={1} inputMode="numeric"
                    onChange={e => handleInlineOtpChange(i, e.target.value)}
                    onKeyDown={e => handleInlineOtpKeyDown(i, e)}
                    className="input-base"
                    style={{ width: 44, height: 54, textAlign: 'center', fontSize: '20px', fontWeight: '800', padding: 0 }}
                  />
                ))}
              </div>

              {inlineOtpError && <div className="error-banner"><AlertTriangle size={14} /> {inlineOtpError}</div>}

              <button onClick={handleVerifyInlineOtp} disabled={inlineOtpVerifying || inlineOtp.join("").length < 6} className="btn-primary" style={{ width: '100%', marginBottom: 12 }}>
                {inlineOtpVerifying ? "Saving OTP..." : "Use OTP"}
              </button>

              <div style={{ textAlign: 'center', fontSize: '12px' }}>
                {inlineResendTimer > 0 ? (
                  <span style={{ color: 'var(--text-light)' }}>Resend in {inlineResendTimer}s</span>
                ) : (
                  <button onClick={handleInlineResend} disabled={inlineResending} className="auth-link" style={{ background: 'none' }}>
                    <RotateCcw size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Resend OTP
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="auth-input-group" style={{ marginTop: 20 }}>
            <label className="label-base">LOCATION <span className="optional">(Optional)</span></label>
            <div style={{ position: 'relative' }}>
              <MapPin size={18} style={{ position: 'absolute', left: 14, top: 12, color: 'var(--text-light)' }} />
              <input
                value={location}
                onChange={e => { setLocation(formatNameLikeInput(e.target.value)); setErrors(x => ({ ...x, location: "" })); }}
                placeholder="City, State"
                className={`input-base ${errors.location ? "input-error" : ""}`}
                style={{ paddingLeft: '44px' }}
              />
            </div>
            {errors.location && <div className="error-banner" style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, height: 'auto' }}><AlertTriangle size={14} /> {errors.location}</div>}
          </div>
        </div>

        <div className="section-modern">
          <h2 className="section-modern-title"><ShieldCheck size={20} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} /> Subscription Plan</h2>

          {/* Badge row - highlight based on selected plan */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <div className="badge" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${selectedPlan && !isFree(selectedPlan) ? 'var(--color-primary)' : 'var(--border-color)'}`,
              background: selectedPlan && !isFree(selectedPlan) ? 'var(--color-primary-light)' : 'var(--bg-body)',
              color: selectedPlan && !isFree(selectedPlan) ? 'var(--color-primary)' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}>
              <UserCheck size={14} /> Subscribed - Full access
            </div>
            <div className="badge" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              border: `1.5px solid ${selectedPlan && isFree(selectedPlan) ? '#16A34A' : 'var(--border-color)'}`,
              background: selectedPlan && isFree(selectedPlan) ? '#F0FDF4' : 'var(--bg-body)',
              color: selectedPlan && isFree(selectedPlan) ? '#16A34A' : 'var(--text-muted)',
              transition: 'all 0.2s',
            }}>
              <User size={14} /> Guest - Limited access
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plansLoading ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: 16 }}>
                <img src={logoImg} alt="Meet The Masters"
                  style={{
                    width: 48, height: 'auto', display: 'block', margin: '0 auto',
                    animation: 'mtmPulse 1.8s ease-in-out infinite'
                  }} />
                <style>{`@keyframes clockSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} } @keyframes mtmPulse { 0% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } 20% { opacity: 0.6; } 50% { transform: scale(1.10); filter: blur(0px) drop-shadow(0 0 22px rgba(15,118,110,0.65)); opacity: 1.0; } 80% { opacity: 0.6; } 100% { transform: scale(0.80); filter: blur(3px) drop-shadow(0 0 6px rgba(15,118,110,0.20)); opacity: 0.0; } }`}</style>
              </div>
            ) : plans.length === 0 ? (
              <div className="error-banner">No plans found. Please retry.</div>
            ) : (
              plans.map(plan => {
                const isSelected = selectedPlan?.id === plan.id;
                const free = isFree(plan);
                // Premium plans highlight blue, Guest highlights green
                const activeBorder = free ? '#16A34A' : 'var(--color-primary)';
                const activeBg = free ? '#F0FDF4' : 'var(--color-primary-light)';
                const activeRadio = free ? '#16A34A' : 'var(--color-primary)';
                const activePriceColor = free ? '#16A34A' : 'var(--color-primary)';
                return (
                  <div key={plan.id}
                    onClick={() => setSelectedPlan(plan)}
                    className={`section-modern ${isSelected ? 'selected-plan-card' : ''}`}
                    style={{
                      padding: '20px',
                      border: `2.5px solid ${isSelected ? activeBorder : 'var(--border-color)'}`,
                      background: isSelected ? activeBg : '#fff',
                      cursor: 'pointer', marginBottom: 0, position: 'relative',
                      borderRadius: 'var(--radius-lg)',
                      transition: 'all 0.2s ease',
                      boxShadow: isSelected ? `0 4px 20px ${free ? 'rgba(22,163,74,0.15)' : 'rgba(15,118,110,0.15)'}` : '0 1px 4px rgba(0,0,0,0.04)',
                    }}>
                    {plan.tag && <div className="badge badge-premium" style={{ position: 'absolute', top: -12, right: 20 }}>{plan.tag}</div>}
                    {free && <div className="badge badge-guest" style={{ position: 'absolute', top: -12, right: 20 }}>FREE</div>}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '18px', display: 'flex', alignItems: 'center', gap: 8, color: isSelected ? (free ? '#166534' : 'var(--color-primary)') : '#0F172A' }}>
                          {getPlanDisplayName(plan)}
                          {!free ? <span className="badge badge-success" style={{ fontSize: '9px', padding: '2px 8px' }}>PREMIUM</span> : null}
                        </div>
                        {/* <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: 4 }}>{plan.features}</div> */}
                      </div>
                      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                        <div style={{ fontSize: '20px', fontWeight: 900, color: isSelected ? activePriceColor : (free ? 'var(--text-light)' : 'var(--color-primary)') }}>
                          {free ? "Free" : `₹${plan.discountPrice}`}
                        </div>
                        {/* Radio circle - filled when selected, correct colour per plan type */}
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%',
                          border: `2.5px solid ${isSelected ? activeRadio : 'var(--border-color)'}`,
                          background: isSelected ? activeRadio : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          transition: 'all 0.2s ease', flexShrink: 0,
                        }}>
                          {isSelected && <div style={{ width: 8, height: 8, background: '#fff', borderRadius: '50%' }} />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {errors.plan && <div className="error-banner" style={{ marginTop: 12 }}><AlertTriangle size={14} /> {errors.plan}</div>}
        </div>

        <div className="success-banner" style={{ marginBottom: 20 }}>
          <Mail size={18} /> <div>Your login credentials will be sent to your email after registration.</div>
        </div>

        {apiError && <div className="error-banner" style={{ marginBottom: 20 }}><AlertTriangle size={18} /> {apiError}</div>}

        <button
          onClick={handleSubmit}
          className="btn-primary"
          disabled={!canRegister}
          style={{ width: '100%', padding: '18px', fontSize: '17px', borderRadius: 'var(--radius-lg)' }}
        >
          {submitting ? <><span className="animate-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} /> Creating Account...</>
            : !emailVerified ? "Enter OTP to Continue"
              : selectedPlan && !isFree(selectedPlan) ? `Subscribe & Register (₹${selectedPlan.discountPrice})` : "Create Guest Account"}
        </button>

        <p className="auth-footer-text">
          Already have an account? <span className="auth-link" onClick={() => navigate("/login")}>Sign In <ChevronRight size={14} /></span>
        </p>

      </div>
    </div>
  );
}
