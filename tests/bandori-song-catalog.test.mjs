import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_SONG_BAND_FILTERS,
  BANDORI_SONG_TYPES,
  buildBandoriSongCatalog,
  filterBandoriSongCatalog,
  parseBandoriSongsPageFilter,
} from "../src/lib/bandori/songs/catalog.ts";

const regional = (value) => [value, value, value, value];

function song({
  bandId,
  tag,
  title,
  publishedAt = regional(1_000),
  closedAt = regional(null),
  difficulty,
}) {
  return {
    bandId,
    tag,
    musicTitle: regional(title),
    bandName: regional(`Band ${bandId}`),
    publishedAt,
    closedAt,
    difficulty,
  };
}

const music = {
  "1": song({
    bandId: 1,
    tag: "normal",
    title: "Alpha",
    difficulty: {
      "0": { playLevel: 7 },
      "3": { playLevel: 26 },
    },
  }),
  "2": song({
    bandId: 46,
    tag: "anime",
    title: "Beta",
    difficulty: {
      "3": { playLevel: 28 },
      "4": { playLevel: 30, publishedAt: [3_000, 1_000, 1_000, 1_000] },
    },
  }),
  "3": song({
    bandId: 5,
    tag: "tie_up",
    title: "Gamma",
    difficulty: { "3": { playLevel: 31 } },
    publishedAt: regional(3_000),
  }),
};

const buildOptions = {
  now: 2_000,
  unknownTitle: (songId) => `Song ${songId}`,
  unknownBand: "Unknown band",
};

test("song catalog maps the three supported game categories and main-band fallback", () => {
  const catalog = buildBandoriSongCatalog(music, 3, buildOptions);

  assert.deepEqual(catalog.map((entry) => [entry.songId, entry.type, entry.bandFilter]), [
    [1, "original", 1],
    [2, "cover", "other"],
  ]);
  assert.deepEqual(catalog[1].difficultyLevels, { expert: 28, special: 30 });
});

test("song catalog uses regional release windows for songs and difficulties", () => {
  const jpCatalog = buildBandoriSongCatalog(music, 0, buildOptions);
  const cnCatalog = buildBandoriSongCatalog(music, 3, buildOptions);

  assert.deepEqual(jpCatalog.find((entry) => entry.songId === 2)?.difficultyLevels, {
    expert: 28,
  });
  assert.deepEqual(cnCatalog.find((entry) => entry.songId === 2)?.difficultyLevels, {
    expert: 28,
    special: 30,
  });
  assert.equal(cnCatalog.some((entry) => entry.songId === 3), false);
});

test("song filtering combines band, type, difficulty, and level without regional levels", () => {
  const catalog = buildBandoriSongCatalog(music, 3, buildOptions);
  const result = filterBandoriSongCatalog(catalog, {
    query: "beta",
    bands: ["other"],
    types: ["cover"],
    difficulty: "expert",
    minLevel: 27,
    maxLevel: 29,
    sortBy: "level",
    sortDirection: "asc",
  });

  assert.deepEqual(result.map((entry) => entry.songId), [2]);
});

test("song list query parsing keeps defaults compact and rejects unknown values", () => {
  const defaults = parseBandoriSongsPageFilter(new URLSearchParams());
  assert.deepEqual(defaults.bands, BANDORI_SONG_BAND_FILTERS);
  assert.deepEqual(defaults.types, BANDORI_SONG_TYPES);
  assert.equal(defaults.difficulty, "all");
  assert.equal(defaults.sortBy, "release");
  assert.equal(defaults.sortDirection, "desc");

  const parsed = parseBandoriSongsPageFilter(new URLSearchParams(
    "q=hello&bands=1,1,other,999&types=cover,cover,invalid&difficulty=special&minLevel=25&maxLevel=x&sort=level&direction=asc",
  ));
  assert.deepEqual(parsed, {
    query: "hello",
    bands: [1, "other"],
    types: ["cover"],
    difficulty: "special",
    minLevel: 25,
    maxLevel: null,
    sortBy: "level",
    sortDirection: "asc",
  });
});
