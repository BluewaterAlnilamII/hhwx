"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import CommentThread from "@/components/comments/CommentThread";
import type { CommentThreadLocation } from "@/hooks/useCommentThread";
import { getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";
import {
  buildEventCommentPermalink,
  readEventTrackerSearchParams,
  readPositiveIntegerSearchParam,
  replaceEventTrackerUrlQuery,
} from "./urlQuery";

export default function EventComments({
  eventId,
  server,
}: {
  eventId: number | null;
  server: BandoriServer;
}) {
  const locale = useLocale();
  const t = useTranslations("bandori.events.comments");
  const serverCode = getBandoriServerCode(server);
  const apiBase = eventId ? `/api/bandori/events/${eventId}/comments` : null;
  const targetKey = `${serverCode}:${eventId ?? ""}`;

  const readLocation = useCallback((): CommentThreadLocation => {
    const params = readEventTrackerSearchParams();
    return {
      page: readPositiveIntegerSearchParam(params, "page") ?? 1,
      commentId: params.get("comment"),
    };
  }, []);

  const updateLocation = useCallback((location: CommentThreadLocation) => {
    replaceEventTrackerUrlQuery({
      server,
      commentPage: location.page,
      commentId: location.commentId,
    });
  }, [server]);

  const buildPermalink = useCallback((commentId: string, page: number): string => {
    if (typeof window === "undefined") return "";
    return buildEventCommentPermalink({
      currentHref: window.location.href,
      locale,
      eventId,
      server,
      page,
      commentId,
    });
  }, [eventId, locale, server]);

  return (
    <CommentThread
      key={targetKey}
      apiBase={apiBase}
      apiQuery={`server=${serverCode}`}
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
