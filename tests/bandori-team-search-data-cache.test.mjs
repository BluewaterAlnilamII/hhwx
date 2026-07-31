import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  TEAM_SEARCH_CHART_CACHE_FRESH_TIME_MS,
  TEAM_SEARCH_CHART_CACHE_MAX_ENTRIES,
  TEAM_SEARCH_MASTER_CACHE_FRESH_TIME_MS,
  TeamSearchDataIntegrityError,
  assertTeamSearchMasterReferences,
  assertTeamSearchRequestReferences,
  createAtomicTimedCache,
  createTimedLruCache,
} from "../src/app/[locale]/bandori/teambuilder/team-search-data-cache.ts";

test("team search cache policy uses the intended freshness and capacity limits", () => {
  assert.equal(TEAM_SEARCH_MASTER_CACHE_FRESH_TIME_MS, 5 * 60 * 1000);
  assert.equal(TEAM_SEARCH_CHART_CACHE_FRESH_TIME_MS, 60 * 60 * 1000);
  assert.equal(TEAM_SEARCH_CHART_CACHE_MAX_ENTRIES, 64);
});

test("atomic cache revalidates stale data, swaps generations, and retains a good snapshot on failure", async () => {
  let currentTime = 1_000;
  let loadCount = 0;
  const cache = createAtomicTimedCache({
    freshTimeMs: TEAM_SEARCH_MASTER_CACHE_FRESH_TIME_MS,
    now: () => currentTime,
  });
  const loader = async (requestCache) => ({
    requestCache,
    loadCount: ++loadCount,
  });

  const initial = await cache.get(loader);
  assert.deepEqual(initial.value, { requestCache: "default", loadCount: 1 });
  assert.equal(initial.generation, 1);

  currentTime += TEAM_SEARCH_MASTER_CACHE_FRESH_TIME_MS - 1;
  assert.strictEqual(await cache.get(loader), initial);
  assert.equal(loadCount, 1);

  currentTime += 1;
  const refreshed = await cache.get(loader);
  assert.deepEqual(refreshed.value, { requestCache: "no-cache", loadCount: 2 });
  assert.equal(refreshed.generation, 2);

  currentTime += TEAM_SEARCH_MASTER_CACHE_FRESH_TIME_MS;
  await assert.rejects(
    cache.get(async (requestCache) => {
      assert.equal(requestCache, "no-cache");
      throw new Error("refresh failed");
    }),
    /refresh failed/,
  );
  assert.strictEqual(cache.peek(), refreshed);

  const recovered = await cache.get(loader);
  assert.equal(recovered.generation, 3);
  assert.equal(recovered.value.requestCache, "no-cache");
});

test("atomic cache deduplicates concurrent refreshes", async () => {
  let resolveLoad;
  let loadCount = 0;
  const cache = createAtomicTimedCache({ freshTimeMs: 1 });
  const first = cache.get(
    (requestCache) => new Promise((resolve) => {
      loadCount += 1;
      resolveLoad = () => resolve(requestCache);
    }),
  );
  const second = cache.get(async () => {
    loadCount += 1;
    return "unexpected";
  });

  assert.strictEqual(first, second);
  assert.equal(loadCount, 1);
  resolveLoad();
  assert.equal((await first).value, "default");
});

test("a forced atomic refresh waits for an ordinary in-flight load, then revalidates", async () => {
  let resolveInitial;
  const requestCaches = [];
  const cache = createAtomicTimedCache({ freshTimeMs: 1 });
  const initial = cache.get(
    (requestCache) => new Promise((resolve) => {
      requestCaches.push(requestCache);
      resolveInitial = () => resolve("initial");
    }),
  );
  const forced = cache.get(async (requestCache) => {
    requestCaches.push(requestCache);
    return "forced";
  }, { forceRefresh: true });

  assert.deepEqual(requestCaches, ["default"]);
  resolveInitial();
  assert.equal((await initial).value, "initial");
  assert.equal((await forced).value, "forced");
  assert.deepEqual(requestCaches, ["default", "no-cache"]);
});

test("chart cache applies per-key TTL, LRU eviction, and failed-refresh retention", async () => {
  let currentTime = 10_000;
  let loadCount = 0;
  const cache = createTimedLruCache({
    freshTimeMs: TEAM_SEARCH_CHART_CACHE_FRESH_TIME_MS,
    maxEntries: 2,
    now: () => currentTime,
  });
  const load = (key) => async (requestCache) => ({
    key,
    requestCache,
    loadCount: ++loadCount,
  });

  const firstA = await cache.get("a", load("a"));
  await cache.get("b", load("b"));
  assert.strictEqual(await cache.get("a", load("a")), firstA);
  await cache.get("c", load("c"));
  assert.equal(cache.has("a"), true);
  assert.equal(cache.has("b"), false);
  assert.equal(cache.has("c"), true);
  assert.equal(cache.size(), 2);

  currentTime += TEAM_SEARCH_CHART_CACHE_FRESH_TIME_MS;
  const refreshedA = await cache.get("a", load("a"));
  assert.equal(refreshedA.generation, 2);
  assert.equal(refreshedA.value.requestCache, "no-cache");

  currentTime += TEAM_SEARCH_CHART_CACHE_FRESH_TIME_MS;
  await assert.rejects(
    cache.get("a", async (requestCache) => {
      assert.equal(requestCache, "no-cache");
      throw new Error("chart refresh failed");
    }),
    /chart refresh failed/,
  );
  assert.equal(cache.has("a"), true);

  const recoveredA = await cache.get("a", load("a"));
  assert.equal(recoveredA.generation, 3);
  assert.equal(recoveredA.value.requestCache, "no-cache");
});

test("master integrity rejects missing event 338 skill references instead of silently dropping cards", () => {
  const cardsById = {
    "2492": { characterId: 21, skillId: 82 },
    "2496": { characterId: 21, skillId: 83 },
  };
  const charactersById = {
    "21": { bandId: 3 },
  };

  assert.throws(
    () => assertTeamSearchMasterReferences({
      cardsById,
      charactersById,
      skillsById: {},
    }),
    (error) => {
      assert.ok(error instanceof TeamSearchDataIntegrityError);
      assert.deepEqual(error.issues, [
        "card 2492 -> skill 82",
        "card 2496 -> skill 83",
      ]);
      return true;
    },
  );

  assert.doesNotThrow(() => assertTeamSearchMasterReferences({
    cardsById,
    charactersById,
    skillsById: {
      "82": {},
      "83": {},
    },
  }));
});

test("request integrity reports missing selected, event, area-item, external-skill, and song references", () => {
  assert.throws(
    () => assertTeamSearchRequestReferences({
      cardIds: [100],
      eventCardIds: [101],
      areaItemIds: [200],
      externalSkillIds: [82],
      songIds: [300],
      cardsById: {},
      areaItemsById: {},
      skillsById: {},
      songsById: {},
    }),
    (error) => {
      assert.ok(error instanceof TeamSearchDataIntegrityError);
      assert.deepEqual(error.issues, [
        "selected card 100",
        "event card 101",
        "area item 200",
        "external skill 82",
        "song 300",
      ]);
      return true;
    },
  );
});

test("team search worker wires cache revalidation, retry, and cache generations without a manifest", async () => {
  const source = await readFile(
    new URL("../src/app/[locale]/bandori/teambuilder/team-search-worker.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /cache:\s*requestCache/);
  assert.match(source, /withIntegrityRefreshRetry/);
  assert.match(source, /master-\$\{masterSnapshot\.generation\}/);
  assert.match(source, /chart-\$\{chartSnapshot\.generation\}/);
  assert.match(source, /TEAM_SEARCH_WORKER_ALGORITHM_REVISION = "regional-skill-fallback-v1"/);
  assert.equal(
    [...source.matchAll(/chartCacheKey:\s*\[\s*TEAM_SEARCH_WORKER_ALGORITHM_REVISION/g)].length,
    2,
  );
  assert.doesNotMatch(source, /requestJsonCache/);
  assert.doesNotMatch(source, /manifest/iu);
});
