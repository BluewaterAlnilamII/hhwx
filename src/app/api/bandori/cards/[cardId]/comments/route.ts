import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireAuthenticatedUser, requireVerifiedAccount } from "@/lib/auth-server";
import {
  parseCommentContent,
  parseCommentPage,
  parseParentCommentId,
} from "@/lib/comments/comment-contract";
import { createComment, listComments } from "@/lib/comments/comments-server";
import {
  COMMENT_TARGET_BANDORI_CARD,
  buildBandoriCardCommentTargetId,
  parseBandoriCardCommentCardId,
  parseBandoriCardCommentEntityServer,
} from "@/lib/bandori/cards/comment-target";
import { requireBandoriCardCommentTarget } from "@/lib/bandori/cards/comment-target-server";

type RouteContext = {
  params: Promise<{ cardId: string }>;
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
    const { cardId: rawCardId } = await context.params;
    const cardId = parseBandoriCardCommentCardId(rawCardId);
    const url = new URL(request.url);
    const entityServer = parseBandoriCardCommentEntityServer(cardId, url);

    return jsonSuccess(await listComments({
      targetType: COMMENT_TARGET_BANDORI_CARD,
      targetId: buildBandoriCardCommentTargetId(cardId, entityServer),
      parentId: null,
      cursor: url.searchParams.get("cursor"),
      page: parseCommentPage(url.searchParams.get("page")),
      viewerUserId: await readViewerUserId(request),
    }));
  } catch (error) {
    console.error("Bandori card comments GET API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "CARD_COMMENTS_READ_FAILED",
      message: "无法读取卡牌评论",
    });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireVerifiedAccount(request);
    const { cardId: rawCardId } = await context.params;
    const cardId = parseBandoriCardCommentCardId(rawCardId);
    const entityServer = parseBandoriCardCommentEntityServer(cardId, new URL(request.url));

    let body: CreateCommentRequest;
    try {
      body = await request.json();
    } catch {
      throw new ApiRouteError(400, "INVALID_JSON", "请求体不是有效的 JSON");
    }

    const targetId = await requireBandoriCardCommentTarget(cardId, entityServer);
    return jsonSuccess(await createComment({
      targetType: COMMENT_TARGET_BANDORI_CARD,
      targetId,
      parentId: parseParentCommentId(body.parentId),
      userId: user.id,
      content: parseCommentContent(body.content),
    }), { status: 201 });
  } catch (error) {
    console.error("Bandori card comments POST API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "CARD_COMMENT_CREATE_FAILED",
      message: "评论发送失败",
    });
  }
}
