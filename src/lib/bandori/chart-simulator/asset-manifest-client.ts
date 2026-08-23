"use client";

import {
  buildBandoriPublicAssetIndexUrl,
} from "@/lib/bandori-public-asset-index";
import {
  buildBandoriChartSimulatorManifestUrl,
  createBandoriChartSimulatorAssetResolver,
  parseBandoriChartSimulatorAssetIndex,
  parseBandoriChartSimulatorAssetManifest,
  type BandoriChartSimulatorAssetResolver,
} from "./asset-manifest";

export type LoadedBandoriChartSimulatorAssets = {
  readonly manifestSha256: string;
  readonly resolveAssetUrl: BandoriChartSimulatorAssetResolver;
};

const loadedByIndexUrl = new Map<string, LoadedBandoriChartSimulatorAssets>();
const inFlightByIndexUrl = new Map<string, Promise<LoadedBandoriChartSimulatorAssets>>();
const requestSequenceByIndexUrl = new Map<string, number>();

async function sha256Hex(body: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", body);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function loadBandoriChartSimulatorAssets(options?: {
  readonly baseUrl?: string | null;
  readonly fetcher?: typeof fetch;
  readonly refresh?: boolean;
  readonly signal?: AbortSignal;
}): Promise<LoadedBandoriChartSimulatorAssets> {
  const indexUrl = buildBandoriPublicAssetIndexUrl(
    "chartSimulator",
    options?.baseUrl,
  );
  if (!indexUrl) throw new Error("Bandori asset CDN is not configured");
  if (!options?.refresh) {
    const loaded = loadedByIndexUrl.get(indexUrl);
    if (loaded) return loaded;
    const inFlight = inFlightByIndexUrl.get(indexUrl);
    if (inFlight) return inFlight;
  }

  const fetcher = options?.fetcher ?? fetch;
  const requestSequence = (requestSequenceByIndexUrl.get(indexUrl) ?? 0) + 1;
  requestSequenceByIndexUrl.set(indexUrl, requestSequence);
  const request = (async () => {
    const indexResponse = await fetcher(indexUrl, {
      cache: options?.refresh ? "no-cache" : "default",
      credentials: "omit",
      signal: options?.signal,
    });
    if (!indexResponse.ok) {
      throw new Error(
        `Bandori chart-simulator asset index request failed: HTTP ${indexResponse.status}`,
      );
    }
    const index = parseBandoriChartSimulatorAssetIndex(await indexResponse.json());
    const manifestUrl = buildBandoriChartSimulatorManifestUrl(
      index.manifest,
      options?.baseUrl,
    );
    if (!manifestUrl) throw new Error("Bandori asset CDN is not configured");
    const manifestResponse = await fetcher(manifestUrl, {
      cache: "force-cache",
      credentials: "omit",
      signal: options?.signal,
    });
    if (!manifestResponse.ok) {
      throw new Error(
        `Bandori chart-simulator asset manifest request failed: HTTP ${manifestResponse.status}`,
      );
    }
    const manifestBody = await manifestResponse.arrayBuffer();
    if (await sha256Hex(manifestBody) !== index.manifest) {
      throw new Error("Bandori chart-simulator asset manifest SHA-256 mismatch");
    }
    const manifest = parseBandoriChartSimulatorAssetManifest(
      JSON.parse(new TextDecoder().decode(manifestBody)),
    );
    const loaded: LoadedBandoriChartSimulatorAssets = {
      manifestSha256: index.manifest,
      resolveAssetUrl: createBandoriChartSimulatorAssetResolver(
        manifest,
        options?.baseUrl,
      ),
    };
    if (requestSequenceByIndexUrl.get(indexUrl) === requestSequence) {
      loadedByIndexUrl.set(indexUrl, loaded);
    }
    return loaded;
  })();
  inFlightByIndexUrl.set(indexUrl, request);
  try {
    return await request;
  } finally {
    if (inFlightByIndexUrl.get(indexUrl) === request) {
      inFlightByIndexUrl.delete(indexUrl);
    }
  }
}
