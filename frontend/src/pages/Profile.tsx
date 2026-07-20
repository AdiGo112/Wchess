import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  // Route is protected, but the type is User | null — guard once, use freely.
  if (!user) return null;

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
        <button onClick={handleLogout} className="btn-b btn-b-danger ml-auto">
          Log out
        </button>
      </div>

      {/* Stats — inverted middle tile for rhythm */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        {[
          { label: "Rating", value: user.rating || 0, inverse: false },
          { label: "Wins", value: user.wins || 0, inverse: true },
          { label: "Losses", value: user.losses || 0, inverse: false },
        ].map((s) => (
          <div key={s.label} className={s.inverse ? "card-b-inverse" : "card-b"}>
            <p className="font-display text-5xl">{s.value}</p>
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

      {/* Recent games */}
      <div className="card-b">
        <h2 className="heading-b text-xl mb-4 border-b-[3px] border-ink pb-3">
          Recent games
        </h2>
        <ul className="space-y-2">
          {(user.recentGames || []).map((g, i) => (
            <li key={i} className="card-b-flat flex justify-between items-center !py-2.5">
              <span className="font-bold uppercase tracking-wider text-sm">{g.opponent}</span>
              <span className="font-mono font-bold text-sm">
                {g.result === "Win" ? "▲ W" : g.result === "Loss" ? "▼ L" : "= D"}
              </span>
              <span className="text-neutral-500 font-mono text-xs">
                {new Date(g.date).toLocaleDateString()}
              </span>
            </li>
          ))}
          {(user.recentGames || []).length === 0 && (
            <p className="text-center text-xs font-bold uppercase tracking-widest text-neutral-400 py-4">
              No recent games. Embarrassing, honestly.
            </p>
          )}
        </ul>
      </div>

      <button onClick={() => navigate("/profile/edit")} className="btn-b mx-auto block">
        Edit profile
      </button>
    </div>
  );
}
