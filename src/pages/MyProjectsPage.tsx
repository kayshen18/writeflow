import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  createProject,
  deleteMyProject,
  getMyProjects,
  getSavedUser,
  getUploadUrl,
  type Project,
} from "../lib/api";

function MyProjectsPage() {
  const navigate = useNavigate();

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [errorMessage, setErrorMessage] = useState("");

  async function loadProjects() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const result = await getMyProjects();

      setProjects(result.projects);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load your projects.";

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
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (!getSavedUser()) {
      navigate("/login", {
        replace: true,
      });
      return;
    }

    void loadProjects();
  }, [navigate]);

  async function handleCreateProject(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const finalTitle = title.trim();

    if (!finalTitle) {
      setErrorMessage("Please enter a project title.");
      return;
    }

    try {
      setIsCreating(true);
      setErrorMessage("");

      await createProject(
        finalTitle,
        description.trim(),
      );

      setTitle("");
      setDescription("");
      setIsModalOpen(false);

      await loadProjects();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create the project.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteProject(
    project: Project,
  ) {
    if (deletingProjectId) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${project.title}"? Works inside this project will remain in My Works.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingProjectId(project.id);
      setErrorMessage("");

      await deleteMyProject(project.id);

      setProjects((currentProjects) =>
        currentProjects.filter(
          (currentProject) =>
            currentProject.id !== project.id,
        ),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete the project.",
      );
    } finally {
      setDeletingProjectId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--wf-surface)]">
      <header className="flex min-h-20 flex-wrap items-center gap-3 border-b border-[var(--wf-border)] bg-[var(--wf-nav)] px-8 py-3">
        <Link
          to="/"
          className="font-kranky shrink-0 text-4xl text-[var(--wf-nav-text)] transition hover:text-[var(--wf-save-hover)]"
        >
          WriteFlow
        </Link>

        <nav className="ml-auto flex flex-wrap items-center gap-3">
          <Link
            to="/works"
            className="wf-editor-action"
          >
            My Works
          </Link>

          <Link
            to="/text"
            className="wf-editor-action"
          >
            New Writing
          </Link>

          <Link
            to="/image"
            className="wf-editor-action"
          >
            New Artwork
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--wf-tool)]">
              Your Creative Worlds
            </p>

            <h1 className="mt-3 text-5xl font-bold text-[var(--wf-text)]">
              My Projects
            </h1>

            <p className="mt-3 text-lg text-[var(--wf-neutral-600)]">
              Keep chapters, characters, scenes, artwork and inspiration in one place.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setErrorMessage("");
              setIsModalOpen(true);
            }}
            className="wf-editor-action wf-editor-action--save"
          >
            Create Project
          </button>
        </div>

        {errorMessage && !isModalOpen && (
          <p className="mt-8 rounded-2xl bg-[var(--wf-danger-50)] px-5 py-4 text-[var(--wf-danger-700)]">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <p className="mt-12 text-[var(--wf-neutral-500)]">
            Loading your projects...
          </p>
        ) : projects.length === 0 ? (
          <section className="mt-12 rounded-3xl border-2 border-dashed border-[var(--wf-border)] bg-[var(--wf-surface)] p-12 text-center">
            <p className="text-2xl font-bold text-[var(--wf-text)]">
              Start your first creative world
            </p>

            <p className="mx-auto mt-3 max-w-lg text-[var(--wf-neutral-600)]">
              A project can connect writing, artwork, character cards, scene designs and inspiration.
            </p>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="mt-7 wf-editor-action wf-editor-action--save"
            >
              Create your first project
            </button>
          </section>
        ) : (
          <section className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <article
                key={project.id}
                className="overflow-hidden rounded-3xl border border-[var(--wf-border)] bg-[var(--wf-surface)] shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <Link
                  to={`/projects/${project.id}`}
                  className="block p-7"
                >
                  
                  <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-[var(--wf-subtle)]">
                    {project.cover_path ? (
                      <img
                        src={getUploadUrl(
                          project.cover_path,
                        )}
                        alt={`${project.title} cover`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <span className="font-kranky text-5xl text-[var(--wf-text)]">
                          {project.title
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>

                  <h2 className="mt-6 text-2xl font-bold text-[var(--wf-text)]">
                    {project.title}
                  </h2>

                  <p className="mt-3 line-clamp-3 text-[var(--wf-neutral-600)]">
                    {project.description ||
                      "No project description yet."}
                  </p>

                  <div className="mt-6 flex items-center justify-between text-sm">
                    <span className="font-semibold text-[var(--wf-tool)]">
                      {project.item_count}{" "}
                      {project.item_count === 1
                        ? "item"
                        : "items"}
                    </span>

                    <span className="text-[var(--wf-neutral-400)]">
                      Updated{" "}
                      {new Date(
                        project.updated_at,
                      ).toLocaleDateString("en-US")}
                    </span>
                  </div>
                </Link>

                <div className="border-t border-[var(--wf-neutral-100)] px-7 py-4">
                  <button
                    type="button"
                    onClick={() =>
                      void handleDeleteProject(project)
                    }
                    disabled={
                      deletingProjectId === project.id
                    }
                    className="text-sm font-semibold text-[var(--wf-danger-600)] transition hover:text-[var(--wf-danger-800)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingProjectId === project.id
                      ? "Deleting..."
                      : "Delete Project"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--wf-neutral-950)]/40 p-4">
          <form
            onSubmit={handleCreateProject}
            className="w-full max-w-lg rounded-3xl bg-[var(--wf-surface)] p-8 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-[var(--wf-tool)]">
                  New Creative World
                </p>

                <h2 className="mt-2 text-2xl font-bold text-[var(--wf-text)]">
                  Create Project
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isCreating}
                className="rounded-lg px-3 py-1 text-xl text-[var(--wf-neutral-500)] transition hover:bg-[var(--wf-neutral-100)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <label className="mt-7 block text-sm font-semibold text-[var(--wf-neutral-700)]">
              Project title
              <input
                value={title}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
                maxLength={150}
                autoFocus
                placeholder="For example: The Last Forest"
                className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 font-normal outline-none transition focus:border-[var(--wf-tool)] focus:ring-4 focus:ring-[var(--wf-primary-100)]"
              />
            </label>

            <label className="mt-5 block text-sm font-semibold text-[var(--wf-neutral-700)]">
              Description
              <textarea
                value={description}
                onChange={(event) =>
                  setDescription(event.target.value)
                }
                maxLength={3000}
                rows={5}
                placeholder="What world, story or creative idea are you building?"
                className="mt-2 w-full resize-y rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 font-normal outline-none transition focus:border-[var(--wf-tool)] focus:ring-4 focus:ring-[var(--wf-primary-100)]"
              />
            </label>

            {errorMessage && (
              <p className="mt-5 rounded-xl bg-[var(--wf-danger-50)] px-4 py-3 text-sm text-[var(--wf-danger-700)]">
                {errorMessage}
              </p>
            )}

            <div className="mt-7 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={isCreating}
                className="wf-editor-action"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isCreating}
                className="wf-editor-action wf-editor-action--save"
              >
                {isCreating
                  ? "Creating..."
                  : "Create Project"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default MyProjectsPage;
