import { ChangeEvent, KeyboardEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../services/api";
import styles from "../styles/LoginPage.module.css";

export default function LoginPage() {
  const [cred, setCred]           = useState("");
  const [pass, setPass]           = useState("");
  const [loading, setLoading]     = useState(false);
  const [apiError, setApiError]   = useState("");
  const [errorType, setErrorType] = useState<"auth" | "server" | "network" | "">("");

  const navigate = useNavigate();

  // Classify the error so we can show the right message
  const classifyError = (err: any): { msg: string; type: "auth" | "server" | "network" } => {
    const msg = err?.message || "";
    if (
      msg.toLowerCase().includes("cannot connect") ||
      msg.toLowerCase().includes("failed to fetch")
    ) {
      return {
        msg: "Cannot reach the server. Please check your internet connection or try again later.",
        type: "network",
      };
    }
    if (msg.includes("500") || msg.toLowerCase().includes("internal server")) {
      return {
        msg: "The server encountered an error. This is a backend issue — please contact support or check the server logs.",
        type: "server",
      };
    }
    if (
      msg.includes("401") ||
      msg.includes("403") ||
      msg.toLowerCase().includes("unauthorized") ||
      msg.toLowerCase().includes("invalid")
    ) {
      return { msg: "Invalid email or password. Please try again.", type: "auth" };
    }
    return { msg: msg || "Login failed. Please check your credentials.", type: "auth" };
  };

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

      // Strip ROLE_ prefix Spring Security sometimes adds, then uppercase
      const raw  = data?.role || data?.userRole || "";
      const role = raw.toString().toUpperCase().trim().replace(/^ROLE_/, "");

      console.log("🔑 Login response role:", raw, "→ normalized:", role);

      // ── Subscriber popup: clear session flag so UserPage shows the popup ──
      // Always reset on fresh login so premium users see it every time they log in
      if (role === "SUBSCRIBER" || role === "SUBSCRIBED") {
        sessionStorage.removeItem("sub_popup_shown");
      }

      if (role === "USER" || role === "SUBSCRIBER" || role === "SUBSCRIBED") {
        navigate("/user");
      } else if (role === "ADMIN") {
        navigate("/admin");
      } else if (role === "CONSULTANT" || role === "ADVISOR") {
        navigate("/consultant");
      } else {
        setApiError(`Role not recognized: "${raw || "empty"}". Contact support.`);
        setErrorType("auth");
      }
    } catch (err: any) {
      const { msg, type } = classifyError(err);
      setApiError(msg);
      setErrorType(type);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  // Error banner styles based on type
  const errorBannerStyle: React.CSSProperties =
    errorType === "server"
      ? {
          background: "#FFF7ED",
          border: "1px solid #FED7AA",
          borderRadius: 10,
          padding: "12px 14px",
          marginBottom: 16,
          fontSize: 13,
          color: "#9A3412",
          lineHeight: 1.5,
        }
      : errorType === "network"
      ? {
          background: "#F1F5F9",
          border: "1px solid #CBD5E1",
          borderRadius: 10,
          padding: "12px 14px",
          marginBottom: 16,
          fontSize: 13,
          color: "#475569",
          lineHeight: 1.5,
        }
      : {};

  const errorIcon =
    errorType === "server" ? "🔧" : errorType === "network" ? "📡" : "⚠";

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
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setCred(e.target.value);
            setApiError("");
            setErrorType("");
          }}
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
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            setPass(e.target.value);
            setApiError("");
            setErrorType("");
          }}
          onKeyDown={handleKeyDown}
          placeholder="••••••••"
          className={`${styles.input} ${apiError ? styles.inputError : ""}`}
        />

        {/* ── Error Banner ── */}
        {apiError && (
          errorType === "server" || errorType === "network" ? (
            <div style={errorBannerStyle}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {errorIcon}{" "}
                {errorType === "server" ? "Server Error" : "Connection Error"}
              </div>
              <div>{apiError}</div>
              {errorType === "server" && (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 11,
                    color: "#C2410C",
                    fontWeight: 600,
                  }}
                >
                  Tip: Check if Spring Boot is running and the database schema is
                  up to date.
                </div>
              )}
            </div>
          ) : (
            <div className={styles.apiError}>⚠ {apiError}</div>
          )
        )}

        <button
          type="button"
          onClick={handleLogin}
          className={styles.loginSubmitBtn}
          disabled={loading}
        >
          {loading ? (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 0.7s linear infinite",
                }}
              />
              Authenticating...
            </span>
          ) : (
            "Login to Account"
          )}
        </button>

        <p className={styles.registerText}>
          Don't have an account?{" "}
          <span
            className={styles.registerLink}
            onClick={() => navigate("/register")}
          >
            Create Account
          </span>
        </p>

        <p className={styles.terms}>
          By logging in, you agree to our{" "}
          <span className={styles.termsLink}>Terms of Service</span>
        </p>

      </div>
    </div>
  );
}