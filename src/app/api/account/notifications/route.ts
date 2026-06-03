import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import {
  listCommentNotifications,
  markAllCommentNotificationsRead,
  markCommentNotificationRead,
} from "@/lib/comment-notifications-server";

type UpdateNotificationsRequest = {
  action?: unknown;
  notificationId?: unknown;
};

function normalizeNotificationId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiRouteError(400, "INVALID_NOTIFICATION_ID", "提醒 ID 无效");
  }

  return value.trim();
}

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    const url = new URL(request.url);

    return jsonSuccess(await listCommentNotifications({
      userId: user.id,
      cursor: url.searchParams.get("cursor"),
    }));
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
