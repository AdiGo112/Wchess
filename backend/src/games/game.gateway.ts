import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { Chess } from 'chess.js';
import { JwtService } from '@nestjs/jwt';
import { GamesService, ActiveRoom } from './games.service';
import { RedisService } from '../common/redis/redis.service';
import { StockfishService } from '../stockfish/stockfish.service';

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true },
  namespace: '/',
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(GameGateway.name);

  constructor(
    private gamesService: GamesService,
    private redis: RedisService,
    private jwtService: JwtService,
    private stockfish: StockfishService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string)?.replace('Bearer ', '') ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) { client.disconnect(); return; }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'fallback-secret',
      });

      client.data.userId = payload.sub;
      client.data.username = payload.username;

      await this.redis.set(`socket:${client.id}`, payload.sub, 3600);
      await this.redis.set(`user:socket:${payload.sub}`, client.id, 3600);
      await this.redis.set(`online:${payload.sub}`, '1', 30);

      this.logger.log(`Client connected: ${payload.username} (${client.id})`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;

    await this.redis.del(`socket:${client.id}`);
    await this.redis.del(`online:${userId}`);

    const roomId = client.data.roomId;
    if (roomId) {
      const room = await this.gamesService.getRoom(roomId);
      if (room && room.status === 'active') {
        this.server.to(roomId).emit('opponent_disconnected', { roomId, grace: 60000 });
      }
    }

    this.logger.log(`Client disconnected: ${userId}`);
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room) return client.emit('error', { message: 'Room not found' });

    client.join(data.roomId);
    client.data.roomId = data.roomId;

    if (room.status === 'waiting') {
      room.status = 'active';
      room.startedAt = Date.now();
      room.lastMoveAt = Date.now();
      await this.gamesService.setRoom(room);
    }

    this.server.to(data.roomId).emit('game_start', {
      roomId: room.id,
      white: room.whitePlayer,
      black: room.blackPlayer,
      fen: room.fen,
      timeControl: room.timeControl,
      increment: room.increment,
      timers: room.timers,
    });
  }

  @SubscribeMessage('move')
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; from: string; to: string; promotion?: string },
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room || room.status !== 'active') {
      return client.emit('invalid_move', { roomId: data.roomId, reason: 'Game not active' });
    }

    const userId = client.data.userId;
    const isWhite = room.whitePlayer.id === userId;
    const isBlack = room.blackPlayer?.id === userId;

    if (!isWhite && !isBlack) {
      return client.emit('invalid_move', { roomId: data.roomId, reason: 'Not a player' });
    }

    const chess = new Chess(room.fen);
    const turn = chess.turn();
    if ((turn === 'w' && !isWhite) || (turn === 'b' && !isBlack)) {
      return client.emit('invalid_move', { roomId: data.roomId, reason: 'Not your turn' });
    }

    // Update clock
    const now = Date.now();
    const elapsed = now - room.lastMoveAt;
    const color = turn === 'w' ? 'white' : 'black';
    room.timers[color] = Math.max(0, room.timers[color] - elapsed) + room.increment * 1000;

    if (room.timers[color] <= 0) {
      return this.endGame(room, turn === 'w' ? 'BLACK' : 'WHITE', 'TIMEOUT');
    }

    try {
      const moveResult = chess.move({
        from: data.from,
        to: data.to,
        promotion: data.promotion || 'q',
      });

      if (!moveResult) {
        return client.emit('invalid_move', { roomId: data.roomId, reason: 'Illegal move' });
      }

      room.fen = chess.fen();
      room.moves.push(moveResult.san);
      room.lastMoveAt = now;
      room.drawOfferedBy = null;

      await this.gamesService.setRoom(room);

      this.server.to(data.roomId).emit('move_made', {
        roomId: room.id,
        move: {
          from: data.from,
          to: data.to,
          san: moveResult.san,
          fen: room.fen,
          moveIndex: room.moves.length - 1,
        },
        fen: room.fen,
        timers: room.timers,
        check: chess.inCheck(),
      });

      // Check terminal states
      if (chess.isCheckmate()) {
        return this.endGame(room, turn === 'w' ? 'WHITE' : 'BLACK', 'CHECKMATE');
      }
      if (chess.isStalemate()) return this.endGame(room, 'DRAW', 'STALEMATE');
      if (chess.isInsufficientMaterial()) return this.endGame(room, 'DRAW', 'INSUFFICIENT_MATERIAL');
      if (chess.isThreefoldRepetition()) return this.endGame(room, 'DRAW', 'THREEFOLD_REPETITION');
      if (chess.isDraw()) return this.endGame(room, 'DRAW', 'FIFTY_MOVE');

      // Stockfish computer move
      if (room.blackPlayer?.id === 'computer' && chess.turn() === 'b') {
        await this.stockfish.queueMove({
          fen: room.fen,
          roomId: room.id,
          movetime: 1000,
        });
      }
    } catch (e) {
      client.emit('invalid_move', { roomId: data.roomId, reason: 'Invalid move format' });
    }
  }

  @SubscribeMessage('resign')
  async handleResign(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room || room.status !== 'active') return;

    const userId = client.data.userId;
    const result = room.whitePlayer.id === userId ? 'BLACK' : 'WHITE';
    await this.endGame(room, result as any, 'RESIGNATION');
  }

  @SubscribeMessage('offer_draw')
  async handleOfferDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room || room.status !== 'active') return;

    const userId = client.data.userId;
    const byColor = room.whitePlayer.id === userId ? 'white' : 'black';
    room.drawOfferedBy = byColor;
    await this.gamesService.setRoom(room);

    this.server.to(data.roomId).emit('draw_offered', { roomId: room.id, byColor });
  }

  @SubscribeMessage('accept_draw')
  async handleAcceptDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room || room.status !== 'active' || !room.drawOfferedBy) return;

    await this.endGame(room, 'DRAW', 'AGREEMENT');
  }

  @SubscribeMessage('decline_draw')
  async handleDeclineDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room) return;

    room.drawOfferedBy = null;
    await this.gamesService.setRoom(room);
    this.server.to(data.roomId).emit('draw_declined', { roomId: room.id });
  }

  @SubscribeMessage('claim_timeout')
  async handleClaimTimeout(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room || room.status !== 'active') return;

    const userId = client.data.userId;
    const chess = new Chess(room.fen);
    const turn = chess.turn();
    const isOpponentWhite = room.whitePlayer.id !== userId;

    const timedOutColor = isOpponentWhite ? 'white' : 'black';
    if (room.timers[timedOutColor] <= 0) {
      const winner = timedOutColor === 'white' ? 'BLACK' : 'WHITE';
      await this.endGame(room, winner as any, 'TIMEOUT');
    }
  }

  @SubscribeMessage('spectate')
  async handleSpectate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room) return client.emit('error', { message: 'Room not found' });

    client.join(`spec:${data.roomId}`);
    room.spectatorCount += 1;
    await this.gamesService.setRoom(room);

    client.emit('game_start', {
      roomId: room.id,
      white: room.whitePlayer,
      black: room.blackPlayer,
      fen: room.fen,
      timeControl: room.timeControl,
      timers: room.timers,
      moves: room.moves,
    });

    this.server.to(data.roomId).emit('spectator_count', {
      roomId: room.id,
      count: room.spectatorCount,
    });
  }

  async emitComputerMove(roomId: string, moveSan: string) {
    const room = await this.gamesService.getRoom(roomId);
    if (!room || room.status !== 'active') return;

    const chess = new Chess(room.fen);
    const move = chess.move(moveSan);
    if (!move) return;

    const now = Date.now();
    const elapsed = now - room.lastMoveAt;
    room.timers.black = Math.max(0, room.timers.black - elapsed);
    room.fen = chess.fen();
    room.moves.push(move.san);
    room.lastMoveAt = now;

    await this.gamesService.setRoom(room);

    this.server.to(roomId).emit('move_made', {
      roomId,
      move: { from: move.from, to: move.to, san: move.san, fen: room.fen, moveIndex: room.moves.length - 1 },
      fen: room.fen,
      timers: room.timers,
      check: chess.inCheck(),
    });

    if (chess.isCheckmate()) return this.endGame(room, 'BLACK', 'CHECKMATE');
    if (chess.isStalemate()) return this.endGame(room, 'DRAW', 'STALEMATE');
    if (chess.isDraw()) return this.endGame(room, 'DRAW', 'FIFTY_MOVE');
  }

  private async endGame(
    room: ActiveRoom,
    result: 'WHITE' | 'BLACK' | 'DRAW' | 'ABORTED',
    reason: string,
  ) {
    room.status = 'ended';
    await this.gamesService.setRoom(room);

    let ratingChanges = null;
    if (room.blackPlayer && room.blackPlayer.id !== 'computer') {
      ratingChanges = await this.gamesService.saveCompletedGame({ room, result, reason });
    }

    this.server.to(room.id).emit('game_over', {
      roomId: room.id,
      result: result.toLowerCase(),
      reason: reason.toLowerCase(),
      ratingChange: ratingChanges
        ? {
            white: { change: ratingChanges.whiteRatingChange, newRating: ratingChanges.newWhiteRating },
            black: { change: ratingChanges.blackRatingChange, newRating: ratingChanges.newBlackRating },
          }
        : null,
    });
  }
}
