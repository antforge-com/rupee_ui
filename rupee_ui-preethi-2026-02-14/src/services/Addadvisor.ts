import axios from "axios";

/* ===============================
   AXIOS INSTANCE
================================ */
const api = axios.create({
  baseURL: "http://52.55.178.31:8081/api",
  headers: {
    "Content-Type": "application/json",
  },
});

/* ===============================
   ATTACH JWT TOKEN AUTOMATICALLY
================================ */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

/* ===============================
   CONSULTANT APIs
================================ */

const CONSULTANT_PATH = "/consultants";

export const createAdvisor = async (advisorData: any) => {
  const response = await api.post(CONSULTANT_PATH, advisorData);
  return response.data;
};

export const getAllAdvisors = async () => {
  const response = await api.get(CONSULTANT_PATH);
  return response.data;
};

export const getAdvisorById = async (id: number) => {
  const response = await api.get(`${CONSULTANT_PATH}/${id}`);
  return response.data;
};

export const updateAdvisor = async (id: number, advisorData: any) => {
  const response = await api.put(`${CONSULTANT_PATH}/${id}`, advisorData);
  return response.data;
};

export const deleteAdvisor = async (id: number) => {
  const response = await api.delete(`${CONSULTANT_PATH}/${id}`);
  return response.data;
};

export default api;