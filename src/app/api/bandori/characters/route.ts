import { NextResponse } from "next/server";
import { fetchBandoriCharacters } from "@/lib/bandori-events-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const characters = await fetchBandoriCharacters();
    return NextResponse.json({ characters });
  } catch (error) {
    console.error("Bandori characters API 错误:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}