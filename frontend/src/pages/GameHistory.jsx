import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Scale } from "lucide-react";

export default function GameHistory() {
  const { player } = useAuth();
  const navigate = useNavigate();
  const [games, setGames] = useState([]);

  useEffect(() => {
    if (!player) {
      navigate("/login");
      return;
    }

    // Replace with your backend API later (e.g., fetch(`/api/games?playerId=${player.id}`))
    const storedGames = JSON.parse(localStorage.getItem("games")) || [
      {
        id: 1,
        playerId: "123",
        opponent: "ShadowKnight",
        opponentAvatar: "https://api.dicebear.com/9.x/identicon/svg?seed=ShadowKnight",
        result: "win",
        ratingChange: +15,
        moves: 42,
        date: "2025-10-27T17:00:00Z",
      },
      {
        id: 2,
        playerId: "123",
        opponent: "DarkQueen",
        opponentAvatar: "https://api.dicebear.com/9.x/identicon/svg?seed=DarkQueen",
        result: "lose",
        ratingChange: -10,
        moves: 36,
        date: "2025-10-26T15:30:00Z",
      },
      {
        id: 3,
        playerId: "123",
        opponent: "KingSlayer",
        opponentAvatar: "https://api.dicebear.com/9.x/identicon/svg?seed=KingSlayer",
        result: "draw",
        ratingChange: 0,
        moves: 58,
        date: "2025-10-24T18:45:00Z",
      },
    ];
    setGames(storedGames.filter((g) => g.playerId === player.id));
  }, [player, navigate]);

  if (!player) return null;

  const getResultIcon = (result) => {
    switch (result) {
      case "win":
        return <CheckCircle className="text-green-400 w-5 h-5" />;
      case "lose":
        return <XCircle className="text-red-400 w-5 h-5" />;
      default:
        return <Scale className="text-yellow-400 w-5 h-5" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white px-4 py-10 flex flex-col items-center">
      <div className="w-full max-w-4xl bg-gray-800/80 backdrop-blur-sm rounded-xl p-6 shadow-lg border border-gray-700">
        <h1 className="text-2xl font-bold text-indigo-400 mb-6 text-center">
          ♟️ Game History
        </h1>

        {games.length === 0 ? (
          <p className="text-center text-gray-400">
            No games played yet. Start your first match!
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {games.map((game, index) => (
              <div
                key={index}
                className="flex justify-between items-center bg-gray-750 hover:bg-gray-700 transition rounded-lg p-4 border border-gray-700"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={game.opponentAvatar}
                    alt={game.opponent}
                    className="w-10 h-10 rounded-full border border-gray-600"
                  />
                  <div>
                    <p className="font-semibold text-lg">{game.opponent}</p>
                    <p className="text-sm text-gray-400">
                      {new Date(game.date).toLocaleDateString()} • {game.moves} moves
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getResultIcon(game.result)}
                  <p
                    className={`text-sm font-bold ${
                      game.ratingChange > 0
                        ? "text-green-400"
                        : game.ratingChange < 0
                        ? "text-red-400"
                        : "text-gray-400"
                    }`}
                  >
                    {game.ratingChange > 0 ? "+" : ""}
                    {game.ratingChange}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
