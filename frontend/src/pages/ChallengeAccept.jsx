import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../api";

const ERROR_COPY = {
  CHALLENGE_NOT_FOUND: "This challenge link is invalid.",
  CHALLENGE_EXPIRED: "This challenge link has expired.",
  CHALLENGE_ALREADY_ACCEPTED: "This challenge has already been accepted.",
  CANNOT_ACCEPT_OWN_CHALLENGE: "You can't accept your own challenge.",
};

/**
 * Landing route for a friend-challenge share link (`/challenge/:token`).
 * Accepts the challenge server-side, then drops the user into the game.
 */
export default function ChallengeAccept() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // guard StrictMode double-invoke
    ranRef.current = true;

    api
      .post(`/matchmaking/challenge/${token}/accept`)
      .then(({ data }) => navigate(`/game/${data.gameId}`, { replace: true }))
      .catch((err) => {
        const code = err.response?.data?.code;
        const msg = ERROR_COPY[code] || "Could not accept this challenge.";
        setError(msg);
        toast.error(msg);
      });
  }, [token, navigate]);

  return (
    <div className="text-white text-center py-20">
      {error ? (
        <>
          <p className="text-lg text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate("/lobby")}
            className="bg-indigo-600 hover:bg-indigo-700 px-5 py-2 rounded-lg font-semibold"
          >
            Back to Lobby
          </button>
        </>
      ) : (
        <>
          <div className="animate-spin w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-300">Joining game…</p>
        </>
      )}
    </div>
  );
}
