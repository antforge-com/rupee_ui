// ─────────────────────────────────────────────────────────────────────────────
// api.ts  —  Unified service layer
// Aligned with backend: TicketController, TicketService, AdminConfigController
// ─────────────────────────────────────────────────────────────────────────────

import axios from "axios";

const BASE_URL = (typeof __API_BASE__ !== "undefined") ? __API_BASE__ : "/api";

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN / SESSION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export const TOKEN_KEY = "fin_token";
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("fin_role");
  localStorage.removeItem("fin_user_id");
  localStorage.removeItem("fin_consultant_id");
};
export const setRole = (role: string) => localStorage.setItem("fin_role", role);
export const getRole = () => localStorage.getItem("fin_role");
export const setUserId = (id: number) => localStorage.setItem("fin_user_id", String(id));
export const getUserId = () => localStorage.getItem("fin_user_id");
export const setConsultantId = (id: number) => localStorage.setItem("fin_consultant_id", String(id));
export const getConsultantId = () => localStorage.getItem("fin_consultant_id");

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
      role: jwtPayload.role,
      roles: jwtPayload.roles,
      authorities: jwtPayload.authorities,
      scope: jwtPayload.scope,
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

// ─────────────────────────────────────────────────────────────────────────────
// AXIOS INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// Attach token to every axios request automatically
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  } else {
    console.warn(`⚠️  [axios] No token found under key "${TOKEN_KEY}" — request will be unauthenticated`);
  }
  return config;
});

// ─────────────────────────────────────────────────────────────────────────────
// CORE FETCH WRAPPERS
// ─────────────────────────────────────────────────────────────────────────────

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
    const data: any = contentType?.includes("application/json")
      ? await res.json()
      : { message: await res.text() };

    if (!res.ok) {
      if (res.status === 403) {
        console.error(`🚫 403 Forbidden on ${options.method || "GET"} ${endpoint}`);
        console.error("   Response body:", data);
        console.error("   Calling debugToken() to help diagnose…");
        debugToken();
      } else if (res.status === 404) {
        console.warn(`⚠️ 404 Not Found: ${endpoint}`);
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
  const ct = res.headers.get("content-type");
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
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.content)) return data.content;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.tickets)) return data.tickets;
  if (Array.isArray(data.bookings)) return data.bookings;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.results)) return data.results;
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
  if (data?.token) setToken(data.token);
  if (data?.role) setRole(data.role);
  if (data?.id) setUserId(Number(data.id));
  if (data?.userId) setUserId(Number(data.userId));
  if (data?.consultantId) setConsultantId(Number(data.consultantId));
  debugToken();
  return data;
};

export const registerUser = async (payload: any) => {
  const data = await publicFetch("/onboarding", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (data?.token) setToken(data.token);
  if (data?.role) setRole(data.role);
  if (data?.id) setUserId(Number(data.id));
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

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

export const getAllUsers = async () => apiFetch("/users");
export const getUsersByRole = async (role: string) => apiFetch(`/users/role/${role}`);

export const getConsultantUserList = async (): Promise<string[]> => {
  try {
    const data = await apiFetch("/users/role/CONSULTANT");
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
// CONSULTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const getConsultants = async () => apiFetch("/consultants");

export const getConsultantById = async (consultantId: number) => {
  try {
    const data = await apiFetch(`/consultants/${consultantId}`);
    if (data) return data;
  } catch {
    // fall through
  }
  try {
    return await apiFetch(`/users/${consultantId}`);
  } catch {
    return null;
  }
};

export const getMyProfile = getConsultantById;

export const createConsultant = async (payload: any) => {
  const formData = new FormData();
  const dataPayload = { ...payload };
  let file: File | null = null;

  if (dataPayload.file) { file = dataPayload.file as File; delete dataPayload.file; }
  if (dataPayload.shiftStartTime?.length === 5) dataPayload.shiftStartTime += ":00";
  if (dataPayload.shiftEndTime?.length === 5) dataPayload.shiftEndTime += ":00";

  formData.append("data", new Blob([JSON.stringify(dataPayload)], { type: "application/json" }));
  if (file) formData.append("file", file);
  return apiFetch("/consultants", { method: "POST", body: formData });
};

export const updateConsultant = async (
  consultantId: number,
  data: {
    name?: string; designation?: string; charges?: number; email?: string;
    skills?: string[]; shiftStartTime?: string | null; shiftEndTime?: string | null;
    description?: string; rating?: number | null;[key: string]: any;
  },
  explicitFile?: File | null
): Promise<any> => {
  const formData = new FormData();
  const dataPayload = { ...data };
  let file: File | null = explicitFile || null;

  if (dataPayload.file) { if (!file) file = dataPayload.file as File; delete dataPayload.file; }
  if (dataPayload.shiftStartTime?.length === 5) dataPayload.shiftStartTime += ":00";
  if (dataPayload.shiftEndTime?.length === 5) dataPayload.shiftEndTime += ":00";

  formData.append("data", new Blob([JSON.stringify(dataPayload)], { type: "application/json" }));
  if (file) formData.append("file", file);
  return apiFetch(`/consultants/${consultantId}`, { method: "PUT", body: formData });
};

export const deleteConsultant = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}`, { method: "DELETE" });

export const resolveConsultantName = async (id: number): Promise<string> => {
  try {
    const d = await getConsultantById(id);
    return d?.name || d?.fullName || d?.username || `Consultant #${id}`;
  } catch {
    return `Consultant #${id}`;
  }
};

export const getAllConsultants = getConsultants;
export const getAllAdvisors = getConsultants;
export const getAdvisorById = getConsultantById;
export const createAdvisor = createConsultant;
export const updateAdvisor = updateConsultant;
export const deleteAdvisor = deleteConsultant;

/** @deprecated Use getConsultantUserList instead */
export const getAgentList = async (): Promise<string[]> => {
  try {
    const data = await apiFetch("/users/role/CONSULTANT");
    return (Array.isArray(data) ? data : []).map((u: any) => u.name || u.username || u.email);
  } catch {
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING
// ─────────────────────────────────────────────────────────────────────────────

export const getOnboarding = async (id: number) => apiFetch(`/onboarding/${id}`);
export const updateOnboarding = async (id: number, payload: object) =>
  apiFetch(`/onboarding/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteOnboarding = async (id: number) =>
  apiFetch(`/onboarding/${id}`, { method: "DELETE" });

// ─────────────────────────────────────────────────────────────────────────────
// TIMESLOTS
// ─────────────────────────────────────────────────────────────────────────────

export const getTimeslotById = async (id: number) => apiFetch(`/timeslots/${id}`);

export const getTimeslotsByConsultant = async (consultantId: number) => {
  const data = await apiFetch(`/timeslots/consultant/${consultantId}`);
  if (Array.isArray(data)) return data;
  if (data?.content) return data.content;
  return [];
};

export const getAvailableTimeslotsByConsultant = async (consultantId: number) => {
  try {
    const data = await apiFetch(`/timeslots/consultant/${consultantId}/available`);
    return extractArray(data);
  } catch {
    return getTimeslotsByConsultant(consultantId);
  }
};

export const createTimeslot = async (payload: {
  consultantId: number; slotDate: string; slotTime: string;
  durationMinutes: number; masterTimeSlotId?: number;
}) => apiFetch("/timeslots", { method: "POST", body: JSON.stringify(payload) });

export const updateTimeslot = async (id: number, payload: any) =>
  apiFetch(`/timeslots/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteTimeslot = async (id: number) =>
  apiFetch(`/timeslots/${id}`, { method: "DELETE" });

// ─────────────────────────────────────────────────────────────────────────────
// MASTER TIMESLOTS
// ─────────────────────────────────────────────────────────────────────────────

export const getConsultantMasterSlots = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}/master-timeslots`);

// ─────────────────────────────────────────────────────────────────────────────
// BOOKINGS
// ─────────────────────────────────────────────────────────────────────────────

export const createBooking = async (payload: {
  consultantId: number; timeSlotId: number; amount: number;
  userNotes?: string; meetingMode?: string; bookingDate?: string;
  slotDate?: string; masterTimeSlotId?: number; slotTime?: string; timeRange?: string;
  userId?: number;
}) => {
  try {
    const check = await apiFetch(`/consultants/${payload.consultantId}`);
    if (!check?.id) throw new Error("Consultant not found");
  } catch (e: any) {
    throw new Error(`Consultant #${payload.consultantId} is no longer available. Please choose another advisor.`);
  }
  return apiFetch("/bookings", { method: "POST", body: JSON.stringify(payload) });
};

export const getBookingById = async (id: number) => apiFetch(`/bookings/${id}`);

export const getAllBookings = async (): Promise<any[]> => {
  const directEndpoints = ["/bookings"];

  for (const endpoint of directEndpoints) {
    try {
      const data = await apiFetch(endpoint);
      const extracted = extractArray(data);
      console.log(`📋 getAllBookings: ${endpoint} → ${extracted.length} records`);
      if (extracted.length > 0) return extracted;
    } catch (e: any) {
      console.warn(`⚠️ getAllBookings: ${endpoint} failed (${e?.message})`);
    }
  }

  console.warn("getAllBookings: direct endpoints returned 0 — trying per-consultant fallback");
  try {
    let consultants: any[] = [];
    try {
      const d = await apiFetch("/consultants");
      consultants = extractArray(d);
    } catch { /* non-fatal */ }

    if (consultants.length === 0) return [];

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
    console.log(`✅ getAllBookings fallback: ${deduped.length} bookings`);
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

export const getBookingsByConsultant = async (consultantId: number): Promise<any[]> => {
  const data = await apiFetch(`/bookings/consultant/${consultantId}`);
  return extractArray(data);
};

export const getTimeslotsByAdvisor = getTimeslotsByConsultant;
export const getAvailableTimeslotsByAdvisor = getAvailableTimeslotsByConsultant;
export const getBookingsByAdvisor = getBookingsByConsultant;

export const updateBooking = async (id: number, payload: any) =>
  apiFetch(`/bookings/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteBooking = async (id: number) =>
  apiFetch(`/bookings/${id}`, { method: "DELETE" });

// ─────────────────────────────────────────────────────────────────────────────
// SKILLS / CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

export const getAllSkills = async () => {
  const data = await apiFetch("/skills");
  return extractArray(data);
};

// ─────────────────────────────────────────────────────────────────────────────
// TICKETS
// ─────────────────────────────────────────────────────────────────────────────

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
  const role = (getRole() || "").toUpperCase().replace(/^ROLE_/, "");
  if (
    role !== "SUBSCRIBER" &&
    role !== "SUBSCRIBED" &&
    role !== "ADMIN" &&
    role !== "CONSULTANT"
  ) {
    throw new Error(
      "SUBSCRIBER_ONLY: Only subscribed users can raise support tickets. Please upgrade your plan to get access."
    );
  }

  let effectiveUserId = Number(payload.userId);
  try {
    const me = await apiFetch("/users/me");
    const meId = Number(me?.id ?? me?.userId);
    if (Number.isFinite(meId) && meId > 0) effectiveUserId = meId;
  } catch {
    // fallback to payload userId
  }
  if (!Number.isFinite(effectiveUserId) || effectiveUserId <= 0) {
    throw new Error("User ID is required");
  }

  const rawCategory = String(payload.category || "").trim();
  const normalizedPriority = String(payload.priority || "MEDIUM").trim().toUpperCase();
  const normalizedDescription = String(payload.description || "").trim();

  const ticketPayload: Record<string, any> = {
    userId: effectiveUserId,
    category: rawCategory,
    description: normalizedDescription,
    status: "NEW",
    priority: normalizedPriority,
  };
  if (payload.consultantId != null) ticketPayload.consultantId = payload.consultantId;
  if (payload.attachmentUrl) ticketPayload.attachmentUrl = payload.attachmentUrl;

  const token = getToken();
  const postTicket = async (bodyPayload: Record<string, any>) => {
    const form = new FormData();
    form.append("ticketData", new Blob([JSON.stringify(bodyPayload)], { type: "application/json" }));
    if (file) form.append("file", file);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${BASE_URL}/tickets`, {
      method: "POST",
      headers,
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err: any = new Error(data?.message || `Error ${res.status}`);
      err.status = res.status;
      err.response = data;
      throw err;
    }
    return data;
  };

  try {
    return await postTicket(ticketPayload);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (Number(err?.status) === 409) {
      throw new Error(
        msg || "A similar ticket already exists. Please check your open tickets before creating another."
      );
    }
    throw err;
  }
};

export const getAllTickets = async (): Promise<any[]> => {
  try {
    const data = await apiFetch("/tickets");
    const arr = extractArray(data);
    if (arr.length === 0) {
      console.warn("⚠️ [getAllTickets] /api/tickets returned empty array.");
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

export const updateTicketStatus = async (id: number, status: string) =>
  apiFetch(`/tickets/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
export const patchTicketStatus = updateTicketStatus;

export const assignTicketToConsultant = async (ticketId: number, consultantId: number) =>
  apiFetch(`/tickets/${ticketId}/assign`, {
    method: "PUT",
    body: JSON.stringify({ consultantId }),
  });
export const reassignTicket = assignTicketToConsultant;

export const escalateTicket = async (ticketId: number, reason: string): Promise<any> =>
  apiFetch(`/tickets/${ticketId}/escalate`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

export const updateTicket = async (id: number, payload: any) =>
  apiFetch(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(payload) });

export const deleteTicket = async (id: number) =>
  apiFetch(`/tickets/${id}`, { method: "DELETE" });

export const closeTicket = (id: number) => updateTicketStatus(id, "CLOSED");

// ─────────────────────────────────────────────────────────────────────────────
// TICKET COMMENTS
// ─────────────────────────────────────────────────────────────────────────────

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
  } | null,
  isConsultantReply = false
): Promise<any> => {
  let senderId: number | null = null;
  let consultantReply = isConsultantReply;

  if (typeof senderIdOrOptions === "number") {
    senderId = senderIdOrOptions;
  } else if (senderIdOrOptions && typeof senderIdOrOptions === "object") {
    senderId = senderIdOrOptions.senderId ?? null;
    consultantReply = senderIdOrOptions.isConsultantReply ?? false;
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
    }),
  });
};

export const postInternalNote = async (
  ticketId: number,
  noteText: string,
  authorId: number
): Promise<any> =>
  apiFetch(`/tickets/${ticketId}/notes`, {
    method: "POST",
    body: JSON.stringify({ authorId, noteText }),
  });

// ─────────────────────────────────────────────────────────────────────────────
// TICKET FEEDBACK
// ─────────────────────────────────────────────────────────────────────────────

export const submitTicketFeedback = async (
  ticketId: number,
  rating: number,
  feedbackText: string
): Promise<any> =>
  apiFetch(`/tickets/${ticketId}`, {
    method: "POST",
    body: JSON.stringify({ feedbackRating: rating, feedbackText }),
  });

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

export const getMyUnreadNotifications = async () => {
  const data = await apiFetch("/notifications");
  return extractArray(data);
};

export const markNotificationAsRead = async (id: number) =>
  apiFetch(`/notifications/${id}/read`, { method: "PUT" });

// ─────────────────────────────────────────────────────────────────────────────
// SLA HELPERS
// ─────────────────────────────────────────────────────────────────────────────

export const SLA_HOURS: Record<string, number> = {
  LOW: 72, MEDIUM: 24, HIGH: 8, URGENT: 4,
};

export const getSlaInfo = (ticket: any) => {
  if (!ticket?.createdAt) return null;
  const created = new Date(ticket.createdAt);
  const hours = SLA_HOURS[ticket.priority] ?? 24;
  const deadline = new Date(created.getTime() + hours * 3_600_000);
  const minsLeft = Math.round((deadline.getTime() - Date.now()) / 60_000);
  const breached = ticket.isSlaBreached || minsLeft <= 0;
  const warning = !breached && minsLeft < 120;

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
// STATUS / PRIORITY STYLES
// ─────────────────────────────────────────────────────────────────────────────

export const getStatusStyle = (status: string) => {
  const s = (status ?? "").toUpperCase();
  const map: Record<string, { bg: string; color: string; border: string }> = {
    NEW: { bg: "#EFF6FF", color: "#2563EB", border: "#93C5FD" },
    OPEN: { bg: "#FFF7ED", color: "#EA580C", border: "#FED7AA" },
    IN_PROGRESS: { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D" },
    RESOLVED: { bg: "#F0FDF4", color: "#16A34A", border: "#86EFAC" },
    CLOSED: { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" },
    ESCALATED: { bg: "#FEF2F2", color: "#DC2626", border: "#FCA5A5" },
    PENDING: { bg: "#FAF5FF", color: "#7C3AED", border: "#C4B5FD" },
  };
  return map[s] ?? { bg: "#F1F5F9", color: "#64748B", border: "#CBD5E1" };
};

export const getPriorityStyle = (priority: string) => {
  const p = (priority ?? "").toUpperCase();
  const map: Record<string, { bg: string; color: string; border: string; dot: string }> = {
    LOW: { bg: "#F0FDF4", color: "#16A34A", border: "#86EFAC", dot: "#22C55E" },
    MEDIUM: { bg: "#FFFBEB", color: "#D97706", border: "#FCD34D", dot: "#F59E0B" },
    HIGH: { bg: "#FFF7ED", color: "#EA580C", border: "#FED7AA", dot: "#F97316" },
    URGENT: { bg: "#FEF2F2", color: "#DC2626", border: "#FCA5A5", dot: "#EF4444" },
    CRITICAL: { bg: "#4A0404", color: "#FCA5A5", border: "#7F1D1D", dot: "#DC2626" },
  };
  return map[p] ?? map.MEDIUM;
};

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────

export const getDashboardSummaries = async (period: "DAILY" | "WEEKLY" = "WEEKLY") =>
  apiFetch(`/dashboard/summaries?period=${period}`);

// ─────────────────────────────────────────────────────────────────────────────
// FEEDBACKS
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CONFIG — Canned Responses & Ticket Categories
// ─────────────────────────────────────────────────────────────────────────────

export const getCannedResponses = async (category?: string): Promise<any[]> => {
  const query = category ? `?category=${encodeURIComponent(category)}` : "";
  const data = await apiFetch(`/admin/config/canned-responses${query}`);
  return extractArray(data);
};

export const createCannedResponse = async (payload: {
  title: string;
  content: string;
  category?: string;
}): Promise<any> =>
  apiFetch("/admin/config/canned-responses", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const deleteCannedResponse = async (id: number): Promise<void> => {
  await apiFetch(`/admin/config/canned-responses/${id}`, { method: "DELETE" });
};

export const getTicketCategories = async (): Promise<any[]> => {
  const data = await apiFetch("/admin/config/categories");
  return extractArray(data);
};

export const createTicketCategory = async (payload: {
  name: string;
  description?: string;
}): Promise<any> =>
  apiFetch("/admin/config/categories", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const toggleTicketCategory = async (id: number): Promise<any> =>
  apiFetch(`/admin/config/categories/${id}/toggle`, { method: "PATCH" });

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — Ticket Analytics & SLA
// ─────────────────────────────────────────────────────────────────────────────

export const getResolutionAnalytics = async (
  period: "DAILY" | "WEEKLY" | "MONTHLY" = "WEEKLY"
): Promise<Record<string, any>> =>
  apiFetch(`/admin/config/analytics?period=${period}`);

export const getSlaBreachedTickets = async (): Promise<any[]> => {
  try {
    const data = await apiFetch("/admin/config/sla-breached");
    return extractArray(data);
  } catch (err: any) {
    console.error("❌ getSlaBreachedTickets failed:", err?.message);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BOOKING NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

export interface BookingNotificationRequest {
  bookingId: number;
  userEmail: string;
  consultantEmail: string;
  meetingMode: string;
  amount: number;
  meetingLink?: string;
}

export const sendBookingConfirmationEmails = async (
  payload: BookingNotificationRequest
): Promise<void> => {
  try {
    const token = getToken();
    const res = await fetch(`${BASE_URL}/notifications/booking-confirmation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/plain, application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    const text = await res.text();

    if (!res.ok) {
      console.warn(`⚠️ Booking email returned ${res.status}: ${text}`);
      return;
    }

    console.log(`✅ Booking emails dispatched for #${payload.bookingId}: ${text}`);
  } catch (err: any) {
    console.warn("⚠️ Booking confirmation email failed (non-fatal):", err?.message);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM SETTINGS — Business Hours, Holidays, Auto-Responder
// ─────────────────────────────────────────────────────────────────────────────

export interface BusinessHoursRequest {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  workingDay: boolean;
}

export interface BusinessHoursResponse {
  id: number;
  dayOfWeek: string;
  startTime: string | { hour: number; minute: number; second?: number; nano?: number };
  endTime: string | { hour: number; minute: number; second?: number; nano?: number };
  isWorkingDay: boolean;
}

export interface HolidayRequest {
  name: string;
  holidayDate: string;
}

export interface HolidayResponse {
  id: number;
  name: string;
  holidayDate: string;
}

export interface AutoResponderDto {
  enabled: boolean;
  message: string;
}

export const getBusinessHours = async (): Promise<BusinessHoursResponse[]> => {
  const data = await apiFetch("/admin/settings/business-hours");
  return extractArray(data);
};

export const updateBusinessHours = async (
  payload: BusinessHoursRequest[]
): Promise<BusinessHoursResponse[]> => {
  let existingById: Record<string, number> = {};
  try {
    const existing = await apiFetch("/admin/settings/business-hours");
    extractArray(existing).forEach((r: any) => {
      if (r.dayOfWeek && r.id) existingById[r.dayOfWeek] = r.id;
    });
  } catch { /* non-fatal */ }

  const results = await Promise.allSettled(
    payload.map(async (row) => {
      const existingId = existingById[row.dayOfWeek];
      if (existingId) {
        return apiFetch(`/admin/settings/business-hours/${existingId}`, {
          method: "PUT",
          body: JSON.stringify(row),
        });
      } else {
        return apiFetch("/admin/settings/business-hours", {
          method: "POST",
          body: JSON.stringify(row),
        });
      }
    })
  );

  const saved = results
    .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
    .map(r => r.value);

  const failed = results.filter(r => r.status === "rejected");
  if (failed.length > 0) {
    console.warn(`⚠️ updateBusinessHours: ${failed.length}/${payload.length} rows failed`);
  }

  return saved;
};

export const getHolidays = async (): Promise<HolidayResponse[]> => {
  const data = await apiFetch("/admin/settings/holidays");
  return extractArray(data);
};

export const addHoliday = async (payload: HolidayRequest): Promise<HolidayResponse> =>
  apiFetch("/admin/settings/holidays", { method: "POST", body: JSON.stringify(payload) });

export const deleteHoliday = async (id: number): Promise<void> => {
  await apiFetch(`/admin/settings/holidays/${id}`, { method: "DELETE" });
};

export const getAutoResponder = async (): Promise<AutoResponderDto> =>
  apiFetch("/admin/settings/auto-responder");

export const updateAutoResponder = async (payload: AutoResponderDto): Promise<AutoResponderDto> => {
  let existingId: number | null = null;
  try {
    const existing = await apiFetch("/admin/settings/auto-responder");
    if (existing?.id) existingId = Number(existing.id);
  } catch { /* non-fatal */ }

  if (existingId) {
    return apiFetch(`/admin/settings/auto-responder/${existingId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  return apiFetch("/admin/settings/auto-responder", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export default api;