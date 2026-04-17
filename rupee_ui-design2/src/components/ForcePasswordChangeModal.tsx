import React, { useEffect, useState } from "react";
import logoImg from "../assests/Meetmasterslogopng.png";
import { changePassword, getCurrentUser } from "../services/api";

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2500,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
  backdropFilter: "blur(8px)",
  background: "rgba(15,23,42,0.75)",
};

export default function ForcePasswordChangeModal() {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({ newPass: "", confirmPass: "" });

  useEffect(() => {
    let active = true;

    const load = async () => {
      const storedUserId = localStorage.getItem("fin_user_id");
      const doneKey = storedUserId ? `fin_pw_changed_${storedUserId}` : null;
      const alreadyChanged = doneKey ? localStorage.getItem(doneKey) === "true" : false;

      if (alreadyChanged) {
        localStorage.removeItem("fin_requires_pw_change");
        if (active) setVisible(false);
        return;
      }

      if (localStorage.getItem("fin_requires_pw_change") === "true" && active) {
        setVisible(true);
      }

      try {
        const user = await getCurrentUser();
        const uid = user?.id ? String(user.id) : storedUserId;
        const permDoneKey = uid ? `fin_pw_changed_${uid}` : null;
        const permAlreadyDone = permDoneKey ? localStorage.getItem(permDoneKey) === "true" : false;

        if (permAlreadyDone) {
          localStorage.removeItem("fin_requires_pw_change");
          if (active) setVisible(false);
          return;
        }

        if (user?.requiresPasswordChange === true) {
          localStorage.setItem("fin_requires_pw_change", "true");
          if (active) setVisible(true);
        }
      } catch {
        // Fall back to localStorage flag only.
      }
    };

    load();
    return () => { active = false; };
  }, []);

  if (!visible) return null;

  const score =
    (form.newPass.length >= 8 ? 1 : 0) +
    (/[A-Z]/.test(form.newPass) ? 1 : 0) +
    (/[0-9]/.test(form.newPass) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(form.newPass) ? 1 : 0);
  const levels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#EF4444", "#F59E0B", "#22C55E", "#16A34A"];

  const handleSubmit = async () => {
    if (!form.newPass || form.newPass !== form.confirmPass) {
      setError("Passwords don't match.");
      return;
    }
    if (form.newPass.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await changePassword({ newPassword: form.newPass, confirmPassword: form.confirmPass });
      localStorage.removeItem("fin_requires_pw_change");
      const doneUid = localStorage.getItem("fin_user_id");
      if (doneUid) localStorage.setItem(`fin_pw_changed_${doneUid}`, "true");
      setForm({ newPass: "", confirmPass: "" });
      setVisible(false);
    } catch (err: any) {
      const message = String(err?.message || "");
      if (message.toLowerCase().includes("same")) {
        setError("New password must be different from your current password.");
      } else {
        setError(message || "Failed to change password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={overlayStyle}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 22, width: "100%", maxWidth: 430, boxShadow: "0 32px 80px rgba(15,23,42,0.4)", overflow: "hidden" }}
      >
        <div style={{ background: "var(--portal-profile-gradient)", padding: "18px 20px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#99F6E4", marginBottom: 4 }}>Security Required</div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#fff", margin: 0 }}>Set Your New Password</h3>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#A5F3FC", margin: 0, lineHeight: 1.45 }}>
            Your account was created with a temporary password. Please set a new secure password to continue.
          </p>
        </div>

        <div style={{ padding: "18px 20px 20px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 10, padding: "9px 12px", marginBottom: 14 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <span style={{ fontSize: 12, color: "#92400E", fontWeight: 600, lineHeight: 1.5 }}>
              Enter a new password that is different from your temporary password.
            </span>
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 9, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#B91C1C", fontWeight: 600 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>New Password *</label>
            <div style={{ position: "relative" }}>
              <input
                type={showNew ? "text" : "password"}
                value={form.newPass}
                onChange={(e) => { setForm((p) => ({ ...p, newPass: e.target.value })); setError(""); }}
                placeholder="Min. 8 characters"
                style={{ width: "100%", padding: "11px 44px 11px 14px", border: "1.5px solid #E2E8F0", borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
              <button type="button" onClick={() => setShowNew((v) => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {showNew
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
              </button>
            </div>
            {form.newPass && (
              <div style={{ marginTop: 6 }}>
                <div style={{ display: "flex", gap: 3, marginBottom: 3 }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} style={{ flex: 1, height: 4, borderRadius: 3, background: score >= i ? colors[score] : "#F1F5F9", transition: "background 0.2s" }} />
                  ))}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: colors[score] }}>{levels[score]} password</span>
              </div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>Confirm Password *</label>
            <div style={{ position: "relative" }}>
              <input
                type={showConfirm ? "text" : "password"}
                value={form.confirmPass}
                onChange={(e) => { setForm((p) => ({ ...p, confirmPass: e.target.value })); setError(""); }}
                placeholder="Re-enter new password"
                style={{ width: "100%", padding: "11px 44px 11px 14px", border: `1.5px solid ${form.confirmPass && form.confirmPass !== form.newPass ? "#FCA5A5" : "#E2E8F0"}`, borderRadius: 10, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
              />
              <button type="button" onClick={() => setShowConfirm((v) => !v)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {showConfirm
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>}
              </button>
            </div>
            {form.confirmPass && form.confirmPass !== form.newPass && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#DC2626", fontWeight: 600, marginTop: 4 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                Passwords don't match
              </div>
            )}
          </div>

          <div style={{ background: "#F8FAFC", border: "1px solid #F1F5F9", borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Requirements</div>
            {[
              { rule: "At least 8 characters", met: form.newPass.length >= 8 },
              { rule: "Uppercase letter (A-Z)", met: /[A-Z]/.test(form.newPass) },
              { rule: "Number (0-9)", met: /[0-9]/.test(form.newPass) },
              { rule: "Different from temporary password", met: form.newPass.length > 0 },
            ].map((rule) => (
              <div key={rule.rule} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: rule.met ? "#16A34A" : "#94A3B8", marginBottom: 4 }}>
                {rule.met
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /></svg>}
                {rule.rule}
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={loading || !form.newPass || form.newPass !== form.confirmPass || form.newPass.length < 8}
            onClick={handleSubmit}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: 12,
              border: "none",
              background: (loading || !form.newPass || form.newPass !== form.confirmPass || form.newPass.length < 8) ? "#E2E8F0" : "var(--color-primary-gradient)",
              color: (loading || !form.newPass || form.newPass !== form.confirmPass || form.newPass.length < 8) ? "#94A3B8" : "#fff",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {loading
              ? <><img src={logoImg} alt="" style={{ width: 18, height: "auto", animation: "mtmPulse 1.8s ease-in-out infinite" }} /> Saving...</>
              : "Set New Password"}
          </button>
        </div>
      </div>
    </div>
  );
}