// ─────────────────────────────────────────────────────────────────────────────
// BookingAnswersViewer.tsx
// Used in AdvisorDashboard - BookingsView
// Fetches client pre-session answers from the backend API.
// Falls back to localStorage cache if the backend is unavailable.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { API_BASE_URL } from "../config/api";
import { getAllActiveQuestions, getUserDisplayName } from "../services/api";
import { BookingAnswer, PostBookingAnswers, getBookingAnswers, getSpecialBookingAnswers } from "./Postbookingquestionnaire";

const BASE_URL = API_BASE_URL;

interface Props {
  bookingId?: number;
  specialBookingId?: number;
  bookingType?: "NORMAL" | "SPECIAL";
  userId?: number;
  clientName: string;
  onClose: () => void;
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────

const IconClose = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconPrint = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
  </svg>
);
const IconShield = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);
const IconInbox = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
    <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
  </svg>
);
const IconFileText = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);
const IconSpinner = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.5" strokeLinecap="round">
    <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
    <path d="M12 2a10 10 0 0 1 10 10" style={{ animation: "spin 0.8s linear infinite" }} />
  </svg>
);

let questionTextMapCache: Record<number, string> | null = null;
let questionTextMapPromise: Promise<Record<number, string>> | null = null;

const getQuestionTextMap = async (): Promise<Record<number, string>> => {
  if (questionTextMapCache) return questionTextMapCache;
  if (!questionTextMapPromise) {
    questionTextMapPromise = getAllActiveQuestions()
      .then((questions) => {
        const map = questions.reduce<Record<number, string>>((acc, q: any) => {
          const id = Number(q?.id ?? q?.questionId ?? 0);
          const text = String(q?.text ?? q?.questionText ?? q?.question ?? "").trim();
          if (id > 0 && text) acc[id] = text;
          return acc;
        }, {});
        questionTextMapCache = map;
        return map;
      })
      .catch(() => {
        questionTextMapCache = {};
        return {};
      });
  }
  return questionTextMapPromise;
};

const formatDisplayName = (value: string): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) {
    const local = raw.split("@")[0].trim();
    if (local) {
      return local
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (c: string) => c.toUpperCase())
        .trim();
    }
  }
  return raw
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase())
    .trim();
};

const isPlaceholderDisplayName = (value: string): boolean =>
  /^(user|client|booking)\s*#?\s*\d+$/i.test(String(value || "").trim());

// ─── Icon map: picks an icon based on common question keywords ────────────────
const getQuestionIcon = (text: string) => {
  const t = text.toLowerCase();
  if (t.includes("mobile") || t.includes("phone") || t.includes("number"))
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
  if (t.includes("goal") || t.includes("purpose") || t.includes("primary"))
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>;
  if (t.includes("income") || t.includes("salary") || t.includes("annual"))
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>;
  if (t.includes("employ") || t.includes("job") || t.includes("work") || t.includes("business"))
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></svg>;
  if (t.includes("invest") || t.includes("portfolio") || t.includes("stock"))
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
  if (t.includes("challenge") || t.includes("problem") || t.includes("issue") || t.includes("difficult"))
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
  if (t.includes("prefer") || t.includes("advice") || t.includes("communicat") || t.includes("style"))
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
  if (t.includes("note") || t.includes("additional") || t.includes("anything") || t.includes("other"))
    return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>;
  // Default generic icon
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
};

// ─── Fetch answers from backend ───────────────────────────────────────────────
const getAuthHeaders = () => ({
  "Content-Type": "application/json",
  ...(localStorage.getItem("fin_token")
    ? { Authorization: `Bearer ${localStorage.getItem("fin_token")}` }
    : {}),
});

const normaliseAnswers = (
  data: any,
  context?: { bookingId?: number; specialBookingId?: number; questionTextMap?: Record<number, string> }
): PostBookingAnswers | null => {
  if (!data) return null;

  const questionTextMap = context?.questionTextMap || {};
  const isFlatAnswerRecord = (item: any) =>
    item &&
    typeof item === "object" &&
    (
      item.questionId != null ||
      item.question_id != null ||
      item.text != null ||
      item.answer != null ||
      item.value != null
    );

  const buildFromFlatRecords = (rows: any[]): PostBookingAnswers | null => {
    if (rows.length === 0) return null;

    const filtered = rows.filter((r: any) => {
      if (context?.specialBookingId != null) {
        return Number(r.specialBookingId ?? r.special_booking_id ?? 0) === Number(context.specialBookingId);
      }
      if (context?.bookingId != null) {
        return Number(r.bookingId ?? r.booking_id ?? 0) === Number(context.bookingId);
      }
      return true;
    });
    const relevant = filtered.length > 0 ? filtered : rows;
    const first = relevant[0];

    const answers: BookingAnswer[] = relevant.map((r: any) => {
      const questionId = Number(r.questionId ?? r.question_id ?? r.id ?? 0);
      const questionText =
        String(r.questionText ?? r.question_text ?? r.question?.text ?? "").trim() ||
        questionTextMap[questionId] ||
        (questionId > 0 ? `Question ${questionId}` : "Question");

      return {
        questionId,
        questionText,
        type: (r.type || r.questionType || "text") as any,
        answer: String(r.text ?? r.answer ?? r.value ?? "").trim(),
      };
    }).filter((a) => a.answer !== "");

    if (answers.length === 0) return null;

    return {
      bookingId: Number(first.bookingId ?? first.booking_id ?? context?.bookingId ?? 0),
      specialBookingId: Number(first.specialBookingId ?? first.special_booking_id ?? context?.specialBookingId ?? 0) || undefined,
      consultantId: Number(first.consultantId ?? first.consultant_id ?? 0),
      consultantName: first.consultantName || first.consultant_name || "",
      slotLabel: first.slotLabel || first.slot_label || "",
      dayLabel: first.dayLabel || first.day_label || "",
      submittedAt: first.submittedAt || first.updatedAt || first.createdAt || new Date().toISOString(),
      answers,
    };
  };

  // Backend may return an array of answer records directly
  if (Array.isArray(data)) {
    if (data.length === 0) return null;
    if (isFlatAnswerRecord(data[0])) {
      return buildFromFlatRecords(data);
    }
    const first = data[0];
    // Merge all answer arrays from all records (de-dup by questionId)
    const seen = new Set<number>();
    const answers: BookingAnswer[] = data.flatMap((r: any) =>
      Array.isArray(r.answers) ? r.answers : []
    ).filter((a: BookingAnswer) => {
      if (seen.has(a.questionId)) return false;
      seen.add(a.questionId);
      return true;
    });
    return {
      bookingId: first.bookingId,
      specialBookingId: first.specialBookingId ?? first.special_booking_id ?? undefined,
      consultantId: first.consultantId,
      consultantName: first.consultantName || "",
      slotLabel: first.slotLabel || "",
      dayLabel: first.dayLabel || "",
      submittedAt: first.submittedAt || first.createdAt || new Date().toISOString(),
      answers,
    };
  }

  // Standard single-object response
  if (!data.answers) return null;

  if (Array.isArray(data.answers)) {
    if (data.answers.length > 0 && isFlatAnswerRecord(data.answers[0])) {
      return buildFromFlatRecords(data.answers);
    }
    return data as PostBookingAnswers;
  }

  // Legacy object-map format { "Question text": "answer" }
  const answers: BookingAnswer[] = Object.entries(data.answers).map(([key, value]) => ({
    questionId: 0,
    questionText: key,
    type: "text" as any,
    answer: String(value),
  }));
  return { ...data, answers };
};

const fetchAnswersFromBackend = async (
  bookingId?: number,
  specialBookingId?: number,
  userId?: number,
  bookingType?: "NORMAL" | "SPECIAL"
): Promise<PostBookingAnswers | null> => {
  const questionTextMap = await getQuestionTextMap();

  // ── Priority 1: The canonical backend endpoint.
  // The backend stores answers with bookingId = the booking/special-booking id.
  // AnswerService.getAnswersForBooking(userId, bookingId, type) maps to:
  //   GET /api/users/{userId}/bookings/{bookingId}/answers?type=NORMAL|SPECIAL
  if (userId) {
    const idToTry = specialBookingId || bookingId;
    const typeForId = specialBookingId ? "SPECIAL" : (bookingType ?? "NORMAL");
    if (idToTry) {
      try {
        const res = await fetch(`${BASE_URL}/users/${userId}/bookings/${idToTry}/answers?type=${typeForId}`, { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          const norm = normaliseAnswers(Array.isArray(data) ? data : data?.content ?? data, {
            bookingId,
            specialBookingId,
            questionTextMap,
          });
          if (norm) return norm;
        }
      } catch { /* fall through to other variants */ }
    }
    // Also try regular bookingId if it differs from specialBookingId
    if (bookingId && bookingId !== specialBookingId) {
      try {
        const res = await fetch(`${BASE_URL}/users/${userId}/bookings/${bookingId}/answers?type=${bookingType ?? "NORMAL"}`, { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          const norm = normaliseAnswers(Array.isArray(data) ? data : data?.content ?? data, {
            bookingId,
            specialBookingId,
            questionTextMap,
          });
          if (norm) return norm;
        }
      } catch { /* fall through */ }
    }
  }

  // ── Priority 2: Fallback URL variants ──────────────────────────────────────
  const urls: string[] = [];
  if (specialBookingId) {
    urls.push(
      `${BASE_URL}/booking-answers/special-booking/${specialBookingId}`,
      `${BASE_URL}/booking-answers?specialBookingId=${specialBookingId}`,
      `${BASE_URL}/special-bookings/${specialBookingId}/answers`
    );
    if (userId) {
      urls.push(`${BASE_URL}/users/${userId}/special-bookings/${specialBookingId}/answers`);
    }
  }
  if (bookingId) {
    urls.push(
      `${BASE_URL}/booking-answers/booking/${bookingId}`,
      `${BASE_URL}/booking-answers?bookingId=${bookingId}`
    );
  }
  if (!bookingId && !specialBookingId) return null;

  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) continue;
      const data = await res.json();
      const norm = normaliseAnswers(Array.isArray(data) ? data : data?.content ?? data, {
        bookingId,
        specialBookingId,
        questionTextMap,
      });
      if (norm) return norm;
    } catch {
      // try next endpoint variant
    }
  }
  return null;
};

// ─── Small trigger button on booking card ─────────────────────────────────────
export const BookingAnswersButton: React.FC<{
  bookingId?: number;
  specialBookingId?: number;
  bookingType?: "NORMAL" | "SPECIAL";
  userId?: number;
  clientName: string;
}> = ({ bookingId, specialBookingId, bookingType, userId, clientName }) => {
  const [open, setOpen] = useState(false);
  const [hasAnswers, setHasAnswers] = useState(false);
  const hasAnyId = Boolean(bookingId || specialBookingId);

  useEffect(() => {
    if (!hasAnyId) return;
    if (specialBookingId && getSpecialBookingAnswers(specialBookingId)) {
      setHasAnswers(true);
      return;
    }
    if (bookingId && getBookingAnswers(bookingId)) {
      setHasAnswers(true);
      return;
    }
    const probeUrls = [
      ...(specialBookingId
        ? [
          `${BASE_URL}/booking-answers/special-booking/${specialBookingId}`,
          `${BASE_URL}/booking-answers?specialBookingId=${specialBookingId}`,
          `${BASE_URL}/special-bookings/${specialBookingId}/answers`,
          ...(userId ? [`${BASE_URL}/users/${userId}/bookings/${specialBookingId}/answers?type=SPECIAL`] : []),
          ...(userId ? [`${BASE_URL}/users/${userId}/special-bookings/${specialBookingId}/answers`] : []),
        ]
        : []),
      ...(bookingId
        ? [
          `${BASE_URL}/booking-answers/booking/${bookingId}`,
          `${BASE_URL}/booking-answers?bookingId=${bookingId}`,
          ...(userId ? [`${BASE_URL}/users/${userId}/bookings/${bookingId}/answers?type=${bookingType ?? "NORMAL"}`] : []),
        ]
        : []),
    ];
    (async () => {
      for (const url of probeUrls) {
        try {
          const res = await fetch(url, { headers: getAuthHeaders() });
          if (res.ok) { setHasAnswers(true); return; }
        } catch {
          // try next probe
        }
      }
    })();
  }, [bookingId, hasAnyId, specialBookingId, userId]);

  if (!hasAnyId || !hasAnswers) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="View client's pre-session answers"
        style={{ padding: "7px 14px", borderRadius: 8, border: "1.5px solid #A5F3FC", background: "#ECFEFF", color: "#0F766E", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontFamily: "inherit" }}
      >
        <IconFileText />
        View Client Profile
      </button>
      {open && (
        <BookingAnswersViewer
          bookingId={bookingId}
          specialBookingId={specialBookingId}
          bookingType={bookingType}
          userId={userId}
          clientName={clientName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

// ─── Full viewer modal ────────────────────────────────────────────────────────
export const BookingAnswersViewer: React.FC<Props> = ({ bookingId, specialBookingId, bookingType, userId, clientName, onClose }) => {
  const [data, setData] = useState<PostBookingAnswers | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);
  const [displayClientName, setDisplayClientName] = useState(formatDisplayName(clientName) || "Client");
  const effectiveId = specialBookingId || bookingId || 0;
  const bookingLabel = specialBookingId ? "Special Booking" : "Booking";

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const questionTextMap = await getQuestionTextMap();
      const resolvedName = formatDisplayName(clientName);
      if (resolvedName && !isPlaceholderDisplayName(resolvedName)) {
        setDisplayClientName(resolvedName);
      } else if (userId) {
        try {
          const fetchedName = await getUserDisplayName(userId);
          setDisplayClientName(fetchedName || "Client");
        } catch {
          setDisplayClientName("Client");
        }
      } else {
        setDisplayClientName("Client");
      }
      // 1️⃣ Try backend
      let result = await fetchAnswersFromBackend(bookingId, specialBookingId, userId, bookingType);
      // 2️⃣ Fall back to localStorage cache
      if (!result && specialBookingId) result = getSpecialBookingAnswers(specialBookingId) as PostBookingAnswers | null;
      if (!result && bookingId) result = getBookingAnswers(bookingId) as PostBookingAnswers | null;
      if (result?.answers?.length) {
        result = {
          ...result,
          answers: result.answers.map((a) => ({
            ...a,
            questionText: a.questionText || questionTextMap[a.questionId] || `Question ${a.questionId}`,
          })),
        };
      }
      setData(result);
      setLoading(false);
    };
    load();
  }, [bookingId, specialBookingId, userId, clientName]);

  const handlePrint = () => {
    if (!data) return;
    const printWindow = window.open("", "_blank", "width=800,height=900");
    if (!printWindow) return;
    const answers = data.answers as BookingAnswer[];
    const html = `
      <html>
      <head>
        <title>Client Profile - ${displayClientName}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #0F172A; }
          .header { background: var(--portal-profile-gradient); color: #fff; padding: 28px 32px; border-radius: 12px; margin-bottom: 24px; }
          .header h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
          .header p { font-size: 13px; color: rgba(255,255,255,0.75); }
          .section { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px 20px; margin-bottom: 14px; page-break-inside: avoid; }
          .section-label { font-size: 10px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px; }
          .section-value { font-size: 14px; font-weight: 600; color: #0F172A; line-height: 1.6; }
          .tag { display: inline-block; background: #ECFEFF; color: #0F766E; border: 1px solid #A5F3FC; border-radius: 20px; padding: 3px 12px; font-size: 12px; font-weight: 600; margin: 2px; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #94A3B8; }
          @media print { body { padding: 20px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Pre-Session Client Profile</h1>
          <p>${displayClientName} | ${bookingLabel} #${effectiveId} | ${data.dayLabel || ""} ${data.slotLabel || ""}</p>
          <p>Submitted: ${data.submittedAt ? new Date(data.submittedAt).toLocaleString("en-IN") : ""}</p>
        </div>
        ${answers.filter(a => a.answer).map(a => {
      const isMulti = a.type === "multiselect";
      const values = isMulti ? a.answer.split("|||").filter(Boolean) : [a.answer];
      return `
            <div class="section">
              <div class="section-label">${a.questionText}</div>
              <div class="section-value">
                ${isMulti ? values.map(v => `<span class="tag">${v}</span>`).join("") : `<span>${values[0]}</span>`}
              </div>
            </div>
          `;
    }).join("")}
        <div class="footer">Generated by Meet The Masters | Confidential - for consultant use only</div>
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // ── Loading state ──
  if (loading) {
    return ReactDOM.createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 40, maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><IconSpinner /></div>
          <div style={{ fontSize: 14, color: "#64748B", fontWeight: 600 }}>Fetching client profile...</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>,
      document.body
    );
  }

  // ── No data state ──
  if (!data || !data.answers || (data.answers as BookingAnswer[]).filter(a => a.answer).length === 0) {
    return ReactDOM.createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
        <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, padding: 32, maxWidth: 400, width: "100%", textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, color: "#94A3B8" }}><IconInbox /></div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A", marginBottom: 8 }}>No answers yet</div>
          <div style={{ fontSize: 13, color: "#64748B", marginBottom: 20 }}>The client hasn't submitted their pre-session profile for this booking.</div>
          <button onClick={onClose} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "#0F766E", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Close</button>
        </div>
      </div>,
      document.body
    );
  }

  const answers = data.answers as BookingAnswer[];

  // ── Full viewer ──
  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9100, background: "rgba(15,23,42,0.75)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backdropFilter: "blur(6px)" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 600, maxHeight: "92vh", display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(15,23,42,0.4)", overflow: "hidden" }}>

        {/* PDF Header */}
        <div style={{ background: "var(--portal-profile-gradient)", padding: "22px 24px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#99F6E4", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4 }}>
                Pre-Session Client Profile
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 4 }}>{displayClientName}</div>
              <div style={{ fontSize: 13, color: "#A5F3FC" }}>
                {bookingLabel} #{effectiveId}&nbsp;|&nbsp;{data.dayLabel}&nbsp;|&nbsp;{data.slotLabel}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
                Submitted {new Date(data.submittedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={handlePrint} title="Print / Save as PDF" style={{ padding: "8px 14px", borderRadius: 8, border: "1.5px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
                <IconPrint /> Print PDF
              </button>
              <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", width: 34, height: 34, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconClose />
              </button>
            </div>
          </div>
        </div>

        {/* Answers */}
        <div ref={printRef} style={{ overflowY: "auto", padding: "20px 24px 28px", flex: 1 }}>

          {/* Confidentiality notice */}
          <div style={{ background: "#FFFBEB", border: "1px solid #FCD34D", borderRadius: 10, padding: "10px 14px", marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
            <IconShield />
            <span style={{ fontSize: 12, color: "#92400E", fontWeight: 600 }}>Confidential - for consultant use only</span>
          </div>

          {/* Answer sections - fully dynamic */}
          {answers.filter(a => a.answer).map((a, idx) => {
            const isMulti = a.type === "multiselect";
            const values = isMulti ? a.answer.split("|||").filter(Boolean) : [a.answer];

            return (
              <div key={a.questionId || idx} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: "14px 18px", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, color: "#64748B" }}>
                  {getQuestionIcon(a.questionText)}
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {a.questionText}
                  </span>
                </div>
                {isMulti ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {values.map(v => (
                      <span key={v} style={{ background: "#ECFEFF", color: "#0F766E", border: "1px solid #A5F3FC", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 600 }}>{v}</span>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A", lineHeight: 1.6 }}>{values[0]}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>,
    document.body
  );
};

export default BookingAnswersViewer;