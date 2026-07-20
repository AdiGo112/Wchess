import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import ChessGame from "../components/ChessGame";

interface GameLocationState {
  roomId?: string;
  mode?: string;
  timeControl?: number;
}

export default function Game() {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomId: routeRoomId } = useParams<{ roomId: string }>();

  const state = (location.state || {}) as GameLocationState;
  const [roomId] = useState(routeRoomId || state.roomId);
  const { mode, timeControl } = state;

  // Matchmaking now lives in the Lobby; the game page only renders a known room.
  useEffect(() => {
    if (!roomId) navigate("/lobby", { replace: true });
  }, [roomId, navigate]);

  return (
    <div className="-mx-4 -my-8 min-h-screen flex flex-col">
      {/* Game header strip */}
      <div className="w-full flex justify-between items-center px-6 py-3 bg-ink text-white border-b-[3px] border-ink">
        <h2 className="font-display text-lg tracking-tight">WCHESS</h2>
        <div className="flex gap-3 items-center">
          {mode && <span className="tag-b border-white text-white">{mode}</span>}
          {timeControl && (
            <span className="tag-b border-white text-white font-mono normal-case">
              {timeControl}s
            </span>
          )}
          <button
            onClick={() => navigate("/")}
            className="border-[3px] border-white bg-ink text-white px-4 py-1.5 text-xs font-bold uppercase tracking-wider hover:bg-white hover:text-ink transition-colors"
          >
            ✕ Exit
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 bg-paper">
        {roomId ? (
          <ChessGame roomId={roomId} mode={mode} timeControl={timeControl} />
        ) : (
          <div className="text-center">
            <div className="loader-b mx-auto mb-4" />
            <p className="text-xs font-bold uppercase tracking-widest">
              Waiting for an opponent<span className="animate-blink">_</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
