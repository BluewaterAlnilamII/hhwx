"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import CommentThread from "@/components/comments/CommentThread";
import type { CommentThreadLocation } from "@/hooks/useCommentThread";
import { buildBandoriCardCommentTargetId } from "@/lib/bandori/cards/comment-target";
import {
  buildBandoriCardCommentPermalink,
  readBandoriCardDetailLocation,
  replaceBandoriCardDetailUrlQuery,
} from "@/lib/bandori/cards/detail-url";
import { getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";

export type CardCommentsProps = {
  cardId: number;
  entityServer: BandoriServer | null;
};

export default function CardComments({ cardId, entityServer }: CardCommentsProps) {
  const locale = useLocale();
  const t = useTranslations("bandori.cards.comments");
  const apiBase = `/api/bandori/cards/${cardId}/comments`;
  const apiQuery = entityServer === null
    ? ""
    : `server=${getBandoriServerCode(entityServer)}`;
  const targetKey = buildBandoriCardCommentTargetId(cardId, entityServer);

  const readLocation = useCallback((): CommentThreadLocation => (
    readBandoriCardDetailLocation()
  ), []);

  const updateLocation = useCallback((location: CommentThreadLocation) => {
    replaceBandoriCardDetailUrlQuery({
      commentPage: location.page,
      commentId: location.commentId,
    });
  }, []);

  const buildPermalink = useCallback((commentId: string, page: number): string => {
    if (typeof window === "undefined") return "";
    return buildBandoriCardCommentPermalink({
      currentHref: window.location.href,
      locale,
      cardId,
      page,
      commentId,
    });
  }, [cardId, locale]);

  return (
    <CommentThread
      key={targetKey}
      apiBase={apiBase}
      apiQuery={apiQuery}
      targetKey={targetKey}
      readLocation={readLocation}
      updateLocation={updateLocation}
      buildPermalink={buildPermalink}
      title={t("title")}
      signedOutMessage={t("signedOutMessage")}
      emptyMessage={t("emptyMessage")}
    />
  );
}
