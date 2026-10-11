import { SNAPSHOT_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { jsonSuccess } from "@/lib/api-response";
import { ourNotesRouteError, rejectOurNotesCatalogQuery } from "@/lib/ournotes/master-api-query";
import { readOurNotesSongMeta } from "@/lib/ournotes/music/meta-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    rejectOurNotesCatalogQuery(request);
    return jsonSuccess(await readOurNotesSongMeta(), { headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY) });
  } catch (error) {
    return ourNotesRouteError(error);
  }
}
