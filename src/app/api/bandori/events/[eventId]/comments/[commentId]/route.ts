import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser, requireVerifiedAccount } from "@/lib/auth-server";
import {
  parseCommentContent,
  parseCommentId,
} from "@/lib/comments/comment-contract";
import { requireBandoriEventCommentTarget } from "@/lib/bandori/events/comment-target-server";
import {
  getCommentContext,
  softDeleteComment,
  updateComment,
} from "@/lib/comments/comments-server";
import {
  COMMENT_TARGET_BANDORI_EVENT,
  buildBandoriEventCommentTargetId,
  parseBandoriEventCommentEventId,
  parseBandoriEventCommentServer,
} from "@/lib/bandori/events/comment-target";

type RouteContext = {
  params: Promise<{ eventId: string; commentId: string }>;
};

type UpdateCommentRequest = {
  content?: unknown;
};

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
    const { eventId: rawEventId, commentId: rawCommentId } = await context.params;
    const eventId = parseBandoriEventCommentEventId(rawEventId);
    const commentId = parseCommentId(rawCommentId);
    const server = parseBandoriEventCommentServer(new URL(request.url));
    if (server === null) throw new ApiRouteError(400, "INVALID_SERVER", "服务器参数无效");

    return jsonSuccess(await getCommentContext({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: buildBandoriEventCommentTargetId(eventId, server),
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
    const { eventId: rawEventId, commentId: rawCommentId } = await context.params;
    const eventId = parseBandoriEventCommentEventId(rawEventId);
    const commentId = parseCommentId(rawCommentId);
    const server = parseBandoriEventCommentServer(new URL(request.url));
    if (server === null) throw new ApiRouteError(400, "INVALID_SERVER", "服务器参数无效");

    let body: UpdateCommentRequest;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const targetId = await requireBandoriEventCommentTarget(eventId, server);
    return jsonSuccess(await updateComment({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId,
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
    const { eventId: rawEventId, commentId: rawCommentId } = await context.params;
    const eventId = parseBandoriEventCommentEventId(rawEventId);
    const commentId = parseCommentId(rawCommentId);
    const server = parseBandoriEventCommentServer(new URL(request.url));
    if (server === null) throw new ApiRouteError(400, "INVALID_SERVER", "服务器参数无效");

    const targetId = await requireBandoriEventCommentTarget(eventId, server);
    return jsonSuccess(await softDeleteComment({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId,
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
