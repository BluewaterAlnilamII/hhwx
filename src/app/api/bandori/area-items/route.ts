import { unstable_cache } from "next/cache";
import {
  NO_STORE_HTTP_CACHE_POLICY,
  REFERENCE_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { fetchBandoriAreaItemsMetadata } from "@/lib/bandori-area-items";

export const dynamic = "force-dynamic";

const readBandoriAreaItemsResponse = unstable_cache(
  fetchBandoriAreaItemsMetadata,
  ["bandori-area-items-route:v6"],
  { revalidate: 86400 },
);

export async function GET() {
  try {
    return jsonSuccess(await readBandoriAreaItemsResponse(), {
      headers: withHttpCachePolicy(REFERENCE_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori area items API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_AREA_ITEMS_READ_FAILED",
      message: "读取区域道具目录失败",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
