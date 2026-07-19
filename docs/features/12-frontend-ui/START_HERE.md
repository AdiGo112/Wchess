# Feature 12 — Frontend UI: Start Here

## What This Feature Does

Feature 12 is the polish layer on top of the existing React + NestJS foundation. It does not add new backend routes or change the API contract. Instead, it completes the frontend experience for 11M+ users across five areas:

1. **Zustand stores** — Centralized client state for auth, live game, matchmaking, notifications, social presence, and user settings. These are the single source of truth for fast-moving data that WebSocket events update directly.

2. **React Query hooks** — A typed hook library over every REST API endpoint. Each hook encodes the correct `staleTime`, `refetchInterval`, cache key, and invalidation strategy so components never need to think about caching.

3. **Sound effects** — Five game event sounds (move, capture, check, game-end, illegal) wired through Howler.js with a global mute toggle persisted to localStorage.

4. **Board themes + piece sets** — Five visual board themes and four piece sets, switchable in real time with the selection stored in Zustand's `settingsStore` (persisted to localStorage key `chessweb-settings`).

5. **Dark mode, skeleton loaders, toast notifications, error boundaries, mobile layout, keyboard shortcuts, and accessibility** — The complete UI quality layer.

## Five Things to Know Before Coding

### 1. State ownership is strictly divided

**Zustand** owns state with no canonical server representation: access token (in memory, never persisted), live game FEN/clocks/turn (updated from WebSocket at ~1 event/second), UI preferences (persisted to localStorage).

**TanStack Query** owns all state that comes from the REST API: user profiles, game history, leaderboard, puzzles, tournaments, friends list. If you find yourself wanting to store API response data in a Zustand store, stop — put it in a React Query hook instead.

Violating this split causes stale data bugs: the Query cache holds the fresh version but the Zustand store holds a stale copy, and components disagree about what to show.

### 2. The access token never touches localStorage

`authStore.accessToken` is in-memory only. It is cleared on every page refresh (intentional). On boot, `GET /auth/me` re-populates it via the httpOnly refresh cookie. This is why `persist` in `authStore` explicitly excludes `accessToken` from its partialize function.

### 3. Zustand stores are singletons — usable outside React

`useAuthStore.getState().accessToken` works in Axios interceptors, socket factory functions, and any non-component file. This is one of the core reasons Zustand was chosen over Redux for this project (ADR-0029).

### 4. Sound requires a user gesture before the first play

Howler.js handles browser autoplay policy, but the first sound can only be played after a user interaction (click, tap, keypress). Never call `sound.play()` in a `useEffect` that runs on mount with no user trigger. The game board's piece-drag start is the natural first gesture, so in practice this is not a problem — but be aware of it when writing tests.

### 5. Board themes work via CSS custom properties on the react-chessboard container

`react-chessboard` accepts `customDarkSquareStyle` and `customLightSquareStyle` props (CSS-in-JS objects). The theme switcher updates `settingsStore.boardTheme`, and the `ChessBoard` component reads the store and passes the correct color values to these props. There is no global CSS variable — it is prop-driven per instance.

## Reading Order

Read these documents in order before coding. Each one builds on the previous.

| Order | File | What it covers |
|---|---|---|
| 1 | `README.md` | Goal, tech stack, folder structure |
| 2 | `DOMAIN_MODEL.md` | All Zustand store shapes, theme enums, sound events, localStorage keys |
| 3 | `ARCHITECTURE.md` | State split rules, socket integration, auth flow, Axios interceptors, code splitting |
| 4 | `API_DESIGN.md` | React Query hook signatures, cache keys, staleTime, invalidation |
| 5 | `WORKFLOWS.md` | Boot sequence, theme switch, sound toggle, mobile nav, keyboard shortcuts |
| 6 | `ADR-0029-zustand-vs-redux.md` | Why Zustand, not Redux |
| 7 | `ADR-0030-tanstack-query-server-state.md` | Why TanStack Query owns server state |
| 8 | `ADR-0031-howler-vs-web-audio.md` | Why Howler.js for sounds |
| 9 | `AUTOMATED_TESTING_STRATEGY.md` | Test plan: Vitest, RTL, Playwright, msw |
| 10 | `AUTOMATED_TESTING_PROMPT.md` | AI prompt for generating tests |
| 11 | `DELIVERY_NOTES.md` | Assets, CSS vars, localStorage keys, rollback plan |
| 12 | `IMPLEMENTATION_PLAN_INCREMENT_1.md` | Zustand stores — scope, files, acceptance criteria |
| 13 | `IMPLEMENTATION_PLAN_INCREMENT_2.md` | React Query hooks |
| 14 | `IMPLEMENTATION_PLAN_INCREMENT_3.md` | Sound effects |
| 15 | `IMPLEMENTATION_PLAN_INCREMENT_4.md` | Board themes + piece sets |
| 16 | `IMPLEMENTATION_PLAN_INCREMENT_5.md` | Dark mode + UI polish |
| 17 | `IMPLEMENTATION_PLAN_INCREMENT_6.md` | Mobile layout + accessibility |
| 18 | `IMPLEMENTATION_PROMPT_FRONTEND.md` | Single AI prompt covering all 6 increments |
| 19–24 | `IMPLEMENTATION_PROMPT_INCREMENT_1.md` through `_6.md` | Per-increment AI prompts with complete code |

## Quick Reference: Key Locations

| What | Where |
|---|---|
| Zustand stores | `frontend/src/stores/` |
| React Query hooks | `frontend/src/hooks/api/` |
| Sound hook | `frontend/src/hooks/useSound.ts` |
| Settings store (theme/sound) | `frontend/src/stores/settingsStore.ts` |
| QueryClient config | `frontend/src/lib/queryClient.ts` |
| Sound assets | `frontend/public/sounds/` |
| Piece set SVGs | `frontend/public/pieces/{set}/` |
| Tailwind config | `frontend/tailwind.config.js` |
| localStorage key for settings | `chessweb-settings` |
| localStorage key for auth cache | `chessweb-auth` |
