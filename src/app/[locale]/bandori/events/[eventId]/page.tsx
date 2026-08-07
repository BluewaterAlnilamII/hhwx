import { notFound } from "next/navigation";
import EventTrackerPage from "../EventTrackerPage";
import { parseBandoriEventRouteId } from "@/lib/bandori-event-route";
import { readBandoriEventApiDetail } from "@/lib/bandori-events-api-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BandoriEventPageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function BandoriEventPage({ params }: BandoriEventPageProps) {
  const { eventId: rawEventId } = await params;
  const eventId = parseBandoriEventRouteId(rawEventId);
  const event = eventId === null
    ? null
    : await readBandoriEventApiDetail(String(eventId));
  if (eventId === null || event === null) {
    notFound();
  }

  return <EventTrackerPage initialEventId={eventId} />;
}
