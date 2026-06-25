import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import api, { setupInterceptors } from "../api";

const AuthContext = createContext(null);

const REFRESH_KEY = "chessweb_refresh_token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef(null);

  const storeTokens = (accessToken, refreshToken) => {
    accessTokenRef.current = accessToken;
    sessionStorage.setItem(REFRESH_KEY, refreshToken);
  };

  const clearTokens = () => {
    accessTokenRef.current = null;
    sessionStorage.removeItem(REFRESH_KEY);
  };

  const getToken = useCallback(() => accessTokenRef.current, []);

  const refreshToken = useCallback(async () => {
    const stored = sessionStorage.getItem(REFRESH_KEY);
    if (!stored) return null;
    try {
      const res = await api.post("/auth/refresh", { refreshToken: stored });
      storeTokens(res.data.accessToken, res.data.refreshToken);
      return res.data.accessToken;
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
    setupInterceptors(
      getToken,
      refreshToken,
      () => {
        clearTokens();
        setUser(null);
      }
    );

    const stored = sessionStorage.getItem(REFRESH_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }

    refreshToken().then((token) => {
      if (!token) {
        setIsLoading(false);
        return;
      }
      api
        .get("/auth/me")
        .then((res) => setUser(res.data))
        .catch(() => clearTokens())
        .finally(() => setIsLoading(false));
    });
  }, []);

  const login = async (username, password) => {
    const res = await api.post("/auth/login", { username, password });
    storeTokens(res.data.accessToken, res.data.refreshToken);
    setUser(res.data.user);
    return res.data;
  };

  const register = async (data) => {
    const res = await api.post("/auth/register", data);
    return res.data;
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, getToken, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
