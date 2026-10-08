import { handleOurNotesParticipationRequest } from "@/lib/ournotes/event-tracker/api-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleOurNotesParticipationRequest(request);
}
