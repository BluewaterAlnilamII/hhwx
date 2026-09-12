import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { ApiRouteError } from "../src/lib/api-contracts.ts";
import { parseBandoriPlayerResponse, redactBandoriPlayerProfile, PLAYER_UID_PATTERN, PLAYER_BAND_ORDER, isPlayerDataFresh, retainPlayerDataOnError, playerErrorMessageKey } from "../src/lib/bandori/player-profile.ts";
import { buildBandoriBandLogoUrl, buildBandoriDeckRankSpriteUrls, buildBandoriPlayerSpriteUrl } from "../src/lib/bandori-builtin-resources.ts";
import { calculatePlayerPower, getPlayerCharacterBonusParameters } from "../src/lib/bandori/player-power.ts";
import { calculateFixedTeamParameters } from "../src/lib/bandori/medley-foundation/parameters.ts";
import { formatLocalizedInteger } from "../src/lib/localized-format.ts";

const serverBoundary = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "server-only" ? "next/dist/compiled/server-only/empty" : specifier, context);
  },
});
const { fetchBandoriPlayerProfile, normalizeBandoriPlayerServer } = await import("../src/lib/bandori-player-fetcher.ts");
serverBoundary.deregister();

function sample() {
  const profile = {
    userId: "9007199254740997", userName: "Synthetic player", rank: 263, introduction: "Synthetic comment",
    publishUserIdFlg: false, publishBandRankFlg: true, publishMusicClearedFlg: true,
    publishMusicFullComboFlg: false, publishMusicAllPerfectFlg: true, publishHighScoreRatingFlg: true,
    publishDeckRankFlg: true, publishStageChallengeAchievementConditionsFlg: false, publishCharacterRankFlg: true,
    mainUserDeck: { leader: 2402 },
    mainDeckUserSituations: { entries: [
      { situationId: 2401, level: 60, illust: "normal", limitBreakRank: 0, skillLevel: 5, userAppendParameter: { performance: 9999 } },
      { situationId: 2402, level: 60, illust: "normal", trainingStatus: "done", limitBreakRank: 4, skillLevel: 5 },
    ] },
    userProfileSituation: { situationId: 2403, illust: "after_training", viewProfileSituationStatus: "profile_situation" },
    userProfileDegreeMap: { entries: { first: { degreeId: 100 }, second: { degreeId: 101 } } },
    bandRankMap: { entries: { 1: 0, 2: 50 } },
    userMusicClearInfoMap: { entries: { easy: { clearedMusicCount: 0, fullComboMusicCount: 99, allPerfectMusicCount: 3 } } },
    enabledUserAreaItems: { entries: [{ areaItemId: 1 }] },
    stageChallengeAchievementConditionsMap: { entries: { 1: 77 } },
    userDeckTotalRatingMap: { entries: { 1: { rank: "ss", level: 5, score: 10013490 } } },
    userCharacterRankMap: { entries: { 1: { rank: 100 } } },
    userHighScoreRating: Object.fromEntries([
      "userPoppinPartyHighScoreMusicList", "userAfterglowHighScoreMusicList", "userPastelPalettesHighScoreMusicList",
      "userRoseliaHighScoreMusicList", "userHelloHappyWorldHighScoreMusicList", "userMorfonicaHighScoreMusicList",
      "userRaiseASuilenHighScoreMusicList", "userMyGOScoreMusicList", "userOtherHighScoreMusicList",
    ].map((field, index) => [field, { entries: [{ musicId: 1, rating: index + 1, difficulty: "expert" }] }])),
  };
  return { success: true, data: { server: "jp", uid: profile.userId, cache: true, fetchedAt: new Date().toISOString(), profile } };
}

test("privacy redaction removes protected values without changing the source or hiding the supplied ID", () => {
  const input = sample();
  const original = structuredClone(input.data.profile);
  const profile = redactBandoriPlayerProfile(input.data.profile);
  assert.equal(profile.userId, "9007199254740997");
  assert.equal(profile.introduction, original.introduction);
  assert.equal(profile.stageChallengeAchievementConditionsMap, undefined);
  assert.equal(profile.enabledUserAreaItems, undefined);
  assert.equal(profile.mainDeckUserSituations.entries[0].userAppendParameter, undefined);
  assert.deepEqual(profile.userMusicClearInfoMap.entries.easy, { clearedMusicCount: 0, allPerfectMusicCount: 3 });
  assert.deepEqual(input.data.profile, original);
  const view = parseBandoriPlayerResponse({ ...input, data: { ...input.data, profile } });
  assert.equal(view.clears[0].value.easy, 0);
  assert.equal(view.clears[0].value.expert, null);
  assert.deepEqual(view.clears[1], { public: false, value: null });
  assert.deepEqual(view.stage, { public: false, value: null });
  assert.deepEqual(view.power, { public: false, value: null });
  assert.equal(calculatePlayerPower(view, {}, {}, {}), null);
  assert.equal(view.bandRanks.value[1], 0);
  assert.equal(view.uid, "9007199254740997");
  for (const key of Object.keys(original).filter((key) => key.startsWith("publish"))) original[key] = false;
  const closed = redactBandoriPlayerProfile(original);
  assert.equal(closed.userHighScoreRating, undefined);
  assert.equal(closed.userDeckTotalRatingMap, undefined);
  assert.equal(closed.userCharacterRankMap, undefined);
  assert.equal(closed.bandRankMap, undefined);
  assert.deepEqual(closed.userMusicClearInfoMap.entries.easy, {});
});

function powerSample() {
  const input = sample();
  input.data.profile.publishTotalDeckPowerFlg = true;
  input.data.profile.mainDeckUserSituations.entries = [1, 2, 3, 4, 5].map((situationId) => ({
    situationId, level: 60, trainingStatus: "done", limitBreakRank: 4,
    userAppendParameter: { performance: 200, technique: 200, visual: 200,
      characterPotentialPerformance: 100, characterPotentialTechnique: 100, characterPotentialVisual: 100,
      characterBonusPerformance: 30, characterBonusTechnique: 30, characterBonusVisual: 30 },
  }));
  input.data.profile.enabledUserAreaItems = { entries: [{ areaItemId: 368, areaItemCategory: 4, level: 8 }] };
  const masters = Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, {
    characterId: id, attribute: "happy", rarity: 4, levelLimit: 50,
    stat: { 1: { performance: 100, technique: 100, visual: 100 },
      60: { performance: 1000, technique: 1000, visual: 1000 },
      training: { levelLimit: 10, performance: 300, technique: 300, visual: 300 },
      episodes: [{ performance: 150, technique: 150, visual: 150 }] },
  }]));
  const characters = Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, { bandId: 1 }]));
  const areas = { 4: { targetAttributes: ["happy"], targetBandIds: [1],
    performance: { 8: [10, 20, 30, 40] }, technique: { 8: [10, 20, 30, 40] }, visual: { 8: [10, 20, 30, 40] } } };
  return { input, masters, characters, areas };
}

test("player bonuses recover profile units without guessing rounded or missing values", () => {
  const { input, masters } = powerSample();
  const view = parseBandoriPlayerResponse(input);
  const master = { ...masters[1], stat: { 1: { performance: 100, technique: 100, visual: 100 },
    60: { performance: 11259, technique: 10880, visual: 9717 }, training: { levelLimit: 10 } } };
  const append = { cardId: 1, append: { performance: 2250, technique: 2250, visual: 2250 },
    potential: { performance: 742, technique: 722, visual: 658 }, mission: { performance: 715, technique: 695, visual: 634 } };
  assert.deepEqual(getPlayerCharacterBonusParameters(view.cards[0], master, append), [
    { key: "performance", potential: 55, mission: 53 },
    { key: "technique", potential: 55, mission: 53 },
    { key: "visual", potential: 55, mission: 53 },
  ]);
  // Two separately floored mission parts: floor(10050 * .017) + floor(10050 * .018) = 351.
  const splitMaster = { ...master, stat: { ...master.stat, 60: { performance: 10050, technique: 10050, visual: 10050 } } };
  const splitAppend = { ...append, append: { performance: 0, technique: 0, visual: 0 },
    potential: { performance: 502, technique: 502, visual: 502 }, mission: { performance: 351, technique: 351, visual: 351 } };
  assert.deepEqual(getPlayerCharacterBonusParameters(view.cards[0], splitMaster, splitAppend).map(({ mission }) => mission), [35, 35, 35]);
  const lowLevel = { ...view.cards[0], level: 1 };
  const zero = { performance: 0, technique: 0, visual: 0 };
  assert.deepEqual(getPlayerCharacterBonusParameters(lowLevel, master, { ...append, append: zero, potential: zero, mission: zero })
    .map(({ potential, mission }) => [potential, mission]), [[null, null], [null, null], [null, null]]);
  assert.equal(getPlayerCharacterBonusParameters(view.cards[0], master, { ...append, potential: { ...append.potential, performance: 744 } })[0].potential, null);
  assert.throws(() => getPlayerCharacterBonusParameters(view.cards[0], undefined, append), /Incomplete card master/);
});

test("player power uses supplied append points once, matches area categories and selects each region", () => {
  const { input, masters, characters, areas } = powerSample();
  for (const [server, expected] of [["jp", 21945], ["en", 23940], ["tw", 25935], ["cn", 27930]]) {
    input.data.server = server;
    const view = parseBandoriPlayerResponse(input);
    const power = calculatePlayerPower(view, masters, characters, areas);
    assert.equal(power.totalPower, expected);
    assert.deepEqual(power.cardPowers, Object.fromEntries([1, 2, 3, 4, 5].map((id) => [id, expected / 5])));
    assert.deepEqual(view.power.value.areaItems, [{ areaItemId: 368, categoryId: 4, level: 8 }]);
    assert.equal(view.power.value.cards[0].potential.performance, 100);
  }
  input.data.server = "jp";
  masters[5].attribute = "cool";
  const mixedBand = calculatePlayerPower(parseBandoriPlayerResponse(input), masters, characters, areas);
  assert.equal(mixedBand.totalPower, 21546);
  assert.equal(mixedBand.cardPowers[5], 3990);
  assert.equal(mixedBand.cardPowers[1], 4389);
  masters[5].attribute = "happy";
  input.data.profile.mainDeckUserSituations.entries[0].level = 1;
  const lowerLevel = calculatePlayerPower(parseBandoriPlayerResponse(input), masters, characters, areas);
  assert.equal(lowerLevel.totalPower, 18975);
  assert.equal(lowerLevel.cardPowers[1], 1419);
});

test("absent append values default to zero without filling unreturned area items", () => {
  const { input, masters, characters } = powerSample();
  delete input.data.profile.enabledUserAreaItems;
  input.data.profile.mainDeckUserSituations.entries.forEach((card) => { delete card.userAppendParameter; });
  const view = parseBandoriPlayerResponse(input);
  assert.deepEqual(view.power.value.areaItems, []);
  assert.deepEqual(view.power.value.cards[0].potential, { performance: 0, technique: 0, visual: 0 });
  assert.deepEqual(calculatePlayerPower(view, masters, characters, {}), { totalPower: 15000,
    cardPowers: { 1: 3000, 2: 3000, 3: 3000, 4: 3000, 5: 3000 } });
});

test("player power retains medley precision and rounds only for presentation", () => {
  const { input, masters, characters, areas } = powerSample();
  for (const key of ["performance", "technique", "visual"]) areas[4][key][8][0] = 0.01;
  const view = parseBandoriPlayerResponse(input);
  const power = calculatePlayerPower(view, masters, characters, areas);
  const medley = calculateFixedTeamParameters({
    cards: view.cards.map((card) => ({ cardId: card.cardId, bandId: 1, attribute: "happy",
      characterParameter: [1330, 1330, 1330], totalPower: 3990 })),
    areaItemsById: areas,
    profileAreaItems: new Map([[4, { areaItemId: 4, level: 8 }]]),
    selectedAreaItemIds: [4], eventBonus: null, server: 0,
  });
  assert.equal(power.totalPower, medley.deckTotalParameter);
  assert.ok(Math.abs(power.totalPower - 19951.995) < 1e-8);
  assert.ok(Object.values(power.cardPowers).every((value) => Math.abs(value - 3990.399) < 1e-8));
  assert.equal(formatLocalizedInteger(power.totalPower, "zh-CN"), "19,952");
  assert.equal(Object.values(power.cardPowers).reduce((sum, value) => sum + Math.round(value), 0), 19950);
});

test("invalid power inputs and missing regional master values fail instead of displaying zero or estimates", () => {
  const { input, masters, characters, areas } = powerSample();
  const view = parseBandoriPlayerResponse(input);
  assert.throws(() => calculatePlayerPower(view, {}, characters, areas), /card master/);
  assert.throws(() => calculatePlayerPower(view, masters, characters, {}), /area item master/);
  const missingRegion = structuredClone(areas);
  missingRegion[4].performance[8][0] = null;
  assert.throws(() => calculatePlayerPower(view, masters, characters, missingRegion), /area item master/);
  view.cards.pop();
  assert.throws(() => calculatePlayerPower(view, masters, characters, areas), /Incomplete main band/);
  input.data.profile.mainDeckUserSituations.entries[0].userAppendParameter.characterPotentialPerformance = "100";
  assert.throws(() => parseBandoriPlayerResponse(input), /append parameter/);
  input.data.profile.publishTotalDeckPowerFlg = false;
  assert.deepEqual(parseBandoriPlayerResponse(input).power, { public: false, value: null });
});

test("profile view preserves card order, selected illustration, both titles, all rating groups and missing data", () => {
  const input = sample();
  const view = parseBandoriPlayerResponse(input);
  assert.deepEqual(PLAYER_BAND_ORDER, [1, 2, 4, 5, 3, 21, 18, 45]);
  assert.deepEqual(view.cards.map((card) => card.cardId), [2401, 2402]);
  assert.equal(view.avatar.cardId, 2403);
  assert.equal(view.avatar.illust, "after_training");
  assert.equal(view.cards[1].isTrained, true);
  assert.equal(view.cards[1].illust, "normal");
  assert.deepEqual(view.portrait, { cardId: 2403, illust: "after_training" });
  assert.deepEqual(view.degreeIds, [100, 101]);
  assert.equal(view.rating.value.total, 45);
  assert.equal(view.rating.value.groups.find((group) => group.bandId === 45).total, 8);
  input.data.profile.userProfileSituation.viewProfileSituationStatus = "deck_leader";
  assert.equal(parseBandoriPlayerResponse(input).portrait.cardId, 2402);
  assert.equal(parseBandoriPlayerResponse(input).avatar.cardId, 2402);
  input.data.profile.publishStageChallengeAchievementConditionsFlg = true;
  input.data.profile.stageChallengeAchievementConditionsMap.entries = { 1: 80, 2: 68, 3: 72, 4: 85, 5: 69, 6: 6, 101: 999 };
  assert.deepEqual(parseBandoriPlayerResponse(input).stage.value, { 1: 80, 2: 68, 4: 72, 5: 85, 3: 69, 21: 6, 18: 0 });
  input.data.profile.stageChallengeAchievementConditionsMap = null;
  assert.equal(parseBandoriPlayerResponse(input).stage.value, null);
  input.data.profile.stageChallengeAchievementConditionsMap = {};
  assert.equal(parseBandoriPlayerResponse(input).stage.value, null);
  input.data.profile.mainUserDeck = { leader: 2402, member1: 2401, member2: 2404, member3: 2405, member4: 2406 };
  input.data.profile.mainDeckUserSituations.entries.push(...[2404, 2405, 2406].map((situationId) => ({ situationId })));
  assert.deepEqual(parseBandoriPlayerResponse(input).cards.map((card) => card.cardId), [2405, 2401, 2402, 2404, 2406]);
  delete input.data.profile.userHighScoreRating.userMyGOScoreMusicList;
  assert.equal(parseBandoriPlayerResponse(input).rating.value.total, null);
  input.data.profile.userMusicClearInfoMap.entries.easy.clearedMusicCount = "999";
  assert.equal(parseBandoriPlayerResponse(input).clears[0].value.easy, null);
  input.data.profile.userId = "1234";
  assert.throws(() => parseBandoriPlayerResponse(input), /identity|response/);
  for (const uid of ["01234", "123", "1234e2", "1.234", "12345678901234567"]) assert.equal(PLAYER_UID_PATTERN.test(uid), false);
});

test("profile images use the published fixed asset contract and reject unsupported rank sprites", () => {
  const previous = process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
  process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = "https://assets.example.test";
  try {
    assert.match(buildBandoriBandLogoUrl(45), /band-logo\/045\/logoS.png$/);
    assert.equal(buildBandoriBandLogoUrl(999), null);
    assert.match(buildBandoriPlayerSpriteUrl("icon_stagechallenge"), /spot-atlas\/icon_stagechallenge.png$/);
    assert.match(buildBandoriDeckRankSpriteUrls("ss", 10).digits[1], /ranknumber_ss_0.png$/);
    assert.equal(buildBandoriDeckRankSpriteUrls("a", 4), null);
    assert.equal(buildBandoriDeckRankSpriteUrls("unknown", 1), null);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
    else process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = previous;
  }
});

test("all four servers share safe player transport, identity checks, redaction and bounded responses", async () => {
  const savedFetch = globalThis.fetch;
  const savedBase = process.env.HHWX_USER_FETCHER_BASE_URL;
  const savedToken = process.env.HHWX_BANDORI_BACKEND_TOKEN;
  process.env.HHWX_USER_FETCHER_BASE_URL = "https://backend.example.test";
  process.env.HHWX_BANDORI_BACKEND_TOKEN = "synthetic-test-token";
  try {
    for (const server of ["jp", "en", "tw", "cn"]) {
      assert.equal(normalizeBandoriPlayerServer(server), server);
      const { data } = sample();
      globalThis.fetch = async (url, init) => {
        assert.equal(new URL(url).pathname, `/internal/hhwx-user-fetcher/player/${server}/${data.uid}`);
        assert.equal(init.redirect, "error");
        assert.ok(init.signal);
        return Response.json({ ...data, gameUid: data.uid, server });
      };
      const result = await fetchBandoriPlayerProfile(server, data.uid, 2);
      assert.equal(result.profile.stageChallengeAchievementConditionsMap, undefined);
      assert.equal(result.server, server);
    }
    const { data } = sample();
    globalThis.fetch = async () => Response.json({ ...data, profile: { ...data.profile, userId: "1234" } });
    await assert.rejects(fetchBandoriPlayerProfile("jp", data.uid, 2), { code: "TRACKER_SERVICE_INVALID_RESPONSE" });
    globalThis.fetch = async () => new Response("x".repeat(1024 * 1024 + 1));
    await assert.rejects(fetchBandoriPlayerProfile("jp", data.uid, 2), { code: "TRACKER_SERVICE_INVALID_RESPONSE" });
    globalThis.fetch = async () => Response.json({ secret: "must-not-escape" }, { status: 429 });
    await assert.rejects(fetchBandoriPlayerProfile("jp", data.uid, 2), (error) => error instanceof ApiRouteError && error.code === "TRACKER_SERVICE_BUSY" && error.details === undefined);
  } finally {
    globalThis.fetch = savedFetch;
    if (savedBase === undefined) delete process.env.HHWX_USER_FETCHER_BASE_URL;
    else process.env.HHWX_USER_FETCHER_BASE_URL = savedBase;
    if (savedToken === undefined) delete process.env.HHWX_BANDORI_BACKEND_TOKEN;
    else process.env.HHWX_BANDORI_BACKEND_TOKEN = savedToken;
  }
});

test("player errors distinguish confirmed absence, legacy misses, maintenance and service failures", async () => {
  const savedFetch = globalThis.fetch;
  const keys = ["NODE_ENV", "HHWX_DEV_PLAYER_API_PROXY", "HHWX_USER_FETCHER_BASE_URL", "HHWX_BANDORI_BACKEND_TOKEN"];
  const saved = keys.map((key) => process.env[key]);
  process.env.HHWX_USER_FETCHER_BASE_URL = "https://backend.example.test";
  process.env.HHWX_BANDORI_BACKEND_TOKEN = "synthetic-token";
  const { data } = sample();
  try {
    for (const proxy of [false, true]) {
      process.env.NODE_ENV = proxy ? "development" : "production";
      process.env.HHWX_DEV_PLAYER_API_PROXY = "1";
      for (const [status, code, expectedStatus] of [
        [404, "BANDORI_PLAYER_NOT_FOUND", 404], [404, "BANDORI_PLAYER_CACHE_MISS", 404],
        [proxy ? 503 : 429, "TRACKER_SERVICE_BUSY", 503],
        [503, "BANDORI_PLAYER_MAINTENANCE", 503], [503, "TRACKER_SERVICE_UNAVAILABLE", 503],
        [504, "TRACKER_SERVICE_TIMEOUT", 504], [502, "TRACKER_SERVICE_INVALID_RESPONSE", 502],
        [502, "TRACKER_SERVICE_FAILED", 502],
      ]) {
        globalThis.fetch = async () => Response.json(proxy
          ? { success: false, error: { code, message: "private upstream detail" } }
          : { error: "private upstream detail", code }, { status });
        await assert.rejects(fetchBandoriPlayerProfile("jp", data.uid, 2, { allowDevelopmentProxy: true }), (error) =>
          error.code === code && error.status === expectedStatus && !error.message.includes("private") && error.details === undefined);
      }
    }
    process.env.NODE_ENV = "production";
    for (const [status, expectedStatus, code] of [
      [404, 404, "BANDORI_PLAYER_UNAVAILABLE"], [503, 503, "TRACKER_SERVICE_UNAVAILABLE"],
      [401, 502, "TRACKER_SERVICE_FAILED"], [403, 502, "TRACKER_SERVICE_FAILED"],
    ]) {
      globalThis.fetch = async () => Response.json({ error: "legacy" }, { status });
      await assert.rejects(fetchBandoriPlayerProfile("jp", data.uid, 2), { code, status: expectedStatus });
    }
    globalThis.fetch = async () => { throw new DOMException("synthetic timeout", "TimeoutError"); };
    await assert.rejects(fetchBandoriPlayerProfile("jp", data.uid, 2), { status: 504, code: "TRACKER_SERVICE_TIMEOUT" });
    globalThis.fetch = async () => Response.json({ ...data, gameUid: data.uid, refreshError: { code: "TRACKER_SERVICE_BUSY", details: "private" } });
    const cached = await fetchBandoriPlayerProfile("jp", data.uid, 2);
    assert.deepEqual(cached.refreshError, { code: "TRACKER_SERVICE_BUSY" });
    assert.equal(cached.fetchedAt, data.fetchedAt);
    assert.equal(cached.profile.enabledUserAreaItems, undefined);
    assert.deepEqual(parseBandoriPlayerResponse({ success: true, data: cached }).refreshError, cached.refreshError);
    await assert.rejects(fetchBandoriPlayerProfile("jp", data.uid, 3), { code: "TRACKER_SERVICE_INVALID_RESPONSE" });
    globalThis.fetch = async () => Response.json({ ...data, cache: false, gameUid: data.uid });
    assert.equal((await fetchBandoriPlayerProfile("jp", data.uid, 3)).cache, false);
    for (const fetchedAt of [null, "invalid", new Date(Date.now() - 600_000).toISOString()]) {
      globalThis.fetch = async () => Response.json({ ...data, fetchedAt, gameUid: data.uid });
      await assert.rejects(fetchBandoriPlayerProfile("jp", data.uid, 2), { code: "BANDORI_PLAYER_CACHE_MISS" });
    }
    globalThis.fetch = async () => Response.json({ ...data, gameUid: data.uid, refreshError: { code: "secret-token" } });
    await assert.rejects(fetchBandoriPlayerProfile("jp", data.uid, 2), { code: "TRACKER_SERVICE_INVALID_RESPONSE" });
  } finally {
    globalThis.fetch = savedFetch;
    keys.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
  }
});

test("browser fallback expires by acquisition time and confirmed absence removes old data", () => {
  const data = parseBandoriPlayerResponse(sample());
  const fetched = Date.parse(data.fetchedAt);
  assert.equal(isPlayerDataFresh(data, fetched + 599_999), true);
  assert.equal(isPlayerDataFresh(data, fetched + 600_000), false);
  assert.equal(isPlayerDataFresh({ fetchedAt: null }), false);
  assert.equal(retainPlayerDataOnError(new ApiRouteError(503, "TRACKER_SERVICE_BUSY", "HTTP 503"), data), true);
  assert.equal(retainPlayerDataOnError(new ApiRouteError(404, "BANDORI_PLAYER_UNAVAILABLE", "HTTP 404"), data), true);
  assert.equal(retainPlayerDataOnError(new ApiRouteError(404, "BANDORI_PLAYER_NOT_FOUND", "HTTP 404"), data), false);
  assert.equal(retainPlayerDataOnError(new Error("network failure"), { ...data, fetchedAt: new Date(Date.now() - 600_000).toISOString() }), false);
  assert.equal(playerErrorMessageKey("BANDORI_PLAYER_MAINTENANCE"), "maintenance");
  assert.equal(playerErrorMessageKey("BANDORI_PLAYER_NOT_FOUND"), "notFound");
  assert.equal(playerErrorMessageKey("BANDORI_PLAYER_UNAVAILABLE"), "unavailable");
});

test("development proxy is opt-in, credential-free, validated, and unavailable to production or binding", async () => {
  const savedFetch = globalThis.fetch;
  const keys = ["NODE_ENV", "HHWX_DEV_PLAYER_API_PROXY", "HHWX_USER_FETCHER_BASE_URL", "HHWX_BANDORI_BACKEND_TOKEN", "HHWX_USER_FETCHER_TOKEN"];
  const saved = keys.map((key) => process.env[key]);
  try {
    process.env.NODE_ENV = "development";
    process.env.HHWX_DEV_PLAYER_API_PROXY = "1";
    delete process.env.HHWX_USER_FETCHER_BASE_URL;
    delete process.env.HHWX_BANDORI_BACKEND_TOKEN;
    delete process.env.HHWX_USER_FETCHER_TOKEN;
    for (const server of ["jp", "en", "tw", "cn"]) {
      const response = sample();
      response.data.server = server;
      globalThis.fetch = async (url, init) => {
        assert.equal(String(url), `https://hhwx.org/api/bandori/player/${server}/${response.data.uid}?mode=2`);
        assert.equal(new Headers(init.headers).has("Authorization"), false);
        assert.equal(init.redirect, "error");
        assert.equal(init.cache, "no-store");
        return Response.json(response);
      };
      const player = await fetchBandoriPlayerProfile(server, response.data.uid, 2, { allowDevelopmentProxy: true });
      assert.equal(player.uid, response.data.uid);
      assert.equal(player.profile.stageChallengeAchievementConditionsMap, undefined);
    }
    const response = sample();
    globalThis.fetch = async () => Response.json({ ...response, data: { ...response.data, uid: "1234" } });
    await assert.rejects(fetchBandoriPlayerProfile("jp", response.data.uid, 2, { allowDevelopmentProxy: true }), { code: "TRACKER_SERVICE_INVALID_RESPONSE" });
    globalThis.fetch = async () => Response.json({ success: false, error: { secret: "never-expose" } });
    await assert.rejects(fetchBandoriPlayerProfile("jp", response.data.uid, 2, { allowDevelopmentProxy: true }), { code: "TRACKER_SERVICE_INVALID_RESPONSE" });

    process.env.HHWX_USER_FETCHER_BASE_URL = "https://backend.example.test";
    process.env.HHWX_BANDORI_BACKEND_TOKEN = "synthetic-private-token";
    for (const [environment, flag, options] of [
      ["production", "1", { allowDevelopmentProxy: true }],
      ["development", "0", { allowDevelopmentProxy: true }],
      ["development", "1", undefined],
    ]) {
      process.env.NODE_ENV = environment;
      process.env.HHWX_DEV_PLAYER_API_PROXY = flag;
      globalThis.fetch = async (url, init) => {
        assert.equal(new URL(url).origin, "https://backend.example.test");
        assert.equal(new Headers(init.headers).get("Authorization"), "Bearer synthetic-private-token");
        return Response.json({ ...response.data, gameUid: response.data.uid });
      };
      await fetchBandoriPlayerProfile("jp", response.data.uid, 2, options);
    }
  } finally {
    globalThis.fetch = savedFetch;
    keys.forEach((key, index) => {
      if (saved[index] === undefined) delete process.env[key];
      else process.env[key] = saved[index];
    });
  }
});
