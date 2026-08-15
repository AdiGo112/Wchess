import { Routes, Route } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Home from "./pages/Home";
import Game from "./pages/Game";
import Lobby from "./pages/Lobby";
import ChallengeAccept from "./pages/ChallengeAccept";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";
import GameHistory from "./pages/GameHistory";
import PlayerList from "./components/PlayerList";
import Leaderboard from "./pages/Leaderboard";
import Puzzles from "./pages/Puzzles";
import Tournaments from "./pages/Tournaments";
import ProfileEdit from "./pages/ProfileEdit";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Brutal toasts: square, bordered, uppercase. No colored success/error
          variants — the message text carries the meaning (strict mono). */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#ffffff",
            color: "#0a0a0a",
            border: "3px solid #0a0a0a",
            borderRadius: "0",
            boxShadow: "5px 5px 0 0 #0a0a0a",
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: "700",
            textTransform: "uppercase",
            fontSize: "12px",
            letterSpacing: "0.05em",
          },
          success: { iconTheme: { primary: "#0a0a0a", secondary: "#ffffff" } },
          error: { iconTheme: { primary: "#0a0a0a", secondary: "#ffffff" } },
        }}
      />
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/players" element={<PlayerList />} />

          {/* Coming-soon placeholders for features deferred by ADR-0032 */}
          <Route path="/puzzles" element={<Puzzles />} />
          <Route path="/tournaments" element={<Tournaments />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/challenge/:token" element={<ChallengeAccept />} />
            <Route path="/game" element={<Game />} />
            <Route path="/game/:roomId" element={<Game />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/edit" element={<ProfileEdit />} />
            <Route path="/history" element={<GameHistory />} />
          </Route>

          {/* Anything else — a typo or a stale bookmark — rendered a blank
              page under the Navbar before this existed. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
