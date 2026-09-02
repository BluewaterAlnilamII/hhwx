import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MedleyFoundationInputError,
  buildFixedMedleyEvaluationInput,
  calculateMedleyEventPoint,
} from "../src/lib/bandori/medley-foundation/index.ts";

const sourceFixtureUrl = new URL("./fixtures/bandori-medley-foundation-source-v1.json", import.meta.url);
const scorerFixtureUrl = new URL(
  "../crates/bandori-medley-model/tests/fixtures/valid-fixed-medley-v1.json",
  import.meta.url,
);

function readFixture(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

test("medley event points use the fixed three-song boost totals", () => {
  assert.deepEqual(
    [0, 1, 2, 3].map((liveBoostCount) => calculateMedleyEventPoint(18_499, liveBoostCount)),
    [300, 1_500, 3_000, 4_500],
  );
  assert.equal(calculateMedleyEventPoint(18_500, 3), 4_545);
});

test("tiny raw fixture normalizes exactly to the retained Rust scorer input", () => {
  const result = buildFixedMedleyEvaluationInput(readFixture(sourceFixtureUrl));
  assert.deepEqual(result.scoringInput, readFixture(scorerFixtureUrl));
  assert.equal(result.audit.profileName, "Fixed foundation fixture");
  assert.equal(result.audit.selectedCardIds.length, 15);
  assert.deepEqual(result.audit.selectedAreaItemIds, []);
  assert.deepEqual(
    result.audit.teamParameters.map((team) => team.deckTotalParameter),
    [17_250, 17_250, 17_250],
  );
});

test("selected cards use their profile-server Cards extension", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.cardsById[1].serverExtensions = [
    {},
    {},
    {},
    {
      skillId: 16,
      stat: {
        1: { performance: 2000, technique: 2000, visual: 2000 },
        episodes: [],
      },
    },
  ];
  fixture.skillsById[16] = structuredClone(fixture.skillsById[1]);

  const result = buildFixedMedleyEvaluationInput(fixture);
  assert.equal(result.scoringInput.cards[0].skill.masterSkillId, 16);
  assert.equal(result.audit.teamParameters[0].deckTotalParameter, 19_800);
});

test("a missing profile-server card uses the canonical JP fallback", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.cardsById[1].serverExtensions = [
    {
      stat: {
        1: { performance: 1300, technique: 1300, visual: 1300 },
        episodes: [],
      },
    },
    {},
    {},
    null,
  ];

  const result = buildFixedMedleyEvaluationInput(fixture);
  assert.equal(result.audit.teamParameters[0].deckTotalParameter, 17_700);
});

test("raw profile area items and event rows reach the fixed scorer without caller totals", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.profilePayload.bestdoriProfile.data.items.PoppinParty = [1, 1, 6, 0];
  fixture.selectedAreaItemIds = [1];
  fixture.areaItemsById[1] = {
    targetAttributes: ["powerful"],
    targetBandIds: [1],
    performance: { 1: [10, 10, 10, 10] },
    technique: { 1: [10, 10, 10, 10] },
    visual: { 1: [10, 10, 10, 10] },
  };
  fixture.eventBonus = {
    attributes: [{ attribute: "powerful", percent: 10 }],
    characters: [{ characterId: 1, percent: 20 }],
    pointPercent: null,
    parameterPercent: 5,
    performancePercent: 1,
    techniquePercent: 2,
    visualPercent: 3,
    members: [{ situationId: 1, percent: 30 }],
    limitBreaks: [],
  };

  const result = buildFixedMedleyEvaluationInput(fixture);
  assert.deepEqual(
    result.audit.teamParameters.map((team) => team.deckTotalParameter),
    [22_666.5, 20_700, 20_700],
  );
  assert.equal(result.scoringInput.teams[0].deckTotalParameter, 22_666.5);
});

test("fixed scoring does not reinterpret the profile search-exclusion preference", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.profilePayload.bestdoriProfile.data.cards.excludes = [1, 1, 14, 0];

  const result = buildFixedMedleyEvaluationInput(fixture);
  assert.equal(result.audit.selectedCardIds.length, 15);
  assert.equal(result.scoringInput.cards[0].characterId, 1);
});

test("the source adapter preserves the Rust contract's unique-character team invariant", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.cardsById[2].characterId = 1;
  assert.throws(
    () => buildFixedMedleyEvaluationInput(fixture),
    (error) => error instanceof MedleyFoundationInputError
      && error.code === "INVALID_TEAM"
      && /cannot repeat a character/u.test(error.message),
  );
});

test("the fixed boundary rejects card reuse instead of starting a search", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.teams[1].memberCardIds[0] = fixture.teams[0].memberCardIds[0];
  assert.throws(
    () => buildFixedMedleyEvaluationInput(fixture),
    (error) => error instanceof MedleyFoundationInputError
      && error.code === "INVALID_TEAM"
      && /selected more than once/u.test(error.message),
  );
});

test("the fixed boundary rejects an unowned area-item selection", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.selectedAreaItemIds = [1];
  fixture.areaItemsById[1] = {};
  assert.throws(
    () => buildFixedMedleyEvaluationInput(fixture),
    (error) => error instanceof MedleyFoundationInputError
      && error.code === "INVALID_PARAMETER"
      && /not owned/u.test(error.message),
  );
});

test("play level 5 remains a valid raw Bestdori song row", () => {
  const fixture = readFixture(sourceFixtureUrl);
  fixture.songs[0].difficulty = "easy";
  fixture.songsById[1].difficulty[0] = { playLevel: 5 };
  const result = buildFixedMedleyEvaluationInput(fixture);
  assert.equal(result.scoringInput.songs[0].playLevel, 5);
});
