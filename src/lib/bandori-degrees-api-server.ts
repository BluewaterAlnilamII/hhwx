import {
  DEGREES_API_POINTER_KEY,
  MAX_DEGREES_API_COMPRESSED_BYTES,
  MAX_DEGREES_API_DECOMPRESSED_BYTES,
  MAX_DEGREES_API_RECORDS,
  parseDegreesApiPointer,
} from "@/lib/bandori-degrees-api-contract";
import {
  normalizeBandoriDegreeId,
  parseBandoriDegreeMasterEntry,
  BandoriDegreeMasterEntry,
  BandoriDegreeMasterMap,
} from "@/lib/bandori-degree-assets";
import {
  createBandoriSnapshotObjectSource,
  createBandoriSnapshotPointerCache,
  createBandoriSnapshotRecordMapCache,
  type BandoriSnapshotRecord,
} from "@/lib/bandori-snapshot-api-server";

const DEGREES_API_POINTER_TTL_MS = 60_000;

function validateDegreeRecord(
  _cacheKey: string,
  degreeId: string,
  record: BandoriSnapshotRecord,
): void {
  if (
    normalizeBandoriDegreeId(degreeId) === null
    || parseBandoriDegreeMasterEntry(record) === null
  ) {
    throw new Error(`Bandori degrees API record is invalid: ${degreeId}`);
  }
}

const readDegreesApiPointer = createBandoriSnapshotPointerCache({
  pointerKey: DEGREES_API_POINTER_KEY,
  pointerTtlMs: DEGREES_API_POINTER_TTL_MS,
  pointerReadLabel: "Bandori degrees API pointer",
  parse: parseDegreesApiPointer,
});

const readDegreesApiRecordMap = createBandoriSnapshotRecordMapCache({
  maxEntries: 1,
  maxCompressedBytes: MAX_DEGREES_API_COMPRESSED_BYTES,
  maxDecompressedBytes: MAX_DEGREES_API_DECOMPRESSED_BYTES,
  maxRecords: MAX_DEGREES_API_RECORDS,
  datasetLabel: "Bandori degrees API dataset",
  validateRecord: validateDegreeRecord,
});

function getDegreesApiObjectSource() {
  return createBandoriSnapshotObjectSource({
    localStoreEnvironmentName: "BANDORI_DEGREES_API_LOCAL_STORE_ROOT",
    privateR2ReadLabel: "Bandori private degrees R2 read",
    localObjectLabel: "Bandori local degrees API object",
  });
}

export async function readBandoriDegreesApiDataset(): Promise<BandoriDegreeMasterMap> {
  const source = getDegreesApiObjectSource();
  const pointer = await readDegreesApiPointer(source);
  const records = await readDegreesApiRecordMap(
    source,
    "degrees",
    pointer.datasets.degrees,
  );
  return records as Record<string, BandoriDegreeMasterEntry>;
}
