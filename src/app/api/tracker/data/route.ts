import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const server = searchParams.get("server"); // currently we only support server 3 (CN)
    const eventIdParam = searchParams.get("event");
    const tierParam = searchParams.get("tier");
    const typeParam = searchParams.get("type") || "event";
    
    if (server !== "3") {
      return NextResponse.json({ error: "Only server 3 (CN) is currently supported" }, { status: 400 });
    }
    
    if (!eventIdParam || !tierParam) {
      return NextResponse.json({ error: "Missing required parameters: event, tier" }, { status: 400 });
    }
    
    const eventId = parseInt(eventIdParam);
    const tier = parseInt(tierParam);
    
    if (isNaN(eventId) || isNaN(tier)) {
      return NextResponse.json({ error: "Invalid numeric parameters" }, { status: 400 });
    }

    // Query Supabase for the tracker data
    const { data, error } = await supabase
      .from("bandori_tracker_data")
      .select("time, ep")
      .eq("event_id", eventId)
      .eq("type", typeParam)
      .eq("tier", tier)
      .order("time", { ascending: true });
      
    if (error) {
      console.error("Supabase query error:", error);
      return NextResponse.json({ error: "Database query failed" }, { status: 500 });
    }
    
    // Map fields to ensure numbers are returned
    const formattedData = data.map((item) => ({
      time: Number(item.time),
      ep: Number(item.ep)
    }));

    return NextResponse.json({
      result: true,
      cutoffs: formattedData
    });
  } catch (error) {
    console.error("Tracker API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
