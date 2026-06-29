import React, { useCallback, useEffect, useRef, useState } from "react";
import { Clock, X as LucideX, AlertTriangle, CheckCircle, Search, Info, Plus } from "lucide-react";
import { HourRangeClockPicker, formatHourRangeLabel, SimpleHourPicker } from "../pages/timeSlotUtils";
import { createAdvisor, getAllSkills } from "../services/api";

// ─────────────────────────────────────────────────────────────────────────────
// ADD ADVISOR / ADD CONSULTANT MODAL
// Uses HourRangeClockPicker so the admin selects a duration-aware time slot
// that matches the Master Time Slots panel (same clock, same label format).
// ─────────────────────────────────────────────────────────────────────────────

interface AddAdvisorProps {
  onClose: () => void;
  onSave: () => void;
}

const DESIGNATION_OPTIONS = [
  "Financial Consultant", "Wealth Manager", "Tax Advisor",
  "Investment Analyst", "Retirement Planner", "Insurance Advisor",
  "Portfolio Manager", "Estate Planner", "Business Finance Consultant",
];

const SKILL_GROUPS: Record<string, string[]> = {
  "Tax & GST": ["Tax", "GST", "Income Tax", "Tax Filing", "Tax Planning", "International Tax"],
  "Investment & Wealth": ["Equity", "Mutual Funds", "Derivatives", "Portfolio Management", "Wealth Management", "Investment", "Wealth", "Real Estate Investment"],
  "Retirement & Future": ["Retirement", "Retirement Planning", "Pension", "Ulip"],
  "Business & Startup": ["Business Planning", "Startup Finance", "Cash Flow", "Business"],
  "Insurance & Loans": ["Insurance", "Home Loans", "Mortgage"],
};

const inp: React.CSSProperties = {
  width: "100%",
  paddingTop: 12,
  paddingBottom: 12,
  paddingLeft: 16,
  paddingRight: 16,
  border: "1.5px solid #F1F5F9",
  borderRadius: 14,
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: "#F8FAFC",
  color: "#0F172A",
  transition: "all 0.2s ease",
};

const lbl: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  marginBottom: 8,
  marginLeft: 4,
};

const AddAdvisor: React.FC<AddAdvisorProps> = ({ onClose, onSave }) => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    designation: "",
    charges: "",
    skills: [] as string[],
    experience: "",
  });

  // ── Time slot state ───────────────────────────────────────────────────────
  // startHour24: 0-23 selected via the clock
  // durationHours: 1, 2, or 3 selected inside the clock
  const [startHour24, setStartHour24] = useState<number | null>(null);
  const [endHour24, setEndHour24] = useState<number | null>(null);
  const [durationHours, setDurationHours] = useState(1);
  const [clockOpen, setClockOpen] = useState(false);
  const [activeTimeField, setActiveTimeField] = useState<"START" | "END">("START");
  const [isCustomDesignation, setIsCustomDesignation] = useState(false);

  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [skillSearch, setSkillSearch] = useState("");
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [popupType, setPopupType] = useState<"DESIGNATION" | "SKILL" | null>(null);
  const [customValue, setCustomValue] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);
  const loadSkills = useCallback(() => {
    let active = true;
    setSkillsLoading(true);
    getAllSkills()
      .then((items) => {
        if (!active) return;
        const names = Array.from(new Set(
          (Array.isArray(items) ? items : [])
            .map((s: any) => String(s?.skillName || s?.name || s?.title || "").trim())
            .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b));
        setAvailableSkills(names);
      })
      .catch(() => {
        if (active) setAvailableSkills([]);
      })
      .finally(() => {
        if (active) setSkillsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => loadSkills(), [loadSkills]);

  // Build shiftTimings string sent to backend: e.g. "9:00 AM - 11:00 AM"
  const shiftStartTime =
    startHour24 !== null ? `${String(startHour24).padStart(2, "0")}:00:00` : "";
  const shiftEndTime =
    endHour24 !== null ? `${String(endHour24).padStart(2, "0")}:00:00` : "";

  // Label for UI display
  const shiftTimingsLabel = (startHour24 !== null && endHour24 !== null)
    ? `${(startHour24 % 12 || 12)}:00 ${startHour24 >= 12 ? 'PM' : 'AM'} - ${(endHour24 % 12 || 12)}:00 ${endHour24 >= 12 ? 'PM' : 'AM'}`
    : "";

  const toggleSkill = (skill: string) => {
    setForm(f => ({
      ...f,
      skills: f.skills.includes(skill)
        ? f.skills.filter(s => s !== skill)
        : [...f.skills, skill],
    }));
    clearErr("skills");
  };

  const filteredSkills = availableSkills.filter(s =>
    s.toLowerCase().includes(skillSearch.toLowerCase())
  );

  const groupedSkills = React.useMemo(() => {
    const groups: Record<string, string[]> = {};
    const used = new Set<string>();

    Object.entries(SKILL_GROUPS).forEach(([cat, list]) => {
      const match = filteredSkills.filter(s =>
        list.some(keyword => s.toLowerCase().includes(keyword.toLowerCase()))
      );
      if (match.length > 0) {
        groups[cat] = match;
        match.forEach(m => used.add(m));
      }
    });

    const others = filteredSkills.filter(s => !used.has(s));
    if (others.length > 0) groups["Other Skills"] = others;

    return groups;
  }, [filteredSkills]);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email.trim())) e.email = "Invalid email format";
    if (!form.designation) e.designation = "Designation is required";
    if (!form.charges) e.charges = "Consultation fee is required";
    else if (isNaN(Number(form.charges)) || Number(form.charges) < 0) e.charges = "Charges cannot be negative";
    else if (Number(form.charges) === 0) e.charges = "Consultation fee must be greater than 0";
    if (startHour24 === null) e.shiftStart = "Shift start time is required";
    if (endHour24 === null) e.shiftEnd = "Shift end time is required";
    if (!form.experience && form.experience !== "0") e.experience = "Years of experience is required";
    else if (isNaN(Number(form.experience)) || Number(form.experience) < 0) e.experience = "Experience cannot be negative";
    if (form.skills.length === 0) e.skills = "At least one skill is required";
    return e;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSaving(true);
    try {
      await createAdvisor({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        designation: form.designation,
        charges: Number(form.charges),
        shiftTimings: shiftTimingsLabel,
        skills: form.skills,
        shiftStartTime,
        shiftEndTime,
        yearsOfExperience: Number(form.experience),
      } as any);
      onSave();
    } catch (e: any) {
      setFieldErrors({ _submit: e?.response?.data?.message || e?.message || "Failed to add consultant." });
    } finally {
      setSaving(false);
    }
  };

  const clearErr = (key: string) => setFieldErrors(prev => { const n = { ...prev }; delete n[key]; return n; });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1200, backdropFilter: "blur(4px)" }}
      />

      {/* Modal */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 1201,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        pointerEvents: "none",
      }}>
        <div style={{
          background: "#fff", borderRadius: 32, width: "100%", maxWidth: 680,
          maxHeight: "92vh", overflow: "hidden",
          boxShadow: "0 40px 100px rgba(15,23,42,0.25)",
          display: "flex", flexDirection: "column",
          animation: "modalFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
          pointerEvents: "auto", border: "1px solid rgba(255,255,255,0.8)",
        }}>
          {/* Header */}
          <div style={{
            padding: "28px 32px",
            background: "linear-gradient(135deg, #0F766E 0%, #0D9488 100%)",
            color: "#fff", position: "relative",
          }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Add New Consultant</h2>
            <p style={{ margin: "6px 0 0", fontSize: 14, opacity: 0.85, fontWeight: 500 }}>Create a professional profile for a new advisor</p>
            <button onClick={onClose} style={{ position: "absolute", right: 24, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "50%", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff", transition: "all 0.2s" }}>
              <LucideX size={20} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "32px", overflowY: "auto", flex: 1, scrollbarWidth: "thin", display: "flex", flexDirection: "column", gap: 28 }}>
            {fieldErrors._submit && (
              <div style={{
                background: "#FEF2F2", color: "#991B1B", padding: "14px 18px",
                borderRadius: 16, fontSize: 14, fontWeight: 600,
                border: "1px solid #FEE2E2", display: "flex", alignItems: "center", gap: 10,
                animation: "shake 0.4s ease-in-out",
              }}>
                <AlertTriangle size={18} /> {fieldErrors._submit}
              </div>
            )}

            {/* Name + Email */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <label style={lbl}>Full Name *</label>
                <input
                  ref={nameRef}
                  value={form.name}
                  onChange={e => {
                    const val = e.target.value;
                    if (val.length === 1 && /[^a-zA-Z]/.test(val)) return;
                    setForm(f => ({ ...f, name: val }));
                    clearErr("name");
                  }}
                  onBlur={() => { if (!form.name.trim()) setFieldErrors(p => ({ ...p, name: "Name is required" })); }}
                  placeholder="e.g. Dr. Priya Sharma"
                  style={{ ...inp, borderColor: fieldErrors.name ? "#FCA5A5" : undefined }}
                  onFocus={e => e.currentTarget.style.borderColor = "#0F766E"}
                />
                {fieldErrors.name && <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 12, color: "#DC2626", fontWeight: 600 }}><AlertTriangle size={12} />{fieldErrors.name}</div>}
              </div>
              <div>
                <label style={lbl}>Email Address *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => { setForm(f => ({ ...f, email: e.target.value })); clearErr("email"); }}
                  onBlur={() => {
                    if (!form.email.trim()) setFieldErrors(p => ({ ...p, email: "Email is required" }));
                    else if (!/\S+@\S+\.\S+/.test(form.email.trim())) setFieldErrors(p => ({ ...p, email: "Invalid email format" }));
                  }}
                  placeholder="advisor@example.com"
                  style={{ ...inp, borderColor: fieldErrors.email ? "#FCA5A5" : undefined }}
                  onFocus={e => e.currentTarget.style.borderColor = "#0F766E"}
                />
                {fieldErrors.email && <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 12, color: "#DC2626", fontWeight: 600 }}><AlertTriangle size={12} />{fieldErrors.email}</div>}
              </div>
            </div>

            {/* Designation + Fee */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <label style={{ ...lbl, margin: 0 }}>Designation *</label>
                  <button
                    type="button"
                    onClick={() => setPopupType("DESIGNATION")}
                    style={{
                      border: "none", background: "rgba(15,118,110,0.08)", color: "#0F766E",
                      padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 800,
                      cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(15,118,110,0.15)"}
                    onMouseLeave={e => e.currentTarget.style.background = "rgba(15,118,110,0.08)"}
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <select
                    value={form.designation}
                    onChange={(e) => { setForm(prev => ({ ...prev, designation: e.target.value })); clearErr("designation"); }}
                    style={{ ...inp, color: form.designation ? "#0F172A" : "#94A3B8", borderColor: fieldErrors.designation ? "#FCA5A5" : undefined }}
                    onFocus={e => e.currentTarget.style.borderColor = "#0F766E"}
                    onBlur={e => e.currentTarget.style.borderColor = "#F1F5F9"}
                  >
                    <option value="">Select designation...</option>
                    {DESIGNATION_OPTIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                    {form.designation && !DESIGNATION_OPTIONS.includes(form.designation) && (
                      <option value={form.designation}>{form.designation}</option>
                    )}
                  </select>
                  {fieldErrors.designation && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#DC2626", fontWeight: 600 }}><AlertTriangle size={12} />{fieldErrors.designation}</div>}
                </div>
              </div>
              <div>
                <label style={lbl}>Consultation Fee *</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    name="charges"
                    placeholder="e.g. 1500"
                    value={form.charges}
                    onChange={e => { setForm(f => ({ ...f, charges: e.target.value })); clearErr("charges"); }}
                    onBlur={() => {
                      if (!form.charges) setFieldErrors(p => ({ ...p, charges: "Consultation fee is required" }));
                      else if (Number(form.charges) < 0) setFieldErrors(p => ({ ...p, charges: "Charges cannot be negative" }));
                    }}
                    style={{ ...inp, paddingLeft: 40, borderColor: fieldErrors.charges ? "#FCA5A5" : undefined }}
                    onFocus={e => e.currentTarget.style.borderColor = "#0F766E"}
                  />
                  <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 700, color: "#64748B" }}>₹</span>
                </div>
                {fieldErrors.charges && <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 12, color: "#DC2626", fontWeight: 600 }}><AlertTriangle size={12} />{fieldErrors.charges}</div>}
                {!fieldErrors.charges && form.charges && Number(form.charges) > 0 && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#16A34A", fontWeight: 700, marginLeft: 4 }}>
                    ✓ Customer sees: ₹{(Number(form.charges) + 200).toLocaleString("en-IN")}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label style={lbl}>Years of Experience *</label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 8"
                value={form.experience}
                onChange={e => { setForm(f => ({ ...f, experience: e.target.value })); clearErr("experience"); }}
                onBlur={() => {
                  if (!form.experience && form.experience !== "0") setFieldErrors(p => ({ ...p, experience: "Years of experience is required" }));
                  else if (Number(form.experience) < 0) setFieldErrors(p => ({ ...p, experience: "Experience cannot be negative" }));
                }}
                style={{ ...inp, borderColor: fieldErrors.experience ? "#FCA5A5" : undefined }}
                onFocus={e => e.currentTarget.style.borderColor = "#0F766E"}
              />
              {fieldErrors.experience && <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, fontSize: 12, color: "#DC2626", fontWeight: 600 }}><AlertTriangle size={12} />{fieldErrors.experience}</div>}
            </div>

            {/* Availability Section */}
            <div style={{ background: "#F8FAFC", padding: "24px", borderRadius: 24, border: "1px solid #F1F5F9" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <label style={{ ...lbl, margin: 0 }}>Availability Window</label>
                <div style={{ display: "flex", background: "#fff", padding: 4, borderRadius: 12, border: "1px solid #E2E8F0" }}>
                  {[1, 2, 3].map(h => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setDurationHours(h);
                        setStartHour24(null);
                        setEndHour24(null);
                      }}
                      style={{
                        padding: "6px 16px", borderRadius: 9, border: "none", fontSize: 13, fontWeight: 700,
                        cursor: "pointer", transition: "all 0.2s",
                        background: durationHours === h ? "#0F766E" : "transparent",
                        color: durationHours === h ? "#fff" : "#64748B",
                      }}
                    >
                      {h} hr
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "#64748B", fontWeight: 800, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Start Time</div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTimeField("START");
                      setClockOpen(true);
                    }}
                    style={{
                      width: "100%", padding: "14px 18px", borderRadius: 14,
                      border: "1.5px solid #E2E8F0",
                      background: "#fff",
                      color: startHour24 !== null ? "#0F172A" : "#94A3B8",
                      fontSize: 15, fontWeight: 600, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#0F766E"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#E2E8F0"}
                  >
                    <span>{startHour24 !== null ? (startHour24 % 12 || 12) + ":00 " + (startHour24 >= 12 ? "PM" : "AM") : "Select start"}</span>
                    <Clock size={18} color="#94A3B8" />
                  </button>
                </div>

                <div>
                  <div style={{ fontSize: 11, color: "#64748B", fontWeight: 800, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>End Time</div>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTimeField("END");
                      setClockOpen(true);
                    }}
                    style={{
                      width: "100%", padding: "14px 18px", borderRadius: 14,
                      border: "1.5px solid #E2E8F0",
                      background: "#fff",
                      color: endHour24 !== null ? "#0F172A" : "#94A3B8",
                      fontSize: 15, fontWeight: 600, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = "#0F766E"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = "#E2E8F0"}
                  >
                    <span>{endHour24 !== null ? (endHour24 % 12 || 12) + ":00 " + (endHour24 >= 12 ? "PM" : "AM") : "Select end"}</span>
                    <Clock size={18} color="#94A3B8" />
                  </button>
                </div>
              </div>

              {startHour24 !== null && endHour24 !== null && (
                <div style={{ marginTop: 12, padding: "10px 14px", background: "#ECFEFF", borderRadius: 12, color: "#0F766E", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                  <CheckCircle size={16} /> Selected shift: {shiftTimingsLabel}
                </div>
              )}
              {(fieldErrors.shiftStart || fieldErrors.shiftEnd) && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 10, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                  <AlertTriangle size={12} />{fieldErrors.shiftStart || fieldErrors.shiftEnd}
                </div>
              )}
            </div>

            {/* Skills Section */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ ...lbl, margin: 0 }}>Skills & Expertise ({form.skills.length})</label>
                {fieldErrors.skills && <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#DC2626", fontWeight: 600 }}><AlertTriangle size={12} />{fieldErrors.skills}</div>}
                <button
                  type="button"
                  onClick={() => setPopupType("SKILL")}
                  style={{
                    border: "none", background: "rgba(15,118,110,0.08)", color: "#0F766E",
                    padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 800,
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s"
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(15,118,110,0.15)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(15,118,110,0.08)"}
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              <div style={{ position: "relative", marginBottom: 12 }}>
                <Search style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} size={16} />
                <input
                  type="text"
                  placeholder="Search and add skills..."
                  value={skillSearch}
                  onChange={e => setSkillSearch(e.target.value)}
                  style={{ ...inp, paddingLeft: 42 }}
                />
              </div>

              {form.skills.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {form.skills.map(s => (
                    <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#0F766E", color: "#fff", padding: "6px 12px", borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
                      {s}
                      <LucideX size={14} style={{ cursor: "pointer", opacity: 0.8 }} onClick={() => toggleSkill(s)} />
                    </span>
                  ))}
                </div>
              )}

              <div style={{ maxHeight: 220, overflowY: "auto", padding: "4px", scrollbarWidth: "thin" }}>
                {Object.entries(groupedSkills).map(([category, skills]) => (
                  <div key={category} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#CBD5E1" }} />
                      {category}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {skills.map(s => {
                        const active = form.skills.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => toggleSkill(s)}
                            style={{
                              padding: "6px 14px", borderRadius: 10, border: active ? "1.5px solid #0F766E" : "1.5px solid #E2E8F0",
                              background: active ? "#ECFEFF" : "#fff",
                              color: active ? "#0F766E" : "#475569",
                              fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
                            }}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {Object.keys(groupedSkills).length === 0 && (
                  <div style={{ textAlign: "center", padding: "20px 0", color: "#94A3B8", fontSize: 13 }}>
                    No skills found matching your search.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "24px 32px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 12, background: "#fff" }}>
            <button onClick={onClose} style={{ flex: 1, padding: "14px", borderRadius: 16, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 15, fontWeight: 800, cursor: "pointer", transition: "all 0.2s" }}>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 2, padding: "14px", borderRadius: 16, border: "none",
                background: saving ? "#E2E8F0" : "linear-gradient(135deg, #0F766E 0%, #0D9488 100%)",
                color: saving ? "#94A3B8" : "#fff", fontSize: 15, fontWeight: 800,
                cursor: saving ? "not-allowed" : "pointer",
                boxShadow: saving ? "none" : "0 10px 25px rgba(15,118,110,0.25)",
                transition: "all 0.2s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {saving ? <div style={{ width: 18, height: 18, border: "3px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> : <CheckCircle size={18} />}
              {saving ? "Creating Profile..." : "Register Consultant"}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Custom Popup for Designation or Skill */}
      {popupType && (
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.4)", zIndex: 1300, backdropFilter: "blur(2px)" }}
            onClick={() => { setPopupType(null); setCustomValue(""); }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            background: "#fff", borderRadius: 24, width: "90%", maxWidth: 400,
            padding: 28, zIndex: 1301, boxShadow: "0 20px 50px rgba(15,23,42,0.3)",
            animation: "modalFadeIn 0.3s ease-out"
          }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 800 }}>
              {popupType === "DESIGNATION" ? "Add Designation" : "Add Custom Skill"}
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#64748B" }}>
              {popupType === "DESIGNATION"
                ? "Manually enter a custom role for this consultant."
                : "Enter a new skill or area of expertise."}
            </p>
            <input
              autoFocus
              value={customValue}
              onChange={e => setCustomValue(e.target.value)}
              placeholder={popupType === "DESIGNATION" ? "e.g. Senior Wealth Strategist" : "e.g. Crypto Taxation"}
              style={inp}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button
                onClick={() => { setPopupType(null); setCustomValue(""); }}
                style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontWeight: 700, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (customValue.trim()) {
                    const val = customValue.trim();
                    if (popupType === "DESIGNATION") {
                      setForm(f => ({ ...f, designation: val }));
                    } else {
                      // Add to available skills if not there
                      if (!availableSkills.includes(val)) {
                        setAvailableSkills(prev => [val, ...prev]);
                      }
                      // Select it
                      if (!form.skills.includes(val)) {
                        setForm(f => ({ ...f, skills: [...f.skills, val] }));
                      }
                    }
                    setPopupType(null);
                    setCustomValue("");
                  }
                }}
                disabled={!customValue.trim()}
                style={{
                  flex: 1, padding: "12px", borderRadius: 12, border: "none",
                  background: customValue.trim() ? "#0F766E" : "#E2E8F0",
                  color: "#fff", fontWeight: 700, cursor: customValue.trim() ? "pointer" : "not-allowed"
                }}
              >
                {popupType === "DESIGNATION" ? "Add Role" : "Add Skill"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* SimpleHourPicker for independent fields */}
      <SimpleHourPicker
        isOpen={clockOpen}
        title={activeTimeField === "START" ? "Select Start Time" : "Select End Time"}
        initialHour={activeTimeField === "START" ? startHour24 : endHour24}
        durationHours={durationHours}
        isEnd={activeTimeField === "END"}
        onClose={() => setClockOpen(false)}
        onSave={(hour) => {
          if (activeTimeField === "START") setStartHour24(hour);
          else setEndHour24(hour);
          setClockOpen(false);
        }}
      />
    </>
  );
};

export default AddAdvisor;