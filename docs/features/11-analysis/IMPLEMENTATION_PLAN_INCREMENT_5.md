# Feature 11 — Increment 5: Post-Game Modal Integration

## Scope of Work

Integrate the analysis system into the game flow. When a game ends in `ChessGame.jsx`, analysis is automatically requested (fire-and-forget). The game over modal polls for analysis completion and displays the accuracy percentages for both players once available. The "View Full Analysis" button is added to the modal, initially showing a spinner, then becoming clickable when analysis completes.

## Files Modified

- `frontend/src/components/ChessGame.jsx` — fire `POST /analysis/request` on game end, poll for completion, update modal with accuracy stats and "View Full Analysis" button

## Acceptance Criteria

1. When a game ends, a `POST /analysis/request` is fired immediately (confirmed via browser network tab — 202 response expected).
2. The game over modal shows "Analyzing…" with a spinner while waiting.
3. After analysis completes (within 30 seconds for a typical game), the modal updates to show: "White Accuracy: 82.3% | Black Accuracy: 74.1%" (actual values from the API).
4. The "View Full Analysis" button appears and is clickable after analysis completes. Clicking it navigates to `/analysis/:gameId`.
5. If analysis fails (status 'failed'), the modal shows "Analysis unavailable" and the button is hidden — no unhandled error.
6. If the user closes the modal before analysis completes, the polling stops (cleanup on unmount).

## Complexity

**Small** — Minimal changes to an existing component. One API call on game end, one polling interval, one conditional render update in the modal. No new components created.
