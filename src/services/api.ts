// ─────────────────────────────────────────────────────────────────────────────
// api.ts  —  Unified service layer
// ─────────────────────────────────────────────────────────────────────────────

import axios from "axios";

const BASE_URL = "http://52.55.178.31:8081/api";

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

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      console.error("🔐 401 Unauthorized — token expired, redirecting to login");
      clearToken();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

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
    const data: any = contentType?.includes("application/json")
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

export const getAllUsers = async () => apiFetch("/users");
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

export const getConsultants = async () => apiFetch("/consultants");
export const getAllConsultants = getConsultants;
export const getAdvisors = getConsultants;
export const getAllAdvisors = getConsultants;

export const getConsultantById = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}`);
export const getAdvisorById = getConsultantById;
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
export const createAdvisor = createConsultant;

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
export const updateAdvisor = updateConsultant;

export const deleteConsultant = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}`, { method: "DELETE" });
export const deleteAdvisor = deleteConsultant;

export const getOnboarding = async (id: number) => apiFetch(`/onboarding/${id}`);
export const updateOnboarding = async (id: number, payload: object) =>
  apiFetch(`/onboarding/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteOnboarding = async (id: number) =>
  apiFetch(`/onboarding/${id}`, { method: "DELETE" });

export const getTimeslotById = async (id: number) => apiFetch(`/timeslots/${id}`);

export const getTimeslotsByConsultant = async (consultantId: number) => {
  const data = await apiFetch(`/timeslots/consultant/${consultantId}`);
  if (Array.isArray(data)) return data;
  if (data?.content) return data.content;
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
  consultantId: number; slotDate: string; //slotTime: string;
  durationMinutes: number; masterTimeSlotId?: number;
}) => apiFetch("/timeslots", { method: "POST", body: JSON.stringify(payload) });

export const updateTimeslot = async (id: number, payload: any) =>
  apiFetch(`/timeslots/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteTimeslot = async (id: number) =>
  apiFetch(`/timeslots/${id}`, { method: "DELETE" });

export const getConsultantMasterSlots = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}/master-timeslots`);

// POST /api/bookings — BookingRequest DTO:
// { consultantId, timeSlotId, baseAmount (required), offerId?, meetingMode, userNotes }
// BookingService calculates: total = (baseAmount - discount) + platformFee automatically
export const createBooking = async (payload: {
  consultantId: number;
  timeSlotId: number;
  baseAmount: number;       // required by BookingRequest — server calculates total
  offerId?: number | null;  // optional: which offer to apply
  meetingMode: string;
  userNotes?: string;
  // legacy fields (ignored by backend but kept for fallback compatibility)
  amount?: number;
  bookingDate?: string;
  slotDate?: string;
}) => {
  // Build clean payload matching BookingRequest DTO exactly
  const body: Record<string, any> = {
    consultantId: payload.consultantId,
    timeSlotId: payload.timeSlotId,
    baseAmount: payload.baseAmount,
    meetingMode: payload.meetingMode || "ONLINE",
    userNotes: payload.userNotes || "Booked via app",
  };
  if (payload.offerId != null) body.offerId = payload.offerId;
  return apiFetch("/bookings", { method: "POST", body: JSON.stringify(body) });
};

// POST /api/bookings/bulk — BulkBookingRequest DTO:
// { consultantId, timeSlotIds: [id1, id2], baseAmountPerSlot, offerId?, meetingMode, userNotes }
// Returns BulkBookingResponse { bookings: [], grandTotal }
export const createBulkBooking = async (payload: {
  consultantId: number;
  timeSlotIds: number[];      // exactly 2 slots
  baseAmountPerSlot: number;
  offerId?: number | null;
  meetingMode: string;
  userNotes?: string;
}) => {
  const body: Record<string, any> = {
    consultantId: payload.consultantId,
    timeSlotIds: payload.timeSlotIds,
    baseAmountPerSlot: payload.baseAmountPerSlot,
    meetingMode: payload.meetingMode || "ONLINE",
    userNotes: payload.userNotes || "Booked via app",
  };
  if (payload.offerId != null) body.offerId = payload.offerId;
  return apiFetch("/bookings/bulk", { method: "POST", body: JSON.stringify(body) });
};

export const getBookingById = async (id: number) => apiFetch(`/bookings/${id}`);

export const getAllBookings = async (): Promise<any[]> => {
  // Only try /bookings (the base endpoint).
  // /bookings/all → 500 "Unknown column 'b1_0.amount'"
  // /bookings/admin → 500 "Method parameter 'id': Failed to convert"
  // Both fail on this backend — skip them entirely.
  try {
    const response = await api.get("/bookings");
    const extracted = extractArray(response.data);
    if (extracted.length >= 0) return extracted; // even empty array is valid
  } catch (err: any) {
    console.warn("⚠️ /bookings failed:", err?.message);
  }

  // Fallback: aggregate per-consultant bookings
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
    console.log(`✅ getAllBookings fallback: ${deduped.length} bookings across ${consultants.length} consultants`);
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

// ── Server-side paginated bookings (page is 0-based for Spring) ───────────────
export const getBookingsPage = async (
  page: number,
  size: number = 10,
  consultantId?: number
): Promise<{ content: any[]; totalElements: number; totalPages: number; number: number }> => {
  try {
    const endpoint = consultantId
      ? `/bookings/consultant/${consultantId}?page=${page}&size=${size}`
      : `/bookings?page=${page}&size=${size}`;
    const data = await apiFetch(endpoint);
    // Spring Page object: { content:[], totalElements, totalPages, number }
    if (data && typeof data.totalElements === "number") return data;
    // Fallback: plain array response — wrap it
    const arr = extractArray(data);
    return { content: arr, totalElements: arr.length, totalPages: 1, number: 0 };
  } catch (err: any) {
    console.error("getBookingsPage error:", err?.message);
    return { content: [], totalElements: 0, totalPages: 0, number: page };
  }
};

// ── Server-side paginated tickets ─────────────────────────────────────────────
export const getTicketsPage = async (
  page: number,
  size: number = 10
): Promise<{ content: any[]; totalElements: number; totalPages: number; number: number }> => {
  try {
    const data = await apiFetch(`/tickets?page=${page}&size=${size}`);
    if (data && typeof data.totalElements === "number") return data;
    const arr = extractArray(data);
    return { content: arr, totalElements: arr.length, totalPages: 1, number: 0 };
  } catch (err: any) {
    console.error("getTicketsPage error:", err?.message);
    return { content: [], totalElements: 0, totalPages: 0, number: page };
  }
};

export const updateBooking = async (id: number, payload: any) =>
  apiFetch(`/bookings/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteBooking = async (id: number) =>
  apiFetch(`/bookings/${id}`, { method: "DELETE" });

// ─────────────────────────────────────────────────────────────────────────────
// SKILLS / SKILL MASTER
// Backend endpoint: GET/POST /api/skills  or  /api/skill-master  or  /api/skillmaster
// Returns: [{ id, name, description?, title? }]
// ─────────────────────────────────────────────────────────────────────────────
export const getAllSkills = async (): Promise<any[]> => {
  // Backend SkillMasterController returns SkillResponse { id: Long, skillName: String, isActive: boolean }
  // We normalize to { id, name, skillName, isActive } so all consumers work uniformly
  const normalizeSkill = (s: any) => ({
    ...s,
    id: Number(s.id),
    // skillName is the authoritative field from SkillResponse; name is the UI-friendly alias
    name: s.skillName || s.name || s.title || `Skill ${s.id}`,
    skillName: s.skillName || s.name || s.title || `Skill ${s.id}`,
    isActive: s.isActive !== false, // default true
  });

  // Primary: GET /api/skills (SkillMasterController — returns only active skills)
  const endpoints = ["/skills", "/skill-master", "/skillmaster", "/skill_master"];
  for (const ep of endpoints) {
    try {
      const data = await apiFetch(ep);
      const arr = extractArray(data);
      // arr.length > 0: continue to next endpoint if this one returns empty
      // so we find the endpoint that actually has skills configured
      if (arr.length > 0) return arr.map(normalizeSkill);
      // Empty list — try next endpoint in case this one isn't the right one
    } catch (err: any) {
      // 500 = endpoint misconfigured, try next; other errors stop trying
      if (!String(err?.message || "").includes("500")) continue;
      continue;
    }
  }
  return [];
};
export const getSkills = getAllSkills;

// SkillMaster CRUD — for admin panel
// Tries /skills first, falls back to /skill-master
const SKILL_BASE = "/skills"; // primary endpoint

export const createSkill = async (payload: { name: string; description?: string }): Promise<any> => {
  // Backend SkillRequest expects { skillName } not { name }
  const backendPayload = { skillName: payload.name.trim() };
  for (const ep of ["/skills", "/skill-master", "/skillmaster"]) {
    try { return await apiFetch(ep, { method: "POST", body: JSON.stringify(backendPayload) }); }
    catch (err: any) { if (!String(err?.message || "").includes("500")) throw err; }
  }
  throw new Error("Could not create skill — server error on all endpoints.");
};

export const updateSkill = async (id: number, payload: { name: string; description?: string }): Promise<any> => {
  // Backend SkillRequest expects { skillName } not { name }
  const backendPayload = { skillName: payload.name.trim() };
  for (const ep of [`/skills/${id}`, `/skill-master/${id}`, `/skillmaster/${id}`]) {
    try { return await apiFetch(ep, { method: "PUT", body: JSON.stringify(backendPayload) }); }
    catch (err: any) { if (!String(err?.message || "").includes("500")) throw err; }
  }
  throw new Error("Could not update skill.");
};

export const deleteSkill = async (id: number): Promise<void> => {
  // Primary: DELETE /api/skills/{id} — SkillMasterController soft-deletes skill + cascades to questions + answers
  // Fallback to /skill-master/{id} for older backends
  for (const ep of [`/skills/${id}`, `/skill-master/${id}`, `/skillmaster/${id}`]) {
    try { return await apiFetch(ep, { method: "DELETE" }); }
    catch (err: any) {
      const msg = String(err?.message || "");
      // Only continue to next endpoint on 404/500 (wrong endpoint), re-throw on 403/400
      if (msg.includes("404") || msg.includes("500")) continue;
      throw err;
    }
  }
  throw new Error("Could not delete skill.");
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
  form.append("data", blob);
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
    const ct = res.headers.get("content-type");
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

/**
 * assignTicketToConsultantWithEmail
 * ─────────────────────────────────────────────────────────────────────────────
 * Wraps assignTicketToConsultant and automatically:
 *  1. Sends an assignment email to the consultant (sendTicketAssignedEmail)
 *  2. Writes an in-app notification to fin_notifs_CONSULTANT_<consultantId>
 *     so the consultant's dashboard bell & Notifications tab update instantly.
 *
 * Use this everywhere you call assignTicketToConsultant (especially AdminPage).
 */
export const assignTicketToConsultantWithEmail = async (
  ticketId: number,
  consultantId: number,
  ticketTitle?: string,
  assignedBy?: string,
  priority?: string,
): Promise<any> => {
  // 1. Perform the actual assignment
  const result = await assignTicketToConsultant(ticketId, consultantId);

  // 2. Fetch consultant details and send assignment email
  try {
    const consultant = await apiFetch(`/consultants/${consultantId}`);
    const consultantEmail =
      consultant?.email || consultant?.emailId || consultant?.emailAddress || '';
    const consultantName = consultant?.name || '';

    if (consultantEmail) {
      await sendTicketAssignedEmail({
        ticketId,
        ticketTitle: ticketTitle || `Ticket #${ticketId}`,
        consultantEmail,
        consultantName,
        assignedBy: assignedBy || 'Admin',
        priority: priority || 'MEDIUM',
      });
    }

    // 3. Write in-app notification so the consultant sees it without refresh
    const notifKey = `fin_notifs_CONSULTANT_${consultantId}`;
    try {
      const prev = JSON.parse(localStorage.getItem(notifKey) || '[]');
      const newNotif = {
        id: `${Date.now()}_assign_${ticketId}`,
        type: 'success',
        title: `New Ticket Assigned - #${ticketId}`,
        message: `You have been assigned: "${ticketTitle || `Ticket #${ticketId}`}". Priority: ${priority || 'MEDIUM'}. Assigned by ${assignedBy || 'Admin'}.`,
        timestamp: new Date().toISOString(),
        read: false,
        ticketId,
      };
      localStorage.setItem(notifKey, JSON.stringify([newNotif, ...prev].slice(0, 50)));
    } catch {}
  } catch (err: any) {
    console.warn(
      `⚠️  assignTicketToConsultantWithEmail: email/notif step failed (non-fatal):`,
      err?.message,
    );
  }

  return result;
};

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
    senderId = senderIdOrOptions.senderId ?? null;
    consultantReply = senderIdOrOptions.isConsultantReply ?? false;
    authorRole = senderIdOrOptions.authorRole ?? "CUSTOMER";
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
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const role = params.get("role");
  const userId = params.get("userId");
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
  if (data?.token) setToken(data.token);
  if (data?.role) setRole(data.role);
  if (data?.id) setUserId(Number(data.id));
  if (data?.userId) setUserId(Number(data.userId));
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
  const a = document.createElement("a");
  a.href = url;
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
    "Ticket ID": t.id,
    "Title": t.title || t.category || "",
    "Description": t.description || "",
    "Category": t.category || "",
    "Priority": t.priority || "",
    "Status": t.status || "",
    "Submitted By": t.user?.name || t.user?.username || t.userName || (t.userId ? `User #${t.userId}` : ""),
    "Assigned To": t.agentName || t.consultantName || "",
    "Created At": t.createdAt ? new Date(t.createdAt).toLocaleString("en-IN") : "",
    "Updated At": t.updatedAt ? new Date(t.updatedAt).toLocaleString("en-IN") : "",
    "SLA Breached": t.isSlaBreached ? "Yes" : "No",
    "Escalated": t.isEscalated ? "Yes" : "No",
    "Feedback Rating": t.feedbackRating ?? "",
    "Feedback Text": t.feedbackText ?? "",
  }));

export const clientExportTicketsExcel = async (tickets: any[], filename?: string): Promise<void> => {
  const rows = ticketsToExportRows(tickets);
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
  const rows = ticketsToExportRows(tickets);
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

// ─────────────────────────────────────────────────────────────────────────────
// OFFERS — public & authenticated
// These endpoints may return 403 if called without a valid token on some
// server configurations. We always catch and return [] to prevent home page
// errors.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/offers/checkout?consultantId=  — active APPROVED offers for booking/home page
 * Backend: OfferController.getActiveOffersForCheckout — returns only APPROVED + isActive + in date range
 * Safe: returns [] on any error
 */
export const getActiveOffers = async (consultantId?: number): Promise<any[]> => {
  try {
    const token = getToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    // Use the correct public checkout endpoint
    const url = consultantId
      ? `${BASE_URL}/offers/checkout?consultantId=${consultantId}`
      : `${BASE_URL}/offers/checkout`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : extractArray(data);
    }
    return [];
  } catch (err: any) {
    console.warn("⚠️ getActiveOffers failed (non-fatal):", err?.message);
    return [];
  }
};

/**
 * GET /api/offers/checkout?consultantId=:id — active approved offers for a consultant's booking page
 */
export const getOffersByConsultant = async (consultantId: number): Promise<any[]> => {
  try {
    const data = await apiFetch(`/offers/checkout?consultantId=${consultantId}`);
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

/**
 * POST /api/offers — create offer (admin or consultant)
 * Backend OfferRequest: title*, description, discount*, validFrom*, validTo*, isActive, consultantId
 * Backend auto-sets status: ADMIN → APPROVED, CONSULTANT → PENDING
 */
export const createOffer = async (payload: {
  title: string;
  description: string;
  discount: string;
  validFrom: string;
  validTo: string;
  isActive?: boolean;
  consultantId?: number | null;
  [key: string]: any;
}): Promise<any> => {
  // Send only fields defined in OfferRequest DTO — extra fields cause 500
  const body: Record<string, any> = {
    title: payload.title,
    description: payload.description || "",
    discount: payload.discount || "0%",
    validFrom: payload.validFrom,
    validTo: payload.validTo,
    isActive: payload.isActive ?? true,
  };
  if (payload.consultantId != null) body.consultantId = payload.consultantId;
  return apiFetch("/offers", { method: "POST", body: JSON.stringify(body) });
};

/**
 * PUT /api/offers/:id — update offer
 * Backend OfferRequest same fields as createOffer
 */
export const updateOffer = async (id: number, payload: any): Promise<any> => {
  const body: Record<string, any> = {
    title: payload.title,
    description: payload.description || "",
    discount: payload.discount || "0%",
    validFrom: payload.validFrom,
    validTo: payload.validTo,
    isActive: payload.isActive ?? true,
  };
  if (payload.consultantId != null) body.consultantId = payload.consultantId;
  return apiFetch(`/offers/${id}`, { method: "PUT", body: JSON.stringify(body) });
};

/**
 * DELETE /api/offers/:id — delete offer
 */
export const deleteOffer = async (id: number): Promise<void> =>
  apiFetch(`/offers/${id}`, { method: "DELETE" });

// ─────────────────────────────────────────────────────────────────────────────
// REVIEWS — public & authenticated
// Safe: returns [] on any error (including 403 for public visitors)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/reviews — approved reviews for home page testimonials
 * Safe: returns [] on 403/401 (public visitors)
 */
export const getPublicReviews = async (): Promise<any[]> => {
  try {
    const token = getToken();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const endpoints = ["/reviews?approved=true", "/reviews/approved", "/reviews"];
    for (const ep of endpoints) {
      try {
        const res = await fetch(`${BASE_URL}${ep}`, { headers });
        if (res.ok) {
          const data = await res.json();
          return Array.isArray(data) ? data : extractArray(data);
        }
        if (res.status === 403 || res.status === 401) {
          console.warn(`⚠️ getPublicReviews: ${res.status} on ${ep} — returning []`);
          return [];
        }
      } catch { continue; }
    }
    return [];
  } catch (err: any) {
    console.warn("⚠️ getPublicReviews failed (non-fatal):", err?.message);
    return [];
  }
};

/**
 * GET /api/reviews/consultant/:id — reviews for a specific consultant
 */
export const getReviewsByConsultant = async (consultantId: number): Promise<any[]> => {
  try {
    const data = await apiFetch(`/reviews/consultant/${consultantId}`);
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

/**
 * POST /api/reviews — submit a review after a completed session
 */
export const submitReview = async (payload: {
  consultantId: number; bookingId: number; rating: number; reviewText: string;
}): Promise<any> => apiFetch("/reviews", { method: "POST", body: JSON.stringify(payload) });

// ─────────────────────────────────────────────────────────────────────────────
// USER CATEGORIES — save questionnaire answers to backend
// Endpoint: POST /api/users/:id/categories
// ─────────────────────────────────────────────────────────────────────────────

export const saveUserCategories = async (
  userId: number,
  categories: Array<{ category: string; subOption: string; answers: Record<string, string> }>
): Promise<any> => {
  // Try multiple endpoint/payload variants — backend may use different structure
  const attempts = [
    // Variant 1: standard array POST
    { url: `/users/${userId}/categories`, body: JSON.stringify(categories) },
    // Variant 2: wrapped object
    { url: `/users/${userId}/categories`, body: JSON.stringify({ categories }) },
    // Variant 3: just category names array
    { url: `/users/${userId}/categories`, body: JSON.stringify(categories.map(c => c.category)) },
    // Variant 4: answers endpoint
    { url: `/users/${userId}/preferences`, body: JSON.stringify(categories) },
  ];
  for (const attempt of attempts) {
    try {
      return await apiFetch(attempt.url, { method: "POST", body: attempt.body });
    } catch (err: any) {
      const msg = String(err?.message || "");
      // Only retry on 500 — propagate auth errors immediately
      if (!msg.includes("500") && !msg.includes("Internal Server")) {
        console.warn("⚠️ saveUserCategories failed (non-fatal):", msg);
        return null;
      }
      // else try next variant
    }
  }
  // All failed — save to localStorage as final fallback (already done by caller)
  console.warn("⚠️ saveUserCategories: all endpoints failed, relying on localStorage");
  return null;
};

export const getUserCategories = async (userId: number): Promise<any[]> => {
  try {
    const data = await apiFetch(`/users/${userId}/categories`);
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

// ─────────────────────────────────────────────────────────────────────────────
// STATIC CONTENT — Backend: StaticContentController @ /api/static-content
// GET  /api/static-content/{contentType}  → StaticContentResponse
// GET  /api/static-content               → List<StaticContentResponse>
// POST /api/static-content               → upsert (admin only)
// ─────────────────────────────────────────────────────────────────────────────

export const getStaticContent = async (contentType: string): Promise<any | null> => {
  try {
    return await apiFetch(`/static-content/${contentType}`);
  } catch { return null; }
};

export const getAllStaticContent = async (): Promise<any[]> => {
  try {
    const data = await apiFetch("/static-content");
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

export const saveStaticContent = async (payload: {
  contentType: string; content: string; lastUpdatedBy?: string;
}): Promise<any> => {
  try {
    return await apiFetch("/static-content", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (err: any) {
    console.warn("⚠️ saveStaticContent failed:", err?.message);
    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// TERMS & CONDITIONS — delegates to StaticContentController (backward compat)
// ─────────────────────────────────────────────────────────────────────────────

export const getTermsAndConditions = async (): Promise<any[]> => {
  // Try new StaticContentController endpoint first
  // 404 = nothing saved yet, that is normal — not an error
  try {
    const data = await apiFetch("/static-content/TERMS_AND_CONDITIONS");
    if (data && (data.content || data.text)) return [data];
  } catch (e: any) {
    // 404 is expected when no T&C saved yet — swallow silently
    if (!String(e?.message || "").includes("404")) {
      console.warn("⚠️ getTermsAndConditions /static-content failed:", e?.message);
    }
  }
  // Legacy fallback
  try {
    const data = await apiFetch("/admin/terms-and-conditions");
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

export const saveTermsAndConditions = async (payload: {
  version: string; content: string; isActive: boolean;
}): Promise<any> => {
  try {
    return await apiFetch("/static-content", {
      method: "POST",
      body: JSON.stringify({
        contentType: "TERMS_AND_CONDITIONS",
        content: payload.content,
        lastUpdatedBy: "Admin",
      }),
    });
  } catch {
    try {
      return await apiFetch("/admin/terms-and-conditions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      console.warn("⚠️ saveTermsAndConditions failed:", err?.message);
      return null;
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — Add Member (POST /api/admin/users)
// Handles bcrypt encryption on backend, sets isFirstLogin=true
// ─────────────────────────────────────────────────────────────────────────────

export const adminCreateUser = async (payload: {
  name: string; email: string; phoneNumber: string;
  location?: string; role: string; password: string;
  subscriptionPlanId?: number | null; isFirstLogin?: boolean; adminAdded?: boolean;
}): Promise<any> => {
  // Try dedicated admin endpoint first, fallback to onboarding
  try {
    return await apiFetch("/admin/users", {
      method: "POST",
      body: JSON.stringify({ ...payload, isFirstLogin: true, requiresPasswordChange: true }),
    });
  } catch {
    return apiFetch("/onboarding", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        email: payload.email,
        phoneNumber: payload.phoneNumber,
        mobileNumber: payload.phoneNumber,
        location: payload.location || "",
        subscriptionPlanId: payload.subscriptionPlanId || null,
        subscribed: payload.role === "SUBSCRIBER",
        isGuest: payload.role === "GUEST",
        adminAdded: true,
        isFirstLogin: true,
      }),
    });
  }
};
// ─────────────────────────────────────────────────────────────────────────────
// COMMISSION / FEE CONFIG
// Backend: SystemSettingsController → GET/POST /api/admin/settings/additional-charges
// Entity:  SystemConfig with keys FEE_TYPE (FLAT|PERCENTAGE) and FEE_VALUE
// Used by: BookingService.java to compute total = baseAmount + commission
// ─────────────────────────────────────────────────────────────────────────────

export interface FeeConfig {
  feeType: "FLAT" | "PERCENTAGE";
  feeValue: string;
}

/**
 * GET /api/admin/settings/additional-charges
 * Admin-only endpoint — returns 403 for regular users.
 * Strategy:
 *   1. Try with auth token (works for admin)
 *   2. On 403/401, serve from localStorage cache "fin_fee_config"
 *      (admin saves config → we cache it → user sees correct commission)
 *   3. Final fallback: { feeType: "FLAT", feeValue: "0" }
 */
export const getFeeConfig = async (): Promise<FeeConfig> => {
  const CACHE_KEY = "fin_fee_config";

  // Helper to parse and validate a fee config object
  const parseFeeConfig = (data: any): FeeConfig | null => {
    if (!data) return null;
    const type = ((data?.feeType || data?.fee_type || "") as string).toUpperCase();
    const val = String(data?.feeValue ?? data?.fee_value ?? "");
    if ((type === "FLAT" || type === "PERCENTAGE") && val !== "") {
      return { feeType: type as "FLAT" | "PERCENTAGE", feeValue: val };
    }
    return null;
  };

  try {
    const data = await apiFetch("/admin/settings/additional-charges");
    const config = parseFeeConfig(data);
    if (config) {
      // Cache for regular users who hit 403
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(config)); } catch { /* storage full */ }
      return config;
    }
  } catch (err: any) {
    const msg = String(err?.message || "");
    // 403 = admin-only endpoint — serve from cache
    if (msg.includes("403") || msg.includes("401") || msg.includes("Forbidden") || msg.includes("Access Denied")) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed = parseFeeConfig(JSON.parse(cached));
          if (parsed) return parsed;
        }
      } catch { /* ignore parse errors */ }
    } else {
      console.warn("⚠️ getFeeConfig failed (non-fatal):", msg);
    }
  }
  return { feeType: "FLAT", feeValue: "0" };
};

/**
 * POST /api/admin/settings/additional-charges
 * Admin sets the platform commission (FLAT amount or PERCENTAGE).
 */
export const updateFeeConfig = async (payload: FeeConfig): Promise<FeeConfig> => {
  const data = await apiFetch("/admin/settings/additional-charges", {
    method: "POST",
    body: JSON.stringify({
      feeType: payload.feeType.toUpperCase(),
      feeValue: String(payload.feeValue),
    }),
  });
  const result: FeeConfig = {
    feeType: ((data?.feeType || payload.feeType) as string).toUpperCase() as "FLAT" | "PERCENTAGE",
    feeValue: String(data?.feeValue ?? payload.feeValue),
  };
  // ── Cache for regular users who hit 403 on GET ──
  try { localStorage.setItem("fin_fee_config", JSON.stringify(result)); } catch { /* storage full */ }
  return result;
};

/**
 * Calculate the total customer price given base consultant charge + fee config.
 * This matches BookingService.java formula EXACTLY:
 *   PERCENTAGE: total = baseAmount + (baseAmount * feeValue / 100)
 *   FLAT:       total = baseAmount + feeValue
 */
export const calculateTotalPrice = (
  baseAmount: number,
  feeConfig: FeeConfig
): { base: number; commission: number; total: number; label: string } => {
  const feeVal = parseFloat(feeConfig.feeValue) || 0;
  let commission = 0;

  if (feeConfig.feeType === "PERCENTAGE") {
    commission = Math.round((baseAmount * feeVal / 100) * 100) / 100;
  } else {
    commission = feeVal;
  }

  const total = Math.round((baseAmount + commission) * 100) / 100;
  const label =
    feeConfig.feeType === "PERCENTAGE" && feeVal > 0
      ? `${feeVal}% platform fee`
      : feeVal > 0
      ? `+₹${feeVal.toLocaleString()} platform fee`
      : "";

  return { base: baseAmount, commission, total, label };
};

// ─────────────────────────────────────────────────────────────────────────────
// QUESTIONS & ANSWERS — Backend: QuestionController @ /api/questions
//                                AnswerController  @ /api/answers
//
// Backend schema (from shared Java code):
//   Question { id, skillId (Long), text, updatedAt }
//   QuestionRequest { skillId: Long, text: String }
//   Answer { id, userId, questionId, text, updatedAt }
//   AnswerSubmissionRequest { answers: [{ questionId, text }] }
//
// NOTE: The backend does NOT have /api/admin/questions — it uses /api/questions
//       with skillIds query param. Questions are linked to SkillMaster by skillId.
// ─────────────────────────────────────────────────────────────────────────────

export interface BackendQuestion {
  id?: number;
  skillId: number;
  text: string;
  updatedAt?: string;
}

export interface BackendAnswer {
  id?: number;
  questionId: number;
  text: string;
  updatedAt?: string;
}

// AdminQuestion — frontend display model (maps to BackendQuestion)
export interface AdminQuestion {
  id?: number;
  skillId: number;       // links to SkillMaster
  text: string;          // question text
  updatedAt?: string;
  // UI-only helpers (not in backend)
  category?: string;     // derived from skill name for display
  isActive?: boolean;
}

/**
 * GET /api/questions?skillIds=1,2,3
 * Fetch questions for given skill IDs. Used during user onboarding questionnaire.
 */
export const getQuestionsBySkills = async (skillIds: number[]): Promise<BackendQuestion[]> => {
  try {
    if (!skillIds || skillIds.length === 0) return [];
    const ids = skillIds.join(",");
    const data = await apiFetch(`/questions?skillIds=${ids}`);
    return Array.isArray(data) ? data : extractArray(data);
  } catch (err: any) {
    console.warn("⚠️ getQuestionsBySkills failed:", err?.message);
    return [];
  }
};

/**
 * GET /api/questions?skillIds=... (all skills — fetch all for admin view)
 * For admin panel: fetches all skills first, then gets all questions.
 */
export const getAdminQuestions = async (skillId?: number): Promise<BackendQuestion[]> => {
  try {
    if (skillId) {
      const data = await apiFetch(`/questions?skillIds=${skillId}`);
      return Array.isArray(data) ? data : extractArray(data);
    }
    // Get all skills first, then fetch all questions
    const skills = await apiFetch("/skills");
    const skillArr = Array.isArray(skills) ? skills : extractArray(skills);
    if (skillArr.length === 0) return [];
    const ids = skillArr.map((s: any) => s.id).filter(Boolean).join(",");
    if (!ids) return [];
    const data = await apiFetch(`/questions?skillIds=${ids}`);
    return Array.isArray(data) ? data : extractArray(data);
  } catch (err: any) {
    console.warn("⚠️ getAdminQuestions failed (non-fatal):", err?.message);
    return [];
  }
};

/**
 * POST /api/questions
 * Admin creates a question linked to a skillId.
 */
export const createAdminQuestion = async (
  payload: { skillId: number; text: string }
): Promise<BackendQuestion> =>
  apiFetch("/questions", { method: "POST", body: JSON.stringify(payload) });

/**
 * PUT /api/questions/:id
 * Admin updates a question.
 */
export const updateAdminQuestion = async (
  id: number,
  payload: { skillId: number; text: string }
): Promise<BackendQuestion> =>
  apiFetch(`/questions/${id}`, { method: "PUT", body: JSON.stringify(payload) });

/**
 * DELETE /api/questions/:id
 * Admin deletes a question. Backend also deletes associated answers.
 */
export const deleteAdminQuestion = async (id: number): Promise<void> =>
  apiFetch(`/questions/${id}`, { method: "DELETE" });

/**
 * POST /api/answers
 * User submits answers to questions during onboarding.
 */
export const submitAnswers = async (
  answers: Array<{ questionId: number; text: string }>
): Promise<void> => {
  await apiFetch("/answers", {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
};

/**
 * GET /api/users/:userId/answers
 * Get a user's submitted answers.
 */
export const getUserAnswers = async (userId: number): Promise<BackendAnswer[]> => {
  try {
    const data = await apiFetch(`/users/${userId}/answers`);
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

// ─────────────────────────────────────────────────────────────────────────────
// OFFER APPROVAL — Admin fetches ALL offers; approves/rejects via status endpoint
// Backend: GET /api/offers/admin  — all offers for admin view
//          PUT /api/offers/{id}/status?status=APPROVED|REJECTED
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/offers/admin — fetch all offers (admin view: PENDING, APPROVED, REJECTED)
 * Returns consultant-submitted offers (consultantId != null) and global admin offers
 */
export const getConsultantSubmittedOffers = async (): Promise<any[]> => {
  try {
    const data = await apiFetch("/offers/admin");
    const all = Array.isArray(data) ? data : extractArray(data);
    // Return only consultant-submitted offers (consultantId != null)
    return all.filter((o: any) => o.consultantId != null);
  } catch { return []; }
};

/**
 * GET /api/offers/admin — all offers for admin management panel
 */
export const getAllOffersForAdmin = async (): Promise<any[]> => {
  try {
    const data = await apiFetch("/offers/admin");
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

/**
 * PUT /api/offers/{id}/status?status=APPROVED — approve a consultant offer
 * Backend: OfferController.updateOfferStatus — admin only
 */
export const approveOffer = async (id: number): Promise<any> =>
  apiFetch(`/offers/${id}/status?status=APPROVED`, { method: "PUT" });

/**
 * PUT /api/offers/{id}/status?status=REJECTED — reject a consultant offer
 * Backend: OfferController.updateOfferStatus — admin only
 */
export const rejectOffer = async (id: number): Promise<any> =>
  apiFetch(`/offers/${id}/status?status=REJECTED`, { method: "PUT" });