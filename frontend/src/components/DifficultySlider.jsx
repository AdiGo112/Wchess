import React from "react";

const LABELS = ["Pawn", "Knight", "Bishop", "Rook", "Queen"];

/**
 * Stockfish difficulty (1-5) as five discrete steps — a brutalist segmented
 * control instead of a range input (range thumbs can't be styled monochrome
 * consistently across browsers, and 5 discrete values never needed a slider).
 * @param {object} props
 * @param {number} props.value - 1..5
 * @param {(value: number) => void} props.onChange
 */
export default function DifficultySlider({ value, onChange }) {
  return (
    <div className="flex border-[3px] border-ink divide-x-[3px] divide-ink">
      {LABELS.map((label, i) => {
        const lvl = i + 1;
        const active = value === lvl;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(lvl)}
            title={label}
            className={`flex-1 flex flex-col items-center py-2 transition-colors ${
              active ? "bg-ink text-white" : "bg-white hover:bg-neutral-200"
            }`}
          >
            <span className="font-mono font-bold text-sm">{lvl}</span>
            <span
              className={`text-[9px] font-bold uppercase tracking-wider ${
                active ? "text-neutral-300" : "text-neutral-500"
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
