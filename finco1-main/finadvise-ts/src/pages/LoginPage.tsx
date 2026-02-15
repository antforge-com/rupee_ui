import { useState, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import styles from "../css/LoginPage.module.css";

export default function LoginPage() {
  const [cred, setCred] = useState<string>("");
  const [pass, setPass] = useState<string>("");
  const navigate = useNavigate();

  const handleCredChange = (e: ChangeEvent<HTMLInputElement>) => setCred(e.target.value);
  const handlePassChange = (e: ChangeEvent<HTMLInputElement>) => setPass(e.target.value);

  return (
    <div className={styles.page}>
      <div className={styles.card}>

        {/* Logo */}
        <div className={styles.logoSection}>
          <h1 className={styles.logo}>FINADVISE</h1>
          <p className={styles.tagline}>THE FUTURE OF FINANCIAL GUIDANCE</p>
        </div>

        {/* Email */}
        <label className={styles.label}>EMAIL OR MOBILE</label>
        <input value={cred} onChange={handleCredChange} placeholder="Enter your credentials" className={styles.input} />

        {/* Password */}
        <label className={styles.label}>PASSWORD</label>
        <input type="password" value={pass} onChange={handlePassChange} placeholder="••••••••" className={styles.input} />

        {/* Buttons */}
        <div className={styles.buttonGrid}>
          <button onClick={() => navigate("/user")} className={styles.userBtn}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" stroke="#60A5FA" strokeWidth="2"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            User Login
          </button>
          <button onClick={() => navigate("/admin")} className={styles.adminBtn}>
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <path d="M12 3l7 4v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V7l7-4z" stroke="#64748B" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M9 12l2 2 4-4" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Admin Panel
          </button>
        </div>

        {/* Register Link */}
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