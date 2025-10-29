// routes/gameRoutes.js
import express from "express";
import { createGame, getGames } from "../controllers/gameController.js";

const router = express.Router();

router.post("/createGame", createGame);
router.get("/getGames", getGames);

export default router;
