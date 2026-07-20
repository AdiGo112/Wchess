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

const REFRESH_KEY = "chessweb_refresh_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  const bootedRef = useRef(false);

  const storeTokens = (accessToken: string, refreshToken: string) => {
    accessTokenRef.current = accessToken;
    sessionStorage.setItem(REFRESH_KEY, refreshToken);
  };

  const clearTokens = () => {
    accessTokenRef.current = null;
    sessionStorage.removeItem(REFRESH_KEY);
  };

  const getToken = useCallback(() => accessTokenRef.current, []);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    const stored = sessionStorage.getItem(REFRESH_KEY);
    if (!stored) return null;
    try {
      const res = await api.post<AuthResponse>("/auth/refresh", { refreshToken: stored });
      storeTokens(res.data.accessToken, res.data.refreshToken);
      return res.data.accessToken;
    } catch {
      clearTokens();
      setUser(null);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    const stored = sessionStorage.getItem(REFRESH_KEY);
    try {
      if (stored) await api.post("/auth/logout", { refreshToken: stored });
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

    const stored = sessionStorage.getItem(REFRESH_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }

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
    storeTokens(res.data.accessToken, res.data.refreshToken);
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
