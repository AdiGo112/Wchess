# Feature 12 — Frontend UI: Key Workflows

This document traces the complete sequence of state changes, API calls, socket events, and React re-renders for each major user workflow.

---

## 1. App Boot Sequence (authStore Hydration)

```
Browser loads index.html
  ↓
Inline <script> in <head> reads localStorage('chessweb-settings')
  → If darkMode: true → document.documentElement.classList.add('dark')
  → This runs BEFORE React renders — prevents flash of light mode
  ↓
React bundle loads → ReactDOM.createRoot
  ↓
App.tsx renders:
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>
  ↓
Zustand stores initialize:
  - authStore: rehydrates from localStorage('chessweb-auth')
    → user: { id, username, avatarUrl } (if previously logged in)
    → accessToken: null (never persisted)
    → isAuthenticated: false (always starts false)
  - settingsStore: rehydrates from localStorage('chessweb-settings')
    → boardTheme, pieceSet, soundMuted, darkMode
  ↓
AuthProvider mounts → fires GET /auth/me
  → Browser automatically sends httpOnly refresh cookie
  ↓
  [Case A: Cookie valid]
    ← 200 { user: AuthUser, accessToken: string }
    → authStore.setAuth(user, accessToken)
      → isAuthenticated = true
      → user = { id, username, email, avatarUrl, rating }
      → accessToken = "Bearer ..."
    → React Router re-renders → shows protected route content
    → NavBar shows username/avatar (was already pre-rendered from localStorage cache)

  [Case B: Cookie missing or expired]
    ← 401
    → authStore remains empty (isAuthenticated = false)
    → React Router ProtectedRoute redirects to /login
    → NavBar shows "Sign In" button
```

**Key insight**: NavBar shows the username/avatar immediately from localStorage cache (pre-hydration), then GET /auth/me confirms the session is still valid. There is no visual pop-in for returning users.

---

## 2. Login Flow

```
User visits /login
  ↓
LoginPage renders LoginForm
  ↓
User submits credentials
  ↓
useLogin mutation fires: POST /auth/login { email, password }
  ↓
  [Success]
    ← 200 { user: AuthUser, accessToken: string }
    Server sets httpOnly refresh cookie (Set-Cookie header)
    → authStore.setAuth(user, accessToken)
    → isAuthenticated = true
    → React Router reads location.state.from (if redirected from protected route)
    → navigate(from ?? '/')
  ↓
  [Failure 401]
    ← 401 { message: 'Invalid credentials' }
    → LoginForm shows error toast: "Invalid email or password"
    → authStore unchanged
```

---

## 3. Token Refresh Flow (Transparent)

```
Component fires API request (any endpoint)
  ↓
Axios request interceptor attaches: Authorization: Bearer {accessToken}
  ↓
Server responds 401 (access token expired)
  ↓
Axios response interceptor catches 401:
  isRefreshing = false? → Set isRefreshing = true
  ↓
  POST /auth/refresh
    Browser sends httpOnly refresh cookie automatically
  ↓
  [Success]
    ← 200 { accessToken: string }
    → authStore.setAccessToken(newAccessToken)
    → Drain failedQueue: retry all queued requests with new token
    → Retry original failed request
    → isRefreshing = false
  ↓
  [Failure — refresh cookie expired]
    → authStore.clearAuth()
    → queryClient.clear()
    → window.location.href = '/login'
```

**Concurrent 401s**: If three API calls fire simultaneously and all get 401, the first triggers refresh and the other two are queued in `failedQueue`. All three retry automatically once refresh completes.

---

## 4. Logout Flow

```
User clicks "Sign Out" in NavBar dropdown
  ↓
useLogout mutation fires: POST /auth/logout
  ↓
Server clears httpOnly refresh cookie
  ↓
mutation.onSuccess:
  → authStore.clearAuth()
    → accessToken = null
    → user = null
    → isAuthenticated = false
    → localStorage('chessweb-auth') cleared
  → queryClient.clear()
    → All cached server data wiped (prevents data leak if shared computer)
  → disconnect all sockets:
    → disconnectSocket('/game')
    → disconnectSocket('/matchmaking')
    → disconnectSocket('/notifications')
    → disconnectSocket('/social')
  → navigate('/login')
```

---

## 5. Theme Switching Workflow

```
User opens Settings page (or Settings modal)
  ↓
ThemePicker component renders 5 theme swatches
  ↓
User clicks "green" theme swatch
  ↓
settingsStore.setBoardTheme('green')
  → Zustand persists to localStorage('chessweb-settings')
  ↓
Any mounted ChessBoard component:
  const { boardTheme } = useSettingsStore();
  const colors = BOARD_THEME_COLORS[boardTheme];
  → Re-renders with new customLightSquareStyle / customDarkSquareStyle
  ↓
User sees board color change instantly (no page reload)
  ↓
toast.success('Theme saved') — react-hot-toast
```

**Note**: Theme change is synchronous and local — no API call, no server state.

---

## 6. Sound Toggle Workflow

```
User clicks mute icon in game header (or settings)
  ↓
settingsStore.setSoundMuted(!soundMuted)
  → soundMuted flips: false → true
  → Zustand persists to localStorage('chessweb-settings')
  ↓
useSound hook subscriber (in GamePage):
  const soundMuted = useSettingsStore(s => s.soundMuted);
  useEffect(() => {
    Howler.mute(soundMuted);
  }, [soundMuted]);
  ↓
All Howler.js instances globally muted
  ↓
On next move: socket event fires → sound.play('move') → silent (muted)
```

**Boot case**: On app load, `useSound` hook reads `soundMuted` from rehydrated settingsStore and calls `Howler.mute(true)` if needed — so mute persists across page refreshes without any audio playing.

---

## 7. Mobile Nav Open/Close Workflow

```
[Open]
User taps hamburger icon (≡) in NavBar
  ↓
MobileNavMenu state: isOpen = false → true
  ↓
Overlay div fades in (opacity 0 → 1, transition 200ms)
Drawer slides in from left (translateX(-100%) → translateX(0), transition 250ms)
  ↓
document.body.style.overflow = 'hidden' — prevents background scroll
focus is moved to the first nav item (keyboard/a11y)
  ↓

[Close — three triggers]
Trigger A: User taps close button (×)
Trigger B: User taps overlay backdrop
Trigger C: User navigates to a route (useEffect watching location)

  ↓ (any trigger)
isOpen = false
Drawer slides out (translateX(0) → translateX(-100%))
Overlay fades out
  ↓
After transition ends (250ms):
  document.body.style.overflow = '' — restore scroll
  focus returns to hamburger button (keyboard/a11y)
```

---

## 8. Analysis Keyboard Navigation

Available on the `AnalysisPage` when reviewing a completed game:

```
User opens /analysis/:gameId
  ↓
AnalysisPage mounts
  useEffect → window.addEventListener('keydown', handleKeyDown)
  ↓
Key: ArrowRight → nextMove()
  → currentMoveIndex += 1 (capped at moves.length - 1)
  → gameStore.setState({ fen: moves[currentMoveIndex].fen })
  → ChessBoard re-renders with new position

Key: ArrowLeft → prevMove()
  → currentMoveIndex -= 1 (capped at 0)
  → gameStore.setState({ fen: moves[currentMoveIndex].fen })

Key: Home → firstMove()
  → currentMoveIndex = 0
  → gameStore.setState({ fen: startingFen })

Key: End → lastMove()
  → currentMoveIndex = moves.length - 1
  → gameStore.setState({ fen: moves[moves.length - 1].fen })

Key: Escape → close modal / deselect piece
  → If modal open: close modal
  → Else: clear selected piece highlight
  ↓
Cleanup: window.removeEventListener('keydown', handleKeyDown) on unmount
```

---

## 9. Matchmaking Queue Workflow

```
User clicks "Play" → navigated to /play
  ↓
PlayPage mounts → connects to /matchmaking socket
  ↓
User selects time control (e.g., 5+3 blitz) + clicks "Find Game"
  ↓
matchmakingStore.startSearch('blitz', { minutes: 5, increment: 3 })
  → status = 'searching'
  → queuedAt = Date.now()
  ↓
socket.emit('join_queue', { variant: 'blitz', timeControl: { minutes: 5, increment: 3 } })
  ↓
PlayPage shows queue timer: elapsed = Date.now() - queuedAt (updates every second)
  ↓
[When match found]
Socket event: match_found { gameId, opponentId, color }
  ↓
matchmakingStore.matchFound(gameId)
  → status = 'found'
  → matchedGameId = gameId
  ↓
toast.success('Match found! Starting game...')
  ↓
navigate(`/game/${gameId}`)
  ↓
matchmakingStore.reset() called in PlayPage cleanup
```

---

## 10. Dark Mode Initialization (Flash Prevention)

This workflow happens before React loads — it is a pure JavaScript snippet in `index.html`:

```html
<!-- index.html — inside <head>, before any stylesheets -->
<script>
  (function() {
    try {
      var settings = JSON.parse(localStorage.getItem('chessweb-settings') || '{}');
      if (settings && settings.state && settings.state.darkMode === true) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
</script>
```

This ensures that if the user has dark mode enabled:
1. The `dark` class is on `<html>` before any CSS or JS loads
2. Tailwind's `dark:` variants apply from the first paint
3. No white flash before React hydrates and reads the store

When `settingsStore.toggleDarkMode()` is called at runtime:
```typescript
toggleDarkMode: () => set((state) => {
  const newValue = !state.darkMode;
  if (newValue) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  return { darkMode: newValue };
}),
```
