import Game from '../models/Game.js';
import User from '../models/User.js';

// Create a new game room
export const createGame = async (req, res) => {
  try {
    const { name } = req.body;
    const game = new Game({ name, players: [req.user.id], status: 'waiting' });
    await game.save();
    res.json(game);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Join an existing game
export const joinGame = async (req, res) => {
  try {
    const { gameId } = req.body;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ message: 'Game not found' });
    if (game.players.length >= 2) return res.status(400).json({ message: 'Game full' });
    if (!game.players.includes(req.user.id)) game.players.push(req.user.id);
    game.status = 'playing';
    await game.save();
    res.json(game);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get list of games (open or all)
export const listGames = async (req, res) => {
  try {
    const games = await Game.find().populate('players', 'username email').sort({ createdAt: -1 }).limit(50);
    res.json(games);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get past games for a user
export const getUserGames = async (req, res) => {
  try {
    const games = await Game.find({ players: req.user.id }).populate('players', 'username').sort({ updatedAt: -1 });
    res.json(games);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};
