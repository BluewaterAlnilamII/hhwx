import { ApiRouteError } from "@/lib/api-contracts";
import { jsonSuccess } from "@/lib/api-response";
import { SNAPSHOT_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { readOurNotesEvent } from "@/lib/ournotes/events/api-server";
import { ourNotesId } from "@/lib/ournotes/master-contract";
import { ourNotesRouteError, parseOurNotesServerQuery } from "@/lib/ournotes/master-api-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ eventId: string }> }) {
  try {
    const { eventId } = await context.params;
    const server = parseOurNotesServerQuery(request);
    if (!ourNotesId(eventId)) throw new ApiRouteError(404, "OURNOTES_EVENT_NOT_FOUND", "OurNotes event not found");
    const event = await readOurNotesEvent(eventId, server);
    if (!event) throw new ApiRouteError(404, "OURNOTES_EVENT_NOT_FOUND", "OurNotes event not found");
    return jsonSuccess(event, { headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY) });
  } catch (error) {
    return ourNotesRouteError(error);
  }
}
