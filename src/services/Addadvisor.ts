import axios from "axios";
import { API_BASE_URL } from "../config/api";

// IMPORTANT: Must match the key used in api.ts -> localStorage.setItem("fin_token", token)
const TOKEN_KEY = "fin_token";

const BASE_URL = API_BASE_URL;

const getAuthHeaders = () => {
  const token = localStorage.getItem(TOKEN_KEY) || "";
  if (!token) {
    console.warn("[Addadvisor] No token found under key:", TOKEN_KEY);
  }
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const createAdvisor = async (consultantData: {
  name: string;
  email: string;
  designation: string;
  charges: number;
  shiftTimings: string;
  skills: string[];
}) => {
  console.log("[createAdvisor] Token key used:", TOKEN_KEY);
  console.log("[createAdvisor] Token present:", !!localStorage.getItem(TOKEN_KEY));

  const response = await axios.post(
    `${BASE_URL}/consultants`,
    consultantData,
    { headers: getAuthHeaders() }
  );
  return response.data;
};
