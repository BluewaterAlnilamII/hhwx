import { handleBandoriTrackerTopDataRequest } from "@/lib/bandori-tracker-topdata-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleBandoriTrackerTopDataRequest(request);
}
