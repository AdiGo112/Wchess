import mongoose from "mongoose";

const gameSchema = new mongoose.Schema({
  whitePlayer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Player",
    required: true,
  },
  blackPlayer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Player",
    required: true,
  },
  result: {
    type: String,
    enum: ["white", "black", "draw", "ongoing"],
    default: "ongoing",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Game", gameSchema);
