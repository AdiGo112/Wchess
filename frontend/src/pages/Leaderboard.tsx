import { useEffect, useState } from "react";
import api from "../api";
import { useAuth } from "../context/AuthContext";
import type { LeaderboardPeriod, LeaderboardRow, UserRankResponse } from "../types";

const VARIANTS = ["bullet", "blitz", "rapid", "classical"] as const;
type Variant = (typeof VARIANTS)[number];

const PERIODS: { key: LeaderboardPeriod; label: string }[] = [
  { key: "all", label: "All time" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

export default function Leaderboard() {
  const { user } = useAuth();
  const [players, setPlayers] = useState<LeaderboardRow[]>([]);
  const [variant, setVariant] = useState<Variant>("blitz");
  const [period, setPeriod] = useState<LeaderboardPeriod>("all");
  const [loading, setLoading] = useState(true);
  const [myRank, setMyRank] = useState<UserRankResponse | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get<LeaderboardRow[]>(`/leaderboard?variant=${variant}&period=${period}&limit=100`)
      .then((res) => setPlayers(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [variant, period]);

  useEffect(() => {
    if (!user) {
      setMyRank(null);
      return;
    }
    api
      .get<UserRankResponse>(`/leaderboard/rank/${user.id}?variant=${variant}&period=${period}`)
      .then((res) => setMyRank(res.data))
      .catch(() => setMyRank(null));
  }, [user, variant, period]);

  // Only surface the own-rank row when the player isn't already visible in the
  // list above — otherwise it's redundant.
  const inList = user && players.some((p) => p.userId === user.id);
  const showMyRank = !!user && !inList && !!myRank;

  return (
    <div className="max-w-2xl mx-auto py-4">
      <h1 className="heading-b text-5xl text-center mb-2">THE FOOD CHAIN</h1>
      <p className="text-center mb-8">
        <span className="tag-b">top 100. earn your spot.</span>
      </p>

      {/* Variant tabs — segmented, inverted active */}
      <div className="flex justify-center mb-4">
        <div className="inline-flex border-[3px] border-ink divide-x-[3px] divide-ink shadow-brutal">
          {VARIANTS.map((v) => (
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

      {/* Period tabs */}
      <div className="flex justify-center mb-10">
        <div className="inline-flex border-[3px] border-ink divide-x-[3px] divide-ink">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest transition-colors ${
                period === p.key ? "bg-ink text-white" : "bg-white hover:bg-neutral-200"
              }`}
            >
              {p.label}
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
            Nobody's rated in {variant} {period !== "all" && `(${period}) `}yet. Free real estate.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {players.map((p) => {
            const podium = p.rank <= 3;
            const isMe = user?.id === p.userId;
            return (
              <div
                key={p.userId}
                className={`flex items-center justify-between px-4 py-3 border-[3px] border-ink ${
                  podium
                    ? "bg-ink text-white shadow-brutal"
                    : isMe
                      ? "bg-white shadow-brutal ring-2 ring-ink ring-offset-2"
                      : "bg-white card-b-flat !p-0 !px-4 !py-3"
                }`}
              >
                <div className="flex items-center gap-4">
                  <span className="font-display text-xl w-10 text-center">
                    {p.rank === 1 ? "♛" : `#${p.rank}`}
                  </span>
                  <div>
                    <p className="font-bold uppercase tracking-wider">
                      {p.username}
                      {isMe && <span className="ml-2 text-[10px] tracking-widest">(you)</span>}
                    </p>
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

          {/* Own-rank row — shown only when you're outside the top 100 */}
          {showMyRank && (
            <div className="pt-3 border-t-[3px] border-dashed border-ink">
              <div className="flex items-center justify-between px-4 py-3 border-[3px] border-ink bg-white shadow-brutal">
                <div className="flex items-center gap-4">
                  <span className="font-display text-xl w-10 text-center">
                    {myRank!.rank != null ? `#${myRank!.rank}` : "—"}
                  </span>
                  <p className="font-bold uppercase tracking-wider">
                    {user!.username}
                    <span className="ml-2 text-[10px] tracking-widest">(you)</span>
                  </p>
                </div>
                <span className="font-mono font-bold text-xl">
                  {myRank!.rating ?? "Unrated"}
                </span>
              </div>
              {myRank!.rank == null && (
                <p className="text-center text-[11px] font-bold uppercase tracking-widest text-neutral-500 mt-2">
                  Play a rated {variant} game to hit the board
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
