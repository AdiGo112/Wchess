import React from "react";

const LABELS = ["Beginner", "Easy", "Medium", "Hard", "Expert"];

/**
 * Stockfish difficulty slider (1-5).
 * @param {object} props
 * @param {number} props.value - 1..5
 * @param {(value: number) => void} props.onChange
 */
export default function DifficultySlider({ value, onChange }) {
  return (
    <div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-indigo-500"
      />
      <div className="flex justify-between mt-1 text-[11px] text-gray-400">
        {LABELS.map((label, i) => (
          <span
            key={label}
            className={value === i + 1 ? "text-indigo-400 font-semibold" : ""}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
