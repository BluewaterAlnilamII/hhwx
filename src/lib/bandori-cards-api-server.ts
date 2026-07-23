import {
  CARD_DETAIL_RANGE_SIZE,
  CARDS_API_POINTER_KEY,
  MAX_CARD_DETAILS_SHARD_COMPRESSED_BYTES,
  MAX_CARD_DETAILS_SHARD_DECOMPRESSED_BYTES,
  MAX_CARDS_API_COMPRESSED_BYTES,
  MAX_CARDS_API_DECOMPRESSED_BYTES,
  MAX_CARDS_API_RECORDS,
  cardApiDetailShardKey,
  isCardApiDetailIdSupported,
  parseCardsApiPointer,
} from "@/lib/bandori-cards-api-contract";
import {
  createBandoriSnapshotObjectSource,
  createBandoriSnapshotPointerCache,
  createBandoriSnapshotRecordMapCache,
  type BandoriSnapshotRecord,
  type BandoriSnapshotRecordMap,
} from "@/lib/bandori-snapshot-api-server";
import {
  getBandoriCardServerIndex,
  materializeBandoriCardForServer,
  materializeBandoriCardMapForServer,
  type BandoriCardServer,
  validateBandoriCardServerExtensions,
} from "@/lib/bandori-card-server-extensions";

const CARDS_API_POINTER_TTL_MS = 60_000;
const CARD_DETAIL_CACHE_ENTRIES = 16;
const resolvedCardsApiDatasets = new WeakMap<
  BandoriCardsApiRecordMap,
  Map<BandoriCardServer, BandoriCardsApiRecordMap>
>();

export type BandoriCardsApiRecordMap = BandoriSnapshotRecordMap;
export type BandoriCardApiRecord = BandoriSnapshotRecord;

const readCardsApiPointer = createBandoriSnapshotPointerCache({
  pointerKey: CARDS_API_POINTER_KEY,
  pointerTtlMs: CARDS_API_POINTER_TTL_MS,
  pointerReadLabel: "Bandori cards API pointer",
  parse: parseCardsApiPointer,
});

const readCardsApiRecordMap = createBandoriSnapshotRecordMapCache({
  maxEntries: 1,
  maxCompressedBytes: MAX_CARDS_API_COMPRESSED_BYTES,
  maxDecompressedBytes: MAX_CARDS_API_DECOMPRESSED_BYTES,
  maxRecords: MAX_CARDS_API_RECORDS,
  datasetLabel: "Bandori cards API dataset",
  validateRecord: (_cacheKey, recordId, record) => {
    validateBandoriCardServerExtensions(
      record,
      `Bandori cards API record ${recordId}`,
      { dataset: "cards", recordId },
    );
  },
});

const readCardDetailsShard = createBandoriSnapshotRecordMapCache({
  maxEntries: CARD_DETAIL_CACHE_ENTRIES,
  maxCompressedBytes: MAX_CARD_DETAILS_SHARD_COMPRESSED_BYTES,
  maxDecompressedBytes: MAX_CARD_DETAILS_SHARD_DECOMPRESSED_BYTES,
  maxRecords: CARD_DETAIL_RANGE_SIZE,
  datasetLabel: "Bandori cardDetails API shard",
  validateRecord: (shardKey, recordId, record) => {
    if (cardApiDetailShardKey(recordId) !== shardKey) {
      throw new Error(`Bandori cardDetails API shard contains an out-of-range record: ${recordId}`);
    }
    validateBandoriCardServerExtensions(
      record,
      `Bandori cardDetails API record ${recordId}`,
      { dataset: "cardDetails", recordId },
    );
  },
});

function getCardsApiObjectSource() {
  return createBandoriSnapshotObjectSource({
    localStoreEnvironmentName: "BANDORI_CARDS_API_LOCAL_STORE_ROOT",
    privateR2ReadLabel: "Bandori private cards R2 read",
    localObjectLabel: "Bandori local cards API object",
  });
}

export async function readBandoriCardsApiDataset(): Promise<BandoriCardsApiRecordMap> {
  const source = getCardsApiObjectSource();
  const pointer = await readCardsApiPointer(source);
  return readCardsApiRecordMap(source, "cards", pointer.datasets.cards);
}

export async function readBandoriCardsApiDatasetForServer(
  server: BandoriCardServer,
): Promise<BandoriCardsApiRecordMap> {
  const cards = await readBandoriCardsApiDataset();
  let byServer = resolvedCardsApiDatasets.get(cards);
  if (!byServer) {
    byServer = new Map();
    resolvedCardsApiDatasets.set(cards, byServer);
  }
  const cached = byServer.get(server);
  if (cached) {
    return cached;
  }

  const resolved = materializeBandoriCardMapForServer(
    cards,
    getBandoriCardServerIndex(server),
  );
  byServer.set(server, resolved);
  return resolved;
}

export async function readBandoriCardApiDetail(
  cardId: string,
): Promise<BandoriCardApiRecord | null> {
  if (!isCardApiDetailIdSupported(cardId)) {
    return null;
  }
  const shardKey = cardApiDetailShardKey(cardId);
  const source = getCardsApiObjectSource();
  const pointer = await readCardsApiPointer(source);
  const descriptor = pointer.datasets.cardDetails.shards[shardKey];
  if (!descriptor) {
    return null;
  }

  const details = await readCardDetailsShard(source, shardKey, descriptor);
  return Object.hasOwn(details, cardId) ? details[cardId] : null;
}

export async function readBandoriCardApiDetailForServer(
  cardId: string,
  server: BandoriCardServer,
): Promise<BandoriCardApiRecord | null> {
  const detail = await readBandoriCardApiDetail(cardId);
  return detail
    ? materializeBandoriCardForServer(detail, getBandoriCardServerIndex(server))
    : null;
}
