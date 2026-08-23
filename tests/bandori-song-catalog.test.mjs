import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_SONG_BAND_FILTERS,
  BANDORI_SONG_TYPES,
  buildBandoriSongCatalog,
  filterBandoriSongCatalog,
  parseBandoriSongsPageFilter,
} from "../src/lib/bandori/songs/catalog.ts";
import { BANDORI_SERVERS } from "../src/lib/bandori-server.ts";

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
    publishedAt: [900, 1_100, 1_200, 1_300],
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
  "4": song({
    bandId: 5,
    tag: "tie_up",
    title: "Delta",
    difficulty: { "3": { playLevel: 29 } },
    publishedAt: [1_000, null, null, null],
    closedAt: regional(1_500),
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
    [3, "extra", 5],
    [4, "extra", 5],
  ]);
  assert.deepEqual(catalog[1].difficultyLevels, { expert: 28, special: 30 });
  assert.deepEqual(catalog[1].publishedAtByServer, [900, 1_100, 1_200, 1_300]);
});

test("song catalog keeps historical and future songs while preserving regional slots", () => {
  const jpTextCatalog = buildBandoriSongCatalog(music, 0, buildOptions);
  const cnTextCatalog = buildBandoriSongCatalog(music, 3, buildOptions);

  assert.deepEqual(jpTextCatalog.find((entry) => entry.songId === 2)?.difficultyLevels, {
    expert: 28,
    special: 30,
  });
  assert.deepEqual(
    jpTextCatalog.map((entry) => entry.songId),
    cnTextCatalog.map((entry) => entry.songId),
  );
  assert.deepEqual(
    cnTextCatalog.find((entry) => entry.songId === 4)?.publishedAtByServer,
    [1_000, null, null, null],
  );
  assert.deepEqual(
    cnTextCatalog.find((entry) => entry.songId === 3)?.publishedAtByServer,
    regional(3_000),
  );
  assert.equal(cnTextCatalog.some((entry) => entry.songId === 4), true);
});

test("song filtering combines band, type, difficulty, and level without regional levels", () => {
  const catalog = buildBandoriSongCatalog(music, 3, buildOptions);
  const result = filterBandoriSongCatalog(catalog, {
    query: "beta",
    servers: [3],
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

test("song release sorting follows the selected regional release slot", () => {
  const catalog = buildBandoriSongCatalog(music, 3, buildOptions);
  const baseFilter = {
    query: "",
    servers: [...BANDORI_SERVERS],
    bands: BANDORI_SONG_BAND_FILTERS,
    types: BANDORI_SONG_TYPES,
    difficulty: "expert",
    minLevel: null,
    maxLevel: null,
    sortDirection: "asc",
  };

  assert.deepEqual(filterBandoriSongCatalog(catalog, {
    ...baseFilter,
    sortBy: "release_jp",
  }).map((entry) => entry.songId), [2, 1, 4, 3]);
  assert.deepEqual(filterBandoriSongCatalog(catalog, {
    ...baseFilter,
    sortBy: "release_cn",
  }).map((entry) => entry.songId), [1, 2, 3, 4]);
});

test("song availability filtering matches any selected server", () => {
  const catalog = buildBandoriSongCatalog(music, 3, buildOptions);
  const baseFilter = {
    query: "",
    bands: BANDORI_SONG_BAND_FILTERS,
    types: BANDORI_SONG_TYPES,
    difficulty: "expert",
    minLevel: null,
    maxLevel: null,
    sortBy: "id",
    sortDirection: "asc",
  };

  assert.deepEqual(filterBandoriSongCatalog(catalog, {
    ...baseFilter,
    servers: [3],
  }).map((entry) => entry.songId), [1, 2, 3]);
  assert.deepEqual(filterBandoriSongCatalog(catalog, {
    ...baseFilter,
    servers: [0],
  }).map((entry) => entry.songId), [1, 2, 3, 4]);
  assert.deepEqual(filterBandoriSongCatalog(catalog, {
    ...baseFilter,
    servers: [],
  }), []);
});

test("song list query parsing keeps defaults compact and rejects unknown values", () => {
  const defaults = parseBandoriSongsPageFilter(new URLSearchParams());
  assert.deepEqual(defaults.servers, BANDORI_SERVERS);
  assert.deepEqual(defaults.bands, BANDORI_SONG_BAND_FILTERS);
  assert.deepEqual(defaults.types, BANDORI_SONG_TYPES);
  assert.equal(defaults.difficulty, "expert");
  assert.equal(defaults.sortBy, "id");
  assert.equal(defaults.sortDirection, "desc");

  const parsed = parseBandoriSongsPageFilter(new URLSearchParams(
    "q=hello&available=jp,cn,cn,invalid&bands=1,1,other,999&types=cover,cover,invalid&difficulty=special&minLevel=25&maxLevel=x&sort=level&direction=asc",
  ));
  assert.deepEqual(parsed, {
    query: "hello",
    servers: [0, 3],
    bands: [1, "other"],
    types: ["cover"],
    difficulty: "special",
    minLevel: 25,
    maxLevel: null,
    sortBy: "level",
    sortDirection: "asc",
  });
});
