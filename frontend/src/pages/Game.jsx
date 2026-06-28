import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ChessGame from "../components/ChessGame";

export default function Game() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomId: routeRoomId } = useParams();

  const [roomId] = useState(routeRoomId || location.state?.roomId);
  const { mode, timeControl } = location.state || {};

  // Matchmaking now lives in the Lobby; the game page only renders a known room.
  useEffect(() => {
    if (!roomId) navigate("/lobby", { replace: true });
  }, [roomId, navigate]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="w-full flex justify-between items-center px-6 py-3 bg-gray-800 shadow-md">
        <h2 className="text-xl font-bold">ChessWeb</h2>
        <div className="flex gap-4 items-center">
          {mode && <span className="text-gray-300 capitalize">Mode: {mode}</span>}
          {timeControl && <span className="text-gray-300">Time: {timeControl}s</span>}
          {!roomId && <span className="text-yellow-400 animate-pulse">Finding opponent...</span>}
          <button onClick={() => navigate("/")} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm">
            Exit
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        {roomId ? (
          <ChessGame roomId={roomId} mode={mode} timeControl={timeControl} />
        ) : (
          <div className="text-center">
            <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">Waiting for an opponent...</p>
          </div>
        )}
      </div>
    </div>
  );
}
