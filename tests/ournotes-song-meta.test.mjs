import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseOurNotesSongMeta } from "../src/lib/ournotes/music/meta-contract.ts";
import { verifyOurNotesSongMeta } from "../src/lib/ournotes/music/meta-server.ts";
import { buildOurNotesMetaRows, calculateOurNotesMeta, formatOurNotesMetaTime, OURNOTES_META_DEFAULT_SKILLS, ourNotesMetaBpm, ourNotesMetaDuration, ourNotesMetaSkillOptions,
  resolveOurNotesMetaExtension, resolveOurNotesMetaLiveSkill } from "../src/lib/ournotes/music/meta.ts";
import { parseOurNotesSongFilter, updateOurNotesSongsQuery } from "../src/lib/ournotes/music/catalog.ts";
import { OURNOTES_META_DEFAULT_PREFERENCES, OURNOTES_META_PREFERENCES_KEY, ourNotesMetaPreferencesQuery,
  readOurNotesMetaPreferences, resolveOurNotesMetaPreferences, writeOurNotesMetaPreferences } from "../src/lib/ournotes/music/meta-preferences.ts";
import { GET } from "../src/app/api/ournotes/master/music/meta/route.ts";

const fixture = JSON.parse(await readFile(new URL("fixtures/ournotes-meta-skills.json", import.meta.url), "utf8"));
const index = Buffer.from('{ "schema": "ournotes-music-assets-index-v1", "songs": {} }');
const artifact = () => ({ schema: "ournotes-music-meta-v1", updatedAt: "2026-10-12T00:00:00Z",
  musicIndexSha256: createHash("sha256").update(index).digest("hex"), durations: [5, 9],
  songs: { 100001: { 3: { total: 3.5, covered: { 5: 0.8, 9: 4 } } } } });

function preferenceStorage(initial = null) {
  const values = new Map(initial === null ? [] : [[OURNOTES_META_PREFERENCES_KEY, initial]]);
  return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("Meta preferences persist only calculation settings and table sorting, including no support skill", () => {
  const storage = preferenceStorage();
  const settings = { mode: "free", liveSkill: "2", liveLevel: 3, supportSkill: "none", supportLevel: 2,
    perfect: 95.5, downtime: 45.25, metaSort: "efficiency", metaDirection: "asc" };
  writeOurNotesMetaPreferences({ ...settings, q: "test", bands: [1], difficulty: "expert", view: "meta" }, storage);
  assert.deepEqual(JSON.parse(storage.values.get(OURNOTES_META_PREFERENCES_KEY)), settings);
  assert.deepEqual(readOurNotesMetaPreferences(storage), settings);
  assert.deepEqual(readOurNotesMetaPreferences(preferenceStorage()), OURNOTES_META_DEFAULT_PREFERENCES);
});

test("Meta preference storage validates each field and safely handles missing, malformed or unavailable storage", () => {
  for (const raw of ["not json", "null", "[]", "42"]) assert.deepEqual(readOurNotesMetaPreferences(preferenceStorage(raw)), OURNOTES_META_DEFAULT_PREFERENCES);
  const invalid = { mode: "gekisou", liveSkill: "../2", supportSkill: "0", liveLevel: 2.5, supportLevel: 6,
    perfect: -1, downtime: 3601, metaSort: "id", metaDirection: "up" };
  assert.deepEqual(readOurNotesMetaPreferences(preferenceStorage(JSON.stringify(invalid))), OURNOTES_META_DEFAULT_PREFERENCES);
  assert.deepEqual(readOurNotesMetaPreferences(preferenceStorage(JSON.stringify({ ...invalid, perfect: 0, supportSkill: "none" }))),
    { ...OURNOTES_META_DEFAULT_PREFERENCES, perfect: 0, supportSkill: "none" });
  const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.deepEqual(readOurNotesMetaPreferences(blocked), OURNOTES_META_DEFAULT_PREFERENCES);
  assert.doesNotThrow(() => writeOurNotesMetaPreferences(OURNOTES_META_DEFAULT_PREFERENCES, blocked));
  assert.deepEqual(readOurNotesMetaPreferences(null), OURNOTES_META_DEFAULT_PREFERENCES);
  assert.doesNotThrow(() => writeOurNotesMetaPreferences(OURNOTES_META_DEFAULT_PREFERENCES, null));
});

test("explicit Meta URL values override saved preferences without saving the link's other settings", () => {
  const saved = { ...OURNOTES_META_DEFAULT_PREFERENCES, liveSkill: "2", liveLevel: 3, perfect: 95, metaSort: "efficiency", metaDirection: "asc" };
  const storage = preferenceStorage(JSON.stringify(saved));
  const preferences = readOurNotesMetaPreferences(storage);
  const selected = resolveOurNotesMetaPreferences("liveSkill=5&liveLevel=4&supportSkill=none&perfect=100&metaSort=nps&metaDirection=desc", preferences, ["2", "5"], ["11"]);
  assert.deepEqual(selected, { ...saved, liveSkill: "5", liveLevel: 4, supportSkill: "none", perfect: 100, metaSort: "nps", metaDirection: "desc" });
  assert.deepEqual(readOurNotesMetaPreferences(storage), saved);
  writeOurNotesMetaPreferences({ ...preferences, downtime: 45 }, storage);
  assert.deepEqual(readOurNotesMetaPreferences(storage), { ...saved, downtime: 45 });
  assert.deepEqual(resolveOurNotesMetaPreferences("", readOurNotesMetaPreferences(storage), ["2", "5"], ["11"]), { ...saved, downtime: 45 });
});

test("invalid Meta URL values and unavailable skills fall back without overwriting remembered choices", () => {
  const saved = { ...OURNOTES_META_DEFAULT_PREFERENCES, liveSkill: "2", supportSkill: "9", perfect: 95, downtime: 45 };
  const invalid = "mode=gekisou&liveSkill=999&supportSkill=999&liveLevel=0&supportLevel=6&perfect=NaN&downtime=&metaSort=invalid&metaDirection=invalid";
  assert.deepEqual(resolveOurNotesMetaPreferences(invalid, saved, ["2", "5"], ["9", "11"]), saved);
  assert.deepEqual(resolveOurNotesMetaPreferences("", saved, ["5"], ["11"]), { ...saved, liveSkill: "5", supportSkill: "11" });
  assert.equal(resolveOurNotesMetaPreferences("", saved, [], []).supportSkill, "none");
  assert.deepEqual(resolveOurNotesMetaPreferences("", saved, ["2", "5"], ["9", "11"]), saved);
});

test("complete Meta URLs reproduce settings on another browser and survive clearing only catalog filters", () => {
  const settings = { ...OURNOTES_META_DEFAULT_PREFERENCES, liveSkill: "2", liveLevel: 2, supportSkill: "none", perfect: 91.25,
    downtime: 50, metaSort: "efficiency", metaDirection: "asc" };
  const query = ourNotesMetaPreferencesQuery("view=meta&q=test&difficulty=expert&available=jp", settings);
  const otherBrowser = { ...OURNOTES_META_DEFAULT_PREFERENCES, supportLevel: 1, perfect: 30, metaSort: "nps" };
  assert.deepEqual(resolveOurNotesMetaPreferences(query, otherBrowser, ["2", "5"], ["11"]), settings);
  assert.equal(new URLSearchParams(query).get("q"), "test");
  assert.equal(ourNotesMetaPreferencesQuery(query, settings), query);
  const cleared = updateOurNotesSongsQuery(query, parseOurNotesSongFilter("", [1, "other"]), [1, "other"]);
  assert.deepEqual(parseOurNotesSongFilter(cleared, [1, "other"]), parseOurNotesSongFilter("", [1, "other"]));
  assert.deepEqual(resolveOurNotesMetaPreferences(cleared, otherBrowser, ["2", "5"], ["11"]), settings);
  assert.equal(new URLSearchParams(cleared).get("view"), "meta");
});

test("default skills match the selected Perfect 150% and MyGO five-second extension", () => {
  assert.deepEqual(resolveOurNotesMetaLiveSkill(fixture.live[OURNOTES_META_DEFAULT_SKILLS.live], 5), { duration: 5, boost: 1.5, perfectOnly: true });
  const support = fixture.support[OURNOTES_META_DEFAULT_SKILLS.support];
  assert.equal(resolveOurNotesMetaExtension(support, 5), 5000);
  assert.equal(support.effects[1].skillConditions[0][0].conditionTargets[0].bandId, 1);
});

test("Meta times retain milliseconds and carry correctly at minute boundaries", () => {
  assert.equal(formatOurNotesMetaTime(99.98910416666666), "1:39.989");
  assert.equal(formatOurNotesMetaTime(60), "1:00.000");
  assert.equal(formatOurNotesMetaTime(60.005), "1:00.005");
  assert.equal(formatOurNotesMetaTime(59.9996), "1:00.000");
});

test("meta validates the exact index bytes and preserves additive coverage above 100%", () => {
  const parsed = verifyOurNotesSongMeta(artifact(), index);
  assert.deepEqual(Object.keys(parsed), ["durations", "songs"]);
  assert.equal(parsed.songs[100001][3].covered[9], 4);
  assert.throws(() => verifyOurNotesSongMeta(artifact(), Buffer.from(JSON.stringify(JSON.parse(index)))));
  for (const mutate of [
    (v) => { v.schema = "v2"; }, (v) => { v.updatedAt = "unknown"; }, (v) => { v.fever = true; },
    (v) => { v.durations = [9, 5]; }, (v) => { v.durations = [5, 5]; }, (v) => { v.durations = [0, 5]; },
    (v) => { v.songs[100001][3].total = 0; }, (v) => { v.songs[100001][3].total = NaN; },
    (v) => { v.songs[100001][3].covered[5] = -1; }, (v) => { delete v.songs[100001][3].covered[9]; },
    (v) => { v.songs[100001][3].covered[10] = 1; }, (v) => { v.songs[100001][4] = v.songs[100001][3]; },
  ]) { const bad = artifact(); mutate(bad); assert.throws(() => parseOurNotesSongMeta(bad)); }
});

test("meta API rejects regional and arbitrary parameters before reading storage", async () => {
  for (const query of ["server=0", "fever=true", "duration=5"]) {
    const response = await GET(new Request(`http://localhost/api/ournotes/master/music/meta?${query}`));
    assert.equal(response.status, 400);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
});

test("all member skill grades resolve from raw effects, including the high-life branch", () => {
  for (const skill of Object.values(fixture.live)) for (let level = 1; level <= 5; level++) assert.ok(resolveOurNotesMetaLiveSkill(skill, level));
  assert.deepEqual(resolveOurNotesMetaLiveSkill(fixture.live[2], 5), { duration: 5, boost: 1, perfectOnly: false });
  assert.deepEqual(resolveOurNotesMetaLiveSkill(fixture.live[5], 5), { duration: 5, boost: 1.5, perfectOnly: true });
  assert.equal(resolveOurNotesMetaLiveSkill(fixture.live[6], 5).boost, 1.1);
  const misleading = structuredClone(fixture.live[2]); misleading.descriptionParameters = [["999", "999", "999", "999", "999"]];
  assert.equal(resolveOurNotesMetaLiveSkill(misleading, 5).boost, 1);
  assert.equal(resolveOurNotesMetaLiveSkill(fixture.live[2], 0), null);
  const cumulative = structuredClone(fixture.live[2]); cumulative.effects[0].effectLimitCount[4] = 1;
  assert.equal(resolveOurNotesMetaLiveSkill(cumulative, 5), null);
});

test("support selects the positive band branch, without adding the fallback, and excludes other effects", () => {
  assert.equal(resolveOurNotesMetaExtension(fixture.support[9], 1), 1500);
  assert.equal(resolveOurNotesMetaExtension(fixture.support[9], 5), 4000);
  assert.equal(resolveOurNotesMetaExtension(fixture.support[11], 5), 5000);
  assert.equal(resolveOurNotesMetaExtension(fixture.support[71], 5), 3000);
  for (const id of [16, 31, 51, 61]) assert.equal(resolveOurNotesMetaExtension(fixture.support[id], 5), null);
  const unsupported = structuredClone(fixture.support[9]); unsupported.effects[1].skillTriggerConditions[0][0].conditionType.fill(9999);
  assert.equal(resolveOurNotesMetaExtension(unsupported, 5), null);
  assert.equal(ourNotesMetaDuration(5, resolveOurNotesMetaExtension(fixture.support[9], 5)), 9);
  const duplicate = { ...fixture.support, 1002: structuredClone(fixture.support[1]) };
  assert.deepEqual(ourNotesMetaSkillOptions(duplicate, "support", 3).map(([id]) => id), ["1", "9", "11", "71"]);
});

test("Meta duration matches the backend float32 conversion before millisecond scaling", () => {
  assert.equal(ourNotesMetaDuration(4.004, 0), 4.005);
  const result = calculateOurNotesMeta({ total: 3.5, covered: { "4.005": 0.8 } },
    { duration: 4.004, boost: 1, perfectOnly: false }, 0, 1, 120, 30);
  assert.ok(result);
  assert.equal(result.score, 430);
});

test("normal and Perfect-only effects apply the agreed uniform P/G model", () => {
  const chart = { total: 3.5, covered: { 5: 0.8, 9: 4 } }, normal = resolveOurNotesMetaLiveSkill(fixture.live[2], 5);
  const perfect = { ...normal, perfectOnly: true };
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
  near(calculateOurNotesMeta(chart, normal, 0, 1, 120, 30).score, 430);
  near(calculateOurNotesMeta(chart, normal, 0, 0, 120, 30).score, 344);
  near(calculateOurNotesMeta(chart, perfect, 0, 0, 120, 30).score, 280);
  near(calculateOurNotesMeta(chart, perfect, 0, 0.9, 120, 30).score, (0.98 * 3.5 + 0.9 * 0.8) * 100);
  const extended = calculateOurNotesMeta(chart, normal, 4000, 1, 120, 30);
  near(extended.efficiency, extended.score * 60 / 150);
  assert.ok(extended.sr > 100);
  assert.equal(calculateOurNotesMeta(chart, normal, 1000, 1, 120, 30), null);
  assert.equal(calculateOurNotesMeta(chart, normal, 0, 1.01, 120, 30), null);
  assert.equal(calculateOurNotesMeta(chart, normal, 0, 1, 0, 30), null);
});

test("Meta skill selection uses regional effects and falls back only for an absent region", () => {
  const regional = structuredClone(fixture.live[2]);
  const replacement = structuredClone(regional.effects);
  replacement[0].effectValue = [100, 200, 300, 400, 500];
  regional.serverExtensions = [{}, {}, { effects: replacement }, { effects: replacement }, null];
  const select = (server) => ourNotesMetaSkillOptions({ 2: regional }, "live", server)[0][1];
  assert.equal(resolveOurNotesMetaLiveSkill(select(3), 5).boost, 0.05);
  assert.equal(resolveOurNotesMetaLiveSkill(select(0), 5).boost, 1);
  assert.equal(resolveOurNotesMetaLiveSkill(select(4), 5).boost, 1);
  assert.equal(regional.effects[0].effectValue[4], 10000);
});

test("ranking uses per-chart filters, official N, JP names, regional records and dominant timed BPM", () => {
  const music = { 100001: { musicTitle: ["JP", "EN", "TW", "CN", "KR"], bandName: Array(5).fill("Band"), bandIds: [1], musicCategories: [1],
    startAt: null, serverExtensions: [{}, {}, {}, {}, {}], length: 120,
    difficulty: { 0: { musicScoreDisplayLevel: 7, fullComboCount: 100 }, 3: { musicScoreDisplayLevel: 25.5, fullComboCount: 600 } },
    bpm: { 3: { events: [{ t: 0, bpm: 120 }, { t: 480, bpm: 180 }] } },
  } };
  const bands = { 1: { bandName: Array(5).fill("Band") } }, meta = verifyOurNotesSongMeta(artifact(), index);
  const rows = (query) => buildOurNotesMetaRows(music, meta, bands, 3, parseOurNotesSongFilter(query, [1, "other"]),
    resolveOurNotesMetaLiveSkill(fixture.live[2], 5), 0, 1, 30, "score", "desc");
  assert.equal(rows("").length, 1);
  const row = rows("q=expert+25")[0];
  assert.equal(row.title, "JP"); assert.equal(row.notes, 600); assert.equal(row.nps, 5); assert.equal(row.level, 25);
  assert.equal(row.bpm, 180); assert.deepEqual(row.bpmValues, [120, 180]);
  assert.equal(rows("difficulty=easy").length, 0);
  assert.equal(rows("q=easy+25").length, 0);
  assert.equal(ourNotesMetaBpm([{ t: 0, bpm: 120 }, { t: 96000, bpm: 180 }], 120), 120);
});

function rankingFixture(count = 40) {
  const music = {}, meta = { durations: [5, 9], songs: {} };
  const bands = { 1: { bandName: Array(5).fill("Band A") }, 2: { bandName: Array(5).fill("Band B") } };
  for (let i = 0; i < count; i++) {
    const id = 100001 + Math.floor(i / 2), difficulty = i % 2 === 0 ? 0 : 3;
    music[id] ??= { musicTitle: Array(5).fill(`Song ${id}`), bandName: Array(5).fill(i < 20 ? "Band A" : "Band B"),
      bandIds: [i < 20 ? 1 : 2], musicCategories: [i < 20 ? 1 : 2], startAt: null,
      musicType: i < 20 ? "Ruby" : "Azure", gekisouMission1: "Combo", gekisouMission2: "Combo", gekisouMission3: i < 20 ? "Combo" : "Luck",
      serverExtensions: i < 20 ? [{}, null, null, null, null] : [{}, {}, {}, {}, {}],
      length: i < 2 ? 1 : 120, difficulty: {}, bpm: {} };
    music[id].difficulty[difficulty] = { musicScoreDisplayLevel: difficulty === 0 ? 7 : 25, fullComboCount: 100 };
    meta.songs[id] ??= {};
    meta.songs[id][difficulty] = { total: i + 1, covered: { 5: 0, 9: 0 } };
  }
  const rows = ({ query = "", boost = 1, perfectOnly = true, extension = 0, perfect = 1, downtime = 0, sort = "score", direction = "desc" } = {}) =>
    buildOurNotesMetaRows(music, meta, bands, 3, parseOurNotesSongFilter(query, [1, 2, "other"]),
      { duration: 5, boost, perfectOnly }, extension, perfect, downtime, sort, direction);
  return { music, meta, rows };
}
const chartKey = (row) => `${row.songId}:${row.difficulty}`;
const highlighted = (rows, key) => rows.filter((row) => row[key]).map(chartKey).sort();

test("top five percent is per chart and metric, includes cutoff ties and ignores rounded display values and missing data", () => {
  const { music, meta, rows } = rankingFixture();
  meta.songs[100019][3].total = 39;
  meta.songs[100019][0].total = 38.999999;
  for (const id of [100021, 100022, 100023]) music[id] = structuredClone(music[100020]);
  music[100022].length = 0;
  meta.songs[100022] = structuredClone(meta.songs[100020]);
  meta.songs[100023] = { 0: { total: 100, covered: { 9: 0 } }, 3: { total: 100, covered: { 9: 0 } } };
  const all = rows();
  assert.equal(all.length, 40);
  assert.deepEqual(highlighted(all, "topScore"), ["100019:expert", "100020:easy", "100020:expert"]);
  assert.deepEqual(highlighted(all, "topEfficiency"), ["100001:easy", "100001:expert"]);
  assert.equal(all.find((row) => chartKey(row) === "100019:easy").score.toFixed(2), "3900.00");
  assert.equal(all.find((row) => chartKey(row) === "100019:easy").topScore, false);
});

test("catalog filters and sort never redefine the highlight population", () => {
  const { rows } = rankingFixture(), all = new Map(rows().map((row) => [chartKey(row), row]));
  for (const query of ["q=%23100002", "available=cn", "bands=1", "types=1", "attributes=1", "gekisou=mix", "attributes=2&gekisou=mix", "difficulty=easy", "minLevel=20", "maxLevel=10"]) {
    const filtered = rows({ query, sort: "efficiency", direction: "asc" });
    assert.ok(filtered.length > 0 && filtered.length < all.size, query);
    for (const row of filtered) assert.deepEqual(row, all.get(chartKey(row)), query);
  }
  assert.deepEqual(rows({ query: "q=no-such-song" }), []);
  for (const query of ["attributes=", "gekisou=", "attributes=1&gekisou=mix"]) assert.deepEqual(rows({ query }), []);
  for (const row of rows({ sort: "title", direction: "asc" })) assert.deepEqual(row, all.get(chartKey(row)));
});

test("top-five-percent count rounds upward and handles small or empty populations", () => {
  assert.deepEqual(highlighted(rankingFixture(21).rows(), "topScore"), ["100010:expert", "100011:easy"]);
  const single = rankingFixture(1).rows();
  assert.equal(single[0].topScore, true);
  assert.equal(single[0].topEfficiency, true);
  assert.deepEqual(rankingFixture(0).rows(), []);
});

test("highlights follow skill strength, extension, Perfect rate and downtime independently", () => {
  const { music, meta, rows } = rankingFixture(20);
  for (const song of Object.values(meta.songs)) for (const chart of Object.values(song)) chart.total = 0.5;
  music[100001].length = 120;
  music[100002].length = 60;
  meta.songs[100001][0] = { total: 4, covered: { 5: 0.1, 9: 0.1 } };
  meta.songs[100002][0] = { total: 1, covered: { 5: 2, 9: 5 } };
  assert.deepEqual(highlighted(rows(), "topScore"), ["100001:easy"]);
  assert.deepEqual(highlighted(rows(), "topEfficiency"), ["100002:easy"]);
  assert.deepEqual(highlighted(rows({ boost: 2 }), "topScore"), ["100002:easy"]);
  assert.deepEqual(highlighted(rows({ extension: 4000 }), "topScore"), ["100002:easy"]);
  assert.deepEqual(highlighted(rows({ boost: 2, perfect: 0 }), "topScore"), ["100001:easy"]);
  assert.deepEqual(highlighted(rows({ downtime: 3600 }), "topEfficiency"), ["100001:easy"]);
  assert.deepEqual(rows({ downtime: 3600 }).map((row) => [chartKey(row), row.score, row.topScore]), rows().map((row) => [chartKey(row), row.score, row.topScore]));
});
