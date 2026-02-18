import { ChangeEvent, useState, KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../styles/LoginPage.module.css"; 
import { changePassword, loginUser } from "../services/api";

export default function LoginPage() {
  const [cred, setCred]         = useState("");
  const [pass, setPass]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [apiError, setApiError] = useState("");

  // Change Password States
  const [showChangePwd, setShowChangePwd]     = useState(false);
  const [newPassword, setNewPassword]         = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwdLoading, setPwdLoading]           = useState(false);
  const [pwdError, setPwdError]               = useState("");
  const [pwdSuccess, setPwdSuccess]           = useState(false);

  const navigate = useNavigate();

  // ── Reset change password state ──
  const goBackToLogin = () => {
    setShowChangePwd(false);
    setNewPassword("");
    setConfirmPassword("");
    setPwdError("");
    setPwdSuccess(false);
    setCred("");
    setPass("");
    setApiError("");
  };

  // ── Helper: Normalize Role String ──
  const normalizeRole = (role?: string) => role ? role.toUpperCase().trim() : "";

  // ── 1. STRICT User Login ──
  const handleUserLogin = async () => {
    if (!cred.trim() || !pass.trim()) {
      setApiError("Please enter your email and password");
      return;
    }
    setLoading(true);
    setApiError("");
    try {
      const data = await loginUser(cred.trim(), pass);
      console.log("User login raw response:", JSON.stringify(data));
      
      const role = normalizeRole(data?.role);

      // ✅ STRICT CHECK: Only allow 'USER' role
      if (role === "USER") {
        navigate("/user");
      } else {
        setApiError("Access Denied: This account is not a User account.");
        // Optional: clear token if role mismatch prevents "half-logged-in" state
        localStorage.removeItem("fin_token");
        localStorage.removeItem("fin_role");
      }
    } catch (err: any) {
      setApiError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── 2. STRICT Admin Login ──
  const handleAdminLogin = async () => {
    if (!cred.trim() || !pass.trim()) {
      setApiError("Please enter your email and password");
      return;
    }
    setLoading(true);
    setApiError("");
    try {
      const data = await loginUser(cred.trim(), pass);
      console.log("Admin login raw response:", JSON.stringify(data));
      
      const role = normalizeRole(data?.role);

      // ✅ STRICT CHECK: Only allow 'ADMIN' role
      if (role === "ADMIN") {
        // If you want to force password change logic, uncomment the line below:
        // setShowChangePwd(true); 
        
        // Default behavior: Go to Admin Dashboard
        navigate("/admin");
      } else {
        setApiError("Access Restricted: You do not have Admin privileges.");
        localStorage.removeItem("fin_token");
        localStorage.removeItem("fin_role");
      }
    } catch (err: any) {
      setApiError(err.message || "Admin login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── 3. STRICT Consultant Login ──
  const handleConsultantLogin = async () => {
    if (!cred.trim() || !pass.trim()) {
      setApiError("Please enter your email and password");
      return;
    }
    setLoading(true);
    setApiError("");
    try {
      const data = await loginUser(cred.trim(), pass);
      console.log("Consultant login raw response:", JSON.stringify(data));
      
      const role = normalizeRole(data?.role);

      // ✅ STRICT CHECK: Allow 'CONSULTANT' or 'ADVISOR' (depending on your DB)
      if (role === "CONSULTANT" || role === "ADVISOR") {
        navigate("/advisor");
      } else {
        setApiError("Access Denied: This account is not a Consultant account.");
        localStorage.removeItem("fin_token");
        localStorage.removeItem("fin_role");
      }
    } catch (err: any) {
      setApiError(err.message || "Consultant login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Change Password Logic ──
  const handleChangePassword = async () => {
    setPwdError("");
    if (!newPassword.trim()) {
      setPwdError("New password is required");
      return;
    }
    if (newPassword.length < 6) {
      setPwdError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError("Passwords do not match");
      return;
    }
    setPwdLoading(true);
    try {
      await changePassword({
        oldPassword: pass,
        newPassword,
        confirmPassword,
      });
      setPwdSuccess(true);
      setTimeout(() => navigate("/admin"), 1500);
    } catch (err: any) {
      setPwdError(err.message || "Failed to change password.");
    } finally {
      setPwdLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") handleUserLogin(); // Default to user login on Enter
  };

  // ── Render Change Password Screen (Conditional) ──
  if (showChangePwd) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <button type="button" className={styles.backBtn} onClick={goBackToLogin}>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
              <path d="M19 12H5M5 12l7 7M5 12l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back to Login
          </button>

          <div className={styles.logoSection}>
            <h1 className={styles.logo}>FINADVISE</h1>
            <p className={styles.tagline}>ADMIN PANEL</p>
          </div>

          <div className={styles.changePwdTitle}>Set New Password</div>
          <div className={styles.changePwdSub}>Please set a new password for your admin account</div>

          {pwdSuccess ? (
            <div className={styles.pwdSuccess}>
              <div className={styles.pwdSuccessIcon}>✓</div>
              <div>Password changed! Redirecting...</div>
            </div>
          ) : (
            <>
              <label className={styles.label}>NEW PASSWORD</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setNewPassword(e.target.value);
                  setPwdError("");
                }}
                placeholder="Enter new password"
                className={`${styles.input} ${pwdError ? styles.inputError : ""}`}
              />

              <label className={styles.label}>CONFIRM PASSWORD</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setConfirmPassword(e.target.value);
                  setPwdError("");
                }}
                placeholder="Confirm new password"
                className={`${styles.input} ${pwdError ? styles.inputError : ""}`}
              />

              {pwdError && <div className={styles.apiError}>⚠ {pwdError}</div>}

              <button
                type="button"
                onClick={handleChangePassword}
                className={styles.changePwdBtn}
                disabled={pwdLoading}
              >
                {pwdLoading ? "Saving..." : "Set Password & Continue →"}
              </button>

              <p className={styles.skipLink} onClick={() => navigate("/admin")}>
                Skip for now
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── Main Login Screen ──
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

        {/* 3-Button Grid */}
        <div className={styles.buttonGrid}>
          {/* 1. User Button */}
          <button
            type="button"
            onClick={handleUserLogin}
            className={styles.userBtn}
            disabled={loading}
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" stroke="#60A5FA" strokeWidth="2"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            {loading ? "..." : "User Login"}
          </button>

          {/* 2. Consultant Button */}
          <button
            type="button"
            onClick={handleConsultantLogin}
            className={styles.advisorBtn} 
            disabled={loading}
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <path d="M20 7h-4V4c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM10 4h4v3h-4V4zm10 16H4V9h16v11z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Consultant
          </button>

          {/* 3. Admin Button */}
          <button
            type="button"
            onClick={handleAdminLogin}
            className={styles.adminBtn}
            disabled={loading}
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <path d="M12 3l7 4v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V7l7-4z" stroke="#64748B" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M9 12l2 2 4-4" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {loading ? "..." : "Admin"}
          </button>
        </div>

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