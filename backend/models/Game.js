import mongoose from "mongoose";

const gameSchema = new mongoose.Schema({
  whitePlayer: {
    type: mongoose.Schema.Types.Mixed, // can be ObjectId (Player) or string like "computer"
    ref: "Player",
  },
  blackPlayer: {
    type: mongoose.Schema.Types.Mixed,
    ref: "Player",
  },
  result: {
    type: String,
    default: "ongoing",
  },
  fen: {
    type: String,
    default: "",
  },
  moves: {
    type: [String],
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Game", gameSchema);
