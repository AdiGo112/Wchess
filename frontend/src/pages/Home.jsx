import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const TICKER =
  "PLAY FAST ★ THINK HARD ★ NO COLORS ★ NO MERCY ★ RATED GAMES ★ FREE FOREVER ★ ";

/** 4x4 checkerboard motif — pure divs, no images. */
function MiniBoard() {
  return (
    <div className="grid grid-cols-4 border-[3px] border-ink shadow-brutal-lg w-48 h-48 md:w-64 md:h-64 rotate-3 hover:rotate-0 transition-transform duration-200 bg-white">
      {Array.from({ length: 16 }, (_, i) => {
        const dark = (Math.floor(i / 4) + i) % 2 === 1;
        return (
          <div
            key={i}
            className={`flex items-center justify-center text-3xl md:text-4xl ${
              dark ? "bg-ink text-white" : "bg-white text-ink"
            }`}
          >
            {i === 5 ? "♞" : i === 10 ? "♛" : ""}
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div className="-mx-4 -my-8">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="container mx-auto px-4 pt-16 pb-12 grid md:grid-cols-[1fr_auto] gap-10 items-center">
        <div>
          <p className="tag-b-inverse mb-4">100% monochrome. 0% chill.</p>
          <h1 className="heading-b text-6xl md:text-8xl">
            CHESS,
            <br />
            BUT MAKE IT
            <br />
            <span className="bg-ink text-white px-3 -mx-1">BRUTAL.</span>
          </h1>
          <p className="mt-6 max-w-md text-neutral-600 font-medium">
            Real-time games. Real ratings. A chessboard that respects your
            retinas — black, white, and every grey in between.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <button
              onClick={() => navigate(user ? "/lobby" : "/signup")}
              className="btn-b btn-b-primary text-lg px-8 py-4"
            >
              {user ? "Play now →" : "Join free →"}
            </button>
            <button
              onClick={() => navigate("/leaderboard")}
              className="btn-b text-lg px-8 py-4"
            >
              Leaderboard
            </button>
          </div>
        </div>

        <div className="hidden md:block justify-self-end">
          <MiniBoard />
        </div>
      </section>

      {/* ── Ticker ───────────────────────────────────────────── */}
      <div className="marquee-b" aria-hidden="true">
        <div>{TICKER + TICKER}</div>
      </div>

      {/* ── Three modes ──────────────────────────────────────── */}
      <section className="container mx-auto px-4 py-14 grid gap-6 md:grid-cols-3">
        {[
          {
            glyph: "⚡",
            title: "QUICK MATCH",
            body: "Queue up. Get paired by rating in seconds. Bullet to classical.",
          },
          {
            glyph: "🔗",
            title: "CHALLENGE A FRIEND",
            body: "One link. Send it anywhere. First click gets the game.",
          },
          {
            glyph: "🤖",
            title: "FIGHT THE MACHINE",
            body: "Stockfish runs in YOUR browser. Five difficulties, zero excuses.",
          },
        ].map((c) => (
          <div
            key={c.title}
            className="card-b hover:-translate-y-1 hover:shadow-brutal-lg transition-all cursor-pointer"
            onClick={() => navigate("/lobby")}
          >
            <span className="text-3xl grayscale">{c.glyph}</span>
            <h3 className="heading-b text-xl mt-3">{c.title}</h3>
            <p className="mt-2 text-sm text-neutral-600 font-medium">{c.body}</p>
            <p className="mt-4 text-xs font-bold uppercase tracking-widest underline decoration-2 underline-offset-4">
              Go →
            </p>
          </div>
        ))}
      </section>

      {/* ── Bottom strip ─────────────────────────────────────── */}
      <section className="border-t-[3px] border-ink bg-ink text-white">
        <div className="container mx-auto px-4 py-10 flex flex-wrap items-center justify-between gap-6">
          <p className="heading-b text-2xl md:text-3xl">
            YOUR MOVE<span className="animate-blink">_</span>
          </p>
          <button
            onClick={() => navigate(user ? "/lobby" : "/signup")}
            className="btn-b bg-white text-ink shadow-brutal-white"
          >
            {user ? "Enter the lobby" : "Create account"}
          </button>
        </div>
      </section>
    </div>
  );
}
