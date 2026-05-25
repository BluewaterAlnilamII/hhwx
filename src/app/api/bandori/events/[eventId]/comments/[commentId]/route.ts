import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser, requireVerifiedAccount } from "@/lib/auth-server";
import { COMMENT_TARGET_BANDORI_EVENT, getCommentContext, parseCommentContent, softDeleteComment, updateComment } from "@/lib/comments";

type RouteContext = {
  params: Promise<{ eventId: string; commentId: string }>;
};

type UpdateCommentRequest = {
  content?: unknown;
};

function parseEventId(rawEventId: string): string {
  const eventId = Number.parseInt(rawEventId, 10);
  if (!Number.isInteger(eventId) || eventId <= 0) {
    throw new ApiRouteError(400, "INVALID_EVENT_ID", "活动 ID 无效");
  }

  return String(eventId);
}

async function readViewerUserId(request: Request): Promise<string | null> {
  if (!request.headers.get("authorization")) {
    return null;
  }

  try {
    return (await requireAuthenticatedUser(request)).id;
  } catch {
    return null;
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { eventId: rawEventId, commentId } = await context.params;
    const eventId = parseEventId(rawEventId);

    return jsonSuccess(await getCommentContext({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: eventId,
      commentId,
      viewerUserId: await readViewerUserId(request),
    }));
  } catch (error) {
    console.error("Bandori event comment GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENT_READ_FAILED",
      message: "无法读取评论",
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { eventId: rawEventId, commentId } = await context.params;
    const eventId = parseEventId(rawEventId);

    let body: UpdateCommentRequest;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    return jsonSuccess(await updateComment({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: eventId,
      commentId,
      userId: user.id,
      content: parseCommentContent(body.content),
    }));
  } catch (error) {
    console.error("Bandori event comment PATCH API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENT_UPDATE_FAILED",
      message: "评论更新失败",
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { eventId: rawEventId, commentId } = await context.params;
    const eventId = parseEventId(rawEventId);

    return jsonSuccess(await softDeleteComment({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: eventId,
      commentId,
      userId: user.id,
    }));
  } catch (error) {
    console.error("Bandori event comment DELETE API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENT_DELETE_FAILED",
      message: "评论删除失败",
    });
  }
}
