import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { PrismaService } from '../common/prisma/prisma.service';

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true },
})
export class MatchmakingGateway implements OnGatewayInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MatchmakingGateway.name);
  private matchInterval: NodeJS.Timeout;

  constructor(
    private matchmaking: MatchmakingService,
    private prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    this.matchmaking.setServer(server);

    // Poll every 500ms for matches across all time controls
    this.matchInterval = setInterval(async () => {
      await Promise.all([
        this.matchmaking.tryMatch(60),   // bullet
        this.matchmaking.tryMatch(180),  // blitz 3min
        this.matchmaking.tryMatch(300),  // blitz 5min
        this.matchmaking.tryMatch(600),  // blitz 10min
        this.matchmaking.tryMatch(900),  // rapid 15min
        this.matchmaking.tryMatch(1800), // rapid 30min
        this.matchmaking.tryMatch(3600), // classical
      ]);
    }, 500);
  }

  @SubscribeMessage('join_queue')
  async handleJoinQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { timeControl: number },
  ) {
    const userId = client.data.userId;
    const username = client.data.username;
    if (!userId) return;

    const rating = await this.getUserRating(userId, data.timeControl);

    await this.matchmaking.joinQueue({
      userId,
      username,
      rating,
      socketId: client.id,
      joinedAt: Date.now(),
      timeControl: data.timeControl,
    });

    client.emit('queued', { timeControl: data.timeControl });
    this.logger.log(`${username} joined queue for ${data.timeControl}s`);
  }

  @SubscribeMessage('leave_queue')
  async handleLeaveQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { timeControl: number },
  ) {
    const userId = client.data.userId;
    if (!userId) return;
    await this.matchmaking.leaveQueue(userId, data.timeControl);
    client.emit('left_queue', {});
  }

  @SubscribeMessage('create_room')
  async handleCreateRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { timeControl: number; vsComputer: boolean; difficulty?: number },
  ) {
    const userId = client.data.userId;
    const username = client.data.username;
    if (!userId) return;

    const rating = await this.getUserRating(userId, data.timeControl);

    const movetime = data.difficulty === 1 ? 100 : data.difficulty === 3 ? 3000 : 1000;

    const { GamesService } = await import('../games/games.service');
    const room = await (this as any).gamesService.createRoom(
      { id: userId, username, rating },
      data.vsComputer
        ? { id: 'computer', username: 'Stockfish', rating: 2800 }
        : null,
      data.timeControl,
    );

    client.emit('room_created', { roomId: room.id, color: 'white' });
  }

  private async getUserRating(userId: string, timeControl: number): Promise<number> {
    const variantMap: Record<number, string> = {};
    let variant = 'BLITZ';
    if (timeControl < 180) variant = 'BULLET';
    else if (timeControl < 600) variant = 'BLITZ';
    else if (timeControl < 1800) variant = 'RAPID';
    else variant = 'CLASSICAL';

    const r = await this.prisma.userRating.findUnique({
      where: { userId_variant: { userId, variant: variant as any } },
    });
    return r?.rating ?? 1200;
  }
}
