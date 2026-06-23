import React from "react";

export default function PlayerCard({ player, rank }) {
  return (
    <div className="bg-gray-800 rounded-2xl p-4 shadow-md flex items-center justify-between hover:bg-gray-700 transition">
      <div>
        <h2 className="text-xl font-semibold">
          #{rank} {player.username}
        </h2>
        <p className="text-gray-400">Rating: {player.rating || "Unrated"}</p>
        <p className="text-gray-400">Games: {player.gamesPlayed || 0}</p>
      </div>
    </div>
  );
}
