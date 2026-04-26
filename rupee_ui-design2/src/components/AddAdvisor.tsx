import React, { useCallback, useEffect, useRef, useState } from "react";
import { createAdvisor } from "../services/Addadvisor";
import { getAllSkills } from "../services/api";
import { HourRangeClockPicker, formatHourRangeLabel } from "../pages/timeSlotUtils";

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

const inp: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1.5px solid #E2E8F0",
  borderRadius: 9,
  fontSize: 13,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "inherit",
  background: "#fff",
  color: "#0F172A",
};

const lbl: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#64748B",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 5,
};

const AddAdvisor: React.FC<AddAdvisorProps> = ({ onClose, onSave }) => {
  const [form, setForm] = useState({
    name: "",
    email: "",
    designation: "",
    charges: "",
    skills: [] as string[],
  });

  // ── Time slot state ───────────────────────────────────────────────────────
  // startHour24: 0-23 selected via the clock
  // durationHours: 1, 2, or 3 selected inside the clock
  const [startHour24, setStartHour24] = useState<number | null>(null);
  const [durationHours, setDurationHours] = useState(1);
  const [clockOpen, setClockOpen] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skillSearch, setSkillSearch] = useState("");
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);

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
  const shiftTimingsLabel = startHour24 !== null
    ? (durationHours === 24 ? "12:00 AM - 11:59 PM" : formatHourRangeLabel(startHour24, durationHours))
    : "";
  const shiftStartTime =
    startHour24 !== null ? `${String(startHour24).padStart(2, "0")}:00:00` : "";
  const shiftEndTime =
    startHour24 !== null
      ? (durationHours === 24
        ? "23:59:00"
        : `${String((startHour24 + durationHours) % 24).padStart(2, "0")}:00:00`)
      : "";

  const toggleSkill = (skill: string) => {
    setForm(f => ({
      ...f,
      skills: f.skills.includes(skill)
        ? f.skills.filter(s => s !== skill)
        : [...f.skills, skill],
    }));
  };

  const filteredSkills = availableSkills.filter(s =>
    s.toLowerCase().includes(skillSearch.toLowerCase())
  );

  const validate = (): string | null => {
    if (!form.name.trim()) return "Full name is required.";
    if (!/\S+@\S+\.\S+/.test(form.email.trim())) return "Valid email required.";
    if (!form.designation) return "Designation is required.";
    if (!form.charges || isNaN(Number(form.charges)) || Number(form.charges) <= 0)
      return "Consultation fee must be greater than 0.";
    if (startHour24 === null) return "Please select an availability slot.";
    if (form.skills.length === 0) return "Select at least one skill.";
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) { setError(err); return; }
    setSaving(true); setError(null);
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
      });
      onSave();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Failed to add consultant.");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = !validate() && !saving;

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
      }}>
        <div style={{
          background: "#fff", borderRadius: 20, width: "100%", maxWidth: 600,
          maxHeight: "92vh", overflowY: "auto",
          boxShadow: "0 32px 80px rgba(15,23,42,0.28)",
          display: "flex", flexDirection: "column",
        }}>
          {/* Header */}
          <div style={{ padding: "22px 28px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0F172A" }}>Add Consultant</h2>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748B" }}>Register a new consultant with availability and skills</p>
            </div>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: "50%", border: "1.5px solid #E2E8F0", background: "#F8FAFC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
              ✕
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 18, flex: 1 }}>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 13, fontWeight: 600 }}>
                {error}
              </div>
            )}

            {/* Name + Email */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={lbl}>Full Name *</label>
                <input
                  ref={nameRef}
                  value={form.name}
                  onChange={e => {
                    const val = e.target.value;
                    // Block numbers and special chars as first character
                    if (val.length === 1 && /[^a-zA-Z]/.test(val)) return;
                    setForm(f => ({ ...f, name: val }));
                  }}
                  placeholder="e.g. Priya Sharma"
                  style={inp}
                />
              </div>
              <div>
                <label style={lbl}>Email Address *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="consultant@example.com"
                  style={inp}
                />
              </div>
            </div>

            {/* Designation + Fee */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={lbl}>Designation *</label>
                <select
                  value={form.designation}
                  onChange={e => setForm(f => ({ ...f, designation: e.target.value }))}
                  style={{ ...inp, color: form.designation ? "#0F172A" : "#94A3B8" }}
                >
                  <option value="">Select designation...</option>
                  {DESIGNATION_OPTIONS.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Consultation Fee (₹) *</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "#64748B" }}>₹</span>
                  <input
                    type="number"
                    min="0"
                    value={form.charges}
                    onChange={e => setForm(f => ({ ...f, charges: e.target.value }))}
                    placeholder="e.g. 1500"
                    style={{ ...inp, paddingLeft: 28 }}
                  />
                </div>
                {form.charges && Number(form.charges) > 0 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: "#16A34A", fontWeight: 600 }}>
                    ✓ Customer sees: ₹{(Number(form.charges) + 200).toLocaleString("en-IN")}
                  </div>
                )}
              </div>
            </div>

            {/* ── Availability Slot - HourRangeClockPicker ── */}
            <div>
              <label style={lbl}>Availability Slot *</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {/* Duration selector */}
                <div style={{ display: "flex", gap: 8 }}>
                  {[1, 2, 3, 24].map(hrs => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => {
                        setDurationHours(hrs);
                        if (hrs === 24) {
                          setStartHour24(0);
                        } else {
                          setStartHour24(null);
                        }
                      }}
                      style={{
                        padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 800,
                        border: `1.5px solid ${durationHours === hrs ? "#0F766E" : "#CBD5E1"}`,
                        background: durationHours === hrs ? "#ECFEFF" : "#fff",
                        color: durationHours === hrs ? "#0F766E" : "#334155",
                        cursor: "pointer",
                      }}
                    >
                      {hrs === 24 ? "24 hrs" : `${hrs} hr`}
                    </button>
                  ))}
                </div>

                {/* Clock picker trigger */}
                <button
                  type="button"
                  onClick={() => {
                    if (durationHours === 24) return;
                    setClockOpen(true);
                  }}
                  disabled={durationHours === 24}
                  style={{
                    flex: 1, minWidth: 180, padding: "9px 14px", borderRadius: 9,
                    border: `1.5px solid ${startHour24 !== null ? "#0F766E" : "#E2E8F0"}`,
                    background: "#fff",
                    color: startHour24 !== null ? "#0F172A" : "#94A3B8",
                    fontSize: 13, fontWeight: 600, cursor: durationHours === 24 ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                    opacity: durationHours === 24 ? 0.75 : 1,
                  }}
                >
                  <span>
                    {durationHours === 24
                      ? "12:00 AM - 11:59 PM (24 hours)"
                      : startHour24 !== null
                      ? formatHourRangeLabel(startHour24, durationHours)
                      : `Pick a ${durationHours}-hour slot`}
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {startHour24 !== null && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#0F766E", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                  ✓ Selected: {durationHours === 24 ? "12:00 AM - 11:59 PM (24 hours)" : formatHourRangeLabel(startHour24, durationHours)}
                </div>
              )}
            </div>

            {/* Skills */}
            <div>
              <label style={lbl}>Skills / Expertise * ({form.skills.length} selected)</label>
              <div style={{ fontSize: 11, color: "#64748B", marginBottom: 8 }}>
                {skillsLoading ? "Loading latest skills..." : "Skills are synced from Skills & Questions."}
              </div>
              <input
                value={skillSearch}
                onChange={e => setSkillSearch(e.target.value)}
                placeholder="Search skills..."
                style={{ ...inp, marginBottom: 10 }}
              />
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 8, maxHeight: 180, overflowY: "auto",
                background: "#F8FAFC", borderRadius: 12, padding: "12px 14px",
                border: "1.5px solid #E2E8F0",
              }}>
                {!skillsLoading && availableSkills.length === 0 && (
                  <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#94A3B8", fontSize: 12, padding: 8 }}>
                    No skills configured yet. Add skills in Skills & Questions first.
                  </div>
                )}
                {filteredSkills.map(skill => {
                  const active = form.skills.includes(skill);
                  return (
                    <label key={skill} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 10px", borderRadius: 8, cursor: "pointer",
                      background: active ? "#ECFEFF" : "#fff",
                      border: `1.5px solid ${active ? "#0F766E" : "#E2E8F0"}`,
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      color: active ? "#0F766E" : "#374151",
                      transition: "all 0.12s",
                    }}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleSkill(skill)}
                        style={{ display: "none" }}
                      />
                      <span style={{
                        width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${active ? "#0F766E" : "#CBD5E1"}`,
                        background: active ? "#0F766E" : "#fff", flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {active && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>}
                      </span>
                      {skill}
                    </label>
                  );
                })}
                {availableSkills.length > 0 && filteredSkills.length === 0 && (
                  <div style={{ gridColumn: "1/-1", textAlign: "center", color: "#94A3B8", fontSize: 12, padding: 8 }}>
                    {`No skills match "${skillSearch}"`}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "16px 28px 22px", borderTop: "1px solid #F1F5F9", display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
            <button
              onClick={onClose}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSubmit}
              style={{
                padding: "10px 26px", borderRadius: 10, border: "none",
                background: canSubmit ? (saving ? "#99F6E4" : "linear-gradient(135deg,#0F766E,#0D9488)") : "#E2E8F0",
                color: canSubmit ? "#fff" : "#94A3B8", fontSize: 13, fontWeight: 700,
                cursor: canSubmit ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: 8,
              }}
            >
              {saving ? (
                <>
                  <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                  Adding...
                </>
              ) : "Add Consultant"}
            </button>
          </div>
        </div>
      </div>

      {/* HourRangeClock Picker */}
      <HourRangeClockPicker
        isOpen={clockOpen}
        title={`Select ${durationHours}-Hour Slot`}
        initialHour={startHour24}
        initialDuration={durationHours}
        onClose={() => setClockOpen(false)}
        onSave={(hour, dur) => {
          setStartHour24(hour);
          setDurationHours(dur);
          setClockOpen(false);
        }}
      />
    </>
  );
};

export default AddAdvisor;
