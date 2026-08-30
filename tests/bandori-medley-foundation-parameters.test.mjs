import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateFixedTeamParameters,
  calculateProfileCard,
} from "../src/lib/bandori/medley-foundation/index.ts";

function profileCard(cardId) {
  return {
    cardId,
    level: 60,
    masterRank: 1,
    skillLevel: 5,
    episodeCount: 2,
    isTrained: true,
    hasTrainedArt: true,
    isExcluded: false,
  };
}

function cardMaster() {
  return {
    characterId: 1,
    attribute: "powerful",
    rarity: 4,
    skillId: 1,
    levelLimit: 40,
    stat: {
      1: { performance: 100, technique: 200, visual: 300 },
      60: { performance: 1000, technique: 1100, visual: 1200 },
      training: { levelLimit: 20, performance: 100, technique: 100, visual: 100 },
      episodes: [
        { performance: 10, technique: 10, visual: 10 },
        { performance: 20, technique: 20, visual: 20 },
      ],
    },
  };
}

const characterBonuses = new Map([[1, {
  characterId: 1,
  potential: [10, 20, 30],
  collection: [1, 2, 3],
  training: [4, 5, 6],
}]]);

test("card parameters derive from the profile state and raw min/max master rows", () => {
  const calculated = calculateProfileCard(
    profileCard(1),
    cardMaster(),
    { bandId: 1 },
    characterBonuses,
  );

  assert.deepEqual(calculated.baseParameter, [1330, 1430, 1530]);
  assert.deepEqual(calculated.characterParameter, [1409, 1557, 1711]);
  assert.equal(calculated.totalPower, 4677);
  assert.equal(calculated.skillId, 1);
  assert.equal(calculated.bandId, 1);
});

test("intermediate card levels use the Bestdori rarity growth curve", () => {
  const state = {
    ...profileCard(1),
    level: 10,
    masterRank: 0,
    episodeCount: 0,
    isTrained: false,
  };
  const master = {
    ...cardMaster(),
    rarity: 1,
    levelLimit: 20,
    stat: {
      1: { performance: 100, technique: 200, visual: 300 },
      20: { performance: 1100, technique: 1200, visual: 1300 },
      episodes: [],
    },
  };

  const calculated = calculateProfileCard(state, master, { bandId: 1 }, new Map());
  assert.deepEqual(calculated.baseParameter, [449, 549, 649]);
  assert.equal(calculated.totalPower, 1647);
});

test("selected area items and event parameters are derived without caller totals", () => {
  const cards = Array.from({ length: 5 }, (_, index) => calculateProfileCard(
    profileCard(index + 1),
    cardMaster(),
    { bandId: 1 },
    characterBonuses,
  ));
  const trace = calculateFixedTeamParameters({
    cards,
    areaItemsById: {
      1: {
        targetAttributes: ["powerful"],
        targetBandIds: [1],
        performance: { 2: [10, 10, 10, 10] },
        technique: { 2: [20, 20, 20, 20] },
        visual: { 2: [30, 30, 30, 30] },
      },
    },
    profileAreaItems: new Map([[1, { areaItemId: 1, level: 2 }]]),
    selectedAreaItemIds: [1],
    eventBonus: {
      attributes: [{ attribute: "powerful", percent: 10 }],
      characters: [{ characterId: 1, percent: 20 }],
      parameterPercent: 15,
      performancePercent: 1,
      techniquePercent: 2,
      visualPercent: 3,
    },
    server: 3,
  });

  assert.equal(trace.cardPower, 23_385);
  assert.ok(Math.abs(trace.areaItemPower - 4_828) < Number.EPSILON * 40_000);
  assert.ok(Math.abs(trace.eventPower - 11_006.05) < Number.EPSILON * 40_000);
  assert.ok(Math.abs(trace.deckTotalParameter - 39_219.05) < Number.EPSILON * 40_000);
  assert.deepEqual(trace.selectedAreaItemIds, [1]);
});

test("fixed card parameters fail when a required min/max stat row is absent", () => {
  const incomplete = cardMaster();
  delete incomplete.stat[60];
  assert.throws(
    () => calculateProfileCard(profileCard(1), incomplete, { bandId: 1 }, characterBonuses),
    /INVALID_MASTER.*stat\.60/u,
  );
});

test("fixed card parameters reject profile levels above the raw card limit", () => {
  const state = { ...profileCard(1), level: 61 };
  assert.throws(
    () => calculateProfileCard(state, cardMaster(), { bandId: 1 }, characterBonuses),
    /INVALID_CARD.*profile\.level/u,
  );
});

test("malformed event arrays fail instead of becoming an empty bonus", () => {
  const cards = Array.from({ length: 5 }, (_, index) => calculateProfileCard(
    profileCard(index + 1),
    cardMaster(),
    { bandId: 1 },
    characterBonuses,
  ));
  assert.throws(() => calculateFixedTeamParameters({
    cards,
    areaItemsById: {},
    profileAreaItems: new Map(),
    selectedAreaItemIds: [],
    eventBonus: { attributes: "not-an-array" },
    server: 3,
  }), /INVALID_PARAMETER.*eventBonus\.attributes/u);
});
