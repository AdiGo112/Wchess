import React, { useEffect, useState } from "react";
import api from "../api";

export default function PlayerList({ onSelect }) {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    api.get("/players").then(res => setPlayers(res.data)).catch(console.error);
  }, []);

  return (
    <div className="flex flex-col gap-2 bg-gray-800 p-4 rounded-lg shadow-lg">
      <h2 className="text-xl font-semibold mb-2">Select Player</h2>
      {players.map(p => (
        <button
          key={p._id}
          onClick={() => onSelect(p)}
          className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded"
        >
          {p.username} ({p.rating})
        </button>
      ))}
    </div>
  );
}
