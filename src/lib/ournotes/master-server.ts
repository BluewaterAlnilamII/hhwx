import {
  createBandoriSnapshotPointerCache,
  createBandoriSnapshotVerifiedGzipJsonCache,
  createSnapshotObjectSource,
  type BandoriSnapshotObjectSource,
} from "@/lib/bandori-snapshot-api-server";
import {
  OURNOTES_SOURCE_SERVERS, OURNOTES_MAX_JSON_BYTES, OurNotesDataError,
  ourNotesMasterKey, parseOurNotesManifest, requireOurNotes,
} from "./master-contract";

const manifests = OURNOTES_SOURCE_SERVERS.map((server) => createBandoriSnapshotPointerCache({
  pointerKey: ourNotesMasterKey(server), pointerTtlMs: 60_000,
  pointerReadLabel: "OurNotes master manifest", parse: (raw) => parseOurNotesManifest(raw, server),
}));
const readDataset = createBandoriSnapshotVerifiedGzipJsonCache({
  maxEntries: 16, maxCacheBytes: 8 * 1024 * 1024,
  maxCompressedBytes: OURNOTES_MAX_JSON_BYTES, maxDecompressedBytes: OURNOTES_MAX_JSON_BYTES,
  datasetLabel: "OurNotes master dataset", verifySemanticHash: false, cacheByContent: true,
  parse: (raw: unknown): unknown => raw,
});

export function getOurNotesSource(): BandoriSnapshotObjectSource {
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

export async function readOurNotesMasterInputs(dataset: string, source?: BandoriSnapshotObjectSource): Promise<unknown[]> {
  try {
    requireOurNotes(/^[a-z][a-z0-9_]*$/u.test(dataset));
    const store = source ?? getOurNotesSource();
    const current = await Promise.all(manifests.map((read) => read(store)));
    return await Promise.all(current.map((files) => {
      const json = files.get(`normalized/${dataset}.json`);
      const gzip = files.get(`normalized/${dataset}.json.gz`);
      requireOurNotes(json && gzip);
      return readDataset(store, dataset, { key: gzip.key, compressedSha256: gzip.sha256, compressedSize: gzip.size, jsonSha256: json.sha256, jsonSize: json.size }, { timeoutMs: 15_000 });
    }));
  } catch (error) {
    if (error instanceof OurNotesDataError) throw error;
    throw new OurNotesDataError("OurNotes master source is unavailable");
  }
}
