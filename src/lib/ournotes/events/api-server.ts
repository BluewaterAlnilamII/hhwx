import {
  createBandoriSnapshotPointerCache, createBandoriSnapshotVerifiedGzipJsonCache,
  type BandoriSnapshotObjectSource,
} from "@/lib/bandori-snapshot-api-server";
import { getOurNotesSource } from "../master-server";
import { OurNotesDataError, type OurNotesServer } from "../master-contract";
import {
  OURNOTES_EVENTS_API_POINTER_KEY, OURNOTES_EVENTS_MAX_COMPRESSED_BYTES, OURNOTES_EVENTS_MAX_JSON_BYTES,
  parseOurNotesEventsPointer, parseOurNotesEventMap,
  type OurNotesEventDataset, type OurNotesEventPack, type OurNotesEventSummary, type OurNotesEventDetail,
} from "./api-contract";

const readPointer = createBandoriSnapshotPointerCache({
  pointerKey: OURNOTES_EVENTS_API_POINTER_KEY, pointerTtlMs: 60_000,
  pointerReadLabel: "OurNotes Events pointer", parse: parseOurNotesEventsPointer,
});
const readPack = createBandoriSnapshotVerifiedGzipJsonCache<ReturnType<typeof parseOurNotesEventMap>, OurNotesEventPack>({
  maxEntries: 2, maxCacheBytes: 2 * OURNOTES_EVENTS_MAX_JSON_BYTES,
  maxCompressedBytes: OURNOTES_EVENTS_MAX_COMPRESSED_BYTES, maxDecompressedBytes: OURNOTES_EVENTS_MAX_JSON_BYTES,
  datasetLabel: "OurNotes Events pack",
  parse: (raw, descriptor, dataset) => parseOurNotesEventMap(raw, descriptor, dataset as OurNotesEventDataset),
});
export async function readOurNotesEventDataset(dataset: OurNotesEventDataset, source?: BandoriSnapshotObjectSource) {
  try {
    const store = source ?? getOurNotesSource();
    const pointer = await readPointer(store);
    return await readPack(store, dataset, pointer.datasets[dataset], { timeoutMs: 15_000 });
  } catch (error) {
    if (error instanceof OurNotesDataError) throw error;
    throw new OurNotesDataError("OurNotes Events source is unavailable");
  }
}
function select<T extends OurNotesEventSummary | OurNotesEventDetail>(event: T, server?: OurNotesServer): T | null {
  if (server === undefined) return event;
  const extension = event.serverExtensions![server];
  if (extension === null) return null;
  const copy = { ...event };
  Object.assign(copy, extension);
  delete copy.serverExtensions;
  return copy;
}
export async function readOurNotesEvents(server?: OurNotesServer): Promise<Record<string, OurNotesEventSummary>> {
  const records = await readOurNotesEventDataset("events") as Record<string, OurNotesEventSummary>;
  if (server === undefined) return records;
  const result: Record<string, OurNotesEventSummary> = {};
  for (const [id, event] of Object.entries(records)) {
    const selected = select(event, server);
    if (selected) result[id] = selected;
  }
  return result;
}
export async function readOurNotesEvent(id: string, server?: OurNotesServer): Promise<OurNotesEventDetail | null> {
  const records = await readOurNotesEventDataset("eventDetails");
  return Object.hasOwn(records, id) ? select(records[id] as OurNotesEventDetail, server) : null;
}
