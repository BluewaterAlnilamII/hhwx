import { jsonSuccess } from "@/lib/api-response";
import { SNAPSHOT_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { readOurNotesCatalog } from "@/lib/ournotes/catalogs-server";
import { ourNotesRouteError, rejectOurNotesCatalogQuery } from "@/lib/ournotes/master-api-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    rejectOurNotesCatalogQuery(request);
    return jsonSuccess(await readOurNotesCatalog("characters"), { headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY) });
  } catch (error) {
    return ourNotesRouteError(error);
  }
}
