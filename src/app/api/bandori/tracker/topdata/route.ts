import { handleBandoriTrackerTopDataRequest } from "@/lib/bandori/event-tracker/topdata-api-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleBandoriTrackerTopDataRequest(request);
}
