import { NextResponse } from "next/server";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const res = await fetch(`https://bestdori.com/api/events/${id}.json`, { 
        headers: { "User-Agent": "hhwx-tracker/1.0" },
        // Add cache control if necessary, but default fetch is fine
    });
    
    if (!res.ok) {
      return NextResponse.json({ error: "Bestdori API error" }, { status: res.status });
    }
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to proxy Bestdori API", error);
    return NextResponse.json({ error: "Failed to fetch event meta" }, { status: 500 });
  }
}
