import React, { useEffect, useState, useRef } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import { socket } from '../utils/socket';
import axios from 'axios';
import { getToken, getUser } from '../utils/auth';

const API = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export default function Game({ match }) {
  const gameId = match?.params?.id || window.location.pathname.split('/').pop();
  const [chess] = useState(new Chess());
  const [fen, setFen] = useState(chess.fen());
  const [moves, setMoves] = useState([]);
  const user = getUser();
  const mounted = useRef(false);

  useEffect(() => {
    // connect socket and join room
    socket.auth = { token: getToken() };
    socket.connect();
    socket.emit('join_room', { roomId: gameId, userId: user?.id });

    socket.on('game_state', ({ fen: serverFen, moves: serverMoves }) => {
      if (serverFen) {
        chess.load(serverFen);
        setFen(chess.fen());
      }
      if (serverMoves) setMoves(serverMoves);
    });

    socket.on('move_made', ({ move, fen: newFen }) => {
      chess.load(newFen);
      setFen(chess.fen());
      setMoves(prev => [...prev, move]);
    });

    socket.on('invalid_move', () => alert('Invalid move'));

    return () => {
      socket.off('game_state');
      socket.off('move_made');
      socket.off('invalid_move');
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const onDrop = (sourceSquare, targetSquare) => {
    const move = { from: sourceSquare, to: targetSquare, promotion: 'q' };
    // optimistic UI: try locally
    const result = chess.move(move);
    if (result) {
      setFen(chess.fen());
      socket.emit('make_move', { roomId: gameId, move, userId: user?.id });
    } else {
      alert('Illegal move');
    }
  };

  return (
    <div>
      <h2>Game {gameId}</h2>
      <div style={{ display: 'flex', gap: 20 }}>
        <Chessboard position={fen} onPieceDrop={(from, to) => { onDrop(from, to); return true; }} />
        <div>
          <h3>Move History</h3>
          <ol>
            {moves.map((m, i) => (
              <li key={i}>{m.san || `${m.from}-${m.to}`}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
