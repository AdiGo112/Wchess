import React, { useState } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [username, setUsername] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/players/login", { username });
      login(res.data);
      navigate("/");
    } catch (err) {
      console.error(err);
      if (err.response?.status === 404) alert("No such user found");
      else alert("Login failed");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h1 className="text-3xl mb-6 font-bold">Login</h1>
      <form
        onSubmit={handleLogin}
        className="bg-gray-800 p-6 rounded-lg shadow-lg w-80"
      >
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Enter your username"
          className="w-full p-2 mb-4 rounded bg-gray-700 text-white"
        />
        <button
          type="submit"
          className="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold"
        >
          Login
        </button>

        {/* 🔗 Signup Link */}
        <p className="mt-4 text-sm text-gray-400 text-center">
          Don’t have an account?{" "}
          <Link
            to="/signup"
            className="text-blue-400 hover:underline font-medium"
          >
            Sign up here
          </Link>
        </p>
      </form>
    </div>
  );
}
