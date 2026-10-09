import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
  CSSProperties,
} from "react";

import {
  Element,
} from "slate";

import type {
  Descendant,
} from "slate";

import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";

import {
  Group,
  Panel,
  Separator,
  usePanelRef,
} from "react-resizable-panels";

import SlateEditor from "../components/editor/SlateEditor";

import {
  addWorkToProject,
  createMyWork,
  deleteMyWork,
  deleteUploadedImages,
  getMyWork,
  getSavedUser,
  updateMyWork,
  uploadWorkImages,
  getMyDraft,
  reloadMyDraft,
  saveMyDraft,
  submitChangeRequest,
  type ProjectItemRole,
} from "../lib/api";

import type {
  SlateEditorHandle,
} from "../components/editor/SlateEditor";


import PublishWorkModal from "../components/publish/PublishWorkModal";
import CollaboratorPanel from "../components/collaboration/CollaboratorPanel";
import CollaboratorPresence from "../components/collaboration/CollaboratorPresence";
import ReviewQueuePanel from "../components/collaboration/ReviewQueuePanel";
import ReviewQueueButton from "../components/collaboration/ReviewQueueButton";
import MySubmissionsPanel from "../components/collaboration/MySubmissionsPanel";
import NotificationBell from "../components/notifications/NotificationBell";

type BackgroundType =
  | "blank"
  | "color"
  | "parchment";

function createEmptyContent(): Descendant[] {
  return [
    {
      type: "paragraph",
      children: [
        {
          text: "",
        },
      ],
    },
  ];
}

function parseSavedContent(
  savedContent: string,
): Descendant[] {
  if (!savedContent) {
    return createEmptyContent();
  }

  try {
    const parsedContent =
      JSON.parse(savedContent);

    if (Array.isArray(parsedContent)) {
      return parsedContent as Descendant[];
    }
  } catch {
    // Old works may contain plain text.
  }

  return [
    {
      type: "paragraph",
      children: [
        {
          text: savedContent,
        },
      ],
    },
  ];
}

/*
 * Find every Storage file path
 * inside Slate content.
 */
function collectImagePaths(
  nodes: Descendant[],
): string[] {
  const paths: string[] = [];

  for (const node of nodes) {
    if (!Element.isElement(node)) {
      continue;
    }

    if (
      node.type === "image" &&
      node.filePath
    ) {
      paths.push(node.filePath);
    }

    if (Array.isArray(node.children)) {
      paths.push(
        ...collectImagePaths(
          node.children as Descendant[],
        ),
      );
    }
  }

  return paths;
}

function createUniquePaths(
  paths: string[],
) {
  return [
    ...new Set(
      paths.filter(
        (path) =>
          typeof path === "string" &&
          path.length > 0,
      ),
    ),
  ];
}

/*
 * Delete files through the Storage API.
 */
async function removeStorageFiles(
  paths: string[],
): Promise<string | null> {
  const uniquePaths = createUniquePaths(paths);

  if (uniquePaths.length === 0) {
    return null;
  }

  try {
    await deleteUploadedImages(uniquePaths);
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "Unable to delete image files.";
  }
}

function TextEditorPage() {
  const navigate = useNavigate();

  const { workId } = useParams<{
    workId: string;
  }>();

  const [searchParams] = useSearchParams();

  const sourceProjectId =
    searchParams.get("projectId");

  const requestedProjectRole =
    searchParams.get("projectRole");

  const allowedProjectRoles: ProjectItemRole[] = [
    "chapter",
    "character",
    "scene",
    "cover",
    "inspiration",
    "other",
  ];

  const sourceProjectRole: ProjectItemRole =
    allowedProjectRoles.includes(
      requestedProjectRole as ProjectItemRole,
    )
      ? (requestedProjectRole as ProjectItemRole)
      : "chapter";

  const slateEditorRef =
    useRef<SlateEditorHandle>(null);

  /*
   * Work data
   */
  const [title, setTitle] =
    useState("Untitled Work");

  const [content, setContent] =
    useState<Descendant[]>(
      createEmptyContent(),
    );

  const [
    editorInstanceKey,
    setEditorInstanceKey,
  ] = useState(0);

  /*
   * Page status
   */
  const [isLoading, setIsLoading] =
    useState(true);

  const [isSaving, setIsSaving] =
    useState(false);

  const [
    isDeleting,
    setIsDeleting,
  ] = useState(false);

  const [
    isUploadingImage,
    setIsUploadingImage,
  ] = useState(false);

  const [message, setMessage] =
    useState("");

  const [hasError, setHasError] =
    useState(false);

  const [
    isPublishModalOpen,
    setIsPublishModalOpen,
  ] = useState(false);

  const [
    isCollaboratorPanelOpen,
    setIsCollaboratorPanelOpen,
  ] = useState(false);

  const [
    isReviewQueueOpen,
    setIsReviewQueueOpen,
  ] = useState(false);

  const [
    isMySubmissionsOpen,
    setIsMySubmissionsOpen,
  ] = useState(false);

  const [isOwner, setIsOwner] = useState(false);
  const [canEdit, setCanEdit] = useState(true);

  const [
    accessRole,
    setAccessRole,
  ] = useState<
    "owner" | "editor" | "viewer"
  >("viewer");

  const [
    currentVersion,
    setCurrentVersion,
  ] = useState(1);

  const [
    isDraftMode,
    setIsDraftMode,
  ] = useState(false);

  const [
    isSubmittingChanges,
    setIsSubmittingChanges,
  ] = useState(false);

  /*
   * Images removed from Slate.
   *
   * They are deleted from Storage only
   * after the work saves successfully.
   */
  const [
    pendingImageDeletions,
    setPendingImageDeletions,
  ] = useState<string[]>([]);

  /*
   * Images uploaded during this editing
   * session but not saved yet.
   *
   * If the user starts a new work, these
   * temporary uploads can be cleaned up.
   */
  const [
    newlyUploadedImagePaths,
    setNewlyUploadedImagePaths,
  ] = useState<string[]>([]);

  /*
   * Sidebar
   */
  const sidebarPanelRef = usePanelRef();

  const [
    isSidebarVisible,
    setIsSidebarVisible,
  ] = useState(true);

  /*
   * Background settings
   */
  const [
    backgroundType,
    setBackgroundType,
  ] = useState<BackgroundType>("blank");

  const [
    backgroundColor,
    setBackgroundColor,
  ] = useState("#f8fafc");

  /*
   * Typography settings
   */
  const [fontFamily, setFontFamily] =
    useState("Arial");

  const [fontSize, setFontSize] =
    useState(18);

  const [fontColor, setFontColor] =
    useState("#1e293b");

  const [fontWeight, setFontWeight] =
    useState(400);

  function resetVisualSettings() {
    setBackgroundType("blank");
    setBackgroundColor("#f8fafc");
    setFontFamily("Arial");
    setFontSize(18);
    setFontColor("#1e293b");
    setFontWeight(400);
  }

  /*
   * Load work.
   */
  useEffect(() => {
    let ignore = false;

    async function loadWork() {
      setIsLoading(true);
      setMessage("");
      setHasError(false);

      setPendingImageDeletions([]);
      setNewlyUploadedImagePaths([]);

      const user = getSavedUser();

      if (!user) {
        navigate("/login", {
          replace: true,
        });

        return;
      }

      /*
       * New work.
       */
      if (!workId) {
        setAccessRole("owner");
        setIsOwner(false);
        setCanEdit(true);
        setCurrentVersion(1);
        setIsDraftMode(false);
        setTitle("Untitled Work");

        setContent(
          createEmptyContent(),
        );

        resetVisualSettings();

        setEditorInstanceKey(
          (currentKey) =>
            currentKey + 1,
        );

        setIsLoading(false);
        return;
      }

      /*
       * Existing work.
       */
      let data: {
        author_id: string;
        access_role: "owner" | "editor" | "viewer";
        current_version: number;
        title: string;
        content_json: unknown;
      };

      try {
        const result = await getMyWork(workId);
        data = result.work;
      } catch (error) {
        if (ignore) {
          return;
        }

        const errorMessage =
          error instanceof Error
            ? error.message
            : "This work could not be loaded.";

        if (
          errorMessage.includes("logged in") ||
          errorMessage.includes("session")
        ) {
          navigate("/login", {
            replace: true,
          });
          return;
        }

        setMessage(errorMessage);
        setHasError(true);
        setIsLoading(false);
        return;
      }

      if (ignore) {
        return;
      }

      setAccessRole(data.access_role);
      setIsOwner(data.access_role === "owner");
      setCanEdit(data.access_role === "owner");
      setCurrentVersion(data.current_version);
      setIsDraftMode(false);

      setTitle(data.title);

      setContent(
        parseSavedContent(
          typeof data.content_json === "string"
            ? data.content_json
            : JSON.stringify(data.content_json),
        )
      );

      setEditorInstanceKey(
        (currentKey) =>
          currentKey + 1,
      );

      setIsLoading(false);
    }

    loadWork();

    return () => {
      ignore = true;
    };
  }, [workId, navigate]);

  async function handleDraftModeToggle() {
    if (
      !workId ||
      accessRole !== "editor"
    ) {
      return;
    }

    if (isDraftMode) {
      const confirmed = window.confirm(
        "Return to read-only mode? Any unsaved draft changes will be lost.",
      );

      if (!confirmed) {
        return;
      }

      window.location.reload();
      return;
    }

    try {
      setIsLoading(true);
      setMessage("");
      setHasError(false);

      const result = await getMyDraft(workId);
      const draft = result.draft;

      setCurrentVersion(
        draft?.base_version ??
          result.currentVersion,
      );

      if (draft) {
        setTitle(draft.draft_title);

        setContent(
          parseSavedContent(
            typeof draft.draft_content_json ===
              "string"
              ? draft.draft_content_json
              : JSON.stringify(
                  draft.draft_content_json,
                ),
          ),
        );
      }

      setPendingImageDeletions([]);
      setNewlyUploadedImagePaths([]);

      setIsDraftMode(true);
      setCanEdit(true);

      setEditorInstanceKey(
        (currentKey) => currentKey + 1,
      );

      setMessage(
        draft
          ? "Private draft loaded. Your changes are visible only to you until submitted."
          : "Draft Mode is active. Your changes are private until submitted.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to start Draft Mode.",
      );

      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReloadLatestOfficialVersion() {
    if (
      !workId ||
      accessRole !== "editor" ||
      !isDraftMode
    ) {
      return;
    }

    const confirmed = window.confirm(
      "Reload the latest official version? Your current private draft changes will be replaced and cannot be restored.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setIsLoading(true);
      setMessage("");
      setHasError(false);

      const result = await reloadMyDraft(workId);

      setTitle(result.draft.title);

      setContent(
        parseSavedContent(
          typeof result.draft.contentJson === "string"
            ? result.draft.contentJson
            : JSON.stringify(result.draft.contentJson),
        ),
      );

      setCurrentVersion(result.draft.baseVersion);

      setPendingImageDeletions([]);
      setNewlyUploadedImagePaths([]);

      setEditorInstanceKey(
        (currentKey) => currentKey + 1,
      );

      setMessage(
        `Latest official version loaded. You are now editing Draft Mode based on Version ${result.draft.baseVersion}.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to reload the latest official version.",
      );

      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }

  
  async function handleSubmitChanges() {
    if (
      !workId ||
      !isDraftMode ||
      isSubmittingChanges
    ) {
      return;
    }

    const finalTitle =
      title.trim() || "Untitled Work";

    try {
      setIsSubmittingChanges(true);
      setMessage("");
      setHasError(false);

      await saveMyDraft(workId, {
        title: finalTitle,
        contentJson: content,
        baseVersion: currentVersion,
      });

      await submitChangeRequest(workId);

      setMessage(
        "Changes submitted for owner review.",
      );

      window.setTimeout(() => {
        window.location.reload();
      }, 900);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to submit changes.",
      );

      setHasError(true);
    } finally {
      setIsSubmittingChanges(false);
    }
  }
  /*
   * Called by SlateEditor when the user
   * removes an image from the document.
   */
  function handleImageRemoved(
    filePath: string,
  ) {
    if (isDraftMode) {
      return;
    }

    if (!filePath) {
      return;
    }

    setPendingImageDeletions(
      (currentPaths) => {
        if (
          currentPaths.includes(filePath)
        ) {
          return currentPaths;
        }

        return [
          ...currentPaths,
          filePath,
        ];
      },
    );
  }

  /*
   * Delete images that were removed
   * from Slate after a successful save.
   */
  async function deletePendingImages() {
    const paths =
      createUniquePaths(
        pendingImageDeletions,
      );

    if (paths.length === 0) {
      return null;
    }

    const errorMessage =
      await removeStorageFiles(paths);

    if (!errorMessage) {
      setPendingImageDeletions([]);

      setNewlyUploadedImagePaths(
        (currentPaths) =>
          currentPaths.filter(
            (path) =>
              !paths.includes(path),
          ),
      );
    }

    return errorMessage;
  }

  /*
   * Save work.
   */
  async function handleSave() {
    setMessage("");
    setHasError(false);
    setIsSaving(true);

    const user = getSavedUser();

    if (!user) {
      setIsSaving(false);

      navigate("/login", {
        replace: true,
      });

      return;
    }

    const finalTitle = title.trim() || "Untitled Work";

    try {
      if (workId && isDraftMode) {
        await saveMyDraft(workId, {
          title: finalTitle,
          contentJson: content,
          baseVersion: currentVersion,
        });

        setNewlyUploadedImagePaths([]);
        setPendingImageDeletions([]);
        setTitle(finalTitle);

        setMessage("Private draft saved.");
        return;
      }

      if (workId) {
        await updateMyWork(
          workId,
          finalTitle,
          content,
        );

        // 数据库已经不再引用被移除的图片，
        // 现在才可以安全删除本地文件。
        const cleanupError = await deletePendingImages();

        setNewlyUploadedImagePaths([]);
        setTitle(finalTitle);

        if (cleanupError) {
          setMessage(
            `The work was saved, but some unused images could not be deleted: ${cleanupError}`,
          );
          setHasError(true);
          return;
        }

        setMessage("Saved successfully.");
        return;
      }

      const result = await createMyWork(
        finalTitle,
        "writing",
        content,
      );

      if (sourceProjectId) {
        try {
          await addWorkToProject(
            sourceProjectId,
            result.work.id,
            sourceProjectRole,
          );
        } catch (projectError) {
          const projectMessage =
            projectError instanceof Error
              ? projectError.message
              : "Unable to add the work to the project.";

          window.alert(
            `The writing work was saved, but it could not be added to the project: ${projectMessage}`,
          );
        }
      }

      // 新作品也可能在首次保存前插入并移除了图片。
      const cleanupError = await deletePendingImages();

      setNewlyUploadedImagePaths([]);
      setTitle(finalTitle);

      if (cleanupError) {
        setMessage(
          `The work was saved, but some unused images could not be deleted: ${cleanupError}`,
        );
        setHasError(true);
      } else {
        setMessage("Saved successfully.");
      }

      const projectQuery = sourceProjectId
        ? `?projectId=${encodeURIComponent(
            sourceProjectId,
          )}`
        : "";

      navigate(
        `/text/${result.work.id}${projectQuery}`,
        {
          replace: true,
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Unable to save this work.";

      if (
        errorMessage.includes("logged in") ||
        errorMessage.includes("session")
      ) {
        navigate("/login", {
          replace: true,
        });
        return;
      }

      setMessage(`Save failed: ${errorMessage}`);
      setHasError(true);
    } finally {
      setIsSaving(false);
    }
  }

  /*
   * Start a new work.
   *
   * Only images uploaded during the
   * current unsaved session are removed.
   *
   * Images removed from an existing work
   * are not deleted here because the user
   * has not saved those changes.
   */
  async function handleNewWork() {
    const temporaryPaths =
      createUniquePaths(
        newlyUploadedImagePaths,
      );

    if (temporaryPaths.length > 0) {
      const cleanupError =
        await removeStorageFiles(
          temporaryPaths,
        );

      if (cleanupError) {
        window.alert(
          `Some unsaved images could not be deleted: ${cleanupError}`,
        );
      }
    }

    setTitle("Untitled Work");

    setContent(
      createEmptyContent(),
    );

    setMessage("");
    setHasError(false);

    setPendingImageDeletions([]);
    setNewlyUploadedImagePaths([]);

    resetVisualSettings();

    setEditorInstanceKey(
      (currentKey) =>
        currentKey + 1,
    );

    navigate("/text");
  }

  /*
   * Delete the complete work and
   * all images referenced by it.
   */
  async function handleDeleteWork() {
    const confirmed = window.confirm(
      workId
        ? "Delete this work permanently? This action cannot be undone."
        : "Discard this unsaved work and its uploaded images?",
    );

    if (!confirmed) {
      return;
    }

    setMessage("");
    setHasError(false);
    setIsDeleting(true);

    const user = getSavedUser();

    if (!user) {
      setIsDeleting(false);
      navigate("/login", {
        replace: true,
      });
      return;
    }

    const imagePaths = createUniquePaths([
      ...collectImagePaths(content),
      ...pendingImageDeletions,
      ...newlyUploadedImagePaths,
    ]);

    try {
      if (workId) {
        await deleteMyWork(workId);
      }

      const cleanupError = await removeStorageFiles(imagePaths);

      if (cleanupError) {
        window.alert(
          `The work was deleted, but some image files could not be removed: ${cleanupError}`,
        );
      }

      navigate("/works", {
        replace: true,
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Delete failed: ${error.message}`
          : "Delete failed.",
      );
      setHasError(true);
    } finally {
      setIsDeleting(false);
    }
  }

  /*
   * Sidebar
   */
  function toggleSidebar() {
    if (isSidebarVisible) {
      sidebarPanelRef.current?.collapse();

      setIsSidebarVisible(false);
      return;
    }

    sidebarPanelRef.current?.expand();

    setIsSidebarVisible(true);
  }

  /*
   * Upload image and insert it
   * into Slate.
   */
  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const files = Array.from(event.target.files ?? []);

    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const user = getSavedUser();

    if (!user) {
      navigate("/login", {
        replace: true,
      });
      return;
    }

    const validFiles = files.filter((file) => {
      if (!file.type.startsWith("image/")) {
        setMessage(`${file.name} is not a supported image file.`);
        setHasError(true);
        return false;
      }

      if (file.size > 10 * 1024 * 1024) {
        setMessage(`${file.name} is larger than 10 MB.`);
        setHasError(true);
        return false;
      }

      return true;
    });

    if (validFiles.length === 0) {
      return;
    }

    setMessage("");
    setHasError(false);
    setIsUploadingImage(true);

    try {
      const result = await uploadWorkImages(validFiles);

      for (const image of result.images) {
        setNewlyUploadedImagePaths((currentPaths) => [
          ...currentPaths,
          image.filePath,
        ]);

        slateEditorRef.current?.insertImage({
          id: crypto.randomUUID(),
          url: image.url,
          filePath: image.filePath,
          alt: image.alt,
          width: 480,
          alignment: "center",
        });
      }

      setMessage(
        result.images.length === 1
          ? "Image inserted successfully. Remember to save your work."
          : `${result.images.length} images inserted successfully. Remember to save your work.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `Image upload failed: ${error.message}`
          : "Image upload failed.",
      );
      setHasError(true);
    } finally {
      setIsUploadingImage(false);
    }
  }

  /*
   * Editor background
   */
  const editorBackgroundStyle:
    CSSProperties =
    backgroundType === "parchment"
      ? {
          backgroundColor: "#f3e2b8",

          backgroundImage: `
            radial-gradient(
              circle at 20% 20%,
              rgba(120, 85, 45, 0.1),
              transparent 35%
            ),
            radial-gradient(
              circle at 80% 70%,
              rgba(120, 85, 45, 0.1),
              transparent 40%
            ),
            linear-gradient(
              90deg,
              rgba(120, 85, 45, 0.04),
              transparent,
              rgba(120, 85, 45, 0.04)
            )
          `,
        }
      : backgroundType === "color"
        ? {
            backgroundColor,
          }
        : {
            backgroundColor:
              "#ffffff",
          };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wf-neutral-50)] text-[var(--wf-neutral-500)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--wf-surface)]">
      {/* Top navigation */}
      <header className="flex h-20 items-center gap-4 border-b border-[var(--wf-text)] bg-[var(--wf-nav)] px-8">
        <Link
          to="/"
          className="font-kranky shrink-0 text-4xl text-[var(--wf-nav-text)] transition hover:text-[var(--wf-tool-text)]"
        >
          WriteFlow
        </Link>

        {sourceProjectId && (
          <Link
            to={`/projects/${sourceProjectId}`}
            className="wf-editor-action"
          >
            Back to Project
          </Link>
        )}

        <nav className="ml-auto flex min-w-0 items-center gap-2">
          {workId && (
            <CollaboratorPresence workId={workId} />
          )}

          <NotificationBell />

          <button
            type="button"
            onClick={toggleSidebar}
            className="wf-editor-action"
          >
            {isSidebarVisible
              ? "Hide Tools"
              : "Show Tools"}
          </button>

          <Link
            to="/works"
            className="wf-editor-action"
          >
            My Works
          </Link>

          {workId && accessRole === "editor" && (
            <button
              type="button"
              onClick={() =>
                void handleDraftModeToggle()
              }
              disabled={
                isSaving ||
                isSubmittingChanges ||
                isUploadingImage
              }
              className={[
                "font-mukta-mahee inline-flex h-11 shrink-0 items-center rounded-full border border-[var(--wf-save)] px-4 text-base font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                isDraftMode
                  ? "bg-[var(--wf-save-hover)] text-[var(--wf-text)] hover:bg-[var(--wf-save)]"
                  : "bg-[var(--wf-surface)] text-[var(--wf-text)] hover:bg-[var(--wf-button-hover)]",
              ].join(" ")}
            >
              {isDraftMode
                ? "Draft Mode"
                : "Read-only"}
            </button>
          )}

          {workId &&
            accessRole === "editor" &&
            isDraftMode && (
              <button
                type="button"
                onClick={() =>
                  void handleReloadLatestOfficialVersion()
                }
                disabled={
                  isSaving ||
                  isSubmittingChanges ||
                  isUploadingImage
                }
                className="wf-editor-action"
              >
                Reload latest official version
              </button>
          )}

          {workId && accessRole === "editor" && (
            <button
              type="button"
              onClick={() =>
                setIsMySubmissionsOpen(true)
              }
              className="wf-editor-action"
            >
              My Submissions
            </button>
          )}

          {workId && isDraftMode && (
            <button
              type="button"
              onClick={() =>
                void handleSubmitChanges()
              }
              disabled={
                isSaving ||
                isSubmittingChanges ||
                isUploadingImage
              }
              className="wf-editor-action"
            >
              {isSubmittingChanges
                ? "Submitting..."
                : "Submit Changes"}
            </button>
          )}

          <button
            type="button"
            onClick={handleNewWork}
            disabled={
              isSaving ||
              isDeleting ||
              isUploadingImage
            }
            className="wf-editor-action"
          >
            New Work
          </button>


          {workId && isOwner && (
            <button
              type="button"
              onClick={() =>
                setIsCollaboratorPanelOpen(true)
              }
              className="wf-editor-action"
            >
              Collaborators
            </button>
          )}

          {workId && isOwner && (
            <ReviewQueueButton
              workId={workId}
              onOpen={() =>
                setIsReviewQueueOpen(true)
              }
              className="wf-editor-action"
            />
          )}

          {workId && isOwner && (
            <button
              type="button"
              onClick={() =>
                setIsPublishModalOpen(true)
              }
              disabled={
                !workId ||
                isSaving ||
                isDeleting ||
                isUploadingImage
              }
              title={
                workId
                  ? "Publish this work"
                  : "Save the work before publishing"
              }
              className="wf-editor-action"
            >
              Publish
            </button>
          )}

          {(!workId || isOwner) && (
            <button
              type="button"
              onClick={
                handleDeleteWork
              }
              disabled={
                isSaving ||
                isDeleting ||
                isUploadingImage
              }
              className="wf-editor-action wf-editor-action--discard"
            >
              {isDeleting
                ? "Deleting..."
                : workId
                  ? "Delete"
                  : "Discard"}
            </button>
          )}


          {canEdit && (
            <button
              type="button"
              onClick={handleSave}
              disabled={
                isSaving ||
                isDeleting ||
                isUploadingImage
              }
              className="wf-editor-action wf-editor-action--save"
            >
              {isSaving
                ? isDraftMode
                  ? "Saving Draft..."
                  : "Saving..."
                : isDraftMode
                  ? "Save Draft"
                  : "Save"}
            </button>
          )}
        </nav>
      </header>

      {/* Resizable editor */}
      <main className="h-[calc(100vh-5rem)]">
        <Group orientation="horizontal">
          {/* Writing tools */}
          <Panel
            id="writing-tools"
            panelRef={
              sidebarPanelRef
            }
            defaultSize="300px"
            minSize="240px"
            maxSize="420px"
            collapsedSize="0px"
            collapsible
            groupResizeBehavior="preserve-pixel-size"
          >
            <aside className="h-full overflow-y-auto border-r border-[var(--wf-border)] bg-[var(--wf-surface)] p-6">
              <h2 className="font-mukta-mahee text-xl font-bold text-[var(--wf-text)]">
                Writing Tools
              </h2>

              <p className="mt-1 text-sm text-[var(--wf-muted)]">
                Customize your writing
                space.
              </p>

              {/* Background */}
              <section className="mt-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--wf-muted)]">
                  Background
                </h3>

                <div className="mt-3 grid gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setBackgroundType(
                        "blank",
                      );
                    }}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      backgroundType ===
                      "blank"
                        ? "border-[var(--wf-tool)] bg-[var(--wf-tool)] text-[var(--wf-tool-text)]"
                        : "border-[var(--wf-tool)]/30 text-[var(--wf-tool)] hover:bg-[var(--wf-tool)]/5"
                    }`}
                  >
                    Blank Page
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBackgroundType(
                        "color",
                      );
                    }}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      backgroundType ===
                      "color"
                        ? "border-[var(--wf-tool)] bg-[var(--wf-tool)] text-[var(--wf-tool-text)]"
                        : "border-[var(--wf-tool)]/30 text-[var(--wf-tool)] hover:bg-[var(--wf-tool)]/5"
                    }`}
                  >
                    Colored Background
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBackgroundType(
                        "parchment",
                      );
                    }}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      backgroundType ===
                      "parchment"
                        ? "border-[var(--wf-tool)] bg-[var(--wf-tool)] text-[var(--wf-tool-text)]"
                        : "border-[var(--wf-tool)]/30 text-[var(--wf-tool)] hover:bg-[var(--wf-tool)]/5"
                    }`}
                  >
                    Parchment
                  </button>
                </div>

                {backgroundType ===
                  "color" && (
                  <label className="mt-4 flex items-center justify-between text-sm text-[var(--wf-muted)]">
                    Background Color

                    <input
                      type="color"
                      value={
                        backgroundColor
                      }
                      onChange={(
                        event,
                      ) => {
                        setBackgroundColor(
                          event.target
                            .value,
                        );
                      }}
                      className="h-10 w-14 cursor-pointer rounded border border-[var(--wf-border)]"
                    />
                  </label>
                )}
              </section>

              {/* Typography */}
              <section className="mt-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--wf-muted)]">
                  Typography
                </h3>

                <label className="mt-4 block text-sm text-[var(--wf-muted)]">
                  Font Family

                  <select
                    value={fontFamily}
                    onChange={(event) => {
                      setFontFamily(
                        event.target.value,
                      );
                    }}
                    className="mt-2 w-full rounded-xl border border-[var(--wf-border)] bg-[var(--wf-surface)] px-3 py-2 outline-none focus:border-[var(--wf-tool)]"
                  >
                    <option value="Arial">
                      Arial
                    </option>

                    <option value="'Mukta Mahee', sans-serif">
                      Mukta Mahee
                    </option>

                    <option value="'Times New Roman', serif">
                      Times New Roman
                    </option>

                    <option value="Georgia, serif">
                      Georgia
                    </option>

                    <option value="'Courier New', monospace">
                      Courier New
                    </option>
                  </select>
                </label>

                <label className="mt-4 block text-sm text-[var(--wf-muted)]">
                  Font Size: {fontSize}px

                  <input
                    type="range"
                    min="12"
                    max="48"
                    value={fontSize}
                    onChange={(event) => {
                      setFontSize(
                        Number(
                          event.target.value,
                        ),
                      );
                    }}
                    className="mt-2 w-full accent-[var(--wf-tool)]"
                  />
                </label>

                <label className="mt-4 flex items-center justify-between text-sm text-[var(--wf-muted)]">
                  Text Color

                  <input
                    type="color"
                    value={fontColor}
                    onChange={(event) => {
                      setFontColor(
                        event.target.value,
                      );
                    }}
                    className="h-10 w-14 cursor-pointer rounded border border-[var(--wf-border)]"
                  />
                </label>

                <label className="mt-4 block text-sm text-[var(--wf-muted)]">
                  Font Weight

                  <select
                    value={fontWeight}
                    onChange={(event) => {
                      setFontWeight(
                        Number(
                          event.target.value,
                        ),
                      );
                    }}
                    className="mt-2 w-full rounded-xl border border-[var(--wf-border)] bg-[var(--wf-surface)] px-3 py-2 outline-none focus:border-[var(--wf-tool)]"
                  >
                    <option value={300}>
                      Light
                    </option>

                    <option value={400}>
                      Regular
                    </option>

                    <option value={500}>
                      Medium
                    </option>

                    <option value={700}>
                      Bold
                    </option>
                  </select>
                </label>
              </section>

              {/* Images */}
              <section className="mt-8">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--wf-muted)]">
                  Images
                </h3>

                <label
                  className={`mt-4 block rounded-xl border-2 border-dashed px-4 py-5 text-center text-sm transition ${
                    isUploadingImage
                      ? "cursor-not-allowed border-[var(--wf-border)] bg-[var(--wf-subtle)] text-[var(--wf-muted)]"
                      : "cursor-pointer border-[var(--wf-tool)] text-[var(--wf-tool)] hover:bg-[var(--wf-tool)]/5"
                  }`}
                >
                  {isUploadingImage
                    ? "Uploading..."
                    : "Import from Computer"}

                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={
                      isUploadingImage
                    }
                    onChange={
                      handleImageUpload
                    }
                    className="hidden"
                  />
                </label>

                <p className="mt-3 text-xs leading-5 text-[var(--wf-muted)]">
                  Images are inserted at
                  the current cursor
                  position. Maximum size:
                  10 MB per image.
                </p>
              </section>
            </aside>
          </Panel>

          <Separator
            className={`cursor-col-resize bg-[var(--wf-border)] transition hover:bg-[var(--wf-tool)] ${
              isSidebarVisible
                ? "w-2"
                : "w-0"
            }`}
          />

          {/* Main editor */}
          <Panel
            id="writing-editor"
            groupResizeBehavior="preserve-relative-size"
          >
            <div className="h-full overflow-y-auto bg-[var(--wf-surface)] px-6 py-10">
              <div className="mx-auto max-w-5xl">
                <p className="text-sm font-medium uppercase tracking-wider text-[var(--wf-text)]">
                  Writing Workspace
                </p>

                <input
                  type="text"
                  value={title}
                  onFocus={(event) => {
                    event.currentTarget.select();
                  }}
                  readOnly={!canEdit}
                  onChange={(event) => {
                    if (!canEdit) {
                      return;
                    }

                    setTitle(
                      event.target.value,
                    );

                    setMessage("");
                    setHasError(false);
                  }}
                  placeholder="Name your work"
                  className="mt-3 w-full border-b border-[var(--wf-border)] bg-transparent pb-3 text-4xl font-bold text-[var(--wf-text)] outline-none transition focus:border-[var(--wf-tool)] disabled:cursor-not-allowed disabled:opacity-60"
                />

                <p className="mt-3 text-[var(--wf-muted)]">
                  Write your story,
                  article, or creative idea.
                </p>

                {!canEdit && (
                  <p className="mt-3 rounded-xl bg-[var(--wf-warning-50)] px-4 py-3 text-sm font-medium text-[var(--wf-warning-800)]">
                    {accessRole === "editor"
                      ? "You have editor access. Switch to Draft Mode to create private changes for owner review."
                      : "You have viewer access to this work. It is read-only."}
                  </p>
                )}

                {message && (
                  <p
                    className={`mt-5 rounded-xl p-3 text-sm ${
                      hasError
                        ? "bg-[var(--wf-danger-50)] text-[var(--wf-danger-700)]"
                        : "bg-[var(--wf-success-50)] text-[var(--wf-success-700)]"
                    }`}
                  >
                    {message}
                  </p>
                )}

                <div
                  style={
                    editorBackgroundStyle
                  }
                  className="mt-8 min-h-[36rem] rounded-2xl border border-[var(--wf-border)] p-6 shadow-sm transition"
                >
                  <SlateEditor
                    ref={slateEditorRef}
                    key={`${workId ?? "new"}-${editorInstanceKey}`}
                    value={content}
                    onChange={(
                      nextContent,
                    ) => {
                      setContent(
                        nextContent,
                      );

                      setMessage("");
                      setHasError(false);
                    }}
                    onRemoveImage={
                      isDraftMode
                        ? () => {}
                        : handleImageRemoved
                    }
                    fontFamily={
                      fontFamily
                    }
                    fontSize={fontSize}
                    fontColor={fontColor}
                    fontWeight={
                      fontWeight
                    }
                    readOnly={!canEdit}
                  />
                </div>
              </div>
            </div>
          </Panel>
        </Group>
      </main>

      {isPublishModalOpen && workId && (
        <PublishWorkModal
          workId={workId}
          initialTitle={title}
          onClose={() =>
            setIsPublishModalOpen(false)
          }
          onPublished={() => {
            setIsPublishModalOpen(false);
            setHasError(false);
            setMessage(
              "Your work has been published.",
            );
          }}
        />
      )}
            
      {isCollaboratorPanelOpen && workId && (
        <CollaboratorPanel
          workId={workId}
          onClose={() =>
            setIsCollaboratorPanelOpen(false)
          }
        />
      )}

      {isReviewQueueOpen && workId && (
        <ReviewQueuePanel
          workId={workId}
          onClose={() =>
            setIsReviewQueueOpen(false)
          }
          onAccepted={() => {
            setIsReviewQueueOpen(false);
            window.location.reload();
          }}
        />
      )}

      {isMySubmissionsOpen && workId && (
        <MySubmissionsPanel
          workId={workId}
          onClose={() =>
            setIsMySubmissionsOpen(false)
          }
        />
      )}
    </div>
  );
}

export default TextEditorPage;
