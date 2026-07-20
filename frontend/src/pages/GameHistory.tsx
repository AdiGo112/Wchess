import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../api";
import type { GameRecord } from "../types";

export default function GameHistory() {
  const { user } = useAuth();
  const [games, setGames] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.get<{ games: GameRecord[] }>(`/games/history/${user.id}`)
      .then((res) => setGames(res.data.games || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  /* Strict mono: result reads through glyph + weight, not color.
     ▲ win (bold, inverted chip) / ▼ loss / = draw */
  const getResult = (game: GameRecord) => {
    const isWhite = game.whiteId === user?.id;
    const result = game.result?.toLowerCase();
    if (result === "draw") return { glyph: "=", label: "Draw", win: false };
    const won = (result === "white" && isWhite) || (result === "black" && !isWhite);
    return won ? { glyph: "▲", label: "Win", win: true } : { glyph: "▼", label: "Loss", win: false };
  };

  const getRatingChange = (game: GameRecord) => {
    const isWhite = game.whiteId === user?.id;
    return isWhite ? game.whiteRatingDiff : game.blackRatingDiff;
  };

  const getOpponent = (game: GameRecord) =>
    game.whiteId === user?.id ? game.blackUsername : game.whiteUsername;

  return (
    <div className="max-w-4xl mx-auto py-4">
      <h1 className="heading-b text-5xl text-center mb-2">THE RECEIPTS</h1>
      <p className="text-center mb-10">
        <span className="tag-b">every game. no takebacks.</span>
      </p>

      {loading ? (
        <div className="text-center py-16">
          <div className="loader-b mx-auto mb-4" />
          <p className="text-xs font-bold uppercase tracking-widest">
            Loading<span className="animate-blink">_</span>
          </p>
        </div>
      ) : games.length === 0 ? (
        <div className="card-b text-center py-12">
          <p className="font-display text-2xl mb-2">NOTHING HERE YET</p>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Play your first game and it goes on the record. Forever.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {games.map((game) => {
            const ratingChange = getRatingChange(game);
            const res = getResult(game);
            return (
              <div
                key={game.id}
                className="card-b-flat flex justify-between items-center gap-4 hover:shadow-brutal transition-shadow"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {/* Result chip — win inverts */}
                  <span
                    className={`w-10 h-10 shrink-0 flex items-center justify-center border-[3px] border-ink font-mono font-bold ${
                      res.win ? "bg-ink text-white" : "bg-white text-ink"
                    }`}
                    title={res.label}
                  >
                    {res.glyph}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold uppercase tracking-wider truncate">
                      vs {getOpponent(game)}
                    </p>
                    <p className="text-xs font-mono text-neutral-500">
                      {new Date(game.createdAt).toLocaleDateString()} ·{" "}
                      {game.moves?.length ?? 0} moves · {game.variant?.toLowerCase()}
                    </p>
                  </div>
                </div>
                <span className="font-mono font-bold whitespace-nowrap">
                  {ratingChange > 0 ? "+" : ""}
                  {ratingChange ?? 0}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
