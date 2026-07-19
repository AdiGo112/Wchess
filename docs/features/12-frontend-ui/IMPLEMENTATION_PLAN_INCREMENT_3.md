# Feature 12 — Frontend UI: Increment 3 Implementation Plan

## Scope

Implement the `useSound` hook and wire it into the game board. Add Howler.js integration for five sound events: `move`, `capture`, `check`, `game-end`, and `illegal`. Wire the hook into `GamePage` so socket events trigger sounds. Add a mute toggle button to the game header. The mute state reads from and writes to `settingsStore.soundMuted`.

This increment also requires adding the sound MP3 files to `public/sounds/` (sourced from Lichess open-source pack or equivalent).

## Files Created / Modified

| File | Action |
|---|---|
| `frontend/src/hooks/useSound.ts` | Create |
| `frontend/src/features/game/components/GameHeader.tsx` | Modify — add mute toggle button |
| `frontend/src/features/game/hooks/useGameSocket.ts` | Modify — call `sound.play(event)` on move/capture/check/game-end |
| `frontend/public/sounds/move.mp3` | Add asset |
| `frontend/public/sounds/capture.mp3` | Add asset |
| `frontend/public/sounds/check.mp3` | Add asset |
| `frontend/public/sounds/game-end.mp3` | Add asset |
| `frontend/public/sounds/illegal.mp3` | Add asset |
| `frontend/package.json` | Modify — add `howler`, `@types/howler` |

## Acceptance Criteria

- [ ] `useSound()` hook returns `{ play, setMuted }` functions
- [ ] `play('move')` calls Howl.play() for the move sound file
- [ ] `play('capture')` plays capture.mp3
- [ ] `play('check')` plays check.mp3 (overrides move/capture when check is flagged)
- [ ] `play('game-end')` plays game-end.mp3
- [ ] `play('illegal')` plays illegal.mp3
- [ ] On mount, if `settingsStore.soundMuted` is `true`, `Howler.mute(true)` is called immediately
- [ ] `setSoundMuted(true)` calls `Howler.mute(true)` AND updates `settingsStore.soundMuted`
- [ ] Mute state persists after page refresh (via `settingsStore` persistence)
- [ ] Mute toggle button in GameHeader shows correct icon (speaker vs muted)
- [ ] Mute button has `aria-label="Mute sounds"` / `aria-label="Unmute sounds"` depending on state
- [ ] Socket event `move_made` with `capture: false, check: false` → plays `move`
- [ ] Socket event `move_made` with `capture: true` → plays `capture`
- [ ] Socket event `move_made` with `check: true` → plays `check` (regardless of capture flag)
- [ ] Socket event `game_over` → plays `game-end`
- [ ] No sound plays when game status is `idle` (game not yet started)
- [ ] Sound assets are present in `public/sounds/` directory

## Sound Event Priority

When multiple conditions are true (e.g., check AND capture on the same move), use this priority:
1. `check` (highest — most important feedback)
2. `capture`
3. `move` (lowest)

## Dependencies

- Increment 1 complete (settingsStore with soundMuted exists)
- GamePage and useGameSocket hook exist from prior feature work
- Sound asset files sourced and placed in `public/sounds/`

## Complexity

**S** — Howler.js is simple to initialize. The main subtlety is the mute-on-mount side effect and the sound priority logic. Asset sourcing (finding/downloading 5 MP3 files) takes more time than the code.
