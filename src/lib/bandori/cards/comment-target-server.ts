import { ApiRouteError } from "@/lib/api-contracts";
import { readBandoriCardApiDetail } from "@/lib/bandori/cards/api-server";
import {
  buildBandoriCardCommentTargetId,
} from "@/lib/bandori/cards/comment-target";
import {
  isKnownBandoriCardEntityCollision,
  materializeBandoriCardForServer,
} from "@/lib/bandori/cards/regional-extensions";
import type { BandoriServer } from "@/lib/bandori-server";

export async function requireBandoriCardCommentTarget(
  cardId: string,
  entityServer: BandoriServer | null,
): Promise<string> {
  const card = await readBandoriCardApiDetail(cardId);
  const isCollision = isKnownBandoriCardEntityCollision(cardId);
  const isAccessible = card !== null && (
    !isCollision
    || (
      (entityServer === 1 || entityServer === 3)
      && materializeBandoriCardForServer(card, entityServer) !== null
    )
  );

  if (!isAccessible) {
    throw new ApiRouteError(
      404,
      "CARD_COMMENT_TARGET_NOT_FOUND",
      "卡牌评论目标不存在",
    );
  }

  return buildBandoriCardCommentTargetId(cardId, entityServer);
}
