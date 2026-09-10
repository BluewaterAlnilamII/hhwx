import type { BandoriServer } from "@/lib/bandori-server";
import type { BandoriSnapshotPackDescriptor } from "@/lib/bandori-snapshot-api-server";

export const COSTUMES_API_PREFIX = "bandori/master/costumes-v1/api";
export const COSTUMES_API_POINTER_KEY = `${COSTUMES_API_PREFIX}/active.json`;
export const COSTUMES_API_POINTER_SCHEMA_VERSION = "bandori-costumes-api-pointer-v1";
export const MAX_COSTUMES_COMPRESSED_BYTES = 4 * 1024 * 1024;
export const MAX_COSTUMES_DECOMPRESSED_BYTES = 16 * 1024 * 1024;
export const MAX_COSTUMES_RECORDS = 10_000;

type TextSlots = [string, string, string, string];
type CostumeExtension = { cards?: number[] };
type CostumeSlots = [CostumeExtension | null, CostumeExtension | null, CostumeExtension | null, CostumeExtension | null];

export type BandoriCostume = {
  characterId: number;
  assetBundleName: string;
  sdResourceName: string;
  description: TextSlots;
  publishedAt: TextSlots;
  cards: number[];
};
export type BandoriCanonicalCostume = BandoriCostume & { serverExtensions: CostumeSlots };
export type BandoriCostumeMap = Record<string, BandoriCanonicalCostume>;
export type BandoriCostumeSummary = Pick<BandoriCostume, "characterId" | "assetBundleName" | "description" | "publishedAt"> & {
  serverExtensions?: [object | null, object | null, object | null, object | null];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isCostumeId(value: string): boolean {
  return /^[1-9]\d*$/u.test(value) && positiveInteger(Number(value));
}

function resource(value: unknown, optional = false): value is string {
  return typeof value === "string" && value.length <= 255
    && ((optional && value === "") || /^[A-Za-z0-9_!-]+$/u.test(value));
}

function textSlots(value: unknown, timestamp = false): value is TextSlots {
  return Array.isArray(value) && value.length === 4 && value.every((entry) => (
    typeof entry === "string" && entry.length <= (timestamp ? 16 : 4096)
    && (!timestamp || entry === "" || (/^\d+$/u.test(entry) && Number.isSafeInteger(Number(entry))))
  ));
}

function cardIds(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= MAX_COSTUMES_RECORDS
    && value.every((id, i) => positiveInteger(id) && (i === 0 || value[i - 1] < id));
}

export function parseCostumesRecordMap(value: unknown, expectedCount: number): BandoriCostumeMap {
  if (!isRecord(value) || Object.keys(value).length !== expectedCount
    || expectedCount < 1 || expectedCount > MAX_COSTUMES_RECORDS) {
    throw new Error("Invalid Bandori costumes record count");
  }
  const fields = new Set(["characterId", "assetBundleName", "sdResourceName", "description", "publishedAt", "cards", "serverExtensions"]);
  for (const [id, record] of Object.entries(value)) {
    if (!isCostumeId(id) || !isRecord(record) || Object.keys(record).length !== fields.size
      || Object.keys(record).some((key) => !fields.has(key))
      || !positiveInteger(record.characterId) || !resource(record.assetBundleName)
      || !resource(record.sdResourceName, true) || !textSlots(record.description)
      || !textSlots(record.publishedAt, true) || !cardIds(record.cards)) {
      throw new Error(`Invalid Bandori costume record: ${id}`);
    }
    const extensions = record.serverExtensions;
    if (!Array.isArray(extensions) || extensions.length !== 4 || extensions.every((slot) => slot === null)) {
      throw new Error(`Invalid Bandori costume server slots: ${id}`);
    }
    for (const extension of extensions) {
      if (extension === null) continue;
      if (!isRecord(extension) || Object.keys(extension).some((key) => key !== "cards")
        || (Object.hasOwn(extension, "cards") && !cardIds(extension.cards))) {
        throw new Error(`Invalid Bandori costume regional override: ${id}`);
      }
    }
  }
  return value as BandoriCostumeMap;
}

export function parseCostumesApiPointer(value: unknown): { generation: number; costumes: BandoriSnapshotPackDescriptor } {
  if (!isRecord(value) || value.schemaVersion !== COSTUMES_API_POINTER_SCHEMA_VERSION
    || !positiveInteger(value.generation) || !isRecord(value.datasets)
    || Object.keys(value.datasets).length !== 1 || !isRecord(value.datasets.costumes)) {
    throw new Error("Invalid Bandori costumes pointer");
  }
  const pack = value.datasets.costumes;
  const hash = (entry: unknown): entry is string => typeof entry === "string" && /^[0-9a-f]{64}$/u.test(entry);
  if (!hash(pack.semanticSha256) || !hash(pack.compressedSha256)
    || pack.key !== `${COSTUMES_API_PREFIX}/packs/costumes/${pack.compressedSha256}.json.gz`
    || !positiveInteger(pack.compressedSize) || pack.compressedSize > MAX_COSTUMES_COMPRESSED_BYTES
    || !positiveInteger(pack.recordCount) || pack.recordCount > MAX_COSTUMES_RECORDS) {
    throw new Error("Invalid Bandori costumes pack descriptor");
  }
  return { generation: value.generation, costumes: {
    key: pack.key as string,
    semanticSha256: pack.semanticSha256,
    compressedSha256: pack.compressedSha256,
    compressedSize: pack.compressedSize,
    recordCount: pack.recordCount,
  } };
}

export function materializeCostume(record: BandoriCanonicalCostume, server: BandoriServer): BandoriCostume | null {
  const extension = record.serverExtensions[server];
  if (extension === null) return null;
  return {
    characterId: record.characterId, assetBundleName: record.assetBundleName,
    sdResourceName: record.sdResourceName, description: record.description,
    publishedAt: record.publishedAt, cards: extension.cards ?? record.cards,
  };
}

export function costumeSummary(record: BandoriCostume | BandoriCanonicalCostume): BandoriCostumeSummary {
  const summary: BandoriCostumeSummary = {
    characterId: record.characterId, assetBundleName: record.assetBundleName,
    description: record.description, publishedAt: record.publishedAt,
  };
  if ("serverExtensions" in record) {
    summary.serverExtensions = record.serverExtensions.map((slot) => slot === null ? null : {}) as BandoriCostumeSummary["serverExtensions"];
  }
  return summary;
}
