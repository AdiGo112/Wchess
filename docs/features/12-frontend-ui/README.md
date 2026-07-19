# 12-Frontend UI — Overview

## What is this feature?

The complete frontend application for ChessWeb — a React 18 + TypeScript single-page application built with Vite. This feature covers the entire client-side shell: routing, state management, UI component system, real-time socket integration, and feature-scoped page components for all 11 backend features.

## Tech Stack

| Layer | Library | Purpose |
|---|---|---|
| Framework | React 18 | Component model, concurrent rendering |
| Language | TypeScript | Type safety across all layers |
| Build | Vite | Dev server, HMR, production bundling |
| Routing | React Router v6 | Client-side routing with lazy-loaded routes |
| Client state | Zustand | Auth tokens, game state, UI preferences |
| Server state | TanStack Query v5 | API data fetching, caching, mutation |
| Styling | Tailwind CSS | Utility-first CSS with custom chess theme |
| Components | Radix UI | Accessible primitive components |
| Chess board | react-chessboard | Interactive chess board widget |
| Real-time | socket.io-client | WebSocket communication |
| Icons | lucide-react | SVG icon set |
| HTTP client | Axios | REST API client with interceptors |

## Key Architectural Decisions

### State Management Split
- **Zustand** owns ephemeral client state: access token in memory, active game state, UI preferences, matchmaking queue status, notification count.
- **TanStack Query** owns all server-derived state: game history, leaderboard data, puzzle lists, tournament standings, friend lists. React Query caches this data, handles background refetch, and provides optimistic update with rollback.
- No state duplication — if data comes from an API, React Query owns it.

### Real-time Architecture
Socket.io client connects per namespace (e.g., `/game`, `/matchmaking`, `/notifications`). A singleton factory in `src/lib/socket.ts` caches live sockets by namespace so multiple components share one connection.

### Auth Token Strategy
Access token lives in Zustand store in memory — never written to `localStorage` or `sessionStorage` to eliminate XSS token theft. Refresh token is an httpOnly cookie sent by the browser automatically. On app boot, the app calls `GET /auth/me` to validate the cookie and populate the access token. On 401, the Axios interceptor calls `POST /auth/refresh` transparently.

### Code Splitting
Every feature folder exports one lazy-loaded entry component. Vite splits each into its own chunk. Initial bundle contains only the auth shell (~80kb gzipped). The chess game chunk is the heaviest (~120kb including chess.js).

## Custom Chess Theme (Tailwind)

```js
// tailwind.config.js colors extension
chess: {
  'dark-square':  '#769656',   // green-brown dark square
  'light-square': '#eeeed2',   // cream light square
  'app-bg':       '#1a1a2e',   // deep navy app background
  'surface':      '#16213e',   // slightly lighter surface cards
  'surface-2':    '#0f3460',   // elevated surface (modals, dropdowns)
  'accent':       '#e94560',   // red accent for alerts/active states
}
```

## Folder Structure

```
src/
  components/             # Shared UI components used across features
    layout/
      NavBar.tsx          # Top navigation bar
      Sidebar.tsx         # Collapsible sidebar (desktop)
      PageLayout.tsx      # Common page wrapper
    ui/
      Button.tsx          # Radix-based button with chess theme variants
      Modal.tsx           # Radix Dialog wrapper
      Spinner.tsx         # Loading spinner
      Toast.tsx           # Radix Toast notifications
      Badge.tsx           # Notification / count badge
      Avatar.tsx          # User avatar with fallback initials
  features/               # Feature-scoped components and hooks
    auth/                 # Login, register, token refresh
    game/                 # Live game board, clocks, chat integration
    matchmaking/          # Play page, queue UI, computer setup
    puzzles/              # Puzzle list, daily puzzle, streak widget
    tournaments/          # Tournament list, bracket, standings
    social/               # Friends, requests, activity feed
    chat/                 # Chat panel (embedded in game)
    analysis/             # Post-game analysis board and engine lines
    notifications/        # Notification drawer
    leaderboard/          # Standings table
  hooks/                  # Shared hooks (useDebounce, useLocalStorage, etc.)
  stores/                 # Zustand store definitions
    authStore.ts
    gameStore.ts
    matchmakingStore.ts
    notificationStore.ts
    socialStore.ts
  lib/                    # Infrastructure utilities
    api.ts                # Axios instance with interceptors
    socket.ts             # Socket.io singleton factory
    chess.ts              # chess.js helpers (FEN parsing, move formatting)
    queryClient.ts        # TanStack Query client configuration
  pages/                  # Route-level thin wrapper components
  router/                 # React Router config with lazy imports
    index.tsx
    ProtectedRoute.tsx
  types/                  # Shared TypeScript interfaces
    auth.ts
    game.ts
    user.ts
    tournament.ts
    puzzle.ts
```

## Reading Order for This Feature

1. README.md (this file) — goal, stack, folder structure
2. DOMAIN_MODEL.md — TypeScript interfaces for all shared types
3. ARCHITECTURE.md — full architecture: state split, socket integration, auth flow
4. NAVIGATION.md — complete route map with auth requirements
5. WORKFLOWS.md — key UI workflows end to end
6. ADR-0029 through ADR-0031 — key architectural decisions
7. AUTOMATED_TESTING_STRATEGY.md — test plan
8. AUTOMATED_TESTING_PROMPT.md — AI prompt for writing tests
9. IMPLEMENTATION_PROMPT_FRONTEND.md — AI prompt for the frontend shell
10. IMPLEMENTATION_PLAN_INCREMENT_1.md through _6.md — phased build plan
11. IMPLEMENTATION_PROMPT_INCREMENT_1.md through _6.md — AI prompts per increment
