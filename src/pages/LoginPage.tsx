import { ChangeEvent, KeyboardEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, resetPassword, sendForgotPasswordOtp } from "../services/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
// "oauth_config" removed — OAuth integration removed as per requirements
type ForgotStep = "email" | "otp" | "newpass" | "done";
type ErrorType  = "auth" | "server" | "network" | "registered" | "";

// ─────────────────────────────────────────────────────────────────────────────
// Inline styles
// ─────────────────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#2563EB",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Segoe UI', Arial, sans-serif",
    padding: "20px",
    position: "relative" as const,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "44px 44px 32px",
    width: "100%",
    maxWidth: "460px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
    textAlign: "center" as const,
  },
  brand: {
    fontSize: "28px",
    fontWeight: 800,
    color: "#2563EB",
    letterSpacing: "3px",
    margin: "0 0 6px",
  },
  tagline: {
    fontSize: "10px",
    color: "#6B7280",
    letterSpacing: "3px",
    fontWeight: 600,
    marginBottom: "28px",
    textTransform: "uppercase" as const,
  },
  label: {
    display: "block",
    fontSize: "10px",
    fontWeight: 700,
    color: "#374151",
    letterSpacing: "1.2px",
    textAlign: "left" as const,
    marginBottom: "5px",
    textTransform: "uppercase" as const,
  },
  input: {
    width: "100%",
    padding: "11px 13px",
    border: "1.5px solid #D1D5DB",
    borderRadius: "8px",
    fontSize: "14px",
    color: "#111827",
    outline: "none",
    boxSizing: "border-box" as const,
    backgroundColor: "#fff",
    marginBottom: "14px",
  },
  inputError: {
    border: "1.5px solid #FCA5A5",
  },
  forgotRow: {
    textAlign: "right" as const,
    marginTop: "-8px",
    marginBottom: "16px",
  },
  forgotLink: {
    fontSize: "12px",
    color: "#2563EB",
    fontWeight: 600,
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
  },
  loginBtn: {
    width: "100%",
    padding: "13px",
    backgroundColor: "#111827",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer",
    marginBottom: "18px",
  },
  loginBtnDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },
  registerRow: {
    fontSize: "13px",
    color: "#6B7280",
    marginBottom: "8px",
  },
  registerLink: {
    color: "#2563EB",
    fontWeight: 600,
    cursor: "pointer",
  },
  apiError: {
    backgroundColor: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#DC2626",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "13px",
    fontWeight: 600,
    marginBottom: "14px",
    textAlign: "left" as const,
  },
  // Forgot / Reset password FULL PAGE styles
  resetPage: {
    minHeight: "100vh",
    backgroundColor: "#2563EB",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Segoe UI', Arial, sans-serif",
    padding: "20px",
  },
  resetCard: {
    backgroundColor: "#ffffff",
    borderRadius: "16px",
    padding: "40px 40px 32px",
    width: "100%",
    maxWidth: "440px",
    boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
  },
  modalInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1.5px solid #E2E8F0",
    fontSize: 14,
    marginTop: 6,
    marginBottom: 12,
    boxSizing: "border-box" as const,
    outline: "none",
    fontFamily: "inherit",
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748B",
    letterSpacing: "0.08em",
    display: "block",
    textTransform: "uppercase" as const,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Terms & Conditions Modal Component
// ─────────────────────────────────────────────────────────────────────────────
const TermsModal: React.FC<{ onClose: () => void; onAccept: () => void }> = ({ onClose, onAccept }) => (
  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, padding: 16 }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "82vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>Terms &amp; Conditions</div>
        <button onClick={onClose} style={{ background: "#F1F5F9", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16, color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
      {/* Content */}
      <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1, fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
        {[
          { title: "1. Acceptance of Terms", body: "By accessing and using Meet The Masters, you accept and agree to be bound by these Terms & Conditions. If you do not agree, please do not use our platform." },
          { title: "2. Use of Services", body: "Our platform provides access to certified financial consultants. You agree to use these services for lawful purposes only and not to misuse any information shared during consultations." },
          { title: "3. Confidentiality", body: "All consultation sessions and related information are strictly confidential. Neither party shall disclose confidential information to any third party without prior written consent." },
          { title: "4. Booking & Payments", body: "Bookings are confirmed upon successful payment. Cancellations must be made at least 24 hours prior to the scheduled session. Refunds are subject to our refund policy." },
          { title: "5. Disclaimer", body: "Financial advice provided through our platform is for informational purposes only. Meet The Masters does not guarantee specific financial outcomes. Always consult a qualified advisor before making major financial decisions." },
          { title: "6. Privacy Policy", body: "We collect and store your personal data securely in accordance with applicable data protection laws. Your data is never sold to third parties." },
          { title: "7. Governing Law", body: "These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana." },
        ].map((s, i) => (
          <div key={i} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 5 }}>{s.title}</div>
            <div>{s.body}</div>
          </div>
        ))}
      </div>
      {/* Footer */}
      <div style={{ padding: "16px 24px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 10, flexShrink: 0 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Close</button>
        <button
          onClick={() => { onAccept(); onClose(); }}
          style={{ flex: 2, padding: "11px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          ✅ I Agree &amp; Accept
        </button>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Reset Password Full-Page Component
// Shows after user clicks "Forgot Password" link
// Flow: Enter email → receive OTP → enter OTP → set new password → success → back to login
// ─────────────────────────────────────────────────────────────────────────────
const ResetPasswordPage: React.FC<{ initialEmail?: string; onBackToLogin: () => void }> = ({ initialEmail = "", onBackToLogin }) => {
  const [step, setStep] = useState<ForgotStep>("email");
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  const startCountdown = () => {
    setCountdown(60);
    const iv = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(iv); return 0; } return c - 1; });
    }, 1000);
  };

  const primaryBtn = (active: boolean): React.CSSProperties => ({
    width: "100%", padding: "12px", background: active ? "#2563EB" : "#E2E8F0",
    color: active ? "#fff" : "#94A3B8", border: "none", borderRadius: 10,
    fontWeight: 700, fontSize: 14, cursor: active ? "pointer" : "default",
    transition: "all 0.15s", fontFamily: "inherit",
  });

  const handleSendOtp = async () => {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      await sendForgotPasswordOtp(email.trim().toLowerCase());
      setStep("otp");
      startCountdown();
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP. Please try again.");
    } finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setLoading(true); setError("");
    try {
      await sendForgotPasswordOtp(email.trim().toLowerCase());
      setOtp("");
      startCountdown();
    } catch (e: any) {
      setError(e?.message || "Failed to resend OTP.");
    } finally { setLoading(false); }
  };

  const handleOtpContinue = () => {
    if (!otp || otp.length !== 6) { setError("Please enter the 6-digit OTP."); return; }
    setError(""); setStep("newpass");
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPass) { setError("Passwords do not match."); return; }
    setLoading(true); setError("");
    try {
      await resetPassword(email.trim().toLowerCase(), otp, newPassword);
      setStep("done");
    } catch (e: any) {
      setError(e?.message || "Failed to reset password. Please try again.");
    } finally { setLoading(false); }
  };

  const stepIndex = ["email", "otp", "newpass"].indexOf(step);

  return (
    <div style={S.resetPage}>
      {/* Back arrow */}
      <button
        onClick={onBackToLogin}
        style={{ position: "absolute", top: 24, left: 24, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 42, height: 42, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", backdropFilter: "blur(4px)" }}
        title="Back to Login"
      >
        <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
          <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div style={S.resetCard}>
        {/* Brand */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#2563EB", letterSpacing: "2px", marginBottom: 4 }}>MEET THE MASTERS</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
            {step === "done" ? "✅ Password Reset!" : "Reset Your Password"}
          </div>
          <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
            {step === "email" && "Enter your registered email address"}
            {step === "otp" && `OTP sent to ${email}`}
            {step === "newpass" && "Create your new password"}
            {step === "done" && "You can now log in with your new password"}
          </div>
        </div>

        {/* Step progress bar */}
        {step !== "done" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
            {["email", "otp", "newpass"].map((s, i) => (
              <div key={s} style={{ height: 4, flex: 1, borderRadius: 4, background: stepIndex >= i ? "#2563EB" : "#E2E8F0", transition: "background 0.3s" }} />
            ))}
          </div>
        )}

        {/* Step 1: Email */}
        {step === "email" && (
          <>
            <label style={S.modalLabel}>EMAIL ADDRESS</label>
            <input
              value={email}
              onChange={e => { setEmail(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSendOtp()}
              placeholder="you@example.com"
              type="email"
              autoFocus
              style={S.modalInput}
            />
            {error && <div style={{ color: "#DC2626", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>⚠ {error}</div>}
            <button onClick={handleSendOtp} disabled={loading} style={primaryBtn(!loading && !!email.trim())}>
              {loading ? "Sending OTP…" : "Send Reset OTP"}
            </button>
          </>
        )}

        {/* Step 2: OTP */}
        {step === "otp" && (
          <>
            <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#1E40AF", fontWeight: 600, marginBottom: 16 }}>
              📧 Check your inbox at <strong>{email}</strong>
            </div>
            <label style={S.modalLabel}>6-DIGIT OTP</label>
            <input
              value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleOtpContinue()}
              placeholder="000000"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              style={{ ...S.modalInput, fontSize: 24, letterSpacing: "0.5em", textAlign: "center" }}
            />
            <div style={{ textAlign: "right", marginTop: -8, marginBottom: 12 }}>
              <button
                onClick={handleResendOtp}
                disabled={countdown > 0 || loading}
                style={{ background: "none", border: "none", padding: 0, color: countdown > 0 ? "#94A3B8" : "#2563EB", fontSize: 12, fontWeight: 600, cursor: countdown > 0 ? "default" : "pointer" }}
              >
                {loading ? "Sending…" : countdown > 0 ? `Resend in ${countdown}s` : "Resend OTP"}
              </button>
            </div>
            {error && <div style={{ color: "#DC2626", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>⚠ {error}</div>}
            <button onClick={handleOtpContinue} disabled={otp.length !== 6} style={primaryBtn(otp.length === 6)}>
              Continue
            </button>
          </>
        )}

        {/* Step 3: New Password */}
        {step === "newpass" && (
          <>
            <label style={S.modalLabel}>NEW PASSWORD</label>
            <input
              value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setError(""); }}
              placeholder="Min. 6 characters"
              type="password"
              autoFocus
              style={S.modalInput}
            />
            <label style={S.modalLabel}>CONFIRM PASSWORD</label>
            <input
              value={confirmPass}
              onChange={e => { setConfirmPass(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleResetPassword()}
              placeholder="Re-enter password"
              type="password"
              style={{
                ...S.modalInput,
                border: `1.5px solid ${confirmPass && confirmPass !== newPassword ? "#FCA5A5" : "#E2E8F0"}`,
              }}
            />
            {confirmPass && confirmPass !== newPassword && (
              <div style={{ color: "#DC2626", fontSize: 12, fontWeight: 600, marginTop: -8, marginBottom: 10 }}>⚠ Passwords don't match</div>
            )}
            {error && <div style={{ color: "#DC2626", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>⚠ {error}</div>}
            <button
              onClick={handleResetPassword}
              disabled={loading || !newPassword || newPassword !== confirmPass}
              style={primaryBtn(!loading && !!newPassword && newPassword === confirmPass)}
            >
              {loading ? "Resetting…" : "Reset Password"}
            </button>
          </>
        )}

        {/* Step 4: Done → auto-redirect to login */}
        {step === "done" && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#166534", marginBottom: 8 }}>Password Reset Successfully!</div>
            <div style={{ fontSize: 13, color: "#64748B", marginBottom: 28, lineHeight: 1.6 }}>
              Your password has been updated. You can now log in with your new password.
            </div>
            <button
              onClick={onBackToLogin}
              style={{ width: "100%", padding: "13px", background: "linear-gradient(135deg, #2563EB, #1D4ED8)", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
            >
              Go to Login →
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main LoginPage Component
// ─────────────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate = useNavigate();

  // ── Login state ───────────────────────────────────────────────────────────
  const [cred, setCred]           = useState("");
  const [pass, setPass]           = useState("");
  const [loading, setLoading]     = useState(false);
  const [apiError, setApiError]   = useState("");
  const [errorType, setErrorType] = useState<ErrorType>("");

  // ── Terms & Conditions ────────────────────────────────────────────────────
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // ── Reset Password — full page mode ──────────────────────────────────────
  // When showResetPage is true, the entire page switches to the reset flow
  const [showResetPage, setShowResetPage] = useState(false);
  const [resetInitialEmail, setResetInitialEmail] = useState("");

  // ── Error classifier ──────────────────────────────────────────────────────
  const classifyError = (err: any): { msg: string; type: ErrorType } => {
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("cannot connect") || msg.includes("failed to fetch"))
      return { msg: "Cannot reach the server. Please check your connection or try again later.", type: "network" };
    if (msg.includes("500") || msg.includes("internal server"))
      return { msg: "The server encountered an error. Please contact support or check the server logs.", type: "server" };
    if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("conflict"))
      return {
        msg: "This email is already registered. Please log in, or use 'Forgot Password' if you can't remember your password.",
        type: "registered",
      };
    if (
      msg.includes("401") || msg.includes("403") ||
      msg.includes("unauthorized") || msg.includes("invalid") ||
      msg.includes("bad credentials") || msg.includes("incorrect")
    )
      return { msg: "Incorrect email or password. Please double-check and try again.", type: "auth" };
    return { msg: err?.message || "Login failed. Please check your credentials.", type: "auth" };
  };

  // ── Role → route helper ───────────────────────────────────────────────────
  const redirectByRole = (rawRole: string) => {
    const role = rawRole.toString().toUpperCase().trim().replace(/^ROLE_/, "");
    if (role) localStorage.setItem("fin_role", role);
    if (role === "SUBSCRIBER" || role === "SUBSCRIBED") sessionStorage.removeItem("sub_popup_shown");

    if (role === "USER" || role === "SUBSCRIBER" || role === "SUBSCRIBED") navigate("/user");
    else if (role === "ADMIN")                                              navigate("/admin");
    else if (role === "CONSULTANT" || role === "ADVISOR")                  navigate("/consultant");
    else if (role === "AGENT")                                              navigate("/consultant");
    else {
      setApiError(`Role not recognized: "${rawRole || "empty"}". Contact support.`);
      setErrorType("auth");
    }
  };

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!cred.trim() || !pass.trim()) {
      setApiError("Please enter your email and password.");
      setErrorType("auth");
      return;
    }
    if (!termsAccepted) {
      setApiError("Please accept the Terms & Conditions to continue.");
      setErrorType("auth");
      return;
    }
    setLoading(true);
    setApiError("");
    setErrorType("");
    try {
      const data = await loginUser(cred.trim(), pass);
      const raw  = data?.role || data?.userRole || "";
      redirectByRole(raw);
    } catch (err: any) {
      const { msg, type } = classifyError(err);
      setApiError(msg);
      setErrorType(type);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Enter") handleLogin(); };

  // ── Show Reset Password full page ─────────────────────────────────────────
  const openResetPage = () => {
    setResetInitialEmail(cred.includes("@") ? cred.trim() : "");
    setShowResetPage(true);
  };

  // ── If showing reset page, render it full-screen ──────────────────────────
  if (showResetPage) {
    return (
      <ResetPasswordPage
        initialEmail={resetInitialEmail}
        onBackToLogin={() => setShowResetPage(false)}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN LOGIN RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Terms Modal */}
      {showTermsModal && (
        <TermsModal
          onClose={() => setShowTermsModal(false)}
          onAccept={() => {
            setTermsAccepted(true);
            if (apiError === "Please accept the Terms & Conditions to continue.") {
              setApiError(""); setErrorType("");
            }
          }}
        />
      )}

      {/* Back Arrow */}
      <button
        onClick={() => navigate("/")}
        style={{ position: "absolute", top: 24, left: 24, background: "rgba(255,255,255,0.2)", border: "none", borderRadius: "50%", width: 40, height: 40, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, backdropFilter: "blur(4px)" }}
        title="Back to Home"
      >
        ←
      </button>

      <div style={S.card}>

        {/* Brand */}
        <h1 style={{ ...S.brand, cursor: "pointer", fontSize: "22px", letterSpacing: "2px" }} onClick={() => navigate("/")}>
          MEET THE MASTERS
        </h1>
        <p style={S.tagline}>YOUR FINANCIAL ADVISORY PLATFORM</p>

        {/* Email / Mobile */}
        <label style={S.label}>EMAIL OR MOBILE</label>
        <input
          value={cred}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setCred(e.target.value); setApiError(""); setErrorType(""); }}
          onKeyDown={handleKeyDown}
          placeholder="Enter your email or mobile"
          type="text"
          autoComplete="off"
          style={{ ...S.input, ...(apiError && errorType === "auth" ? S.inputError : {}) }}
        />

        {/* Password */}
        <label style={S.label}>PASSWORD</label>
        <input
          type="password"
          value={pass}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setPass(e.target.value); setApiError(""); setErrorType(""); }}
          onKeyDown={handleKeyDown}
          placeholder="••••••••"
          style={{ ...S.input, ...(apiError && errorType === "auth" ? S.inputError : {}) }}
        />

        {/* Forgot Password — now opens full-page reset flow */}
        <div style={S.forgotRow}>
          <button style={S.forgotLink} onClick={openResetPage}>
            Forgot Password?
          </button>
        </div>

        {/* Error Banner */}
        {apiError && (
          errorType === "server" || errorType === "network" || errorType === "registered" ? (
            <div style={{
              background: errorType === "server" ? "#FFF7ED" : errorType === "network" ? "#F1F5F9" : "#EFF6FF",
              border: errorType === "server" ? "1px solid #FED7AA" : errorType === "network" ? "1px solid #CBD5E1" : "1px solid #BFDBFE",
              color: errorType === "server" ? "#9A3412" : errorType === "network" ? "#475569" : "#1E40AF",
              borderRadius: 10, padding: "12px 14px", marginBottom: 16, fontSize: 13, lineHeight: 1.6, textAlign: "left",
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {errorType === "server" ? "🔧 Server Error" : errorType === "network" ? "📡 Connection Error" : "ℹ️ Account Already Registered"}
              </div>
              <div>{apiError}</div>
              {errorType === "registered" && (
                <div style={{ marginTop: 10 }}>
                  <button onClick={openResetPage} style={{ fontSize: 12, color: "#2563EB", fontWeight: 700, cursor: "pointer", background: "none", border: "none", padding: 0, textDecoration: "underline" }}>
                    Reset my password →
                  </button>
                </div>
              )}
              {errorType === "server" && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#C2410C", fontWeight: 600 }}>
                  Tip: Check if Spring Boot is running and the database schema is up to date.
                </div>
              )}
            </div>
          ) : (
            <div style={S.apiError}>⚠ {apiError}</div>
          )
        )}

        {/* Login Button */}
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          style={{ ...S.loginBtn, ...(loading ? S.loginBtnDisabled : {}) }}
        >
          {loading
            ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                Authenticating...
              </span>
            : "Login to Account"
          }
        </button>

        {/* REMOVED: Google OAuth / "Continue with Google" button (removed as per requirements) */}

        {/* Terms & Conditions Checkbox — MANDATORY before login */}
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          marginBottom: 16, padding: "12px 14px",
          background: termsAccepted ? "#F0FDF4" : "#F8FAFC",
          border: `1.5px solid ${termsAccepted ? "#86EFAC" : "#E2E8F0"}`,
          borderRadius: 10, transition: "all 0.2s",
        }}>
          <input
            type="checkbox"
            id="terms-checkbox"
            checked={termsAccepted}
            onChange={e => {
              setTermsAccepted(e.target.checked);
              if (apiError === "Please accept the Terms & Conditions to continue.") {
                setApiError(""); setErrorType("");
              }
            }}
            style={{ marginTop: 2, width: 16, height: 16, cursor: "pointer", accentColor: "#2563EB", flexShrink: 0 }}
          />
          <label htmlFor="terms-checkbox" style={{ fontSize: 12, color: "#374151", lineHeight: 1.5, cursor: "pointer" }}>
            I have read and agree to the{" "}
            <span
              onClick={e => { e.preventDefault(); setShowTermsModal(true); }}
              style={{ color: "#2563EB", fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}
            >
              Terms &amp; Conditions
            </span>
            {" "}and{" "}
            <span
              onClick={e => { e.preventDefault(); setShowTermsModal(true); }}
              style={{ color: "#2563EB", fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}
            >
              Privacy Policy
            </span>
          </label>
        </div>

        {/* Create Account */}
        <p style={S.registerRow}>
          Don't have an account?{" "}
          <span style={S.registerLink} onClick={() => navigate("/register")}>
            Create Account
          </span>
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}