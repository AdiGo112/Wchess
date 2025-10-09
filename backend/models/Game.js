import mongoose from 'mongoose';

const moveSchema = new mongoose.Schema({
  from: String,
  to: String,
  san: String,
  color: String,
  turn: Number,
  createdAt: { type: Date, default: Date.now },
});

const gameSchema = new mongoose.Schema({
  name: { type: String },
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  fen: { type: String, default: 'start' },
  moves: [moveSchema],
  status: { type: String, enum: ['waiting','playing','ended'], default: 'waiting' },
  result: { type: String },
}, { timestamps: true });

export default mongoose.model('Game', gameSchema);
