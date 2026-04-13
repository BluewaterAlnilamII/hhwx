import { NextResponse } from "next/server";
import { fetchBandoriEventRecords, toBestdoriAll5Event } from "@/lib/bandori-events-server";


export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const records = await fetchBandoriEventRecords();
    const payload = Object.fromEntries(
      records.map((record) => [String(record.event_id), toBestdoriAll5Event(record)]),
    );

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error reading local event catalog:", error);
    return NextResponse.json({ error: "Failed to fetch local event data" }, { status: 500 });
  }
}
