import { ApiRouteError } from "@/lib/api-contracts";
import { jsonSuccess } from "@/lib/api-response";
import { SNAPSHOT_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { readOurNotesMusicDetail } from "@/lib/ournotes/music/api-server";
import { ourNotesId } from "@/lib/ournotes/master-contract";
import { ourNotesRouteError, parseOurNotesServerQuery } from "@/lib/ournotes/master-api-query";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ musicId: string }> }) {
  try {
    const { musicId } = await context.params;
    const server = parseOurNotesServerQuery(request);
    if (!ourNotesId(musicId)) throw new ApiRouteError(404, "OURNOTES_MUSIC_NOT_FOUND", "OurNotes music not found");
    const music = await readOurNotesMusicDetail(musicId, server);
    if (!music) throw new ApiRouteError(404, "OURNOTES_MUSIC_NOT_FOUND", "OurNotes music not found");
    return jsonSuccess(music, { headers: withHttpCachePolicy(SNAPSHOT_HTTP_CACHE_POLICY) });
  } catch (error) {
    return ourNotesRouteError(error);
  }
}
