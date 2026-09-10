import type { BandoriServer } from "@/lib/bandori-server";
import {
  createBandoriSnapshotObjectSource,
  createBandoriSnapshotPointerCache,
  createBandoriSnapshotVerifiedGzipJsonCache,
  type BandoriSnapshotPackDescriptor,
} from "@/lib/bandori-snapshot-api-server";
import {
  COSTUMES_API_POINTER_KEY, MAX_COSTUMES_COMPRESSED_BYTES, MAX_COSTUMES_DECOMPRESSED_BYTES,
  costumeSummary, isCostumeId, materializeCostume, parseCostumesApiPointer, parseCostumesRecordMap,
  type BandoriCostumeMap, type BandoriCostumeSummary,
} from "./api-contract";

const readPointer = createBandoriSnapshotPointerCache({
  pointerKey: COSTUMES_API_POINTER_KEY, pointerTtlMs: 60_000,
  pointerReadLabel: "Bandori costumes API pointer", parse: parseCostumesApiPointer,
});
const readPack = createBandoriSnapshotVerifiedGzipJsonCache<BandoriCostumeMap, BandoriSnapshotPackDescriptor>({
  maxEntries: 1, maxCacheBytes: MAX_COSTUMES_DECOMPRESSED_BYTES,
  maxCompressedBytes: MAX_COSTUMES_COMPRESSED_BYTES,
  maxDecompressedBytes: MAX_COSTUMES_DECOMPRESSED_BYTES,
  datasetLabel: "Bandori costumes API", verifySemanticHash: true,
  parse: (payload, descriptor) => parseCostumesRecordMap(payload, descriptor.recordCount),
});

export async function readBandoriCostumesApiDataset(): Promise<BandoriCostumeMap> {
  const source = createBandoriSnapshotObjectSource({
    localStoreEnvironmentName: "BANDORI_COSTUMES_API_LOCAL_STORE_ROOT",
    privateR2ReadLabel: "Bandori private costumes R2 read", localObjectLabel: "Bandori local costumes API object",
  });
  const pointer = await readPointer(source);
  return readPack(source, "costumes", pointer.costumes, { timeoutMs: 15_000 });
}

export async function readBandoriCostumeApiList(server?: BandoriServer): Promise<Record<string, BandoriCostumeSummary>> {
  const records = await readBandoriCostumesApiDataset();
  const summaries: Record<string, BandoriCostumeSummary> = {};
  for (const [id, canonical] of Object.entries(records)) {
    const record = server === undefined ? canonical : materializeCostume(canonical, server);
    if (record) summaries[id] = costumeSummary(record);
  }
  return summaries;
}

export async function readBandoriCostumeApiDetail(id: string, server?: BandoriServer) {
  if (!isCostumeId(id)) return null;
  const records = await readBandoriCostumesApiDataset();
  const record = Object.hasOwn(records, id) ? records[id] : null;
  return record && server !== undefined ? materializeCostume(record, server) : record;
}
