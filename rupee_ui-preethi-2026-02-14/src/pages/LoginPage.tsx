import { ChangeEvent, KeyboardEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../services/api";
import styles from "../styles/LoginPage.module.css";

export default function LoginPage() {
  const [cred, setCred]         = useState("");
  const [pass, setPass]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [apiError, setApiError] = useState("");

  const navigate = useNavigate();

  // Helper: Normalize Role String
  const normalizeRole = (role?: string) => role ? role.toUpperCase().trim() : "";

  // ── Unified Login Logic ──
  const handleLogin = async () => {
    if (!cred.trim() || !pass.trim()) {
      setApiError("Please enter your email and password");
      return;
    }

    setLoading(true);
    setApiError("");

    try {
      const data = await loginUser(cred.trim(), pass);
      const role = normalizeRole(data?.role);

      // Auto-Redirect based on role returned by the server
      if (role === "USER") {
        navigate("/user");
      } else if (role === "ADMIN") {
        navigate("/admin");
      } else if (role === "CONSULTANT" || role === "ADVISOR") {
        navigate("/advisor");
      } else {
        setApiError("Unauthorized: Role not recognized.");
      }
    } catch (err: any) {
      setApiError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

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
          }}
          onKeyDown={handleKeyDown}
          placeholder="••••••••"
          className={`${styles.input} ${apiError ? styles.inputError : ""}`}
        />

        {apiError && <div className={styles.apiError}>⚠ {apiError}</div>}

        {/* ── Single Login Button ── */}
        <button
          type="button"
          onClick={handleLogin}
          className={styles.loginSubmitBtn} // Update this class in your CSS
          disabled={loading}
        >
          {loading ? "Authenticating..." : "Login to Account"}
        </button>

        <p className={styles.registerText}>
          Don't have an account?{" "}
          <span className={styles.registerLink} onClick={() => navigate("/register")}>
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