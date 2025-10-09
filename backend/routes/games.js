import express from 'express';
import { createGame, joinGame, listGames, getUserGames } from '../controllers/gameController.js';
import auth from '../utils/authMiddleware.js';

const router = express.Router();

router.get('/', listGames);
router.post('/create', auth, createGame);
router.post('/join', auth, joinGame);
router.get('/me', auth, getUserGames);

export default router;
