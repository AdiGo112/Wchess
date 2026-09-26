/* Game sounds, synthesized with the Web Audio API — no audio files to host or
   license. Each pack is just note lists; the player picks one in /settings.
   ponytail: sample-based packs would swap `play` for `new Audio(url).play()`;
   call sites wouldn't change. Prefs are per-device (localStorage) — move them
   to the user record if people want them to follow their account. */

export type SoundName = "move" | "capture" | "check" | "start" | "end" | "tick";

/** One tone (or noise burst, for percussive "wood" clicks) in a sequence. */
interface Note {
  freq: number;
  ms: number;
  wave?: OscillatorType | "noise";
  gain?: number;
}

type Pack = Record<SoundName, Note[]>;

const n = (freq: number, ms: number, wave?: Note["wave"], gain?: number): Note => ({ freq, ms, wave, gain });

export const PACKS = {
  brut: {
    label: "Béton",
    blurb: "Hard square-wave beeps. The default.",
    sounds: {
      move: [n(520, 60)],
      capture: [n(180, 110, "sawtooth", 1.3)],
      check: [n(880, 70), n(880, 70)],
      start: [n(392, 90), n(523, 90), n(659, 140)],
      end: [n(659, 110), n(523, 110), n(330, 220)],
      tick: [n(1200, 30, "square", 0.5)],
    },
  },
  wood: {
    label: "Wood",
    blurb: "Filtered noise clicks — closest to pieces on a board.",
    sounds: {
      move: [n(1800, 45, "noise", 2)],
      capture: [n(900, 70, "noise", 2.5), n(1400, 40, "noise", 1.5)],
      check: [n(2400, 40, "noise", 2), n(2400, 40, "noise", 2)],
      start: [n(1200, 50, "noise", 2), n(1600, 50, "noise", 2), n(2000, 70, "noise", 2)],
      end: [n(2000, 60, "noise", 2), n(1400, 60, "noise", 2), n(800, 120, "noise", 2.5)],
      tick: [n(3000, 20, "noise", 1)],
    },
  },
  soft: {
    label: "Soft",
    blurb: "Quiet sine tones for late-night games.",
    sounds: {
      move: [n(440, 90, "sine")],
      capture: [n(330, 140, "sine", 1.2)],
      check: [n(660, 90, "sine"), n(784, 120, "sine")],
      start: [n(523, 120, "sine"), n(659, 120, "sine"), n(784, 200, "sine")],
      end: [n(784, 140, "sine"), n(659, 140, "sine"), n(523, 260, "sine")],
      tick: [n(990, 40, "sine", 0.5)],
    },
  },
  arcade: {
    label: "Arcade",
    blurb: "8-bit triangle-wave arpeggios.",
    sounds: {
      move: [n(660, 40, "triangle"), n(990, 40, "triangle")],
      capture: [n(990, 40, "triangle"), n(660, 40, "triangle"), n(330, 80, "triangle")],
      check: [n(1320, 50, "triangle"), n(990, 50, "triangle"), n(1320, 50, "triangle")],
      start: [n(523, 70, "triangle"), n(659, 70, "triangle"), n(784, 70, "triangle"), n(1047, 160, "triangle")],
      end: [n(1047, 90, "triangle"), n(784, 90, "triangle"), n(523, 90, "triangle"), n(262, 240, "triangle")],
      tick: [n(1500, 25, "triangle", 0.6)],
    },
  },
} satisfies Record<string, { label: string; blurb: string; sounds: Pack }>;

export type PackId = keyof typeof PACKS;

const PACK_KEY = "wchess.soundPack";
const VOLUME_KEY = "wchess.volume";
const MUTE_KEY = "wchess.muted";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice just won't persist */
  }
}

export const isMuted = () => read(MUTE_KEY) === "1";
export const setMuted = (muted: boolean) => write(MUTE_KEY, muted ? "1" : "0");

export function getPack(): PackId {
  const id = read(PACK_KEY);
  return id && id in PACKS ? (id as PackId) : "brut";
}
export const setPack = (id: PackId) => write(PACK_KEY, id);

/** 0–1. */
export function getVolume(): number {
  const v = Number(read(VOLUME_KEY));
  return read(VOLUME_KEY) !== null && v >= 0 && v <= 1 ? v : 0.7;
}
export const setVolume = (v: number) => write(VOLUME_KEY, String(v));

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  noiseBuffer = ac.createBuffer(1, ac.sampleRate / 2, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** Play one named sound. `pack` overrides the saved choice (settings preview). */
export function playSound(name: SoundName, pack: PackId = getPack()) {
  if (isMuted()) return;
  const volume = getVolume() * 0.15; // full slider = comfortable, not piercing
  if (volume <= 0) return;
  try {
    // Created lazily: browsers refuse audio before a user gesture, and by the
    // time a game emits a sound the player has always clicked something.
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    let t = ctx.currentTime;
    for (const { freq, ms, wave = "square", gain = 1 } of PACKS[pack].sounds[name]) {
      const end = t + ms / 1000;
      const amp = ctx.createGain();
      amp.gain.setValueAtTime(volume * gain, t);
      amp.gain.exponentialRampToValueAtTime(0.001, end);
      amp.connect(ctx.destination);

      let src: AudioScheduledSourceNode;
      if (wave === "noise") {
        // Band-passed noise reads as a click/knock; freq sets its pitch.
        const buf = ctx.createBufferSource();
        buf.buffer = noise(ctx);
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = freq;
        filter.Q.value = 4;
        buf.connect(filter).connect(amp);
        src = buf;
      } else {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = freq;
        osc.connect(amp);
        src = osc;
      }
      src.start(t);
      src.stop(end);
      t = end;
    }
  } catch {
    /* no Web Audio — play silently */
  }
}

/** Pick the right sound for a move from its SAN. */
export function playMoveSound(san: string) {
  if (san.includes("+") || san.includes("#")) playSound("check");
  else if (san.includes("x")) playSound("capture");
  else playSound("move");
}
