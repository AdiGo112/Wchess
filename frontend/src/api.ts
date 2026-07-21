import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

// Same-origin by default: "/api/v1" is served through the Vite proxy (dev) or
// your reverse proxy (prod), so no CORS and no host to configure. Set
// VITE_SERVER_URL to an absolute origin to hit the backend directly instead.
const api = axios.create({
  baseURL: `${import.meta.env.VITE_SERVER_URL || ""}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

type GetToken = () => string | null;
type RefreshToken = () => Promise<string | null>;
type Logout = () => void;

let _getToken: GetToken | null = null;
let _refreshToken: RefreshToken | null = null;
let _logout: Logout | null = null;

export function setupInterceptors(getToken: GetToken, refreshToken: RefreshToken, logout: Logout) {
  _getToken = getToken;
  _refreshToken = refreshToken;
  _logout = logout;
}

interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueuedRequest[] = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach((p) => (error || !token ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

api.interceptors.request.use((config) => {
  const token = _getToken?.();
  if (token) config.headers["Authorization"] = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    if (!original) return Promise.reject(error);

    const skipRetry = ["/auth/refresh", "/auth/login", "/auth/logout"];
    const requestPath = original.url?.split("?")?.[0];
    if (
      error.response?.status !== 401 ||
      original._retry ||
      (requestPath && skipRetry.includes(requestPath))
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
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
