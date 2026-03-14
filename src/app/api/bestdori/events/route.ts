import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(`https://bestdori.com/api/events/all.5.json`);
    if (!res.ok) {
      throw new Error(`Bestdori API responded with status: ${res.status}`);
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error proxying Bestdori all events metadata:", error);
    return NextResponse.json({ error: "Failed to fetch event data" }, { status: 500 });
  }
}
