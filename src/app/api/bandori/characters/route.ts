import { unstable_cache } from "next/cache";
import {
  BANDORI_CHARACTERS_CACHE_TAG,
  LIVE_API_CACHE_CONTROL,
  PUBLIC_METADATA_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { fetchBandoriCharacters } from "@/lib/bandori-events-server";

export const dynamic = "force-dynamic";

const readBandoriCharactersResponse = unstable_cache(
  async () => ({ characters: await fetchBandoriCharacters() }),
  ["bandori-characters-route:v2"],
  { revalidate: 86400, tags: [BANDORI_CHARACTERS_CACHE_TAG] },
);

export async function GET() {
  try {
    return jsonSuccess(await readBandoriCharactersResponse(), {
      headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori characters API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_CHARACTERS_READ_FAILED",
      message: "读取角色目录失败",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}