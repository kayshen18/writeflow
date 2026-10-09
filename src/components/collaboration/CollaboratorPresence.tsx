import { useEffect, useState } from "react";
import {
  getSavedUser,
  getUploadUrl,
} from "../../lib/api";
import { socket } from "../../lib/socket";

type CollaboratorPresenceProps = {
  workId: string;
};

type WorkSavedPayload = {
  workId: string;
  savedBy: string;
};

type ChangesAcceptedPayload = {
  workId: string;
  requesterName: string;
};

type ChangesRejectedPayload = {
  workId: string;
  requesterId: string;
  reviewComment: string;
};

type CollaboratorActivityPayload = {
  socketId: string;
  displayName: string;
};

type ActiveWorkMember = {
  socketId: string;
  displayName: string;
  avatarPath: string | null;
};

type PresenceUpdatedPayload = {
  workId: string;
  members: ActiveWorkMember[];
};

type ChangesSubmittedPayload = {
  workId: string;
  requesterId: string;
  requesterName: string;
};

function MemberAvatar({
  member,
}: {
  member: ActiveWorkMember;
}) {
  const [imageFailed, setImageFailed] =
    useState(false);

  const firstLetter =
    member.displayName
      .charAt(0)
      .toUpperCase() || "?";

  if (member.avatarPath && !imageFailed) {
    return (
      <img
        src={getUploadUrl(member.avatarPath)}
        alt={member.displayName}
        title={member.displayName}
        onError={() => setImageFailed(true)}
        className="h-7 w-7 rounded-full border-2 border-[var(--wf-surface)] object-cover"
      />
    );
  }

  return (
    <div
      title={member.displayName}
      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--wf-surface)] bg-[var(--wf-subtle)] text-xs font-bold text-[var(--wf-tool)]"
    >
      {firstLetter}
    </div>
  );
}

function CollaboratorPresence({
  workId,
}: CollaboratorPresenceProps) {
  const [isConnected, setIsConnected] = useState(
    socket.connected,
  );

  const [activityMessage, setActivityMessage] =
    useState(
      "Connecting to live collaboration...",
    );

  const [hasNewVersion, setHasNewVersion] =
    useState(false);

  const [members, setMembers] = useState<
    ActiveWorkMember[]
  >([]);

  useEffect(() => {
    function handleConnect() {
      setIsConnected(true);

      socket.emit("join-work", workId);

      setActivityMessage(
        "Live collaboration is enabled.",
      );
    }

    function handleDisconnect() {
      setIsConnected(false);
      setMembers([]);

      setActivityMessage(
        "Live collaboration is disconnected.",
      );
    }

    function handleCollaboratorJoined(
      payload: CollaboratorActivityPayload,
    ) {
      setActivityMessage(
        `${payload.displayName} opened this work.`,
      );
    }

    function handleCollaboratorLeft(
      payload: CollaboratorActivityPayload,
    ) {
      setActivityMessage(
        `${payload.displayName} left this work.`,
      );
    }

    function handlePresenceUpdated(
      payload: PresenceUpdatedPayload,
    ) {
      if (payload.workId !== workId) {
        return;
      }

      setMembers(payload.members);
    }

    function handleChangesSubmitted(
        payload: ChangesSubmittedPayload,
    ) {
        const currentUser = getSavedUser();

        if (
            payload.workId !== workId ||
            payload.requesterId === currentUser?.id
        ) {
            return;
        }

        setActivityMessage(
            `${payload.requesterName} submitted changes for review.`,
        );
    }

    function handleChangesAccepted(
        payload: ChangesAcceptedPayload,
    ) {
        if (payload.workId !== workId) {
            return;
        }

        setHasNewVersion(true);

        setActivityMessage(
            `${payload.requesterName}'s changes were accepted. Refresh to new version.`,
        );
    }

    function handleChangesRejected(
        payload: ChangesRejectedPayload,
    ) {
        const currentUser = getSavedUser();

        if (
            payload.workId !== workId ||
            payload.requesterId !== currentUser?.id
        ) {
            return;
        }

        setActivityMessage(
            `Your changes were rejected: ${payload.reviewComment}`,
        );
    }

    function handleWorkSaved(
      payload: WorkSavedPayload,
    ) {
      const currentUser = getSavedUser();

      if (
        payload.workId !== workId ||
        payload.savedBy === currentUser?.id
      ) {
        return;
      }

      setHasNewVersion(true);

      setActivityMessage(
        "This work was updated by a collaborator.",
      );
    }

    function handleWorkAccessDenied(
      payload: {
        message?: string;
      },
    ) {
      setIsConnected(false);

      setActivityMessage(
        payload.message ??
          "You do not have access to this work.",
      );
    }

    socket.on("connect", handleConnect);

    socket.on(
      "disconnect",
      handleDisconnect,
    );

    socket.on(
      "collaborator-joined",
      handleCollaboratorJoined,
    );

    socket.on(
      "collaborator-left",
      handleCollaboratorLeft,
    );

    socket.on(
      "presence-updated",
      handlePresenceUpdated,
    );

    socket.on(
      "work-saved",
      handleWorkSaved,
    );

    socket.on(
      "work-access-denied",
      handleWorkAccessDenied,
    );

    socket.on(
        "changes-accepted",
        handleChangesAccepted,
    );

    socket.on(
        "changes-rejected",
        handleChangesRejected,
    );

    socket.on(
        "changes-submitted",
        handleChangesSubmitted,
    );

    if (!socket.connected) {
      socket.connect();
    } else {
      socket.emit("join-work", workId);

      setIsConnected(true);

      setActivityMessage(
        "Live collaboration is enabled.",
      );
    }

    return () => {
      socket.emit("leave-work", workId);

      socket.off("connect", handleConnect);

      socket.off(
        "disconnect",
        handleDisconnect,
      );

      socket.off(
        "collaborator-joined",
        handleCollaboratorJoined,
      );

      socket.off(
        "collaborator-left",
        handleCollaboratorLeft,
      );

      socket.off(
        "presence-updated",
        handlePresenceUpdated,
      );

      socket.off(
        "work-saved",
        handleWorkSaved,
      );

      socket.off(
        "work-access-denied",
        handleWorkAccessDenied,
      );

      socket.off(
        "changes-accepted",
        handleChangesAccepted,
      );

      socket.off(
        "changes-rejected",
        handleChangesRejected,
      );

      socket.off(
        "changes-submitted",
        handleChangesSubmitted,
      );

      socket.disconnect();
    };
  }, [workId]);

  return (
    <details className="relative shrink-0">
      <summary
        className="flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-[var(--wf-button-border)] bg-[var(--wf-surface)] px-3 text-sm text-[var(--wf-text)] focus-visible:outline-2 focus-visible:outline-[var(--wf-focus)] [&::-webkit-details-marker]:hidden"
        aria-label="Collaboration status and activity"
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${isConnected ? "bg-[var(--wf-online)]" : "bg-[var(--wf-offline)]"}`} />
        <span>{isConnected ? "Live" : "Offline"}</span>
        {members.length > 0 && (
          <span className="flex -space-x-2">
            {members.slice(0, 2).map((member) => (
              <MemberAvatar key={member.socketId} member={member} />
            ))}
          </span>
        )}
        <span>{members.length}</span>
        {hasNewVersion && (
          <span className="h-2 w-2 rounded-full bg-[var(--wf-save)]" aria-label="New version available" />
        )}
      </summary>
      <div className="absolute left-0 top-full z-50 mt-3 w-72 rounded-xl border border-[var(--wf-border)] bg-[var(--wf-surface)] p-4 text-sm text-[var(--wf-text)] shadow-lg">
        <p role="status" className="break-words">{activityMessage}</p>
        <p className="mt-3 text-[var(--wf-muted)]">
          {members.length === 1 ? "1 viewer" : `${members.length} viewers`}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {members.map((member) => (
            <MemberAvatar key={member.socketId} member={member} />
          ))}
        </div>
        {hasNewVersion && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="wf-editor-action wf-editor-action--save mt-3"
          >
            Refresh now
          </button>
        )}
      </div>
    </details>
  );
}

export default CollaboratorPresence;
