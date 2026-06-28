import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSocket } from "../context/SocketContext";

/**
 * Wires the shared game socket for matchmaking: join/leave the quick-match
 * queue and auto-navigate into a game on `match_found` (quick match) or
 * `challenge_accepted` (a friend accepted this user's challenge link).
 *
 * The matchmaking gateway shares the default Socket.io namespace with the
 * game gateway, so we reuse the already-authenticated `useSocket()` connection.
 */
export default function useMatchmakingSocket() {
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [isSearching, setIsSearching] = useState(false);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const queuedTcRef = useRef(null); // timeControl we're queued under (for leave)

  useEffect(() => {
    if (!socket) return;

    const goToGame = (data) => {
      const roomId = data?.roomId || data?.gameId;
      if (!roomId) return;
      queuedTcRef.current = null;
      setIsSearching(false);
      navigate(`/game/${roomId}`);
    };
    const onQueued = () => setIsSearching(true);

    socket.on("match_found", goToGame);
    socket.on("challenge_accepted", goToGame);
    socket.on("queued", onQueued);

    return () => {
      socket.off("match_found", goToGame);
      socket.off("challenge_accepted", goToGame);
      socket.off("queued", onQueued);
    };
  }, [socket, navigate]);

  // Local elapsed-time ticker while searching (server doesn't push position).
  useEffect(() => {
    if (!isSearching) {
      setSearchSeconds(0);
      return;
    }
    const id = setInterval(() => setSearchSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isSearching]);

  const joinQueue = useCallback(
    ({ timeControl, increment = 0 }) => {
      if (!socket) return;
      queuedTcRef.current = timeControl;
      setIsSearching(true);
      socket.emit("join_queue", { timeControl, increment });
    },
    [socket],
  );

  const leaveQueue = useCallback(() => {
    if (socket && queuedTcRef.current != null) {
      socket.emit("leave_queue", { timeControl: queuedTcRef.current });
    }
    queuedTcRef.current = null;
    setIsSearching(false);
  }, [socket]);

  // Leave the queue if the component using this hook unmounts mid-search.
  useEffect(() => leaveQueue, [leaveQueue]);

  return { joinQueue, leaveQueue, isSearching, searchSeconds };
}
