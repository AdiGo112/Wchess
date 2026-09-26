/* Game sounds, synthesized with the Web Audio API — no audio files to host or
   license (chess.com's are proprietary, lichess's are AGPL / non-free), so the
   packs borrow their *designs*, not their samples. The player picks one in
   /settings.
   ponytail: sample-based packs would swap `playNotes` for `new Audio(url).play()`;
   call sites wouldn't change. Prefs are per-device (localStorage) — move them
   to the user record if people want them to follow their account. */

/** The event set is chess.com's + lichess's, minus what this app has no use for. */
export const EVENTS = [
  ["move", "Move"],
  ["capture", "Capture"],
  ["castle", "Castle"],
  ["promote", "Promote"],
  ["check", "Check"],
  ["illegal", "Illegal"],
  ["start", "Game start"],
  ["victory", "Victory"],
  ["defeat", "Defeat"],
  ["draw", "Draw"],
  ["lowTime", "Low time"],
  ["tick", "Clock tick"],
  ["notify", "Offer"],
] as const;

export type SoundName = (typeof EVENTS)[number][0];

interface Note {
  freq: number;
  ms: number;
  /** "noise" = band-passed noise at `freq`: a click/knock instead of a tone. */
  wave?: OscillatorType | "noise";
  gain?: number;
  /** Glide the pitch (or noise band) to this frequency over the note. */
  to?: number;
  /** Extra partials as frequency ratios, played at once — chords, bells, metal. */
  chord?: number[];
}

type Opts = Omit<Note, "freq" | "ms">;
const n = (freq: number, ms: number, opts: Opts = {}): Note => ({ freq, ms, ...opts });
/** Same options on every note of a sequence. */
const seq = (opts: Opts, ...notes: [number, number, Opts?][]): Note[] =>
  notes.map(([f, ms, o]) => n(f, ms, { ...opts, ...o }));

/** A pack may leave any sound out; it then falls back to Soft's (see resolve). */
type Pack = Partial<Record<SoundName, Note[]>>;

interface PackDef {
  label: string;
  blurb: string;
  /** "Inspired by" credit shown in settings. */
  after?: string;
  sounds: Pack;
}

const SINE: Opts = { wave: "sine" };
const TRI: Opts = { wave: "triangle" };
const NOISE: Opts = { wave: "noise", gain: 2 };

export const PACKS = {
  brut: {
    label: "Béton",
    blurb: "Hard square-wave beeps. The default.",
    sounds: {
      move: [n(520, 60)],
      capture: [n(180, 110, { wave: "sawtooth", gain: 1.3 })],
      castle: [n(520, 50), n(620, 60)],
      promote: [n(523, 60), n(784, 60), n(1047, 90)],
      check: [n(880, 70), n(880, 70)],
      illegal: [n(140, 120, { wave: "sawtooth" })],
      start: [n(392, 90), n(523, 90), n(659, 140)],
      victory: [n(523, 90), n(659, 90), n(784, 90), n(1047, 220)],
      defeat: [n(659, 110), n(523, 110), n(330, 260)],
      draw: [n(523, 120), n(523, 160)],
      lowTime: [n(1320, 60), n(990, 60), n(1320, 60)],
      tick: [n(1200, 30, { gain: 0.5 })],
      notify: [n(784, 70), n(1047, 90)],
    },
  },
  soft: {
    label: "Soft",
    blurb: "Quiet sine tones for late-night games.",
    // Complete on purpose: every other pack falls back to these.
    sounds: {
      move: seq(SINE, [440, 90]),
      capture: seq(SINE, [330, 140, { gain: 1.2 }]),
      castle: seq(SINE, [440, 80], [523, 100]),
      promote: seq(SINE, [523, 90], [659, 90], [880, 160]),
      check: seq(SINE, [660, 90], [784, 120]),
      illegal: seq(SINE, [220, 160], [208, 160]),
      start: seq(SINE, [523, 120], [659, 120], [784, 200]),
      victory: seq(SINE, [523, 120], [659, 120], [784, 120], [1047, 300]),
      defeat: seq(SINE, [784, 140], [622, 140], [523, 320]),
      draw: seq(SINE, [587, 180, { chord: [1.5] }]),
      lowTime: seq(SINE, [1175, 90], [1175, 90]),
      tick: seq(SINE, [990, 40, { gain: 0.5 }]),
      notify: seq(SINE, [784, 90], [988, 140]),
    },
  },
  wood: {
    label: "Wood",
    blurb: "Filtered noise knocks — closest to real pieces on a board.",
    after: "chess.com Default · lichess Standard",
    sounds: {
      move: seq(NOISE, [1800, 45]),
      capture: seq(NOISE, [900, 70, { gain: 2.5 }], [1400, 40, { gain: 1.5 }]),
      castle: seq(NOISE, [1800, 45], [1500, 55]),
      promote: seq(NOISE, [1800, 40], [2600, 70]),
      check: seq(NOISE, [2400, 40], [2400, 40]),
      illegal: seq(NOISE, [400, 110, { gain: 3 }]),
      start: seq(NOISE, [1200, 50], [1600, 50], [2000, 70]),
      victory: seq(NOISE, [1600, 50], [2000, 50], [2600, 100]),
      defeat: seq(NOISE, [2000, 60], [1400, 60], [800, 130, { gain: 2.5 }]),
      draw: seq(NOISE, [1400, 70], [1400, 70]),
      lowTime: seq(NOISE, [3000, 30], [3000, 30], [3000, 30]),
      tick: seq(NOISE, [3000, 20, { gain: 1 }]),
      notify: seq(NOISE, [2200, 40], [2800, 50]),
    },
  },
  piano: {
    label: "Piano",
    blurb: "Soft keys with an octave shimmer; a tritone for check.",
    after: "lichess Piano",
    sounds: {
      move: seq({ ...TRI, chord: [2] }, [523, 260]),
      capture: seq({ ...TRI, chord: [1.5, 2] }, [330, 320]),
      castle: seq({ ...TRI, chord: [2] }, [523, 150], [659, 260]),
      promote: seq({ ...TRI, chord: [2] }, [523, 110], [659, 110], [784, 110], [1047, 380]),
      check: seq(TRI, [784, 240, { chord: [1.414] }]),
      illegal: seq(TRI, [185, 280, { chord: [1.06] }]),
      start: seq({ ...TRI, chord: [2] }, [523, 160], [659, 160], [784, 380]),
      victory: seq(TRI, [523, 140], [659, 140], [784, 140], [1047, 520, { chord: [1.25, 1.5] }]),
      defeat: seq(TRI, [440, 220], [349, 220], [262, 520, { chord: [1.19, 1.5] }]),
      draw: seq(TRI, [523, 420, { chord: [1.5] }]),
    },
  },
  arcade: {
    label: "Arcade",
    blurb: "8-bit triangle-wave arpeggios.",
    after: "lichess NES",
    sounds: {
      move: seq(TRI, [660, 40], [990, 40]),
      capture: seq(TRI, [990, 40], [660, 40], [330, 80]),
      castle: seq(TRI, [660, 40], [880, 40], [990, 50]),
      promote: seq(TRI, [523, 50], [659, 50], [784, 50], [1047, 50], [1319, 110]),
      check: seq(TRI, [1320, 50], [990, 50], [1320, 50]),
      illegal: seq(TRI, [200, 60], [150, 110]),
      start: seq(TRI, [523, 70], [659, 70], [784, 70], [1047, 160]),
      victory: seq(TRI, [784, 70], [1047, 70], [1319, 70], [1568, 70], [2093, 220]),
      defeat: seq(TRI, [1047, 90], [784, 90], [523, 90], [262, 260]),
      draw: seq(TRI, [659, 100], [659, 100], [659, 160]),
      lowTime: seq(TRI, [1760, 40], [1760, 40], [1760, 40]),
      tick: seq(TRI, [1500, 25, { gain: 0.6 }]),
      notify: seq(TRI, [988, 60], [1319, 90]),
    },
  },
  metal: {
    label: "Metal",
    blurb: "Struck steel — inharmonic partials that ring out.",
    after: "chess.com Metal",
    // Ratios off the harmonic series are what make a tone read as a bell/bar.
    sounds: {
      move: seq({ ...SINE, chord: [2.76, 5.4] }, [1200, 320]),
      capture: seq({ ...SINE, chord: [2.76, 5.4] }, [700, 460, { gain: 1.3 }]),
      castle: seq({ ...SINE, chord: [2.76] }, [1200, 180], [1000, 320]),
      promote: seq({ ...SINE, chord: [2.76] }, [1000, 150], [1500, 420]),
      check: seq({ ...SINE, chord: [2.76] }, [1800, 200], [1800, 320]),
      illegal: seq({ ...SINE, chord: [1.41, 2.76] }, [300, 320]),
      start: seq({ ...SINE, chord: [2.76] }, [800, 200], [1200, 420]),
      victory: seq({ ...SINE, chord: [2.76] }, [900, 150], [1200, 150], [1800, 640]),
      defeat: seq({ ...SINE, chord: [2.76] }, [1200, 200], [800, 200], [500, 720]),
      notify: seq({ ...SINE, chord: [2.76] }, [1500, 300]),
    },
  },
  marble: {
    label: "Marble",
    blurb: "Stone-on-stone click with a short glassy ring.",
    after: "chess.com Marble",
    sounds: {
      move: [n(4500, 25, { ...NOISE, gain: 3 }), n(2200, 70, { ...SINE, gain: 0.6 })],
      capture: [n(3000, 35, { ...NOISE, gain: 3.5 }), n(1400, 90, { ...SINE, gain: 0.7 })],
      castle: [n(4500, 25, { ...NOISE, gain: 3 }), n(2200, 50, SINE), n(4500, 25, { ...NOISE, gain: 3 }), n(2600, 60, SINE)],
      promote: [n(4500, 25, { ...NOISE, gain: 3 }), n(2200, 60, SINE), n(3300, 140, SINE)],
      check: [n(5000, 25, { ...NOISE, gain: 3 }), n(2640, 90, SINE), n(2640, 90, SINE)],
      illegal: [n(800, 60, { ...NOISE, gain: 3 }), n(300, 120, SINE)],
    },
  },
  nature: {
    label: "Nature",
    blurb: "Water drops — every sound is a rising bloop.",
    after: "chess.com Nature · lichess Woodland",
    sounds: {
      move: seq(SINE, [600, 70, { to: 1400 }]),
      capture: seq(SINE, [400, 90, { to: 1100 }], [900, 60, { to: 1800 }]),
      castle: seq(SINE, [600, 60, { to: 1300 }], [700, 70, { to: 1500 }]),
      promote: seq(SINE, [500, 60, { to: 1000 }], [700, 60, { to: 1400 }], [900, 100, { to: 2000 }]),
      check: seq(SINE, [1200, 60, { to: 2400 }], [1200, 60, { to: 2400 }]),
      illegal: seq(SINE, [300, 160, { to: 150 }]),
      start: seq(SINE, [500, 120, { to: 900 }], [700, 120, { to: 1300 }], [900, 200, { to: 1800 }]),
      victory: seq(SINE, [600, 90, { to: 1200 }], [800, 90, { to: 1600 }], [1000, 90, { to: 2000 }], [1200, 220, { to: 2600 }]),
      defeat: seq(SINE, [1400, 260, { to: 500 }], [900, 360, { to: 300 }]),
      draw: seq(SINE, [800, 150, { to: 1200 }], [800, 150, { to: 1200 }]),
      lowTime: seq(SINE, [1600, 50, { to: 2600 }], [1600, 50, { to: 2600 }], [1600, 50, { to: 2600 }]),
      tick: seq(SINE, [2000, 30, { to: 2600, gain: 0.5 }]),
      notify: seq(SINE, [900, 80, { to: 1500 }], [1200, 90, { to: 2000 }]),
    },
  },
  space: {
    label: "Space",
    blurb: "Laser sweeps and falling sawtooth zaps.",
    after: "chess.com Space · lichess Futuristic",
    sounds: {
      move: seq(SINE, [1400, 90, { to: 700 }]),
      capture: [n(900, 160, { wave: "sawtooth", to: 200, gain: 0.8 })],
      castle: seq(SINE, [1400, 70, { to: 700 }], [1600, 70, { to: 800 }]),
      promote: seq(SINE, [400, 240, { to: 1600, chord: [1.5] }]),
      check: seq({ wave: "square" }, [2000, 80, { to: 1000 }], [2000, 80, { to: 1000 }]),
      illegal: [n(150, 220, { wave: "sawtooth", to: 80 })],
      start: seq(SINE, [200, 320, { to: 1200, chord: [1.5] }]),
      victory: seq(SINE, [300, 520, { to: 1800, chord: [1.5, 2] }]),
      defeat: [n(1200, 640, { wave: "sawtooth", to: 150, gain: 0.7 })],
      draw: seq(SINE, [600, 200, { to: 900 }], [900, 200, { to: 600 }]),
      lowTime: seq(SINE, [2400, 60, { to: 1800 }], [2400, 60, { to: 1800 }], [2400, 60, { to: 1800 }]),
      tick: seq(SINE, [1800, 25, { to: 1600, gain: 0.5 }]),
      notify: seq(SINE, [800, 140, { to: 1600 }]),
    },
  },
  robot: {
    label: "Robot",
    blurb: "Low square-wave bleeps and servo glides.",
    after: "lichess Robot",
    sounds: {
      move: seq({ wave: "square" }, [220, 70, { to: 180 }]),
      capture: [n(160, 130, { wave: "sawtooth", to: 90 })],
      castle: seq({ wave: "square" }, [220, 60, { to: 180 }], [260, 60, { to: 220 }]),
      promote: seq({ wave: "square" }, [220, 50], [330, 50], [440, 50], [660, 130]),
      check: seq({ wave: "square" }, [440, 80, { to: 330 }], [440, 80, { to: 330 }]),
      illegal: [n(90, 220, { wave: "sawtooth" })],
      start: seq({ wave: "square" }, [110, 80], [220, 80], [440, 170]),
      victory: seq({ wave: "square" }, [330, 70], [440, 70], [660, 70], [880, 220]),
      defeat: seq({ wave: "square" }, [440, 520, { to: 110 }]),
      draw: seq({ wave: "square" }, [220, 150], [220, 150]),
      lowTime: seq({ wave: "square" }, [660, 50], [660, 50], [660, 50]),
      tick: seq({ wave: "square" }, [880, 25, { gain: 0.5 }]),
      notify: seq({ wave: "square" }, [440, 60], [660, 90]),
    },
  },
  voice: {
    label: "Voice",
    blurb: "Reads every move aloud (\"Knight takes e5, check\"). Other sounds use Soft.",
    after: "lichess Speech",
    sounds: {},
  },
} satisfies Record<string, PackDef>;

export type PackId = keyof typeof PACKS;
/** PACKS widened to one shape, for rendering the picker. */
export const PACK_LIST = Object.entries(PACKS) as [PackId, PackDef][];

/** A missing castle/promote borrows the pack's own move/check before leaving the pack. */
const SIBLING: Partial<Record<SoundName, SoundName>> = { castle: "move", promote: "check" };

function resolve(pack: PackId, name: SoundName): Note[] {
  const own: Pack = PACKS[pack].sounds;
  const sib = SIBLING[name];
  return own[name] ?? (sib && own[sib]) ?? PACKS.soft.sounds[name];
}

// ------------------------------------------------------------------ prefs

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
  const raw = read(VOLUME_KEY);
  const v = Number(raw);
  return raw !== null && v >= 0 && v <= 1 ? v : 0.7;
}
export const setVolume = (v: number) => write(VOLUME_KEY, String(v));

// ------------------------------------------------------------------ synth

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

function noise(ac: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  noiseBuffer = ac.createBuffer(1, ac.sampleRate / 2, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

function playNotes(notes: Note[]) {
  const volume = getVolume() * 0.15; // full slider = comfortable, not piercing
  if (volume <= 0) return;
  try {
    // Created lazily: browsers refuse audio before a user gesture, and by the
    // time a game emits a sound the player has always clicked something.
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    let t = ctx.currentTime;
    for (const { freq, ms, wave = "square", gain = 1, to, chord = [] } of notes) {
      const end = t + ms / 1000;
      const amp = ctx.createGain();
      // Partials share one envelope, so a chord is no louder than a single tone.
      amp.gain.setValueAtTime((volume * gain) / (1 + chord.length * 0.6), t);
      amp.gain.exponentialRampToValueAtTime(0.001, end);
      amp.connect(ctx.destination);

      for (const ratio of [1, ...chord]) {
        const partial = ctx.createGain();
        partial.gain.value = ratio === 1 ? 1 : 0.6;
        partial.connect(amp);

        let src: AudioScheduledSourceNode;
        let pitch: AudioParam;
        if (wave === "noise") {
          // Band-passed noise reads as a click/knock; freq sets its pitch.
          const buf = ctx.createBufferSource();
          buf.buffer = noise(ctx);
          const filter = ctx.createBiquadFilter();
          filter.type = "bandpass";
          filter.Q.value = 4;
          buf.connect(filter).connect(partial);
          src = buf;
          pitch = filter.frequency;
        } else {
          const osc = ctx.createOscillator();
          osc.type = wave;
          osc.connect(partial);
          src = osc;
          pitch = osc.frequency;
        }
        pitch.setValueAtTime(freq * ratio, t);
        if (to) pitch.exponentialRampToValueAtTime(to * ratio, end);
        src.start(t);
        src.stop(end);
      }
      t = end;
    }
  } catch {
    /* no Web Audio — play silently */
  }
}

// ------------------------------------------------------------------ speech

const PIECE: Record<string, string> = { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight" };

/** "Nxe5+" → "Knight takes e5, check". Exported for the settings preview. */
export function sanToWords(san: string): string {
  const suffix = san.endsWith("#") ? ", checkmate" : san.endsWith("+") ? ", check" : "";
  const body = san.replace(/[+#]$/, "");
  if (body === "O-O-O") return `Castles long${suffix}`;
  if (body === "O-O") return `Castles short${suffix}`;
  const words = body
    // First, while the string is still raw SAN, space out every file/rank so
    // voices say "e 4", not "E4 the vitamin", and disambiguators read too:
    // "Nbd2" → "Knight b d 2". (After expansion it would split "Knig ht".)
    .replace(/([a-h1-8])(?=[a-h1-8])/g, "$1 ")
    .replace(/^([KQRBN])/, (_, p: string) => `${PIECE[p]} `)
    .replace("x", " takes ")
    .replace(/=([QRBN])/, (_, p: string) => `, promotes to ${PIECE[p]}`);
  return words.replace(/\s+/g, " ").trim() + suffix;
}

function speak(san: string) {
  try {
    const synth = window.speechSynthesis;
    synth.cancel(); // never queue up behind a stale move in a fast game
    const u = new SpeechSynthesisUtterance(sanToWords(san));
    u.volume = getVolume();
    u.rate = 1.15;
    synth.speak(u);
  } catch {
    /* no speech synthesis — stay quiet */
  }
}

/** What Voice says when a move sound is previewed in settings. */
const SAMPLE_SAN: Partial<Record<SoundName, string>> = {
  move: "Nf3",
  capture: "Bxe5",
  castle: "O-O",
  promote: "e8=Q",
  check: "Qh5+",
};

// ------------------------------------------------------------------ public

/** Play one named sound. `pack` overrides the saved choice (settings preview). */
export function playSound(name: SoundName, pack: PackId = getPack()) {
  if (isMuted()) return;
  if (pack === "voice" && SAMPLE_SAN[name]) return speak(SAMPLE_SAN[name]!);
  playNotes(resolve(pack, name));
}

/** chess.com's precedence: check outranks promotion, which outranks castle/capture. */
export function moveSoundFor(san: string): SoundName {
  if (/[+#]/.test(san)) return "check";
  if (san.includes("=")) return "promote";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("x")) return "capture";
  return "move";
}

export function playMoveSound(san: string) {
  if (isMuted()) return;
  if (getPack() === "voice") return speak(san);
  playSound(moveSoundFor(san));
}
