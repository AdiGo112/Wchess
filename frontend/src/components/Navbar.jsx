import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, User, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const { player, logout } = useAuth();

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const toggleProfile = () => setProfileOpen(!profileOpen);

  const navLinks = [
    { path: "/", label: "Home" },
    { path: "/leaderboard", label: "Leaderboard" },
    { path: "/history", label: "Games" },
  ];

  return (
    <nav className="w-full bg-gray-900/80 backdrop-blur-lg shadow-lg text-white sticky top-0 z-50">
      <div className="container mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <div
          onClick={() => navigate("/")}
          className="text-2xl font-bold text-indigo-400 cursor-pointer select-none"
        >
          ♟ ChessWeb
        </div>

        {/* Desktop Menu */}
        <div className="hidden md:flex items-center gap-6 relative">
          {navLinks.map(({ path, label }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "text-indigo-400 border-b-2 border-indigo-400 pb-1"
                    : "text-gray-300 hover:text-indigo-300"
                }`
              }
            >
              {label}
            </NavLink>
          ))}

          {player ? (
            <div className="relative">
              <button
                onClick={toggleProfile}
                className="flex items-center gap-2 bg-gray-800 px-3 py-2 rounded-lg hover:bg-gray-700 transition"
              >
                <div className="w-7 h-7 rounded-full bg-indigo-500 flex items-center justify-center font-bold text-sm">
                  {player.name ? player.name[0].toUpperCase() : "P"}
                </div>
                <span className="text-sm">{player.name || "Player"}</span>
                <ChevronDown size={16} className="text-gray-300" />
              </button>

              {/* Profile Dropdown */}
              {profileOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden">
                  <button
                    onClick={() => {
                      navigate("/profile");
                      setProfileOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition"
                  >
                    View Profile
                  </button>
                  <button
                    onClick={() => {
                      logout();
                      setProfileOpen(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 transition"
                  >
                    <LogOut size={14} className="inline mr-1" /> Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-1 transition"
            >
              <User size={16} /> Login / Signup
            </button>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <div className="md:hidden">
          <button onClick={toggleMenu}>
            {menuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {menuOpen && (
        <div className="md:hidden bg-gray-800 border-t border-gray-700 px-6 pb-4 space-y-4">
          {navLinks.map(({ path, label }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `block text-sm font-medium ${
                  isActive
                    ? "text-indigo-400"
                    : "text-gray-300 hover:text-indigo-300"
                }`
              }
            >
              {label}
            </NavLink>
          ))}

          {player ? (
            <>
              <button
                onClick={() => {
                  navigate("/profile");
                  setMenuOpen(false);
                }}
                className="w-full bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 transition"
              >
                <User size={16} /> Profile
              </button>
              <button
                onClick={() => {
                  logout();
                  setMenuOpen(false);
                }}
                className="w-full bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 transition"
              >
                <LogOut size={16} /> Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                navigate("/login");
                setMenuOpen(false);
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-1 transition"
            >
              <User size={16} /> Login / Signup
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
