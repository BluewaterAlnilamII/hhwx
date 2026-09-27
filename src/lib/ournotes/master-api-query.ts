import { ApiRouteError } from "@/lib/api-contracts";
import { jsonRouteError } from "@/lib/api-response";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { OurNotesDataError, type OurNotesServer } from "./master-contract";

export function parseOurNotesServerQuery(request: Request): OurNotesServer | undefined {
  const params = new URL(request.url).searchParams;
  if (params.size === 0) return undefined;
  const values = params.getAll("server");
  if (params.size !== 1 || values.length !== 1 || !/^[0-4]$/u.test(values[0])) {
    throw new ApiRouteError(400, "OURNOTES_MASTER_SERVER_INVALID", "server must be exactly one of 0, 1, 2, 3, or 4");
  }
  return Number(values[0]) as OurNotesServer;
}
export function rejectOurNotesCatalogQuery(request: Request): void {
  if (new URL(request.url).searchParams.size > 0) {
    throw new ApiRouteError(400, "OURNOTES_MASTER_QUERY_UNSUPPORTED", "This catalog does not accept query parameters");
  }
}
export function ourNotesRouteError(error: unknown) {
  return jsonRouteError(error instanceof OurNotesDataError
    ? new ApiRouteError(503, "OURNOTES_MASTER_UNAVAILABLE", "OurNotes master data is unavailable") : error,
  { status: 500, code: "OURNOTES_MASTER_READ_FAILED", message: "Failed to read OurNotes master data" },
  { headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY) });
}
