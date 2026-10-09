import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  getSavedUser,
  logoutUser,
  type LoggedInUser,
} from "../lib/api";
import writingIcon from "../assets/icons/writing.svg";
import drawingIcon from "../assets/icons/drawing.svg";
import projectIcon from "../assets/icons/project.svg";
import UserAvatar from "../components/user/UserAvatar";
import NotificationBell from "../components/notifications/NotificationBell";

function HomePage() {
  // 初次进入首页时，从 localStorage 读取登录时保存的用户资料。
  const [user, setUser] = useState<LoggedInUser | null>(() => getSavedUser());

  function handleLogout() {
    logoutUser();
    setUser(null);
  }

  useEffect(() => {
    function handleUserUpdated() {
      setUser(getSavedUser());
    }

    function handleStorage(
      event: StorageEvent,
    ) {
      if (event.key === "writeflow_user") {
        setUser(getSavedUser());
      }
    }

    window.addEventListener(
      "writeflow-user-updated",
      handleUserUpdated,
    );

    window.addEventListener(
      "storage",
      handleStorage,
    );

    return () => {
      window.removeEventListener(
        "writeflow-user-updated",
        handleUserUpdated,
      );

      window.removeEventListener(
        "storage",
        handleStorage,
      );
    };
  }, []);

  const displayName = user?.displayName || "User";

  return (
    <div className="min-h-screen bg-[var(--wf-surface)]">
      {/* Top navigation */}
      <header className="fixed left-0 top-0 z-50 w-full border-b border-[var(--wf-neutral-200)] bg-[var(--wf-text)] shadow-sm">
        <nav className="flex h-28 w-full items-center px-8">
          <Link
            to="/"
            className="font-kranky shrink-0 text-5xl leading-none text-[var(--wf-surface)] transition hover:text-[var(--wf-surface)]"
          >
            WriteFlow
          </Link>

          <div className="ml-auto flex items-center gap-8">
            {/* Functions dropdown */}
            <div className="group relative">
              <button
                type="button"
                className="font-mukta-mahee flex items-center gap-2 text-xl font-bold text-[var(--wf-surface)] transition hover:text-[var(--wf-save)]"
              >
                Functions
                <span className="text-sm text-[var(--wf-surface)] transition group-hover:rotate-180">
                  ▾
                </span>
              </button>

              <div className="invisible absolute left-0 top-full w-56 pt-3 opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <div className="overflow-hidden rounded-2xl border border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] p-2 shadow-xl">
                  <Link
                    to="/text"
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-[var(--wf-palette-004239)] transition hover:bg-[var(--wf-palette-e1feec)]"
                  >
                    <p className="font-mukta-mahee font-medium">Writing</p>
                  </Link>

                  <Link
                    to="/image"
                    className="mt-1 flex items-center gap-3 rounded-xl px-4 py-3 text-[var(--wf-palette-004239)] transition hover:bg-[var(--wf-palette-e1feec)]"
                  >
                    <p className="font-mukta-mahee font-medium">
                      Images and Drawing
                    </p>
                  </Link>

                  <Link
                    to="/projects"
                    className="mt-1 flex items-center gap-3 rounded-xl px-4 py-3 text-[var(--wf-palette-004239)] transition hover:bg-[var(--wf-palette-e1feec)]"
                  >
                    <p className="font-mukta-mahee font-medium">Project</p>
                  </Link>
                </div>
              </div>
            </div>

            <Link
              to="/neighborhood"
              className="font-mukta-mahee text-xl font-bold text-[var(--wf-surface)] transition hover:text-[var(--wf-save)]"
            >
              Neighborhood
            </Link>

            {user ? (
              <>
                <NotificationBell />

                <div className="group relative">
                <button
                  type="button"
                  className="flex items-center gap-3 border-0 bg-transparent px-3 py-2 shadow-none transition-opacity hover:bg-transparent hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wf-palette-d1fdf5)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wf-palette-004239)]"
                >
                  <UserAvatar
                    displayName={displayName}
                    avatarPath={user.avatarPath}
                    size="md"
                    className="h-11 w-11 border-2 border-[var(--wf-palette-d1fdf5)]"
                  />

                  <span className="font-mukta-mahee text-lg font-bold text-[var(--wf-palette-d1fdf5)]">
                    {displayName}
                  </span>

                  <span className="text-sm text-[var(--wf-surface)]">▾</span>
                </button>

                <div className="invisible absolute right-0 top-full w-64 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <div className="overflow-hidden rounded-2xl border border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] p-2 shadow-xl">
                    <div className="border-b border-[var(--wf-neutral-100)] px-4 py-3">
                      <p className="font-mukta-mahee font-semibold text-[var(--wf-neutral-900)]">
                        {displayName}
                      </p>

                      <p className="mt-1 truncate text-sm text-[var(--wf-neutral-500)]">
                        {user.email}
                      </p>
                    </div>

                    <Link
                      to="/profile"
                      className="mt-2 block rounded-xl px-4 py-3 text-[var(--wf-palette-004239)] transition hover:bg-[var(--wf-neutral-100)]"
                    >
                      Personal Information
                    </Link>

                    <Link
                      to="/works"
                      className="block rounded-xl px-4 py-3 text-[var(--wf-palette-004239)] transition hover:bg-[var(--wf-neutral-100)]"
                    >
                      My Works
                    </Link>

                    <Link
                      to="/projects"
                      className="block rounded-xl px-4 py-3 text-[var(--wf-palette-004239)] transition hover:bg-[var(--wf-neutral-100)]"
                    >
                      My Projects
                    </Link>

                    <Link
                      to="/liked"
                      className="block rounded-xl px-4 py-3 text-[var(--wf-palette-004239)] transition hover:bg-[var(--wf-neutral-100)]"
                    >
                      Liked Works
                    </Link>

                    <Link
                      to="/saved"
                      className="block rounded-xl px-4 py-3 text-[var(--wf-palette-004239)] transition hover:bg-[var(--wf-neutral-100)]"
                    >
                      Saved Works
                    </Link>

                    <Link
                      to="/following"
                      className="block rounded-xl px-4 py-3 text-[var(--wf-palette-004239)] transition hover:bg-[var(--wf-neutral-100)]"
                    >
                      Following
                    </Link>
                    
                    <div className="my-2 border-t border-[var(--wf-neutral-100)]" />

                    <button
                      type="button"
                      onClick={handleLogout}
                      className="block w-full rounded-xl px-4 py-3 text-left text-[var(--wf-danger-600)] transition hover:bg-[var(--wf-danger-50)]"
                    >
                      Log out
                    </button>
                  </div>
                </div>
              </div>
              </>
            ) : (
              <>
                <Link
                  to="/signup"
                  className="font-mukta-mahee text-xl font-bold text-[var(--wf-save)] transition hover:text-[var(--wf-surface)]"
                >
                  Sign up
                </Link>

                <Link
                  to="/login"
                  className="font-mukta-mahee rounded-xl bg-[var(--wf-save)] px-6 py-3 font-bold text-[var(--wf-text)] transition hover:bg-[var(--wf-surface)]"
                >
                  Login
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Main content */}
      <main className="flex min-h-screen items-start justify-center px-6 pt-52">
        <div className="w-full max-w-6xl text-center">
          <h1 className="font-kranky text-6xl leading-none text-[var(--wf-text)]">
            SELECT YOUR OWN STYLE!
          </h1>

          <p className="font-mukta-mahee mt-5 text-xl text-[var(--wf-text)]">
            Create text documents, artwork or full creative projects.
          </p>

          <div
            id="functions"
            className="mt-12 grid scroll-mt-32 gap-8 lg:grid-cols-3"
          >
            <Link
              to="/text"
              className="home-function-card flex min-h-[26rem] flex-col items-center justify-center p-10 text-center transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex flex-col items-center text-center">
                <img
                  src={writingIcon}
                  alt=""
                  className="h-28 w-28 object-contain"
                />

                <div className="mt-8">
                  <h2 className="font-mukta-mahee text-4xl font-bold text-[var(--wf-save)]">
                    Writing
                  </h2>

                  <p className="font-mukta-mahee mx-auto mt-4 max-w-60 text-lg text-[var(--wf-tool)]">
                    Create stories and documents.
                  </p>
                </div>
              </div>
            </Link>

            <Link
              to="/image"
              className="home-function-card flex min-h-[26rem] flex-col items-center justify-center p-10 text-center transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex flex-col items-center text-center">
                <img
                  src={drawingIcon}
                  alt=""
                  className="h-28 w-28 object-contain"
                />

                <div className="mt-8">
                  <h2 className="font-mukta-mahee text-4xl font-bold text-[var(--wf-save)]">
                    Images & Drawing
                  </h2>

                  <p className="font-mukta-mahee mx-auto mt-4 max-w-60 text-lg text-[var(--wf-tool)]">
                    Create images or draw freely.
                  </p>
                </div>
              </div>
            </Link>

            <Link
              to="/projects"
              className="home-function-card flex min-h-[26rem] flex-col items-center justify-center p-10 text-center transition hover:-translate-y-1 hover:shadow-xl"
            >
              <div className="flex flex-col items-center text-center">
                <img
                  src={projectIcon}
                  alt=""
                  className="h-28 w-28 object-contain"
                />

                <div className="mt-8">
                  <h2 className="font-mukta-mahee text-4xl font-bold text-[var(--wf-save)]">
                    Project
                  </h2>

                  <p className="font-mukta-mahee mx-auto mt-4 max-w-60 text-lg text-[var(--wf-tool)]">
                    Organize your stories and artwork.
                  </p>
                </div>
              </div>
            </Link>

          </div>
        </div>
      </main>
    </div>
  );
}

export default HomePage;
