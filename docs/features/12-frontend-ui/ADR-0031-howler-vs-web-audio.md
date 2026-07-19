# ADR-0031 — Howler.js over Web Audio API for Sound Effects

## Status
Accepted

## Context

ChessWeb plays short sound effects on game events: piece move, piece capture, check, game end, illegal move attempt. These sounds must:

- Play immediately on the event (sub-50ms latency from WebSocket event to audio output)
- Not overlap awkwardly — a move sound followed immediately by a check sound should both play
- Be globally mutable — a "mute" setting persists across sessions
- Work on all major browsers including Safari (which has historically inconsistent Web Audio support)
- Work on mobile browsers, where autoplay restrictions require a user gesture before any audio plays
- Add minimal bundle weight

We evaluated two options: **native Web Audio API** and **Howler.js**.

### Native Web Audio API

The Web Audio API is available in all modern browsers and requires no library. Sounds are loaded via `fetch` + `AudioContext.decodeAudioData`, then played by creating a `BufferSourceNode` per playback.

**Problems for ChessWeb**:
- `AudioContext` must be created after a user gesture (click/touch) to comply with browser autoplay policies. Implementing this correctly across React's lifecycle requires non-trivial code (suspended context, user-gesture resumption)
- Safari requires `webkitAudioContext` fallback and has had multiple bugs with `.decodeAudioData` promises
- No built-in sprite support — playing multiple sounds simultaneously requires manually managing multiple `AudioContext` instances or `BufferSourceNode` pools
- Preloading and caching audio buffers requires custom code (~100 lines)
- Volume control and mute require additional gain node management

**Total custom code estimate**: ~200 lines to match Howler's feature set.

### Howler.js

Howler.js is a battle-tested audio library (5M+ weekly npm downloads) that wraps Web Audio API with an HTML5 Audio fallback. It handles:

- `AudioContext` autoplay policy compliance automatically
- Cross-browser prefix normalization (Safari `webkitAudioContext`)
- Sound sprite support for bundling multiple sounds in one file (optional for us)
- Simultaneous playback of multiple sounds
- Per-sound and global volume + mute controls
- Preloading with status callbacks

**Bundle size**: ~8kb gzipped — acceptable for audio functionality.

### Tone.js

Tone.js is a more powerful audio framework designed for generative music and synthesis. It is overkill for simple sound effects and adds ~35kb gzipped. Not considered further.

## Decision

Use **Howler.js** via a `useSound` hook in `frontend/src/hooks/useSound.ts`.

Sound files are stored as MP3s in `public/sounds/`:
- `move.mp3` — piece slide sound (~0.3s)
- `capture.mp3` — piece capture sound (~0.4s)
- `check.mp3` — check alert tone (~0.5s)
- `game-end.mp3` — game conclusion jingle (~1.5s)
- `illegal.mp3` — short error tone (~0.2s)

The `useSound` hook:
1. Creates `Howl` instances once on mount, keyed by event name
2. Reads `settingsStore.soundMuted` — if true, sets `Howl.volume(0)` globally
3. Exposes a `play(event: SoundEvent)` function consumed by game event handlers
4. Exposes `setMuted(boolean)` that calls `Howler.mute(true/false)` globally and updates `settingsStore`

The mute state is persisted in `settingsStore` via Zustand `persist` middleware (localStorage key `chessweb-settings`). On app boot, if `soundMuted: true` is in localStorage, `Howler.mute(true)` is called immediately so no sound plays even during the brief render before the hook mounts.

## Consequences

**Positive**:
- Autoplay policy handled by Howler — no custom user-gesture detection code needed
- `Howler.mute(true/false)` is global — muting works even if multiple `Howl` instances exist
- Works identically in Safari, Chrome, Firefox, and mobile browsers
- Sound preloading happens once on game page mount — zero latency on first move sound

**Negative**:
- ~8kb gzipped added to the game chunk (acceptable; game chunk budget is ~120kb)
- Howler.js is not actively maintained for new Web Audio API features (spatial audio, etc.) — not relevant for ChessWeb's simple use case
- MP3 files in `/public/sounds/` must be committed to the repository; ~50kb of audio assets
- Mobile browsers still require the first `Howl.play()` call to be inside a user-gesture event handler. Howler handles this with an internal unlock mechanism but developers must not call `play()` from `useEffect` on mount
