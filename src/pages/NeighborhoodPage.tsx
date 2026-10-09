import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { getPublishedProjects, getPublishedWorks, getUploadUrl, type PublishedProject, type PublishedWork } from "../lib/api";
import UserAvatar from "../components/user/UserAvatar";

type Filter = "all" | "writing" | "drawing" | "project";
type Entry = { kind: "work"; data: PublishedWork } | { kind: "project"; data: PublishedProject };

function tagsOf(tags: string[] | string | null | undefined) {
  if (Array.isArray(tags)) return tags;
  if (!tags) return [];
  try {
    const value = JSON.parse(tags) as unknown;
    return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
  } catch { return []; }
}

function NeighborhoodPage() {
  const [works, setWorks] = useState<PublishedWork[]>([]);
  const [projects, setProjects] = useState<PublishedProject[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    Promise.all([getPublishedWorks(), getPublishedProjects()])
      .then(([workResult, projectResult]) => {
        if (!ignore) { setWorks(workResult.works); setProjects(projectResult.projects); }
      })
      .catch((reason: unknown) => {
        if (!ignore) setError(reason instanceof Error ? reason.message : "Unable to load the community.");
      })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const all: Entry[] = [
      ...works.filter((work) => filter === "all" || filter === work.work_type).map((data): Entry => ({ kind: "work", data })),
      ...(filter === "all" || filter === "project" ? projects.map((data): Entry => ({ kind: "project", data })) : []),
    ];
    const term = search.trim().toLowerCase();
    return all.filter(({ data }) => !term || [
      data.author_name, data.title, data.description, data.category, ...tagsOf(data.tags),
    ].filter(Boolean).join(" ").toLowerCase().includes(term))
      .sort((a, b) => new Date(b.data.published_at ?? 0).getTime() - new Date(a.data.published_at ?? 0).getTime());
  }, [filter, projects, search, works]);

  const buttonClass = (value: Filter) =>
    `rounded-full px-5 py-2 text-sm font-semibold transition ${filter === value ? "bg-[var(--wf-tool)] text-[var(--wf-tool-text)]" : "bg-[var(--wf-subtle)] text-[var(--wf-tool)] hover:bg-[var(--wf-tool)] hover:text-[var(--wf-tool-text)]"}`;

  return (
    <div className="min-h-screen bg-[var(--wf-surface)] text-[var(--wf-text)]">
      <header className="flex min-h-20 items-center border-b border-[var(--wf-nav)] bg-[var(--wf-nav)] px-8 shadow-sm">
        <Link to="/" className="font-kranky text-4xl text-[var(--wf-nav-text)]">WriteFlow</Link>
        <nav className="ml-auto flex items-center gap-3">
          <Link to="/projects" className="rounded-xl px-4 py-2 font-medium text-[var(--wf-nav-text)] hover:text-[var(--wf-save-hover)]">My Projects</Link>
          <Link to="/works" className="rounded-xl px-4 py-2 font-medium text-[var(--wf-nav-text)] hover:text-[var(--wf-save-hover)]">My Works</Link>
          <Link to="/text" className="rounded-xl border border-[var(--wf-button-border)] bg-[var(--wf-button-bg)] px-4 py-2 font-semibold text-[var(--wf-button-text)] hover:bg-[var(--wf-button-hover)]">New Writing</Link>
          <Link to="/image" className="rounded-xl bg-[var(--wf-button-bg)] px-4 py-2 font-semibold text-[var(--wf-button-text)] hover:bg-[var(--wf-button-hover)]">New Artwork</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--wf-muted)]">Discover WriteFlow</p>
          <h1 className="font-kranky mt-3 text-5xl text-[var(--wf-text)]">Neighborhood</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[var(--wf-muted)]">Explore stories, illustrations and complete creative projects shared by the community.</p>
        </div>
        <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex flex-wrap gap-3">
            {(["all", "writing", "drawing", "project"] as Filter[]).map((value) => (
              <button key={value} onClick={() => setFilter(value)} className={buttonClass(value)}>
                {value === "all" ? "All" : value === "drawing" ? "Artwork" : value === "project" ? "Projects" : "Writing"}
              </button>
            ))}
          </div>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search username, tags or keywords" className="rounded-full border border-[var(--wf-button-border)] focus:border-[var(--wf-primary-hover)] bg-[var(--wf-surface)] px-5 py-2.5 outline-none md:ml-auto md:w-96" />
        </div>
        {loading && <p className="mt-12 text-center text-[var(--wf-neutral-600)]">Loading community...</p>}
        {error && <div className="mx-auto mt-12 max-w-2xl rounded-2xl border border-[var(--wf-danger-200)] bg-[var(--wf-danger-50)] p-5 text-[var(--wf-danger-700)]">{error}</div>}
        {!loading && !error && entries.length === 0 && <div className="mt-12 rounded-3xl border-2 border-dashed border-[var(--wf-border)] bg-[var(--wf-surface)] p-12 text-center"><h2 className="text-2xl font-bold text-[var(--wf-text)]">No matching publications</h2></div>}
        {!loading && entries.length > 0 && (
          <div className="mt-12 grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry) => {
              const item = entry.data;
              const work = entry.kind === "work" ? entry.data : null;
              const isProject = entry.kind === "project";
              return (
                <Link key={`${entry.kind}-${item.id}`} to={isProject ? `/project/${item.id}` : `/work/${item.id}`} className="group overflow-hidden rounded-3xl bg-[var(--wf-surface)] shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
                  <div className="aspect-[16/9] overflow-hidden bg-gradient-to-br from-[var(--wf-subtle)] to-[var(--wf-surface)]">
                    {item.cover_path ? <img src={getUploadUrl(item.cover_path)} alt={item.title} className="h-full w-full object-cover transition group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-5xl text-[var(--wf-text)]">{isProject ? "✦" : work?.work_type === "drawing" ? "◇" : "Aa"}</div>}
                  </div>
                  <div className="p-6">
                    <div className="flex gap-2"><span className="rounded-full bg-[var(--wf-subtle)] px-3 py-1 text-xs font-bold text-[var(--wf-text)]">{isProject ? "Project" : work?.work_type === "drawing" ? "Artwork" : "Writing"}</span>{item.category && <span className="rounded-full bg-[var(--wf-secondary-50)] px-3 py-1 text-xs text-[var(--wf-secondary-700)]">{item.category}</span>}</div>
                    <h2 className="mt-4 truncate text-2xl font-bold">{item.title}</h2>
                    <div className="mt-3 flex items-center gap-2"><UserAvatar displayName={item.author_name || "WriteFlow Creator"} avatarPath={item.author_avatar_path} size="sm" /><span className="truncate text-sm text-[var(--wf-muted)]">by {item.author_name || "WriteFlow Creator"}</span></div>
                    <p className="mt-3 line-clamp-3 min-h-16 text-sm leading-6 text-[var(--wf-neutral-500)]">{item.description || "No description provided."}</p>
                    <div className="mt-4 flex flex-wrap gap-2">{tagsOf(item.tags).slice(0, 4).map((tag) => <span key={tag} className="text-xs text-[var(--wf-neutral-500)]">#{tag}</span>)}</div>
                    <div className="mt-5 border-t pt-4 text-sm font-semibold text-[var(--wf-text)]">View {isProject ? "project" : "work"} →</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default NeighborhoodPage;
