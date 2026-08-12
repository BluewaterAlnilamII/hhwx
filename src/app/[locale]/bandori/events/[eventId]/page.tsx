import type { Metadata } from "next";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import EventTrackerPage from "../EventTrackerPage";
import { parseBandoriEventRouteId } from "@/lib/bandori/events/route";
import { readBandoriEventApiDetail } from "@/lib/bandori/events/api-server";
import { parseBandoriServerParam, pickBandoriRegionalText } from "@/lib/bandori-server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BandoriEventPageProps = {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const readEventDetail = cache(readBandoriEventApiDetail);

export async function generateMetadata({
  params,
  searchParams,
}: BandoriEventPageProps): Promise<Metadata> {
  const [{ locale, eventId: rawEventId }, query] = await Promise.all([params, searchParams]);
  const t = await getTranslations({ locale, namespace: "metadata.eventtracker" });
  const eventId = parseBandoriEventRouteId(rawEventId);
  if (eventId === null) {
    return { title: buildSiteMetadataTitle(t("title")) };
  }

  const event = await readEventDetail(String(eventId));
  const rawServer = typeof query.server === "string" ? query.server : null;
  const server = parseBandoriServerParam(rawServer);
  const eventName = server === null || !event
    ? null
    : pickBandoriRegionalText(
        Array.isArray(event.eventName) ? event.eventName : [],
        server,
        server,
      );

  return {
    title: buildSiteMetadataTitle(
      eventName
        ? t("eventTitle", { eventId, eventName })
        : t("title"),
    ),
  };
}

export default async function BandoriEventPage({ params }: BandoriEventPageProps) {
  const { eventId: rawEventId } = await params;
  const eventId = parseBandoriEventRouteId(rawEventId);
  const event = eventId === null
    ? null
    : await readEventDetail(String(eventId));
  if (eventId === null || event === null) {
    notFound();
  }

  return <EventTrackerPage initialEventId={eventId} />;
}
