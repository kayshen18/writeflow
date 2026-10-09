import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  addCollaborator,
  getCollaborators,
  removeCollaborator,
} from "../../lib/api";
import type { Collaborator } from "../../lib/api";

type CollaboratorPanelProps = {
  workId: string;
  onClose: () => void;
};

function CollaboratorPanel({
  workId,
  onClose,
}: CollaboratorPanelProps) {
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadCollaborators() {
    try {
      setIsLoading(true);
      setMessage("");

      const data = await getCollaborators(workId);
      setCollaborators(data.collaborators);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load collaborators.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCollaborators();
  }, [workId]);

  async function handleAddCollaborator(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setMessage("Please enter an email address.");
      return;
    }

    try {
      setIsSubmitting(true);
      setMessage("");

      await addCollaborator(
        workId,
        trimmedEmail,
        role,
      );

      await loadCollaborators();

      setEmail("");
      setRole("editor");
      setMessage("Collaborator added successfully.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to add this collaborator.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveCollaborator(userId: string) {
    const shouldRemove = window.confirm(
      "Remove this collaborator from the work?",
    );

    if (!shouldRemove) {
      return;
    }

    try {
      setMessage("");

      await removeCollaborator(workId, userId);

      setCollaborators((currentCollaborators) =>
        currentCollaborators.filter(
          (collaborator) => collaborator.id !== userId,
        ),
      );

      setMessage("Collaborator removed.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to remove this collaborator.",
      );
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--wf-neutral-950)]/40 p-4">
      <section className="w-full max-w-xl rounded-3xl bg-[var(--wf-surface)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold text-[var(--wf-neutral-900)]">
              Collaborators
            </h2>

            <p className="mt-1 text-sm text-[var(--wf-neutral-500)]">
              Invite registered WriteFlow users to view or edit this work.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-xl text-[var(--wf-neutral-500)] transition hover:bg-[var(--wf-neutral-100)] hover:text-[var(--wf-neutral-900)]"
            aria-label="Close collaborators panel"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleAddCollaborator}
          className="mt-6 grid gap-3 sm:grid-cols-[1fr_130px_auto]"
        >
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Collaborator email"
            className="rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 outline-none transition focus:border-[var(--wf-success-600)] focus:ring-4 focus:ring-[var(--wf-success-100)]"
          />

          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as "editor" | "viewer")
            }
            className="rounded-xl border border-[var(--wf-neutral-300)] px-3 py-3 outline-none transition focus:border-[var(--wf-success-600)] focus:ring-4 focus:ring-[var(--wf-success-100)]"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-[var(--wf-success-800)] px-5 py-3 font-semibold text-[var(--wf-surface)] transition hover:bg-[var(--wf-success-900)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Adding..." : "Invite"}
          </button>
        </form>

        <p className="mt-3 text-xs text-[var(--wf-neutral-500)]">
          Editors can save changes. Viewers can only open and read the work.
        </p>

        {message && (
          <p className="mt-4 rounded-xl bg-[var(--wf-neutral-100)] px-4 py-3 text-sm text-[var(--wf-neutral-700)]">
            {message}
          </p>
        )}

        <div className="mt-6 max-h-72 space-y-3 overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-[var(--wf-neutral-500)]">
              Loading collaborators...
            </p>
          ) : collaborators.length === 0 ? (
            <p className="rounded-2xl bg-[var(--wf-neutral-50)] p-4 text-sm text-[var(--wf-neutral-500)]">
              This work has no collaborators yet.
            </p>
          ) : (
            collaborators.map((collaborator) => (
              <div
                key={collaborator.id}
                className="flex items-center gap-3 rounded-2xl border border-[var(--wf-neutral-200)] p-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--wf-success-100)] font-semibold text-[var(--wf-success-900)]">
                  {collaborator.display_name.charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[var(--wf-neutral-900)]">
                    {collaborator.display_name}
                  </p>

                  <p className="truncate text-sm text-[var(--wf-neutral-500)]">
                    {collaborator.email}
                  </p>
                </div>

                <span className="rounded-full bg-[var(--wf-neutral-100)] px-3 py-1 text-xs font-semibold capitalize text-[var(--wf-neutral-600)]">
                  {collaborator.role}
                </span>

                <button
                  type="button"
                  onClick={() =>
                    void handleRemoveCollaborator(collaborator.id)
                  }
                  className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--wf-danger-600)] transition hover:bg-[var(--wf-danger-50)]"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

export default CollaboratorPanel;
