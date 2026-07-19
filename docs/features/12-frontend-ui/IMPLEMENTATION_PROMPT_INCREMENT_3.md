# Feature 12 — Frontend UI: Implementation Prompt — Increment 3 (Sound Effects)

Copy and paste this entire prompt into a fresh AI session.

---

## Task

Implement game sound effects for ChessWeb using Howler.js. Create the `useSound` hook, wire it into the game socket event handler, and add a mute toggle button to the game header.

## Prerequisites (already exist)

- `frontend/src/stores/settingsStore.ts` — with `soundMuted: boolean` and `setSoundMuted(muted: boolean)`
- `frontend/src/features/game/hooks/useGameSocket.ts` — socket event handler for the game
- `frontend/src/features/game/components/GameHeader.tsx` — top bar of the game page
- Sound files in `frontend/public/sounds/`: `move.mp3`, `capture.mp3`, `check.mp3`, `game-end.mp3`, `illegal.mp3`
- Howler.js installed: `npm install howler @types/howler`

## Sound Event Priority

When multiple flags are true on a single move, play sounds in this priority order (only one sound per move event):

1. `check` — highest priority
2. `capture`
3. `move` — lowest

## File to Create: `frontend/src/hooks/useSound.ts`

```typescript
import { useEffect, useRef, useCallback } from 'react';
import { Howl, Howler } from 'howler';
import { useSettingsStore } from '@/stores/settingsStore';
import { SOUND_FILES, type SoundEvent } from '@/types/settings';

type SoundMap = Record<SoundEvent, Howl>;

export function useSound() {
  const soundMuted = useSettingsStore((s) => s.soundMuted);
  const setSoundMuted = useSettingsStore((s) => s.setSoundMuted);
  const soundsRef = useRef<SoundMap | null>(null);

  // Initialize Howl instances once on mount
  useEffect(() => {
    soundsRef.current = {
      move: new Howl({ src: [SOUND_FILES.move], preload: true, volume: 0.7 }),
      capture: new Howl({ src: [SOUND_FILES.capture], preload: true, volume: 0.7 }),
      check: new Howl({ src: [SOUND_FILES.check], preload: true, volume: 0.8 }),
      'game-end': new Howl({ src: [SOUND_FILES['game-end']], preload: true, volume: 0.6 }),
      illegal: new Howl({ src: [SOUND_FILES.illegal], preload: true, volume: 0.5 }),
    };

    // Apply initial mute state from persisted settings
    Howler.mute(soundMuted);

    return () => {
      // Clean up Howl instances on unmount
      if (soundsRef.current) {
        Object.values(soundsRef.current).forEach((h) => h.unload());
        soundsRef.current = null;
      }
    };
    // Run once on mount — soundMuted intentionally excluded from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync Howler global mute when store changes (e.g., user toggles mute from settings)
  useEffect(() => {
    Howler.mute(soundMuted);
  }, [soundMuted]);

  const play = useCallback((event: SoundEvent) => {
    if (soundsRef.current) {
      soundsRef.current[event].play();
    }
  }, []);

  const setMuted = useCallback(
    (muted: boolean) => {
      Howler.mute(muted);
      setSoundMuted(muted);
    },
    [setSoundMuted]
  );

  return { play, setMuted, soundMuted };
}
```

## File to Create: `frontend/src/hooks/useMoveSound.ts`

This hook determines which sound to play based on the move event data from the socket:

```typescript
import { useCallback } from 'react';
import { useSound } from './useSound';
import type { SoundEvent } from '@/types/settings';

interface MoveEventData {
  fen: string;
  turn: 'white' | 'black';
  moves: string[];
  capture?: boolean;
  check?: boolean;
  gameOver?: boolean;
}

export function useMoveSound() {
  const { play } = useSound();

  const playMoveSound = useCallback(
    (data: MoveEventData) => {
      let event: SoundEvent;

      if (data.gameOver) {
        event = 'game-end';
      } else if (data.check) {
        event = 'check'; // check overrides capture
      } else if (data.capture) {
        event = 'capture';
      } else {
        event = 'move';
      }

      play(event);
    },
    [play]
  );

  const playIllegal = useCallback(() => {
    play('illegal');
  }, [play]);

  const playGameEnd = useCallback(() => {
    play('game-end');
  }, [play]);

  return { playMoveSound, playIllegal, playGameEnd };
}
```

## Modify `frontend/src/features/game/hooks/useGameSocket.ts`

Add sound playback to the socket event handlers. Find the existing `useGameSocket` hook and add the following:

```typescript
// Add this import at the top of useGameSocket.ts:
import { useMoveSound } from '@/hooks/useMoveSound';

// Inside the useGameSocket hook body, add:
const { playMoveSound, playGameEnd } = useMoveSound();

// In the useEffect where socket events are registered, update the handlers:

socket.on('move_made', (data) => {
  setGameState({ fen: data.fen, turn: data.turn, moves: data.moves });
  // Play appropriate sound based on move data
  playMoveSound({
    fen: data.fen,
    turn: data.turn,
    moves: data.moves,
    capture: data.capture ?? false,
    check: data.check ?? false,
  });
});

socket.on('game_over', (data) => {
  setGameState({ status: 'ended' });
  playGameEnd();
});
```

## Create: `frontend/src/components/ui/SoundToggle.tsx`

```typescript
import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useSound } from '@/hooks/useSound';

interface SoundToggleProps {
  className?: string;
}

export function SoundToggle({ className = '' }: SoundToggleProps) {
  const { soundMuted, setMuted } = useSound();

  return (
    <button
      onClick={() => setMuted(!soundMuted)}
      className={`p-2 rounded-md transition-colors hover:bg-gray-100 dark:hover:bg-chess-surface-2 ${className}`}
      aria-label={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
      aria-pressed={soundMuted}
      title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
    >
      {soundMuted ? (
        <VolumeX className="w-5 h-5 text-gray-400" aria-hidden="true" />
      ) : (
        <Volume2 className="w-5 h-5 text-gray-700 dark:text-gray-300" aria-hidden="true" />
      )}
    </button>
  );
}
```

## Modify `frontend/src/features/game/components/GameHeader.tsx`

Add the `SoundToggle` component to the game header. Find the existing `GameHeader` component and add:

```typescript
// Add import:
import { SoundToggle } from '@/components/ui/SoundToggle';

// Inside the GameHeader JSX, add SoundToggle to the controls area:
// (Place alongside existing controls like settings button, resign button, etc.)
<SoundToggle className="ml-2" />
```

## Handle Illegal Move Attempts

In the `ChessBoard` component, when a player tries to drag a piece to an illegal square, play the illegal sound:

```typescript
// In frontend/src/features/game/components/ChessBoard.tsx
// (or wherever the react-chessboard onPieceDrop handler lives)

import { useSound } from '@/hooks/useSound';

// Inside the component:
const { play } = useSound();

// In the onPieceDrop or onPieceDragEnd handler:
const onPieceDrop = (sourceSquare: string, targetSquare: string) => {
  const chess = new Chess(fen);
  const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: 'q' });
  
  if (!move) {
    play('illegal'); // Invalid move attempt
    return false;
  }
  
  // Emit move to server via socket
  socket.emit('make_move', { gameId, from: sourceSquare, to: targetSquare });
  return true;
};
```

## Verification Steps

1. Start the dev server and navigate to an active game
2. Move a piece — you should hear the move sound
3. Capture a piece — you should hear the capture sound
4. Put opponent in check — you should hear the check sound
5. Try dragging a piece to an illegal square — you should hear the illegal sound
6. Game ends — you should hear the game-end sound
7. Click the mute button in the game header — all sounds go silent
8. Refresh the page — mute state persists (sounds still muted)
9. Click unmute — sounds resume on next move

## Notes

- `Howler.mute(true/false)` is a **global** mute — it affects all `Howl` instances, not just the ones in `useSound`
- The `useSound` hook is designed to be used in multiple components simultaneously. `Howler.mute()` affects all of them because it is a global Howler operation
- On mobile, the first sound cannot play until after a user gesture. Howler.js handles this automatically via its internal "unlock" mechanism — no code needed
- Sound files must be in `public/sounds/` (not `src/`). Vite copies `/public` to the build output as-is
- If sound files do not exist yet, create placeholder silent MP3 files for development. Download actual sounds from the Lichess repository: https://github.com/lichess-org/lila/tree/master/public/sound/standard
