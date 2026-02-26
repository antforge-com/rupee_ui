import axios from 'axios';

// ── Configuration ──────────────────────────────────────────────────────────────
// Keep this as a relative path — Vite proxy (vite.config.ts) forwards
// /api  → http://52.55.178.31:8081/api
// /uploads → http://52.55.178.31:8081/uploads
const BASE_URL_API = `/api`;

// ── Token / session helpers ────────────────────────────────────────────────────
// All keys are prefixed with "fin_" to avoid collisions.
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

// ── DEBUG: decode JWT payload ─────────────────────────────────────────────────
// Call debugToken() whenever you see a 403 — it prints exactly what the backend sees.
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
    console.error(`❌ No token found under key "${TOKEN_KEY}". Admin cannot authenticate.`);
    console.groupEnd();
    return null;
  }

  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Not a valid JWT (expected 3 parts)");
    const payload = JSON.parse(atob(parts[1]));
    console.log("✅ Token payload:", payload);
    console.log("   Roles/Authorities:", {
      role:        payload.role,
      roles:       payload.roles,
      authorities: payload.authorities,
      scope:       payload.scope,
    });
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

// ── Axios Instance ─────────────────────────────────────────────────────────────
export const api = axios.create({
  baseURL: BASE_URL_API,
  headers: { 'Content-Type': 'application/json' },
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

// ── Base fetch wrapper ─────────────────────────────────────────────────────────
// ✅ Does NOT set Content-Type when body is FormData — lets the browser
//    add the multipart boundary automatically (prevents corruption).
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${BASE_URL_API}${endpoint}`;

  const defaultHeaders: Record<string, string> = {
    Accept: "application/json",
  };

  // Only attach application/json if we are NOT sending FormData
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
      headers: {
        ...defaultHeaders,
        ...((options.headers as Record<string, string>) || {}),
      },
    });

    const contentType = res.headers.get("content-type");
    let data: any = null;

    if (contentType?.includes("application/json")) {
      data = await res.json();
    } else {
      data = { message: await res.text() };
    }

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

// ── Helper: extract array from any backend response shape ──────────────────────
const extractArray = (data: any): any[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.content)) return data.content;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.bookings)) return data.bookings;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.results)) return data.results;
  return [];
};

// ────────────────────────────────────────────────────────────────────────────
// AUTH
// ────────────────────────────────────────────────────────────────────────────

export const loginUser = async (identifier: string, password: string) => {
  clearToken();
  const data = await apiFetch("/users/authenticate", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });

  if (data?.token)        setToken(data.token);
  if (data?.role)         setRole(data.role);
  if (data?.id)           setUserId(Number(data.id));
  if (data?.userId)       setUserId(Number(data.userId));
  if (data?.consultantId) setConsultantId(Number(data.consultantId));

  debugToken(); // verify role after login
  return data;
};

export const registerUser = async (payload: any) => {
  const data = await apiFetch("/onboarding", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (data?.token)        setToken(data.token);
  if (data?.role)         setRole(data.role);
  if (data?.id)           setUserId(Number(data.id));
  if (data?.consultantId) setConsultantId(Number(data.consultantId));
  return data;
};

export const changePassword = async (payload: any) =>
  apiFetch("/users/me/password", { method: "PUT", body: JSON.stringify(payload) });

// ────────────────────────────────────────────────────────────────────────────
// CONSULTANTS
// ────────────────────────────────────────────────────────────────────────────

export const getConsultants    = async () => apiFetch("/consultants");
export const getAllConsultants  = getConsultants;
export const getAdvisors       = getConsultants;
export const getAllAdvisors     = getConsultants;

export const getConsultantById = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}`);
export const getAdvisorById = getConsultantById;
export const getMyProfile   = getConsultantById;

// POST /consultants — multipart/form-data
// Spring controller expects:
//   @RequestPart("data")                      ConsultantRequest  (JSON)
//   @RequestPart(value="file", required=false) MultipartFile
//
// ConsultantRequest fields:
//   name, designation, charges, shiftStartTime (HH:mm:ss), shiftEndTime (HH:mm:ss),
//   description, rating, skills (string[]), email
export const createConsultant = async (payload: any) => {
  const formData    = new FormData();
  const dataPayload = { ...payload };
  let   file: File | null = null;

  if (dataPayload.file) {
    file = dataPayload.file as File;
    delete dataPayload.file;
  }

  // Formatting: Spring Boot requires HH:mm:ss. HTML inputs give HH:mm
  if (dataPayload.shiftStartTime && dataPayload.shiftStartTime.length === 5) {
    dataPayload.shiftStartTime += ":00";
  }
  if (dataPayload.shiftEndTime && dataPayload.shiftEndTime.length === 5) {
    dataPayload.shiftEndTime += ":00";
  }

  // Wrap JSON in Blob to satisfy Spring @RequestPart("data")
  formData.append("data", new Blob([JSON.stringify(dataPayload)], { type: "application/json" }));
  if (file) formData.append("file", file);

  return apiFetch("/consultants", { method: "POST", body: formData });
};
export const createAdvisor = createConsultant;

// PUT /consultants/:id — multipart/form-data
// ✅ Supports both explicit file param and file nested inside data object.
// ✅ Formats HH:mm → HH:mm:ss for Spring Boot compatibility.
// ⚠️ Do NOT set Content-Type header — browser sets multipart/form-data
//    with the correct boundary automatically.
export const updateConsultant = async (
  consultantId: number,
  data: {
    name?:           string;
    designation?:    string;
    charges?:        number;
    email?:          string;
    skills?:         string[];
    shiftStartTime?: string | null;  // "HH:mm" or "HH:mm:ss"
    shiftEndTime?:   string | null;  // "HH:mm" or "HH:mm:ss"
    description?:    string;
    rating?:         number | null;
    [key: string]:   any;            // Allow dynamic fields
  },
  explicitFile?: File | null
): Promise<any> => {
  const formData    = new FormData();
  const dataPayload = { ...data };
  let   file: File | null = explicitFile || null;

  if (dataPayload.file) {
    if (!file) file = dataPayload.file as File;
    delete dataPayload.file;
  }

  // Formatting: Spring Boot requires HH:mm:ss
  if (dataPayload.shiftStartTime && dataPayload.shiftStartTime.length === 5) {
    dataPayload.shiftStartTime += ":00";
  }
  if (dataPayload.shiftEndTime && dataPayload.shiftEndTime.length === 5) {
    dataPayload.shiftEndTime += ":00";
  }

  // Part 1 — JSON blob read by @RequestPart("data")
  formData.append('data', new Blob([JSON.stringify(dataPayload)], { type: 'application/json' }));
  // Part 2 — image file (omit entirely if no file selected)
  if (file) formData.append('file', file);

  return apiFetch(`/consultants/${consultantId}`, { method: 'PUT', body: formData });
};
export const updateAdvisor = updateConsultant;

export const deleteConsultant = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}`, { method: "DELETE" });
export const deleteAdvisor = deleteConsultant;

// ────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ────────────────────────────────────────────────────────────────────────────

export const getAllUsers    = async ()             => apiFetch("/users");
export const getUsersByRole = async (role: string) => apiFetch(`/users/role/${role}`);
export const getCurrentUser = async ()             => apiFetch("/users/me");
export const logoutUser     = ()                   => clearToken();

export const updateUser = async (id: number, payload: object) =>
  apiFetch(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteUser = async (id: number) =>
  apiFetch(`/users/${id}`, { method: "DELETE" });

// ────────────────────────────────────────────────────────────────────────────
// ONBOARDING
// ────────────────────────────────────────────────────────────────────────────

export const getOnboarding = async (id: number) => apiFetch(`/onboarding/${id}`);
export const updateOnboarding = async (id: number, payload: object) =>
  apiFetch(`/onboarding/${id}`, { method: "PUT", body: JSON.stringify(payload) });
export const deleteOnboarding = async (id: number) =>
  apiFetch(`/onboarding/${id}`, { method: "DELETE" });

// ────────────────────────────────────────────────────────────────────────────
// TIMESLOTS
// ────────────────────────────────────────────────────────────────────────────

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
  consultantId:      number;
  slotDate:          string;
  slotTime:          string;
  durationMinutes:   number;
  masterTimeSlotId?: number;
}) => apiFetch("/timeslots", { method: "POST", body: JSON.stringify(payload) });

export const updateTimeslot = async (id: number, payload: any) =>
  apiFetch(`/timeslots/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteTimeslot = async (id: number) =>
  apiFetch(`/timeslots/${id}`, { method: "DELETE" });

// ────────────────────────────────────────────────────────────────────────────
// BOOKINGS
// ────────────────────────────────────────────────────────────────────────────

export const createBooking = async (payload: {
  consultantId:      number;
  timeSlotId:        number;
  amount:            number;
  userNotes?:        string;
  meetingMode?:      string;
  bookingDate?:      string;
  slotDate?:         string;
  masterTimeslotId?: number;
  slotTime?:         string;
  timeRange?:        string;
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

  // Fallback: aggregate bookings per consultant
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

// ────────────────────────────────────────────────────────────────────────────
// QUERIES
// ────────────────────────────────────────────────────────────────────────────

export const getAllQueries = async () => {
  const data = await apiFetch("/queries");
  return extractArray(data);
};

export const submitQuery = async (payload: {
  userId:       number;
  consultantId: number;
  category:     string;
  queryText:    string;
  status:       string;
}) => apiFetch("/queries", { method: "POST", body: JSON.stringify(payload) });

export const getQueryById = async (id: number) => apiFetch(`/queries/${id}`);

export const updateQuery = async (id: number, payload: any) =>
  apiFetch(`/queries/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const updateQueryStatus = async (id: number, status: string) =>
  apiFetch(`/queries/${id}`, { method: "PUT", body: JSON.stringify({ status }) });

export const deleteQuery = async (id: number) =>
  apiFetch(`/queries/${id}`, { method: "DELETE" });

export const getQueriesByUser = async (userId: number) => {
  const data = await apiFetch(`/queries/user/${userId}`);
  return extractArray(data);
};

export const getMyQueries = async (userId?: number): Promise<any[]> => {
  // If userId provided, fetch real queries from backend
  if (userId !== undefined) {
    return getQueriesByUser(userId);
  }
  // Fallback mock data (used when userId is not available)
  return [
    {
      id: 101, title: "Tax Planning",
      question: "How to minimize capital gains tax on property sale?",
      date: "Feb 10, 2026", status: "Pending Review", user: "User #429",
    },
    {
      id: 102, title: "Investment",
      question: "Best mutual funds for 5 year horizon?",
      date: "Feb 12, 2026", status: "Replied", user: "User #882",
    },
  ];
};

/**
 * Fetches all queries assigned to a specific consultant.
 * Used by the Advisor/Consultant dashboard.
 */
export const getQueriesByConsultant = async (consultantId: number) => {
  const data = await apiFetch(`/queries/consultant/${consultantId}`);
  return extractArray(data);
};

// Alias for consistency with other naming conventions
export const getQueriesByAdvisor = getQueriesByConsultant;

/**
 * Updates a query with a response from the consultant.
 * Automatically marks the query as RESOLVED when replied.
 */
export const replyToQuery = async (queryId: number, responseText: string) =>
  apiFetch(`/queries/${queryId}`, {
    method: "PUT",
    body: JSON.stringify({ responseText, status: "RESOLVED" }),
  });

// ────────────────────────────────────────────────────────────────────────────
// MASTER TIMESLOTS
// ────────────────────────────────────────────────────────────────────────────

export const getConsultantMasterSlots = async (consultantId: number) =>
  apiFetch(`/consultants/${consultantId}/master-timeslots`);

export default api;