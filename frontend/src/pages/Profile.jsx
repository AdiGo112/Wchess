import React from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

export default function Profile() {
  const { player, logout } = useAuth();
  const navigate = useNavigate();

  if (!player) {
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white py-10 px-4">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Profile Header */}
        <div className="bg-gray-800 p-6 rounded-2xl flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-indigo-500 flex items-center justify-center text-3xl font-bold">
            {player.name?.[0].toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-indigo-400">{player.name}</h1>
            <p className="text-gray-400">@{player.username}</p>
            <p className="text-gray-500 text-sm">Joined {new Date(player.createdAt).toLocaleDateString()}</p>
          </div>
          <button
            onClick={logout}
            className="ml-auto bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-semibold"
          >
            Logout
          </button>
        </div>

        {/* Stats Section */}
        <div className="bg-gray-800 p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-4xl font-bold">{player.rating || 0}</p>
            <p className="text-gray-400">Rating</p>
          </div>
          <div>
            <p className="text-4xl font-bold">{player.wins || 0}</p>
            <p className="text-gray-400">Wins</p>
          </div>
          <div>
            <p className="text-4xl font-bold">{player.losses || 0}</p>
            <p className="text-gray-400">Losses</p>
          </div>
        </div>

        {/* Recent Games */}
        <div className="bg-gray-800 p-6 rounded-2xl">
          <h2 className="text-xl font-semibold text-indigo-400 mb-4">Recent Games</h2>
          <ul className="space-y-2">
            { (player.recentGames || []).map((g, i) => (
              <li key={i} className="flex justify-between bg-gray-700 p-3 rounded-lg">
                <span>{g.opponent}</span>
                <span className={`${g.result === 'Win' ? 'text-green-400' : g.result === 'Loss' ? 'text-red-400' : 'text-yellow-400'}`}>{g.result}</span>
                <span className="text-gray-500 text-sm">{new Date(g.date).toLocaleDateString()}</span>
              </li>
            )) }
            { (player.recentGames || []).length === 0 && <p className="text-gray-400 text-center">No recent games</p> }
          </ul>
        </div>

        {/* Edit Profile Button */}
        <button
          onClick={() => navigate("/profile/edit")}
          className="w-full md:w-auto mx-auto bg-indigo-600 hover:bg-indigo-700 px-6 py-2 rounded-lg font-semibold"
        >
          Edit Profile
        </button>

      </div>
    </div>
  );
}
