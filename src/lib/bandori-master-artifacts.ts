import { gunzipSync } from "node:zlib";
import {
  REFERENCE_HTTP_CACHE_POLICY,
  SNAPSHOT_HTTP_CACHE_POLICY,
} from "@/lib/api-cache";
import type { BandoriMasterDatasetKey } from "@/lib/bandori-master-contract";
import { fetchR2Object, type R2S3ReaderConfig } from "@/lib/r2-s3-reader";

export const BANDORI_MASTER_ARTIFACT_SERVERS = ["jp", "en", "tw", "cn"] as const;

export type BandoriMasterArtifactServer = typeof BANDORI_MASTER_ARTIFACT_SERVERS[number];

const BANDORI_MASTER_ARTIFACT_PREFIX = "bandori/master";

export const BANDORI_MASTER_ARTIFACT_DATASETS = {
  cards: "cards",
  songs: "songs",
  events: "events",
  areaItems: "area_items",
  skills: "skills",
  bands: "bands",
  characters: "characters",
} as const satisfies Record<BandoriMasterDatasetKey, string>;

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
  dataset: BandoriMasterDatasetKey;
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

function normalizeObjectKey(value: string): string {
  return value.replace(/^\/+|\/+$/g, "").replace(/\/{2,}/g, "/");
}

function readOptionalR2Env(...names: string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function readRequiredR2Env(...names: string[]): string {
  const value = readOptionalR2Env(...names);
  if (!value) {
    throw new Error(
      `Bandori master R2 artifact reader is missing ${names.join(" or ")}`,
    );
  }
  return value;
}

function getBandoriMasterR2Config(): R2S3ReaderConfig {
  return {
    endpoint: readRequiredR2Env("BANDORI_R2_ENDPOINT"),
    bucket: readRequiredR2Env("BANDORI_PUBLIC_R2_BUCKET"),
    accessKeyId: readRequiredR2Env("BANDORI_R2_ACCESS_KEY_ID"),
    secretAccessKey: readRequiredR2Env("BANDORI_R2_SECRET_ACCESS_KEY"),
  };
}

async function fetchR2Json<T>(
  objectKey: string,
  revalidateSeconds = REFERENCE_HTTP_CACHE_POLICY.nextRevalidateSeconds,
): Promise<T> {
  const normalizedObjectKey = normalizeObjectKey(objectKey);
  const response = await fetchR2Object(
    getBandoriMasterR2Config(),
    normalizedObjectKey,
    revalidateSeconds,
  );

  if (!response.ok) {
    throw new Error(`Bandori master R2 artifact fetch failed: HTTP ${response.status} ${normalizedObjectKey}`);
  }

  return response.json() as Promise<T>;
}

async function fetchR2GzipJson<T>(objectKey: string): Promise<T> {
  const normalizedObjectKey = normalizeObjectKey(objectKey);
  const response = await fetchR2Object(
    getBandoriMasterR2Config(),
    normalizedObjectKey,
    REFERENCE_HTTP_CACHE_POLICY.nextRevalidateSeconds,
  );

  if (!response.ok) {
    throw new Error(`Bandori master R2 artifact fetch failed: HTTP ${response.status} ${normalizedObjectKey}`);
  }

  const compressed = Buffer.from(await response.arrayBuffer());
  return JSON.parse(gunzipSync(compressed).toString("utf8")) as T;
}

async function readActiveManifestFromR2(
  server: BandoriMasterArtifactServer,
): Promise<BandoriMasterArtifactManifest> {
  return fetchR2Json<BandoriMasterArtifactManifest>(
    `${BANDORI_MASTER_ARTIFACT_PREFIX}/${server}/active/manifest.json`,
    SNAPSHOT_HTTP_CACHE_POLICY.nextRevalidateSeconds,
  );
}

export async function fetchBandoriMasterArtifactDataset(
  dataset: BandoriMasterDatasetKey,
  server: BandoriMasterArtifactServer,
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
  server: BandoriMasterArtifactServer,
): Promise<BandoriMasterArtifactNamedDataset | null> {
  const manifest = await readActiveManifestFromR2(server);
  if (manifest.server !== server) {
    throw new Error(
      `Bandori master manifest server mismatch: expected ${server}, received ${manifest.server}`,
    );
  }
  const datasetEntry = manifest.datasets?.find((item) => item.dataset === artifactDataset);
  if (!datasetEntry) {
    return null;
  }

  const objectKey = `${manifest.artifactPrefix}/${datasetEntry.file}`;
  return {
    source: "artifacts",
    server,
    artifactDataset,
    manifest,
    payload: await fetchR2GzipJson<unknown>(objectKey),
  };
}
