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
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

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
const MOBILE_REGEX = /^[6-9]\d{9}$/;

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
        setSelectedPlan(fetched.find(p => !isFree(p)) || fetched[0]);
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
    setSendingOtp(true); setSendOtpError("");
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
      setSendOtpError(err?.message || "Failed to send OTP.");
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

  const handleVerifyInlineOtp = () => {
    const otp = inlineOtp.join("");
    if (otp.length < 6) { setInlineOtpError("Enter the complete 6-digit OTP."); return; }
    setConfirmedOtp(otp); setEmailVerified(true); setOtpBoxVisible(false); setErrors(x => ({ ...x, email: "" }));
  };

  const handleInlineResend = async () => {
    if (inlineResendTimer > 0 || inlineResending) return;
    setInlineResending(true); setInlineOtpError("");
    try {
      await publicFetch("/users/send-otp", {
        method: "POST",
        body: JSON.stringify({ email: otpSentToEmail }),
      });
      setInlineOtp(["", "", "", "", "", ""]); setInlineResendTimer(60); inlineOtpRefs.current[0]?.focus();
    } catch (err: any) { setInlineOtpError(err?.message || "Failed to resend."); } finally { setInlineResending(false); }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Full name is required";
    const cleanMobile = mobileNumber.replace(/\s/g, "");
    if (!cleanMobile) e.mobileNumber = "Mobile number is required";
    else if (!MOBILE_REGEX.test(cleanMobile)) e.mobileNumber = "Enter a valid 10-digit mobile number";
    const cleanedEmail = sanitizeEmail(email);
    if (!cleanedEmail) e.email = "Email is required";
    else if (!EMAIL_REGEX.test(cleanedEmail)) e.email = "Enter a valid email address";
    else if (!emailVerified) e.email = "Please verify your email";
    if (!selectedPlan) e.plan = "Please select a subscription plan";
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true); setApiError("");
    try {
      const planId = selectedPlan && !isFree(selectedPlan) ? selectedPlan.id : null;
      const cleanEmail = sanitizeEmail(email);
      const cleanMobile = mobileNumber.replace(/\s/g, "");
      const registerPayload = {
        name: name.trim(), email: cleanEmail, otp: confirmedOtp,
        phoneNumber: cleanMobile, mobileNumber: cleanMobile,
        location: location.trim() || "", subscriptionPlanId: planId,
        subscribed: !isFree(selectedPlan!), isGuest: isFree(selectedPlan!),
      };
      await publicFetch("/onboarding", { method: "POST", body: JSON.stringify(registerPayload) });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err: any) {
      setApiError(err?.message || "Registration failed.");
    } finally { setSubmitting(false); }
  };

  const emailIsValid = EMAIL_REGEX.test(sanitizeEmail(email));

  return (
    <div className="auth-page" style={{ alignItems: 'flex-start', paddingTop: '40px', paddingBottom: '40px', overflowY: 'auto', background: 'var(--bg-body)' }}>
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
          <div style={{ textAlign: 'center' }}>
            <div className="auth-brand" style={{ fontSize: '18px', marginBottom: 0 }}>MEET THE MASTERS</div>
            <div className="auth-tagline" style={{ fontSize: '9px', marginBottom: 0 }}>Create Your Account</div>
          </div>
          <div style={{ width: 36 }} />
        </div>

        <div className="section-modern">
          <h2 className="section-modern-title"><User size={20} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} /> Personal Details</h2>

          <div className="auth-input-group">
            <label className="label-base">FULL NAME <span style={{ color: 'var(--color-danger)' }}>*</span></label>
            <input value={name} onChange={e => { setName(e.target.value); setErrors(x => ({ ...x, name: "" })); }}
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
                className={`input-base ${errors.mobileNumber ? "input-error" : ""}`}
                style={{ borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}
              />
            </div>
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
                className={`input-base ${errors.email ? "input-error" : ""} ${emailVerified ? "input-success" : ""}`}
                style={{ flex: 1, ...(emailVerified ? { borderColor: 'var(--color-success)', background: 'var(--color-success-bg)' } : {}) }}
              />
              {emailVerified ? (
                <div className="badge badge-success" style={{ height: 42, paddingLeft: 16, paddingRight: 16 }}>
                  <ShieldCheck size={16} /> Verified
                </div>
              ) : (
                <button
                  onClick={handleSendEmailOtp}
                  disabled={sendingOtp || !emailIsValid}
                  className="btn-primary"
                  style={{ height: 42, padding: '0 20px', whiteSpace: 'nowrap', fontSize: '13px' }}
                >
                  {sendingOtp ? <><span className="animate-spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} /> Sending...</> : otpBoxVisible ? "Resend" : "Send OTP"}
                </button>
              )}
            </div>
            {errors.email && <div className="error-banner" style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, height: 'auto' }}><AlertTriangle size={14} /> {errors.email}</div>}
          </div>

          {otpBoxVisible && !emailVerified && (
            <div className="section-modern animate-fade-up" style={{ marginTop: 16, background: 'var(--color-primary-light)', border: '1px solid var(--color-info-border)', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '14px' }}><Mail size={16} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> Verify Email</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>OTP sent to {otpSentToEmail}</div>
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

              <button onClick={handleVerifyInlineOtp} disabled={inlineOtp.join("").length < 6} className="btn-primary" style={{ width: '100%', marginBottom: 12 }}>Confirm OTP</button>

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
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City, State" className="input-base" style={{ paddingLeft: '44px' }} />
            </div>
          </div>
        </div>

        <div className="section-modern">
          <h2 className="section-modern-title"><ShieldCheck size={20} style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--color-primary)' }} /> Subscription Plan</h2>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
            <div className="badge badge-info"><UserCheck size={14} /> Subscribed - Full access</div>
            <div className="badge badge-guest"><User size={14} /> Guest - Limited access</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plansLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }} className="animate-spin"><RotateCcw size={32} color="var(--color-primary)" /></div>
            ) : plans.length === 0 ? (
              <div className="error-banner">No plans found. Please retry.</div>
            ) : (
              plans.map(plan => (
                <div key={plan.id} onClick={() => setSelectedPlan(plan)} className={`section-modern ${selectedPlan?.id === plan.id ? "selected-plan-card" : ""}`} style={{
                  padding: '20px', border: `2.5px solid ${selectedPlan?.id === plan.id ? 'var(--color-primary)' : 'var(--border-color)'}`,
                  background: selectedPlan?.id === plan.id ? 'var(--color-primary-light)' : '#fff', cursor: 'pointer', marginBottom: 0, position: 'relative'
                }}>
                  {plan.tag && <div className="badge badge-premium" style={{ position: 'absolute', top: -12, right: 20 }}>{plan.tag}</div>}
                  {isFree(plan) && <div className="badge badge-guest" style={{ position: 'absolute', top: -12, right: 20 }}>FREE</div>}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '18px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {getPlanDisplayName(plan)}
                        {!isFree(plan) ? <span className="badge badge-success" style={{ fontSize: '9px', padding: '2px 8px' }}>PREMIUM</span> : null}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: 4 }}>{plan.features}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: isFree(plan) ? 'var(--text-light)' : 'var(--color-primary)' }}>{isFree(plan) ? "Free" : `₹${plan.discountPrice}`}</div>
                      <div className="icon-button-circle" style={{ width: 20, height: 20, border: '2px solid var(--color-primary)', background: selectedPlan?.id === plan.id ? 'var(--color-primary)' : 'transparent', margin: '4px 0 0 auto' }}>
                        {selectedPlan?.id === plan.id && <div style={{ width: 8, height: 8, background: '#fff', borderRadius: '50%' }} />}
                      </div>
                    </div>
                  </div>
                </div>
              ))
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
          disabled={submitting || plans.length === 0 || !emailVerified}
          style={{ width: '100%', padding: '18px', fontSize: '17px', borderRadius: 'var(--radius-lg)' }}
        >
          {submitting ? <><span className="animate-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} /> Creating Account...</>
            : !emailVerified ? "Verify Email to Continue"
              : selectedPlan && !isFree(selectedPlan) ? `Subscribe & Register (₹${selectedPlan.discountPrice})` : "Create Guest Account"}
        </button>

        <p className="auth-footer-text">
          Already have an account? <span className="auth-link" onClick={() => navigate("/login")}>Sign In <ChevronRight size={14} /></span>
        </p>

      </div>
    </div>
  );
}