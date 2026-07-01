"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { getAccessToken, useLocalizedAccountProfile } from "../useAccountProfile";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";

type CommentNotificationType = "comment_reply" | "comment_reaction";

type BaseCommentNotification = {
  id: string;
  actorUsername: string | null;
  targetId: string;
  commentId: string;
  linkCommentId: string;
  readAt: string | null;
  createdAt: string;
};

type CommentReplyNotification = BaseCommentNotification & {
  type: "comment_reply";
  activityCommentId: string;
  reactionEmojiKey: null;
};

type CommentReactionNotification = BaseCommentNotification & {
  type: "comment_reaction";
  activityCommentId: null;
  reactionEmojiKey: string;
};

type CommentNotification = CommentReplyNotification | CommentReactionNotification;

type NotificationListResponse = {
  notifications: CommentNotification[];
  nextCursor: string | null;
  hasMore: boolean;
};

type NotificationColumnState = NotificationListResponse & {
  loadingMore: boolean;
};

type NotificationColumns = Record<CommentNotificationType, NotificationColumnState>;

const NOTIFICATIONS_UPDATED_EVENT = "hhwx:notifications-updated";
const NOTIFICATION_TYPES = ["comment_reply", "comment_reaction"] as const satisfies readonly CommentNotificationType[];
type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

function createEmptyColumnState(): NotificationColumnState {
  return {
    notifications: [],
    nextCursor: null,
    hasMore: false,
    loadingMore: false,
  };
}

function createEmptyColumns(): NotificationColumns {
  return {
    comment_reply: createEmptyColumnState(),
    comment_reaction: createEmptyColumnState(),
  };
}

function toLoadedColumnState(data: NotificationListResponse): NotificationColumnState {
  return {
    ...data,
    loadingMore: false,
  };
}

function notifyNotificationsUpdated(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

function getNotificationMessage(notification: CommentNotification, t: TranslationFn): string {
  const actor = notification.actorUsername ?? t("fallbackActor");
  if (notification.type === "comment_reaction") {
    return t("reaction", { actor, emoji: notification.reactionEmojiKey });
  }

  return t("reply", { actor });
}

function formatNotificationTime(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildNotificationRequestUrl(type: CommentNotificationType, cursor?: string | null): string {
  const params = new URLSearchParams({ type });
  if (cursor) {
    params.set("cursor", cursor);
  }

  return `/api/account/notifications?${params.toString()}`;
}

function getColumnTitleKey(type: CommentNotificationType): string {
  return type === "comment_reply" ? "replyColumnTitle" : "reactionColumnTitle";
}

function getEmptyColumnKey(type: CommentNotificationType): string {
  return type === "comment_reply" ? "emptyReplies" : "emptyReactions";
}

async function requestJson<T>(
  url: string,
  fallbackMessage: (status: number) => string,
  apiErrorMessage: (payload: unknown) => string | null,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  const data = parseApiSuccessData<T>(payload);
  if (!response.ok || data === null) {
    throw new Error(apiErrorMessage(payload) ?? getApiErrorMessage(payload) ?? fallbackMessage(response.status));
  }

  return data;
}

export default function AccountNotificationsPage() {
  const locale = useLocale();
  const t = useTranslations("account.notifications");
  const commonT = useTranslations("common");
  const accountT = useTranslations("account");
  const errorT = useTranslations("errors");
  const { userId, authReady, loadingProfile, profileError } = useLocalizedAccountProfile();
  const [columns, setColumns] = useState<NotificationColumns>(() => createEmptyColumns());
  const [activeNotificationType, setActiveNotificationType] = useState<CommentNotificationType>("comment_reply");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadedNotificationCount = useMemo(
    () => NOTIFICATION_TYPES.reduce((count, type) => count + columns[type].notifications.length, 0),
    [columns],
  );
  const hasUnreadNotifications = useMemo(
    () => NOTIFICATION_TYPES.some((type) => columns[type].notifications.some((notification) => !notification.readAt)),
    [columns],
  );
  const tabStats = useMemo(() => ({
    comment_reply: {
      total: columns.comment_reply.notifications.length,
      unread: columns.comment_reply.notifications.filter((notification) => !notification.readAt).length,
    },
    comment_reaction: {
      total: columns.comment_reaction.notifications.length,
      unread: columns.comment_reaction.notifications.filter((notification) => !notification.readAt).length,
    },
  }), [columns]);
  const activeColumn = columns[activeNotificationType];

  const fetchNotificationColumn = useCallback(async (
    type: CommentNotificationType,
    cursor: string | null | undefined,
    accessToken: string,
  ) => requestJson<NotificationListResponse>(
    buildNotificationRequestUrl(type, cursor),
    (status) => t("requestFailed", { status }),
    (payload) => getLocalizedApiErrorMessage(payload, errorT),
    { headers: { Authorization: `Bearer ${accessToken}` } },
  ), [errorT, t]);

  useEffect(() => {
    let disposed = false;

    if (!authReady || !userId) {
      setLoading(false);
      return () => {
        disposed = true;
      };
    }

    const loadInitialNotifications = async () => {
      const accessToken = await getAccessToken();
      if (disposed) return;

      if (!accessToken) {
        setColumns(createEmptyColumns());
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [replyData, reactionData] = await Promise.all([
          fetchNotificationColumn("comment_reply", null, accessToken),
          fetchNotificationColumn("comment_reaction", null, accessToken),
        ]);
        if (disposed) return;

        setColumns({
          comment_reply: toLoadedColumnState(replyData),
          comment_reaction: toLoadedColumnState(reactionData),
        });
      } catch (err) {
        if (!disposed) {
          setError(err instanceof Error ? err.message : t("loadFailed"));
        }
      } finally {
        if (!disposed) {
          setLoading(false);
        }
      }
    };

    void loadInitialNotifications();

    return () => {
      disposed = true;
    };
  }, [authReady, fetchNotificationColumn, t, userId]);

  const loadMoreNotifications = async (type: CommentNotificationType) => {
    const column = columns[type];
    if (!column.hasMore || column.loadingMore) return;

    const accessToken = await getAccessToken();
    if (!accessToken) return;

    setColumns((current) => ({
      ...current,
      [type]: {
        ...current[type],
        loadingMore: true,
      },
    }));
    setError("");

    try {
      const data = await fetchNotificationColumn(type, column.nextCursor, accessToken);
      setColumns((current) => ({
        ...current,
        [type]: {
          notifications: [...current[type].notifications, ...data.notifications],
          nextCursor: data.nextCursor,
          hasMore: data.hasMore,
          loadingMore: false,
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadFailed"));
      setColumns((current) => ({
        ...current,
        [type]: {
          ...current[type],
          loadingMore: false,
        },
      }));
    }
  };

  const markAllRead = async () => {
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    await requestJson<{ ok: boolean }>("/api/account/notifications", (status) => t("requestFailed", { status }), (payload) => getLocalizedApiErrorMessage(payload, errorT), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "mark-all-read" }),
    });
    const readAt = new Date().toISOString();
    setColumns((current) => ({
      comment_reply: {
        ...current.comment_reply,
        notifications: current.comment_reply.notifications.map((item) => ({ ...item, readAt: item.readAt ?? readAt })),
      },
      comment_reaction: {
        ...current.comment_reaction,
        notifications: current.comment_reaction.notifications.map((item) => ({ ...item, readAt: item.readAt ?? readAt })),
      },
    }));
    notifyNotificationsUpdated();
  };

  const markRead = async (notificationId: string) => {
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    await requestJson<{ ok: boolean }>("/api/account/notifications", (status) => t("requestFailed", { status }), (payload) => getLocalizedApiErrorMessage(payload, errorT), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "mark-read", notificationId }),
    });
    const readAt = new Date().toISOString();
    setColumns((current) => ({
      comment_reply: {
        ...current.comment_reply,
        notifications: current.comment_reply.notifications.map((item) => (
          item.id === notificationId ? { ...item, readAt: item.readAt ?? readAt } : item
        )),
      },
      comment_reaction: {
        ...current.comment_reaction,
        notifications: current.comment_reaction.notifications.map((item) => (
          item.id === notificationId ? { ...item, readAt: item.readAt ?? readAt } : item
        )),
      },
    }));
    notifyNotificationsUpdated();
  };

  const renderNotificationCard = (notification: CommentNotification) => {
    const href = `/bandori/eventtracker?event=${encodeURIComponent(notification.targetId)}&comment=${encodeURIComponent(notification.linkCommentId)}`;
    return (
      <Link
        key={notification.id}
        href={href}
        onClick={() => void markRead(notification.id).catch(() => undefined)}
        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm transition hover:border-sky-200 hover:shadow-[0_12px_36px_rgba(14,165,233,0.08)]"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {!notification.readAt ? <span className="h-2 w-2 rounded-full bg-sky-500" aria-label={t("unreadLabel")} /> : null}
            <h3 className="whitespace-pre-wrap text-sm font-semibold text-slate-900 sm:text-base">
              {getNotificationMessage(notification, t)}
            </h3>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {t("activityLabel", { eventId: notification.targetId })} · {formatNotificationTime(notification.createdAt, locale)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">
          {commonT("actions.view")}
        </span>
      </Link>
    );
  };

  const renderActiveNotifications = () => {
    return (
      <section
        id={`notification-panel-${activeNotificationType}`}
        role="tabpanel"
        aria-labelledby={`notification-tab-${activeNotificationType}`}
        className="space-y-3"
      >
        <div className="space-y-3">
          {activeColumn.notifications.map(renderNotificationCard)}
        </div>

        {!loading && activeColumn.notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm font-semibold text-slate-400">
            {t(getEmptyColumnKey(activeNotificationType))}
          </div>
        ) : null}

        {activeColumn.hasMore ? (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => void loadMoreNotifications(activeNotificationType)}
              disabled={activeColumn.loadingMore}
              className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-sky-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 disabled:opacity-60"
            >
              {activeColumn.loadingMore ? commonT("actions.loading") : commonT("actions.loadMore")}
            </button>
          </div>
        ) : null}
      </section>
    );
  };

  return (
    <AccountShell
      title={t("title")}
      description={t("description")}
      backHref="/account"
      backLabel={accountT("shell.defaultBackLabel")}
    >
      {!authReady || loadingProfile || loading ? (
        <AccountLoadingState message={t("loading")} />
      ) : !userId ? (
        <AccountSignInState nextPath="/account/notifications" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-500">
              {loadedNotificationCount > 0 ? t("count", { count: loadedNotificationCount }) : t("emptyCount")}
            </div>
            <button
              type="button"
              onClick={() => void markAllRead().catch((err) => setError(err instanceof Error ? err.message : t("updateFailed")))}
              disabled={!hasUnreadNotifications}
              className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {commonT("actions.markAllRead")}
            </button>
          </div>

          {error ? <AccountErrorState message={error} /> : null}

          <div className="space-y-4">
            <div
              role="tablist"
              aria-label={t("title")}
              className="grid grid-cols-2 rounded-2xl border border-slate-200 bg-slate-50 p-1"
            >
              {NOTIFICATION_TYPES.map((type) => {
                const isActive = activeNotificationType === type;
                return (
                  <button
                    key={type}
                    id={`notification-tab-${type}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`notification-panel-${type}`}
                    onClick={() => setActiveNotificationType(type)}
                    className={[
                      "flex h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition",
                      isActive
                        ? "bg-white text-sky-700 shadow-sm ring-1 ring-slate-200"
                        : "text-slate-500 hover:bg-white/70 hover:text-slate-700",
                    ].join(" ")}
                  >
                    <span>{t(getColumnTitleKey(type))}</span>
                    <span className={isActive ? "text-sky-500" : "text-slate-400"}>
                      {tabStats[type].total}
                    </span>
                    {tabStats[type].unread > 0 ? (
                      <span className="h-2 w-2 rounded-full bg-sky-500" aria-label={t("unreadLabel")} />
                    ) : null}
                  </button>
                );
              })}
            </div>

            {renderActiveNotifications()}
          </div>
        </div>
      )}
    </AccountShell>
  );
}
