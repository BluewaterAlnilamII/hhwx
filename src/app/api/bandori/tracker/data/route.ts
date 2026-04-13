import { handleBandoriTrackerDataRequest } from "@/lib/bandori-tracker-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleBandoriTrackerDataRequest(request);
}