export interface TimePreset {
  label: string;
  name: string;
  /** Matches the backend enum (bullet/blitz/rapid/classical). */
  variant: "bullet" | "blitz" | "rapid" | "classical";
  timeControl: number;
  increment: number;
}

/** Preset time controls. */
export const TIME_PRESETS: TimePreset[] = [
  { label: "1|0", name: "Bullet", variant: "bullet", timeControl: 60, increment: 0 },
  { label: "2|1", name: "Bullet", variant: "bullet", timeControl: 120, increment: 1 },
  { label: "3|0", name: "Blitz", variant: "blitz", timeControl: 180, increment: 0 },
  { label: "5|0", name: "Blitz", variant: "blitz", timeControl: 300, increment: 0 },
  { label: "10|0", name: "Rapid", variant: "rapid", timeControl: 600, increment: 0 },
  { label: "30|0", name: "Classical", variant: "classical", timeControl: 1800, increment: 0 },
];

export function presetKey(p: TimePreset): string {
  return `${p.timeControl}+${p.increment}`;
}

interface VariantSelectorProps {
  selected: TimePreset | null;
  onSelect: (preset: TimePreset) => void;
}

/** Grid of preset time-control buttons. */
export default function VariantSelector({ selected, onSelect }: VariantSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {TIME_PRESETS.map((p) => {
        const active = selected && presetKey(selected) === presetKey(p);
        return (
          <button
            key={presetKey(p)}
            type="button"
            onClick={() => onSelect(p)}
            className={`flex flex-col items-center px-2 py-2 border-[3px] border-ink transition-all ${
              active
                ? "bg-ink text-white shadow-brutal-sm"
                : "bg-white hover:shadow-brutal-sm"
            }`}
          >
            <span className="font-mono font-bold">{p.label}</span>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest ${
                active ? "text-neutral-300" : "text-neutral-500"
              }`}
            >
              {p.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
