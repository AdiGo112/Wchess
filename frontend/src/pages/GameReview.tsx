import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import api from "../api";
import useBoardFit from "../hooks/useBoardFit";
import type { AnalysedMove, AnalysisResponse, GameRecord, MoveClassification } from "../types";

/* Same strict-mono board as the live game (design system: no hue anywhere). */
const LIGHT_SQ = "#d6d6d6";
const DARK_SQ = "#3a3a3a";
const BOARD_STYLE: CSSProperties = { borderRadius: 0, boxShadow: "8px 8px 0 0 #0a0a0a" };

/** Standard annotation glyphs. A good move gets no mark, which is the point. */
const MARK: Record<MoveClassification, string> = {
  BEST: "",
  EXCELLENT: "",
  GOOD: "",
  INACCURACY: "?!",
  MISTAKE: "?",
  BLUNDER: "??",
};

/**
 * Lichess' centipawn → win% curve, the same one the server scores accuracy
 * with. Duplicated here rather than shipped down the wire: it is three lines,
 * and the eval bar needs it for the start position too, which has no move row.
 */
const CLAMP_CP = 1000;
const winPercent = (cp: number) => {
  const c = Math.max(-CLAMP_CP, Math.min(CLAMP_CP, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
};

/** What the eval bar and the readout show for a position. */
function evalOf(move: AnalysedMove | null) {
  if (!move) return { share: 50, label: "0.0" };
  if (move.mate !== null && move.mate !== undefined) {
    return { share: move.mate > 0 ? 100 : 0, label: `M${Math.abs(move.mate)}` };
  }
  const cp = move.evalCp ?? 0;
  if (Math.abs(cp) >= 10000) return { share: cp > 0 ? 100 : 0, label: "#" };
  return {
    share: winPercent(cp),
    label: `${cp > 0 ? "+" : cp < 0 ? "−" : ""}${(Math.abs(cp) / 100).toFixed(1)}`,
  };
}

const COUNTED: MoveClassification[] = ["BEST", "EXCELLENT", "GOOD", "INACCURACY", "MISTAKE", "BLUNDER"];

export default function GameReview() {
  const { gameId } = useParams<{ gameId: string }>();
  const [game, setGame] = useState<GameRecord | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [ply, setPly] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // A sweep is queued at most once per page visit, even though the poll below
  // re-reads status every two seconds.
  const requested = useRef(false);

  // The game itself renders immediately; analysis arrives whenever it arrives.
  useEffect(() => {
    if (!gameId) return;
    api
      .get<GameRecord>(`/games/${gameId}`)
      .then((res) => setGame(res.data))
      .catch(() => setError("That game does not exist."));
  }, [gameId]);

  useEffect(() => {
    if (!gameId) return undefined;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const poll = async () => {
      try {
        const { data } = await api.get<AnalysisResponse>(`/analysis/${gameId}`);
        if (cancelled) return;
        setAnalysis(data);

        if (data.status === "none" && !requested.current) {
          requested.current = true;
          // Increment 5: opening the review IS the request. The user navigated
          // here on purpose, so there is no button to press first.
          await api.post(`/analysis/${gameId}`);
        }
        if (data.status !== "done") timer = setTimeout(poll, 2000);
      } catch (err: unknown) {
        if (cancelled) return;
        requested.current = true; // don't hammer a server that just said no
        const status = (err as { response?: { status?: number } })?.response?.status;
        setError(
          status === 503
            ? "The analysis queue is busy. Try again in a minute."
            : "Analysis could not be started.",
        );
      }
    };

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [gameId]);

  /** Every position of the game, replayed once from the stored SAN list. */
  const fens = useMemo(() => {
    const chess = new Chess();
    const out = [chess.fen()];
    for (const san of game?.moves ?? []) {
      try {
        chess.move(san);
      } catch {
        break;
      }
      out.push(chess.fen());
    }
    return out;
  }, [game]);

  const moves = analysis?.status === "done" ? analysis.moves ?? [] : [];
  const totalPlies = fens.length - 1;
  const current = ply > 0 ? moves[ply - 1] ?? null : null;
  const { share, label } = evalOf(current);

  const step = useCallback(
    (to: number) => setPly(Math.max(0, Math.min(totalPlies, to))),
    [totalPlies],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") step(ply - 1);
      else if (e.key === "ArrowRight") step(ply + 1);
      else if (e.key === "Home") step(0);
      else if (e.key === "End") step(totalPlies);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ply, step, totalPlies]);

  /**
   * The engine's move in the position on screen, ringed from-square and
   * to-square. Only when the player did something else — marking the move they
   * actually played is noise.
   *
   * Rings rather than : react-chessboard v1.3 clears its arrow
   * state from a timeout tied to the piece animation, so on a board driven
   * entirely by external position changes an arrow vanishes a few hundred
   * milliseconds after every step. Square styles are a plain prop and survive.
   * Rings also match how the live board marks squares (inversion and inset
   * rings, never colour).
   */
  const engineHint = useMemo(() => {
    const next = moves[ply];
    if (!next?.bestMove || next.bestMove === next.playedMove) return {};
    const ring: CSSProperties = { boxShadow: "inset 0 0 0 4px #ffffff" };
    return { [next.bestMove.slice(0, 2)]: ring, [next.bestMove.slice(2, 4)]: ring };
  }, [moves, ply]);

  // The board fills the frame; the eval bar and the panel share what is left.
  const fit = useBoardFit(400);

  const tally = useCallback(
    (color: "w" | "b") => {
      const mine = moves.filter((m) => m.color === color);
      return COUNTED.map((c) => ({ c, n: mine.filter((m) => m.classification === c).length }));
    },
    [moves],
  );

  if (error && !game) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <h1 className="heading-b text-4xl mb-4">NO SUCH GAME</h1>
        <p className="mb-6 text-xs font-bold uppercase tracking-widest text-neutral-500">{error}</p>
        <Link to="/history" className="btn-b">
          Back to history
        </Link>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center py-24">
        <div className="loader-b mx-auto mb-4" />
        <p className="text-xs font-bold uppercase tracking-widest">
          Loading<span className="animate-blink">_</span>
        </p>
      </div>
    );
  }

  const running = analysis?.status !== "done";

  return (
    <div className="h-full flex flex-col gap-3">
      {/* One compact line: every pixel spent here is a pixel off the board. */}
      <div className="flex items-baseline gap-3 flex-wrap shrink-0">
        <h1 className="heading-b text-2xl">THE POST-MORTEM</h1>
        <span className="tag-b">
          {game.whiteUsername} vs {game.blackUsername} · {game.moves.length} moves
        </span>
        {game.openingName && (
          <span className="tag-b-inverse">
            {game.openingEco} {game.openingName}
          </span>
        )}
        <Link to="/history" className="btn-b btn-b-sm ml-auto">
          Back to history
        </Link>
      </div>

      <div
        ref={fit.ref}
        className={`flex-1 min-h-0 gap-4 ${
          fit.stacked ? "flex flex-col items-center overflow-y-auto" : "flex items-stretch"
        }`}
      >
        {/* Board — left, as large as the frame allows */}
        <div className="shrink-0 flex items-center" style={{ width: fit.size }}>
          <Chessboard
            position={fens[ply]}
            boardWidth={fit.size}
            arePiecesDraggable={false}
            // Instant, not animated: the move list and the arrow keys jump to
            // arbitrary plies, and sliding a piece across the board to depict a
            // jump from ply 30 back to ply 4 depicts something that never
            // happened. It also makes holding an arrow key down usable.
            animationDuration={0}
            customLightSquareStyle={{ backgroundColor: LIGHT_SQ }}
            customDarkSquareStyle={{ backgroundColor: DARK_SQ }}
            customBoardStyle={BOARD_STYLE}
            customSquareStyles={engineHint}
          />
        </div>

        {/* Eval bar — White's share of the position, immediately right of the board */}
        {!fit.stacked && (
          <div className="shrink-0 flex flex-col items-center justify-center gap-2">
            <span className="font-mono text-xs font-bold">{running ? "··" : label}</span>
            <div
              className="w-6 border-[3px] border-ink bg-ink relative"
              style={{ height: fit.size - 28 }}
            >
              <div
                className="absolute bottom-0 left-0 right-0 bg-white transition-[height] duration-200"
                style={{ height: `${running ? 50 : share}%` }}
              />
            </div>
          </div>
        )}

        {/* Everything else, right of the board */}
        <div
          className={`flex flex-col gap-3 min-h-0 ${
            fit.stacked ? "w-full max-w-[560px]" : "flex-1 min-w-0"
          }`}
        >
          {running ? (
            <div className="card-b-flat text-center shrink-0">
              {error ? (
                <p className="text-xs font-bold uppercase tracking-widest">{error}</p>
              ) : (
                <>
                  <div className="loader-b mx-auto mb-3" />
                  <p className="text-xs font-bold uppercase tracking-widest">
                    Stockfish is judging you<span className="animate-blink">_</span>
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-2">
                    depth 18, every move. about a minute.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="card-b-flat shrink-0">
              <h3 className="heading-b text-sm mb-3 border-b-[3px] border-ink pb-2">Accuracy</h3>
              <div className="flex gap-3">
                {(["w", "b"] as const).map((color) => (
                  <div key={color} className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1 truncate">
                      {color === "w" ? game.whiteUsername : game.blackUsername}
                    </p>
                    <p className="font-mono font-bold text-2xl mb-2">
                      {color === "w" ? analysis?.accuracyWhite : analysis?.accuracyBlack}%
                    </p>
                    <div className="text-[10px] font-bold uppercase tracking-wider space-y-0.5">
                      {tally(color)
                        .filter((t) => t.n > 0)
                        .map((t) => (
                          <p key={t.c} className="flex justify-between gap-2">
                            <span className="text-neutral-500">{t.c.toLowerCase()}</span>
                            <span className="font-mono">{t.n}</span>
                          </p>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Move list takes the slack and scrolls inside itself, so a long game
              never makes the page scroll. */}
          <div className="card-b-flat flex-1 min-h-0 overflow-y-auto">
            <h3 className="heading-b text-sm mb-3 border-b-[3px] border-ink pb-2">Moves</h3>
            <div className="text-sm font-mono">
              {Array.from({ length: Math.ceil(totalPlies / 2) }, (_, i) => (
                <div key={i} className={`flex gap-1 px-1 ${i % 2 === 1 ? "bg-neutral-100" : ""}`}>
                  <span className="text-neutral-400 w-6 shrink-0">{i + 1}.</span>
                  {[0, 1].map((half) => {
                    const p = i * 2 + half + 1;
                    if (p > totalPlies) return <span key={half} className="flex-1" />;
                    const m = moves[p - 1];
                    return (
                      <button
                        key={half}
                        onClick={() => step(p)}
                        className={`flex-1 text-left px-1 font-bold ${
                          ply === p ? "bg-ink text-white" : "hover:bg-neutral-200"
                        }`}
                      >
                        {game.moves[p - 1]}
                        {m ? MARK[m.classification] : ""}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Verdict on the move now on the board */}
          {current && (
            <div className="card-b-flat shrink-0">
              <p className="font-mono font-bold text-lg">
                {Math.ceil(current.ply / 2)}
                {current.color === "w" ? "." : "..."} {current.san}
                {MARK[current.classification]}
              </p>
              <p className="text-xs font-bold uppercase tracking-widest mt-1">
                {current.classification.toLowerCase()} · {current.accuracy}% accurate
                {current.cpLoss > 0 && ` · −${(current.cpLoss / 100).toFixed(2)} pawns`}
              </p>
              {current.bestMove && current.bestMove !== current.playedMove && (
                <p className="text-xs font-mono text-neutral-500 mt-1">
                  engine wanted {current.bestMove} instead
                </p>
              )}
            </div>
          )}

          {/* Transport */}
          <div className="shrink-0 flex flex-col gap-1">
            <div className="flex gap-2">
              <button onClick={() => step(0)} className="btn-b btn-b-sm flex-1" aria-label="First move">
                |◀
              </button>
              <button onClick={() => step(ply - 1)} className="btn-b btn-b-sm flex-1" aria-label="Previous move">
                ◀
              </button>
              <span className="flex items-center justify-center font-mono text-xs font-bold w-20 border-[3px] border-ink">
                {ply}/{totalPlies}
              </span>
              <button onClick={() => step(ply + 1)} className="btn-b btn-b-sm flex-1" aria-label="Next move">
                ▶
              </button>
              <button onClick={() => step(totalPlies)} className="btn-b btn-b-sm flex-1" aria-label="Last move">
                ▶|
              </button>
            </div>
            <p className="text-center text-[10px] font-bold uppercase tracking-widest text-neutral-500">
              ← → to step · Home / End for the ends
              {Object.keys(engineHint).length > 0 && " · ringed = engine's move from here"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
