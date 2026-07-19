# 02-Game-Engine — Implementation Prompt: Increment 1

Copy and paste this entire prompt to an AI coding assistant. Self-contained.

---

You are implementing Increment 1 of the chess game engine for ChessWeb. This covers the backend WebSocket gateway, move validation, server-side clock, and all terminal game states.

## Current state of codebase
- Auth feature is complete (JwtAuthGuard works for HTTP; you need to create WsJwtGuard for WebSockets)
- Redis is available via an injected `redisClient` (ioredis) in RedisModule
- PrismaService is injectable, User model exists
- chess.js is installed: `import { Chess } from 'chess.js'`
- NestJS 10, @nestjs/websockets, socket.io are installed

## What you are building
WebSocket game gateway with: join_room, move (with chess.js validation), clock management (setInterval server-side), and terminal state detection (checkmate, stalemate, timeout, resign). Do NOT implement draw flow or disconnect handling yet.

## Prisma schema additions

Add to schema.prisma:
```prisma
model Game {
  id                String   @id @default(uuid())
  whiteId           String
  blackId           String?
  white             User     @relation("WhiteGames", fields: [whiteId], references: [id])
  black             User?    @relation("BlackGames", fields: [blackId], references: [id])
  variant           String   @default("standard")
  timeControl       Int      // seconds
  increment         Int      @default(0)
  status            String   @default("ongoing")
  result            String?
  pgn               String?
  whiteRatingBefore Int
  blackRatingBefore Int      @default(1200)
  whiteRatingAfter  Int?
  blackRatingAfter  Int?
  startedAt         DateTime @default(now())
  endedAt           DateTime?
  moves             Move[]
  @@index([whiteId])
  @@index([blackId])
}

model Move {
  id         String   @id @default(uuid())
  gameId     String
  game       Game     @relation(fields: [gameId], references: [id], onDelete: Cascade)
  moveNumber Int
  color      String
  san        String
  from       String
  to         String
  promotion  String?
  fen        String
  timeTaken  Int
  createdAt  DateTime @default(now())
  @@index([gameId])
}
```

## WsJwtGuard

`backend/src/game/guards/ws-jwt.guard.ts`:
```typescript
@Injectable()
export class WsJwtGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}
  canActivate(context: ExecutionContext): boolean {
    const client: Socket = context.switchToWs().getClient();
    const token = client.handshake.auth?.token;
    if (!token) return false;
    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.sub;
      client.data.username = payload.username;
      return true;
    } catch {
      return false;
    }
  }
}
```

## GameService key methods

`backend/src/game/game.service.ts`:

```typescript
async createGameRoom(params: CreateGameRoomParams): Promise<void> {
  const state: GameRoom = {
    gameId: params.gameId,
    whiteId: params.whiteId,
    blackId: params.blackId,
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moves: [],
    whiteTime: params.timeControl * 1000,
    blackTime: params.timeControl * 1000,
    increment: params.increment * 1000,
    turn: 'white',
    status: 'active',
    variant: params.variant,
    timeControl: params.timeControl * 1000,
    pendingDraw: null,
    disconnectedAt: {},
  };
  await this.redis.set(`game:${params.gameId}`, JSON.stringify(state));
  await this.redis.expire(`game:${params.gameId}`, 60 * 60 * 24); // 24h TTL
}

async applyMove(gameId: string, userId: string, dto: MoveDto): Promise<MoveResult> {
  const raw = await this.redis.get(`game:${gameId}`);
  if (!raw) throw new WsException({ code: 'GAME_NOT_FOUND' });
  const state: GameRoom = JSON.parse(raw);

  // Verify turn
  const isWhite = state.whiteId === userId;
  const isBlack = state.blackId === userId;
  if ((state.turn === 'white' && !isWhite) || (state.turn === 'black' && !isBlack)) {
    throw new WsException({ code: 'NOT_YOUR_TURN' });
  }

  // Validate move with chess.js
  const chess = new Chess(state.fen);
  const result = chess.move({ from: dto.from, to: dto.to, promotion: dto.promotion });
  if (!result) throw new WsException({ code: 'ILLEGAL_MOVE' });

  // Update state
  const timeTaken = Date.now() - (state.lastMoveAt || state.startedAt);
  if (state.turn === 'white') {
    state.whiteTime = Math.max(0, state.whiteTime - timeTaken + state.increment);
  } else {
    state.blackTime = Math.max(0, state.blackTime - timeTaken + state.increment);
  }
  state.turn = state.turn === 'white' ? 'black' : 'white';
  state.fen = chess.fen();
  state.lastMoveAt = Date.now();
  state.moves.push({ san: result.san, from: dto.from, to: dto.to, promotion: dto.promotion, fen: chess.fen(), timeTaken, timestamp: Date.now() });

  // Check terminal
  let terminal: TerminalState | null = null;
  if (chess.isCheckmate()) terminal = { result: isWhite ? 'white_wins' : 'black_wins', reason: 'checkmate' };
  else if (chess.isStalemate()) terminal = { result: 'draw', reason: 'stalemate' };
  else if (chess.isInsufficientMaterial()) terminal = { result: 'draw', reason: 'insufficient' };
  else if (chess.isThreefoldRepetition()) terminal = { result: 'draw', reason: 'repetition' };

  if (terminal) {
    state.status = 'finished';
    await this.persistGame(state, terminal.result, terminal.reason);
  }

  await this.redis.set(`game:${gameId}`, JSON.stringify(state));
  return { move: result, newFen: chess.fen(), clocks: { white: state.whiteTime, black: state.blackTime }, terminal, isCheck: chess.isCheck() };
}
```

## ClockService

`backend/src/game/clock.service.ts`:
```typescript
@Injectable()
export class ClockService {
  private timers = new Map<string, NodeJS.Timeout>();
  private lastTick = new Map<string, number>();

  constructor(
    private gameService: GameService,
    @Inject('SOCKET_SERVER') private server: Server,
  ) {}

  startClock(gameId: string) {
    this.lastTick.set(gameId, Date.now());
    const timer = setInterval(async () => {
      const now = Date.now();
      const elapsed = now - (this.lastTick.get(gameId) || now);
      this.lastTick.set(gameId, now);

      const result = await this.gameService.tickClock(gameId, elapsed);
      if (!result) return; // game no longer active

      this.server.to(`game-${gameId}`).emit('clock_update', result.clocks);

      if (result.timeout) {
        this.stopClock(gameId);
        const gameOver = await this.gameService.handleTimeout(gameId, result.timeout);
        this.server.to(`game-${gameId}`).emit('game_over', gameOver);
      }
    }, 100);
    this.timers.set(gameId, timer);
  }

  stopClock(gameId: string) {
    const timer = this.timers.get(gameId);
    if (timer) { clearInterval(timer); this.timers.delete(gameId); }
  }
}
```

## GameGateway

`backend/src/game/game.gateway.ts`:
```typescript
@WebSocketGateway({ namespace: '/game', cors: { origin: '*' } })
@UseGuards(WsJwtGuard)
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private gameService: GameService, private clockService: ClockService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}, user: ${client.data.userId}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    // Increment 2 handles grace period
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(client: Socket, dto: { gameId: string }) {
    const state = await this.gameService.getGameState(dto.gameId);
    if (!state) { client.emit('error', { code: 'GAME_NOT_FOUND' }); return; }

    // Verify participant
    if (state.whiteId !== client.data.userId && state.blackId !== client.data.userId) {
      client.emit('error', { code: 'NOT_A_PARTICIPANT' }); return;
    }

    await client.join(`game-${dto.gameId}`);
    client.emit('game_state', state);

    // Start clock when both players joined
    const room = this.server.sockets.adapter.rooms.get(`game-${dto.gameId}`);
    if (room && room.size === 2) {
      this.clockService.startClock(dto.gameId);
    }
  }

  @SubscribeMessage('move')
  async handleMove(client: Socket, dto: MoveDto) {
    try {
      const result = await this.gameService.applyMove(dto.gameId, client.data.userId, dto);
      this.server.to(`game-${dto.gameId}`).emit('move_made', {
        fen: result.newFen,
        move: result.move,
        clocks: result.clocks,
        turn: result.turn,
        isCheck: result.isCheck,
      });
      if (result.terminal) {
        this.clockService.stopClock(dto.gameId);
        this.server.to(`game-${dto.gameId}`).emit('game_over', result.terminal);
      }
    } catch (err) {
      client.emit('error', { code: err.message?.code || 'UNKNOWN_ERROR' });
    }
  }

  @SubscribeMessage('resign')
  async handleResign(client: Socket, dto: { gameId: string }) {
    const result = await this.gameService.handleResign(dto.gameId, client.data.userId);
    this.clockService.stopClock(dto.gameId);
    this.server.to(`game-${dto.gameId}`).emit('game_over', result);
  }
}
```

## Verification
Use a Socket.io test client or Postman WS:
1. Connect two clients with valid JWTs
2. Both emit join_room with the same gameId
3. White emits move { gameId, from: 'e2', to: 'e4' }
4. Both clients receive move_made with updated FEN
5. White emits move again (wrong turn) → receive error NOT_YOUR_TURN
6. Play out a scholar's mate (4 moves) → receive game_over checkmate
