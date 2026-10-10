import {
  createBandoriSnapshotPointerCache, createBandoriSnapshotVerifiedGzipJsonCache,
  type BandoriSnapshotObjectSource,
} from "@/lib/bandori-snapshot-api-server";
import { getOurNotesSource } from "../master-server";
import { OurNotesDataError, type OurNotesServer } from "../master-contract";
import { readOurNotesCatalog } from "../catalogs-server";
import type { OurNotesBand } from "../catalogs-contract";
import {
  OURNOTES_MUSIC_API_POINTER_KEY, OURNOTES_MUSIC_MAX_JSON_BYTES, parseOurNotesMusicPointer,
  parseOurNotesMusicMap, selectOurNotesMusic, fillOurNotesMusicBandName, type OurNotesMusicDataset, type OurNotesMusicPack,
  type OurNotesMusicSummary, type OurNotesMusicDetail,
} from "./api-contract";

const readPointer = createBandoriSnapshotPointerCache({
  pointerKey: OURNOTES_MUSIC_API_POINTER_KEY, pointerTtlMs: 60_000,
  pointerReadLabel: "OurNotes Music pointer", parse: parseOurNotesMusicPointer,
});
const readPack = createBandoriSnapshotVerifiedGzipJsonCache<ReturnType<typeof parseOurNotesMusicMap>, OurNotesMusicPack>({
  maxEntries: 2, maxCacheBytes: 2 * OURNOTES_MUSIC_MAX_JSON_BYTES,
  maxCompressedBytes: OURNOTES_MUSIC_MAX_JSON_BYTES, maxDecompressedBytes: OURNOTES_MUSIC_MAX_JSON_BYTES,
  datasetLabel: "OurNotes Music pack",
  // The producer hashes its original JSON bytes, including preserved float spellings.
  verifySemanticHash: false,
  parse: (raw, descriptor, dataset) => parseOurNotesMusicMap(raw, descriptor, dataset as OurNotesMusicDataset),
  estimateBytes: (value) => Buffer.byteLength(JSON.stringify(value)),
});
export async function readOurNotesMusicDataset(dataset: OurNotesMusicDataset, source?: BandoriSnapshotObjectSource) {
  try {
    const store = source ?? getOurNotesSource();
    const pointer = await readPointer(store);
    return await readPack(store, dataset, pointer.datasets[dataset], { timeoutMs: 15_000 });
  } catch (error) {
    if (error instanceof OurNotesDataError) throw error;
    throw new OurNotesDataError("OurNotes Music source is unavailable");
  }
}
export async function readOurNotesMusic(server?: OurNotesServer): Promise<Record<string, OurNotesMusicSummary>> {
  const [records, bands] = await Promise.all([readOurNotesMusicDataset("music"), readOurNotesCatalog("bands")]);
  const result: Record<string, OurNotesMusicSummary> = {};
  for (const [id, record] of Object.entries(records)) {
    const selected = selectOurNotesMusic(fillOurNotesMusicBandName(record, bands as Record<string, OurNotesBand>), server, "music");
    if (selected) result[id] = selected;
  }
  return result;
}
export async function readOurNotesMusicDetail(id: string, server?: OurNotesServer): Promise<OurNotesMusicDetail | null> {
  const records = await readOurNotesMusicDataset("musicDetails") as Record<string, OurNotesMusicDetail>;
  if (!Object.hasOwn(records, id) || (server !== undefined && records[id].serverExtensions![server] === null)) return null;
  const bands = await readOurNotesCatalog("bands") as Record<string, OurNotesBand>;
  return selectOurNotesMusic(fillOurNotesMusicBandName(records[id], bands), server, "musicDetails");
}
