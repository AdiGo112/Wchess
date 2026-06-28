import React from "react";
import { useNavigate } from "react-router-dom";

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white flex flex-col items-center justify-center">
      <h1 className="text-4xl font-extrabold mb-6">
        ♟️ Welcome to <span className="text-indigo-400">ChessWeb</span>
      </h1>

      <button
        onClick={() => navigate("/lobby")}
        className="bg-indigo-600 hover:bg-indigo-700 px-8 py-3 rounded-lg text-lg font-semibold shadow-md transition-all duration-200"
      >
        New Game
      </button>
    </div>
  );
}
