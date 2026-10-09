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
import { parseCorsOrigin } from '../common/utils/cors';
import { SOCKET_EVENTS_PER_SEC, createRateLimiter, payloadProblem } from '../common/socket-guard';

/** How many times a handler re-runs itself after losing a CAS race. */
const CAS_RETRIES = 3;
/** Longest the sweeper sleeps, so a missed re-arm can't strand a game for hours. */
const MAX_SLEEP_MS = 60_000;
/** Shortest re-arm, so a deadline that can't be settled yet can't hot-loop. */
const MIN_SLEEP_MS = 250;

@WebSocketGateway({
  cors: { origin: parseCorsOrigin(), credentials: true },
  namespace: '/',
  // Every client message is a few hundred bytes; the 1 MB default only helps a flood (ship-plan 0.9).
  maxHttpBufferSize: 16_384,
})
export class GameGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(GameGateway.name);
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private sweepTimer: NodeJS.Timeout | null = null;
  /** When the pending sweep fires; Infinity when none is scheduled. */
  private sweepAt = Infinity;

  constructor(
    private gamesService: GamesService,
    private redis: RedisService,
    private jwtService: JwtService,
  ) {}

  onModuleInit() {
    // ADR-0004 addendum + ADR-0034: one sweeper over the clock:deadlines ZSET,
    // woken for the earliest deadline instead of polling every second. Deadlines
    // live in Redis, so a restart re-arms from them and a game whose player
    // vanished still flags on schedule.
    this.armSweep().catch((err) => this.logger.error('Clock sweep arm failed', err));
  }

  onModuleDestroy() {
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
  }

  /**
   * Wake the sweeper at `at`, unless it is already due sooner. Every deadline
   * write goes through this process (single instance, ADR-0032), so calling
   * this after each `setDeadline` keeps the timer exact.
   * ponytail: per-process timer; with instance #2, each instance must also re-arm
   * from Redis periodically (or move flagging into a keyspace-notification consumer).
   */
  private scheduleSweep(at: number) {
    if (at >= this.sweepAt) return;
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
    this.sweepAt = at;
    const delay = Math.min(Math.max(at - Date.now(), MIN_SLEEP_MS), MAX_SLEEP_MS);
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = null;
      this.sweepAt = Infinity;
      this.sweep()
        .catch((err) => this.logger.error('Clock sweep failed', err))
        .finally(() => this.armSweep().catch((err) => this.logger.error('Clock sweep arm failed', err)));
    }, delay);
  }

  /** Schedule for the earliest stored deadline. No games: no timer, zero idle Redis traffic. */
  private async armSweep() {
    const next = await this.gamesService.nextDeadline();
    if (next !== null) this.scheduleSweep(next);
  }

  private sideToMove(room: ActiveRoom): 'white' | 'black' {
    return room.fen.split(' ')[1] === 'w' ? 'white' : 'black';
  }

  /** Clocks as of now: the side to move has been thinking since lastMoveAt. */
  private liveTimers(room: ActiveRoom) {
    if (room.status !== 'active') return room.timers;
    const side = this.sideToMove(room);
    return { ...room.timers, [side]: Math.max(0, room.timers[side] - (Date.now() - room.lastMoveAt)) };
  }

  private isPlayer(room: ActiveRoom, userId: string): boolean {
    return room.whitePlayer.id === userId || room.blackPlayer?.id === userId;
  }

  /**
   * One pass of the server-authoritative clock (ADR-0004): end every room whose
   * deadline (grace included) has passed. Only expired rooms are read. Clients
   * get clocks with each move and in the join snapshot (ADR-0034), not a
   * per-second clock_sync.
   */
  private async sweep() {
    for (const roomId of await this.gamesService.expiredRooms(Date.now())) {
      const room = await this.gamesService.getRoom(roomId);
      if (!room || room.status !== 'active') {
        await this.gamesService.clearDeadline(roomId);
        continue;
      }
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
      this.guardSocket(client);

      await this.redis.set(`socket:${client.id}`, payload.sub, 3600);
      // No TTL: this mapping must outlive any session length (it's used to
      // deliver e.g. challenge_accepted) and is explicitly deleted on disconnect.
      await this.redis.set(`user:socket:${payload.sub}`, client.id);

      this.logger.log({ event: 'socket_connected', userId: payload.sub, username: payload.username });
    } catch {
      this.logger.warn({ event: 'socket_auth_failed', ip: client.handshake.address });
      client.disconnect();
    }
  }

  /**
   * Runs before every handler on this socket, both gateways included (ship-plan
   * 0.7, 0.8): flooders are disconnected, malformed payloads are dropped and logged.
   * Registered synchronously after auth, before any await, so no packet slips past.
   */
  private guardSocket(client: Socket) {
    const allow = createRateLimiter(SOCKET_EVENTS_PER_SEC, 1000);
    let cutOff = false;
    client.use(([event, data], next) => {
      const userId = client.data.userId;
      if (cutOff) return; // packets still in flight after the disconnect: drop quietly
      if (!allow()) {
        cutOff = true; // one log line per flood, not one per extra packet
        this.logger.warn({ event: 'socket_rate_limited', userId, socketEvent: event });
        client.disconnect(true);
        return;
      }
      const problem = payloadProblem(event, data);
      if (problem) {
        this.logger.warn({ event: 'socket_payload_rejected', userId, socketEvent: event, problem });
        return; // dropped: no handler runs
      }
      next();
    });
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (!userId) return;

    await Promise.all([
      this.redis.del(`socket:${client.id}`),
      this.redis.del(`user:socket:${userId}`),
    ]);

    const roomId = client.data.roomId;
    if (roomId) {
      const room = await this.gamesService.getRoom(roomId);
      const isWhite = room?.whitePlayer.id === userId;
      const isBlack = room?.blackPlayer?.id === userId;
      // Only a genuine player's disconnect can abandon the game. Defense in
      // depth: roomId is stamped only for players (handleJoinRoom), but never
      // let a non-player's userId fall through to color='black' and forfeit
      // the real black player.
      if (room && room.status === 'active' && (isWhite || isBlack)) {
        const color = isWhite ? 'white' : 'black';
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

    this.logger.log({ event: 'socket_disconnected', userId });
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
    const isWhite = room.whitePlayer.id === userId;
    const isBlack = room.blackPlayer?.id === userId;

    client.join(data.roomId);
    // Stamp roomId ONLY for players: it is used solely to arm the disconnect
    // abandonment timer. A non-player who opens a shared game URL may observe,
    // but must never be able to arm that timer — otherwise their disconnect
    // would forfeit the real black player (whose color a non-player's userId
    // falls through to in handleDisconnect).
    if (isWhite || isBlack) client.data.roomId = data.roomId;

    // Observer: someone who opened a shared game URL. They get a one-shot
    // snapshot and nothing else — they must never flip the room to 'active'
    // (that would start white's clock before white connected) nor trigger a
    // game_start broadcast at the real players.
    if (!isWhite && !isBlack) {
      client.emit('game_state', {
        roomId: room.id,
        white: room.whitePlayer,
        black: room.blackPlayer,
        fen: room.fen,
        timers: this.liveTimers(room),
        moves: room.moves,
        drawOfferedBy: room.drawOfferedBy,
        difficulty: room.difficulty,
        // A spectator can land on a waiting or finished room; the client must
        // not tick a clock for either.
        status: room.status,
      });
      return;
    }

    // Reconnect: player is returning to an active game
    if (room.status === 'active') {
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
        timers: this.liveTimers(room),
        moves: room.moves,
        drawOfferedBy: room.drawOfferedBy,
        difficulty: room.difficulty,
      });
      return;
    }

    // First join (player, room still waiting)
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
      this.scheduleSweep(await this.gamesService.setDeadline(room));
      this.logger.log({
        event: 'game_started', roomId: room.id, white: room.whitePlayer.username,
        black: room.blackPlayer?.username, timeControl: `${room.timeControl}+${room.increment}`,
        vsComputer: room.blackPlayer?.id === 'computer',
      });
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
      return this.rejectMove(client, data.roomId, 'Game not active');
    }

    const userId = client.data.userId;
    const isWhite = room.whitePlayer.id === userId;
    const isBlack = room.blackPlayer?.id === userId;

    if (!isWhite && !isBlack) {
      return this.rejectMove(client, data.roomId, 'Not a player');
    }

    const chess = new Chess(room.fen);
    const turn = chess.turn();
    if ((turn === 'w' && !isWhite) || (turn === 'b' && !isBlack)) {
      return this.rejectMove(client, data.roomId, 'Not your turn');
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
        return this.rejectMove(client, data.roomId, 'Illegal move');
      }

      room.timers[color] = Math.max(0, raw) + room.increment * 1000;
      room.fen = chess.fen();
      room.moves.push(moveResult.san);
      this.logger.debug({ event: 'move', roomId: room.id, ply: room.moves.length, san: moveResult.san, thinkMs: now - room.lastMoveAt });
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
        return this.rejectMove(client, data.roomId, 'Conflict, retry');
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
      this.scheduleSweep(await this.gamesService.setDeadline(room));
    } catch {
      this.rejectMove(client, data.roomId, 'Invalid move format');
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
    this.scheduleSweep(await this.gamesService.setDeadline(room));
  }

  /** Refuse a move: tell the sender, and leave a trace (cheating or a client bug). */
  private rejectMove(client: Socket, roomId: string, reason: string) {
    this.logger.warn({ event: 'move_rejected', roomId, userId: client.data.userId, reason });
    return client.emit('invalid_move', { roomId, reason });
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
    this.logger.log({
      event: 'game_over', roomId: room.id, result, reason, plies: room.moves.length,
      durationMs: Date.now() - room.startedAt, rated: !!ratingChanges,
    });

    this.server.to(room.id).emit('game_over', {
      roomId: room.id,
      // The persisted Game id, so the client can link straight into a review.
      // null for vs-computer games, which are never saved.
      gameId: ratingChanges?.game?.id ?? null,
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
