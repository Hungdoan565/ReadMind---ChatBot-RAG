import axios from 'axios';

// Same-origin in both dev and prod: in dev the Vite `/api` proxy forwards to
// the backend (so requests stay on :5173), and in prod nginx proxies /api/*.
// A relative base URL keeps the httpOnly `readmind_auth` cookie same-origin so
// it can be set and sent. An explicit VITE_API_URL still overrides if provided.
const API_URL = import.meta.env.VITE_API_URL || '';

export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail || error.message || 'An error occurred';
    console.error('[API Error]', message);
    return Promise.reject(new Error(message));
  }
);

export default apiClient;
