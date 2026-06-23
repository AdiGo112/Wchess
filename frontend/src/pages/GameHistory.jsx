import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Scale } from "lucide-react";
import api from "../api";

export default function GameHistory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }

    api.get(`/games/history/${user.id}`)
      .then((res) => setGames(res.data.games || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user, navigate]);

  if (!user) return null;

  const getResultIcon = (game) => {
    const isWhite = game.whiteId === user.id;
    const result = game.result?.toLowerCase();
    if (result === "draw") return <Scale className="text-yellow-400 w-5 h-5" />;
    if ((result === "white" && isWhite) || (result === "black" && !isWhite))
      return <CheckCircle className="text-green-400 w-5 h-5" />;
    return <XCircle className="text-red-400 w-5 h-5" />;
  };

  const getRatingChange = (game) => {
    const isWhite = game.whiteId === user.id;
    return isWhite ? game.whiteRatingDiff : game.blackRatingDiff;
  };

  const getOpponent = (game) => {
    return game.whiteId === user.id ? game.blackUsername : game.whiteUsername;
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white px-4 py-10 flex flex-col items-center">
      <div className="w-full max-w-4xl bg-gray-800/80 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-700">
        <h1 className="text-2xl font-bold text-indigo-400 mb-6 text-center">♟️ Game History</h1>

        {loading ? (
          <p className="text-center text-gray-400">Loading...</p>
        ) : games.length === 0 ? (
          <p className="text-center text-gray-400">No games played yet. Start your first match!</p>
        ) : (
          <div className="flex flex-col gap-3">
            {games.map((game) => {
              const ratingChange = getRatingChange(game);
              return (
                <div key={game.id}
                  className="flex justify-between items-center bg-gray-700 hover:bg-gray-600 transition rounded-lg p-4 border border-gray-600">
                  <div>
                    <p className="font-semibold text-lg">{getOpponent(game)}</p>
                    <p className="text-sm text-gray-400">
                      {new Date(game.createdAt).toLocaleDateString()} · {game.moves?.length ?? 0} moves · {game.variant?.toLowerCase()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {getResultIcon(game)}
                    <p className={`text-sm font-bold ${ratingChange > 0 ? "text-green-400" : ratingChange < 0 ? "text-red-400" : "text-gray-400"}`}>
                      {ratingChange > 0 ? "+" : ""}{ratingChange ?? 0}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
