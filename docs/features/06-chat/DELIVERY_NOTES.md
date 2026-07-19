# 06-Chat — Delivery Notes

## Acceptance criteria

- [ ] send_message event from a game participant results in a MongoDB document being created.
- [ ] send_message is broadcast as message_received to both players in the game room.
- [ ] A non-participant emitting send_message receives error NOT_A_PARTICIPANT.
- [ ] Messages longer than 500 characters receive error CONTENT_TOO_LONG.
- [ ] Two messages within 1 second from the same user: first succeeds, second returns RATE_LIMIT_EXCEEDED.
- [ ] Profane content is cleaned before storage and display (bad word replaced with ***).
- [ ] typing_start broadcasts typing_indicator { isTyping: true } to the opponent (not back to the sender).
- [ ] typing_stop broadcasts typing_indicator { isTyping: false }.
- [ ] Server auto-emits isTyping: false after 5 seconds if typing_stop is not received (e.g., browser crash).
- [ ] GET /chat/:gameId/history returns last 50 messages sorted by createdAt ascending.
- [ ] GET /chat/:gameId/history with before= cursor returns messages before that timestamp.
- [ ] MongoDB TTL index is set: messages older than 30 days are auto-deleted by MongoDB.

## Edge cases to handle

- Player A disconnects while typing: Server has a per-userId typing timeout (5s). When it fires, broadcast `typing_indicator { isTyping: false }` to the game room.
- Very long game (100+ messages): History endpoint uses cursor-based pagination. The client only loads 50 at a time; older messages are loaded on scroll-up.
- Player sends message after game ends: Game state may no longer be in Redis (deleted on game end). Check PostgreSQL Game table as fallback for participant verification.
- Unicode and emoji: MongoDB stores UTF-8 natively. Emoji count toward the 500-char limit as their Unicode codepoints.
- Same message from disconnected state: If the socket disconnects and reconnects mid-send, the client may retry. Rate limit prevents duplicate spam.

## Known limitations in v1

- No message reactions (thumbs up, etc.) — plain text only.
- No message deletion or editing.
- No reporting/flagging of messages.
- The profanity filter (bad-words library) only covers English; multilingual profanity not filtered.
- No push notifications for missed chat messages.

## Out of scope for v1

- Global/lobby chat between players not in an active game (see ADR-0014)
- Tournament chat rooms
- Friend DMs (direct messages outside of games)
- Message reactions
- File/image sharing
- Chat moderation tools for admins
