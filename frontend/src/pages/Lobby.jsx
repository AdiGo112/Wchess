import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Copy, Loader2 } from "lucide-react";
import api from "../api";
import useMatchmakingSocket from "../hooks/useMatchmakingSocket";
import VariantSelector, { TIME_PRESETS } from "../components/VariantSelector";
import DifficultySlider from "../components/DifficultySlider";

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const Card = ({ title, children }) => (
  <div className="flex-1 min-w-[260px] bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
    <h3 className="text-xl font-bold mb-4">{title}</h3>
    {children}
  </div>
);

export default function Lobby() {
  const navigate = useNavigate();
  const { joinQueue, leaveQueue, isSearching, searchSeconds, position } = useMatchmakingSocket();

  // Quick match
  const [quickPreset, setQuickPreset] = useState(TIME_PRESETS[3]); // 5|0 Blitz

  // Friend challenge
  const [friendPreset, setFriendPreset] = useState(TIME_PRESETS[4]); // 10|0 Rapid
  const [creatorColor, setCreatorColor] = useState("random");
  const [shareUrl, setShareUrl] = useState(null);
  const [creating, setCreating] = useState(false);

  // Computer
  const [difficulty, setDifficulty] = useState(3);
  const [computerPreset, setComputerPreset] = useState(TIME_PRESETS[3]);
  const [starting, setStarting] = useState(false);

  const findGame = () => joinQueue({ timeControl: quickPreset.timeControl, increment: quickPreset.increment });

  const createChallenge = async () => {
    setCreating(true);
    try {
      const { data } = await api.post("/matchmaking/challenge", {
        variant: friendPreset.variant,
        timeControl: friendPreset.timeControl,
        increment: friendPreset.increment,
        creatorColor,
      });
      setShareUrl(data.shareUrl);
    } catch {
      toast.error("Could not create challenge link");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Copy failed — select and copy manually");
    }
  };

  const startComputer = async () => {
    setStarting(true);
    try {
      const { data } = await api.post("/matchmaking/computer", {
        difficulty,
        variant: computerPreset.variant,
        timeControl: computerPreset.timeControl,
        increment: computerPreset.increment,
      });
      navigate(`/game/${data.gameId}`, { state: { timeControl: computerPreset.timeControl } });
    } catch {
      toast.error("Could not start computer game");
      setStarting(false);
    }
  };

  return (
    <div className="text-white max-w-5xl mx-auto">
      <h1 className="text-3xl font-extrabold mb-6 text-center">Play Chess</h1>

      <div className="flex flex-wrap gap-4">
        {/* Card 1: Quick Match */}
        <Card title="Quick Match">
          {isSearching ? (
            <div className="text-center py-6">
              <Loader2 className="animate-spin mx-auto mb-3 text-indigo-400" size={32} />
              <p className="text-gray-300">Searching for opponent…</p>
              <p className="text-2xl font-mono mt-1">{fmt(searchSeconds)}</p>
              {position != null && (
                <p className="text-sm text-gray-400 mt-1">Position: {position} in queue</p>
              )}
              <button
                onClick={leaveQueue}
                className="mt-4 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <VariantSelector selected={quickPreset} onSelect={setQuickPreset} />
              <button
                onClick={findGame}
                className="mt-4 w-full bg-green-600 hover:bg-green-700 px-4 py-3 rounded-lg font-semibold"
              >
                Find Game
              </button>
            </>
          )}
        </Card>

        {/* Card 2: Play a Friend */}
        <Card title="Play a Friend">
          {shareUrl ? (
            <div className="text-center py-2">
              <p className="text-sm text-gray-300 mb-2">Share this link with your friend:</p>
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-transparent text-xs outline-none truncate"
                />
                <button onClick={copyLink} className="text-indigo-400 hover:text-indigo-300" title="Copy">
                  <Copy size={18} />
                </button>
              </div>
              <div className="flex items-center justify-center gap-2 mt-4 text-gray-300">
                <Loader2 className="animate-spin" size={18} />
                <span>Waiting for opponent…</span>
              </div>
              <button
                onClick={() => setShareUrl(null)}
                className="mt-3 text-xs text-gray-400 hover:text-gray-200 underline"
              >
                Create another
              </button>
            </div>
          ) : (
            <>
              <VariantSelector selected={friendPreset} onSelect={setFriendPreset} />
              <div className="mt-4">
                <p className="text-sm text-gray-300 mb-1">Your color</p>
                <div className="flex gap-2">
                  {["white", "black", "random"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCreatorColor(c)}
                      className={`flex-1 capitalize px-2 py-2 rounded-lg border text-sm transition ${
                        creatorColor === c
                          ? "bg-indigo-600 border-indigo-500"
                          : "border-gray-600 hover:border-indigo-400"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={createChallenge}
                disabled={creating}
                className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 px-4 py-3 rounded-lg font-semibold"
              >
                {creating ? "Creating…" : "Create Challenge Link"}
              </button>
            </>
          )}
        </Card>

        {/* Card 3: Play Computer */}
        <Card title="Play Computer">
          <p className="text-sm text-gray-300 mb-2">Difficulty</p>
          <DifficultySlider value={difficulty} onChange={setDifficulty} />
          <div className="mt-5">
            <p className="text-sm text-gray-300 mb-2">Time control</p>
            <VariantSelector selected={computerPreset} onSelect={setComputerPreset} />
          </div>
          <button
            onClick={startComputer}
            disabled={starting}
            className="mt-4 w-full bg-green-600 hover:bg-green-700 disabled:opacity-60 px-4 py-3 rounded-lg font-semibold"
          >
            {starting ? "Starting…" : "Start Game"}
          </button>
        </Card>
      </div>
    </div>
  );
}
