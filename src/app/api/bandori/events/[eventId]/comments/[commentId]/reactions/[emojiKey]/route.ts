import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import {
  COMMENT_TARGET_BANDORI_EVENT,
  parseCommentReactionKey,
  reactToComment,
  removeCommentReaction,
} from "@/lib/comments";
import { buildBandoriEventCommentTargetId, parseBandoriEventCommentServer } from "@/lib/bandori-comment-target";

type RouteContext = {
  params: Promise<{ eventId: string; commentId: string; emojiKey: string }>;
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
    const { eventId: rawEventId, commentId, emojiKey: rawEmojiKey } = await context.params;
    const eventId = parseEventId(rawEventId);
    const server = parseBandoriEventCommentServer(new URL(request.url));
    if (server === null) throw new ApiRouteError(400, "INVALID_SERVER", "服务器参数无效");
    const emojiKey = parseCommentReactionKey(rawEmojiKey);

    return jsonSuccess(await reactToComment({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: buildBandoriEventCommentTargetId(eventId, server),
      commentId,
      userId: user.id,
      emojiKey,
    }));
  } catch (error) {
    console.error("Bandori event comment reaction API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENT_REACTION_FAILED",
      message: "评论回应失败",
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { eventId: rawEventId, commentId, emojiKey: rawEmojiKey } = await context.params;
    const eventId = parseEventId(rawEventId);
    const server = parseBandoriEventCommentServer(new URL(request.url));
    if (server === null) throw new ApiRouteError(400, "INVALID_SERVER", "服务器参数无效");
    const emojiKey = parseCommentReactionKey(rawEmojiKey);

    return jsonSuccess(await removeCommentReaction({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: buildBandoriEventCommentTargetId(eventId, server),
      commentId,
      userId: user.id,
      emojiKey,
    }));
  } catch (error) {
    console.error("Bandori event comment reaction remove API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENT_REACTION_REMOVE_FAILED",
      message: "取消评论回应失败",
    });
  }
}
