import React, { useEffect, useState } from "react";
import api from "../api";

export default function Leaderboard() {
  const [players, setPlayers] = useState([]);
  const [variant, setVariant] = useState("blitz");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/leaderboard?variant=${variant}&limit=100`)
      .then((res) => setPlayers(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [variant]);

  const variants = ["bullet", "blitz", "rapid", "classical"];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-3xl font-bold text-center mb-4">🏆 Leaderboard</h1>

      <div className="flex justify-center gap-2 mb-6">
        {variants.map((v) => (
          <button key={v} onClick={() => setVariant(v)}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${variant === v ? "bg-indigo-600" : "bg-gray-700 hover:bg-gray-600"}`}>
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-center text-gray-400">Loading...</p>
      ) : players.length === 0 ? (
        <p className="text-center text-gray-400">No players on the leaderboard yet.</p>
      ) : (
        <div className="max-w-2xl mx-auto space-y-2">
          {players.map((p) => (
            <div key={p.userId}
              className="flex items-center justify-between bg-gray-800 rounded-lg px-4 py-3 border border-gray-700">
              <div className="flex items-center gap-4">
                <span className={`font-bold text-lg w-8 text-center ${p.rank <= 3 ? "text-yellow-400" : "text-gray-400"}`}>
                  #{p.rank}
                </span>
                <div>
                  <p className="font-semibold">{p.username}</p>
                  {p.name && <p className="text-xs text-gray-400">{p.name}</p>}
                </div>
              </div>
              <span className="text-indigo-400 font-bold text-lg">{p.rating}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
