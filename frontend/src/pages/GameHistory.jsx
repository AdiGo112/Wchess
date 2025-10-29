import React, { useEffect, useState } from "react";
import api from "../api";

export default function GameHistory() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/games")
      .then(res => setGames(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="glow-card p-6 rounded">
      <h2 className="text-xl font-semibold mb-4">Game History</h2>
      {loading ? <div>Loading...</div> : (
        <div className="space-y-3">
          {games.length === 0 && <div>No games found.</div>}
          {games.map(g => (
            <div key={g._id} className="p-3 bg-panel/30 rounded flex justify-between items-center">
              <div>
                <div className="font-medium">{g.whitePlayer?.name || g.whitePlayer} vs {g.blackPlayer?.name || g.blackPlayer}</div>
                <div className="text-sm text-gray-400">{new Date(g.createdAt).toLocaleString()}</div>
              </div>
              <div className="text-sm">{g.result || "ongoing"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
