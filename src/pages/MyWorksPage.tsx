import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  getMyWorks,
  type MyWork,
} from "../lib/api";

type SlateNode = {
  text?: string;
  children?: SlateNode[];
};

function extractSlateText(
  nodes: SlateNode[],
): string {
  return nodes
    .map((node) => {
      if (typeof node.text === "string") {
        return node.text;
      }

      if (Array.isArray(node.children)) {
        return extractSlateText(node.children);
      }

      return "";
    })
    .join(" ");
}

function createWritingPreview(content: unknown) {
  if (!content) {
    return "This work does not have any content yet.";
  }

  let parsedContent = content;

  if (typeof content === "string") {
    try {
      parsedContent = JSON.parse(content);
    } catch {
      return content.length > 140
        ? `${content.slice(0, 140)}...`
        : content;
    }
  }

  if (Array.isArray(parsedContent)) {
    const text = extractSlateText(
      parsedContent as SlateNode[],
    )
      .replace(/\s+/g, " ")
      .trim();

    if (!text) {
      return "This work does not have any content yet.";
    }

    return text.length > 140
      ? `${text.slice(0, 140)}...`
      : text;
  }

  return "This work does not have any content yet.";
}

function getRoleStyle(
  role: MyWork["access_role"],
) {
  if (role === "owner") {
    return "bg-[var(--wf-success-50)] text-[var(--wf-success-700)]";
  }

  if (role === "editor") {
    return "bg-[var(--wf-primary-50)] text-[var(--wf-primary-700)]";
  }

  return "bg-[var(--wf-warning-50)] text-[var(--wf-warning-700)]";
}

function getRoleText(
  role: MyWork["access_role"],
) {
  if (role === "owner") {
    return "Owner";
  }

  if (role === "editor") {
    return "Editor";
  }

  return "Viewer";
}

function MyWorksPage() {
  const navigate = useNavigate();

  const [works, setWorks] = useState<MyWork[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadWorks() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const result = await getMyWorks();

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
            : "Unable to load your works.";

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

    void loadWorks();

    return () => {
      ignore = true;
    };
  }, [navigate]);

  function getWorkLink(work: MyWork) {
    return work.work_type === "drawing"
      ? `/image/${work.id}`
      : `/text/${work.id}`;
  }

  function getWorkPreview(work: MyWork) {
    if (work.work_type === "drawing") {
      return "Canvas artwork with drawings, images and shapes.";
    }

    return createWritingPreview(work.content_json);
  }

  function getOpenText(work: MyWork) {
    if (work.access_role === "viewer") {
      return "View read-only →";
    }

    if (work.work_type === "drawing") {
      return "Continue drawing →";
    }

    return "Continue writing →";
  }

  return (
    <div className="min-h-screen bg-[var(--wf-neutral-50)]">
      <header className="flex min-h-20 flex-wrap items-center gap-4 border-b border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] px-8 py-3">
        <Link
          to="/"
          className="font-kranky text-4xl text-[var(--wf-neutral-900)] transition hover:text-[var(--wf-primary-600)]"
        >
          WriteFlow
        </Link>

        <div className="ml-auto flex items-center gap-3">
          <Link
            to="/"
            className="rounded-xl px-4 py-2 text-[var(--wf-neutral-600)] transition hover:bg-[var(--wf-neutral-100)]"
          >
            Home
          </Link>

          <Link
            to="/text"
            className="rounded-xl border border-[var(--wf-primary-200)] bg-[var(--wf-primary-50)] px-5 py-2 font-semibold text-[var(--wf-primary-700)] transition hover:bg-[var(--wf-primary-100)]"
          >
            New Writing
          </Link>

          <Link
            to="/image"
            className="rounded-xl bg-[var(--wf-primary-600)] px-5 py-2 font-semibold text-[var(--wf-surface)] transition hover:bg-[var(--wf-primary-700)]"
          >
            New Artwork
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wider text-[var(--wf-primary-600)]">
          Your Library
        </p>

        <h1 className="mt-2 text-4xl font-bold text-[var(--wf-neutral-900)]">
          My Works
        </h1>

        <p className="mt-3 text-[var(--wf-neutral-500)]">
          Continue creating your own work or collaborating with others.
        </p>

        {isLoading && (
          <p className="mt-10 text-[var(--wf-neutral-500)]">
            Loading your works...
          </p>
        )}

        {errorMessage && (
          <p className="mt-10 rounded-xl bg-[var(--wf-danger-50)] p-4 text-[var(--wf-danger-700)]">
            {errorMessage}
          </p>
        )}

        {!isLoading &&
          !errorMessage &&
          works.length === 0 && (
            <div className="mt-10 rounded-3xl border-2 border-dashed border-[var(--wf-neutral-300)] bg-[var(--wf-surface)] p-12 text-center">
              <h2 className="text-2xl font-semibold text-[var(--wf-neutral-900)]">
                No works yet
              </h2>

              <p className="mt-3 text-[var(--wf-neutral-500)]">
                Create your first written work or artwork.
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link
                  to="/text"
                  className="rounded-xl border border-[var(--wf-primary-200)] bg-[var(--wf-primary-50)] px-6 py-3 font-semibold text-[var(--wf-primary-700)] transition hover:bg-[var(--wf-primary-100)]"
                >
                  Create Writing
                </Link>

                <Link
                  to="/image"
                  className="rounded-xl bg-[var(--wf-primary-600)] px-6 py-3 font-semibold text-[var(--wf-surface)] transition hover:bg-[var(--wf-primary-700)]"
                >
                  Create Artwork
                </Link>
              </div>
            </div>
          )}

        {!isLoading &&
          !errorMessage &&
          works.length > 0 && (
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {works.map((work) => (
                <Link
                  key={work.id}
                  to={getWorkLink(work)}
                className="rounded-3xl border border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          work.work_type === "drawing"
                            ? "bg-[var(--wf-secondary-50)] text-[var(--wf-secondary-700)]"
                            : "bg-[var(--wf-primary-50)] text-[var(--wf-primary-700)]",
                        ].join(" ")}
                      >
                        {work.work_type === "drawing"
                          ? "Artwork"
                          : "Writing"}
                      </span>

                      <span
                        className={[
                          "rounded-full px-3 py-1 text-xs font-semibold",
                          getRoleStyle(work.access_role),
                        ].join(" ")}
                      >
                        {getRoleText(work.access_role)}
                      </span>
                    </div>

                    <span className="shrink-0 text-xs text-[var(--wf-neutral-400)]">
                      {new Date(
                        work.updated_at,
                      ).toLocaleDateString("en-US")}
                    </span>
                  </div>

                  <h2 className="mt-5 truncate text-xl font-semibold text-[var(--wf-neutral-900)]">
                    {work.title}
                  </h2>

                  <p className="mt-2 text-sm text-[var(--wf-neutral-500)]">
                    {work.access_role === "owner"
                      ? "Created by you"
                      : `Created by ${work.owner_name}`}
                  </p>

                  <p className="mt-3 line-clamp-3 min-h-16 text-sm leading-6 text-[var(--wf-neutral-500)]">
                    {getWorkPreview(work)}
                  </p>

                  <p className="mt-6 text-sm font-medium text-[var(--wf-primary-600)]">
                    {getOpenText(work)}
                  </p>
                </Link>
              ))}
            </div>
          )}
      </main>
    </div>
  );
}

export default MyWorksPage;
