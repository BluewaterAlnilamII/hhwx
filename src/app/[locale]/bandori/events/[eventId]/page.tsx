import { notFound } from "next/navigation";
import EventTrackerPage from "../EventTrackerPage";
import { parseBandoriEventRouteId } from "@/lib/bandori/events/route";
import { parseBandoriServerParam } from "@/lib/bandori-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type BandoriEventPageProps = {
  params: Promise<{ locale: string; eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BandoriEventPage({ params, searchParams }: BandoriEventPageProps) {
  const [{ eventId: rawEventId }, query] = await Promise.all([params, searchParams]);
  const eventId = parseBandoriEventRouteId(rawEventId);
  if (eventId === null) notFound();
  return <EventTrackerPage initialEventId={eventId}
    initialServer={parseBandoriServerParam(typeof query.server === "string" ? query.server : null) ?? undefined} />;
}
