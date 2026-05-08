import { handleBandoriTrackerDataRequest } from "@/lib/bandori-tracker-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 主 tracker 路由保持极薄封装：
  // 请求校验、档线支持性和成功响应协议都集中在共享处理器里维护。
  return handleBandoriTrackerDataRequest(request);
}
