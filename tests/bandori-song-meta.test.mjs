import assert from "node:assert/strict";
import test from "node:test";
import { bandoriMetaSkillDescription, bandoriMetaSkillOptions, buildBandoriMetaRows, calculateBandoriMeta, parseBandoriSongMetaResponse } from "../src/lib/bandori/songs/meta.ts";
import { BANDORI_META_DEFAULT_PREFERENCES as defaults, BANDORI_META_PREFERENCES_KEY, bandoriMetaPreferencesQuery,
  readBandoriMetaPreferences, resolveBandoriMetaPreferences, writeBandoriMetaPreferences } from "../src/lib/bandori/songs/meta-preferences.ts";
import { parseBandoriSongsPageFilter, updateBandoriSongsQuery } from "../src/lib/bandori/songs/catalog.ts";
import { formatSongMetaTime } from "../src/lib/song-meta.ts";

const rawSkill = (type = "score", value = 150, condition = "perfect") => ({ duration: [5, 5.5, 6, 6.5, 7],
  description: ["{0} seconds", "", "", "{0}秒"],
  activationEffect: { activateEffectTypes: { [type]: { activateEffectValue: value, activateCondition: condition } } } });
const options = (skill) => bandoriMetaSkillOptions({ 69: skill }, 3);
const level = (skill) => options(skill)[0].levels[4];
const chart = { total: [3, 4], covered: { 7: [1, 1.5] } };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("Meta filters entire order-dependent skills, unsupported effects and non-score skills at every level", () => {
  for (const type of ["score_continued_note_judge", "score_rate_up_with_perfect", "score_future", "heal"]) {
    const skill = rawSkill(type);
    if (type !== "heal") skill.activationEffect.activateEffectTypes.score = { activateEffectValue: 100 };
    assert.deepEqual(options(skill), [], type);
  }
  assert.deepEqual(options({ ...rawSkill(), duration: [5, 5.5, null, 6.5, 7] }), []);
  assert.deepEqual(bandoriMetaSkillOptions({ 1: null, 2: undefined }, 0), []);
});

test("supported skills use satisfied life, band and attribute conditions and regional durations without adding branches", () => {
  const life = rawSkill("score_under_life", 80, "none");
  life.activationEffect.activateEffectTypes.score_over_life = { activateEffectValue: 120 };
  assert.equal(level(life).perfectMultiplier, 2.2);
  for (const condition of [{ unificationActivateConditionBandId: 1 }, { unificationActivateConditionType: "cool" }]) {
    const skill = rawSkill();
    Object.assign(skill.activationEffect, condition, { unificationActivateEffectValue: 170 });
    assert.equal(level(skill).perfectMultiplier, 2.7);
    assert.equal(level(skill).greatMultiplier, 1);
  }
  const skill = rawSkill("score", [100, 120, null, 150], "none");
  skill.duration = Array(5).fill([7, 7.5, null, 8]);
  assert.deepEqual(level(skill), { duration: 8, perfectMultiplier: 2.5, greatMultiplier: 2.5 });
  assert.equal(bandoriMetaSkillDescription(options(skill)[0], 5, 3), "8秒");
  assert.equal(bandoriMetaSkillOptions({ 69: skill }, 2)[0].levels[4].duration, 7);
});

test("ordinary, Perfect bonus, half-score and zero-score effects apply separate P/G weights in both Fever modes", () => {
  for (const [type, condition, mG] of [["score", "none", 2.5], ["score", "perfect", 1], ["score_under_great_half", "none", 0.5], ["score_only_perfect", "none", 0]]) {
    const skill = level(rawSkill(type, 150, condition));
    for (const fever of [false, true]) for (const p of [0, 0.5, 0.9, 1]) {
      const b = chart.total[Number(fever)], c = chart.covered[7][Number(fever)];
      const expected = ((1.1 * p + 0.8 * (1 - p)) * (b - c) + (1.1 * p * 2.5 + 0.8 * (1 - p) * mG) * c) * 100;
      const result = calculateBandoriMeta(chart, skill, fever, p, 120, 30);
      close(result.score, expected); close(result.efficiency, expected * 60 / 150); close(result.sr, c / b * 100);
    }
  }
  for (const [p, length, downtime] of [[NaN, 120, 30], [1.01, 120, 30], [-1, 120, 30], [1, 0, 30], [1, 120, -1]])
    assert.equal(calculateBandoriMeta(chart, level(rawSkill()), true, p, length, downtime), null);
  assert.equal(calculateBandoriMeta(chart, { ...level(rawSkill()), duration: 9 }, true, 1, 120, 30), null);
});

test("at all Perfect the supported formula equals Bestdori's constant multiplier; non-Perfect effects intentionally differ", () => {
  const skill = level(rawSkill());
  const bestdori = (p) => (1.1 * p + 0.8 * (1 - p)) * (2.5 + 2.5 * 1.5) * 100;
  close(calculateBandoriMeta(chart, skill, true, 1, 120, 30).score, bestdori(1));
  close(bestdori(0.9) - calculateBandoriMeta(chart, skill, true, 0.9, 120, 30).score, 18);
});

const filter = (query = "") => parseBandoriSongsPageFilter(new URLSearchParams(query));
function ranking() {
  const music = {}, songs = {};
  for (let id = 1; id <= 20; id++) {
    music[id] = { bandId: 1, bandName: ["Band"], musicTitle: [`JP ${id}`, `EN ${id}`, null, `CN ${id}`], publishedAt: [1000, 1000, null, 1000], tag: "normal",
      difficulty: { 0: { playLevel: 7 }, 3: { playLevel: 26 } }, length: id === 20 ? 200 : 100,
      notes: { 0: 100, 3: 500 }, bpm: { 3: [{ bpm: 120, start: 0, end: 30 }, { bpm: 180, start: 30, end: 80 }, { bpm: 120, start: 80, end: 100 }] } };
    songs[id] = { 0: { total: [3, 4], covered: { 7: [0.1, 0.1] } }, 3: { total: [3, 4], covered: { 7: [id / 10, id / 10] } } };
  }
  const rows = (query = "", sort = "score", direction = "desc") => buildBandoriMetaRows(music, { durations: [7], songs }, 3, filter(query), level(rawSkill()), true, 1, 30, sort, direction);
  return { music, songs, rows };
}

test("ranking applies filters to each chart and uses regional names, official notes and the longest single BPM segment", () => {
  const { rows } = ranking(), all = rows();
  assert.equal(all.length, 40);
  assert.equal(all[0].title, "CN 20");
  assert.equal(all[0].bpm, 180); assert.deepEqual(all[0].bpmValues, [120, 180]);
  assert.equal(all[0].notes, 500); assert.equal(all[0].nps, 2.5);
  assert.equal(rows("difficulty=easy&minLevel=26").length, 0);
  assert.equal(rows("q=ex%2026").length, 20);
  assert.equal(rows("q=%2320").length, 2);
  assert.equal(rows("available=tw").length, 0);
  for (const direction of ["asc", "desc"]) assert.equal(rows("", "bpm", direction).at(-1).bpm, null);
  assert.equal(formatSongMetaTime(59.9996), "1:00.000");
});

test("score and efficiency highlights are independently global and retain cutoff ties after filters", () => {
  const { songs, rows } = ranking();
  songs[18][3].covered[7] = songs[19][3].covered[7];
  assert.deepEqual(rows().filter((r) => r.topScore).map((r) => r.songId), [20, 18, 19]);
  assert.ok(!rows().find((r) => r.songId === 20 && r.difficulty === "expert").topEfficiency);
  assert.equal(rows("q=%231").filter((r) => r.topScore).length, 0);
  const subset = rows("q=%2318");
  assert.equal(subset.find((r) => r.difficulty === "expert").topScore, true);
});

test("preferences validate independently, resolve URL over saved over defaults, and clear only catalog filters", () => {
  assert.deepEqual(defaults, { fever: true, liveSkill: "69", liveLevel: 5, perfect: 100, downtime: 30, metaSort: "score", metaDirection: "desc" });
  const values = new Map(), storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  const saved = { ...defaults, liveSkill: "4", perfect: 95 };
  writeBandoriMetaPreferences({ ...saved, q: "ignore", view: "meta" }, storage);
  assert.deepEqual(JSON.parse(values.get(BANDORI_META_PREFERENCES_KEY)), saved);
  const selected = resolveBandoriMetaPreferences("liveSkill=69&fever=false&liveLevel=3&perfect=100", readBandoriMetaPreferences(storage), ["4", "69"]);
  assert.deepEqual(selected, { ...saved, liveSkill: "69", fever: false, liveLevel: 3, perfect: 100 });
  assert.deepEqual(readBandoriMetaPreferences(storage), saved);
  writeBandoriMetaPreferences({ ...saved, downtime: 45 }, storage);
  assert.equal(readBandoriMetaPreferences(storage).perfect, 95);
  assert.deepEqual(resolveBandoriMetaPreferences("liveSkill=26&liveLevel=0&perfect=NaN&downtime=3601&fever=no&metaSort=id", saved, ["69"]), { ...saved, liveSkill: "69" });
  const query = bandoriMetaPreferencesQuery("view=meta&q=test&difficulty=easy&server=jp", selected);
  const cleared = updateBandoriSongsQuery(query, filter());
  assert.deepEqual(filter(cleared), filter());
  assert.deepEqual(resolveBandoriMetaPreferences(cleared, defaults, ["4", "69"]), selected);
  assert.equal(new URLSearchParams(cleared).get("view"), "meta");
  assert.equal(new URLSearchParams(cleared).has("server"), false);
  assert.deepEqual(readBandoriMetaPreferences({ getItem: () => "invalid" }), defaults);
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  assert.deepEqual(readBandoriMetaPreferences(blocked), defaults);
  assert.doesNotThrow(() => writeBandoriMetaPreferences(defaults, blocked));
});

test("Meta API errors and invalid envelopes do not become an empty successful ranking", () => {
  for (const data of [null, {}, { durations: [], songs: {} }, { durations: [0], songs: {} }, { durations: [7], songs: [] }])
    assert.throws(() => parseBandoriSongMetaResponse({ success: true, data }));
  assert.throws(() => parseBandoriSongMetaResponse({ success: false, error: { message: "unavailable" } }));
  const valid = { durations: [7], songs: { 1: { 3: chart } } };
  assert.deepEqual(parseBandoriSongMetaResponse({ success: true, data: valid }), valid);
});
