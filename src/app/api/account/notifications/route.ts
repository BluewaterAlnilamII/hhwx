import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import {
  COMMENT_TARGET_BANDORI_EVENT,
  parseBandoriEventCommentTargetId,
} from "@/lib/bandori/events/comment-target";
import { getBandoriServerCode, type BandoriServerCode } from "@/lib/bandori-server";
import {
  parseCommentNotificationType,
  type CommentNotification,
  type CommentNotificationListResponse,
} from "@/lib/comments/comment-contract";
import {
  listCommentNotifications,
  markAllCommentNotificationsRead,
  markCommentNotificationRead,
} from "@/lib/comments/notifications-server";

type UpdateNotificationsRequest = {
  action?: unknown;
  notificationId?: unknown;
};

type AccountCommentNotification = CommentNotification & {
  /** @deprecated Read targetType and targetId instead. */
  eventId: number | null;
  /** @deprecated Read targetType and targetId instead. */
  server: BandoriServerCode | null;
};

type AccountCommentNotificationListResponse = Omit<CommentNotificationListResponse, "notifications"> & {
  notifications: AccountCommentNotification[];
};

function toAccountCommentNotification(notification: CommentNotification): AccountCommentNotification {
  const target = notification.targetType === COMMENT_TARGET_BANDORI_EVENT
    ? parseBandoriEventCommentTargetId(notification.targetId)
    : null;

  return {
    ...notification,
    eventId: target?.eventId ?? null,
    server: target ? getBandoriServerCode(target.server) : null,
  };
}

function toAccountCommentNotificationListResponse(
  response: CommentNotificationListResponse,
): AccountCommentNotificationListResponse {
  return {
    ...response,
    notifications: response.notifications.map(toAccountCommentNotification),
  };
}

function normalizeNotificationId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiRouteError(400, "INVALID_NOTIFICATION_ID", "提醒 ID 无效");
  }

  return value.trim();
}

function normalizeNotificationType(value: string | null) {
  if (!value) {
    return null;
  }

  const notificationType = parseCommentNotificationType(value);
  if (!notificationType) {
    throw new ApiRouteError(400, "INVALID_NOTIFICATION_TYPE", "提醒类型无效");
  }

  return notificationType;
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const url = new URL(request.url);

    const notifications = await listCommentNotifications({
      userId: user.id,
      type: normalizeNotificationType(url.searchParams.get("type")),
      cursor: url.searchParams.get("cursor"),
    });
    return jsonSuccess(toAccountCommentNotificationListResponse(notifications));
  } catch (error) {
    console.error("Account notifications GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "ACCOUNT_NOTIFICATIONS_READ_FAILED",
      message: "提醒读取失败",
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    let body: UpdateNotificationsRequest;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    if (body.action === "mark-all-read") {
      await markAllCommentNotificationsRead(user.id);
      return jsonSuccess({ ok: true });
    }

    if (body.action === "mark-read") {
      await markCommentNotificationRead({
        userId: user.id,
        notificationId: normalizeNotificationId(body.notificationId),
      });
      return jsonSuccess({ ok: true });
    }

    throw new ApiRouteError(400, "INVALID_NOTIFICATION_ACTION", "提醒操作无效");
  } catch (error) {
    console.error("Account notifications PATCH API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "ACCOUNT_NOTIFICATIONS_UPDATE_FAILED",
      message: "提醒状态更新失败",
    });
  }
}
