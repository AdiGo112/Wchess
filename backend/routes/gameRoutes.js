// routes/gameRoutes.js
import express from "express";
import { createGame, getGames, updateGame } from "../controllers/gameController.js";

const router = express.Router();

router.post("/", createGame);
router.get("/", getGames);
router.put("/:id", updateGame);

export default router;
