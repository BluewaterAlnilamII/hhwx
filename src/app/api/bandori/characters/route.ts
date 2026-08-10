import { unstable_cache } from "next/cache";
import {
  BANDORI_CHARACTERS_CACHE_TAG,
  NO_STORE_HTTP_CACHE_POLICY,
  REFERENCE_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { fetchBandoriCharacters } from "@/lib/bandori/events/catalog-server";

export const dynamic = "force-dynamic";

const readBandoriCharactersResponse = unstable_cache(
  async () => ({ characters: await fetchBandoriCharacters() }),
  ["bandori-characters-route:v2"],
  { revalidate: 86400, tags: [BANDORI_CHARACTERS_CACHE_TAG] },
);

export async function GET() {
  try {
    return jsonSuccess(await readBandoriCharactersResponse(), {
      headers: withHttpCachePolicy(REFERENCE_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori characters API 错误:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_CHARACTERS_READ_FAILED",
      message: "读取角色目录失败",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
