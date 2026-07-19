# 03-Matchmaking — Frontend Implementation Prompt

---

Implement the matchmaking frontend lobby for ChessWeb.

## What exists
- AuthContext, axios with interceptors
- React Router v6, Tailwind CSS, socket.io-client installed
- /game/:gameId route exists

## Build

### LobbyPage (`frontend/src/pages/LobbyPage.tsx`)
Sections:
1. Quick Match — variant selector (Bullet 1|0, Bullet 2|1, Blitz 3|0, Blitz 5|0, Rapid 10|0, Classic 30|0), "Find Game" button. When clicked: connect to /matchmaking socket, emit join_queue. Show "Searching..." with elapsed timer. Show queue_position if received. Cancel button calls leave_queue and disconnects.

2. Play a Friend — "Create Challenge" button. Shows share URL after POST /matchmaking/challenge. "Copy Link" button. Show "Waiting for opponent..." until challenge_accepted socket event. On accept: navigate to /game/:gameId.

3. Play Computer — Difficulty slider (1-5 with labels: Beginner/Easy/Medium/Hard/Expert). Time control selector. "Start Game" button → POST /matchmaking/computer → navigate to /game/:gameId.

### useMatchmakingSocket hook (`frontend/src/hooks/useMatchmakingSocket.ts`)
- Connects to /matchmaking namespace
- Handles: match_found (navigate to /game/:gameId), queue_position (update state), challenge_accepted (navigate)
- Exposes: joinQueue, leaveQueue, isConnected, position, isSearching

Write all files.
