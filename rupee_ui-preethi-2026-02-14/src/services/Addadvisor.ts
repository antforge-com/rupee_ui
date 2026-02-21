import axios from 'axios';

// 1. Create the instance
const api = axios.create({
  baseURL: '/api', // This handles the prefix for all requests
  headers: { 'Content-Type': 'application/json' },
});

const ADVISOR_PATH = '/advisors'; 

export const createAdvisor = async (advisorData: any) => {
  try {
    // 2. Use 'api' instead of 'axios'
    const response = await api.post(ADVISOR_PATH, advisorData);
    return response.data;
  } catch (error: any) {
    console.error("Error creating advisor:", error);
    throw error;
  }
};

export const getAllAdvisors = async () => {
  try {
    const response = await api.get(ADVISOR_PATH);
    return response.data;
  } catch (error: any) {
    console.error("Error fetching advisors:", error);
    throw error;
  }
};

export const getAdvisorById = async (id: number) => {
  try {
    // Now 'api' is defined, so this won't error!
    const response = await api.get(`${ADVISOR_PATH}/${id}`);
    return response.data;
  } catch (error: any) {
    console.error("Error fetching advisor by id:", error);
    throw error;
  }
};

export const updateAdvisor = async (id: number, advisorData: any) => {
  try {
    const response = await api.put(`${ADVISOR_PATH}/${id}`, advisorData);
    return response.data;
  } catch (error: any) {
    console.error("Error updating advisor:", error);
    throw error;
  }
};

export const deleteAdvisor = async (id: number) => {
  try {
    const response = await api.delete(`${ADVISOR_PATH}/${id}`);
    return response.data;
  } catch (error: any) {
    console.error("Error deleting advisor:", error);
    throw error;
  }
};