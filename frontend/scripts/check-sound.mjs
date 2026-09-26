// Self-check for the SAN parsing in src/lib/sound.ts — which sound a move plays,
// and what the Voice pack says. Node 23.6+ strips the TS types itself:
//   node scripts/check-sound.mjs
import assert from 'node:assert/strict';
import { moveSoundFor, sanToWords, PACK_LIST, EVENTS } from '../src/lib/sound.ts';

const sound = {
  e4: 'move', Nf3: 'move', exd5: 'capture', Bxe5: 'capture', 'O-O': 'castle', 'O-O-O': 'castle',
  e8: 'move', 'e8=Q': 'promote', 'exd8=N': 'promote', 'Qh5+': 'check', 'Qxf7#': 'check',
  'O-O+': 'check', 'e8=Q+': 'check',
};
for (const [san, want] of Object.entries(sound)) assert.equal(moveSoundFor(san), want, san);

const words = {
  e4: 'e 4', Nf3: 'Knight f 3', exd5: 'e takes d 5', 'Bxe5+': 'Bishop takes e 5, check',
  'O-O': 'Castles short', 'O-O-O#': 'Castles long, checkmate', 'e8=Q': 'e 8, promotes to Queen',
  'Qxf7#': 'Queen takes f 7, checkmate', 'Nbd2': 'Knight b d 2', 'R1e2': 'Rook 1 e 2',
};
for (const [san, want] of Object.entries(words)) assert.equal(sanToWords(san), want, san);

// Soft is the fallback for every pack, so it must define every event.
const soft = Object.fromEntries(PACK_LIST)['soft'];
for (const [name] of EVENTS) assert.ok(soft.sounds[name]?.length, `soft is missing ${name}`);

console.log(`check-sound: ${Object.keys(sound).length + Object.keys(words).length + EVENTS.length} assertions passed`);
