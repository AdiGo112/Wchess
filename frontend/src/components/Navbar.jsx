import React from "react";
import { NavLink } from "react-router-dom";

export default function Navbar() {
  return (
    <nav className="w-full bg-panel/60 backdrop-blur-md py-4 shadow-md">
      <div className="container mx-auto px-4 flex items-center justify-between">
        <div className="text-lg font-semibold">ChessWeb</div>
        <div className="flex items-center gap-4">
          <NavLink to="/" className="text-sm hover:underline">Home</NavLink>
          <NavLink to="/players" className="text-sm hover:underline">Players</NavLink>
          <NavLink to="/history" className="text-sm hover:underline">Games</NavLink>
        </div>
      </div>
    </nav>
  );
}
