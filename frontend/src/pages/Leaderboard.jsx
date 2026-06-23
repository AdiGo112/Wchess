import React, { useEffect, useState } from "react";
import api from "../api";
import PlayerCard from "../components/PlayerCard";

export default function Leaderboard() {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const res = await api.get("/players"); // make sure your backend route exists
        setPlayers(res.data);
      } catch (err) {
        console.error("Error fetching leaderboard:", err);
      }
    };
    fetchPlayers();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold text-center mb-6">🏆 Leaderboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {players.length > 0 ? (
          players.map((player, index) => (
            <PlayerCard key={player._id} player={player} rank={index + 1} />
          ))
        ) : (
          <p className="text-center text-gray-400">No players found.</p>
        )}
      </div>
    </div>
  );
}
