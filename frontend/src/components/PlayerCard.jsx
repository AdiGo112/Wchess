import React from "react";

export default function PlayerCard({ player, rank }) {
  return (
    <div className="card-b-flat flex items-center justify-between hover:shadow-brutal transition-shadow">
      <div>
        <h2 className="font-bold uppercase tracking-wider">
          <span className="font-display mr-2">#{rank}</span>
          {player.username}
        </h2>
        <p className="text-xs font-mono text-neutral-500">
          Rating: {player.rating || "Unrated"} · Games: {player.gamesPlayed || 0}
        </p>
      </div>
    </div>
  );
}
