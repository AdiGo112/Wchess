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
import { Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Chess } from 'chess.js';
import { JwtService } from '@nestjs/jwt';
import { GamesService, ActiveRoom, CLOCK_GRACE_MS } from './games.service';
import { RedisService } from '../common/redis/redis.service';

/** How many times a handler re-runs itself after losing a CAS race. */
const CAS_RETRIES = 3;
const SWEEP_INTERVAL_MS = 1000;

@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN || 'http://localhost:5173', credentials: true },
  namespace: '/',
})
export class GameGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(GameGateway.name);
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private gamesService: GamesService,
    private redis: RedisService,
    private jwtService: JwtService,
  ) {}

  onModuleInit() {
    // ADR-0004 addendum: one sweeper over the clock:deadlines ZSET instead of
    // one setInterval per game. Deadlines live in Redis, so they survive a
    // restart — a game whose player vanished still flags on schedule.
    this.sweepTimer = setInterval(() => {
      this.sweep().catch((err) => this.logger.error('Clock sweep failed', err));
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
  }

  private sideToMove(room: ActiveRoom): 'white' | 'black' {
    return room.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  }

  private isPlayer(room: ActiveRoom, userId: string): boolean {
    return room.whitePlayer.id === userId || room.blackPlayer?.id === userId;
  }

  /**
   * One pass of the server-authoritative clock (ADR-0004): for every watched
   * room, either end it on flag-fall (past deadline + grace) or push a
   * clock_sync so clients can correct their local interpolation.
   */
  private async sweep() {
    const now = Date.now();
    for (const roomId of await this.gamesService.watchedRooms()) {
      const room = await this.gamesService.getRoom(roomId);
      if (!room || room.status !== 'active') {
        await this.gamesService.clearDeadline(roomId);
        continue;
      }
      const side = this.sideToMove(room);
      const remaining = room.timers[side] - (now - room.lastMoveAt);

      if (remaining <= -CLOCK_GRACE_MS) {
        const ended = await this.claimEnd(roomId, (r) => {
          const s = this.sideToMove(r);
          const rem = r.timers[s] - (Date.now() - r.lastMoveAt);
          if (rem > -CLOCK_GRACE_MS) return false; // a racing move re-armed the clock
          r.timers[s] = 0;
          return true;
        });
        if (ended) {
          const flagged = this.sideToMove(ended);
          await this.endGame(ended, flagged === 'white' ? 'BLACK' : 'WHITE', 'TIMEOUT');
        }
        continue;
      }

      this.server.to(roomId).emit('clock_sync', {
        roomId,
        timers: { ...room.timers, [side]: Math.max(0, remaining) },
        serverTime: now,
      });
    }
  }

  /**
   * CAS-claim an active room into 'ended'. The claim IS the room's final
   * write — of two racing enders (sweeper vs claim_timeout vs resign) exactly
   * one wins and settles ratings; the loser sees status !== 'active' and backs
   * off. `mutate` may veto (return false) or adjust the room pre-claim.
   */
  private async claimEnd(
    roomId: string,
    mutate?: (room: ActiveRoom) => boolean,
  ): Promise<ActiveRoom | null> {
    for (let i = 0; i <= CAS_RETRIES; i++) {
      const room = await this.gamesService.getRoom(roomId);
      if (!room || room.status !== 'active') return null;
      if (mutate && !mutate(room)) return null;
      room.status = 'ended';
      if (await this.gamesService.casSaveRoom(room)) return room;
    }
    return null;
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string)?.replace('Bearer ', '') ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) { client.disconnect(); return; }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

      client.data.userId = payload.sub;
      client.data.username = payload.username;

      await this.redis.set(`socket:${client.id}`, payload.sub, 3600);
      // No TTL: this mapping must outlive any session length (it's used to
      // deliver e.g. challenge_accepted) and is explicitly deleted on disconnect.
      await this.redis.set(`user:socket:${payload.sub}`, client.id);
      await this.redis.set(`online:${payload.sub}`, '1', 30);

      this.logger.log(`Client connected: ${payload.username} (${client.id})`);
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;

    await Promise.all([
      this.redis.del(`socket:${client.id}`),
      this.redis.del(`online:${userId}`),
      this.redis.del(`user:socket:${userId}`),
    ]);

    const roomId = client.data.roomId;
    if (roomId) {
      const room = await this.gamesService.getRoom(roomId);
      if (room && room.status === 'active') {
        const color = room.whitePlayer.id === userId ? 'white' : 'black';
        this.server.to(roomId).emit('opponent_disconnected', { roomId, grace: 60000 });

        const timerKey = `${roomId}:${color}`;
        const existing = this.disconnectTimers.get(timerKey);
        if (existing) clearTimeout(existing);

        const timer = setTimeout(async () => {
          this.disconnectTimers.delete(timerKey);
          const ended = await this.claimEnd(roomId);
          if (!ended) return;
          const winner = color === 'white' ? 'BLACK' : 'WHITE';
          await this.endGame(ended, winner, 'ABANDONED');
        }, 60_000);

        this.disconnectTimers.set(timerKey, timer);
      }
    }

    this.logger.log(`Client disconnected: ${userId}`);
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
    attempt = 0,
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room) return client.emit('error', { message: 'Room not found' });

    const userId = client.data.userId;
    client.join(data.roomId);
    client.data.roomId = data.roomId;

    // Reconnect: player is returning to an active game
    const isWhite = room.whitePlayer.id === userId;
    const isBlack = room.blackPlayer?.id === userId;
    if ((isWhite || isBlack) && room.status === 'active') {
      const color = isWhite ? 'white' : 'black';
      const timerKey = `${data.roomId}:${color}`;
      const timer = this.disconnectTimers.get(timerKey);
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(timerKey);
        this.server.to(data.roomId).emit('opponent_reconnected', { roomId: room.id, color });
      }

      // Send current game state to the reconnecting client only
      client.emit('game_state', {
        roomId: room.id,
        white: room.whitePlayer,
        black: room.blackPlayer,
        fen: room.fen,
        timers: room.timers,
        moves: room.moves,
        drawOfferedBy: room.drawOfferedBy,
        difficulty: room.difficulty,
      });
      return;
    }

    // First join
    if (room.status === 'waiting') {
      room.status = 'active';
      room.startedAt = Date.now();
      room.lastMoveAt = Date.now();
      if (!(await this.gamesService.casSaveRoom(room))) {
        // Both players joined at once — the loser reruns and takes the
        // reconnect path against the now-active room.
        if (attempt < CAS_RETRIES) return this.handleJoinRoom(client, data, attempt + 1);
        return;
      }
      // The game is live: white's clock is now running (ADR-0004).
      await this.gamesService.setDeadline(room);
    }

    this.server.to(data.roomId).emit('game_start', {
      roomId: room.id,
      white: room.whitePlayer,
      black: room.blackPlayer,
      fen: room.fen,
      timeControl: room.timeControl,
      increment: room.increment,
      timers: room.timers,
      difficulty: room.difficulty,
    });
  }

  @SubscribeMessage('move')
  async handleMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; from: string; to: string; promotion?: string },
    attempt = 0,
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

    // Clock (ADR-0004): judge flag-fall on the raw remaining time BEFORE any
    // increment, with the grace margin absorbing network lag.
    const now = Date.now();
    const color = turn === 'w' ? 'white' : 'black';
    const raw = room.timers[color] - (now - room.lastMoveAt);

    if (raw <= -CLOCK_GRACE_MS) {
      // Flagged before this move arrived (sweeper just hasn't fired yet).
      room.timers[color] = 0;
      room.status = 'ended';
      if (!(await this.gamesService.casSaveRoom(room))) {
        if (attempt < CAS_RETRIES) return this.handleMove(client, data, attempt + 1);
        return;
      }
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

      room.timers[color] = Math.max(0, raw) + room.increment * 1000;
      room.fen = chess.fen();
      room.moves.push(moveResult.san);
      room.lastMoveAt = now;
      room.drawOfferedBy = null;

      // Terminal moves claim 'ended' in the SAME write as the move, so no
      // second ender can race in between.
      let result: 'WHITE' | 'BLACK' | 'DRAW' | null = null;
      let reason: string | null = null;
      if (chess.isCheckmate()) { result = turn === 'w' ? 'WHITE' : 'BLACK'; reason = 'CHECKMATE'; }
      else if (chess.isStalemate()) { result = 'DRAW'; reason = 'STALEMATE'; }
      else if (chess.isInsufficientMaterial()) { result = 'DRAW'; reason = 'INSUFFICIENT_MATERIAL'; }
      else if (chess.isThreefoldRepetition()) { result = 'DRAW'; reason = 'THREEFOLD_REPETITION'; }
      else if (chess.isDraw()) { result = 'DRAW'; reason = 'FIFTY_MOVE'; }
      if (result) room.status = 'ended';

      if (!(await this.gamesService.casSaveRoom(room))) {
        // Lost a race (draw offer, disconnect-ender, …) — redo from fresh state.
        if (attempt < CAS_RETRIES) return this.handleMove(client, data, attempt + 1);
        return client.emit('invalid_move', { roomId: data.roomId, reason: 'Conflict, retry' });
      }

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
        drawOfferedBy: null, // move always cancels any pending draw offer
      });

      if (result) {
        return this.endGame(room, result, reason!);
      }
      // Re-arm the deadline for the side now to move.
      await this.gamesService.setDeadline(room);
    } catch (e) {
      client.emit('invalid_move', { roomId: data.roomId, reason: 'Invalid move format' });
    }
  }

  @SubscribeMessage('resign')
  async handleResign(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = client.data.userId;
    const ended = await this.claimEnd(data.roomId, (r) => this.isPlayer(r, userId));
    if (!ended) return;

    const result = ended.whitePlayer.id === userId ? 'BLACK' : 'WHITE';
    await this.endGame(ended, result, 'RESIGNATION');
  }

  @SubscribeMessage('offer_draw')
  async handleOfferDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
    attempt = 0,
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room || room.status !== 'active') return;

    const userId = client.data.userId;
    if (!this.isPlayer(room, userId)) return;

    const byColor = room.whitePlayer.id === userId ? 'white' : 'black';
    room.drawOfferedBy = byColor;
    if (!(await this.gamesService.casSaveRoom(room))) {
      if (attempt < CAS_RETRIES) return this.handleOfferDraw(client, data, attempt + 1);
      return;
    }

    this.server.to(data.roomId).emit('draw_offered', { roomId: room.id, byColor });
  }

  @SubscribeMessage('accept_draw')
  async handleAcceptDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = client.data.userId;
    const ended = await this.claimEnd(data.roomId, (r) => {
      if (!r.drawOfferedBy || !this.isPlayer(r, userId)) return false;
      const acceptorColor = r.whitePlayer.id === userId ? 'white' : 'black';
      return acceptorColor !== r.drawOfferedBy; // can't accept your own offer
    });
    if (!ended) return;

    await this.endGame(ended, 'DRAW', 'AGREEMENT');
  }

  @SubscribeMessage('decline_draw')
  async handleDeclineDraw(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
    attempt = 0,
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room) return;
    if (!this.isPlayer(room, client.data.userId)) return;

    room.drawOfferedBy = null;
    if (!(await this.gamesService.casSaveRoom(room))) {
      if (attempt < CAS_RETRIES) return this.handleDeclineDraw(client, data, attempt + 1);
      return;
    }
    this.server.to(data.roomId).emit('draw_declined', { roomId: room.id });
  }

  @SubscribeMessage('rematch_request')
  async handleRematchRequest(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
    attempt = 0,
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room || room.status !== 'ended' || !room.blackPlayer || room.blackPlayer.id === 'computer') return;

    const userId = client.data.userId;
    if (!this.isPlayer(room, userId)) return;

    if (!room.rematchRequestedBy) {
      room.rematchRequestedBy = userId;
      if (!(await this.gamesService.casSaveRoom(room))) {
        // Both players clicked rematch at once — rerun; the loser now sees the
        // winner's request and takes the create-room branch below.
        if (attempt < CAS_RETRIES) return this.handleRematchRequest(client, data, attempt + 1);
        return;
      }
      this.server.to(data.roomId).emit('rematch_offered', { byUserId: userId });
    } else if (room.rematchRequestedBy !== userId) {
      // Both players want rematch — swap colors and create new room
      const newRoom = await this.gamesService.createRoom(
        room.blackPlayer,
        room.whitePlayer,
        room.timeControl,
        room.increment,
      );
      this.server.to(data.roomId).emit('rematch_ready', { roomId: newRoom.id });
    }
  }

  @SubscribeMessage('claim_timeout')
  async handleClaimTimeout(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const userId = client.data.userId;
    const ended = await this.claimEnd(data.roomId, (r) => {
      if (!this.isPlayer(r, userId)) return false;
      const flagged = this.sideToMove(r);
      const claimant = r.whitePlayer.id === userId ? 'white' : 'black';
      if (flagged === claimant) return false; // only the opponent's flag is claimable
      const rem = r.timers[flagged] - (Date.now() - r.lastMoveAt);
      if (rem > -CLOCK_GRACE_MS) return false;
      r.timers[flagged] = 0;
      return true;
    });
    if (!ended) return;

    const flagged = this.sideToMove(ended);
    await this.endGame(ended, flagged === 'white' ? 'BLACK' : 'WHITE', 'TIMEOUT');
  }

  /**
   * The engine runs as Stockfish WASM in the human player's browser (ADR-0009), so
   * its reply arrives over that player's own socket. Everything is re-validated here:
   * a client can only relay a move for the computer, in its own vs-computer room, on
   * the computer's turn, and chess.js still rules on legality. A tampered client can
   * therefore only make its own opponent play badly — and computer games are unrated
   * (see endGame), so there is nothing to gain.
   */
  @SubscribeMessage('computer_move')
  async handleComputerMove(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; from: string; to: string; promotion?: string },
    attempt = 0,
  ) {
    const room = await this.gamesService.getRoom(data.roomId);
    if (!room || room.status !== 'active') return;
    if (room.blackPlayer?.id !== 'computer') return;
    if (room.whitePlayer.id !== client.data.userId) return;

    const chess = new Chess(room.fen);
    if (chess.turn() !== 'b') return;

    const move = chess.move({
      from: data.from,
      to: data.to,
      promotion: data.promotion || 'q',
    });
    if (!move) return;

    const now = Date.now();
    const raw = room.timers.black - (now - room.lastMoveAt);
    room.timers.black = Math.max(0, raw) + room.increment * 1000;
    room.fen = chess.fen();
    room.moves.push(move.san);
    room.lastMoveAt = now;

    let result: 'BLACK' | 'DRAW' | null = null;
    let reason: string | null = null;
    if (chess.isCheckmate()) { result = 'BLACK'; reason = 'CHECKMATE'; }
    else if (chess.isStalemate()) { result = 'DRAW'; reason = 'STALEMATE'; }
    else if (chess.isInsufficientMaterial()) { result = 'DRAW'; reason = 'INSUFFICIENT_MATERIAL'; }
    else if (chess.isThreefoldRepetition()) { result = 'DRAW'; reason = 'THREEFOLD_REPETITION'; }
    else if (chess.isDraw()) { result = 'DRAW'; reason = 'FIFTY_MOVE'; }
    if (result) room.status = 'ended';

    if (!(await this.gamesService.casSaveRoom(room))) {
      if (attempt < CAS_RETRIES) return this.handleComputerMove(client, data, attempt + 1);
      return;
    }

    this.server.to(data.roomId).emit('move_made', {
      roomId: room.id,
      move: { from: move.from, to: move.to, san: move.san, fen: room.fen, moveIndex: room.moves.length - 1 },
      fen: room.fen,
      timers: room.timers,
      check: chess.inCheck(),
      drawOfferedBy: null,
    });

    if (result) return this.endGame(room, result, reason!);
    await this.gamesService.setDeadline(room);
  }

  /**
   * Persist and announce a game the caller has ALREADY written as 'ended'
   * (via claimEnd or a terminal-move CAS). This method never writes the room —
   * the claim is the write — so double rating settlement is impossible.
   */
  private async endGame(
    room: ActiveRoom,
    result: 'WHITE' | 'BLACK' | 'DRAW' | 'ABORTED',
    reason: string,
  ) {
    await this.gamesService.clearDeadline(room.id);

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
