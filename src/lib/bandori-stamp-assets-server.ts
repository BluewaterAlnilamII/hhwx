import { SNAPSHOT_HTTP_CACHE_POLICY } from "@/lib/api-cache";
import {
  parseBandoriStampCatalogApiResponse,
  type BandoriStampCatalogApiResponse,
} from "@/lib/bandori-stamp-assets";
import { fetchR2Object, type R2S3ReaderConfig } from "@/lib/r2-s3-reader";

type StampCatalogReadErrorCode =
  | "BANDORI_STAMPS_R2_UNCONFIGURED"
  | "BANDORI_STAMPS_R2_UNAVAILABLE"
  | "BANDORI_STAMPS_INVALID_CATALOG";

export class BandoriStampCatalogReadError extends Error {
  readonly code: StampCatalogReadErrorCode;
  readonly httpStatus: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: StampCatalogReadErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BandoriStampCatalogReadError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

const STAMP_CATALOG_OBJECT_KEY = "bandori/stamps/index.json";
const R2_ENDPOINT_ENV_NAMES = [
  "BANDORI_STAMP_R2_ENDPOINT",
  "BANDORI_ASSET_R2_ENDPOINT",
  "BANDORI_R2_ENDPOINT",
  "BANDORI_MASTER_R2_ENDPOINT",
] as const;
const R2_ACCOUNT_ID_ENV_NAMES = [
  "BANDORI_STAMP_R2_ACCOUNT_ID",
  "BANDORI_ASSET_R2_ACCOUNT_ID",
  "BANDORI_R2_ACCOUNT_ID",
  "BANDORI_MASTER_R2_ACCOUNT_ID",
] as const;
const R2_BUCKET_ENV_NAMES = [
  "BANDORI_STAMP_R2_BUCKET",
  "BANDORI_ASSET_R2_BUCKET",
  "BANDORI_R2_BUCKET",
  "BANDORI_MASTER_R2_BUCKET",
] as const;
const R2_ACCESS_KEY_ID_ENV_NAMES = [
  "BANDORI_STAMP_R2_ACCESS_KEY_ID",
  "BANDORI_ASSET_R2_ACCESS_KEY_ID",
  "BANDORI_R2_ACCESS_KEY_ID",
  "BANDORI_MASTER_R2_ACCESS_KEY_ID",
] as const;
const R2_SECRET_ACCESS_KEY_ENV_NAMES = [
  "BANDORI_STAMP_R2_SECRET_ACCESS_KEY",
  "BANDORI_ASSET_R2_SECRET_ACCESS_KEY",
  "BANDORI_R2_SECRET_ACCESS_KEY",
  "BANDORI_MASTER_R2_SECRET_ACCESS_KEY",
] as const;
const R2_REGION_ENV_NAMES = [
  "BANDORI_STAMP_R2_REGION",
  "BANDORI_ASSET_R2_REGION",
  "BANDORI_R2_REGION",
  "BANDORI_MASTER_R2_REGION",
] as const;

function normalizeObjectKey(value: string): string {
  return value.trim().replace(/^\/+|\/+$/gu, "").replace(/\/{2,}/gu, "/");
}

function readOptionalEnv(names: readonly string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function readRequiredEnv(names: readonly string[]): string {
  const value = readOptionalEnv(names);
  if (!value) {
    throw new BandoriStampCatalogReadError(
      "BANDORI_STAMPS_R2_UNCONFIGURED",
      `Bandori stamp catalog R2 read mode is missing ${names.join(", ")}`,
      503,
    );
  }
  return value;
}

function getBandoriAssetR2Config(): R2S3ReaderConfig {
  const accountId = readOptionalEnv(R2_ACCOUNT_ID_ENV_NAMES);
  const endpoint = readOptionalEnv(R2_ENDPOINT_ENV_NAMES)
    ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");

  if (!endpoint) {
    throw new BandoriStampCatalogReadError(
      "BANDORI_STAMPS_R2_UNCONFIGURED",
      `Bandori stamp catalog R2 read mode is missing ${[
        ...R2_ENDPOINT_ENV_NAMES,
        ...R2_ACCOUNT_ID_ENV_NAMES,
      ].join(", ")}`,
      503,
    );
  }

  return {
    endpoint,
    bucket: readRequiredEnv(R2_BUCKET_ENV_NAMES),
    accessKeyId: readRequiredEnv(R2_ACCESS_KEY_ID_ENV_NAMES),
    secretAccessKey: readRequiredEnv(R2_SECRET_ACCESS_KEY_ENV_NAMES),
    region: readOptionalEnv(R2_REGION_ENV_NAMES) || "auto",
  };
}

function getBandoriStampCatalogObjectKey(): string {
  return normalizeObjectKey(process.env.BANDORI_STAMP_CATALOG_OBJECT_KEY ?? STAMP_CATALOG_OBJECT_KEY);
}

export async function readBandoriStampCatalogFromObjectStorage(): Promise<BandoriStampCatalogApiResponse> {
  const objectKey = getBandoriStampCatalogObjectKey();
  const response = await fetchR2Object(
    getBandoriAssetR2Config(),
    objectKey,
    SNAPSHOT_HTTP_CACHE_POLICY.nextRevalidateSeconds,
  );

  if (!response.ok) {
    throw new BandoriStampCatalogReadError(
      "BANDORI_STAMPS_R2_UNAVAILABLE",
      "Bandori stamp catalog object is unavailable",
      503,
      { status: response.status, objectKey },
    );
  }

  let rawCatalog: unknown;
  try {
    rawCatalog = await response.json();
  } catch {
    throw new BandoriStampCatalogReadError(
      "BANDORI_STAMPS_INVALID_CATALOG",
      "Bandori stamp catalog object is not valid JSON",
      502,
      { objectKey },
    );
  }

  const catalog = parseBandoriStampCatalogApiResponse(rawCatalog);
  if (!catalog) {
    throw new BandoriStampCatalogReadError(
      "BANDORI_STAMPS_INVALID_CATALOG",
      "Bandori stamp catalog payload is invalid",
      502,
      { objectKey },
    );
  }

  return catalog;
}
