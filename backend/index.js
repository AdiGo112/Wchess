import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

import authRoutes from './routes/auth.js';
import gameRoutes from './routes/games.js';
import setupSocket from './sockets/webServerSocket.js';

dotenv.config();

const app = express();

app.use(express.json());

// CORS setup - allow frontend origin from env or localhost:3000
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);

app.get('/', (req, res) => res.json({ ok: true }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Mount socket handlers
setupSocket(io);

const PORT = process.env.PORT || 5000;

// Connect to MongoDB then start server
const start = async () => {
  try {
    const mongo = process.env.MONGO_URI || 'mongodb://localhost:27017/chessweb';
    await mongoose.connect(mongo, { });
    console.log('✅ Connected to MongoDB');
    server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
  } catch (err) {
    console.error('DB connection error', err);
    process.exit(1);
  }
};

start();
