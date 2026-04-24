import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../config/api";
import { getAllSkills, getToken } from "../services/api";
import {
  canonicalTextKey,
  capitalizeFirstCharacter,
  formatIndianCurrency,
  formatNameLikeInput,
  formatNameLikeValue,
  sanitizeDecimalInput,
  startsWithNumber,
} from "../utils/formUtils";

interface AddAdvisorProps {
  onClose: () => void;
  onSave: (advisorData: any) => void;
}

type SkillGroup = { group: string; icon: string; skills: string[] };

// ─── Predefined skill options grouped by category ───────────────────────────
const SKILL_GROUPS: SkillGroup[] = [
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

const DEFAULT_SKILL_GROUPS: SkillGroup[] = SKILL_GROUPS.map((group) => ({
  ...group,
  skills: group.skills.map((skill) => formatNameLikeValue(skill)),
}));

const getAvailableSkillGroups = (records: any[]): { groups: SkillGroup[]; label: string } => {
  const dbSkills = Array.from(new Map(
    (Array.isArray(records) ? records : [])
      .map((item: any) => formatNameLikeValue(item?.name || item?.skillName || ""))
      .filter(Boolean)
      .map((skill) => [canonicalTextKey(skill), skill]),
  ).values()).sort((a, b) => a.localeCompare(b));

  const existingSkillKeys = new Set(
    DEFAULT_SKILL_GROUPS.flatMap((group) => group.skills.map((skill) => canonicalTextKey(skill))),
  );
  const additionalSkills = dbSkills.filter((skill) => !existingSkillKeys.has(canonicalTextKey(skill)));
  const groups = additionalSkills.length > 0
    ? [
      ...DEFAULT_SKILL_GROUPS,
      {
        group: "Skills & Questions",
        icon: "✨",
        skills: additionalSkills,
      },
    ]
    : DEFAULT_SKILL_GROUPS;

  return {
    groups,
    label: additionalSkills.length > 0 ? "Default + Skills & Questions" : "Default skill set",
  };
};

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
    description: "",
    shiftStartTime: "",
    shiftEndTime: "",
    slotsDurationHours: "1",
    charges: "",
    yearsOfExperience: "",  // ADDED
  });

  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [customSkill, setCustomSkill] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [availableSkillGroups, setAvailableSkillGroups] = useState(DEFAULT_SKILL_GROUPS);
  const [skillsSourceLabel, setSkillsSourceLabel] = useState("Default skill set");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

  // ── Time picker state ──────────────────────────────────────────────────────
  const [timePickerConfig, setTimePickerConfig] = useState<{
    isOpen: boolean;
    field: "shiftStartTime" | "shiftEndTime" | null;
    value: string;
  }>({ isOpen: false, field: null, value: "" });

  const openTimePicker = (field: "shiftStartTime" | "shiftEndTime") => {
    setTouchedFields(prev => ({ ...prev, [field]: true }));
    setTimePickerConfig({ isOpen: true, field, value: formData[field] });
  };

  useEffect(() => {
    let active = true;
    getAllSkills()
      .then((records: any[]) => {
        if (!active) return;
        const { groups, label } = getAvailableSkillGroups(records);
        setAvailableSkillGroups(groups);
        setSkillsSourceLabel(label);
      })
      .catch(() => {
        if (!active) return;
        setAvailableSkillGroups(DEFAULT_SKILL_GROUPS);
        setSkillsSourceLabel("Default skill set");
      });

    return () => {
      active = false;
    };
  }, []);

  const clearFieldError = (field: string) => {
    setFieldErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const getClientValidationErrors = () => {
    const nextErrors: Record<string, string> = {};

    const name = formData.name.trim();
    const email = formData.email.trim().toLowerCase();
    const designation = formData.designation.trim();
    const yearsOfExperience = Number(formData.yearsOfExperience);
    const charges = Number(formData.charges);
    const duration = Number(formData.slotsDurationHours);

    if (!name) nextErrors.name = "Name is required.";
    else if (startsWithNumber(name)) nextErrors.name = "Name cannot start with a number.";
    else if (name.length < 2) nextErrors.name = "Enter the consultant's full name.";

    if (!email) nextErrors.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) nextErrors.email = "Enter a valid email address.";

    if (!designation) nextErrors.designation = "Designation is required.";
    else if (startsWithNumber(designation)) nextErrors.designation = "Designation cannot start with a number.";
    else if (designation.length < 2) nextErrors.designation = "Enter a valid designation.";

    if (selectedSkills.size === 0) nextErrors.skills = "Select at least one skill.";

    if (!formData.shiftStartTime) nextErrors.shiftStartTime = "Availability start time is required.";
    if (!formData.shiftEndTime) nextErrors.shiftEndTime = "Availability end time is required.";
    if (
      formData.shiftStartTime &&
      formData.shiftEndTime &&
      formData.shiftStartTime !== formData.shiftEndTime &&
      formData.shiftEndTime <= formData.shiftStartTime
    ) {
      nextErrors.shiftEndTime = "Availability end time must be after the start time.";
    }

    if (!formData.slotsDurationHours) nextErrors.slotsDurationHours = "Session duration is required.";
    else if (Number.isNaN(duration) || duration <= 0) nextErrors.slotsDurationHours = "Select a valid session duration.";

    if (!formData.charges) nextErrors.charges = "Base charge is required.";
    else if (Number.isNaN(charges) || charges <= 0) nextErrors.charges = "Enter a valid charge amount.";
    else if (charges > 100000) nextErrors.charges = "Base charge cannot exceed ₹1,00,000.";

    if (!formData.yearsOfExperience) nextErrors.yearsOfExperience = "Years of experience is required.";
    else if (Number.isNaN(yearsOfExperience) || yearsOfExperience < 0) nextErrors.yearsOfExperience = "Enter valid years of experience.";
    else if (yearsOfExperience > 60) nextErrors.yearsOfExperience = "Years of experience cannot exceed 60.";

    return nextErrors;
  };

  const liveErrors = React.useMemo(() => getClientValidationErrors(), [formData, selectedSkills]);
  const displayErrors = React.useMemo(() => {
    const touchedLive: Record<string, string> = {};
    Object.entries(liveErrors).forEach(([key, message]) => {
      if (touchedFields[key]) touchedLive[key] = message;
    });
    return { ...touchedLive, ...fieldErrors };
  }, [fieldErrors, liveErrors, touchedFields]);

  const isFormReady = React.useMemo(() => Object.keys(liveErrors).length === 0, [liveErrors]);

  const inputErrorStyle = (field: string, defaultBorder = "#E2E8F0"): React.CSSProperties => ({
    border: `1.5px solid ${displayErrors[field] ? "#FCA5A5" : defaultBorder}`,
    background: displayErrors[field] ? "#FFF7F7" : "#fff",
  });

  const fieldErrorStyle: React.CSSProperties = {
    fontSize: 11,
    color: "#DC2626",
    fontWeight: 600,
    marginTop: 4,
  };

  const handleTimePickerSave = (time24h: string) => {
    if (timePickerConfig.field) {
      setFormData(prev => ({ ...prev, [timePickerConfig.field!]: time24h }));
      setTouchedFields(prev => ({ ...prev, [timePickerConfig.field!]: true }));
      clearFieldError(timePickerConfig.field);
      if (error) setError("");
    }
    setTimePickerConfig({ isOpen: false, field: null, value: "" });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    let nextValue = value;

    if (name === "name" || name === "designation") nextValue = formatNameLikeInput(value);
    if (name === "description") nextValue = capitalizeFirstCharacter(value);
    if (name === "email") nextValue = value.trimStart().toLowerCase();
    if (name === "charges") nextValue = sanitizeDecimalInput(value, 100000, 2);
    if (name === "yearsOfExperience") nextValue = sanitizeDecimalInput(value, 60, 1);

    setFormData({ ...formData, [name]: nextValue });
    setTouchedFields(prev => ({ ...prev, [name]: true }));
    clearFieldError(name);
    if (error) setError("");
  };

  const toggleSkill = (skill: string) => {
    setTouchedFields(prev => ({ ...prev, skills: true }));
    setSelectedSkills(prev => {
      const next = new Set(prev);
      const normalizedSkill = formatNameLikeValue(skill);
      const existing = [...next].find((item) => canonicalTextKey(item) === canonicalTextKey(normalizedSkill));
      if (existing) next.delete(existing);
      else next.add(normalizedSkill);
      return next;
    });
    clearFieldError("skills");
    if (error) setError("");
  };

  const addCustomSkill = () => {
    setTouchedFields(prev => ({ ...prev, skills: true }));
    const trimmed = customSkill.trim();
    if (!trimmed) return;
    const parsedSkills = trimmed
      .split(",")
      .map((skill) => formatNameLikeValue(skill))
      .filter(Boolean);

    setSelectedSkills((prev) => {
      const next = new Set(prev);
      let duplicateFound = false;
      parsedSkills.forEach((skill) => {
        const exists = [...next].some((item) => canonicalTextKey(item) === canonicalTextKey(skill));
        if (exists) {
          duplicateFound = true;
          return;
        }
        next.add(skill);
      });
      if (duplicateFound) setError("Duplicate skills are not allowed.");
      return next;
    });
    setCustomSkill("");
    clearFieldError("skills");
    if (error && error !== "Duplicate skills are not allowed.") setError("");
  };

  const removeSkill = (skill: string) => {
    setTouchedFields(prev => ({ ...prev, skills: true }));
    setSelectedSkills(prev => { const n = new Set(prev); n.delete(skill); return n; });
  };

  const filteredGroups = availableSkillGroups.map(g => ({
    ...g,
    skills: g.skills.filter(s => !skillSearch || s.toLowerCase().includes(skillSearch.toLowerCase())),
  })).filter(g => g.skills.length > 0);

  const validateForm = () => {
    const nextErrors = getClientValidationErrors();
    setTouchedFields(prev => ({
      ...prev,
      name: true,
      email: true,
      designation: true,
      skills: true,
      shiftStartTime: true,
      shiftEndTime: true,
      slotsDurationHours: true,
      charges: true,
      yearsOfExperience: true,
    }));
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      setError("Please fill all required consultant details.");
      return;
    }

    setLoading(true); setError("");

    try {
      const toLocalTime = (t: string) => t.length === 5 ? `${t}:00` : t;

      const consultantPayload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        designation: formData.designation.trim(),
        charges: parseFloat(formData.charges),
        yearsOfExperience: parseFloat(formData.yearsOfExperience),  // ADDED
        skills: [...selectedSkills],
        shiftStartTime: toLocalTime(formData.shiftStartTime),
        shiftEndTime: toLocalTime(formData.shiftEndTime),
        slotsDuration: Number(formData.slotsDurationHours) * 60,
        ...(formData.description.trim() ? { description: formData.description.trim() } : {}),
      };

      const fd = new FormData();
      fd.append("data", new Blob([JSON.stringify(consultantPayload)], { type: "application/json" }));

      const BASE_URL_ADVISOR = API_BASE_URL;
      const token = getToken();
      const response = await fetch(`${BASE_URL_ADVISOR}/consultants`, {
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
          const normalizedFieldErrors = Object.entries(data.fieldErrors).reduce<Record<string, string>>((acc, [field, message]) => {
            const mappedField = ({
              slotDuration: "slotsDurationHours",
              slotsDuration: "slotsDurationHours",
              shiftStart: "shiftStartTime",
              shiftEnd: "shiftEndTime",
              experience: "yearsOfExperience",
            } as Record<string, string>)[field] || field;
            acc[mappedField] = String(message);
            return acc;
          }, {});
          setFieldErrors(normalizedFieldErrors);
          setError("Please fix the highlighted consultant details.");
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
        <div className="advisor-card-header">
          <h1 className="advisor-brand-title">MEET THE MASTERS</h1>
          <p className="advisor-brand-subtitle">ADD NEW CONSULTANT</p>
        </div>

        {error && <div className="advisor-error-message">{error}</div>}

        <form className="advisor-form" onSubmit={handleSubmit}>

          {/* ── Basic Info ── */}
          <div className="advisor-form-group">
            <label>FULL NAME <span className="advisor-required">*</span></label>
            <input type="text" name="name" placeholder="Enter consultant name"
              value={formData.name} onChange={handleChange} disabled={loading}
              style={inputErrorStyle("name")} />
            {displayErrors.name && <div style={fieldErrorStyle}>{displayErrors.name}</div>}
          </div>

          <div className="advisor-form-group">
            <label>EMAIL (LOGIN ID) <span className="advisor-required">*</span></label>
            <input type="email" name="email" placeholder="e.g. name@meetthemasters.com"
              value={formData.email} onChange={handleChange} disabled={loading}
              style={inputErrorStyle("email")} />
            {displayErrors.email && <div style={fieldErrorStyle}>{displayErrors.email}</div>}
          </div>

          {/* ── Designation + Experience side by side ── */}
          <div style={{ display: "flex", gap: 12 }}>
            <div className="advisor-form-group" style={{ flex: 2 }}>
              <label>DESIGNATION <span className="advisor-required">*</span></label>
              <input type="text" name="designation" placeholder="e.g. Senior Tax Consultant"
                value={formData.designation} onChange={handleChange} disabled={loading}
                style={inputErrorStyle("designation")} />
              {displayErrors.designation && <div style={fieldErrorStyle}>{displayErrors.designation}</div>}
            </div>
            <div className="advisor-form-group" style={{ flex: 1 }}>
              <label>EXP. (YEARS) <span className="advisor-required">*</span></label>
              <input
                type="text"
                name="yearsOfExperience"
                placeholder="e.g. 5.5"
                value={formData.yearsOfExperience}
                onChange={handleChange}
                disabled={loading}
                inputMode="decimal"
                style={inputErrorStyle("yearsOfExperience")}
              />
              {displayErrors.yearsOfExperience && <div style={fieldErrorStyle}>{displayErrors.yearsOfExperience}</div>}
            </div>
          </div>

          <div className="advisor-form-group">
            <label>PROFILE DESCRIPTION <span style={{ fontSize: 11, fontWeight: 500, color: "#64748B", marginLeft: 8, textTransform: "none" }}>(Optional)</span></label>
            <textarea
              name="description"
              placeholder="Short consultant introduction shown on profile and booking screens"
              value={formData.description}
              onChange={handleChange}
              disabled={loading}
              rows={4}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1.5px solid #E2E8F0",
                borderRadius: 8,
                fontSize: 13,
                outline: "none",
                boxSizing: "border-box",
                resize: "vertical",
                fontFamily: "inherit",
                background: "#fff",
              }}
            />
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
              This description will be visible to users on consultant profile and booking screens.
            </div>
          </div>

          {/* ── Skill Selector ── */}
          <div className="advisor-form-group">
            <label>
              SKILL SET <span className="advisor-required">*</span>
              <span style={{ fontSize: 11, fontWeight: 400, color: "#64748B", marginLeft: 8, textTransform: "none" }}>
                Click to select · {selectedSkills.size} selected · {skillsSourceLabel}
              </span>
            </label>

            {selectedSkills.size > 0 && (
              <div style={{
                display: "flex", flexWrap: "wrap", gap: 6,
                marginBottom: 10, padding: "10px 12px",
                background: "#ECFEFF", borderRadius: 10,
                border: `1.5px solid ${displayErrors.skills ? "#FCA5A5" : "#A5F3FC"}`, minHeight: 42,
              }}>
                {[...selectedSkills].map(skill => (
                  <span key={skill} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 20,
                    background: "#0F766E", color: "#fff",
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
                              border: `1.5px solid ${isSelected ? "#0F766E" : "#CBD5E1"}`,
                              background: isSelected ? "#0F766E" : "#fff",
                              color: isSelected ? "#fff" : "#374151",
                              fontSize: 12, fontWeight: 600, cursor: "pointer",
                              transition: "all 0.15s ease",
                              display: "flex", alignItems: "center", gap: 5,
                              boxShadow: isSelected ? "0 2px 6px rgba(15,118,110,0.3)" : "none",
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
                onChange={e => { setCustomSkill(formatNameLikeInput(e.target.value)); if (error === "Duplicate skills are not allowed.") setError(""); }}
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
                  background: customSkill.trim() ? "#0F766E" : "#E2E8F0",
                  color: customSkill.trim() ? "#fff" : "#94A3B8",
                  fontSize: 13, fontWeight: 700, cursor: customSkill.trim() ? "pointer" : "default",
                }}
              >+ Add</button>
            </div>
            {displayErrors.skills && <div style={fieldErrorStyle}>{displayErrors.skills}</div>}
          </div>

          {/* ── Availability Times ── */}
          <div style={{ display: "flex", gap: 12 }}>
            <div className="advisor-form-group" style={{ flex: 1 }}>
              <label>AVAILABILITY START <span className="advisor-required">*</span></label>
              <div
                onClick={() => !loading && openTimePicker("shiftStartTime")}
                style={{
                  width: "100%", padding: "9px 12px",
                  border: `1.5px solid ${displayErrors.shiftStartTime ? "#FCA5A5" : (!formData.shiftStartTime ? "#E2E8F0" : "#A5F3FC")}`,
                  borderRadius: 8, fontSize: 13,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: loading ? "not-allowed" : "pointer",
                  background: displayErrors.shiftStartTime ? "#FFF7F7" : (loading ? "#F8FAFC" : "#fff"),
                  color: formData.shiftStartTime ? "#0F172A" : "#94A3B8",
                  boxSizing: "border-box",
                }}
              >
                <span>{formData.shiftStartTime ? displayTime(formData.shiftStartTime) : "Select availability start"}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" strokeLinecap="round" />
                </svg>
              </div>
              {displayErrors.shiftStartTime && <div style={fieldErrorStyle}>{displayErrors.shiftStartTime}</div>}
            </div>

            <div className="advisor-form-group" style={{ flex: 1 }}>
              <label>AVAILABILITY END <span className="advisor-required">*</span></label>
              <div
                onClick={() => !loading && openTimePicker("shiftEndTime")}
                style={{
                  width: "100%", padding: "9px 12px",
                  border: `1.5px solid ${displayErrors.shiftEndTime ? "#FCA5A5" : (!formData.shiftEndTime ? "#E2E8F0" : "#A5F3FC")}`,
                  borderRadius: 8, fontSize: 13,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  cursor: loading ? "not-allowed" : "pointer",
                  background: displayErrors.shiftEndTime ? "#FFF7F7" : (loading ? "#F8FAFC" : "#fff"),
                  color: formData.shiftEndTime ? "#0F172A" : "#94A3B8",
                  boxSizing: "border-box",
                }}
              >
                <span>{formData.shiftEndTime ? displayTime(formData.shiftEndTime) : "Select availability end"}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" strokeLinecap="round" />
                </svg>
              </div>
              {displayErrors.shiftEndTime && <div style={fieldErrorStyle}>{displayErrors.shiftEndTime}</div>}
            </div>
          </div>

          <div className="advisor-form-group">
            <label>SESSION DURATION <span className="advisor-required">*</span></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
              {[1, 2, 3].map(hours => {
                const active = Number(formData.slotsDurationHours || 1) === hours;
                return (
                  <button
                    key={hours}
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({ ...prev, slotsDurationHours: String(hours) }));
                      setTouchedFields(prev => ({ ...prev, slotsDurationHours: true }));
                      clearFieldError("slotsDurationHours");
                    }}
                    disabled={loading}
                    style={{
                      padding: "11px 10px",
                      borderRadius: 10,
                      border: `1.5px solid ${displayErrors.slotsDurationHours ? "#FCA5A5" : (active ? "#0F766E" : "#CBD5E1")}`,
                      background: displayErrors.slotsDurationHours ? "#FFF7F7" : (active ? "#ECFEFF" : "#fff"),
                      color: active ? "#0F766E" : "#334155",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {hours} hr
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
              Used to generate bookable slots for this consultant.
            </div>
            {displayErrors.slotsDurationHours && <div style={fieldErrorStyle}>{displayErrors.slotsDurationHours}</div>}
          </div>

          {/* ── Charges ── */}
          <div className="advisor-form-group">
            <label>BASE CHARGE PER PERSON (₹) <span className="advisor-required">*</span></label>
            <input type="text" name="charges" placeholder="e.g. 1200"
              value={formData.charges} onChange={handleChange}
              disabled={loading} inputMode="decimal"
              style={inputErrorStyle("charges")} />
            <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
              Session fee charged to the customer. Current value: {formData.charges ? formatIndianCurrency(formData.charges) : "—"}
            </div>
            {displayErrors.charges && <div style={fieldErrorStyle}>{displayErrors.charges}</div>}
          </div>

          <div className="advisor-form-actions">
            <button type="button" className="advisor-btn-cancel" onClick={onClose} disabled={loading}>Cancel</button>
            <button type="submit" className="advisor-btn-save" disabled={loading || !isFormReady}>
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
