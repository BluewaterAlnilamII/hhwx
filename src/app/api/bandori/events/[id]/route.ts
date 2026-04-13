import { NextResponse } from "next/server";
import { fetchBandoriEventRecord, toBandoriEventDetail } from "@/lib/bandori-events-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const eventId = Number(id);
    if (!Number.isFinite(eventId) || eventId <= 0) {
      return NextResponse.json({ error: "无效的活动编号" }, { status: 400 });
    }

    const record = await fetchBandoriEventRecord(eventId);
    if (!record) {
      return NextResponse.json({ error: "活动不存在" }, { status: 404 });
    }

    return NextResponse.json(toBandoriEventDetail(record));
  } catch (error) {
    console.error("Bandori event detail API 错误:", error);
    return NextResponse.json({ error: "读取活动详情失败" }, { status: 500 });
  }
}