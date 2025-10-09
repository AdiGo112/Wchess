import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { getToken } from '../utils/auth';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export default function Lobby({ navigate }) {
  const [games, setGames] = useState([]);
  const [name, setName] = useState('');

  const fetchGames = async () => {
    const res = await axios.get(`${API}/games`);
    setGames(res.data);
  };

  useEffect(() => { fetchGames(); }, []);

  const createGame = async () => {
    const token = getToken();
    const res = await axios.post(`${API}/games/create`, { name }, { headers: { Authorization: `Bearer ${token}` } });
    // redirect to game page
    window.location.href = `/game/${res.data._id}`;
  };

  const joinGame = async (id) => {
    const token = getToken();
    await axios.post(`${API}/games/join`, { gameId: id }, { headers: { Authorization: `Bearer ${token}` } });
    window.location.href = `/game/${id}`;
  };

  return (
    <div>
      <h2>Lobby</h2>
      <div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Room name" />
        <button onClick={createGame}>Create</button>
      </div>
      <ul>
        {games.map(g => (
          <li key={g._id}>
            {g.name || 'Room'} - {g.players.length}/2 - {g.status}
            <button onClick={() => joinGame(g._id)}>Join</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
