# Feature 07 — Tournaments: Increment 6 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 6 of the Tournaments feature for ChessWeb: the complete React frontend. The backend is fully working.

## Existing Codebase State

Backend REST endpoints available:
- `GET /tournaments?status=&format=&page=&limit=` → `{ data: TournamentSummary[], total, page, limit }`
- `GET /tournaments/:id` → `TournamentDetail` with `players[]`
- `POST /tournaments` → create (JWT required)
- `POST /tournaments/:id/join` → 201 or 409/400
- `DELETE /tournaments/:id/leave` → 200 or 400
- `GET /tournaments/:id/standings` → `StandingsDto[]` (rank, userId, username, score, buchholz)
- `GET /tournaments/:id/pairings?round=` → `PairingDto[]` (round, whitePlayerId, blackPlayerId, result)

Frontend structure:
- React 18, React Router v6, Tailwind CSS
- `frontend/src/lib/axios.js` — preconfigured axios instance (adds JWT header)
- `frontend/src/context/AuthContext.jsx` — provides `{ user: { id, username }, isAuthenticated }`
- `frontend/src/App.jsx` — add routes here

## Files to Create

### `frontend/src/pages/Tournaments.jsx`

Full page at route `/tournaments`:
- State: `tournaments` array, `statusFilter` ('ALL'|'UPCOMING'|'ONGOING'|'COMPLETED'), `formatFilter`, `page`, `isLoading`, `showCreateModal`
- On mount and filter change: call `GET /tournaments?status=...&format=...&page=1&limit=20`
- Filter row: 4 status toggle buttons + format dropdown
- Tournament grid: each card shows name, format badge (SWISS=blue, ARENA=orange, ROUND_ROBIN=purple, KNOCKOUT=red), status badge, `N/M players`, start time (formatted as "Jun 25 at 2:00 PM"), time control
- Click card → `navigate('/tournaments/:id')`
- "Create Tournament" button (only if authenticated) → set `showCreateModal = true`
- Create Tournament Modal (using a `<dialog>` or div overlay):
  - Fields: Name, Format (select), Time Control, Max Players, Start At (datetime-local)
  - Conditional "Max Rounds" field only when format === 'SWISS'
  - On submit: `POST /tournaments`, close modal, refresh list
- "Load More" button at bottom if `tournaments.length < total`

### `frontend/src/pages/TournamentDetail.jsx`

Full page at route `/tournaments/:id`:
- State: `tournament`, `standings`, `pairings`, `isJoining`, `isLeaving`, `error`
- On mount: fetch `GET /tournaments/:id` and `GET /tournaments/:id/standings` in parallel
- If `status === 'ONGOING'`: set up `setInterval(() => refetch(), 30000)` — clear on unmount
- Header section: name, format badge, status badge, time control, start time, "Created by {username}"
- **Join/Leave button** (only when authenticated AND `status === 'UPCOMING'`):
  - If `tournament.players.some(p => p.userId === user.id)`: show "Leave" button (DELETE, set `isLeaving` loading state)
  - Else: show "Join" button (POST, set `isJoining` loading state)
  - Error display: inline below button for 409/400 errors
- **Players list** (only when `status === 'UPCOMING'`): grid of `{username} ({rating})` — X/Y counter in header
- **Standings table** (when `status !== 'UPCOMING'`):
  ```
  Rank | Player | Score | Buchholz
   1   | alice  |  3.0  |   4.5    ← highlight if userId === user.id
   2   | bob    |  2.5  |   3.0
  ```
- **KO Bracket** (when `format === 'KNOCKOUT'`): `<TournamentBracket pairings={pairings} totalRounds={tournament.maxRounds} currentRound={tournament.currentRound} />`

### `frontend/src/components/TournamentBracket.jsx`

Props: `{ pairings, totalRounds, currentRound }`

Render a horizontal bracket. Group pairings by `round`. For each round, render a vertical column of match boxes. Use flexbox layout.

```jsx
function MatchBox({ pairing }) {
  return (
    <div className="border border-gray-300 rounded p-2 mb-2 w-40">
      <div className={`text-sm ${pairing.result === 'WHITE_WIN' ? 'font-bold' : ''}`}>
        {pairing.whiteUsername || '--'}
      </div>
      <div className="text-xs text-gray-400 text-center my-1">vs</div>
      <div className={`text-sm ${pairing.result === 'BLACK_WIN' ? 'font-bold' : ''}`}>
        {pairing.blackUsername || '--'}
      </div>
      {pairing.result && (
        <div className="text-xs text-center mt-1 text-green-600">
          {pairing.result === 'WHITE_WIN' ? `${pairing.whiteUsername} wins` :
           pairing.result === 'BLACK_WIN' ? `${pairing.blackUsername} wins` : 'Draw'}
        </div>
      )}
    </div>
  );
}

export function TournamentBracket({ pairings, totalRounds, currentRound }) {
  const rounds = Array.from({ length: totalRounds }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-8 p-4">
        {rounds.map(roundNum => (
          <div key={roundNum} className="flex flex-col items-center">
            <div className="text-sm font-semibold text-gray-500 mb-2">
              {roundNum === totalRounds ? 'Final' : roundNum === totalRounds - 1 ? 'Semi-Final' : `Round ${roundNum}`}
            </div>
            {pairings.filter(p => p.round === roundNum).map((p, i) => (
              <MatchBox key={i} pairing={p} />
            ))}
            {pairings.filter(p => p.round === roundNum).length === 0 && (
              <div className="w-40 h-16 border border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 text-xs">
                TBD
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Update App.jsx

```jsx
import { Tournaments } from './pages/Tournaments';
import { TournamentDetail } from './pages/TournamentDetail';

// Inside <Routes>:
<Route path="/tournaments" element={<Tournaments />} />
<Route path="/tournaments/:id" element={<TournamentDetail />} />
```

## Verification

1. Start backend and frontend.
2. Navigate to `/tournaments` — see empty state or existing tournaments.
3. Click "Create Tournament", fill form, submit — see new tournament appear in list.
4. Click the tournament — see detail page with player list and "Join" button.
5. Click "Join" — button changes to "Leave".
6. As a different user, join the same tournament — both players appear in the player list.
7. Wait for `startAt`, refresh detail page — status changes to ONGOING, standings table appears.
8. For a KNOCKOUT tournament, verify the bracket visualization renders the correct number of columns.
