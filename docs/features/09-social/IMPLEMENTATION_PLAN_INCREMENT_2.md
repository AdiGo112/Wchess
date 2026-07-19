# Feature 09 — Social: Increment 2 Implementation Plan

## Scope

Implement the `FriendshipsModule` with full CRUD service logic (send request, accept, decline, block, unfriend, list friends with online status, list pending requests) and REST controller. All endpoints are JWT-guarded. The `PresenceService` is injected but its Redis logic is not yet implemented — `getOnlineStatus` returns a placeholder array of `false` values until Increment 3. Unit tests for `FriendshipService` are also written in this increment.

## Files Created / Modified

| File | Action |
|------|--------|
| `src/friendships/friendships.module.ts` | Created |
| `src/friendships/friendships.service.ts` | Created |
| `src/friendships/friendships.controller.ts` | Created |
| `src/friendships/dto/send-friend-request.dto.ts` | Created |
| `src/friendships/dto/friendship-response.dto.ts` | Created |
| `src/friendships/friendships.service.spec.ts` | Created |
| `src/app.module.ts` | Modified — import `FriendshipsModule` |

## Steps

### Step 1: Create `FriendshipsModule`

Import `PrismaModule` and `PresenceModule` (stub for now — see Increment 3). Export nothing (service is consumed internally by the controller).

### Step 2: Implement `FriendshipService`

Methods:
- `sendRequest(requesterId, addresseeId)` — guard self-request, guard user existence, guard BLOCKED, create PENDING row, catch P2002
- `acceptRequest(friendshipId, currentUserId)` — guard ownership, guard PENDING status, update to ACCEPTED
- `declineRequest(friendshipId, currentUserId)` — guard ownership, update to DECLINED
- `blockUser(friendshipId, currentUserId)` — guard party membership, update to BLOCKED
- `unfriend(friendshipId, currentUserId)` — guard party membership, guard ACCEPTED status, delete row
- `getFriends(userId)` — OR query, bulk presence lookup via `PresenceService.getOnlineStatus`
- `getFriendIds(userId)` — OR query returning IDs only; used by ActivityFeed and Presence
- `getIncomingRequests(userId)` — PENDING rows where `addresseeId = userId`
- `getOutgoingRequests(userId)` — PENDING rows where `requesterId = userId`

### Step 3: Implement `FriendshipsController`

Route prefix: `/social/friends`

| Method | Route | Handler |
|--------|-------|---------|
| POST | `/request` | `sendRequest` |
| POST | `/:id/accept` | `acceptRequest` |
| POST | `/:id/decline` | `declineRequest` |
| DELETE | `/:id` | `unfriend` |
| POST | `/:id/block` | `blockUser` |
| GET | `/` | `getFriends` |
| GET | `/requests/incoming` | `getIncomingRequests` |
| GET | `/requests/outgoing` | `getOutgoingRequests` |

All routes use `@UseGuards(JwtAuthGuard)`. Extract `userId` from `@Request() req` as `req.user.sub`.

### Step 4: Write unit tests

See `AUTOMATED_TESTING_STRATEGY.md` for the full test case list.

## Acceptance Criteria

- [ ] `POST /social/friends/request` returns 201 with PENDING friendship
- [ ] `POST /social/friends/request` with own ID returns 400
- [ ] `POST /social/friends/request` duplicate returns 409
- [ ] `POST /social/friends/:id/accept` returns 200 with ACCEPTED friendship
- [ ] `POST /social/friends/:id/accept` by non-addressee returns 403
- [ ] `POST /social/friends/:id/decline` returns 200 with DECLINED
- [ ] `POST /social/friends/:id/block` returns 200 with BLOCKED
- [ ] `DELETE /social/friends/:id` returns 200 with success message
- [ ] `GET /social/friends` returns friends list (isOnline all false until Increment 3)
- [ ] `GET /social/friends/requests/incoming` returns pending requests
- [ ] All endpoints return 401 without a valid JWT
- [ ] Unit tests pass with `npm run test`

## Complexity

**M** — Multiple methods with distinct guard logic. The BLOCKED bidirectionality check (must query both orderings) is the trickiest part. The OR query for `getFriends` and the "extract the other user" mapping require care.
