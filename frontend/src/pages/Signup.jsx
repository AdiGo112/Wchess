import React, { useState } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function SignupPage() {
  const [form, setForm] = useState({ username: "", email: "", name: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/auth/register", form);
      await login(res.data);
      navigate("/");
    } catch (err) {
      const msg = err.response?.data?.message || "Registration failed";
      setError(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <form onSubmit={handleSubmit} className="bg-gray-800 p-8 rounded-2xl shadow-lg w-80">
        <h2 className="text-2xl font-bold mb-4 text-center">Sign Up</h2>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <input name="username" value={form.username} onChange={handleChange}
          placeholder="Username (3-20 chars)" required minLength={3} maxLength={20}
          className="w-full mb-3 p-2 rounded bg-gray-700" />
        <input name="email" type="email" value={form.email} onChange={handleChange}
          placeholder="Email" required
          className="w-full mb-3 p-2 rounded bg-gray-700" />
        <input name="name" value={form.name} onChange={handleChange}
          placeholder="Display name" required
          className="w-full mb-3 p-2 rounded bg-gray-700" />
        <input name="password" type="password" value={form.password} onChange={handleChange}
          placeholder="Password (min 8 chars)" required minLength={8}
          className="w-full mb-4 p-2 rounded bg-gray-700" />

        <button type="submit" disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 p-2 rounded font-semibold">
          {loading ? "Creating account..." : "Create Account"}
        </button>

        <p className="text-sm text-center mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-400 underline">Login</Link>
        </p>
      </form>
    </div>
  );
}
