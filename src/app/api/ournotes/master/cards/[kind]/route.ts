import { ApiRouteError } from "@/lib/api-contracts";
import { jsonSuccess } from "@/lib/api-response";
import { SNAPSHOT_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { isOurNotesCardKind } from "@/lib/ournotes/cards/api-contract";
import { readOurNotesCards } from "@/lib/ournotes/cards/api-server";
import { ourNotesRouteError, parseOurNotesServerQuery } from "@/lib/ournotes/master-api-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await context.params;
    if (!isOurNotesCardKind(kind)) throw new ApiRouteError(404, "OURNOTES_CARD_KIND_NOT_FOUND", "Unknown OurNotes card kind");
    const server = parseOurNotesServerQuery(request);
    return jsonSuccess(await readOurNotesCards(kind, server), { headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY) });
  } catch (error) {
    return ourNotesRouteError(error);
  }
}
