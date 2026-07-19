import { useCallback, useEffect, useRef } from "react";

// Difficulty 1-5 → UCI "Skill Level" (0-20) + thinking time. Both knobs matter:
// skill alone still finds strong moves given time, so weak levels also think less.
const LEVELS = {
  1: { skill: 0, movetime: 200 },
  2: { skill: 5, movetime: 400 },
  3: { skill: 10, movetime: 600 },
  4: { skill: 15, movetime: 900 },
  5: { skill: 20, movetime: 1500 },
};

/**
 * Stockfish WASM in a Web Worker (ADR-0009) — the engine runs on the player's
 * device, so computer games cost the server no CPU. The worker is only created
 * when `enabled`, which keeps the 7.3MB wasm off every other page.
 *
 * Returns getBestMove(fen) → Promise<{ from, to, promotion } | null>.
 */
export default function useStockfish(enabled, difficulty = 3) {
  const workerRef = useRef(null);
  const resolveRef = useRef(null);
  const level = LEVELS[difficulty] ?? LEVELS[3];

  useEffect(() => {
    if (!enabled) return undefined;

    const worker = new Worker("/engine/stockfish-18-lite-single.js");
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const line = typeof e.data === "string" ? e.data : e.data?.data;
      if (typeof line !== "string" || !line.startsWith("bestmove")) return;

      const resolve = resolveRef.current;
      resolveRef.current = null;
      if (!resolve) return;

      const uci = line.split(" ")[1];
      if (!uci || uci === "(none)") return resolve(null);
      resolve({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    };

    worker.postMessage("uci");
    worker.postMessage(`setoption name Skill Level value ${level.skill}`);
    worker.postMessage("isready");

    return () => {
      worker.terminate();
      workerRef.current = null;
      // A pending think is abandoned with the worker; unblock its caller.
      if (resolveRef.current) {
        resolveRef.current(null);
        resolveRef.current = null;
      }
    };
  }, [enabled, level.skill]);

  const getBestMove = useCallback(
    (fen) =>
      new Promise((resolve) => {
        const worker = workerRef.current;
        if (!worker) return resolve(null);
        resolveRef.current = resolve;
        worker.postMessage(`position fen ${fen}`);
        worker.postMessage(`go movetime ${level.movetime}`);
      }),
    [level.movetime],
  );

  return getBestMove;
}
