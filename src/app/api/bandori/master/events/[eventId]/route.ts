import { unstable_cache } from "next/cache";
import {
  LIVE_API_CACHE_CONTROL,
  PUBLIC_METADATA_API_CACHE_CONTROL,
  withCacheControl,
} from "@/lib/api-cache";
import { jsonError, jsonRouteError, jsonSuccess } from "@/lib/api-response";
import {
  fetchBandoriMasterArtifactEventDetail,
  getDefaultBandoriMasterArtifactServer,
  type BandoriMasterArtifactServer,
} from "@/lib/bandori-master-artifacts";
import { fetchBestdoriEventDetail } from "@/lib/bestdori-master-data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EVENT_ID_PATTERN = /^[1-9]\d*$/u;

const readBestdoriEventDetail = unstable_cache(
  async (eventId: string) => ({
    eventId,
    source: "bestdori" as const,
    payload: await fetchBestdoriEventDetail(eventId),
  }),
  ["bandori-master-event-detail-route:v1"],
  { revalidate: 86400 },
);

const readArtifactEventDetail = unstable_cache(
  async (eventId: string, server: BandoriMasterArtifactServer) => {
    const artifact = await fetchBandoriMasterArtifactEventDetail(eventId, server);
    if (!artifact) {
      return null;
    }

    return {
      eventId,
      source: artifact.source,
      server: artifact.server,
      masterVersion: artifact.manifest.masterVersion,
      artifactVersion: artifact.manifest.version,
      artifactDataset: "event_detail",
      payload: artifact.payload,
    };
  },
  ["bandori-master-artifact-event-detail-route:v1"],
  { revalidate: 86400 },
);

type RouteContext = {
  params: Promise<{
    eventId: string;
  }>;
};

function shouldUseArtifacts(): boolean {
  return process.env.BANDORI_MASTER_SOURCE === "artifacts";
}

export async function GET(request: Request, context: RouteContext) {
  const requestUrl = new URL(request.url);
  if (requestUrl.search) {
    requestUrl.search = "";
    return Response.redirect(requestUrl, 308);
  }

  const { eventId } = await context.params;
  if (!EVENT_ID_PATTERN.test(eventId)) {
    return jsonError(404, "BANDORI_MASTER_EVENT_NOT_FOUND", "Unknown Bandori master event", {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }

  try {
    if (shouldUseArtifacts()) {
      const server = getDefaultBandoriMasterArtifactServer();
      const artifactResult = await readArtifactEventDetail(eventId, server);
      if (artifactResult) {
        return jsonSuccess(artifactResult, {
          headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
        });
      }

      return jsonError(404, "BANDORI_MASTER_EVENT_DETAIL_NOT_FOUND", "Bandori master event detail is not available", {
        headers: withCacheControl(LIVE_API_CACHE_CONTROL),
      });
    }

    return jsonSuccess(await readBestdoriEventDetail(eventId), {
      headers: withCacheControl(PUBLIC_METADATA_API_CACHE_CONTROL),
    });
  } catch (error) {
    console.error("Bandori master event detail API error:", error);
    return jsonRouteError(error, {
      status: 500,
      code: "BANDORI_MASTER_EVENT_DETAIL_READ_FAILED",
      message: "Failed to fetch Bandori master event detail",
    }, {
      headers: withCacheControl(LIVE_API_CACHE_CONTROL),
    });
  }
}
