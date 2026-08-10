import { handleBestdoriPredictionRequest } from "@/lib/bandori/event-tracker/bestdori-prediction-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleBestdoriPredictionRequest(request);
}
