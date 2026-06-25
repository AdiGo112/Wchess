import React, { useState, useEffect, useCallback, useRef } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";

export default function ChessGame({ roomId, mode, timeControl }) {
  const { socket } = useSocket();
  const { user } = useAuth();
  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState("start");
  const [orientation, setOrientation] = useState("white");
  const [timers, setTimers] = useState({ white: (timeControl || 300) * 1000, black: (timeControl || 300) * 1000 });
  const [gameOver, setGameOver] = useState(null);
  const [drawOffered, setDrawOffered] = useState(false);
  const [players, setPlayers] = useState({ white: null, black: null });
  const [moveHistory, setMoveHistory] = useState([]);
  const [status, setStatus] = useState("Waiting for opponent...");
  const clockRef = useRef(null);
  const lastMoveAtRef = useRef(Date.now());

  useEffect(() => {
    if (!socket || !roomId) return;

    socket.emit("join_room", { roomId });

    socket.on("game_start", (data) => {
      setPlayers({ white: data.white, black: data.black });
      setFen(data.fen || "start");
      setTimers(data.timers || timers);
      setStatus("Game in progress");

      if (user && data.black?.id === user.id) setOrientation("black");
      lastMoveAtRef.current = Date.now();
      startClock();
    });

    socket.on("move_made", (data) => {
      const chess = new Chess(data.fen);
      setGame(chess);
      setFen(data.fen);
      setTimers(data.timers);
      setMoveHistory((prev) => [...prev, data.move.san]);
      lastMoveAtRef.current = Date.now();
    });

    socket.on("game_over", (data) => {
      stopClock();
      setGameOver(data);
      setStatus(`Game Over — ${data.result.toUpperCase()}`);
    });

    socket.on("draw_offered", () => setDrawOffered(true));
    socket.on("draw_declined", () => setDrawOffered(false));

    socket.on("opponent_disconnected", (data) => {
      setStatus(`Opponent disconnected. ${data.grace / 1000}s to auto-resign.`);
    });

    socket.on("opponent_reconnected", () => {
      setStatus("Game in progress");
    });

    socket.on("game_state", (data) => {
      const chess = new Chess(data.fen);
      setGame(chess);
      setFen(data.fen);
      setTimers(data.timers);
      setMoveHistory(data.moves || []);
      setPlayers({ white: data.white, black: data.black });
      if (data.drawOfferedBy) setDrawOffered(true);
      setStatus("Game in progress");
      startClock();
    });

    socket.on("invalid_move", (data) => {
      console.warn("Invalid move:", data.reason);
    });

    return () => {
      ["game_start", "move_made", "game_over", "draw_offered", "draw_declined",
       "opponent_disconnected", "opponent_reconnected", "game_state", "invalid_move"].forEach((e) => socket.off(e));
      stopClock();
    };
  }, [socket, roomId, user]);

  const startClock = useCallback(() => {
    if (clockRef.current) clearInterval(clockRef.current);
    clockRef.current = setInterval(() => {
      setTimers((prev) => {
        const chess = game;
        const activeColor = chess.turn() === "w" ? "white" : "black";
        const elapsed = Date.now() - lastMoveAtRef.current;
        return {
          ...prev,
          [activeColor]: Math.max(0, prev[activeColor] - 1000),
        };
      });
    }, 1000);
  }, [game]);

  const stopClock = () => {
    if (clockRef.current) { clearInterval(clockRef.current); clockRef.current = null; }
  };

  const onDrop = (sourceSquare, targetSquare) => {
    if (!socket || !roomId || gameOver) return false;

    const chess = new Chess(fen === "start" ? undefined : fen);
    const isMyTurn = (chess.turn() === "w" && orientation === "white") ||
                     (chess.turn() === "b" && orientation === "black");
    if (!isMyTurn) return false;

    socket.emit("move", { roomId, from: sourceSquare, to: targetSquare });
    return true;
  };

  const handleResign = () => {
    if (socket && roomId && !gameOver) socket.emit("resign", { roomId });
  };

  const handleOfferDraw = () => {
    if (socket && roomId && !gameOver) socket.emit("offer_draw", { roomId });
  };

  const handleAcceptDraw = () => {
    if (socket && roomId) { socket.emit("accept_draw", { roomId }); setDrawOffered(false); }
  };

  const handleDeclineDraw = () => {
    if (socket && roomId) { socket.emit("decline_draw", { roomId }); setDrawOffered(false); }
  };

  const formatTime = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const topPlayer = orientation === "white" ? players.black : players.white;
  const bottomPlayer = orientation === "white" ? players.white : players.black;
  const topTimer = orientation === "white" ? timers.black : timers.white;
  const bottomTimer = orientation === "white" ? timers.white : timers.black;

  return (
    <div className="flex gap-6 items-start justify-center w-full">
      <div className="flex flex-col gap-3">
        {/* Top player */}
        <div className="bg-gray-800 rounded-lg p-3 flex justify-between items-center min-w-[300px]">
          <span className="font-semibold">{topPlayer?.username ?? "Waiting..."}</span>
          <span className={`font-mono text-lg font-bold ${topTimer < 30000 ? "text-red-400" : "text-white"}`}>
            {formatTime(topTimer)}
          </span>
        </div>

        {/* Board */}
        <div style={{ width: "clamp(280px, 90vmin, 500px)" }}>
          <Chessboard
            position={fen}
            onPieceDrop={onDrop}
            boardOrientation={orientation}
            arePiecesDraggable={!gameOver}
          />
        </div>

        {/* Bottom player */}
        <div className="bg-gray-800 rounded-lg p-3 flex justify-between items-center">
          <span className="font-semibold">{bottomPlayer?.username ?? user?.username ?? "You"}</span>
          <span className={`font-mono text-lg font-bold ${bottomTimer < 30000 ? "text-red-400" : "text-white"}`}>
            {formatTime(bottomTimer)}
          </span>
        </div>

        {/* Controls */}
        {!gameOver && (
          <div className="flex gap-2">
            <button onClick={handleResign}
              className="flex-1 bg-red-700 hover:bg-red-600 py-2 rounded font-semibold text-sm">
              Resign
            </button>
            <button onClick={handleOfferDraw}
              className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded font-semibold text-sm">
              ½ Draw
            </button>
          </div>
        )}

        {/* Draw offer */}
        {drawOffered && !gameOver && (
          <div className="bg-yellow-800 rounded-lg p-3 text-center">
            <p className="mb-2 font-semibold">Draw offered</p>
            <div className="flex gap-2">
              <button onClick={handleAcceptDraw} className="flex-1 bg-green-600 hover:bg-green-500 py-1 rounded">Accept</button>
              <button onClick={handleDeclineDraw} className="flex-1 bg-red-600 hover:bg-red-500 py-1 rounded">Decline</button>
            </div>
          </div>
        )}

        {/* Status */}
        <p className="text-center text-gray-400 text-sm">{status}</p>
      </div>

      {/* Move history */}
      <div className="bg-gray-800 rounded-lg p-4 w-48 max-h-[500px] overflow-y-auto">
        <h3 className="font-semibold mb-2 text-gray-300">Moves</h3>
        {moveHistory.length === 0 ? (
          <p className="text-gray-500 text-sm">No moves yet</p>
        ) : (
          <div className="text-sm space-y-1">
            {Array.from({ length: Math.ceil(moveHistory.length / 2) }, (_, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-500 w-5">{i + 1}.</span>
                <span className="text-white">{moveHistory[i * 2]}</span>
                {moveHistory[i * 2 + 1] && <span className="text-gray-300">{moveHistory[i * 2 + 1]}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Game over modal */}
      {gameOver && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center shadow-2xl border border-gray-600">
            <h2 className="text-3xl font-bold mb-2">
              {gameOver.result === "draw" ? "½ Draw" : gameOver.result === "white" ? "White wins!" : "Black wins!"}
            </h2>
            <p className="text-gray-400 mb-4">{gameOver.reason?.replace(/_/g, " ")}</p>
            {gameOver.ratingChange && (
              <div className="flex gap-8 justify-center text-sm mb-4">
                <div>
                  <p className="text-gray-400">White</p>
                  <p className={`font-bold ${gameOver.ratingChange.white.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {gameOver.ratingChange.white.change >= 0 ? "+" : ""}{gameOver.ratingChange.white.change}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Black</p>
                  <p className={`font-bold ${gameOver.ratingChange.black.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {gameOver.ratingChange.black.change >= 0 ? "+" : ""}{gameOver.ratingChange.black.change}
                  </p>
                </div>
              </div>
            )}
            <button onClick={() => window.location.href = "/"} className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-lg font-semibold">
              Back to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
