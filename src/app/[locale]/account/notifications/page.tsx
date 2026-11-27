"use client";
import RetryButton from "@/components/RetryButton";

import { LoadingSpinner } from "@/components/LoadingIndicator";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { getAccessToken, useLocalizedAccountProfile } from "../useAccountProfile";
import { readEntryValue, writeEntryValue, useHistoryEntryState } from "@/hooks/useHistoryEntryState";
import { useListReadingPosition } from "@/hooks/useListReadingPosition";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import {
  COMMENT_TARGET_BANDORI_EVENT,
  parseBandoriEventCommentTargetId,
} from "@/lib/bandori/events/comment-target";
import {
  COMMENT_TARGET_BANDORI_CARD,
  parseBandoriCardCommentTargetId,
} from "@/lib/bandori/cards/comment-target";
import { getBandoriServerCode, type BandoriServerCode } from "@/lib/bandori-server";
import type {
  CommentNotification,
  CommentNotificationListResponse,
  CommentNotificationType,
} from "@/lib/comments/comment-contract";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";

type NotificationColumnState = CommentNotificationListResponse & {
  loadingMore: boolean;
  paginationFailed?: boolean;
  pendingBoundary?: NotificationBoundary;
};

type NotificationBoundary = Pick<CommentNotification, "id" | "createdAt">;
type NotificationBoundaries = Partial<Record<CommentNotificationType, NotificationBoundary>>;

function rememberOldest(userId: string, type: CommentNotificationType, oldest?: CommentNotification) {
  if (!oldest) return;
  const saved = readEntryValue<NotificationBoundaries>("notificationBoundaries", userId);
  writeEntryValue("notificationBoundaries", userId, { ...saved, [type]: { id: oldest.id, createdAt: oldest.createdAt } });
}

type NotificationColumns = Record<CommentNotificationType, NotificationColumnState>;

type NotificationTargetPresentation = {
  eventId: number | null;
  cardId: number | null;
  serverCode: BandoriServerCode | null;
  href: string | null;
};

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

function getNotificationTargetPresentation(
  notification: CommentNotification,
): NotificationTargetPresentation {
  switch (notification.targetType) {
    case COMMENT_TARGET_BANDORI_EVENT: {
      const target = parseBandoriEventCommentTargetId(notification.targetId);
      if (!target) break;

      const serverCode = getBandoriServerCode(target.server);
      const query = new URLSearchParams({
        comment: notification.linkCommentId,
        server: serverCode,
      });
      return {
        eventId: target.eventId,
        cardId: null,
        serverCode,
        href: `/bandori/events/${encodeURIComponent(target.eventId)}?${query.toString()}`,
      };
    }
    case COMMENT_TARGET_BANDORI_CARD: {
      const target = parseBandoriCardCommentTargetId(notification.targetId);
      if (!target) break;

      const query = new URLSearchParams({
        comment: notification.linkCommentId,
      });
      const serverCode = target.entityServer === null
        ? null
        : getBandoriServerCode(target.entityServer);
      if (serverCode) {
        query.set("server", serverCode);
      }
      return {
        eventId: null,
        cardId: target.cardId,
        serverCode,
        href: `/bandori/cards/${encodeURIComponent(target.cardId)}?${query.toString()}`,
      };
    }
    default:
      break;
  }

  return {
    eventId: null,
    cardId: null,
    serverCode: null,
    href: null,
  };
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
  const [activeNotificationType, setActiveNotificationType] = useHistoryEntryState<CommentNotificationType>("notificationColumn", userId ?? undefined, "comment_reply");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const hasLoaded = userId !== null && loadedUserId === userId;
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

  const panel = useRef<HTMLElement>(null);
  const reads = useRef<AbortController | null>(null);
  useListReadingPosition(panel, userId ? userId + ":" + activeNotificationType : undefined,
    hasLoaded && !loading && !activeColumn.pendingBoundary);

  const fetchNotificationColumn = useCallback(async (
    type: CommentNotificationType,
    cursor: string | null | undefined,
    accessToken: string,
    signal: AbortSignal,
  ) => requestJson<CommentNotificationListResponse>(
    buildNotificationRequestUrl(type, cursor),
    (status) => t("requestFailed", { status }),
    (payload) => getLocalizedApiErrorMessage(payload, errorT),
    { headers: { Authorization: `Bearer ${accessToken}` }, signal },
  ), [errorT, t]);

  const readPages = useCallback(async (
    type: CommentNotificationType, cursor: string | null, token: string, signal: AbortSignal,
    boundary?: NotificationBoundary,
  ): Promise<NotificationColumnState> => {
    let page = await fetchNotificationColumn(type, cursor, token, signal);
    const notifications = [...page.notifications];
    // New arrivals can push the previous tail onto a later page.
    // The API orders by creation time and then by ID, both descending.
    while (boundary && page.hasMore && page.nextCursor) {
      const tail = notifications.at(-1);
      if (!tail || tail.createdAt < boundary.createdAt || (tail.createdAt === boundary.createdAt && tail.id <= boundary.id)) break;
      try {
        page = await fetchNotificationColumn(type, page.nextCursor, token, signal);
      } catch (error) {
        if (signal.aborted) throw error;
        return { ...page, notifications, loadingMore: false, paginationFailed: true, pendingBoundary: boundary };
      }
      notifications.push(...page.notifications);
    }
    return { ...page, notifications, loadingMore: false };
  }, [fetchNotificationColumn]);

  useEffect(() => {
    if (!authReady || !userId) {
      // No notification subscription/read can be active without an authenticated owner.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    reads.current = controller;
    const { signal } = controller;
    const boundaries = readEntryValue<NotificationBoundaries>("notificationBoundaries", userId);
    const loadInitialNotifications = async () => {
      setLoading(true);
      setError("");

      try {
        const accessToken = await getAccessToken();
        if (signal.aborted) return;
        if (!accessToken) throw new Error(t("loadFailed"));
        const [replyData, reactionData] = await Promise.all([
          readPages("comment_reply", null, accessToken, signal, boundaries?.comment_reply),
          readPages("comment_reaction", null, accessToken, signal, boundaries?.comment_reaction),
        ]);
        if (signal.aborted) return;

        setColumns({
          comment_reply: replyData,
          comment_reaction: reactionData,
        });
        setLoadedUserId(userId);
      } catch (err) {
        if (!signal.aborted) {
          setError(err instanceof Error ? err.message : t("loadFailed"));
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    void loadInitialNotifications();

    return () => {
      controller.abort();
      reads.current = null;
    };
  }, [authReady, readPages, loadAttempt, t, userId]);

  const loadMoreNotifications = async (type: CommentNotificationType) => {
    const column = columns[type];
    const signal = reads.current?.signal;
    if (!column.hasMore || column.loadingMore || !userId || !signal) return;

    setColumns((current) => ({
      ...current,
      [type]: {
        ...current[type],
        loadingMore: true,
      },
    }));
    setError("");

    try {
      const accessToken = await getAccessToken();
      if (signal.aborted) return;
      if (!accessToken) throw new Error(t("loadFailed"));
      const data = await readPages(type, column.nextCursor, accessToken, signal, column.pendingBoundary);
      if (signal.aborted) return;
      if (!data.pendingBoundary) rememberOldest(userId, type, data.notifications.at(-1));
      setColumns((current) => ({
        ...current,
        [type]: {
          ...data,
          notifications: [...current[type].notifications, ...data.notifications],
        },
      }));
    } catch {
      if (signal.aborted) return;
      setColumns((current) => ({
        ...current,
        [type]: {
          ...current[type],
          loadingMore: false,
          paginationFailed: true,
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
    const target = getNotificationTargetPresentation(notification);
    const content = (
      <>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {!notification.readAt ? <span className="h-2 w-2 rounded-full bg-[var(--theme-color-semantic-info-foreground)]" aria-label={t("unreadLabel")} /> : null}
            <h3 className="whitespace-pre-wrap text-sm font-semibold text-[var(--theme-color-text-default)] sm:text-base">
              {getNotificationMessage(notification, t)}
            </h3>
          </div>
          <p className="mt-2 text-sm text-[var(--theme-color-text-muted)]">
            {target.eventId !== null ? (
              <>
                {t("activityLabel", { eventId: target.eventId })}
                {target.serverCode ? ` · ${target.serverCode.toUpperCase()}` : ""}
                {" · "}
              </>
            ) : target.cardId !== null ? (
              <>
                {t("cardLabel", { cardId: target.cardId })}
                {target.serverCode ? ` · ${target.serverCode.toUpperCase()}` : ""}
                {" · "}
              </>
            ) : null}
            {formatNotificationTime(notification.createdAt, locale)}
          </p>
        </div>
        {target.href ? (
          <span className="shrink-0 rounded-full border border-[var(--theme-color-border-subtle)] px-3 py-1.5 text-xs font-semibold text-[var(--theme-color-text-muted)]">
            {commonT("actions.view")}
          </span>
        ) : null}
      </>
    );
    const className = "flex items-center justify-between gap-3 rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] px-4 py-3.5 shadow-xs";

    if (!target.href) {
      return <div key={notification.id} data-reading-row={notification.id} className={className}>{content}</div>;
    }

    return (
      <Link
        key={notification.id}
        data-reading-row={notification.id}
        href={target.href}
        onClick={() => {
          if (userId) rememberOldest(userId, notification.type, activeColumn.notifications.at(-1));
          void markRead(notification.id).catch(() => undefined);
        }}
        className={`${className} transition hover:border-[var(--theme-color-action-secondary-border)] hover:shadow-[var(--theme-shadow-surface-raised)]`}
      >
        {content}
      </Link>
    );
  };

  const renderActiveNotifications = () => {
    return (
      <section ref={panel}
        id={`notification-panel-${activeNotificationType}`}
        role="tabpanel"
        aria-labelledby={`notification-tab-${activeNotificationType}`}
        className="space-y-3"
      >
        <div className="space-y-3">
          {activeColumn.notifications.map(renderNotificationCard)}
        </div>

        {!loading && activeColumn.notifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] py-12 text-center text-sm font-semibold text-[var(--theme-color-text-muted)]">
            {t(getEmptyColumnKey(activeNotificationType))}
          </div>
        ) : null}

        {activeColumn.hasMore ? (
          <div className="flex justify-center pt-2">
            {activeColumn.paginationFailed && !activeColumn.loadingMore ? (
              <RetryButton onClick={() => void loadMoreNotifications(activeNotificationType)} />
            ) : (
              <button
                type="button"
                onClick={() => void loadMoreNotifications(activeNotificationType)}
                disabled={activeColumn.loadingMore}
                className="hhwx-control inline-flex h-10 items-center rounded-full border px-5 text-sm font-semibold shadow-xs transition disabled:opacity-60"
              >
                {activeColumn.loadingMore ? <LoadingSpinner className="mr-2 text-current" /> : null}
                {activeColumn.loadingMore ? commonT("actions.loading") : commonT("actions.loadMore")}
              </button>
            )}
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
      {!authReady || loadingProfile ? (
        <AccountLoadingState message={t("loading")} />
      ) : !userId ? (
        <AccountSignInState nextPath="/account/notifications" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : !hasLoaded ? (
        loading || !error ? <AccountLoadingState message={t("loading")} /> : (
          <div className="space-y-3">
            <AccountErrorState message={error} />
            <RetryButton onClick={() => setLoadAttempt((attempt) => attempt + 1)} />
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-[var(--theme-color-text-muted)]">
              {loadedNotificationCount > 0 ? t("count", { count: loadedNotificationCount }) : t("emptyCount")}
            </div>
            <button
              type="button"
              onClick={() => void markAllRead().catch((err) => setError(err instanceof Error ? err.message : t("updateFailed")))}
              disabled={!hasUnreadNotifications}
              className="hhwx-control inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            >
              {commonT("actions.markAllRead")}
            </button>
          </div>

          {error ? <AccountErrorState message={error} /> : null}

          <div className="space-y-4">
            <div
              role="tablist"
              aria-label={t("title")}
              className="grid grid-cols-2 rounded-2xl border border-[var(--theme-color-border-subtle)] bg-[var(--theme-color-panel-background)] p-1"
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
                        ? "bg-[var(--theme-color-control-background)] text-[var(--theme-color-tab-foreground-selected)] shadow-xs ring-1 ring-[var(--theme-color-border-subtle)]"
                        : "text-[var(--theme-color-text-muted)] hover:bg-[var(--theme-color-control-background-hover)] hover:text-[var(--theme-color-text-default)]",
                    ].join(" ")}
                  >
                    <span>{t(getColumnTitleKey(type))}</span>
                    <span className={isActive ? "text-[var(--theme-color-tab-foreground-selected)]" : "text-[var(--theme-color-text-muted)]"}>
                      {tabStats[type].total}
                    </span>
                    {tabStats[type].unread > 0 ? (
                      <span className="h-2 w-2 rounded-full bg-[var(--theme-color-semantic-info-foreground)]" aria-label={t("unreadLabel")} />
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
