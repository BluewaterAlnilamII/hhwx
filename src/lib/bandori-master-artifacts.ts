import { gunzipSync } from "node:zlib";
import { REFERENCE_METADATA_CACHE_PROFILE } from "@/lib/api-cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { MASTER_ACTIVE_VERSIONS_TABLE } from "@/lib/supabase-table-names";
import type { BestdoriMasterDatasetKey } from "@/lib/bestdori-master-data";

export type BandoriMasterArtifactServer = "jp" | "cn" | "en" | "tw";

export const BANDORI_MASTER_ARTIFACT_DATASETS = {
  cards: "cards",
  songs: "songs",
  events: "events",
  areaItems: "area_items",
  skills: "skills",
  bands: "bands",
  characters: "characters",
} as const satisfies Record<BestdoriMasterDatasetKey, string>;

type MasterActiveVersionRow = {
  server: BandoriMasterArtifactServer;
  version: string;
  master_version: string | null;
  artifact_prefix: string;
  manifest_path: string;
  updated_at: string;
};

export type BandoriMasterArtifactManifest = {
  schemaVersion?: string;
  server: BandoriMasterArtifactServer;
  version: string;
  clientVersion?: string | null;
  dataVersion?: string | null;
  masterVersion?: string | null;
  artifactPrefix: string;
  manifestPath: string;
  datasets?: Array<{
    dataset: string;
    event_id?: number | string;
    file: string;
    record_count?: number;
    sources?: string[];
    sha256?: string;
  }>;
  bundles?: Array<{
    bundle: string;
    file: string;
    datasets?: string[];
    sha256?: string;
  }>;
  createdAt?: string;
};

export type BandoriMasterArtifactDataset = {
  source: "artifacts";
  server: BandoriMasterArtifactServer;
  dataset: BestdoriMasterDatasetKey;
  artifactDataset: string;
  manifest: BandoriMasterArtifactManifest;
  payload: unknown;
};

export type BandoriMasterArtifactEventDetail = {
  source: "artifacts";
  server: BandoriMasterArtifactServer;
  eventId: string;
  manifest: BandoriMasterArtifactManifest;
  payload: unknown;
};

function normalizeServer(value: string | null | undefined): BandoriMasterArtifactServer {
  if (value === "jp" || value === "cn" || value === "en" || value === "tw") {
    return value;
  }
  return "cn";
}

export function getDefaultBandoriMasterArtifactServer(): BandoriMasterArtifactServer {
  return normalizeServer(process.env.BANDORI_MASTER_ARTIFACT_SERVER);
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/g, "")}/${trimSlashes(path)}`;
}

function withArtifactChecksum(url: string, sha256: string | null | undefined): string {
  if (!sha256) {
    return url;
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}sha=${encodeURIComponent(sha256)}`;
}

function buildManifestUrl(server: BandoriMasterArtifactServer): string | null {
  const explicitManifestUrl = process.env.BANDORI_MASTER_ARTIFACT_MANIFEST_URL;
  if (explicitManifestUrl) {
    return explicitManifestUrl.replace("{server}", server);
  }

  const baseUrl = process.env.BANDORI_MASTER_ARTIFACT_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  return joinUrl(baseUrl, `${server}/active/manifest.json`);
}

function getArtifactPublicOrigin(): string | null {
  if (process.env.BANDORI_MASTER_ARTIFACT_PUBLIC_ORIGIN) {
    return process.env.BANDORI_MASTER_ARTIFACT_PUBLIC_ORIGIN;
  }

  const baseUrl = process.env.BANDORI_MASTER_ARTIFACT_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  return baseUrl.replace(/\/bandori\/master\/?$/u, "");
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    next: { revalidate: REFERENCE_METADATA_CACHE_PROFILE.nextRevalidateSeconds },
  });

  if (!response.ok) {
    throw new Error(`Bandori master artifact fetch failed: HTTP ${response.status} ${url}`);
  }

  return response.json() as Promise<T>;
}

async function fetchGzipJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    next: { revalidate: REFERENCE_METADATA_CACHE_PROFILE.nextRevalidateSeconds },
  });

  if (!response.ok) {
    throw new Error(`Bandori master artifact fetch failed: HTTP ${response.status} ${url}`);
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  return JSON.parse(gunzipSync(compressed).toString("utf8")) as T;
}

async function fetchOptionalGzipJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, {
    next: { revalidate: REFERENCE_METADATA_CACHE_PROFILE.nextRevalidateSeconds },
  });

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Bandori master artifact fetch failed: HTTP ${response.status} ${url}`);
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  return JSON.parse(gunzipSync(compressed).toString("utf8")) as T;
}

async function readActiveManifestFromSupabase(
  server: BandoriMasterArtifactServer,
): Promise<BandoriMasterArtifactManifest | null> {
  if (process.env.BANDORI_MASTER_ACTIVE_SOURCE !== "supabase") {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from(MASTER_ACTIVE_VERSIONS_TABLE)
    .select("server, version, master_version, artifact_prefix, manifest_path, updated_at")
    .eq("server", server)
    .maybeSingle<MasterActiveVersionRow>();

  if (error) {
    throw new Error(`Failed to read active Bandori master version: ${error.message}`);
  }
  if (!data) {
    return null;
  }

  const publicOrigin = getArtifactPublicOrigin();
  if (!publicOrigin) {
    throw new Error("BANDORI_MASTER_ARTIFACT_PUBLIC_ORIGIN is required when active source is Supabase");
  }

  return fetchJson<BandoriMasterArtifactManifest>(joinUrl(publicOrigin, data.manifest_path));
}

async function readActiveManifestFromObjectStorage(
  server: BandoriMasterArtifactServer,
): Promise<BandoriMasterArtifactManifest | null> {
  const manifestUrl = buildManifestUrl(server);
  if (!manifestUrl) {
    return null;
  }

  return fetchJson<BandoriMasterArtifactManifest>(manifestUrl);
}

export async function fetchBandoriMasterArtifactDataset(
  dataset: BestdoriMasterDatasetKey,
  server: BandoriMasterArtifactServer = getDefaultBandoriMasterArtifactServer(),
): Promise<BandoriMasterArtifactDataset | null> {
  const artifactDataset = BANDORI_MASTER_ARTIFACT_DATASETS[dataset];
  const manifest = await readActiveManifestFromSupabase(server)
    ?? await readActiveManifestFromObjectStorage(server);
  if (!manifest) {
    return null;
  }

  const datasetEntry = manifest.datasets?.find((item) => item.dataset === artifactDataset);
  const datasetFile = datasetEntry?.file ?? `normalized/${artifactDataset}.json.gz`;
  const publicOrigin = getArtifactPublicOrigin();
  if (!publicOrigin) {
    throw new Error("BANDORI_MASTER_ARTIFACT_PUBLIC_ORIGIN or BANDORI_MASTER_ARTIFACT_BASE_URL is required");
  }

  return {
    source: "artifacts",
    server,
    dataset,
    artifactDataset,
    manifest,
    payload: await fetchGzipJson<unknown>(
      withArtifactChecksum(
        joinUrl(publicOrigin, `${manifest.artifactPrefix}/${datasetFile}`),
        datasetEntry?.sha256,
      ),
    ),
  };
}

export async function fetchBandoriMasterArtifactEventDetail(
  eventId: string,
  server: BandoriMasterArtifactServer = getDefaultBandoriMasterArtifactServer(),
): Promise<BandoriMasterArtifactEventDetail | null> {
  const manifest = await readActiveManifestFromSupabase(server)
    ?? await readActiveManifestFromObjectStorage(server);
  if (!manifest) {
    return null;
  }

  const publicOrigin = getArtifactPublicOrigin();
  if (!publicOrigin) {
    throw new Error("BANDORI_MASTER_ARTIFACT_PUBLIC_ORIGIN or BANDORI_MASTER_ARTIFACT_BASE_URL is required");
  }

  const datasetEntry = manifest.datasets?.find((item) => (
    item.dataset === "event_detail" && String(item.event_id) === eventId
  ));
  const datasetFile = datasetEntry?.file ?? `normalized/event_details/${eventId}.json.gz`;
  const payload = await fetchOptionalGzipJson<unknown>(
    withArtifactChecksum(
      joinUrl(publicOrigin, `${manifest.artifactPrefix}/${datasetFile}`),
      datasetEntry?.sha256,
    ),
  );

  if (!payload) {
    return null;
  }

  return {
    source: "artifacts",
    server,
    eventId,
    manifest,
    payload,
  };
}
