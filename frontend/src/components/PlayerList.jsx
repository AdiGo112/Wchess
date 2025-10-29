import React, { useEffect, useState } from "react";
import api from "../api";
import { Link } from "react-router-dom";

export default function PlayerList() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/players")
      .then(res => setPlayers(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="glow-card rounded-md p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Players</h2>
        <Link to="/players/new" className="text-sm px-3 py-1 bg-glowing text-black rounded">New Player</Link>
      </div>
      {loading ? <div>Loading...</div> : (
        <ul className="space-y-3">
          {players.length === 0 && <li>No players yet</li>}
          {players.map(p => (
            <li key={p._id} className="flex justify-between items-center p-3 bg-panel/30 rounded">
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-sm text-gray-400">@{p.username} • {p.rating}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
