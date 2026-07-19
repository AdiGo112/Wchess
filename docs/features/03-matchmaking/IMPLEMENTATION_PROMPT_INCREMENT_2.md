# 03-Matchmaking — Increment 2 Prompt

Self-contained. Copy-paste to AI assistant.

---

Implement Increment 2 of matchmaking: friend challenges and computer games (REST endpoints).

## Current state
Increment 1 is complete. Socket.io queue works. MatchmakingService is injectable.

## Prisma schema: add Challenge model
```prisma
model Challenge {
  id           String   @id @default(uuid())
  token        String   @unique
  creatorId    String
  creator      User     @relation(fields: [creatorId], references: [id])
  variant      String
  timeControl  Int
  increment    Int      @default(0)
  creatorColor String   @default("random")
  status       String   @default("pending")
  gameId       String?
  expiresAt    DateTime
  createdAt    DateTime @default(now())
  @@index([creatorId])
}
```

## MatchmakingController
`backend/src/matchmaking/matchmaking.controller.ts`:

```typescript
@Controller('matchmaking')
@UseGuards(JwtAuthGuard)
export class MatchmakingController {
  @Post('challenge')
  async createChallenge(@Body() dto: CreateChallengeDto, @Request() req) {
    const token = crypto.randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await this.prisma.challenge.create({
      data: { token, creatorId: req.user.userId, ...dto, status: 'pending', expiresAt },
    });
    const shareUrl = `${process.env.FRONTEND_URL}/challenge/${token}`;
    return { token, shareUrl, expiresAt };
  }

  @Post('challenge/:token/accept')
  async acceptChallenge(@Param('token') token: string, @Request() req) {
    const challenge = await this.prisma.challenge.findUnique({ where: { token } });
    if (!challenge) throw new NotFoundException({ code: 'CHALLENGE_NOT_FOUND' });
    if (new Date() > challenge.expiresAt) throw new GoneException({ code: 'CHALLENGE_EXPIRED' });
    if (challenge.status !== 'pending') throw new ConflictException({ code: 'CHALLENGE_ALREADY_ACCEPTED' });
    if (challenge.creatorId === req.user.userId) throw new ForbiddenException({ code: 'CANNOT_ACCEPT_OWN_CHALLENGE' });

    // Assign colors
    let whiteId: string, blackId: string;
    if (challenge.creatorColor === 'white') { whiteId = challenge.creatorId; blackId = req.user.userId; }
    else if (challenge.creatorColor === 'black') { whiteId = req.user.userId; blackId = challenge.creatorId; }
    else { [whiteId, blackId] = Math.random() < 0.5 ? [challenge.creatorId, req.user.userId] : [req.user.userId, challenge.creatorId]; }

    const gameId = crypto.randomUUID();
    await this.gameService.createGameRoom({ gameId, whiteId, blackId, variant: challenge.variant, timeControl: challenge.timeControl, increment: challenge.increment });
    await this.prisma.challenge.update({ where: { token }, data: { status: 'accepted', gameId } });

    // Notify creator via socket
    const creatorSocket = this.matchmakingService.getSocket(challenge.creatorId);
    creatorSocket?.emit('challenge_accepted', { gameId, color: whiteId === challenge.creatorId ? 'white' : 'black' });

    const acceptorColor = whiteId === req.user.userId ? 'white' : 'black';
    return { gameId, color: acceptorColor };
  }

  @Post('computer')
  async createComputerGame(@Body() dto: CreateComputerGameDto, @Request() req) {
    const gameId = crypto.randomUUID();
    await this.gameService.createComputerGameRoom({ gameId, userId: req.user.userId, difficulty: dto.difficulty, variant: dto.variant, timeControl: dto.timeControl });
    return { gameId };
  }
}
```

## Verification
```bash
# Create challenge
curl -X POST http://localhost:3000/matchmaking/challenge \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"variant":"rapid","timeControl":600,"increment":5,"creatorColor":"white"}'
# Expected: { token, shareUrl, expiresAt }

# Accept challenge (different user)
curl -X POST http://localhost:3000/matchmaking/challenge/{token}/accept \
  -H "Authorization: Bearer $TOKEN_B"
# Expected: { gameId, color: 'black' }

# Computer game
curl -X POST http://localhost:3000/matchmaking/computer \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{"difficulty":3,"variant":"blitz","timeControl":300}'
# Expected: { gameId }
```
