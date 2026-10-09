import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  getMyProfile,
  getUploadUrl,
  updateMyProfile,
  uploadWorkImages,
} from "../lib/api";

function ProfilePage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const result = await getMyProfile();

        setEmail(result.user.email);
        setDisplayName(result.user.display_name);
        setBio(result.user.bio || "");
        setAvatarPath(result.user.avatar_path);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "";

        if (
          errorMessage.includes("logged in") ||
          errorMessage.includes("session")
        ) {
          navigate("/login", { replace: true });
          return;
        }

        setMessage("Unable to load profile.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadProfile();
  }, [navigate]);

  async function handleAvatarUpload(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setMessage("Please select an image file.");
      return;
    }

    setIsUploading(true);

    try {
      const result = await uploadWorkImages([file]);
      const avatar = result.images[0];

      if (!avatar) {
        throw new Error("Avatar upload failed.");
      }

      setAvatarPath(avatar.filePath);
      setMessage("Avatar selected. Click Save Profile to keep it.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to upload avatar.",
      );
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setMessage("");

    try {
      await updateMyProfile({
        displayName,
        bio,
        avatarPath,
      });

      localStorage.setItem(
        "writeflow_user",
        JSON.stringify({
          id: JSON.parse(
            localStorage.getItem("writeflow_user") || "{}",
          ).id,
          email,
          displayName,
          avatarPath,
        }),
      );

      window.dispatchEvent(
        new Event("writeflow-user-updated"),
      );

      setMessage("Profile saved successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--wf-neutral-500)]">
        Loading profile...
      </div>
    );
  }

  const avatarText = displayName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-[var(--wf-palette-f0fcfa)]">
      <header className="flex min-h-20 items-center border-b border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] px-8 shadow-sm">
        <Link to="/" className="font-kranky text-4xl text-[var(--wf-palette-004239)]">
          WriteFlow
        </Link>

        <Link
          to="/works"
          className="ml-auto rounded-xl px-4 py-2 font-semibold text-[var(--wf-palette-004239)] hover:bg-[var(--wf-palette-f0fcfa)]"
        >
          My Works
        </Link>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-kranky text-5xl text-[var(--wf-palette-004239)]">
          Personal Information
        </h1>

        <div className="mt-8 rounded-3xl bg-[var(--wf-surface)] p-8 shadow-sm">
          <div className="flex items-center gap-5">
            {avatarPath ? (
              <img
                src={getUploadUrl(avatarPath)}
                alt="Profile avatar"
                className="h-24 w-24 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-[var(--wf-palette-d1fdf5)] text-3xl font-bold text-[var(--wf-palette-004239)]">
                {avatarText}
              </span>
            )}

            <label className="cursor-pointer rounded-xl border border-[var(--wf-palette-004239)] px-4 py-2 font-semibold text-[var(--wf-palette-004239)]">
              {isUploading ? "Uploading..." : "Change Avatar"}

              <input
                type="file"
                accept="image/*"
                disabled={isUploading}
                onChange={(event) =>
                  void handleAvatarUpload(event)
                }
                className="hidden"
              />
            </label>
          </div>

          <label className="mt-8 block text-sm font-semibold text-[var(--wf-neutral-700)]">
            Display Name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={80}
              className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 outline-none focus:border-[var(--wf-palette-004239)]"
            />
          </label>

          <label className="mt-6 block text-sm font-semibold text-[var(--wf-neutral-700)]">
            Email
            <input
              value={email}
              disabled
              className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-200)] bg-[var(--wf-neutral-100)] px-4 py-3 text-[var(--wf-neutral-500)]"
            />
          </label>

          <label className="mt-6 block text-sm font-semibold text-[var(--wf-neutral-700)]">
            Bio
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={500}
              rows={5}
              className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 outline-none focus:border-[var(--wf-palette-004239)]"
              placeholder="Tell the community about yourself."
            />
          </label>

          {message && (
            <p className="mt-5 rounded-xl bg-[var(--wf-palette-f0fcfa)] p-4 text-sm text-[var(--wf-palette-004239)]">
              {message}
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || isUploading}
            className="mt-6 rounded-xl bg-[var(--wf-palette-004239)] px-6 py-3 font-semibold text-[var(--wf-surface)] disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </main>
    </div>
  );
}

export default ProfilePage;
