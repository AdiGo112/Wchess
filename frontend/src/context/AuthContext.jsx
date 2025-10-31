import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext();


export const AuthProvider = ({ children }) => {
  const [player, setPlayer] = useState(null);

  useEffect(() => {
    const storedPlayer = localStorage.getItem("player");
    if (storedPlayer) setPlayer(JSON.parse(storedPlayer));
  }, []);

  const login = (data) => {
    localStorage.setItem("player", JSON.stringify(data));
    setPlayer(data);
  };

  const logout = () => {
    localStorage.removeItem("player");
    setPlayer(null);
  };

  return (
    <AuthContext.Provider value={{ player, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
