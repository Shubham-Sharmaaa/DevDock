import axios from 'axios';

// Kept in module memory, never localStorage/sessionStorage -- this is what
// makes the access token invisible to any XSS payload that might get
// injected via, say, an unsanitized README (defense in depth alongside the
// server-side sanitization).
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true, // send/receive the httpOnly refresh cookie
});

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// If a request fails with 401, attempt exactly one silent refresh (using the
// httpOnly cookie) and retry the original request. If the refresh itself
// fails, give up and let the caller (AuthContext) treat the user as logged out.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const isAuthEndpoint = original?.url?.startsWith('/auth/');

    if (status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        const { data } = await api.post('/auth/refresh');
        setAccessToken(data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        setAccessToken(null);
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
