import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Copy } from "lucide-react";
import api from "../api";
import useMatchmakingSocket from "../hooks/useMatchmakingSocket";
import VariantSelector, { TIME_PRESETS } from "../components/VariantSelector";
import DifficultySlider from "../components/DifficultySlider";

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const Card = ({ index, title, children }) => (
  <div className="flex-1 min-w-[280px] card-b">
    <div className="flex items-baseline gap-2 mb-5">
      <span className="font-display text-neutral-300 text-3xl leading-none select-none">
        {String(index).padStart(2, "0")}
      </span>
      <h3 className="heading-b text-xl">{title}</h3>
    </div>
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
    <div className="max-w-5xl mx-auto">
      <h1 className="heading-b text-5xl md:text-6xl text-center mb-2">PICK YOUR FIGHT</h1>
      <p className="text-center mb-10">
        <span className="tag-b">three ways in. all of them rated-ish.</span>
      </p>

      <div className="flex flex-wrap gap-8">
        {/* Card 1: Quick Match */}
        <Card index={1} title="Quick match">
          {isSearching ? (
            <div className="text-center py-6">
              <div className="loader-b mx-auto mb-4" />
              <p className="text-xs font-bold uppercase tracking-widest">
                Hunting opponent<span className="animate-blink">_</span>
              </p>
              <p className="text-3xl font-mono font-bold mt-2">{fmt(searchSeconds)}</p>
              {position != null && (
                <p className="tag-b mt-2">#{position} in queue</p>
              )}
              <button onClick={leaveQueue} className="btn-b btn-b-danger btn-b-sm mt-5">
                Bail out
              </button>
            </div>
          ) : (
            <>
              <VariantSelector selected={quickPreset} onSelect={setQuickPreset} />
              <button onClick={findGame} className="btn-b btn-b-primary w-full mt-5">
                Find game →
              </button>
            </>
          )}
        </Card>

        {/* Card 2: Play a Friend */}
        <Card index={2} title="Play a friend">
          {shareUrl ? (
            <div className="py-2">
              <p className="label-b">Send this to your victim</p>
              <div className="flex items-stretch border-[3px] border-ink">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-white px-2 py-2 text-xs font-mono outline-none truncate"
                />
                <button
                  onClick={copyLink}
                  className="bg-ink text-white px-3 hover:bg-neutral-700 transition-colors"
                  title="Copy"
                >
                  <Copy size={16} />
                </button>
              </div>
              <div className="flex items-center gap-3 mt-5">
                <div className="loader-b !w-5 !h-5" />
                <span className="text-xs font-bold uppercase tracking-widest">
                  Waiting for opponent<span className="animate-blink">_</span>
                </span>
              </div>
              <button
                onClick={() => setShareUrl(null)}
                className="mt-4 text-xs font-bold uppercase tracking-widest underline decoration-2 underline-offset-4"
              >
                Create another
              </button>
            </div>
          ) : (
            <>
              <VariantSelector selected={friendPreset} onSelect={setFriendPreset} />
              <div className="mt-5">
                <p className="label-b">Your color</p>
                <div className="flex gap-2">
                  {["white", "black", "random"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setCreatorColor(c)}
                      className={`flex-1 capitalize px-2 py-2 border-[3px] border-ink text-xs font-bold uppercase tracking-wider transition-all ${
                        creatorColor === c
                          ? "bg-ink text-white shadow-brutal-sm"
                          : "bg-white hover:shadow-brutal-sm"
                      }`}
                    >
                      {c === "white" ? "♔ White" : c === "black" ? "♚ Black" : "? Random"}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={createChallenge}
                disabled={creating}
                className="btn-b btn-b-primary w-full mt-5"
              >
                {creating ? "Creating…" : "Get challenge link →"}
              </button>
            </>
          )}
        </Card>

        {/* Card 3: Play Computer */}
        <Card index={3} title="Fight the machine">
          <p className="label-b">Difficulty</p>
          <DifficultySlider value={difficulty} onChange={setDifficulty} />
          <div className="mt-5">
            <p className="label-b">Time control</p>
            <VariantSelector selected={computerPreset} onSelect={setComputerPreset} />
          </div>
          <button
            onClick={startComputer}
            disabled={starting}
            className="btn-b btn-b-primary w-full mt-5"
          >
            {starting ? "Booting engine…" : "Start game →"}
          </button>
        </Card>
      </div>
    </div>
  );
}
