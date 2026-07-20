import { useEffect, useState } from "react";
import api from "../api";

interface PlayerRow {
  _id: string;
  username: string;
  rating: number;
}

interface PlayerListProps {
  onSelect?: (player: PlayerRow) => void;
}

export default function PlayerList({ onSelect }: PlayerListProps) {
  const [players, setPlayers] = useState<PlayerRow[]>([]);

  useEffect(() => {
    api.get<PlayerRow[]>("/players").then((res) => setPlayers(res.data)).catch(console.error);
  }, []);

  return (
    <div className="card-b max-w-md mx-auto">
      <h2 className="heading-b text-xl mb-4 border-b-[3px] border-ink pb-3">
        Select player
      </h2>
      <div className="flex flex-col gap-2">
        {players.map((p) => (
          <button
            key={p._id}
            onClick={() => onSelect?.(p)}
            className="btn-b btn-b-sm justify-between"
          >
            <span>{p.username}</span>
            <span className="font-mono">({p.rating})</span>
          </button>
        ))}
        {players.length === 0 && (
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 text-center py-4">
            Nobody home
          </p>
        )}
      </div>
    </div>
  );
}
