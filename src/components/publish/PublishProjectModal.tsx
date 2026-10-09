import { useState } from "react";
import type { FormEvent } from "react";
import { publishMyProject } from "../../lib/api";

type PublishProjectModalProps = {
  projectId: string;
  initialTitle: string;
  initialDescription: string;
  initialCategory: string;
  initialTags: string[];
  initialAllowComments: boolean;
  isUpdate: boolean;
  onClose: () => void;
  onPublished: () => void | Promise<void>;
};

function PublishProjectModal({
  projectId,
  initialTitle,
  initialDescription,
  initialCategory,
  initialTags,
  initialAllowComments,
  isUpdate,
  onClose,
  onPublished,
}: PublishProjectModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [category, setCategory] = useState(initialCategory);
  const [tags, setTags] = useState(initialTags.join(", "));
  const [allowComments, setAllowComments] = useState(initialAllowComments);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setErrorMessage("Please enter a project title.");
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    try {
      await publishMyProject(projectId, {
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        tags: [...new Set(tags.split(",").map((tag) => tag.trim()).filter(Boolean))],
        allowComments,
      });
      await onPublished();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to publish this project.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[var(--wf-neutral-950)]/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-[var(--wf-surface)] p-8 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--wf-success-700)]">
              Community Publication
            </p>
            <h2 className="mt-2 text-3xl font-bold text-[var(--wf-palette-004239)]">
              {isUpdate ? "Update Project Publication" : "Publish Project"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1 text-2xl text-[var(--wf-neutral-500)] hover:bg-[var(--wf-neutral-100)]" aria-label="Close">
            ×
          </button>
        </div>

        <p className="mt-3 text-sm leading-6 text-[var(--wf-neutral-500)]">
          The project cover and every item in its current order will be visible in Neighborhood.
        </p>

        <label className="mt-6 block text-sm font-semibold text-[var(--wf-neutral-700)]">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 font-normal outline-none focus:border-[var(--wf-success-700)] focus:ring-4 focus:ring-[var(--wf-success-100)]" />
        </label>

        <label className="mt-5 block text-sm font-semibold text-[var(--wf-neutral-700)]">
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={3000} rows={5} className="mt-2 w-full resize-y rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 font-normal outline-none focus:border-[var(--wf-success-700)] focus:ring-4 focus:ring-[var(--wf-success-100)]" />
        </label>

        <label className="mt-5 block text-sm font-semibold text-[var(--wf-neutral-700)]">
          Category
          <input value={category} onChange={(event) => setCategory(event.target.value)} maxLength={80} placeholder="Fantasy, Poetry, Concept Art..." className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 font-normal outline-none focus:border-[var(--wf-success-700)] focus:ring-4 focus:ring-[var(--wf-success-100)]" />
        </label>

        <label className="mt-5 block text-sm font-semibold text-[var(--wf-neutral-700)]">
          Tags
          <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="worldbuilding, mystery, character design" className="mt-2 w-full rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 font-normal outline-none focus:border-[var(--wf-success-700)] focus:ring-4 focus:ring-[var(--wf-success-100)]" />
          <span className="mt-1 block font-normal text-[var(--wf-neutral-400)]">Separate tags with commas. Up to 10 tags will be saved.</span>
        </label>

        <label className="mt-5 flex items-center gap-3 rounded-xl bg-[var(--wf-palette-f0fcfa)] p-4 text-sm font-semibold text-[var(--wf-palette-004239)]">
          <input type="checkbox" checked={allowComments} onChange={(event) => setAllowComments(event.target.checked)} className="h-4 w-4 accent-[var(--wf-palette-004239)]" />
          Allow community comments
        </label>

        {errorMessage && <p className="mt-5 rounded-xl bg-[var(--wf-danger-50)] p-3 text-sm text-[var(--wf-danger-700)]">{errorMessage}</p>}

        <div className="mt-7 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl border border-[var(--wf-neutral-300)] px-5 py-3 font-semibold text-[var(--wf-neutral-700)] hover:bg-[var(--wf-neutral-50)]">Cancel</button>
          <button type="submit" disabled={isSaving} className="rounded-xl bg-[var(--wf-palette-004239)] px-5 py-3 font-semibold text-[var(--wf-surface)] hover:bg-[var(--wf-palette-002d27)] disabled:opacity-60">
            {isSaving ? "Publishing..." : isUpdate ? "Save Publication" : "Publish Project"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default PublishProjectModal;
