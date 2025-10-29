// routes/playerRoutes.js
import express from "express";
import { createPlayer, getPlayers } from "../controllers/playerController.js";

const router = express.Router();

router.post("/createPlayer", createPlayer);
router.get("/getPlayers", getPlayers);

export default router;
