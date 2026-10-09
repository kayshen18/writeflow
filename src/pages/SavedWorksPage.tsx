import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  getSavedWorks,
  getUploadUrl,
  type PublishedWork,
} from "../lib/api";

function SavedWorksPage() {
  const navigate = useNavigate();

  const [works, setWorks] = useState<PublishedWork[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadSavedWorks() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const result = await getSavedWorks();

        if (!ignore) {
          setWorks(result.works);
        }
      } catch (error) {
        if (ignore) {
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Unable to load saved works.";

        if (
          message.includes("logged in") ||
          message.includes("session")
        ) {
          navigate("/login", {
            replace: true,
          });
          return;
        }

        setErrorMessage(message);
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadSavedWorks();

    return () => {
      ignore = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[var(--wf-palette-f0fcfa)]">
      <header className="flex min-h-20 items-center border-b border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] px-8 shadow-sm">
        <Link
          to="/"
          className="font-kranky text-4xl text-[var(--wf-palette-004239)]"
        >
          WriteFlow
        </Link>

        <nav className="ml-auto flex items-center gap-3">
          <Link
            to="/neighborhood"
            className="rounded-xl px-4 py-2 font-medium text-[var(--wf-palette-004239)] hover:bg-[var(--wf-palette-f0fcfa)]"
          >
            Neighborhood
          </Link>

          <Link
            to="/works"
            className="rounded-xl border border-[var(--wf-palette-004239)] bg-[var(--wf-palette-f0fcfa)] px-4 py-2 font-semibold text-[var(--wf-palette-004239)]"
          >
            My Works
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-12">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--wf-palette-69a097)]">
          Your Collection
        </p>

        <h1 className="font-kranky mt-3 text-5xl text-[var(--wf-palette-004239)]">
          Saved Works
        </h1>

        <p className="font-mukta-mahee mt-4 text-lg text-[var(--wf-palette-69a097)]">
          Return to the stories and artworks you want to remember.
        </p>

        {isLoading && (
          <p className="mt-12 text-[var(--wf-neutral-600)]">
            Loading saved works...
          </p>
        )}

        {errorMessage && (
          <div className="mt-12 rounded-2xl border border-[var(--wf-danger-200)] bg-[var(--wf-danger-50)] p-5 text-[var(--wf-danger-700)]">
            {errorMessage}
          </div>
        )}

        {!isLoading && !errorMessage && works.length === 0 && (
          <div className="mt-12 rounded-3xl border-2 border-dashed border-[var(--wf-palette-69a097)]/40 bg-[var(--wf-surface)]/80 p-12 text-center">
            <h2 className="text-2xl font-bold text-[var(--wf-palette-004239)]">
              No saved works yet
            </h2>

            <p className="mt-3 text-[var(--wf-palette-69a097)]">
              Explore the Neighborhood and save works you like.
            </p>

            <Link
              to="/neighborhood"
              className="mt-6 inline-block rounded-xl bg-[var(--wf-palette-004239)] px-6 py-3 font-semibold text-[var(--wf-surface)] transition hover:bg-[var(--wf-palette-69a097)]"
            >
              Explore Neighborhood
            </Link>
          </div>
        )}

        {!isLoading && !errorMessage && works.length > 0 && (
          <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {works.map((work) => (
              <Link
                key={work.id}
                to={`/work/${work.id}`}
                className="group overflow-hidden rounded-3xl bg-[var(--wf-surface)] shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="aspect-[16/9] overflow-hidden bg-gradient-to-br from-[var(--wf-primary-100)] to-[var(--wf-secondary-100)]">
                  {work.cover_path ? (
                    <img
                      src={getUploadUrl(work.cover_path)}
                      alt={`${work.title} cover`}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-6xl">
                      {work.work_type === "drawing" ? "🎨" : "📝"}
                    </div>
                  )}
                </div>

                <div className="p-6">
                  <span className="rounded-full bg-[var(--wf-primary-50)] px-3 py-1 text-xs font-semibold text-[var(--wf-primary-700)]">
                    {work.work_type === "drawing"
                      ? "Artwork"
                      : "Writing"}
                  </span>

                  <h2 className="mt-4 truncate text-2xl font-bold text-[var(--wf-neutral-900)]">
                    {work.title}
                  </h2>

                  <p className="mt-1 text-sm text-[var(--wf-palette-69a097)]">
                    by {work.author_name || "WriteFlow Creator"}
                  </p>

                  <p className="mt-3 line-clamp-3 min-h-16 text-sm leading-6 text-[var(--wf-neutral-500)]">
                    {work.description || "No description provided."}
                  </p>

                  <p className="mt-5 font-semibold text-[var(--wf-palette-004239)]">
                    View work →
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

export default SavedWorksPage;
