import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { buildOurNotesCardCatalog, filterOurNotesCards, parseOurNotesCardFilter, updateOurNotesCardsQuery,
  switchOurNotesCardsKind, ourNotesCardsListHref, ourNotesCardName, ourNotesCardSkills, ourNotesCardStats, ourNotesCardRarities, ourNotesSkillDescription, OURNOTES_RARITY_NAMES, OURNOTES_SORTS } from "../src/lib/ournotes/cards/catalog.ts";
import { parseOurNotesCardsAssetIndex, ourNotesImageUrl, ourNotesAttributeIcon } from "../src/lib/ournotes/cards/assets.ts";
import { ourNotesFrameColors } from "../src/lib/ournotes/cards/frame.ts";
import { normalizeOurNotesServer, getOurNotesServerFromCode, pickAvailableOurNotesServer, pickOurNotesRegionalText, OURNOTES_SERVER_CODES } from "../src/lib/ournotes/server.ts";
import { useBandoriPreferencesStore as bandoriStore, useOurNotesPreferencesStore as ourNotesStore } from "../src/store/useServerPreferencesStore.ts";
import { useBandoriPreferencesStore as legacyBandoriStore } from "../src/store/useBandoriPreferencesStore.ts";
import { BANDORI_SEARCH_BAND_ALIASES } from "../src/lib/bandori/search.ts";
import { BANDORI_CARD_SEARCH_CHARACTER_ALIASES } from "../src/lib/bandori/cards/search-aliases.ts";

const text = (value) => [value, value, value, value, value];
const characters = {
  1: { characterName: text("Character One"), shortName: text("One"), bandId: 1, displayOrder: 1 },
  2: { characterName: text("Character Two"), shortName: text("Two"), bandId: 2, displayOrder: 2 },
};
const bands = { 1: { bandName: text("First Band") }, 2: { bandName: text("Second Band") } };
const skill = { skillName: text("Test skill"), description: ["Gain {0}% and {1}s", "", "Gain {0}%", "Gain {0}%", "Gain {0}%"],
  descriptionParameters: [["50", "60", "70", "80", "100"], ["0.5", "0.75", "1", "1.25", "1.5"]],
  effects: [{ skillEffectType: 2000, effectValue: [5000, 6000, 7000, 8000, 10000] }, { skillEffectType: 15000, effectValue: [500, 750, 1000, 1250, 1500] }] };
const skills = { leader: {}, live: { 1: skill }, gekisou: {}, support: { 1: skill }, gekisouSupport: {} };
const base = { assetId: 100, rarity: 4, cardType: 1, powerMax: { performance: 100, technic: 200, visual: 300 }, startAt: text("not-a-verified-release-date"), serverExtensions: [{}, {}, {}, {}, {}] };
const member = { ...base, characterId: 1, subtitle: text("Red dream"), leaderSkillId: 0, liveSkillId: 1, gekisouSkillId: 0 };
const support = { ...base, characterIds: [2, 1], name: text("Snapshot"), description: text("Together"), serverExtensions: [null, {}, {}, {}, {}], supportSkillId01: 0, supportSkillId02: 1, gekisouSupportSkillId01: 0, gekisouSupportSkillId02: 0 };
const options = { bandIds: [1, 2], characterIds: [1, 2], rarities: [2, 3, 4, 10] };

test("Snapshot stats are separate two-decimal percentage bonuses; only members have total power", () => {
  for (const locale of ["zh-CN", "en"]) {
    assert.deepEqual(ourNotesCardStats({ ...support, powerMax: { performance: 3500, technic: 3333, visual: 0 } }, locale), [
      { key: "performance", value: "35.00%" }, { key: "technic", value: "33.33%" }, { key: "visual", value: "0.00%" },
    ]);
    assert.deepEqual(ourNotesCardStats({ ...member, powerMax: { performance: 3500, technic: 3300, visual: 3400 } }, locale), [
      { key: "performance", value: "3,500" }, { key: "technic", value: "3,300" }, { key: "visual", value: "3,400" }, { key: "total", value: "10,200" },
    ]);
  }
});

test("native card frame vertex colors interpolate smoothly in member and Snapshot geometry", () => {
  function gradientColor({ from, to, stops }, [x, y]) {
    const dx = to[0] - from[0], dy = to[1] - from[1];
    const t = Math.max(0, Math.min(1, ((x - from[0]) * dx + (y - from[1]) * dy) / (dx * dx + dy * dy)));
    const next = stops.findIndex(([offset]) => offset > t);
    if (next < 0) return stops.at(-1)[1];
    if (next === 0) return stops[0][1];
    const [start, a] = stops[next - 1], [end, b] = stops[next];
    return a.map((value, c) => value + (b[c] - value) * (t - start) / (end - start));
  }
  const faceColor = ({ gradients }, point) => gradients.reduce((result, gradient) => gradientColor(gradient, point)
    .map((value, c) => 255 - (255 - value) * (255 - result[c]) / 255), [0, 0, 0]);
  const close = (actual, expected) => actual.forEach((v, c) => assert.ok(Math.abs(v - expected[c]) < 1e-7, `${actual} != ${expected}`));
  const member = ourNotesFrameColors("member", 4)[0];
  close(faceColor(member, [0, 294]), [114, 0, 255]);
  close(faceColor(member, [0, 0]), [255, 102, 102]);
  // Halfway between a nine-slice vertex and the first key must be a mix,
  // not either hard color band from the old duplicated-stop implementation.
  close(faceColor(member, [0, (285 + 235.2) / 2]), [57, 127.5, 250.5]);
  const snapshot = ourNotesFrameColors("support", 4);
  assert.equal(snapshot.length, 16);
  for (const [point, expected] of [[[0, 0], [255, 128, 179]], [[326, 0], [255, 212, 0]], [[326, 184], [124, 161, 255]]]) {
    const face = snapshot.find(({ points }) => points.some(([x, y]) => x === point[0] && y === point[1]));
    close(faceColor(face, point), expected);
  }
  // The left-side triangle contains three different sampled vertex colors.
  const threeColors = snapshot.find(({ points }) => JSON.stringify(points) === JSON.stringify([[9, 9], [9, 175], [0, 175]]));
  close(faceColor(threeColors, [6, 359 / 3]), [763 / 3, 468 / 3, 434 / 3]);
  for (const kind of ["member", "support"]) {
    const solid = ourNotesFrameColors(kind, 2)[0];
    close(faceColor(solid, [0, 0]), [114, 181, 255]);
    close(faceColor(solid, [120, 150]), [114, 181, 255]);
    const sr = ourNotesFrameColors(kind, 3)[0];
    close(faceColor(sr, kind === "member" ? [0, 294] : [326, 184]), [254, 251, kind === "member" ? 148 : 178]);
    close(faceColor(sr, [0, 0]), [234, 197, 97]);
    assert.equal(ourNotesFrameColors(kind, -1), ourNotesFrameColors(kind, 0));
    assert.equal(ourNotesFrameColors(kind, 4), ourNotesFrameColors(kind, 4));
  }
});

test("catalog follows names, multi-character membership and five slots while keeping skill display separate from search", () => {
  assert.equal(ourNotesCardName(member, characters, 0), "Character One");
  assert.equal(ourNotesCardName({ ...member, name: text("") }, characters, 0), "");
  assert.equal(ourNotesSkillDescription(skill, 0, 1), "Gain 50% and 0.5s");
  assert.equal(ourNotesSkillDescription(skill, 0, 5), "Gain 100% and 1.5s");
  assert.equal(ourNotesSkillDescription(skill, 1, 5), "");
  assert.throws(() => ourNotesSkillDescription(skill, 0, 0));
  assert.throws(() => ourNotesSkillDescription({ ...skill, descriptionParameters: [] }, 0));
  assert.deepEqual(ourNotesCardSkills(support), [{ kind: "support", id: 1, slot: "support2" }]);
  const entries = [...buildOurNotesCardCatalog({ 1: member }, "member", characters, bands, skills, 0), ...buildOurNotesCardCatalog({ 70: support }, "support", characters, bands, skills, 0)];
  const query = (q) => filterOurNotesCards(entries, parseOurNotesCardFilter(q, options), bands, characters).map((row) => row.id);
  assert.deepEqual(query(""), ["70", "1"]);
  assert.deepEqual(query("q=%2370"), ["70"]);
  assert.deepEqual(query("q=jp"), ["1"]);
  assert.deepEqual(query("q=cn_intl"), ["70", "1"]);
  assert.deepEqual(query("q=SSR+cn"), ["70", "1"]);
  for (const q of ["score", "scorer", "skill", "gain", "100%", ">=100%", ">=1.5s", "heal", "plock", "just", "permanent"]) {
    assert.deepEqual(query(new URLSearchParams({ q }).toString()), [], q);
  }
  assert.deepEqual(query("q=%3E100%25"), []);
  assert.deepEqual(query("q=%2Fred"), ["1"]);
  assert.deepEqual(query("q=%2Fskill"), []);
  assert.deepEqual(query("q=%22%22"), []);
  assert.deepEqual(query("q=Second+Band&characters=1"), ["70"]);
  assert.deepEqual(query("bands=2"), ["70"]);
  assert.deepEqual(query("attributes="), []);
  assert.deepEqual(query("sort=id&direction=asc"), ["1", "70"]);
  assert.equal(entries[1].displayServer, 1);
  assert.deepEqual(entries[1].summaries, [""]);
});

test("OurNotes search uses named rarity ranks, exact identities and shared server syntax without skill conditions", () => {
  assert.deepEqual(ourNotesCardRarities("support").map((id) => OURNOTES_RARITY_NAMES[id]), ["R", "SR", "EX", "BD", "SSR"]);
  assert.deepEqual(ourNotesCardRarities("member").map((id) => OURNOTES_RARITY_NAMES[id]), ["R", "SR", "BD", "SSR"]);
  const catalog = buildOurNotesCardCatalog(Object.fromEntries(ourNotesCardRarities("support").map((rarity, i) => [String(i + 101), {
    ...support, rarity, characterIds: [rarity === 4 ? 2 : 1], description: text(rarity === 4 ? "First Band One" : "A card"),
  }])), "support", characters, bands, skills, 3);
  const filterOptions = { ...options, rarities: ourNotesCardRarities("support") };
  const query = (q, rows = catalog, patch = {}) => filterOurNotesCards(rows, { ...parseOurNotesCardFilter(new URLSearchParams({ q }).toString(), filterOptions), ...patch }, bands, characters).map((row) => row.id);
  for (const [q, expected] of [
    ["", ["105", "104", "103", "102", "101"]],
    ["r", ["101"]], ["ＳＲ", ["102"]], ["EX", ["103"]], ["bd", ["104"]], ["SSR", ["105"]],
    ["SR+", ["105", "104", "103", "102"]], [">=sr", ["105", "104", "103", "102"]],
    [">SR", ["105", "104", "103"]], ["<=EX", ["103", "102", "101"]], ["EX-", ["103", "102", "101"]],
    ["<BD", ["103", "102", "101"]], ["BD+", ["105", "104"]], ["SSR+", ["105"]], [">SSR", []],
    [">SR <SSR", ["104", "103"]], ["SSR <=BD", []],
    ["103", ["103"]], ["#103", ["103"]], ["０００１０３", ["103"]], ["#000103", ["103"]],
    ["4", []], ["0", []], ["100", []], ["100%", []], [">=100%", []], ["1.5s", []],
    ["First Band", ["104", "103", "102", "101"]], ["One", ["104", "103", "102", "101"]],
    ["/One", ["105"]], ['"First Band"', ["105"]], ['“Ｆｉｒｓｔ　Ｂａｎｄ”', ["105"]],
    ["/Snapshot", []], ["/Character", []], ["First Band SSR", []], ["/First SSR", ["105"]],
    ["/", []], ['""', []], ["#103bad", []], ["4*", []], [">=SR+", []], ["9007199254740993", []],
    ["cn kr", ["105", "104", "103", "102", "101"]], ["cn jp", []],
  ]) assert.deepEqual(query(q), expected, q);
  for (const alias of ["en", "intl", "ww", "国际服", "tw", "台服", "cn", "cn_intl", "china", "国服", "kr", "韩服"]) {
    assert.equal(query(alias).length, 5, alias);
  }
  assert.deepEqual(query("cn", catalog, { servers: [0] }), []);
  assert.deepEqual(query("SR+", catalog, { rarities: [20] }), ["104"]);
  assert.deepEqual(query("One", catalog, { characterIds: [] }), []);
  for (const invalid of ["#103bad", ">=SR+", "6*", "9007199254740993"]) {
    assert.deepEqual(query(invalid, [{ ...catalog[0], searchText: invalid }]), [], invalid);
  }
  const identity = { ...characters, 1: { ...characters[1], characterName: text("Doloris / Uika Misumi") } };
  assert.equal(filterOurNotesCards(catalog, { ...parseOurNotesCardFilter("", filterOptions), query: "Doloris / Uika Misumi" }, bands, identity).length, 4);
  assert.deepEqual(parseOurNotesCardFilter("available=cn,kr", filterOptions).servers, [3, 4]);
  assert.deepEqual(parseOurNotesCardFilter("available=cn_intl,kr", filterOptions).servers, [3, 4]);
});

test("character surnames and separate stage/personal names match identities instead of unrelated titles", () => {
  const people = {
    1: { ...characters[1], characterName: ["峰月 律", "Ritsu Minetsuki", "峰月律", "峰月律", "미네츠키 리츠"], shortName: ["律", "Ritsu", "律", "律", "리츠"] },
    2: { ...characters[2], characterName: ["ドロリス / 三角 初華", "Doloris / Uika Misumi", "Doloris / 三角初華", "Doloris / 三角初华", "돌로리스 / 미스미 우이카"], shortName: ["初華", "Uika", "初華", "初华", "우이카"] },
    3: { ...characters[1], characterName: text("Unsplit Name"), shortName: text("") },
  };
  const aliases = ["峰月", "Minetsuki", "미네츠키", "Doloris", "ドロリス", "돌로리스", "三角初华", "三角 初華", "三角初華", "Uika Misumi", "미스미 우이카", "三角", "Misumi", "미스미"];
  const title = aliases.join(" ");
  const entries = [
    ...buildOurNotesCardCatalog({ 1: member, 2: { ...member, characterId: 2 }, 3: { ...member, characterId: 3, subtitle: text(title) } }, "member", people, bands, skills, 3),
    ...buildOurNotesCardCatalog({ 70: support }, "support", people, bands, skills, 3),
  ];
  const filterOptions = { ...options, characterIds: [1, 2, 3] };
  const query = (q) => filterOurNotesCards(entries, parseOurNotesCardFilter(new URLSearchParams({ q }).toString(), filterOptions), bands, people).map((row) => row.id);
  for (const [index, alias] of aliases.entries()) assert.deepEqual(query(alias), ["70", index < 3 ? "1" : "2"], alias);
  assert.deepEqual(query("ＭＩＳＵＭＩ"), ["70", "2"]);
  assert.deepEqual(query("Doloris / Uika Misumi"), ["70", "2"]);
  assert.deepEqual(query("峰月 三角"), ["70"]);
  for (const q of ["/峰月", '"Doloris"', '"Uika Misumi"']) assert.deepEqual(query(q), ["3"], q);
  assert.deepEqual(query("Unsplit Name"), ["3"]);
});

test("reviewed band and character aliases target identities in both Member and Snapshot", () => {
  const people = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i + 1, {
    ...characters[1], bandId: Math.floor(i / 5) + 1, characterName: text(`Character ${i + 1}`), shortName: text(""),
  }]));
  people[9] = { ...people[9], characterName: text("Amoris / Nyamu Yūtenji"), shortName: text("Nyamu") };
  people[13] = { ...people[13], characterName: ["峰月 律", "Ritsu Minetsuki", "峰月律", "峰月律", "미네츠키 리츠"], shortName: ["律", "Ritsu", "律", "律", "리츠"] };
  people[15] = { ...people[15], characterName: text("千石 ユノ"), shortName: text("ユノ") };
  const groups = Object.fromEntries(["MyGO!!!!!", "Ave Mujica", "夢限大みゅーたいぷ", "millsage", "一家Dumb Rock!"].map((name, i) => [i + 1, { bandName: text(name) }]));
  const entries = [
    ...buildOurNotesCardCatalog(Object.fromEntries(Object.keys(people).map((id) => [id, { ...member, characterId: Number(id), subtitle: text("go tmr Yutenji 千石ユノ") }])), "member", people, groups, skills, 3),
    ...buildOurNotesCardCatalog({ 70: { ...support, characterIds: [1, 6, 11, 16, 21] }, 71: { ...support, characterIds: [3, 9, 13, 15] } }, "support", people, groups, skills, 3),
  ];
  const filterOptions = { ...options, bandIds: [1, 2, 3, 4, 5], characterIds: Object.keys(people).map(Number) };
  const query = (q, rows = entries) => filterOurNotesCards(rows, parseOurNotesCardFilter(new URLSearchParams({ q }).toString(), filterOptions), groups, people).map((row) => row.id).sort();
  for (const [id, aliases] of [
    [1, BANDORI_SEARCH_BAND_ALIASES[45]], [2, ["avemujica", "mujica", "ave"]],
    [3, ["mewtype", "梦限大", "夢限大", "ゆめみた", "yumemita"]], [4, ["millsage"]],
    [5, ["一家", "ikka", "dumb rock", "dumbrock"]],
  ]) for (const alias of aliases) assert.deepEqual(query(alias.toUpperCase()), entries.filter((entry) => entry.bandIds.includes(id)).map((entry) => entry.id).sort(), alias);
  for (const [target, source] of [[1, 36], [2, 37], [3, 38], [4, 39], [5, 40]]) {
    for (const alias of BANDORI_CARD_SEARCH_CHARACTER_ALIASES[source]) {
      assert.deepEqual(query(alias), entries.filter((entry) => entry.characterIds.includes(target)).map((entry) => entry.id).sort(), alias);
    }
  }
  for (const [id, aliases] of [
    [9, ["Amoris", "Nyamu Yūtenji", "yutenji", "yuutenji", "nyamu yutenji", "yutenjinyamu", "NyamuYuutenji", "yuutenji nyamu"]],
    [13, ["峰月律", "律峰月", "ritsuminetsuki", "minetsukiritsu", "Minetsuki Ritsu", "미네츠키리츠"]],
    [15, ["千石ユノ", "千石 ユノ", "ユノ千石"]],
  ]) for (const alias of aliases) assert.deepEqual(query(alias), entries.filter((entry) => entry.characterIds.includes(id)).map((entry) => entry.id).sort(), alias);
  assert.deepEqual(query("go", entries.filter((entry) => !entry.bandIds.includes(1))), []);
  assert.deepEqual(query("tmr", entries.filter((entry) => !entry.characterIds.includes(1))), []);
  assert.deepEqual(query("mg tmr"), ["1", "70"]);
  assert.equal(query("/tmr").length, 25);
  for (const alias of ["am", "ms", "idr", "arl", "nnk", "roselia", "popipa"]) assert.deepEqual(query(alias, entries.map((entry) => ({ ...entry, searchText: "" }))), [], alias);
});

test("server preferences default independently, preserve Bandori storage and survive reload or unavailable storage", () => {
  const previousWindow = globalThis.window;
  const values = new Map();
  const bandoriKey = "hhwx:bandori:preferred-server:v1";
  const ourNotesKey = "hhwx:ournotes:preferred-server:v1";
  const reset = () => [bandoriStore, ourNotesStore].forEach((store) => store.setState(store.getInitialState(), true));
  const hydrate = () => [bandoriStore, ourNotesStore].forEach((store) => store.getState().hydratePreferredServer());
  try {
    globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
    assert.equal(legacyBandoriStore, bandoriStore);
    reset(); hydrate();
    assert.equal(bandoriStore.getState().preferredServer, 3);
    assert.equal(ourNotesStore.getState().preferredServer, 3);
    assert.equal(values.size, 0); // Defaults are not written until the user chooses.
    bandoriStore.getState().setPreferredServer(0);
    ourNotesStore.getState().setPreferredServer(4);
    assert.deepEqual([...values], [[bandoriKey, "0"], [ourNotesKey, "4"]]);
    reset(); hydrate();
    assert.equal(bandoriStore.getState().preferredServer, 0);
    assert.equal(ourNotesStore.getState().preferredServer, 4);
    values.set(ourNotesKey, "1"); hydrate();
    assert.equal(ourNotesStore.getState().preferredServer, 4); // Hydration cannot overwrite live state.
    for (const invalid of ["5", "cn_intl", "", "NaN", "1.5"]) {
      values.set(ourNotesKey, invalid); reset(); hydrate();
      assert.equal(ourNotesStore.getState().preferredServer, 3);
    }
    values.set(bandoriKey, "4"); reset(); hydrate();
    assert.equal(bandoriStore.getState().preferredServer, 3);
    globalThis.window = { get localStorage() { throw new Error("Storage blocked"); } };
    reset(); hydrate();
    ourNotesStore.getState().setPreferredServer(2);
    ourNotesStore.getState().setPreferredServer(5);
    assert.equal(ourNotesStore.getState().preferredServer, 2);
    assert.equal(bandoriStore.getState().preferredServer, 3);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    reset();
  }
});

test("OurNotes display resolves availability once, independently of list filters and missing regional fields", () => {
  assert.equal(getOurNotesServerFromCode(" CN_INTL "), 3);
  assert.equal(getOurNotesServerFromCode(" CN "), 3);
  assert.equal(getOurNotesServerFromCode("KR"), 4);
  assert.equal(getOurNotesServerFromCode("cn"), 3);
  assert.equal(getOurNotesServerFromCode("3"), null);
  assert.equal(normalizeOurNotesServer("4"), 4);
  assert.equal(normalizeOurNotesServer(1.5), null);
  assert.equal(pickAvailableOurNotesServer([4, 2, 1], 4), 4);
  assert.equal(pickAvailableOurNotesServer([4, 2, 1], 3), 1);
  assert.equal(pickAvailableOurNotesServer([], 3), null);
  assert.equal(pickOurNotesRegionalText(["JP", "", "TW", "", "KR"], 3), "JP");
  const regional = ["JP", "EN", "TW", "CN_INTL", "KR"];
  const cards = {
    1: { ...member, name: regional, subtitle: regional, serverExtensions: [{}, null, null, null, {}] },
    2: { ...member, name: text(""), subtitle: text("") },
    3: { ...member, serverExtensions: [null, null, null, null, null] },
  };
  const entries = buildOurNotesCardCatalog(cards, "member", characters, bands, skills, 3);
  assert.equal(entries.length, 2);
  assert.deepEqual([entries[0].displayServer, entries[0].name, entries[0].title, entries[0].summaries], [0, "JP", "JP", ["Gain 100% and 1.5s"]]);
  assert.deepEqual([entries[1].displayServer, entries[1].name, entries[1].title], [3, "", ""]);
  assert.equal(filterOurNotesCards(entries, parseOurNotesCardFilter("available=kr&server=en", options), bands, characters).find((entry) => entry.id === "1").displayServer, 0);
  assert.equal(buildOurNotesCardCatalog(cards, "member", characters, bands, skills, 4)[0].displayServer, 4);
});

test("catalog summaries show each nonzero skill slot on its own at level 5 without grouping categories or filling missing text", () => {
  const makeSkill = (name) => ({ ...skill, description: [`${name} {0}`, "", "", `${name} {0}`, ""] });
  const catalogSkills = {
    leader: { 1: makeSkill("Leader") }, live: { 1: makeSkill("Live") }, gekisou: { 1: makeSkill("Gekisou") },
    support: { 1: makeSkill("Support 1"), 2: makeSkill("Support 2") },
    gekisouSupport: { 1: makeSkill("Gekisou support 1"), 2: makeSkill("Gekisou support 2") },
  };
  const summaries = (card, kind, server = 3) => buildOurNotesCardCatalog({ 1: card }, kind, characters, bands, catalogSkills, server)[0].summaries;
  assert.deepEqual(summaries({ ...member, leaderSkillId: 1, gekisouSkillId: 1 }, "member"), [
    "Leader 100", "Live 100", "Gekisou 100",
  ]);
  assert.deepEqual(summaries({ ...support, supportSkillId01: 1, supportSkillId02: 2 }, "support"), ["Support 1 100", "Support 2 100"]);
  assert.deepEqual(summaries({ ...support, gekisouSupportSkillId01: 1 }, "support"), ["Support 1 100", "Gekisou support 1 100"]);
  const fullSupport = { ...support, supportSkillId01: 1, supportSkillId02: 2, gekisouSupportSkillId01: 1, gekisouSupportSkillId02: 2 };
  assert.deepEqual(summaries(fullSupport, "support"), [
    "Support 1 100", "Support 2 100", "Gekisou support 1 100", "Gekisou support 2 100",
  ]);
  assert.deepEqual(summaries(fullSupport, "support", 1), ["", "", "", ""]);
  assert.deepEqual(summaries({ ...member, liveSkillId: 99 }, "member"), [""]);
  assert.deepEqual(summaries({ ...member, liveSkillId: 0 }, "member"), []);
});

test("official attribute names and existing color aliases match the same card type", () => {
  const names = [["绯红", "Ruby", "red"], ["绀碧", "Azure", "blue"], ["翡翠", "Jade", "green"], ["琉金", "Amber", "yellow"], ["紫苑", "Violet", "purple"]];
  const cards = Object.fromEntries(names.map((_, index) => [index + 1, { ...member, cardType: index + 1 }]));
  const entries = buildOurNotesCardCatalog(cards, "member", characters, bands, skills, 0);
  for (const [index, aliases] of names.entries()) {
    for (const name of aliases) {
      const filter = parseOurNotesCardFilter(new URLSearchParams({ q: name }).toString(), options);
      assert.deepEqual(filterOurNotesCards(entries, filter, bands, characters).map((entry) => entry.id), [String(index + 1)]);
    }
  }
});

test("URL filters preserve explicit empty groups and restore safe lists across detail and kind changes", () => {
  const original = "kind=support&q=score&bands=2&characters=1&rarities=10";
  const changed = updateOurNotesCardsQuery(original, { servers: [], attributes: [1, 2, 3, 4, 5] }, options);
  assert.deepEqual(parseOurNotesCardFilter(changed, options).servers, []);
  const switched = switchOurNotesCardsKind(changed, "member");
  assert.equal(new URLSearchParams(switched).get("q"), "score");
  assert.equal(new URLSearchParams(switched).get("characters"), "1");
  assert.equal(new URLSearchParams(switched).has("rarities"), false);
  const href = ourNotesCardsListHref(original + "&redirect=https://example.com&server=jp", "support");
  assert.equal(href, "/ournotes/cards?kind=support&q=score&bands=2&rarities=10&characters=1");
  assert.deepEqual(parseOurNotesCardFilter("characters=1junk,2&sort=unknown", options).characterIds, [2]);
  assert.equal(parseOurNotesCardFilter("sort=unknown", options).sortBy, "id");
});

test("image index validates content-addressed paths and keeps missing variants unavailable", () => {
  const hash = "a".repeat(64);
  const image = { key: `ournotes/cards/member/100/thumbnail/${hash}.png`, sha256: hash, width: 384, height: 512, size: 100 };
  const raw = { schema: "ournotes-card-assets-index-v1", resources: { member: { 100: { thumbnail: image } }, support: {} } };
  const index = parseOurNotesCardsAssetIndex(raw);
  assert.equal(ourNotesImageUrl(index, "member", 100, "thumbnail"), "https://cdn.hhwx.org/" + image.key);
  assert.equal(ourNotesImageUrl(index, "member", 100, "full"), null);
  assert.equal(ourNotesImageUrl(index, "support", 100, "thumbnail"), null);
  assert.match(ourNotesAttributeIcon(2), /sp_icon_member_card_type_2.png$/u);
  assert.equal(ourNotesAttributeIcon(0), null);
  for (const patch of [{ key: "https://example.com/image.png" }, { key: image.key.replace("member", "support") }, { sha256: "bad" }, { width: 0 }]) {
    assert.throws(() => parseOurNotesCardsAssetIndex({ ...raw, resources: { ...raw.resources, member: { 100: { thumbnail: { ...image, ...patch } } } } }));
  }
});

test("catalog sorting only accepts card ID and removes unsupported sort state", () => {
  assert.deepEqual(OURNOTES_SORTS, ["id"]);
  for (const removed of ["rarity", "attribute", "performance", "technic", "visual"]) {
    const query = `sort=${removed}&direction=asc&q=dream`;
    assert.equal(parseOurNotesCardFilter(query, options).sortBy, "id");
    assert.equal(new URLSearchParams(updateOurNotesCardsQuery(query, { query: "red" }, options)).has("sort"), false);
    assert.equal(new URLSearchParams(switchOurNotesCardsKind(query, "support")).has("sort"), false);
    assert.equal(ourNotesCardsListHref(query), "/ournotes/cards?q=dream&direction=asc");
  }
});

// Exercise both regional adapters through the actual shared switcher and icon.
test("shared server controls preserve four-server behavior and present the OurNotes CN_INTL slot as CN", () => {
  const jsx = (type, props) => ({ type, props });
  function load(path, imports) {
    const source = readFileSync(new URL("../src/" + path, import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } });
    const exports = {};
    runInNewContext(outputText, { exports, require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "@/lib/utils") return { cn: (...values) => values.filter(Boolean).join(" ") };
      if (name === "@/i18n/navigation") return { Link: "a" };
      if (imports[name]) return imports[name];
      throw new Error("Unexpected import: " + name);
    } });
    return exports;
  }
  const icon = load("components/ServerIcon.tsx", {});
  const shared = load("components/ServerSwitcher.tsx", { "@/components/ServerIcon": icon });
  const bandori = load("app/[locale]/bandori/cards/_components/BandoriCardServerSwitcher.tsx", {
    "@/components/ServerSwitcher": shared,
    "@/lib/bandori-server": { BANDORI_SERVERS: [0, 1, 2, 3], getBandoriServerCode: (slot) => ["jp", "en", "tw", "cn"][slot] },
  });
  function nodes(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    if (typeof node.type === "function") return nodes(node.type(node.props));
    return [node, ...nodes(node.props?.children)];
  }
  const calls = [];
  const tree = nodes(shared.default({ servers: [0, 1, 2, 3, 4], getCode: (slot) => OURNOTES_SERVER_CODES[slot],
    selectedServer: 3, availableServers: [0, 2, 3], label: "Server", onChange: (slot) => calls.push(slot) }));
  const buttons = tree.filter((node) => node.type === "button");
  assert.deepEqual(buttons.map((node) => node.props["aria-label"]), ["JP", "EN", "TW", "CN", "KR"]);
  assert.equal(buttons[3].props["aria-pressed"], true);
  assert.equal(buttons[4].props.disabled, true);
  buttons[4].props.onClick(); buttons[2].props.onClick();
  assert.deepEqual(calls, [2]);
  assert.deepEqual(tree.filter((node) => node.type === "img").map((node) => node.props.src), ["jp", "en", "tw", "cn", "kr"].map((code) => "/res/server-icons/" + code + ".svg"));
  const links = nodes(bandori.default({ selectedServer: 3, label: "Server", getHref: (slot) => "?server=" + slot, replace: true })).filter((node) => node.type === "a");
  assert.deepEqual(links.map((node) => node.props["aria-label"]), ["JP", "EN", "TW", "CN"]);
  assert.equal(links[3].props["aria-current"], "page");
  assert.ok(links.every((node) => node.props.replace));
  assert.match(readFileSync(new URL("../public/res/server-icons/kr.svg", import.meta.url), "utf8"), /viewBox="0 0 512 512"/u);
});
