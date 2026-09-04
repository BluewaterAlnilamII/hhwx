import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BANDORI_SONG_META_KEY,
  parseBandoriSongMetaArtifact,
} from "../src/lib/bandori-song-meta-server.ts";

const validArtifact = {
  schemaVersion: 1,
  updatedAt: "2026-09-04T00:00:00Z",
  musicIndexSha256: "a".repeat(64),
  durations: [5, 5.5],
  songs: {
    "1": {
      "3": {
        "5": [2.5, 1, 2.5, 2],
        "5.5": [2, 1.5, 2, 2.5],
      },
    },
  },
};

test("song meta parser projects the compact ranking inputs", () => {
  assert.equal(BANDORI_SONG_META_KEY, "bandori/music/meta.json");
  assert.deepEqual(parseBandoriSongMetaArtifact(validArtifact), {
    musicIndexSha256: "a".repeat(64),
    durations: [5, 5.5],
    songs: validArtifact.songs,
  });
});

test("song meta parser requires the exact music index identity", () => {
  const invalid = structuredClone(validArtifact);
  invalid.musicIndexSha256 = "not-a-sha256";
  assert.throws(
    () => parseBandoriSongMetaArtifact(invalid),
    /artifact is invalid/u,
  );
});

test("song meta parser rejects incomplete duration coverage", () => {
  const invalid = structuredClone(validArtifact);
  delete invalid.songs["1"]["3"]["5.5"];
  assert.throws(
    () => parseBandoriSongMetaArtifact(invalid),
    /difficulty is invalid/u,
  );
});

test("song meta route is a thin signed-R2-backed endpoint", async () => {
  const route = await readFile(
    new URL("../src/app/api/bandori/master/music/meta/route.ts", import.meta.url),
    "utf8",
  );
  const reader = await readFile(
    new URL("../src/lib/bandori-song-meta-server.ts", import.meta.url),
    "utf8",
  );

  assert.match(route, /rejectUnsupportedBandoriMasterQuery/u);
  assert.match(route, /jsonSuccess\(await readBandoriSongMetaDataset\(\)/u);
  assert.match(reader, /fetchBandoriPublicAssetIndexJson\(BANDORI_SONG_META_KEY\)/u);
  assert.match(reader, /fetchBandoriPublicAssetJson\(/u);
  assert.match(reader, /artifact\.musicIndexSha256/u);
  assert.doesNotMatch(reader, /cdn\.hhwx\.org/u);
});
