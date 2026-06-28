import React from "react";
import { Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Game from "./pages/Game";
import Lobby from "./pages/Lobby";
import ChallengeAccept from "./pages/ChallengeAccept";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";
import GameHistory from "./pages/GameHistory";
import PlayerList from "./components/PlayerList";
import Leaderboard from "./pages/Leaderboard";

export default function App() {
  return (
    <div className="min-h-screen">
      <Toaster position="top-right" />
      <Navbar />
      <main className="container mx-auto px-4 py-6">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/players" element={<PlayerList />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/challenge/:token" element={<ChallengeAccept />} />
            <Route path="/game" element={<Game />} />
            <Route path="/game/:roomId" element={<Game />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/history" element={<GameHistory />} />
          </Route>
        </Routes>
      </main>
    </div>
  );
}
