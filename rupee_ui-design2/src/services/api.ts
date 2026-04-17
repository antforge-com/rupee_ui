// ─────────────────────────────────────────────────────────────────────────────
// api.ts  —  Unified service layer
// ─────────────────────────────────────────────────────────────────────────────

import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { decryptLocal } from "./crypto";

export const BASE_URL = API_BASE_URL;

// ── IST date/time formatters (exported for use in AdminPage, AdvisorDashboard, etc.) ──
// Backend returns timestamps WITHOUT 'Z' — append it to force UTC parsing before IST conversion
const _istToUTC = (iso: string): Date => {
  if (!iso) return new Date(0);
  if (iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso)) return new Date(iso);
  return new Date(iso + 'Z');
};
export const toISTTime = (iso: string) =>
  _istToUTC(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
export const toISTDate = (iso: string) =>
  _istToUTC(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
export const toISTDateTime = (iso: string) =>
  _istToUTC(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });


// Parse Swagger LocalTime object {hour, minute, second, nano} or string to 'HH:MM:SS'
export const parseLocalTime = (t: any): string => {
  if (!t) return '';
  if (typeof t === 'object' && t.hour !== undefined) {
    return `${String(t.hour).padStart(2, '0')}:${String(t.minute || 0).padStart(2, '0')}:${String(t.second || 0).padStart(2, '0')}`;
  }
  if (typeof t === 'string') return t.substring(0, 8);
  return String(t);
};

export const TOKEN_KEY = "fin_token";
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("fin_role");
  localStorage.removeItem("fin_user_id");
  localStorage.removeItem("fin_consultant_id");
};

// FIX: Strip Spring Security's "ROLE_" prefix at the storage layer so that
// getRole() always returns a clean value like "CONSULTANT", "ADMIN", "USER".
// This fixes AdvisorDashboard being routed to UserPage because the router
// compared against "CONSULTANT" but localStorage contained "ROLE_CONSULTANT".
export const setRole = (role: string) =>
  localStorage.setItem("fin_role", (role || "").toUpperCase().replace(/^ROLE_/, ""));
export const getRole = () =>
  decryptLocal(localStorage.getItem("fin_role") || "").toUpperCase().replace(/^ROLE_/, "");
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
  const url = /^https?:\/\//i.test(endpoint) ? endpoint : `${BASE_URL}${endpoint}`;
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

const stripUndefinedFields = <T extends Record<string, any>>(obj: T): T => {
  const out: Record<string, any> = {};
  Object.keys(obj).forEach((k) => {
    if (obj[k] !== undefined) out[k] = obj[k];
  });
  return out as T;
};

const normaliseDurationMinutes = (value: any, fallback?: number): number | undefined => {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (parsed <= 12) return Math.round(parsed * 60);
  return Math.round(parsed);
};

const SPECIAL_DAYS_STORAGE_PREFIX = "fin_special_days_consultant_";

const clampSpecialDayDurationHours = (value: any): number =>
  Math.max(1, Math.min(3, Number(value ?? 1) || 1));

const specialDaysStorageKey = (consultantId: number) =>
  `${SPECIAL_DAYS_STORAGE_PREFIX}${Number(consultantId || 0)}`;

const createLocalSpecialDayId = () =>
  -Number(`${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, "0")}`);

const hasExplicitSpecialDayDuration = (record: any): boolean =>
  ["durationHours", "duration", "hours"].some((key) => {
    const value = record?.[key];
    return value !== undefined && value !== null && !Number.isNaN(Number(value));
  });

const normaliseSpecialDayRecord = (record: any, consultantId: number): any | null => {
  if (typeof record === "string") {
    const specialDate = record.trim();
    if (!specialDate) return null;
    return {
      id: createLocalSpecialDayId(),
      consultantId: Number(consultantId || 0),
      specialDate,
      durationHours: 1,
      durationExplicit: false,
      status: "SPECIAL",
      note: "",
    };
  }

  const resolvedConsultantId = Number(record?.consultantId || record?.consultant_id || consultantId || 0);
  const specialDate = String(record?.specialDate || record?.special_date || record?.date || record?.slotDate || "").trim();
  if (!resolvedConsultantId || !specialDate) return null;

  const rawId = Number(record?.id || 0);
  const durationExplicit = hasExplicitSpecialDayDuration(record);
  return {
    ...record,
    id: rawId || createLocalSpecialDayId(),
    consultantId: resolvedConsultantId,
    specialDate,
    durationHours: clampSpecialDayDurationHours(record?.durationHours ?? record?.duration ?? record?.hours ?? 1),
    durationExplicit,
    status: String(record?.status || record?.specialStatus || record?.special_booking_status || "SPECIAL"),
    note: record?.note || record?.description || record?.message || "",
  };
};

const specialDayFingerprint = (record: any): string => {
  const specialDate = String(record?.specialDate || "");
  const durationHours = clampSpecialDayDurationHours(record?.durationHours ?? 1);
  return `${specialDate}|${durationHours}`;
};

const writeStoredSpecialDaysByConsultant = (consultantId: number, records: any[]) => {
  const resolvedConsultantId = Number(consultantId || 0);
  if (!resolvedConsultantId) return;
  try {
    const normalised = records
      .map((record) => normaliseSpecialDayRecord(record, resolvedConsultantId))
      .filter((record): record is any => !!record)
      .sort((a, b) => a.specialDate.localeCompare(b.specialDate) || a.durationHours - b.durationHours);
    localStorage.setItem(specialDaysStorageKey(resolvedConsultantId), JSON.stringify(normalised));
  } catch {
    // Ignore storage errors and keep UI functional from API data only.
  }
};

export const getStoredSpecialDaysByConsultant = (consultantId: number): any[] => {
  const resolvedConsultantId = Number(consultantId || 0);
  if (!resolvedConsultantId) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(specialDaysStorageKey(resolvedConsultantId)) || "[]");
    return (Array.isArray(raw) ? raw : [])
      .map((record) => normaliseSpecialDayRecord(record, resolvedConsultantId))
      .filter((record): record is any => !!record)
      .sort((a, b) => a.specialDate.localeCompare(b.specialDate) || a.durationHours - b.durationHours);
  } catch {
    return [];
  }
};

const mergeSpecialDayRecords = (consultantId: number, ...sources: any[][]): any[] => {
  const normalisedRecords = sources.flat()
    .map((record) => normaliseSpecialDayRecord(record, consultantId))
    .filter((record): record is any => !!record);
  const datesWithExplicitDurations = new Set(
    normalisedRecords
      .filter((record) => record.durationExplicit)
      .map((record) => String(record.specialDate))
  );
  const merged = new Map<string, any>();
  normalisedRecords.forEach((normalised) => {
    if (!normalised.durationExplicit && datesWithExplicitDurations.has(String(normalised.specialDate))) {
      return;
    }
    merged.set(specialDayFingerprint(normalised), normalised);
  });
  return Array.from(merged.values()).sort((a, b) =>
    a.specialDate.localeCompare(b.specialDate) || a.durationHours - b.durationHours
  );
};

export const saveStoredSpecialDay = (payload: {
  id?: number;
  consultantId: number;
  specialDate: string;
  durationHours: number;
  status?: string;
  note?: string;
}): any | null => {
  const resolvedConsultantId = Number(payload.consultantId || 0);
  if (!resolvedConsultantId) return null;
  const nextRecord = normaliseSpecialDayRecord(payload, resolvedConsultantId);
  if (!nextRecord) return null;
  const existing = getStoredSpecialDaysByConsultant(resolvedConsultantId).filter((record) => (
    Number(record?.id || 0) !== Number(nextRecord.id || 0) &&
    specialDayFingerprint(record) !== specialDayFingerprint(nextRecord)
  ));
  const next = [...existing, nextRecord].sort((a, b) =>
    a.specialDate.localeCompare(b.specialDate) || a.durationHours - b.durationHours
  );
  writeStoredSpecialDaysByConsultant(resolvedConsultantId, next);
  return nextRecord;
};

export const removeStoredSpecialDay = (
  consultantId: number,
  matcher: { id?: number | null; specialDate?: string; durationHours?: number | null }
) => {
  const resolvedConsultantId = Number(consultantId || 0);
  if (!resolvedConsultantId) return;
  const targetId = Number(matcher?.id || 0);
  const targetDate = String(matcher?.specialDate || "").trim();
  const hasDuration = matcher?.durationHours != null && !Number.isNaN(Number(matcher.durationHours));
  const targetDuration = hasDuration ? clampSpecialDayDurationHours(matcher.durationHours) : null;
  const next = getStoredSpecialDaysByConsultant(resolvedConsultantId).filter((record) => {
    const sameId = targetId !== 0 && Number(record?.id || 0) === targetId;
    const sameDateDuration = !!targetDate
      && targetDuration !== null
      && String(record?.specialDate || "") === targetDate
      && clampSpecialDayDurationHours(record?.durationHours) === targetDuration;
    return !(sameId || sameDateDuration);
  });
  writeStoredSpecialDaysByConsultant(resolvedConsultantId, next);
};

const tryApiVariants = async <T>(attempts: Array<() => Promise<T>>): Promise<T> => {
  let lastError: any = new Error("No API variants provided");
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
};

export const loginUser = async (identifier: string, password: string) => {
  clearToken();
  // NOTE: Password encryption is disabled until the backend adds PasswordDecryptionUtil.
  // Once the backend team adds the AES decrypt step (see crypto.ts comments), change this to:
  //   const encryptedPassword = await encryptPassword(password);
  //   body: JSON.stringify({ identifier, password: encryptedPassword }),
  const data = await publicFetch("/users/authenticate", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
  if (data?.token) setToken(data.token);
  if (data?.role) setRole(data.role);   // setRole now strips ROLE_ prefix automatically
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
  // NOTE: Password encryption disabled until backend adds PasswordDecryptionUtil.
  // Once backend team adds AES decrypt step, change newPassword to encryptedPassword.
  await publicFetch("/users/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, otp, newPassword }),
  });
};

export const changePassword = async (payload: { newPassword: string; confirmPassword: string }) => {
  // NOTE: Password encryption disabled until backend adds PasswordDecryptionUtil.
  // Once backend team adds AES decrypt step, encrypt newPassword once and send same
  // value for both fields: const enc = await encryptPassword(payload.newPassword);
  return apiFetch("/users/change-password", {
    method: "PUT",
    body: JSON.stringify({ newPassword: payload.newPassword, confirmPassword: payload.confirmPassword }),
  });
};

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
  const slotsDuration = normaliseDurationMinutes(
    dataPayload.slotsDuration
    ?? dataPayload.slotDurationMinutes
    ?? dataPayload.durationMinutes
    ?? dataPayload.duration
    ?? dataPayload.durationHours,
    60
  );
  if (slotsDuration != null) dataPayload.slotsDuration = slotsDuration;

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
  const slotsDuration = normaliseDurationMinutes(
    dataPayload.slotsDuration
    ?? dataPayload.slotDurationMinutes
    ?? dataPayload.durationMinutes
    ?? dataPayload.duration
    ?? dataPayload.durationHours
  );
  if (slotsDuration != null) dataPayload.slotsDuration = slotsDuration;

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

// Swagger: GET /api/timeslots/{id} → TimeSlotResponse {id, slotDate, masterTimeSlotId, timeRange, status}
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
    // FIX: Filter fallback to AVAILABLE slots only — prevents showing already-booked slots
    const all = await getTimeslotsByConsultant(consultantId);
    const filtered = extractArray(all).filter(
      (s: any) => (s.status || "").toUpperCase() === "AVAILABLE"
    );
    return filtered.length > 0 ? filtered : extractArray(all);
  }
};
export const getAvailableTimeslotsByAdvisor = getAvailableTimeslotsByConsultant;

export const createTimeslot = async (payload: {
  consultantId: number; slotDate: string;
  durationMinutes: number; masterTimeSlotId?: number;
}) => apiFetch("/timeslots", {
  method: "POST",
  body: JSON.stringify({
    ...payload,
    durationMinutes: normaliseDurationMinutes(payload.durationMinutes, 60),
  }),
});

export const updateTimeslot = async (id: number, payload: any) =>
  apiFetch(`/timeslots/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteTimeslot = async (id: number) =>
  apiFetch(`/timeslots/${id}`, { method: "DELETE" });

export const getConsultantMasterSlots = async (consultantId: number) =>
  extractArray(await apiFetch(`/consultants/${consultantId}/master-timeslots`));

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

// ─────────────────────────────────────────────────────────────────────────────
// SPECIAL BOOKINGS
// New backend flow backed by SpecialBooking entity/table.
// We keep endpoint variants for backward compatibility across environments.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpecialBookingRequestPayload {
  consultantId: number;
  durationInHours: number;       // maps to backend SpecialBookingRequest.durationInHours
  sessionAmount: number;         // maps to backend SpecialBookingRequest.sessionAmount (flat fee)
  meetingMode: string;
  userNotes: string;
  offerId?: number | null;
}

export const createSpecialBooking = async (
  payload: SpecialBookingRequestPayload
): Promise<any> => {
  if (payload.sessionAmount == null || Number.isNaN(Number(payload.sessionAmount))) {
    throw new Error("Session amount is required");
  }

  // Payload shape matches SpecialBookingRequest DTO exactly
  const body = stripUndefinedFields({
    consultantId: payload.consultantId,
    durationInHours: Math.max(1, Number(payload.durationInHours || 1)),
    sessionAmount: Number(payload.sessionAmount),
    meetingMode: payload.meetingMode || "ONLINE",
    userNotes: payload.userNotes || "Special booking request",
    offerId: payload.offerId ?? undefined,
  });

  return apiFetch("/special-bookings", { method: "POST", body: JSON.stringify(body) });
};

export const getMySpecialBookings = async (): Promise<any[]> => {
  const uid = Number(getUserId() || 0);
  const attempts: Array<() => Promise<any>> = [
    () => apiFetch("/special-bookings/me"),
    () => apiFetch("/special-bookings/my"),
  ];
  if (uid > 0) {
    attempts.push(
      () => apiFetch(`/special-bookings/user/${uid}`),
      () => apiFetch(`/special-bookings/users/${uid}`),
      () => apiFetch(`/users/${uid}/special-bookings`)
    );
  }
  attempts.push(() => apiFetch("/special-bookings"));

  for (const attempt of attempts) {
    try {
      const data = await attempt();
      const arr = extractArray(data);
      if (Array.isArray(arr)) return arr;
    } catch {
      // try next endpoint variant
    }
  }
  return [];
};

export const getSpecialBookingsByConsultant = async (consultantId: number): Promise<any[]> => {
  const attempts: Array<() => Promise<any>> = [
    () => apiFetch(`/special-bookings/consultant/${consultantId}`),
    () => apiFetch(`/consultants/${consultantId}/special-bookings`),
    () => apiFetch(`/special-bookings?consultantId=${consultantId}`),
  ];

  for (const attempt of attempts) {
    try {
      const data = await attempt();
      const arr = extractArray(data);
      if (Array.isArray(arr)) return arr;
    } catch {
      // try next endpoint variant
    }
  }
  return [];
};

export const getSpecialDaysByConsultant = async (consultantId: number): Promise<any[]> => {
  const fallbackRecords = getStoredSpecialDaysByConsultant(consultantId);
  const attempts: Array<() => Promise<any>> = [
    () => apiFetch(`/consultants/${consultantId}/special-days`),
    () => apiFetch(`/special-days/consultant/${consultantId}`),
    () => apiFetch(`/special-days?consultantId=${consultantId}`),
    () => apiFetch(`/consultant-special-days?consultantId=${consultantId}`),
  ];

  for (const attempt of attempts) {
    try {
      const data = await attempt();
      const arr = extractArray(data);
      if (Array.isArray(arr)) {
        const apiDates = new Set(
          arr
            .map((record: any) => {
              if (typeof record === "string") return record.trim();
              return String(record?.specialDate || record?.special_date || record?.date || record?.slotDate || "").trim();
            })
            .filter(Boolean)
        );
        const matchingFallbackRecords = fallbackRecords.filter((record) =>
          apiDates.has(String(record?.specialDate || "").trim())
        );
        const merged = mergeSpecialDayRecords(consultantId, arr, matchingFallbackRecords);
        writeStoredSpecialDaysByConsultant(consultantId, merged);
        return merged;
      }
    } catch {
      // try next endpoint variant
    }
  }
  return fallbackRecords;
};

export const updateSpecialBooking = async (
  id: number,
  payload: Record<string, any>
): Promise<any> => {
  const body = stripUndefinedFields(payload || {});
  return tryApiVariants<any>([
    () => apiFetch(`/special-bookings/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    () => apiFetch(`/special-bookings/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    () => apiFetch(`/special-bookings/${id}/schedule`, { method: "PUT", body: JSON.stringify(body) }),
  ]);
};

export const giveSlotSpecialBooking = async (
  id: number,
  payload: Record<string, any>
): Promise<any> => {
  const body = stripUndefinedFields(payload || {});
  return apiFetch(`/special-bookings/${id}/give-slot`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
};

export const getBookingById = async (id: number) => apiFetch(`/bookings/${id}`);

// Swagger: GET /api/onboarding/{id} — returns full profile (name, email, phone, etc.)
export const getUserProfile = async (userId: number): Promise<any> => {
  try { return await apiFetch(`/onboarding/${userId}`); } catch { return null; }
};

const userDisplayNameCache = new Map<number, string>();

const formatDisplayName = (value: any): string => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) {
    const local = raw.split("@")[0].trim();
    if (local) {
      return local
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
    }
  }
  return raw
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
};

const isPlaceholderDisplayName = (value: string): boolean =>
  /^(user|client|booking)\s*#?\s*\d+$/i.test(String(value || "").trim());

export const getUserDisplayName = async (userId: number): Promise<string> => {
  if (!userId) return "Client";

  const cached = userDisplayNameCache.get(userId);
  if (cached) return cached;

  const extractName = (data: any): string => {
    const source = data?.data || data?.user || data?.content?.[0] || data || {};
    const raw =
      source?.name ||
      source?.fullName ||
      source?.displayName ||
      (source?.firstName && source?.lastName ? `${source.firstName} ${source.lastName}` : "") ||
      source?.firstName ||
      source?.lastName ||
      source?.username ||
      source?.loginId ||
      source?.identifier ||
      source?.email ||
      "";
    return formatDisplayName(raw);
  };

  for (const fetcher of [
    () => apiFetch(`/users/${userId}`),
    () => getUserProfile(userId),
  ]) {
    try {
      const name = extractName(await fetcher());
      if (name && !isPlaceholderDisplayName(name)) {
        userDisplayNameCache.set(userId, name);
        return name;
      }
    } catch { }
  }

  const fallback = "Client";
  userDisplayNameCache.set(userId, fallback);
  return fallback;
};

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

export const getBookingSummary = async (): Promise<{
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  revenue: number;
}> => {
  const data = await apiFetch("/bookings/summary");
  return {
    total: Number(data?.total || 0),
    pending: Number(data?.pending || 0),
    confirmed: Number(data?.confirmed || 0),
    completed: Number(data?.completed || 0),
    revenue: Number(data?.revenue || 0),
  };
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
  tryApiVariants<any>([
    () => apiFetch(`/bookings/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    () => apiFetch(`/bookings/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  ]);

export const deleteBooking = async (id: number) =>
  apiFetch(`/bookings/${id}`, { method: "DELETE" });

// ── Reschedule a normal (single-slot) booking ─────────────────────────────────
// PUT /api/bookings/{id}/reschedule  — RescheduleBookingRequest: { newTimeSlotId }
export const rescheduleBooking = async (
  id: number,
  payload: { newTimeSlotId: number }
): Promise<any> =>
  apiFetch(`/bookings/${id}/reschedule`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

// ── Reschedule one slot inside a bulk booking ─────────────────────────────────
// PUT /api/bookings/bulk/{id}/reschedule  — RescheduleBulkBookingRequest:
//   { oldTimeSlotId, newTimeSlotId }
export const rescheduleBulkBooking = async (
  id: number,
  payload: { oldTimeSlotId: number; newTimeSlotId: number }
): Promise<any> =>
  apiFetch(`/bookings/bulk/${id}/reschedule`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

// ── Cancel a booking (normal OR bulk) ────────────────────────────────────────
// PATCH /api/bookings/{id}/cancel — no body required
// Idempotent: already-cancelled bookings return silently.
export const cancelBooking = async (id: number): Promise<void> => {
  await apiFetch(`/bookings/${id}/cancel`, { method: "PATCH" });
};

// ── Filter bookings by status with server-side pagination ─────────────────────
// GET /api/bookings/status/{status}?page={p}&size={s}
// Roles: ADMIN sees all; CONSULTANT sees own; USER/SUBSCRIBER sees own.
export const getBookingsByStatus = async (
  status: string,
  page = 0,
  size = 10
): Promise<{ content: any[]; totalElements: number; totalPages: number; number: number }> => {
  try {
    const data = await apiFetch(
      `/bookings/status/${encodeURIComponent(status)}?page=${page}&size=${size}`
    );
    if (data && typeof data.totalElements === "number") return data;
    const arr = extractArray(data);
    return { content: arr, totalElements: arr.length, totalPages: 1, number: 0 };
  } catch (err: any) {
    console.error(`getBookingsByStatus(${status}) error:`, err?.message);
    return { content: [], totalElements: 0, totalPages: 0, number: page };
  }
};

// ── Update a bulk booking (admin-level: status, payment, reassignment) ────────
// PUT /api/bookings/bulk/{id}  — BulkBookingUpdateRequest:
//   { bookingStatus?, paymentStatus?, meetingMode?, meetingNotes?,
//     meetingLink?, meetingId?, timeSlotIds?: number[], consultantId? }
export const updateBulkBooking = async (
  id: number,
  payload: Record<string, any>
): Promise<any> =>
  apiFetch(`/bookings/bulk/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

// ── Revenue & booking analytics for admin dashboard ───────────────────────────
// GET /api/bookings/analytics?days={n}
// Returns: { totalBookings, completed, totalRevenue, tableData[] }
export const getRevenueAnalytics = async (days = 30): Promise<any> => {
  try {
    return await apiFetch(`/bookings/analytics?days=${days}`);
  } catch (err: any) {
    console.error("getRevenueAnalytics error:", err?.message);
    return { totalBookings: 0, completed: 0, totalRevenue: 0, tableData: [] };
  }
};

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
      if (arr.length > 0) return arr.map(normalizeSkill);
    } catch (err: any) {
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
  file?: File | null,
  /** Pass true when the user is within the 2-month free guest trial window */
  isGuestTrial?: boolean
): Promise<any> => {
  const token = getToken();
  const ticketPayload = { ...payload, status: payload.status || "NEW" };

  const form = new FormData();
  const blob = new Blob([JSON.stringify(ticketPayload)], { type: "application/json" });
  // Swagger: POST /api/tickets multipart with "ticketData" field only
  form.append("ticketData", blob);
  if (file) form.append("file", file);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Do not send a custom trial header here.
  // The backend CORS config does not allow X-Guest-Trial-Access, so the browser
  // blocks the request during preflight before the ticket API is even reached.
  // Keep the flag inside the multipart payload instead so the request remains
  // a normal allowed cross-origin POST.
  if (isGuestTrial) form.append("guestTrialAccess", "true");

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

export const getTicketSummary = async (): Promise<{
  total: number;
  openActive: number;
  overdue: number;
  escalated: number;
  resolved: number;
  resolvedToday: number;
  closed: number;
}> => {
  const data = await apiFetch("/tickets/summary");
  return {
    total: Number(data?.total || 0),
    openActive: Number(data?.openActive || 0),
    overdue: Number(data?.overdue || 0),
    escalated: Number(data?.escalated || 0),
    resolved: Number(data?.resolved || 0),
    resolvedToday: Number(data?.resolvedToday || 0),
    closed: Number(data?.closed || 0),
  };
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
  // Swagger: PATCH /api/tickets/{id}/status?status={status} — status is a query param
  return apiFetch(`/tickets/${id}/status?status=${encodeURIComponent(status)}`, {
    method: "PATCH",
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
        ticketTitle: ticketTitle || "Ticket",
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
        title: ticketTitle ? `New Ticket Assigned - ${ticketTitle}` : 'New Ticket Assigned',
        message: `You have been assigned${ticketTitle ? `: "${ticketTitle}"` : ''}. Priority: ${priority || 'MEDIUM'}. Assigned by ${assignedBy || 'Admin'}.`,
        timestamp: new Date().toISOString(),
        read: false,
        ticketId,
      };
      localStorage.setItem(notifKey, JSON.stringify([newNotif, ...prev].slice(0, 50)));
    } catch { }
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
  authorId: number,
  authorRole: "ADMIN" | "CONSULTANT" = "ADMIN"
) => {
  try {
    return await apiFetch(`/tickets/${ticketId}/notes`, {
      method: "POST",
      body: JSON.stringify({ authorId, noteText, authorRole }),
    });
  } catch {
    // Fallback: prefix the comment text with role for display clarity
    const prefix = authorRole === "ADMIN" ? "[ADMIN] " : "[CONSULTANT] ";
    return postTicketComment(ticketId, `${prefix}${noteText}`, authorId, authorRole === "CONSULTANT", true);
  }
};

/**
 * GET /api/tickets/:id/notes
 * Admin/Consultant shared internal notes (never visible to user).
 * Returns List<InternalNote> where each note has: { id, ticketId, authorId, noteText, createdAt, authorRole }
 */
export interface InternalNote {
  id: number;
  ticketId: number;
  authorId: number;
  noteText: string;
  createdAt: string;
  authorRole: 'ADMIN' | 'CONSULTANT';
}
export const getInternalNotes = async (ticketId: number): Promise<InternalNote[]> => {
  try {
    const data = await apiFetch(`/tickets/${ticketId}/notes`);
    const arr = extractArray(data);
    if (arr.length > 0) return arr;
    throw new Error("Empty notes or endpoint missing");
  } catch {
    // Fallback: fetch general comments and filter for private ones
    const comments = await getTicketComments(ticketId);
    return comments
      .filter(c => c.isPrivateNote || c.isInternal)
      .map(c => ({
        id: c.id,
        ticketId: c.ticketId || ticketId,
        authorId: c.senderId || 0,
        noteText: c.message || "",
        createdAt: c.createdAt || new Date().toISOString(),
        authorRole: c.authorRole === "AGENT" || c.isConsultantReply ? "CONSULTANT" : "ADMIN"
      } as InternalNote));
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

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION EMAIL STUBS
// The backend's NotificationService fires all transactional emails internally
// (ticket created/updated/assigned, booking confirmed/cancelled, etc.).
// There are NO frontend-facing /notifications/email/* routes on the server —
// any call to those endpoints would silently 404.
//
// These functions are kept as no-ops so existing call-sites in AdminPage and
// AdvisorDashboard continue to compile without changes.  They log a debug line
// so you know the backend already handled the email.
// ─────────────────────────────────────────────────────────────────────────────

export const sendTicketStatusEmail = async (payload: {
  ticketId: number;
  ticketTitle: string;
  newStatus: string;
  userEmail: string;
  userName?: string;
  updatedBy?: string;
}): Promise<void> => {
  // No-op: backend NotificationService.notifyTicketUpdate() sends this email automatically.
  console.debug(`[email no-op] ticket-status for #${payload.ticketId} → backend handled`);
};

export const sendTicketAssignedEmail = async (payload: {
  ticketId: number;
  ticketTitle: string;
  consultantEmail: string;
  consultantName?: string;
  assignedBy?: string;
  priority?: string;
}): Promise<void> => {
  // No-op: backend NotificationService.notifyNewAssignment() sends this email automatically.
  console.debug(`[email no-op] ticket-assigned for #${payload.ticketId} → backend handled`);
};

export const sendTicketCommentEmail = async (payload: {
  ticketId: number;
  ticketTitle: string;
  userEmail: string;
  userName?: string;
  commentPreview: string;
  repliedBy?: string;
}): Promise<void> => {
  // No-op: backend NotificationService.notifyNewComment() sends this email automatically.
  console.debug(`[email no-op] ticket-comment for #${payload.ticketId} → backend handled`);
};

export const sendTicketEscalatedEmail = async (payload: {
  ticketId: number;
  ticketTitle: string;
  userEmail?: string;
  consultantEmail?: string;
  reason?: string;
}): Promise<void> => {
  // No-op: backend NotificationService.notifyEscalation() sends this email automatically.
  console.debug(`[email no-op] ticket-escalated for #${payload.ticketId} → backend handled`);
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
    NEW: { bg: "#ECFEFF", color: "#0F766E", border: "#99F6E4" },
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

// Backend FeedbackRequest requires ALL fields including meetingId (not optional).
// If no separate meeting entity exists, use bookingId for meetingId.
export const createFeedback = async (payload: {
  userId: number;
  consultantId: number;
  bookingId: number;
  meetingId: number;  // Required by backend - use bookingId if no separate meeting
  rating: number;
  comments?: string;
}) => apiFetch("/feedbacks", { method: "POST", body: JSON.stringify(payload) });

export const updateFeedback = async (id: number, payload: {
  userId: number;
  consultantId: number;
  bookingId: number;
  meetingId: number;  // Required by backend - use bookingId if no separate meeting
  rating: number;
  comments?: string;
}) => apiFetch(`/feedbacks/${id}`, { method: "PUT", body: JSON.stringify(payload) });

// ── DELETE /api/feedbacks/{id}  — auth required; only owner or ADMIN ──────────
export const deleteFeedback = async (id: number): Promise<void> => {
  await apiFetch(`/feedbacks/${id}`, { method: "DELETE" });
};

// ── GET /api/feedbacks/consultant/{consultantId}  — auth required ─────────────
export const getFeedbackByConsultant = async (consultantId: number): Promise<any[]> => {
  try {
    const data = await apiFetch(`/feedbacks/consultant/${consultantId}`);
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

// ── GET /api/feedbacks/{id}  — auth required ─────────────────────────────────
export const getFeedbackById = async (id: number): Promise<any> =>
  apiFetch(`/feedbacks/${id}`);

// ── GET /api/feedbacks/meeting/{meetingId}  — auth required ──────────────────
export const getFeedbackByMeeting = async (meetingId: number): Promise<any> =>
  apiFetch(`/feedbacks/meeting/${meetingId}`);

// ── GET /api/feedbacks/public/highest-rated?limit={n}  — NO AUTH ─────────────
// Used on the public homepage to showcase top reviews.
// Backend caps at 50; defaults to 5 if limit ≤ 0.
export const getHighestRatedFeedbacks = async (limit = 5): Promise<any[]> => {
  try {
    const safeLimit = Math.min(Math.max(limit, 1), 50);
    const url = `${BASE_URL}/feedbacks/public/highest-rated?limit=${safeLimit}`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

// ── GET /api/feedbacks  — auth required, returns all feedbacks (admin view) ───
export const getAllFeedbacksAdmin = async (): Promise<any[]> => {
  try {
    const data = await apiFetch("/feedbacks");
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

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
  setRole(role);  // setRole now strips ROLE_ prefix automatically
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
  // Swagger: POST /api/tickets/{id}/escalate with body {reason: string}
  return apiFetch(`/tickets/${id}/escalate`, {
    method: "POST",
    body: JSON.stringify({ reason: reason || "Escalated by consultant" }),
  });
};

export const getCannedResponses = async (): Promise<any[]> => {
  // Swagger: GET /api/admin/config/canned-responses
  const data = await apiFetch("/admin/config/canned-responses");
  return Array.isArray(data) ? data : extractArray(data);
};

export const createCannedResponse = async (payload: {
  title: string; message: string; category?: string;
}): Promise<any> =>
  // Swagger: POST /api/admin/config/canned-responses — uses "content" not "message"
  apiFetch("/admin/config/canned-responses", {
    method: "POST",
    body: JSON.stringify({ title: payload.title, content: payload.message || (payload as any).content || "", category: payload.category }),
  });

export const updateCannedResponse = async (id: number, payload: {
  title?: string; message?: string; category?: string;
}): Promise<any> =>
  apiFetch(`/admin/config/canned-responses/${id}`, { method: "PUT", body: JSON.stringify(payload) });

export const deleteCannedResponse = async (id: number): Promise<void> => {
  // Swagger: DELETE /api/admin/config/canned-responses/{id}
  await apiFetch(`/admin/config/canned-responses/${id}`, { method: "DELETE" });
};

export const getTicketCategories = async (): Promise<any[]> => {
  // Swagger: GET /api/admin/config/categories
  const data = await apiFetch("/admin/config/categories");
  return Array.isArray(data) ? data : extractArray(data);
};

export const createTicketCategory = async (payload: {
  name: string; description?: string;
}): Promise<any> =>
  // Swagger: POST /api/admin/config/categories
  apiFetch("/admin/config/categories", { method: "POST", body: JSON.stringify(payload) });

export const toggleTicketCategory = async (id: number): Promise<any> =>
  // Swagger: PATCH /api/admin/config/categories/{id}/toggle
  apiFetch(`/admin/config/categories/${id}/toggle`, { method: "PATCH" });

export const deleteTicketCategory = async (id: number): Promise<void> => {
  // Swagger: toggle = deactivate (no DELETE endpoint for categories)
  await apiFetch(`/admin/config/categories/${id}/toggle`, { method: "PATCH" });
};

export const getBusinessHours = async (): Promise<any[]> => {
  // Swagger: GET /api/admin/settings/business-hours
  const data = await apiFetch("/admin/settings/business-hours");
  return Array.isArray(data) ? data : extractArray(data);
};

// Convert "HH:MM:SS" or "HH:MM" string to Swagger LocalTime object
const toLocalTime = (t: string): { hour: number; minute: number; second: number; nano: number } => {
  const parts = (t || "09:00:00").split(":").map(Number);
  return { hour: parts[0] || 0, minute: parts[1] || 0, second: parts[2] || 0, nano: 0 };
};

export const updateBusinessHours = async (hours: Array<{
  dayOfWeek: string; openTime?: string; closeTime?: string; isOpen?: boolean;
  startTime?: string; endTime?: string; isWorkingDay?: boolean;
}>): Promise<any> => {
  // Swagger: POST /api/admin/settings/business-hours
  // BusinessHoursRequest: {dayOfWeek, startTime: LocalTime, endTime: LocalTime, workingDay}
  const payload = hours.map(h => ({
    dayOfWeek: h.dayOfWeek,
    startTime: toLocalTime(h.startTime || h.openTime || "09:00:00"),
    endTime: toLocalTime(h.endTime || h.closeTime || "18:00:00"),
    workingDay: h.isWorkingDay !== undefined ? h.isWorkingDay : h.isOpen !== undefined ? h.isOpen : true,
  }));
  return apiFetch("/admin/settings/business-hours", { method: "POST", body: JSON.stringify(payload) });
};

export const getHolidays = async (): Promise<any[]> => {
  // Swagger: GET /api/admin/settings/holidays
  const data = await apiFetch("/admin/settings/holidays");
  return Array.isArray(data) ? data : extractArray(data);
};

export const addHoliday = async (payload: { name: string; holidayDate: string }): Promise<any> =>
  // Swagger: POST /api/admin/settings/holidays
  apiFetch("/admin/settings/holidays", { method: "POST", body: JSON.stringify(payload) });

export const deleteHoliday = async (id: number): Promise<void> => {
  // Swagger: DELETE /api/admin/settings/holidays/{id}
  await apiFetch(`/admin/settings/holidays/${id}`, { method: "DELETE" });
};

export const getAutoResponder = async (): Promise<any> =>
  // Swagger: GET /api/admin/settings/auto-responder
  apiFetch("/admin/settings/auto-responder");

export const updateAutoResponder = async (payload: { enabled: boolean; message: string }): Promise<any> =>
  // Swagger: POST /api/admin/settings/auto-responder with AutoResponderDto {enabled, message}
  apiFetch("/admin/settings/auto-responder", { method: "POST", body: JSON.stringify(payload) });

const _today = () => new Date().toISOString().slice(0, 10);

// Swagger: POST /api/contact/public/submit (public, no auth needed)
export const submitContactMessage = async (payload: {
  name: string; email: string; message: string;
}): Promise<any> => {
  const res = await fetch(`${BASE_URL}/contact/public/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Contact submit failed: ${res.status}`);
  return res.json().catch(() => ({}));
};

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
    "Submitted By": t.user?.name || t.user?.fullName || t.user?.username || t.userName || (t.userId ? "Client" : ""),
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
h2{color:#0F172A}table{border-collapse:collapse;width:100%}
th{background:#0F766E;color:#fff;padding:6px 8px;text-align:left;font-size:10px}
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
  const normalizeOffers = (items: any[]): any[] => {
    const today = new Date();
    const seen = new Set<number>();
    return (Array.isArray(items) ? items : [])
      .filter((o: any) => {
        const id = Number(o?.id || 0);
        if (!(id > 0) || seen.has(id)) return false;
        seen.add(id);
        if (!o?.title) return false;
        if (o.isActive === false || o.active === false) return false;
        const status = String(o.approvalStatus ?? o.status ?? "APPROVED").toUpperCase();
        if (status === "REJECTED" || status === "PENDING") return false;
        if (o.validFrom) {
          const from = new Date(o.validFrom);
          from.setHours(0, 0, 0, 0);
          if (!Number.isNaN(from.getTime()) && from > today) return false;
        }
        if (o.validTo || o.validUntil) {
          const until = new Date(o.validTo || o.validUntil);
          until.setHours(23, 59, 59, 999);
          if (!Number.isNaN(until.getTime()) && until < new Date()) return false;
        }
        return true;
      });
  };

  const fetchOfferList = async (url: string, headers: Record<string, string>) => {
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return normalizeOffers(Array.isArray(data) ? data : extractArray(data));
  };

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

    const checkoutOffers = await fetchOfferList(url, headers);
    if (checkoutOffers.length > 0 || consultantId != null) {
      return checkoutOffers;
    }

    // Some environments return an empty global checkout list even when offers
    // exist. Fall back to the legacy public offers endpoint for the home page.
    return await fetchOfferList(`${BASE_URL}/offers`, headers);
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
 * Normalize date string to ISO format required by backend: yyyy-MM-dd'T'HH:mm:ss
 * Handles: "2026-03-18", "2026-03-18T00:00:00", Date objects
 */
const normalizeOfferDate = (dateInput: string | Date): string => {
  if (!dateInput) return "";
  const dateStr = typeof dateInput === "string" ? dateInput : dateInput.toISOString();
  // If already has time component (T and :), return as-is (trim Z if present)
  if (dateStr.includes("T") && dateStr.includes(":")) {
    return dateStr.replace("Z", "").substring(0, 19); // "2026-03-18T00:00:00"
  }
  // Date only: append T00:00:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `${dateStr}T00:00:00`;
  }
  // Try parsing and formatting
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().replace("Z", "").substring(0, 19);
    }
  } catch { /* fall through */ }
  return dateStr; // Return as-is if we can't parse
};

/**
 * POST /api/offers — create offer (admin or consultant)
 * Backend OfferRequest: title*, description, discount*, validFrom*, validTo*, isActive, consultantId
 * Backend expects dates in format: yyyy-MM-dd'T'HH:mm:ss (e.g., "2026-03-18T00:00:00")
 * Backend auto-sets status: ADMIN → APPROVED, CONSULTANT → PENDING
 */
export const createOffer = async (payload: {
  title: string;
  description: string;
  discount: string;
  validFrom: string;
  validTo: string;
  isActive?: boolean;
  active?: boolean;
  consultantId?: number | null;
  [key: string]: any;
}): Promise<any> => {
  // Send only fields defined in OfferRequest DTO — extra fields cause 500
  const body: Record<string, any> = {
    title: payload.title,
    description: payload.description || "",
    discount: payload.discount || "0%",
    validFrom: normalizeOfferDate(payload.validFrom),
    validTo: normalizeOfferDate(payload.validTo),
    active: payload.active ?? payload.isActive ?? true,
  };
  if (payload.consultantId != null) body.consultantId = payload.consultantId;
  return apiFetch("/offers", { method: "POST", body: JSON.stringify(body) });
};

/**
 * PUT /api/offers/:id — update offer
 * Backend OfferRequest same fields as createOffer
 * Backend expects dates in format: yyyy-MM-dd'T'HH:mm:ss
 */
export const updateOffer = async (id: number, payload: any): Promise<any> => {
  const body: Record<string, any> = {
    title: payload.title,
    description: payload.description || "",
    discount: payload.discount || "0%",
    validFrom: normalizeOfferDate(payload.validFrom),
    validTo: normalizeOfferDate(payload.validTo),
    active: payload.active ?? payload.isActive ?? true,
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

const getLocalTermsFallback = (): any[] => {
  try {
    const raw = localStorage.getItem("fin_terms_versions");
    if (!raw) return [];
    const versions = JSON.parse(raw);
    if (!Array.isArray(versions) || versions.length === 0) return [];
    const active = versions.find((item: any) => item?.isActive) || versions[versions.length - 1];
    return active ? [active] : [];
  } catch {
    return [];
  }
};

export const getTermsAndConditions = async (): Promise<any[]> => {
  const attempts: Array<() => Promise<any>> = [
    () => publicFetch("/static-content/TERMS_AND_CONDITIONS"),
    () => publicFetch("/admin/terms-and-conditions/active"),
    () => publicFetch("/admin/terms-and-conditions"),
    () => apiFetch("/static-content/TERMS_AND_CONDITIONS"),
    () => apiFetch("/admin/terms-and-conditions/active"),
    () => apiFetch("/admin/terms-and-conditions"),
  ];

  for (const attempt of attempts) {
    try {
      const data = await attempt();
      if (data && (data.content || data.text)) return [data];
      const arr = Array.isArray(data) ? data : extractArray(data);
      if (arr.length > 0) return arr;
    } catch (e: any) {
      const msg = String(e?.message || "");
      if (!msg.includes("404") && !msg.includes("401") && !msg.includes("403")) {
        console.warn("⚠️ getTermsAndConditions attempt failed:", e?.message);
      }
    }
  }

  return getLocalTermsFallback();
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
 * GET /api/admin/settings/public/fee-config
 * Public endpoint — accessible by all users (no auth required).
 * Returns the platform commission configuration.
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
    // Use the public endpoint that doesn't require admin auth
    const data = await apiFetch("/admin/settings/public/fee-config");
    const config = parseFeeConfig(data);
    if (config) {
      // Cache for offline/fallback use
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(config)); } catch { /* storage full */ }
      return config;
    }
  } catch (err: any) {
    console.warn("⚠️ getFeeConfig failed (non-fatal):", err?.message);
    // Fallback to cached value if available
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = parseFeeConfig(JSON.parse(cached));
        if (parsed) return parsed;
      }
    } catch { /* ignore parse errors */ }
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
// Updated schema (standalone questions — NOT linked to skills):
//   Question   { id, text, type, options, placeholder, isActive, updatedAt }
//   QuestionRequest  { text, type?, options?, placeholder? }
//   QuestionResponse { id, text, type, options, placeholder, isActive, updatedAt }
//
//   Answer     { id, userId, bookingId, questionId, text, updatedAt, isActive }
//   AnswerSubmissionRequest { bookingId, consultantId?, answers: [{ questionId, text }] }
//
// Question types:
//   "radio"       — single-choice, options stored as "|||"-delimited string
//   "multiselect" — multi-choice,  options stored as "|||"-delimited string
//   "text"        — free-text input, placeholder supported
//   "mobile"      — 10-digit IN phone input, placeholder supported
// ─────────────────────────────────────────────────────────────────────────────

/** Wire type returned by GET /api/questions */
export interface BackendQuestion {
  id?: number;
  text: string;
  /** radio | multiselect | text | mobile */
  type?: string;
  /** "|||"-delimited option list (radio / multiselect only) */
  options?: string;
  /** Hint shown inside text / mobile inputs */
  placeholder?: string;
  isActive?: boolean;
  updatedAt?: string;
}

export interface BackendAnswer {
  id?: number;
  bookingId?: number;
  questionId: number;
  text: string;
  updatedAt?: string;
  isActive?: boolean;
}

/** Frontend display model — extends BackendQuestion with parsed options array */
export interface AdminQuestion {
  id?: number;
  text: string;
  type?: string;
  /** Parsed from the "|||"-delimited options string */
  optionsList?: string[];
  options?: string;
  placeholder?: string;
  isActive?: boolean;
  updatedAt?: string;
}

/** Parse a "|||"-delimited options string into a string array */
export const parseQuestionOptions = (raw?: string | null): string[] => {
  if (!raw) return [];
  return raw.split("|||").map(s => s.trim()).filter(Boolean);
};

// ── ADMIN: CRUD ────────────────────────────────────────────────────────────────

/**
 * GET /api/questions
 * Fetches ALL active standalone questions.
 * Public/user endpoint — no admin token required.
 */
export const getAllActiveQuestions = async (skillIds?: number[]): Promise<BackendQuestion[]> => {
  try {
    const query = Array.isArray(skillIds) && skillIds.length > 0
      ? `/questions?skillIds=${skillIds.join(",")}`
      : "/questions";
    const data = await apiFetch(query);
    const arr: any[] = Array.isArray(data) ? data : extractArray(data);
    return arr.map(q => ({
      ...q,
      id: Number(q.id ?? q.questionId ?? q.question_id ?? 0),
      text: q.text || q.questionText || q.question || "",
      type: q.type || "radio",
      optionsList: parseQuestionOptions(q.options),
    }));
  } catch (err: any) {
    console.warn("⚠️ getAllActiveQuestions failed:", err?.message);
    return [];
  }
};

/**
 * Alias kept for the AdminPage QuestionsManagementPanel.
 * Calls GET /api/questions — returns all active standalone questions.
 */
export const getAdminQuestions = getAllActiveQuestions;

/**
 * POST /api/questions  (ADMIN only)
 * Creates a new standalone question.
 *
 * @param payload.text        — question text (required)
 * @param payload.type        — "radio" | "multiselect" | "text" | "mobile"  (default: "radio")
 * @param payload.options     — "|||"-delimited option string for radio/multiselect
 * @param payload.placeholder — hint text for text/mobile inputs
 */
export const createAdminQuestion = async (payload: {
  text: string;
  type?: string;
  options?: string;
  placeholder?: string;
}): Promise<BackendQuestion> =>
  apiFetch("/questions", {
    method: "POST",
    body: JSON.stringify({
      text: payload.text,
      type: payload.type || "radio",
      options: payload.options || null,
      placeholder: payload.placeholder || null,
    }),
  });

/**
 * PUT /api/questions/:id  (ADMIN only)
 * Updates an existing question (text, type, options, placeholder).
 */
export const updateAdminQuestion = async (
  id: number,
  payload: {
    text: string;
    type?: string;
    options?: string;
    placeholder?: string;
  }
): Promise<BackendQuestion> =>
  apiFetch(`/questions/${id}`, {
    method: "PUT",
    body: JSON.stringify({
      text: payload.text,
      type: payload.type || "radio",
      options: payload.options || null,
      placeholder: payload.placeholder || null,
    }),
  });

/**
 * DELETE /api/questions/:id  (ADMIN only)
 * Soft-deletes the question and all associated answers.
 */
export const deleteAdminQuestion = async (id: number): Promise<void> =>
  apiFetch(`/questions/${id}`, { method: "DELETE" });

// ── LEGACY COMPAT ─────────────────────────────────────────────────────────────
/**
 * @deprecated  Questions are now standalone — skillIds param is ignored.
 * Use getAllActiveQuestions() instead.
 */
export const getQuestionsBySkills = async (
  skillIds: number[]
): Promise<BackendQuestion[]> => getAllActiveQuestions(skillIds);

// ── ANSWERS ───────────────────────────────────────────────────────────────────

/**
 * Wire type returned by GET /api/users/:userId/bookings/:bookingId/answers
 * Matches AnswerResponse DTO from the backend.
 */
export interface AnswerResponse {
  id: number;
  bookingId: number;
  bookingType: string; // "NORMAL" | "SPECIAL" — matches AnswerResponse DTO
  questionId: number;
  text: string;
  updatedAt?: string;
  isActive?: boolean;
}

/**
 * POST /api/answers
 * User submits answers to post-booking questions for a specific booking.
 *
 * @param bookingId    — The booking this answer set belongs to (required by backend DTO)
 * @param answers      — Array of { questionId, text } pairs
 * @param consultantId — Optional: the consultant associated with the booking
 * @param bookingType  — "NORMAL" (default) or "SPECIAL" — required by AnswerSubmissionRequest DTO
 *
 * Backend: AnswerSubmissionRequest now requires bookingType to correctly scope
 * soft-deletes and avoid ID collisions between the bookings and special_bookings tables.
 */
export const submitAnswers = async (
  answers: Array<{ questionId: number; text: string }>,
  bookingId: number,
  consultantId?: number,
  bookingType: "NORMAL" | "SPECIAL" = "NORMAL",
): Promise<void> => {
  await apiFetch("/answers", {
    method: "POST",
    body: JSON.stringify({
      bookingId,
      bookingType,                    // required by AnswerSubmissionRequest DTO
      consultantId: consultantId ?? null,
      answers,
    }),
  });
};

/**
 * GET /api/users/:userId/answers
 * Retrieve a user's previously submitted answers (all bookings).
 */
export const getUserAnswers = async (userId: number): Promise<BackendAnswer[]> => {
  try {
    const data = await apiFetch(`/users/${userId}/answers`);
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

/**
 * GET /api/users/:userId/bookings/:bookingId/answers?type=NORMAL|SPECIAL
 * Admin / consultant endpoint: fetch all active answers for a specific booking.
 * Calls AnswerController.getAnswersForBooking — returns List<AnswerResponse>.
 *
 * @param bookingType — "NORMAL" (default) or "SPECIAL".
 * Backend requires this to distinguish between the bookings and special_bookings
 * tables, since IDs from both tables can collide.
 */
export const getAnswersForBooking = async (
  userId: number,
  bookingId: number,
  bookingType: "NORMAL" | "SPECIAL" = "NORMAL",
): Promise<AnswerResponse[]> => {
  try {
    const data = await apiFetch(
      `/users/${userId}/bookings/${bookingId}/answers?type=${bookingType}`
    );
    return Array.isArray(data) ? data : extractArray(data);
  } catch (err: any) {
    console.warn(`⚠️ getAnswersForBooking(user=${userId}, booking=${bookingId}, type=${bookingType}) failed:`, err?.message);
    return [];
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// OFFERS
// Backend controller: OfferController  (/api/offers/*)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/offers/public  ── NO AUTH REQUIRED
 * Returns all active + approved offers for the public home page.
 * Filters out expired offers on the backend (validFrom/validTo window).
 * Permanent offers (no dates set) are always included.
 */
export const getPublicHomeOffers = async (): Promise<any[]> => {
  try {
    const url = `${BASE_URL}/offers/public`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

/**
 * GET /api/offers/checkout?consultantId={id}  ── AUTH REQUIRED
 * Returns valid offers for the checkout screen for the currently logged-in user.
 * - Includes global admin offers + consultant-specific offers.
 * - Filters out offers the user has already redeemed (non-CANCELLED bookings).
 *
 * @param consultantId  Optional — pass the consultant's ID to include their offers.
 */
export const getActiveOffersForCheckout = async (consultantId?: number): Promise<any[]> => {
  try {
    const query = consultantId != null ? `?consultantId=${consultantId}` : "";
    const data = await apiFetch(`/offers/checkout${query}`);
    return Array.isArray(data) ? data : extractArray(data);
  } catch { return []; }
};

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

// ─────────────────────────────────────────────────────────────────────────────
// ESCALATION BLOCK UTILITIES
// Records which consultant escalated which ticket so admin can't reassign same ticket
// ─────────────────────────────────────────────────────────────────────────────

export const ESCALATION_BLOCKS_KEY = "fin_escalation_blocks";

export const recordEscalationBlock = (
  ticketId: number,
  consultantId: number,
  meta?: { consultantName?: string; ticketTitle?: string }
): void => {
  try {
    const prev: any[] = JSON.parse(localStorage.getItem(ESCALATION_BLOCKS_KEY) || "[]");
    const exists = prev.some((b) => b.ticketId === ticketId && b.consultantId === consultantId);
    if (!exists) {
      localStorage.setItem(
        ESCALATION_BLOCKS_KEY,
        JSON.stringify(
          [
            { ticketId, consultantId, timestamp: new Date().toISOString(), ...meta },
            ...prev,
          ].slice(0, 500)
        )
      );
    }
  } catch {
    // storage unavailable
  }
};

export const isConsultantBlockedForTicket = (consultantId: number, ticketId: number): boolean => {
  try {
    const blocks: any[] = JSON.parse(localStorage.getItem(ESCALATION_BLOCKS_KEY) || "[]");
    return blocks.some((b) => b.ticketId === ticketId && b.consultantId === consultantId);
  } catch {
    return false;
  }
};

export const getEscalationBlocks = (): any[] => {
  try {
    return JSON.parse(localStorage.getItem(ESCALATION_BLOCKS_KEY) || "[]");
  } catch {
    return [];
  }
};