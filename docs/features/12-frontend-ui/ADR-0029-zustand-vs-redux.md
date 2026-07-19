# ADR-0029 — Zustand over Redux for Client State

## Status
Accepted

## Context

ChessWeb needs client-side state management for four distinct concerns:

1. **Auth tokens** — access token in memory, user identity cached for NavBar pre-render
2. **Live game state** — FEN, clocks, turn, draw offers updated from WebSocket events at 60+ events/min during an active game
3. **UI preferences** — board theme, piece set, sound mute — must persist across page refreshes
4. **Ephemeral UI state** — matchmaking queue status, notification unread count, friend presence

We evaluated three options: **Redux Toolkit**, **Zustand**, and **Jotai**.

### Redux Toolkit

Redux Toolkit eliminates most Redux boilerplate and is the industry standard for large teams. It enforces strict action-reducer patterns, DevTools integration is excellent, and it handles complex side effects through RTK Query or redux-thunk.

**Problems for ChessWeb**:
- Slice + action + selector boilerplate for simple socket-driven state (e.g., updating `clocks` every second during a game) adds friction with no benefit
- RTK Query would conflict with TanStack Query (we already decided server state lives in TanStack Query — ADR-0030). Using both RTK Query and TanStack Query violates the "no duplication" rule
- Bundle weight: Redux + Toolkit + DevTools support adds ~13kb gzipped to the initial bundle. Our target is ~80kb gzipped for the auth shell

### Jotai

Jotai's atom model is elegant for fine-grained reactivity. Individual atoms only re-render subscribers, which is excellent for clock components that tick every second.

**Problems for ChessWeb**:
- Atom dependency graphs become hard to trace as the feature set grows; there is no central store to inspect in DevTools
- `atomFamily` for per-game atoms requires careful cleanup to avoid memory leaks when navigating away from a game
- No built-in `persist` middleware for localStorage — requires custom implementation

### Zustand

Zustand provides a single `create<State>()` call per store. The store is both a hook and a vanilla JS object (`store.getState()`, `store.setState()`). This dual API is critical for ChessWeb because:

- Axios interceptors (not React components) need to read `authStore.getState().accessToken`
- Socket event handlers (running outside React) need to call `gameStore.getState().setState(...)`
- `persist` middleware serializes to localStorage with a single option
- Zero boilerplate: state update = `set({ field: newValue })`
- Bundle size: 1.1kb gzipped

## Decision

Use **Zustand 4** for all client state. Each domain gets one store file in `frontend/src/stores/`:

| Store file | Domain |
|---|---|
| `authStore.ts` | Access token, user identity, `isAuthenticated` flag |
| `gameStore.ts` | Live game state updated via `/game` socket namespace |
| `matchmakingStore.ts` | Queue status, time control, variant |
| `notificationStore.ts` | Unread count, recent 20 notifications |
| `socialStore.ts` | Friend presence map, pending request count |
| `settingsStore.ts` | Board theme, piece set, sound mute — persisted to localStorage |

**Persist middleware** is used only for `authStore` (username + avatar for NavBar pre-render) and `settingsStore` (user preferences). The `accessToken` field is explicitly excluded from `authStore` persist.

**TanStack Query owns all server-derived state** (see ADR-0030). Zustand stores must not duplicate data that React Query caches.

## Consequences

**Positive**:
- Axios interceptors and socket handlers call `store.getState()` directly without hooks — no workarounds needed
- `persist` middleware handles localStorage serialization/deserialization automatically
- Clock tick updates (`gameStore.setState({ clocks })`) at 60fps do not trigger React re-renders in components that don't subscribe to `clocks`
- Tiny bundle footprint (1.1kb gzipped)
- No Provider needed at root — stores are singletons

**Negative**:
- No built-in Redux DevTools integration (Zustand has a DevTools middleware but it's less mature)
- Store slices are not enforced — developers must follow the established pattern manually
- No middleware ecosystem as large as Redux's
- Computed selectors (derived state) must be written manually or use Zustand's `subscribeWithSelector` middleware; there is no `createSelector` equivalent built in
