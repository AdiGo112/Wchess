import express from "express";
import Player from "../models/player.js";

const router = express.Router();

// Signup route
router.post("/signup", async (req, res) => {
  try {
    const { name, username } = req.body;

    if (!name || !username) {
      return res.status(400).json({ message: "Name and username required" });
    }

    const existing = await Player.findOne({ username });
    if (existing) {
      return res.status(400).json({ message: "Username already exists" });
    }

    const newPlayer = await Player.create({ name, username });
    res.status(201).json({ message: "Signup successful", player: newPlayer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { username } = req.body;

    const player = await Player.findOne({ username });
    if (!player) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Login successful",
      player: {
        id: player._id,
        name: player.name,
        username: player.username,
        createdAt: player.createdAt,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
