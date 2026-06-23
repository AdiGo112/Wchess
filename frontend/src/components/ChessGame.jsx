import React, { useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

const ChessGame = ({ whitePlayer, blackPlayer }) => {
  const [game, setGame] = useState(new Chess());

  const onDrop = (sourceSquare, targetSquare) => {
    const newGame = new Chess(game.fen());
    const move = newGame.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });
    if (move) setGame(newGame);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-4">♟ Chess Game</h1>
      <p className="mb-2">{whitePlayer} (White) vs {blackPlayer} (Black)</p>

      <div className="w-[90vmin] h-[90vmin] max-w-[500px] max-h-[500px]">
        <Chessboard
          position={game.fen()}
          onPieceDrop={onDrop}
          arePiecesDraggable={true}
          boardOrientation="white"
        />
      </div>
    </div>
  );
};

export default ChessGame;
