# 09-Social — Workflows

## 1. Send Friend Request

```
Actor: User A (requesterId)
Trigger: POST /friends/request { addresseeId: "userB_id" }

Step 1: FriendshipsController receives request
  - Extracts requesterId from JWT (req.user.sub)
  - Passes to FriendshipService.sendRequest(requesterId, addresseeId)

Step 2: FriendshipService.sendRequest()
  - Guard: if requesterId === addresseeId → throw BadRequestException("Cannot send friend request to yourself")
  - Guard: check prisma.user.findUnique({ where: { id: addresseeId } })
          if null → throw NotFoundException("User not found")
  - Guard: check for BLOCKED row where either direction involves both users
          SELECT * FROM Friendship WHERE
            (requesterId = A AND addresseeId = B) OR (requesterId = B AND addresseeId = A)
          if found AND status = BLOCKED → throw ForbiddenException("Cannot send request to this user")
  - Attempt: prisma.friendship.create({ data: { requesterId, addresseeId, status: PENDING } })
  - On Prisma P2002 (unique constraint violation) → throw ConflictException("Friend request already exists")

Step 3: Emit Socket.io event to User B
  - Look up User B's connected socket IDs from PresenceGateway's socket map
  - Emit 'friend_request_received' to User B's sockets:
    { friendship: { id, requesterId, requesterUsername, createdAt } }

Step 4: Return 201 with the created Friendship row
```

---

## 2. Accept Friend Request

```
Actor: User B (addresseeId)
Trigger: POST /friends/:id/accept (id = friendship row id)

Step 1: FriendshipsController receives request
  - Extracts currentUserId from JWT

Step 2: FriendshipService.acceptRequest(friendshipId, currentUserId)
  - Fetch: prisma.friendship.findUnique({ where: { id: friendshipId }, include: { requester: true } })
  - Guard: if not found → throw NotFoundException
  - Guard: if friendship.addresseeId !== currentUserId → throw ForbiddenException("Only the addressee can accept a request")
  - Guard: if friendship.status !== 'PENDING' → throw ConflictException("Request is not in PENDING status")
  - Update: prisma.friendship.update({ where: { id: friendshipId }, data: { status: 'ACCEPTED' } })

Step 3: Emit Socket.io event to User A (the original requester)
  - Emit 'friend_accepted' to User A's connected sockets:
    { friendship: { id, addresseeId, addresseeUsername } }

Step 4: Return 200 with the updated Friendship row
```

---

## 3. Decline Friend Request

```
Actor: User B (addresseeId)
Trigger: POST /friends/:id/decline

Step 1: FriendshipService.declineRequest(friendshipId, currentUserId)
  - Fetch friendship row
  - Guard: addresseeId !== currentUserId → 403
  - Guard: status !== 'PENDING' → 409
  - Update: status = 'DECLINED'
  - No Socket.io event emitted (silent decline)

Step 2: Return 200 { id, status: 'DECLINED' }

Note: Row is kept (not deleted) to prevent User A from re-sending immediately.
```

---

## 4. Block User

```
Actor: User A or User B (either party can block)
Trigger: POST /friends/:id/block

Step 1: FriendshipService.blockUser(friendshipId, currentUserId)
  - Fetch friendship row
  - Guard: currentUserId is neither requesterId nor addresseeId → 403
  - Update: status = 'BLOCKED'
  - Store blockerId separately if needed (future: add blockerId field to schema)

Step 2: Return 200 { id, status: 'BLOCKED' }

Note: If the existing row has requesterId=A, addresseeId=B and B blocks A,
the row is updated to BLOCKED. B's view filters out BLOCKED rows where B is
the non-blocking party. Service layer enforces this with:
  getFriends() → exclude BLOCKED rows entirely
  When returning BLOCKED rows, only show to the user who set the block.
```

---

## 5. Unfriend

```
Actor: User A or User B
Trigger: DELETE /friends/:id

Step 1: FriendshipService.unfriend(friendshipId, currentUserId)
  - Fetch friendship row
  - Guard: currentUserId is neither requesterId nor addresseeId → 403
  - Guard: status !== 'ACCEPTED' → 400 (can only unfriend accepted friends)
  - Delete: prisma.friendship.delete({ where: { id: friendshipId } })

Step 2: Return 200 { message: 'Unfriended successfully' }

Note: Row is deleted (unlike decline, which keeps the row). This allows
either party to send a new request in the future.
```

---

## 6. Online Presence Heartbeat (Normal Flow)

```
Actor: Logged-in client browser
Trigger: Socket.io connection to /presence namespace + periodic heartbeat

Step 1: Client connects
  socket = io('/presence', { auth: { token: accessToken } })
  - Server PresenceGateway.handleConnection(client):
    - Validate JWT from client.handshake.auth.token
    - Extract userId
    - Store socket → userId mapping: Map<socketId, userId>
    - Store userId → Set<socketId> mapping (one user can have multiple tabs)
    - Call presenceService.setOnline(userId): SET user:{userId}:online "1" EX 35
    - If this is the first socket for this user (user was offline):
        Get friend IDs from FriendshipService.getFriendIds(userId)
        Emit 'friend_online' { userId } to all friends' connected sockets

Step 2: Client emits heartbeat every 25s
  setInterval(() => socket.emit('heartbeat'), 25000)
  - Server PresenceGateway.handleHeartbeat(client):
    - Look up userId from socketId map
    - presenceService.setOnline(userId): SET user:{userId}:online "1" EX 35 (refreshes TTL)

Step 3: Client disconnects gracefully (tab close, navigation)
  - Server PresenceGateway.handleDisconnect(client):
    - Look up userId from socketId map
    - Remove socketId from userId → Set<socketId> map
    - If Set is now empty (no more active sockets for this user):
        presenceService.setOffline(userId): DEL user:{userId}:online
        Get friend IDs from FriendshipService.getFriendIds(userId)
        Emit 'friend_offline' { userId } to all friends' connected sockets
    - Remove socketId from socket → userId map

Step 4: Client disconnects ungracefully (browser crash, network loss)
  - handleDisconnect still fires in most cases (Socket.io detects TCP close)
  - If handleDisconnect does not fire: Redis TTL expires after 35s
  - No 'friend_offline' event is emitted in this case — friends see the user
    go offline only when they next check presence (e.g., page reload, GET /friends)
  - Future: Redis keyspace notifications (CONFIG SET notify-keyspace-events KEx)
    can trigger a server-side callback to emit 'friend_offline' on TTL expiry
```

---

## 7. Load Activity Feed (Initial Page Load)

```
Actor: Logged-in user
Trigger: GET /feed (no cursor = first page)

Step 1: ActivityFeedController receives request
  - Extracts userId from JWT

Step 2: ActivityFeedService.getFeed(userId, cursor=undefined, limit=20)
  - Fetch friend IDs: await friendshipService.getFriendIds(userId)
    → SELECT addresseeId/requesterId FROM Friendship
       WHERE (requesterId=userId OR addresseeId=userId) AND status='ACCEPTED'
    → Returns: ['friendId1', 'friendId2', ...]

  - If no friends → return { entries: [], nextCursor: null, hasMore: false }

  - Query MongoDB:
    activityFeedModel.find({
      actorId: { $in: friendIds },
      // no cursor filter on first page
    })
    .sort({ _id: -1 })
    .limit(limit + 1)  // fetch one extra to determine hasMore
    .exec()

  - If results.length > limit:
      hasMore = true
      entries = results.slice(0, limit)
    else:
      hasMore = false
      entries = results

  - nextCursor = hasMore ? entries[entries.length - 1]._id.toString() : null

Step 3: Return { entries, nextCursor, hasMore }
```

---

## 8. Load Next Page of Activity Feed (Cursor Pagination)

```
Trigger: GET /feed?cursor=6672a1b2c3d4e5f6a7b8c9c0&limit=20

Step 2 (differs from above):
  - Query MongoDB:
    activityFeedModel.find({
      actorId: { $in: friendIds },
      _id: { $lt: new Types.ObjectId(cursor) }  // entries older than cursor
    })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .exec()

  - Same hasMore logic as above
```

---

## 9. Publish Activity Feed Entry (Game Completion)

```
Actor: GameService (internal, not user-triggered)
Trigger: GameService.endGame(gameId, result)

Step 1: GameService determines winner and loser

Step 2: GameService calls ActivityFeedService.publish() for the winner:
  activityFeedService.publish({
    actorId: winner.id,
    actorUsername: winner.username,
    type: ActivityType.GAME_WON,
    targetId: gameId,
    targetName: loser.username,
    metadata: {
      result: 'WIN',
      timeControl: game.timeControl,
      ratingChange: winner.ratingChange,
      opponent: loser.username,
    },
    createdAt: new Date(),
  })

Step 3: GameService calls ActivityFeedService.publish() for the loser:
  activityFeedService.publish({
    actorId: loser.id,
    actorUsername: loser.username,
    type: ActivityType.GAME_LOST,
    targetId: gameId,
    targetName: winner.username,
    metadata: {
      result: 'LOSS',
      timeControl: game.timeControl,
      ratingChange: loser.ratingChange,
      opponent: winner.username,
    },
    createdAt: new Date(),
  })

Step 4: ActivityFeedService.publish():
  activityFeedModel.create(entry)
  // Fire-and-forget; errors are logged but not thrown to caller
```

---

## 10. Search Users and Send Friend Request (Full UX Flow)

```
Actor: Logged-in user
Trigger: Types in UserSearchBar on /friends page

Step 1: UserSearchBar debounces 300ms, fires GET /users/search?q=ada
  - UsersController → UsersService.searchUsers(q, currentUserId)
  - Prisma: findMany({
      where: { username: { contains: q, mode: 'insensitive' }, id: { not: currentUserId } },
      take: 10
    })
  - Enrich each result: check for existing Friendship row to set isFriend, hasPendingRequest
  - Return up to 10 results

Step 2: User clicks "Add Friend" on a result
  - Frontend fires POST /friends/request { addresseeId }
  - On 201: update React Query cache for /friends/requests/outgoing
  - Disable "Add Friend" button on that result, show "Request Sent"

Step 3: (Other browser — addressee's perspective)
  - Socket.io 'friend_request_received' event arrives
  - Zustand: pendingRequests count increments
  - Badge on "Requests" tab updates

Step 4: Addressee goes to Requests tab, clicks "Accept"
  - Frontend fires POST /friends/:id/accept
  - On 200: invalidate React Query cache for /friends and /friends/requests/incoming

Step 5: (Requester's browser)
  - Socket.io 'friend_accepted' event arrives
  - React Query cache for /friends is invalidated → refetch shows new friend
```
