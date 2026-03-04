// ─────────────────────────────────────────────────────────────────────────────
// api.ts  —  Unified service layer (merged from both source files)
// ─────────────────────────────────────────────────────────────────────────────

import axios from "axios";

const BASE_URL = "/api";

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN / SESSION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export const TOKEN_KEY       = "fin_token";
export const setToken        = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const getToken        = ()              => localStorage.getItem(TOKEN_KEY) || "";
export const clearToken      = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("fin_role");
  localStorage.removeItem("fin_user_id");
  localStorage.removeItem("fin_consultant_id");
};
export const setRole         = (role: string) => localStorage.setItem("fin_role", role);
export const getRole         = ()             => localStorage.getItem("fin_role");
export const setUserId       = (id: number)   => localStorage.setItem("fin_user_id", String(id));
export const getUserId       = ()             => localStorage.getItem("fin_user_id");
export const setConsultantId = (id: number)   => localStorage.setItem("fin_consultant_id", String(id));
export const getConsultantId = ()             => localStorage.getItem("fin_consultant_id");

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG: decode JWT payload
// ─────────────────────────────────────────────────────────────────────────────

export const debugToken = () => {
  console.group("🔍 AUTH DEBUG");
  console.log("📦 All localStorage keys:");
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    const val = localStorage.getItem(key) || "";
    console.log(`   "${key}" = ${val.length > 80 ? val.substring(0, 80) + "…" : val}`);
  }
  const token = getToken();
  if (!token) {
    console.error(`❌ No token found under key "${TOKEN_KEY}".`);
    console.groupEnd();
    return null;
  }
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Not a valid JWT (expected 3 parts)");
    const payload = JSON.parse(atob(parts[1]));
    console.log("✅ Token payload:", payload);
    const exp = payload.exp ? new Date(payload.exp * 1000) : null;
    if (exp) {
      const expired = exp < new Date();
      console.log(`   Expires: ${exp.toLocaleString()} — ${expired ? "❌ EXPIRED" : "✅ Still valid"}`);
      if (expired) console.error("   ⚠️  Token is expired — log in again!");
    }
    console.groupEnd();
    return payload;
  } catch (e) {
    console.error("❌ Failed to decode token:", e);
    console.groupEnd();
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// AXIOS INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─────────────────────────────────────────────────────────────────────────────
// CORE FETCH WRAPPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Authenticated fetch — attaches Bearer token, handles 403 debug output */
export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const defaultHeaders: Record<string, string> = { Accept: "application/json" };

  if (!(options.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token) defaultHeaders["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders, ...((options.headers as Record<string, string>) || {}) },
    });

    const contentType = res.headers.get("content-type");
    const data: any   = contentType?.includes("application/json")
      ? await res.json()
      : { message: await res.text() };

    if (!res.ok) {
      if (res.status === 403) {
        console.error(`🚫 403 Forbidden on ${options.method || "GET"} ${endpoint}`);
        debugToken();
      }
      throw new Error(data?.message || `Request failed with status ${res.status}`);
    }
    return data;
  } catch (err: any) {
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      throw new Error("Cannot connect to server. Please check if the backend is running.");
    }
    throw err;
  }
};

/** Public fetch — no auth token; used for login, register, OTP, forgot/reset password */
const publicFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const ct   = res.headers.get("content-type");
  const data = ct?.includes("application/json") ? await res.json() : { message: await res.text() };
  if (!res.ok) {
    const fieldErrors = (data?.fieldErrors as Record<string, string> | undefined)
      ? Object.entries(data.fieldErrors as Record<string, string>)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")
      : null;
    throw new Error(fieldErrors || data?.message || `Error ${res.status}`);
  }
  return data;
};

/** Extracts an array from any API response shape */
export const extractArray = (data: any): any[] => {
  if (!data) return [];
  if (Array.isArray(data))             return data;
  if (Array.isArray(data.content))     return data.content;
  if (Array.isArray(data.data))        return data.data;
  if (Array.isArray(data.tickets))     return data.tickets;
  if (Array.isArray(data.bookings))    return data.bookings;
  if (Array.isArray(data.items))       return data.items;
  if (Array.isArray(data.results))     return data.results;
  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key]) && data[key].length > 0) return data[key];
  }
  return [];
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────────────────────────────────────

export const loginUser = async (identifier: string, password: string) => {
  clearToken();
  const data = await publicFetch("/users/authenticate", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  if (data?.token)        setToken(data.token);
  if (data?.role)         setRole(data.role);
  if (data?.id)           setUserId(Number(data.id));
  if (data?.userId)       setUserId(Number(data.userId));
  if (data?.consultantId) setConsultantId(Number(data.consultantId));
  debugToken();
  return data;
};

export const registerUser = async (payload: any) => {
  const data = await publicFetch("/onboarding", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (data?.token)        setToken(data.token);
  if (data?.role)         setRole(data.role);
  if (data?.id)           setUserId(Number(data.id));
  if (data?.consultantId) setConsultantId(Number(data.consultantId));
  return data;
};

export const logoutUser = () => clearToken();

export const getCurrentUser = async () => apiFetch("/users/me");

/** POST /api/users/send-otp — registration OTP (public) */
export const sendRegistrationOtp = async (email: string): Promise<void> => {
  await publicFetch("/users/send-otp", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
};

/** POST /api/users/forgot-password — send reset OTP (public) */
export const sendForgotPasswordOtp = async (email: string): Promise<void> => {
  await publicFetch("/users/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
};

/** POST /api/users/reset-password — submit new password with OTP (public) */
export const resetPassword = async (
  email: string,
  otp: string,
  newPassword: string
): Promise<void> => {
  await publicFetch("/users/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, otp, newPassword }),
  });
};

export const changePassword = async (payload: any) =>
  apiFetch("/users/me/password", { method: "PUT", body: JSON.stringify(payload) });

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const getAllUsers    = async ()             => apiFetch("/users");
export const getUsersByRole = async (role: string) => apiFetch(`/users/role/${role}`);

export const getAgentList = async (): Promise<string[]> => {
  try {
    const data = await apiFetch("/users/role/AGENT");
    return (Array.isArray(data) ? data : []).map((u: any) => u.name || u.username || u.email);
  } catch {
    return [];
  }
};

export const updateUser = async (id: number, payload: object) =>
  apiFetch(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteUser = async (id: number) =>
  apiFetch(`/users/${id}`, { method: "DELETE" });

// ─────────────────────────────────────────────────────────────────────────────
// CONSULTANTS / ADVISORS
// ─────────────────────────────────────────────────────────────────────────────

export const getConsultants   = async () => apiFetch("/consultants");
export const getAllConsultants = getConsultants;
export const getAdvisors      = getConsultants;
export const getAllAdvisors    = getConsultants;

export const getConsultantById = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}`);
export const getAdvisorById = getConsultantById;
export const getMyProfile   = getConsultantById;

export const createConsultant = async (payload: any) => {
  const formData    = new FormData();
  const dataPayload = { ...payload };
  let   file: File | null = null;

  if (dataPayload.file) { file = dataPayload.file as File; delete dataPayload.file; }
  if (dataPayload.shiftStartTime?.length === 5) dataPayload.shiftStartTime += ":00";
  if (dataPayload.shiftEndTime?.length   === 5) dataPayload.shiftEndTime   += ":00";

  formData.append("data", new Blob([JSON.stringify(dataPayload)], { type: "application/json" }));
  if (file) formData.append("file", file);
  return apiFetch("/consultants", { method: "POST", body: formData });
};
export const createAdvisor = createConsultant;

export const updateConsultant = async (
  consultantId: number,
  data: {
    name?: string; designation?: string; charges?: number; email?: string;
    skills?: string[]; shiftStartTime?: string | null; shiftEndTime?: string | null;
    description?: string; rating?: number | null; [key: string]: any;
  },
  explicitFile?: File | null
): Promise<any> => {
  const formData    = new FormData();
  const dataPayload = { ...data };
  let   file: File | null = explicitFile || null;

  if (dataPayload.file) { if (!file) file = dataPayload.file as File; delete dataPayload.file; }
  if (dataPayload.shiftStartTime?.length === 5) dataPayload.shiftStartTime += ":00";
  if (dataPayload.shiftEndTime?.length   === 5) dataPayload.shiftEndTime   += ":00";

  formData.append("data", new Blob([JSON.stringify(dataPayload)], { type: "application/json" }));
  if (file) formData.append("file", file);
  return apiFetch(`/consultants/${consultantId}`, { method: "PUT", body: formData });
};
export const updateAdvisor = updateConsultant;

export const deleteConsultant = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}`, { method: "DELETE" });
export const deleteAdvisor = deleteConsultant;

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────────────────────────────────────

export const getOnboarding    = async (id: number)                  => apiFetch(`/onboarding/${id}`);
export const updateOnboarding = async (id: number, payload: object) =>
  apiFetch(`/onboarding/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteOnboarding = async (id: number)                  =>
  apiFetch(`/onboarding/${id}`, { method: "DELETE" });

// ─────────────────────────────────────────────────────────────────────────────
// TIMESLOTS
// ─────────────────────────────────────────────────────────────────────────────

export const getTimeslotById = async (id: number) => apiFetch(`/timeslots/${id}`);

export const getTimeslotsByConsultant = async (consultantId: number) => {
  const data = await apiFetch(`/timeslots/consultant/${consultantId}`);
  if (Array.isArray(data))   return data;
  if (data?.content)         return data.content;
  return [];
};
export const getTimeslotsByAdvisor = getTimeslotsByConsultant;

export const getAvailableTimeslotsByConsultant = async (consultantId: number) => {
  try {
    const data = await apiFetch(`/timeslots/consultant/${consultantId}/available`);
    return extractArray(data);
  } catch {
    return getTimeslotsByConsultant(consultantId);
  }
};
export const getAvailableTimeslotsByAdvisor = getAvailableTimeslotsByConsultant;

export const createTimeslot = async (payload: {
  consultantId: number; slotDate: string; slotTime: string;
  durationMinutes: number; masterTimeSlotId?: number;
}) => apiFetch("/timeslots", { method: "POST", body: JSON.stringify(payload) });

export const updateTimeslot = async (id: number, payload: any) =>
  apiFetch(`/timeslots/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteTimeslot = async (id: number) =>
  apiFetch(`/timeslots/${id}`, { method: "DELETE" });

// ─────────────────────────────────────────────────────────────────────────────
// BOOKINGS
// ─────────────────────────────────────────────────────────────────────────────

export const createBooking = async (payload: {
  consultantId: number; timeSlotId: number; amount: number;
  userNotes?: string; meetingMode?: string; bookingDate?: string;
  slotDate?: string; masterTimeslotId?: number; slotTime?: string; timeRange?: string;
}) => apiFetch("/bookings", { method: "POST", body: JSON.stringify(payload) });

export const getBookingById = async (id: number) => apiFetch(`/bookings/${id}`);

export const getAllBookings = async (): Promise<any[]> => {
  const directEndpoints = ["/bookings", "/bookings/all", "/bookings/admin", "/bookings/list"];
  for (const endpoint of directEndpoints) {
    try {
      const response  = await api.get(endpoint);
      const extracted = extractArray(response.data);
      if (extracted.length > 0) return extracted;
      if (endpoint === "/bookings") return [];
    } catch {
      console.warn(`⚠️ ${endpoint} failed, trying next…`);
    }
  }
  try {
    const consultantsData = await api.get("/consultants");
    const consultants: any[] = extractArray(consultantsData.data);
    if (consultants.length === 0) return [];
    const results = await Promise.allSettled(
      consultants.map((c: any) =>
        api.get(`/bookings/consultant/${c.id}`)
           .then(r => extractArray(r.data))
           .catch(() => [] as any[])
      )
    );
    const allBookings: any[] = results.flatMap(r =>
      r.status === "fulfilled" ? r.value : []
    );
    const seen = new Set<number>();
    return allBookings.filter(b => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
  } catch (err) {
    console.error("❌ Fallback aggregation failed:", err);
  }
  return [];
};

export const getMyBookings = async (): Promise<any[]> => {
  try {
    const response = await api.get("/bookings/me");
    return extractArray(response.data);
  } catch (err: any) {
    console.error("getMyBookings error:", err?.message);
    return [];
  }
};

export const getBookingsByConsultant = async (consultantId: number) =>
  apiFetch(`/bookings/consultant/${consultantId}`);
export const getBookingsByAdvisor = getBookingsByConsultant;

export const updateBooking = async (id: number, payload: any) =>
  apiFetch(`/bookings/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteBooking = async (id: number) =>
  apiFetch(`/bookings/${id}`, { method: "DELETE" });

// ─────────────────────────────────────────────────────────────────────────────
// MASTER TIMESLOTS
// ─────────────────────────────────────────────────────────────────────────────

export const getConsultantMasterSlots = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}/master-timeslots`);

// ─────────────────────────────────────────────────────────────────────────────
// SKILLS / CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

export const getAllSkills = async () => {
  const data = await apiFetch("/skills");
  return extractArray(data);
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKETS  — matches TicketController exactly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/tickets  (multipart — ticketData JSON part + optional file)
 * Matches Spring Boot TicketController exactly.
 */
export const createTicket = async (
  payload: {
    userId: number;
    consultantId?: number | null;
    category: string;
    description: string;
    attachmentUrl?: string;
    priority?: string;
  },
  file?: File | null
): Promise<any> => {
  const token = getToken();
  const form  = new FormData();
  form.append("ticketData", JSON.stringify(payload));
  if (file) form.append("file", file);

  const res = await fetch(`${BASE_URL}/tickets`, {
    method: "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
};

/** GET /api/tickets */
export const getAllTickets = async (): Promise<any[]> => {
  const data = await apiFetch("/tickets");
  return extractArray(data);
};

/** GET /api/tickets/:id */
export const getTicketById = async (id: number) => apiFetch(`/tickets/${id}`);

/** GET /api/tickets/user/:userId */
export const getTicketsByUser = (userId: number): Promise<any[]> =>
  apiFetch(`/tickets/user/${userId}`).then(extractArray);

/** GET /api/tickets/consultant/:consultantId */
export const getTicketsByConsultant = (consultantId: number): Promise<any[]> =>
  apiFetch(`/tickets/consultant/${consultantId}`).then(extractArray);

/** PATCH /api/tickets/:id/status — body: { status: "OPEN" } */
export const updateTicketStatus  = (id: number, status: string) =>
  apiFetch(`/tickets/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
/** Alias for updateTicketStatus */
export const patchTicketStatus = updateTicketStatus;

/**
 * PUT /api/tickets/:id/assign — body: { consultantId: 5 }
 * Reassigns to a consultant by numeric ID (matches TicketController).
 */
export const reassignTicket = (id: number, consultantId: number) =>
  apiFetch(`/tickets/${id}/assign`, {
    method: "PUT",
    body: JSON.stringify({ consultantId }),
  });

/** PATCH /api/tickets/:id — generic partial update */
export const updateTicket = async (id: number, payload: any) =>
  apiFetch(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

/** DELETE /api/tickets/:id */
export const deleteTicket = async (id: number) =>
  apiFetch(`/tickets/${id}`, { method: "DELETE" });

/** Alias — close a ticket by setting status to CLOSED */
export const closeTicket = (id: number) => updateTicketStatus(id, "CLOSED");

// ─────────────────────────────────────────────────────────────────────────────
// TICKET COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/tickets/:ticketId/comments */
export const getTicketComments = async (ticketId: number): Promise<any[]> => {
  const data = await apiFetch(`/tickets/${ticketId}/comments`);
  return extractArray(data);
};

/**
 * POST /api/tickets/comments
 * Used for both public replies and internal notes.
 *  - isConsultantReply = true  → agent/admin reply visible to user
 *  - isInternal        = true  → private agent note, never shown to user
 */
export const postTicketComment = (
  ticketId: number,
  message: string,
  senderId: number,
  isConsultantReply = false,
  isInternal = false
) =>
  apiFetch("/tickets/comments", {
    method: "POST",
    body: JSON.stringify({ ticketId, message, senderId, isConsultantReply, isInternal }),
  });

/**
 * POST /api/tickets/:id/notes — private agent note, never shown to user.
 * Falls back to postTicketComment with isInternal flag if dedicated endpoint is absent.
 */
export const postInternalNote = async (
  ticketId: number,
  noteText: string,
  authorId: number
) => {
  try {
    return await apiFetch(`/tickets/${ticketId}/notes`, {
      method: "POST",
      body: JSON.stringify({ authorId, noteText }),
    });
  } catch {
    // Fallback: route through comments with isInternal flag
    return postTicketComment(ticketId, noteText, authorId, false, true);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKET FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/tickets/:id  (or /api/tickets/:id/feedback)
 * Submitted after ticket is resolved.
 */
export const submitTicketFeedback = async (
  ticketId: number,
  feedbackRating: number,
  feedbackText: string
) => {
  try {
    return await apiFetch(`/tickets/${ticketId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ rating: feedbackRating, feedbackText }),
    });
  } catch {
    // Fallback: POST directly on ticket (original TicketController path)
    return apiFetch(`/tickets/${ticketId}`, {
      method: "POST",
      body: JSON.stringify({ feedbackRating, feedbackText }),
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SLA HELPERS  (mirrors backend Priority.slaHours() logic)
// ─────────────────────────────────────────────────────────────────────────────

export const SLA_HOURS: Record<string, number> = {
  LOW: 72, MEDIUM: 24, HIGH: 8, URGENT: 4,
};

export const getSlaInfo = (ticket: any) => {
  if (!ticket?.createdAt) return null;
  const created  = new Date(ticket.createdAt);
  const hours    = SLA_HOURS[ticket.priority] ?? 24;
  const deadline = new Date(created.getTime() + hours * 3_600_000);
  const minsLeft = Math.round((deadline.getTime() - Date.now()) / 60_000);
  const breached = ticket.isSlaBreached || minsLeft <= 0;
  const warning  = !breached && minsLeft < 120;

  return {
    deadline,
    minsLeft,
    breached,
    warning,
    label: breached
      ? `Overdue by ${Math.abs(minsLeft)} min`
      : minsLeft < 60
      ? `${minsLeft} min remaining`
      : `${Math.round(minsLeft / 60)}h remaining`,
    deadlineStr: deadline.toLocaleString("en-IN", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    }),
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// STATUS / PRIORITY STYLES  (shared across all pages)
// ─────────────────────────────────────────────────────────────────────────────

export const getStatusStyle = (status: string) => {
  const s = status?.toUpperCase();
  const map: Record<string, { bg: string; color: string; border: string }> = {
    NEW:         { bg: "#EFF6FF", color: "#2563EB", border: "#93C5FD" },
    OPEN:        { bg: "#FFF7ED", color: "#EA580C", border: "#FED7AA" },
    IN_PROGRESS: { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D" },
    RESOLVED:    { bg: "#F0FDF4", color: "#16A34A", border: "#86EFAC" },
    CLOSED:      { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" },
    ESCALATED:   { bg: "#FEF2F2", color: "#DC2626", border: "#FCA5A5" },
  };
  return map[s] ?? { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" };
};

export const getPriorityStyle = (priority: string) => {
  const p = priority?.toUpperCase();
  const map: Record<string, { bg: string; color: string; border: string; dot: string }> = {
    LOW:    { bg: "#F0FDF4", color: "#16A34A", border: "#86EFAC", dot: "#22C55E" },
    MEDIUM: { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D", dot: "#F59E0B" },
    HIGH:   { bg: "#FFF7ED", color: "#EA580C", border: "#FED7AA", dot: "#F97316" },
    URGENT: { bg: "#FEF2F2", color: "#DC2626", border: "#FCA5A5", dot: "#EF4444" },
  };
  return map[p] ?? map.MEDIUM;
};

export default api;

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACKS  (session / booking ratings)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/feedbacks/booking/:bookingId — fetch existing feedback for a booking */
export const getFeedbackByBooking = async (bookingId: number) =>
  apiFetch(`/feedbacks/booking/${bookingId}`);

/** POST /api/feedbacks — submit new session feedback */
export const createFeedback = async (payload: {
  userId: number; consultantId: number;
  bookingId: number; meetingId?: number;
  rating: number; comments?: string;
}) => apiFetch("/feedbacks", { method: "POST", body: JSON.stringify(payload) });

/** PUT /api/feedbacks/:id — update existing session feedback */
export const updateFeedback = async (id: number, payload: {
  userId: number; consultantId: number;
  bookingId: number; meetingId?: number;
  rating: number; comments?: string;
}) => apiFetch(`/feedbacks/${id}`, { method: "PUT", body: JSON.stringify(payload) });