# 01-Auth — Implementation Prompt: Increment 4

Copy and paste this entire prompt to an AI coding assistant. It is self-contained.

---

You are implementing Increment 4 of the authentication feature for ChessWeb: route protection, logout wiring, and post-auth redirect.

## Current state of the codebase

Increments 1-3 are complete. The following exists and works:

Backend:
- All 5 auth endpoints working: /auth/register, /auth/login, /auth/refresh, /auth/logout, /auth/me

Frontend (from Increment 3):
- `frontend/src/context/AuthContext.tsx` — AuthProvider with user state, login(), logout(), refreshToken()
- `frontend/src/lib/axios.ts` — has request interceptor (attaches token) and response interceptor (retries on 401)
- `frontend/src/pages/LoginPage.tsx` — working login form with toast errors
- `frontend/src/pages/SignupPage.tsx` — working signup form
- `frontend/src/main.tsx` — wraps app in AuthProvider

The App.tsx currently has no protected routes. All routes are accessible without login.

## What you are building in this increment

ProtectedRoute component, route protection for all authenticated pages, logout button, post-auth redirect.

## Files to create/modify

### Create: `frontend/src/components/ProtectedRoute.tsx`

```tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    // Silent refresh in progress — show spinner, don't redirect yet
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!user) {
    // Not logged in — redirect to /login, remember where they were going
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
```

### Modify: `frontend/src/App.tsx`

Set up all routes. Protected routes are nested inside a ProtectedRoute element:

```tsx
import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
// Import all other page components (can be placeholder components for now)
import Dashboard from './pages/Dashboard';
import GamePage from './pages/GamePage';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';
import PuzzlesPage from './pages/PuzzlesPage';
import TournamentsPage from './pages/TournamentsPage';
import AnalysisPage from './pages/AnalysisPage';

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/" element={<LoginPage />} />  {/* Landing → login for now */}

      {/* Protected routes */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/game/:gameId" element={<GamePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/profile/:userId" element={<ProfilePage />} />
        <Route path="/puzzles" element={<PuzzlesPage />} />
        <Route path="/tournaments" element={<TournamentsPage />} />
        <Route path="/analysis/:gameId" element={<AnalysisPage />} />
      </Route>
    </Routes>
  );
}
```

Create placeholder page components for any that don't exist yet:
```tsx
// e.g., frontend/src/pages/Dashboard.tsx
export default function Dashboard() {
  return <div className="p-8 text-2xl">Dashboard — coming soon</div>;
}
```

### Add logout button

Find or create `frontend/src/components/Navbar.tsx`. Add a logout button that:
1. Calls `authContext.logout()` on click
2. After logout completes, navigates to '/login'

```tsx
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="bg-gray-800 text-white px-6 py-4 flex items-center justify-between">
      <span className="font-bold text-lg">ChessWeb</span>
      {user && (
        <div className="flex items-center gap-4">
          <span>{user.username} ({user.rating})</span>
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded text-sm"
          >
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
```

Include Navbar in a layout wrapper used by all protected routes, or add it directly to each protected page for now.

## Verification

1. Open the app without logging in. Navigate to http://localhost:5173/dashboard.
   - Expected: redirected to /login

2. Log in. You should land on /dashboard.
   - Expected: Dashboard page renders with Navbar showing your username

3. Click Log out.
   - Expected: Redirected to /login. Navbar no longer shows username.

4. Navigate to http://localhost:5173/leaderboard without being logged in.
   - Expected: Redirected to /login with state.from = /leaderboard

5. Log in again.
   - Expected: Redirected to /leaderboard (not /dashboard) because that was the originally requested route.

6. Refresh the page while logged in (token is in sessionStorage).
   - Expected: Page stays on /dashboard (or current route), not redirected to /login. May show spinner briefly while silent refresh completes.

Write all files now.
