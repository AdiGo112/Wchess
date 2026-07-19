# Feature 12 — Frontend UI: Domain Model

This document is the canonical reference for all state shapes, enums, and constants owned by Feature 12. Zustand stores, TypeScript interfaces, localStorage keys, and persistence rules all live here.

---

## 1. Zustand Store Shapes

### authStore (`frontend/src/stores/authStore.ts`)

```typescript
interface AuthUser {
  id: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  rating: number;
}

interface AuthState {
  // Runtime (not persisted — cleared on page refresh)
  accessToken: string | null;
  isAuthenticated: boolean;

  // Identity (persisted to localStorage — key: 'chessweb-auth')
  // Used to pre-render NavBar before GET /auth/me resolves
  user: AuthUser | null;

  // Actions
  setAuth: (user: AuthUser, token: string) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
}
```

**Persistence rule**: `persist` middleware with `partialize` that excludes `accessToken` and `isAuthenticated`. Only `user` is written to localStorage. On rehydration, `isAuthenticated` starts as `false`; it is set to `true` only when `GET /auth/me` returns 200.

**localStorage key**: `chessweb-auth`

---

### gameStore (`frontend/src/stores/gameStore.ts`)

```typescript
type GameStatus = 'idle' | 'active' | 'ended';
type PlayerColor = 'white' | 'black';

interface Clocks {
  white: number; // milliseconds remaining
  black: number; // milliseconds remaining
}

interface GameState {
  gameId: string | null;
  fen: string;                    // current board position in FEN notation
  turn: PlayerColor;
  clocks: Clocks;
  status: GameStatus;
  myColor: PlayerColor | null;    // null when spectating
  moves: string[];                // SAN notation array e.g. ['e4', 'e5', 'Nf3']
  drawOffered: boolean;           // opponent has offered a draw
  opponentId: string | null;

  // Derived (not stored — computed from fen by chess.js)
  // isInCheck, legalMoves — computed in ChessBoard component

  // Actions
  setState: (partial: Partial<GameState>) => void;
  reset: () => void;
}
```

**Persistence**: None — ephemeral. Populated entirely from `/game` socket events.

**Default values**:
```typescript
{
  gameId: null,
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', // starting position
  turn: 'white',
  clocks: { white: 600_000, black: 600_000 }, // 10 min default, overwritten on join
  status: 'idle',
  myColor: null,
  moves: [],
  drawOffered: false,
  opponentId: null,
}
```

---

### matchmakingStore (`frontend/src/stores/matchmakingStore.ts`)

```typescript
type MatchmakingStatus = 'idle' | 'searching' | 'found';
type TimeControlVariant = 'bullet' | 'blitz' | 'rapid' | 'classical';

interface TimeControl {
  minutes: number;
  increment: number; // seconds
}

interface MatchmakingState {
  status: MatchmakingStatus;
  queuedAt: number | null;       // Date.now() timestamp when search started
  variant: TimeControlVariant;
  timeControl: TimeControl;
  matchedGameId: string | null;  // set when status = 'found'

  // Actions
  startSearch: (variant: TimeControlVariant, timeControl: TimeControl) => void;
  matchFound: (gameId: string) => void;
  reset: () => void;
}
```

**Persistence**: None — ephemeral.

---

### notificationStore (`frontend/src/stores/notificationStore.ts`)

```typescript
type NotificationType =
  | 'friend_request'
  | 'friend_accepted'
  | 'game_invite'
  | 'tournament_start'
  | 'game_result';

interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  read: boolean;
  createdAt: string;             // ISO 8601
  metadata: Record<string, unknown>; // e.g. { gameId, tournamentId }
}

interface NotificationState {
  unreadCount: number;
  notifications: Notification[]; // most recent 20

  // Actions
  addNotification: (notification: Notification) => void;
  markRead: (notificationId: string) => void;
  markAllRead: () => void;
  setUnreadCount: (count: number) => void;
}
```

**Persistence**: None — repopulated from `/notifications` socket and `GET /notifications` on drawer open.

---

### socialStore (`frontend/src/stores/socialStore.ts`)

```typescript
interface SocialState {
  // Presence map: userId → online status
  // Updated from /social socket events (friend_online, friend_offline)
  friendPresence: Record<string, boolean>;
  pendingRequestCount: number;

  // Actions
  setFriendOnline: (userId: string) => void;
  setFriendOffline: (userId: string) => void;
  setPendingRequestCount: (count: number) => void;
}
```

**Persistence**: None — presence is real-time from socket.

---

### settingsStore (`frontend/src/stores/settingsStore.ts`)

```typescript
type BoardTheme = 'classic' | 'green' | 'brown' | 'blue' | 'tournament';
type PieceSet = 'standard' | 'neo' | 'cburnett' | 'alpha';

interface BoardThemeColors {
  light: string; // hex color
  dark: string;  // hex color
}

interface SettingsState {
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  soundMuted: boolean;
  darkMode: boolean;

  // Actions
  setBoardTheme: (theme: BoardTheme) => void;
  setPieceSet: (set: PieceSet) => void;
  setSoundMuted: (muted: boolean) => void;
  toggleDarkMode: () => void;
}
```

**Persistence**: Full persist — all fields written to localStorage.

**localStorage key**: `chessweb-settings`

---

## 2. Board Theme Color Values

```typescript
export const BOARD_THEME_COLORS: Record<BoardTheme, BoardThemeColors> = {
  classic:    { light: '#f0d9b5', dark: '#b58863' },
  green:      { light: '#eeeed2', dark: '#769656' }, // Lichess green
  brown:      { light: '#f0d9b5', dark: '#b58863' },
  blue:       { light: '#dee3e6', dark: '#8ca2ad' },
  tournament: { light: '#ffffff', dark: '#4a4a4a' },
};
```

These values are passed as `customLightSquareStyle={{ backgroundColor: colors.light }}` and `customDarkSquareStyle={{ backgroundColor: colors.dark }}` to `react-chessboard`.

---

## 3. Piece Set Configuration

```typescript
export const PIECE_SET_BASE_PATH = '/pieces'; // served from /public/pieces/

// Piece set directory names
// /public/pieces/standard/{wP,wN,wB,wR,wQ,wK,bP,bN,bB,bR,bQ,bK}.svg
// /public/pieces/neo/...
// /public/pieces/cburnett/...
// /public/pieces/alpha/...

export function getPieceSetPath(set: PieceSet, piece: string): string {
  return `${PIECE_SET_BASE_PATH}/${set}/${piece}.svg`;
}
```

`react-chessboard` accepts a `customPieces` prop — a `Record<string, (props) => JSX.Element>` where keys are piece codes (`wP`, `wN`, etc.) and values render `<img>` tags pointing to the SVG path.

---

## 4. Sound Events

```typescript
export type SoundEvent = 'move' | 'capture' | 'check' | 'game-end' | 'illegal';

export const SOUND_FILES: Record<SoundEvent, string> = {
  'move':     '/sounds/move.mp3',
  'capture':  '/sounds/capture.mp3',
  'check':    '/sounds/check.mp3',
  'game-end': '/sounds/game-end.mp3',
  'illegal':  '/sounds/illegal.mp3',
};
```

**Trigger mapping** (from game events):

| Game event | Sound played |
|---|---|
| `move_made` with no capture | `move` |
| `move_made` with capture flag | `capture` |
| `move_made` with check flag | `check` (overrides move/capture) |
| `game_over` | `game-end` |
| User attempts illegal move | `illegal` |

---

## 5. localStorage Keys

| Key | Owner | Contents | Persisted fields |
|---|---|---|---|
| `chessweb-auth` | `authStore` | Zustand persist snapshot | `user` only (not `accessToken`) |
| `chessweb-settings` | `settingsStore` | Zustand persist snapshot | `boardTheme`, `pieceSet`, `soundMuted`, `darkMode` |

No other data is written to localStorage. Specifically:
- The access token is **never** in localStorage
- React Query cache is **never** persisted to localStorage (acceptable; data is fresh on next page load)

---

## 6. Ephemeral vs Persisted State Summary

| Store | Persisted? | Key | Excluded fields |
|---|---|---|---|
| `authStore` | Yes (partial) | `chessweb-auth` | `accessToken`, `isAuthenticated` |
| `gameStore` | No | — | All fields |
| `matchmakingStore` | No | — | All fields |
| `notificationStore` | No | — | All fields |
| `socialStore` | No | — | All fields |
| `settingsStore` | Yes (full) | `chessweb-settings` | None |

---

## 7. Dark Mode Strategy

Dark mode uses Tailwind's `class` strategy (not `media` strategy):

```javascript
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  // ...
}
```

When `settingsStore.darkMode` is `true`, `document.documentElement.classList.add('dark')` is called. Components use `dark:` variants: `className="bg-white dark:bg-chess-surface"`.

**Initialization**: On app boot, before React renders, a small inline script in `index.html` reads `chessweb-settings` from localStorage and adds the `dark` class to `<html>` if needed — preventing flash of unstyled light content.

```html
<!-- index.html — before </head> -->
<script>
  try {
    const s = JSON.parse(localStorage.getItem('chessweb-settings') || '{}');
    if (s.state?.darkMode) document.documentElement.classList.add('dark');
  } catch (_) {}
</script>
```

---

## 8. Notification Toast Events

`react-hot-toast` is used for transient in-app notifications distinct from the persistent notification drawer:

```typescript
// Toast event triggers
type ToastEvent =
  | 'match_found'          // "Match found! Starting game..."
  | 'draw_offered'         // "Your opponent offered a draw"
  | 'friend_online'        // "{username} is now online"
  | 'tournament_started'   // "Tournament round {n} has started"
  | 'copy_link'            // "Game link copied to clipboard"
  | 'settings_saved';      // "Settings saved"
```
