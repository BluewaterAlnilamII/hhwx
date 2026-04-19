import { proxyBandoriEventBanner } from "@/lib/bandori-event-banner-proxy";

// Next 的 segment config 必须保持字面量，不能引用导入常量。
export const revalidate = 2592000;

export async function GET(
  _request: Request,
  context: { params: Promise<{ region: string; bundleName: string }> },
) {
  const { region, bundleName } = await context.params;
  return proxyBandoriEventBanner({ region, bundleName });
}