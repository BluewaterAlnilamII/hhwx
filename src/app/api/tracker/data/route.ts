import { handleBandoriTrackerDataRequest } from "@/lib/bandori-tracker-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 旧路径只作为外部兼容别名存在，
  // 行为必须与 /api/bandori/tracker/data 完全一致，避免兼容期内出现协议漂移。
  return handleBandoriTrackerDataRequest(request);
}
