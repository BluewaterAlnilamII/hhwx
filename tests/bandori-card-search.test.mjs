import assert from "node:assert/strict";
import test from "node:test";
import { buildBandoriCardSearchData, buildBandoriCardSearchMetadata, compileBandoriCardSearch } from "../src/lib/bandori/cards/search.ts";
import { BANDORI_CARD_SEARCH_BAND_ALIASES, BANDORI_CARD_SEARCH_CHARACTER_ALIASES } from "../src/lib/bandori/cards/search-aliases.ts";
import { BANDORI_CARD_CATALOG_TYPES, buildBandoriCardsPageCatalog, filterBandoriCardsPageCatalog } from "../src/lib/bandori/cards/cards-page-catalog.ts";
import { buildBandoriCardCatalog, filterBandoriCardCatalog } from "../src/lib/bandori/cards/picker-catalog.ts";
import { buildBandoriProfileCardEntry, filterAndSortBandoriProfileCardEntries } from "../src/lib/bandori/cards/profile-card-collection.ts";
import { materializeBandoriCardsMasterForServer, materializeBandoriCardsMasterForServerWithJpFallback } from "../src/lib/bandori/cards/api-client.ts";

const regions = (value) => [value, value, value, value];
const scoreEffect = (value) => ({ activateEffectValue: regions(value) });
const entry = (overrides = {}) => ({
  cardId: 999, bandId: 5, characterId: 22, rarity: 4, attribute: "cool",
  availableServers: [0, 1, 2, 3], type: "limited", filterSearchText: "", searchNames: [], searchSkills: [],
  ...overrides,
});
const matches = (query, overrides = {}) => compileBandoriCardSearch(query)(entry(overrides));
const skillEntry = (skill, server = 0) => buildBandoriCardSearchData({
  characterId: 1, skillId: 1, serverExtensions: regions({}),
}, server, buildBandoriCardSearchMetadata({}, { 1: skill }));

test("slash and quoted searches match only multilingual card names", () => {
  const data = buildBandoriCardSearchData({
    characterId: 1, skillId: 1, prefix: ["Special day", "Hello, Happy World! 26", "星光", "星空"], serverExtensions: regions({}),
  }, null, buildBandoriCardSearchMetadata(
    { 1: { firstName: regions("Kasumi") } },
    { 1: { description: regions("Skill description"), activationEffect: { activateEffectTypes: { score: scoreEffect(135) } } } },
  ));
  for (const query of ['/special', '"special"', '“ＳＰＥＣＩＡＬ”', '"Hello, Happy World!"', '/"Hello, Happy World!"', '/26', '/星空', '"星光"', '/special en', '"special day" cool']) {
    assert.ok(matches(query, data), query);
  }
  assert.equal(matches("special", data), false);
  for (const query of ['/kasumi', '"description"', '/135', '"day hello"', '/', '""', '“”', '"missing', '/special jp en happy']) {
    assert.equal(matches(query, data), false, query);
  }
  assert.ok(matches('"special day', data)); // An unfinished quote still constrains the full remaining text.
  assert.equal(matches('/special', { ...data, availableServers: [] }), true); // Availability remains a separate condition.
  assert.equal(matches('/special en', { ...data, availableServers: [] }), false);
});

test("bare integers union ID, rarity and skill; explicit syntax stays exact", () => {
  const data = skillEntry({ activationEffect: { activateEffectTypes: { score: scoreEffect(115) } } });
  assert.ok(matches("115", { cardId: 115 }));
  assert.ok(matches("115", data));
  assert.ok(matches("115%", data));
  assert.equal(matches("#115", data), false);
  assert.equal(matches("115%", { cardId: 115 }), false);
  assert.ok(matches("4", { cardId: 4, rarity: 2 }));
  assert.ok(matches("4"));
  assert.ok(matches("5", { rarity: 5 }));
  assert.ok(matches("1", { rarity: 1 }));
  assert.equal(matches("4*", { cardId: 4, rarity: 2 }), false);
  assert.equal(matches("55", { rarity: 55 }), false);
  assert.ok(matches("０００４　ＣＯＯＬ"));
  assert.equal(matches("4 cool", { cardId: 4, rarity: 2, attribute: "happy" }), false);
  assert.equal(matches("4 5"), false);
  assert.ok(matches("4 5", { cardId: 5, rarity: 4 }));
});

test("rarity bounds, invalid explicit syntax and zero matches never drop a condition", () => {
  for (const [query, expected] of [
    ["4*", true], ["4+", true], ["4*+", true], ["4-", true], ["4*-", true],
    [">4", false], [">4*", false], ["<4", false], ["<4*", false],
    [">3", true], ["<5", true], ["5*", false],
    [">=4", true], ["<=4", true], [">=4*", true], ["<=4*", true],
  ]) assert.equal(matches(query), expected, query);
  for (const query of ["6*", "55*", "#10001abc", "#0", "4**", ">==4", "#999999", "999%", "9007199254740993"])
    assert.equal(matches(query, { filterSearchText: query }), false, query);
  assert.ok(matches("115.5%", skillEntry({ activationEffect: { activateEffectTypes: { score: scoreEffect(115.5) } } })));
  assert.equal(matches("en+"), false);
});

test("skill comparisons preserve inclusive boundaries, explicit units and token unions", () => {
  const withRate = (rate) => skillEntry({ activationEffect: { activateEffectTypes: { score: scoreEffect(rate) } } });
  for (const [queries, expected] of [
    [["115+", "115%+", ">=115", ">=115%"], [false, true, true]],
    [["115-", "115%-", "<=115", "<=115%"], [true, true, false]],
    [[">115", ">115%"], [false, false, true]],
    [["<115", "<115%"], [true, false, false]],
  ]) {
    for (const query of queries) {
      for (const [index, rate] of [110, 115, 120].entries())
        assert.equal(matches(query, withRate(rate)), expected[index], `${query}: ${rate}`);
      assert.equal(matches(query), false, "Missing skill metadata is not zero or a matching card ID");
    }
  }
  const lowRarity = { ...withRate(115), rarity: 2 };
  assert.ok(matches(">4", lowRarity));
  assert.ok(matches("4+", lowRarity));
  assert.ok(matches(">4%", lowRarity));
  assert.equal(matches(">4*", lowRarity), false);
  assert.equal(matches("4*+", lowRarity), false);
  assert.ok(matches(">=4", lowRarity));
  assert.ok(matches(">=4%", lowRarity));
  assert.equal(matches(">=4*", lowRarity), false);
  assert.ok(matches("<=4", lowRarity));
  assert.ok(matches("<=4*", lowRarity));
  assert.equal(matches("<=4%", lowRarity), false);
  assert.ok(matches(">4", { rarity: 5 }));
  assert.equal(matches(">4%", { rarity: 5 }), false);
  assert.ok(matches("4-", lowRarity));
  assert.equal(matches("4%-", lowRarity), false);
  assert.ok(matches("<4", lowRarity));
  assert.equal(matches("<4%", lowRarity), false);
  assert.ok(matches("115%+ <120% 分卡", withRate(115)));
  assert.equal(matches("115%+ <120% 分卡", withRate(120)), false);
  assert.ok(matches("＞１１５％", withRate(120)));
  assert.ok(matches("＞＝１１５％", withRate(115)));
  assert.ok(matches(">=115% <=115% 分卡", withRate(115)));
  assert.equal(matches(">=115% <=115% 分卡", withRate(120)), false);
  assert.ok(matches("115.5%+", withRate(115.5)));
  assert.ok(matches("<115.5%", withRate(115)));
  assert.ok(matches(">=115.5%", withRate(115.5)));
  assert.ok(matches("<=115.5%", withRate(115.5)));
  assert.ok(matches("0%+", withRate(0)));
  assert.equal(matches("0%+"), false);
  for (const query of [">6*", ">=6*", "115*+", "#115+", ">#115", ">=#115", "<==115%", ">=115%+", "115+%", "115%++", ">115%+", "4%*+", "115.5+"])
    assert.equal(matches(query, { ...withRate(120), filterSearchText: query }), false, query);
  const growing = skillEntry({ activationEffect: { activateEffectTypes: {
    score: scoreEffect(100), score_rate_up_with_perfect: scoreEffect(0),
  } }, description: regions("Starts at 100%, grows to 150%") });
  assert.ok(matches("100%+", growing));
  assert.equal(matches(">100%", growing), false);
  const conditional = skillEntry({ activationEffect: { activateEffectTypes: {
    score: scoreEffect(125), score_continued_note_judge: scoreEffect(135),
  } } });
  assert.ok(matches(">125%", conditional));
  assert.equal(matches("125%-", conditional), false);
});

test("every reviewed band and character alias matches its exact target", () => {
  for (const [id, aliases] of Object.entries(BANDORI_CARD_SEARCH_BAND_ALIASES)) {
    for (const alias of aliases) assert.ok(matches(alias.toUpperCase(), { bandId: Number(id) }), alias);
  }
  for (const [id, aliases] of Object.entries(BANDORI_CARD_SEARCH_CHARACTER_ALIASES)) {
    for (const alias of aliases) assert.ok(matches(alias, { characterId: Number(id) }), alias);
  }
  for (const [alias, id] of [["r", 5], ["m", 21], ["go", 45], ["raise", 18], ["suilen", 18]]) {
    assert.ok(matches(alias, { bandId: id }));
    assert.equal(matches(alias, { bandId: 99 }), false);
  }
  for (const [alias, id] of [["msk", 15], ["okusawa misaki", 15], ["misakiokusawa", 15], ["chu²", 35], ["chuchu", 35], ["saaya", 4], ["touko", 27], ["raana", 38], ["shiina", 40], ["rinrin", 25]])
    assert.ok(matches(alias, { characterId: id }), alias);
  const reviewedShortNames = [
    ["ksm", 1], ["ars", 5], ["hmr", 8], ["tme", 9], ["tgm", 10],
    ["kkr", 11], ["kor", 12], ["hgm", 13], ["msk", 15], ["cst", 18],
    ["ykn", 21], ["msr", 26], ["nnm", 28], ["tks", 29], ["tmr", 36],
  ];
  for (const [alias, targetId] of reviewedShortNames) {
    for (const id of Object.keys(BANDORI_CARD_SEARCH_CHARACTER_ALIASES)) {
      assert.equal(matches(alias.toUpperCase(), {
        characterId: Number(id), filterSearchText: alias,
      }), Number(id) === targetId, `${alias} must match only character ${targetId}`);
    }
  }
  for (const id of [17, 22]) assert.ok(matches("hikawa", { characterId: id }));
  for (const id of [9, 24]) assert.ok(matches("宇田川", { characterId: id }));
  assert.equal(matches("msk", { characterId: 34 }), false);
  assert.ok(matches("RAISE  A   SUILEN cool", { bandId: 18 }));
  assert.ok(matches("Hello, Happy World! cool", { bandId: 3 }));
  assert.equal(matches("a", { bandId: 18 }), false);
  assert.equal(matches("ros", { bandId: 5 }), false);
  for (const alias of ["o-tae", "o'tae", "rimirin", "りみりん", "lisacchi", "白白", "小白", "r团", "r團", "kokoron", "こころん", "ふーすけ", "筑筑", "小筑", "猫猫", "貓貓", "rnk", "mskk", "ykls"]) {
    for (const id of Object.keys(BANDORI_CARD_SEARCH_CHARACTER_ALIASES))
      assert.equal(matches(alias, { characterId: Number(id) }), false, alias);
    assert.ok(matches(alias, { filterSearchText: alias }), "Excluded aliases may still match ordinary text");
  }
});

test("attributes, types, servers and text use the same token intersection", () => {
  assert.ok(matches("r 藍 lim jp en"));
  assert.equal(matches("r mygo"), false);
  assert.equal(matches("jp en", { availableServers: [0] }), false);
  assert.ok(matches("国服 df", { availableServers: [3], type: "dreamfes" }));
  assert.ok(matches("kira", { type: "kirafes" }));
  assert.ok(matches("free", { type: "initial" }));
  assert.ok(matches("login", { type: "campaign" }));
  assert.ok(matches("special", { type: "special" }));
  assert.equal(matches("happy", { filterSearchText: "happy" }), false);
  assert.ok(matches("星空 memory", { filterSearchText: "星空の記憶 a special memory" }));
  assert.equal(matches("星空 missing", { filterSearchText: "星空の記憶" }), false);
  assert.ok(matches("   "));
});

test("skill types, conditional maximum and per-note initial rate use current metadata", () => {
  const conditional = skillEntry({ activationEffect: { activateEffectTypes: {
    score: scoreEffect(125), score_continued_note_judge: scoreEffect(135),
  } } });
  assert.ok(matches("135% 分", conditional));
  assert.equal(matches("125%", conditional), false);
  const unified = skillEntry({ activationEffect: {
    activateEffectTypes: { score: scoreEffect(95) }, unificationActivateEffectValue: 115,
  } });
  assert.ok(matches("115 分卡", unified));
  const growing = skillEntry({ activationEffect: { activateEffectTypes: {
    score: scoreEffect(100), score_rate_up_with_perfect: scoreEffect(0),
  } }, description: regions("Score 100%, then +0.5% per PERFECT, up to 150%") });
  assert.ok(matches("100% scorer", growing));
  assert.equal(matches("150%", growing), false);
  const mixed = skillEntry({ activationEffect: { activateEffectTypes: {
    score: scoreEffect(100), judge: scoreEffect(0),
  } }, onceEffect: { onceEffectType: "life", onceEffectValue: [200, 220, 240, 270, 300] } });
  for (const query of ["100% 奶", "100% 奶卡", "100% 判", "100% 判卡", "heal plock", "healer"])
    assert.ok(matches(query, mixed), query);
  assert.equal(matches("scorer", mixed), false);
  assert.equal(matches("分卡", mixed), false);
  assert.equal(matches("300%", mixed), false);
  assert.equal(matches("lock", mixed), false);
  assert.ok(matches("lock", { ...mixed, characterId: 32 }));
  const absent = skillEntry({ activationEffect: {
    activateEffectTypes: { score: { activateEffectValue: [130, null, 130, null] } },
    unificationActivateEffectValue: 145,
  } }, 3);
  assert.equal(matches("145%", absent), false);
  assert.equal(matches("0%", absent), false);
  assert.equal(matches("scorer"), false);
});

test("catalog and selectors share search semantics within each candidate scope", () => {
  const chars = { 1: { bandId: 1, firstName: ["香澄", "Kasumi", "香澄", "香澄"] }, 21: { bandId: 1 }, 22: { bandId: 3 } };
  const card = (overrides) => ({ characterId: 1, rarity: 4, attribute: "cool", type: "limited", resourceSetName: "res001001", ...overrides });
  const cards = {
    7: card({ prefix: ["星空", "Starlight", "星光", null], skillId: 1, serverExtensions: [{}, null, null, {}] }),
    8: card({ prefix: regions("No skill data"), serverExtensions: regions({}) }),
    10001: card({ characterId: 21, rarity: 2, resourceSetName: "res021500", prefix: [null, "English entity", null, "中文实体"], skillName: [null, "English ability", null, "中文能力"], skillId: 1,
      serverExtensions: [null, {}, null, { characterId: 22, skillId: 2, resourceSetName: "res022900" }] }),
  };
  const skills = {
    1: { activationEffect: { activateEffectTypes: { score: scoreEffect(100) } }, description: ["日本語説明", "English skill", "繁體說明", null] },
    2: { activationEffect: { activateEffectTypes: { score: scoreEffect(135) } }, description: regions("另一种技能") },
  };
  const filter = { query: "", servers: [0, 1, 2, 3], bandIds: [1, 3], characterIds: [1, 21, 22], attributes: ["cool", "happy", "pure", "powerful"], rarities: [1, 2, 3, 4, 5], types: [...BANDORI_CARD_CATALOG_TYPES], sortBy: "release_cn", sortDirection: "desc" };
  for (const preferredServer of [0, 1, 2, 3]) {
    const catalog = buildBandoriCardsPageCatalog(cards, chars, skills, preferredServer, { card: String, character: String, skill: "" });
    const run = (query, patch = {}) => filterBandoriCardsPageCatalog(catalog, { ...filter, query, ...patch }, [1, 3], [1, 21, 22]).map((row) => row.cardRef);
    assert.deepEqual(run("#10001"), ["1:10001", "3:10001"]);
    assert.deepEqual(run("#10001 en"), ["1:10001"]);
    assert.deepEqual(run('"English entity"'), ["1:10001"]);
    assert.deepEqual(run('/中文实体'), ["3:10001"]);
    assert.deepEqual(run("#10001 cn"), ["3:10001"]);
    assert.deepEqual(run("#10001 en", { servers: [3] }), []);
    assert.deepEqual(run("#10001 English"), ["1:10001"]); // English is the EN server keyword.
    assert.deepEqual(run("#10001 entity"), ["1:10001"]);
    assert.deepEqual(run("#10001 中文实体"), ["3:10001"]);
    assert.deepEqual(run("#10001 100%"), ["1:10001"]);
    assert.deepEqual(run("#10001 135%"), ["3:10001"]);
    assert.deepEqual(run("#10001 另一种技能"), ["3:10001"]);
    assert.deepEqual(run("#7 starlight", { servers: [3] }), ["7"]);
    assert.deepEqual(run("#7 星空 日本語説明"), ["7"]);
    assert.deepEqual(run("#7 星光 繁體說明"), ["7"]);
    assert.deepEqual(run("#8"), ["8"]);
    assert.deepEqual(run("#8 分"), []);
    const before = catalog.map((row) => row.cardRef);
    assert.equal(run("", { sortDirection: "asc" }).length, 4);
    assert.deepEqual(catalog.map((row) => row.cardRef), before);
    const picker = buildBandoriCardCatalog(cards, chars, preferredServer, true, undefined, undefined, { skills });
    for (const query of ["", "en", "#10001", "#10001 中文实体", "#10001 135%", "starlight", '"starlight"', '/中文实体', '"English entity"', "ksm", "cool 4*+", "100% 分卡", "lim jp", "99999"]) {
      assert.deepEqual(
        filterBandoriCardCatalog(picker, { ...filter, query }).map((row) => row.cardRef),
        run(query),
        `Catalog and avatar picker: ${preferredServer}, ${query}`,
      );
    }
  }

  const scopedCards = materializeBandoriCardsMasterForServer(cards, 3);
  const scopedFilter = { ...filter, servers: [3] };
  const picker = buildBandoriCardCatalog(scopedCards, chars, 3, false, 3, undefined, { canonicalCards: cards, skills });
  const searchContext = { canonicalCards: cards, metadata: buildBandoriCardSearchMetadata(chars, skills) };
  const ownedCard = (cardId, overrides = {}) => ({ cardId, level: 1, masterRank: 0, skillLevel: 1, episodeCount: 0, isTrained: false, hasTrainedArt: false, isExcluded: false, ...overrides });
  const ownedEntry = (card) => buildBandoriProfileCardEntry(card, scopedCards, chars, skills, {}, "zh-CN", 3, 3, "", searchContext);
  const owned = [7, 8, 10001].map((id) => ownedEntry(ownedCard(id)));
  const options = { availableBandIds: [1, 3], availableCharacterIds: [1, 21, 22], unknownMetadataPolicy: "include-when-unfiltered" };
  const runOwned = (query, patch = {}, entries = owned) => filterAndSortBandoriProfileCardEntries(entries, { ...scopedFilter, query, ...patch }, options).map((row) => row.card.cardId);
  for (const [query, expected] of [
    ["en", [8]], ["#10001 en", []], ["#10001 cn", [10001]], ["#10001 135%", [10001]],
    ["#10001 100%", []], ["#10001 entity", []], ["#7 starlight", [7]], ["#7 星空 日本語説明", [7]],
    ["#7 100% 分卡", [7]], ["99999", []],
    ['"English entity"', []], ['/中文实体', [10001]], ['/starlight', [7]], ['"English skill"', []],
  ]) {
    assert.deepEqual(runOwned(query), expected, `Owned scope: ${query}`);
    assert.deepEqual(filterBandoriCardCatalog(picker, { ...scopedFilter, query }).map((row) => row.cardId), expected, `Fixed-server picker: ${query}`);
  }
  assert.deepEqual(runOwned("", { types: ["permanent"] }), []);
  assert.deepEqual(runOwned("", { types: [] }), []);
  assert.deepEqual(filterBandoriCardCatalog(picker, { ...scopedFilter, types: [] }), []);
  const changedOwned = owned.map((row) => ({ ...ownedEntry(ownedCard(row.card.cardId, { skillLevel: 5, level: 60, isTrained: true })), totalPower: 99999 }));
  assert.deepEqual(runOwned("100%", {}, changedOwned), runOwned("100%"));
  assert.deepEqual(runOwned("99999", {}, changedOwned), []);
  const unknown = ownedEntry(ownedCard(54321));
  assert.deepEqual(runOwned("#54321", {}, [unknown]), [54321]);
  assert.deepEqual(runOwned("#54321", { types: ["limited"] }, [unknown]), []);
  assert.deepEqual(runOwned("<4*", {}, [unknown]), []);

  const withJpOnly = { ...cards, 9: card({ prefix: regions("JP fallback"), serverExtensions: [{}, null, null, null] }) };
  const fallbackPicker = buildBandoriCardCatalog(materializeBandoriCardsMasterForServerWithJpFallback(withJpOnly, 3), chars, 3, false, 3, undefined, { canonicalCards: withJpOnly, skills, availabilityScope: [3, 0] });
  assert.deepEqual(filterBandoriCardCatalog(fallbackPicker, { ...filter, servers: [3, 0], query: "#9 jp" }).map((row) => row.cardId), [9]);
  assert.deepEqual(filterBandoriCardCatalog(fallbackPicker, { ...filter, servers: [3, 0], query: "#9 cn" }), []);
});
