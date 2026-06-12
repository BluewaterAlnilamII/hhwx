import {
  BANDORI_MASTER_DATA_API_CACHE_CONTROL,
  LIVE_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  readBandoriMasterPath,
  refineBandoriMasterRecordPayload,
  redirectBandoriMasterSearch,
} from "@/lib/bandori-master-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHARACTER_MAIN_KEYS = [
  "characterName",
  "firstName",
  "lastName",
  "nickname",
  "bandId",
  "characterType",
  "colorCode",
] as const;

export async function GET(request: Request) {
  const redirect = redirectBandoriMasterSearch(request);
  if (redirect) {
    return redirect;
  }

  try {
    const result = await readBandoriMasterPath("characters_main", "characters/main.3.json", "characters");
    if (!result) {
      return jsonError(503, "BANDORI_MASTER_CHARACTERS_NOT_CONFIGURED", "Bandori master characters are not configured", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonSuccess(refineBandoriMasterRecordPayload(result, {
      keys: CHARACTER_MAIN_KEYS,
      predicate: (record) => record.characterType === "unique",
    }), {
      headers: withCacheControl(BANDORI_MASTER_DATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori master characters main API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_CHARACTERS_MAIN_READ_FAILED",
      message: "Failed to fetch Bandori master characters",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
