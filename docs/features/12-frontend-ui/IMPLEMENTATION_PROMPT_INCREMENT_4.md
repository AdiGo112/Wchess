# Feature 12 — Frontend UI: Implementation Prompt — Increment 4 (Board Themes + Piece Sets)

Copy and paste this entire prompt into a fresh AI session.

---

## Task

Implement visual board themes and piece set selection for ChessWeb. Users can choose from 5 board themes and 4 piece sets, with their selection persisted to localStorage and applied to the chess board in real time.

## Prerequisites (already exist)

- `frontend/src/stores/settingsStore.ts` — with `boardTheme`, `pieceSet`, `setBoardTheme`, `setPieceSet`
- `frontend/src/types/settings.ts` — with `BoardTheme`, `PieceSet`, `BOARD_THEME_COLORS`, `getPieceSetPath`
- react-chessboard is installed and a `ChessBoard` component exists in `frontend/src/features/game/components/ChessBoard.tsx`
- Piece SVG files in `frontend/public/pieces/{standard,neo,cburnett,alpha}/` — 12 SVG files per set
- A `SettingsPage` exists at `frontend/src/pages/SettingsPage.tsx`

## Board Theme Values

```typescript
// These values come from frontend/src/types/settings.ts
const BOARD_THEME_COLORS = {
  classic:    { light: '#f0d9b5', dark: '#b58863' },
  green:      { light: '#eeeed2', dark: '#769656' }, // Lichess green (default)
  brown:      { light: '#f0d9b5', dark: '#b58863' },
  blue:       { light: '#dee3e6', dark: '#8ca2ad' },
  tournament: { light: '#ffffff', dark: '#4a4a4a' },
};
```

## Modify `frontend/src/features/game/components/ChessBoard.tsx`

Update the existing ChessBoard component to read theme and piece set from the settings store:

```typescript
import React, { useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { useSettingsStore } from '@/stores/settingsStore';
import { BOARD_THEME_COLORS } from '@/types/settings';
import type { PieceSet } from '@/types/settings';

// Piece codes used by react-chessboard
const PIECE_CODES = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'] as const;
type PieceCode = typeof PIECE_CODES[number];

function buildCustomPieces(pieceSet: PieceSet): Record<string, ({ squareWidth }: { squareWidth: number }) => JSX.Element> {
  return Object.fromEntries(
    PIECE_CODES.map((piece) => [
      piece,
      ({ squareWidth }: { squareWidth: number }) => (
        <img
          src={`/pieces/${pieceSet}/${piece}.svg`}
          width={squareWidth}
          height={squareWidth}
          alt={piece}
          draggable={false}
          style={{ userSelect: 'none' }}
        />
      ),
    ])
  );
}

interface ChessBoardProps {
  fen: string;
  orientation?: 'white' | 'black';
  onPieceDrop?: (sourceSquare: string, targetSquare: string) => boolean;
  onSquareClick?: (square: string) => void;
  customSquareStyles?: Record<string, React.CSSProperties>;
  arePiecesDraggable?: boolean;
  boardWidth?: number;
}

export function ChessBoard({
  fen,
  orientation = 'white',
  onPieceDrop,
  onSquareClick,
  customSquareStyles,
  arePiecesDraggable = true,
  boardWidth,
}: ChessBoardProps) {
  const boardTheme = useSettingsStore((s) => s.boardTheme);
  const pieceSet = useSettingsStore((s) => s.pieceSet);

  const themeColors = BOARD_THEME_COLORS[boardTheme];

  // Memoize custom pieces — only rebuilds when pieceSet changes
  const customPieces = useMemo(() => buildCustomPieces(pieceSet), [pieceSet]);

  return (
    <div data-testid="chess-board" data-fen={fen} aria-label="Chess board">
      <Chessboard
        position={fen}
        boardOrientation={orientation}
        onPieceDrop={onPieceDrop}
        onSquareClick={onSquareClick}
        customSquareStyles={customSquareStyles}
        arePiecesDraggable={arePiecesDraggable}
        boardWidth={boardWidth}
        customDarkSquareStyle={{ backgroundColor: themeColors.dark }}
        customLightSquareStyle={{ backgroundColor: themeColors.light }}
        customPieces={customPieces}
        animationDuration={150}
      />
    </div>
  );
}
```

## Create `frontend/src/components/chess/ThemePicker.tsx`

```typescript
import React from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { BOARD_THEME_COLORS, type BoardTheme } from '@/types/settings';

const THEME_LABELS: Record<BoardTheme, string> = {
  classic: 'Classic',
  green: 'Green (Lichess)',
  brown: 'Brown',
  blue: 'Blue',
  tournament: 'Tournament',
};

export function ThemePicker() {
  const boardTheme = useSettingsStore((s) => s.boardTheme);
  const setBoardTheme = useSettingsStore((s) => s.setBoardTheme);

  const themes = Object.keys(BOARD_THEME_COLORS) as BoardTheme[];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
        Board Theme
      </h3>
      <div className="flex gap-3 flex-wrap">
        {themes.map((theme) => {
          const colors = BOARD_THEME_COLORS[theme];
          const isActive = boardTheme === theme;

          return (
            <button
              key={theme}
              onClick={() => setBoardTheme(theme)}
              aria-label={`${THEME_LABELS[theme]} theme`}
              aria-pressed={isActive}
              title={THEME_LABELS[theme]}
              className={`
                relative flex flex-col items-center gap-1 p-1 rounded-lg border-2 transition-all
                ${isActive
                  ? 'border-chess-accent shadow-md scale-105'
                  : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                }
              `}
            >
              {/* Mini board preview — 2×2 grid of colored squares */}
              <div className="grid grid-cols-2 w-10 h-10 rounded overflow-hidden shadow-sm">
                <div style={{ backgroundColor: colors.light }} />
                <div style={{ backgroundColor: colors.dark }} />
                <div style={{ backgroundColor: colors.dark }} />
                <div style={{ backgroundColor: colors.light }} />
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                {THEME_LABELS[theme]}
              </span>
              {isActive && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-chess-accent rounded-full" aria-hidden="true" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

## Create `frontend/src/components/chess/PieceSetPicker.tsx`

```typescript
import React from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import type { PieceSet } from '@/types/settings';

const PIECE_SET_LABELS: Record<PieceSet, string> = {
  standard: 'Standard (Merida)',
  neo: 'Neo',
  cburnett: 'CBurnett',
  alpha: 'Alpha',
};

const PIECE_SETS: PieceSet[] = ['standard', 'neo', 'cburnett', 'alpha'];

// Show the white king piece as the preview for each set
const PREVIEW_PIECE = 'wK';

export function PieceSetPicker() {
  const pieceSet = useSettingsStore((s) => s.pieceSet);
  const setPieceSet = useSettingsStore((s) => s.setPieceSet);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
        Piece Set
      </h3>
      <div className="flex gap-4 flex-wrap">
        {PIECE_SETS.map((set) => {
          const isActive = pieceSet === set;

          return (
            <button
              key={set}
              onClick={() => setPieceSet(set)}
              aria-label={`${PIECE_SET_LABELS[set]} piece set`}
              aria-pressed={isActive}
              title={PIECE_SET_LABELS[set]}
              className={`
                flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all min-w-[80px]
                ${isActive
                  ? 'border-chess-accent bg-chess-accent/10 shadow-md'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                }
              `}
            >
              {/* King piece preview */}
              <div className="w-12 h-12 flex items-center justify-center">
                <img
                  src={`/pieces/${set}/${PREVIEW_PIECE}.svg`}
                  alt={`${PIECE_SET_LABELS[set]} king`}
                  className="w-10 h-10 object-contain"
                  draggable={false}
                />
              </div>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center leading-tight">
                {PIECE_SET_LABELS[set]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

## Modify `frontend/src/pages/SettingsPage.tsx`

Add `ThemePicker` and `PieceSetPicker` sections to the existing Settings page:

```typescript
// Add imports:
import { ThemePicker } from '@/components/chess/ThemePicker';
import { PieceSetPicker } from '@/components/chess/PieceSetPicker';
import { ChessBoard } from '@/features/game/components/ChessBoard';

// Inside the SettingsPage component, add a "Board" section:
// Add this section AFTER any existing settings sections (account, notifications, etc.)

<section className="space-y-6">
  <h2 className="text-lg font-bold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
    Board Appearance
  </h2>
  
  <ThemePicker />
  
  <PieceSetPicker />
  
  {/* Live preview board — shows the selected theme + piece set */}
  <div className="space-y-2">
    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
      Preview
    </h3>
    <div className="max-w-[280px]">
      <ChessBoard
        fen="rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
        arePiecesDraggable={false}
        boardWidth={280}
      />
    </div>
  </div>
</section>
```

## Piece SVG File Requirements

Piece SVG files must be placed at:
```
frontend/public/pieces/
  standard/wK.svg  wQ.svg  wR.svg  wB.svg  wN.svg  wP.svg
           bK.svg  bQ.svg  bR.svg  bB.svg  bN.svg  bP.svg
  neo/     (same 12)
  cburnett/(same 12)
  alpha/   (same 12)
```

Source files from Lichess (MIT/AGPL license):
- https://github.com/lichess-org/lila/tree/master/public/piece/merida → rename to `standard/`
- https://github.com/lichess-org/lila/tree/master/public/piece/neo → `neo/`
- https://github.com/lichess-org/lila/tree/master/public/piece/cburnett → `cburnett/`
- https://github.com/lichess-org/lila/tree/master/public/piece/alpha → `alpha/`

If SVGs are not available yet, create placeholder colored squares:

```bash
# Create placeholder SVGs for development
for set in standard neo cburnett alpha; do
  mkdir -p frontend/public/pieces/$set
  for piece in wK wQ wR wB wN wP bK bQ bR bB bN bP; do
    echo '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"><rect width="45" height="45" fill="#666"/><text x="22" y="30" text-anchor="middle" fill="white" font-size="14">'$piece'</text></svg>' > frontend/public/pieces/$set/$piece.svg
  done
done
```

## Verification

1. Open Settings page
2. Click "Blue" theme swatch → board preview instantly shows blue squares
3. Click "Neo" piece set → board preview shows Neo piece images
4. Navigate to `/play/demo` game → board shows the selected theme and pieces
5. Refresh the page → theme and piece set are still the same (persisted)
6. Check `localStorage.getItem('chessweb-settings')` → shows `{ state: { boardTheme: 'blue', pieceSet: 'neo', ... } }`
7. Theme swatches have `aria-pressed="true"` on the active one

## Notes

- `customPieces` in ChessBoard must be `useMemo`'d to prevent re-renders on every parent render
- The `buildCustomPieces` function creates functions that return JSX — these are not React components themselves (no hooks allowed inside)
- `data-testid="chess-board"` and `data-fen={fen}` attributes are needed for Playwright E2E tests
- The classic and brown themes have identical colors by design — this is intentional (classic refers to the ivory/brown Merida style)
