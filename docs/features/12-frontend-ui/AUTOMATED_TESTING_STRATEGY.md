# Feature 12 — Frontend UI: Automated Testing Strategy

## Testing Stack

| Tool | Purpose |
|---|---|
| **Vitest** | Unit and integration test runner (Vite-native, fast) |
| **React Testing Library (RTL)** | Component rendering and user interaction tests |
| **msw (Mock Service Worker)** | Mock REST API responses in tests without network calls |
| **@testing-library/user-event** | Realistic user interactions (click, type, keyboard) |
| **Playwright** | End-to-end browser tests (desktop + mobile viewports) |
| **zustand-testing** (custom util) | Reset store state between tests |

---

## Test File Locations

```
frontend/
  src/
    stores/
      __tests__/
        authStore.test.ts
        gameStore.test.ts
        matchmakingStore.test.ts
        notificationStore.test.ts
        socialStore.test.ts
        settingsStore.test.ts
    hooks/
      api/
        __tests__/
          useUser.test.ts
          useGames.test.ts
          useLeaderboard.test.ts
          usePuzzles.test.ts
          useTournaments.test.ts
          useSocial.test.ts
    hooks/
      __tests__/
        useSound.test.ts
    components/
      __tests__/
        ChessBoard.test.tsx
        NavBar.test.tsx
        ThemePicker.test.tsx
  e2e/
    dark-mode.spec.ts
    theme-persistence.spec.ts
    keyboard-shortcuts.spec.ts
    mobile-nav.spec.ts
    sound-toggle.spec.ts
```

---

## 1. Zustand Store Unit Tests

### Pattern

Each store test:
1. Imports the store
2. Resets the store to defaults before each test (`store.setState(defaultState)`)
3. Calls actions directly — no React component needed
4. Asserts `store.getState()` after each action

### authStore tests

```typescript
// stores/__tests__/authStore.test.ts
describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: null,
      user: null,
      isAuthenticated: false,
    });
  });

  test('setAuth populates user and token and sets isAuthenticated', () => {
    useAuthStore.getState().setAuth(mockUser, 'token123');
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.accessToken).toBe('token123');
    expect(state.isAuthenticated).toBe(true);
  });

  test('clearAuth resets all fields', () => {
    useAuthStore.getState().setAuth(mockUser, 'token123');
    useAuthStore.getState().clearAuth();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  test('setAccessToken does not change user', () => {
    useAuthStore.getState().setAuth(mockUser, 'old-token');
    useAuthStore.getState().setAccessToken('new-token');
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('new-token');
    expect(state.user).toEqual(mockUser); // user unchanged
  });

  test('accessToken is excluded from persist partialize', () => {
    // Verify persist config excludes accessToken from localStorage
    useAuthStore.getState().setAuth(mockUser, 'secret-token');
    const stored = JSON.parse(localStorage.getItem('chessweb-auth') ?? '{}');
    expect(stored.state?.accessToken).toBeUndefined();
    expect(stored.state?.user).toBeDefined();
  });
});
```

### gameStore tests

Key scenarios:
- `setState` with partial update merges correctly (does not wipe unspecified fields)
- `reset` returns to exact default values including starting FEN
- Multiple rapid `setState` calls (simulating clock ticks) produce correct final state
- `drawOffered` toggles correctly on opponent offer

### settingsStore tests

```typescript
describe('settingsStore', () => {
  test('setBoardTheme updates theme and persists to localStorage', () => {
    useSettingsStore.getState().setBoardTheme('blue');
    expect(useSettingsStore.getState().boardTheme).toBe('blue');
    const stored = JSON.parse(localStorage.getItem('chessweb-settings') ?? '{}');
    expect(stored.state?.boardTheme).toBe('blue');
  });

  test('toggleDarkMode adds .dark class to documentElement', () => {
    useSettingsStore.setState({ darkMode: false });
    useSettingsStore.getState().toggleDarkMode();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  test('toggleDarkMode removes .dark class when turning off', () => {
    document.documentElement.classList.add('dark');
    useSettingsStore.setState({ darkMode: true });
    useSettingsStore.getState().toggleDarkMode();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
```

---

## 2. React Query Hook Tests (with msw)

### msw Setup

```typescript
// src/test/server.ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

export const server = setupServer(
  http.get('/users/me', () => HttpResponse.json(mockUser)),
  http.get('/leaderboard', () => HttpResponse.json(mockLeaderboard)),
  http.get('/puzzles/daily', () => HttpResponse.json(mockPuzzle)),
  http.get('/tournaments', () => HttpResponse.json(mockTournaments)),
  http.get('/social/friends', () => HttpResponse.json(mockFriends)),
);

// vitest.setup.ts
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### Hook test pattern

```typescript
// hooks/api/__tests__/useUser.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { createWrapper } from '@/test/utils'; // wraps in QueryClientProvider

test('useCurrentUser fetches and caches user profile', async () => {
  const { result } = renderHook(() => useCurrentUser(), {
    wrapper: createWrapper(),
  });

  expect(result.current.isLoading).toBe(true);

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(result.current.data).toEqual(mockUser);
});

test('useCurrentUser uses staleTime of 60s', async () => {
  const { result } = renderHook(() => useCurrentUser(), {
    wrapper: createWrapper(),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  // Second render should not trigger new network request
  let requestCount = 0;
  server.use(http.get('/users/me', () => { requestCount++; return HttpResponse.json(mockUser); }));

  // Re-render within staleTime
  const { result: result2 } = renderHook(() => useCurrentUser(), {
    wrapper: createWrapper(),
  });

  await waitFor(() => expect(result2.current.isSuccess).toBe(true));
  expect(requestCount).toBe(0); // served from cache
});
```

### Key hook test scenarios

| Hook | Scenarios to test |
|---|---|
| `useCurrentUser` | Fetches on mount, caches result, returns error on 401 |
| `usePuzzle` | `staleTime: Infinity` means no background refetch |
| `useActiveGame` | `refetchInterval: 5000` fires periodically |
| `useAcceptFriendRequest` | Optimistic update removes item, rollback on error |
| `useLogout` | Calls `queryClient.clear()` on success |

---

## 3. Component Tests

### ChessBoard with theme

```typescript
// components/__tests__/ChessBoard.test.tsx
test('ChessBoard applies correct board colors for green theme', () => {
  useSettingsStore.setState({ boardTheme: 'green' });
  const { container } = render(<ChessBoard />);

  // react-chessboard renders squares with inline styles
  const lightSquare = container.querySelector('[data-square="a1"]');
  expect(lightSquare).toHaveStyle({ backgroundColor: '#eeeed2' });
});
```

### NavBar with auth state

```typescript
test('NavBar shows username when authenticated', () => {
  useAuthStore.setState({ isAuthenticated: true, user: mockUser });
  render(<NavBar />);
  expect(screen.getByText(mockUser.username)).toBeInTheDocument();
});

test('NavBar shows Sign In button when not authenticated', () => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
  render(<NavBar />);
  expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
});
```

### Sound mute toggle

```typescript
test('sound mute button toggles Howler global mute', async () => {
  const mutespy = vi.spyOn(Howler, 'mute');
  render(<SoundToggle />);

  await userEvent.click(screen.getByRole('button', { name: /mute/i }));
  expect(mutespy).toHaveBeenCalledWith(true);

  await userEvent.click(screen.getByRole('button', { name: /unmute/i }));
  expect(mutespy).toHaveBeenCalledWith(false);
});
```

---

## 4. End-to-End Tests (Playwright)

### Setup

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 13'] } },
    { name: 'mobile-android', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```

### e2e/dark-mode.spec.ts

```typescript
test('dark mode persists across page reload', async ({ page }) => {
  await page.goto('/settings');
  await page.click('[data-testid="dark-mode-toggle"]');

  // Verify dark class added
  await expect(page.locator('html')).toHaveClass(/dark/);

  // Reload and verify persistence
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});

test('no flash of light mode on reload when dark mode is enabled', async ({ page }) => {
  // Set dark mode in localStorage before navigating
  await page.addInitScript(() => {
    localStorage.setItem('chessweb-settings', JSON.stringify({
      state: { darkMode: true, boardTheme: 'classic', pieceSet: 'standard', soundMuted: false },
      version: 0
    }));
  });

  await page.goto('/');
  // Check dark class is on html from the very first paint
  const htmlClass = await page.locator('html').getAttribute('class');
  expect(htmlClass).toContain('dark');
});
```

### e2e/theme-persistence.spec.ts

```typescript
test('board theme selection persists to next session', async ({ page }) => {
  await page.goto('/settings');
  await page.click('[data-testid="theme-blue"]');

  await page.reload();
  // Navigate to a game to see board
  await page.goto('/play/demo');

  // Verify blue theme colors are applied
  const lightSquare = page.locator('[data-square="a1"]');
  const style = await lightSquare.getAttribute('style');
  expect(style).toContain('#dee3e6');
});
```

### e2e/keyboard-shortcuts.spec.ts

```typescript
test('ArrowRight advances to next move in analysis', async ({ page }) => {
  await page.goto('/analysis/test-game-id');
  await page.waitForSelector('[data-testid="analysis-board"]');

  const initialFen = await page.getAttribute('[data-testid="analysis-board"]', 'data-fen');

  await page.keyboard.press('ArrowRight');

  const nextFen = await page.getAttribute('[data-testid="analysis-board"]', 'data-fen');
  expect(nextFen).not.toBe(initialFen);
});
```

### e2e/mobile-nav.spec.ts

```typescript
test('hamburger menu opens and closes on mobile', async ({ page }) => {
  // Uses mobile-safari device from playwright.config.ts
  await page.goto('/');

  const drawer = page.locator('[data-testid="mobile-nav-drawer"]');
  await expect(drawer).not.toBeVisible();

  await page.click('[data-testid="hamburger-button"]');
  await expect(drawer).toBeVisible();

  await page.click('[data-testid="nav-overlay"]');
  await expect(drawer).not.toBeVisible();
});
```

---

## 5. Coverage Targets

| Area | Target |
|---|---|
| Zustand store actions | 100% |
| React Query hook happy paths | 90% |
| React Query error paths | 80% |
| Component renders | 70% |
| E2E critical paths (dark mode, theme persist, keyboard, mobile nav) | 100% |

---

## 6. CI Integration

```yaml
# .github/workflows/test.yml (addition)
- name: Run Vitest
  run: cd frontend && npm run test -- --coverage --reporter=verbose

- name: Run Playwright E2E
  run: cd frontend && npx playwright test
  env:
    VITE_API_URL: http://localhost:3000
```

Playwright tests require the backend to be running or msw to intercept all API calls. For CI, the recommended approach is to run Playwright against a built frontend with a full msw handler set.
