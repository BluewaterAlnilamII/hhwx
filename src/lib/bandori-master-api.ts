import { unstable_cache } from "next/cache";
import {
  fetchBandoriMasterArtifactDataset,
  fetchBandoriMasterArtifactNamedDataset,
  getDefaultBandoriMasterArtifactServer,
  type BandoriMasterArtifactServer,
} from "@/lib/bandori-master-artifacts";
import {
  fetchBestdoriApiPath,
  fetchBestdoriEventDetail,
  fetchBestdoriMasterDataset,
  filterBestdoriSongsForJpOrCn,
  type BestdoriMasterDatasetKey,
} from "@/lib/bestdori-master-data";

export const BANDORI_MASTER_ID_PATTERN = /^[1-9]\d*$/u;

export type BandoriMasterApiReadResult = {
  dataset: string;
  source: "artifacts" | "bestdori";
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

function shouldUseArtifacts(): boolean {
  return process.env.BANDORI_MASTER_SOURCE === "artifacts";
}

export function redirectBandoriMasterSearch(request: Request): Response | null {
  const requestUrl = new URL(request.url);
  if (!requestUrl.search) {
    return null;
  }

  requestUrl.search = "";
  return Response.redirect(requestUrl, 308);
}

export function normalizeBandoriMasterServer(value: string): BandoriMasterArtifactServer | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "jp" || normalized === "cn" || normalized === "en" || normalized === "tw") {
    return normalized;
  }
  return null;
}

function getBandoriMasterArtifactServers(server?: BandoriMasterArtifactServer): BandoriMasterArtifactServer[] {
  if (server) {
    return [server];
  }

  const configuredServers = process.env.BANDORI_MASTER_ARTIFACT_SERVERS;
  if (!configuredServers) {
    return [getDefaultBandoriMasterArtifactServer()];
  }

  const servers: BandoriMasterArtifactServer[] = [];
  for (const rawServer of configuredServers.split(",")) {
    const normalizedServer = normalizeBandoriMasterServer(rawServer);
    if (normalizedServer && !servers.includes(normalizedServer)) {
      servers.push(normalizedServer);
    }
  }

  return servers.length > 0 ? servers : [getDefaultBandoriMasterArtifactServer()];
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

function projectRecordPayload(payload: unknown, keys: readonly string[]): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const projected: Record<string, unknown> = {};
  for (const [recordId, record] of Object.entries(payload)) {
    if (!isRecord(record)) {
      projected[recordId] = record;
      continue;
    }

    const nextRecord: Record<string, unknown> = {};
    for (const key of keys) {
      if (key in record) {
        nextRecord[key] = record[key];
      }
    }
    projected[recordId] = nextRecord;
  }
  return projected;
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

function overlayBestdoriSongNotes(songsPayload: unknown, bestdoriSongsPayload: unknown): unknown {
  if (!isRecord(songsPayload) || !isRecord(bestdoriSongsPayload)) {
    return songsPayload;
  }

  const payload: Record<string, unknown> = {};
  for (const [recordId, record] of Object.entries(songsPayload)) {
    if (!isRecord(record)) {
      payload[recordId] = record;
      continue;
    }

    const bestdoriRecord = bestdoriSongsPayload[recordId];
    if (!isRecord(bestdoriRecord) || !("notes" in bestdoriRecord)) {
      payload[recordId] = record;
      continue;
    }

    payload[recordId] = {
      ...record,
      notes: bestdoriRecord.notes,
    };
  }

  return payload;
}

async function normalizeArtifactSongsResult(
  result: BandoriMasterApiReadResult | null,
): Promise<BandoriMasterApiReadResult | null> {
  if (!result) {
    return null;
  }

  const bestdoriSongsPayload = (await readBestdoriRawDataset("songs")).payload;
  return {
    ...result,
    payload: overlayBestdoriSongNotes(result.payload, bestdoriSongsPayload),
    coverage: {
      status: "partial",
      reason: "songs.notes is sourced from Bestdori until HHWX chart-derived note counts replace this field.",
    },
  };
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

const readBestdoriDataset = unstable_cache(
  async (dataset: BestdoriMasterDatasetKey): Promise<BandoriMasterApiReadResult> => ({
    dataset,
    source: "bestdori",
    payload: dataset === "songs"
      ? filterBestdoriSongsForJpOrCn(await fetchBestdoriMasterDataset(dataset))
      : await fetchBestdoriMasterDataset(dataset),
  }),
  ["bandori-master-api-bestdori-dataset:v1"],
  { revalidate: 86400 },
);

const readBestdoriRawDataset = unstable_cache(
  async (dataset: BestdoriMasterDatasetKey): Promise<BandoriMasterApiReadResult> => ({
    dataset,
    source: "bestdori",
    payload: await fetchBestdoriMasterDataset(dataset),
  }),
  ["bandori-master-api-bestdori-raw-dataset:v1"],
  { revalidate: 86400 },
);

const readBestdoriPath = unstable_cache(
  async (dataset: string, path: string): Promise<BandoriMasterApiReadResult> => ({
    dataset,
    source: "bestdori",
    payload: await fetchBestdoriApiPath(path),
  }),
  ["bandori-master-api-bestdori-path:v1"],
  { revalidate: 86400 },
);

const readBestdoriEventDetail = unstable_cache(
  async (eventId: string): Promise<BandoriMasterApiReadResult> => ({
    dataset: "event_detail",
    source: "bestdori",
    payload: await fetchBestdoriEventDetail(eventId),
  }),
  ["bandori-master-api-bestdori-event-detail:v1"],
  { revalidate: 86400 },
);

async function readArtifactDataset(
  dataset: BestdoriMasterDatasetKey,
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
  dataset: BestdoriMasterDatasetKey,
  server?: BandoriMasterArtifactServer,
): Promise<BandoriMasterApiReadResult | null> {
  if (shouldUseArtifacts()) {
    if (dataset === "events") {
      return readBestdoriDataset("events");
    }

    const results = await Promise.all(
      getBandoriMasterArtifactServers(server).map((artifactServer) => readArtifactDataset(dataset, artifactServer)),
    );
    const result = mergeArtifactResults(dataset, results);
    if (dataset === "songs") {
      return normalizeArtifactSongsResult(result);
    }
    if (dataset === "areaItems") {
      return normalizeArtifactAreaItemsResult(result);
    }
    return result;
  }

  return readBestdoriDataset(dataset);
}

export async function readBandoriMasterPath(
  dataset: string,
  bestdoriPath: string,
  artifactDataset: string,
  options?: {
    server?: BandoriMasterArtifactServer;
    emptyWhenArtifactMissing?: boolean;
    emptyReason?: string;
  },
): Promise<BandoriMasterApiReadResult | null> {
  if (shouldUseArtifacts()) {
    const servers = getBandoriMasterArtifactServers(options?.server);
    const results = await Promise.all(
      servers.map((artifactServer) => readArtifactNamedDataset(dataset, artifactDataset, artifactServer)),
    );
    const result = mergeArtifactResults(dataset, results, artifactDataset);
    if (result || !options?.emptyWhenArtifactMissing) {
      if (artifactDataset === "areaItems") {
        return normalizeArtifactAreaItemsResult(result);
      }
      return result;
    }

    return {
      dataset,
      source: "artifacts",
      servers,
      artifactDataset,
      payload: {},
      coverage: {
        status: "empty",
        reason: options.emptyReason,
      },
    };
  }

  return readBestdoriPath(dataset, bestdoriPath);
}

export async function readBandoriMasterEventDetail(
  eventId: string,
): Promise<BandoriMasterApiReadResult | null> {
  if (shouldUseArtifacts()) {
    return readBestdoriEventDetail(eventId);
  }

  return readBestdoriEventDetail(eventId);
}

export async function readBandoriMasterRecord(
  dataset: BestdoriMasterDatasetKey,
  recordId: string,
  detailDataset: string,
  detailBestdoriPath: string,
  server?: BandoriMasterArtifactServer,
): Promise<BandoriMasterApiReadResult | null> {
  if (!shouldUseArtifacts()) {
    return readBestdoriPath(detailDataset, detailBestdoriPath);
  }

  const aggregate = await readBandoriMasterDataset(dataset, server);
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

export async function readBandoriMasterProjectedDataset(
  dataset: BestdoriMasterDatasetKey,
  projectedDataset: string,
  bestdoriPath: string,
  keys: readonly string[],
  server?: BandoriMasterArtifactServer,
): Promise<BandoriMasterApiReadResult | null> {
  if (!shouldUseArtifacts()) {
    return readBestdoriPath(projectedDataset, bestdoriPath);
  }

  const aggregate = await readBandoriMasterDataset(dataset, server);
  if (!aggregate) {
    return null;
  }

  return {
    ...aggregate,
    dataset: projectedDataset,
    payload: projectRecordPayload(aggregate.payload, keys),
  };
}
