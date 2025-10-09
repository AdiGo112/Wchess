import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Auth from './pages/Auth';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <nav>
          <Link to="/">Home</Link> | <Link to="/lobby">Lobby</Link> | <Link to="/auth">Login</Link>
        </nav>
        <Routes>
          <Route path="/" element={<div>Welcome to ChessWeb</div>} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/lobby" element={<Lobby />} />
          <Route path="/game/:id" element={<Game />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
