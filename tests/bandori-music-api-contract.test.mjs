import assert from "node:assert/strict";
import test from "node:test";

import {
  MUSIC_API_PACK_PREFIX,
  MUSIC_API_POINTER_KEY,
  MUSIC_API_POINTER_SCHEMA_VERSION,
  MUSIC_DETAIL_LAYOUT,
  MUSIC_DETAIL_RANGE_SIZE,
  MAX_MUSIC_API_COMPRESSED_BYTES,
  musicApiDetailShardKey,
  parseMusicApiPointer,
} from "../src/lib/bandori-music-api-contract.ts";

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
  const shardKey = "music00000";
  return {
    schemaVersion: MUSIC_API_POINTER_SCHEMA_VERSION,
    generation: 4,
    updatedAt: "2026-07-28T00:00:00Z",
    datasets: {
      music: descriptor(`${MUSIC_API_PACK_PREFIX}/packs/music/${compressedSha256}.json.gz`),
      musicDetails: {
        layout: MUSIC_DETAIL_LAYOUT,
        rangeSize: MUSIC_DETAIL_RANGE_SIZE,
        recordCount: 2,
        shards: {
          [shardKey]: descriptor(
            `${MUSIC_API_PACK_PREFIX}/packs/musicDetails/${shardKey}/${compressedSha256}.json.gz`,
          ),
        },
      },
    },
  };
}

test("Music uses the unified private pointer and content-addressed pack paths", () => {
  assert.equal(MUSIC_API_POINTER_KEY, "bandori/master/music/api/active.json");
  assert.equal(parseMusicApiPointer(pointer()).generation, 4);
  assert.throws(
    () => parseMusicApiPointer({ ...pointer(), schemaVersion: "bandori-music-api-pointer-v0" }),
    /Unsupported Bandori Music API pointer schema/u,
  );
  const redirected = pointer();
  redirected.datasets.music.key = "untrusted/music.json.gz";
  assert.throws(() => parseMusicApiPointer(redirected), /invalid music pack key/u);
});

test("Music detail shards follow fixed 50-ID ranges", () => {
  assert.equal(musicApiDetailShardKey("1"), "music00000");
  assert.equal(musicApiDetailShardKey("49"), "music00000");
  assert.equal(musicApiDetailShardKey("50"), "music00001");
  assert.equal(musicApiDetailShardKey("10001"), "music00200");
  assert.throws(() => musicApiDetailShardKey("0"), /outside the supported range/u);
  assert.throws(() => musicApiDetailShardKey("01"), /outside the supported range/u);
});

test("Music pointer rejects inconsistent counts and oversized packs", () => {
  const inconsistent = pointer();
  inconsistent.datasets.musicDetails.recordCount = 3;
  assert.throws(
    () => parseMusicApiPointer(inconsistent),
    /inconsistent musicDetails record count/u,
  );
  const oversized = pointer();
  oversized.datasets.music.compressedSize = MAX_MUSIC_API_COMPRESSED_BYTES + 1;
  assert.throws(() => parseMusicApiPointer(oversized), /unsupported music compressed size/u);
});
