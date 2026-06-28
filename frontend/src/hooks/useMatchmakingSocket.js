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
  const [position, setPosition] = useState(null);
  // The queue we intend to be in: { timeControl, increment } | null. Doubles as
  // "are we searching" for re-join, and carries the params to re-emit.
  const desiredQueueRef = useRef(null);

  useEffect(() => {
    if (!socket) return;

    const goToGame = (data) => {
      const roomId = data?.roomId || data?.gameId;
      if (!roomId) return;
      desiredQueueRef.current = null;
      setIsSearching(false);
      navigate(`/game/${roomId}`);
    };
    const onQueued = () => setIsSearching(true);
    const onPosition = (data) => setPosition(data?.position ?? null);
    // On a transient reconnect the server dropped our queue entry; re-join so
    // the user isn't stranded on "Searching…" forever.
    const onReconnect = () => {
      if (desiredQueueRef.current) socket.emit("join_queue", desiredQueueRef.current);
    };

    socket.on("match_found", goToGame);
    socket.on("challenge_accepted", goToGame);
    socket.on("queued", onQueued);
    socket.on("queue_position", onPosition);
    socket.on("connect", onReconnect);

    return () => {
      socket.off("match_found", goToGame);
      socket.off("challenge_accepted", goToGame);
      socket.off("queued", onQueued);
      socket.off("queue_position", onPosition);
      socket.off("connect", onReconnect);
    };
  }, [socket, navigate]);

  // Local elapsed-time ticker while searching; clears position when stopped.
  useEffect(() => {
    if (!isSearching) {
      setSearchSeconds(0);
      setPosition(null);
      return;
    }
    const id = setInterval(() => setSearchSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isSearching]);

  const joinQueue = useCallback(
    ({ timeControl, increment = 0 }) => {
      if (!socket) return;
      desiredQueueRef.current = { timeControl, increment };
      setIsSearching(true);
      socket.emit("join_queue", { timeControl, increment });
    },
    [socket],
  );

  const leaveQueue = useCallback(() => {
    if (socket && desiredQueueRef.current) {
      socket.emit("leave_queue", { timeControl: desiredQueueRef.current.timeControl });
    }
    desiredQueueRef.current = null;
    setIsSearching(false);
  }, [socket]);

  // Leave the queue if the component using this hook unmounts mid-search.
  useEffect(() => leaveQueue, [leaveQueue]);

  return { joinQueue, leaveQueue, isSearching, searchSeconds, position };
}
