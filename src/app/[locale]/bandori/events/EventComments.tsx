"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import CommentThread from "@/components/comments/CommentThread";
import type { CommentThreadLocation } from "@/hooks/useCommentThread";
import { getBandoriServerCode, type BandoriServer } from "@/lib/bandori-server";
import {
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
  const t = useTranslations("bandori.events.comments");
  const serverCode = getBandoriServerCode(server);
  const apiBase = eventId ? `/api/bandori/events/${eventId}/comments` : null;

  const readLocation = useCallback((): CommentThreadLocation => {
    const params = readEventTrackerSearchParams();
    return {
      page: readPositiveIntegerSearchParam(params, "page") ?? 1,
      commentId: params.get("comment"),
    };
  }, []);

  const updateLocation = useCallback((location: CommentThreadLocation) => {
    replaceEventTrackerUrlQuery({
      eventId,
      server,
      commentPage: location.page,
      commentId: location.commentId,
    });
  }, [eventId, server]);

  const buildPermalink = useCallback((commentId: string, page: number): string => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    if (eventId) url.searchParams.set("event", String(eventId));
    url.searchParams.set("server", serverCode);
    url.searchParams.set("page", String(page));
    url.searchParams.set("comment", commentId);
    return url.toString();
  }, [eventId, serverCode]);

  return (
    <CommentThread
      apiBase={apiBase}
      apiQuery={`server=${serverCode}`}
      targetKey={`${serverCode}:${eventId ?? ""}`}
      readLocation={readLocation}
      updateLocation={updateLocation}
      buildPermalink={buildPermalink}
      title={t("title")}
      signedOutMessage={t("signedOutMessage")}
      emptyMessage={t("emptyMessage")}
    />
  );
}
