import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../api";
import { describeResult } from "../utils/gameResult";
import type { GameRecord, UserStatsResponse } from "../types";

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<UserStatsResponse | null>(null);
  const [recent, setRecent] = useState<GameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // /auth/me carries identity only — ratings, W/L and games live behind their
  // own endpoints. Fetch both in parallel rather than waterfalling.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    Promise.all([
      api.get<UserStatsResponse>(`/users/${user.username}/stats`),
      api.get<{ games: GameRecord[] }>(`/games/history/${user.id}?limit=5`),
    ])
      .then(([statsRes, historyRes]) => {
        if (cancelled) return;
        setStats(statsRes.data);
        setRecent(historyRes.data.games ?? []);
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
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Route is protected, but the type is User | null — guard once, use freely.
  if (!user) return null;

  const ratings = stats?.ratings ?? [];
  const wins = ratings.reduce((n, r) => n + r.wins, 0);
  const losses = ratings.reduce((n, r) => n + r.losses, 0);
  const draws = ratings.reduce((n, r) => n + r.draws, 0);
  const bestRating = ratings.length ? Math.max(...ratings.map((r) => r.rating)) : null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      {/* Profile header */}
      <div className="card-b flex flex-wrap items-center gap-6">
        <div className="w-20 h-20 bg-ink text-white flex items-center justify-center font-display text-4xl border-[3px] border-ink shadow-brutal-sm">
          {user.name?.[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="heading-b text-3xl">{user.name}</h1>
          <p className="font-mono text-sm text-neutral-600">@{user.username}</p>
          <p className="tag-b mt-2">
            joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
          </p>
        </div>
        <div className="ml-auto flex gap-3">
          <button onClick={() => navigate("/profile/edit")} className="btn-b">
            Edit profile
          </button>
          <button onClick={handleLogout} className="btn-b btn-b-danger">
            Log out
          </button>
        </div>
      </div>

      {error && (
        <div className="card-b text-center py-8">
          <p className="font-display text-2xl mb-2">STATS UNAVAILABLE</p>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Couldn't reach the server. Your account is fine.
          </p>
        </div>
      )}

      {/* Stats — inverted middle tile for rhythm */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        {[
          { label: "Best rating", value: bestRating ?? "—", inverse: false },
          { label: "Wins", value: wins, inverse: true },
          { label: "Losses", value: losses, inverse: false },
          { label: "Draws", value: draws, inverse: false },
        ].map((s) => (
          <div key={s.label} className={s.inverse ? "card-b-inverse" : "card-b"}>
            <p className="font-display text-4xl">
              {loading ? <span className="animate-blink">_</span> : s.value}
            </p>
            <p
              className={`text-xs font-bold uppercase tracking-widest mt-2 ${
                s.inverse ? "text-neutral-300" : "text-neutral-500"
              }`}
            >
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Per-variant ratings */}
      {ratings.length > 0 && (
        <div className="card-b">
          <h2 className="heading-b text-xl mb-4 border-b-[3px] border-ink pb-3">
            Ratings by variant
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {ratings.map((r) => (
              <div key={r.variant} className="card-b-flat text-center !py-3">
                <p className="font-mono font-bold text-2xl">{r.rating}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mt-1">
                  {r.variant.toLowerCase()}
                  {r.provisional && " ?"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent games */}
      <div className="card-b">
        <h2 className="heading-b text-xl mb-4 border-b-[3px] border-ink pb-3">
          Recent games
        </h2>
        {loading ? (
          <p className="text-center text-xs font-bold uppercase tracking-widest text-neutral-400 py-4">
            Loading<span className="animate-blink">_</span>
          </p>
        ) : recent.length === 0 ? (
          <p className="text-center text-xs font-bold uppercase tracking-widest text-neutral-400 py-4">
            No recent games. Embarrassing, honestly.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((g) => {
              const res = describeResult(g, user.id);
              const opponent =
                g.whiteId === user.id ? g.blackUsername : g.whiteUsername;
              return (
                <li
                  key={g.id}
                  className="card-b-flat flex justify-between items-center gap-3 !py-2.5"
                >
                  <span className="font-bold uppercase tracking-wider text-sm truncate">
                    vs {opponent}
                  </span>
                  <span className="font-mono font-bold text-sm whitespace-nowrap">
                    {res.glyph} {res.label}
                  </span>
                  <span className="text-neutral-500 font-mono text-xs whitespace-nowrap">
                    {new Date(g.createdAt).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
