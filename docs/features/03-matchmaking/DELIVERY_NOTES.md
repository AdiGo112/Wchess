# 03-Matchmaking — Delivery Notes

## Acceptance criteria
- [ ] Player joins queue; receives queue_position updates every 5 seconds.
- [ ] Two players with similar ratings are matched within 30 seconds.
- [ ] Matched players receive match_found with correct gameId and color.
- [ ] Matched players are removed from queue before game room is created.
- [ ] Rating tolerance grows from ±50 at t=0 to ±400 at t=30s.
- [ ] Player can leave queue; receives no further match_found events.
- [ ] POST /matchmaking/challenge returns a shareable token.
- [ ] POST /matchmaking/challenge/:token/accept creates a game and returns gameId.
- [ ] Creator cannot accept their own challenge.
- [ ] Expired challenges (>10 min) return 404.
- [ ] POST /matchmaking/computer creates a game with blackId=null immediately.
- [ ] Computer games store difficulty in Redis state.

## Edge cases
- Player disconnects while in queue: remove their entry from Redis on socket disconnect.
- Two players match simultaneously: use Redis LREM atomically to prevent double-match.
- Rating tolerance: a new player at 1200 vs. an established 1600 player who has waited 30s — they can be matched (tolerance is per-player, use the smaller of the two).

## Known limitations in v1
- No ELO-bracket matching: players are matched purely on rating proximity, not win/loss streaks.
- No rematch via queue: rematch is handled in the game UI directly (creates a new room).
- Queue only supports rated games in v1.

## Out of scope for v1
- Lobby chat while in queue
- Tournament matchmaking (see 07-tournaments)
- Spectator queue
- Unrated games in public queue
