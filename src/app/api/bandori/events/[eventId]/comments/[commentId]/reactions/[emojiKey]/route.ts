import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import {
  parseCommentId,
  parseCommentReactionKey,
  parseCommentReactionParticipantCursor,
} from "@/lib/comments/comment-contract";
import { requireBandoriEventCommentTarget } from "@/lib/bandori/events/comment-target-server";
import {
  listCommentReactionParticipants,
  reactToComment,
  removeCommentReaction,
} from "@/lib/comments/comments-server";
import {
  COMMENT_TARGET_BANDORI_EVENT,
  buildBandoriEventCommentTargetId,
  parseBandoriEventCommentEventId,
  parseBandoriEventCommentServer,
} from "@/lib/bandori/events/comment-target";

type RouteContext = {
  params: Promise<{ eventId: string; commentId: string; emojiKey: string }>;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { eventId: rawEventId, commentId: rawCommentId, emojiKey: rawEmojiKey } = await context.params;
    const eventId = parseBandoriEventCommentEventId(rawEventId);
    const commentId = parseCommentId(rawCommentId);
    const emojiKey = parseCommentReactionKey(rawEmojiKey);
    const url = new URL(request.url);
    const server = parseBandoriEventCommentServer(url);
    if (server === null) throw new ApiRouteError(400, "INVALID_SERVER", "服务器参数无效");
    const cursor = parseCommentReactionParticipantCursor(url.searchParams.get("cursor"));

    return jsonSuccess(await listCommentReactionParticipants({
      targetType: COMMENT_TARGET_BANDORI_EVENT,
      targetId: buildBandoriEventCommentTargetId(eventId, server),
      commentId,
      emojiKey,
      cursor,
    }), { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Bandori event comment reaction participants API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "EVENT_COMMENT_REACTION_PARTICIPANTS_READ_FAILED",
      message: "无法读取评论回应用户",
    }, { headers: NO_STORE_HEADERS });
  }
}

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
