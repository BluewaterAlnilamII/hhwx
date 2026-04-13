import { NextResponse } from "next/server";
import { fetchBandoriEventRecord, toBestdoriEventDetail } from "@/lib/bandori-events-server";


export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const eventId = Number(id);
    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
    }

    const record = await fetchBandoriEventRecord(eventId);
    if (!record) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json(toBestdoriEventDetail(record));
  } catch (error) {
    console.error("Failed to read local event meta", error);
    return NextResponse.json({ error: "Failed to fetch local event meta" }, { status: 500 });
  }
}
