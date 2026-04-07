import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle, Eye, EyeOff, Lock, Mail, Settings, WifiOff, X } from "lucide-react";
import { ChangeEvent, KeyboardEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, resetPassword, sendForgotPasswordOtp } from "../services/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ForgotStep = "email" | "otp" | "newpass" | "done";
type ErrorType = "auth" | "server" | "network" | "registered" | "";

// ─────────────────────────────────────────────────────────────────────────────
// PasswordInput
// ─────────────────────────────────────────────────────────────────────────────
interface PasswordInputProps {
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  hasError?: boolean;
  autoFocus?: boolean;
  style?: React.CSSProperties;
}

const PasswordInput: React.FC<PasswordInputProps> = ({
  value, onChange, onKeyDown, placeholder = "••••••••",
  hasError = false, autoFocus = false, style,
}) => {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <input
        type={visible ? "text" : "password"}
        value={value} onChange={onChange} onKeyDown={onKeyDown}
        placeholder={placeholder} autoFocus={autoFocus}
        className={`input-base ${hasError ? "input-error" : ""}`}
        style={{ paddingRight: 44, width: "100%", ...style }}
      />
      <button type="button" onClick={() => setVisible(v => !v)}
        title={visible ? "Hide password" : "Show password"} tabIndex={-1}
        style={{ position: "absolute", right: 12, background: "none", border: "none", cursor: "pointer",
          padding: 4, display: "flex", alignItems: "center", justifyContent: "center",
          color: visible ? "var(--color-primary)" : "var(--text-muted)",
          transition: "color 0.2s", borderRadius: "var(--radius-sm)" }}>
        {visible ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
      </button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Terms Modal
// ─────────────────────────────────────────────────────────────────────────────
const TermsModal: React.FC<{ onClose: () => void; onAccept: () => void }> = ({ onClose, onAccept }) => (
  <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal-content animate-fade-up">
      <div className="modal-header">
        <div className="modal-title">Terms & Conditions</div>
        <button onClick={onClose} className="icon-button-circle"><X size={20} /></button>
      </div>
      <div className="modal-body">
        {[
          { title: "1. Acceptance of Terms", body: "By accessing and using Meet The Masters, you accept and agree to be bound by these Terms & Conditions. If you do not agree, please do not use our platform." },
          { title: "2. Use of Services", body: "Our platform provides access to certified financial consultants. You agree to use these services for lawful purposes only and not to misuse any information shared during consultations." },
          { title: "3. Confidentiality", body: "All consultation sessions and related information are strictly confidential. Neither party shall disclose confidential information to any third party without prior written consent." },
          { title: "4. Booking & Payments", body: "Bookings are confirmed upon successful payment. Cancellations must be made at least 24 hours prior to the scheduled session. Refunds are subject to our refund policy." },
          { title: "5. Disclaimer", body: "Financial advice provided through our platform is for informational purposes only. Meet The Masters does not guarantee specific financial outcomes. Always consult a qualified advisor before making major financial decisions." },
          { title: "6. Privacy Policy", body: "We collect and store your personal data securely in accordance with applicable data protection laws. Your data is never sold to third parties." },
          { title: "7. Governing Law", body: "These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana." },
        ].map((s, i) => (
          <div key={i} className="mb-4">
            <div className="label-base" style={{ fontSize: '13px', color: 'var(--text-main)', marginBottom: '4px' }}>{s.title}</div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6' }}>{s.body}</div>
          </div>
        ))}
      </div>
      <div className="modal-footer">
        <button onClick={onClose} className="btn-secondary" style={{ flex: 1 }}>Close</button>
        <button onClick={() => { onAccept(); onClose(); }} className="btn-primary" style={{ flex: 2 }}>
          <CheckCircle size={18} /> I Agree & Accept
        </button>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Reset Password Page
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

  const handleSendOtp = async () => {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true); setError("");
    try {
      await sendForgotPasswordOtp(email.trim().toLowerCase());
      setStep("otp"); startCountdown();
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP. Please try again.");
    } finally { setLoading(false); }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setLoading(true); setError("");
    try {
      await sendForgotPasswordOtp(email.trim().toLowerCase());
      setOtp(""); startCountdown();
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
    <div className="auth-page">
      <button onClick={onBackToLogin} className="glass-btn"
        style={{ position: "absolute", top: 24, left: 24, width: 42, height: 42 }} title="Back to Login">
        <ArrowLeft size={20} />
      </button>
      <div className="auth-card animate-fade-up">
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="auth-brand">MEET THE MASTERS</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {step === "done"
              ? <><CheckCircle className="icon-sm" style={{ color: "var(--color-success)" }} /> Password Reset!</>
              : "Reset Your Password"}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>
            {step === "email" && "Enter your registered email address"}
            {step === "otp" && `OTP sent to ${email}`}
            {step === "newpass" && "Create your new password"}
            {step === "done" && "You can now log in with your new password"}
          </div>
        </div>

        {step !== "done" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
            {["email", "otp", "newpass"].map((s, i) => (
              <div key={s} style={{ height: 4, flex: 1, borderRadius: 4,
                background: stepIndex >= i ? "var(--color-primary)" : "var(--border-color)",
                transition: "background 0.3s" }} />
            ))}
          </div>
        )}

        {step === "email" && (
          <div className="auth-input-group">
            <label className="label-base">EMAIL ADDRESS</label>
            <input value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleSendOtp()}
              placeholder="you@example.com" type="email" autoFocus className="input-base" />
            {error && <div className="error-banner" style={{ marginTop: 12 }}><AlertTriangle size={16} /> {error}</div>}
            <button onClick={handleSendOtp} disabled={loading || !email.trim()}
              className="btn-primary" style={{ width: "100%", marginTop: 12 }}>
              {loading ? "Sending OTP…" : "Send Reset OTP"}
            </button>
          </div>
        )}

        {step === "otp" && (
          <div className="auth-input-group">
            <div className="badge badge-info" style={{ marginBottom: 16, width: '100%', justifyContent: 'flex-start', padding: '10px 14px' }}>
              <Mail size={16} /> Check your inbox at {email}
            </div>
            <label className="label-base" style={{ textAlign: 'center' }}>6-DIGIT OTP</label>
            <input value={otp}
              onChange={e => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
              onKeyDown={e => e.key === "Enter" && handleOtpContinue()}
              placeholder="000000" type="text" inputMode="numeric" maxLength={6} autoFocus
              className="input-base" style={{ fontSize: 24, letterSpacing: "0.5em", textAlign: "center" }} />
            <div style={{ textAlign: "right", marginTop: 8, marginBottom: 12 }}>
              <button onClick={handleResendOtp} disabled={countdown > 0 || loading}
                className="auth-link" style={{ fontSize: 12, background: 'none' }}>
                {loading ? "Sending…" : countdown > 0 ? `Resend in ${countdown}s` : "Resend OTP"}
              </button>
            </div>
            {error && <div className="error-banner" style={{ marginTop: 12 }}><AlertTriangle size={16} /> {error}</div>}
            <button onClick={handleOtpContinue} disabled={otp.length !== 6}
              className="btn-primary" style={{ width: "100%" }}>Continue</button>
          </div>
        )}

        {step === "newpass" && (
          <div className="auth-input-group">
            <div className="badge badge-warning" style={{ marginBottom: 16, width: '100%', justifyContent: 'flex-start', padding: '10px 14px' }}>
              <Lock size={16} /> New password must be different
            </div>
            <label className="label-base">NEW PASSWORD</label>
            <PasswordInput value={newPassword} onChange={e => { setNewPassword(e.target.value); setError(""); }}
              placeholder="Min. 6 characters" autoFocus style={{ marginBottom: 16 }} />
            <label className="label-base">CONFIRM PASSWORD</label>
            <PasswordInput value={confirmPass} onChange={e => { setConfirmPass(e.target.value); setError(""); }}
              onKeyDown={e => { if (e.key === "Enter") handleResetPassword(); }}
              placeholder="Re-enter password" hasError={!!(confirmPass && confirmPass !== newPassword)} />
            {confirmPass && confirmPass !== newPassword && (
              <div className="error-banner" style={{ marginTop: 12, border: 'none', background: 'none', color: 'var(--color-danger)', fontSize: 12, padding: 0 }}>
                <AlertTriangle size={14} /> Passwords don't match
              </div>
            )}
            {error && <div className="error-banner" style={{ marginTop: 12 }}><AlertTriangle size={16} /> {error}</div>}
            <button onClick={handleResetPassword}
              disabled={loading || !newPassword || newPassword !== confirmPass}
              className="btn-primary" style={{ width: "100%", marginTop: 24 }}>
              {loading ? "Resetting…" : "Reset Password"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="success-overlay-static" style={{ textAlign: "center" }}>
            <div className="success-icon-circle" style={{ width: 64, height: 64 }}><CheckCircle size={40} /></div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--color-success)", marginBottom: 8 }}>Password Reset!</div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 28, lineHeight: 1.6 }}>
              Your password has been updated successfully.
            </div>
            <button onClick={onBackToLogin} className="btn-primary" style={{ width: "100%" }}>
              Go to Login <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure helper: role string → route path (no side effects)
// ─────────────────────────────────────────────────────────────────────────────
const getDestinationForRole = (rawRole: string): string => {
  const role = rawRole.toString().toUpperCase().trim().replace(/^ROLE_/, "");
  if (role === "ADMIN") return "/admin";
  if (role === "CONSULTANT" || role === "ADVISOR" || role === "AGENT") return "/consultant";
  return "/user"; // USER | SUBSCRIBER | SUBSCRIBED | GUEST | "" → /user
};

// ─────────────────────────────────────────────────────────────────────────────
// Main LoginPage
// ─────────────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate = useNavigate();

  const [cred, setCred] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [errorType, setErrorType] = useState<ErrorType>("");

  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsShake, setTermsShake] = useState(false);

  const [showResetPage, setShowResetPage] = useState(false);
  const [resetInitialEmail, setResetInitialEmail] = useState("");

  const shakeTerms = () => {
    setTermsShake(true);
    setTimeout(() => setTermsShake(false), 600);
  };

  const classifyError = (err: any): { msg: string; type: ErrorType } => {
    const msg = (err?.message || "").toLowerCase();
    if (msg.includes("cannot connect") || msg.includes("failed to fetch") ||
        msg.includes("networkerror") || msg.includes("load failed"))
      return { msg: "Cannot reach the server. Please check your connection.", type: "network" };
    if (msg.includes("500") || msg.includes("internal server"))
      return { msg: "Server error occurred. Please try again later.", type: "server" };
    if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("conflict"))
      return { msg: "Email already registered. Please log in or reset password.", type: "registered" };
    if (msg.includes("401") || msg.includes("403") || msg.includes("unauthorized") ||
        msg.includes("invalid") || msg.includes("bad credentials") || msg.includes("incorrect"))
      return { msg: "Incorrect email or password. If you recently changed your password, please use Forgot Password to reset it.", type: "auth" };
    return { msg: err?.message || "Login failed. Please try Forgot Password if you recently changed your password.", type: "auth" };
  };

  const handleLogin = async () => {
    if (!cred.trim() || !pass.trim()) {
      setApiError("Please enter your email and password.");
      setErrorType("auth");
      return;
    }
    if (!termsAccepted) { shakeTerms(); return; }

    setLoading(true);
    setApiError("");
    setErrorType("");

    try {
      // ── api.ts loginUser already:
      //    1. clearToken()
      //    2. POSTs to /users/authenticate
      //    3. setToken / setRole / setUserId / setConsultantId
      //    4. calls debugToken()
      // We call it and also re-persist everything ourselves as a safety net.
      const data = await loginUser(cred.trim(), pass);

      console.log("✅ Login response:", data);

      // ── Robustly extract role from any response shape ───────────────────
      let rawRole = "";
      if (typeof data?.role === "string" && data.role.trim()) {
        rawRole = data.role.trim();
      } else if (typeof data?.userRole === "string" && data.userRole.trim()) {
        rawRole = data.userRole.trim();
      } else if (Array.isArray(data?.roles) && data.roles.length > 0) {
        const r = data.roles[0];
        rawRole = typeof r === "string" ? r : (r?.authority || r?.name || "");
      } else if (Array.isArray(data?.authorities) && data.authorities.length > 0) {
        const a = data.authorities[0];
        rawRole = typeof a === "string" ? a : (a?.authority || a?.name || "");
      }

      const finalRole = rawRole
        ? rawRole.toString().toUpperCase().trim().replace(/^ROLE_/, "")
        : "GUEST";

      console.log(`✅ Final role: "${finalRole}"`);

      // ── Re-persist to localStorage (belt-and-suspenders) ───────────────
      const token = data?.token || data?.accessToken || data?.access_token || data?.jwt || "";
      if (token) localStorage.setItem("fin_token", token);
      localStorage.setItem("fin_role", finalRole);
      const uid = data?.id || data?.userId || data?.user_id || "";
      if (uid) localStorage.setItem("fin_user_id", String(uid));
      const cid = data?.consultantId || "";
      if (cid) localStorage.setItem("fin_consultant_id", String(cid));
      if (data?.requiresPasswordChange === true) localStorage.setItem("fin_first_login", "true");
      if (finalRole === "SUBSCRIBER" || finalRole === "SUBSCRIBED") sessionStorage.removeItem("sub_popup_shown");

      // ── Navigate ────────────────────────────────────────────────────────
      // window.location.href is used instead of navigate() because:
      // - It guarantees a full page load so the router re-reads localStorage
      // - It bypasses any React Router guard / route-level auth check that
      //   might block navigate() if it runs before the router context updates
      const destination = getDestinationForRole(finalRole);
      console.log(`✅ Redirecting → ${destination}`);
      window.location.href = destination;

    } catch (err: any) {
      const { msg, type } = classifyError(err);
      setApiError(msg);
      setErrorType(type);
      setLoading(false);
    }
    // Note: we do NOT call setLoading(false) on success because
    // window.location.href causes a full navigation — the component unmounts.
  };

  const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Enter") handleLogin(); };

  const openResetPage = () => {
    setResetInitialEmail(cred.includes("@") ? cred.trim() : "");
    setShowResetPage(true);
  };

  if (showResetPage) {
    return (
      <ResetPasswordPage
        initialEmail={resetInitialEmail}
        onBackToLogin={() => setShowResetPage(false)}
      />
    );
  }

  return (
    <div className="auth-page">
      {showTermsModal && (
        <TermsModal
          onClose={() => setShowTermsModal(false)}
          onAccept={() => { setTermsAccepted(true); setApiError(""); setErrorType(""); }}
        />
      )}

      <button onClick={() => navigate("/")} className="glass-btn"
        style={{ position: "absolute", top: 24, left: 24, width: 40, height: 40 }} title="Back to Home">
        <ArrowLeft size={20} />
      </button>

      <div className="auth-card animate-fade-up">
        <h1 className="auth-brand" onClick={() => navigate("/")}>MEET THE MASTERS</h1>
        <p className="auth-tagline">Experience the Experience</p>

        <div className="auth-input-group">
          <label className="label-base">EMAIL OR MOBILE</label>
          <input
            value={cred}
            onChange={(e: ChangeEvent<HTMLInputElement>) => { setCred(e.target.value); setApiError(""); setErrorType(""); }}
            onKeyDown={handleKeyDown}
            placeholder="Enter your email or mobile"
            type="text"
            className={`input-base ${apiError && errorType === "auth" ? "input-error" : ""}`}
            autoComplete="off"
          />
        </div>

        <div className="auth-input-group">
          <label className="label-base">PASSWORD</label>
          <PasswordInput
            value={pass}
            onChange={(e: ChangeEvent<HTMLInputElement>) => { setPass(e.target.value); setApiError(""); setErrorType(""); }}
            onKeyDown={handleKeyDown}
            placeholder="••••••••"
            hasError={!!(apiError && errorType === "auth")}
          />
        </div>

        <div className="auth-form-row">
          <div />
          <button className="auth-link" style={{ fontSize: '13px', background: 'none' }} onClick={openResetPage}>
            Forgot Password?
          </button>
        </div>

        <div
          className={`section-modern ${termsShake ? "animate-shake" : ""}`}
          style={{
            padding: "12px 14px", marginBottom: 16,
            background: termsAccepted ? "var(--color-success-bg)" : termsShake ? "var(--color-danger-bg)" : "var(--bg-body)",
            border: `1.5px solid ${termsAccepted
              ? "var(--color-success-border)"
              : termsShake ? "var(--color-danger-border)" : "var(--border-color)"}`,
            borderRadius: "var(--radius-md)", textAlign: "left", display: "flex", gap: 12,
          }}
        >
          <input
            type="checkbox" id="terms-checkbox" checked={termsAccepted}
            onChange={e => { setTermsAccepted(e.target.checked); setApiError(""); setErrorType(""); }}
            style={{ marginTop: 2, width: 16, height: 16, cursor: "pointer", accentColor: "var(--color-primary)" }}
          />
          <label htmlFor="terms-checkbox" style={{ fontSize: 13, color: "var(--text-main)", lineHeight: 1.5, cursor: "pointer" }}>
            {termsShake && !termsAccepted && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "var(--color-danger)", marginBottom: 4 }}>
                <AlertTriangle size={14} /> Please accept the Terms & Conditions to continue
              </span>
            )}
            I agree to the{" "}
            <span onClick={e => { e.preventDefault(); setShowTermsModal(true); }} className="auth-link">Terms & Conditions</span>
            {" "}and{" "}
            <span onClick={e => { e.preventDefault(); setShowTermsModal(true); }} className="auth-link">Privacy Policy</span>
          </label>
        </div>

        {apiError && (
          <div className="error-banner">
            {errorType === "server" ? <Settings size={18} />
              : errorType === "network" ? <WifiOff size={18} />
              : <AlertTriangle size={18} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>
                {errorType === "server" ? "Server Error"
                  : errorType === "network" ? "Connection Error"
                  : "Login Failed"}
              </div>
              <div style={{ fontSize: '12px', fontWeight: 500 }}>{apiError}</div>
              {errorType === "auth" && (
                <button
                  onClick={openResetPage}
                  style={{
                    marginTop: 8, background: "none", border: "none", padding: 0,
                    fontSize: 12, fontWeight: 700, color: "var(--color-primary)",
                    cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2,
                  }}>
                  → Reset your password now
                </button>
              )}
            </div>
          </div>
        )}

        <button type="button" onClick={handleLogin} disabled={loading}
          className="btn-primary" style={{ width: "100%", padding: '14px', fontSize: '16px' }}>
          {loading
            ? <><span className="animate-spin" style={{ width: 16, height: 16,
                border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff",
                borderRadius: "50%", display: "inline-block" }} /> Authenticating...</>
            : "Login to Account"}
        </button>

        <p className="auth-footer-text">
          Don't have an account?{" "}
          <span className="auth-link" onClick={() => navigate("/register")}>Create Account</span>
        </p>
      </div>
    </div>
  );
}