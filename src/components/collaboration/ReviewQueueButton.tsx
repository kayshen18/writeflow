import { useEffect, useState } from "react";
import { getWorkChangeRequests } from "../../lib/api";
import { socket } from "../../lib/socket";

type ReviewQueueButtonProps = {
  workId: string;
  onOpen: () => void;
  className?: string;
};

function ReviewQueueButton({
  workId,
  onOpen,
  className = "",
}: ReviewQueueButtonProps) {
  const [pendingCount, setPendingCount] = useState(0);

  async function loadPendingCount() {
    try {
      const result = await getWorkChangeRequests(workId);

      setPendingCount(result.requests.length);
    } catch {
      setPendingCount(0);
    }
  }

  useEffect(() => {
    void loadPendingCount();

    function refreshPendingCount(payload?: {
      workId?: string;
    }) {
      if (payload?.workId && payload.workId !== workId) {
        return;
      }

      void loadPendingCount();
    }

    function handleQueueUpdated() {
      void loadPendingCount();
    }

    socket.on("changes-submitted", refreshPendingCount);
    socket.on("changes-withdrawn", refreshPendingCount);

    window.addEventListener(
      "writeflow-review-queue-updated",
      handleQueueUpdated,
    );

    return () => {
      socket.off("changes-submitted", refreshPendingCount);
      socket.off("changes-withdrawn", refreshPendingCount);

      window.removeEventListener(
        "writeflow-review-queue-updated",
        handleQueueUpdated,
      );
    };
  }, [workId]);

  return (
    <button
      type="button"
      onClick={() => {
        void loadPendingCount();
        onOpen();
      }}
      className={["relative", className].join(" ")}
    >
      Queue

      {pendingCount > 0 && (
        <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--wf-action-contrast)] px-1.5 py-0.5 text-xs font-bold text-[var(--wf-action-contrast-text)]">
          {pendingCount}
        </span>
      )}
    </button>
  );
}

export default ReviewQueueButton;
