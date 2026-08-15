import { useEffect, useState } from "react";
import api from "../api";
import PlayerCard from "./PlayerCard";
import type { PlayerListResponse, PlayerSummary } from "../types";

interface PlayerListProps {
  onSelect?: (player: PlayerSummary) => void;
}

export default function PlayerList({ onSelect }: PlayerListProps) {
  const [players, setPlayers] = useState<PlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<PlayerListResponse>("/users")
      .then((res) => {
        if (!cancelled) setPlayers(res.data.players ?? []);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-4">
      <h1 className="heading-b text-5xl text-center mb-2">THE ROSTER</h1>
      <p className="text-center mb-10">
        <span className="tag-b">everyone who showed up</span>
      </p>

      {loading ? (
        <div className="text-center py-16">
          <div className="loader-b mx-auto mb-4" />
          <p className="text-xs font-bold uppercase tracking-widest">
            Loading<span className="animate-blink">_</span>
          </p>
        </div>
      ) : error ? (
        <div className="card-b text-center py-12">
          <p className="font-display text-2xl mb-2">COULDN'T LOAD PLAYERS</p>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            The server didn't answer. Try again in a moment.
          </p>
        </div>
      ) : players.length === 0 ? (
        <div className="card-b text-center py-12">
          <p className="font-display text-2xl mb-2">NOBODY HOME</p>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Be the first to sign up.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {players.map((p, i) =>
            onSelect ? (
              <button key={p.id} onClick={() => onSelect(p)} className="text-left w-full">
                <PlayerCard player={p} rank={i + 1} />
              </button>
            ) : (
              <PlayerCard key={p.id} player={p} rank={i + 1} />
            ),
          )}
        </div>
      )}
    </div>
  );
}
