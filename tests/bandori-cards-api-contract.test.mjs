import assert from "node:assert/strict";
import test from "node:test";

import {
  CARD_DETAIL_LAYOUT,
  CARD_DETAIL_RANGE_SIZE,
  CARDS_API_PACK_PREFIX,
  CARDS_API_POINTER_KEY,
  CARDS_API_POINTER_SCHEMA_VERSION,
  MAX_CARDS_API_COMPRESSED_BYTES,
  cardApiDetailShardKey,
  parseCardsApiPointer,
} from "../src/lib/bandori/cards/api-contract.ts";

const semanticSha256 = "a".repeat(64);
const compressedSha256 = "b".repeat(64);

function descriptor(key, recordCount = 2) {
  return {
    key,
    semanticSha256,
    compressedSha256,
    compressedSize: 123,
    recordCount,
  };
}

function pointer() {
  const shardKey = "card00000";
  return {
    schemaVersion: CARDS_API_POINTER_SCHEMA_VERSION,
    generation: 4,
    updatedAt: "2026-07-14T00:00:00Z",
    datasets: {
      cards: descriptor(
        `${CARDS_API_PACK_PREFIX}/packs/cards/${compressedSha256}.json.gz`,
      ),
      cardDetails: {
        layout: CARD_DETAIL_LAYOUT,
        rangeSize: CARD_DETAIL_RANGE_SIZE,
        recordCount: 2,
        shards: {
          [shardKey]: descriptor(
            `${CARDS_API_PACK_PREFIX}/packs/cardDetails/${shardKey}/${compressedSha256}.json.gz`,
          ),
        },
      },
    },
  };
}

test("cards use one private v1 pointer and fixed content-addressed pack paths", () => {
  assert.equal(CARDS_API_POINTER_KEY, "bandori/master/cards-v1/api/active.json");
  assert.equal(parseCardsApiPointer(pointer()).generation, 4);
  assert.throws(
    () => parseCardsApiPointer({ ...pointer(), schemaVersion: "bandori-cards-api-pointer-v0" }),
    /Unsupported Bandori cards API pointer schema/u,
  );

  const redirected = pointer();
  redirected.datasets.cards.key = "untrusted/cards.json.gz";
  assert.throws(() => parseCardsApiPointer(redirected), /invalid cards pack key/u);
});

test("card detail shards follow the native 50-ID range boundary", () => {
  assert.equal(cardApiDetailShardKey("1"), "card00000");
  assert.equal(cardApiDetailShardKey("49"), "card00000");
  assert.equal(cardApiDetailShardKey("50"), "card00001");
  assert.equal(cardApiDetailShardKey("10048"), "card00200");
  assert.equal(cardApiDetailShardKey("4999999"), "card99999");
  assert.throws(() => cardApiDetailShardKey("0"), /positive integer/u);
  assert.throws(() => cardApiDetailShardKey("01"), /positive integer/u);
  assert.throws(() => cardApiDetailShardKey("5000000"), /outside the supported range/u);
  assert.throws(() => cardApiDetailShardKey("9007199254740993"), /outside the supported range/u);
});

test("card detail layout and aggregate counts are strict", () => {
  const wrongRange = pointer();
  wrongRange.datasets.cardDetails.rangeSize = 64;
  assert.throws(() => parseCardsApiPointer(wrongRange), /invalid cardDetails layout/u);

  const inconsistentShardCount = pointer();
  inconsistentShardCount.datasets.cardDetails.recordCount = 3;
  assert.throws(
    () => parseCardsApiPointer(inconsistentShardCount),
    /inconsistent cardDetails record count/u,
  );

  const inconsistentDatasetCount = pointer();
  inconsistentDatasetCount.datasets.cards.recordCount = 3;
  assert.throws(
    () => parseCardsApiPointer(inconsistentDatasetCount),
    /inconsistent cards and cardDetails counts/u,
  );
});

test("cards pointer rejects oversized packs and shard redirection", () => {
  const oversized = pointer();
  oversized.datasets.cards.compressedSize = MAX_CARDS_API_COMPRESSED_BYTES + 1;
  assert.throws(() => parseCardsApiPointer(oversized), /unsupported cards compressed size/u);

  const redirected = pointer();
  redirected.datasets.cardDetails.shards.card00000.key = (
    `${CARDS_API_PACK_PREFIX}/packs/cardDetails/card00001/${compressedSha256}.json.gz`
  );
  assert.throws(() => parseCardsApiPointer(redirected), /invalid cardDetails shard/u);
});
