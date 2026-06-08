"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { getAccessToken, useLocalizedAccountProfile } from "../useAccountProfile";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";
import { getLocalizedApiErrorMessage } from "@/lib/localized-api-errors";

type CommentNotificationType = "comment_reply" | "comment_like";

type CommentNotification = {
  id: string;
  actorUsername: string | null;
  type: CommentNotificationType;
  targetId: string;
  commentId: string;
  activityCommentId: string | null;
  linkCommentId: string;
  readAt: string | null;
  createdAt: string;
};

type NotificationListResponse = {
  notifications: CommentNotification[];
  nextCursor: string | null;
  hasMore: boolean;
};

const NOTIFICATIONS_UPDATED_EVENT = "hhwx:notifications-updated";
type TranslationFn = (key: string, values?: Record<string, string | number>) => string;

function notifyNotificationsUpdated(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

function getNotificationMessage(notification: CommentNotification, t: TranslationFn): string {
  const actor = notification.actorUsername ?? t("fallbackActor");
  return notification.type === "comment_reply"
    ? t("reply", { actor })
    : t("like", { actor });
}

function formatNotificationTime(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const [notifications, setNotifications] = useState<CommentNotification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async (cursor?: string | null) => {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      setNotifications([]);
      setHasMore(false);
      setNextCursor(null);
      setLoading(false);
      return;
    }

    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");

    try {
      const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const data = await requestJson<NotificationListResponse>(`/api/account/notifications${suffix}`, (status) => t("requestFailed", { status }), (payload) => getLocalizedApiErrorMessage(payload, errorT), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setNotifications((current) => cursor ? [...current, ...data.notifications] : data.notifications);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadFailed"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [errorT, t]);

  useEffect(() => {
    if (!authReady || !userId) {
      setLoading(false);
      return;
    }

    void loadNotifications();
  }, [authReady, loadNotifications, userId]);

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
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
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
    setNotifications((current) => current.map((item) => (
      item.id === notificationId ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item
    )));
    notifyNotificationsUpdated();
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
              {notifications.length > 0 ? t("count", { count: notifications.length }) : t("emptyCount")}
            </div>
            <button
              type="button"
              onClick={() => void markAllRead().catch((err) => setError(err instanceof Error ? err.message : t("updateFailed")))}
              disabled={notifications.every((item) => item.readAt)}
              className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {commonT("actions.markAllRead")}
            </button>
          </div>

          {error ? <AccountErrorState message={error} /> : null}

          <div className="space-y-3">
            {notifications.map((notification) => {
              const href = `/bandori/eventtracker?event=${encodeURIComponent(notification.targetId)}&comment=${encodeURIComponent(notification.linkCommentId)}`;
              return (
                <Link
                  key={notification.id}
                  href={href}
                  onClick={() => void markRead(notification.id).catch(() => undefined)}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-sky-200 hover:shadow-[0_12px_36px_rgba(14,165,233,0.08)]"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {!notification.readAt ? <span className="h-2 w-2 rounded-full bg-sky-500" aria-label={t("unreadLabel")} /> : null}
                      <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
                        {getNotificationMessage(notification, t)}
                      </h2>
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
            })}
          </div>

          {!loading && notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm font-semibold text-slate-400">
              {t("empty")}
            </div>
          ) : null}

          {hasMore ? (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => void loadNotifications(nextCursor)}
                disabled={loadingMore}
                className="inline-flex h-10 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-sky-700 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 disabled:opacity-60"
              >
                {loadingMore ? commonT("actions.loading") : commonT("actions.loadMore")}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </AccountShell>
  );
}
