import { jsonRouteError, jsonSuccess } from "@/lib/api-response";
import { readLocalNfoRuntimeData } from "@/lib/bandori-nfo-local-snapshot-server";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
};

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readLocalNfoRuntimeData();
    return jsonSuccess(data, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("NFO local runtime read failed:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "NFO_LOCAL_RUNTIME_READ_FAILED",
      message: "Failed to read local NFO runtime data",
    }, {
      headers: NO_STORE_HEADERS,
    });
  }
}
