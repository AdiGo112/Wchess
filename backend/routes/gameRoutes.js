import express from "express";
import Game from "../models/game.js";

const router = express.Router();

/**
 * @route   GET /api/games/history/:playerId
 * @desc    Fetch all games played by a specific player
 * @access  Public (or Protected — depending on your auth setup)
 */
router.get("/history/:playerId", async (req, res) => {
  try {
    const { playerId } = req.params;

    if (!playerId) {
      return res.status(400).json({ message: "Player ID is required" });
    }

    const games = await Game.find({ playerId }).sort({ createdAt: -1 });

    if (games.length === 0) {
      return res.status(200).json([]);
    }

    res.status(200).json(games);
  } catch (err) {
    console.error("Error fetching game history:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * @route   POST /api/games/add
 * @desc    Record a new game played by a player
 * @access  Public (or Protected)
 */
router.post("/add", async (req, res) => {
  try {
    const { playerId, opponent, result, moves } = req.body;

    // Validation
    if (!playerId || !opponent || !result) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    if (!["win", "loss", "draw"].includes(result.toLowerCase())) {
      return res.status(400).json({ message: "Invalid result type" });
    }

    const game = new Game({
      playerId,
      opponent,
      result: result.toLowerCase(),
      moves: moves || [],
    });

    await game.save();

    res.status(201).json({
      message: "Game recorded successfully",
      game,
    });
  } catch (err) {
    console.error("Error adding game:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
