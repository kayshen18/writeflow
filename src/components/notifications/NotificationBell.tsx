import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  getMyNotifications,
  getMyWork,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type WriteFlowNotification,
} from "../../lib/api";
import { socket } from "../../lib/socket";
import bellIcon from "../../assets/icons/bell.svg";

function NotificationBell() {
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<
    WriteFlowNotification[]
  >([]);

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadNotifications() {
    try {
      setIsLoading(true);
      setMessage("");

      const result = await getMyNotifications();

      setNotifications(result.notifications);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to load notifications.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadNotifications();

    function handleNotificationCreated() {
      void loadNotifications();
    }

    socket.on(
      "notification-created",
      handleNotificationCreated,
    );

    return () => {
      socket.off(
        "notification-created",
        handleNotificationCreated,
      );
    };
  }, []);

  async function handleNotificationClick(
    notification: WriteFlowNotification,
  ) {
    try {
      if (!notification.is_read) {
        await markNotificationAsRead(notification.id);

        setNotifications((currentNotifications) =>
          currentNotifications.map((currentNotification) =>
            currentNotification.id === notification.id
              ? {
                  ...currentNotification,
                  is_read: true,
                }
              : currentNotification,
          ),
        );
      }

      if (!notification.work_id) {
        return;
      }

      const result = await getMyWork(notification.work_id);

      navigate(
        result.work.work_type === "drawing"
          ? `/image/${notification.work_id}`
          : `/text/${notification.work_id}`,
      );

      setIsOpen(false);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to open this work.",
      );
    }
  }

  async function handleMarkAllAsRead() {
    try {
      setMessage("");

      await markAllNotificationsAsRead();

      setNotifications((currentNotifications) =>
        currentNotifications.map((notification) => ({
          ...notification,
          is_read: true,
        })),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to mark notifications as read.",
      );
    }
  }

  const unreadCount = notifications.filter(
    (notification) => !notification.is_read,
  ).length;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((currentValue) => !currentValue);

          if (!isOpen) {
            void loadNotifications();
          }
        }}
        className="relative flex h-11 w-11 items-center justify-center rounded-full text-2xl text-[var(--wf-surface)] transition hover:bg-[var(--wf-surface)]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wf-palette-d1fdf5)]"
        aria-label="Notifications"
        aria-expanded={isOpen}
      >
        <img src={bellIcon} alt="" aria-hidden="true" className="h-8 w-8 object-contain" />

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[var(--wf-danger-500)] px-1 text-[11px] font-bold text-[var(--wf-surface)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <section className="absolute right-0 top-full z-50 mt-3 w-96 overflow-hidden rounded-2xl border border-[var(--wf-neutral-200)] bg-[var(--wf-surface)] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[var(--wf-neutral-100)] px-5 py-4">
            <div>
              <h2 className="font-mukta-mahee text-lg font-bold text-[var(--wf-palette-004239)]">
                Notifications
              </h2>

              <p className="text-xs text-[var(--wf-neutral-500)]">
                {unreadCount > 0
                  ? `${unreadCount} unread`
                  : "All caught up"}
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllAsRead()}
                className="text-sm font-semibold text-[var(--wf-success-800)] transition hover:text-[var(--wf-success-950)]"
              >
                Mark all as read
              </button>
            )}
          </div>

          {message && (
            <p className="m-4 rounded-xl bg-[var(--wf-danger-50)] p-3 text-sm text-[var(--wf-danger-700)]">
              {message}
            </p>
          )}

          <div className="max-h-96 overflow-y-auto">
            {isLoading ? (
              <p className="p-5 text-sm text-[var(--wf-neutral-500)]">
                Loading notifications...
              </p>
            ) : notifications.length === 0 ? (
              <p className="p-5 text-sm text-[var(--wf-neutral-500)]">
                No notifications yet.
              </p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() =>
                    void handleNotificationClick(notification)
                  }
                  className={[
                    "w-full border-b border-[var(--wf-neutral-100)] px-5 py-4 text-left transition last:border-b-0",
                    notification.is_read
                      ? "bg-[var(--wf-surface)] hover:bg-[var(--wf-neutral-50)]"
                      : "bg-[var(--wf-success-50)] hover:bg-[var(--wf-success-100)]",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm leading-6 text-[var(--wf-neutral-700)]">
                      {notification.message}
                    </p>

                    {!notification.is_read && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--wf-success-700)]" />
                    )}
                  </div>

                  <p className="mt-2 text-xs text-[var(--wf-neutral-400)]">
                    {new Date(
                      notification.created_at,
                    ).toLocaleString("en-US")}
                  </p>
                </button>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default NotificationBell;
