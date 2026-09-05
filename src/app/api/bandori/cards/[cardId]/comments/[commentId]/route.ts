import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { readViewerUserId, requireVerifiedAccount } from "@/lib/auth-server";
import { parseCommentContent, parseCommentId } from "@/lib/comments/comment-contract";
import {
  getCommentContext,
  softDeleteComment,
  updateComment,
} from "@/lib/comments/comments-server";
import {
  COMMENT_TARGET_BANDORI_CARD,
  buildBandoriCardCommentTargetId,
  parseBandoriCardCommentCardId,
  parseBandoriCardCommentEntityServer,
} from "@/lib/bandori/cards/comment-target";
import { requireBandoriCardCommentTarget } from "@/lib/bandori/cards/comment-target-server";

type RouteContext = {
  params: Promise<{ cardId: string; commentId: string }>;
};

type UpdateCommentRequest = {
  content?: unknown;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { cardId: rawCardId, commentId: rawCommentId } = await context.params;
    const cardId = parseBandoriCardCommentCardId(rawCardId);
    const entityServer = parseBandoriCardCommentEntityServer(cardId, new URL(request.url));

    return jsonSuccess(await getCommentContext({
      targetType: COMMENT_TARGET_BANDORI_CARD,
      targetId: buildBandoriCardCommentTargetId(cardId, entityServer),
      commentId: parseCommentId(rawCommentId),
      viewerUserId: await readViewerUserId(request),
    }));
  } catch (error) {
    console.error("Bandori card comment GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "CARD_COMMENT_READ_FAILED",
      message: "无法读取评论",
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { cardId: rawCardId, commentId: rawCommentId } = await context.params;
    const cardId = parseBandoriCardCommentCardId(rawCardId);
    const commentId = parseCommentId(rawCommentId);
    const entityServer = parseBandoriCardCommentEntityServer(cardId, new URL(request.url));

    let body: UpdateCommentRequest;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const targetId = await requireBandoriCardCommentTarget(cardId, entityServer);
    return jsonSuccess(await updateComment({
      targetType: COMMENT_TARGET_BANDORI_CARD,
      targetId,
      commentId,
      userId: user.id,
      content: parseCommentContent(body.content),
    }));
  } catch (error) {
    console.error("Bandori card comment PATCH API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "CARD_COMMENT_UPDATE_FAILED",
      message: "评论更新失败",
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { cardId: rawCardId, commentId: rawCommentId } = await context.params;
    const cardId = parseBandoriCardCommentCardId(rawCardId);
    const commentId = parseCommentId(rawCommentId);
    const entityServer = parseBandoriCardCommentEntityServer(cardId, new URL(request.url));
    const targetId = await requireBandoriCardCommentTarget(cardId, entityServer);

    return jsonSuccess(await softDeleteComment({
      targetType: COMMENT_TARGET_BANDORI_CARD,
      targetId,
      commentId,
      userId: user.id,
    }));
  } catch (error) {
    console.error("Bandori card comment DELETE API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "CARD_COMMENT_DELETE_FAILED",
      message: "评论删除失败",
    });
  }
}
