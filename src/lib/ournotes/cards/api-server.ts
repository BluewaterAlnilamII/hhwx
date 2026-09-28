import {
  createBandoriSnapshotPointerCache, createBandoriSnapshotVerifiedGzipJsonCache,
  type BandoriSnapshotObjectSource,
} from "@/lib/bandori-snapshot-api-server";
import { getOurNotesSource } from "../master-server";
import { OURNOTES_SOURCE_SERVERS, OURNOTES_MAX_JSON_BYTES, OurNotesDataError, ourNotesRecord, requireOurNotes } from "../master-contract";
import { ourNotesPointerKey, parseOurNotesPointer, type OurNotesPackDescriptor } from "./api-contract";
import type { OurNotesServer } from "../master-contract";
import { mergeOurNotesCards, type OurNotesCardKind, type OurNotesCardSummary } from "./api-contract";

type Cards = ReturnType<typeof mergeOurNotesCards>;
type Cache = { inputs: unknown[]; cards: Cards; selected: Map<OurNotesServer, Cards> };
const cache: Partial<Record<OurNotesCardKind, Cache>> = {};

function select<T extends OurNotesCardSummary>(records: Record<string, T>, server: OurNotesServer): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [id, card] of Object.entries(records)) {
    if (card.serverExtensions![server] === null) continue;
    const copy = { ...card };
    delete copy.serverExtensions;
    result[id] = copy;
  }
  return result;
}
async function readCards(kind: OurNotesCardKind, server?: OurNotesServer): Promise<Cards> {
  const inputs = await readOurNotesCardInputs(kind);
  let entry = cache[kind];
  if (!entry || !inputs.every((value, index) => value === entry!.inputs[index])) {
    entry = { inputs, cards: mergeOurNotesCards(inputs, kind), selected: new Map() };
    cache[kind] = entry;
  }
  if (server === undefined) return entry.cards;
  // TW and cn_intl share selection; localized values remain five-slot arrays.
  const sourceServer = server === 3 ? 2 : server;
  let selected = entry.selected.get(sourceServer);
  if (!selected) {
    selected = { summaries: select(entry.cards.summaries, sourceServer), details: select(entry.cards.details, sourceServer) };
    entry.selected.set(sourceServer, selected);
  }
  return selected;
}
export async function readOurNotesCards(kind: OurNotesCardKind, server?: OurNotesServer) {
  return (await readCards(kind, server)).summaries;
}
export async function readOurNotesCard(kind: OurNotesCardKind, id: string, server?: OurNotesServer) {
  const records = (await readCards(kind, server)).details;
  return Object.hasOwn(records, id) ? records[id] : null;
}

const pointers = OURNOTES_SOURCE_SERVERS.map((server) => createBandoriSnapshotPointerCache({
  pointerKey: ourNotesPointerKey(server), pointerTtlMs: 60_000,
  pointerReadLabel: "OurNotes Cards pointer", parse: (raw) => parseOurNotesPointer(raw, server),
}));
const readPack = createBandoriSnapshotVerifiedGzipJsonCache<unknown, OurNotesPackDescriptor>({
  maxEntries: 16, maxCacheBytes: 64 * 1024 * 1024,
  maxCompressedBytes: OURNOTES_MAX_JSON_BYTES, maxDecompressedBytes: OURNOTES_MAX_JSON_BYTES,
  datasetLabel: "OurNotes Cards pack",
  parse: (raw, descriptor, kind) => {
    const row = ourNotesRecord(raw);
    requireOurNotes(row.schema === "ournotes-card-projection-v2" && row.kind === kind
      && Array.isArray(row.cards) && row.cards.length === descriptor.recordCount);
    return raw;
  },
});
export async function readOurNotesCardInputs(kind: OurNotesCardKind, source?: BandoriSnapshotObjectSource): Promise<unknown[]> {
  try {
    const store = source ?? getOurNotesSource();
    const current = await Promise.all(pointers.map((read) => read(store)));
    return await Promise.all(current.map((pointer) => readPack(store, kind, pointer.datasets[`${kind}_cards`], { timeoutMs: 15_000 })));
  } catch (error) {
    if (error instanceof OurNotesDataError) throw error;
    throw new OurNotesDataError("OurNotes Cards source is unavailable");
  }
}
