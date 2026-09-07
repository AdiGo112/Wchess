import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { Chess } from 'chess.js';
import { PrismaService } from '../common/prisma/prisma.service';
import { PlayedMove, Score, scoreGame } from './classify';

/** Acceptance criterion for Increment 2: every move analysed at depth 18. */
const DEPTH = 18;
/** Ceiling per position, so one wild middlegame cannot stretch a whole sweep. */
const MOVETIME_MS = 2000;
/** Beyond this a sweep is minutes of CPU; such games are not worth blocking on. */
const MAX_PLIES = 300;
/** Whole-game sweeps waiting on the single engine. Past this, say no. */
const MAX_QUEUED = 3;
/** A wedged engine must fail its own sweep, not deadlock every later one. */
const REPLY_TIMEOUT_MS = MOVETIME_MS + 30_000;

interface Pending {
  resolve: (reply: { score: Score; bestMove: string | null }) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

@Injectable()
export class AnalysisService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalysisService.name);

  private engineProcess: ChildProcessWithoutNullStreams | null = null;
  private booting: Promise<ChildProcessWithoutNullStreams> | null = null;
  private stdoutBuffer = '';
  /** One position in flight; sweeps are serialised, so one slot is enough. */
  private pending: Pending | null = null;
  /** Latest score seen for the position being searched, side-to-move's view. */
  private score: Score = { cp: null, mate: null };

  /** gameId -> the sweep currently queued or running for it. */
  private readonly inFlight = new Map<string, Promise<unknown>>();
  /** One engine, so sweeps run one after another rather than interleaved. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private prisma: PrismaService) {}

  onModuleDestroy() {
    this.engineProcess?.kill();
  }

  // --------------------------------------------------------------- public API

  /**
   * Kick off analysis and return immediately - a depth-18 sweep takes tens of
   * seconds, well past any sane HTTP timeout, so the client polls `get()`.
   */
  async request(gameId: string) {
    const existing = await this.prisma.gameAnalysis.findUnique({ where: { gameId } });
    if (existing) return { status: 'done' as const, ...existing };

    if (this.inFlight.has(gameId)) return { status: 'running' as const, gameId };

    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Game not found');
    if (!game.moves.length) throw new NotFoundException('Game has no moves to analyse');
    if (game.moves.length > MAX_PLIES) {
      throw new ServiceUnavailableException(`Games over ${MAX_PLIES} plies are not analysed`);
    }
    if (this.inFlight.size >= MAX_QUEUED) {
      throw new ServiceUnavailableException('Analysis queue is full, try again shortly');
    }

    // The queue IS this promise chain, which is why there is no job broker here.
    // Single instance is a recorded constraint (ADR-0032).
    const run = (this.chain = this.chain
      .catch(() => undefined)
      .then(() => this.sweep(gameId, game.moves)));

    this.inFlight.set(gameId, run);
    run
      .catch((err) => this.logger.error(`Analysis failed for ${gameId}: ${err.message}`))
      .finally(() => this.inFlight.delete(gameId));

    return { status: 'running' as const, gameId };
  }

  async get(gameId: string) {
    const row = await this.prisma.gameAnalysis.findUnique({ where: { gameId } });
    if (row) return { status: 'done' as const, ...row };
    if (this.inFlight.has(gameId)) return { status: 'running' as const, gameId };
    return { status: 'none' as const, gameId };
  }

  // ----------------------------------------------------------------- analysis

  private async sweep(gameId: string, sanMoves: string[]) {
    const started = Date.now();
    const chess = new Chess();
    const fens = [chess.fen()];
    const played: PlayedMove[] = [];

    for (const san of sanMoves) {
      // Throws on a corrupt move list; the sweep then fails loudly rather than
      // storing an analysis that silently stops half way through the game.
      const move = chess.move(san);
      played.push({
        san,
        uci: move.from + move.to + (move.promotion ?? ''),
        color: move.color as 'w' | 'b',
      });
      fens.push(chess.fen());
    }

    // Clear the transposition table between games so the same game always
    // scores the same, whatever was analysed before it.
    (await this.engine()).stdin.write('ucinewgame\n');

    // N moves need N+1 evaluations, not 2N: the position after move i is the
    // position before move i+1, so every eval is read by two moves.
    const scores: Score[] = [];
    const bestMoves: (string | null)[] = [];
    for (let i = 0; i < fens.length; i++) {
      if (i === fens.length - 1 && chess.isGameOver()) {
        // A finished position returns `bestmove (none)` with no score line, so
        // read the verdict off the board instead of asking the engine.
        scores.push(chess.isCheckmate() ? { cp: null, mate: 0 } : { cp: 0, mate: null });
        bestMoves.push(null);
        continue;
      }
      const reply = await this.evaluate(fens[i]);
      scores.push(reply.score);
      bestMoves.push(reply.bestMove);
    }

    const { moves, accuracyWhite, accuracyBlack } = scoreGame(played, scores, bestMoves);

    const stored = {
      depth: DEPTH,
      moves: moves as unknown as object[],
      accuracyWhite,
      accuracyBlack,
    };

    const row = await this.prisma.gameAnalysis.upsert({
      where: { gameId },
      create: { gameId, ...stored },
      update: stored,
    });

    this.logger.log(
      `Analysed ${gameId}: ${moves.length} plies at depth ${DEPTH} in ${Date.now() - started}ms`,
    );
    return row;
  }

  // ------------------------------------------------------------------- engine

  private async evaluate(fen: string) {
    const engine = await this.engine();

    return new Promise<{ score: Score; bestMove: string | null }>((resolve, reject) => {
      if (this.pending) return reject(new Error('Engine is already searching'));

      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error(`Engine did not answer within ${REPLY_TIMEOUT_MS}ms`));
      }, REPLY_TIMEOUT_MS);

      this.pending = { resolve, reject, timer };
      this.score = { cp: null, mate: null };
      engine.stdin.write(`position fen ${fen}\n`);
      // Both limits, whichever lands first: depth for quality, movetime so one
      // pathological position cannot stretch a whole sweep unboundedly.
      engine.stdin.write(`go depth ${DEPTH} movetime ${MOVETIME_MS}\n`);
    });
  }

  private onEngineLine(line: string) {
    // Only lines carrying a principal variation hold a usable score; `info
    // depth 1 currmove ...` and `info string ...` do not.
    if (line.startsWith('info ') && line.includes(' pv ')) {
      const m = /score (cp|mate) (-?\d+)/.exec(line);
      if (m) this.score = m[1] === 'cp' ? { cp: +m[2], mate: null } : { cp: null, mate: +m[2] };
      return;
    }

    if (!line.startsWith('bestmove')) return;

    const pending = this.pending;
    this.pending = null;
    if (!pending) return;

    clearTimeout(pending.timer);
    const best = line.split(' ')[1];
    pending.resolve({
      score: this.score,
      bestMove: !best || best === '(none)' ? null : best,
    });
  }

  /**
   * Stockfish 18 (lite-single WASM) as a child process speaking plain UCI over
   * stdio.
   *
   * ADR-0009 put the engine in the *browser* for computer games, so opponent
   * moves cost the server nothing. Post-game analysis cannot work that way:
   * every viewer of a game review would re-derive the same numbers, and a
   * client-submitted verdict on a shared game row is unauthenticated data. So
   * the server runs the same wasm build - the one already proven headless - but
   * out of process, because a depth-18 sweep of an 80-ply game is tens of
   * seconds of solid CPU and this is a single-instance monolith (ADR-0032): in
   * the API process it would stall every socket and request for the duration.
   *
   * Not a `worker_threads` worker: the engine's emscripten build claims
   * `worker_threads` for its own pthread plumbing, so inside a Worker it never
   * exports its init function and load fails with "Could not load the engine
   * correctly." A child process also isolates the CPU burn more completely.
   *
   * Spawned on the first analysis rather than at boot, so a server nobody asks
   * for analysis on never pays the wasm load.
   */
  private engine(): Promise<ChildProcessWithoutNullStreams> {
    if (this.engineProcess) return Promise.resolve(this.engineProcess);
    if (this.booting) return this.booting;

    this.booting = new Promise<ChildProcessWithoutNullStreams>((resolve, reject) => {
      const enginePath = require.resolve('stockfish/bin/stockfish-18-lite-single.js');
      const child = spawn(process.execPath, [enginePath], { stdio: ['pipe', 'pipe', 'pipe'] });
      let ready = false;

      child.stdout.on('data', (chunk: Buffer) => {
        this.stdoutBuffer += chunk.toString();
        const lines = this.stdoutBuffer.split('\n');
        this.stdoutBuffer = lines.pop() ?? '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!ready && line === 'uciok') {
            ready = true;
            this.engineProcess = child;
            this.logger.log('Stockfish engine ready');
            resolve(child);
            continue;
          }
          this.onEngineLine(line);
        }
      });

      const fail = (err: Error) => {
        this.engineProcess = null;
        this.booting = null;
        this.stdoutBuffer = '';
        // A pending evaluation has to fail now; otherwise it waits out its own
        // timeout and the whole queue stalls behind a dead engine.
        const pending = this.pending;
        this.pending = null;
        if (pending) {
          clearTimeout(pending.timer);
          pending.reject(err);
        }
        if (!ready) reject(err);
      };

      child.on('error', (err) => {
        this.logger.error(`Stockfish engine error: ${err.message}`);
        fail(err);
      });
      child.on('exit', (code) => fail(new Error(`Stockfish engine exited (${code})`)));

      child.stdin.write('uci\n');
    });

    return this.booting;
  }
}
