import axios from 'axios';

// ── Configuration ──
const BASE_URL_API = `/api`;

// ── Token helpers ──
export const setToken   = (token: string) => localStorage.setItem("fin_token", token);
export const getToken   = () => localStorage.getItem("fin_token");
export const clearToken = () => {
  localStorage.removeItem("fin_token");
  localStorage.removeItem("fin_role");
};
export const setRole    = (role: string)  => localStorage.setItem("fin_role", role);
export const getRole    = () => localStorage.getItem("fin_role");

// ── Axios Instance ──
export const api = axios.create({
  baseURL: BASE_URL_API,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Base fetch wrapper ──
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const url = `${BASE_URL_API}${endpoint}`;
  const defaultHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
  const token = getToken();
  if (token) defaultHeaders["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...defaultHeaders, ...(options.headers as Record<string, string> || {}) },
    });

    const contentType = res.headers.get("content-type");
    let data: any = null;

    if (contentType && contentType.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = { message: text };
    }

    if (!res.ok) {
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

// ── Helper: extract array from any backend response shape ──
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

// ── Auth ──
export const loginUser = async (identifier: string, password: string) => {
  clearToken();
  const data = await apiFetch("/users/authenticate", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  if (data?.token) setToken(data.token);
  if (data?.role)  setRole(data.role);
  return data;
};

export const registerUser = async (payload: any) => {
  const data = await apiFetch("/onboarding", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (data?.token) setToken(data.token);
  if (data?.role)  setRole(data.role);
  return data;
};

export const changePassword = async (payload: any) => {
  return await apiFetch("/users/me/password", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

// ── CONSULTANTS ──
export const getConsultants = async () => {
  return await apiFetch("/consultants");
};
export const getAllConsultants = getConsultants;
export const getAdvisors      = getConsultants;
export const getAllAdvisors    = getConsultants;

export const getConsultantById = async (consultantId: number) => {
  return await apiFetch(`/consultants/${consultantId}`);
};
export const getAdvisorById = getConsultantById;
export const getMyProfile   = getConsultantById;

export const createConsultant = async (payload: object) => {
  return await apiFetch("/consultants", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};
export const createAdvisor = createConsultant;

export const updateConsultant = async (consultantId: number, payload: object) => {
  return await apiFetch(`/consultants/${consultantId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};
export const updateAdvisor = updateConsultant;

export const deleteConsultant = async (consultantId: number) => {
  return await apiFetch(`/consultants/${consultantId}`, {
    method: "DELETE",
  });
};
export const deleteAdvisor = deleteConsultant;

// ── User Management ──
export const getAllUsers = async () => {
  return await apiFetch("/users");
};
export const getUsersByRole = async (role: string) => {
  return await apiFetch(`/users/role/${role}`);
};
export const updateUser = async (id: number, payload: object) => {
  return await apiFetch(`/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};
export const deleteUser = async (id: number) => {
  return await apiFetch(`/users/${id}`, {
    method: "DELETE",
  });
};

// ── Onboarding ──
export const getOnboarding = async (id: number) => {
  return await apiFetch(`/onboarding/${id}`);
};
export const updateOnboarding = async (id: number, payload: object) => {
  return await apiFetch(`/onboarding/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};
export const deleteOnboarding = async (id: number) => {
  return await apiFetch(`/onboarding/${id}`, {
    method: "DELETE",
  });
};

// ── Timeslots ──
export const getTimeslotById = async (id: number) => {
  return await apiFetch(`/timeslots/${id}`);
};

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
    if (Array.isArray(data)) return data;
    if (data?.content) return data.content;
    return [];
  } catch {
    return getTimeslotsByConsultant(consultantId);
  }
};
export const getAvailableTimeslotsByAdvisor = getAvailableTimeslotsByConsultant;

export const createTimeslot = async (payload: {
  consultantId:    number;
  slotDate:        string;
  slotTime:        string;
  durationMinutes: number;
}) => {
  return await apiFetch("/timeslots", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const updateTimeslot = async (id: number, payload: any) => {
  return await apiFetch(`/timeslots/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

export const deleteTimeslot = async (id: number) => {
  return await apiFetch(`/timeslots/${id}`, {
    method: "DELETE",
  });
};

// ── Bookings ──
export const createBooking = async (payload: {
  consultantId: number;
  timeSlotId:   number;
  amount:       number;
  userNotes?:   string;
}) => {
  return await apiFetch("/bookings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const getBookingById = async (id: number) => {
  return await apiFetch(`/bookings/${id}`);
};

// ── getAllBookings ──
// Strategy:
//   1. Try /bookings (admin endpoint) — may return 500 on some backends
//   2. Try /bookings/all, /bookings/admin as alternatives
//   3. FALLBACK: fetch all consultants, then fetch /bookings/consultant/{id} for each
//      and merge — this always works because the per-consultant endpoint works fine
export const getAllBookings = async (): Promise<any[]> => {
  // Step 1: Try direct admin endpoints first
  const directEndpoints = ["/bookings", "/bookings/all", "/bookings/admin", "/bookings/list"];

  for (const endpoint of directEndpoints) {
    try {
      const response = await api.get(endpoint);
      const extracted = extractArray(response.data);
      console.log(`✅ Bookings from ${endpoint}:`, extracted.length);
      if (extracted.length > 0) {
        console.log("📋 Sample:", extracted[0]);
        return extracted;
      }
      // Endpoint succeeded but returned empty — could be genuinely empty
      // Only trust empty result from /bookings (primary), not fallbacks
      if (endpoint === "/bookings") return [];
    } catch (err: any) {
      console.warn(`⚠️ ${endpoint} → ${err?.response?.status || "error"}, trying next…`);
    }
  }

  // Step 2: FALLBACK — aggregate per-consultant bookings
  // This works because /bookings/consultant/{id} endpoint works fine
  console.log("🔄 Falling back to per-consultant aggregation…");
  try {
    const consultantsData = await api.get("/consultants");
    const consultants: any[] = extractArray(consultantsData.data);

    if (consultants.length === 0) {
      console.warn("No consultants found for aggregation.");
      return [];
    }

    // Fetch bookings for all consultants in parallel
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

    // Deduplicate by booking id
    const seen = new Set<number>();
    const unique = allBookings.filter(b => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });

    console.log(`✅ Aggregated ${unique.length} bookings from ${consultants.length} consultants`);
    if (unique.length > 0) console.log("📋 Sample:", unique[0]);
    return unique;
  } catch (err) {
    console.error("❌ Fallback aggregation also failed:", err);
  }

  console.error("❌ All booking strategies failed.");
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

export const getBookingsByConsultant = async (consultantId: number) => {
  return await apiFetch(`/bookings/consultant/${consultantId}`);
};
export const getBookingsByAdvisor = getBookingsByConsultant;

export const updateBooking = async (id: number, payload: any) => {
  return await apiFetch(`/bookings/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

export const deleteBooking = async (id: number) => {
  return await apiFetch(`/bookings/${id}`, {
    method: "DELETE",
  });
};

// ── Queries ──
export const getMyQueries = async () => {
  return [
    { id: 101, title: "Tax Planning", question: "How to minimize capital gains tax on property sale?", date: "Feb 10, 2026", status: "Pending Review", user: "User #429" },
    { id: 102, title: "Investment", question: "Best mutual funds for 5 year horizon?", date: "Feb 12, 2026", status: "Replied", user: "User #882" },
  ];
};

// ── User Data ──
export const getCurrentUser = async () => {
  return await apiFetch("/users/me");
};

export const logoutUser = () => {
  clearToken();
};