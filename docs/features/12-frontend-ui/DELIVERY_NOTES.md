# Feature 12 — Frontend UI: Delivery Notes

This document covers assets, configuration, and operational concerns for deploying Feature 12 to production.

---

## 1. Static Assets to Add to `/public`

These assets must be present before the frontend application runs. They are served directly by the web server (Nginx in production, Vite dev server locally).

### Sound files (`/public/sounds/`)

```
public/sounds/
  move.mp3        ~15kb — piece slide sound effect
  capture.mp3     ~20kb — piece capture sound effect
  check.mp3       ~25kb — check alert tone
  game-end.mp3    ~80kb — game conclusion jingle (longer)
  illegal.mp3     ~10kb — short error buzzer
```

**Total sound assets**: ~150kb uncompressed. These are served with `Cache-Control: max-age=31536000, immutable` since filenames are static.

**Source**: Use Lichess open-source sound pack (MIT licensed): https://github.com/lichess-org/lila/tree/master/public/sound/standard

Alternatively, generate free sounds from freesound.org (Creative Commons 0). The exact sound files do not matter functionally — just ensure they are MP3 format and under 200kb each.

**Howler.js compatibility**: MP3 is supported in all target browsers. No need for OGG fallback.

### Piece set SVGs (`/public/pieces/{set}/`)

```
public/pieces/
  standard/
    wK.svg wQ.svg wR.svg wB.svg wN.svg wP.svg
    bK.svg bQ.svg bR.svg bB.svg bN.svg bP.svg
  neo/
    (same 12 files)
  cburnett/
    (same 12 files)
  alpha/
    (same 12 files)
```

**Total piece assets**: 48 SVG files, ~5-20kb each ≈ ~500kb total.

**Sources** (all open source, suitable for commercial use):
- `standard` (Merida): https://github.com/lichess-org/lila/tree/master/public/piece/merida
- `neo`: https://github.com/lichess-org/lila/tree/master/public/piece/neo
- `cburnett`: https://github.com/lichess-org/lila/tree/master/public/piece/cburnett
- `alpha`: https://github.com/lichess-org/lila/tree/master/public/piece/alpha

All Lichess piece sets are under AGPL or CC BY-SA 3.0. Verify license compatibility with ChessWeb's commercial use before deployment.

**Naming convention**: react-chessboard uses piece codes `wP`, `wN`, `wB`, `wR`, `wQ`, `wK`, `bP`, `bN`, `bB`, `bR`, `bQ`, `bK`. SVG files must match this naming exactly.

---

## 2. Tailwind Dark Mode Configuration

**File**: `frontend/tailwind.config.js`

Add the `darkMode: 'class'` option:

```javascript
module.exports = {
  darkMode: 'class',   // Add this line
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        chess: {
          'dark-square':  '#769656',
          'light-square': '#eeeed2',
          'app-bg':       '#1a1a2e',
          'surface':      '#16213e',
          'surface-2':    '#0f3460',
          'accent':       '#e94560',
        },
      },
    },
  },
  plugins: [],
};
```

---

## 3. Dark Mode Flash Prevention in index.html

Add this script to `frontend/index.html` inside `<head>`, before any CSS link tags:

```html
<script>
  (function() {
    try {
      var s = JSON.parse(localStorage.getItem('chessweb-settings') || '{}');
      if (s && s.state && s.state.darkMode === true) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
</script>
```

This runs synchronously before any rendering, preventing the flash of the default light theme for dark-mode users.

---

## 4. localStorage Key Naming

These keys are the production localStorage identifiers. Do not rename them after launch — existing users' persisted preferences will be lost.

| Key | Owner | Format | Notes |
|---|---|---|---|
| `chessweb-auth` | `authStore` | Zustand persist JSON | Contains `{ state: { user }, version: 0 }` |
| `chessweb-settings` | `settingsStore` | Zustand persist JSON | Contains `{ state: { boardTheme, pieceSet, soundMuted, darkMode }, version: 0 }` |

**Zustand persist JSON structure**:
```json
{
  "state": { "boardTheme": "green", "pieceSet": "standard", "soundMuted": false, "darkMode": true },
  "version": 0
}
```

The `version` field enables future migrations via `migrate` option in Zustand persist middleware.

---

## 5. NPM Dependencies to Install

```bash
# Run from frontend/ directory
npm install zustand @tanstack/react-query howler react-hot-toast react-error-boundary
npm install --save-dev @tanstack/react-query-devtools @types/howler
```

Full dependency additions:
- `zustand@^4` — client state
- `@tanstack/react-query@^5` — server state
- `howler@^2` — sound effects
- `react-hot-toast@^2` — toast notifications
- `react-error-boundary@^4` — error boundary component
- `@tanstack/react-query-devtools` — dev only, gated behind `import.meta.env.DEV`
- `@types/howler` — TypeScript types for Howler.js

---

## 6. Environment Variables

No new environment variables are required for Feature 12. The existing variables are sufficient:

```
VITE_API_URL=http://localhost:3000   # Already required
VITE_WS_URL=ws://localhost:3000      # Already required
```

---

## 7. Bundle Size Impact

Feature 12 adds to the existing bundle:

| Addition | Chunk affected | Size increase (gzipped) |
|---|---|---|
| Zustand persist middleware | Initial | ~0.5kb |
| `@tanstack/react-query` | Initial | ~13kb |
| `howler` | Game chunk | ~8kb |
| `react-hot-toast` | Initial | ~3kb |
| `react-error-boundary` | Initial | ~1kb |
| Piece SVGs (runtime fetch) | None (not bundled) | — |
| Sound MP3s (runtime fetch) | None (not bundled) | — |

**New initial bundle target**: ~100kb gzipped (was ~80kb, +20kb for React Query + toast).

---

## 8. Rollback Plan

If Feature 12 is deployed and causes issues, the rollback procedure is:

**Partial rollback (disable specific increments)**:

1. **Sound effects**: Remove `useSound` calls from `GamePage`. Sounds are isolated — no other feature depends on them.
2. **Board themes**: Revert `settingsStore.boardTheme` to always return `'classic'` in `BOARD_THEME_COLORS` lookup. One-line change.
3. **Dark mode**: Remove `document.documentElement.classList` manipulation from `settingsStore` and the inline script from `index.html`. CSS `dark:` classes silently no-op without the `dark` class.

**Full rollback**:
- Revert the `frontend/src/stores/` directory to the prior commit
- Revert `frontend/src/hooks/api/` to the prior commit
- Remove the dark mode script from `index.html`
- These changes do not touch the backend — backend rollback is not needed

**Data concern**: If users have preferences stored in `chessweb-settings`, rolling back the `settingsStore` means those preferences are still in localStorage but the store schema no longer matches. On next load, Zustand persist will fail to rehydrate and fall back to defaults silently — acceptable behavior.

---

## 9. Post-Deployment Verification Checklist

- [ ] Sound effects play on piece move in Chrome, Safari, Firefox
- [ ] Board theme change applies immediately without page reload
- [ ] Board theme persists after page refresh
- [ ] Dark mode toggle works and persists
- [ ] No flash of light mode on reload for dark-mode users
- [ ] Mobile hamburger menu opens and closes
- [ ] Notification badge appears when unread notifications exist
- [ ] React Query DevTools NOT visible in production build
- [ ] `chessweb-auth` in localStorage does NOT contain `accessToken` field
- [ ] All 5 piece sets render correctly on the board
- [ ] Leaderboard auto-refreshes without user action (staleTime 30s)
- [ ] Game history loads on profile page
- [ ] Friend accept/decline has optimistic update (immediate UI response)
