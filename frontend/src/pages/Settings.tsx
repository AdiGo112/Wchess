import { useState } from "react";
import {
  PACKS,
  PackId,
  SoundName,
  getPack,
  getVolume,
  isMuted,
  playSound,
  setMuted,
  setPack,
  setVolume,
} from "../lib/sound";

const PREVIEW: SoundName[] = ["move", "capture", "check", "start", "end", "tick"];

export default function Settings() {
  const [pack, setPackState] = useState<PackId>(getPack);
  const [volume, setVolumeState] = useState(getVolume);
  const [muted, setMutedState] = useState(isMuted);

  const choosePack = (id: PackId) => {
    setPack(id);
    setPackState(id);
    playSound("move", id);
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="heading-b text-4xl md:text-5xl text-center mb-2">SETTINGS</h1>
      <p className="text-center mb-10">
        <span className="tag-b">saved on this device</span>
      </p>

      <section className="card-b">
        <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
          <h2 className="heading-b text-xl">Sound</h2>
          <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest cursor-pointer">
            <input
              type="checkbox"
              checked={!muted}
              onChange={(e) => {
                setMuted(!e.target.checked);
                setMutedState(!e.target.checked);
              }}
              className="w-4 h-4 accent-ink"
            />
            Sounds on
          </label>
        </div>

        <fieldset disabled={muted} className={muted ? "opacity-40" : ""}>
          <legend className="label-b">Sound pack</legend>
          <div className="grid sm:grid-cols-2 gap-3" role="radiogroup">
            {(Object.keys(PACKS) as PackId[]).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={pack === id}
                onClick={() => choosePack(id)}
                className={`text-left border-[3px] border-ink px-4 py-3 transition-all ${
                  pack === id ? "bg-ink text-white shadow-brutal-sm" : "bg-white hover:shadow-brutal-sm"
                }`}
              >
                <span className="font-display uppercase block">{PACKS[id].label}</span>
                <span className={`text-xs ${pack === id ? "text-neutral-300" : "text-neutral-500"}`}>
                  {PACKS[id].blurb}
                </span>
              </button>
            ))}
          </div>

          <label className="label-b mt-6 block" htmlFor="volume">
            Volume — {Math.round(volume * 100)}%
          </label>
          <input
            id="volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => {
              setVolume(+e.target.value);
              setVolumeState(+e.target.value);
            }}
            onPointerUp={() => playSound("move")}
            className="w-full accent-ink"
          />

          <p className="label-b mt-6">Preview</p>
          <div className="flex flex-wrap gap-2">
            {PREVIEW.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => playSound(name)}
                className="btn-b btn-b-sm capitalize"
              >
                ▶ {name}
              </button>
            ))}
          </div>
        </fieldset>
      </section>
    </div>
  );
}
