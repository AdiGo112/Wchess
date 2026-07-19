# 03-Matchmaking — Increment 3 Prompt

Self-contained. Copy-paste to AI assistant.

---

Implement the matchmaking frontend lobby for ChessWeb.

## Current state
- Backend increments 1 and 2 complete. All matchmaking endpoints and socket events work.
- AuthContext exists (useAuth hook provides user and accessToken)
- React Router, Tailwind CSS, socket.io-client installed

## Build LobbyPage and supporting components

### useMatchmakingSocket hook
`frontend/src/hooks/useMatchmakingSocket.ts`:
- Connects to /matchmaking socket with auth.token
- On match_found: call navigate('/game/' + data.gameId)
- On challenge_accepted: call navigate('/game/' + data.gameId)
- Returns: { joinQueue, leaveQueue, position, isSearching, searchSeconds }

### LobbyPage
`frontend/src/pages/LobbyPage.tsx`

Layout: Three card sections side by side (or stacked on mobile).

**Card 1: Quick Match**
- Preset time controls as buttons: "1|0 Bullet", "2|1 Bullet", "3|0 Blitz", "5|0 Blitz", "10|0 Rapid", "30|0 Classical"
- Selected control highlighted
- "Find Game" button → joinQueue({ variant, timeControl, increment })
- When searching: show "Searching for opponent... (0:12)" with cancel button
- Show queue position if received: "Position: 3 in queue"
- On match_found: auto-navigates

**Card 2: Play a Friend**
- Variant and time control dropdowns
- Color choice: White / Black / Random (toggle buttons)
- "Create Challenge Link" button → POST /matchmaking/challenge → show shareUrl
- Copy to clipboard button (clipboard icon)
- "Waiting for opponent..." spinner after link created
- On challenge_accepted socket event: navigate to game

**Card 3: Play Computer**
- Difficulty slider: 1 (Beginner) → 5 (Expert)
- Difficulty labels under slider: Beginner, Easy, Medium, Hard, Expert
- Time control selector
- "Start Game" button → POST /matchmaking/computer → navigate to /game/:gameId

Write all files. Use Tailwind CSS for a clean dark-themed UI.
