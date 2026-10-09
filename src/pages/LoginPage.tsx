import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { loginUser, saveSession } from "../lib/api";

function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");
    setIsLoading(true);

    try {
      const result = await loginUser(email, password);

      // 将 token 和用户资料保存到浏览器本地。
      // 后续访问 My Works、发布作品时会使用这个 token。
      saveSession(result.token, result.user);

      navigate("/");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to log in.",
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

        <h1 className="mt-8 text-center text-3xl font-bold text-[var(--wf-neutral-900)]">
          Welcome back
        </h1>

        <p className="mt-2 text-center text-[var(--wf-neutral-500)]">
          Log in to continue your creative journey.
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-5">
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
              className="login-input mt-2 w-full rounded-xl border px-4 py-3 outline-none"
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
              autoComplete="current-password"
              placeholder="Enter your password"
              className="login-input mt-2 w-full rounded-xl border px-4 py-3 outline-none"
            />
          </div>

          {errorMessage && (
            <p className="rounded-xl bg-[var(--wf-danger-50)] p-3 text-sm text-[var(--wf-danger-700)]">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-[var(--wf-text)] px-5 py-3 font-semibold text-[var(--wf-surface)] transition hover:bg-[var(--wf-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--wf-neutral-500)]">
          Do not have an account?{" "}
          <Link
            to="/signup"
            className="font-medium text-[var(--wf-text)] hover:text-[var(--wf-primary-hover)]"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
