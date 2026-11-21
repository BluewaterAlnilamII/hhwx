import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { readViewerUserId } from "@/lib/auth-server";
import { normalizePublicUid } from "@/lib/public-profile-server";
import { readProfileHomepage } from "@/lib/profile-homepage-server";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";

export async function GET(request: Request, { params }: { params: Promise<{ publicUid: string }> }) {
  try {
    const uid = normalizePublicUid((await params).publicUid);
    if (!uid) throw new ApiRouteError(404, "PROFILE_NOT_FOUND", "Profile not found");
    const profile = await readProfileHomepage(uid, await readViewerUserId(request));
    if (!profile) throw new ApiRouteError(404, "PROFILE_NOT_FOUND", "Profile not found");
    const response = jsonSuccess(profile);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Authorization");
    return response;
  } catch (error) {
    return jsonRouteError(error, { status: 500, code: "PROFILE_READ_FAILED", message: "Failed to load profile" }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
