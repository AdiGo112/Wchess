# 01-Auth — Implementation Prompt: Increment 3

Copy and paste this entire prompt to an AI coding assistant. It is self-contained.

---

You are implementing Increment 3 of the authentication feature for ChessWeb: the React frontend auth system.

## Current state of the codebase

Backend increments 1 and 2 are complete. These API endpoints exist and work:
- POST /auth/register → 201 { user }
- POST /auth/login → 200 { accessToken, refreshToken, user }
- POST /auth/refresh → 200 { accessToken, refreshToken }
- POST /auth/logout → 204
- GET /auth/me → 200 { user }

Frontend existing structure:
- `frontend/src/main.tsx` — React 18 root, wraps app in BrowserRouter
- `frontend/src/App.tsx` — currently empty routes
- `frontend/src/lib/axios.ts` — axios instance with baseURL = import.meta.env.VITE_API_URL
- Tailwind CSS configured
- React Router v6 installed
- react-hot-toast installed for notifications

## What you are building in this increment

AuthContext, axios interceptors, LoginPage, SignupPage. Do NOT implement ProtectedRoute yet (that is Increment 4).

## Files to create/modify

### Create: `frontend/src/types/auth.types.ts`

```typescript
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  rating: number;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface ApiError {
  statusCode: number;
  message: string;
  code: string;
}
```

### Create: `frontend/src/context/AuthContext.tsx`

Implement AuthContext with:
- State: `user: UserProfile | null`, `isLoading: boolean`
- Ref: `accessTokenRef = useRef<string | null>(null)` — store access token in ref, not state, to avoid re-renders
- sessionStorage key: `'chessweb_refresh_token'` for refresh token persistence
- On mount (useEffect): if sessionStorage has refresh token, call POST /auth/refresh to restore session. Set isLoading = true during this, isLoading = false when done (whether success or failure).
- login(email, password): POST /auth/login, store tokens, set user state
- register(username, email, password): POST /auth/register, does NOT log in automatically
- logout(): POST /auth/logout (with access token in header), clear all tokens, set user = null
- refreshToken(): POST /auth/refresh, update stored tokens, return new accessToken (or null on failure)
- Export AuthProvider component and useAuth() hook

### Modify: `frontend/src/lib/axios.ts`

Add interceptors. The tricky part is the concurrent refresh problem — use a queue pattern:

```typescript
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

// Request interceptor: attach token
axiosInstance.interceptors.request.use((config) => {
  const token = getAccessToken(); // function that reads from AuthContext ref
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: retry on 401
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers['Authorization'] = `Bearer ${token}`;
          return axiosInstance(originalRequest);
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const newToken = await refreshTokenFn(); // from AuthContext
        processQueue(null, newToken);
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        return axiosInstance(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Trigger logout
        logoutFn();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
```

To avoid circular dependency between AuthContext and axios, use a module-level setter:
```typescript
// In axios.ts
let _getToken: (() => string | null) | null = null;
let _refreshToken: (() => Promise<string | null>) | null = null;
let _logout: (() => void) | null = null;
export function setupInterceptors(getToken, refreshToken, logout) {
  _getToken = getToken;
  _refreshToken = refreshToken;
  _logout = logout;
}
```
Call setupInterceptors() inside AuthProvider's useEffect.

### Create: `frontend/src/pages/LoginPage.tsx`

Form with email and password fields. Use react-hook-form for validation.

Validation rules:
- email: required, valid email format
- password: required

On submit:
- Call authContext.login(email, password)
- On success: navigate to location.state?.from?.pathname || '/dashboard'
- On AxiosError with status 401: toast.error('Invalid email or password')
- On AxiosError with status 0 or network error: toast.error('Could not connect to server')

Include a link: "Don't have an account? Sign up" → /signup

Style with Tailwind. Center the form on the page. Use a card-style container.

### Create: `frontend/src/pages/SignupPage.tsx`

Form with username, email, password, confirmPassword fields.

Validation rules:
- username: required, 3-20 chars, matches /^[a-zA-Z0-9_]+$/
- email: required, valid email
- password: required, >= 8 chars
- confirmPassword: must match password (use watch('password') with react-hook-form)

On submit:
- Call authContext.register(username, email, password)
- On success: toast.success('Account created! Please log in.'), navigate('/login')
- On 409 with code EMAIL_ALREADY_EXISTS: setError('email', { message: 'This email is already registered' })
- On 409 with code USERNAME_ALREADY_EXISTS: setError('username', { message: 'This username is already taken' })

Include a link: "Already have an account? Log in" → /login

### Modify: `frontend/src/main.tsx`

Wrap the app with AuthProvider:
```tsx
<BrowserRouter>
  <AuthProvider>
    <App />
  </AuthProvider>
</BrowserRouter>
```

## Verification

1. Start the backend: `cd backend && npm run start:dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Navigate to http://localhost:5173/signup — register a new account
4. You should see "Account created! Please log in." toast and be redirected to /login
5. Log in with the new account — you should see the dashboard (or a blank page if not implemented yet)
6. Open Network tab in DevTools — verify that requests to /api/* include Authorization: Bearer <token>
7. Open Application tab — verify there is NO auth token in localStorage; sessionStorage has 'chessweb_refresh_token'
