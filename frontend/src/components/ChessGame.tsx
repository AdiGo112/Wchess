import { useState, useEffect, useCallback, useMemo, useRef, CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import toast from "react-hot-toast";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";
import useStockfish from "../hooks/useStockfish";
import type {
  ClockSyncPayload,
  Color,
  GameOverPayload,
  GameStartPayload,
  GameStatePayload,
  MoveMadePayload,
  RoomPlayer,
  Timers,
} from "../types";

/* Strict-mono board (design system: no hue anywhere).
   Light squares warm-ish grey, dark squares near-ink. Highlights are done
   with inversion + inset rings, never color. */
const LIGHT_SQ = "#d6d6d6";
const DARK_SQ = "#3a3a3a";
const BOARD_STYLE: CSSProperties = { borderRadius: 0, boxShadow: "8px 8px 0 0 #0a0a0a" };

interface ChessGameProps {
  roomId: string;
  mode?: string;
  timeControl?: number;
}

const formatTime = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
};

/* Clock chip. Low time (<30s) inverts and blinks — motion, not color.
   Module scope, NOT nested in ChessGame: a component declared inside a render
   body gets a fresh identity every render, so the 1s clock tick was unmounting
   and remounting both player bars' DOM once per second. */
const Clock = ({ ms, urgent }: { ms: number; urgent: boolean }) => (
  <span
    className={`font-mono text-xl font-bold px-3 py-1 border-[3px] border-ink ${
      urgent ? "bg-ink text-white animate-blink" : "bg-white text-ink"
    }`}
  >
    {formatTime(ms)}
  </span>
);

const PlayerBar = ({
  player,
  ms,
  fallback,
  urgent,
}: {
  player: RoomPlayer | null;
  ms: number;
  fallback: string;
  urgent: boolean;
}) => (
  <div className="card-b-flat flex justify-between items-center min-w-[min(300px,100%)] !py-2.5">
    <span className="font-bold uppercase tracking-wider text-sm truncate">
      {player?.username ?? fallback}
      {player?.rating != null && (
        <span className="ml-2 text-neutral-500 font-mono text-xs">({player.rating})</span>
      )}
    </span>
    <Clock ms={ms} urgent={urgent} />
  </div>
);

export default function ChessGame({ roomId, timeControl }: ChessGameProps) {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user } = useAuth();

  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState("start");
  const [orientation, setOrientation] = useState<Color>("white");
  const [timers, setTimers] = useState<Timers>({ white: (timeControl || 300) * 1000, black: (timeControl || 300) * 1000 });
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [drawOfferedBy, setDrawOfferedBy] = useState<Color | null>(null);
  const [rematchOfferedBy, setRematchOfferedBy] = useState<string | null>(null);
  const [players, setPlayers] = useState<{ white: RoomPlayer | null; black: RoomPlayer | null }>({ white: null, black: null });
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [status, setStatus] = useState("Waiting for opponent...");
  const [difficulty, setDifficulty] = useState<number | null>(null); // non-null ⇒ vs-computer
  const [thinking, setThinking] = useState(false);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);

  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const turnRef = useRef<"w" | "b">("w");
  // Position before the last optimistically-applied move, so `invalid_move`
  // can roll the board back to the last server-agreed state.
  const preMoveFenRef = useRef<string | null>(null);

  const getBestMove = useStockfish(difficulty !== null, difficulty ?? 3);

  const stopClock = useCallback(() => {
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = null; }
  }, []);

  const startClock = useCallback(() => {
    stopClock();
    clockRef.current = setInterval(() => {
      setTimers((prev) => {
        const activeColor = turnRef.current === "w" ? "white" : "black";
        return { ...prev, [activeColor]: Math.max(0, prev[activeColor] - 1000) };
      });
    }, 1000);
  }, [stopClock]);

  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit("join_room", { roomId });

    // Socket.io reconnects transparently, but the server-side room membership
    // (client.join) is per-connection and is NOT restored — without this the
    // board stops receiving move_made/clock_sync/game_over and silently
    // freezes after any network blip. Same pattern as useMatchmakingSocket.
    const onReconnect = () => socket.emit("join_room", { roomId });
    socket.on("connect", onReconnect);

    socket.on("game_start", (data: GameStartPayload) => {
      const chess = new Chess(data.fen);
      turnRef.current = chess.turn();
      setGame(chess);
      setFen(data.fen || "start");
      setPlayers({ white: data.white, black: data.black });
      setTimers(data.timers || { white: (timeControl || 300) * 1000, black: (timeControl || 300) * 1000 });
      setStatus("Game in progress");
      setDifficulty(data.black?.id === "computer" ? (data.difficulty ?? 3) : null);
      if (user && data.black?.id === user.id) setOrientation("black");
      startClock();
    });

    socket.on("move_made", (data: MoveMadePayload) => {
      // Authoritative position confirmed — nothing left to roll back.
      preMoveFenRef.current = null;
      const chess = new Chess(data.fen);
      turnRef.current = chess.turn();
      setGame(chess);
      setFen(data.fen);
      setTimers(data.timers);
      setMoveHistory((prev) => [...prev, data.move.san]);
      setDrawOfferedBy(data.drawOfferedBy ?? null);
      setLastMove({ from: data.move.from, to: data.move.to });
    });

    socket.on("game_over", (data: GameOverPayload) => {
      stopClock();
      setGameOver(data);
      setStatus(`Game Over — ${data.result.toUpperCase()}`);
    });

    socket.on("draw_offered", (data: { byColor: Color }) => setDrawOfferedBy(data.byColor));
    socket.on("draw_declined", () => setDrawOfferedBy(null));

    socket.on("opponent_disconnected", (data: { grace: number }) => {
      setStatus(`Opponent disconnected — ${data.grace / 1000}s to auto-resign`);
    });

    socket.on("opponent_reconnected", () => setStatus("Game in progress"));

    socket.on("game_state", (data: GameStatePayload) => {
      const chess = new Chess(data.fen);
      turnRef.current = chess.turn();
      setGame(chess);
      setFen(data.fen);
      setTimers(data.timers);
      setMoveHistory(data.moves || []);
      setPlayers({ white: data.white, black: data.black });
      setDrawOfferedBy(data.drawOfferedBy ?? null);
      setStatus("Game in progress");
      setDifficulty(data.black?.id === "computer" ? (data.difficulty ?? 3) : null);
      startClock();
    });

    // Revert the optimistic move: the server rejected it.
    socket.on("invalid_move", (data: { reason: string }) => {
      const previous = preMoveFenRef.current;
      preMoveFenRef.current = null;
      if (previous) {
        const chess = new Chess(previous === "start" ? undefined : previous);
        turnRef.current = chess.turn();
        setGame(chess);
        setFen(previous);
        setLastMove(null);
      }
      toast.error(data.reason || "Illegal move");
    });

    // Server-authoritative clock correction every 1s (ADR-0004); the local
    // interval only interpolates between these.
    socket.on("clock_sync", (data: ClockSyncPayload) => setTimers(data.timers));

    socket.on("rematch_offered", (data: { byUserId: string }) => setRematchOfferedBy(data.byUserId));

    socket.on("rematch_ready", (data: { roomId: string }) => navigate(`/game/${data.roomId}`));

    return () => {
      [
        "game_start", "move_made", "game_over", "draw_offered", "draw_declined",
        "opponent_disconnected", "opponent_reconnected", "game_state", "invalid_move",
        "clock_sync", "rematch_offered", "rematch_ready",
      ].forEach((e) => socket.off(e));
      socket.off("connect", onReconnect);
      stopClock();
    };
  }, [socket, roomId, user, navigate, startClock, stopClock, timeControl]);

  // vs-computer: think locally on black's turn, then relay the engine's move.
  // The server re-validates it (see GameGateway.handleComputerMove).
  useEffect(() => {
    if (difficulty === null || !socket || !roomId || gameOver || fen === "start") return undefined;

    const chess = new Chess(fen);
    if (chess.turn() !== "b" || chess.isGameOver()) return undefined;

    let cancelled = false;
    setThinking(true);
    getBestMove(fen).then((move) => {
      if (cancelled) return;
      setThinking(false);
      if (move) socket.emit("computer_move", { roomId, ...move });
    });

    return () => { cancelled = true; };
  }, [fen, difficulty, socket, roomId, gameOver, getBestMove]);

  const isDraggablePiece = useCallback(
    ({ piece }: { piece: string }) => !gameOver && piece.startsWith(orientation === "white" ? "w" : "b"),
    [gameOver, orientation],
  );

  /* Optimistic move: apply locally first, then emit. The board is a controlled
     component (position={fen}), so without this the piece visibly snaps back
     and only lands once the server round trip completes. `move_made` overwrites
     fen wholesale with the authoritative position, so this self-reconciles; the
     server remains the only authority and `invalid_move` is the revert path. */
  const onDrop = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      if (!socket || !roomId || gameOver) return false;

      const chess = new Chess(fen === "start" ? undefined : fen);
      const isMyTurn =
        (chess.turn() === "w" && orientation === "white") ||
        (chess.turn() === "b" && orientation === "black");
      if (!isMyTurn) return false;

      // ponytail: auto-queen. A promotion picker is real UI work; every other
      // promotion is rare enough that queen is the right default. Until this
      // existed the client sent no `promotion` at all, so the server's chess.js
      // rejected every promoting move as illegal.
      const promotion = "q";

      let applied;
      try {
        applied = chess.move({ from: sourceSquare, to: targetSquare, promotion });
      } catch {
        return false; // chess.js throws on an illegal move
      }
      if (!applied) return false;

      preMoveFenRef.current = fen;
      turnRef.current = chess.turn();
      setGame(chess);
      setFen(chess.fen());
      setLastMove({ from: sourceSquare, to: targetSquare });

      socket.emit("move", { roomId, from: sourceSquare, to: targetSquare, promotion });
      return true;
    },
    [socket, roomId, gameOver, fen, orientation],
  );

  /* Strict-mono square highlights:
     - last move: inverted-feel overlay (light squares darken, via ink @ 18%)
     - check: pulsing inset ink ring on the checked king's square */
  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    if (lastMove) {
      styles[lastMove.from] = { boxShadow: "inset 0 0 0 4px #0a0a0a" };
      styles[lastMove.to] = { backgroundColor: "rgba(10,10,10,0.35)", boxShadow: "inset 0 0 0 4px #0a0a0a" };
    }
    if (fen !== "start") {
      const chess = new Chess(fen);
      if (chess.inCheck()) {
        const kingColor = chess.turn();
        for (const row of chess.board()) {
          for (const sq of row) {
            if (sq && sq.type === "k" && sq.color === kingColor) {
              styles[sq.square] = {
                animation: "ring-pulse 1s ease-in-out infinite",
                backgroundColor: "rgba(255,255,255,0.45)",
              };
            }
          }
        }
      }
    }
    return styles;
  }, [lastMove, fen]);

  const handleResign = () => {
    if (socket && roomId && !gameOver) socket.emit("resign", { roomId });
  };

  const handleOfferDraw = () => {
    if (socket && roomId && !gameOver && !drawOfferedBy) socket.emit("offer_draw", { roomId });
  };

  const handleCancelDraw = () => {
    if (socket && roomId) socket.emit("decline_draw", { roomId });
  };

  const handleAcceptDraw = () => {
    if (socket && roomId) socket.emit("accept_draw", { roomId });
  };

  const handleDeclineDraw = () => {
    if (socket && roomId) socket.emit("decline_draw", { roomId });
  };

  const handleRematch = () => {
    if (socket && roomId) socket.emit("rematch_request", { roomId });
  };

  const topPlayer = orientation === "white" ? players.black : players.white;
  const bottomPlayer = orientation === "white" ? players.white : players.black;
  const topTimer = orientation === "white" ? timers.black : timers.white;
  const bottomTimer = orientation === "white" ? timers.white : timers.black;

  const isOfferer = !!drawOfferedBy && drawOfferedBy === orientation;
  const isReceiver = !!drawOfferedBy && drawOfferedBy !== orientation;

  const getResultDisplay = () => {
    if (!gameOver) return null;
    if (gameOver.result === "draw") return { glyph: "½–½", headline: "DEAD EVEN" };
    const userWon = (gameOver.result === "white" && orientation === "white") ||
                    (gameOver.result === "black" && orientation === "black");
    if (userWon) return { glyph: "♛", headline: "EZ WIN" };
    if (user) return { glyph: "♟", headline: "GG GO NEXT" };
    return {
      glyph: gameOver.result === "white" ? "♔" : "♚",
      headline: gameOver.result === "white" ? "WHITE WINS" : "BLACK WINS",
    };
  };

  const resultDisplay = getResultDisplay();
  const canRematch = !!gameOver && !!players.black && players.black.id !== "computer";

  return (
    <div className="flex flex-wrap gap-8 items-start justify-center w-full">
      <div className="flex flex-col gap-4">
        <PlayerBar
          player={topPlayer}
          ms={topTimer}
          fallback="Waiting..."
          urgent={topTimer < 30000 && !gameOver}
        />

        {/* Board */}
        <div style={{ width: "clamp(280px, 90vmin, 500px)" }}>
          <Chessboard
            position={fen}
            onPieceDrop={onDrop}
            boardOrientation={orientation}
            isDraggablePiece={isDraggablePiece}
            customLightSquareStyle={{ backgroundColor: LIGHT_SQ }}
            customDarkSquareStyle={{ backgroundColor: DARK_SQ }}
            customBoardStyle={BOARD_STYLE}
            customSquareStyles={squareStyles}
            customDropSquareStyle={{ boxShadow: "inset 0 0 0 4px #ffffff" }}
          />
        </div>

        <PlayerBar
          player={bottomPlayer}
          ms={bottomTimer}
          fallback={user?.username ?? "You"}
          urgent={bottomTimer < 30000 && !gameOver}
        />

        {/* Game controls */}
        {!gameOver && (
          <div className="flex gap-3">
            <button onClick={handleResign} className="btn-b btn-b-danger btn-b-sm flex-1">
              Resign
            </button>
            {!drawOfferedBy && (
              <button onClick={handleOfferDraw} className="btn-b btn-b-sm flex-1">
                ½ Offer draw
              </button>
            )}
          </div>
        )}

        {/* Draw offer — offerer side */}
        {!gameOver && isOfferer && (
          <div className="card-b-flat text-center">
            <p className="text-xs font-bold uppercase tracking-widest mb-2">
              Draw offer pending<span className="animate-blink">_</span>
            </p>
            <button onClick={handleCancelDraw} className="btn-b btn-b-sm">
              Cancel
            </button>
          </div>
        )}

        {/* Draw offer — receiver side (inverted card = demands attention) */}
        {!gameOver && isReceiver && (
          <div className="card-b-inverse text-center !p-4">
            <p className="font-display uppercase mb-3">Draw offered</p>
            <div className="flex gap-3">
              <button
                onClick={handleAcceptDraw}
                className="flex-1 border-[3px] border-white bg-white text-ink py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-neutral-200"
              >
                Accept
              </button>
              <button
                onClick={handleDeclineDraw}
                className="flex-1 border-[3px] border-white bg-ink text-white py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-neutral-800"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {thinking && !gameOver && (
          <p className="text-center text-xs font-bold uppercase tracking-widest">
            ⚙ Stockfish is thinking<span className="animate-blink">_</span>
          </p>
        )}

        <p className="text-center text-xs font-bold uppercase tracking-widest text-neutral-500">
          {status}
        </p>
      </div>

      {/* Move history */}
      <div className="card-b w-52 max-h-[500px] overflow-y-auto !p-4">
        <h3 className="heading-b text-sm mb-3 border-b-[3px] border-ink pb-2">Moves</h3>
        {moveHistory.length === 0 ? (
          <p className="text-neutral-400 text-xs font-bold uppercase tracking-widest">
            Nothing yet
          </p>
        ) : (
          <div className="text-sm font-mono space-y-0.5">
            {Array.from({ length: Math.ceil(moveHistory.length / 2) }, (_, i) => (
              <div key={i} className={`flex gap-2 px-1 ${i % 2 === 1 ? "bg-neutral-100" : ""}`}>
                <span className="text-neutral-400 w-6">{i + 1}.</span>
                <span className="font-bold w-14">{moveHistory[i * 2]}</span>
                {moveHistory[i * 2 + 1] && <span>{moveHistory[i * 2 + 1]}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Game over modal */}
      {gameOver && resultDisplay && (
        <div className="fixed inset-0 bg-ink/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white border-[3px] border-ink shadow-brutal-lg p-8 text-center min-w-[320px]">
            <div className="text-6xl mb-2">{resultDisplay.glyph}</div>
            <h2 className="heading-b text-4xl mb-1">{resultDisplay.headline}</h2>
            <p className="tag-b mb-6">{gameOver.reason?.replace(/_/g, " ")}</p>

            {gameOver.ratingChange && (
              <div className="flex gap-4 justify-center mb-6">
                {(["white", "black"] as const).map((color) => {
                  const rc = gameOver.ratingChange![color];
                  const isYou = orientation === color;
                  const up = rc.change >= 0;
                  return (
                    <div key={color} className={`border-[3px] border-ink px-4 py-2 ${isYou ? "bg-ink text-white" : "bg-white"}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest mb-1">
                        {color} {isYou && "(you)"}
                      </p>
                      <p className="font-mono font-bold text-xl">
                        {up ? "▲" : "▼"} {up ? "+" : ""}{Math.round(rc.change)}
                      </p>
                      <p className={`font-mono text-xs ${isYou ? "text-neutral-300" : "text-neutral-500"}`}>
                        → {Math.round(rc.newRating)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3 justify-center flex-wrap">
              {canRematch && !rematchOfferedBy && (
                <button onClick={handleRematch} className="btn-b btn-b-primary">
                  Rematch
                </button>
              )}
              {canRematch && rematchOfferedBy === user?.id && (
                <button disabled className="btn-b">
                  Waiting<span className="animate-blink">_</span>
                </button>
              )}
              {canRematch && rematchOfferedBy && rematchOfferedBy !== user?.id && (
                <button onClick={handleRematch} className="btn-b btn-b-primary">
                  Accept rematch
                </button>
              )}
              <button onClick={() => navigate("/")} className="btn-b">
                Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
