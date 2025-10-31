import express from "express";
import Player from "../models/player.js";

const router = express.Router();

/* 🟢 Register new player */
router.post("/register", async (req, res) => {
  try {
    const { name, username } = req.body;

    if (!name || !username) {
      return res.status(400).json({ message: "Name and username required" });
    }

    // Check if username already exists
    const existing = await Player.findOne({ username });
    if (existing) {
      return res.status(400).json({ message: "Username already taken" });
    }

    const newPlayer = new Player({ name, username });
    await newPlayer.save();

    res.status(201).json(newPlayer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* 🟠 Login (no password for now) */
router.post("/login", async (req, res) => {
  try {
    const { username } = req.body;
    const player = await Player.findOne({ username });

    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }

    res.json(player);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* 🔵 Get all players (for leaderboard or matchmaking) */
router.get("/", async (req, res) => {
  try {
    const players = await Player.find().sort({ rating: -1 }); // highest rating first
    res.json(players);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* 🟣 Get single player by ID or username */
router.get("/:id", async (req, res) => {
  try {
    const player = await Player.findById(req.params.id);
    if (!player) return res.status(404).json({ message: "Player not found" });
    res.json(player);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* 🔴 Update player rating (after a game) */
router.put("/:id/rating", async (req, res) => {
  try {
    const { rating } = req.body;
    const player = await Player.findByIdAndUpdate(
      req.params.id,
      { rating },
      { new: true }
    );
    if (!player) return res.status(404).json({ message: "Player not found" });
    res.json(player);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
