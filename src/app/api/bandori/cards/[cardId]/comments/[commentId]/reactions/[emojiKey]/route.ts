import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import {
  parseCommentId,
  parseCommentReactionKey,
  parseCommentReactionParticipantCursor,
} from "@/lib/comments/comment-contract";
import {
  listCommentReactionParticipants,
  reactToComment,
  removeCommentReaction,
} from "@/lib/comments/comments-server";
import {
  COMMENT_TARGET_BANDORI_CARD,
  buildBandoriCardCommentTargetId,
  parseBandoriCardCommentCardId,
  parseBandoriCardCommentEntityServer,
} from "@/lib/bandori/cards/comment-target";
import { requireBandoriCardCommentTarget } from "@/lib/bandori/cards/comment-target-server";

type RouteContext = {
  params: Promise<{ cardId: string; commentId: string; emojiKey: string }>;
};

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { cardId: rawCardId, commentId: rawCommentId, emojiKey: rawEmojiKey } = await context.params;
    const cardId = parseBandoriCardCommentCardId(rawCardId);
    const url = new URL(request.url);
    const entityServer = parseBandoriCardCommentEntityServer(cardId, url);

    return jsonSuccess(await listCommentReactionParticipants({
      targetType: COMMENT_TARGET_BANDORI_CARD,
      targetId: buildBandoriCardCommentTargetId(cardId, entityServer),
      commentId: parseCommentId(rawCommentId),
      emojiKey: parseCommentReactionKey(rawEmojiKey),
      cursor: parseCommentReactionParticipantCursor(url.searchParams.get("cursor")),
    }), { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Bandori card comment reaction participants API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "CARD_COMMENT_REACTION_PARTICIPANTS_READ_FAILED",
      message: "无法读取评论回应用户",
    }, { headers: NO_STORE_HEADERS });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { cardId: rawCardId, commentId: rawCommentId, emojiKey: rawEmojiKey } = await context.params;
    const cardId = parseBandoriCardCommentCardId(rawCardId);
    const entityServer = parseBandoriCardCommentEntityServer(cardId, new URL(request.url));
    const targetId = await requireBandoriCardCommentTarget(cardId, entityServer);

    return jsonSuccess(await reactToComment({
      targetType: COMMENT_TARGET_BANDORI_CARD,
      targetId,
      commentId: parseCommentId(rawCommentId),
      userId: user.id,
      emojiKey: parseCommentReactionKey(rawEmojiKey),
    }));
  } catch (error) {
    console.error("Bandori card comment reaction API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "CARD_COMMENT_REACTION_FAILED",
      message: "评论回应失败",
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { cardId: rawCardId, commentId: rawCommentId, emojiKey: rawEmojiKey } = await context.params;
    const cardId = parseBandoriCardCommentCardId(rawCardId);
    const entityServer = parseBandoriCardCommentEntityServer(cardId, new URL(request.url));
    const targetId = await requireBandoriCardCommentTarget(cardId, entityServer);

    return jsonSuccess(await removeCommentReaction({
      targetType: COMMENT_TARGET_BANDORI_CARD,
      targetId,
      commentId: parseCommentId(rawCommentId),
      userId: user.id,
      emojiKey: parseCommentReactionKey(rawEmojiKey),
    }));
  } catch (error) {
    console.error("Bandori card comment reaction remove API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "CARD_COMMENT_REACTION_REMOVE_FAILED",
      message: "取消评论回应失败",
    });
  }
}
