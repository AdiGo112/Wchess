import Player from "../models/player.js";

// Create a player
export const createPlayer = async (req, res) => {
  const { name, username, rating } = req.body;
  if (!name || !username) {
    return res.status(400).json({ message: "Name and username are required" });
  }
  try {
    const existing = await Player.findOne({ username });
    if (existing) return res.status(400).json({ message: "Username already taken" });

    const player = new Player({ name, username, rating });
    await player.save();
    res.status(201).json(player);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all players
export const getPlayers = async (req, res) => {
  try {
    const players = await Player.find();
    res.json(players);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
