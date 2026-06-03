import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { countUnreadCommentNotifications } from "@/lib/comment-notifications-server";

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser(request);
    return jsonSuccess({
      unreadCount: await countUnreadCommentNotifications(user.id),
    });
  } catch (error) {
    console.error("Account notification unread count API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "ACCOUNT_NOTIFICATION_COUNT_FAILED",
      message: "未读提醒读取失败",
    });
  }
}
