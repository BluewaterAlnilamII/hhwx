import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser, requireVerifiedAccount } from "@/lib/auth-server";
import {
  COMMENT_TARGET_BANDORI_EVENT,
  createComment,
  listComments,
  parseCommentContent,
} from "@/lib/comments";

type RouteContext = {
  params: Promise<{ eventId: string }>;
};

type CreateCommentRequest = {
  content?: unknown;
  parentId?: unknown;
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
    const { eventId: rawEventId } = await context.params;
    const eventId = parseEventId(rawEventId);
    const url = new URL(request.url);
    const viewerUserId = await readViewerUserId(request);

    return jsonSuccess(await listComments({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: eventId,
      parentId: null,
      cursor: url.searchParams.get("cursor"),
      page: Number.parseInt(url.searchParams.get("page") ?? "1", 10),
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
    const eventId = parseEventId(rawEventId);

    let body: CreateCommentRequest;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const parentId = typeof body.parentId === "string" && body.parentId ? body.parentId : null;
    const content = parseCommentContent(body.content);

    return jsonSuccess(await createComment({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: eventId,
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
