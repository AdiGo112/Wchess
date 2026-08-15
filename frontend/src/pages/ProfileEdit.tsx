import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import api from "../api";

/** Mirrors UpdateProfileDto on the backend (name 50, bio 300, country 2). */
const LIMITS = { name: 50, bio: 300, country: 2 };

export default function ProfileEdit() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await api.patch("/users/me", {
        name: name.trim(),
        bio: bio.trim() || undefined,
        country: country.trim().toUpperCase() || undefined,
      });
      toast.success("Profile saved");
      navigate("/profile");
    } catch {
      toast.error("Couldn't save your profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto py-4">
      <h1 className="heading-b text-4xl text-center mb-2">EDIT PROFILE</h1>
      <p className="text-center mb-10">
        <span className="tag-b">@{user.username} is permanent. the rest isn't.</span>
      </p>

      <form onSubmit={submit} className="card-b flex flex-col gap-5">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest">Display name</span>
          <input
            className="input-b"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.name}
            required
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest">
            Bio
            <span className="ml-2 font-mono text-neutral-500">
              {bio.length}/{LIMITS.bio}
            </span>
          </span>
          <textarea
            className="input-b resize-none"
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={LIMITS.bio}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-widest">
            Country code
          </span>
          <input
            className="input-b uppercase"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            maxLength={LIMITS.country}
            placeholder="IN"
          />
        </label>

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="btn-b btn-b-primary flex-1">
            {saving ? (
              <>
                Saving<span className="animate-blink">_</span>
              </>
            ) : (
              "Save"
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate("/profile")}
            className="btn-b flex-1"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
