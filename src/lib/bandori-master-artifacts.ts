import { gunzipSync } from "node:zlib";
import {
  BANDORI_MASTER_DATA_CACHE_PROFILE,
  REFERENCE_METADATA_CACHE_PROFILE,
} from "@/lib/api-cache";
import { fetchR2Object, type R2S3ReaderConfig } from "@/lib/r2-s3-reader";
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

export type BandoriMasterArtifactNamedDataset = {
  source: "artifacts";
  server: BandoriMasterArtifactServer;
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

function normalizeObjectKey(value: string): string {
  return trimSlashes(value).replace(/\/{2,}/g, "/");
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

function shouldReadArtifactsFromR2(): boolean {
  return process.env.BANDORI_MASTER_ARTIFACT_READ_MODE === "r2"
    || process.env.BANDORI_MASTER_ACTIVE_SOURCE === "r2";
}

function getArtifactObjectKeyPrefix(): string {
  const configuredPrefix = process.env.BANDORI_MASTER_ARTIFACT_PREFIX;
  if (configuredPrefix?.trim()) {
    return normalizeObjectKey(configuredPrefix);
  }

  const baseUrl = process.env.BANDORI_MASTER_ARTIFACT_BASE_URL;
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      const pathname = normalizeObjectKey(url.pathname);
      if (pathname) {
        return pathname;
      }
    } catch {
      // Fall through to the tracker default object prefix.
    }
  }

  return "bandori/master";
}

function readOptionalR2Env(primaryName: string, fallbackName?: string): string | null {
  const primaryValue = process.env[primaryName]?.trim();
  if (primaryValue) {
    return primaryValue;
  }

  const fallbackValue = fallbackName ? process.env[fallbackName]?.trim() : "";
  return fallbackValue || null;
}

function readRequiredR2Env(primaryName: string, fallbackName?: string): string {
  const value = readOptionalR2Env(primaryName, fallbackName);
  if (!value) {
    const expectedNames = fallbackName ? `${primaryName} or ${fallbackName}` : primaryName;
    throw new Error(`Bandori master R2 artifact read mode is missing ${expectedNames}`);
  }
  return value;
}

function getBandoriMasterR2Config(): R2S3ReaderConfig {
  const accountId = readOptionalR2Env("BANDORI_MASTER_R2_ACCOUNT_ID", "BANDORI_R2_ACCOUNT_ID");
  const endpoint = readOptionalR2Env("BANDORI_MASTER_R2_ENDPOINT", "BANDORI_R2_ENDPOINT")
    ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!endpoint) {
    throw new Error(
      "Bandori master R2 artifact read mode is missing BANDORI_MASTER_R2_ENDPOINT, "
      + "BANDORI_R2_ENDPOINT, BANDORI_MASTER_R2_ACCOUNT_ID, or BANDORI_R2_ACCOUNT_ID",
    );
  }

  return {
    endpoint,
    bucket: readRequiredR2Env("BANDORI_MASTER_R2_BUCKET", "BANDORI_R2_BUCKET"),
    accessKeyId: readRequiredR2Env("BANDORI_MASTER_R2_ACCESS_KEY_ID", "BANDORI_R2_ACCESS_KEY_ID"),
    secretAccessKey: readRequiredR2Env("BANDORI_MASTER_R2_SECRET_ACCESS_KEY", "BANDORI_R2_SECRET_ACCESS_KEY"),
    region: readOptionalR2Env("BANDORI_MASTER_R2_REGION", "BANDORI_R2_REGION") || "auto",
  };
}

async function fetchJson<T>(
  url: string,
  revalidateSeconds = REFERENCE_METADATA_CACHE_PROFILE.nextRevalidateSeconds,
): Promise<T> {
  const response = await fetch(url, {
    next: { revalidate: revalidateSeconds },
  });

  if (!response.ok) {
    throw new Error(`Bandori master artifact fetch failed: HTTP ${response.status} ${url}`);
  }

  return response.json() as Promise<T>;
}

async function fetchR2Json<T>(
  objectKey: string,
  revalidateSeconds = REFERENCE_METADATA_CACHE_PROFILE.nextRevalidateSeconds,
): Promise<T> {
  const response = await fetchR2Object(
    getBandoriMasterR2Config(),
    normalizeObjectKey(objectKey),
    revalidateSeconds,
  );

  if (!response.ok) {
    throw new Error(`Bandori master R2 artifact fetch failed: HTTP ${response.status} ${normalizeObjectKey(objectKey)}`);
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

async function fetchR2GzipJson<T>(objectKey: string): Promise<T> {
  const response = await fetchR2Object(
    getBandoriMasterR2Config(),
    normalizeObjectKey(objectKey),
    REFERENCE_METADATA_CACHE_PROFILE.nextRevalidateSeconds,
  );

  if (!response.ok) {
    throw new Error(`Bandori master R2 artifact fetch failed: HTTP ${response.status} ${normalizeObjectKey(objectKey)}`);
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

async function fetchOptionalR2GzipJson<T>(objectKey: string): Promise<T | null> {
  const normalizedObjectKey = normalizeObjectKey(objectKey);
  const response = await fetchR2Object(
    getBandoriMasterR2Config(),
    normalizedObjectKey,
    REFERENCE_METADATA_CACHE_PROFILE.nextRevalidateSeconds,
  );

  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Bandori master R2 artifact fetch failed: HTTP ${response.status} ${normalizedObjectKey}`);
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

  if (shouldReadArtifactsFromR2()) {
    return fetchR2Json<BandoriMasterArtifactManifest>(
      data.manifest_path,
      BANDORI_MASTER_DATA_CACHE_PROFILE.nextRevalidateSeconds,
    );
  }

  const publicOrigin = getArtifactPublicOrigin();
  if (!publicOrigin) {
    throw new Error("BANDORI_MASTER_ARTIFACT_PUBLIC_ORIGIN is required when active source is Supabase");
  }

  return fetchJson<BandoriMasterArtifactManifest>(
    joinUrl(publicOrigin, data.manifest_path),
    BANDORI_MASTER_DATA_CACHE_PROFILE.nextRevalidateSeconds,
  );
}

async function readActiveManifestFromObjectStorage(
  server: BandoriMasterArtifactServer,
): Promise<BandoriMasterArtifactManifest | null> {
  if (shouldReadArtifactsFromR2()) {
    return fetchR2Json<BandoriMasterArtifactManifest>(
      `${getArtifactObjectKeyPrefix()}/${server}/active/manifest.json`,
      BANDORI_MASTER_DATA_CACHE_PROFILE.nextRevalidateSeconds,
    );
  }

  const manifestUrl = buildManifestUrl(server);
  if (!manifestUrl) {
    return null;
  }

  return fetchJson<BandoriMasterArtifactManifest>(
    manifestUrl,
    BANDORI_MASTER_DATA_CACHE_PROFILE.nextRevalidateSeconds,
  );
}

export async function fetchBandoriMasterArtifactDataset(
  dataset: BestdoriMasterDatasetKey,
  server: BandoriMasterArtifactServer = getDefaultBandoriMasterArtifactServer(),
): Promise<BandoriMasterArtifactDataset | null> {
  const artifactDataset = BANDORI_MASTER_ARTIFACT_DATASETS[dataset];
  const artifact = await fetchBandoriMasterArtifactNamedDataset(artifactDataset, server);
  if (!artifact) {
    return null;
  }

  return {
    ...artifact,
    dataset,
  };
}

export async function fetchBandoriMasterArtifactNamedDataset(
  artifactDataset: string,
  server: BandoriMasterArtifactServer = getDefaultBandoriMasterArtifactServer(),
): Promise<BandoriMasterArtifactNamedDataset | null> {
  const manifest = await readActiveManifestFromSupabase(server)
    ?? await readActiveManifestFromObjectStorage(server);
  if (!manifest) {
    return null;
  }

  const datasetEntry = manifest.datasets?.find((item) => item.dataset === artifactDataset);
  if (!datasetEntry) {
    return null;
  }

  const datasetFile = datasetEntry.file;
  const objectKey = `${manifest.artifactPrefix}/${datasetFile}`;

  if (shouldReadArtifactsFromR2()) {
    return {
      source: "artifacts",
      server,
      artifactDataset,
      manifest,
      payload: await fetchR2GzipJson<unknown>(objectKey),
    };
  }

  const publicOrigin = getArtifactPublicOrigin();
  if (!publicOrigin) {
    throw new Error("BANDORI_MASTER_ARTIFACT_PUBLIC_ORIGIN or BANDORI_MASTER_ARTIFACT_BASE_URL is required");
  }

  return {
    source: "artifacts",
    server,
    artifactDataset,
    manifest,
    payload: await fetchGzipJson<unknown>(
      withArtifactChecksum(
        joinUrl(publicOrigin, objectKey),
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
  const objectKey = `${manifest.artifactPrefix}/${datasetFile}`;

  if (shouldReadArtifactsFromR2()) {
    const payload = await fetchOptionalR2GzipJson<unknown>(objectKey);
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

  const payload = await fetchOptionalGzipJson<unknown>(
    withArtifactChecksum(
      joinUrl(publicOrigin, objectKey),
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
