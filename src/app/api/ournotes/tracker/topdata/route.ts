import { handleOurNotesTrackerRequest } from "@/lib/ournotes/event-tracker/api-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleOurNotesTrackerRequest(request, "topdata");
}
