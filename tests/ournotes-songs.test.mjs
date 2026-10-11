import assert from "node:assert/strict";
import { buildOurNotesMusicPlayerItem } from "../src/lib/ournotes-music-player.ts";
import { createMusicPlayerQueueSnapshot, parseMusicPlayerQueueSnapshot } from "../src/lib/music-player-contract.ts";
import test from "node:test";
import { buildOurNotesSongCatalog, buildOurNotesSongDetail, filterOurNotesSongs, ourNotesSongBandFilters, ourNotesSongCharts,
  parseOurNotesSongFilter, resolveOurNotesSong, updateOurNotesSongsQuery } from "../src/lib/ournotes/music/catalog.ts";
import { parseOurNotesMusicAssetIndex, ourNotesMusicImageUrl } from "../src/lib/ournotes/music/assets.ts";

const text = (value) => Array(5).fill(value);
const bands = {
  1: { bandName: text("MyGO!!!!!") }, 2: { bandName: text("Ave Mujica") }, 3: { bandName: text("夢限大みゅーたいぷ") },
};
const bandFilters = ourNotesSongBandFilters(bands);
const score = (level, combo = 100) => ({ scoreId: 1, musicScoreLevel: Math.trunc(level), musicScoreDisplayLevel: level, fullComboCount: combo });
const song = (patch = {}) => ({
  musicTitle: text("Song"), bandName: text("MyGO!!!!!"), bandIds: [1], musicCategories: [1], musicType: "Ruby",
  startAt: "1767193200000", difficulty: { 0: score(7), 2: score(20.5), 3: score(25) },
  length: 99.98910416666666, bpm: { 2: { events: [{ t: 0, bpm: 190 }, { t: 480, bpm: 200 }] } },
  gekisouMission1: "Combo", gekisouMission2: "Combo", gekisouMission3: "Luck",
  serverExtensions: [{}, {}, {}, {}, {}], ...patch,
});
const filter = (query = "") => parseOurNotesSongFilter(query, bandFilters);
const run = (records, query = "", preferred = 3) => filterOurNotesSongs(buildOurNotesSongCatalog(records, preferred), filter(query), bands).map((entry) => entry.songId);

test("song display resolves one available region and applies whole replacements and deletions", () => {
  const record = song({ musicTitle: ["", "EN", "TW", "", "KR"], serverExtensions: [null, {}, {}, {
    difficulty: { 2: score(18.5, 80) }, bandIds: [2], musicCategories: [4], musicType: null, startAt: null,
  }, {}] });
  const resolved = resolveOurNotesSong(record, 3);
  assert.equal(resolved.server, 3);
  assert.equal(resolved.music.musicTitle[3], "");
  assert.deepEqual(Object.keys(resolved.music.difficulty), ["2"]);
  assert.ok(!Object.hasOwn(resolved.music, "musicType"));
  assert.equal(resolved.music.startAt, null);
  assert.equal(resolveOurNotesSong(record, 0).server, 1);
  const [entry] = buildOurNotesSongCatalog({ 100001: record }, 3);
  assert.equal(entry.title, "");
  assert.deepEqual(entry.bandIds, [2]);
  assert.deepEqual(entry.categories, [4]);
  assert.deepEqual(entry.servers, [1, 2, 3, 4]);
  assert.equal(entry.releaseAtByServer[3], null);
  assert.equal(resolveOurNotesSong(song({ serverExtensions: Array(5).fill(null) }), 3), null);
  assert.deepEqual(run({ 100001: record }, "available=cn"), [100001]);
  assert.deepEqual(run({ 100001: record }, "available=jp"), []);
});

test("catalog and detail titles prefer JP without changing the selected region", () => {
  const record = song({ musicTitle: ["証命讃歌", "Shoumeisanka", "証命讚歌", "证命赞歌", "증명찬가"],
    bandName: ["JP artist", "EN artist", "TW artist", "CN artist", "KR artist"] });
  const detail = buildOurNotesSongDetail(record);
  for (let server = 0; server < 5; server++) {
    const [entry] = buildOurNotesSongCatalog({ 100017: record }, server);
    assert.equal(entry.title, "証命讃歌");
    assert.equal(detail.regions[server].title, entry.title);
    assert.equal(entry.bandName, record.bandName[server]);
    assert.equal(detail.regions[server].bandName, entry.bandName);
  }
  for (const query of record.musicTitle) {
    assert.deepEqual(run({ 100017: record }, new URLSearchParams({ q: query }).toString()), [100017]);
  }
});

test("missing JP titles fall back only to the resolved region in catalog and detail", () => {
  const record = song({ musicTitle: ["", "EN title", "TW title", "CN title", ""], serverExtensions: [null, {}, {}, {}, {}] });
  const detail = buildOurNotesSongDetail(record);
  assert.equal(detail.regions[0], null);
  for (let preferred = 0; preferred < 5; preferred++) {
    const server = preferred === 0 ? 1 : preferred;
    const [entry] = buildOurNotesSongCatalog({ 100107: record }, preferred);
    assert.equal(entry.title, record.musicTitle[server]);
    assert.equal(detail.regions[server].title, entry.title);
  }
});

test("display levels truncate the native display value while sorting retains its fraction", () => {
  const charts = ourNotesSongCharts(song());
  assert.deepEqual(charts.find((chart) => chart.difficulty === "hard"), {
    difficulty: "hard", level: 20, sortLevel: 20.5, combo: 100, bpmValues: [190, 200],
  });
  const records = { 100003: song({ difficulty: { 2: score(20) } }), 100001: song({ difficulty: { 2: score(20.5) } }) };
  assert.deepEqual(run(records), [100003, 100001]);
  assert.deepEqual(run(records, "difficulty=hard&sort=level"), [100001, 100003]);
  assert.deepEqual(run(records, "difficulty=hard&sort=level&direction=asc"), [100003, 100001]);
  assert.deepEqual(run(records, "q=20&maxLevel=20"), [100003, 100001]);
});

test("difficulty and level conditions must be satisfied by the same selected chart", () => {
  const records = { 100001: song() };
  const search = (query, extra = {}) => new URLSearchParams({ q: query, ...extra }).toString();
  assert.deepEqual(run(records, search("hd+ >=25")), [100001]);
  assert.deepEqual(run(records, search("hd >=25")), []);
  assert.deepEqual(run(records, search("20+ 21-")), [100001]);
  assert.deepEqual(run(records, search("20+ 19-")), []);
  assert.deepEqual(run(records, search("hd+", { difficulty: "easy" })), []);
  assert.deepEqual(run(records, "difficulty="), []);
  assert.deepEqual(run(records, "minLevel=21&maxLevel=20"), []);
});

test("reviewed identities, multi-band membership, full names and category meanings are game-specific", () => {
  const records = {
    100001: song({ bandIds: [1, 2], bandName: text("MyGO!!!!! / Ave Mujica"), musicCategories: [3, 4] }),
    100002: song({ bandIds: [], bandName: text("CRYCHIC"), musicTitle: text("mujica anime") }),
  };
  assert.deepEqual(run(records, "q=ave mujica"), [100001]);
  assert.deepEqual(run(records, "q=mygo anime"), [100001]);
  assert.deepEqual(run(records, "bands=2&types=4"), [100001]);
  assert.deepEqual(run(records, "bands=other"), [100002]);
  assert.deepEqual(run(records, "q=crychic"), [100002]);
  assert.deepEqual(run(records, "q=/crychic"), []);
  assert.deepEqual(run(records, "q=/mujica"), [100002]);
  assert.deepEqual(run(records, 'q="mujica anime"'), [100002]);
  assert.deepEqual(run(records, "q=anime&types=1"), []);
  assert.deepEqual(run(records, "types="), []);
  assert.deepEqual(run(records, "bands="), []);
});

test("search stays multilingual and keeps explicit numeric conditions strict", () => {
  const records = { 100001: song({ musicTitle: ["迷星叫", "Mayoiuta", "迷星叫", "迷星叫", "헤매는 노래"] }) };
  for (const query of ["mayoiuta", "ＭＡＹＯＩＵＴＡ", "迷星叫", "#100001", "100001", "kr", "cn_intl", "intl"]) {
    assert.deepEqual(run(records, `q=${encodeURIComponent(query)}`), [100001], query);
  }
  for (const query of ["#0", "#9007199254740993", "#invalid", ">=hd+", ">=9007199254740993"]) {
    assert.deepEqual(run(records, `q=${encodeURIComponent(query)}`), [], query);
  }
});

test("missing official data remains missing, independent of shared BPM or media", () => {
  const record = song({ length: undefined, difficulty: { 2: { scoreId: 123, missing: true } } });
  const [chart] = ourNotesSongCharts(record);
  assert.equal(chart.level, null);
  assert.equal(chart.combo, null);
  assert.deepEqual(chart.bpmValues, [190, 200]);
  assert.deepEqual(run({ 100001: record }), [100001]);
  assert.deepEqual(run({ 100001: record }, "difficulty=hard"), [100001]);
  assert.deepEqual(run({ 100001: record }, "minLevel=1"), []);
  assert.deepEqual(run({ 100001: song({ difficulty: {} }) }, "q=#100001"), [100001]);
  assert.deepEqual(run({ 100001: song({ difficulty: {} }) }, "difficulty=hard"), []);
  const detail = buildOurNotesSongDetail(record);
  assert.equal(detail.durationSeconds, null);
  assert.equal(detail.regions[3].charts[0].combo, null);
});

test("detail props retain mission order, duplicates, None, unknown codes and regional absence", () => {
  const record = song({ resources: { audio: {} }, acquisition: [{ type: "mission" }], serverExtensions: [null, {}, {}, {
    gekisouMission2: "None", gekisouMission3: 91, musicType: "Azure",
  }, {}] });
  const detail = buildOurNotesSongDetail(record);
  assert.equal(detail.regions[0], null);
  assert.deepEqual(detail.regions[1].missions, ["Combo", "Combo", "Luck"]);
  assert.deepEqual(detail.regions[3].missions, ["Combo", "None", 91]);
  assert.equal(detail.regions[3].attribute, "Azure");
  assert.deepEqual(buildOurNotesSongDetail(song({ gekisouMission2: undefined })).regions[3].missions, ["Combo", null, "Luck"]);
  assert.ok(!JSON.stringify(detail).includes("acquisition"));
});

test("query defaults, explicit empty selections and CN aliases round-trip without changing preferences", () => {
  assert.equal(filter().sortBy, "id");
  assert.equal(filter().sortDirection, "desc");
  assert.deepEqual(filter("available=cn,cn_intl,kr").servers, [3, 4]);
  assert.deepEqual(filter("difficulty=expert").difficulties, ["expert"]);
  assert.deepEqual(filter("difficulty=bogus").difficulties, []);
  assert.equal(filter("minLevel=1e2&sort=sortOrder").minLevel, null);
  assert.equal(filter("sort=sortOrder").sortBy, "id");
  const query = updateOurNotesSongsQuery("server=jp&sort=unknown&q=old", { query: "  new  ", servers: [], difficulties: ["hard"], sortDirection: "asc" }, bandFilters);
  assert.equal(new URLSearchParams(query).has("server"), false);
  assert.equal(new URLSearchParams(query).has("sort"), false);
  assert.equal(new URLSearchParams(query).get("available"), "");
  assert.deepEqual(filter(query), { ...filter(), query: "new", servers: [], difficulties: ["hard"], sortDirection: "asc" });
  assert.equal(updateOurNotesSongsQuery(query, filter(), bandFilters), "");
  const rangedQuery = updateOurNotesSongsQuery("", { query: "hd+ >=25" }, bandFilters);
  assert.equal(filter(rangedQuery).query, "hd+ >=25");
  assert.deepEqual(run({ 100001: song() }, rangedQuery), [100001]);
});

test("regional start-date sorting puts unset dates last in either direction", () => {
  const records = { 100001: song({ startAt: null }), 100002: song(), 100003: song({ serverExtensions: [{}, {}, {}, {}, { startAt: "1867193200000" }] }) };
  assert.deepEqual(run(records, "sort=release_kr"), [100003, 100002, 100001]);
  assert.deepEqual(run(records, "sort=release_kr&direction=asc"), [100002, 100003, 100001]);
});

test("music image index accepts missing images and validates consumed content-addressed descriptors", () => {
  const hash = "a".repeat(64);
  const image = { key: `ournotes/music/thumbs/${hash}.png`, sha256: hash, size: 100, width: 128, height: 128 };
  const raw = { schema: "ournotes-music-assets-index-v1", songs: { 100001: { files: { thumb: image } }, 100002: { files: {} } } };
  const index = parseOurNotesMusicAssetIndex(raw);
  assert.equal(ourNotesMusicImageUrl(index, 100001, "thumb"), `https://cdn.hhwx.org/${image.key}`);
  assert.equal(ourNotesMusicImageUrl(index, 100001, "jacket"), null);
  assert.equal(ourNotesMusicImageUrl(index, 100002, "thumb"), null);
  assert.equal(ourNotesMusicImageUrl(null, 100001, "thumb"), null);
  for (const patch of [{ key: `bandori/music/thumbs/${hash}.png` }, { key: "https://example.com/image.png" }, { size: 0 }, { width: -1 }, { sha256: "wrong" }]) {
    assert.throws(() => parseOurNotesMusicAssetIndex({ ...raw, songs: { 100001: { files: { thumb: { ...image, ...patch } } } } }));
  }
  assert.throws(() => parseOurNotesMusicAssetIndex({ ...raw, schema: "wrong" }));
});

test("OurNotes audio uses verified MP3 descriptors and survives mixed-provider queue persistence", () => {
  const hash = "b".repeat(64);
  const audio = { key: `ournotes/music/audio/${hash}.mp3`, sha256: hash, size: 1234 };
  const raw = { schema: "ournotes-music-assets-index-v1", songs: { 100112: { files: { audio }, length: 129.5 } } };
  const assetIndex = parseOurNotesMusicAssetIndex(raw);
  const item = buildOurNotesMusicPlayerItem({ songId: 100112, title: "Song", artist: "MyGO!!!!!", assetIndex });
  assert.equal(item.sourceUrl, `https://cdn.hhwx.org/${audio.key}`);
  assert.equal(item.id, "ournotes:100112");
  assert.equal(item.durationSeconds, 129.5);
  assert.equal(item.artworkUrl, null);
  const bandori = { ...item, id: "bandori:596", provider: "bandori", providerTrackId: "596" };
  const snapshot = createMusicPlayerQueueSnapshot([bandori, item], 1, 1);
  assert.deepEqual(parseMusicPlayerQueueSnapshot(JSON.stringify(snapshot)), snapshot);
  assert.equal(buildOurNotesMusicPlayerItem({ songId: 100112, title: "Song", artist: "", assetIndex: null }), null);
  for (const patch of [{ key: "https://example.org/song.mp3" }, { key: `bandori/music/audio/${hash}.mp3` }, { sha256: "bad" }, { size: 0 }]) {
    assert.throws(() => parseOurNotesMusicAssetIndex({ ...raw, songs: { 100112: { files: { audio: { ...audio, ...patch } } } } }));
  }
  for (const length of [0, -1, Infinity, "129.5"]) {
    assert.throws(() => parseOurNotesMusicAssetIndex({ ...raw, songs: { 100112: { files: { audio }, length } } }));
  }
});
