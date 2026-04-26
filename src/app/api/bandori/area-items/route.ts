import { unstable_cache } from "next/cache";
import {
  LIVE_API_CACHE_CONTROL,
  PUBLIC_METADATA_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { fetchBandoriAreaItemsMetadata } from "@/lib/bandori-area-items";

export const dynamic = "force-dynamic";

const readBandoriAreaItemsResponse = unstable_cache(
  fetchBandoriAreaItemsMetadata,
  ["bandori-area-items-route:v5"],
  { revalidate: 86400 },
);

export async function GET() {
  try {
    return jsonSuccess(await readBandoriAreaItemsResponse(), {
      headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori area items API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_AREA_ITEMS_READ_FAILED",
      message: "读取区域道具目录失败",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
