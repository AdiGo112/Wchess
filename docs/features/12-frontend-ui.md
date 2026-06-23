# Feature 12 — Frontend UI Polish

**Branch:** `feature/frontend-ui`
**Depends on:** all other features (done last)

## Goal
Transform the functional app into a polished, Lichess-quality experience. State management with Zustand, server state with React Query, sounds, themes, mobile responsiveness.

---

## State Management

### Replace AuthContext with Zustand
```typescript
// store/auth.store.ts
interface AuthStore {
  user:         User | null;
  accessToken:  string | null;
  login:        (token: string, user: User) => void;
  logout:       () => void;
  setUser:      (user: User) => void;
}
```

### Game State (Zustand)
```typescript
// store/game.store.ts
interface GameStore {
  roomId:       string | null;
  color:        'white' | 'black' | null;
  fen:          string;
  moves:        string[];
  timers:       { white: number; black: number };
  status:       'idle' | 'searching' | 'active' | 'finished';
  result:       GameResult | null;
  drawOffered:  boolean;
  // actions
  applyMove:    (move: MoveDto) => void;
  setTimers:    (timers: TimerDto) => void;
  endGame:      (result: GameResult) => void;
}
```

### React Query (Server State)
Replace all raw axios calls:
```typescript
// api/games.ts
export const useGameHistory = (userId: string) =>
  useQuery(['games', userId], () => api.get(`/games/history/${userId}`));

export const useLeaderboard = (variant: string, period: string) =>
  useQuery(['leaderboard', variant, period], () =>
    api.get(`/leaderboard?variant=${variant}&period=${period}`),
    { staleTime: 60_000 }  // 1 min cache
  );
```

---

## Sound Effects

Files in `frontend/public/sounds/`:
- `move.mp3` — piece moved
- `capture.mp3` — piece captured
- `check.mp3` — king in check
- `castle.mp3` — castling
- `promote.mp3` — promotion
- `game-start.mp3` — game begins
- `game-end.mp3` — game over
- `draw.mp3` — draw offered/accepted
- `tick.mp3` — clock ticking (< 10 seconds)

Triggered in `useGameSocket.ts` on each socket event.
User can mute via Settings page toggle.

---

## Themes

### Board themes (CSS classes on `react-chessboard`)
- `classic` — brown/cream (default)
- `blue` — blue/white
- `green` — green/cream (like lichess)
- `purple` — purple/white
- `dark` — dark gray

### Piece sets
- Standard (default)
- cburnett (Lichess default SVGs)
- Alpha
- Neo

Stored in `user_settings` table (PostgreSQL) and `localStorage`.

### Dark / Light mode
- Default: dark
- Toggle in navbar
- Persisted in `localStorage`

---

## Keyboard Shortcuts
| Key | Action |
|---|---|
| `←` / `→` | Navigate moves in analysis |
| `f` | Flip board |
| `Esc` | Cancel premove |
| `r` | Request rematch |
| `n` | New game (go to lobby) |

---

## Mobile Responsive Layout
- Board resizes to fill screen width
- Move history collapses to a toggle panel
- Timer shown above and below board (not sidebar)
- Touch drag for piece moves (react-chessboard handles this)
- Hamburger menu on mobile navbar

---

## Performance
- Lazy load all pages (`React.lazy` + `Suspense`)
- Prefetch leaderboard and profile data with React Query
- Board SVG pieces cached in browser
- Socket.io reconnects automatically (built-in)
- Virtual scroll in move history and game history lists

---

## Pages to Polish

### Home
- Hero section with "Play Now" CTA
- Daily puzzle widget
- Live games ticker (top active games)
- Activity feed (if logged in)
- Stats: total games, active players

### Profile
- Avatar upload
- Stats per variant (rating chart over time)
- Recent games with result/rating change
- Achievements / milestones
- Edit bio, country, name

### Settings
- Sound on/off
- Board theme
- Piece set
- Move confirmation (click-click vs drag)
- Auto-promote to queen
- Clock format (h:mm:ss vs mm:ss)

---

## Checklist
- [ ] Zustand: auth.store, game.store, ui.store, notification.store
- [ ] React Query: all API hooks
- [ ] Sound effects system
- [ ] Board theme switcher
- [ ] Piece set switcher
- [ ] Dark/light mode toggle
- [ ] Keyboard shortcuts
- [ ] Mobile responsive layout
- [ ] Lazy-loaded routes
- [ ] Home page hero + stats
- [ ] Profile page with avatar upload + rating chart
- [ ] Settings page
- [ ] Smooth animations (board move highlight, last-move arrow)
- [ ] Loading skeletons (not spinners)
- [ ] Error boundaries on all pages

## Verify
1. Sound plays on each move type
2. Board theme changes persist across reload
3. Mobile: board fills width, timer above/below
4. Keyboard `←/→` navigate analysis board
5. Dark mode works on all pages
6. Slow network: skeleton loaders shown (not blank)
7. Profile rating chart shows history
