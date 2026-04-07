// ─────────────────────────────────────────────────────────────────────────────
// PostBookingQuestionnaire.tsx
// Shown after every successful booking.
// Questions are loaded dynamically from the backend.
// Answers are submitted to the backend and also cached in localStorage.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../config/api";

const BASE_URL = API_BASE_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

type QType = "radio" | "multiselect" | "text" | "mobile";

interface ApiQuestion {
  id: number;
  text: string;
  type: QType;
  options: string[];   // already parsed from "|||" format
  placeholder?: string;
}

export interface BookingAnswer {
  questionId: number;
  questionText: string;
  type: QType;
  answer: string;
}

export interface PostBookingAnswers {
  bookingId: number;
  consultantId: number;
  consultantName: string;
  slotLabel: string;
  dayLabel: string;
  submittedAt: string;
  answers: BookingAnswer[];
}

interface Props {
  bookingId: number;
  consultantName: string;
  consultantId: number;
  slotLabel: string;
  dayLabel: string;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = (bookingId: number) => `mtm_booking_answers_${bookingId}`;

/** Saves answer payload to localStorage as offline cache */
export const saveBookingAnswers = (data: PostBookingAnswers) => {
  try {
    localStorage.setItem(STORAGE_KEY(data.bookingId), JSON.stringify(data));
    const indexKey = `mtm_answers_consultant_${data.consultantId}`;
    const existing: number[] = JSON.parse(localStorage.getItem(indexKey) || "[]");
    if (!existing.includes(data.bookingId)) {
      localStorage.setItem(indexKey, JSON.stringify([...existing, data.bookingId]));
    }
  } catch { /* storage full */ }
};

/** Reads cached answers from localStorage */
export const getBookingAnswers = (bookingId: number): PostBookingAnswers | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(bookingId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};

/** Returns all cached answers for a consultant from localStorage */
export const getAnswersForConsultant = (consultantId: number): PostBookingAnswers[] => {
  try {
    const ids: number[] = JSON.parse(localStorage.getItem(`mtm_answers_consultant_${consultantId}`) || "[]");
    return ids.map(id => getBookingAnswers(id)).filter(Boolean) as PostBookingAnswers[];
  } catch { return []; }
};

/** Parses the backend "|||"-separated options string into an array */
const parseOptions = (raw: string | string[] | undefined): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return raw.split("|||").map(s => s.trim()).filter(Boolean);
};

const isValidMobile = (val: string) => /^[6-9]\d{9}$/.test(val.trim());

// Fallback questions used only if the backend has none configured
const FALLBACK_QUESTIONS: ApiQuestion[] = [
  { id: -1, text: "Please enter your mobile number", type: "mobile", options: [], placeholder: "e.g. 9876543210" },
  { id: -2, text: "What is your primary goal for this consultation?", type: "radio", options: ["Tax planning & savings", "Investment strategy", "Retirement planning", "Insurance review", "Wealth management", "Business finance", "General financial advice"] },
  { id: -3, text: "What is your approximate annual income?", type: "radio", options: ["Below Rs. 5 Lakhs", "Rs. 5L - Rs. 10L", "Rs. 10L - Rs. 25L", "Rs. 25L - Rs. 50L", "Above Rs. 50L"] },
  { id: -4, text: "What best describes your employment?", type: "radio", options: ["Salaried (private sector)", "Salaried (government / PSU)", "Self-employed / Freelancer", "Business owner", "Professional (CA, Doctor, Lawyer)", "Not currently employed"] },
  { id: -5, text: "Do you currently have existing investments?", type: "radio", options: ["Yes - stocks / mutual funds", "Yes - fixed deposits / bonds", "Yes - real estate", "Yes - mix of the above", "No investments yet"] },
  { id: -6, text: "What are your biggest financial challenges right now?", type: "multiselect", options: ["High tax burden", "Not saving enough", "Managing debt / EMIs", "No clear investment plan", "Planning for child's education", "Retirement corpus gap", "Business cash flow"] },
  { id: -7, text: "How do you prefer to receive advice?", type: "radio", options: ["Step-by-step guidance", "High-level summary only", "Detailed reports & analysis", "Action items with deadlines"] },
  { id: -8, text: "Anything specific you want the consultant to know before the session? (optional)", type: "text", options: [], placeholder: "e.g. I have a loan coming up, planning to buy a house next year..." },
];

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconCalendar = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconCheckCircle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const IconArrowRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const IconArrowLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const IconStar = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const IconDot = () => (
  <svg width="6" height="6" viewBox="0 0 6 6" fill="#16A34A"><circle cx="3" cy="3" r="3"/></svg>
);
const IconSpinner = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" strokeOpacity="0.2"/>
    <path d="M12 2a10 10 0 0 1 10 10" style={{ animation: "spin 0.8s linear infinite" }}/>
  </svg>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const PostBookingQuestionnaire: React.FC<Props> = ({
  bookingId,
  consultantName,
  consultantId,
  slotLabel,
  dayLabel,
  onClose,
}) => {
  const [questions, setQuestions] = useState<ApiQuestion[]>([]);
  const [loadingQs, setLoadingQs] = useState(true);
  const [step, setStep] = useState(0);           // 0 = intro, 1..N = questions, N+1 = done
  const [answers, setAnswers] = useState<Record<string, string>>({}); // key = String(q.id)
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Fetch questions from backend ──
  useEffect(() => {
    setLoadingQs(true);
    fetch(`${BASE_URL}/questions`, {
      headers: {
        "Content-Type": "application/json",
        ...(localStorage.getItem("token") ? { "Authorization": `Bearer ${localStorage.getItem("token")}` } : {}),
      },
    })
      .then(r => r.json())
      .then((data: any) => {
        const arr: any[] = Array.isArray(data) ? data : (data?.content || data?.data || []);
        const parsed: ApiQuestion[] = arr.map(q => ({
          id: q.id,
          text: q.text || q.question || "",
          type: (q.type || "radio") as QType,
          options: parseOptions(q.options),
          placeholder: q.placeholder || "",
        }));
        setQuestions(parsed.length > 0 ? parsed : FALLBACK_QUESTIONS);
      })
      .catch(() => setQuestions(FALLBACK_QUESTIONS))
      .finally(() => setLoadingQs(false));
  }, []);

  const totalQs = questions.length;
  const isIntro = step === 0;
  const isDone = step > totalQs;
  const currentQ = isIntro || isDone || questions.length === 0 ? null : questions[step - 1];
  const progress = isIntro ? 0 : Math.min((step / totalQs) * 100, 100);
  const qKey = (q: ApiQuestion) => String(q.id);

  // ── Answer handlers ──
  const handleAnswer = (key: string, value: string) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const handleMultiToggle = (key: string, option: string) => {
    const current = (answers[key] || "").split("|||").filter(Boolean);
    const updated = current.includes(option)
      ? current.filter(v => v !== option)
      : [...current, option];
    setAnswers(prev => ({ ...prev, [key]: updated.join("|||") }));
  };

  const canNext = () => {
    if (isIntro) return true;
    if (!currentQ) return true;
    if (currentQ.type === "text") return true; // optional
    if (currentQ.type === "mobile") return isValidMobile(answers[qKey(currentQ)] || "");
    return !!(answers[qKey(currentQ)]);
  };

  const handleNext = () => {
    if (step <= totalQs) setStep(s => s + 1);
  };

  // ── Submit answers to backend ──
  const handleSubmit = async () => {
    setSaving(true);
    setSubmitError(null);

    const answerPayload: BookingAnswer[] = questions.map(q => ({
      questionId: q.id,
      questionText: q.text,
      type: q.type,
      answer: answers[qKey(q)] || "",
    }));

    const payload: PostBookingAnswers = {
      bookingId,
      consultantId,
      consultantName,
      slotLabel,
      dayLabel,
      submittedAt: new Date().toISOString(),
      answers: answerPayload,
    };

    // 1️⃣ Submit to backend
    let backendOk = false;
    try {
      const res = await fetch(`${BASE_URL}/booking-answers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(localStorage.getItem("token") ? { "Authorization": `Bearer ${localStorage.getItem("token")}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      backendOk = res.ok;
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.warn("Backend answered:", res.status, errText);
      }
    } catch (e) {
      console.warn("Backend submission failed, using localStorage fallback:", e);
    }

    // 2️⃣ Always save to localStorage as cache / fallback
    saveBookingAnswers(payload);

    setSaving(false);

    if (!backendOk) {
      // still progress — localStorage is the fallback
      console.info("Answers saved to localStorage (backend unavailable).");
    }

    setStep(totalQs + 1);
  };

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 3000,
        background: "rgba(15,23,42,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, backdropFilter: "blur(8px)",
      }}
      onClick={isDone ? onClose : undefined}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 24,
          width: "100%", maxWidth: 520,
          maxHeight: "92vh", overflowY: "auto",
          boxShadow: "0 32px 80px rgba(15,23,42,0.4)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          background: "linear-gradient(135deg,#1E3A5F,#2563EB)",
          padding: "22px 24px 18px",
          borderRadius: "24px 24px 0 0",
          position: "sticky", top: 0, zIndex: 2,
          flexShrink: 0,
        }}>
          {/* Progress bar */}
          {!isIntro && !isDone && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#93C5FD", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  Question {step} of {totalQs}
                </span>
                <span style={{ fontSize: 10, color: "#93C5FD" }}>{Math.round(progress)}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.2)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "#60A5FA", borderRadius: 2, width: `${progress}%`, transition: "width 0.4s ease" }} />
              </div>
            </div>
          )}

          {/* Booked-for pill */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 20, padding: "5px 14px", marginBottom: 12, fontSize: 12, fontWeight: 700, color: "#fff" }}>
            <IconCalendar />
            Booked for {dayLabel}&nbsp;|&nbsp;{slotLabel}
          </div>

          <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: "#93C5FD", marginBottom: 4 }}>
            {isIntro ? "Booking Confirmed" : isDone ? "All Done!" : "Pre-Session Profile"}
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "#fff", margin: "0 0 4px" }}>
            {isIntro
              ? `Session with ${consultantName}`
              : isDone
              ? "Your answers have been saved"
              : currentQ?.text}
          </h3>
          {!isIntro && !isDone && (
            <p style={{ fontSize: 12, color: "#BFDBFE", margin: 0 }}>
              Help your consultant prepare for your session
            </p>
          )}
        </div>

        {/* ── Body ── */}
        <div style={{ padding: "24px", flex: 1 }}>

          {/* LOADING QUESTIONS */}
          {loadingQs && !isDone && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#64748B" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                <IconSpinner />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Loading questions…</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* INTRO */}
          {!loadingQs && isIntro && (
            <div>
              <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 14, padding: "16px 18px", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: "#16A34A", marginBottom: 4 }}>
                  <IconCheckCircle />
                  Booking Confirmed!
                </div>
                <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.6 }}>
                  Your session with <strong>{consultantName}</strong> on <strong>{dayLabel}</strong> at <strong>{slotLabel}</strong> has been confirmed.
                </div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", marginBottom: 12 }}>
                Help your consultant prepare by answering {totalQs} quick question{totalQs !== 1 ? "s" : ""}:
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {[
                  "Your financial goals for the session",
                  "Your income & employment background",
                  "Current investments & challenges",
                  "How you prefer to receive advice",
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#475569" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#2563EB", flexShrink: 0 }}>{i + 1}</div>
                    {item}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={onClose} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Skip for now
                </button>
                <button onClick={() => setStep(1)} style={{ flex: 2, padding: "12px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  Start (takes ~2 min)
                  <IconArrowRight />
                </button>
              </div>
            </div>
          )}

          {/* QUESTIONS */}
          {!loadingQs && !isIntro && !isDone && currentQ && (
            <div>
              {/* Single-choice (radio) */}
              {currentQ.type === "radio" && currentQ.options.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                  {currentQ.options.map(opt => {
                    const isSelected = answers[qKey(currentQ)] === opt;
                    return (
                      <label key={opt} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 12, cursor: "pointer", border: `2px solid ${isSelected ? "#2563EB" : "#E2E8F0"}`, background: isSelected ? "#EFF6FF" : "#FAFAFA", transition: "all 0.15s" }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, border: `2px solid ${isSelected ? "#2563EB" : "#CBD5E1"}`, background: isSelected ? "#2563EB" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {isSelected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                        </div>
                        <input type="radio" name={qKey(currentQ)} value={opt} checked={isSelected} onChange={() => handleAnswer(qKey(currentQ), opt)} style={{ display: "none" }} />
                        <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? "#1E40AF" : "#374151" }}>{opt}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Multi-select */}
              {currentQ.type === "multiselect" && currentQ.options.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 12, color: "#94A3B8", marginBottom: 10 }}>Select all that apply</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {currentQ.options.map(opt => {
                      const selected = (answers[qKey(currentQ)] || "").split("|||").includes(opt);
                      return (
                        <button key={opt} onClick={() => handleMultiToggle(qKey(currentQ), opt)} style={{ padding: "8px 16px", borderRadius: 20, cursor: "pointer", border: `2px solid ${selected ? "#2563EB" : "#E2E8F0"}`, background: selected ? "#2563EB" : "#fff", color: selected ? "#fff" : "#374151", fontSize: 13, fontWeight: selected ? 700 : 400, transition: "all 0.15s", display: "flex", alignItems: "center", gap: 6 }}>
                          {selected && <IconCheck />}
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Free text */}
              {currentQ.type === "text" && (
                <div style={{ marginBottom: 24 }}>
                  <textarea
                    value={answers[qKey(currentQ)] || ""}
                    onChange={e => handleAnswer(qKey(currentQ), e.target.value)}
                    placeholder={currentQ.placeholder || "Your answer..."}
                    rows={4}
                    style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #E2E8F0", borderRadius: 12, fontSize: 13, outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.6, boxSizing: "border-box" }}
                  />
                </div>
              )}

              {/* Mobile number */}
              {currentQ.type === "mobile" && (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: "#374151", pointerEvents: "none", userSelect: "none" }}>+91</div>
                    <input
                      type="tel" inputMode="numeric" maxLength={10}
                      value={answers[qKey(currentQ)] || ""}
                      onChange={e => { const val = e.target.value.replace(/\D/g, "").slice(0, 10); handleAnswer(qKey(currentQ), val); }}
                      placeholder={currentQ.placeholder || "9876543210"}
                      style={{ width: "100%", padding: "12px 14px 12px 52px", border: `1.5px solid ${!answers[qKey(currentQ)] ? "#E2E8F0" : isValidMobile(answers[qKey(currentQ)]) ? "#16A34A" : "#EF4444"}`, borderRadius: 12, fontSize: 15, outline: "none", fontFamily: "monospace", letterSpacing: "0.08em", boxSizing: "border-box", background: "#FAFAFA", transition: "border-color 0.15s" }}
                    />
                    {answers[qKey(currentQ)] && (
                      <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)" }}>
                        {isValidMobile(answers[qKey(currentQ)])
                          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: answers[qKey(currentQ)] && !isValidMobile(answers[qKey(currentQ)]) ? "#EF4444" : "#94A3B8" }}>
                    {answers[qKey(currentQ)] && !isValidMobile(answers[qKey(currentQ)])
                      ? `Invalid — must be 10 digits starting with 6–9 (${answers[qKey(currentQ)].length}/10)`
                      : "10-digit Indian mobile number starting with 6, 7, 8, or 9"}
                  </div>
                </div>
              )}

              {/* Error message */}
              {submitError && (
                <div style={{ marginBottom: 16, padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
                  {submitError}
                </div>
              )}

              {/* Navigation buttons */}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => setStep(s => Math.max(1, s - 1))} style={{ padding: "12px 20px", borderRadius: 12, border: "1.5px solid #E2E8F0", background: "#fff", color: "#64748B", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <IconArrowLeft />
                  Back
                </button>
                {step < totalQs ? (
                  <button onClick={handleNext} disabled={!canNext()} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: canNext() ? "linear-gradient(135deg,#2563EB,#1D4ED8)" : "#E2E8F0", color: canNext() ? "#fff" : "#94A3B8", fontSize: 14, fontWeight: 700, cursor: canNext() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    Continue <IconArrowRight />
                  </button>
                ) : (
                  <button onClick={handleSubmit} disabled={saving || !canNext()} style={{ flex: 1, padding: "12px", borderRadius: 12, border: "none", background: saving ? "#93C5FD" : (canNext() ? "linear-gradient(135deg,#16A34A,#15803D)" : "#E2E8F0"), color: (saving || canNext()) ? "#fff" : "#94A3B8", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    {saving ? "Saving..." : (<>Submit Answers <IconCheck /></>)}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* DONE */}
          {isDone && (
            <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                <IconStar />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0F172A", marginBottom: 8 }}>Profile submitted!</div>
              <div style={{ fontSize: 14, color: "#64748B", lineHeight: 1.6, marginBottom: 24 }}>
                Your consultant will review your answers before the session on <strong>{dayLabel}</strong> at <strong>{slotLabel}</strong>.
              </div>
              <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 12, padding: "14px 16px", marginBottom: 24, textAlign: "left" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "#16A34A", marginBottom: 10 }}>
                  <IconCheckCircle />
                  What happens next?
                </div>
                {[
                  "Your answers are visible to your consultant",
                  "They'll prepare a personalised session agenda",
                  "You'll receive a reminder before your session",
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#166534", marginBottom: i < 2 ? 6 : 0 }}>
                    <IconDot />
                    {item}
                  </div>
                ))}
              </div>
              <button onClick={onClose} style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#2563EB,#1D4ED8)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                Go to My Bookings <IconArrowRight />
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default PostBookingQuestionnaire;
