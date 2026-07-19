# 03-Matchmaking — Workflows

## Workflow 1: Quick Match

1. Player opens the lobby page and selects time control (e.g., 5|0 Blitz).
2. Player clicks "Find Game".
3. Frontend connects to Socket.io /matchmaking namespace and emits join_queue { variant: 'blitz', timeControl: 300, increment: 0 }.
4. MatchmakingService.enqueue(): builds QueueEntry with player's current rating, pushes to Redis List `queue:blitz:300`.
5. Server emits queue_position { position: N, estimatedWait: N*15 } every 5 seconds while waiting.
6. Every 500ms, MatchmakingService scans active queues:
   a. Loads all entries for each queue variant.
   b. Sorts by enqueuedAt.
   c. For each pair, checks rating difference <= tolerance(waitSeconds).
   d. First valid pair is matched.
7. When paired: GameService.createGameRoom(gameId, whiteId, blackId, variant, timeControl, increment) initializes Redis state.
8. Both players receive match_found { gameId, color, opponent: { username, rating } }.
9. Frontend redirects to /game/:gameId.

## Workflow 2: Friend Challenge

1. Player A opens lobby, clicks "Challenge a Friend".
2. Frontend calls POST /matchmaking/challenge { variant: 'rapid', timeControl: 600, increment: 5, creatorColor: 'white' }.
3. Server generates 16-byte random token, stores Challenge in PostgreSQL, returns { token, shareUrl: '/challenge/:token', expiresAt }.
4. Player A shares the URL (copy to clipboard or share button).
5. Player B opens the URL. Frontend calls POST /matchmaking/challenge/:token/accept.
6. Server validates token (exists, not expired, not creator): if valid, calls GameService.createGameRoom(), updates Challenge.status = 'accepted', Challenge.gameId = gameId.
7. Response includes { gameId, color } for Player B.
8. Player A is notified via Socket.io (challenge_accepted event) with same gameId and their color.
9. Both players navigate to /game/:gameId.

## Workflow 3: Computer Game

1. Player opens lobby, clicks "Play vs Computer".
2. Player selects difficulty (1-5) and time control.
3. Frontend calls POST /matchmaking/computer { difficulty: 3, variant: 'blitz', timeControl: 300 }.
4. Server calls GameService.createGameRoom(gameId, userId, null, variant, timeControl, 0) — blackId is null for computer games.
5. Server stores difficulty in Redis game state for the Stockfish worker.
6. Response: { gameId }.
7. Frontend navigates to /game/:gameId.
8. In the game, after white's first move, GameGateway dispatches a BullMQ job for Stockfish to compute black's move.
