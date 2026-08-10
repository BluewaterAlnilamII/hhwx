import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import {
  parseCommentId,
  parseCommentReactionKey,
} from "@/lib/comments/comment-contract";
import { requireBandoriEventCommentTarget } from "@/lib/bandori/events/comment-target-server";
import {
  reactToComment,
  removeCommentReaction,
} from "@/lib/comments/comments-server";
import {
  COMMENT_TARGET_BANDORI_EVENT,
  parseBandoriEventCommentEventId,
  parseBandoriEventCommentServer,
} from "@/lib/bandori/events/comment-target";

type RouteContext = {
  params: Promise<{ eventId: string; commentId: string; emojiKey: string }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { eventId: rawEventId, commentId: rawCommentId, emojiKey: rawEmojiKey } = await context.params;
    const eventId = parseBandoriEventCommentEventId(rawEventId);
    const commentId = parseCommentId(rawCommentId);
    const server = parseBandoriEventCommentServer(new URL(request.url));
    if (server === null) throw new ApiRouteError(400, "INVALID_SERVER", "服务器参数无效");
    const emojiKey = parseCommentReactionKey(rawEmojiKey);
    const targetId = await requireBandoriEventCommentTarget(eventId, server);

    return jsonSuccess(await reactToComment({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId,
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
    const { eventId: rawEventId, commentId: rawCommentId, emojiKey: rawEmojiKey } = await context.params;
    const eventId = parseBandoriEventCommentEventId(rawEventId);
    const commentId = parseCommentId(rawCommentId);
    const server = parseBandoriEventCommentServer(new URL(request.url));
    if (server === null) throw new ApiRouteError(400, "INVALID_SERVER", "服务器参数无效");
    const emojiKey = parseCommentReactionKey(rawEmojiKey);
    const targetId = await requireBandoriEventCommentTarget(eventId, server);

    return jsonSuccess(await removeCommentReaction({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId,
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
