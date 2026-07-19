# 03-Matchmaking — Feature README

## Goal
Let players find opponents automatically (queue-based) or create games with friends or against Stockfish.

## User stories
- As a player, I click "Quick Match" for 5|0 blitz and am paired with an opponent of similar rating within 30 seconds.
- As a player, I can share a challenge link with a friend and start a game when they accept.
- As a player, I can start a game against the computer with a chosen difficulty.

## Dependencies
- 01-auth: all matchmaking requests require a valid JWT
- 02-game-engine: matchmaking calls GameService.createGameRoom() to initialize Redis state and routes both players to /game/:gameId
- 04-stockfish: computer games dispatch stockfish BullMQ jobs via GameGateway

## Output artifacts
### Socket.io events
Client emits: join_queue, leave_queue
Server emits: match_found, queue_position

### REST endpoints
- POST /matchmaking/challenge — create friend challenge link
- POST /matchmaking/challenge/:token/accept — accept a friend challenge
- POST /matchmaking/computer — create computer game immediately
- GET /matchmaking/queue-status — get current queue position and estimated wait
