import { ChangeEvent, KeyboardEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, resetPassword, sendForgotPasswordOtp } from "../services/api";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type ForgotStep = "email" | "otp" | "newpass" | "done";
type ErrorType  = "auth" | "server" | "network" | "registered" | "oauth_config" | "";

// ─────────────────────────────────────────────────────────────────────────────
// Google Client ID
// Priority: .env VITE_GOOGLE_CLIENT_ID → hardcoded project default
// ─────────────────────────────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID: string =
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
  (import.meta as any).env?.REACT_APP_GOOGLE_CLIENT_ID ||
  "829456432660-nd73l8ce5d7oc9bu27ik43b185jkp6pj.apps.googleusercontent.com";

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
    fontSize: "34px",
    fontWeight: 800,
    color: "#2563EB",
    letterSpacing: "5px",
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
  divider: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "14px",
    color: "#9CA3AF",
    fontSize: "12px",
  },
  dividerLine: {
    flex: 1,
    height: "1px",
    backgroundColor: "#E5E7EB",
  },
  googleBtn: {
    width: "100%",
    padding: "11px",
    backgroundColor: "#fff",
    color: "#374151",
    border: "1.5px solid #D1D5DB",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "20px",
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
  terms: {
    fontSize: "11px",
    color: "#9CA3AF",
  },
  termsLink: {
    color: "#374151",
    fontWeight: 600,
    textDecoration: "underline",
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
  // Modal
  modalOverlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 16,
  },
  modalBox: {
    background: "#fff",
    borderRadius: 18,
    padding: "28px 24px",
    width: "100%",
    maxWidth: 400,
    boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
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
  },
  modalLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "#64748B",
    letterSpacing: "0.08em",
    display: "block",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function LoginPage() {
  const navigate = useNavigate();

  // ── Login state ───────────────────────────────────────────────────────────
  const [cred, setCred]           = useState("");
  const [pass, setPass]           = useState("");
  const [loading, setLoading]     = useState(false);
  const [apiError, setApiError]   = useState("");
  const [errorType, setErrorType] = useState<ErrorType>("");

  // ── Google loading ────────────────────────────────────────────────────────
  const [googleLoading, setGoogleLoading] = useState(false);

  // ── Forgot password modal ─────────────────────────────────────────────────
  const [showForgot, setShowForgot]       = useState(false);
  const [forgotStep, setForgotStep]       = useState<ForgotStep>("email");
  const [forgotEmail, setForgotEmail]     = useState("");
  const [forgotOtp, setForgotOtp]         = useState("");
  const [newPassword, setNewPassword]     = useState("");
  const [confirmPass, setConfirmPass]     = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError]     = useState("");
  const [otpCountdown, setOtpCountdown]   = useState(0);

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

  // ─────────────────────────────────────────────────────────────────────────
  // Google OAuth — Google Identity Services (GIS) ID-token popup flow
  //
  // ⚠️  IMPORTANT — Why you see "origin_mismatch" (Error 400):
  //     Google blocks the popup if http://localhost:5173 is NOT listed under
  //     "Authorized JavaScript origins" in Google Cloud Console for your
  //     OAuth client ID.
  //
  //     Fix: https://console.cloud.google.com → APIs & Services → Credentials
  //          → OAuth 2.0 Client IDs → your client ID → Edit
  //          → Authorized JavaScript origins → Add: http://localhost:5173
  //          → Save  (takes ~5 minutes to propagate)
  //
  // Flow (GIS popup, NOT redirect):
  //   1. Load GIS script (accounts.google.com/gsi/client)
  //   2. google.accounts.id.initialize() with client_id + callback
  //   3. Render a hidden Google button and click it → opens account chooser
  //   4. User picks account → Google calls our callback with credential (ID token)
  //   5. We POST { idToken: credential } to backend: POST /api/users/oauth/google
  //   6. Backend verifies token, returns { token, role, userId, ... }
  //   7. Store in localStorage → redirect by role
  //
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Step 5-7: Send Google ID token to backend.
   * Tries /api/users/oauth/google first (primary).
   * Falls back to /api/auth/google if primary 404s.
   */
  const handleGoogleCredential = async (idToken: string) => {
    const endpoints = [
      "/api/users/oauth/google",   // primary — matches your backend GoogleAuthController
      "/api/auth/google",          // fallback — alternative Spring Security setup
    ];

    let lastError: string = "";

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ idToken }),
        });

        if (res.status === 404) {
          // This endpoint doesn't exist — try the next one
          console.warn(`[Google OAuth] ${endpoint} returned 404, trying next…`);
          continue;
        }

        if (!res.ok) {
          let errMsg = `HTTP ${res.status}`;
          try {
            const body = await res.json();
            errMsg = body?.message || body?.error || errMsg;
          } catch {
            errMsg = (await res.text()) || errMsg;
          }
          throw new Error(errMsg);
        }

        const data = await res.json();
        console.log(`✅ [Google OAuth] Success via ${endpoint}`, data);

        // Persist session
        if (data.token)        localStorage.setItem("fin_token",         data.token);
        if (data.role)         localStorage.setItem("fin_role",          data.role);
        if (data.userId)       localStorage.setItem("fin_user_id",       String(data.userId));
        if (data.id)           localStorage.setItem("fin_user_id",       String(data.id));
        if (data.consultantId) localStorage.setItem("fin_consultant_id", String(data.consultantId));
        if (data.name)         localStorage.setItem("fin_user_name",     data.name);
        if (data.email)        localStorage.setItem("fin_user_email",    data.email);

        redirectByRole(data.role || "");
        return; // success — stop trying

      } catch (err: any) {
        lastError = err?.message || "Unknown error";
        // If it's NOT a 404-type error, don't try the next endpoint
        if (!lastError.includes("404")) break;
      }
    }

    // All endpoints failed
    console.error("[Google OAuth] All endpoints failed:", lastError);

    if (lastError.toLowerCase().includes("not found") || lastError.includes("404")) {
      setApiError(
        "Google login endpoint not found on the server. " +
        "Ask your backend developer to implement POST /api/users/oauth/google."
      );
    } else {
      setApiError(lastError || "Google login failed. Please try again.");
    }
    setErrorType("auth");
    setGoogleLoading(false);
  };

  /**
   * Step 2-4: Initialize GIS and open the Google account chooser popup.
   * Requires http://localhost:5173 to be in Authorized JavaScript origins
   * in Google Cloud Console — otherwise you get "origin_mismatch".
   */
  const initGISAndOpenPopup = () => {
    const google = (window as any).google;

    if (!google?.accounts?.id) {
      setApiError("Google Sign-In library failed to load. Check your internet connection.");
      setErrorType("network");
      setGoogleLoading(false);
      return;
    }

    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (resp: any) => {
        if (resp?.credential) {
          handleGoogleCredential(resp.credential);
        } else {
          setApiError("Google sign-in was cancelled or failed. Please try again.");
          setErrorType("auth");
          setGoogleLoading(false);
        }
      },
      auto_select: false,
      cancel_on_tap_outside: true,
      use_fedcm_for_prompt: false,
    });

    // Render a real button in a hidden off-screen container, then click it.
    // This is the most reliable cross-browser way to open the Google account chooser.
    let container = document.getElementById("__gis_btn_container__");
    if (!container) {
      container = document.createElement("div");
      container.id = "__gis_btn_container__";
      container.style.cssText =
        "position:fixed;top:-9999px;left:-9999px;width:300px;height:80px;overflow:visible;z-index:-999;";
      document.body.appendChild(container);
    }
    container.innerHTML = "";

    google.accounts.id.renderButton(container, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      width: 300,
    });

    // Small delay for GIS to paint the iframe, then click it
    setTimeout(() => {
      const btn = container!.querySelector("div[role=button]") as HTMLElement | null;
      if (btn) {
        btn.click();
      } else {
        // Absolute fallback — use prompt() API
        google.accounts.id.prompt((notification: any) => {
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            const reason = notification.getNotDisplayedReason?.() || notification.getSkippedReason?.() || "";
            console.warn("[GIS prompt] Not displayed:", reason);

            if (reason === "suppressed_by_user" || reason === "browser_not_supported") {
              setApiError(
                "Google sign-in popup was suppressed. " +
                "Try clicking 'Continue with Google' again, or allow popups for this site."
              );
            } else {
              setApiError(
                "Google sign-in popup was blocked. " +
                "Allow popups for localhost:5173 in your browser settings and try again."
              );
            }
            setErrorType("network");
            setGoogleLoading(false);
          }
        });
      }
      // Reset loading spinner after 8s if user hasn't acted
      setTimeout(() => setGoogleLoading(false), 8000);
    }, 400);
  };

  /**
   * Step 1: Load the GIS script (once), then trigger the popup.
   * If GIS load fails it means either:
   *   a) No internet, OR
   *   b) origin_mismatch — localhost:5173 not in Google Cloud Console
   */
  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    setApiError("");
    setErrorType("");

    // GIS already loaded
    if ((window as any).google?.accounts?.id) {
      initGISAndOpenPopup();
      return;
    }

    // Script tag already added, just wait for it
    if (document.getElementById("__gis_script__")) {
      const existing = document.getElementById("__gis_script__")!;
      existing.addEventListener("load", initGISAndOpenPopup, { once: true });
      existing.addEventListener("error", () => {
        setApiError("Could not load Google Sign-In library. Check your internet connection.");
        setErrorType("network");
        setGoogleLoading(false);
      }, { once: true });
      return;
    }

    const script   = document.createElement("script");
    script.id      = "__gis_script__";
    script.src     = "https://accounts.google.com/gsi/client";
    script.async   = true;
    script.defer   = true;
    script.onload  = initGISAndOpenPopup;
    script.onerror = () => {
      setApiError(
        "Could not load Google Sign-In. Check your internet connection and try again."
      );
      setErrorType("network");
      setGoogleLoading(false);
    };
    document.head.appendChild(script);
  };

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
    if (newPassword !== confirmPass) { setForgotError("Passwords do not match."); return; }
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

  // ── Modal button helper ───────────────────────────────────────────────────
  const primaryBtn = (active: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "12px",
    background: active ? "#2563EB" : "#E2E8F0",
    color: active ? "#fff" : "#94A3B8",
    border: "none",
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    cursor: active ? "pointer" : "default",
    transition: "all 0.15s",
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.card}>

        {/* ── Brand ── */}
        <h1 style={S.brand}>FINADVISE</h1>
        <p style={S.tagline}>THE FUTURE OF FINANCIAL GUIDANCE</p>

        {/* ── Email / Mobile ── */}
        <label style={S.label}>EMAIL OR MOBILE</label>
        <input
          value={cred}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setCred(e.target.value); setApiError(""); setErrorType(""); }}
          onKeyDown={handleKeyDown}
          placeholder="Enter your email or mobile"
          type="text"
          autoComplete="off"
          style={{ ...S.input, ...(apiError ? S.inputError : {}) }}
        />

        {/* ── Password ── */}
        <label style={S.label}>PASSWORD</label>
        <input
          type="password"
          value={pass}
          onChange={(e: ChangeEvent<HTMLInputElement>) => { setPass(e.target.value); setApiError(""); setErrorType(""); }}
          onKeyDown={handleKeyDown}
          placeholder="••••••••"
          style={{ ...S.input, ...(apiError ? S.inputError : {}) }}
        />

        {/* ── Forgot Password ── */}
        <div style={S.forgotRow}>
          <button
            style={S.forgotLink}
            onClick={() => { setShowForgot(true); setForgotEmail(cred.includes("@") ? cred.trim() : ""); }}
          >
            Forgot Password?
          </button>
        </div>

        {/* ── Error Banner ── */}
        {apiError && (
          errorType === "oauth_config" ? (
            // Special banner for origin_mismatch / Google Cloud Console config issues
            <div style={{
              background: "#FFF7ED",
              border: "1px solid #FED7AA",
              color: "#92400E",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 16,
              fontSize: 13,
              lineHeight: 1.7,
              textAlign: "left",
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>🔧 Google OAuth Configuration Required</div>
              <div style={{ marginBottom: 8 }}>{apiError}</div>
              <div style={{ fontSize: 11, background: "rgba(0,0,0,0.05)", borderRadius: 6, padding: "8px 10px", fontFamily: "monospace" }}>
                <strong>Fix in Google Cloud Console:</strong><br />
                1. APIs &amp; Services → Credentials<br />
                2. Your OAuth 2.0 Client ID → Edit<br />
                3. Authorized JavaScript origins:<br />
                &nbsp;&nbsp;&nbsp;➕ http://localhost:5173<br />
                4. Save &amp; wait 5 minutes
              </div>
            </div>
          ) : errorType === "server" || errorType === "network" || errorType === "registered" ? (
            <div style={{
              background:
                errorType === "server"     ? "#FFF7ED" :
                errorType === "network"    ? "#F1F5F9" : "#EFF6FF",
              border:
                errorType === "server"     ? "1px solid #FED7AA" :
                errorType === "network"    ? "1px solid #CBD5E1" : "1px solid #BFDBFE",
              color:
                errorType === "server"     ? "#9A3412" :
                errorType === "network"    ? "#475569" : "#1E40AF",
              borderRadius: 10,
              padding: "12px 14px",
              marginBottom: 16,
              fontSize: 13,
              lineHeight: 1.6,
              textAlign: "left",
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {errorType === "server"     ? "🔧 Server Error"
                 : errorType === "network"  ? "📡 Connection Error"
                 : "ℹ️ Account Already Registered"}
              </div>
              <div>{apiError}</div>
              {errorType === "registered" && (
                <div style={{ marginTop: 10 }}>
                  <button
                    onClick={() => { setShowForgot(true); setForgotEmail(cred.includes("@") ? cred.trim() : ""); }}
                    style={{ fontSize: 12, color: "#2563EB", fontWeight: 700, cursor: "pointer", background: "none", border: "none", padding: 0, textDecoration: "underline" }}
                  >
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

        {/* ── Login Button ── */}
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          style={{ ...S.loginBtn, ...(loading ? S.loginBtnDisabled : {}) }}
        >
          {loading
            ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{
                  width: 14, height: 14,
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 0.7s linear infinite",
                }} />
                Authenticating...
              </span>
            : "Login to Account"
          }
        </button>

        {/* ── Divider ── */}
        <div style={S.divider}>
          <div style={S.dividerLine} />
          <span>or</span>
          <div style={S.dividerLine} />
        </div>

        {/* ── Google Login ── */}
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          style={{ ...S.googleBtn, ...(googleLoading ? { opacity: 0.7, cursor: "not-allowed" } : {}) }}
        >
          {googleLoading ? (
            <>
              <span style={{
                width: 16, height: 16,
                border: "2px solid #D1D5DB",
                borderTopColor: "#2563EB",
                borderRadius: "50%",
                display: "inline-block",
                animation: "spin 0.7s linear infinite",
              }} />
              Connecting…
            </>
          ) : (
            <>
              {/* Google "G" SVG */}
              <svg width="18" height="18" viewBox="0 0 18 18">
                <path fill="#4285F4" d="M17.64 9.2a10.3 10.3 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.56 2.68-3.88 2.68-6.62z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26a5.4 5.4 0 0 1-8.07-2.85H.96v2.33A9 9 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.99 10.71A5.4 5.4 0 0 1 3.71 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.03-2.33z"/>
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0a9 9 0 0 0-8.04 4.96l3.03 2.33A5.36 5.36 0 0 1 9 3.58z"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {/* ── Create Account ── */}
        <p style={S.registerRow}>
          Don't have an account?{" "}
          <span style={S.registerLink} onClick={() => navigate("/register")}>
            Create Account
          </span>
        </p>

        {/* ── Terms ── */}
        <p style={S.terms}>
          By logging in, you agree to our{" "}
          <span style={S.termsLink}>Terms of Service</span>
        </p>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          FORGOT PASSWORD MODAL
      ════════════════════════════════════════════════════════════════════ */}
      {showForgot && (
        <div
          style={S.modalOverlay}
          onClick={e => { if (e.target === e.currentTarget) closeForgotModal(); }}
        >
          <div style={S.modalBox}>

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
              <button
                onClick={closeForgotModal}
                style={{ background: "#F1F5F9", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", fontSize: 14, color: "#64748B", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              >
                ✕
              </button>
            </div>

            {/* Step progress dots */}
            {forgotStep !== "done" && (
              <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
                {(["email", "otp", "newpass"] as ForgotStep[]).map((s, i) => (
                  <div key={s} style={{
                    height: 4, flex: 1, borderRadius: 4,
                    background: (["email", "otp", "newpass"] as ForgotStep[]).indexOf(forgotStep) >= i ? "#2563EB" : "#E2E8F0",
                    transition: "background 0.3s",
                  }} />
                ))}
              </div>
            )}

            {/* ── Step 1: Email ── */}
            {forgotStep === "email" && (
              <>
                <label style={S.modalLabel}>EMAIL ADDRESS</label>
                <input
                  value={forgotEmail}
                  onChange={e => { setForgotEmail(e.target.value); setForgotError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleForgotSendOtp()}
                  placeholder="you@example.com"
                  type="email"
                  autoFocus
                  style={S.modalInput}
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
                <label style={S.modalLabel}>6-DIGIT OTP</label>
                <input
                  value={forgotOtp}
                  onChange={e => { setForgotOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setForgotError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleOtpContinue()}
                  placeholder="000000"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  style={{ ...S.modalInput, fontSize: 22, letterSpacing: "0.4em", textAlign: "center" }}
                />
                <div style={{ textAlign: "right", marginTop: -8, marginBottom: 12 }}>
                  <button
                    onClick={handleResendOtp}
                    disabled={otpCountdown > 0 || forgotLoading}
                    style={{ background: "none", border: "none", padding: 0, color: otpCountdown > 0 ? "#94A3B8" : "#2563EB", fontSize: 12, fontWeight: 600, cursor: otpCountdown > 0 ? "default" : "pointer" }}
                  >
                    {forgotLoading ? "Sending…" : otpCountdown > 0 ? `Resend in ${otpCountdown}s` : "Resend OTP"}
                  </button>
                </div>
                {forgotError && <div style={{ color: "#DC2626", fontSize: 12, fontWeight: 600, marginBottom: 12 }}>⚠ {forgotError}</div>}
                <button onClick={handleOtpContinue} disabled={forgotOtp.length !== 6} style={primaryBtn(forgotOtp.length === 6)}>
                  Continue
                </button>
              </>
            )}

            {/* ── Step 3: New Password ── */}
            {forgotStep === "newpass" && (
              <>
                <label style={S.modalLabel}>NEW PASSWORD</label>
                <input
                  value={newPassword}
                  onChange={e => { setNewPassword(e.target.value); setForgotError(""); }}
                  placeholder="Min. 6 characters"
                  type="password"
                  autoFocus
                  style={S.modalInput}
                />
                <label style={S.modalLabel}>CONFIRM PASSWORD</label>
                <input
                  value={confirmPass}
                  onChange={e => { setConfirmPass(e.target.value); setForgotError(""); }}
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
                <div style={{ fontSize: 15, fontWeight: 700, color: "#166534", marginBottom: 6 }}>Password reset successfully!</div>
                <div style={{ fontSize: 13, color: "#64748B", marginBottom: 22 }}>You can now log in with your new password.</div>
                <button onClick={closeForgotModal} style={primaryBtn(true)}>Back to Login</button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}