import React, { useEffect, useRef, useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import api from "../api";

export default function ChessGame({ mode, players = [] }) {
  const chessRef = useRef(null);
  const [chess, setChess] = useState(new Chess());
  const [fen, setFen] = useState("start");
  const [turn, setTurn] = useState("w");
  const [status, setStatus] = useState("ongoing");
  const [saving, setSaving] = useState(false);
  const [whitePlayer, setWhitePlayer] = useState(null);
  const [blackPlayer, setBlackPlayer] = useState(null);
  const [gameId, setGameId] = useState(null); // <- new: track backend game id

  useEffect(() => {
    const c = new Chess();
    setChess(c);
    setFen(c.fen());
    setTurn(c.turn());
    setStatus("ongoing");

    // resolve players from mode
    let wp, bp;
    if (mode.type === "pvp") {
      wp = players.find(p => p._id === mode.whiteId) || { _id: mode.whiteId };
      bp = players.find(p => p._id === mode.blackId) || { _id: mode.blackId };
      setWhitePlayer(wp);
      setBlackPlayer(bp);
    } else {
      const humanId = mode.whiteId || mode.blackId;
      const human = players.find(p => p._id === humanId) || { _id: humanId };
      if (mode.whiteId && mode.type === "pc") {
        wp = human;
        bp = { _id: "computer", name: "Computer", username: "computer" };
        setWhitePlayer(wp);
        setBlackPlayer(bp);
      } else {
        wp = { _id: "computer", name: "Computer", username: "computer" };
        bp = human;
        setWhitePlayer(wp);
        setBlackPlayer(bp);
      }
    }

    // create game on backend and store id
    async function createGame(startChess, whiteId, blackId) {
      try {
        const payload = {
          whitePlayer: whiteId || null,
          blackPlayer: blackId || null,
          result: "ongoing",
          fen: startChess.fen(),
          moves: [],
        };
        const res = await api.post("/games", payload);
        // backend might return the created game object
        setGameId(res?.data?._id || res?.data?.id || null);
      } catch (err) {
        console.error("Create game failed:", err);
      }
    }

    createGame(c, wp?._id, bp?._id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    // if it's computer's turn in pc mode, make a move
    if (mode.type === "pc") {
      const isComputerTurn = (chess.turn() === "w" && whitePlayer && whitePlayer._id === "computer") ||
                             (chess.turn() === "b" && blackPlayer && blackPlayer._id === "computer");
      if (isComputerTurn) {
        setTimeout(() => makeComputerMove(), 400);
      }
    }
    updateStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chess, whitePlayer, blackPlayer]);

  function updateStatus() {
    setFen(chess.fen());
    setTurn(chess.turn());
    if (chess.isCheckmate()) setStatus("checkmate");
    else if (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition()) setStatus("draw");
    else if (chess.in_check()) setStatus("check");
    else setStatus("ongoing");
  }

  // prevent human from moving if it's computer's turn
  function isHumanTurn() {
    if (mode.type !== "pc") return true;
    if (!whitePlayer || !blackPlayer) return true;
    const computerIsWhite = whitePlayer._id === "computer";
    const computerIsBlack = blackPlayer._id === "computer";
    if (computerIsWhite && chess.turn() === "w") return false;
    if (computerIsBlack && chess.turn() === "b") return false;
    return true;
  }

  async function updateBackendGame(optionalResult = null) {
    // Try PUT to update existing game; fall back to POST if PUT fails
    const payload = {
      whitePlayer: whitePlayer?._id || null,
      blackPlayer: blackPlayer?._id || null,
      result: optionalResult || (chess.isCheckmate() ? (chess.turn() === "w" ? "0-1" : "1-0") :
                (chess.isStalemate() || chess.isInsufficientMaterial() || chess.isThreefoldRepetition() ? "1/2-1/2" : "ongoing")),
      fen: chess.fen(),
      moves: chess.history(),
    };
    if (gameId) {
      try {
        await api.put(`/games/${gameId}`, payload);
        return;
      } catch (err) {
        console.warn("PUT failed, will try POST:", err);
      }
    }
    // fallback: POST a new record (some backends don't support PUT)
    try {
      const res = await api.post("/games", payload);
      setGameId(res?.data?._id || res?.data?.id || gameId);
    } catch (err) {
      console.error("Fallback POST failed:", err);
    }
  }

  function onDrop(sourceSquare, targetSquare) {
    // block human move when it's computer's turn in pc mode
    if (!isHumanTurn()) return false;

    const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
    if (move === null) return false;
    // valid move applied
    setChess(new Chess(chess.fen()));

    // update backend asynchronously (no blocking UI)
    updateBackendGame().catch(e => console.error(e));

    return true;
  }

  function makeComputerMove() {
    const moves = chess.moves();
    if (moves.length === 0) return;
    // prefer capturing moves
    const captureMoves = moves.filter(m => m.includes("x"));
    const choice = captureMoves.length ? captureMoves[Math.floor(Math.random() * captureMoves.length)]
                                       : moves[Math.floor(Math.random() * moves.length)];
    chess.move(choice);
    setChess(new Chess(chess.fen()));

    // update backend after computer moves too
    updateBackendGame().catch(e => console.error(e));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateBackendGame(); // will PUT if possible or POST fallback
      alert("Saved");
    } catch (err) {
      console.error(err);
      alert("Save failed");
    } finally {
      setSaving(false);
    }
  }

  function restart() {
    const c = new Chess();
    setChess(c);
    setFen(c.fen());
    setStatus("ongoing");
  }

  return (
    <div className="glow-card p-6 rounded">
      <div className="md:flex md:gap-6">
        <div className="w-full md:w-1/2 board-wrapper">
          <Chessboard
            position={fen}
            onPieceDrop={(source, target) => onDrop(source, target)}
            boardWidth={Math.min(520, typeof window !== "undefined" ? window.innerWidth - 64 : 480)}
            arePiecesDraggable={status === "ongoing"}
            id="Board1"
            customBoardStyle={{ boxShadow: "0 8px 30px rgba(14,165,164,0.12)", borderRadius: 8 }}
          />
        </div>

        <div className="mt-4 md:mt-0 md:w-1/2">
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-sm text-gray-400">White</div>
              <div className="font-medium">{whitePlayer?.name || whitePlayer?._id}</div>
            </div>
            <div>
              <div className="text-sm text-gray-400">Black</div>
              <div className="font-medium">{blackPlayer?.name || blackPlayer?._id}</div>
            </div>

            <div className="pt-2">
              <div className="text-sm text-gray-400">Turn</div>
              <div className="font-semibold">{chess.turn() === "w" ? "White" : "Black"}</div>
            </div>

            <div>
              <div className="text-sm text-gray-400">Status</div>
              <div className={"font-semibold " + (status === "checkmate" ? "text-red-400" : status === "draw" ? "text-yellow-300" : "text-green-300")}>
                {status}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <button onClick={restart} className="px-4 py-2 bg-panel/70 rounded">Restart</button>
              <button onClick={handleSave} className="px-4 py-2 bg-glowing text-black rounded" disabled={saving}>
                {saving ? "Saving..." : "Save Game"}
              </button>
            </div>

            <div className="pt-4 text-sm text-gray-400">
              Moves: {chess.history().join(", ") || "None"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
