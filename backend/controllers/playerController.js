import Player from "../models/player.js";

// Create a player
export const createPlayer = async (req, res) => {
    const { name, username, rating } = req.body;
    if (!name && !rating && !username) {
      return res.status(400).json({ message: "Name, username, and rating are required" });
    }
  try {
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
