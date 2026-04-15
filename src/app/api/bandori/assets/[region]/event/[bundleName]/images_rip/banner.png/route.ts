import { proxyBandoriEventBanner } from "@/lib/bandori-event-banner-proxy";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ region: string; bundleName: string }> },
) {
  const { region, bundleName } = await context.params;
  return proxyBandoriEventBanner({ region, bundleName });
}