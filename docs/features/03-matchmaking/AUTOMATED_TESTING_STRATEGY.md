# 03-Matchmaking — Automated Testing Strategy

## Unit tests
Test MatchmakingService with Redis mocked.
Key scenarios:
- enqueue adds entry to correct Redis List key
- dequeue removes entry from Redis
- pairPlayers returns a pair when rating difference <= tolerance
- pairPlayers returns null when no valid pair exists
- toleranceForWait returns correct values at t=0, t=15, t=30, t=60

## Integration tests
Use real Redis (test instance). Two socket.io-client instances.
Key scenarios:
- Two clients join same variant queue → both receive match_found within 5 polling cycles
- Client joins queue, disconnects → entry removed from Redis
- Rating difference exceeds 400 at t=0 → no match; after 30s wait sim → matched

## Frontend tests
Mock socket and API.
Key scenarios:
- Lobby shows "Searching..." state when in queue
- queue_position updates displayed correctly
- match_found redirects to /game/:gameId
- Challenge link copied to clipboard on click
- Computer difficulty selector maps to correct API payload
