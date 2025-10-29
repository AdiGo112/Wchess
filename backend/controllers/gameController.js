import mongoose from "mongoose";
import Game from "../models/game.js";
import Player from "../models/player.js";

// helper: resolve a provided player identifier to an ObjectId when possible,
// otherwise return the original value (e.g. "computer" or a username string).
async function resolvePlayerIdentifier(val) {
  if (val === undefined || val === null) return null;
  if (typeof val !== "string") return val; // likely already an ObjectId or object
  if (val === "computer") return "computer";

  // try by ObjectId first
  if (mongoose.Types.ObjectId.isValid(val)) {
    const byId = await Player.findById(val);
    if (byId) return byId._id;
  }

  // try by username
  const byUsername = await Player.findOne({ username: val });
  if (byUsername) return byUsername._id;

  // fallback: keep the original string
  return val;
}

// CREATE a new game (accepts whitePlayer/blackPlayer as _id, username or "computer")
export const createGame = async (req, res) => {
  try {
    const { whitePlayer, blackPlayer, result, fen, moves } = req.body;

    const wp = await resolvePlayerIdentifier(whitePlayer);
    const bp = await resolvePlayerIdentifier(blackPlayer);

    const newGame = await Game.create({
      whitePlayer: wp,
      blackPlayer: bp,
      result: result || "ongoing",
      fen: fen || "",
      moves: Array.isArray(moves) ? moves : [],
    });

    res.status(201).json(newGame);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// UPDATE existing game (or upsert) by id
export const updateGame = async (req, res) => {
  try {
    const id = req.params.id;
    const { whitePlayer, blackPlayer, result, fen, moves } = req.body;

    const wp = await resolvePlayerIdentifier(whitePlayer);
    const bp = await resolvePlayerIdentifier(blackPlayer);

    const payload = {
      ...(wp !== undefined && { whitePlayer: wp }),
      ...(bp !== undefined && { blackPlayer: bp }),
      ...(result !== undefined && { result }),
      ...(fen !== undefined && { fen }),
      ...(moves !== undefined && { moves }),
    };

    const updated = await Game.findByIdAndUpdate(id, payload, { new: true, upsert: true });
    res.status(200).json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET all games (with player usernames populated when the field is an ObjectId)
export const getGames = async (req, res) => {
  try {
    const games = await Game.find().populate("whitePlayer blackPlayer", "username rating");
    res.status(200).json(games);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
