// Copies the Stockfish WASM engine into public/ so Vite serves it as a plain
// Worker script. The lite-single build is deliberate: the threaded builds need
// SharedArrayBuffer, which would force COOP/COEP cross-origin-isolation headers
// on the whole app, and the full net is a 113MB .wasm. This one is 7.3MB.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'node_modules/stockfish/bin');
const to = resolve(root, 'public/engine');

mkdirSync(to, { recursive: true });
for (const file of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']) {
  const src = resolve(from, file);
  if (!existsSync(src)) {
    console.error(`[copy-engine] missing ${src} — run "npm install"`);
    process.exit(1);
  }
  copyFileSync(src, resolve(to, file));
}
console.log('[copy-engine] Stockfish WASM ready in public/engine');
