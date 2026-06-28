import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { JoinQueueDto, LeaveQueueDto } from './dto/join-queue.dto';

/**
 * Shares the default Socket.io namespace with GameGateway, which authenticates
 * the handshake and populates `client.data.userId` / `client.data.username`.
 */
@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
})
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class MatchmakingGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MatchmakingGateway.name);

  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    // The polling loop lives in the service; the gateway only lends it the
    // server instance so it can emit `match_found`.
    this.matchmaking.setServer(server);
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    // Single-queue invariant means at most one entry, but sweep all queues so
    // a leaked entry can never outlive the socket.
    if (userId) {
      await this.matchmaking.leaveAllQueues(userId);
    }
  }

  @SubscribeMessage('join_queue')
  async handleJoinQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: JoinQueueDto,
  ) {
    const userId = client.data.userId;
    const username = client.data.username;
    if (!userId) {
      return client.emit('error', { message: 'Not authenticated' });
    }

    const variant = this.matchmaking.variantOf(data.timeControl);
    const rating = await this.getUserRating(userId, variant);

    await this.matchmaking.enqueue({
      userId,
      username,
      rating,
      socketId: client.id,
      enqueuedAt: Date.now(),
      variant,
      timeControl: data.timeControl,
      increment: data.increment ?? 0,
    });

    client.emit('queued', { variant, timeControl: data.timeControl });
  }

  @SubscribeMessage('leave_queue')
  async handleLeaveQueue(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LeaveQueueDto,
  ) {
    const userId = client.data.userId;
    if (!userId) return;

    const variant = this.matchmaking.variantOf(data.timeControl);
    await this.matchmaking.dequeue(userId, variant, data.timeControl);

    client.emit('left_queue', { variant, timeControl: data.timeControl });
  }

  /** Glicko-2 rating for the queue's variant; 1200 default if unrated. */
  private async getUserRating(
    userId: string,
    variant: string,
  ): Promise<number> {
    const row = await this.prisma.userRating.findUnique({
      where: {
        userId_variant: { userId, variant: variant.toUpperCase() as any },
      },
    });
    return row?.rating ?? 1200;
  }
}
