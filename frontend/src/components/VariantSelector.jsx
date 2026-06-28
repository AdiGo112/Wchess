import React from "react";

/** Preset time controls. `variant` matches the backend enum (bullet/blitz/rapid/classical). */
export const TIME_PRESETS = [
  { label: "1|0", name: "Bullet", variant: "bullet", timeControl: 60, increment: 0 },
  { label: "2|1", name: "Bullet", variant: "bullet", timeControl: 120, increment: 1 },
  { label: "3|0", name: "Blitz", variant: "blitz", timeControl: 180, increment: 0 },
  { label: "5|0", name: "Blitz", variant: "blitz", timeControl: 300, increment: 0 },
  { label: "10|0", name: "Rapid", variant: "rapid", timeControl: 600, increment: 0 },
  { label: "30|0", name: "Classical", variant: "classical", timeControl: 1800, increment: 0 },
];

export function presetKey(p) {
  return `${p.timeControl}+${p.increment}`;
}

/**
 * Grid of preset time-control buttons.
 * @param {object} props
 * @param {object|null} props.selected - currently selected preset
 * @param {(preset: object) => void} props.onSelect
 */
export default function VariantSelector({ selected, onSelect }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TIME_PRESETS.map((p) => {
        const active = selected && presetKey(selected) === presetKey(p);
        return (
          <button
            key={presetKey(p)}
            type="button"
            onClick={() => onSelect(p)}
            className={`flex flex-col items-center px-2 py-2 rounded-lg border transition ${
              active
                ? "bg-indigo-600 border-indigo-500"
                : "border-gray-600 hover:border-indigo-400"
            }`}
          >
            <span className="font-semibold">{p.label}</span>
            <span className="text-xs text-gray-300">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
