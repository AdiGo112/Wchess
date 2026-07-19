# Feature 12 — Frontend UI: Increment 4 Implementation Plan

## Scope

Implement board themes and piece set selection. Five board themes (classic, green, brown, blue, tournament) and four piece sets (standard, neo, cburnett, alpha) are selectable from the Settings page. The current selection is stored in `settingsStore` (persisted to localStorage). The `ChessBoard` wrapper component reads the settings and passes the correct colors and custom piece renderers to `react-chessboard`.

This increment requires adding piece set SVG files to `public/pieces/{set}/` and creating a `ThemePicker` component and a `PieceSetPicker` component for the Settings page.

## Files Created / Modified

| File | Action |
|---|---|
| `frontend/src/components/chess/ChessBoard.tsx` | Modify — read theme + piece set from settingsStore, pass to react-chessboard |
| `frontend/src/components/chess/ThemePicker.tsx` | Create — 5 swatch buttons |
| `frontend/src/components/chess/PieceSetPicker.tsx` | Create — 4 piece set preview cards |
| `frontend/src/pages/SettingsPage.tsx` | Modify — add ThemePicker and PieceSetPicker sections |
| `frontend/public/pieces/standard/` | Add 12 SVG files |
| `frontend/public/pieces/neo/` | Add 12 SVG files |
| `frontend/public/pieces/cburnett/` | Add 12 SVG files |
| `frontend/public/pieces/alpha/` | Add 12 SVG files |
| `frontend/src/types/settings.ts` | Verify BOARD_THEME_COLORS and PIECE_SET_BASE_PATH constants are present (created in Increment 1) |

## Acceptance Criteria

- [ ] `ChessBoard` passes `customLightSquareStyle={{ backgroundColor: colors.light }}` for active theme
- [ ] `ChessBoard` passes `customDarkSquareStyle={{ backgroundColor: colors.dark }}` for active theme
- [ ] Switching theme in Settings updates the board in real time (same page, no reload)
- [ ] Board theme persists after page refresh
- [ ] `ThemePicker` renders 5 clickable swatches; active theme has a visible selection indicator
- [ ] `ThemePicker` swatch for `green` shows `#769656` as the dark color preview
- [ ] `PieceSetPicker` renders 4 piece set options with a preview image (king piece from each set)
- [ ] Selecting a piece set updates `settingsStore.pieceSet`
- [ ] Piece set change updates the board immediately (no reload)
- [ ] Piece set persists after page refresh
- [ ] Custom piece renderer loads SVGs from `/pieces/{pieceSet}/{pieceCode}.svg`
- [ ] All 48 SVG files (12 per set × 4 sets) are present in `public/pieces/`
- [ ] Piece SVGs render at the correct size (passed via `squareWidth` prop to custom piece function)
- [ ] `ThemePicker` and `PieceSetPicker` have accessible names (aria-label on buttons)
- [ ] Settings page shows current selections as visually active

## react-chessboard Custom Pieces Pattern

```typescript
// ChessBoard.tsx pattern for customPieces
const customPieces = useMemo(() => {
  const pieces = ['wP','wN','wB','wR','wQ','wK','bP','bN','bB','bR','bQ','bK'];
  return Object.fromEntries(
    pieces.map(piece => [
      piece,
      ({ squareWidth }: { squareWidth: number }) => (
        <img
          src={`/pieces/${pieceSet}/${piece}.svg`}
          width={squareWidth}
          height={squareWidth}
          alt={piece}
        />
      )
    ])
  );
}, [pieceSet]);
```

## Dependencies

- Increment 1 complete (settingsStore with boardTheme + pieceSet exists, BOARD_THEME_COLORS defined)
- react-chessboard installed and ChessBoard component exists
- Piece SVG files sourced from Lichess GitHub (48 files total)

## Complexity

**M** — The piece set custom renderer with useMemo is moderately complex. Asset sourcing (48 SVG files) is the bulk of the work. The theme switching itself is trivial prop-passing.
