import { Chess } from 'chess.js';
import Game from '../models/Game.js';

// Manage socket events for a connected socket
export default function setupSocket(io) {
  // Map of roomId -> Chess instance
  const games = new Map();

  io.on('connection', (socket) => {
    console.log('Socket connected', socket.id);

    // Join a room
    socket.on('join_room', async ({ roomId, userId }) => {
      socket.join(roomId);
      console.log(`${userId} joined room ${roomId}`);
      let game = await Game.findById(roomId);
      if (!game) return;
      if (!games.has(roomId)) {
        const chess = new Chess(game.fen === 'start' ? undefined : game.fen);
        games.set(roomId, chess);
      }
      // emit current state to joining player
      const chess = games.get(roomId);
      io.to(socket.id).emit('game_state', { fen: chess.fen(), moves: game.moves });
    });

    // Handle move from client
    socket.on('make_move', async ({ roomId, move, userId }) => {
      try {
        if (!games.has(roomId)) {
          const g = await Game.findById(roomId);
          games.set(roomId, new Chess(g.fen === 'start' ? undefined : g.fen));
        }
        const chess = games.get(roomId);
        // move should be in { from, to, promotion? }
        const result = chess.move(move);
        if (!result) {
          io.to(socket.id).emit('invalid_move', { move });
          return;
        }

        // Save move into DB
        const game = await Game.findById(roomId);
        const san = result.san;
        const color = result.color;
        const turn = game.moves.length + 1;
        game.moves.push({ from: result.from, to: result.to, san, color, turn });
        game.fen = chess.fen();

        // Check end conditions
        if (chess.isCheckmate()) {
          game.status = 'ended';
          game.result = `${color} wins by checkmate`;
        } else if (chess.isStalemate()) {
          game.status = 'ended';
          game.result = 'draw by stalemate';
        }

        await game.save();

        // Broadcast move to room
        io.to(roomId).emit('move_made', { move: result, fen: chess.fen(), gameId: roomId });
      } catch (err) {
        console.error('make_move error', err);
      }
    });

    socket.on('resign', async ({ roomId, userId }) => {
      try {
        const game = await Game.findById(roomId);
        if (!game) return;
        game.status = 'ended';
        game.result = `${userId} resigned`;
        await game.save();
        io.to(roomId).emit('game_ended', { result: game.result });
      } catch (err) {
        console.error(err);
      }
    });

    // Simple chat message
    socket.on('chat_message', ({ roomId, user, text }) => {
      io.to(roomId).emit('chat_message', { user, text, createdAt: new Date() });
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected', socket.id);
    });
  });
}
