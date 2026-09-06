import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_SONG_BAND_FILTERS,
  BANDORI_SONG_DIFFICULTY_FILTERS,
  BANDORI_SONG_TYPES,
  buildBandoriSongCatalog,
  filterBandoriSongCatalog,
  parseBandoriSongsPageFilter,
} from "../src/lib/bandori/songs/catalog.ts";
import { BANDORI_SERVERS } from "../src/lib/bandori-server.ts";
import { BANDORI_SEARCH_BAND_ALIASES, BANDORI_SEARCH_SERVER_ALIASES } from "../src/lib/bandori/search.ts";

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
    difficulties: ["expert"],
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
    difficulties: ["expert"],
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
    difficulties: ["expert"],
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
  assert.deepEqual(defaults.difficulties, BANDORI_SONG_DIFFICULTY_FILTERS);
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
    difficulties: ["special"],
    minLevel: 25,
    maxLevel: null,
    sortBy: "level",
    sortDirection: "asc",
  });
  for (const [raw, expected] of [
    ["expert", ["expert"]],
    ["special,hard,hard,invalid", ["hard", "special"]],
    ["", []],
  ]) {
    assert.deepEqual(parseBandoriSongsPageFilter(new URLSearchParams({ difficulty: raw })).difficulties, expected);
  }
});

test("difficulty and level searches share one selected chart and intersect other filters", () => {
  const catalog = buildBandoriSongCatalog({
    ...music,
    "5": song({ bandId: 1, tag: "normal", title: "Split levels", difficulty: { "2": { playLevel: 25 }, "3": { playLevel: 28 } } }),
    "6": song({ bandId: 1, tag: "normal", title: "高等级 ハイ", difficulty: { "2": { playLevel: 27 }, "4": { playLevel: 41, publishedAt: [1000, null, null, null] } } }),
    "7": song({ bandId: 1, tag: "normal", title: "Hard only", difficulty: { "2": { playLevel: 24 } } }),
    "26": song({ bandId: 1, tag: "normal", title: "ID match", difficulty: { "0": { playLevel: 7 } } }),
  }, 3, buildOptions);
  const defaults = { ...parseBandoriSongsPageFilter(new URLSearchParams()), sortDirection: "asc" };
  const find = (query, patch = {}) => filterBandoriSongCatalog(catalog, { ...defaults, query, ...patch }).map((entry) => entry.songId);

  for (const [query, expected] of [
    ["hd", [5, 6, 7]], ["HARD", [5, 6, 7]], ["困难", [5, 6, 7]], ["ハード", [5, 6, 7]],
    ["ex", [1, 2, 3, 4, 5]], ["ＳＰ", [2, 6]], ["ez", [1, 26]], ["nm", []],
    ["hd+", [1, 2, 3, 4, 5, 6, 7]], [">=hd", [1, 2, 3, 4, 5, 6, 7]],
    [">hd", [1, 2, 3, 4, 5, 6]], ["hd-", [1, 5, 6, 7, 26]], ["<=hd", [1, 5, 6, 7, 26]],
    ["<hd", [1, 26]], [">sp", []], ["<easy", []], [">hd+", []],
    ["hd >=26", [6]], ["26+ 27-", [1, 6]], ["hd >25 <28", [6]],
    ["26", [1, 26]], ["#26", [26]], ["#2abc", []], ["41", [6]], [">35", [6]],
    ["高等级 ハイ", [6]],
  ]) assert.deepEqual(find(query), expected, query);

  assert.deepEqual(find("", { difficulties: [] }), []);
  assert.deepEqual(find("", { difficulties: ["hard", "special"] }), [2, 5, 6, 7]);
  assert.deepEqual(find("sp", { difficulties: ["expert"] }), []);
  assert.deepEqual(find("", { difficulties: ["hard", "expert"], minLevel: 26, maxLevel: 27 }), [1, 6]);
  assert.deepEqual(find("hd", { minLevel: 26, maxLevel: 27 }), [6]);
  assert.deepEqual(find("sp #6", { servers: [3] }), [6]); // CN song, JP-only SPECIAL chart.
  assert.deepEqual(find("hd", { bands: [5] }), []);
  const levelSorted = find("hd", { sortBy: "level" });
  assert.deepEqual(levelSorted, [7, 5, 6]);
  assert.deepEqual([...levelSorted].sort((a, b) => a - b), find("hd"));
});

test("song keywords reuse reviewed aliases, intersect filters, and keep text multilingual", () => {
  const defaults = { ...parseBandoriSongsPageFilter(new URLSearchParams()), sortDirection: "asc" };
  const catalog = buildBandoriSongCatalog(music, 3, buildOptions);
  const find = (query, patch = {}, entries = catalog) => filterBandoriSongCatalog(entries, { ...defaults, query, ...patch }).map((entry) => entry.songId);
  for (const [aliases, expected] of [
    [["og", "original", "原创", "原創", "オリジナル"], [1]],
    [["cv", "cover", "anime", "翻唱", "カバー"], [2]],
    [["extra", "エキストラ"], [3, 4]],
    [["other", "others", "其他"], [2]],
  ]) for (const alias of aliases) assert.deepEqual(find(alias), expected, alias);
  for (const [server, aliases] of BANDORI_SEARCH_SERVER_ALIASES.entries()) {
    for (const alias of aliases) assert.deepEqual(find(alias), server === 0 ? [1, 2, 3, 4] : [1, 2, 3], alias);
  }
  assert.deepEqual(find("r extra jp"), [3, 4]);
  assert.deepEqual(find("jp en"), [1, 2, 3]);
  assert.deepEqual(find("en #4"), []);
  assert.deepEqual(find("r", { bands: [1] }), []);
  assert.deepEqual(find("cover", { types: ["original"] }), []);
  assert.deepEqual(find("en", { sortBy: "release_cn", sortDirection: "desc" }), [3, 2, 1]);
  assert.equal(defaults.sortBy, "id");
  assert.deepEqual(defaults.servers, BANDORI_SERVERS);

  const bands = buildBandoriSongCatalog(Object.fromEntries(Object.keys(BANDORI_SEARCH_BAND_ALIASES).map((id) => [id, song({
    bandId: Number(id), tag: "normal", title: "Unrelated title", difficulty: { "3": { playLevel: 26 } },
  })])), 3, buildOptions);
  for (const [id, aliases] of Object.entries(BANDORI_SEARCH_BAND_ALIASES)) {
    for (const alias of aliases) assert.deepEqual(find(`${alias} ex >=26`, {}, bands), [Number(id)], alias);
  }
  for (const preferredServer of BANDORI_SERVERS) {
    const multilingual = buildBandoriSongCatalog({
      90: {
        ...music[1],
        musicTitle: ["日本語", "Starlight", "星光", "星空"],
        bandName: ["歌い手", "Singer", "演唱者", "歌手"],
      },
    }, preferredServer, buildOptions);
    for (const query of ["日本語", "ＳＴＡＲＬＩＧＨＴ", "星光", "星空", "歌い手", "singer", "演唱者", "歌手", "星光 singer"]) {
      assert.deepEqual(find(query, {}, multilingual), [90], `${preferredServer}: ${query}`);
    }
  }
});

test("slash and quoted searches match song titles without artist or keyword matches", () => {
  const record = {
    ...music[1],
    musicTitle: ["Special day", "Hello, Happy World! 26", "星光", "星空"],
    bandName: regional("Roselia singer"),
  };
  const defaults = parseBandoriSongsPageFilter(new URLSearchParams());
  for (const preferredServer of BANDORI_SERVERS) {
    const catalog = buildBandoriSongCatalog({ 1: record }, preferredServer, buildOptions);
    const find = (query, patch = {}) => filterBandoriSongCatalog(catalog, { ...defaults, query, ...patch }).map((entry) => entry.songId);
    for (const query of ['/special', '"special"', '“ＳＰＥＣＩＡＬ”', '"Hello, Happy World!"', '/26', '"26"', '/星空', '"星光"', '/special ex en', '"special day']) {
      assert.deepEqual(find(query), [1], `${preferredServer}: ${query}`);
    }
    for (const query of ['special', '/roselia', '"singer"', '/1', '"day hello"', '/', '""', '“”', '"missing', '/special sp']) {
      assert.deepEqual(find(query), [], `${preferredServer}: ${query}`);
    }
    assert.deepEqual(find('/special', { bands: [5] }), []);
    assert.deepEqual(find('/special', { servers: [] }), []);
  }
});
