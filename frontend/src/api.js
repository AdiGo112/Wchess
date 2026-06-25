import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3000/api/v1",
  headers: { "Content-Type": "application/json" },
});

let _getToken = null;
let _refreshToken = null;
let _logout = null;

export function setupInterceptors(getToken, refreshToken, logout) {
  _getToken = getToken;
  _refreshToken = refreshToken;
  _logout = logout;
}

let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
}

api.interceptors.request.use((config) => {
  const token = _getToken?.();
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    const skipRetry = ["/auth/refresh", "/auth/login", "/auth/logout"];
    const requestPath = original.url?.split("?")?.[0];
    if (
      error.response?.status !== 401 ||
      original._retry ||
      skipRetry.includes(requestPath)
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers["Authorization"] = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const newToken = await _refreshToken?.();
      if (!newToken) throw new Error("No token from refresh");
      processQueue(null, newToken);
      original.headers["Authorization"] = `Bearer ${newToken}`;
      return api(original);
    } catch (err) {
      processQueue(err, null);
      _logout?.();
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
