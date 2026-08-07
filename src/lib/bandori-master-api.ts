import {
  BANDORI_MASTER_ARTIFACT_SERVERS,
  fetchBandoriMasterArtifactDataset,
  fetchBandoriMasterArtifactNamedDataset,
  type BandoriMasterArtifactServer,
} from "@/lib/bandori-master-artifacts";
import type { BandoriMasterDatasetKey } from "@/lib/bandori-master-contract";
import { NO_STORE_HTTP_CACHE_POLICY, withHttpCachePolicy } from "@/lib/api-cache";
import { jsonError } from "@/lib/api-response";

export const BANDORI_MASTER_ID_PATTERN = /^[1-9]\d*$/u;

export type BandoriMasterApiReadResult = {
  dataset: string;
  source: "artifacts";
  server?: BandoriMasterArtifactServer;
  servers?: BandoriMasterArtifactServer[];
  masterVersion?: string | null;
  masterVersions?: Partial<Record<BandoriMasterArtifactServer, string | null>>;
  artifactVersion?: string;
  artifactVersions?: Partial<Record<BandoriMasterArtifactServer, string>>;
  artifactDataset?: string;
  payload: unknown;
  coverage?: {
    status: "complete" | "partial" | "empty";
    reason?: string;
  };
};

type LegacyBandoriMasterDatasetKey = Exclude<
  BandoriMasterDatasetKey,
  "cards" | "events" | "songs"
>;

export function rejectUnsupportedBandoriMasterQuery(request: Request): Response | null {
  if (!new URL(request.url).search) {
    return null;
  }

  return jsonError(
    400,
    "BANDORI_MASTER_QUERY_INVALID",
    "Query parameters are not supported for this Bandori master endpoint",
    { headers: withHttpCachePolicy(NO_STORE_HTTP_CACHE_POLICY) },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readPayloadRecord(payload: unknown, recordId: string): unknown | null {
  if (!isRecord(payload)) {
    return null;
  }

  return payload[recordId] ?? null;
}

function toPositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }
  return Math.trunc(numeric);
}

function buildNormalBandIdByCharacterId(bandsPayload: unknown): Map<number, number> {
  const bandIdByCharacterId = new Map<number, number>();
  if (!isRecord(bandsPayload)) {
    return bandIdByCharacterId;
  }

  for (const [rawBandId, rawBand] of Object.entries(bandsPayload)) {
    if (!isRecord(rawBand) || rawBand.bandType !== "normal" || !Array.isArray(rawBand.members)) {
      continue;
    }

    const bandId = toPositiveInteger(rawBandId);
    if (bandId === null) {
      continue;
    }

    for (const rawCharacterId of rawBand.members) {
      const characterId = toPositiveInteger(rawCharacterId);
      if (characterId !== null && !bandIdByCharacterId.has(characterId)) {
        bandIdByCharacterId.set(characterId, bandId);
      }
    }
  }

  return bandIdByCharacterId;
}

function normalizeArtifactCharacterPayload(
  charactersPayload: unknown,
  bandsPayload: unknown,
  options: { mainOnly: boolean },
): unknown {
  if (!isRecord(charactersPayload)) {
    return charactersPayload;
  }

  const bandIdByCharacterId = buildNormalBandIdByCharacterId(bandsPayload);
  const payload: Record<string, unknown> = {};
  for (const [recordId, record] of Object.entries(charactersPayload)) {
    if (!isRecord(record)) {
      if (!options.mainOnly) {
        payload[recordId] = record;
      }
      continue;
    }
    if (options.mainOnly && record.characterType !== "unique") {
      continue;
    }

    const characterId = toPositiveInteger(recordId);
    const normalBandId = characterId !== null ? bandIdByCharacterId.get(characterId) : undefined;
    payload[recordId] = normalBandId === undefined ? record : {
      ...record,
      bandId: normalBandId,
    };
  }

  return payload;
}

function normalizeArtifactAreaItemPayload(areaItemsPayload: unknown): unknown {
  if (!isRecord(areaItemsPayload)) {
    return areaItemsPayload;
  }

  const payload: Record<string, unknown> = {};
  for (const [recordId, record] of Object.entries(areaItemsPayload)) {
    if (!isRecord(record)) {
      payload[recordId] = record;
      continue;
    }

    const targetAttributes = typeof record.targetAttributes === "string"
      ? [record.targetAttributes]
      : record.targetAttributes;
    const targetBandId = toPositiveInteger(record.targetBandIds);
    const targetBandIds = Array.isArray(record.targetBandIds) || targetBandId === null
      ? record.targetBandIds
      : [targetBandId];

    payload[recordId] = targetAttributes === record.targetAttributes && targetBandIds === record.targetBandIds
      ? record
      : {
        ...record,
        targetAttributes,
        targetBandIds,
      };
  }

  return payload;
}

function normalizeArtifactAreaItemsResult(
  result: BandoriMasterApiReadResult | null,
): BandoriMasterApiReadResult | null {
  if (!result) {
    return null;
  }

  return {
    ...result,
    payload: normalizeArtifactAreaItemPayload(result.payload),
  };
}

function isMissingValue(value: unknown): boolean {
  return value === null || value === undefined;
}

function isRegionalArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length === 4 && value.some(isMissingValue);
}

function mergeMasterValue(base: unknown, next: unknown, currentKey?: string): unknown {
  if (isMissingValue(base)) {
    return next;
  }
  if (isMissingValue(next)) {
    return base;
  }
  if (currentKey === "seasonCostumeListMap") {
    return base;
  }

  if (isRegionalArray(base) && isRegionalArray(next)) {
    return base.map((value, index) => (isMissingValue(value) ? next[index] : mergeMasterValue(value, next[index])));
  }

  if (Array.isArray(base) && Array.isArray(next)) {
    return base.length > 0 ? base : next;
  }

  if (isRecord(base) && isRecord(next)) {
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(next)) {
      merged[key] = mergeMasterValue(merged[key], value, key);
    }
    return merged;
  }

  return base;
}

function mergeMasterPayloads(payloads: unknown[]): unknown {
  let merged: unknown = null;
  for (const payload of payloads) {
    merged = mergeMasterValue(merged, payload);
  }
  return merged;
}

function mergeArtifactResults(
  dataset: string,
  results: Array<BandoriMasterApiReadResult | null>,
  artifactDataset?: string,
): BandoriMasterApiReadResult | null {
  const availableResults = results.filter((result): result is BandoriMasterApiReadResult => result !== null);
  if (availableResults.length === 0) {
    return null;
  }
  if (availableResults.length === 1) {
    return { ...availableResults[0], dataset };
  }

  const servers = availableResults
    .map((result) => result.server)
    .filter((server): server is BandoriMasterArtifactServer => server !== undefined);
  const masterVersions: Partial<Record<BandoriMasterArtifactServer, string | null>> = {};
  const artifactVersions: Partial<Record<BandoriMasterArtifactServer, string>> = {};

  for (const result of availableResults) {
    if (result.server) {
      masterVersions[result.server] = result.masterVersion ?? null;
      if (result.artifactVersion) {
        artifactVersions[result.server] = result.artifactVersion;
      }
    }
  }

  return {
    dataset,
    source: "artifacts",
    servers,
    masterVersions,
    artifactVersions,
    artifactDataset: artifactDataset ?? availableResults[0].artifactDataset,
    payload: mergeMasterPayloads(availableResults.map((result) => result.payload)),
  };
}

function requireCompleteArtifactResults(
  dataset: string,
  results: Array<BandoriMasterApiReadResult | null>,
): void {
  const missingServers = BANDORI_MASTER_ARTIFACT_SERVERS.filter((_, index) => results[index] === null);
  if (missingServers.length > 0) {
    throw new Error(
      `Bandori master artifact dataset ${dataset} is missing for servers: ${missingServers.join(", ")}`,
    );
  }
}

export function refineBandoriMasterRecordPayload(
  result: BandoriMasterApiReadResult,
  options: {
    keys?: readonly string[];
    predicate?: (record: Record<string, unknown>, recordId: string) => boolean;
  },
): BandoriMasterApiReadResult {
  if (!isRecord(result.payload)) {
    return result;
  }

  const payload: Record<string, unknown> = {};
  for (const [recordId, record] of Object.entries(result.payload)) {
    if (!isRecord(record)) {
      payload[recordId] = record;
      continue;
    }

    if (options.predicate && !options.predicate(record, recordId)) {
      continue;
    }

    if (!options.keys) {
      payload[recordId] = record;
      continue;
    }

    const projected: Record<string, unknown> = {};
    for (const key of options.keys) {
      if (key in record) {
        projected[key] = record[key];
      }
    }
    payload[recordId] = projected;
  }

  return { ...result, payload };
}

async function readArtifactDataset(
  dataset: BandoriMasterDatasetKey,
  server: BandoriMasterArtifactServer,
): Promise<BandoriMasterApiReadResult | null> {
  const artifact = await fetchBandoriMasterArtifactDataset(dataset, server);
  if (!artifact) {
    return null;
  }
  const payload = dataset === "characters"
    ? normalizeArtifactCharacterPayload(
      artifact.payload,
      (await fetchBandoriMasterArtifactDataset("bands", server))?.payload,
      { mainOnly: true },
    )
    : artifact.payload;

  return {
    dataset,
    source: artifact.source,
    server: artifact.server,
    masterVersion: artifact.manifest.masterVersion,
    artifactVersion: artifact.manifest.version,
    artifactDataset: artifact.artifactDataset,
    payload,
  };
}

async function readArtifactNamedDataset(
  dataset: string,
  artifactDataset: string,
  server: BandoriMasterArtifactServer,
): Promise<BandoriMasterApiReadResult | null> {
  const artifact = await fetchBandoriMasterArtifactNamedDataset(artifactDataset, server);
  if (!artifact) {
    return null;
  }
  const payload = artifactDataset === "characters"
    ? normalizeArtifactCharacterPayload(
      artifact.payload,
      (await fetchBandoriMasterArtifactDataset("bands", server))?.payload,
      { mainOnly: dataset === "characters" || dataset === "characters_main" },
    )
    : artifact.payload;

  return {
    dataset,
    source: artifact.source,
    server: artifact.server,
    masterVersion: artifact.manifest.masterVersion,
    artifactVersion: artifact.manifest.version,
    artifactDataset: artifact.artifactDataset,
    payload,
  };
}

export async function readBandoriMasterDataset(
  dataset: LegacyBandoriMasterDatasetKey,
): Promise<BandoriMasterApiReadResult | null> {
  const results = await Promise.all(
    BANDORI_MASTER_ARTIFACT_SERVERS.map((server) => readArtifactDataset(dataset, server)),
  );
  requireCompleteArtifactResults(dataset, results);
  const result = mergeArtifactResults(dataset, results);
  if (dataset === "areaItems") {
    return normalizeArtifactAreaItemsResult(result);
  }
  return result;
}

export async function readBandoriMasterPath(
  dataset: string,
  artifactDataset: string,
): Promise<BandoriMasterApiReadResult | null> {
  const results = await Promise.all(
    BANDORI_MASTER_ARTIFACT_SERVERS.map((server) => readArtifactNamedDataset(dataset, artifactDataset, server)),
  );
  requireCompleteArtifactResults(dataset, results);
  const result = mergeArtifactResults(dataset, results, artifactDataset);
  if (artifactDataset === "areaItems") {
    return normalizeArtifactAreaItemsResult(result);
  }
  return result;
}

export async function readBandoriMasterRecord(
  dataset: LegacyBandoriMasterDatasetKey,
  recordId: string,
  detailDataset: string,
): Promise<BandoriMasterApiReadResult | null> {
  const aggregate = await readBandoriMasterDataset(dataset);
  const record = readPayloadRecord(aggregate?.payload, recordId);
  if (!aggregate || !record) {
    return null;
  }

  return {
    ...aggregate,
    dataset: detailDataset,
    payload: record,
    coverage: {
      status: "partial",
      reason: "Current artifacts do not provide independent detail files yet; this response is derived from the all dataset.",
    },
  };
}
