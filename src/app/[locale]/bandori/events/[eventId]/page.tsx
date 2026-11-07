import type { Metadata } from "next";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import EventTrackerPage from "../EventTrackerPage";
import { parseBandoriEventRouteId } from "@/lib/bandori/events/route";
import { readBandoriEventApiDetail } from "@/lib/bandori/events/api-server";
import { parseBandoriServerParam, pickBandoriRegionalText } from "@/lib/bandori-server";
import { buildSiteMetadataTitle } from "@/lib/site-brand";
import { toBandoriEventSummary } from "@/lib/bandori/events/summary";
import { BANDORI_EVENTS_INDEX_KEY, buildBandoriPublicAssetUrl, parseBandoriEventsAssetIndex } from "@/lib/bandori-public-asset-index";
import { fetchBandoriPublicAssetIndexJson } from "@/lib/bandori-public-asset-index-server";
import { SNAPSHOT_HTTP_CACHE_POLICY } from "@/lib/api-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BandoriEventPageProps = {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const readEventDetail = cache(readBandoriEventApiDetail);
const readEventAssetIndex = unstable_cache(
  // Optional first-paint data must not wait for the full asset-reader timeout.
  async () => parseBandoriEventsAssetIndex(await fetchBandoriPublicAssetIndexJson(BANDORI_EVENTS_INDEX_KEY, undefined, 1500)),
  ["bandori-event-page-asset-index:v1"],
  { revalidate: SNAPSHOT_HTTP_CACHE_POLICY.nextRevalidateSeconds },
);

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

export default async function BandoriEventPage({ params, searchParams }: BandoriEventPageProps) {
  const [{ eventId: rawEventId }, query] = await Promise.all([params, searchParams]);
  const eventId = parseBandoriEventRouteId(rawEventId);
  if (eventId === null) notFound();
  const [event, assetIndex] = await Promise.all([
    readEventDetail(String(eventId)),
    readEventAssetIndex().catch(() => null),
  ]);
  if (event === null) {
    notFound();
  }

  return <EventTrackerPage initialEventId={eventId}
    initialEvent={toBandoriEventSummary(String(eventId), event)}
    initialServer={parseBandoriServerParam(typeof query.server === "string" ? query.server : null) ?? undefined}
    initialBannerUrls={assetIndex?.events[String(eventId)]?.banners.map(asset => buildBandoriPublicAssetUrl(asset) ?? "")} />;
}
