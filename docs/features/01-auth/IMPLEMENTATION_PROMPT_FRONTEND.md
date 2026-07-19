# 01-Auth — Frontend Implementation Prompt

Copy and paste the following prompt to an AI coding assistant to implement the React auth frontend.

---

You are implementing the authentication frontend for ChessWeb, a React 18 + TypeScript application using Vite, React Router v6, Zustand, and axios.

## What already exists
- `frontend/src/main.tsx` — React root with BrowserRouter
- `frontend/src/App.tsx` — root App component with route definitions
- `frontend/src/lib/axios.ts` — base axios instance (baseURL from VITE_API_URL env var)
- Tailwind CSS is configured

## Task: Implement the complete auth frontend

### Step 1: AuthContext

Create `frontend/src/context/AuthContext.tsx`:

```typescript
interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
}
```

Implementation details:
- Store accessToken in a ref (not state) to avoid re-renders on every request
- Store user in state so components re-render on login/logout
- On mount, attempt a silent refresh to restore session (call POST /auth/refresh with stored refreshToken)
- Store refreshToken in sessionStorage (compromise between security and usability for v1; not localStorage)
- Export useAuth() hook that calls useContext(AuthContext) and throws if used outside provider

### Step 2: Axios interceptor

Update `frontend/src/lib/axios.ts`:
- Request interceptor: attach Authorization: Bearer <accessToken> from AuthContext if present
- Response interceptor: on 401, call refreshToken(), retry original request with new token
- Use a queue to prevent concurrent refresh calls (if refresh in progress, queue the request)

### Step 3: LoginPage

Create `frontend/src/pages/LoginPage.tsx`:
- Form fields: email, password
- Client validation: email format, password non-empty
- On submit: call authContext.login(email, password)
- On success: navigate to /dashboard (or location.state.from if present — for post-auth redirect)
- On 401: show error toast "Invalid email or password"
- On network error: show error toast "Could not connect to server"
- Link to /signup

### Step 4: SignupPage

Create `frontend/src/pages/SignupPage.tsx`:
- Form fields: username, email, password, confirmPassword
- Client validation: username 3-20 chars alphanumeric/underscore, valid email, password >= 8 chars, passwords match
- On submit: call authContext.register(username, email, password)
- On success: show success toast "Account created! Please log in." and navigate to /login
- On 409 EMAIL_ALREADY_EXISTS: show "This email is already registered"
- On 409 USERNAME_ALREADY_EXISTS: show "This username is taken"
- Link to /login

### Step 5: ProtectedRoute

Create `frontend/src/components/ProtectedRoute.tsx`:
- Wraps a route. If AuthContext.user is null AND isLoading is false, redirect to /login with location state { from: location }.
- If isLoading is true, show a fullscreen spinner.
- If user is present, render children (or Outlet for nested routes).

### Step 6: Routing

Update `frontend/src/App.tsx`:
- Wrap routes that require auth in ProtectedRoute.
- Public routes: /login, /signup, / (landing page)
- Protected routes: /dashboard, /game/:gameId, /leaderboard, /profile/:userId, /puzzles, /tournaments, /analysis/:gameId

### Step 7: Type definitions

Create `frontend/src/types/auth.types.ts`:
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
```
