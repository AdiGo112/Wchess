import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Chess, Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useAuth } from "../context/AuthContext";
import useStockfish from "../hooks/useStockfish";
import useBoardFit from "../hooks/useBoardFit";
import useMoveInput, { type PromotionPiece } from "../hooks/useMoveInput";
import PromotionPicker from "../components/PromotionPicker";
import DifficultySlider from "../components/DifficultySlider";
import { playMoveSound, playSound } from "../lib/sound";

const LIGHT_SQ = "#d6d6d6";
const DARK_SQ = "#3a3a3a";
const BOARD_STYLE: CSSProperties = { borderRadius: 0, boxShadow: "8px 8px 0 0 #0a0a0a" };

type Side = "w" | "b";

/**
 * Play Stockfish with no account. The whole game lives in this tab: chess.js
 * keeps the rules, the engine runs in a Web Worker (ADR-0009), nothing touches
 * the server and nothing is saved. Rated games, history and review are what an
 * account adds.
 */
export default function PlayComputer() {
  const { user } = useAuth();
  const [side, setSide] = useState<Side>("w");
  const [difficulty, setDifficulty] = useState(3);
  const [history, setHistory] = useState<string[]>([]); // SAN, replayed into a fresh Chess
  const [thinking, setThinking] = useState(false);

  const chess = useMemo(() => {
    const c = new Chess();
    history.forEach((san) => c.move(san));
    return c;
  }, [history]);
  const fen = chess.fen();
  const moves = chess.history({ verbose: true });
  const last = moves[moves.length - 1];

  const getBestMove = useStockfish(true, difficulty);
  const fit = useBoardFit(340);

  const apply = useCallback(
    (from: string, to: string, promotion?: string) => {
      const next = new Chess(fen);
      let move;
      try {
        move = next.move({ from, to, promotion });
      } catch {
        return false;
      }
      playMoveSound(move.san);
      if (next.isGameOver()) {
        const won = next.isCheckmate() && next.turn() !== side;
        playSound(next.isCheckmate() ? (won ? "victory" : "defeat") : "draw");
      }
      setHistory((h) => [...h, move.san]);
      return true;
    },
    [fen, side],
  );

  const input = useMoveInput({
    fen,
    myColor: thinking ? null : side,
    onMove: (from: Square, to: Square, promotion?: PromotionPiece) => apply(from, to, promotion),
  });

  // Engine's turn: think in the worker, then play its move locally.
  useEffect(() => {
    if (chess.isGameOver() || chess.turn() === side) return undefined;
    let cancelled = false;
    setThinking(true);
    getBestMove(fen).then((m) => {
      if (cancelled) return;
      setThinking(false);
      if (m) apply(m.from, m.to, m.promotion);
    });
    return () => {
      cancelled = true;
      setThinking(false);
    };
  }, [fen, side, chess, getBestMove, apply]);

  const newGame = (as: Side) => {
    setSide(as);
    setHistory([]);
    playSound("start");
  };

  // Take back your last move (and the engine's reply to it).
  const takeBack = () => setHistory((h) => h.slice(0, Math.max(0, h.length - (chess.turn() === side ? 2 : 1))));

  const status = chess.isCheckmate()
    ? chess.turn() === side ? "Checkmate. Stockfish wins." : "Checkmate. You win!"
    : chess.isDraw() || chess.isStalemate()
      ? "Draw."
      : thinking
        ? "Stockfish is thinking…"
        : chess.inCheck() ? "Your move. You're in check!" : "Your move.";

  const lastMoveStyles: Record<string, CSSProperties> = last
    ? {
        [last.from]: { boxShadow: "inset 0 0 0 4px #0a0a0a" },
        [last.to]: { backgroundColor: "rgba(10,10,10,0.35)", boxShadow: "inset 0 0 0 4px #0a0a0a" },
      }
    : {};

  return (
    <div className="-mx-4 -my-8 h-[calc(100%+4rem)] flex flex-col overflow-hidden">
      <div className="w-full flex justify-between items-center px-6 py-3 bg-ink text-white border-b-[3px] border-ink">
        <h2 className="font-display text-lg tracking-tight">VS STOCKFISH</h2>
        <span className="tag-b border-white text-white">Practice · not saved</span>
      </div>

      <div className="flex-1 min-h-0 p-6">
        <div
          ref={fit.ref}
          className={`h-full w-full gap-6 ${
            fit.stacked ? "flex flex-col items-center overflow-y-auto" : "flex items-stretch justify-center"
          }`}
        >
          <div className="shrink-0 flex items-center relative" style={{ width: fit.size }}>
            <Chessboard
              position={fen}
              boardWidth={fit.size}
              boardOrientation={side === "w" ? "white" : "black"}
              onPieceDrop={input.onPieceDrop}
              onSquareClick={input.onSquareClick}
              isDraggablePiece={({ piece }) => !thinking && !chess.isGameOver() && piece.startsWith(side)}
              customLightSquareStyle={{ backgroundColor: LIGHT_SQ }}
              customDarkSquareStyle={{ backgroundColor: DARK_SQ }}
              customBoardStyle={BOARD_STYLE}
              customSquareStyles={{ ...lastMoveStyles, ...input.selectionStyles }}
              customDropSquareStyle={{ boxShadow: "inset 0 0 0 4px #ffffff" }}
            />
            <PromotionPicker pending={input.pending} onChoose={input.choosePromotion} />
          </div>

          <div className={`flex flex-col gap-3 min-h-0 ${fit.stacked ? "w-full max-w-[560px]" : "flex-1 min-w-0 max-w-[360px]"}`}>
            <div className="card-b-flat">
              <p className="font-bold uppercase tracking-wider text-sm" role="status" aria-live="polite">
                {status}
              </p>
            </div>

            <div className="card-b-flat">
              <p className="label-b">Difficulty</p>
              <DifficultySlider value={difficulty} onChange={setDifficulty} />
            </div>

            <div className="card-b-flat flex-1 min-h-0 overflow-y-auto">
              <h3 className="heading-b text-sm mb-3 border-b-[3px] border-ink pb-2">Moves</h3>
              {history.length === 0 ? (
                <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest">
                  {side === "w" ? "You're white. Make the first move." : "You're black. Stockfish opens."}
                </p>
              ) : (
                <ol className="grid grid-cols-[auto_1fr_1fr] gap-x-3 gap-y-1 font-mono text-sm">
                  {Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => (
                    <li key={i} className="contents">
                      <span className="text-neutral-400">{i + 1}.</span>
                      <span>{history[i * 2]}</span>
                      <span>{history[i * 2 + 1] ?? ""}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="btn-b" onClick={takeBack} disabled={thinking || history.length === 0}>
                Take back
              </button>
              <button type="button" className="btn-b" onClick={() => newGame(side === "w" ? "b" : "w")}>
                Switch sides
              </button>
              <button type="button" className="btn-b btn-b-primary col-span-2" onClick={() => newGame(side)}>
                New game
              </button>
            </div>

            {!user && (
              <p className="text-xs font-medium text-neutral-600">
                <Link to="/signup" className="font-bold underline underline-offset-4">Create a free account</Link>{" "}
                for rated games against people, game history and move-by-move review.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
