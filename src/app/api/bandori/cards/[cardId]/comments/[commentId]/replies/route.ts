import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { readViewerUserId } from "@/lib/auth-server";
import { parseCommentId } from "@/lib/comments/comment-contract";
import { listThreadReplies } from "@/lib/comments/comments-server";
import {
  COMMENT_TARGET_BANDORI_CARD,
  buildBandoriCardCommentTargetId,
  parseBandoriCardCommentCardId,
  parseBandoriCardCommentEntityServer,
} from "@/lib/bandori/cards/comment-target";

type RouteContext = {
  params: Promise<{ cardId: string; commentId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { cardId: rawCardId, commentId: rawCommentId } = await context.params;
    const cardId = parseBandoriCardCommentCardId(rawCardId);
    const url = new URL(request.url);
    const entityServer = parseBandoriCardCommentEntityServer(cardId, url);

    return jsonSuccess(await listThreadReplies({
      targetType: COMMENT_TARGET_BANDORI_CARD,
      targetId: buildBandoriCardCommentTargetId(cardId, entityServer),
      rootId: parseCommentId(rawCommentId),
      cursor: url.searchParams.get("cursor"),
      viewerUserId: await readViewerUserId(request),
    }));
  } catch (error) {
    console.error("Bandori card comment replies GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "CARD_COMMENT_REPLIES_READ_FAILED",
      message: "无法读取回复",
    });
  }
}
