"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AccountShell, { AccountErrorState, AccountLoadingState, AccountSignInState } from "../AccountShell";
import { getAccessToken, useAccountProfile } from "../useAccountProfile";
import { getApiErrorMessage, parseApiSuccessData } from "@/lib/api-contracts";

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

function notifyNotificationsUpdated(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

function getNotificationMessage(notification: CommentNotification): string {
  const actor = notification.actorUsername ?? "有用户";
  return notification.type === "comment_reply"
    ? `${actor} 回复了你的评论`
    : `${actor} 赞了你的评论`;
}

function formatNotificationTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  const data = parseApiSuccessData<T>(payload);
  if (!response.ok || data === null) {
    throw new Error(getApiErrorMessage(payload) ?? `请求失败（HTTP ${response.status}）`);
  }

  return data;
}

export default function AccountNotificationsPage() {
  const { userId, authReady, loadingProfile, profileError } = useAccountProfile();
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
      const data = await requestJson<NotificationListResponse>(`/api/account/notifications${suffix}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setNotifications((current) => cursor ? [...current, ...data.notifications] : data.notifications);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提醒读取失败");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

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
    await requestJson<{ ok: boolean }>("/api/account/notifications", {
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
    await requestJson<{ ok: boolean }>("/api/account/notifications", {
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
      title="提醒"
      description="查看活动评论的回复和点赞提醒。"
      backHref="/account"
      backLabel="返回账号中心"
    >
      {!authReady || loadingProfile || loading ? (
        <AccountLoadingState message="正在读取提醒..." />
      ) : !userId ? (
        <AccountSignInState nextPath="/account/notifications" />
      ) : profileError ? (
        <AccountErrorState message={profileError} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-semibold text-slate-500">
              {notifications.length > 0 ? `${notifications.length} 条提醒` : "暂无提醒"}
            </div>
            <button
              type="button"
              onClick={() => void markAllRead().catch((err) => setError(err instanceof Error ? err.message : "提醒状态更新失败"))}
              disabled={notifications.every((item) => item.readAt)}
              className="inline-flex h-9 items-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:border-sky-200 hover:text-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              全部标为已读
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
                      {!notification.readAt ? <span className="h-2 w-2 rounded-full bg-sky-500" aria-label="未读" /> : null}
                      <h2 className="text-sm font-semibold text-slate-900 sm:text-base">
                        {getNotificationMessage(notification)}
                      </h2>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      活动 #{notification.targetId} · {formatNotificationTime(notification.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">
                    查看
                  </span>
                </Link>
              );
            })}
          </div>

          {!loading && notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center text-sm font-semibold text-slate-400">
              还没有新的回复或点赞提醒。
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
                {loadingMore ? "加载中" : "加载更多"}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </AccountShell>
  );
}
