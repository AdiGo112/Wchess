# 06-Chat — Feature README

## Goal
Provide real-time text chat between two players during an active chess game, with message history, typing indicators, and basic abuse prevention.

## User stories
- As a player in a game, I can type a message and my opponent sees it instantly.
- As a player, I see "Opponent is typing..." when my opponent starts typing.
- As a player who rejoins after a browser refresh, I can see the last 50 messages from the current game.
- As a player, I cannot spam messages faster than 1 per second.
- As a player, profane messages are cleaned up before display.

## Dependencies
- 01-auth: WsJwtGuard authenticates chat socket connections; username comes from JWT
- 02-game-engine: game room Socket.io rooms (`game-{gameId}`) are reused for chat broadcasts; only game participants can chat

## Output artifacts

### Socket.io events (/chat namespace)
- Client emits: send_message, typing_start, typing_stop
- Server emits: message_received, typing_indicator, error

### REST endpoints
- GET /chat/:gameId/history — returns last 50 messages, paginated by cursor

### MongoDB collection
- `messages` — TTL index on createdAt, expires after 30 days
