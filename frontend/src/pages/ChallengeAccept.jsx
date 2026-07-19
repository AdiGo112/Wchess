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
      .then(({ data }) =>
        navigate(`/game/${data.gameId}`, {
          replace: true,
          state: { timeControl: data.timeControl },
        }),
      )
      .catch((err) => {
        const code = err.response?.data?.code;
        const msg = ERROR_COPY[code] || "Could not accept this challenge.";
        setError(msg);
        toast.error(msg);
      });
  }, [token, navigate]);

  return (
    <div className="text-center py-24">
      {error ? (
        <div className="card-b inline-block px-10 py-8">
          <p className="font-display text-3xl mb-2">DEAD LINK</p>
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-6">
            {error}
          </p>
          <button onClick={() => navigate("/lobby")} className="btn-b btn-b-primary">
            Back to lobby
          </button>
        </div>
      ) : (
        <>
          <div className="loader-b mx-auto mb-4" />
          <p className="text-xs font-bold uppercase tracking-widest">
            Joining game<span className="animate-blink">_</span>
          </p>
        </>
      )}
    </div>
  );
}
