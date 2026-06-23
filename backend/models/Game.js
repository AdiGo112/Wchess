import mongoose from "mongoose";

const gameSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
    },
    opponent: {
      type: String,
      required: true,
    },
    result: {
      type: String,
      enum: ["Win", "Lose", "Draw"],
      required: true,
    },
    moves: {
      type: Number,
      default: 0,
    },
    date: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const Game = mongoose.model("Game", gameSchema);
export default Game;
