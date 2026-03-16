import React, { useEffect, useState } from "react";
import { getToken } from "../services/api";
import "../styles/AddAdvisor.css";

interface AddAdvisorProps {
  onClose: () => void;
  onSave: (advisorData: any) => void;
}

// ─── Predefined skill options grouped by category ───────────────────────────
const SKILL_GROUPS: { group: string; icon: string; skills: string[] }[] = [
  {
    group: "Tax & Compliance",
    icon: "🧾",
    skills: ["Income Tax", "GST", "Tax Planning", "Tax Filing", "Corporate Tax", "International Tax", "Audit & Compliance"],
  },
  {
    group: "Investment",
    icon: "📈",
    skills: ["Equity", "Mutual Funds", "SIP", "Portfolio Management", "Stock Analysis", "Bonds & Debentures", "Derivatives"],
  },
  {
    group: "Wealth & Retirement",
    icon: "🏦",
    skills: ["Wealth Management", "Retirement Planning", "Pension", "Estate Planning", "Trust Management"],
  },
  {
    group: "Insurance & Risk",
    icon: "🛡️",
    skills: ["Life Insurance", "Health Insurance", "Term Plans", "Risk Assessment", "ULIP"],
  },
  {
    group: "Real Estate & Loans",
    icon: "🏠",
    skills: ["Real Estate Investment", "Home Loans", "NRI Investment", "Property Tax", "Mortgage Planning"],
  },
  {
    group: "Business Finance",
    icon: "💼",
    skills: ["Business Planning", "Startup Finance", "Cash Flow", "Accounting", "MSME Advisory", "Valuation"],
  },
];

// ─── Material Time Picker (Circular Clock) ───────────────────────────────────
const MaterialTimePicker: React.FC<{
  isOpen: boolean;
  initialTime: string;
  onClose: () => void;
  onSave: (time24h: string) => void;
}> = ({ isOpen, initialTime, onClose, onSave }) => {
  const [mode, setMode] = useState<"hour" | "minute">("hour");
  const [time, setTime] = useState({ h: 12, m: 0, ampm: "AM" });

  useEffect(() => {
    if (isOpen) {
      if (initialTime) {
        const [H, M] = initialTime.split(":").map(Number);
        setTime({ h: H % 12 || 12, m: M || 0, ampm: H >= 12 ? "PM" : "AM" });
      } else {
        setTime({ h: 12, m: 0, ampm: "AM" });
      }
      setMode("hour");
    }
  }, [isOpen, initialTime]);

  if (!isOpen) return null;

  const handleSave = () => {
    let H = time.h;
    if (time.ampm === "PM" && H < 12) H += 12;
    if (time.ampm === "AM" && H === 12) H = 0;
    onSave(`${String(H).padStart(2, "0")}:${String(time.m).padStart(2, "0")}`);
  };

  const getItems = () =>
    mode === "hour"
      ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
      : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const activeValue = mode === "hour" ? time.h : time.m;
  const items = getItems();

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 10000, backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        style={{ background: "#fff", borderRadius: 8, width: 300, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: "#1976D2", padding: "24px 20px", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span
              onClick={() => setMode("hour")}
              style={{ fontSize: 48, fontWeight: 400, color: mode === "hour" ? "#fff" : "rgba(255,255,255,0.6)", lineHeight: 1, cursor: "pointer" }}
            >
              {String(time.h).padStart(2, "0")}
            </span>
            <span style={{ fontSize: 48, fontWeight: 300, color: "rgba(255,255,255,0.6)", lineHeight: 1 }}>:</span>
            <span
              onClick={() => setMode("minute")}
              style={{ fontSize: 48, fontWeight: 400, color: mode === "minute" ? "#fff" : "rgba(255,255,255,0.6)", lineHeight: 1, cursor: "pointer" }}
            >
              {String(time.m).padStart(2, "0")}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 8, paddingBottom: 6 }}>
            <span
              onClick={() => setTime({ ...time, ampm: "AM" })}
              style={{ fontSize: 14, fontWeight: 600, color: time.ampm === "AM" ? "#fff" : "rgba(255,255,255,0.6)", cursor: "pointer" }}
            >AM</span>
            <span
              onClick={() => setTime({ ...time, ampm: "PM" })}
              style={{ fontSize: 14, fontWeight: 600, color: time.ampm === "PM" ? "#fff" : "rgba(255,255,255,0.6)", cursor: "pointer" }}
            >PM</span>
          </div>
        </div>

        {/* Clock face */}
        <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
          <div style={{ position: "relative", width: 240, height: 240, borderRadius: "50%", background: "#F1F5F9" }}>
            <div style={{ position: "absolute", top: "50%", left: "50%", width: 8, height: 8, background: "#1976D2", borderRadius: "50%", transform: "translate(-50%,-50%)", zIndex: 10 }} />
            {items.map((val, i) => {
              const angle = (i * 30) * (Math.PI / 180);
              const r = 96;
              const x = 120 + r * Math.sin(angle);
              const y = 120 - r * Math.cos(angle);
              const isActive = activeValue === val;
              return (
                <React.Fragment key={val}>
                  {isActive && (
                    <div style={{ position: "absolute", top: "50%", left: "50%", width: 2, height: r, background: "#1976D2", transformOrigin: "bottom center", transform: `translate(-50%,-100%) rotate(${i * 30}deg)`, zIndex: 1 }} />
                  )}
                  <div
                    onClick={() => {
                      if (mode === "hour") {
                        setTime({ ...time, h: val });
                        setTimeout(() => setMode("minute"), 300);
                      } else {
                        setTime({ ...time, m: val });
                      }
                    }}
                    style={{
                      position: "absolute", left: x, top: y, transform: "translate(-50%,-50%)",
                      width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      background: isActive ? "#1976D2" : "transparent",
                      color: isActive ? "#fff" : "#334155",
                      fontSize: 15, fontWeight: isActive ? 600 : 400, cursor: "pointer", zIndex: 5, transition: "all 0.2s",
                    }}
                  >
                    {val === 0 && mode === "minute" ? "00" : val}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 16px 16px", gap: 16 }}>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: "#1976D2", fontWeight: 700, fontSize: 14, cursor: "pointer", textTransform: "uppercase" }}>CANCEL</button>
          <button type="button" onClick={handleSave} style={{ background: "none", border: "none", color: "#1976D2", fontWeight: 700, fontSize: 14, cursor: "pointer", textTransform: "uppercase" }}>OK</button>
        </div>
      </div>
    </div>
  );
};

// ─── Helper: convert 24h "HH:MM" → "hh:MM AM/PM" display ───────────────────
const displayTime = (t: string): string => {
  if (!t) return "--:--";
  const [H, M] = t.split(":").map(Number);
  const ampm = H >= 12 ? "PM" : "AM";
  const h = H % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(M).padStart(2, "0")} ${ampm}`;
};

const AddAdvisor: React.FC<AddAdvisorProps> = ({ onClose, onSave }) => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    designation: "",
    shiftStartTime: "",
    shiftEndTime: "",
    charges: "",
  });

  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [customSkill, setCustomSkill]       = useState("");
  const [skillSearch, setSkillSearch]       = useState("");
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState("");

  // ── Time picker state ──────────────────────────────────────────────────────
  const [timePickerConfig, setTimePickerConfig] = useState<{
    isOpen: boolean;
    field: "shiftStartTime" | "shiftEndTime" | null;
    value: string;
  }>({ isOpen: false, field: null, value: "" });

  const openTimePicker = (field: "shiftStartTime" | "shiftEndTime") => {
    setTimePickerConfig({ isOpen: true, field, value: formData[field] });
  };

  const handleTimePickerSave = (time24h: string) => {
    if (timePickerConfig.field) {
      setFormData(prev => ({ ...prev, [timePickerConfig.field!]: time24h }));
      if (error) setError("");
    }
    setTimePickerConfig({ isOpen: false, field: null, value: "" });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError("");
  };

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev);
      next.has(skill) ? next.delete(skill) : next.add(skill);
      return next;
    });
  };

  const addCustomSkill = () => {
    const trimmed = customSkill.trim();
    if (!trimmed) return;
    trimmed.split(",").map(s => s.trim()).filter(Boolean).forEach(s => {
      setSelectedSkills(prev => new Set([...prev, s]));
    });
    setCustomSkill("");
  };

  const removeSkill = (skill: string) => {
    setSelectedSkills(prev => { const n = new Set(prev); n.delete(skill); return n; });
  };

  const filteredGroups = SKILL_GROUPS.map(g => ({
    ...g,
    skills: g.skills.filter(s => !skillSearch || s.toLowerCase().includes(skillSearch.toLowerCase())),
  })).filter(g => g.skills.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim())        { setError("Full Name is required."); return; }
    if (!formData.email.trim())       { setError("Email is required."); return; }
    if (!formData.designation.trim()) { setError("Designation is required."); return; }
    if (selectedSkills.size === 0)    { setError("Please select at least one skill."); return; }
    if (!formData.shiftStartTime)     { setError("Shift Start Time is required."); return; }
    if (!formData.shiftEndTime)       { setError("Shift End Time is required."); return; }
    if (!formData.charges || isNaN(Number(formData.charges))) {
      setError("A valid charge amount is required."); return;
    }

    setLoading(true); setError("");

    try {
      const toLocalTime = (t: string) => t.length === 5 ? `${t}:00` : t;

      const consultantPayload = {
        name:           formData.name.trim(),
        email:          formData.email.trim(),
        designation:    formData.designation.trim(),
        charges:        parseFloat(formData.charges),
        skills:         [...selectedSkills],
        shiftStartTime: toLocalTime(formData.shiftStartTime),
        shiftEndTime:   toLocalTime(formData.shiftEndTime),
      };

      const fd = new FormData();
      fd.append("data", new Blob([JSON.stringify(consultantPayload)], { type: "application/json" }));

      const token = getToken();
      const response = await fetch("/api/consultants", {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: fd,
      });

      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await response.json()
        : { message: await response.text() };

      if (!response.ok) {
        if (data?.fieldErrors) {
          const msgs = Object.entries(data.fieldErrors).map(([f, m]) => `${f}: ${m}`).join(", ");
          setError(`Validation error — ${msgs}`);
        } else if (response.status === 409) {
          setError("A consultant with this email already exists.");
        } else if (response.status === 403) {
          setError("Access denied. Your account may not have ADMIN privileges.");
        } else {
          setError(data?.message || `Error ${response.status}`);
        }
        return;
      }

      onSave(data);
      onClose();
    } catch (err: any) {
      setError(err.message || "Cannot reach the server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="advisor-modal-overlay">
      <div className="advisor-card" style={{ maxWidth: 680, width: "100%" }}>
        <div className="advisor-header">
          <h1 className="brand-title">FINADVISE</h1>
          <p className="brand-subtitle">ADD NEW CONSULTANT</p>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form className="advisor-form" onSubmit={handleSubmit}>

          {/* ── Basic Info ── */}
          <div className="form-group">
            <label>FULL NAME <span className="required">*</span></label>
            <input type="text" name="name" placeholder="Enter consultant name"
              value={formData.name} onChange={handleChange} disabled={loading} />
          </div>

          <div className="form-group">
            <label>EMAIL (LOGIN ID) <span className="required">*</span></label>
            <input type="email" name="email" placeholder="e.g. name@finadvise.com"
              value={formData.email} onChange={handleChange} disabled={loading} />
          </div>

          <div className="form-group">
            <label>DESIGNATION <span className="required">*</span></label>
            <input type="text" name="designation" placeholder="e.g. Senior Tax Consultant"
              value={formData.designation} onChange={handleChange} disabled={loading} />
          </div>

          {/* ── Skill Selector ── */}
          <div className="form-group">
            <label>
              SKILL SET <span className="required">*</span>
              <span style={{ fontSize: 11, fontWeight: 400, color: "#64748B", marginLeft: 8, textTransform: "none" }}>
                Click to select · {selectedSkills.size} selected
              </span>
            </label>

            {selectedSkills.size > 0 && (
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 6,
                marginBottom: 10, padding: "10px 12px",
                background: "#EFF6FF", borderRadius: 10,
                border: "1.5px solid #BFDBFE", minHeight: 42,
              }}>
                {[...selectedSkills].map(skill => (
                  <span key={skill} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 20,
                    background: "#2563EB", color: "#fff",
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      style={{
                        background: "rgba(255,255,255,0.3)", border: "none",
                        borderRadius: "50%", width: 16, height: 16,
                        cursor: "pointer", color: "#fff", fontSize: 12,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        lineHeight: 1, padding: 0,
                      }}
                    >×</button>
                  </span>
                ))}
              </div>
            )}

            <div style={{ position: "relative", marginBottom: 10 }}>
              <svg style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                placeholder="Search skills…"
                value={skillSearch}
                onChange={e => setSkillSearch(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%", padding: "9px 12px 9px 32px",
                  border: "1.5px solid #E2E8F0", borderRadius: 8,
                  fontSize: 13, outline: "none", boxSizing: "border-box",
                  fontFamily: "inherit", background: "#FAFAFA",
                }}
              />
            </div>

            <div style={{
              maxHeight: 260, overflowY: "auto", border: "1.5px solid #E2E8F0",
              borderRadius: 10, background: "#fff", scrollbarWidth: "thin",
            }}>
              {filteredGroups.length === 0 ? (
                <div style={{ padding: "20px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                  No matching skills found
                </div>
              ) : (
                filteredGroups.map(group => (
                  <div key={group.group}>
                    <div style={{
                      padding: "8px 14px 6px",
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "#475569",
                      background: "#F8FAFC", borderBottom: "1px solid #F1F5F9",
                      position: "sticky", top: 0, zIndex: 1,
                    }}>
                      {group.icon} {group.group}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, padding: "10px 12px 12px" }}>
                      {group.skills.map(skill => {
                        const isSelected = selectedSkills.has(skill);
                        return (
                          <button
                            key={skill}
                            type="button"
                            onClick={() => toggleSkill(skill)}
                            disabled={loading}
                            style={{
                              padding: "5px 12px", borderRadius: 20,
                              border: `1.5px solid ${isSelected ? "#2563EB" : "#CBD5E1"}`,
                              background: isSelected ? "#2563EB" : "#fff",
                              color: isSelected ? "#fff" : "#374151",
                              fontSize: 12, fontWeight: 600, cursor: "pointer",
                              transition: "all 0.15s ease",
                              display: "flex", alignItems: "center", gap: 5,
                              boxShadow: isSelected ? "0 2px 6px rgba(37,99,235,0.3)" : "none",
                            }}
                          >
                            {isSelected && (
                              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {skill}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                type="text"
                placeholder="Add custom skill (press Enter or click +)"
                value={customSkill}
                onChange={e => setCustomSkill(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustomSkill(); } }}
                disabled={loading}
                style={{
                  flex: 1, padding: "9px 12px",
                  border: "1.5px solid #E2E8F0", borderRadius: 8,
                  fontSize: 13, outline: "none", fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                onClick={addCustomSkill}
                disabled={loading || !customSkill.trim()}
                style={{
                  padding: "9px 16px", borderRadius: 8, border: "none",
                  background: customSkill.trim() ? "#2563EB" : "#E2E8F0",
                  color: customSkill.trim() ? "#fff" : "#94A3B8",
                  fontSize: 13, fontWeight: 700, cursor: customSkill.trim() ? "pointer" : "default",
                }}
              >+ Add</button>
            </div>
          </div>

          {/* ── Shift Times — Clock Picker ── */}
          <div style={{ display: "flex", gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>SHIFT START <span className="required">*</span></label>
              <div
                onClick={() => !loading && openTimePicker("shiftStartTime")}
                style={{
                  width: "100%", padding: "9px 12px",
                  border: `1.5px solid ${!formData.shiftStartTime ? "#E2E8F0" : "#BFDBFE"}`,
                  borderRadius: 8, fontSize: 13,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: loading ? "not-allowed" : "pointer",
                  background: loading ? "#F8FAFC" : "#fff",
                  color: formData.shiftStartTime ? "#0F172A" : "#94A3B8",
                  boxSizing: "border-box",
                }}
              >
                <span>{formData.shiftStartTime ? displayTime(formData.shiftStartTime) : "Select start time"}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div className="form-group" style={{ flex: 1 }}>
              <label>SHIFT END <span className="required">*</span></label>
              <div
                onClick={() => !loading && openTimePicker("shiftEndTime")}
                style={{
                  width: "100%", padding: "9px 12px",
                  border: `1.5px solid ${!formData.shiftEndTime ? "#E2E8F0" : "#BFDBFE"}`,
                  borderRadius: 8, fontSize: 13,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: loading ? "not-allowed" : "pointer",
                  background: loading ? "#F8FAFC" : "#fff",
                  color: formData.shiftEndTime ? "#0F172A" : "#94A3B8",
                  boxSizing: "border-box",
                }}
              >
                <span>{formData.shiftEndTime ? displayTime(formData.shiftEndTime) : "Select end time"}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
          </div>

          {/* ── Charge ── */}
          <div className="form-group">
            <label>CHARGE PER SESSION (₹) <span className="required">*</span></label>
            <input type="number" name="charges" placeholder="0"
              value={formData.charges} onChange={handleChange}
              disabled={loading} min="0" step="0.01" />
          </div>

          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="btn-save" disabled={loading}>
              {loading ? "Adding..." : "Add Consultant"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Material Time Picker Portal ── */}
      <MaterialTimePicker
        isOpen={timePickerConfig.isOpen}
        initialTime={timePickerConfig.value}
        onClose={() => setTimePickerConfig({ isOpen: false, field: null, value: "" })}
        onSave={handleTimePickerSave}
      />
    </div>
  );
};

export default AddAdvisor;