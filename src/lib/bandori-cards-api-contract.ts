const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CARD_DETAIL_SHARD_PATTERN = /^card\d{5}$/u;

export const CARDS_API_POINTER_KEY = "bandori/master/cards-v1/api/active.json";
export const CARDS_API_POINTER_SCHEMA_VERSION = "bandori-cards-api-pointer-v1";
export const CARDS_API_PACK_PREFIX = "bandori/master/cards-v1/api";
export const CARD_DETAIL_LAYOUT = "numeric-id-range";
export const CARD_DETAIL_RANGE_SIZE = 50;
export const MAX_CARDS_API_COMPRESSED_BYTES = 4 * 1024 * 1024;
export const MAX_CARDS_API_DECOMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_CARD_DETAILS_SHARD_COMPRESSED_BYTES = 1024 * 1024;
export const MAX_CARD_DETAILS_SHARD_DECOMPRESSED_BYTES = 4 * 1024 * 1024;
export const MAX_CARDS_API_RECORDS = 10_000;
export const MAX_CARD_DETAIL_SHARDS = 1_000;

export type CardsApiPackDescriptor = {
  key: string;
  semanticSha256: string;
  compressedSha256: string;
  compressedSize: number;
  recordCount: number;
};

export type CardDetailsApiDataset = {
  layout: typeof CARD_DETAIL_LAYOUT;
  rangeSize: typeof CARD_DETAIL_RANGE_SIZE;
  recordCount: number;
  shards: Record<string, CardsApiPackDescriptor>;
};

export type CardsApiPointer = {
  generation: number;
  datasets: {
    cards: CardsApiPackDescriptor;
    cardDetails: CardDetailsApiDataset;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    throw new Error(`Bandori cards API pointer has an invalid ${label}`);
  }
  return value;
}

function validateNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`Bandori cards API pointer has an invalid ${label}`);
  }
  return value as number;
}

function parsePackDescriptor(
  value: unknown,
  options: {
    label: string;
    expectedKey: (compressedSha256: string) => string;
    maxCompressedBytes: number;
    maxRecords: number;
  },
): CardsApiPackDescriptor {
  if (!isRecord(value)) {
    throw new Error(`Bandori cards API pointer is missing ${options.label}`);
  }
  const semanticSha256 = validateSha256(value.semanticSha256, `${options.label} semantic SHA-256`);
  const compressedSha256 = validateSha256(
    value.compressedSha256,
    `${options.label} compressed SHA-256`,
  );
  const expectedKey = options.expectedKey(compressedSha256);
  if (value.key !== expectedKey) {
    throw new Error(`Bandori cards API pointer has an invalid ${options.label} pack key`);
  }
  const compressedSize = validateNonNegativeInteger(
    value.compressedSize,
    `${options.label} compressed size`,
  );
  if (compressedSize < 1 || compressedSize > options.maxCompressedBytes) {
    throw new Error(`Bandori cards API pointer has an unsupported ${options.label} compressed size`);
  }
  const recordCount = validateNonNegativeInteger(
    value.recordCount,
    `${options.label} record count`,
  );
  if (recordCount > options.maxRecords) {
    throw new Error(`Bandori cards API pointer has too many ${options.label} records`);
  }
  return {
    key: expectedKey,
    semanticSha256,
    compressedSha256,
    compressedSize,
    recordCount,
  };
}

function parseCardDetailsDataset(value: unknown): CardDetailsApiDataset {
  if (
    !isRecord(value)
    || value.layout !== CARD_DETAIL_LAYOUT
    || value.rangeSize !== CARD_DETAIL_RANGE_SIZE
    || !isRecord(value.shards)
  ) {
    throw new Error("Bandori cards API pointer has an invalid cardDetails layout");
  }
  const recordCount = validateNonNegativeInteger(
    value.recordCount,
    "cardDetails record count",
  );
  if (recordCount > MAX_CARDS_API_RECORDS) {
    throw new Error("Bandori cards API pointer has too many cardDetails records");
  }

  const shardEntries = Object.entries(value.shards);
  if (shardEntries.length > MAX_CARD_DETAIL_SHARDS) {
    throw new Error("Bandori cards API pointer has too many cardDetails shards");
  }
  const shards: Record<string, CardsApiPackDescriptor> = {};
  let shardRecordCount = 0;
  for (const [shardKey, descriptorValue] of shardEntries) {
    if (!CARD_DETAIL_SHARD_PATTERN.test(shardKey)) {
      throw new Error(`Bandori cards API pointer has an invalid cardDetails shard: ${shardKey}`);
    }
    const descriptor = parsePackDescriptor(descriptorValue, {
      label: `cardDetails shard ${shardKey}`,
      expectedKey: (compressedSha256) => (
        `${CARDS_API_PACK_PREFIX}/packs/cardDetails/${shardKey}/${compressedSha256}.json.gz`
      ),
      maxCompressedBytes: MAX_CARD_DETAILS_SHARD_COMPRESSED_BYTES,
      maxRecords: CARD_DETAIL_RANGE_SIZE,
    });
    if (descriptor.recordCount < 1) {
      throw new Error(`Bandori cards API pointer has an empty cardDetails shard: ${shardKey}`);
    }
    shardRecordCount += descriptor.recordCount;
    shards[shardKey] = descriptor;
  }
  if (shardRecordCount !== recordCount) {
    throw new Error("Bandori cards API pointer has an inconsistent cardDetails record count");
  }
  return {
    layout: CARD_DETAIL_LAYOUT,
    rangeSize: CARD_DETAIL_RANGE_SIZE,
    recordCount,
    shards,
  };
}

export function parseCardsApiPointer(value: unknown): CardsApiPointer {
  if (!isRecord(value) || value.schemaVersion !== CARDS_API_POINTER_SCHEMA_VERSION) {
    throw new Error("Unsupported Bandori cards API pointer schema");
  }
  const generation = validateNonNegativeInteger(value.generation, "generation");
  if (generation < 1 || !isRecord(value.datasets)) {
    throw new Error("Bandori cards API pointer is incomplete");
  }
  const cards = parsePackDescriptor(value.datasets.cards, {
    label: "cards",
    expectedKey: (compressedSha256) => (
      `${CARDS_API_PACK_PREFIX}/packs/cards/${compressedSha256}.json.gz`
    ),
    maxCompressedBytes: MAX_CARDS_API_COMPRESSED_BYTES,
    maxRecords: MAX_CARDS_API_RECORDS,
  });
  const cardDetails = parseCardDetailsDataset(value.datasets.cardDetails);
  if (cards.recordCount !== cardDetails.recordCount) {
    throw new Error("Bandori cards API pointer has inconsistent cards and cardDetails counts");
  }
  return {
    generation,
    datasets: { cards, cardDetails },
  };
}

export function cardApiDetailShardKey(cardId: string): string {
  if (!/^[1-9]\d*$/u.test(cardId)) {
    throw new Error("Bandori card ID must be a positive integer");
  }
  if (!isCardApiDetailIdSupported(cardId)) {
    throw new Error("Bandori card ID is outside the supported range");
  }
  const numericCardId = Number(cardId);
  const shardNumber = Math.floor(numericCardId / CARD_DETAIL_RANGE_SIZE);
  return `card${String(shardNumber).padStart(5, "0")}`;
}

export function isCardApiDetailIdSupported(cardId: string): boolean {
  if (!/^[1-9]\d*$/u.test(cardId)) {
    return false;
  }
  const numericCardId = Number(cardId);
  if (!Number.isSafeInteger(numericCardId)) {
    return false;
  }
  const shardNumber = Math.floor(numericCardId / CARD_DETAIL_RANGE_SIZE);
  return shardNumber <= 99_999;
}
