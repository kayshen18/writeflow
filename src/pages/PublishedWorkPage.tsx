import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router";
import { StaticCanvas } from "fabric";
import {
  bookmarkWork,
  createWorkComment,
  deleteWorkComment,
  followUser,
  getFollowStatus,
  unfollowUser,
  getSavedUser,
  getBookmarkStatus,
  getLikeStatus,
  getPublishedWork,
  getUploadUrl,
  getWorkComments,
  likeWork,
  removeBookmark,
  unlikeWork,
  type WorkComment,
} from "../lib/api";
import UserAvatar from "../components/user/UserAvatar";

type PublishedWork = {
  id: string;
  title: string;
  content_json: unknown;
  description: string | null;
  cover_path: string | null;
  category: string | null;
  tags: string[] | null;
  work_type: "writing" | "drawing";
  published_at: string | null;
  author_id: string;
  author_name: string | null;
  author_avatar_path: string | null;
};

type SlateNode = {
  text?: string;
  type?: string;
  url?: string;
  src?: string;
  filePath?: string;
  children?: SlateNode[];
};

function nodeText(node: SlateNode): string {
  if (typeof node.text === "string") {
    return node.text;
  }

  return (node.children ?? []).map(nodeText).join("");
}

function parseWriting(content: string): SlateNode[] {
  try {
    const parsed: unknown = JSON.parse(content);
    return Array.isArray(parsed) ? (parsed as SlateNode[]) : [];
  } catch {
    return [{ children: [{ text: content }] }];
  }
}

function PublishedWorkPage() {
  const { workId } = useParams<{ workId: string }>();
  const currentUser = getSavedUser();
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const [work, setWork] = useState<PublishedWork | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [likeCount, setLikeCount] = useState(0);
  const [isLiked, setIsLiked] = useState(false);
  const [isLikeLoading, setIsLikeLoading] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isBookmarkLoading, setIsBookmarkLoading] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [comments, setComments] = useState<WorkComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [isCommentsLoading, setIsCommentsLoading] = useState(true);
  const [isCommentSubmitting, setIsCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadWork() {
      if (!workId) {
        setErrorMessage("Work ID is missing.");
        setIsLoading(false);
        return;
      }

      try {
        const result = await getPublishedWork(workId);

        if (!ignore) {
          setWork(result.work);
        }
      } catch (error) {
        if (!ignore) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Published work not found.",
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
  }, [workId]);

  useEffect(() => {
    if (!workId) {
      return;
    }
    const currentWorkId = workId;

    async function loadLikeStatus() {
      try {
        const result = await getLikeStatus(currentWorkId);

        setLikeCount(result.likeCount);
        setIsLiked(result.liked);
      } catch {
        // Visitors who are not logged in can still read the work.
        setLikeCount(0);
        setIsLiked(false);
      }
    }

    void loadLikeStatus();
  }, [workId]);

  useEffect(() => {
    if (!workId) {
      return;
    }
    const currentWorkId = workId;

    async function loadBookmarkStatus() {
      try {
        const result = await getBookmarkStatus(currentWorkId);
        setIsBookmarked(result.bookmarked);
      } catch {
        setIsBookmarked(false);
      }
    }

    void loadBookmarkStatus();
  }, [workId]);

  useEffect(() => {
    if (!work?.author_id) {
      return;
    }
    const authorId = work.author_id;

    async function loadFollowStatus() {
      try {
        const result = await getFollowStatus(authorId);
        setIsFollowing(result.following);
      } catch {
        setIsFollowing(false);
      }
    }

    void loadFollowStatus();
  }, [work?.author_id]);

  useEffect(() => {
    if (!workId) {
      return;
    }
    const currentWorkId = workId;

    async function loadComments() {
      setIsCommentsLoading(true);

      try {
        const result = await getWorkComments(currentWorkId);
        setComments(result.comments);
      } catch (error) {
        setCommentError(
          error instanceof Error
            ? error.message
            : "Unable to load comments.",
        );
      } finally {
        setIsCommentsLoading(false);
      }
    }

    void loadComments();
  }, [workId]);

  useEffect(() => {
    if (work?.work_type !== "drawing" || !canvasElementRef.current) {
      return;
    }
    const drawingContent = work.content_json;

    const canvas = new StaticCanvas(canvasElementRef.current, {
      width: 1200,
      height: 800,
      backgroundColor: "#ffffff",
    });

    async function renderDrawing() {
      try {
        await canvas.loadFromJSON(typeof drawingContent === "string"
                                    ? JSON.parse(drawingContent)
                                    : drawingContent as Record<string, any>);
        canvas.getObjects().forEach((object) => {
          object.set({ selectable: false, evented: false });
        });
        canvas.requestRenderAll();
      } catch (error) {
        console.error("Unable to render drawing:", error);
      }
    }

    void renderDrawing();

    return () => {
      void canvas.dispose();
    };
  }, [work]);

  async function handleLike() {
    if (!workId || isLikeLoading) {
      return;
    }

    setIsLikeLoading(true);

    try {
      if (isLiked) {
        await unlikeWork(workId);

        setIsLiked(false);
        setLikeCount((currentCount) =>
          Math.max(0, currentCount - 1),
        );
      } else {
        await likeWork(workId);

        setIsLiked(true);
        setLikeCount((currentCount) => currentCount + 1);
      }
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Unable to update your like.",
      );
    } finally {
      setIsLikeLoading(false);
    }
  }

  async function handleBookmark() {
    if (!workId || isBookmarkLoading) {
      return;
    }

    setIsBookmarkLoading(true);

    try {
      if (isBookmarked) {
        await removeBookmark(workId);
        setIsBookmarked(false);
      } else {
        await bookmarkWork(workId);
        setIsBookmarked(true);
      }
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Unable to update your saved works.",
      );
    } finally {
      setIsBookmarkLoading(false);
    }
  }

  async function handleFollow() {
    if (
      !work?.author_id ||
      isFollowLoading
    ) {
      return;
    }

    const currentUser = getSavedUser();

    if (currentUser?.id === work.author_id) {
      return;
    }

    setIsFollowLoading(true);

    try {
      if (isFollowing) {
        await unfollowUser(work.author_id);
        setIsFollowing(false);
      } else {
        await followUser(work.author_id);
        setIsFollowing(true);
      }
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Unable to update follow status.",
      );
    } finally {
      setIsFollowLoading(false);
    }
  }

  async function handleCommentSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !workId ||
      !commentText.trim() ||
      isCommentSubmitting
    ) {
      return;
    }

    setIsCommentSubmitting(true);
    setCommentError("");

    try {
      await createWorkComment(workId, commentText.trim());

      const result = await getWorkComments(workId);

      setComments(result.comments);
      setCommentText("");
    } catch (error) {
      setCommentError(
        error instanceof Error
          ? error.message
          : "Unable to post your comment.",
      );
    } finally {
      setIsCommentSubmitting(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    const confirmed = window.confirm(
      "Delete this comment permanently?",
    );

    if (!confirmed || !workId) {
      return;
    }

    try {
      await deleteWorkComment(commentId);

      setComments((currentComments) =>
        currentComments.filter(
          (comment) => comment.id !== commentId,
        ),
      );
    } catch (error) {
      setCommentError(
        error instanceof Error
          ? error.message
          : "Unable to delete comment.",
      );
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--wf-neutral-50)] text-[var(--wf-neutral-500)]">
        Loading published work...
      </div>
    );
  }

  if (errorMessage || !work) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--wf-neutral-50)] px-6 text-center">
        <h1 className="text-3xl font-bold text-[var(--wf-neutral-900)]">Work unavailable</h1>
        <p className="mt-3 max-w-xl text-[var(--wf-neutral-500)]">
          {errorMessage || "This work may be private or deleted."}
        </p>
        <Link to="/neighborhood" className="mt-6 rounded-xl bg-[var(--wf-primary-600)] px-5 py-3 font-semibold text-[var(--wf-surface)]">
          Back to Neighborhood
        </Link>
      </div>
    );
  }

  const writingNodes =
    work.work_type === "writing" ? parseWriting(
                                    typeof work.content_json === "string"
                                      ? work.content_json
                                      : JSON.stringify(work.content_json),
                                  ) : [];

  return (
    <div className="min-h-screen bg-[var(--wf-neutral-100)]">
      <header className="flex min-h-20 items-center border-b border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] px-8">
        <Link to="/" className="font-kranky text-4xl text-[var(--wf-neutral-900)]">
          WriteFlow
        </Link>
        <Link to="/neighborhood" className="ml-auto rounded-xl px-4 py-2 font-medium text-[var(--wf-neutral-600)] hover:bg-[var(--wf-neutral-100)]">
          Neighborhood
        </Link>
      </header>

      <section className="mt-8 rounded-3xl bg-[var(--wf-surface)] p-8 shadow-sm">
        <h2 className="text-2xl font-bold text-[var(--wf-neutral-900)]">
          Comments
        </h2>

        <form
          onSubmit={(event) => void handleCommentSubmit(event)}
          className="mt-5"
        >
          <textarea
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Share your thoughts about this work..."
            className="w-full resize-y rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 outline-none focus:border-[var(--wf-primary-500)]"
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-[var(--wf-neutral-400)]">
              {commentText.length}/1000
            </span>

            <button
              type="submit"
              disabled={
                isCommentSubmitting ||
                !commentText.trim()
              }
              className="rounded-xl bg-[var(--wf-palette-004239)] px-5 py-2.5 font-semibold text-[var(--wf-surface)] disabled:opacity-50"
            >
              {isCommentSubmitting
                ? "Posting..."
                : "Post Comment"}
            </button>
          </div>
        </form>

        {commentError && (
          <p className="mt-4 rounded-xl bg-[var(--wf-danger-50)] p-3 text-sm text-[var(--wf-danger-700)]">
            {commentError}
          </p>
        )}

        {isCommentsLoading ? (
          <p className="mt-6 text-[var(--wf-neutral-500)]">
            Loading comments...
          </p>
        ) : comments.length === 0 ? (
          <p className="mt-6 text-[var(--wf-neutral-500)]">
            No comments yet. Be the first to share your thoughts.
          </p>
        ) : (
          <div className="mt-6 space-y-4">
            {comments.map((comment) => (
              <article
                key={comment.id}
                className="rounded-2xl bg-[var(--wf-neutral-50)] p-5"
              >
                <div className="flex items-center gap-3">
                  <Link
                    to={`/creator/${comment.author_id}`}
                    className="shrink-0"
                  >
                    <UserAvatar
                      displayName={comment.author_name}
                      avatarPath={comment.author_avatar_path}
                      size="md"
                    />
                  </Link>

                  <div>
                    <div className="flex items-center gap-3">
                      <Link
                        to={`/creator/${comment.author_id}`}
                        className="font-semibold text-[var(--wf-neutral-900)] transition hover:text-[var(--wf-palette-004239)] hover:underline"
                      >
                        {comment.author_name}
                      </Link>

                      {currentUser?.id === comment.author_id && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteComment(comment.id)}
                          className="text-xs font-semibold text-[var(--wf-danger-500)] hover:text-[var(--wf-danger-700)]"
                        >
                          Delete
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-[var(--wf-neutral-400)]">
                      {new Date(
                        comment.created_at,
                      ).toLocaleString("en-US")}
                    </p>
                  </div>
                </div>

                <p className="mt-4 whitespace-pre-wrap leading-7 text-[var(--wf-neutral-700)]">
                  {comment.content}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="rounded-3xl bg-[var(--wf-surface)] p-8 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--wf-primary-50)] px-3 py-1 text-xs font-semibold text-[var(--wf-primary-700)]">
              {work.work_type === "drawing" ? "Artwork" : "Writing"}
            </span>
            {work.category && (
              <span className="rounded-full bg-[var(--wf-secondary-50)] px-3 py-1 text-xs font-semibold text-[var(--wf-secondary-700)]">
                {work.category}
              </span>
            )}
          </div>

          <h1 className="mt-5 text-4xl font-bold text-[var(--wf-neutral-900)]">{work.title}</h1>
          <div className="mt-4 flex items-center gap-3">
            <Link
              to={`/creator/${work.author_id}`}
              className="shrink-0"
            >
              <UserAvatar
                displayName={work.author_name || "WriteFlow Creator"}
                avatarPath={work.author_avatar_path}
                size="md"
              />
            </Link>

            <Link
              to={`/creator/${work.author_id}`}
              className="font-semibold text-[var(--wf-neutral-700)] transition hover:text-[var(--wf-palette-004239)] hover:underline"
            >
              {work.author_name}
            </Link>

            {currentUser?.id !== work.author_id && (
              <button
                type="button"
                onClick={() => void handleFollow()}
                disabled={isFollowLoading}
                className={[
                  "rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50",
                  isFollowing
                    ? "bg-[var(--wf-neutral-200)] text-[var(--wf-neutral-700)] hover:bg-[var(--wf-neutral-300)]"
                    : "bg-[var(--wf-palette-004239)] text-[var(--wf-surface)] hover:bg-[var(--wf-palette-69a097)]",
                ].join(" ")}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
            )}
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleLike()}
              disabled={isLikeLoading}
              className={[
                "rounded-xl px-4 py-2 font-semibold transition disabled:opacity-50",
                isLiked
                  ? "bg-[var(--wf-danger-100)] text-[var(--wf-danger-700)] hover:bg-[var(--wf-danger-200)]"
                  : "bg-[var(--wf-neutral-100)] text-[var(--wf-neutral-700)] hover:bg-[var(--wf-danger-50)] hover:text-[var(--wf-danger-700)]",
              ].join(" ")}
            >
              {isLiked ? "♥ Liked" : "♡ Like"}
            </button>

            <span className="text-sm text-[var(--wf-neutral-500)]">
              {likeCount} {likeCount === 1 ? "like" : "likes"}
            </span>

            <button
              type="button"
              onClick={() => void handleBookmark()}
              disabled={isBookmarkLoading}
              className={[
                "rounded-xl px-4 py-2 font-semibold transition disabled:opacity-50",
                isBookmarked
                  ? "bg-[var(--wf-warning-100)] text-[var(--wf-warning-700)] hover:bg-[var(--wf-warning-200)]"
                  : "bg-[var(--wf-neutral-100)] text-[var(--wf-neutral-700)] hover:bg-[var(--wf-warning-50)] hover:text-[var(--wf-warning-700)]",
              ].join(" ")}
            >
              {isBookmarked ? "★ Saved" : "☆ Save"}
            </button>
          </div>
          <p className="mt-4 max-w-3xl leading-7 text-[var(--wf-neutral-600)]">
            {work.description || "No description provided."}
          </p>

          {work.tags && work.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {work.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-[var(--wf-neutral-100)] px-3 py-1 text-xs text-[var(--wf-neutral-600)]">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {work.work_type === "drawing" ? (
          <div className="mt-8 overflow-auto rounded-3xl bg-[var(--wf-neutral-200)] p-6 shadow-inner">
            <div className="mx-auto w-fit overflow-hidden rounded-xl bg-[var(--wf-surface)] shadow-xl">
              <canvas ref={canvasElementRef} />
            </div>
          </div>
        ) : (
          <article className="mt-8 space-y-5 rounded-3xl bg-[var(--wf-surface)] p-10 shadow-sm">
            {writingNodes.map((node, index) => {
              const imageUrl = 
                node.url ?? 
                node.src ?? 
                (node.filePath
                  ? getUploadUrl(node.filePath) 
                  : undefined);

              if (node.type === "image" && imageUrl) {
                return (
                  <img
                    key={`${imageUrl}-${index}`}
                    src={imageUrl}
                    alt="Work illustration"
                    className="mx-auto max-h-[36rem] max-w-full rounded-2xl object-contain"
                  />
                );
              }

              return (
                <p key={index} className="whitespace-pre-wrap text-lg leading-8 text-[var(--wf-neutral-800)]">
                  {nodeText(node) || "\u00A0"}
                </p>
              );
            })}
          </article>
        )}
      </main>
    </div>
  );
}

export default PublishedWorkPage;
