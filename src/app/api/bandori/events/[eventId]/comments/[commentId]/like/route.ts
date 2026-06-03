import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { COMMENT_TARGET_BANDORI_EVENT, likeComment, unlikeComment } from "@/lib/comments";

type RouteContext = {
  params: Promise<{ eventId: string; commentId: string }>;
};

function parseEventId(rawEventId: string): string {
  const eventId = Number.parseInt(rawEventId, 10);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new ApiRouteError(400, "INVALID_EVENT_ID", "活动 ID 无效");
  }

  return String(eventId);
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { eventId: rawEventId, commentId } = await context.params;
    const eventId = parseEventId(rawEventId);

    return jsonSuccess(await likeComment({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: eventId,
      commentId,
      userId: user.id,
    }));
  } catch (error) {
    console.error("Bandori event comment like API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENT_LIKE_FAILED",
      message: "点赞失败",
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { eventId: rawEventId, commentId } = await context.params;
    const eventId = parseEventId(rawEventId);

    return jsonSuccess(await unlikeComment({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: eventId,
      commentId,
      userId: user.id,
    }));
  } catch (error) {
    console.error("Bandori event comment unlike API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENT_UNLIKE_FAILED",
      message: "取消点赞失败",
    });
  }
}
