import type { PendingPromotion, PromotionPiece } from "../hooks/useMoveInput";

const GLYPHS: Record<"w" | "b", Record<PromotionPiece, string>> = {
  w: { q: "♕", r: "♖", b: "♗", n: "♘" },
  b: { q: "♛", r: "♜", b: "♝", n: "♞" },
};
const NAMES: Record<PromotionPiece, string> = { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" };

/** Covers the board until a piece is picked; Escape or a click outside cancels the move. */
export default function PromotionPicker({
  pending,
  onChoose,
}: {
  pending: PendingPromotion | null;
  onChoose: (piece: PromotionPiece | null) => void;
}) {
  if (!pending) return null;
  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center bg-ink/60"
      onClick={() => onChoose(null)}
      onKeyDown={(e) => e.key === "Escape" && onChoose(null)}
      role="dialog"
      aria-label="Choose a promotion piece"
    >
      <div className="card-b !p-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        {(["q", "r", "b", "n"] as const).map((p, i) => (
          <button
            key={p}
            type="button"
            autoFocus={i === 0}
            onClick={() => onChoose(p)}
            className="w-16 h-16 text-5xl leading-none border-[3px] border-ink bg-white hover:bg-ink hover:text-white focus-visible:bg-ink focus-visible:text-white"
            aria-label={NAMES[p]}
            title={NAMES[p]}
          >
            {GLYPHS[pending.color][p]}
          </button>
        ))}
      </div>
    </div>
  );
}
