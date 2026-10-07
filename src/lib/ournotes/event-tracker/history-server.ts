import {
  createSnapshotObjectSource, createBandoriSnapshotJsonObjectCache, createBandoriSnapshotVerifiedGzipJsonCache,
} from "@/lib/bandori-snapshot-api-server";
import {
  OURNOTES_TRACKER_MAX_MANIFEST_BYTES, OURNOTES_TRACKER_MAX_COMPRESSED_BYTES, OURNOTES_TRACKER_MAX_JSON_BYTES,
  ourNotesTrackerPrefix, parseOurNotesTrackerManifest, parseOurNotesTrackerPack,
  type OurNotesTrackerTarget, type OurNotesTrackerDescriptor, type OurNotesTrackerManifest, type OurNotesTrackerPack,
} from "./contract";

const MAX_TARGETS = 64;
const READ_BUDGET_MS = 3_000;
const FAILURE_COOLDOWN_MS = 15_000;
const STALE_WINDOW_MS = 6 * 60 * 60 * 1000;

export class OurNotesTrackerReadError extends Error {}

function objectSource() {
  return createSnapshotObjectSource({
    localStoreEnvironmentName: "OURNOTES_TRACKER_LOCAL_STORE_ROOT",
    privateR2ReadLabel: "OurNotes tracker signed R2 read",
    localObjectLabel: "OurNotes tracker local object",
    getR2Config: () => {
      const required = (name: string) => {
        const value = process.env[name]?.trim();
        if (!value) throw new OurNotesTrackerReadError("OurNotes tracker storage is not configured");
        return value;
      };
      const endpoint = required("OURNOTES_R2_ENDPOINT");
      const url = new URL(endpoint);
      if ((url.protocol !== "https:" && (process.env.NODE_ENV === "production" || url.protocol !== "http:")) || url.username || url.password) {
        throw new OurNotesTrackerReadError("Invalid OurNotes tracker storage endpoint");
      }
      return { endpoint, bucket: required("OURNOTES_PUBLIC_R2_BUCKET"),
        accessKeyId: required("OURNOTES_R2_ACCESS_KEY_ID"), secretAccessKey: required("OURNOTES_R2_SECRET_ACCESS_KEY") };
    },
  });
}

const readManifest = createBandoriSnapshotJsonObjectCache<unknown>({
  maxEntries: MAX_TARGETS, maxBytes: OURNOTES_TRACKER_MAX_MANIFEST_BYTES, ttlMs: 60_000,
  readLabel: "OurNotes tracker manifest", allowNotFound: true,
  parse: (value) => {
    if (value === null) throw new OurNotesTrackerReadError("Invalid OurNotes tracker manifest");
    return value;
  },
});
const readPack = createBandoriSnapshotVerifiedGzipJsonCache<OurNotesTrackerPack, OurNotesTrackerDescriptor>({
  maxEntries: 16, maxCacheBytes: 32 * 1024 * 1024,
  maxCompressedBytes: OURNOTES_TRACKER_MAX_COMPRESSED_BYTES, maxDecompressedBytes: OURNOTES_TRACKER_MAX_JSON_BYTES,
  datasetLabel: "OurNotes tracker pack", parse: parseOurNotesTrackerPack,
  estimateBytes: (pack, bytes) => bytes + (pack.kind === "data"
    ? Array.from(pack.tiers.values()).reduce((count, points) => count + points.length * 64, 0)
    : pack.points.length * 64 + pack.users.length * 256),
});
type CachedTarget = OurNotesTrackerManifest & { sourceScope: string; manifestKey: string; completedAt: number };
const lastSuccess = new Map<string, CachedTarget>();
const cooldowns = new Map<string, number>();

function retain<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key);
  map.set(key, value);
  while (map.size > MAX_TARGETS) map.delete(map.keys().next().value!);
}
function stalePack(key: string): OurNotesTrackerPack | null {
  const cached = lastSuccess.get(key);
  if (!cached || Date.now() - cached.completedAt > STALE_WINDOW_MS) return null;
  const pack = readPack.peek(cached.sourceScope, cached.manifestKey, cached.descriptor);
  if (!pack) lastSuccess.delete(key);
  return pack;
}
function remaining(deadline: number): number {
  const ms = deadline - Date.now();
  if (ms <= 0) throw new OurNotesTrackerReadError("OurNotes tracker read timed out");
  return ms;
}
async function withinDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const ms = remaining(deadline);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new OurNotesTrackerReadError("OurNotes tracker read timed out")), ms);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

export async function readOurNotesTrackerHistory(target: OurNotesTrackerTarget): Promise<OurNotesTrackerPack> {
  let source;
  try {
    source = objectSource();
  } catch {
    throw new OurNotesTrackerReadError("OurNotes tracker storage is unavailable");
  }
  const manifestKey = `${ourNotesTrackerPrefix(target)}/manifest.json`;
  const key = `${source.scope}\u0000${manifestKey}`;
  if ((cooldowns.get(key) ?? 0) > Date.now()) {
    const stale = stalePack(key);
    if (stale) return stale;
    throw new OurNotesTrackerReadError("OurNotes tracker read is in failure cooldown");
  }
  const deadline = Date.now() + READ_BUDGET_MS;
  try {
    const raw = await withinDeadline(readManifest(source, manifestKey, { timeoutMs: remaining(deadline) }), deadline);
    if (raw === null) {
      lastSuccess.delete(key);
      cooldowns.delete(key);
      return target.kind === "data" ? { kind: "data", tiers: new Map() } : { kind: "topdata", points: [], users: [] };
    }
    const manifest = parseOurNotesTrackerManifest(raw, target);
    const pack = await withinDeadline(readPack(source, manifestKey, manifest.descriptor, { timeoutMs: remaining(deadline) }), deadline);
    retain(lastSuccess, key, { ...manifest, sourceScope: source.scope, manifestKey, completedAt: Date.now() });
    cooldowns.delete(key);
    return pack;
  } catch {
    retain(cooldowns, key, Date.now() + FAILURE_COOLDOWN_MS);
    const stale = stalePack(key);
    const cached = lastSuccess.get(key);
    console.warn("OurNotes tracker history read failed", { ...target, isStale: Boolean(stale),
      generation: cached?.generation ?? null, publishedAt: cached?.publishedAt ?? null });
    if (stale) return stale;
    throw new OurNotesTrackerReadError("OurNotes tracker history is unavailable");
  }
}
