import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser, requireVerifiedAccount } from "@/lib/auth-server";
import {
  parseCommentContent,
  parseCommentPage,
  parseParentCommentId,
} from "@/lib/comments/comment-contract";
import { requireBandoriEventCommentTarget } from "@/lib/bandori/events/comment-target-server";
import { createComment, listComments } from "@/lib/comments/comments-server";
import {
  COMMENT_TARGET_BANDORI_EVENT,
  buildBandoriEventCommentTargetId,
  parseBandoriEventCommentEventId,
  parseBandoriEventCommentServer,
} from "@/lib/bandori/events/comment-target";

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

type CreateCommentRequest = {
  content?: unknown;
  parentId?: unknown;
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
    const { eventId: rawEventId } = await context.params;
    const eventId = parseBandoriEventCommentEventId(rawEventId);
    const url = new URL(request.url);
    const server = parseBandoriEventCommentServer(url);
    if (server === null) {
      throw new ApiRouteError(400, "INVALID_SERVER", "服务器参数无效");
    }
    const viewerUserId = await readViewerUserId(request);

    return jsonSuccess(await listComments({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: buildBandoriEventCommentTargetId(eventId, server),
      parentId: null,
      cursor: url.searchParams.get("cursor"),
      page: parseCommentPage(url.searchParams.get("page")),
      viewerUserId,
    }));
  } catch (error) {
    console.error("Bandori event comments GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENTS_READ_FAILED",
      message: "无法读取活动评论",
    });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { eventId: rawEventId } = await context.params;
    const eventId = parseBandoriEventCommentEventId(rawEventId);
    const server = parseBandoriEventCommentServer(new URL(request.url));
    if (server === null) {
      throw new ApiRouteError(400, "INVALID_SERVER", "服务器参数无效");
    }

    let body: CreateCommentRequest;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const parentId = parseParentCommentId(body.parentId);
    const content = parseCommentContent(body.content);
    const targetId = await requireBandoriEventCommentTarget(eventId, server);

    return jsonSuccess(await createComment({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId,
      parentId,
      userId: user.id,
      content,
    }), { status: 201 });
  } catch (error) {
    console.error("Bandori event comments POST API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENT_CREATE_FAILED",
      message: "评论发送失败",
    });
  }
}
