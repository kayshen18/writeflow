import { useEffect, useState } from "react";
import {
  getMyWork,
  getWorkChangeRequests,
  reviewChangeRequest,
  type WorkChangeRequest,
} from "../../lib/api";
import { socket } from "../../lib/socket";
import UserAvatar from "../user/UserAvatar";
import SubmittedWorkPreview from "./SubmittedWorkPreview";

type ReviewQueuePanelProps = {
  workId: string;
  onClose: () => void;
  onAccepted: () => void;
};

function ReviewQueuePanel({
  workId,
  onClose,
  onAccepted,
}: ReviewQueuePanelProps) {
  const [requests, setRequests] = useState<WorkChangeRequest[]>([]);
  const [selectedRequest, setSelectedRequest] =
    useState<WorkChangeRequest | null>(null);

  const [officialContent, setOfficialContent] = useState<unknown>(null);
  const [officialTitle, setOfficialTitle] = useState("");
  const [officialVersion, setOfficialVersion] = useState(0);

  const [reviewComment, setReviewComment] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  async function loadRequests() {
    try {
      setIsLoading(true);
      setMessage("");

      const [requestResult, workResult] = await Promise.all([
        getWorkChangeRequests(workId),
        getMyWork(workId),
      ]);

      setRequests(requestResult.requests);
      setOfficialTitle(workResult.work.title);
      setOfficialContent(workResult.work.content_json);
      setOfficialVersion(workResult.work.current_version);

      setSelectedRequest((currentRequest) => {
        if (!currentRequest) {
          return requestResult.requests[0] ?? null;
        }

        return (
          requestResult.requests.find(
            (request) => request.id === currentRequest.id,
          ) ?? null
        );
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load the review queue.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRequests();

    function refreshQueue(payload?: { workId?: string }) {
      if (payload?.workId && payload.workId !== workId) {
        return;
      }

      void loadRequests();
    }

    socket.on("changes-submitted", refreshQueue);
    socket.on("changes-withdrawn", refreshQueue);

    return () => {
      socket.off("changes-submitted", refreshQueue);
      socket.off("changes-withdrawn", refreshQueue);
    };
  }, [workId]);

  async function handleAccept() {
    if (!selectedRequest || isProcessing) {
      return;
    }

    if (selectedRequest.base_version !== officialVersion) {
      setMessage(
        "This draft is outdated and cannot be accepted. Ask the editor to update it from the latest official version.",
      );
      return;
    }

    try {
      setIsProcessing(true);
      setMessage("");

      await reviewChangeRequest(workId, selectedRequest.id, {
        decision: "accept",
      });

      window.dispatchEvent(
        new Event("writeflow-review-queue-updated"),
      );

      setMessage("Changes accepted.");
      onAccepted();

      await loadRequests();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to accept these changes.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleReject() {
    if (!selectedRequest || isProcessing) {
      return;
    }

    const trimmedComment = reviewComment.trim();

    if (!trimmedComment) {
      setMessage(
        "Please explain why these changes need revision.",
      );
      return;
    }

    try {
      setIsProcessing(true);
      setMessage("");

      await reviewChangeRequest(workId, selectedRequest.id, {
        decision: "reject",
        reviewComment: trimmedComment,
      });

      const rejectedRequestId = selectedRequest.id;

      setRequests((currentRequests) => {
        const remainingRequests = currentRequests.filter(
          (request) => request.id !== rejectedRequestId,
        );

        setSelectedRequest(remainingRequests[0] ?? null);

        return remainingRequests;
      });

      setReviewComment("");
      setMessage(
        "Changes rejected. The reviewer feedback was sent.",
      );

      window.dispatchEvent(
        new Event("writeflow-review-queue-updated"),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to reject these changes.",
      );
    } finally {
      setIsProcessing(false);
    }
  }

  const isOutdated =
    selectedRequest !== null &&
    selectedRequest.base_version !== officialVersion;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--wf-neutral-950)]/40 p-4">
      <section className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-[var(--wf-surface)] shadow-2xl">
        <div className="flex items-start justify-between gap-6 border-b border-[var(--wf-neutral-200)] p-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--wf-success-700)]">
              Collaboration
            </p>

            <h2 className="mt-1 text-2xl font-bold text-[var(--wf-neutral-900)]">
              Review Queue
            </h2>

            <p className="mt-1 text-sm text-[var(--wf-neutral-500)]">
              Official version: {officialVersion || "Loading..."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-xl text-[var(--wf-neutral-500)] transition hover:bg-[var(--wf-neutral-100)] hover:text-[var(--wf-neutral-900)]"
            aria-label="Close review queue"
          >
            ×
          </button>
        </div>

        {message && (
          <p className="mx-6 mt-5 rounded-xl bg-[var(--wf-neutral-100)] px-4 py-3 text-sm text-[var(--wf-neutral-700)]">
            {message}
          </p>
        )}

        <div className="grid min-h-0 flex-1 md:grid-cols-[300px_1fr]">
          <aside className="max-h-[65vh] overflow-y-auto border-b border-[var(--wf-neutral-200)] bg-[var(--wf-neutral-50)] p-4 md:border-b-0 md:border-r">
            {isLoading ? (
              <p className="p-3 text-sm text-[var(--wf-neutral-500)]">
                Loading requests...
              </p>
            ) : requests.length === 0 ? (
              <p className="rounded-2xl bg-[var(--wf-surface)] p-4 text-sm text-[var(--wf-neutral-500)]">
                No changes are waiting for review.
              </p>
            ) : (
              <div className="space-y-2">
                {requests.map((request) => {
                  const requestIsOutdated =
                    request.base_version !== officialVersion;

                  return (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => {
                        setSelectedRequest(request);
                        setReviewComment("");
                        setMessage("");
                      }}
                      className={[
                        "w-full rounded-2xl p-3 text-left transition",
                        selectedRequest?.id === request.id
                          ? "bg-[var(--wf-success-800)] text-[var(--wf-surface)]"
                          : "bg-[var(--wf-surface)] text-[var(--wf-neutral-700)] hover:bg-[var(--wf-success-50)]",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          displayName={request.requester_name}
                          avatarPath={request.requester_avatar_path}
                          size="sm"
                          className={
                            selectedRequest?.id === request.id
                              ? "border-2 border-[var(--wf-surface)]"
                              : ""
                          }
                        />

                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {request.requester_name}
                          </p>

                          <p
                            className={[
                              "mt-1 truncate text-xs",
                              selectedRequest?.id === request.id
                                ? "text-[var(--wf-success-100)]"
                                : "text-[var(--wf-neutral-500)]",
                            ].join(" ")}
                          >
                            Based on Version {request.base_version}
                          </p>

                          {requestIsOutdated && (
                            <span
                              className={[
                                "mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                                selectedRequest?.id === request.id
                                  ? "bg-[var(--wf-warning-200)] text-[var(--wf-warning-950)]"
                                  : "bg-[var(--wf-warning-100)] text-[var(--wf-warning-800)]",
                              ].join(" ")}
                            >
                              Outdated
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <div className="min-h-0 overflow-y-auto p-6">
            {!selectedRequest ? (
              <div className="flex min-h-64 items-center justify-center rounded-2xl border-2 border-dashed border-[var(--wf-neutral-200)] p-8 text-center text-[var(--wf-neutral-500)]">
                Select a change request to review it.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <UserAvatar
                    displayName={selectedRequest.requester_name}
                    avatarPath={selectedRequest.requester_avatar_path}
                    size="md"
                  />

                  <div>
                    <p className="font-semibold text-[var(--wf-neutral-900)]">
                      {selectedRequest.requester_name}
                    </p>

                    <p className="text-sm text-[var(--wf-neutral-500)]">
                      Submitted a draft based on Version{" "}
                      {selectedRequest.base_version}
                    </p>
                  </div>
                </div>

                {isOutdated && (
                  <div className="mt-5 rounded-2xl border border-[var(--wf-warning-200)] bg-[var(--wf-warning-50)] p-4 text-sm text-[var(--wf-warning-900)]">
                    <p className="font-bold">Outdated draft</p>

                    <p className="mt-1">
                      The official work is now Version {officialVersion}.
                      This submission was based on Version{" "}
                      {selectedRequest.base_version}, so accepting it could
                      overwrite newer work.
                    </p>
                  </div>
                )}

                <div className="mt-6 grid gap-6 xl:grid-cols-2">
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-bold uppercase tracking-wide text-[var(--wf-neutral-500)]">
                        Current official version
                      </p>

                      <span className="text-xs text-[var(--wf-neutral-400)]">
                        {officialTitle}
                      </span>
                    </div>

                    <SubmittedWorkPreview content={officialContent} />
                  </section>

                  <section>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-sm font-bold uppercase tracking-wide text-[var(--wf-success-700)]">
                        Submitted draft
                      </p>

                      <span className="text-xs text-[var(--wf-neutral-400)]">
                        {selectedRequest.submitted_title}
                      </span>
                    </div>

                    <SubmittedWorkPreview
                      content={selectedRequest.submitted_content_json}
                    />
                  </section>
                </div>

                <label className="mt-6 block text-sm font-semibold text-[var(--wf-neutral-700)]">
                  Reject reason
                  <textarea
                    value={reviewComment}
                    onChange={(event) =>
                      setReviewComment(event.target.value)
                    }
                    maxLength={1000}
                    rows={4}
                    placeholder="Explain what needs revision. This is required only when rejecting."
                    className="mt-2 w-full resize-y rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 font-normal outline-none transition focus:border-[var(--wf-success-700)] focus:ring-4 focus:ring-[var(--wf-success-100)]"
                  />
                </label>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleAccept()}
                    disabled={isProcessing || isOutdated}
                    title={
                      isOutdated
                        ? "This draft is based on an old official version."
                        : undefined
                    }
                    className="rounded-xl bg-[var(--wf-success-800)] px-5 py-3 font-semibold text-[var(--wf-surface)] transition hover:bg-[var(--wf-success-900)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isProcessing
                      ? "Reviewing..."
                      : isOutdated
                        ? "Cannot accept outdated draft"
                        : "Accept changes"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleReject()}
                    disabled={isProcessing}
                    className="rounded-xl border border-[var(--wf-danger-200)] bg-[var(--wf-surface)] px-5 py-3 font-semibold text-[var(--wf-danger-600)] transition hover:bg-[var(--wf-danger-50)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Reject changes
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export default ReviewQueuePanel;
