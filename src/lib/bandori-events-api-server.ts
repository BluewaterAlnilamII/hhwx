import {
  EVENT_API_POINTER_KEY,
  MAX_EVENT_API_COMPRESSED_BYTES,
  MAX_EVENT_API_DECOMPRESSED_BYTES,
  MAX_EVENT_API_RECORDS,
  parseEventApiPointer,
  type EventApiDatasetName,
} from "@/lib/bandori-events-api-contract";
import {
  createBandoriSnapshotObjectSource,
  createBandoriSnapshotPointerCache,
  createBandoriSnapshotRecordMapCache,
  type BandoriSnapshotRecord,
  type BandoriSnapshotRecordMap,
} from "@/lib/bandori-snapshot-api-server";

const EVENT_API_POINTER_TTL_MS = 60_000;

export type BandoriEventApiRecordMap = BandoriSnapshotRecordMap;

const readEventApiPointer = createBandoriSnapshotPointerCache({
  pointerKey: EVENT_API_POINTER_KEY,
  pointerTtlMs: EVENT_API_POINTER_TTL_MS,
  pointerReadLabel: "Bandori events API pointer",
  parse: parseEventApiPointer,
});

const readEventApiRecordMap = createBandoriSnapshotRecordMapCache({
  maxEntries: 2,
  maxCompressedBytes: MAX_EVENT_API_COMPRESSED_BYTES,
  maxDecompressedBytes: MAX_EVENT_API_DECOMPRESSED_BYTES,
  maxRecords: MAX_EVENT_API_RECORDS,
  datasetLabel: "Bandori events API dataset",
});

function getEventApiObjectSource() {
  return createBandoriSnapshotObjectSource({
    localStoreEnvironmentName: "BANDORI_EVENT_API_LOCAL_STORE_ROOT",
    privateR2ReadLabel: "Bandori private events R2 read",
    localObjectLabel: "Bandori local event API object",
  });
}

export async function readBandoriEventApiDataset(
  dataset: EventApiDatasetName,
): Promise<BandoriEventApiRecordMap> {
  const source = getEventApiObjectSource();
  const pointer = await readEventApiPointer(source);
  return readEventApiRecordMap(source, dataset, pointer.datasets[dataset]);
}

export async function readBandoriEventApiDetail(
  eventId: string,
): Promise<BandoriSnapshotRecord | null> {
  const details = await readBandoriEventApiDataset("eventDetails");
  return Object.hasOwn(details, eventId) ? details[eventId] : null;
}
