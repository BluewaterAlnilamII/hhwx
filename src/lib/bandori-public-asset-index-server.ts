import { createHash } from "node:crypto";
import { fetchR2Object, type R2S3ReaderConfig } from "@/lib/r2-s3-reader";

const MAX_PUBLIC_ASSET_JSON_BYTES = 4 * 1024 * 1024;
const PUBLIC_ASSET_JSON_TIMEOUT_MS = 15_000;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function readFirstEnvironmentValue(names: readonly string[]): string | null {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return null;
}

function readRequiredEnvironmentValue(names: readonly string[], label: string): string {
  const value = readFirstEnvironmentValue(names);
  if (!value) {
    throw new Error(`Bandori public asset R2 reader is missing ${label}: ${names.join(", ")}`);
  }
  return value;
}

function getBandoriPublicAssetR2Config(): R2S3ReaderConfig {
  const accountId = readFirstEnvironmentValue([
    "BANDORI_R2_ACCOUNT_ID",
    "BANDORI_ASSET_R2_ACCOUNT_ID",
    "BANDORI_MASTER_R2_ACCOUNT_ID",
  ]);
  const endpoint = readFirstEnvironmentValue([
    "BANDORI_R2_ENDPOINT",
    "BANDORI_ASSET_R2_ENDPOINT",
    "BANDORI_MASTER_R2_ENDPOINT",
  ]) ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "");
  if (!endpoint) {
    throw new Error(
      "Bandori public asset R2 reader is missing an endpoint or account ID",
    );
  }
  return {
    endpoint,
    bucket: readRequiredEnvironmentValue(
      [
        "BANDORI_PUBLIC_R2_BUCKET",
        "BANDORI_ASSET_R2_BUCKET",
        "BANDORI_MASTER_R2_BUCKET",
        "BANDORI_R2_BUCKET",
      ],
      "bucket",
    ),
    accessKeyId: readRequiredEnvironmentValue(
      [
        "BANDORI_R2_ACCESS_KEY_ID",
        "BANDORI_ASSET_R2_ACCESS_KEY_ID",
        "BANDORI_MASTER_R2_ACCESS_KEY_ID",
      ],
      "access key ID",
    ),
    secretAccessKey: readRequiredEnvironmentValue(
      [
        "BANDORI_R2_SECRET_ACCESS_KEY",
        "BANDORI_ASSET_R2_SECRET_ACCESS_KEY",
        "BANDORI_MASTER_R2_SECRET_ACCESS_KEY",
      ],
      "secret access key",
    ),
    region: readFirstEnvironmentValue([
      "BANDORI_R2_REGION",
      "BANDORI_ASSET_R2_REGION",
      "BANDORI_MASTER_R2_REGION",
    ]) ?? "auto",
  };
}

export async function fetchBandoriPublicAssetIndexJson(objectKey: string): Promise<unknown> {
  const response = await fetchR2Object(
    getBandoriPublicAssetR2Config(),
    objectKey,
    undefined,
    {
      maxBytes: MAX_PUBLIC_ASSET_JSON_BYTES,
      timeoutMs: PUBLIC_ASSET_JSON_TIMEOUT_MS,
    },
  );
  if (!response.ok) {
    throw new Error(
      `Bandori public asset R2 index read failed: HTTP ${response.status} ${objectKey}`,
    );
  }
  return response.json<unknown>();
}

export async function fetchBandoriPublicAssetJson(
  objectKey: string,
  expectedSha256: string,
): Promise<unknown> {
  if (!SHA256_PATTERN.test(expectedSha256)) {
    throw new Error("Bandori public asset R2 object has an invalid expected SHA-256");
  }
  const response = await fetchR2Object(
    getBandoriPublicAssetR2Config(),
    objectKey,
    undefined,
    {
      maxBytes: MAX_PUBLIC_ASSET_JSON_BYTES,
      timeoutMs: PUBLIC_ASSET_JSON_TIMEOUT_MS,
    },
  );
  if (!response.ok) {
    throw new Error(
      `Bandori public asset R2 object read failed: HTTP ${response.status} ${objectKey}`,
    );
  }
  const body = await response.buffer();
  const actualSha256 = createHash("sha256").update(body).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error(`Bandori public asset R2 object checksum mismatch: ${objectKey}`);
  }
  return JSON.parse(body.toString("utf8")) as unknown;
}
