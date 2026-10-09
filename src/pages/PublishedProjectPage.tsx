import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  bookmarkProject,
  createProjectComment,
  deleteProjectComment,
  getProjectComments,
  getProjectEngagement,
  getPublishedProject,
  getSavedUser,
  getUploadUrl,
  likeProject,
  removeProjectBookmark,
  unlikeProject,
  type ProjectComment,
  type PublicProjectItem,
  type PublishedProjectDetail,
} from "../lib/api";
import UserAvatar from "../components/user/UserAvatar";
import SubmittedWorkPreview from "../components/collaboration/SubmittedWorkPreview";

const roleLabels: Record<PublicProjectItem["item_role"], string> = {
  chapter: "Chapter",
  character: "Character",
  scene: "Scene",
  cover: "Cover",
  inspiration: "Inspiration",
  other: "Other",
};

function normalizeTags(tags: string[] | string) {
  if (Array.isArray(tags)) return tags;
  try {
    const parsed = JSON.parse(tags) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function PublishedProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const currentUser = getSavedUser();
  const [project, setProject] = useState<PublishedProjectDetail | null>(null);
  const [items, setItems] = useState<PublicProjectItem[]>([]);
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadComments(id: string) {
    const result = await getProjectComments(id);
    setComments(result.comments);
  }

  useEffect(() => {
    if (!projectId) return;
    let ignore = false;
    async function load() {
      try {
        const [projectResult, commentResult] = await Promise.all([
          getPublishedProject(projectId!),
          getProjectComments(projectId!),
        ]);
        if (ignore) return;
        setProject(projectResult.project);
        setItems(projectResult.items);
        setComments(commentResult.comments);
        if (currentUser) {
          const engagement = await getProjectEngagement(projectId!);
          if (!ignore) {
            setLikeCount(Number(engagement.likeCount));
            setLiked(engagement.liked);
            setBookmarked(engagement.bookmarked);
          }
        } else {
          setLikeCount(Number(projectResult.project.like_count ?? 0));
        }
      } catch (error) {
        if (!ignore) setErrorMessage(error instanceof Error ? error.message : "Unable to load this project.");
      } finally {
        if (!ignore) setIsLoading(false);
      }
    }
    void load();
    return () => { ignore = true; };
  }, [projectId]);

  const tags = useMemo(() => project ? normalizeTags(project.tags) : [], [project]);

  function requireLogin() {
    if (currentUser) return true;
    navigate("/login");
    return false;
  }

  async function handleLike() {
    if (!projectId || !requireLogin() || isBusy) return;
    setIsBusy(true);
    try {
      if (liked) {
        await unlikeProject(projectId);
        setLikeCount((count) => Math.max(0, count - 1));
      } else {
        await likeProject(projectId);
        setLikeCount((count) => count + 1);
      }
      setLiked((value) => !value);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update like.");
    } finally { setIsBusy(false); }
  }

  async function handleBookmark() {
    if (!projectId || !requireLogin() || isBusy) return;
    setIsBusy(true);
    try {
      if (bookmarked) await removeProjectBookmark(projectId);
      else await bookmarkProject(projectId);
      setBookmarked((value) => !value);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update bookmark.");
    } finally { setIsBusy(false); }
  }

  async function handleComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !requireLogin() || !comment.trim()) return;
    setIsBusy(true);
    try {
      await createProjectComment(projectId, comment.trim());
      setComment("");
      await loadComments(projectId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to post comment.");
    } finally { setIsBusy(false); }
  }

  async function handleDeleteComment(commentId: string) {
    if (!projectId) return;
    await deleteProjectComment(commentId);
    await loadComments(projectId);
  }

  if (isLoading) return <p className="p-12 text-center text-[var(--wf-neutral-500)]">Loading project...</p>;
  if (errorMessage && !project) return <div className="p-12 text-center text-[var(--wf-danger-700)]">{errorMessage}<br /><Link to="/neighborhood" className="mt-4 inline-block text-[var(--wf-palette-004239)]">Back to Neighborhood</Link></div>;
  if (!project) return null;

  return (
    <div className="min-h-screen bg-[var(--wf-palette-f0fcfa)] text-[var(--wf-neutral-800)]">
      <header className="flex min-h-20 items-center border-b border-[var(--wf-palette-c7e9e3)] bg-[var(--wf-surface)] px-8">
        <Link to="/" className="font-kranky text-4xl text-[var(--wf-palette-004239)]">WriteFlow</Link>
        <Link to="/neighborhood" className="ml-auto font-semibold text-[var(--wf-palette-004239)]">Neighborhood</Link>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link to="/neighborhood" className="text-sm font-semibold text-[var(--wf-success-800)]">← Back to Neighborhood</Link>
        <section className="mt-6 overflow-hidden rounded-3xl bg-[var(--wf-surface)] shadow-sm">
          {project.cover_path && <img src={getUploadUrl(project.cover_path)} alt={`${project.title} cover`} className="aspect-[3/1] w-full object-cover" />}
          <div className="p-8 sm:p-12">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[var(--wf-palette-d1fdf5)] px-3 py-1 text-xs font-bold text-[var(--wf-palette-004239)]">Project</span>
              {project.category && <span className="rounded-full bg-[var(--wf-secondary-50)] px-3 py-1 text-xs font-semibold text-[var(--wf-secondary-700)]">{project.category}</span>}
            </div>
            <h1 className="mt-5 text-4xl font-bold text-[var(--wf-palette-004239)] sm:text-5xl">{project.title}</h1>
            <Link to={`/creator/${project.author_id}`} className="mt-5 flex w-fit items-center gap-3">
              <UserAvatar displayName={project.author_name} avatarPath={project.author_avatar_path} size="sm" />
              <span className="font-semibold text-[var(--wf-palette-69a097)]">by {project.author_name}</span>
            </Link>
            <p className="mt-6 whitespace-pre-wrap leading-7 text-[var(--wf-neutral-600)]">{project.description || "No description provided."}</p>
            {tags.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{tags.map((tag) => <span key={tag} className="text-sm text-[var(--wf-success-700)]">#{tag}</span>)}</div>}
            <div className="mt-7 flex gap-3 border-t border-[var(--wf-neutral-100)] pt-6">
              <button onClick={() => void handleLike()} disabled={isBusy} className={`rounded-xl px-5 py-2.5 font-semibold ${liked ? "bg-[var(--wf-danger-100)] text-[var(--wf-danger-700)]" : "bg-[var(--wf-neutral-100)] text-[var(--wf-neutral-700)]"}`}>{liked ? "♥ Liked" : "♡ Like"} · {likeCount}</button>
              <button onClick={() => void handleBookmark()} disabled={isBusy} className={`rounded-xl px-5 py-2.5 font-semibold ${bookmarked ? "bg-[var(--wf-warning-100)] text-[var(--wf-warning-800)]" : "bg-[var(--wf-neutral-100)] text-[var(--wf-neutral-700)]"}`}>{bookmarked ? "Saved" : "Save"}</button>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-3xl font-bold text-[var(--wf-palette-004239)]">Project Contents</h2>
          <p className="mt-2 text-[var(--wf-neutral-500)]">{items.length} connected {items.length === 1 ? "work" : "works"}</p>
          <div className="mt-6 space-y-5">
            {items.map((item, index) => (
              <details key={item.project_item_id} open={index === 0} className="group rounded-2xl border border-[var(--wf-palette-c7e9e3)] bg-[var(--wf-surface)] shadow-sm">
                <summary className="flex cursor-pointer list-none items-center gap-4 p-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--wf-palette-d1fdf5)] font-bold text-[var(--wf-palette-004239)]">{index + 1}</span>
                  <div><p className="font-bold text-[var(--wf-palette-004239)]">{item.work_title}</p><p className="text-sm text-[var(--wf-neutral-500)]">{roleLabels[item.item_role]} · {item.work_type === "drawing" ? "Artwork" : "Writing"}</p></div>
                  <span className="ml-auto text-[var(--wf-neutral-400)] group-open:rotate-180">⌄</span>
                </summary>
                <div className="border-t border-[var(--wf-neutral-100)] p-5"><SubmittedWorkPreview content={item.content_json} /></div>
              </details>
            ))}
            {items.length === 0 && <p className="rounded-2xl bg-[var(--wf-surface)] p-8 text-center text-[var(--wf-neutral-500)]">This project has no published contents yet.</p>}
          </div>
        </section>

        <section className="mt-12 rounded-3xl bg-[var(--wf-surface)] p-7 shadow-sm">
          <h2 className="text-2xl font-bold text-[var(--wf-palette-004239)]">Comments · {comments.length}</h2>
          {project.allow_comments ? (
            currentUser ? <form onSubmit={handleComment} className="mt-5 flex gap-3"><input value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} placeholder="Share your thoughts..." className="min-w-0 flex-1 rounded-xl border border-[var(--wf-neutral-300)] px-4 py-3 outline-none focus:border-[var(--wf-palette-004239)]" /><button disabled={isBusy || !comment.trim()} className="rounded-xl bg-[var(--wf-palette-004239)] px-5 py-3 font-semibold text-[var(--wf-surface)] disabled:opacity-50">Post</button></form>
            : <p className="mt-4 text-[var(--wf-neutral-500)]"><Link to="/login" className="font-semibold text-[var(--wf-palette-004239)]">Log in</Link> to leave a comment.</p>
          ) : <p className="mt-4 text-[var(--wf-neutral-500)]">Comments are disabled for this project.</p>}
          <div className="mt-7 space-y-5">{comments.map((entry) => <div key={entry.id} className="flex gap-3 border-t border-[var(--wf-neutral-100)] pt-5"><UserAvatar displayName={entry.author_name} avatarPath={entry.author_avatar_path} size="sm" /><div className="min-w-0 flex-1"><div className="flex items-center gap-3"><Link to={`/creator/${entry.author_id}`} className="font-bold text-[var(--wf-palette-004239)]">{entry.author_name}</Link><span className="text-xs text-[var(--wf-neutral-400)]">{new Date(entry.created_at).toLocaleDateString("en-US")}</span></div><p className="mt-2 whitespace-pre-wrap text-[var(--wf-neutral-600)]">{entry.content}</p></div>{currentUser?.id === entry.author_id && <button onClick={() => void handleDeleteComment(entry.id)} className="self-start text-sm text-[var(--wf-danger-600)]">Delete</button>}</div>)}</div>
        </section>
        {errorMessage && <p className="mt-6 rounded-xl bg-[var(--wf-danger-50)] p-4 text-[var(--wf-danger-700)]">{errorMessage}</p>}
      </main>
    </div>
  );
}

export default PublishedProjectPage;
