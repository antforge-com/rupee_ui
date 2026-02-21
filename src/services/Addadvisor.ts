import axios from 'axios';

// ✅ CORRECT: Use relative path so the request goes through the Vite Proxy
const API_URL = '/api/advisors'; 

export const createAdvisor = async (advisorData: any) => {
  try {
    const response = await axios.post(API_URL, advisorData, {
      headers: { 'Content-Type': 'application/json' },
    });
    return response.data;
  } catch (error: any) {
    console.error("Error creating advisor:", error);
    throw error;
  }
};

export const getAllAdvisors = async () => {
  try {
    const response = await axios.get(API_URL);
    return response.data;
  } catch (error: any) {
    console.error("Error fetching advisors:", error);
    throw error;
  }
};

export const getAdvisorById = async (id: number) => {
  try {
    const response = await api.get(`${API_URL}/${id}`);
    return response.data;
  } catch (error: any) {
    console.error("Error fetching advisor by id:", error);
    throw error;
  }
};

export const updateAdvisor = async (id: number, advisorData: any) => {
  try {
    const response = await api.put(`${API_URL}/${id}`, advisorData);
    return response.data;
  } catch (error: any) {
    console.error("Error updating advisor:", error);
    throw error;
  }
};

export const deleteAdvisor = async (id: number) => {
  try {
    const response = await api.delete(`${API_URL}/${id}`);
    return response.data;
  } catch (error: any) {
    console.error("Error deleting advisor:", error);
    throw error;
  }
};