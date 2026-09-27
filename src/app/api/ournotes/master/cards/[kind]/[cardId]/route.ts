import { ApiRouteError } from "@/lib/api-contracts";
import { jsonSuccess } from "@/lib/api-response";
import { SNAPSHOT_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { isOurNotesCardKind } from "@/lib/ournotes/cards/api-contract";
import { readOurNotesCard } from "@/lib/ournotes/cards/api-server";
import { ourNotesId } from "@/lib/ournotes/master-contract";
import { ourNotesRouteError, parseOurNotesServerQuery } from "@/lib/ournotes/master-api-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ kind: string; cardId: string }> }) {
  try {
    const { kind, cardId } = await context.params;
    if (!isOurNotesCardKind(kind)) throw new ApiRouteError(404, "OURNOTES_CARD_KIND_NOT_FOUND", "Unknown OurNotes card kind");
    const server = parseOurNotesServerQuery(request);
    if (!ourNotesId(cardId)) throw new ApiRouteError(404, "OURNOTES_CARD_NOT_FOUND", "OurNotes card not found");
    const card = await readOurNotesCard(kind, cardId, server);
    if (!card) throw new ApiRouteError(404, "OURNOTES_CARD_NOT_FOUND", "OurNotes card not found");
    return jsonSuccess(card, { headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY) });
  } catch (error) {
    return ourNotesRouteError(error);
  }
}
