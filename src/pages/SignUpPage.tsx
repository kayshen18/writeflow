import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { registerUser } from "../lib/api";

function SignUpPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setMessage("");
    setIsLoading(true);

    try {
      await registerUser(email, password, displayName);

      setMessage("Account created successfully. Redirecting to login...");

      // 注册不等于登录；这里让用户使用刚创建的账号登录。
      window.setTimeout(() => {
        navigate("/login");
      }, 1200);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to create account.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--wf-surface)]">
      <div className="w-full max-w-md rounded-3xl border border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] p-10 shadow-xl">
        <Link
          to="/"
          className="font-kranky block text-center text-5xl text-[var(--wf-neutral-900)]"
        >
          WriteFlow
        </Link>

        <h1 className="mt-8 text-center text-2xl font-bold text-[var(--wf-neutral-900)]">
          Create your account
        </h1>

        <p className="mt-2 text-center text-[var(--wf-neutral-500)]">
          Start creating your stories and worlds.
        </p>

        <form onSubmit={handleSignUp} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="displayName"
              className="text-sm font-medium text-[var(--wf-neutral-700)]"
            >
              Display name
            </label>

            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              placeholder="Your name"
              className="mt-2 w-full rounded-xl border border-[var(--wf-text)] px-4 py-3 outline-none transition focus:border-[var(--wf-primary-hover)] focus:ring-4 focus:ring-[var(--wf-primary-hover)]/25"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="text-sm font-medium text-[var(--wf-neutral-700)]"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="mt-2 w-full rounded-xl border border-[var(--wf-text)] px-4 py-3 outline-none transition focus:border-[var(--wf-primary-hover)] focus:ring-4 focus:ring-[var(--wf-primary-hover)]/25"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="text-sm font-medium text-[var(--wf-neutral-700)]"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              className="mt-2 w-full rounded-xl border border-[var(--wf-text)] px-4 py-3 outline-none transition focus:border-[var(--wf-primary-hover)] focus:ring-4 focus:ring-[var(--wf-primary-hover)]/25"
            />
          </div>

          {message && (
            <p className="rounded-xl bg-[var(--wf-neutral-100)] p-3 text-sm text-[var(--wf-neutral-700)]">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-[var(--wf-text)] px-5 py-3 font-semibold text-[var(--wf-surface)] transition hover:bg-[var(--wf-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--wf-neutral-500)]">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-[var(--wf-text)] hover:text-[var(--wf-primary-hover)]"
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

export default SignUpPage;
