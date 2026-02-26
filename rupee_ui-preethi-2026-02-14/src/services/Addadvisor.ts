import axios from "axios";

// ⚠️ IMPORTANT: Must match the key used in api.ts → localStorage.setItem("fin_token", token)
const TOKEN_KEY = "fin_token";

const BASE_URL = "http://52.55.178.31:8081/api";

// ── Auth headers ──────────────────────────────────────────────────────────────
const getAuthHeaders = () => {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if (!token) {
    console.warn("⚠️ [Addadvisor] No token found under key:", TOKEN_KEY);
  }
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// ── Create a new consultant (Admin only) ──────────────────────────────────────
export const createAdvisor = async (consultantData: {
  name: string;
  email: string;
  designation: string;
  charges: number;
  shiftTimings: string;
  skills: string[];
}) => {
  console.log("🔐 [createAdvisor] Token key used:", TOKEN_KEY);
  console.log("🔐 [createAdvisor] Token present:", !!localStorage.getItem(TOKEN_KEY));

  const response = await axios.post(
    `${BASE_URL}/consultants`,
    consultantData,
    { headers: getAuthHeaders() }
  );
  return response.data;
}