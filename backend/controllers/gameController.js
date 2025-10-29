import Game from "../models/game.js";
import Player from "../models/player.js";

// CREATE a new game
export const createGame = async (req, res) => {
  try {
    const { whiteUsername, blackUsername, result } = req.body;

    // Find players by username
    const whitePlayer = await Player.findOne({ username: whiteUsername });
    const blackPlayer = await Player.findOne({ username: blackUsername });

    if (!whitePlayer || !blackPlayer) {
      return res.status(404).json({ message: "One or both players not found" });
    }

    // Create game with their ObjectIds
    const newGame = await Game.create({
      whitePlayer: whitePlayer._id,
      blackPlayer: blackPlayer._id,
      result: result || "ongoing",
    });

    res.status(201).json({
      message: "Game created successfully",
      game: newGame,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET all games (with player usernames populated)
export const getGames = async (req, res) => {
  try {
    const games = await Game.find()
      .populate("whitePlayer blackPlayer", "username rating");

    res.status(200).json(games);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
