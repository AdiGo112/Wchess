import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useSocket } from "../context/SocketContext";
import { useAuth } from "../context/AuthContext";

export default function ChessGame({ roomId, mode, timeControl }) {
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user } = useAuth();

  const [game, setGame] = useState(new Chess());
  const [fen, setFen] = useState("start");
  const [orientation, setOrientation] = useState("white");
  const [timers, setTimers] = useState({ white: (timeControl || 300) * 1000, black: (timeControl || 300) * 1000 });
  const [gameOver, setGameOver] = useState(null);
  const [drawOfferedBy, setDrawOfferedBy] = useState(null); // 'white' | 'black' | null
  const [rematchOfferedBy, setRematchOfferedBy] = useState(null); // userId | null
  const [players, setPlayers] = useState({ white: null, black: null });
  const [moveHistory, setMoveHistory] = useState([]);
  const [status, setStatus] = useState("Waiting for opponent...");

  const clockRef = useRef(null);
  const turnRef = useRef("w");

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

    socket.on("game_start", (data) => {
      const chess = new Chess(data.fen);
      turnRef.current = chess.turn();
      setGame(chess);
      setFen(data.fen || "start");
      setPlayers({ white: data.white, black: data.black });
      setTimers(data.timers || { white: (timeControl || 300) * 1000, black: (timeControl || 300) * 1000 });
      setStatus("Game in progress");
      if (user && data.black?.id === user.id) setOrientation("black");
      startClock();
    });

    socket.on("move_made", (data) => {
      const chess = new Chess(data.fen);
      turnRef.current = chess.turn();
      setGame(chess);
      setFen(data.fen);
      setTimers(data.timers);
      setMoveHistory((prev) => [...prev, data.move.san]);
      setDrawOfferedBy(data.drawOfferedBy ?? null);
    });

    socket.on("game_over", (data) => {
      stopClock();
      setGameOver(data);
      setStatus(`Game Over — ${data.result.toUpperCase()}`);
    });

    socket.on("draw_offered", (data) => setDrawOfferedBy(data.byColor));
    socket.on("draw_declined", () => setDrawOfferedBy(null));

    socket.on("opponent_disconnected", (data) => {
      setStatus(`Opponent disconnected — ${data.grace / 1000}s to auto-resign`);
    });

    socket.on("opponent_reconnected", () => setStatus("Game in progress"));

    socket.on("game_state", (data) => {
      const chess = new Chess(data.fen);
      turnRef.current = chess.turn();
      setGame(chess);
      setFen(data.fen);
      setTimers(data.timers);
      setMoveHistory(data.moves || []);
      setPlayers({ white: data.white, black: data.black });
      setDrawOfferedBy(data.drawOfferedBy ?? null);
      setStatus("Game in progress");
      startClock();
    });

    socket.on("invalid_move", (data) => console.warn("Invalid move:", data.reason));

    socket.on("rematch_offered", (data) => setRematchOfferedBy(data.byUserId));

    socket.on("rematch_ready", (data) => navigate(`/game/${data.roomId}`));

    return () => {
      [
        "game_start", "move_made", "game_over", "draw_offered", "draw_declined",
        "opponent_disconnected", "opponent_reconnected", "game_state", "invalid_move",
        "rematch_offered", "rematch_ready",
      ].forEach((e) => socket.off(e));
      stopClock();
    };
  }, [socket, roomId, user, navigate, startClock, stopClock, timeControl]);

  const isDraggablePiece = useCallback(
    ({ piece }) => !gameOver && piece.startsWith(orientation === "white" ? "w" : "b"),
    [gameOver, orientation],
  );

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

  const formatTime = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  };

  const topPlayer = orientation === "white" ? players.black : players.white;
  const bottomPlayer = orientation === "white" ? players.white : players.black;
  const topTimer = orientation === "white" ? timers.black : timers.white;
  const bottomTimer = orientation === "white" ? timers.white : timers.black;

  const isOfferer = !!drawOfferedBy && drawOfferedBy === orientation;
  const isReceiver = !!drawOfferedBy && drawOfferedBy !== orientation;

  const getResultDisplay = () => {
    if (!gameOver) return null;
    if (gameOver.result === "draw") return { emoji: "½", headline: "Draw" };
    const userWon = (gameOver.result === "white" && orientation === "white") ||
                    (gameOver.result === "black" && orientation === "black");
    if (userWon) return { emoji: "🏆", headline: "You won!" };
    if (user) return { emoji: "💀", headline: "You lost" };
    return {
      emoji: gameOver.result === "white" ? "♔" : "♚",
      headline: gameOver.result === "white" ? "White wins!" : "Black wins!",
    };
  };

  const resultDisplay = getResultDisplay();
  const canRematch = !!gameOver && !!players.black && players.black.id !== "computer";

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
            isDraggablePiece={isDraggablePiece}
          />
        </div>

        {/* Bottom player */}
        <div className="bg-gray-800 rounded-lg p-3 flex justify-between items-center">
          <span className="font-semibold">{bottomPlayer?.username ?? user?.username ?? "You"}</span>
          <span className={`font-mono text-lg font-bold ${bottomTimer < 30000 ? "text-red-400" : "text-white"}`}>
            {formatTime(bottomTimer)}
          </span>
        </div>

        {/* Game controls */}
        {!gameOver && (
          <div className="flex gap-2">
            <button onClick={handleResign}
              className="flex-1 bg-red-700 hover:bg-red-600 py-2 rounded font-semibold text-sm">
              Resign
            </button>
            {!drawOfferedBy && (
              <button onClick={handleOfferDraw}
                className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded font-semibold text-sm">
                ½ Draw
              </button>
            )}
          </div>
        )}

        {/* Draw offer — offerer side */}
        {!gameOver && isOfferer && (
          <div className="bg-gray-700 rounded-lg p-3 text-center">
            <p className="text-gray-300 text-sm mb-2">Draw offer pending...</p>
            <button onClick={handleCancelDraw}
              className="bg-gray-600 hover:bg-gray-500 px-4 py-1 rounded text-sm">
              Cancel
            </button>
          </div>
        )}

        {/* Draw offer — receiver side */}
        {!gameOver && isReceiver && (
          <div className="bg-yellow-800 rounded-lg p-3 text-center">
            <p className="mb-2 font-semibold">Draw offered</p>
            <div className="flex gap-2">
              <button onClick={handleAcceptDraw} className="flex-1 bg-green-600 hover:bg-green-500 py-1 rounded">Accept</button>
              <button onClick={handleDeclineDraw} className="flex-1 bg-red-600 hover:bg-red-500 py-1 rounded">Decline</button>
            </div>
          </div>
        )}

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
      {gameOver && resultDisplay && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-2xl p-8 text-center shadow-2xl border border-gray-600 min-w-[300px]">
            <div className="text-5xl mb-2">{resultDisplay.emoji}</div>
            <h2 className="text-3xl font-bold mb-1">{resultDisplay.headline}</h2>
            <p className="text-gray-400 mb-5 capitalize">{gameOver.reason?.replace(/_/g, " ")}</p>

            {gameOver.ratingChange && (
              <div className="flex gap-10 justify-center text-sm mb-6">
                <div>
                  <p className="text-gray-400 mb-1">
                    White{orientation === "white" && <span className="text-indigo-400 ml-1">(You)</span>}
                  </p>
                  <p className={`font-bold text-lg ${gameOver.ratingChange.white.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {gameOver.ratingChange.white.change >= 0 ? "+" : ""}{Math.round(gameOver.ratingChange.white.change)}
                  </p>
                  <p className="text-gray-500 text-xs">{Math.round(gameOver.ratingChange.white.newRating)}</p>
                </div>
                <div>
                  <p className="text-gray-400 mb-1">
                    Black{orientation === "black" && <span className="text-indigo-400 ml-1">(You)</span>}
                  </p>
                  <p className={`font-bold text-lg ${gameOver.ratingChange.black.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {gameOver.ratingChange.black.change >= 0 ? "+" : ""}{Math.round(gameOver.ratingChange.black.change)}
                  </p>
                  <p className="text-gray-500 text-xs">{Math.round(gameOver.ratingChange.black.newRating)}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center flex-wrap">
              {canRematch && !rematchOfferedBy && (
                <button onClick={handleRematch}
                  className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-lg font-semibold">
                  Rematch
                </button>
              )}
              {canRematch && rematchOfferedBy === user?.id && (
                <button disabled
                  className="bg-gray-600 px-6 py-2 rounded-lg font-semibold text-gray-400 cursor-not-allowed">
                  Waiting...
                </button>
              )}
              {canRematch && rematchOfferedBy && rematchOfferedBy !== user?.id && (
                <button onClick={handleRematch}
                  className="bg-green-600 hover:bg-green-500 px-6 py-2 rounded-lg font-semibold">
                  Accept Rematch
                </button>
              )}
              <button onClick={() => navigate("/")}
                className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg font-semibold">
                Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
