import { ApiRouteError } from "@/lib/api-contracts";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { requireVerifiedAccount } from "@/lib/auth-server";
import { parseFavoriteKey } from "@/lib/bandori/favorites";
import { writeFavorite } from "@/lib/bandori/favorites-server";

type Context = { params: Promise<{ key: string }> };
const noStore = { headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY) };

async function handle(request: Request, context: Context) {
  try {
    const entry = parseFavoriteKey((await context.params).key);
    if (!entry) throw new ApiRouteError(400, "INVALID_FAVORITE", "Invalid favorite");
    const user = await requireVerifiedAccount(request);
    await writeFavorite(user.id, entry, request.method, new URL(request.url).searchParams.get("art"));
    return jsonSuccess(true, noStore);
  } catch (error) {
    return jsonRouteError(error, { status: 500, code: "FAVORITE_FAILED", message: "Favorite request failed" }, noStore);
  }
}

export { handle as PUT, handle as DELETE, handle as PATCH };
