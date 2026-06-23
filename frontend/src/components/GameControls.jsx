import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function GameSetup() {
  const [mode, setMode] = useState(null);
  const [time, setTime] = useState(null);
  const navigate = useNavigate();

  const handleStartGame = () => {
    if (mode && time) {
      navigate("/game", { state: { mode, time } });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white flex flex-col items-center justify-center relative">
      <div className="relative backdrop-blur-md bg-white/10 rounded-2xl shadow-2xl p-10 max-w-md w-full border border-white/10 text-center">
        <h2 className="text-3xl font-bold mb-6">🎮 New Game Setup</h2>

        {/* Mode Selection */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2 text-gray-300">Select Mode</h3>
          <div className="flex justify-center gap-4">
            {["online", "computer"].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg border ${
                  mode === m
                    ? "bg-indigo-600 border-indigo-500"
                    : "border-gray-600 hover:border-indigo-400"
                }`}
              >
                {m === "online" ? "Play Online" : "Play Computer"}
              </button>
            ))}
          </div>
        </div>

        {/* Time Control */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2 text-gray-300">Time Control</h3>
          <div className="flex justify-center gap-3 flex-wrap">
            {["1 min", "3 min", "10 min"].map((t) => (
              <button
                key={t}
                onClick={() => setTime(t)}
                className={`px-4 py-2 rounded-lg border ${
                  time === t
                    ? "bg-indigo-600 border-indigo-500"
                    : "border-gray-600 hover:border-indigo-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStartGame}
          disabled={!mode || !time}
          className={`mt-6 px-6 py-3 rounded-lg text-lg font-semibold transition-all duration-200 ${
            !mode || !time
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-green-600 hover:bg-green-700 shadow-md"
          }`}
        >
          Start Game
        </button>
      </div>
    </div>
  );
}
