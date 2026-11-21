import { ApiRouteError } from "@/lib/api-contracts";
import { readBoundedRequestBody } from "@/lib/api-request";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { readViewerUserId, requireAuthenticatedUserId, requireVerifiedAccount } from "@/lib/auth-server";
import { normalizePublicUid } from "@/lib/public-profile-server";
import { readFavoriteGroups, readFavoriteKeys, saveFavoriteLayout } from "@/lib/bandori/favorites-server";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";

const headers = withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY, { Vary: "Authorization" });

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const raw = params.get("profile");
    if (raw === null && params.get("view") === "keys") {
      return jsonSuccess(await readFavoriteKeys(await requireAuthenticatedUserId(request)), { headers });
    }
    const uid = raw === null ? null : normalizePublicUid(raw);
    if (raw !== null && uid === null) throw new ApiRouteError(400, "INVALID_PROFILE", "Invalid profile");
    const viewer = uid === null ? await requireAuthenticatedUserId(request) : await readViewerUserId(request);
    return jsonSuccess(await readFavoriteGroups(uid, viewer), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 500, code: "FAVORITES_READ_FAILED", message: "Failed to load favorites" }, { headers });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);
    const bytes = await readBoundedRequestBody(request, 1024 * 1024);
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new ApiRouteError(400, "INVALID_LAYOUT", "Invalid favorite layout"); }
    return jsonSuccess(await saveFavoriteLayout(user.id, body), { headers });
  } catch (error) {
    return jsonRouteError(error, { status: 500, code: "FAVORITES_SAVE_FAILED", message: "Failed to save favorite layout" }, { headers });
  }
}
