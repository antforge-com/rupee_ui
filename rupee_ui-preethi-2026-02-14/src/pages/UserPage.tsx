import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import StatusBadge from "../components/StatusBadge.tsx";
import {
  createBooking,
  getAllConsultants,
  getConsultantById,
  getCurrentUser,
  getMyBookings,
  logoutUser,
} from "../services/api";
import styles from "../styles/UserPage.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// API HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const BASE_URL = "/api";
const getToken = () => localStorage.getItem("fin_token");

const apiFetch = async (url: string, options?: RequestInit) => {
  const token = getToken();
  const isFormData = options?.body instanceof FormData;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options?.headers as Record<string, string>) || {}),
    },
  });
  const ct   = res.headers.get("content-type") || "";
  const data = ct.includes("application/json")
    ? await res.json()
    : { message: await res.text() };
  if (!res.ok)
    throw new Error(data?.message || data?.error || `Request failed ${res.status}`);
  return data;
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Consultant {
  id: number; name: string; role: string; fee: number; tags: string[];
  rating: number; exp: number; reviews: number; avatar?: string;
  shiftStartTime?: string; shiftEndTime?: string; shiftTimings?: string;
  location?: string; about?: string; languages?: string; phone?: string;
  email?: string;
}
interface MasterSlot { id: number; timeRange: string; isActive?: boolean; }
interface TimeSlotRecord { id: number; slotDate: string; slotTime: string; status: string; masterTimeSlotId?: number; }
interface Booking {
  id: number; consultantId: number; timeSlotId: number; amount: number;
  BookingStatus: string; paymentStatus: string; consultantName?: string;
  slotDate?: string; slotTime?: string; timeRange?: string; meetingMode?: string;
}
interface FeedbackData {
  bookingId: number; consultantId: number; consultantName: string;
  slotDate: string; timeRange: string;
  existingFeedback?: { id: number; rating: number; comments: string } | null;
}
interface SelectedSlot { start24h: string; label: string; masterId: number; timeslotId?: number; }

type TicketStatus   = "NEW" | "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface TicketComment {
  id: number; ticketId: number; authorName: string; authorRole: "CUSTOMER" | "AGENT";
  message: string; createdAt: string;
}
interface Ticket {
  id: number; userId?: number; description: string; category: string;
  priority: TicketPriority; status: TicketStatus; createdAt: string;
  attachmentUrl?: string; agentName?: string; feedbackRating?: number; feedbackText?: string;
}

interface IncomeItem  { incomeType: string;  incomeAmount: number }
interface ExpenseItem { expenseType: string; expenseAmount: number }
interface UserProfile {
  id?: number; name?: string; email?: string; dob?: string; location?: string;
  identifier?: string; role?: string; subscribed?: boolean; subscriptionPlanName?: string;
  phone?: string; incomes?: IncomeItem[]; expenses?: ExpenseItem[]; createdAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIME HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const toAmPm = (time: string): string => {
  if (!time) return "";
  const [h24, m24] = time.split(":").map(Number);
  if (isNaN(h24)) return time;
  return `${h24 % 12 || 12}:${String(m24 || 0).padStart(2, "0")} ${h24 >= 12 ? "PM" : "AM"}`;
};
const fmt24to12 = (t: string): string => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
const generateHourlySlots = (start: string, end: string): string[] => {
  if (!start || !end) return [];
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startM = sh * 60 + (isNaN(sm) ? 0 : sm);
  const endM   = eh * 60 + (isNaN(em) ? 0 : em);
  const slots: string[] = [];
  for (let m = startM; m + 60 <= endM; m += 60)
    slots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  return slots;
};
const normalise24 = (raw: string): string => {
  if (!raw) return "";
  const iso = raw.match(/^(\d{1,2}):(\d{2})/);
  if (iso) return `${iso[1].padStart(2, "0")}:${iso[2]}`;
  const ampm = raw.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (ampm) {
    let h = parseInt(ampm[1]);
    const m = parseInt(ampm[2] || "0");
    if (ampm[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (ampm[3].toUpperCase() === "AM" && h === 12) h = 0;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return "";
};
const parseLocalTime = (t: any): string => {
  if (!t) return "";
  if (typeof t === "object" && t.hour !== undefined)
    return `${String(t.hour).padStart(2, "0")}:${String(t.minute ?? 0).padStart(2, "0")}`;
  if (typeof t === "string") return t.substring(0, 5);
  return "";
};

// ─────────────────────────────────────────────────────────────────────────────
// DATE CAROUSEL
// ─────────────────────────────────────────────────────────────────────────────
const DAY_NAMES   = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const MONTH_NAMES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
interface DayItem { iso: string; day: string; date: string; month: string }
const buildDays = (n: number): DayItem[] => {
  const out: DayItem[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(); d.setDate(d.getDate() + i);
    out.push({ iso: d.toISOString().split("T")[0], day: DAY_NAMES[d.getDay()], date: String(d.getDate()).padStart(2,"0"), month: MONTH_NAMES[d.getMonth()] });
  }
  return out;
};
const ALL_DAYS     = buildDays(30);
const VISIBLE_DAYS = 7;
const DEFAULT_DAY  = ALL_DAYS.find(d => d.day !== "SUN") ?? ALL_DAYS[0];

const resolvePhotoUrl = (path?: string | null): string => {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("blob:")) return path;
  return path.startsWith("/") ? path : `/${path}`;
};
const fetchMasterTimeslots = async (): Promise<MasterSlot[]> => {
  try { const data = await apiFetch(`${BASE_URL}/master-timeslots`); return Array.isArray(data) ? data : data?.content || []; }
  catch { return []; }
};
const JITSI_URL = (bookingId: number) => `https://meet.jit.si/finadvise-booking-${bookingId}`;
const PENDING_FEEDBACK_KEY = "finadvise_pending_feedback_bookingId";

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL NOTIFICATION HELPER
// ─────────────────────────────────────────────────────────────────────────────
const sendBookingEmails = async (params: {
  bookingId: number; slotDate: string; timeRange: string; meetingMode: string; amount: number;
  userName: string; userEmail: string; consultantName: string; consultantEmail: string; userNotes: string;
}): Promise<void> => {
  const jitsiLink = JITSI_URL(params.bookingId);
  try {
    await apiFetch(`${BASE_URL}/notifications/booking-confirmation`, {
      method: "POST",
      body: JSON.stringify({ ...params, jitsiLink }),
    });
  } catch {
    try {
      const body = (recipient: "user" | "consultant") => ({
        to:      recipient === "user" ? params.userEmail : params.consultantEmail,
        subject: `Booking Confirmed — ${params.slotDate} · ${params.timeRange}`,
        body:
          `Hi ${recipient === "user" ? params.userName : params.consultantName},\n\n` +
          `Your session has been confirmed.\n\n📅 Date : ${params.slotDate}\n🕐 Time : ${params.timeRange}\n💻 Mode : ${params.meetingMode}\n🔗 Join : ${jitsiLink}\n` +
          (params.userNotes ? `📝 Notes: ${params.userNotes}\n` : "") + `\nThank you,\nFinAdvise Team`,
      });
      await Promise.allSettled([
        apiFetch(`${BASE_URL}/email/send`, { method: "POST", body: JSON.stringify(body("user")) }),
        apiFetch(`${BASE_URL}/email/send`, { method: "POST", body: JSON.stringify(body("consultant")) }),
      ]);
    } catch {}
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET HELPERS & CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const fetchMyTickets = async (userId?: number | null): Promise<Ticket[]> => {
  try { const data = await apiFetch(`${BASE_URL}/tickets`); const all: Ticket[] = Array.isArray(data) ? data : (data?.content || []); return userId ? all.filter(t => t.userId === userId) : all; }
  catch { return []; }
};
const fetchTicketComments = async (ticketId: number): Promise<TicketComment[]> => {
  try { const data = await apiFetch(`${BASE_URL}/tickets/${ticketId}/comments`); return Array.isArray(data) ? data : []; }
  catch { return []; }
};

// ── FIX 1: postTicketComment now includes senderId + isConsultantReply ────────
const postTicketComment = async (ticketId: number, message: string): Promise<TicketComment> => {
  const senderId = localStorage.getItem("fin_user_id");
  return apiFetch(`${BASE_URL}/tickets/comments`, {
    method: "POST",
    body: JSON.stringify({
      ticketId,
      message,
      senderId:          senderId ? Number(senderId) : null,
      isConsultantReply: false,   // user-side comments are never consultant replies
    }),
  });
};

const closeTicket = async (ticketId: number): Promise<void> => {
  await apiFetch(`${BASE_URL}/tickets/${ticketId}/status`, { method:"PATCH", body:JSON.stringify({ status:"CLOSED" }) });
};

// ── FIX 2: submitTicketFeedback uses the dedicated sub-resource endpoint ──────
const submitTicketFeedback = async (ticketId: number, rating: number, feedbackText: string): Promise<void> => {
  try {
    // Primary: POST to the dedicated feedback sub-resource
    await apiFetch(`${BASE_URL}/tickets/${ticketId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ rating, feedbackText }),
    });
  } catch {
    // Fallback: PATCH the ticket directly if the sub-resource doesn't exist yet
    await apiFetch(`${BASE_URL}/tickets/${ticketId}`, {
      method: "PATCH",
      body: JSON.stringify({ feedbackRating: rating, feedbackText }),
    });
  }
};

const TICKET_STATUS_CONFIG: Record<TicketStatus, { label:string; color:string; bg:string; border:string; icon:string }> = {
  NEW:      { label:"New",      color:"#6366F1", bg:"#EEF2FF", border:"#C7D2FE", icon:"✦" },
  OPEN:     { label:"Open",     color:"#2563EB", bg:"#EFF6FF", border:"#93C5FD", icon:"◉" },
  PENDING:  { label:"Pending",  color:"#D97706", bg:"#FFFBEB", border:"#FCD34D", icon:"◔" },
  RESOLVED: { label:"Resolved", color:"#16A34A", bg:"#F0FDF4", border:"#86EFAC", icon:"✓" },
  CLOSED:   { label:"Closed",   color:"#64748B", bg:"#F1F5F9", border:"#CBD5E1", icon:"✕" },
};
const TICKET_PRIORITY_CONFIG: Record<TicketPriority, { label:string; color:string; bg:string }> = {
  LOW:      { label:"Low",      color:"#64748B", bg:"#F1F5F9" },
  MEDIUM:   { label:"Medium",   color:"#D97706", bg:"#FFFBEB" },
  HIGH:     { label:"High",     color:"#DC2626", bg:"#FEF2F2" },
  CRITICAL: { label:"Critical", color:"#7C3AED", bg:"#F5F3FF" },
};
const TICKET_CATEGORIES = ["General","Technical Issue","Billing","Account","Consultation","Feedback","Other"];
const TICKET_PRIORITIES: TicketPriority[] = ["LOW","MEDIUM","HIGH","CRITICAL"];
const TICKET_STEPS = [
  { key:"NEW",      label:"Submitted",   icon:"📝" },
  { key:"OPEN",     label:"Assigned",    icon:"👤" },
  { key:"PENDING",  label:"In Progress", icon:"⚙️" },
  { key:"RESOLVED", label:"Resolved",    icon:"✅" },
  { key:"CLOSED",   label:"Closed",      icon:"🔒" },
];
const getStepIndex = (status: TicketStatus) => TICKET_STEPS.findIndex(s => s.key === status);

// ─────────────────────────────────────────────────────────────────────────────
// TICKET STEPPER COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const TicketStepper: React.FC<{ status: TicketStatus }> = ({ status }) => {
  const currentIdx = getStepIndex(status);
  return (
    <div style={{ padding:"16px 0 8px" }}>
      <div style={{ display:"flex", alignItems:"flex-start", position:"relative" }}>
        <div style={{ position:"absolute", top:16, left:16, width:"calc(100% - 32px)", height:2, background:"#E2E8F0", zIndex:0 }}/>
        <div style={{ position:"absolute", top:16, left:16, width:`calc((100% - 32px) * ${currentIdx/(TICKET_STEPS.length-1)})`, height:2, background:"#2563EB", zIndex:1, transition:"width 0.4s ease" }}/>
        {TICKET_STEPS.map((step, idx) => {
          const isDone = idx < currentIdx, isCurrent = idx === currentIdx;
          return (
            <div key={step.key} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:8, position:"relative", zIndex:2 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:isDone?"#2563EB":isCurrent?"#EFF6FF":"#F1F5F9", border:`2px solid ${isDone||isCurrent?"#2563EB":"#CBD5E1"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, boxShadow:isCurrent?"0 0 0 4px rgba(37,99,235,0.15)":"none" }}>
                {isDone ? <span style={{ color:"#fff", fontSize:12, fontWeight:700 }}>✓</span> : <span>{step.icon}</span>}
              </div>
              <div style={{ fontSize:10, fontWeight:700, color:isDone||isCurrent?"#1E40AF":"#94A3B8", textTransform:"uppercase", letterSpacing:"0.04em", textAlign:"center" }}>{step.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// STAR RATING COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const StarRating: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div style={{ display:"flex", gap:4 }}>
    {[1,2,3,4,5].map(i => (
      <button key={i} onClick={() => onChange(i)} style={{ background:"none", border:"none", cursor:"pointer", padding:2, fontSize:24 }}>
        {i <= value ? "★" : "☆"}
      </button>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT PROFILE COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const AccountProfile: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string>("");
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ name:"", email:"", dob:"", location:"", phone:"" });

  useEffect(() => {
    (async () => {
      try {
        const raw = await getCurrentUser();
        if (!raw) { setProfile(null); setLoading(false); return; }
        const userId = raw.id || raw.userId;
        let onboard: any = null;
        if (userId) { try { onboard = await apiFetch(`${BASE_URL}/onboarding/${userId}`); } catch {} }
        const merged = { ...raw, ...(onboard || {}) };
        const normalized: UserProfile = {
          id: merged.id, name: merged.name || merged.fullName || "",
          email: merged.email || merged.emailId || "",
          dob: merged.dob || merged.dateOfBirth || "",
          location: merged.location || merged.city || "",
          identifier: merged.identifier || merged.username || merged.email || "",
          role: merged.role || merged.userRole || "",
          subscribed: merged.subscribed ?? merged.isSubscribed ?? false,
          subscriptionPlanName: merged.subscriptionPlanName || merged.planName || "",
          phone: merged.phone || merged.phoneNumber || merged.mobile || "",
          createdAt: merged.createdAt || merged.registeredAt || "",
          incomes:  (merged.incomes  || merged.incomeItems  || []).map((i: any) => ({ incomeType:  i.incomeType  || i.label || "Income",  incomeAmount:  i.incomeAmount  ?? i.amount ?? 0 })),
          expenses: (merged.expenses || merged.expenseItems || []).map((e: any) => ({ expenseType: e.expenseType || e.label || "Expense", expenseAmount: e.expenseAmount ?? e.amount ?? 0 })),
        };
        const existingPhoto = merged.profilePhoto || merged.photo || merged.avatarUrl || "";
        if (existingPhoto) setAvatarPreview(resolvePhotoUrl(existingPhoto));
        setProfile(normalized);
        setForm({ name:normalized.name||"", email:normalized.email||"", dob:normalized.dob?normalized.dob.substring(0,10):"", location:normalized.location||"", phone:normalized.phone||"" });
      } catch { setProfile(null); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  // ── FIX 3: Profile save now sends multipart/form-data with a "data" JSON part ──
  const handleSave = async () => {
    if (!profile?.id) return;
    setSaving(true); setSaveMsg("");
    try {
      const payload = {
        name:     form.name.trim(),
        email:    form.email.trim(),
        dob:      form.dob || null,
        location: form.location.trim(),
        phone:    form.phone.trim(),
      };

      // Wrap JSON as a Blob part so Spring's @RequestPart("data") is satisfied.
      // The avatar file (if any) is included in the same multipart request —
      // no separate /avatar upload needed.
      const onboardingForm = new FormData();
      onboardingForm.append("data", new Blob([JSON.stringify(payload)], { type: "application/json" }));
      if (avatarFile) onboardingForm.append("file", avatarFile);

      try {
        await apiFetch(`${BASE_URL}/onboarding/${profile.id}`, { method: "PUT", body: onboardingForm });
      } catch {
        // Fallback: plain JSON to /users if the onboarding endpoint is unavailable
        await apiFetch(`${BASE_URL}/users/${profile.id}`, { method: "PUT", body: JSON.stringify(payload) });
      }

      setProfile(prev => prev ? { ...prev, ...form } : prev);
      setEditing(false);
      setSaveMsg("✅ Profile updated!");
      setTimeout(() => setSaveMsg(""), 4000);
    } catch (err: any) {
      setSaveMsg(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign:"center", padding:48, color:"#94A3B8" }}>Loading profile…</div>;
  if (!profile) return <div style={{ textAlign:"center", padding:48, color:"#94A3B8" }}>Could not load profile.</div>;

  const isPremium = profile.subscribed === true || ["SUBSCRIBER","SUBSCRIBED","PREMIUM"].includes((profile.role||"").toUpperCase());
  const initials = (profile.name || "U").split(" ").map((w:string) => w[0]).slice(0,2).join("").toUpperCase();
  const totalIncome  = (profile.incomes  || []).reduce((s,i) => s+(Number(i.incomeAmount)||0),  0);
  const totalExpense = (profile.expenses || []).reduce((s,e) => s+(Number(e.expenseAmount)||0), 0);
  const fmtDate = (d?: string) => { if (!d) return "—"; try { return new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); } catch { return d; } };
  const inputStyle: React.CSSProperties = { width:"100%", padding:"9px 12px", border:"1.5px solid #BFDBFE", borderRadius:8, fontSize:13, fontFamily:"inherit", outline:"none", background:"#F8FBFF", color:"#1E293B", boxSizing:"border-box" };

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={onBack} style={{ background:"none", border:"none", cursor:"pointer", color:"#2563EB", fontSize:22, padding:0 }}>←</button>
        <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:"#1E293B", flex:1 }}>Account Profile</h2>
        {!editing
          ? <button onClick={() => setEditing(true)} style={{ padding:"8px 18px", borderRadius:8, border:"1.5px solid #2563EB", background:"#EFF6FF", color:"#2563EB", fontWeight:700, fontSize:13, cursor:"pointer" }}>✏️ Edit</button>
          : <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setEditing(false)} disabled={saving} style={{ padding:"8px 16px", borderRadius:8, border:"1.5px solid #E2E8F0", background:"#fff", color:"#64748B", fontWeight:600, fontSize:13, cursor:"pointer" }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ padding:"8px 18px", borderRadius:8, border:"none", background:saving?"#93C5FD":"#2563EB", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" }}>{saving?"Saving…":"💾 Save"}</button>
            </div>
        }
      </div>
      {saveMsg && <div style={{ padding:"10px 16px", borderRadius:10, marginBottom:16, fontSize:13, fontWeight:600, background:saveMsg.startsWith("✅")?"#F0FDF4":"#FEF2F2", color:saveMsg.startsWith("✅")?"#16A34A":"#DC2626", border:`1px solid ${saveMsg.startsWith("✅")?"#BBF7D0":"#FECACA"}` }}>{saveMsg}</div>}
      
      <div style={{ borderRadius:20, padding:"28px 24px 24px", marginBottom:16, background:isPremium?"linear-gradient(135deg,#92400E,#D97706)":"linear-gradient(135deg,#1E3A5F,#2563EB)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:18 }}>
          <div style={{ position:"relative", flexShrink:0 }}>
            <div style={{ width:72, height:72, borderRadius:"50%", background:"rgba(255,255,255,0.2)", border:"3px solid rgba(255,255,255,0.45)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, fontWeight:800, color:"#fff", overflow:"hidden" }}>
              {avatarPreview ? <img src={avatarPreview} alt="avatar" style={{ width:"100%", height:"100%", objectFit:"cover" }}/> : initials}
            </div>
            {editing && <div onClick={() => avatarInputRef.current?.click()} style={{ position:"absolute", inset:0, borderRadius:"50%", background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}><span style={{ fontSize:20 }}>📷</span></div>}
            <input ref={avatarInputRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleAvatarChange}/>
          </div>
          <div style={{ flex:1 }}>
            <h2 style={{ fontSize:22, fontWeight:800, color:"#fff", margin:"0 0 4px" }}>{editing?form.name:profile.name||"User"}</h2>
            <p style={{ fontSize:13, color:"rgba(255,255,255,0.8)", margin:"0 0 10px" }}>{profile.email}</p>
            <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"5px 14px", borderRadius:100, fontSize:11, fontWeight:800, textTransform:"uppercase", background:"rgba(255,255,255,0.25)", border:"1px solid rgba(255,255,255,0.45)", color:"#fff" }}>
              {isPremium ? "✦ Premium Member" : "○ Free Account"}
            </span>
          </div>
        </div>
      </div>

      <div style={{ background:"#fff", borderRadius:16, border:"1px solid #E2E8F0", overflow:"hidden", marginBottom:16 }}>
        <div style={{ padding:"14px 20px 12px", borderBottom:"1px solid #F1F5F9", fontWeight:700, fontSize:13, color:"#475569", textTransform:"uppercase", letterSpacing:"0.06em" }}>👤 Personal Details</div>
        {editing ? (
          <div style={{ display:"flex", flexDirection:"column", gap:14, padding:"16px 20px" }}>
            {([{ label:"Full Name", key:"name", type:"text" },{ label:"Email", key:"email", type:"email" },{ label:"Date of Birth", key:"dob", type:"date" },{ label:"Location", key:"location", type:"text" },{ label:"Phone", key:"phone", type:"tel" }] as const).map(field => (
              <div key={field.key}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>{field.label}</label>
                <input type={field.type} value={(form as any)[field.key]} onChange={e => setForm(p => ({ ...p, [field.key]:e.target.value }))} style={inputStyle}/>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
            {[{ label:"Email", value:profile.email||"—" },{ label:"Date of Birth", value:fmtDate(profile.dob) },{ label:"Location", value:profile.location||"—" },{ label:"Phone", value:profile.phone||"—" },{ label:"Plan", value:profile.subscriptionPlanName||(isPremium?"Premium":"Free") },{ label:"Member Since", value:fmtDate(profile.createdAt) }].map(d => (
              <div key={d.label} style={{ padding:"14px 20px", borderBottom:"1px solid #F1F5F9", borderRight:"1px solid #F1F5F9" }}>
                <div style={{ fontSize:10, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>{d.label}</div>
                <div style={{ fontSize:14, fontWeight:600, color:"#0F172A" }}>{d.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(profile.incomes?.length || profile.expenses?.length) ? (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}>
          <div style={{ borderRadius:12, padding:16, background:"#F0FDF4", border:"1px solid #BBF7D0" }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", color:"#15803D", marginBottom:6 }}>💰 Total Income</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#16A34A" }}>₹{totalIncome.toLocaleString()}</div>
          </div>
          <div style={{ borderRadius:12, padding:16, background:"#FEF2F2", border:"1px solid #FECACA" }}>
            <div style={{ fontSize:10, fontWeight:700, textTransform:"uppercase", color:"#B91C1C", marginBottom:6 }}>💸 Total Expenses</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#DC2626" }}>₹{totalExpense.toLocaleString()}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// CARD & PROFILE ABOUT COLLAPSIBLES
// ─────────────────────────────────────────────────────────────────────────────
const LINE_LEN = 53; 
const CardAbout: React.FC<{ about: string }> = ({ about }) => {
  const [expanded, setExpanded] = useState(false);
  const clean = about.trim();

  const cut1 = (() => {
    if (clean.length <= LINE_LEN) return clean.length;
    const idx = clean.lastIndexOf(" ", LINE_LEN);
    return idx > 20 ? idx : LINE_LEN;
  })();

  const rest1 = clean.substring(cut1).trimStart();
  const cut2 = (() => {
    if (rest1.length <= LINE_LEN) return rest1.length;
    const idx = rest1.lastIndexOf(" ", LINE_LEN);
    return idx > 10 ? idx : LINE_LEN;
  })();

  const line1   = clean.substring(0, cut1).trimEnd();
  const line2   = rest1.substring(0, cut2).trimEnd();
  const hasMore = clean.length > cut1 + cut2;
  const preview = expanded ? clean : (hasMore ? `${line1}\n${line2}…` : clean);

  return (
    <div style={{ margin: "4px 0 4px", padding: 0, background: "transparent", border: "none", width: "100%" }}>
      <p style={{ margin: 0, fontSize: 12, color: "#64748B", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{preview}</p>
      {hasMore && (
        <button onClick={e => { e.stopPropagation(); setExpanded(v => !v); }} style={{ background: "none", border: "none", color: "#2563EB", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: "1px 0 0", letterSpacing: "0.01em", display: "block" }}>
          {expanded ? "Show less ↑" : "View more ↓"}
        </button>
      )}
    </div>
  );
};

const ProfileAbout: React.FC<{ about: string }> = ({ about }) => {
  const [expanded, setExpanded] = useState(false);
  const words = about.split(" ");
  const isLong = words.length > 28;
  const preview = isLong && !expanded ? words.slice(0, 28).join(" ") + "…" : about;
  return (
    <div style={{marginBottom:20}}>
      <h3 style={{fontSize:12,fontWeight:700,color:"#1E293B",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>About</h3>
      <p style={{fontSize:13,color:"#475569",lineHeight:1.7,margin:"0 0 4px"}}>{preview}</p>
      {isLong&&(
        <button onClick={()=>setExpanded(v=>!v)} style={{background:"none",border:"none",color:"#2563EB",fontSize:12,fontWeight:700,cursor:"pointer",padding:"2px 0",letterSpacing:"0.02em"}}>
          {expanded?"Show less ↑":"View more ↓"}
        </button>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function UserPage() {
  const navigate = useNavigate();

  // ── States ──
  const [tab, setTab]           = useState<"consultants"|"bookings"|"tickets"|"settings">("consultants");
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("All Consultants");
  const [toast, setToast]       = useState("");

  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [bookings, setBookings]       = useState<Booking[]>([]);
  const [loading, setLoading] = useState({ consultants:true, bookings:false, slots:false, tickets:false });

  const [currentUser, setCurrentUser] = useState<{ id?: number; name?: string; email?: string } | null>(null);

  // Booking Modal
  const [showModal, setShowModal]               = useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [masterSlots, setMasterSlots]           = useState<MasterSlot[]>([]);
  const [dbTimeslots, setDbTimeslots]           = useState<TimeSlotRecord[]>([]);
  const [bookedSlotSet, setBookedSlotSet]       = useState<Set<string>>(new Set());
  const [dayOffset, setDayOffset]               = useState(0);
  const [selectedDay, setSelectedDay]           = useState<DayItem>(DEFAULT_DAY);
  const [selectedSlot, setSelectedSlot]         = useState<SelectedSlot | null>(null);
  const [meetingMode, setMeetingMode]           = useState<"ONLINE"|"PHYSICAL"|"PHONE">("ONLINE");
  const [userNotes, setUserNotes]               = useState("");
  const [confirming, setConfirming]             = useState(false);

  // Profile Modal & Settings
  const [profileConsultant, setProfileConsultant] = useState<Consultant | null>(null);
  const [settingsView, setSettingsView] = useState<"menu"|"profile">("menu");
  const [showSubPopup, setShowSubPopup] = useState(false);

  // Tickets
  const [tickets, setTickets]                   = useState<Ticket[]>([]);
  const [ticketView, setTicketView]             = useState<"list"|"create"|"detail">("list");
  const [selectedTicket, setSelectedTicket]     = useState<Ticket | null>(null);
  const [ticketComments, setTicketComments]     = useState<TicketComment[]>([]);
  const [loadingComments, setLoadingComments]   = useState(false);
  const [newComment, setNewComment]             = useState("");
  const [postingComment, setPostingComment]     = useState(false);
  const [ticketFilter, setTicketFilter]         = useState<"ALL"|TicketStatus>("ALL");
  const [ticketForm, setTicketForm] = useState({ description:"", category:"General", priority:"MEDIUM" as TicketPriority });
  const [currentUserId, setCurrentUserId]       = useState<number | null>(null);
  const [ticketFile, setTicketFile]             = useState<File | null>(null);
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ticketFeedbackRating, setTicketFeedbackRating] = useState(0);
  const [ticketFeedbackText, setTicketFeedbackText]     = useState("");
  const [submittingTicketFeedback, setSubmittingTicketFeedback] = useState(false);

  // Booking feedback
  const [feedbackModal, setFeedbackModal]       = useState<FeedbackData | null>(null);
  const [feedbackRating, setFeedbackRating]     = useState(0);
  const [feedbackHover, setFeedbackHover]       = useState(0);
  const [feedbackComment, setFeedbackComment]   = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [submittedFeedbacks, setSubmittedFeedbacks] = useState<Set<number>>(new Set());

  const categories  = ["All Consultants","Tax Experts","Investment","Wealth","Retirement"];
  const visibleDays = ALL_DAYS.slice(dayOffset, dayOffset + VISIBLE_DAYS);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 4000); };
  const spinnerStyle: React.CSSProperties = { width:28, height:28, border:"3px solid #DBEAFE", borderTopColor:"#2563EB", borderRadius:"50%", animation:"spin 0.7s linear infinite", margin:"0 auto 12px" };

  // ─────────────────────────────────────────────────────────────────────────
  // FETCHERS
  // ─────────────────────────────────────────────────────────────────────────
  const mapConsultant = (d: any): Consultant => {
    let avatar = resolvePhotoUrl(d.profilePhoto || d.photo || d.avatarUrl || "");
    if (!avatar) avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(d.name||"C")}&background=2563EB&color=fff&bold=true`;
    return {
      id:d.id, name:d.name||"Expert Consultant", role:d.designation||"Financial Consultant",
      fee:Number(d.charges||0), tags:Array.isArray(d.skills)?d.skills:[],
      rating:Number(d.rating||4.8), exp:Number(d.experience||d.yearsOfExperience||5),
      reviews:Number(d.reviewCount||d.totalReviews||120), avatar,
      shiftStartTime:parseLocalTime(d.shiftStartTime), shiftEndTime:parseLocalTime(d.shiftEndTime),
      shiftTimings:d.shiftTimings||"", location:d.location||d.city||"Hyderabad",
      about:d.about||d.bio||d.description||"", languages:d.languages||"", phone:d.phone||"",
      email: d.email || d.emailId || d.emailAddress || "",
    };
  };

  const fetchConsultants = async () => {
    setLoading(p => ({ ...p, consultants:true }));
    try { const res = await getAllConsultants(); setConsultants((Array.isArray(res)?res:[]).map(mapConsultant)); }
    catch { showToast("Could not load consultants."); }
    finally { setLoading(p => ({ ...p, consultants:false })); }
  };

  // ✅ ROBUST BOOKING FETCHING LOGIC
  const fetchBookings = async () => {
    setLoading(p => ({ ...p, bookings:true }));
    try {
      const [raw, masters] = await Promise.all([getMyBookings(), fetchMasterTimeslots()]);
      if (!Array.isArray(raw)) { setBookings([]); return; }

      const masterMap: Record<string, string> = {};
      masters.forEach(ms => { masterMap[String(ms.id)] = ms.timeRange; });

      const uniqueSlotIds = [...new Set(raw.map((b: any) => b.timeSlotId).filter(Boolean))] as number[];
      const slotDetailMap: Record<number, TimeSlotRecord> = {};
      await Promise.all(uniqueSlotIds.map(id => apiFetch(`${BASE_URL}/timeslots/${id}`).then((s: any) => { slotDetailMap[id] = s; }).catch(() => {})));

      const mapped = raw.map((b: any) => {
        const slotDetail = slotDetailMap[b.timeSlotId];
        const slotDate = slotDetail?.slotDate || b.bookingDate || b.slotDate || b.date || b.booking_date || "";
        const slotTime = (slotDetail?.slotTime || b.slotTime || "").substring(0, 5);

        const masterIdCandidates = [slotDetail?.masterTimeSlotId, b.masterTimeslotId, b.masterSlotId, b.timeSlotId].filter(v => v != null);
        let timeRange = "";
        for (const c of masterIdCandidates) { if (masterMap[String(c)]) { timeRange = masterMap[String(c)]; break; } }
        if (!timeRange && slotTime) timeRange = toAmPm(slotTime);

        const consultantName = b.consultantName || b.consultant?.name || b.advisorName || "";
        return {
          ...b,
          consultantName: consultantName || "Loading…",
          slotDate, slotTime, timeRange,
          meetingMode: b.meetingMode || b.meeting_mode || "",
          BookingStatus: (b.BookingStatus || b.bookingStatus || b.status || "PENDING").toUpperCase(),
        };
      });

      mapped.sort((a: any, b: any) => (b.slotDate || "").localeCompare(a.slotDate || ""));
      setBookings(mapped);

      const needsName = mapped.filter((b: any) => b.consultantName === "Loading…" && b.consultantId);
      if (needsName.length > 0) {
        const ids = [...new Set(needsName.map((b: any) => b.consultantId))] as number[];
        const cMap: Record<number, any> = {};
        await Promise.all(ids.map(id => getConsultantById(id).then(d => { cMap[id] = d; }).catch(() => {})));
        setBookings(prev => prev.map(b => ({ ...b, consultantName: cMap[(b as any).consultantId]?.name || b.consultantName })));
      }
    } catch { setBookings([]); }
    finally { setLoading(p => ({ ...p, bookings:false })); }
  };

  const fetchTickets = async () => {
    setLoading(p => ({ ...p, tickets:true }));
    try { const data = await fetchMyTickets(currentUserId); setTickets(data); }
    catch { showToast("Failed to load tickets."); }
    finally { setLoading(p => ({ ...p, tickets:false })); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // INIT & HOOKS
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchConsultants();
    (async () => {
      try {
        const user = await getCurrentUser();
        const uid = user?.id ? Number(user.id) : null;
        if (uid) setCurrentUserId(uid);
        setCurrentUser({ id: uid ?? undefined, name: user?.name || user?.fullName || "", email: user?.email || user?.emailId || "" });

        // Normalize string for SUBSCRIBER
        const userRole = String(user?.role || "").trim().toUpperCase();
        if (["SUBSCRIBER","SUBSCRIBED","PREMIUM"].includes(userRole)) {
          if (!sessionStorage.getItem("sub_popup_shown")) {
            setShowSubPopup(true);
            sessionStorage.setItem("sub_popup_shown", "true");
          }
        }

        if (uid) { const t = await fetchMyTickets(uid); setTickets(t); }
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (tab==="bookings") fetchBookings(); }, [tab]);
  useEffect(() => {
    if (tab==="tickets") { fetchTickets(); setTicketView("list"); }
    if (tab==="settings") setSettingsView("menu");
  }, [tab]);

  useEffect(() => {
    const onVisible = async () => {
      if (document.visibilityState!=="visible") return;
      const raw = localStorage.getItem(PENDING_FEEDBACK_KEY); if (!raw) return;
      localStorage.removeItem(PENDING_FEEDBACK_KEY);
      const bookingId = Number(raw); if (!bookingId) return;
      setTab("bookings");
      const findAndOpen = (list: Booking[]) => { const found=(list as any[]).find((b:any)=>b.id===bookingId); if (found) { setTimeout(()=>handleOpenFeedback(found),300); return true; } return false; };
      if (!findAndOpen(bookings)) {
        setLoading(p => ({...p,bookings:true}));
        try {
          const [raw2, masters] = await Promise.all([getMyBookings(), fetchMasterTimeslots()]);
          if (!Array.isArray(raw2)) return;
          const masterMap: Record<string,string> = {};
          masters.forEach((ms:any) => { masterMap[String(ms.id)]=ms.timeRange; });
          const mapped = raw2.map((b:any) => ({...b, BookingStatus:(b.BookingStatus||b.status||"PENDING").toUpperCase(), slotDate:b.bookingDate||b.slotDate||"", timeRange:b.timeRange||b.timeSlot?.masterTimeSlot?.timeRange||(b.slotTime?toAmPm(b.slotTime):"") }));
          setBookings(mapped as Booking[]); findAndOpen(mapped as Booking[]);
        } finally { setLoading(p=>({...p,bookings:false})); }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings]);

  // ─────────────────────────────────────────────────────────────────────────
  // ACTION HANDLERS
  // ─────────────────────────────────────────────────────────────────────────
  const handleOpenFeedback = async (b: any) => {
    let existingFeedback = null;
    try { existingFeedback = await apiFetch(`${BASE_URL}/feedbacks/booking/${b.id}`); } catch {}
    setFeedbackModal({ bookingId:b.id, consultantId:b.consultantId, consultantName:b.consultantName||"Consultant", slotDate:b.slotDate||b.bookingDate||"", timeRange:b.timeRange||(b.slotTime?toAmPm(b.slotTime):""), existingFeedback:existingFeedback||null });
    setFeedbackRating(existingFeedback?.rating||0); setFeedbackComment(existingFeedback?.comments||""); setFeedbackHover(0);
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackModal || feedbackRating===0) { showToast("⚠️ Please select a star rating."); return; }
    setSubmittingFeedback(true);
    try {
      const user = await getCurrentUser();
      if (!user?.id) { showToast("Unable to identify user."); return; }
      const payload = { userId:user.id, consultantId:feedbackModal.consultantId, meetingId:feedbackModal.bookingId, bookingId:feedbackModal.bookingId, rating:feedbackRating, comments:feedbackComment.trim()||"" };
      if (feedbackModal.existingFeedback?.id) { await apiFetch(`${BASE_URL}/feedbacks/${feedbackModal.existingFeedback.id}`, { method:"PUT", body:JSON.stringify(payload) }); showToast("✅ Feedback updated!"); }
      else { await apiFetch(`${BASE_URL}/feedbacks`, { method:"POST", body:JSON.stringify(payload) }); showToast("✅ Thank you for your feedback!"); }
      setSubmittedFeedbacks(prev => new Set([...prev, feedbackModal.bookingId]));
      setFeedbackModal(null); setFeedbackRating(0); setFeedbackComment("");
    } catch (err: any) { showToast(`❌ ${err.message}`); }
    finally { setSubmittingFeedback(false); }
  };

  const handleCreateTicket = async () => {
    if (!ticketForm.description.trim()) return;
    setSubmittingTicket(true);
    try {
      // ✅ MULTIPART FORM DATA LOGIC
      const formData = new FormData();
      const ticketData = JSON.stringify({
        userId: currentUserId || null,
        category: ticketForm.category,
        description: ticketForm.description.trim(),
        priority: ticketForm.priority,
        status: "NEW",
      });
      formData.append("ticketData", new Blob([ticketData], { type: "application/json" }));
      if (ticketFile) formData.append("file", ticketFile);

      await apiFetch(`${BASE_URL}/tickets`, { method: "POST", body: formData });
      
      setTicketFile(null); if (fileInputRef.current) fileInputRef.current.value="";
      setTicketForm({ description:"", category:"General", priority:"MEDIUM" });
      showToast("✅ Ticket submitted!");
      const updated = await fetchMyTickets(currentUserId); setTickets(updated); setTicketView("list");
    } catch (e: any) { showToast(`❌ ${e.message}`); }
    finally { setSubmittingTicket(false); }
  };

  const handleOpenTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket); setTicketView("detail"); setNewComment("");
    setTicketFeedbackRating(ticket.feedbackRating||0); setTicketFeedbackText(ticket.feedbackText||"");
    setLoadingComments(true);
    try { const c = await fetchTicketComments(ticket.id); setTicketComments(c); }
    catch { setTicketComments([]); }
    finally { setLoadingComments(false); }
  };

  const handlePostComment = async () => {
    if (!newComment.trim()||!selectedTicket) return;
    setPostingComment(true);
    try { const comment = await postTicketComment(selectedTicket.id, newComment); setTicketComments(prev => [...prev, comment]); setNewComment(""); }
    catch { setTicketComments(prev => [...prev, { id:Date.now(), ticketId:selectedTicket.id, authorName:"You", authorRole:"CUSTOMER", message:newComment, createdAt:new Date().toISOString() }]); setNewComment(""); }
    finally { setPostingComment(false); }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) return;
    try { await closeTicket(selectedTicket.id); setSelectedTicket(prev => prev?{...prev,status:"CLOSED"}:prev); setTickets(prev => prev.map(t => t.id===selectedTicket.id?{...t,status:"CLOSED"}:t)); showToast("Ticket closed."); }
    catch { showToast("❌ Could not close ticket."); }
  };

  const handleSubmitTicketFeedback = async () => {
    if (!selectedTicket||ticketFeedbackRating===0) return;
    setSubmittingTicketFeedback(true);
    try { await submitTicketFeedback(selectedTicket.id, ticketFeedbackRating, ticketFeedbackText); setSelectedTicket(prev => prev?{...prev,feedbackRating:ticketFeedbackRating,feedbackText:ticketFeedbackText}:prev); showToast("✅ Feedback submitted!"); }
    catch { showToast("❌ Could not submit feedback."); }
    finally { setSubmittingTicketFeedback(false); }
  };

  const handleOpenModal = async (c: Consultant) => {
    setSelectedConsultant(c); setMasterSlots([]); setDbTimeslots([]);
    setBookedSlotSet(new Set()); setDayOffset(0); setSelectedDay(DEFAULT_DAY);
    setSelectedSlot(null); setMeetingMode("ONLINE"); setUserNotes(""); setShowModal(true);
    setLoading(p => ({...p,slots:true}));
    try {
      const [masters, bookingsRaw] = await Promise.all([fetchMasterTimeslots(), apiFetch(`${BASE_URL}/bookings/consultant/${c.id}`).catch(()=>[])]);
      setMasterSlots(Array.isArray(masters)?masters:[]);
      let tsRecords: TimeSlotRecord[] = [];
      try {
        const tsData = await apiFetch(`${BASE_URL}/timeslots/consultant/${c.id}`);
        tsRecords = Array.isArray(tsData)?tsData:(tsData?.content||[]);
        setDbTimeslots(tsRecords);
      } catch {}
      const bSet = new Set<string>();
      const bArr = Array.isArray(bookingsRaw)?bookingsRaw:(bookingsRaw?.content||[]);
      bArr.forEach((b: any) => {
        const st=(b.status||b.BookingStatus||b.bookingStatus||"").toUpperCase();
        if (st==="CANCELLED") return;
        const date=b.slotDate||b.bookingDate||b.date||"";
        let timeKey="";
        if (b.slotTime) { timeKey=b.slotTime.substring(0,5); }
        else { const tr=b.timeSlot?.masterTimeSlot?.timeRange||b.masterTimeSlot?.timeRange||b.timeRange||""; timeKey=normalise24(tr); }
        if (date&&timeKey) bSet.add(`${date}|${timeKey}`);
      });
      tsRecords.forEach(s => {
        const st = (s.status||"").toUpperCase();
        if (st==="AVAILABLE") return;
        const rawTime = (s as any).slotTime || (s as any).slot_time || "";
        let timeKey = "";
        if (typeof rawTime === "object" && rawTime?.hour !== undefined) {
          timeKey = `${String(rawTime.hour).padStart(2,"0")}:${String(rawTime.minute??0).padStart(2,"0")}`;
        } else if (typeof rawTime === "string" && rawTime.length >= 5) {
          timeKey = rawTime.substring(0,5);
        }
        if (!timeKey) timeKey = normalise24((s as any).timeRange||"");
        if (s.slotDate && timeKey) bSet.add(`${s.slotDate}|${timeKey}`);
      });
      setBookedSlotSet(bSet);
    } catch (e) { console.error("Modal data load failed:", e); }
    finally { setLoading(p=>({...p,slots:false})); }
  };

  const handleConfirm = async () => {
    if (!selectedSlot||!selectedConsultant) return;
    setConfirming(true);
    try {
      const slot24=selectedSlot.start24h, slotTimeFull=slot24.length===5?`${slot24}:00`:slot24, token=getToken();
      const fetchTimeslotId = async (): Promise<number|null> => {
        try { const data=await apiFetch(`${BASE_URL}/timeslots/consultant/${selectedConsultant.id}`); const arr: TimeSlotRecord[]=Array.isArray(data)?data:(data?.content||[]); const match=arr.find(s=>s.slotDate===selectedDay.iso&&(s.slotTime||"").substring(0,5)===slot24); return match?.id??null; } catch { return null; }
      };
      let realTimeslotId: number|null = selectedSlot.timeslotId??null;
      if (!realTimeslotId) realTimeslotId=await fetchTimeslotId();
      if (!realTimeslotId) {
        try {
          const singlePayload: any={consultantId:selectedConsultant.id,slotDate:selectedDay.iso,slotTime:slotTimeFull,durationMinutes:60,status:"AVAILABLE"};
          if (selectedSlot.masterId>0) singlePayload.masterTimeSlotId=selectedSlot.masterId;
          const singleRes=await fetch(`${BASE_URL}/timeslots`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(singlePayload)});
          if (singleRes.ok) { const ct=singleRes.headers.get("content-type")||""; if (ct.includes("application/json")) { const created=await singleRes.json(); if (created?.id) realTimeslotId=created.id; } }
        } catch {}
        if (!realTimeslotId&&selectedSlot.masterId>0) {
          try {
            const rawRes=await fetch(`${BASE_URL}/timeslots/bulk`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({timeSlots:[{consultantId:selectedConsultant.id,slotDate:selectedDay.iso,slotTime:slotTimeFull,durationMinutes:60,masterTimeSlotId:selectedSlot.masterId,status:"AVAILABLE"}]})});
            const ct=rawRes.headers.get("content-type")||"";
            if (ct.includes("application/json")) {
              const bulkData=await rawRes.json();
              const items: any[]=Array.isArray(bulkData)?bulkData:Array.isArray(bulkData?.created)?bulkData.created:Array.isArray(bulkData?.timeSlots)?bulkData.timeSlots:bulkData?.id?[bulkData]:[];
              const found=items.find(s=>s.slotDate===selectedDay.iso&&(s.slotTime||"").substring(0,5)===slot24)||items[0];
              if (found?.id) realTimeslotId=found.id;
            }
          } catch {}
        }
        if (!realTimeslotId) realTimeslotId=await fetchTimeslotId();
      }
      if (!realTimeslotId) { showToast("❌ Could not resolve time slot. Please try again."); return; }

      const payload: any={
        consultantId:selectedConsultant.id, timeSlotId:realTimeslotId,
        amount:selectedConsultant.fee, userNotes:userNotes||"Booked via app",
        meetingMode, bookingDate:selectedDay.iso, slotDate:selectedDay.iso,
        slotTime:slotTimeFull, timeRange:selectedSlot.label,
        masterTimeslotId:selectedSlot.masterId>0?selectedSlot.masterId:undefined,
      };
      const bookingResult = await createBooking(payload);

      const newBookingId: number = bookingResult?.id ?? bookingResult?.bookingId ?? Date.now();

      setBookedSlotSet(prev=>{const next=new Set(prev);next.add(`${selectedDay.iso}|${slot24}`);return next;});
      setDbTimeslots(prev=>{
        const existing=prev.find(s=>s.slotDate===selectedDay.iso&&(s.slotTime||"").substring(0,5)===slot24);
        if(existing) return prev.map(s=>s.slotDate===selectedDay.iso&&(s.slotTime||"").substring(0,5)===slot24?{...s,status:"BOOKED"}:s);
        return [...prev,{id:realTimeslotId!,slotDate:selectedDay.iso,slotTime:slotTimeFull,status:"BOOKED",masterTimeSlotId:selectedSlot.masterId>0?selectedSlot.masterId:undefined}];
      });

      setShowModal(false);
      showToast(`✅ Booked for ${selectedDay.date} ${selectedDay.month} · ${selectedSlot.label} — Confirmation email sent!`);
      setTab("bookings");
      fetchBookings();

      let consultantEmail = selectedConsultant.email || "";
      if (!consultantEmail) {
        try { const cData = await getConsultantById(selectedConsultant.id); consultantEmail = cData?.email || cData?.emailId || cData?.emailAddress || ""; } catch {}
      }

      sendBookingEmails({
        bookingId:       newBookingId,
        slotDate:        selectedDay.iso,
        timeRange:       selectedSlot.label,
        meetingMode,
        amount:          selectedConsultant.fee,
        userName:        currentUser?.name  || "User",
        userEmail:       currentUser?.email || "",
        consultantName:  selectedConsultant.name,
        consultantEmail,
        userNotes:       userNotes || "",
      }).catch(() => {});

    } catch (err: any) {
      const msg=(err.message||"").toLowerCase();
      if (msg.includes("no longer available")||msg.includes("conflict")||msg.includes("409")) {
        showToast("⚠️ Slot just taken. Please pick another time.");
        if (selectedConsultant) handleOpenModal(selectedConsultant);
      } else {
        showToast(`❌ Booking failed: ${err.message}`);
      }
    } finally { setConfirming(false); }
  };

  const handleLogout = () => { logoutUser(); navigate("/login",{replace:true}); };

  const handleGoToProfile = () => {
    setTab("settings");
    setSettingsView("profile");
  };

  const filteredList = consultants.filter(c => {
    const q=search.toLowerCase();
    return (c.name.toLowerCase().includes(q)||c.role.toLowerCase().includes(q))&&(category==="All Consultants"||c.role.includes(category.replace(" Experts","")));
  });

  const hourlySlotTimes = generateHourlySlots(
    (selectedConsultant?.shiftStartTime||"").substring(0,5),
    (selectedConsultant?.shiftEndTime  ||"").substring(0,5)
  );
  const hasShift = !!(selectedConsultant?.shiftStartTime&&selectedConsultant?.shiftEndTime&&hourlySlotTimes.length>0);
  const ticketCounts = { ALL:tickets.length, NEW:tickets.filter(t=>t.status==="NEW").length, OPEN:tickets.filter(t=>t.status==="OPEN").length, PENDING:tickets.filter(t=>t.status==="PENDING").length, RESOLVED:tickets.filter(t=>t.status==="RESOLVED").length, CLOSED:tickets.filter(t=>t.status==="CLOSED").length };
  const filteredTickets = ticketFilter==="ALL"?tickets:tickets.filter(t=>t.status===ticketFilter);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.logoSection}>
          <div className={styles.logoText}>FINADVISE</div>
          <div className={styles.logoSub}>CONSULTANT BOOKING</div>
        </div><div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button
            onClick={handleGoToProfile}
            title="My Profile"
            style={{
              width: 36, height: 36, borderRadius: "50%",
              border: "1.5px solid #BFDBFE",
              background: "linear-gradient(135deg,#1E3A5F,#2563EB)",
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", flexShrink: 0,
              boxShadow: "0 2px 8px rgba(37,99,235,0.25)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.08)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 14px rgba(37,99,235,0.4)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)";
              (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 2px 8px rgba(37,99,235,0.25)";
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/>
              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </button>
          <button onClick={handleLogout} className={styles.backBtn}>Logout</button>
        </div>
      </header>

      {toast && <div className={styles.toast}>{toast}</div>}

      <main className={styles.content}>

        {/* ════ CONSULTANTS ════ */}
        {tab==="consultants" && (
          <div className={styles.tabPadding}>
            <div className={styles.searchWrapper}>
              <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35" strokeLinecap="round"/></svg>
              <input className={styles.searchInput} placeholder="Search by name, specialisation..." value={search} onChange={e => setSearch(e.target.value)}/>
            </div>
            <div className={styles.categoryRow}>
              {categories.map(c=><button key={c} onClick={()=>setCategory(c)} className={`${styles.categoryBtn} ${category===c?styles.categoryBtnActive:""}`}>{c}</button>)}
            </div>
            {loading.consultants ? (
              <div className={styles.emptyState}><div className={styles.spinner}/><p style={{color:"#94A3B8",marginTop:12,fontSize:14}}>Loading consultants…</p></div>
            ) : filteredList.length===0 ? (
              <div className={styles.emptyState}><div style={{fontSize:36,marginBottom:12}}>🔍</div><p style={{margin:0,fontWeight:600}}>No consultants found.</p></div>
            ) : (
              <div className={styles.consultantList}>
                {filteredList.map(c=>(
                  <div key={c.id} className={styles.consultantCard}>
                    <div style={{width:72,height:72,borderRadius:"50%",flexShrink:0,background:"linear-gradient(135deg,#1E3A5F,#2563EB)",border:"3px solid #DBEAFE",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700,color:"#fff",alignSelf:"center"}}>
                      {c.avatar?<img src={c.avatar} alt={c.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>:c.name.substring(0,2).toUpperCase()}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:16,fontWeight:700,color:"#0F172A",marginBottom:2}}>{c.name}</div>
                      <div style={{fontSize:13,color:"#2563EB",fontWeight:600,marginBottom:6}}>{c.role}</div>
                      {c.tags.length>0&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>{c.tags.slice(0,3).map((t,i)=><span key={i} style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#EFF6FF",color:"#2563EB",fontWeight:600}}>{t}</span>)}</div>}
                      {c.about&&<CardAbout about={c.about}/>}
                      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginTop:6}}>
                        {c.exp>0&&<span style={{fontSize:12,color:"#64748B"}}>⏱ {c.exp}+ yrs</span>}
                        <span style={{fontSize:12,color:"#64748B"}}>⭐ {c.rating.toFixed(1)}{c.reviews>0?` (${c.reviews})`:""}</span>
                        <span style={{fontSize:12,color:"#64748B",display:"flex",alignItems:"center",gap:3}}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>
                          {c.location}
                        </span>
                        {c.languages&&<span style={{fontSize:12,color:"#64748B"}}>🌐 {c.languages}</span>}
                      </div>
                    </div>
                    <div className={styles.cardRight}>
                      <div style={{fontSize:18,fontWeight:800,color:"#0F172A",whiteSpace:"nowrap"}}>₹{c.fee.toLocaleString()}<span style={{fontSize:11,fontWeight:500,color:"#94A3B8",marginLeft:3}}>/session</span></div>
                      <button className={styles.viewProfileBtn} onClick={()=>setProfileConsultant(c)}>View Profile</button>
                      <button className={styles.bookBtn} onClick={()=>handleOpenModal(c)}>Book Now</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════ BOOKINGS ════ */}
        {tab==="bookings" && (
          <div className={styles.tabPadding}>
            <div className={styles.titleSection}>
              <h2 className={styles.sectionTitle}>My Bookings</h2>
              <button className={styles.historyButton} onClick={fetchBookings} disabled={loading.bookings} style={{display:"flex",alignItems:"center",gap:6}}>{loading.bookings?"⏳":"↻"} Refresh</button>
            </div>
            {loading.bookings ? (
              <div style={{textAlign:"center",padding:40}}><div style={spinnerStyle}/></div>
            ) : bookings.length===0 ? (
              <div className={styles.emptyState}><div style={{fontSize:36,marginBottom:12}}>📅</div><p style={{margin:0,fontWeight:600,color:"#64748B"}}>No bookings yet.</p><p style={{margin:"6px 0 0",fontSize:13,color:"#94A3B8"}}>Book from the Consultants tab.</p></div>
            ) : (
              <div className={styles.bookingsList}>
                {bookings.map(b=>{
                  const bAny=b as any;
                  const displayDate=bAny.slotDate||bAny.bookingDate||"—";
                  const displayTime=bAny.timeRange||(bAny.slotTime?toAmPm(bAny.slotTime):"");
                  const displayMode=bAny.meetingMode||"";
                  const status=(b.BookingStatus||"").toUpperCase();
                  const isCompleted=status==="COMPLETED", isCancelled=status==="CANCELLED";
                  const hasFeedback=submittedFeedbacks.has(b.id);
                  const modeLabel = displayMode==="ONLINE"?"💻 Online":displayMode==="PHONE"?"📞 Phone":displayMode==="PHYSICAL"?"🏢 In-Person":displayMode?`🏢 ${displayMode}`:"";
                  return (
                    <div key={b.id} className={styles.bookingCard}>
                      <div className={styles.cardHeader}>
                        <div className={styles.calendarIcon}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18" strokeLinecap="round"/></svg></div>
                        <div className={styles.cardInfo}>
                          <div className={styles.sessionTitle}>Session with {b.consultantName}</div>
                          <div className={styles.sessionDateTime}>
                            {displayDate}
                            {displayTime&&<span className={styles.bookedTimePill}>{displayTime}</span>}
                            {modeLabel&&<span> · {modeLabel}</span>}
                          </div>
                          <div style={{marginTop:4,fontSize:11,color:"#94A3B8"}}>🔗 Room: <span style={{fontFamily:"monospace",color:"#2563EB"}}>finadvise-booking-{b.id}</span></div>
                        </div>
                        <div className={styles.statusBadgeWrapper}><StatusBadge status={b.BookingStatus as any}/></div>
                      </div>
                      <div className={styles.cardActions}>
                        {!isCancelled&&<button className={styles.joinButton} onClick={()=>{localStorage.setItem(PENDING_FEEDBACK_KEY,String(b.id));window.open(JITSI_URL(b.id),"_blank");}}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:6}}><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14"/><rect x="3" y="6" width="12" height="12" rx="2"/></svg>
                          Join Meeting
                        </button>}
                        {isCompleted&&<button onClick={()=>handleOpenFeedback(bAny)} style={{padding:"10px 16px",borderRadius:8,border:hasFeedback?"1.5px solid #86EFAC":"1.5px solid #FCD34D",background:hasFeedback?"#F0FDF4":"#FFFBEB",color:hasFeedback?"#16A34A":"#D97706",fontWeight:600,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:5,fontFamily:"inherit"}}>{hasFeedback?"⭐ Edit Feedback":"⭐ Leave Feedback"}</button>}
                        <button className={styles.rescheduleButton}>Reschedule</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════ TICKETS ════ */}
        {tab==="tickets" && (
          <div className={styles.tabPadding}>
            {ticketView==="list" && (
              <>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
                  <h2 className={styles.sectionTitle} style={{margin:0}}>Support Tickets</h2>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={fetchTickets} disabled={loading.tickets} className={styles.ticketRefreshBtn}>{loading.tickets?"⏳":"↻"} Refresh</button>
                    <button onClick={()=>setTicketView("create")} className={styles.ticketNewBtn}>+ New Ticket</button>
                  </div>
                </div>
                <div className={styles.ticketFilterRow}>
                  {(["ALL","NEW","OPEN","PENDING","RESOLVED","CLOSED"] as const).map(f=>(
                    <button key={f} onClick={()=>setTicketFilter(f)} className={`${styles.ticketFilterBtn} ${ticketFilter===f?styles.ticketFilterBtnActive:""}`}>
                      {f==="ALL"?"All":TICKET_STATUS_CONFIG[f as TicketStatus].label} ({ticketCounts[f]})
                    </button>
                  ))}
                </div>
                {loading.tickets ? (
                  <div style={{textAlign:"center",padding:48}}><div style={spinnerStyle}/></div>
                ) : filteredTickets.length===0 ? (
                  <div className={styles.emptyState}><div style={{fontSize:40,marginBottom:12}}>🎫</div><p style={{margin:0,fontWeight:600,color:"#64748B"}}>{tickets.length===0?"No tickets yet.":"No tickets in this status."}</p>{tickets.length===0&&<button onClick={()=>setTicketView("create")} style={{marginTop:16,padding:"10px 22px",background:"#2563EB",color:"#fff",border:"none",borderRadius:8,fontWeight:600,cursor:"pointer",fontSize:13}}>Raise your first ticket</button>}</div>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:12}}>
                    {filteredTickets.map(ticket=>{
                      const sc=TICKET_STATUS_CONFIG[ticket.status], pc=TICKET_PRIORITY_CONFIG[ticket.priority];
                      return (
                        <div key={ticket.id} onClick={()=>handleOpenTicket(ticket)} className={styles.ticketCard} style={{borderLeft:`4px solid ${sc.border}`}}>
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,flexWrap:"wrap"}}>
                                <span style={{fontSize:11,fontWeight:700,color:"#94A3B8",fontFamily:"monospace"}}>#{ticket.id}</span>
                                <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,background:pc.bg,color:pc.color}}>⚑ {pc.label}</span>
                                <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,background:"#F1F5F9",color:"#64748B"}}>{ticket.category}</span>
                              </div>
                              <div style={{fontSize:15,fontWeight:700,color:"#0F172A",marginBottom:6}}>{ticket.category} — #{ticket.id}</div>
                              <div style={{fontSize:12,color:"#94A3B8"}}>{new Date(ticket.createdAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}{ticket.agentName&&` · ${ticket.agentName}`}</div>
                            </div>
                            <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
                              <span style={{padding:"4px 12px",borderRadius:20,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,fontSize:11,fontWeight:700,whiteSpace:"nowrap"}}>{sc.icon} {sc.label}</span>
                              <span style={{fontSize:11,color:"#94A3B8"}}>View →</span>
                            </div>
                          </div>
                          <div style={{marginTop:12,paddingTop:12,borderTop:"1px solid #F8FAFC"}}><TicketStepper status={ticket.status}/></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {ticketView==="create" && (
              <>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
                  <button onClick={()=>setTicketView("list")} style={{background:"none",border:"none",cursor:"pointer",color:"#2563EB",fontSize:22,padding:0}}>←</button>
                  <h2 className={styles.sectionTitle} style={{margin:0}}>Raise a Support Ticket</h2>
                </div>
                <div style={{background:"#fff",borderRadius:16,border:"1px solid #E2E8F0",overflow:"hidden"}}>
                  <div style={{background:"linear-gradient(135deg,#1E3A5F,#2563EB)",padding:"20px 24px"}}>
                    <div style={{fontSize:11,color:"#93C5FD",fontWeight:700,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:4}}>New Support Request</div>
                    <div style={{fontSize:18,fontWeight:700,color:"#fff"}}>Tell us about your issue</div>
                  </div>
                  <div style={{padding:24}}>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:16}}>
                      <div>
                        <label style={{display:"block",fontSize:12,fontWeight:700,color:"#475569",marginBottom:6,textTransform:"uppercase"}}>Category</label>
                        <select value={ticketForm.category} onChange={e=>setTicketForm(p=>({...p,category:e.target.value}))} style={{width:"100%",padding:"11px 14px",border:"1.5px solid #E2E8F0",borderRadius:10,fontSize:13,outline:"none",background:"#fff",fontFamily:"inherit"}}>
                          {TICKET_CATEGORIES.map(c=><option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{display:"block",fontSize:12,fontWeight:700,color:"#475569",marginBottom:6,textTransform:"uppercase"}}>Priority</label>
                        <select value={ticketForm.priority} onChange={e=>setTicketForm(p=>({...p,priority:e.target.value as TicketPriority}))} style={{width:"100%",padding:"11px 14px",border:"1.5px solid #E2E8F0",borderRadius:10,fontSize:13,outline:"none",background:"#fff",fontFamily:"inherit"}}>
                          {TICKET_PRIORITIES.map(p=><option key={p} value={p}>{TICKET_PRIORITY_CONFIG[p].label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{marginBottom:16}}>
                      <label style={{display:"block",fontSize:12,fontWeight:700,color:"#475569",marginBottom:6,textTransform:"uppercase"}}>Description *</label>
                      <textarea value={ticketForm.description} onChange={e=>setTicketForm(p=>({...p,description:e.target.value}))} placeholder="Please describe your issue in detail." rows={5} style={{width:"100%",padding:"11px 14px",border:"1.5px solid #E2E8F0",borderRadius:10,fontSize:13,outline:"none",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit",lineHeight:1.6}}/>
                    </div>
                    <div style={{marginBottom:24}}>
                      <label style={{display:"block",fontSize:12,fontWeight:700,color:"#475569",marginBottom:6,textTransform:"uppercase"}}>Attachment (optional)</label>
                      <div onClick={()=>fileInputRef.current?.click()} style={{display:"flex",alignItems:"center",gap:10,padding:"11px 14px",border:"1.5px dashed #BFDBFE",borderRadius:10,background:"#F8FBFF",cursor:"pointer"}}>
                        <span style={{fontSize:20}}>📎</span>
                        <span style={{fontSize:13,flex:1,color:ticketFile?"#1E3A5F":"#94A3B8"}}>{ticketFile?ticketFile.name:"Click to upload…"}</span>
                        {ticketFile&&<button onClick={e=>{e.stopPropagation();setTicketFile(null);if(fileInputRef.current)fileInputRef.current.value="";}} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:18,padding:"0 2px"}}>✕</button>}
                      </div>
                      <input ref={fileInputRef} type="file" style={{display:"none"}} accept="image/*,.pdf,.doc,.docx,.txt" onChange={e=>setTicketFile(e.target.files?.[0]||null)}/>
                    </div>
                    <div style={{display:"flex",gap:12}}>
                      <button onClick={handleCreateTicket} disabled={submittingTicket||!ticketForm.description.trim()} style={{flex:1,padding:13,borderRadius:10,border:"none",background:!ticketForm.description.trim()?"#E2E8F0":"linear-gradient(135deg,#2563EB,#1D4ED8)",color:!ticketForm.description.trim()?"#94A3B8":"#fff",fontSize:14,fontWeight:700,cursor:"pointer",opacity:submittingTicket?0.7:1}}>{submittingTicket?"Submitting…":"Submit Ticket"}</button>
                      <button onClick={()=>setTicketView("list")} style={{padding:"13px 20px",borderRadius:10,border:"1.5px solid #E2E8F0",background:"#fff",color:"#64748B",fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancel</button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {ticketView==="detail" && selectedTicket && (
              <>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20}}>
                  <button onClick={()=>{setTicketView("list");setSelectedTicket(null);}} style={{background:"none",border:"none",cursor:"pointer",color:"#2563EB",fontSize:22,padding:0}}>←</button>
                  <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#0F172A"}}>{selectedTicket.category} — #{selectedTicket.id}</h2>
                </div>
                <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",padding:20,marginBottom:16}}>
                  {(()=>{const sc=TICKET_STATUS_CONFIG[selectedTicket.status],pc=TICKET_PRIORITY_CONFIG[selectedTicket.priority];return(<div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:8}}><span style={{padding:"4px 12px",borderRadius:20,background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,fontSize:12,fontWeight:700}}>{sc.icon} {sc.label}</span><span style={{padding:"4px 12px",borderRadius:20,background:pc.bg,color:pc.color,fontSize:12,fontWeight:700}}>⚑ {pc.label}</span><span style={{padding:"4px 12px",borderRadius:20,background:"#F1F5F9",color:"#64748B",fontSize:12,fontWeight:600}}>{selectedTicket.category}</span></div>)})()}
                  <TicketStepper status={selectedTicket.status}/>
                </div>
                <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",padding:20,marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Description</div>
                  <p style={{margin:0,fontSize:14,color:"#374151",lineHeight:1.7}}>{selectedTicket.description}</p>
                </div>
                <div style={{background:"#fff",borderRadius:14,border:"1px solid #E2E8F0",padding:20,marginBottom:16}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:14}}>Conversation</div>
                  {loadingComments?<div style={{textAlign:"center",padding:24}}><div style={spinnerStyle}/></div>:ticketComments.length===0?<div style={{textAlign:"center",padding:"24px 0",color:"#94A3B8",fontSize:13}}>No messages yet.</div>:(
                    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
                      {ticketComments.map(c=>{
                        const isAgent=c.authorRole==="AGENT";
                        return (
                          <div key={c.id} style={{display:"flex",gap:10,flexDirection:isAgent?"row":"row-reverse"}}>
                            <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,background:isAgent?"linear-gradient(135deg,#1E3A5F,#2563EB)":"linear-gradient(135deg,#16A34A,#15803D)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"}}>{(c.authorName||"?").charAt(0).toUpperCase()}</div>
                            <div style={{maxWidth:"75%"}}>
                              <div style={{fontSize:11,color:"#94A3B8",marginBottom:4,textAlign:isAgent?"left":"right"}}><strong style={{color:"#475569"}}>{c.authorName}</strong>{isAgent&&<span style={{marginLeft:6,background:"#EFF6FF",color:"#2563EB",padding:"1px 6px",borderRadius:4,fontSize:10,fontWeight:700}}>AGENT</span>} · {new Date(c.createdAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</div>
                              <div style={{padding:"10px 14px",borderRadius:12,fontSize:13,lineHeight:1.6,background:isAgent?"#EFF6FF":"#F0FDF4",color:isAgent?"#1E3A5F":"#14532D",border:`1px solid ${isAgent?"#BFDBFE":"#BBF7D0"}`}}>{c.message}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {selectedTicket.status!=="CLOSED"&&(
                    <div style={{display:"flex",gap:10}}>
                      <textarea value={newComment} onChange={e=>setNewComment(e.target.value)} placeholder="Add a comment…" rows={2} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handlePostComment();}}} style={{flex:1,padding:"10px 12px",border:"1.5px solid #E2E8F0",borderRadius:10,fontSize:13,resize:"none",fontFamily:"inherit",outline:"none"}}/>
                      <button onClick={handlePostComment} disabled={!newComment.trim()||postingComment} style={{padding:"10px 16px",background:!newComment.trim()?"#F1F5F9":"#2563EB",color:!newComment.trim()?"#94A3B8":"#fff",border:"none",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer",alignSelf:"flex-end"}}>{postingComment?"…":"Send"}</button>
                    </div>
                  )}
                </div>
                {selectedTicket.status==="RESOLVED"&&!selectedTicket.feedbackRating&&(
                  <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:14,padding:20,marginBottom:16}}>
                    <div style={{fontSize:14,fontWeight:700,color:"#14532D",marginBottom:4}}>✅ Issue Resolved!</div>
                    <StarRating value={ticketFeedbackRating} onChange={setTicketFeedbackRating}/>
                    <textarea value={ticketFeedbackText} onChange={e=>setTicketFeedbackText(e.target.value)} placeholder="Any comments? (optional)" rows={2} style={{width:"100%",padding:"10px 12px",border:"1.5px solid #BBF7D0",borderRadius:8,fontSize:13,resize:"none",marginTop:12,marginBottom:12,boxSizing:"border-box",fontFamily:"inherit",background:"rgba(255,255,255,0.7)"}}/>
                    <button onClick={handleSubmitTicketFeedback} disabled={ticketFeedbackRating===0||submittingTicketFeedback} style={{padding:"10px 22px",background:ticketFeedbackRating===0?"#E2E8F0":"#16A34A",color:ticketFeedbackRating===0?"#94A3B8":"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:700,cursor:"pointer"}}>{submittingTicketFeedback?"Submitting…":"Submit Feedback"}</button>
                  </div>
                )}
                <div style={{display:"flex",gap:10}}>
                  {selectedTicket.status!=="CLOSED"&&selectedTicket.status!=="RESOLVED"&&<button onClick={handleCloseTicket} style={{padding:"11px 20px",border:"1.5px solid #E2E8F0",background:"#fff",color:"#64748B",borderRadius:10,fontSize:13,fontWeight:600,cursor:"pointer"}}>🔒 Close Ticket</button>}
                  <button onClick={()=>setTicketView("list")} style={{padding:"11px 20px",border:"none",background:"#EFF6FF",color:"#2563EB",borderRadius:10,fontSize:13,fontWeight:700,cursor:"pointer"}}>← Back</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ════ SETTINGS ════ */}
        {tab==="settings" && (
          <div className={styles.tabPadding}>
            {settingsView==="profile" ? (
              <AccountProfile onBack={()=>setSettingsView("menu")}/>
            ) : (
              <>
                <h2 className={styles.sectionTitle}>Settings</h2>
                <div className={styles.settingsCard}>
                  <div className={styles.settingsItem} onClick={()=>setSettingsView("profile")}><span>Account Profile</span><span>›</span></div>
                  <div className={styles.settingsItem}><span>Notifications</span><span>›</span></div>
                  <div className={styles.settingsItem}><span>Privacy &amp; Security</span><span>›</span></div>
                  <div className={`${styles.settingsItem} ${styles.settingsItemDanger}`} onClick={handleLogout}><span>Log Out</span></div>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* ══ PROFILE MODAL ══ */}
      {profileConsultant && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.65)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}} onClick={()=>setProfileConsultant(null)}>
          <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(15,23,42,0.3)"}} onClick={e=>e.stopPropagation()}>
            <div style={{background:"linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)",padding:"28px 24px 24px",position:"relative",borderRadius:"20px 20px 0 0"}}>
              <button onClick={()=>setProfileConsultant(null)} style={{position:"absolute",top:14,right:14,background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",width:30,height:30,borderRadius:"50%",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              <div style={{display:"flex",gap:18,alignItems:"center"}}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <div style={{width:76,height:76,borderRadius:"50%",border:"3px solid rgba(255,255,255,0.45)",overflow:"hidden",background:"rgba(255,255,255,0.18)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:27,fontWeight:700,color:"#fff",boxShadow:"0 4px 16px rgba(0,0,0,0.18)"}}>
                    {profileConsultant.avatar?<img src={profileConsultant.avatar} alt={profileConsultant.name} style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>:profileConsultant.name.substring(0,2).toUpperCase()}
                  </div>
                </div>
                <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:4}}>
                  <h2 style={{fontSize:21,fontWeight:800,color:"#fff",margin:0,lineHeight:1.2}}>{profileConsultant.name}</h2>
                  <p style={{fontSize:13,color:"#BFDBFE",margin:0,fontWeight:500}}>{profileConsultant.role}</p>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginTop:2,flexWrap:"wrap"}}>
                    <span style={{fontSize:12,color:"#93C5FD",display:"flex",alignItems:"center",gap:4}}>⭐ {profileConsultant.rating.toFixed(1)} <span style={{color:"rgba(147,197,253,0.7)"}}>({profileConsultant.reviews} reviews)</span></span>
                    <span style={{width:3,height:3,borderRadius:"50%",background:"rgba(255,255,255,0.3)",display:"inline-block"}}/>
                    <span style={{fontSize:12,color:"#93C5FD"}}>⏱ {profileConsultant.exp}+ yrs exp</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{padding:24}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
                {[
                  {icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="10" r="3"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>,label:"Location",value:profileConsultant.location},
                  {icon:"🌐",label:"Languages",value:profileConsultant.languages||"English"},
                  {icon:"📞",label:"Contact",value:profileConsultant.phone||"On request"},
                  {icon:"💰",label:"Session Fee",value:`₹${profileConsultant.fee.toLocaleString()}`},
                ].map(item=>(
                  <div key={item.label} style={{background:"#F8FAFC",borderRadius:11,padding:"11px 13px",border:"1px solid #E2E8F0",display:"flex",flexDirection:"column",justifyContent:"flex-start"}}>
                    <div style={{display:"flex",flexDirection:"row",alignItems:"center",gap:4,marginBottom:5}}>
                      <span style={{display:"inline-flex",alignItems:"center",flexShrink:0,lineHeight:1,fontSize:12}}>{item.icon}</span>
                      <span style={{fontSize:10,color:"#94A3B8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",lineHeight:1}}>{item.label}</span>
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:"#0F172A",lineHeight:1.3,paddingLeft:18}}>{item.value||"—"}</div>
                  </div>
                ))}
              </div>
              {profileConsultant.about&&<ProfileAbout about={profileConsultant.about}/>}
              {profileConsultant.tags.length>0&&<div style={{marginBottom:20}}><h3 style={{fontSize:12,fontWeight:700,color:"#1E293B",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Expertise</h3><div style={{display:"flex",flexWrap:"wrap",gap:7}}>{profileConsultant.tags.map((tag,i)=><span key={i} style={{background:"#EFF6FF",color:"#2563EB",padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:600,border:"1px solid #BFDBFE"}}>{tag}</span>)}</div></div>}
              <div style={{display:"flex",gap:12,marginTop:8}}>
                <button onClick={()=>{setProfileConsultant(null);handleOpenModal(profileConsultant);}} style={{flex:1,padding:"13px 0",borderRadius:12,border:"none",background:"linear-gradient(135deg,#2563EB,#1D4ED8)",color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>Book Appointment</button>
                <button onClick={()=>setProfileConsultant(null)} style={{padding:"13px 20px",borderRadius:12,border:"1.5px solid #E2E8F0",background:"#fff",color:"#64748B",fontSize:14,fontWeight:600,cursor:"pointer"}}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ BOOKING MODAL ══ */}
      {showModal && selectedConsultant && (
        <div className={styles.modalOverlay} onClick={()=>setShowModal(false)}>
          <div className={styles.modal} onClick={e=>e.stopPropagation()} style={{padding:0,overflow:"hidden"}}>
            <div style={{background:"linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)",padding:"20px 24px 18px",position:"relative",flexShrink:0}}>
              <p style={{fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",color:"#93C5FD",margin:"0 0 4px"}}>Schedule a Session</p>
              <h3 style={{fontSize:20,fontWeight:700,color:"#fff",margin:0}}>{selectedConsultant.name}</h3>
              <p style={{fontSize:13,color:"#BFDBFE",margin:"4px 0 0"}}>{selectedConsultant.role}&nbsp;·&nbsp;₹{selectedConsultant.fee.toLocaleString()} / session</p>
              <button onClick={()=>setShowModal(false)} style={{position:"absolute",top:14,right:14,background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",width:30,height:30,borderRadius:"50%",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
            </div>
            <div style={{padding:"20px 24px 24px",overflowY:"auto",maxHeight:"calc(92vh - 100px)"}}>
              {loading.slots ? (
                <div style={{textAlign:"center",padding:"48px 0"}}><div style={spinnerStyle}/><p style={{color:"#94A3B8",fontSize:13,margin:"12px 0 0"}}>Loading available time slots…</p></div>
              ) : (
                <>
                  <p className={styles.stepLabel}>Step 1 — Select Date</p>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:24}}>
                    <button disabled={dayOffset===0} onClick={()=>setDayOffset(o=>Math.max(0,o-1))} style={{width:32,height:32,borderRadius:"50%",flexShrink:0,border:`1.5px solid ${dayOffset===0?"#F1F5F9":"#BFDBFE"}`,background:"#fff",cursor:dayOffset===0?"default":"pointer",color:dayOffset===0?"#CBD5E1":"#2563EB",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                    <div className={styles.dateGrid} style={{flex:1}}>
                      {visibleDays.map(d=>{
                        const isSel=selectedDay.iso===d.iso, isToday=d.iso===ALL_DAYS[0].iso;
                        const isSunday=d.day==="SUN";
                        return (
                          <button
                            key={d.iso}
                            disabled={isSunday}
                            onClick={()=>{ if(!isSunday){setSelectedDay(d);setSelectedSlot(null);} }}
                            className={`${styles.dateGridBtn} ${isSel&&!isSunday?styles.dateGridBtnActive:""}`}
                            title={isSunday?"No consultations on Sundays":undefined}
                            style={isSunday?{opacity:0.38,cursor:"not-allowed",background:"#F8FAFC",position:"relative"}:{}}
                          >
                            <span className={styles.dateGridDay} style={isSunday?{color:"#CBD5E1"}:{}}>{d.day}</span>
                            <span className={styles.dateGridDate} style={isSunday?{color:"#CBD5E1"}:{}}>{d.date}</span>
                            <span
                              className={`${styles.dateGridMonth} ${isToday&&!isSel&&!isSunday?styles.todayLabel:""}`}
                              style={isSunday?{color:"#CBD5E1",fontSize:8}:{}}
                            >{isSunday?"OFF":isToday&&!isSel?"TODAY":d.month}</span>
                          </button>
                        );
                      })}
                    </div>
                    <button disabled={dayOffset>=ALL_DAYS.length-VISIBLE_DAYS} onClick={()=>setDayOffset(o=>Math.min(ALL_DAYS.length-VISIBLE_DAYS,o+1))} style={{width:32,height:32,borderRadius:"50%",flexShrink:0,border:`1.5px solid ${dayOffset>=ALL_DAYS.length-VISIBLE_DAYS?"#F1F5F9":"#BFDBFE"}`,background:"#fff",cursor:dayOffset>=ALL_DAYS.length-VISIBLE_DAYS?"default":"pointer",color:dayOffset>=ALL_DAYS.length-VISIBLE_DAYS?"#CBD5E1":"#2563EB",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
                  </div>

                  <p className={styles.stepLabel}>Step 2 — Select Time</p>
                  {selectedDay.day==="SUN" ? (
                    <div className={styles.noSlotsWarning} style={{background:"#FEF2F2",border:"1.5px solid #FECACA",borderRadius:12,padding:"20px 18px",textAlign:"center"}}>
                      <div style={{fontSize:32,marginBottom:8}}>🚫</div>
                      <p style={{fontWeight:700,margin:"0 0 4px",color:"#DC2626",fontSize:14}}>No consultations on Sundays</p>
                      <p style={{fontSize:12,margin:0,color:"#EF4444"}}>Please select a weekday (Monday – Saturday) to book a session.</p>
                    </div>
                  ) : hasShift ? (
                    <div className={styles.timeGrid}>
                      {hourlySlotTimes.map(slotStart=>{
                        const isBooked=bookedSlotSet.has(`${selectedDay.iso}|${slotStart}`);
                        const endH=parseInt(slotStart.split(":")[0])+1;
                        const endStr=`${String(endH).padStart(2,"0")}:${slotStart.split(":")[1]}`;
                        const label=`${fmt24to12(slotStart)} - ${fmt24to12(endStr)}`;
                        const matchedMaster=masterSlots.find(ms=>normalise24(ms.timeRange)===slotStart||ms.timeRange.replace(/\s/g,"").toLowerCase()===label.replace(/\s/g,"").toLowerCase());
                        const matchedTs=dbTimeslots.find(ts=>ts.slotDate===selectedDay.iso&&(ts.slotTime||"").substring(0,5)===slotStart);
                        const isSel=!isBooked&&selectedSlot?.start24h===slotStart;
                        return (
                          <button key={slotStart} disabled={isBooked}
                            title={isBooked?"This slot is already booked or unavailable":"Available — click to select"}
                            onClick={()=>!isBooked&&setSelectedSlot(isSel?null:{start24h:slotStart,label,masterId:matchedMaster?.id??0,timeslotId:matchedTs?.id})}
                            className={`${styles.timeBtn} ${isSel?styles.timeBtnActive:""} ${isBooked?styles.timeBtnBooked:""}`}
                            style={isBooked?{textDecoration:"line-through",opacity:0.6,cursor:"not-allowed",pointerEvents:"none"}:{}}>
                            {label}
                            {isBooked&&<div className={styles.unavailableLabel}>BOOKED</div>}
                          </button>
                        );
                      })}
                    </div>
                  ) : masterSlots.length===0 ? (
                    <div className={styles.noSlotsWarning}>
                      <p style={{fontWeight:600,margin:"0 0 4px"}}>No time slots available yet.</p>
                      <p style={{fontSize:12,margin:0}}>The advisor hasn't configured their available time ranges.</p>
                    </div>
                  ) : (
                    <div className={styles.timeGrid}>
                      {masterSlots.map(ms=>{
                        const slotT24=normalise24(ms.timeRange);
                        const isBooked=bookedSlotSet.has(`${selectedDay.iso}|${slotT24}`);
                        const isSel=!isBooked&&selectedSlot?.masterId===ms.id;
                        return (
                          <button key={ms.id} disabled={isBooked}
                            title={isBooked?"This slot is already booked or unavailable":"Available — click to select"}
                            onClick={()=>!isBooked&&setSelectedSlot(isSel?null:{start24h:slotT24,label:ms.timeRange,masterId:ms.id})}
                            className={`${styles.timeBtn} ${isSel?styles.timeBtnActive:""} ${isBooked?styles.timeBtnBooked:""}`}
                            style={isBooked?{textDecoration:"line-through",opacity:0.6,cursor:"not-allowed",pointerEvents:"none"}:{}}>
                            {ms.timeRange}
                            {isBooked&&<div className={styles.unavailableLabel}>BOOKED</div>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <p className={styles.stepLabel}>Meeting Mode</p>
                  <div className={styles.meetingModeRow}>
                    {(["ONLINE","PHYSICAL","PHONE"] as const).map(mode=>(
                      <button key={mode} onClick={()=>setMeetingMode(mode)} className={`${styles.meetingBtn} ${meetingMode===mode?styles.meetingBtnActive:""}`}>
                        {mode==="ONLINE"?"💻":mode==="PHONE"?"📞":"🏢"} {mode==="PHYSICAL"?"In-Person":mode}
                      </button>
                    ))}
                  </div>

                  <p className={styles.stepLabel}>Notes (optional)</p>
                  <textarea className={styles.notesTextarea} value={userNotes} onChange={e=>setUserNotes(e.target.value)} rows={2} placeholder="What would you like to discuss in this session?"/>

                  {selectedSlot && (
                    <div className={styles.bookingSummary}>
                      📅 {selectedDay.date} {selectedDay.month}&nbsp;·&nbsp;🕐 {selectedSlot.label}&nbsp;·&nbsp;
                      {meetingMode==="ONLINE"?"💻 Online":meetingMode==="PHONE"?"📞 Phone":"🏢 In-Person"}&nbsp;·&nbsp;₹{selectedConsultant.fee.toLocaleString()}
                    </div>
                  )}

                  <button disabled={!selectedSlot||confirming} onClick={handleConfirm} className={`${styles.proceedBtn} ${selectedSlot&&!confirming?styles.proceedBtnActive:""}`}>
                    {confirming?"Booking…":selectedSlot?`Confirm & Pay ₹${selectedConsultant.fee.toLocaleString()}`:"Select a Date and Time to Continue"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom Nav ── */}
      <nav className={styles.bottomNav}>
        {(["consultants","bookings","tickets","settings"] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`${styles.navBtn} ${tab===t?styles.navBtnActive:""}`}>
            <span>{t.charAt(0).toUpperCase()+t.slice(1)}</span>
          </button>
        ))}
      </nav>

      {/* ══ FEEDBACK MODAL ══ */}
      {feedbackModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.65)",zIndex:1200,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(6px)"}} onClick={()=>!submittingFeedback&&setFeedbackModal(null)}>
          <div style={{background:"#fff",borderRadius:24,width:"100%",maxWidth:480,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(15,23,42,0.35)",animation:"popIn 0.3s cubic-bezier(0.16,1,0.3,1)"}} onClick={e=>e.stopPropagation()}>
            <div style={{background:"linear-gradient(135deg,#1E3A5F 0%,#2563EB 100%)",padding:"22px 24px 20px",borderRadius:"24px 24px 0 0",position:"relative"}}>
              <button onClick={()=>setFeedbackModal(null)} style={{position:"absolute",top:14,right:14,background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",width:30,height:30,borderRadius:"50%",cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
              <div style={{fontSize:10,letterSpacing:"0.16em",textTransform:"uppercase",color:"#93C5FD",marginBottom:4}}>Rate Your Session</div>
              <h3 style={{fontSize:20,fontWeight:700,color:"#fff",margin:"0 0 4px"}}>{feedbackModal.existingFeedback?"Update Your Feedback":"Leave Feedback"}</h3>
              <p style={{fontSize:13,color:"#BFDBFE",margin:0}}>Session with {feedbackModal.consultantName}</p>
            </div>
            <div style={{padding:24}}>
              <div style={{background:"#F8FAFC",border:"1px solid #E2E8F0",borderRadius:12,padding:"12px 16px",marginBottom:24,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                <span style={{fontSize:13,color:"#475569"}}>📅 {feedbackModal.slotDate||"Session"}</span>
                {feedbackModal.timeRange&&<span style={{background:"#EFF6FF",color:"#2563EB",fontSize:12,fontWeight:700,padding:"2px 10px",borderRadius:20,border:"1px solid #BFDBFE"}}>{feedbackModal.timeRange}</span>}
                <span style={{background:"#F0FDF4",color:"#16A34A",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>✓ Session Attended</span>
              </div>
              <div style={{marginBottom:24}}>
                <p style={{fontSize:12,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 12px"}}>How would you rate this session?</p>
                <div style={{display:"flex",gap:8,justifyContent:"center",marginBottom:8}}>
                  {[1,2,3,4,5].map(star=>(
                    <button key={star} onClick={()=>setFeedbackRating(star)} onMouseEnter={()=>setFeedbackHover(star)} onMouseLeave={()=>setFeedbackHover(0)} style={{background:"none",border:"none",cursor:"pointer",padding:4,transition:"transform 0.15s",transform:(feedbackHover||feedbackRating)>=star?"scale(1.2)":"scale(1)"}}>
                      <svg width="36" height="36" viewBox="0 0 24 24" fill={(feedbackHover||feedbackRating)>=star?"#F59E0B":"#E2E8F0"} stroke={(feedbackHover||feedbackRating)>=star?"#D97706":"#CBD5E1"} strokeWidth="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    </button>
                  ))}
                </div>
                <div style={{textAlign:"center",height:20}}>{(feedbackHover||feedbackRating)>0&&<span style={{fontSize:13,fontWeight:600,color:"#D97706"}}>{["","Poor","Fair","Good","Very Good","Excellent!"][feedbackHover||feedbackRating]}</span>}</div>
              </div>
              <div style={{marginBottom:24}}>
                <p style={{fontSize:12,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"0.08em",margin:"0 0 8px"}}>Comments (optional)</p>
                <textarea value={feedbackComment} onChange={e=>setFeedbackComment(e.target.value)} placeholder="Share your experience…" maxLength={1000} rows={4} style={{width:"100%",padding:"12px 14px",border:"1.5px solid #E2E8F0",borderRadius:12,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",boxSizing:"border-box",color:"#1E293B",lineHeight:1.6}} onFocus={e=>(e.target.style.borderColor="#2563EB")} onBlur={e=>(e.target.style.borderColor="#E2E8F0")}/>
                <div style={{textAlign:"right",fontSize:11,color:"#94A3B8",marginTop:4}}>{feedbackComment.length}/1000</div>
              </div>
              <button onClick={handleSubmitFeedback} disabled={submittingFeedback||feedbackRating===0} style={{width:"100%",padding:14,background:feedbackRating===0||submittingFeedback?"#E2E8F0":"linear-gradient(135deg,#2563EB,#1D4ED8)",color:feedbackRating===0||submittingFeedback?"#94A3B8":"#fff",border:"none",borderRadius:14,fontWeight:700,fontSize:15,cursor:feedbackRating===0?"not-allowed":"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                {submittingFeedback?(<><span style={{width:16,height:16,border:"2px solid rgba(255,255,255,0.4)",borderTopColor:"#fff",borderRadius:"50%",animation:"spin 0.7s linear infinite",display:"inline-block"}}/>Submitting…</>):feedbackModal.existingFeedback?"Update Feedback":"⭐ Submit Feedback"}
              </button>
              {feedbackRating===0&&<p style={{textAlign:"center",fontSize:12,color:"#94A3B8",margin:"10px 0 0"}}>Please select a star rating to continue</p>}
            </div>
          </div>
        </div>
      )}

      {/* ══ SUBSCRIPTION WELCOME POPUP ══ */}
      {showSubPopup && (
        <div
          style={{position:"fixed",inset:0,zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20,backdropFilter:"blur(8px)",background:"rgba(15,23,42,0.65)",animation:"fadeIn 0.3s ease"}}
          onClick={() => setShowSubPopup(false)}
        >
          <div onClick={e => e.stopPropagation()} style={{background:"#fff",borderRadius:24,width:"100%",maxWidth:420,boxShadow:"0 32px 80px rgba(15,23,42,0.35)",overflow:"hidden",animation:"popIn 0.35s cubic-bezier(0.34,1.56,0.64,1)"}}>
            <div style={{background:"linear-gradient(135deg,#92400E 0%,#B45309 30%,#D97706 60%,#F59E0B 100%)",padding:"32px 28px 28px",textAlign:"center",position:"relative"}}>
              {([{top:"12px",left:"18px",size:6},{top:"8px",right:"22px",size:4},{top:"24px",right:"48px",size:4},{top:"20px",left:"50px",size:5}] as any[]).map((dot,i)=>(
                <div key={i} style={{position:"absolute",width:dot.size,height:dot.size,borderRadius:"50%",background:"rgba(255,255,255,0.7)",top:dot.top,left:dot.left,right:dot.right}}/>
              ))}
              <div style={{width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,0.2)",border:"3px solid rgba(255,255,255,0.5)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:40,boxShadow:"0 0 0 8px rgba(255,255,255,0.1)"}}>👑</div>
              <div style={{fontSize:22,fontWeight:800,color:"#fff",marginBottom:6,letterSpacing:"-0.01em"}}>Welcome, Premium Member!</div>
              <div style={{fontSize:14,color:"rgba(255,255,255,0.85)",lineHeight:1.5}}>You're subscribed to FINADVISE Premium</div>
              <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.25)",border:"1px solid rgba(255,255,255,0.4)",borderRadius:20,padding:"5px 16px",marginTop:14,fontSize:12,fontWeight:700,color:"#fff",letterSpacing:"0.05em"}}>✦ PREMIUM PLAN ACTIVE ✦</div>
            </div>
            <div style={{padding:"24px 28px 28px"}}>
              <div style={{marginBottom:22}}>
                {[{icon:"📅",text:"Unlimited session bookings"},{icon:"⚡",text:"Priority support ticket handling"},{icon:"💬",text:"Direct access to top consultants"},{icon:"📊",text:"Exclusive financial reports & insights"}].map((perk,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,marginBottom:8,background:i===0?"#FFFBEB":"#F8FAFC",border:`1px solid ${i===0?"#FDE68A":"#F1F5F9"}`}}>
                    <span style={{fontSize:18}}>{perk.icon}</span>
                    <span style={{fontSize:13,fontWeight:600,color:"#1E293B"}}>{perk.text}</span>
                    <span style={{marginLeft:"auto",color:"#16A34A",fontWeight:700,fontSize:14}}>✓</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowSubPopup(false)} style={{width:"100%",padding:14,background:"linear-gradient(135deg,#B45309,#D97706)",color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 16px rgba(180,83,9,0.4)",letterSpacing:"0.01em"}}>
                Start Exploring →
              </button>
              <div style={{textAlign:"center",marginTop:10,fontSize:12,color:"#94A3B8"}}>Tap anywhere outside to dismiss</div>
            </div>
          </div>
          <style>{`
            @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
            @keyframes popIn  { from { transform:scale(0.85) translateY(20px); opacity:0; } to { transform:scale(1) translateY(0); opacity:1; } }
            @keyframes spin   { to { transform:rotate(360deg); } }
          `}</style>
        </div>
      )}
    </div>
  );
}