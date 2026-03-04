import { ChangeEvent, KeyboardEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, resetPassword, sendForgotPasswordOtp } from "../services/api";
import styles from "../styles/LoginPage.module.css";

type ForgotStep = "email" | "otp" | "newpass" | "done";

export default function LoginPage() {
  const navigate = useNavigate();

  // ── Login state ───────────────────────────────────────────────────────────
  const [cred,      setCred]      = useState("");
  const [pass,      setPass]      = useState("");
  const [loading,   setLoading]   = useState(false);
  const [apiError,  setApiError]  = useState("");
  const [errorType, setErrorType] = useState<"auth" | "server" | "network" | "registered" | "">("");

  // ── Forgot password modal ─────────────────────────────────────────────────
  const [showForgot,    setShowForgot]    = useState(false);
  const [forgotStep,    setForgotStep]    = useState<ForgotStep>("email");
  const [forgotEmail,   setForgotEmail]   = useState("");
  const [forgotOtp,     setForgotOtp]     = useState("");
  const [newPassword,   setNewPassword]   = useState("");
  const [confirmPass,   setConfirmPass]   = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError,   setForgotError]   = useState("");
  const [otpCountdown,  setOtpCountdown]  = useState(0);

  // ── Countdown helper ──────────────────────────────────────────────────────
  const startCountdown = () => {
    setOtpCountdown(60);
    const interval = setInterval(() => {
      setOtpCountdown(c => {
        if (c <= 1) { clearInterval(interval); return 0; }
        return c - 1;
      });
    }, 1000);
  };

  // ── Error classifier ──────────────────────────────────────────────────────
  const classifyError = (err: any): { msg: string; type: typeof errorType } => {
    const msg = (err?.message || "").toLowerCase();

    if (msg.includes("cannot connect") || msg.includes("failed to fetch"))
      return { msg: "Cannot reach the server. Please check your connection or try again later.", type: "network" };

    if (msg.includes("500") || msg.includes("internal server"))
      return { msg: "The server encountered an error. Please contact support or check the server logs.", type: "server" };

    // ✅ Shown when email exists in DB but user landed on login with wrong password
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

  // ── Login ─────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!cred.trim() || !pass.trim()) {
      setApiError("Please enter your email and password.");
      setErrorType("auth");
      return;
    }
    setLoading(true);
    setApiError("");
    setErrorType("");
    try {
      const data = await loginUser(cred.trim(), pass);
      const raw  = data?.role || data?.userRole || "";
      const role = raw.toString().toUpperCase().trim().replace(/^ROLE_/, "");

      if (role === "SUBSCRIBER" || role === "SUBSCRIBED") sessionStorage.removeItem("sub_popup_shown");

      if      (role === "USER" || role === "SUBSCRIBER" || role === "SUBSCRIBED") navigate("/user");
      else if (role === "ADMIN")                                                   navigate("/admin");
      else if (role === "CONSULTANT" || role === "ADVISOR")                        navigate("/consultant");
      else { setApiError(`Role not recognized: "${raw || "empty"}". Contact support.`); setErrorType("auth"); }
    } catch (err: any) {
      const { msg, type } = classifyError(err);
      setApiError(msg);
      setErrorType(type);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Enter") handleLogin(); };

  // ── Forgot — Step 1: send OTP ─────────────────────────────────────────────
  const handleForgotSendOtp = async () => {
    if (!forgotEmail.trim()) { setForgotError("Please enter your email address."); return; }
    setForgotLoading(true);
    setForgotError("");
    try {
      await sendForgotPasswordOtp(forgotEmail.trim().toLowerCase());
      setForgotStep("otp");
      startCountdown();
    } catch (err: any) {
      setForgotError(err?.message || "Failed to send OTP. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Forgot — Resend OTP ───────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (otpCountdown > 0) return;
    setForgotLoading(true);
    setForgotError("");
    try {
      await sendForgotPasswordOtp(forgotEmail.trim().toLowerCase());
      setForgotOtp("");
      startCountdown();
    } catch (err: any) {
      setForgotError(err?.message || "Failed to resend OTP.");
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Forgot — Step 2: validate OTP length, move to new pass ───────────────
  const handleOtpContinue = () => {
    if (!forgotOtp || forgotOtp.length !== 6) { setForgotError("Please enter the 6-digit OTP."); return; }
    setForgotError("");
    setForgotStep("newpass");
  };

  // ── Forgot — Step 3: reset password ──────────────────────────────────────
  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) { setForgotError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmPass)             { setForgotError("Passwords do not match."); return; }
    setForgotLoading(true);
    setForgotError("");
    try {
      await resetPassword(forgotEmail.trim().toLowerCase(), forgotOtp, newPassword);
      setForgotStep("done");
    } catch (err: any) {
      setForgotError(err?.message || "Failed to reset password. Please try again.");
    } finally {
      setForgotLoading(false);
    }
  };

  // ── Close modal ───────────────────────────────────────────────────────────
  const closeForgotModal = () => {
    setShowForgot(false);
    setForgotStep("email");
    setForgotEmail("");
    setForgotOtp("");
    setNewPassword("");
    setConfirmPass("");
    setForgotError("");
    setOtpCountdown(0);
  };

  // ── Shared input style for modal ──────────────────────────────────────────
  const modalInput: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1.5px solid #E2E8F0", fontSize: 14,
    marginTop: 6, marginBottom: 12, boxSizing: "border-box", outline: "none",
  };
  const modalLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "#64748B", letterSpacing: "0.08em",
    display: "block",
  };
  const primaryBtn = (active: boolean): React.CSSProperties => ({
    width: "100%", padding: "12px",
    background: active ? "#2563EB" : "#E2E8F0",
    color: active ? "#fff" : "#94A3B8",
    border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
    cursor: active ? "pointer" : "default", transition: "all 0.15s",
  });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.card}>

        <div className={styles.logoSection}>
          <h1 className={styles.logo}>FINADVISE</h1>
          <p className={styles.tagline}>THE FUTURE OF FINANCIAL GUIDANCE</p>
        </div>

        <label className={styles.label}>EMAIL OR MOBILE</label>
        <input
          value={cred}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setCred(e.target.value); setApiError(""); setErrorType(""); }}
          onKeyDown={handleKeyDown}
          placeholder="Enter your email or mobile"
          type="text"
          autoComplete="off"
          className={`${styles.input} ${apiError ? styles.inputError : ""}`}
        />

        <label className={styles.label}>PASSWORD</label>
        <input
          type="password"
          value={pass}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setPass(e.target.value); setApiError(""); setErrorType(""); }}
          onKeyDown={handleKeyDown}
          placeholder="••••••••"
          className={`${styles.input} ${apiError ? styles.inputError : ""}`}
        />

        {/* ── Forgot password link ── */}
        <div style={{ textAlign: "right", marginTop: -6, marginBottom: 14 }}>
          <span
            onClick={() => { setShowForgot(true); setForgotEmail(cred.includes("@") ? cred.trim() : ""); }}
            style={{ fontSize: 12, color: "#2563EB", fontWeight: 600, cursor: "pointer" }}
          >
            Forgot Password?
          </span>
        </div>

        {/* ── Error Banner ── */}
        {apiError && (
          errorType === "server" || errorType === "network" || errorType === "registered" ? (
            <div style={{
              background:
                errorType === "server"     ? "#FFF7ED" :
                errorType === "network"    ? "#F1F5F9" : "#EFF6FF",
              border:
                errorType === "server"     ? "1px solid #FED7AA" :
                errorType === "network"    ? "1px solid #CBD5E1" : "1px solid #BFDBFE",
              color:
                errorType === "server"     ? "#9A3412" :
                errorType === "network"    ? "#475569"  : "#1E40AF",
              borderRadius: 10, padding: "12px 14px",
              marginBottom: 16, fontSize: 13, lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {errorType === "server"     ? "🔧 Server Error"
                : errorType === "network"   ? "📡 Connection Error"
                : "ℹ️ Account Already Registered"}
              </div>
              <div>{apiError}</div>

              {/* ✅ Quick link to reset password when already-registered error shown */}
              {errorType === "registered" && (
                <div style={{ marginTop: 10 }}>
                  <span
                    onClick={() => { setShowForgot(true); setForgotEmail(cred.includes("@") ? cred.trim() : ""); }}
                    style={{ fontSize: 12, color: "#2563EB", fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}
                  >
                    Reset my password →
                  </span>
                </div>
              )}
              {errorType === "server" && (
                <div style={{ marginTop: 8, fontSize: 11, color: "#C2410C", fontWeight: 600 }}>
                  Tip: Check if Spring Boot is running and the database schema is up to date.
                </div>
              )}
            </div>
          ) : (
            <div className={styles.apiError}>⚠ {apiError}</div>
          )
        )}

        <button type="button" onClick={handleLogin} className={styles.loginSubmitBtn} disabled={loading}>
          {loading
            ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                Authenticating...
              </span>
            : "Login to Account"
          }
        </button>

        <p className={styles.registerText}>
          Don't have an account?{" "}
          <span className={styles.registerLink} onClick={() => navigate("/register")}>Create Account</span>
        </p>

        <p className={styles.terms}>
          By logging in, you agree to our <span className={styles.termsLink}>Terms of Service</span>
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          FORGOT PASSWORD MODAL
      ════════════════════════════════════════════════════════════════════ */}
      {showForgot && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) closeForgotModal(); }}
        >
          <div style={{ background: "#fff", borderRadius: 18, padding: "28px 24px", width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#0F172A" }}>
                  {forgotStep === "done" ? "✅ Password Reset!" : "Reset Password"}
                </div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>
                  {forgotStep === "email"   && "Enter your registered email address"}
                  {forgotStep === "otp"     && `OTP sent to ${forgotEmail}`}
                  {forgotStep === "newpass" && "Create your new password"}
                  {forgotStep === "done"    && "You can now log in with your new password"}
                </div>
              </div>
              <button onClick={closeForgotModal} style={{ background: "#F1F5F9", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 14, color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
            </div>

            {/* Step indicator dots */}
            {forgotStep !== "done" && (
              <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
                {(["email", "otp", "newpass"] as ForgotStep[]).map((s, i) => (
                  <div key={s} style={{
                    height: 4, flex: 1, borderRadius: 4,
                    background: ["email", "otp", "newpass"].indexOf(forgotStep) >= i ? "#2563EB" : "#E2E8F0",
                    transition: "background 0.3s",
                  }} />
                ))}
              </div>
            )}

            {/* ── Step 1: Email ── */}
            {forgotStep === "email" && (
              <>
                <label style={modalLabel}>EMAIL ADDRESS</label>
                <input
                  value={forgotEmail}
                  onChange={e => { setForgotEmail(e.target.value); setForgotError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleForgotSendOtp()}
                  placeholder="you@example.com"
                  type="email"
                  autoFocus
                  style={modalInput}
                />
                {forgotError && <div style={{ color: "#DC2626", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>⚠ {forgotError}</div>}
                <button onClick={handleForgotSendOtp} disabled={forgotLoading} style={primaryBtn(!forgotLoading && !!forgotEmail.trim())}>
                  {forgotLoading ? "Sending OTP…" : "Send Reset OTP"}
                </button>
              </>
            )}

            {/* ── Step 2: OTP ── */}
            {forgotStep === "otp" && (
              <>
                <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#1E40AF", fontWeight: 600, marginBottom: 14 }}>
                  📧 Check your inbox at <strong>{forgotEmail}</strong>
                </div>

                <label style={modalLabel}>6-DIGIT OTP</label>
                <input
                  value={forgotOtp}
                  onChange={e => { setForgotOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setForgotError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleOtpContinue()}
                  placeholder="000000"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  style={{ ...modalInput, fontSize: 22, letterSpacing: "0.4em", textAlign: "center" }}
                />

                <div style={{ textAlign: "right", marginTop: -8, marginBottom: 12 }}>
                  <button onClick={handleResendOtp} disabled={otpCountdown > 0 || forgotLoading}
                    style={{ background: "none", border: "none", padding: 0, color: otpCountdown > 0 ? "#94A3B8" : "#2563EB", fontSize: 12, fontWeight: 600, cursor: otpCountdown > 0 ? "default" : "pointer" }}>
                    {forgotLoading ? "Sending…" : otpCountdown > 0 ? `Resend in ${otpCountdown}s` : "Resend OTP"}
                  </button>
                </div>

                {forgotError && <div style={{ color: "#DC2626", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>⚠ {forgotError}</div>}
                <button onClick={handleOtpContinue} disabled={forgotOtp.length !== 6} style={primaryBtn(forgotOtp.length === 6)}>
                  Continue
                </button>
              </>
            )}

            {/* ── Step 3: New password ── */}
            {forgotStep === "newpass" && (
              <>
                <label style={modalLabel}>NEW PASSWORD</label>
                <input
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setForgotError(""); }}
                  placeholder="Min. 6 characters"
                  type="password"
                  autoFocus
                  style={modalInput}
                />

                <label style={modalLabel}>CONFIRM PASSWORD</label>
                <input
                  value={confirmPass}
                  onChange={e => { setConfirmPass(e.target.value); setForgotError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleResetPassword()}
                  placeholder="Re-enter password"
                  type="password"
                  style={{
                    ...modalInput,
                    border: `1.5px solid ${confirmPass && confirmPass !== newPassword ? "#FCA5A5" : "#E2E8F0"}`,
                  }}
                />
                {confirmPass && confirmPass !== newPassword && (
                  <div style={{ color: "#DC2626", fontSize: 12, fontWeight: 600, marginTop: -8, marginBottom: 10 }}>⚠ Passwords don't match</div>
                )}

                {forgotError && <div style={{ color: "#DC2626", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>⚠ {forgotError}</div>}
                <button
                  onClick={handleResetPassword}
                  disabled={forgotLoading || !newPassword || newPassword !== confirmPass}
                  style={primaryBtn(!forgotLoading && !!newPassword && newPassword === confirmPass)}
                >
                  {forgotLoading ? "Resetting…" : "Reset Password"}
                </button>
              </>
            )}

            {/* ── Step 4: Done ── */}
            {forgotStep === "done" && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 6 }}>
                  Password reset successfully!
                </div>
                <div style={{ fontSize: 13, color: "#64748B", marginBottom: 22 }}>
                  You can now log in with your new password.
                </div>
                <button onClick={closeForgotModal} style={primaryBtn(true)}>
                  Back to Login
                </button>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}