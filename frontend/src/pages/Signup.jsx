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
    <div className="flex flex-col items-center justify-center min-h-[80vh] py-8">
      <h1 className="heading-b text-5xl mb-2">NEW PLAYER</h1>
      <p className="tag-b mb-8">pick a name. own it.</p>

      <form onSubmit={handleSubmit} className="card-b w-full max-w-sm space-y-3">
        <div>
          <label className="label-b" htmlFor="su-username">Username</label>
          <input
            id="su-username"
            name="username"
            value={form.username}
            onChange={handleChange}
            placeholder="3-20 chars"
            required
            minLength={3}
            maxLength={20}
            className="input-b"
          />
          {fieldErrors.username && <p className="error-b">{fieldErrors.username}</p>}
        </div>

        <div>
          <label className="label-b" htmlFor="su-email">Email</label>
          <input
            id="su-email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            placeholder="you@somewhere"
            required
            className="input-b"
          />
          {fieldErrors.email && <p className="error-b">{fieldErrors.email}</p>}
        </div>

        <div>
          <label className="label-b" htmlFor="su-name">Display name</label>
          <input
            id="su-name"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="what we call you"
            required
            className="input-b"
          />
        </div>

        <div>
          <label className="label-b" htmlFor="su-password">Password</label>
          <input
            id="su-password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            placeholder="min 8 chars"
            required
            minLength={8}
            className="input-b"
          />
        </div>

        <div>
          <label className="label-b" htmlFor="su-confirm">Confirm password</label>
          <input
            id="su-confirm"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            placeholder="again"
            required
            className="input-b"
          />
          {fieldErrors.confirmPassword && <p className="error-b">{fieldErrors.confirmPassword}</p>}
        </div>

        <button type="submit" disabled={loading} className="btn-b btn-b-primary w-full !mt-5">
          {loading ? "Creating…" : "Create account →"}
        </button>

        <p className="text-xs font-medium text-neutral-500 text-center uppercase tracking-wider">
          Already in?{" "}
          <Link to="/login" className="text-ink font-bold underline decoration-2 underline-offset-2">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
