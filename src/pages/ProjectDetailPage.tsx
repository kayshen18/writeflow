import { useEffect, useMemo, useState } from "react";
import type {
  ChangeEvent,
  FormEvent,
} from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "react-router";
import {
  addWorkToProject,
  getMyProject,
  getMyWorks,
  getSavedUser,
  getUploadUrl,
  updateProjectCover,
  uploadWorkImages,
  removeWorkFromProject,
  reorderProjectItems,
  updateMyProject,
  updateProjectItemRole,
  unpublishMyProject,
  type MyWork,
  type ProjectDetail,
  type ProjectItem,
  type ProjectItemRole,
} from "../lib/api";
import NotificationBell from "../components/notifications/NotificationBell";
import PublishProjectModal from "../components/publish/PublishProjectModal";

const projectRoles: Array<{
  value: ProjectItemRole;
  label: string;
  description: string;
}> = [
  {
    value: "chapter",
    label: "Chapter",
    description: "A writing chapter or section",
  },
  {
    value: "character",
    label: "Character",
    description: "A character profile or card",
  },
  {
    value: "scene",
    label: "Scene",
    description: "A scene illustration or setting",
  },
  {
    value: "cover",
    label: "Cover",
    description: "A cover design or key visual",
  },
  {
    value: "inspiration",
    label: "Inspiration",
    description: "A note, reference or idea",
  },
  {
    value: "other",
    label: "Other",
    description: "Any other project material",
  },
];

function getRoleLabel(role: ProjectItemRole) {
  return (
    projectRoles.find(
      (projectRole) => projectRole.value === role,
    )?.label ?? "Other"
  );
}

function ProjectDetailPage() {
  const navigate = useNavigate();

  const { projectId } = useParams<{
    projectId: string;
  }>();

  const projectQuery = projectId
    ? `?projectId=${encodeURIComponent(projectId)}`
    : "";

  const [project, setProject] =
    useState<ProjectDetail | null>(null);

  const [items, setItems] = useState<ProjectItem[]>([]);
  const [works, setWorks] = useState<MyWork[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isAddingWork, setIsAddingWork] = useState(false);
  const [removingItemId, setRemovingItemId] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [updatingRoleItemId, setUpdatingRoleItemId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);
  const [isUpdatingProject, setIsUpdatingProject] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [selectedWorkId, setSelectedWorkId] = useState("");
  const [selectedRole, setSelectedRole] = useState<ProjectItemRole>("chapter");
  const [errorMessage, setErrorMessage] = useState("");

  function getProjectTags() {
    if (!project) return [];
    if (Array.isArray(project.tags)) return project.tags;
    try {
      const parsed = JSON.parse(project.tags) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((tag): tag is string => typeof tag === "string")
        : [];
    } catch {
      return [];
    }
  }

  async function handleUnpublish() {
    if (!projectId || !window.confirm("Remove this project from Neighborhood?")) return;
    setIsUnpublishing(true);
    setErrorMessage("");
    try {
      await unpublishMyProject(projectId);
      await loadProject();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to unpublish this project.");
    } finally {
      setIsUnpublishing(false);
    }
  }

  async function loadProject() {
    if (!projectId) {
      return;
    }

    try {
      setIsLoading(true);
      setErrorMessage("");

      const [projectResult, worksResult] =
        await Promise.all([
          getMyProject(projectId),
          getMyWorks(),
        ]);

      setProject(projectResult.project);
      setItems(projectResult.items);
      setWorks(worksResult.works);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load this project.";

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

    void loadProject();
  }, [projectId, navigate]);

  const availableWorks = useMemo(() => {
    const user = getSavedUser();

    if (!user) {
      return [];
    }

    const addedWorkIds = new Set(
      items.map((item) => item.work_id),
    );

    return works.filter(
      (work) =>
        work.author_id === user.id &&
        !addedWorkIds.has(work.id),
    );
  }, [items, works]);

  async function handleAddWork(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!projectId || !selectedWorkId) {
      setErrorMessage("Please select a work.");
      return;
    }

    try {
      setIsAddingWork(true);
      setErrorMessage("");

      await addWorkToProject(
        projectId,
        selectedWorkId,
        selectedRole,
      );

      setSelectedWorkId("");
      setSelectedRole("chapter");
      setIsAddModalOpen(false);

      await loadProject();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to add this work to the project.",
      );
    } finally {
      setIsAddingWork(false);
    }
  }

  async function handleRemoveItem(
    item: ProjectItem,
  ) {
    if (!projectId || removingItemId) {
      return;
    }

    const confirmed = window.confirm(
      `Remove "${item.work_title}" from this project? The original work will remain in My Works.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setRemovingItemId(item.project_item_id);
      setErrorMessage("");

      await removeWorkFromProject(
        projectId,
        item.project_item_id,
      );

      setItems((currentItems) =>
        currentItems.filter(
          (currentItem) =>
            currentItem.project_item_id !==
            item.project_item_id,
        ),
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to remove this work from the project.",
      );
    } finally {
      setRemovingItemId(null);
    }
  }

  async function handleMoveItem(
    itemId: string,
    direction: "up" | "down",
  ) {
    if (!projectId || isReordering) {
      return;
    }

    const currentIndex = items.findIndex(
      (item) =>
        item.project_item_id === itemId,
    );

    if (currentIndex === -1) {
      return;
    }

    const targetIndex =
      direction === "up"
        ? currentIndex - 1
        : currentIndex + 1;

    if (
      targetIndex < 0 ||
      targetIndex >= items.length
    ) {
      return;
    }

    const previousItems = [...items];
    const reorderedItems = [...items];

    const currentItem =
      reorderedItems[currentIndex];

    reorderedItems[currentIndex] =
      reorderedItems[targetIndex];

    reorderedItems[targetIndex] =
      currentItem;

    const itemsWithNewOrder =
      reorderedItems.map(
        (item, index) => ({
          ...item,
          sort_order: index,
        }),
      );

    /*
     * Update the screen immediately.
     * If the API fails, restore the old order.
     */
    setItems(itemsWithNewOrder);

    try {
      setIsReordering(true);
      setErrorMessage("");

      await reorderProjectItems(
        projectId,
        itemsWithNewOrder.map(
          (item) =>
            item.project_item_id,
        ),
      );
    } catch (error) {
      setItems(previousItems);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to reorder project items.",
      );
    } finally {
      setIsReordering(false);
    }
  }

  async function handleUpdateItemRole(
    item: ProjectItem,
    nextRole: ProjectItemRole,
  ) {
    if (
      !projectId ||
      updatingRoleItemId ||
      nextRole === item.item_role
    ) {
      return;
    }

    const previousRole = item.item_role;

    /*
     * Optimistic update:
     * immediately update the screen.
     */
    setItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.project_item_id ===
        item.project_item_id
          ? {
              ...currentItem,
              item_role: nextRole,
            }
          : currentItem,
      ),
    );

    try {
      setUpdatingRoleItemId(
        item.project_item_id,
      );

      setErrorMessage("");

      await updateProjectItemRole(
        projectId,
        item.project_item_id,
        nextRole,
      );
    } catch (error) {
      /*
       * Restore the old role if saving fails.
       */
      setItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.project_item_id ===
          item.project_item_id
            ? {
                ...currentItem,
                item_role: previousRole,
              }
            : currentItem,
        ),
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update the project item role.",
      );
    } finally {
      setUpdatingRoleItemId(null);
    }
  }

  async function handleUpdateProject(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!project || !projectId) {
      return;
    }

    const finalTitle = editTitle.trim();

    if (!finalTitle) {
      setErrorMessage("Please enter a project title.");
      return;
    }

    try {
      setIsUpdatingProject(true);
      setErrorMessage("");

      await updateMyProject(
        projectId,
        finalTitle,
        editDescription.trim(),
      );

      setProject((currentProject) =>
        currentProject
          ? {
              ...currentProject,
              title: finalTitle,
              description: editDescription.trim(),
              updated_at: new Date().toISOString(),
            }
          : null,
      );

      setIsEditModalOpen(false);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update the project.",
      );
    } finally {
      setIsUpdatingProject(false);
    }
  }

  async function handleCoverUpload(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file || !projectId) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setErrorMessage(
        "Please choose a supported image file.",
      );
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage(
        "The cover image must be smaller than 10 MB.",
      );
      return;
    }

    try {
      setIsUploadingCover(true);
      setErrorMessage("");

      const uploadResult =
        await uploadWorkImages([file]);

      const uploadedImage =
        uploadResult.images[0];

      if (!uploadedImage) {
        throw new Error(
          "The cover image was not uploaded.",
        );
      }

      await updateProjectCover(
        projectId,
        uploadedImage.filePath,
      );

      setProject((currentProject) =>
        currentProject
          ? {
              ...currentProject,
              cover_path:
                uploadedImage.filePath,
              updated_at:
                new Date().toISOString(),
            }
          : null,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to upload the project cover.",
      );
    } finally {
      setIsUploadingCover(false);
    }
  }

  async function handleRemoveCover() {
    if (
      !projectId ||
      !project?.cover_path ||
      isUploadingCover
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Remove this project cover?",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsUploadingCover(true);
      setErrorMessage("");

      await updateProjectCover(
        projectId,
        null,
      );

      setProject((currentProject) =>
        currentProject
          ? {
              ...currentProject,
              cover_path: null,
              updated_at:
                new Date().toISOString(),
            }
          : null,
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to remove the project cover.",
      );
    } finally {
      setIsUploadingCover(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wf-surface)] text-[var(--wf-neutral-500)]">
        Loading project...
      </div>
    );
  }

  if (errorMessage && !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--wf-surface)] px-6 text-center">
        <p className="text-[var(--wf-danger-700)]">{errorMessage}</p>

        <Link
          to="/projects"
          className="mt-5 font-semibold text-[var(--wf-tool)]"
        >
          Back to My Projects
        </Link>
      </div>
    );
  }

  if (!project) {
    return null;
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
            to="/projects"
            className="wf-editor-action"
          >
            My Projects
          </Link>

          <Link
            to="/works"
            className="wf-editor-action"
          >
            My Works
          </Link>

          <NotificationBell />
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        <Link
          to="/projects"
          className="text-sm font-semibold text-[var(--wf-tool)] transition hover:text-[var(--wf-tool)]"
        >
          ← Back to My Projects
        </Link>

        <section className="mt-6 overflow-hidden rounded-3xl border border-[var(--wf-border)] bg-[var(--wf-surface)] shadow-sm">
          <div className="relative aspect-[3/1] min-h-56 bg-[var(--wf-subtle)]">
            {project.cover_path ? (
              <img
                src={getUploadUrl(
                  project.cover_path,
                )}
                alt={`${project.title} cover`}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full min-h-56 items-center justify-center px-6 text-center">
                <div>
                  <p className="font-kranky text-4xl text-[var(--wf-text)]">
                    {project.title}
                  </p>

                  <p className="mt-3 text-sm text-[var(--wf-tool)]">
                    Add a cover image for this creative world.
                  </p>
                </div>
              </div>
            )}

            {isUploadingCover && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--wf-neutral-950)]/50 font-semibold text-[var(--wf-surface)]">
                Uploading cover...
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
            <div>
              <p className="font-semibold text-[var(--wf-text)]">
                Project Cover
              </p>

              <p className="mt-1 text-sm text-[var(--wf-neutral-500)]">
                JPG, PNG or WebP, up to 10 MB.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setIsPublishModalOpen(true)}
                className="wf-editor-action"
              >
                {project.is_published ? "Update Publication" : "Publish Project"}
              </button>

              {project.is_published && (
                <button
                  type="button"
                  onClick={() => void handleUnpublish()}
                  disabled={isUnpublishing}
                  className="wf-editor-action wf-editor-action--discard"
                >
                  {isUnpublishing ? "Unpublishing..." : "Unpublish"}
                </button>
              )}
              {project.cover_path && (
                <button
                  type="button"
                  onClick={() =>
                    void handleRemoveCover()
                  }
                  disabled={isUploadingCover}
                  className="wf-editor-action wf-editor-action--discard"
                >
                  Remove Cover
                </button>
              )}

              <label
                className={[
                  "wf-editor-action cursor-pointer",
                  isUploadingCover
                    ? "pointer-events-none opacity-50"
                    : "",
                ].join(" ")}
              >
                {project.cover_path
                  ? "Change Cover"
                  : "Upload Cover"}

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) =>
                    void handleCoverUpload(event)
                  }
                  disabled={isUploadingCover}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-[var(--wf-border)] bg-[var(--wf-surface)] p-8 text-[var(--wf-text)] shadow-sm sm:p-12">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--wf-tool)]">
            Creative Project
          </p>

          <div className="mt-5 flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <h1 className="text-5xl font-bold">
                {project.title}
              </h1>

              <p className="mt-5 whitespace-pre-wrap text-lg leading-8 text-[var(--wf-muted)]">
                {project.description ||
                  "No project description yet."}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                to={`/text?projectId=${encodeURIComponent(
                  projectId ?? "",
                )}&projectRole=chapter`}
                className="wf-editor-action"
              >
                New Writing
              </Link>

              <Link
                to={`/image?projectId=${encodeURIComponent(
                  projectId ?? "",
                )}&projectRole=scene`}
                className="wf-editor-action"
              >
                New Artwork
              </Link>

              <button
                type="button"
                onClick={() => {
                  setErrorMessage("");
                  setEditTitle(project.title);
                  setEditDescription(project.description);
                  setIsEditModalOpen(true);
                }}
                className="wf-editor-action"
              >
                Edit Project
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMessage("");
                  setSelectedWorkId(
                    availableWorks[0]?.id ?? "",
                  );
                  setIsAddModalOpen(true);
                }}
                className="wf-editor-action"
              >
                Add Existing Work
              </button>
            </div>
          </div>
        </section>

        {errorMessage && (
          <p className="mt-7 rounded-2xl bg-[var(--wf-danger-50)] px-5 py-4 text-[var(--wf-danger-700)]">
            {errorMessage}
          </p>
        )}

        <section className="mt-12">
          <div className="flex items-end justify-between gap-5">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--wf-tool)]">
                Project Materials
              </p>

              <h2 className="mt-2 text-3xl font-bold text-[var(--wf-text)]">
                {items.length}{" "}
                {items.length === 1 ? "item" : "items"}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => {
                setErrorMessage("");
                setSelectedWorkId(
                  availableWorks[0]?.id ?? "",
                );
                setIsAddModalOpen(true);
              }}
              className="font-semibold text-[var(--wf-tool)] transition hover:text-[var(--wf-tool)]"
            >
              + Add work
            </button>
          </div>

          {items.length === 0 ? (
            <div className="mt-7 rounded-3xl border-2 border-dashed border-[var(--wf-border)] bg-[var(--wf-surface)] p-12 text-center">
              <p className="text-xl font-bold text-[var(--wf-text)]">
                This world is ready for its first piece.
              </p>

              <p className="mt-3 text-[var(--wf-neutral-600)]">
                Add an existing chapter, character card, scene or artwork.
              </p>

              <button
                type="button"
                onClick={() => {
                  setSelectedWorkId(
                    availableWorks[0]?.id ?? "",
                  );
                  setIsAddModalOpen(true);
                }}
                className="mt-7 wf-editor-action wf-editor-action--save"
              >
                Add Existing Work
              </button>
            </div>
          ) : (
            <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item, index) => (
                <article
                  key={item.project_item_id}
                  className="overflow-hidden rounded-3xl border border-[var(--wf-border)] bg-[var(--wf-surface)] shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <Link
                    to={
                      item.work_type === "drawing"
                        ? `/image/${item.work_id}${projectQuery}`
                        : `/text/${item.work_id}${projectQuery}`
                    }
                    className="group block p-6"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="rounded-full bg-[var(--wf-subtle)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--wf-text)]">
                        {getRoleLabel(item.item_role)}
                      </span>

                      <span className="text-sm font-semibold text-[var(--wf-neutral-400)]">
                        {item.work_type === "drawing"
                          ? "Artwork"
                          : "Writing"}
                      </span>
                    </div>

                    <h3 className="mt-7 text-2xl font-bold text-[var(--wf-text)] transition group-hover:text-[var(--wf-tool)]">
                      {item.work_title}
                    </h3>

                    <p className="mt-4 text-sm text-[var(--wf-neutral-500)]">
                      Last edited{" "}
                      {new Date(
                        item.work_updated_at,
                      ).toLocaleDateString("en-US")}
                    </p>

                    <p className="mt-7 font-semibold text-[var(--wf-tool)]">
                      Open work →
                    </p>
                  </Link>

                  <div className="border-t border-[var(--wf-neutral-100)] px-6 py-4">
                    <label className="block text-xs font-bold uppercase tracking-wide text-[var(--wf-neutral-500)]">
                      Role in project

                      <select
                        value={item.item_role}
                        onChange={(event) =>
                          void handleUpdateItemRole(
                            item,
                            event.target
                              .value as ProjectItemRole,
                          )
                        }
                        disabled={
                          updatingRoleItemId ===
                            item.project_item_id ||
                          isReordering ||
                          removingItemId !== null
                        }
                        className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[var(--wf-text)] outline-none transition focus:border-[var(--wf-tool)] focus:ring-4 focus:ring-[var(--wf-primary-100)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {projectRoles.map((role) => (
                          <option
                            key={role.value}
                            value={role.value}
                          >
                            {role.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {updatingRoleItemId ===
                      item.project_item_id && (
                      <p className="mt-2 text-xs text-[var(--wf-tool)]">
                        Saving role...
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void handleMoveItem(
                              item.project_item_id,
                              "up",
                            )
                          }
                          disabled={
                            index === 0 ||
                            isReordering ||
                            removingItemId !== null ||
                            updatingRoleItemId !== null
                          }
                          className="rounded-lg border border-[var(--wf-neutral-200)] px-3 py-1.5 text-sm font-semibold text-[var(--wf-neutral-600)] transition hover:bg-[var(--wf-neutral-50)] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          Move Up
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void handleMoveItem(
                              item.project_item_id,
                              "down",
                            )
                          }
                          disabled={
                            index ===
                              items.length - 1 ||
                            isReordering ||
                            removingItemId !== null ||
                            updatingRoleItemId !== null
                          }
                          className="rounded-lg border border-[var(--wf-neutral-200)] px-3 py-1.5 text-sm font-semibold text-[var(--wf-neutral-600)] transition hover:bg-[var(--wf-neutral-50)] disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          Move Down
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          void handleRemoveItem(item)
                        }
                        disabled={
                          removingItemId ===
                            item.project_item_id ||
                          isReordering ||
                          updatingRoleItemId !== null
                        }
                        className="text-sm font-semibold text-[var(--wf-danger-600)] transition hover:text-[var(--wf-danger-800)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {removingItemId ===
                        item.project_item_id
                          ? "Removing..."
                          : "Remove"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--wf-neutral-950)]/40 p-4">
          <form
            onSubmit={handleAddWork}
            className="w-full max-w-lg rounded-3xl bg-[var(--wf-surface)] p-8 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-[var(--wf-tool)]">
                  Project Material
                </p>

                <h2 className="mt-2 text-2xl font-bold text-[var(--wf-text)]">
                  Add Existing Work
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                disabled={isAddingWork}
                className="rounded-lg px-3 py-1 text-xl text-[var(--wf-neutral-500)] transition hover:bg-[var(--wf-neutral-100)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {availableWorks.length === 0 ? (
              <div className="mt-7 rounded-2xl bg-[var(--wf-neutral-50)] p-6 text-center">
                <p className="font-semibold text-[var(--wf-neutral-700)]">
                  No available works to add.
                </p>

                <p className="mt-2 text-sm text-[var(--wf-neutral-500)]">
                  Create a new writing piece or artwork first, or remove an existing project item.
                </p>

                <div className="mt-6 flex justify-center gap-3">
                  <Link
                    to={`/text?projectId=${encodeURIComponent(
                      projectId ?? "",
                    )}&projectRole=chapter`}
                    className="wf-editor-action"
                  >
                    New Writing
                  </Link>

                  <Link
                    to={`/image?projectId=${encodeURIComponent(
                      projectId ?? "",
                    )}&projectRole=scene`}
                    className="wf-editor-action wf-editor-action--save"
                  >
                    New Artwork
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <label className="mt-7 block text-sm font-semibold text-[var(--wf-neutral-700)]">
                  Work
                  <select
                    value={selectedWorkId}
                    onChange={(event) =>
                      setSelectedWorkId(event.target.value)
                    }
                    className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] bg-[var(--wf-surface)] px-4 py-3 font-normal outline-none transition focus:border-[var(--wf-tool)] focus:ring-4 focus:ring-[var(--wf-primary-100)]"
                  >
                    {availableWorks.map((work) => (
                      <option key={work.id} value={work.id}>
                        {work.work_type === "drawing"
                          ? "[Artwork] "
                          : "[Writing] "}
                        {work.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mt-5 block text-sm font-semibold text-[var(--wf-neutral-700)]">
                  Role in this project
                  <select
                    value={selectedRole}
                    onChange={(event) =>
                      setSelectedRole(
                        event.target.value as ProjectItemRole,
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] bg-[var(--wf-surface)] px-4 py-3 font-normal outline-none transition focus:border-[var(--wf-tool)] focus:ring-4 focus:ring-[var(--wf-primary-100)]"
                  >
                    {projectRoles.map((role) => (
                      <option
                        key={role.value}
                        value={role.value}
                      >
                        {role.label} — {role.description}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-7 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    disabled={isAddingWork}
                    className="wf-editor-action"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isAddingWork}
                    className="wf-editor-action wf-editor-action--save"
                  >
                    {isAddingWork
                      ? "Adding..."
                      : "Add to Project"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {isEditModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--wf-neutral-950)]/40 p-4">
          <form
            onSubmit={handleUpdateProject}
            className="w-full max-w-lg rounded-3xl bg-[var(--wf-surface)] p-8 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-[var(--wf-tool)]">
                  Creative Project
                </p>

                <h2 className="mt-2 text-2xl font-bold text-[var(--wf-text)]">
                  Edit Project
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                disabled={isUpdatingProject}
                className="rounded-lg px-3 py-1 text-xl text-[var(--wf-neutral-500)] transition hover:bg-[var(--wf-neutral-100)]"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <label className="mt-7 block text-sm font-semibold text-[var(--wf-neutral-700)]">
              Project title
              <input
                value={editTitle}
                onChange={(event) =>
                  setEditTitle(event.target.value)
                }
                maxLength={150}
                autoFocus
                className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 font-normal outline-none transition focus:border-[var(--wf-tool)] focus:ring-4 focus:ring-[var(--wf-primary-100)]"
              />
            </label>

            <label className="mt-5 block text-sm font-semibold text-[var(--wf-neutral-700)]">
              Description
              <textarea
                value={editDescription}
                onChange={(event) =>
                  setEditDescription(event.target.value)
                }
                maxLength={3000}
                rows={6}
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
                onClick={() => setIsEditModalOpen(false)}
                disabled={isUpdatingProject}
                className="wf-editor-action"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isUpdatingProject}
                className="wf-editor-action wf-editor-action--save"
              >
                {isUpdatingProject
                  ? "Saving..."
                  : "Save Project"}
              </button>
            </div>
          </form>
        </div>
      )}

      {isPublishModalOpen && projectId && (
        <PublishProjectModal
          projectId={projectId}
          initialTitle={project.title}
          initialDescription={project.description}
          initialCategory={project.category ?? ""}
          initialTags={getProjectTags()}
          initialAllowComments={Boolean(project.allow_comments)}
          isUpdate={Boolean(project.is_published)}
          onClose={() => setIsPublishModalOpen(false)}
          onPublished={async () => {
            await loadProject();
            setIsPublishModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

export default ProjectDetailPage;
