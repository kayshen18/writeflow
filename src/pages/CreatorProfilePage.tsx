import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import {
  getCreatorProfile,
  getUploadUrl,
  type CreatorProfile,
  type PublishedWork,
} from "../lib/api";
import UserAvatar from "../components/user/UserAvatar";

function CreatorProfilePage() {
  const { creatorId } = useParams<{ creatorId: string }>();

  const [creator, setCreator] = useState<CreatorProfile | null>(null);
  const [works, setWorks] = useState<PublishedWork[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!creatorId) {
      return;
    }

    async function loadProfile() {
      try {
        const result = await getCreatorProfile(creatorId!);
        setCreator(result.creator);
        setWorks(result.works);
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load creator profile.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadProfile();
  }, [creatorId]);

  if (isLoading) {
    return <p className="p-12 text-[var(--wf-neutral-500)]">Loading creator...</p>;
  }

  if (errorMessage || !creator) {
    return (
      <div className="p-12 text-center">
        <p className="text-[var(--wf-danger-600)]">{errorMessage}</p>
        <Link to="/neighborhood" className="mt-4 inline-block text-[var(--wf-primary-600)]">
          Back to Neighborhood
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--wf-palette-f0fcfa)]">
      <header className="flex min-h-20 items-center border-b bg-[var(--wf-surface)] px-8">
        <Link to="/" className="font-kranky text-4xl text-[var(--wf-palette-004239)]">
          WriteFlow
        </Link>

        <Link to="/neighborhood" className="ml-auto text-[var(--wf-palette-004239)]">
          Neighborhood
        </Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <section className="flex items-center gap-6 rounded-3xl bg-[var(--wf-surface)] p-8 shadow-sm">
          <UserAvatar
            displayName={creator.display_name}
            avatarPath={creator.avatar_path}
            size="xl"
          />

          <div>
            <h1 className="text-4xl font-bold text-[var(--wf-palette-004239)]">
              {creator.display_name}
            </h1>

            <p className="mt-3 text-[var(--wf-neutral-600)]">
              {creator.bio || "WriteFlow creator"}
            </p>
          </div>
        </section>

        <h2 className="mt-12 text-3xl font-bold text-[var(--wf-palette-004239)]">
          Published Works
        </h2>

        {works.length === 0 ? (
          <p className="mt-5 text-[var(--wf-neutral-500)]">
            No published works yet.
          </p>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {works.map((work) => (
              <Link
                key={work.id}
                to={`/work/${work.id}`}
                className="overflow-hidden rounded-3xl bg-[var(--wf-surface)] shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="aspect-[16/9] bg-[var(--wf-neutral-100)]">
                  {work.cover_path ? (
                    <img
                      src={getUploadUrl(work.cover_path)}
                      alt={work.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl">
                      {work.work_type === "drawing" ? "🎨" : "📝"}
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <h3 className="truncate text-xl font-bold text-[var(--wf-neutral-900)]">
                    {work.title}
                  </h3>

                  <p className="mt-2 line-clamp-2 text-sm text-[var(--wf-neutral-500)]">
                    {work.description || "No description provided."}
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

export default CreatorProfilePage;
