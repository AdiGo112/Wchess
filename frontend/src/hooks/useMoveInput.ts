import { CSSProperties, useCallback, useMemo, useState } from "react";
import { Chess, Square } from "chess.js";
import { playSound } from "../lib/sound";

export type PromotionPiece = "q" | "r" | "b" | "n";

/** A pawn move waiting on the promotion picker. */
export interface PendingPromotion {
  from: Square;
  to: Square;
  color: "w" | "b";
}

interface Options {
  fen: string;
  /** The side the viewer may move, or null when they can't move at all (spectator, game over). */
  myColor: "w" | "b" | null;
  /** Called with a move already known to be legal. Returns false if the caller rejected it. */
  onMove: (from: Square, to: Square, promotion?: PromotionPiece) => boolean;
}

/**
 * Board input shared by every playable board: drag-and-drop AND click-to-move
 * (click a piece, then a highlighted square), plus the promotion picker. Moves
 * reach `onMove` only once legal and, for promotions, once a piece is chosen.
 */
export default function useMoveInput({ fen, myColor, onMove }: Options) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [pending, setPending] = useState<PendingPromotion | null>(null);

  const chess = useMemo(() => new Chess(fen === "start" ? undefined : fen), [fen]);
  const canMove = myColor !== null && chess.turn() === myColor && !chess.isGameOver();

  const targetsOf = useCallback(
    (from: Square) => (canMove ? chess.moves({ square: from, verbose: true }) : []),
    [chess, canMove],
  );

  /** Shared by drop and click: legal → move (or open the picker), illegal → buzz. */
  const attempt = useCallback(
    (from: Square, to: Square): boolean => {
      const legal = targetsOf(from).filter((m) => m.to === to);
      setSelected(null);
      if (!legal.length) {
        playSound("illegal");
        return false;
      }
      if (legal.some((m) => m.promotion)) {
        setPending({ from, to, color: chess.turn() });
        return false; // the piece snaps back until a promotion piece is picked
      }
      return onMove(from, to);
    },
    [targetsOf, chess, onMove],
  );

  const onPieceDrop = useCallback((from: string, to: string) => attempt(from as Square, to as Square), [attempt]);

  const onSquareClick = useCallback(
    (square: string) => {
      const sq = square as Square;
      if (!canMove || pending) return;
      if (selected && targetsOf(selected).some((m) => m.to === sq)) {
        attempt(selected, sq);
        return;
      }
      const piece = chess.get(sq);
      // Click your own piece to pick it up (again to put it down); anything else clears.
      setSelected(piece && piece.color === myColor && sq !== selected ? sq : null);
    },
    [canMove, pending, selected, targetsOf, attempt, chess, myColor],
  );

  const choosePromotion = useCallback(
    (piece: PromotionPiece | null) => {
      if (pending && piece) onMove(pending.from, pending.to, piece);
      setPending(null);
    },
    [pending, onMove],
  );

  /* Strict-mono hints: the picked-up piece gets an inset ring, quiet targets a
     dot, captures a ring. Merged under the caller's own square styles. */
  const selectionStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    if (!selected) return styles;
    styles[selected] = { boxShadow: "inset 0 0 0 4px #ffffff, inset 0 0 0 7px #0a0a0a" };
    for (const m of targetsOf(selected)) {
      styles[m.to] = m.captured
        ? { boxShadow: "inset 0 0 0 5px rgba(10,10,10,0.6)" }
        : { background: "radial-gradient(circle, rgba(10,10,10,0.45) 22%, transparent 24%)" };
    }
    return styles;
  }, [selected, targetsOf]);

  return { onPieceDrop, onSquareClick, selectionStyles, pending, choosePromotion };
}
