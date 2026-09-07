/**
 * Pure scoring maths for post-game analysis. Kept separate from the engine and
 * from Nest so it can be unit-tested without spinning up either
 * (`classify.spec.ts`).
 */

/**
 * A UCI score, always from the point of view of the side to move.
 *
 *   mate > 0   the side to move mates in that many moves
 *   mate < 0   the side to move is mated in that many moves
 *   mate === 0 the side to move is checkmated right now (game over)
 */
export interface Score {
  cp: number | null;
  mate: number | null;
}

export type Classification =
  | 'BEST'
  | 'EXCELLENT'
  | 'GOOD'
  | 'INACCURACY'
  | 'MISTAKE'
  | 'BLUNDER';

/**
 * Mate scores fold into the centipawn scale so one number orders everything.
 * Exported because a delivered checkmate is stored as +/- this value with a
 * null `mate`: `mate: 0` cannot express the winner's side (see `invert`).
 */
export const MATE_CP = 10000;
/**
 * Evaluations beyond ±10 pawns are clamped before any loss is measured: once a
 * position is winning, going from +25 to +12 is not a blunder, and without the
 * clamp a won game scores worse than a close one.
 */
const CLAMP_CP = 1000;

export function toCp(score: Score): number {
  if (score.mate !== null && score.mate !== undefined) {
    return score.mate > 0 ? MATE_CP - score.mate : -MATE_CP - score.mate;
  }
  return score.cp ?? 0;
}

/** Flip a score to the other side's point of view. */
export function invert(score: Score): Score {
  // `mate: 0` says the side to move is checkmated, and negating 0 gives 0 - so
  // without this the winner's view of a delivered mate reads as a total loss,
  // and the mating move scores as the game's worst blunder.
  if (score.mate === 0) return { cp: MATE_CP, mate: null };
  return {
    cp: score.cp === null || score.cp === undefined ? null : -score.cp,
    mate: score.mate === null || score.mate === undefined ? null : -score.mate,
  };
}

const clamp = (cp: number) => Math.max(-CLAMP_CP, Math.min(CLAMP_CP, cp));

/** Lichess' centipawn → expected-score curve; 0cp = 50%. */
export function winPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamp(cp))) - 1);
}

/**
 * Lichess' accuracy curve over the win% a move gave away. Exponential, so the
 * first few percent cost little and a real blunder falls off a cliff.
 */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const lost = Math.max(0, winBefore - winAfter);
  const acc = 103.1668 * Math.exp(-0.04354 * lost) - 3.1669;
  return Math.max(0, Math.min(100, acc));
}

export function classify(cpLoss: number, playedBest: boolean): Classification {
  if (playedBest) return 'BEST';
  if (cpLoss < 20) return 'EXCELLENT';
  if (cpLoss < 50) return 'GOOD';
  if (cpLoss < 100) return 'INACCURACY';
  if (cpLoss < 250) return 'MISTAKE';
  return 'BLUNDER';
}

/** Centipawns thrown away by playing `after` instead of the engine's best. */
export function centipawnLoss(bestForMover: Score, afterForMover: Score): number {
  return Math.max(0, clamp(toCp(bestForMover)) - clamp(toCp(afterForMover)));
}

export function mean(values: number[]): number {
  if (!values.length) return 100;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// --------------------------------------------------------------- whole game

export interface PlayedMove {
  san: string;
  /** The move as UCI, so it can be compared with the engine's bestmove. */
  uci: string;
  color: 'w' | 'b';
}

export interface AnalysedMove {
  ply: number;
  san: string;
  color: 'w' | 'b';
  /**
   * Evaluation AFTER this move, White's point of view (+ = White better).
   * `evalCp === +/-MATE_CP` with a null `mate` means checkmate on the board.
   */
  evalCp: number | null;
  mate: number | null;
  bestMove: string | null;
  playedMove: string;
  cpLoss: number;
  accuracy: number;
  classification: Classification;
}

export interface GameScore {
  moves: AnalysedMove[];
  accuracyWhite: number;
  accuracyBlack: number;
}

/**
 * Turn N played moves plus N+1 position evaluations into per-move verdicts.
 *
 * Pure on purpose: every point-of-view flip in the feature lives here, which is
 * exactly where a sign error would be invisible in the engine output and wrong
 * in the UI. `scores[i]` is always from the point of view of whoever is to move
 * in position i, so the eval of the move actually played is `-scores[i+1]`.
 */
export function scoreGame(
  played: PlayedMove[],
  scores: Score[],
  bestMoves: (string | null)[],
): GameScore {
  const moves: AnalysedMove[] = [];
  const accuracies: Record<'w' | 'b', number[]> = { w: [], b: [] };

  played.forEach((move, i) => {
    const best = scores[i];
    const after = invert(scores[i + 1]);
    const cpLoss = centipawnLoss(best, after);
    const accuracy = moveAccuracy(winPercent(toCp(best)), winPercent(toCp(after)));
    accuracies[move.color].push(accuracy);

    // Stored White's-view so a UI can graph the column straight off the row.
    const whiteView = move.color === 'w' ? after : invert(after);

    moves.push({
      ply: i + 1,
      san: move.san,
      color: move.color,
      evalCp: whiteView.cp,
      mate: whiteView.mate,
      bestMove: bestMoves[i],
      playedMove: move.uci,
      cpLoss,
      accuracy: round1(accuracy),
      classification: classify(cpLoss, bestMoves[i] === move.uci),
    });
  });

  return {
    moves,
    accuracyWhite: round1(mean(accuracies.w)),
    accuracyBlack: round1(mean(accuracies.b)),
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
