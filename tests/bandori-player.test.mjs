import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { ApiRouteError } from "../src/lib/api-contracts.ts";
import { parseBandoriPlayerResponse, redactBandoriPlayerProfile, PLAYER_UID_PATTERN, PLAYER_BAND_ORDER } from "../src/lib/bandori/player-profile.ts";
import { buildBandoriBandLogoUrl, buildBandoriDeckRankSpriteUrls, buildBandoriPlayerSpriteUrl } from "../src/lib/bandori-builtin-resources.ts";

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
  return { success: true, data: { server: "jp", uid: profile.userId, cache: true, fetchedAt: "2026-09-11T01:00:00Z", profile } };
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
