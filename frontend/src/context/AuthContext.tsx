import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import api, { setupInterceptors } from "../api";
import type { AuthResponse, User } from "../types";

interface RegisterData {
  username: string;
  email: string;
  name: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<AuthResponse>;
  register: (data: RegisterData) => Promise<{ user: User }>;
  logout: () => Promise<void>;
  getToken: () => string | null;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Where the refresh token used to live, before it moved into an HttpOnly cookie. */
const LEGACY_REFRESH_KEY = "chessweb_refresh_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  const bootedRef = useRef(false);

  // The access token lives only in memory; the refresh token is an HttpOnly
  // cookie the server sets and clears, so there is nothing else to store.
  const clearTokens = () => {
    accessTokenRef.current = null;
  };

  const getToken = useCallback(() => accessTokenRef.current, []);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    try {
      // 204 with no body = no session cookie, i.e. simply logged out.
      const res = await api.post<{ accessToken: string } | "">("/auth/refresh");
      const token = res.data ? res.data.accessToken : null;
      if (!token) {
        clearTokens();
        setUser(null);
        return null;
      }
      accessTokenRef.current = token;
      return token;
    } catch {
      clearTokens();
      setUser(null);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // clear locally regardless
    }
    clearTokens();
    setUser(null);
  }, []);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    setupInterceptors(getToken, refreshToken, () => {
      clearTokens();
      setUser(null);
    });

    try {
      sessionStorage.removeItem(LEGACY_REFRESH_KEY); // a pre-cookie token left readable by scripts
    } catch {
      // storage blocked: nothing to clean up
    }

    // Only the server can see whether the cookie exists, so every boot asks.
    refreshToken()
      .then((token) => {
        if (!token) {
          setIsLoading(false);
          return;
        }
        api
          .get<User>("/auth/me")
          .then((res) => setUser(res.data))
          .catch(() => setUser(null))
          .finally(() => setIsLoading(false));
      })
      .catch(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.post<AuthResponse>("/auth/login", { username, password });
    accessTokenRef.current = res.data.accessToken;
    setUser(res.data.user);
    return res.data;
  };

  const register = async (data: RegisterData) => {
    const res = await api.post<{ user: User }>("/auth/register", data);
    return res.data;
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, getToken, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
