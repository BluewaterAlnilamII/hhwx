import { ApiRouteError } from "@/lib/api-contracts";
import {
  buildBandoriEventCommentTargetId,
  isBandoriEventCommentTargetAccessible,
} from "@/lib/bandori/events/comment-target";
import { readBandoriEventApiDetail } from "@/lib/bandori/events/api-server";
import type { BandoriServer } from "@/lib/bandori-server";

export async function requireBandoriEventCommentTarget(
  eventId: string,
  server: BandoriServer,
): Promise<string> {
  const event = await readBandoriEventApiDetail(eventId);
  if (!event || !isBandoriEventCommentTargetAccessible(event, server)) {
    throw new ApiRouteError(
      404,
      "EVENT_COMMENT_TARGET_NOT_FOUND",
      "当前服务器没有可访问的活动评论目标",
    );
  }

  return buildBandoriEventCommentTargetId(eventId, server);
}
