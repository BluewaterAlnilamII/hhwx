import { ApiRouteError } from "@/lib/api-contracts";
import { isKnownBandoriCardEntityCollision } from "@/lib/bandori/cards/regional-extensions";
import {
  getBandoriServerCode,
  parseBandoriServerParam,
  type BandoriServer,
} from "@/lib/bandori-server";

export const COMMENT_TARGET_BANDORI_CARD = "bandori_card";

const BANDORI_CARD_ID_PATTERN = /^[1-9]\d*$/u;
const BANDORI_CARD_COLLISION_TARGET_PATTERN = /^(en|cn):([1-9]\d*)$/u;

export type BandoriCardCommentTarget = {
  cardId: number;
  entityServer: BandoriServer | null;
};

export function parseBandoriCardCommentCardId(value: unknown): string {
  if (typeof value !== "string" || !BANDORI_CARD_ID_PATTERN.test(value)) {
    throw new ApiRouteError(400, "INVALID_CARD_ID", "卡牌 ID 无效");
  }

  const cardId = Number(value);
  if (!Number.isSafeInteger(cardId)) {
    throw new ApiRouteError(400, "INVALID_CARD_ID", "卡牌 ID 无效");
  }

  return value;
}

export function parseBandoriCardCommentEntityServer(
  cardId: string | number,
  url: URL,
): BandoriServer | null {
  const normalizedCardId = parseBandoriCardCommentCardId(String(cardId));
  const rawServer = url.searchParams.get("server");

  if (!isKnownBandoriCardEntityCollision(normalizedCardId)) {
    if (rawServer !== null) {
      throw new ApiRouteError(
        400,
        "UNEXPECTED_CARD_ENTITY_SERVER",
        "普通卡牌评论不接受服务器身份参数",
      );
    }
    return null;
  }

  const server = rawServer === null ? null : parseBandoriServerParam(rawServer);
  if (server !== 1 && server !== 3) {
    throw new ApiRouteError(
      400,
      "INVALID_CARD_ENTITY_SERVER",
      "当前卡牌评论必须指定 EN 或 CN 实体服务器",
    );
  }

  return server;
}

export function buildBandoriCardCommentTargetId(
  cardId: string | number,
  entityServer: BandoriServer | null,
): string {
  const normalizedCardId = parseBandoriCardCommentCardId(String(cardId));
  const isCollision = isKnownBandoriCardEntityCollision(normalizedCardId);

  if (!isCollision && entityServer === null) {
    return normalizedCardId;
  }
  if (isCollision && (entityServer === 1 || entityServer === 3)) {
    return `${getBandoriServerCode(entityServer)}:${normalizedCardId}`;
  }

  throw new ApiRouteError(
    400,
    "INVALID_CARD_COMMENT_TARGET",
    "卡牌评论目标无效",
  );
}

export function parseBandoriCardCommentTargetId(
  value: string,
): BandoriCardCommentTarget | null {
  if (BANDORI_CARD_ID_PATTERN.test(value)) {
    const cardId = Number(value);
    if (
      !Number.isSafeInteger(cardId)
      || isKnownBandoriCardEntityCollision(cardId)
    ) {
      return null;
    }
    return { cardId, entityServer: null };
  }

  const match = BANDORI_CARD_COLLISION_TARGET_PATTERN.exec(value);
  if (!match) return null;

  const server = parseBandoriServerParam(match[1]);
  const cardId = Number(match[2]);
  if (
    (server !== 1 && server !== 3)
    || !Number.isSafeInteger(cardId)
    || !isKnownBandoriCardEntityCollision(cardId)
  ) {
    return null;
  }

  return { cardId, entityServer: server };
}
