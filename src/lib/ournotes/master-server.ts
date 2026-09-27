import {
  createBandoriSnapshotJsonObjectCache,
  createBandoriSnapshotPointerCache,
  createBandoriSnapshotVerifiedGzipJsonCache,
  createSnapshotObjectSource,
  type BandoriSnapshotObjectSource,
  type BandoriVerifiedGzipDescriptor,
} from "@/lib/bandori-snapshot-api-server";
import {
  OURNOTES_SOURCE_SERVERS, OURNOTES_MAX_JSON_BYTES, OurNotesDataError,
  mergeOurNotesCatalog, ourNotesPointerKey, ourNotesRecord, parseOurNotesManifest, parseOurNotesPointer, requireOurNotes,
  type OurNotesCatalogName, type OurNotesDataset,
} from "./master-contract";

const pointers = OURNOTES_SOURCE_SERVERS.map((server) => createBandoriSnapshotPointerCache({
  pointerKey: ourNotesPointerKey(server), pointerTtlMs: 60_000,
  pointerReadLabel: "OurNotes master pointer", parse: (raw) => parseOurNotesPointer(raw, server),
}));
const readManifest = createBandoriSnapshotJsonObjectCache({
  maxEntries: 8, maxBytes: 1024 * 1024, ttlMs: 60 * 60 * 1000,
  readLabel: "OurNotes master manifest", parse: ourNotesRecord,
});
type DatasetDescriptor = BandoriVerifiedGzipDescriptor & { recordCount?: number };
const gzipOptions = {
  maxEntries: 16, maxCacheBytes: 64 * 1024 * 1024,
  maxCompressedBytes: OURNOTES_MAX_JSON_BYTES, maxDecompressedBytes: OURNOTES_MAX_JSON_BYTES,
  datasetLabel: "OurNotes master dataset",
  parse: (raw: unknown, descriptor: DatasetDescriptor): unknown => {
    if (descriptor.recordCount !== undefined) {
      const row = ourNotesRecord(raw);
      requireOurNotes(Array.isArray(row.cards) && row.cards.length === descriptor.recordCount);
    }
    return raw;
  },
};
const readCardPack = createBandoriSnapshotVerifiedGzipJsonCache<unknown, DatasetDescriptor>(gzipOptions);
const readCatalog = createBandoriSnapshotVerifiedGzipJsonCache<unknown, DatasetDescriptor>({
  ...gzipOptions, maxCacheBytes: 8 * 1024 * 1024, verifySemanticHash: false,
});

function getOurNotesSource(): BandoriSnapshotObjectSource {
  return createSnapshotObjectSource({
    localStoreEnvironmentName: "OURNOTES_MASTER_LOCAL_STORE_ROOT",
    privateR2ReadLabel: "OurNotes private master R2 read",
    localObjectLabel: "OurNotes local master object",
    getR2Config: () => {
      const required = (name: string) => {
        const value = process.env[name]?.trim();
        requireOurNotes(value);
        return value;
      };
      return { endpoint: required("OURNOTES_R2_ENDPOINT"), bucket: required("OURNOTES_PRIVATE_R2_BUCKET"),
        accessKeyId: required("OURNOTES_R2_ACCESS_KEY_ID"), secretAccessKey: required("OURNOTES_R2_SECRET_ACCESS_KEY") };
    },
  });
}

export async function readOurNotesMasterInputs(dataset: OurNotesDataset, source?: BandoriSnapshotObjectSource): Promise<unknown[]> {
  try {
    const store = source ?? getOurNotesSource();
    // Each source pointer is pinned before its immutable objects are read.
    const current = await Promise.all(pointers.map((read) => read(store)));
    return await Promise.all(OURNOTES_SOURCE_SERVERS.map(async (server, index) => {
      const pointer = current[index];
      const manifest = await readManifest(store, pointer.artifact.key, {
        expectedSha256: pointer.artifact.sha256, expectedSize: pointer.artifact.size, timeoutMs: 15_000,
      });
      const files = parseOurNotesManifest(manifest, server, pointer);
      const json = files.get(`normalized/${dataset}.json`)!;
      const gzip = files.get(`normalized/${dataset}.json.gz`)!;
      if (dataset === "member_cards" || dataset === "support_cards") {
        const pack = pointer.datasets[dataset];
        requireOurNotes(pack.compressedSha256 === gzip.sha256 && pack.compressedSize === gzip.size && pack.jsonSize === json.size);
        return readCardPack(store, dataset, { ...pack, jsonSha256: json.sha256 }, { timeoutMs: 15_000 });
      }
      return readCatalog(store, dataset, { key: gzip.key, compressedSha256: gzip.sha256, compressedSize: gzip.size, jsonSha256: json.sha256, jsonSize: json.size }, { timeoutMs: 15_000 });
    }));
  } catch (error) {
    if (error instanceof OurNotesDataError) throw error;
    throw new OurNotesDataError("OurNotes master source is unavailable");
  }
}

type CatalogCache = { inputs: unknown[]; value: ReturnType<typeof mergeOurNotesCatalog> };
const catalogs: Partial<Record<OurNotesCatalogName, CatalogCache>> = {};
export async function readOurNotesCatalog(dataset: OurNotesCatalogName) {
  const inputs = await readOurNotesMasterInputs(dataset);
  const cached = catalogs[dataset];
  if (cached && inputs.every((value, index) => value === cached.inputs[index])) return cached.value;
  const value = mergeOurNotesCatalog(inputs, dataset);
  catalogs[dataset] = { inputs, value };
  return value;
}
