import { useEffect, useState } from "react";
import type {
  ChangeEvent,
  FormEvent,
  MouseEvent,
} from "react";
import {
  deleteUploadedImages,
  getMyWork,
  publishMyWork,
  unpublishMyWork,
  uploadWorkImages,
} from "../../lib/api";

type PublishWorkModalProps = {
  workId: string;
  initialTitle: string;
  onClose: () => void;
  onPublished: () => void;
};

const categories = [
  "Fantasy",
  "Romance",
  "Science Fiction",
  "Mystery",
  "Adventure",
  "Slice of Life",
  "Poetry",
  "Illustration",
  "Other",
];

const MAXIMUM_COVER_SIZE = 5 * 1024 * 1024;

const allowedCoverTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function getUploadUrl(filePath: string) {
  return `http://localhost:3000/uploads/${filePath}`;
}

function PublishWorkModal({
  workId,
  initialTitle,
  onClose,
  onPublished,
}: PublishWorkModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [allowComments, setAllowComments] = useState(true);

  const [existingCoverPath, setExistingCoverPath] =
    useState<string | null>(null);

  const [wasPublished, setWasPublished] = useState(false);

  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] =
    useState<string | null>(null);

  const [
    shouldRemoveExistingCover,
    setShouldRemoveExistingCover,
  ] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isPublishing, setIsPublishing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadWork() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const result = await getMyWork(workId);

        if (ignore) {
          return;
        }

        const work = result.work;

        setTitle(work.title || initialTitle);
        setDescription(work.description || "");
        setCategory(work.category || "");
        setTagInput((work.tags || []).join(", "));
        setAllowComments(Boolean(work.allow_comments));
        setExistingCoverPath(work.cover_path);
        setWasPublished(work.is_published);
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Save this work before publishing it.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadWork();

    return () => {
      ignore = true;
    };
  }, [initialTitle, workId]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(coverFile);
    setCoverPreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [coverFile]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPublishing) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPublishing, onClose]);

  function handleBackdropClick(
    event: MouseEvent<HTMLDivElement>,
  ) {
    if (
      event.target === event.currentTarget &&
      !isPublishing
    ) {
      onClose();
    }
  }

  function handleCoverChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setErrorMessage("");

    if (!file) {
      return;
    }

    if (!allowedCoverTypes.includes(file.type)) {
      setErrorMessage(
        "Please select a JPG, PNG or WebP image.",
      );
      return;
    }

    if (file.size > MAXIMUM_COVER_SIZE) {
      setErrorMessage(
        "The cover image must be smaller than 5 MB.",
      );
      return;
    }

    setCoverFile(file);
    setShouldRemoveExistingCover(false);
  }

  async function handleUnpublish() {
    if (!wasPublished || isPublishing) {
      return;
    }

    const confirmed = window.confirm(
      "Remove this work from the Neighborhood? It will remain in My Works.",
    );

    if (!confirmed) {
      return;
    }

    setIsPublishing(true);
    setErrorMessage("");

    try {
      await unpublishMyWork(workId);

      setWasPublished(false);
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to unpublish this work.",
      );
    } finally {
      setIsPublishing(false);
    }
  }

  async function handlePublish(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();

    if (!normalizedTitle) {
      setErrorMessage("Please enter a title.");
      return;
    }

    if (!normalizedDescription) {
      setErrorMessage("Please enter a short description.");
      return;
    }

    if (!category) {
      setErrorMessage("Please select a category.");
      return;
    }

    setIsPublishing(true);
    setErrorMessage("");

    let newlyUploadedCoverPath: string | null = null;

    try {
      const tags = [
        ...new Set(
          tagInput
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
            .map((tag) => tag.slice(0, 30)),
        ),
      ].slice(0, 10);

      let nextCoverPath = existingCoverPath;

      if (shouldRemoveExistingCover) {
        nextCoverPath = null;
      }

      if (coverFile) {
        const result = await uploadWorkImages([coverFile]);
        const uploadedCover = result.images[0];

        if (!uploadedCover) {
          throw new Error("Cover upload failed.");
        }

        nextCoverPath = uploadedCover.filePath;
        newlyUploadedCoverPath = uploadedCover.filePath;
      }

      await publishMyWork(workId, {
        title: normalizedTitle,
        description: normalizedDescription,
        category,
        tags,
        allowComments,
        coverPath: nextCoverPath,
      });

      const oldCoverWasRemoved =
        shouldRemoveExistingCover && existingCoverPath;

      const oldCoverWasReplaced =
        coverFile &&
        existingCoverPath &&
        existingCoverPath !== nextCoverPath;

      if (oldCoverWasRemoved || oldCoverWasReplaced) {
        await deleteUploadedImages([existingCoverPath]);
      }

      onPublished();
    } catch (error) {
      if (newlyUploadedCoverPath) {
        await deleteUploadedImages([
          newlyUploadedCoverPath,
        ]);
      }

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The work could not be published.",
      );
    } finally {
      setIsPublishing(false);
    }
  }

  const displayedCoverUrl =
    coverPreviewUrl ??
    (shouldRemoveExistingCover || !existingCoverPath
      ? null
      : getUploadUrl(existingCoverPath));

  return (
    <div
      role="presentation"
      onMouseDown={handleBackdropClick}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[var(--wf-neutral-950)]/60 px-4 py-8 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl overflow-hidden rounded-3xl bg-[var(--wf-surface)] shadow-2xl"
      >
        <header className="flex items-start justify-between gap-6 border-b border-[var(--wf-neutral-200)] px-7 py-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--wf-secondary-600)]">
              WriteFlow Community
            </p>

            <h1 className="mt-1 text-2xl font-bold text-[var(--wf-neutral-900)]">
              {wasPublished
                ? "Update Publication"
                : "Publish Your Work"}
            </h1>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="text-2xl text-[var(--wf-neutral-400)] hover:text-[var(--wf-neutral-700)]"
          >
            ×
          </button>
        </header>

        {isLoading ? (
          <div className="flex min-h-80 items-center justify-center text-[var(--wf-neutral-500)]">
            Loading publication details...
          </div>
        ) : (
          <form
            onSubmit={handlePublish}
            className="max-h-[calc(100vh-12rem)] overflow-y-auto"
          >
            <div className="space-y-6 px-7 py-6">
              <label className="block text-sm font-semibold text-[var(--wf-neutral-700)]">
                Title
                <input
                  type="text"
                  value={title}
                  onChange={(event) =>
                    setTitle(event.target.value)
                  }
                  maxLength={120}
                  className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 outline-none focus:border-[var(--wf-secondary-500)]"
                />
              </label>

              <label className="block text-sm font-semibold text-[var(--wf-neutral-700)]">
                Description
                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  maxLength={500}
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 outline-none focus:border-[var(--wf-secondary-500)]"
                  placeholder="Tell readers what this work is about"
                />
              </label>

              <div>
                <p className="text-sm font-semibold text-[var(--wf-neutral-700)]">
                  Cover Image
                </p>

                <div className="mt-2 overflow-hidden rounded-2xl border border-[var(--wf-neutral-200)] bg-[var(--wf-neutral-50)]">
                  {displayedCoverUrl ? (
                    <img
                      src={displayedCoverUrl}
                      alt="Work cover preview"
                      className="aspect-[16/9] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[16/9] items-center justify-center text-5xl">
                      🖼️
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 border-t border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] p-4">
                    <label className="cursor-pointer rounded-xl bg-[var(--wf-secondary-600)] px-4 py-2 text-sm font-semibold text-[var(--wf-surface)]">
                      {displayedCoverUrl
                        ? "Replace Cover"
                        : "Choose Image"}

                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleCoverChange}
                        className="hidden"
                      />
                    </label>

                    {existingCoverPath && !coverFile && (
                      <button
                        type="button"
                        onClick={() =>
                          setShouldRemoveExistingCover(
                            !shouldRemoveExistingCover,
                          )
                        }
                        className="rounded-xl border border-[var(--wf-danger-200)] px-4 py-2 text-sm font-semibold text-[var(--wf-danger-600)]"
                      >
                        {shouldRemoveExistingCover
                          ? "Restore Cover"
                          : "Remove Cover"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <label className="block text-sm font-semibold text-[var(--wf-neutral-700)]">
                Category
                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] bg-[var(--wf-surface)] px-4 py-3 outline-none focus:border-[var(--wf-secondary-500)]"
                >
                  <option value="">Select a category</option>

                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-semibold text-[var(--wf-neutral-700)]">
                Tags
                <input
                  type="text"
                  value={tagInput}
                  onChange={(event) =>
                    setTagInput(event.target.value)
                  }
                  className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 outline-none focus:border-[var(--wf-secondary-500)]"
                  placeholder="fantasy, adventure, character"
                />
              </label>

              <label className="flex gap-3 rounded-xl bg-[var(--wf-neutral-50)] p-4">
                <input
                  type="checkbox"
                  checked={allowComments}
                  onChange={(event) =>
                    setAllowComments(event.target.checked)
                  }
                  className="mt-1 h-4 w-4 accent-[var(--wf-secondary-600)]"
                />

                <span>
                  <span className="block text-sm font-semibold text-[var(--wf-neutral-700)]">
                    Allow comments
                  </span>

                  <span className="mt-1 block text-xs text-[var(--wf-neutral-500)]">
                    Readers will be able to comment when the feature is added.
                  </span>
                </span>
              </label>

              {errorMessage && (
                <p className="rounded-xl border border-[var(--wf-danger-200)] bg-[var(--wf-danger-50)] p-4 text-sm text-[var(--wf-danger-700)]">
                  {errorMessage}
                </p>
              )}
            </div>

            <footer className="flex justify-end gap-3 border-t border-[var(--wf-neutral-200)] px-7 py-5">
              {wasPublished && (
                <button
                  type="button"
                  onClick={() => void handleUnpublish()}
                  disabled={isPublishing}
                  className="mr-auto rounded-xl border border-[var(--wf-danger-200)] px-5 py-2.5 font-semibold text-[var(--wf-danger-600)] transition hover:bg-[var(--wf-danger-50)] disabled:opacity-50"
                >
                  Unpublish
                </button>
              )}
              
              <button
                type="button"
                onClick={onClose}
                disabled={isPublishing}
                className="rounded-xl border border-[var(--wf-neutral-300)] px-5 py-2.5 font-semibold text-[var(--wf-neutral-700)]"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isPublishing}
                className="rounded-xl bg-[var(--wf-secondary-600)] px-6 py-2.5 font-semibold text-[var(--wf-surface)] disabled:opacity-50"
              >
                {isPublishing
                  ? "Publishing..."
                  : wasPublished
                    ? "Update Publication"
                    : "Publish"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}

export default PublishWorkModal;
