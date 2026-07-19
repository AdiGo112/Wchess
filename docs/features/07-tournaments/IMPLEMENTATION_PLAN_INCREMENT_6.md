# Feature 07 — Tournaments: Increment 6 Implementation Plan

## Scope

Frontend: tournament list page (`/tournaments`), detail page (`/tournaments/:id`) with info, standings table, and join/leave, and the KO bracket visualization component.

## Files Created / Modified

| File | Action |
|------|--------|
| `frontend/src/pages/Tournaments.jsx` | Create |
| `frontend/src/pages/TournamentDetail.jsx` | Create |
| `frontend/src/components/TournamentBracket.jsx` | Create |
| `frontend/src/App.jsx` | Modify (add routes) |

## Acceptance Criteria

- [ ] `/tournaments` shows a list of tournaments with status/format filter buttons.
- [ ] "Create Tournament" button opens a modal form; submitting creates a tournament and refreshes the list.
- [ ] Clicking a tournament navigates to `/tournaments/:id`.
- [ ] `/tournaments/:id` shows tournament info header with name, format, status, time control.
- [ ] "Join" button appears for UPCOMING tournaments when the user is not yet registered. Clicking it calls `POST /tournaments/:id/join`.
- [ ] "Leave" button appears when the user is registered for an UPCOMING tournament. Clicking it calls `DELETE /tournaments/:id/leave`.
- [ ] After clicking Join/Leave, the button state updates immediately (optimistic UI) and confirms after API response.
- [ ] Standings table shows for ONGOING and COMPLETED tournaments: Rank | Player | Score | Buchholz.
- [ ] Current user's standings row is highlighted.
- [ ] Player list grid shows for UPCOMING tournaments.
- [ ] For KNOCKOUT format, `<TournamentBracket>` component renders a horizontal multi-round bracket.
- [ ] TournamentDetail auto-polls `GET /tournaments/:id` every 30 seconds while status is ONGOING.
- [ ] 409 TOURNAMENT_FULL displays a toast error.

## Complexity

**L (Large)** — Three new pages/components, polling, modal form, optimistic UI updates, and the bracket visualization component. Most complexity is in managing the various display states and the bracket rendering.
