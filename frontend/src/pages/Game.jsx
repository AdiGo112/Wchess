// src/pages/Game.jsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ChessGame from "../components/ChessGame";

export default function Game() {
  const navigate = useNavigate();
  const location = useLocation();
  const { mode, time } = location.state || {}; // passed from Home

  if (!mode || !time) {
    // If user directly enters /game URL, redirect to home
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center">
      <div className="w-full flex justify-between items-center px-6 py-3 bg-gray-800 shadow-md">
        <h2 className="text-xl font-bold">ChessWeb</h2>
        <div className="flex gap-4">
          <span className="text-gray-300">Mode: {mode}</span>
          <span className="text-gray-300">Time: {time}</span>
          <button
            onClick={() => navigate("/")}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg"
          >
            Exit Game
          </button>
        </div>
      </div>

      <div className="mt-10">
        <ChessGame mode={mode} time={time} />
      </div>
    </div>
  );
}
