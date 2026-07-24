import {
  NO_STORE_HTTP_CACHE_POLICY,
  SNAPSHOT_HTTP_CACHE_POLICY,
  withHttpCachePolicy,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  BANDORI_MASTER_ID_PATTERN,
  readBandoriMasterRecord,
  redirectBandoriMasterSearch,
} from "@/lib/bandori-master-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    characterId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const redirect = redirectBandoriMasterSearch(request);
  if (redirect) {
    return redirect;
  }

  const { characterId } = await context.params;
  if (!BANDORI_MASTER_ID_PATTERN.test(characterId)) {
    return jsonError(404, "BANDORI_MASTER_CHARACTER_NOT_FOUND", "Unknown Bandori master character", {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }

  try {
    const result = await readBandoriMasterRecord(
      "characters",
      characterId,
      "character_detail",
      `characters/${characterId}.json`,
    );
    if (!result) {
      return jsonError(404, "BANDORI_MASTER_CHARACTER_NOT_FOUND", "Bandori master character is not available", {
        headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
      });
    }

    return jsonSuccess({ ...result, characterId }, {
      headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY),
    });
  } catch (error) {
    console.error("Bandori master character detail API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_CHARACTER_READ_FAILED",
      message: "Failed to fetch Bandori master character",
    }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
