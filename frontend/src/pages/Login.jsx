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
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h1 className="text-3xl mb-6 font-bold">Login</h1>
      <form onSubmit={handleLogin} className="bg-gray-800 p-6 rounded-lg shadow-lg w-80">
        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          required
          className="w-full p-2 mb-3 rounded bg-gray-700 text-white"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          required
          className="w-full p-2 mb-4 rounded bg-gray-700 text-white"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 py-2 rounded font-semibold"
        >
          {loading ? "Logging in..." : "Login"}
        </button>
        <p className="mt-4 text-sm text-gray-400 text-center">
          Don't have an account?{" "}
          <Link to="/signup" className="text-blue-400 hover:underline font-medium">
            Sign up here
          </Link>
        </p>
      </form>
    </div>
  );
}
