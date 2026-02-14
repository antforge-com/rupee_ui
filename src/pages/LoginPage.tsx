import { useState, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";

export default function LoginPage() {
  const [cred, setCred] = useState<string>("");
  const [pass, setPass] = useState<string>("");
  const navigate = useNavigate();

  const handleCredChange = (e: ChangeEvent<HTMLInputElement>) => setCred(e.target.value);
  const handlePassChange = (e: ChangeEvent<HTMLInputElement>) => setPass(e.target.value);

  return (
    <div style={{ minHeight: "100vh", background: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap'); *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { margin: 0; padding: 0; } input:focus { border-color: #2563EB !important; outline: none; }`}</style>

      <div style={{ background: "#fff", borderRadius: 24, padding: "48px 48px 36px", width: 420, boxShadow: "0 32px 80px rgba(0,0,0,0.18)" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <h1 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 34, color: "#2563EB", letterSpacing: 2, margin: 0 }}>FINADVISE</h1>
          <p style={{ fontSize: 11, letterSpacing: 3, color: "#94A3B8", fontWeight: 600, marginTop: 6 }}>THE FUTURE OF FINANCIAL GUIDANCE</p>
        </div>

        {/* Email */}
        <label style={{ display: "block", fontSize: 11, letterSpacing: 2, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>EMAIL OR MOBILE</label>
        <input
          value={cred}
          onChange={handleCredChange}
          placeholder="Enter your credentials"
          style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 15, boxSizing: "border-box", outline: "none", marginBottom: 20, fontFamily: "inherit" }}
        />

        {/* Password */}
        <label style={{ display: "block", fontSize: 11, letterSpacing: 2, fontWeight: 700, color: "#64748B", marginBottom: 8 }}>PASSWORD</label>
        <input
          type="password"
          value={pass}
          onChange={handlePassChange}
          placeholder="••••••••"
          style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 15, boxSizing: "border-box", outline: "none", marginBottom: 32, fontFamily: "inherit" }}
        />

        {/* Buttons */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
          {/* User Login */}
          <button
            onClick={() => navigate("/user")}
            style={{ background: "#0F172A", color: "#fff", border: "none", borderRadius: 16, padding: "20px 0", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" stroke="#60A5FA" strokeWidth="2"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round"/>
            </svg>
            User Login
          </button>

          {/* Admin Panel */}
          <button
            onClick={() => navigate("/admin")}
            style={{ background: "#fff", color: "#1E293B", border: "1.5px solid #E2E8F0", borderRadius: 16, padding: "20px 0", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
              <path d="M12 3l7 4v5c0 4-3 7.5-7 9-4-1.5-7-5-7-9V7l7-4z" stroke="#64748B" strokeWidth="2" strokeLinejoin="round"/>
              <path d="M9 12l2 2 4-4" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Admin Panel
          </button>
        </div>

        <p style={{ textAlign: "center", fontSize: 13, color: "#94A3B8" }}>
          By logging in, you agree to our{" "}
          <span style={{ color: "#2563EB", fontWeight: 600, cursor: "pointer" }}>Terms of Service</span>
        </p>
      </div>
    </div>
  );
}
