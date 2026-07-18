import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const from = location.state?.from?.pathname || "/";

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "INVALID_CREDENTIALS" || err.response?.status === 401) {
        setError("Invalid username or password.");
      } else {
        const msg = err.response?.data?.message || "Login failed. Please try again.";
        setError(Array.isArray(msg) ? msg.join(", ") : msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh]">
      <h1 className="heading-b text-5xl mb-2">WELCOME</h1>
      <p className="tag-b mb-8">back to the board</p>

      <form onSubmit={handleLogin} className="card-b w-full max-w-sm space-y-4">
        {error && <p className="error-b">{error}</p>}

        <div>
          <label className="label-b" htmlFor="login-username">Username</label>
          <input
            id="login-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your handle"
            required
            className="input-b"
          />
        </div>

        <div>
          <label className="label-b" htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            className="input-b"
          />
        </div>

        <button type="submit" disabled={loading} className="btn-b btn-b-primary w-full">
          {loading ? "Logging in…" : "Log in →"}
        </button>

        <p className="text-xs font-medium text-neutral-500 text-center uppercase tracking-wider">
          No account?{" "}
          <Link to="/signup" className="text-ink font-bold underline decoration-2 underline-offset-2">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
