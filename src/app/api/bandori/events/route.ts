import { NextResponse } from "next/server";
import { fetchBandoriEventRecords, toBandoriEventsListResponse } from "@/lib/bandori-events-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const records = await fetchBandoriEventRecords();
    return NextResponse.json(toBandoriEventsListResponse(records));
  } catch (error) {
    console.error("Bandori events API 错误:", error);
    return NextResponse.json({ error: "读取活动目录失败" }, { status: 500 });
  }
}