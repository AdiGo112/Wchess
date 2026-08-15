import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import toast from "react-hot-toast";
import { useAuth } from "./AuthContext";

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, getToken, refreshToken } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  // One token refresh per disconnected stretch — reset on a successful connect.
  const refreshedRef = useRef(false);

  useEffect(() => {
    if (!getToken() || !user) return;

    // Same-origin by default (connects through the Vite/reverse proxy's
    // /socket.io, so one tunnel covers page + API + WS); VITE_SERVER_URL
    // overrides to a direct absolute origin.
    const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
    const socket = io(serverUrl, {
      auth: (cb: (data: { token: string }) => void) => cb({ token: `Bearer ${getToken()}` }),
      transports: ["websocket"],
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      setConnected(true);
      refreshedRef.current = false;
      toast.dismiss("socket-dead");
    });
    socket.on("disconnect", () => setConnected(false));

    // The handshake is rejected outright when the access token has expired
    // (GameGateway.handleConnection verifies it), so every retry would fail
    // identically. Refresh once, then let socket.io's own backoff continue.
    socket.on("connect_error", async (err) => {
      console.error("Socket error:", err.message);
      if (refreshedRef.current) return;
      refreshedRef.current = true;
      await refreshToken();
    });

    // socket.io stops retrying after `reconnectionAttempts`. Without this the
    // player is left in a frozen game with no indication anything is wrong.
    socket.io.on("reconnect_failed", () => {
      toast.error("Connection lost. Reload the page to continue.", {
        duration: Infinity,
        id: "socket-dead",
      });
    });

    // Gateways report failures over a plain `error` event (Room not found,
    // Not authenticated, ALREADY_IN_QUEUE). Nothing listened for it, so every
    // one of them was silent.
    socket.on("error", (data: { code?: string; message?: string }) => {
      if (data?.message) toast.error(data.message);
    });

    socketRef.current = socket;

    return () => {
      socket.io.off("reconnect_failed");
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = (): SocketContextValue => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error("useSocket must be used inside <SocketProvider>");
  return ctx;
};
