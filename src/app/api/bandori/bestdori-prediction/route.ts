import { handleBestdoriPredictionRequest } from "@/lib/bestdori-prediction";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleBestdoriPredictionRequest(request);
}
