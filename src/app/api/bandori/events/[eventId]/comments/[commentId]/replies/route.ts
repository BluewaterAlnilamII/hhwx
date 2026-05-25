import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser } from "@/lib/auth-server";
import { COMMENT_TARGET_BANDORI_EVENT, listComments } from "@/lib/comments";

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
    const url = new URL(request.url);
    const viewerUserId = await readViewerUserId(request);

    return jsonSuccess(await listComments({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: eventId,
      parentId: commentId,
      cursor: url.searchParams.get("cursor"),
      viewerUserId,
    }));
  } catch (error) {
    console.error("Bandori event comment replies GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENT_REPLIES_READ_FAILED",
      message: "无法读取回复",
    });
  }
}

