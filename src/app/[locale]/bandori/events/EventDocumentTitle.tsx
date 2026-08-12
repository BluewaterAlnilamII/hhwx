"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { pickBandoriRegionalText, type BandoriServer } from "@/lib/bandori-server";
import { formatSiteDocumentTitle } from "@/lib/site-brand";
import type { EventMetadata } from "./_tracker/types";

type EventDocumentTitleProps = {
  event: EventMetadata | null;
  server: BandoriServer;
};

export default function EventDocumentTitle({ event, server }: EventDocumentTitleProps) {
  const t = useTranslations("metadata.eventtracker");
  const eventName = event
    ? pickBandoriRegionalText(
        [event.name.jp, event.name.en, event.name.tw, event.name.cn],
        server,
        server,
      )
    : null;
  const pageTitle = event && eventName
    ? t("eventTitle", { eventId: event.eventId, eventName })
    : null;

  useEffect(() => {
    if (pageTitle) {
      document.title = formatSiteDocumentTitle(pageTitle);
    }
  }, [pageTitle]);

  return null;
}
