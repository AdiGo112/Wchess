import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Menu, X, LogOut, User, ChevronDown } from "lucide-react";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const toggleProfile = () => setProfileOpen(!profileOpen);

  const navLinks = [
    { path: "/", label: "Home" },
    { path: "/lobby", label: "Play" },
    { path: "/leaderboard", label: "Ranks" },
    { path: "/history", label: "Games" },
    { path: "/puzzles", label: "Puzzles", soon: true },
    { path: "/tournaments", label: "Arena", soon: true },
  ];

  const linkClass = ({ isActive }) =>
    `text-xs font-bold uppercase tracking-widest px-3 py-2 border-2 transition-all ${
      isActive
        ? "bg-ink text-white border-ink"
        : "border-transparent hover:border-ink"
    }`;

  return (
    <nav className="w-full bg-paper border-b-[3px] border-ink sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        {/* Logo — glyph in a hard-shadowed box */}
        <div
          onClick={() => navigate("/")}
          className="flex items-center gap-2 cursor-pointer select-none group"
        >
          <span className="inline-flex items-center justify-center w-9 h-9 bg-ink text-white text-xl border-[3px] border-ink shadow-brutal-sm group-hover:shadow-brutal transition-shadow">
            ♞
          </span>
          <span className="font-display text-xl tracking-tight">WCHESS</span>
        </div>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-1 relative">
          {navLinks.map(({ path, label, soon }) => (
            <NavLink key={path} to={path} className={linkClass}>
              {label}
              {soon && <sup className="ml-0.5 text-[8px]">soon</sup>}
            </NavLink>
          ))}

          {user ? (
            <div className="relative ml-3">
              <button
                onClick={toggleProfile}
                className="flex items-center gap-2 border-[3px] border-ink bg-white px-3 py-1.5 shadow-brutal-sm hover:shadow-brutal transition-shadow"
              >
                <span className="w-6 h-6 bg-ink text-white flex items-center justify-center font-display text-xs">
                  {user.name ? user.name[0].toUpperCase() : "P"}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider">
                  {user.name || "Player"}
                </span>
                <ChevronDown size={14} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-44 bg-white border-[3px] border-ink shadow-brutal">
                  <button
                    onClick={() => {
                      navigate("/profile");
                      setProfileOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-ink hover:text-white transition-colors"
                  >
                    Profile
                  </button>
                  <button
                    onClick={async () => {
                      await logout();
                      setProfileOpen(false);
                      navigate("/login");
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-t-2 border-ink hover:bg-ink hover:text-white transition-colors"
                  >
                    <LogOut size={12} className="inline mr-1 -mt-0.5" /> Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="btn-b btn-b-sm btn-b-primary ml-3"
            >
              <User size={14} /> Log in
            </button>
          )}
        </div>

        {/* Mobile toggle */}
        <div className="md:hidden">
          <button
            onClick={toggleMenu}
            className="border-[3px] border-ink bg-white p-1.5 shadow-brutal-sm active:shadow-none active:translate-x-0.5 active:translate-y-0.5"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t-[3px] border-ink px-4 pb-4 pt-2 space-y-1">
          {navLinks.map(({ path, label, soon }) => (
            <NavLink
              key={path}
              to={path}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2.5 text-sm font-bold uppercase tracking-widest border-2 ${
                  isActive ? "bg-ink text-white border-ink" : "border-transparent"
                }`
              }
            >
              {label}
              {soon && <sup className="ml-1 text-[8px]">soon</sup>}
            </NavLink>
          ))}

          <div className="pt-2 border-t-2 border-ink space-y-2">
            {user ? (
              <>
                <button
                  onClick={() => {
                    navigate("/profile");
                    setMenuOpen(false);
                  }}
                  className="btn-b w-full"
                >
                  <User size={16} /> Profile
                </button>
                <button
                  onClick={async () => {
                    await logout();
                    setMenuOpen(false);
                    navigate("/login");
                  }}
                  className="btn-b btn-b-danger w-full"
                >
                  <LogOut size={16} /> Log out
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  navigate("/login");
                  setMenuOpen(false);
                }}
                className="btn-b btn-b-primary w-full"
              >
                <User size={16} /> Log in / Sign up
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
