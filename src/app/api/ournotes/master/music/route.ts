import { jsonSuccess } from "@/lib/api-response";
import { SNAPSHOT_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { readOurNotesMusic } from "@/lib/ournotes/music/api-server";
import { ourNotesRouteError, parseOurNotesServerQuery } from "@/lib/ournotes/master-api-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const server = parseOurNotesServerQuery(request);
    return jsonSuccess(await readOurNotesMusic(server), { headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY) });
  } catch (error) {
    return ourNotesRouteError(error);
  }
}
