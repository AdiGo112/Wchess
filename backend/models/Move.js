import mongoose from 'mongoose';

const moveSchema = new mongoose.Schema({
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game' },
  from: String,
  to: String,
  san: String,
  color: String,
  turn: Number,
}, { timestamps: true });

export default mongoose.model('Move', moveSchema);
