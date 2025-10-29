import React, { useState, useEffect } from "react";
import api from "../api";
import ChessGame from "../components/ChessGame.jsx";
import { Link } from "react-router-dom";

export default function Home() {
  const [players, setPlayers] = useState([]);
  const [mode, setMode] = useState(null); // {type: 'pvp'|'pc', whiteId, blackId}
  useEffect(() => {
    api.get("/players").then(r => setPlayers(r.data)).catch(() => {});
  }, []);

  function startPvP(whiteId, blackId) {
    setMode({ type: "pvp", whiteId, blackId });
  }

  function startVsComputer(playerId, playerIsWhite = true) {
    const comp = { name: "Computer", username: "computer", rating: 1500, _id: "computer" };
    if (playerIsWhite) setMode({ type: "pc", whiteId: playerId, blackPlayer: comp });
    else setMode({ type: "pc", whiteId: comp, blackId: playerId, blackPlayer: playerId });
  }

  return (
    <div className="space-y-6">
      {!mode ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glow-card p-6 rounded">
            <h3 className="text-lg font-semibold mb-3">Play vs Player</h3>
            <div className="text-sm text-gray-400 mb-3">Choose white and black from existing players</div>
            <div className="space-y-2">
              <select id="white" defaultValue="" className="w-full p-2 rounded bg-panel/30" >
                <option value="">Choose White</option>
                {players.map(p => <option key={p._id} value={p._id}>{p.name} (@{p.username})</option>)}
              </select>
              <select id="black" defaultValue="" className="w-full p-2 rounded bg-panel/30" >
                <option value="">Choose Black</option>
                {players.map(p => <option key={p._id} value={p._id}>{p.name} (@{p.username})</option>)}
              </select>
              <div className="flex gap-2 justify-end">
                <button onClick={() => {
                  const whiteId = document.getElementById("white").value;
                  const blackId = document.getElementById("black").value;
                  if (!whiteId || !blackId) return alert("Select both players");
                  startPvP(whiteId, blackId);
                }} className="px-4 py-2 bg-glowing text-black rounded">Start</button>
                <Link to="/players" className="px-3 py-2 bg-panel/60 rounded">Manage Players</Link>
              </div>
            </div>
          </div>

          <div className="glow-card p-6 rounded">
            <h3 className="text-lg font-semibold mb-3">Play vs Computer</h3>
            <div className="text-sm text-gray-400 mb-3">Pick your player and play against the computer</div>

            <select id="human" defaultValue="" className="w-full p-2 rounded bg-panel/30 mb-3" >
              <option value="">Choose Player</option>
              {players.map(p => <option key={p._id} value={p._id}>{p.name} (@{p.username})</option>)}
            </select>

            <div className="flex gap-2">
              <button onClick={() => {
                const id = document.getElementById("human").value;
                if (!id) return alert("Select a player");
                startVsComputer(id, true);
              }} className="px-4 py-2 bg-glowing text-black rounded">Play as White</button>

              <button onClick={() => {
                const id = document.getElementById("human").value;
                if (!id) return alert("Select a player");
                startVsComputer(id, false);
              }} className="px-4 py-2 bg-glowing text-black rounded">Play as Black</button>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <button onClick={() => setMode(null)} className="mb-4 px-3 py-1 rounded bg-panel/40">Back</button>
          <ChessGame mode={mode} players={players} />
        </div>
      )}
    </div>
  );
}
