import React from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import GameHistory from "./pages/GameHistory";
import PlayerList from "./components/PlayerList";
import CreatePlayer from "./components/CreatePlayer";
import "./index.css";

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/players" element={<PlayerList />} />
          <Route path="/players/new" element={<CreatePlayer />} />
          <Route path="/history" element={<GameHistory />} />
          {/* Game page is rendered by ChessGame inside Home when started */}
        </Routes>
      </main>
    </div>
  );
}
