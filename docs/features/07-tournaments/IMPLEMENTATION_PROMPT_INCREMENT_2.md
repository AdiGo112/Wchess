# Feature 07 — Tournaments: Increment 2 Implementation Prompt

Copy and paste the following prompt into a fresh AI conversation. It is fully self-contained.

---

You are implementing Increment 2 of the Tournaments feature for ChessWeb. Increment 1 is complete: Tournament and TournamentPlayer Prisma models exist and basic CRUD works. This increment adds join/leave endpoints and the standings endpoint.

## Existing Codebase State

- `backend/src/tournaments/tournaments.service.ts` has `create()`, `findAll()`, `findOne()` methods
- `backend/src/tournaments/tournaments.controller.ts` has GET `/tournaments` and POST `/tournaments` routes
- Prisma `Tournament` and `TournamentPlayer` models exist with `status` (UPCOMING/ONGOING/COMPLETED), `maxPlayers`, `score`, `buchholz` fields
- `JwtAuthGuard` and `CurrentUser` decorator available from `backend/src/auth/`

## Methods to Add to TournamentsService

### `async join(tournamentId: string, userId: string): Promise<void>`

```typescript
async join(tournamentId: string, userId: string): Promise<void> {
  const tournament = await this.prisma.tournament.findUnique({
    where: { id: tournamentId },
    include: { _count: { select: { players: true } } },
  });
  if (!tournament) throw new NotFoundException('Tournament not found');
  if (tournament.status !== 'UPCOMING') {
    throw new BadRequestException('NOT_UPCOMING: Can only join UPCOMING tournaments');
  }
  if (tournament._count.players >= tournament.maxPlayers) {
    throw new ConflictException('TOURNAMENT_FULL: Tournament has reached maximum players');
  }
  try {
    await this.prisma.tournamentPlayer.create({
      data: { tournamentId, userId },
    });
  } catch (e) {
    // Prisma unique constraint violation
    if (e.code === 'P2002') {
      throw new ConflictException('ALREADY_JOINED: You have already joined this tournament');
    }
    throw e;
  }
}
```

### `async leave(tournamentId: string, userId: string): Promise<void>`

```typescript
async leave(tournamentId: string, userId: string): Promise<void> {
  const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new NotFoundException('Tournament not found');
  if (tournament.status !== 'UPCOMING') {
    throw new BadRequestException('NOT_UPCOMING: Can only leave UPCOMING tournaments');
  }
  const deleted = await this.prisma.tournamentPlayer.deleteMany({
    where: { tournamentId, userId },
  });
  if (deleted.count === 0) {
    throw new BadRequestException('NOT_REGISTERED: You are not registered for this tournament');
  }
}
```

### `async getStandings(tournamentId: string): Promise<StandingsDto[]>`

```typescript
async getStandings(tournamentId: string): Promise<StandingsDto[]> {
  const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw new NotFoundException('Tournament not found');
  
  const players = await this.prisma.tournamentPlayer.findMany({
    where: { tournamentId },
    include: { user: { select: { id: true, username: true } } },
    orderBy: [{ score: 'desc' }, { buchholz: 'desc' }, { joinedAt: 'asc' }],
  });
  
  return players.map((p, index) => ({
    rank: index + 1,
    userId: p.userId,
    username: p.user.username,
    score: p.score,
    buchholz: p.buchholz,
    gamesPlayed: 0, // Will be computed in future increments when games exist
  }));
}
```

## Routes to Add to TournamentsController

```typescript
@Post(':id/join')
@UseGuards(JwtAuthGuard)
@HttpCode(201)
async join(@Param('id') id: string, @CurrentUser() user: User) {
  await this.tournamentsService.join(id, user.id);
  return { message: 'Joined' };
}

@Delete(':id/leave')
@UseGuards(JwtAuthGuard)
@HttpCode(200)
async leave(@Param('id') id: string, @CurrentUser() user: User) {
  await this.tournamentsService.leave(id, user.id);
  return { message: 'Left' };
}

@Get(':id/standings')
async getStandings(@Param('id') id: string) {
  return this.tournamentsService.getStandings(id);
}
```

## Verification

```bash
TOKEN="<your-jwt>"
ID="<tournament-uuid>"

# Join
curl -X POST http://localhost:3000/tournaments/$ID/join \
  -H "Authorization: Bearer $TOKEN"
# Expected: 201 { message: 'Joined' }

# Join again (duplicate)
curl -X POST http://localhost:3000/tournaments/$ID/join \
  -H "Authorization: Bearer $TOKEN"
# Expected: 409 ALREADY_JOINED

# Standings
curl http://localhost:3000/tournaments/$ID/standings
# Expected: [ { rank: 1, userId, username, score: 0, buchholz: 0, gamesPlayed: 0 } ]

# Leave
curl -X DELETE http://localhost:3000/tournaments/$ID/leave \
  -H "Authorization: Bearer $TOKEN"
# Expected: 200 { message: 'Left' }

# Leave again
curl -X DELETE http://localhost:3000/tournaments/$ID/leave \
  -H "Authorization: Bearer $TOKEN"
# Expected: 400 NOT_REGISTERED
```
