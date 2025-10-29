import React, { useState } from "react";
import api from "../api";
import { useNavigate } from "react-router-dom";

export default function CreatePlayer() {
  const [form, setForm] = useState({ name: "", username: "", rating: 1200 });
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: name === "rating" ? Number(value) : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/players", form);
      navigate("/players");
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  }

  return (
    <div className="glow-card rounded-md p-6 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">Create Player</h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="text-sm">Name</label>
          <input name="name" required value={form.name} onChange={handleChange}
            className="w-full mt-1 p-2 rounded bg-panel/30" />
        </div>
        <div>
          <label className="text-sm">Username</label>
          <input name="username" required value={form.username} onChange={handleChange}
            className="w-full mt-1 p-2 rounded bg-panel/30" />
        </div>
        <div>
          <label className="text-sm">Rating</label>
          <input name="rating" type="number" value={form.rating} onChange={handleChange}
            className="w-full mt-1 p-2 rounded bg-panel/30" />
        </div>
        <div className="flex justify-end">
          <button type="submit" className="px-4 py-2 bg-glowing text-black rounded" disabled={saving}>
            {saving ? "Saving..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
