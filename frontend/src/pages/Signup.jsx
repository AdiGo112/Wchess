import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

export default function SignupPage() {
  const [form, setForm] = useState({ username: "", email: "", name: "", password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { register } = useAuth();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (fieldErrors[e.target.name]) {
      setFieldErrors({ ...fieldErrors, [e.target.name]: "" });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({});

    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    setLoading(true);
    try {
      const { username, email, name, password } = form;
      await register({ username, email, name, password });
      toast.success("Account created! Please log in.");
      navigate("/login");
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === "EMAIL_ALREADY_EXISTS") {
        setFieldErrors({ email: "This email is already registered." });
      } else if (code === "USERNAME_ALREADY_EXISTS") {
        setFieldErrors({ username: "This username is already taken." });
      } else {
        const msg = err.response?.data?.message || "Registration failed. Please try again.";
        toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <form onSubmit={handleSubmit} className="bg-gray-800 p-8 rounded-2xl shadow-lg w-80">
        <h2 className="text-2xl font-bold mb-4 text-center">Sign Up</h2>

        <div className="mb-3">
          <input
            name="username"
            value={form.username}
            onChange={handleChange}
            placeholder="Username (3-20 chars)"
            required
            minLength={3}
            maxLength={20}
            className="w-full p-2 rounded bg-gray-700"
          />
          {fieldErrors.username && (
            <p className="text-red-400 text-xs mt-1">{fieldErrors.username}</p>
          )}
        </div>

        <div className="mb-3">
          <input
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="Email"
            required
            className="w-full p-2 rounded bg-gray-700"
          />
          {fieldErrors.email && (
            <p className="text-red-400 text-xs mt-1">{fieldErrors.email}</p>
          )}
        </div>

        <input
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Display name"
          required
          className="w-full mb-3 p-2 rounded bg-gray-700"
        />

        <input
          name="password"
          type="password"
          value={form.password}
          onChange={handleChange}
          placeholder="Password (min 8 chars)"
          required
          minLength={8}
          className="w-full mb-3 p-2 rounded bg-gray-700"
        />

        <div className="mb-4">
          <input
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            placeholder="Confirm password"
            required
            className="w-full p-2 rounded bg-gray-700"
          />
          {fieldErrors.confirmPassword && (
            <p className="text-red-400 text-xs mt-1">{fieldErrors.confirmPassword}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-900 p-2 rounded font-semibold"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>

        <p className="text-sm text-center mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-400 underline">
            Login
          </Link>
        </p>
      </form>
    </div>
  );
}
