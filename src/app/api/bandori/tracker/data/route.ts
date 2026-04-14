import { handleBandoriTrackerDataRequest } from "@/lib/bandori-tracker-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 主 tracker 路由保持极薄封装：
  // 这样无论以后继续保留兼容别名，还是替换底层查询实现，
  // 真正的数据协议都只需要在共享处理器里维护一份。
  return handleBandoriTrackerDataRequest(request);
}