import { Chess } from "chess.js";
// The server's scoring module, imported rather than copied: it is pure (no
// imports, no I/O), and two copies of the point-of-view maths would drift.
import { scoreGame, type GameScore, type PlayedMove, type Score } from "../../../backend/src/analysis/classify";

/** Lighter than the server's depth 18: this runs on the player's own device. */
export const BROWSER_DEPTH = 14;
const MOVETIME_MS = 1000; // per position, so one wild middlegame can't stall the sweep

/**
 * Analyse a game with Stockfish in a Web Worker, the same way AnalysisService
 * sweeps one on the server: N+1 positions, a score for the side to move in
 * each, then scoreGame. For games the server never saw (practice, vs computer),
 * so the verdict stays in this tab and is never stored.
 */
export async function analyseInBrowser(
  sanMoves: string[],
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<GameScore> {
  const chess = new Chess();
  const fens = [chess.fen()];
  const played: PlayedMove[] = sanMoves.map((san) => {
    const m = chess.move(san);
    fens.push(chess.fen());
    return { san, uci: m.from + m.to + (m.promotion ?? ""), color: m.color };
  });

  const worker = new Worker("/engine/stockfish-18-lite-single.js");
  signal.addEventListener("abort", () => worker.terminate());
  let onLine: (line: string) => void = () => {};
  worker.onmessage = (e: MessageEvent) => {
    const line = typeof e.data === "string" ? e.data : (e.data as { data?: string })?.data;
    if (typeof line === "string") onLine(line);
  };
  worker.postMessage("uci");
  worker.postMessage("ucinewgame");

  const evaluate = (fen: string) =>
    new Promise<{ score: Score; bestMove: string | null }>((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException("aborted", "AbortError"));
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      let score: Score = { cp: null, mate: null };
      onLine = (line) => {
        // Same parse as the server: only principal-variation lines carry a usable score.
        if (line.startsWith("info ") && line.includes(" pv ")) {
          const m = /score (cp|mate) (-?\d+)/.exec(line);
          if (m) score = m[1] === "cp" ? { cp: +m[2], mate: null } : { cp: null, mate: +m[2] };
        } else if (line.startsWith("bestmove")) {
          const best = line.split(" ")[1];
          resolve({ score, bestMove: !best || best === "(none)" ? null : best });
        }
      };
      worker.postMessage(`position fen ${fen}`);
      worker.postMessage(`go depth ${BROWSER_DEPTH} movetime ${MOVETIME_MS}`);
    });

  try {
    const scores: Score[] = [];
    const bestMoves: (string | null)[] = [];
    for (let i = 0; i < fens.length; i++) {
      onProgress(i, fens.length);
      if (i === fens.length - 1 && chess.isGameOver()) {
        // A finished position has no score line: read the verdict off the board.
        scores.push(chess.isCheckmate() ? { cp: null, mate: 0 } : { cp: 0, mate: null });
        bestMoves.push(null);
        continue;
      }
      const reply = await evaluate(fens[i]);
      scores.push(reply.score);
      bestMoves.push(reply.bestMove);
    }
    onProgress(fens.length, fens.length);
    return scoreGame(played, scores, bestMoves);
  } finally {
    worker.terminate();
  }
}
