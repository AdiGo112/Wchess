import mongoose from "mongoose";

const playerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
    username: {
    type: String,
    unique: true,
    sparse: true, // allows multiple nulls
  },
  rating: {
    type: Number,
    default: 1200, // default ELO rating
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model("Player", playerSchema);
