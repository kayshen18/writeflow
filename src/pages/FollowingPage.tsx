import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  getFollowedCreators,
  getUploadUrl,
  type FollowedCreator,
} from "../lib/api";

function FollowingPage() {
  const navigate = useNavigate();

  const [creators, setCreators] = useState<FollowedCreator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadCreators() {
      try {
        const result = await getFollowedCreators();
        setCreators(result.creators);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to load followed creators.";

        if (
          message.includes("logged in") ||
          message.includes("session")
        ) {
          navigate("/login", { replace: true });
          return;
        }

        setErrorMessage(message);
      } finally {
        setIsLoading(false);
      }
    }

    void loadCreators();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[var(--wf-palette-f0fcfa)]">
      <header className="flex min-h-20 items-center border-b border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] px-8 shadow-sm">
        <Link to="/" className="font-kranky text-4xl text-[var(--wf-palette-004239)]">
          WriteFlow
        </Link>

        <Link
          to="/neighborhood"
          className="ml-auto rounded-xl px-4 py-2 font-semibold text-[var(--wf-palette-004239)] hover:bg-[var(--wf-palette-f0fcfa)]"
        >
          Neighborhood
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--wf-palette-69a097)]">
          Your Community
        </p>

        <h1 className="font-kranky mt-3 text-5xl text-[var(--wf-palette-004239)]">
          Following
        </h1>

        <p className="mt-4 text-lg text-[var(--wf-palette-69a097)]">
          Creators whose work you want to keep up with.
        </p>

        {isLoading && (
          <p className="mt-12 text-[var(--wf-neutral-500)]">
            Loading followed creators...
          </p>
        )}

        {errorMessage && (
          <p className="mt-12 rounded-xl bg-[var(--wf-danger-50)] p-4 text-[var(--wf-danger-700)]">
            {errorMessage}
          </p>
        )}

        {!isLoading && !errorMessage && creators.length === 0 && (
          <div className="mt-12 rounded-3xl border-2 border-dashed border-[var(--wf-palette-69a097)]/40 bg-[var(--wf-surface)] p-12 text-center">
            <h2 className="text-2xl font-bold text-[var(--wf-palette-004239)]">
              You are not following anyone yet
            </h2>

            <Link
              to="/neighborhood"
              className="mt-6 inline-block rounded-xl bg-[var(--wf-palette-004239)] px-6 py-3 font-semibold text-[var(--wf-surface)]"
            >
              Discover Creators
            </Link>
          </div>
        )}

        {!isLoading && !errorMessage && creators.length > 0 && (
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {creators.map((creator) => (
              <Link
                key={creator.id}
                to={`/creator/${creator.id}`}
                className="flex items-center gap-5 rounded-3xl bg-[var(--wf-surface)] p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >

                {creator.avatar_path ? (
                  <img
                    src={getUploadUrl(creator.avatar_path)}
                    alt={creator.display_name}
                    className="h-16 w-16 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--wf-palette-d1fdf5)] text-2xl font-bold text-[var(--wf-palette-004239)]">
                    {creator.display_name.charAt(0).toUpperCase()}
                  </span>
                )}

                <div>
                  <h2 className="text-xl font-bold text-[var(--wf-palette-004239)]">
                    {creator.display_name}
                  </h2>

                  <p className="mt-1 line-clamp-2 text-sm text-[var(--wf-neutral-500)]">
                    {creator.bio || "WriteFlow creator"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default FollowingPage;
