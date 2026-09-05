import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BANDORI_SONG_META_KEY,
  parseBandoriSongMetaArtifact,
} from "../src/lib/bandori-song-meta-server.ts";

const validArtifact = {
  schemaVersion: 2,
  updatedAt: "2026-09-04T00:00:00Z",
  musicIndexSha256: "a".repeat(64),
  durations: [5, 5.5],
  songs: {
    "1": {
      "3": {
        total: [3.5, 4.5],
        covered: {
          "5": [1, 2],
          "5.5": [1.5, 2.5],
        },
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
  delete invalid.songs["1"]["3"].covered["5.5"];
  assert.throws(
    () => parseBandoriSongMetaArtifact(invalid),
    /difficulty is invalid/u,
  );
});

test("song meta parser rejects the former four-component schema", () => {
  const invalid = structuredClone(validArtifact);
  invalid.schemaVersion = 1;
  invalid.songs["1"]["3"] = {
    "5": [2.5, 1, 2.5, 2],
    "5.5": [2, 1.5, 2, 2.5],
  };
  assert.throws(
    () => parseBandoriSongMetaArtifact(invalid),
    /artifact is invalid/u,
  );
});

test("release audit rejects matching legacy Meta responses without network access", async (context) => {
  const legacy = structuredClone(validArtifact);
  legacy.schemaVersion = 1;
  legacy.songs["1"]["3"] = {
    "5": [2.5, 1, 2.5, 2],
    "5.5": [2, 1.5, 2, 2.5],
  };
  context.mock.method(globalThis, "fetch", async (url) => {
    const path = new URL(url).pathname;
    const body = path === "/bandori/music/meta.json" ? legacy : {
      success: true,
      data: path === "/api/bandori/master/music/meta"
        ? { durations: legacy.durations, songs: legacy.songs }
        : {},
    };
    return new Response(JSON.stringify(body));
  });

  await assert.rejects(
    import("../scripts/audit-bandori-contracts.mjs"),
    /Bandori song meta artifact is invalid/u,
  );
});

test("song meta parser rejects covered coefficients above the chart total", () => {
  const invalid = structuredClone(validArtifact);
  invalid.songs["1"]["3"].covered["5"][0] = 4;
  assert.throws(
    () => parseBandoriSongMetaArtifact(invalid),
    /covered coefficients exceed total/u,
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
  assert.match(reader, /MAX_BANDORI_SONG_META_BYTES = 8 \* 1024 \* 1024/u);
  assert.match(
    reader,
    /fetchBandoriPublicAssetIndexJson\(\s*BANDORI_SONG_META_KEY,\s*MAX_BANDORI_SONG_META_BYTES/u,
  );
  assert.match(reader, /fetchBandoriPublicAssetJson\(/u);
  assert.match(reader, /artifact\.musicIndexSha256/u);
  assert.doesNotMatch(reader, /cdn\.hhwx\.org/u);
});
