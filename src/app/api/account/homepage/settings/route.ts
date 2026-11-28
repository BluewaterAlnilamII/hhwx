import { ApiRouteError } from "@/lib/api-contracts";
import { readBoundedRequestBody } from "@/lib/api-request";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { updateProfileHomepage } from "@/lib/profile-homepage-server";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";

export async function PATCH(request: Request) {
  try {
    const user = await requireVerifiedAccount(request);
    const body = await readBoundedRequestBody(request, 32 * 1024);
    let value: unknown;
    try { value = JSON.parse(new TextDecoder().decode(body)); } catch { throw new ApiRouteError(400, "INVALID_HOMEPAGE", "Invalid profile settings"); }
    const response = jsonSuccess(await updateProfileHomepage(user.id, value));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return jsonRouteError(error, { status: 500, code: "PROFILE_SAVE_FAILED", message: "Failed to save profile" }, {
      headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY),
    });
  }
}
