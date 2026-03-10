// ─────────────────────────────────────────────────────────────────────────────
// api.ts  —  Unified service layer
// ─────────────────────────────────────────────────────────────────────────────

import axios from "axios";

const BASE_URL = "/api";

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
    console.error(`❌ No token found under key "${TOKEN_KEY}". Cannot authenticate.`);
    console.groupEnd();
    return null;
  }
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Not a valid JWT (expected 3 parts)");
    const jwtPayload = JSON.parse(atob(parts[1]));
    console.log("✅ Token payload:", jwtPayload);
    console.log("   Roles/Authorities:", {
      role:        jwtPayload.role,
      roles:       jwtPayload.roles,
      authorities: jwtPayload.authorities,
      scope:       jwtPayload.scope,
    });
    const exp = jwtPayload.exp ? new Date(jwtPayload.exp * 1000) : null;
    if (exp) {
      const expired = exp < new Date();
      console.log(`   Expires: ${exp.toLocaleString()} — ${expired ? "❌ EXPIRED" : "✅ Still valid"}`);
      if (expired) console.error("   ⚠️  Token is expired — log in again!");
    }
    console.groupEnd();
    return jwtPayload;
  } catch (e) {
    console.error("❌ Failed to decode token:", e);
    console.groupEnd();
    return null;
  }
};

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    console.warn(`⚠️  [axios] No token found under key "${TOKEN_KEY}" — request will be unauthenticated`);
  }
  return config;
});

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const defaultHeaders: Record<string, string> = { Accept: "application/json" };

  if (!(options.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token) {
    defaultHeaders["Authorization"] = `Bearer ${token}`;
  } else {
    console.warn(`⚠️  [fetch] No token found under key "${TOKEN_KEY}" — request will be unauthenticated`);
  }

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
        console.error("   Response body:", data);
        console.error("   Calling debugToken() to help diagnose…");
        debugToken();
      }
      throw new Error(data?.message || `Request failed with status ${res.status}`);
    }
    return data;
  } catch (err: any) {
    console.error("API Fetch Error:", err);
    if (err.name === "TypeError" && err.message === "Failed to fetch") {
      throw new Error("Cannot connect to server. Please check if the backend is running.");
    }
    throw err;
  }
};

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

export const extractArray = (data: any): any[] => {
  if (!data) return [];
  if (Array.isArray(data))          return data;
  if (Array.isArray(data.content))  return data.content;
  if (Array.isArray(data.data))     return data.data;
  if (Array.isArray(data.tickets))  return data.tickets;
  if (Array.isArray(data.bookings)) return data.bookings;
  if (Array.isArray(data.items))    return data.items;
  if (Array.isArray(data.results))  return data.results;
  for (const key of Object.keys(data)) {
    if (Array.isArray(data[key]) && data[key].length > 0) return data[key];
  }
  return [];
};

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

export const sendRegistrationOtp = async (email: string): Promise<void> => {
  await publicFetch("/users/send-otp", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
};

export const sendForgotPasswordOtp = async (email: string): Promise<void> => {
  await publicFetch("/users/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
};

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

export const getOnboarding    = async (id: number)                  => apiFetch(`/onboarding/${id}`);
export const updateOnboarding = async (id: number, payload: object) =>
  apiFetch(`/onboarding/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteOnboarding = async (id: number)                  =>
  apiFetch(`/onboarding/${id}`, { method: "DELETE" });

export const getTimeslotById = async (id: number) => apiFetch(`/timeslots/${id}`);

export const getTimeslotsByConsultant = async (consultantId: number) => {
  const data = await apiFetch(`/timeslots/consultant/${consultantId}`);
  if (Array.isArray(data)) return data;
  if (data?.content)       return data.content;
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

export const getConsultantMasterSlots = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}/master-timeslots`);

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
    const consultantsData = await apiFetch("/consultants");
    const consultants: any[] = extractArray(consultantsData);
    if (consultants.length === 0) { console.warn("getAllBookings: no consultants"); return []; }

    const results = await Promise.allSettled(
      consultants.map((c: any) =>
        apiFetch(`/bookings/consultant/${c.id}`)
          .then(r => extractArray(r))
          .catch(() => [] as any[])
      )
    );
    const all: any[] = results.flatMap(r => r.status === "fulfilled" ? r.value : []);
    const seen = new Set<number>();
    const deduped = all.filter(b => { if (seen.has(b.id)) return false; seen.add(b.id); return true; });
    console.log(`✅ getAllBookings: ${deduped.length} bookings across ${consultants.length} consultants`);
    return deduped;
  } catch (err: any) {
    console.error("❌ getAllBookings fallback failed:", err?.message);
    return [];
  }
};

export const getMyBookings = async (): Promise<any[]> => {
  try {
    try {
      const response = await api.get("/bookings/me");
      return extractArray(response.data);
    } catch {
      const data = await apiFetch("/bookings/me");
      return extractArray(data);
    }
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

export const getAllSkills = async () => {
  const data = await apiFetch("/skills");
  return extractArray(data);
};

export const createTicket = async (
  payload: {
    userId?: number | null;
    consultantId?: number | null;
    category: string;
    description: string;
    attachmentUrl?: string;
    priority?: string;
    status?: string;
    title?: string;
  },
  file?: File | null
): Promise<any> => {
  const token = getToken();
  const ticketPayload = { ...payload, status: payload.status || "NEW" };

  const form = new FormData();
  const blob = new Blob([JSON.stringify(ticketPayload)], { type: "application/json" });
  form.append("data",       blob);
  form.append("ticketData", blob);
  if (file) form.append("file", file);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}/tickets`, {
    method: "POST",
    headers,
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
  return data;
};

export const getAllTickets = async (): Promise<any[]> => {
  try {
    const data = await apiFetch("/tickets");
    const arr = extractArray(data);
    if (arr.length === 0) {
      console.warn("⚠️ [getAllTickets] /api/tickets returned empty array.");
      console.warn("   Check: (a) no tickets exist, OR (b) token lacks ROLE_ADMIN.");
      debugToken();
    } else {
      console.log(`✅ [getAllTickets] Loaded ${arr.length} tickets`);
    }
    return arr;
  } catch (err) {
    console.error("❌ [getAllTickets] error:", err);
    debugToken();
    return [];
  }
};

export const getTicketById = async (id: number) => apiFetch(`/tickets/${id}`);

export const getTicketsByUser = async (userId: number): Promise<any[]> => {
  try {
    const data = await apiFetch(`/tickets/user/${userId}`);
    const arr = extractArray(data);
    console.log(`✅ getTicketsByUser(${userId}) → ${arr.length} tickets`);
    return arr;
  } catch (err: any) {
    console.error(`❌ getTicketsByUser(${userId}) failed:`, err?.message);
    return [];
  }
};

export const getTicketsByConsultant = async (consultantId: number): Promise<any[]> => {
  try {
    const data = await apiFetch(`/tickets/consultant/${consultantId}`);
    const arr = extractArray(data);
    console.log(`✅ getTicketsByConsultant(${consultantId}) → ${arr.length} tickets`);
    return arr;
  } catch (err: any) {
    console.error(`❌ getTicketsByConsultant(${consultantId}) failed:`, err?.message);
    return [];
  }
};

// ─── BUG 1 FIX: updateTicketStatus ───────────────────────────────────────────
// Root cause: Spring backend expects status as a query-param or plain-text body,
// NOT as a JSON object { status }. We try 3 strategies in order.
/** PATCH /api/tickets/:id/status */
export const updateTicketStatus = async (id: number, status: string): Promise<any> => {
  // Strategy 1: query-param — PATCH /tickets/{id}/status?status=VALUE
  try {
    const result = await apiFetch(`/tickets/${id}/status?status=${encodeURIComponent(status)}`, {
      method: "PATCH",
    });
    console.log(`✅ updateTicketStatus(${id}, ${status}) via query-param`);
    return result;
  } catch (e1: any) {
    console.warn(`⚠️ query-param strategy failed: ${e1?.message}`);
  }

  // Strategy 2: plain text body — Content-Type: text/plain, body = status string
  try {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/tickets/${id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "text/plain",
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: status,
    });
    const ct   = res.headers.get("content-type");
    const data = ct?.includes("application/json") ? await res.json() : { message: await res.text() };
    if (!res.ok) throw new Error(data?.message || `Status ${res.status}`);
    console.log(`✅ updateTicketStatus(${id}, ${status}) via text/plain body`);
    return data;
  } catch (e2: any) {
    console.warn(`⚠️ text/plain strategy failed: ${e2?.message}`);
  }

  // Strategy 3: original JSON body fallback
  console.warn(`⚠️ Falling back to JSON body for updateTicketStatus(${id}, ${status})`);
  return apiFetch(`/tickets/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
};
// ─────────────────────────────────────────────────────────────────────────────

export const patchTicketStatus = updateTicketStatus;

export const assignTicketToConsultant = async (ticketId: number, consultantId: number) =>
  apiFetch(`/tickets/${ticketId}/assign`, {
    method: "PUT",
    body: JSON.stringify({ consultantId }),
  });
export const reassignTicket = assignTicketToConsultant;

export const updateTicket = async (id: number, payload: any) =>
  apiFetch(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const deleteTicket = async (id: number) =>
  apiFetch(`/tickets/${id}`, { method: "DELETE" });

export const closeTicket = (id: number) => updateTicketStatus(id, "CLOSED");

export const getTicketComments = async (ticketId: number): Promise<any[]> => {
  const data = await apiFetch(`/tickets/${ticketId}/comments`);
  return extractArray(data);
};

export const postTicketComment = async (
  ticketId: number,
  message: string,
  senderIdOrOptions?: number | {
    senderId?: number | null;
    isConsultantReply?: boolean;
    authorRole?: "CUSTOMER" | "AGENT";
  } | null,
  isConsultantReply = false,
  isInternal = false
): Promise<any> => {
  let senderId: number | null = null;
  let consultantReply = isConsultantReply;
  let authorRole: string = "CUSTOMER";

  if (typeof senderIdOrOptions === "number") {
    senderId = senderIdOrOptions;
  } else if (senderIdOrOptions && typeof senderIdOrOptions === "object") {
    senderId        = senderIdOrOptions.senderId ?? null;
    consultantReply = senderIdOrOptions.isConsultantReply ?? false;
    authorRole      = senderIdOrOptions.authorRole ?? "CUSTOMER";
  }

  if (senderId === null) {
    const stored = localStorage.getItem("fin_user_id");
    if (stored) senderId = Number(stored);
  }

  return apiFetch("/tickets/comments", {
    method: "POST",
    body: JSON.stringify({
      ticketId,
      message,
      senderId,
      isConsultantReply: consultantReply,
      isPrivateNote: isInternal,
      authorRole,
    }),
  });
};

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
    return postTicketComment(ticketId, noteText, authorId, false, true);
  }
};

export const submitTicketFeedback = async (
  ticketId: number,
  rating: number,
  feedbackText: string
) => {
  try {
    return await apiFetch(`/tickets/${ticketId}/feedback`, {
      method: "POST",
      body: JSON.stringify({ rating, feedbackText }),
    });
  } catch {
    return await apiFetch(`/tickets/${ticketId}`, {
      method: "PATCH",
      body: JSON.stringify({ feedbackRating: rating, feedbackText }),
    });
  }
};

export const getMyUnreadNotifications = async () => {
  const data = await apiFetch("/notifications");
  return extractArray(data);
};

export const markNotificationAsRead = async (id: number) =>
  apiFetch(`/notifications/${id}/read`, { method: "PUT" });

export const sendTicketStatusEmail = async (payload: {
  ticketId: number;
  ticketTitle: string;
  newStatus: string;
  userEmail: string;
  userName?: string;
  updatedBy?: string;
}): Promise<void> => {
  try {
    await apiFetch("/notifications/email/ticket-update", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.log(`✉️  Status email sent to ${payload.userEmail} for ticket #${payload.ticketId}`);
  } catch (err: any) {
    console.warn(`⚠️  sendTicketStatusEmail failed (non-fatal):`, err?.message);
  }
};

export const sendTicketAssignedEmail = async (payload: {
  ticketId: number;
  ticketTitle: string;
  consultantEmail: string;
  consultantName?: string;
  assignedBy?: string;
  priority?: string;
}): Promise<void> => {
  try {
    await apiFetch("/notifications/email/ticket-assigned", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.log(`✉️  Assignment email sent to ${payload.consultantEmail} for ticket #${payload.ticketId}`);
  } catch (err: any) {
    console.warn(`⚠️  sendTicketAssignedEmail failed (non-fatal):`, err?.message);
  }
};

export const sendTicketCommentEmail = async (payload: {
  ticketId: number;
  ticketTitle: string;
  userEmail: string;
  userName?: string;
  commentPreview: string;
  repliedBy?: string;
}): Promise<void> => {
  try {
    await apiFetch("/notifications/email/ticket-comment", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.log(`✉️  Reply email sent to ${payload.userEmail} for ticket #${payload.ticketId}`);
  } catch (err: any) {
    console.warn(`⚠️  sendTicketCommentEmail failed (non-fatal):`, err?.message);
  }
};

export const sendTicketEscalatedEmail = async (payload: {
  ticketId: number;
  ticketTitle: string;
  userEmail?: string;
  consultantEmail?: string;
  reason?: string;
}): Promise<void> => {
  try {
    await apiFetch("/notifications/email/ticket-escalated", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    console.log(`✉️  Escalation email sent for ticket #${payload.ticketId}`);
  } catch (err: any) {
    console.warn(`⚠️  sendTicketEscalatedEmail failed (non-fatal):`, err?.message);
  }
};

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

export const getStatusStyle = (status: string) => {
  const s = (status ?? "").toUpperCase();
  const map: Record<string, { bg: string; color: string; border: string }> = {
    NEW:         { bg: "#EFF6FF", color: "#2563EB", border: "#93C5FD" },
    OPEN:        { bg: "#FFF7ED", color: "#EA580C", border: "#FED7AA" },
    IN_PROGRESS: { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D" },
    RESOLVED:    { bg: "#F0FDF4", color: "#16A34A", border: "#86EFAC" },
    CLOSED:      { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" },
    ESCALATED:   { bg: "#FEF2F2", color: "#DC2626", border: "#FCA5A5" },
    PENDING:     { bg: "#FAF5FF", color: "#7C3AED", border: "#C4B5FD" },
  };
  return map[s] ?? { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" };
};

export const getPriorityStyle = (priority: string) => {
  const p = (priority ?? "").toUpperCase();
  const map: Record<string, { bg: string; color: string; border: string; dot: string }> = {
    LOW:      { bg: "#F0FDF4", color: "#16A34A", border: "#86EFAC", dot: "#22C55E" },
    MEDIUM:   { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D", dot: "#F59E0B" },
    HIGH:     { bg: "#FFF7ED", color: "#EA580C", border: "#FED7AA", dot: "#F97316" },
    URGENT:   { bg: "#FEF2F2", color: "#DC2626", border: "#FCA5A5", dot: "#EF4444" },
    CRITICAL: { bg: "#4A0404", color: "#FCA5A5", border: "#7F1D1D", dot: "#DC2626" },
  };
  return map[p] ?? map.MEDIUM;
};

export const getDashboardSummaries = async (period: "DAILY" | "WEEKLY" = "WEEKLY") =>
  apiFetch(`/dashboard/summaries?period=${period}`);

export const getFeedbackByBooking = async (bookingId: number) =>
  apiFetch(`/feedbacks/booking/${bookingId}`);

export const createFeedback = async (payload: {
  userId: number; consultantId: number;
  bookingId: number; meetingId?: number;
  rating: number; comments?: string;
}) => apiFetch("/feedbacks", { method: "POST", body: JSON.stringify(payload) });

export const updateFeedback = async (id: number, payload: {
  userId: number; consultantId: number;
  bookingId: number; meetingId?: number;
  rating: number; comments?: string;
}) => apiFetch(`/feedbacks/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const initiateGoogleOAuth = () => {
  window.location.href = `${BASE_URL}/oauth2/authorize/google`;
};

export const handleOAuthCallback = (): {
  token: string; role: string; userId: number; consultantId?: number;
} | null => {
  const params      = new URLSearchParams(window.location.search);
  const token       = params.get("token");
  const role        = params.get("role");
  const userId      = params.get("userId");
  if (!token || !role || !userId) return null;
  setToken(token);
  setRole(role);
  setUserId(Number(userId));
  const consultantId = params.get("consultantId");
  if (consultantId) setConsultantId(Number(consultantId));
  debugToken();
  return { token, role, userId: Number(userId), consultantId: consultantId ? Number(consultantId) : undefined };
};

export const loginWithGoogleToken = async (googleIdToken: string) => {
  clearToken();
  const data = await publicFetch("/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken: googleIdToken }),
  });
  if (data?.token)        setToken(data.token);
  if (data?.role)         setRole(data.role);
  if (data?.id)           setUserId(Number(data.id));
  if (data?.userId)       setUserId(Number(data.userId));
  if (data?.consultantId) setConsultantId(Number(data.consultantId));
  debugToken();
  return data;
};

export const escalateTicket = async (id: number, reason?: string): Promise<any> => {
  try {
    return await apiFetch(`/tickets/${id}/escalate`, {
      method: "POST",
      body: JSON.stringify({ reason: reason || "" }),
    });
  } catch {
    return apiFetch(`/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "ESCALATED" }),
    });
  }
};

export const getCannedResponses = async (): Promise<any[]> => {
  const data = await apiFetch("/canned-responses");
  return Array.isArray(data) ? data : extractArray(data);
};

export const createCannedResponse = async (payload: {
  title: string; message: string; category?: string;
}): Promise<any> =>
  apiFetch("/canned-responses", { method: "POST", body: JSON.stringify(payload) });

export const updateCannedResponse = async (id: number, payload: {
  title?: string; message?: string; category?: string;
}): Promise<any> =>
  apiFetch(`/canned-responses/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteCannedResponse = async (id: number): Promise<void> => {
  await apiFetch(`/canned-responses/${id}`, { method: "DELETE" });
};

export const getTicketCategories = async (): Promise<any[]> => {
  const data = await apiFetch("/ticket-categories");
  return Array.isArray(data) ? data : extractArray(data);
};

export const createTicketCategory = async (payload: {
  name: string; description?: string;
}): Promise<any> =>
  apiFetch("/ticket-categories", { method: "POST", body: JSON.stringify(payload) });

export const toggleTicketCategory = async (id: number): Promise<any> => {
  try {
    return await apiFetch(`/ticket-categories/${id}/toggle`, { method: "PATCH" });
  } catch {
    return apiFetch(`/ticket-categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: true }),
    });
  }
};

export const deleteTicketCategory = async (id: number): Promise<void> => {
  await apiFetch(`/ticket-categories/${id}`, { method: "DELETE" });
};

export const getBusinessHours = async (): Promise<any[]> => {
  const data = await apiFetch("/business-hours");
  return Array.isArray(data) ? data : extractArray(data);
};

export const updateBusinessHours = async (hours: Array<{
  dayOfWeek: string; openTime: string; closeTime: string; isOpen: boolean;
}>): Promise<any> =>
  apiFetch("/business-hours", { method: "PUT", body: JSON.stringify(hours) });

export const getHolidays = async (): Promise<any[]> => {
  const data = await apiFetch("/holidays");
  return Array.isArray(data) ? data : extractArray(data);
};

export const addHoliday = async (payload: { name: string; holidayDate: string }): Promise<any> =>
  apiFetch("/holidays", { method: "POST", body: JSON.stringify(payload) });

export const deleteHoliday = async (id: number): Promise<void> => {
  await apiFetch(`/holidays/${id}`, { method: "DELETE" });
};

export const getAutoResponder = async (): Promise<any> =>
  apiFetch("/auto-responder");

export const updateAutoResponder = async (payload: { enabled: boolean; message: string }): Promise<any> =>
  apiFetch("/auto-responder", { method: "PUT", body: JSON.stringify(payload) });

const _today = () => new Date().toISOString().slice(0, 10);

export const triggerDownload = (blob: Blob, filename: string, type: string): void => {
  const url = URL.createObjectURL(new Blob([blob], { type }));
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const exportTicketsExcel = async (): Promise<void> => {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/tickets/export/excel`, {
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  triggerDownload(await res.blob(), `tickets_${_today()}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
};

export const exportSingleTicketExcel = async (id: number): Promise<void> => {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/tickets/${id}/export/excel`, {
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  triggerDownload(await res.blob(), `ticket_${id}_${_today()}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
};

export const exportTicketsPdf = async (): Promise<void> => {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/tickets/export/pdf`, {
    headers: {
      Accept: "application/pdf",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  triggerDownload(await res.blob(), `tickets_${_today()}.pdf`, "application/pdf");
};

export const exportSingleTicketPdf = async (id: number): Promise<void> => {
  const token = getToken();
  const res = await fetch(`${BASE_URL}/tickets/${id}/export/pdf`, {
    headers: {
      Accept: "application/pdf",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  triggerDownload(await res.blob(), `ticket_${id}_${_today()}.pdf`, "application/pdf");
};

export const ticketsToExportRows = (tickets: any[]): Record<string, any>[] =>
  tickets.map(t => ({
    "Ticket ID":      t.id,
    "Title":          t.title || t.category || "",
    "Description":    t.description || "",
    "Category":       t.category || "",
    "Priority":       t.priority || "",
    "Status":         t.status || "",
    "Submitted By":   t.user?.name || t.user?.username || t.userName || (t.userId ? `User #${t.userId}` : ""),
    "Assigned To":    t.agentName || t.consultantName || "",
    "Created At":     t.createdAt ? new Date(t.createdAt).toLocaleString("en-IN") : "",
    "Updated At":     t.updatedAt ? new Date(t.updatedAt).toLocaleString("en-IN") : "",
    "SLA Breached":   t.isSlaBreached ? "Yes" : "No",
    "Escalated":      t.isEscalated   ? "Yes" : "No",
    "Feedback Rating": t.feedbackRating ?? "",
    "Feedback Text":   t.feedbackText  ?? "",
  }));

export const clientExportTicketsExcel = async (tickets: any[], filename?: string): Promise<void> => {
  const rows  = ticketsToExportRows(tickets);
  const fname = filename || `tickets_${_today()}.xlsx`;
  try {
    const XLSX = (window as any).XLSX;
    if (XLSX) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tickets");
      ws["!cols"] = Object.keys(rows[0] ?? {}).map(k => ({ wch: Math.max(k.length, 18) }));
      XLSX.writeFile(wb, fname);
      return;
    }
  } catch { /* fall through */ }
  const headers = Object.keys(rows[0] ?? {});
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  triggerDownload(new Blob([csv], { type: "text/csv" }), fname.replace(".xlsx", ".csv"), "text/csv");
};

export const clientExportTicketsPdf = async (tickets: any[], filename?: string): Promise<void> => {
  const rows  = ticketsToExportRows(tickets);
  const fname = filename || `tickets_${_today()}.pdf`;
  try {
    const jsPDF = (window as any).jspdf?.jsPDF || (window as any).jsPDF;
    if (jsPDF) {
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text("Support Tickets Export", 40, 40);
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleString("en-IN")}  |  Total: ${tickets.length} tickets`, 40, 58);
      const headers = Object.keys(rows[0] ?? {});
      (doc as any).autoTable?.({
        head: [headers],
        body: rows.map(r => headers.map(h => String(r[h] ?? ""))),
        startY: 72,
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 40, right: 40 },
      });
      doc.save(fname);
      return;
    }
  } catch { /* fall through */ }
  const headers = Object.keys(rows[0] ?? {});
  const html = `<!DOCTYPE html><html><head><title>Tickets Export</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
h2{color:#1e3a5f}table{border-collapse:collapse;width:100%}
th{background:#2563eb;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
td{border-bottom:1px solid #e2e8f0;padding:5px 8px}
tr:nth-child(even){background:#f8fafc}</style></head><body>
<h2>Support Tickets Export</h2>
<p style="color:#64748b">Generated: ${new Date().toLocaleString("en-IN")} | Total: ${tickets.length} tickets</p>
<table><thead><tr>${headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>
<tbody>${rows.map(r => `<tr>${Object.values(r).map(v => `<td>${String(v ?? "")}</td>`).join("")}</tr>`).join("")}</tbody>
</table><script>window.onload=()=>window.print();</script></body></html>`;
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); }
};

export default api;