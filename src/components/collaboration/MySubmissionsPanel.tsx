import { useEffect, useState } from "react";
import {
  getMyChangeRequests,
  withdrawChangeRequest,
  type MyChangeRequest,
} from "../../lib/api";

type MySubmissionsPanelProps = {
  workId: string;
  onClose: () => void;
};

function getStatusStyle(
  status: MyChangeRequest["status"],
) {
  if (status === "accepted") {
    return "bg-[var(--wf-success-100)] text-[var(--wf-success-800)]";
  }

  if (status === "rejected") {
    return "bg-[var(--wf-danger-100)] text-[var(--wf-danger-700)]";
  }

  if (status === "pending") {
    return "bg-[var(--wf-warning-100)] text-[var(--wf-warning-800)]";
  }

  return "bg-[var(--wf-neutral-100)] text-[var(--wf-neutral-700)]";
}

function getStatusText(
  status: MyChangeRequest["status"],
) {
  if (status === "accepted") {
    return "Accepted";
  }

  if (status === "rejected") {
    return "Needs revision";
  }

  if (status === "pending") {
    return "Waiting for review";
  }

  return "Withdrawn";
}

function MySubmissionsPanel({
  workId,
  onClose,
}: MySubmissionsPanelProps) {
  const [requests, setRequests] = useState<
    MyChangeRequest[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [withdrawingRequestId, setWithdrawingRequestId] =
    useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadRequests() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const result = await getMyChangeRequests(workId);

        if (!ignore) {
          setRequests(result.requests);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Unable to load your submissions.",
          );
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadRequests();

    return () => {
      ignore = true;
    };
  }, [workId]);

  async function handleWithdraw(
    request: MyChangeRequest,
  ) {
    const confirmed = window.confirm(
      "Withdraw this submission? The owner will no longer be able to review it. Your private draft will remain available for editing.",
    );

    if (!confirmed) {
      return;
    }

    try {
      setWithdrawingRequestId(request.id);
      setErrorMessage("");
      setSuccessMessage("");

      await withdrawChangeRequest(workId, request.id);

      setRequests((currentRequests) =>
        currentRequests.map((currentRequest) =>
          currentRequest.id === request.id
            ? {
                ...currentRequest,
                status: "withdrawn",
              }
            : currentRequest,
        ),
      );

      window.dispatchEvent(
        new Event("writeflow-review-queue-updated"),
      );

      setSuccessMessage(
        "Submission withdrawn. You can continue editing your private draft.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to withdraw this submission.",
      );
    } finally {
      setWithdrawingRequestId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[var(--wf-neutral-950)]/40 p-4">
      <section className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-[var(--wf-surface)] shadow-2xl">
        <div className="flex items-start justify-between gap-6 border-b border-[var(--wf-neutral-200)] p-6">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-[var(--wf-success-700)]">
              Collaboration
            </p>

            <h2 className="mt-1 text-2xl font-bold text-[var(--wf-neutral-900)]">
              My Submissions
            </h2>

            <p className="mt-1 text-sm text-[var(--wf-neutral-500)]">
              Review the status and feedback for your submitted changes.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-xl text-[var(--wf-neutral-500)] transition hover:bg-[var(--wf-neutral-100)] hover:text-[var(--wf-neutral-900)]"
            aria-label="Close my submissions"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {errorMessage && (
            <p className="mb-4 rounded-xl bg-[var(--wf-danger-50)] p-4 text-sm text-[var(--wf-danger-700)]">
              {errorMessage}
            </p>
          )}

          {successMessage && (
            <p className="mb-4 rounded-xl bg-[var(--wf-success-50)] p-4 text-sm text-[var(--wf-success-800)]">
              {successMessage}
            </p>
          )}

          {isLoading ? (
            <p className="text-[var(--wf-neutral-500)]">
              Loading your submissions...
            </p>
          ) : requests.length === 0 ? (
            <div className="rounded-2xl bg-[var(--wf-neutral-50)] p-6 text-center">
              <p className="font-semibold text-[var(--wf-neutral-700)]">
                No submitted changes yet.
              </p>

              <p className="mt-2 text-sm text-[var(--wf-neutral-500)]">
                Switch to Draft Mode, save your draft, and submit it for owner review.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((request) => (
                <article
                  key={request.id}
                  className="rounded-2xl border border-[var(--wf-neutral-200)] p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-[var(--wf-neutral-900)]">
                        {request.submitted_title}
                      </h3>

                      <p className="mt-1 text-sm text-[var(--wf-neutral-500)]">
                        Submitted{" "}
                        {new Date(
                          request.created_at,
                        ).toLocaleString("en-US")}
                      </p>
                    </div>

                    <span
                      className={[
                        "rounded-full px-3 py-1 text-xs font-bold",
                        getStatusStyle(request.status),
                      ].join(" ")}
                    >
                      {getStatusText(request.status)}
                    </span>
                  </div>

                  <p className="mt-4 text-sm text-[var(--wf-neutral-500)]">
                    Based on official version {request.base_version}
                  </p>

                  {request.status === "rejected" &&
                    request.review_comment && (
                      <div className="mt-4 rounded-xl bg-[var(--wf-danger-50)] p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-[var(--wf-danger-700)]">
                          Owner feedback
                        </p>

                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--wf-danger-800)]">
                          {request.review_comment}
                        </p>
                      </div>
                    )}

                  {request.status === "accepted" &&
                    request.reviewed_at && (
                      <p className="mt-4 text-sm text-[var(--wf-success-700)]">
                        Accepted{" "}
                        {new Date(
                          request.reviewed_at,
                        ).toLocaleString("en-US")}
                      </p>
                    )}

                  {request.status === "pending" && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleWithdraw(request)
                      }
                      disabled={
                        withdrawingRequestId === request.id
                      }
                      className="mt-5 rounded-xl border border-[var(--wf-neutral-300)] bg-[var(--wf-surface)] px-4 py-2 text-sm font-semibold text-[var(--wf-neutral-700)] transition hover:border-[var(--wf-danger-200)] hover:bg-[var(--wf-danger-50)] hover:text-[var(--wf-danger-700)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {withdrawingRequestId === request.id
                        ? "Withdrawing..."
                        : "Withdraw submission"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export default MySubmissionsPanel;
