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
    <div className="max-w-2xl mx-auto py-4">
      <h1 className="heading-b text-5xl text-center mb-2">THE FOOD CHAIN</h1>
      <p className="text-center mb-8">
        <span className="tag-b">top 100. earn your spot.</span>
      </p>

      {/* Variant tabs — segmented, inverted active */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex border-[3px] border-ink divide-x-[3px] divide-ink shadow-brutal">
          {variants.map((v) => (
            <button
              key={v}
              onClick={() => setVariant(v)}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                variant === v ? "bg-ink text-white" : "bg-white hover:bg-neutral-200"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16">
          <div className="loader-b mx-auto mb-4" />
          <p className="text-xs font-bold uppercase tracking-widest">
            Loading<span className="animate-blink">_</span>
          </p>
        </div>
      ) : players.length === 0 ? (
        <div className="card-b text-center py-12">
          <p className="font-display text-2xl mb-2">EMPTY THRONE</p>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Nobody's rated in {variant} yet. Free real estate.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {players.map((p) => {
            const podium = p.rank <= 3;
            return (
              <div
                key={p.userId}
                className={`flex items-center justify-between px-4 py-3 border-[3px] border-ink ${
                  podium ? "bg-ink text-white shadow-brutal" : "bg-white card-b-flat !p-0 !px-4 !py-3"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="font-display text-xl w-10 text-center">
                    {p.rank === 1 ? "♛" : `#${p.rank}`}
                  </span>
                  <div>
                    <p className="font-bold uppercase tracking-wider">{p.username}</p>
                    {p.name && (
                      <p className={`text-xs font-mono ${podium ? "text-neutral-300" : "text-neutral-500"}`}>
                        {p.name}
                      </p>
                    )}
                  </div>
                </div>
                <span className="font-mono font-bold text-xl">{p.rating}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
