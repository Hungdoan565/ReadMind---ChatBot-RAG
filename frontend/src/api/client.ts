import axios from 'axios';

// In production, nginx proxies /api/* to the backend
// In development, use VITE_API_URL or localhost
const API_URL = import.meta.env.DEV 
  ? (import.meta.env.VITE_API_URL || 'http://localhost:8000')
  : '';  // Empty = same origin, nginx handles proxy

export const apiClient = axios.create({
  baseURL: API_URL,
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
