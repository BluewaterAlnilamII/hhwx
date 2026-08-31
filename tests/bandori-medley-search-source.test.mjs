import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildMedleySearchInput } from "../src/lib/bandori/medley-foundation/index.ts";

const sourceFixtureUrl = new URL(
  "./fixtures/bandori-medley-foundation-source-v1.json",
  import.meta.url,
);

function searchFixture() {
  const fixture = JSON.parse(readFileSync(sourceFixtureUrl, "utf8"));
  fixture.schemaVersion = "hhwx-medley-search-source-v1";
  delete fixture.selectedAreaItemIds;
  delete fixture.teams;
  return fixture;
}

function areaItemMaster() {
  return {
    targetAttributes: ["powerful", "cool", "happy", "pure"],
    targetBandIds: [1, 2, 3, 4, 5, 18, 21, 45, 48],
    performance: { 1: [10, 10, 10, 10] },
    technique: { 1: [20, 20, 20, 20] },
    visual: { 1: [30, 30, 30, 30] },
  };
}

test("HHWX profile input becomes the normalized search roster without caller teams", () => {
  const fixture = searchFixture();
  fixture.profilePayload.characterPotentials = {
    ids: "AQA=",
    performance: [1, 10],
    technique: [1, null],
    visual: [1, null],
  };
  fixture.profilePayload.characterMissionBonuses = {
    ids: "AQA=",
    collection: {
      performance: [1, 10],
      technique: [1, 0],
      visual: [1, 0],
    },
    training: {
      performance: [1, 0],
      technique: [1, 0],
      visual: [1, 0],
    },
  };
  fixture.profilePayload.bestdoriProfile.data.cards.excludes = [1, 1, 14, 0];

  const result = buildMedleySearchInput(fixture);

  assert.equal(result.schemaVersion, "hhwx-medley-search-input-v1");
  assert.equal(result.scoringRulesVersion, "hhwx-medley-bestdori-v3");
  assert.deepEqual(result.cards.map((card) => card.instanceId), Array.from({ length: 15 }, (_, index) => index));
  assert.deepEqual(result.cards[0], {
    instanceId: 0,
    masterCardId: 1,
    characterId: 1,
    bandId: 1,
    attribute: "powerful",
    isExcluded: true,
    characterParameter: [1173, 1150, 1150],
    eventParameter: [0, 0, 0],
    skillContexts: {
      mixed: {
        masterSkillId: 1,
        skillLevel: 1,
        durationSeconds: 2,
        behavior: { kind: "score", scoreUpPercent: 100 },
        isRateUpWithPerfect: false,
      },
      sameBand: {
        masterSkillId: 1,
        skillLevel: 1,
        durationSeconds: 2,
        behavior: { kind: "score", scoreUpPercent: 100 },
        isRateUpWithPerfect: false,
      },
      sameAttribute: {
        masterSkillId: 1,
        skillLevel: 1,
        durationSeconds: 2,
        behavior: { kind: "score", scoreUpPercent: 100 },
        isRateUpWithPerfect: false,
      },
      sameBandAndAttribute: {
        masterSkillId: 1,
        skillLevel: 1,
        durationSeconds: 2,
        behavior: { kind: "score", scoreUpPercent: 100 },
        isRateUpWithPerfect: false,
      },
    },
  });
  assert.deepEqual(result.areaItems, []);
  assert.deepEqual(result.areaConfigurations, [{ selectedAreaItemIds: [] }]);
  assert.deepEqual(result.songs.map((song) => song.songId), [1, 2, 3]);
  assert.equal("teams" in result, false);
  assert.equal("leader" in result, false);
});

test("owned area items choose one owned parameter item when available", () => {
  const fixture = searchFixture();
  fixture.profilePayload.bestdoriProfile.data.items = {
    PoppinParty: [7, 1],
    Afterglow: [7, 1],
    Magazine: [2, 1, 1, null],
    Plaza: [3, null, 1, 1],
    Menu: [1, 1, 3, null],
  };
  const ownedIds = [1, 6, 11, 16, 21, 26, 31, 2, 7, 12, 17, 22, 27, 32, 80, 81, 70, 56];
  fixture.areaItemsById = Object.fromEntries(
    ownedIds.map((areaItemId) => [String(areaItemId), areaItemMaster()]),
  );

  const result = buildMedleySearchInput(fixture);
  const firstBand = [1, 6, 11, 16, 21, 26, 31, 70, 56];
  const secondBand = [2, 7, 12, 17, 22, 27, 32, 70, 56];

  assert.deepEqual(result.areaConfigurations, [
    { selectedAreaItemIds: [...firstBand, 80] },
    { selectedAreaItemIds: [...firstBand, 81] },
    { selectedAreaItemIds: [...secondBand, 80] },
    { selectedAreaItemIds: [...secondBand, 81] },
  ]);
  assert.deepEqual(
    result.areaItems.find((item) => item.areaItemId === 1)?.parameterRates,
    [0.1, 0.2, 0.3],
  );
});
