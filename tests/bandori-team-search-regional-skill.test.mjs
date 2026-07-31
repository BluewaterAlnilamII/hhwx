import assert from "node:assert/strict";
import test from "node:test";

import { resolveBandoriSkill } from "../src/lib/bandori/team-builder/core/calculator.ts";
import { buildSkillSearchSignature } from "../src/lib/bandori/team-builder/core/cards.ts";
import {
  calculateSkillUpperRatesPerPower,
  getResolvedSkillMaxScoreUpPercent,
} from "../src/lib/bandori/team-builder/core/scoring.ts";
import { getRegionalNumber } from "../src/lib/bandori/team-builder/core/utils.ts";

const JP_SERVER = 0;
const CN_SERVER = 3;
const MIXED_TEAM_CONTEXT = {
  sameBandId: null,
  sameAttribute: null,
};
const PREPARED_CHART = {
  notes: Array.from({ length: 24 }, (_, index) => ({
    beat: index,
    time: index,
    skill: index % 4 === 0,
    fever: false,
  })),
  playLevel: 25,
  notesCount: 24,
  skillStartNotes: [1, 5, 9, 13, 17, 21],
  skillTriggerTimes: [0, 4, 8, 12, 16, 20],
};

function regional(value) {
  return [value, null, null, null];
}

function createSkill(effectValues) {
  return {
    duration: [
      regional(5),
      regional(5.5),
      regional(6),
      regional(6.5),
      regional(7),
    ],
    activationEffect: {
      activateEffectTypes: Object.fromEntries(
        Object.entries(effectValues).map(([type, value]) => [
          type,
          {
            activateEffectValue: regional(value),
            activateConditionLife: regional(1000),
          },
        ]),
      ),
    },
  };
}

const skill150 = createSkill({ score: 150 });
const skill160 = createSkill({
  score_over_life: 160,
  score_under_life: 110,
});
const skill170 = createSkill({ score: 170 });

test("CN skill resolution falls back from null regional slots to current JP-only values", () => {
  const resolved160 = resolveBandoriSkill(82, skill160, 5, MIXED_TEAM_CONTEXT, CN_SERVER);
  const resolved170 = resolveBandoriSkill(83, skill170, 5, MIXED_TEAM_CONTEXT, CN_SERVER);

  assert.equal(resolved160.durationSeconds, 7);
  assert.deepEqual(
    resolved160.scoreEffects.map(({ type, valuePercent, conditionLife }) => ({
      type,
      valuePercent,
      conditionLife,
    })),
    [
      { type: "score_over_life", valuePercent: 160, conditionLife: 1000 },
      { type: "score_under_life", valuePercent: 110, conditionLife: 1000 },
    ],
  );
  assert.equal(getResolvedSkillMaxScoreUpPercent(resolved160), 160);
  assert.equal(getResolvedSkillMaxScoreUpPercent(resolved170), 170);
  assert.ok(
    getResolvedSkillMaxScoreUpPercent(resolved160)
      > getResolvedSkillMaxScoreUpPercent(resolveBandoriSkill(70, skill150, 5, MIXED_TEAM_CONTEXT, CN_SERVER)),
  );
});

test("search signatures and optimistic bounds use the same regional fallback as exact scoring", () => {
  const cnSignature = buildSkillSearchSignature(82, skill160, 5, CN_SERVER);
  const jpSignature = buildSkillSearchSignature(82, skill160, 5, JP_SERVER);
  const cnBounds = calculateSkillUpperRatesPerPower(PREPARED_CHART, skill160, 5, CN_SERVER);
  const jpBounds = calculateSkillUpperRatesPerPower(PREPARED_CHART, skill160, 5, JP_SERVER);

  assert.equal(cnSignature, jpSignature);
  assert.match(cnSignature, /score_over_life\/160/);
  assert.match(cnSignature, /score_under_life\/110/);
  assert.deepEqual(cnBounds, jpBounds);
  assert.ok(cnBounds.maxRate > 0);
  assert.ok(
    cnBounds.maxRate
      > calculateSkillUpperRatesPerPower(PREPARED_CHART, skill150, 5, CN_SERVER).maxRate,
  );
});

test("an explicit regional zero is preserved instead of falling back to JP", () => {
  const skillWithExplicitCnZero = createSkill({ score: 160 });
  skillWithExplicitCnZero.activationEffect.activateEffectTypes.score.activateEffectValue[CN_SERVER] = 0;

  assert.equal(getRegionalNumber([160, null, null, 0], CN_SERVER), 0);
  assert.equal(
    resolveBandoriSkill(999, skillWithExplicitCnZero, 5, MIXED_TEAM_CONTEXT, CN_SERVER)
      .scoreEffects[0].valuePercent,
    0,
  );
  assert.deepEqual(
    calculateSkillUpperRatesPerPower(PREPARED_CHART, skillWithExplicitCnZero, 5, CN_SERVER),
    {
      maxRate: 0,
      averageRate: 0,
      leaderRate: 0,
    },
  );
});
