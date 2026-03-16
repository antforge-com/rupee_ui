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

interface IncomeItem { incomeType: string; incomeAmount: string; }
interface ExpenseItem { expenseType: string; expenseAmount: string; }

const isFree = (plan: Plan) => plan.discountPrice === 0;

const sanitizeEmail = (raw: string): string =>
  raw.trim().toLowerCase().replace(/[^\x21-\x7E]/g, "").replace(/\s/g, "");

const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

export default function RegisterPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);

  const [incomeItems, setIncomeItems] = useState<IncomeItem[]>([{ incomeType: "Salary", incomeAmount: "" }]);
  const [expenseItems, setExpenseItems] = useState<ExpenseItem[]>([{ expenseType: "Rent", expenseAmount: "" }]);
  const [showIncomePopup, setShowIncomePopup] = useState(false);
  const [showExpensePopup, setShowExpensePopup] = useState(false);
  const [popupLabel, setPopupLabel] = useState("");
  const [popupAmount, setPopupAmount] = useState("");

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
  const [confirmedOtp, setConfirmedOtp] = useState(""); // submitted with onboarding
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

  // ── Income / Expense popup helpers ────────────────────────────────────────
  const openIncomePopup = () => { setPopupLabel(""); setPopupAmount(""); setShowIncomePopup(true); };
  const openExpensePopup = () => { setPopupLabel(""); setPopupAmount(""); setShowExpensePopup(true); };

  const confirmIncome = () => {
    if (popupLabel.trim() || popupAmount.trim())
      setIncomeItems(i => [...i, { incomeType: popupLabel, incomeAmount: popupAmount }]);
    setShowIncomePopup(false);
  };
  const confirmExpense = () => {
    if (popupLabel.trim() || popupAmount.trim())
      setExpenseItems(e => [...e, { expenseType: popupLabel, expenseAmount: popupAmount }]);
    setShowExpensePopup(false);
  };

  const updateIncome = (i: number, f: keyof IncomeItem, v: string) =>
    setIncomeItems(items => items.map((item, idx) => idx === i ? { ...item, [f]: v } : item));
  const updateExpense = (i: number, f: keyof ExpenseItem, v: string) =>
    setExpenseItems(items => items.map((item, idx) => idx === i ? { ...item, [f]: v } : item));

  const totalIncome = incomeItems.reduce((s, i) => s + (parseFloat(i.incomeAmount) || 0), 0);
  const totalExpenses = expenseItems.reduce((s, i) => s + (parseFloat(i.expenseAmount) || 0), 0);

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
      // POST /api/users/send-otp  { email }
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
  // OTP is NOT verified via a separate endpoint — it goes into the /onboarding payload.
  // "Confirm OTP" just stores the code locally and unlocks the submit button.
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

    const cleanedEmail = sanitizeEmail(email);
    if (!cleanedEmail) {
      e.email = "Email is required";
    } else if (!EMAIL_REGEX.test(cleanedEmail)) {
      e.email = "Enter a valid email address (e.g. user@example.com)";
    } else if (!emailVerified) {
      e.email = "Please verify your email before submitting";
    }

    if (!dob) e.dob = "Date of birth is required";

    const cleanId = identifier.replace(/\s/g, "").toUpperCase();
    if (!identifier.trim()) {
      e.identifier = "PAN or Aadhar is required";
    } else if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanId) && !/^\d{12}$/.test(cleanId)) {
      e.identifier = "Invalid format. Enter 10-char PAN or 12-digit Aadhar";
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
      const cleanIdentifier = identifier.replace(/\s/g, "").toUpperCase();
      const cleanEmail = sanitizeEmail(email);

      const registerPayload = {
        name: name.trim(),
        email: cleanEmail,
        otp: confirmedOtp,          // ✅ backend validates OTP here
        dob: dob,
        location: location.trim() || "",
        identifier: cleanIdentifier,
        subscriptionPlanId: planId,
        subscribed: !isFree(selectedPlan!),
        incomes: incomeItems
          .filter(i => i.incomeAmount !== "")
          .map(i => ({ incomeType: i.incomeType || "Income", incomeAmount: parseFloat(i.incomeAmount) || 0 })),
        expenses: expenseItems
          .filter(e => e.expenseAmount !== "")
          .map(e => ({ expenseType: e.expenseType || "Expense", expenseAmount: parseFloat(e.expenseAmount) || 0 })),
      };

      console.log("📤 Sending Payload:", JSON.stringify(registerPayload, null, 2));

      const data = await publicFetch("/onboarding", {
        method: "POST",
        body: JSON.stringify(registerPayload),
      });

      if (data?.token) {
        localStorage.setItem("fin_token", data.token);
        // ✅ ROLE STORAGE: Persist the exact role returned by the backend.
        // Subscribed users get SUBSCRIBER; free-plan users get USER.
        // This is used throughout the app (e.g. ticket creation guards).
        const registeredRole = data.role
          ? data.role.toString().toUpperCase().trim().replace(/^ROLE_/, "")
          : (!isFree(selectedPlan!) ? "SUBSCRIBER" : "USER");
        localStorage.setItem("fin_role", registeredRole);
        if (data.id) localStorage.setItem("fin_user_id", String(data.id));
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
            <div className={styles.successSub}>Redirecting to login…</div>
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
          <div className={styles.logoText}>FINADVISE</div>
          <div className={styles.logoSub}>CREATE YOUR ACCOUNT</div>
        </div>
        <div style={{ width: 36 }} />
      </div>

      {(showIncomePopup || showExpensePopup) && (
        <div className={styles.overlay} onClick={() => { setShowIncomePopup(false); setShowExpensePopup(false); }}>
          <div className={styles.popup} onClick={e => e.stopPropagation()}>
            <div className={styles.popupHeader}>
              <span className={styles.popupTitle}>{showIncomePopup ? "Add Income" : "Add Expense"}</span>
              <button className={styles.popupClose} onClick={() => { setShowIncomePopup(false); setShowExpensePopup(false); }}>✕</button>
            </div>
            <label className={styles.label}>LABEL</label>
            <input value={popupLabel} onChange={e => setPopupLabel(e.target.value)} placeholder="e.g. Salary, Rent, Grocery" className={styles.input} autoFocus />
            <label className={styles.label}>AMOUNT</label>
            <div className={styles.amountWrapper}>
              <span className={styles.currencySymbol}>₹</span>
              <input value={popupAmount} onChange={e => setPopupAmount(e.target.value)} placeholder="0" type="number" className={styles.amountInput} />
            </div>
            <button onClick={showIncomePopup ? confirmIncome : confirmExpense} className={styles.popupConfirmBtn}>
              + Add {showIncomePopup ? "Income" : "Expense"}
            </button>
          </div>
        </div>
      )}

      <div className={styles.content}>

        {/* ── Personal Details ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Personal Details</div>

          <label className={styles.label}>FULL NAME <span className={styles.required}>*</span></label>
          <input value={name} onChange={e => { setName(e.target.value); setErrors(x => ({ ...x, name: "" })); }}
            placeholder="Enter your full name" className={`${styles.input} ${errors.name ? styles.inputError : ""}`} />
          {errors.name && <div className={styles.errorMsg}>{errors.name}</div>}

          {/* ── Email ── */}
          <label className={styles.label}>EMAIL <span className={styles.required}>*</span></label>

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

            {/* Send OTP / Verified pill */}
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

          {/* ════════════════════════════════════════════════════
              INLINE OTP VERIFICATION BOX
              Appears below email after OTP is sent
          ════════════════════════════════════════════════════ */}
          {otpBoxVisible && !emailVerified && (
            <div style={{
              marginTop: 10,
              padding: "16px 16px 14px",
              borderRadius: 12,
              border: "1.5px solid #BFDBFE",
              background: "linear-gradient(135deg, #F8FBFF 0%, #EFF6FF 100%)",
              boxShadow: "0 2px 8px rgba(37,99,235,0.07)",
            }}>

              {/* Title row */}
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

              {/* OTP digit inputs */}
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

              {/* Error message */}
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

              {/* Verify button */}
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

              {/* Resend link */}
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

          <label className={styles.label} style={{ marginTop: 14 }}>DATE OF BIRTH <span className={styles.required}>*</span></label>
          <input type="date" value={dob}
            onChange={e => { setDob(e.target.value); setErrors(x => ({ ...x, dob: "" })); }}
            className={`${styles.input} ${errors.dob ? styles.inputError : ""}`} />
          {errors.dob && <div className={styles.errorMsg}>{errors.dob}</div>}

          <label className={styles.label}>IDENTIFIER (PAN OR AADHAR) <span className={styles.required}>*</span></label>
          <input value={identifier}
            onChange={e => { setIdentifier(e.target.value); setErrors(x => ({ ...x, identifier: "" })); }}
            placeholder="PAN (ABCDE1234F) or 12-digit Aadhar"
            className={`${styles.input} ${errors.identifier ? styles.inputError : ""}`} />
          {errors.identifier && <div className={styles.errorMsg}>{errors.identifier}</div>}

          <label className={styles.label}>LOCATION <span className={styles.optional}>(Optional)</span></label>
          <input value={location} onChange={e => setLocation(e.target.value)} placeholder="City, State" className={styles.input} />
        </div>

        {/* ── Income ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Income</div>
          {incomeItems.map((item, i) => (
            <div key={i} className={styles.itemRow}>
              <div className={styles.itemInfo}>
                <div className={styles.itemLabel}>{item.incomeType || "Income"}</div>
                <div className={styles.itemAmount}>₹{parseFloat(item.incomeAmount || "0").toLocaleString()}</div>
              </div>
              <div className={styles.itemActions}>
                <input value={item.incomeAmount} onChange={e => updateIncome(i, "incomeAmount", e.target.value)}
                  placeholder="0" type="number" className={styles.inlineAmountInput} />
                <button onClick={() => setIncomeItems(x => x.filter((_, idx) => idx !== i))} className={styles.removeBtn}>✕</button>
              </div>
            </div>
          ))}
          <div className={styles.summaryRow}>
            <div className={styles.summaryLeft}>
              <div className={styles.summaryMeta}>Total Income</div>
              <div className={styles.summaryValueGreen}>₹{totalIncome.toLocaleString()}</div>
            </div>
            <button onClick={openIncomePopup} className={styles.plusBtn}>+</button>
          </div>
        </div>

        {/* ── Expenses ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Expenses</div>
          {expenseItems.map((item, i) => (
            <div key={i} className={styles.itemRow}>
              <div className={styles.itemInfo}>
                <div className={styles.itemLabel}>{item.expenseType || "Expense"}</div>
                <div className={styles.itemAmount}>₹{parseFloat(item.expenseAmount || "0").toLocaleString()}</div>
              </div>
              <div className={styles.itemActions}>
                <input value={item.expenseAmount} onChange={e => updateExpense(i, "expenseAmount", e.target.value)}
                  placeholder="0" type="number" className={styles.inlineAmountInput} />
                <button onClick={() => setExpenseItems(x => x.filter((_, idx) => idx !== i))} className={styles.removeBtn}>✕</button>
              </div>
            </div>
          ))}
          <div className={styles.summaryRow}>
            <div className={styles.summaryLeft}>
              <div className={styles.summaryMeta}>Total Expenses</div>
              <div className={styles.summaryValueRed}>₹{totalExpenses.toLocaleString()}</div>
            </div>
            <button onClick={openExpensePopup} className={styles.plusBtn}>+</button>
          </div>
        </div>

        {/* ── Subscription Plans ── */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Choose Your Plan</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "#1E40AF", fontWeight: 600 }}>✅ Subscribed — full access to consultant bookings & features</div>
            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "#64748B", fontWeight: 600 }}>○ Free — basic access only</div>
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
                return (
                  <div key={plan.id}
                    onClick={() => { setSelectedPlan(plan); setErrors(x => ({ ...x, plan: "" })); }}
                    style={{ border: selected ? "2px solid #2563EB" : "1.5px solid #E2E8F0", borderRadius: 14, padding: "16px 18px", cursor: "pointer", background: selected ? "#EFF6FF" : "#fff", position: "relative", transition: "all 0.15s", boxShadow: selected ? "0 0 0 3px rgba(37,99,235,0.1)" : "0 1px 3px rgba(0,0,0,0.05)", marginBottom: 10 }}
                    className={styles.planCard}
                  >
                    {plan.tag && <span style={{ position: "absolute", top: -10, right: 14, background: "#2563EB", color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20, letterSpacing: "0.06em" }}>{plan.tag}</span>}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{plan.name}</span>
                          {!free && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "#DCFCE7", color: "#16A34A", border: "1px solid #86EFAC" }}>SUBSCRIBED</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748B", lineHeight: 1.5 }}>{plan.features}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
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
              {isFree(selectedPlan) ? "○ You're signing up with a Free account — basic features only." : `✅ You'll be subscribed to ${selectedPlan.name} (₹${selectedPlan.discountPrice}) — full access enabled.`}
            </div>
          )}
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
                : "Create Free Account"
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
    </div>
  );
}
