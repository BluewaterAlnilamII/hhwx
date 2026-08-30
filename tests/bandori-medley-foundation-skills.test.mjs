import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFixedTeamSkillContext,
  resolveBestdoriScoreSkill,
} from "../src/lib/bandori/medley-foundation/index.ts";

function regional(value) {
  return [value, null, null, null];
}

function calculatedCard(cardId, bandId = 1, attribute = "powerful") {
  return {
    cardId,
    level: 60,
    masterRank: 0,
    skillLevel: 5,
    episodeCount: 2,
    isTrained: true,
    hasTrainedArt: true,
    isExcluded: false,
    characterId: cardId,
    bandId,
    attribute,
    rarity: 4,
    skillId: cardId,
    baseParameter: [1, 1, 1],
    characterParameter: [1, 1, 1],
    totalPower: 3,
  };
}

function skillWithEffects(effects, activationEffect = {}) {
  return {
    duration: [regional(5), regional(5.5), regional(6), regional(6.5), regional(7)],
    activationEffect: {
      ...activationEffect,
      activateEffectTypes: effects,
    },
  };
}

const sameTeam = [1, 2, 3, 4, 5].map((id) => calculatedCard(id));

test("fixed team context resolves only an actually uniform band and attribute", () => {
  assert.deepEqual(buildFixedTeamSkillContext(sameTeam), {
    sameBandId: 1,
    sameAttribute: "powerful",
  });
  assert.deepEqual(buildFixedTeamSkillContext([
    ...sameTeam.slice(0, 4),
    calculatedCard(5, 2, "cool"),
  ]), {
    sameBandId: null,
    sameAttribute: null,
  });
});

test("regional duration and unified values resolve from raw skill master", () => {
  const skill = skillWithEffects({
    score: {
      activateEffectValue: regional(100),
      activateCondition: "perfect",
    },
  }, {
    unificationActivateConditionBandId: 1,
    unificationActivateEffectValue: regional(150),
  });
  assert.deepEqual(resolveBestdoriScoreSkill({
    skillId: 10,
    skillLevel: 5,
    skillMaster: skill,
    context: buildFixedTeamSkillContext(sameTeam),
    server: 3,
  }), {
    masterSkillId: 10,
    skillLevel: 5,
    durationSeconds: 7,
    behavior: { kind: "score_on_perfect", scoreUpPercent: 150 },
    rateUpWithPerfect: null,
  });
});

test("life-named Bestdori keys remain ordinary source-ordered score rows", () => {
  const first = { activateEffectValue: regional(160) };
  const second = { activateEffectValue: regional(110) };
  const resolved = resolveBestdoriScoreSkill({
    skillId: 82,
    skillLevel: 5,
    skillMaster: skillWithEffects({
      score_over_life: first,
      score_under_life: second,
    }),
    context: { sameBandId: null, sameAttribute: null },
    server: 3,
  });

  assert.deepEqual(resolved.behavior, { kind: "score", scoreUpPercent: 160 });
});

test("a zero-valued first score row keeps Bestdori source ordering", () => {
  const resolved = resolveBestdoriScoreSkill({
    skillId: 83,
    skillLevel: 1,
    skillMaster: skillWithEffects({
      score: { activateEffectValue: regional(0) },
      score_only_perfect: { activateEffectValue: regional(100) },
    }),
    context: { sameBandId: null, sameAttribute: null },
    server: 0,
  });
  assert.deepEqual(resolved.behavior, { kind: "score", scoreUpPercent: 0 });
});

test("continued fallback and PERFECT stacking retain their separate Bestdori behaviors", () => {
  const continued = resolveBestdoriScoreSkill({
    skillId: 90,
    skillLevel: 1,
    skillMaster: skillWithEffects({
      score_continued_note_judge: { activateEffectValue: regional(115) },
      score: { activateEffectValue: regional(80) },
    }),
    context: { sameBandId: null, sameAttribute: null },
    server: 0,
  });
  assert.deepEqual(continued.behavior, {
    kind: "continued_perfect",
    activeScoreUpPercent: 115,
    fallbackScoreUpPercent: 80,
  });
  assert.equal(continued.rateUpWithPerfect, null);

  const crescendo = resolveBestdoriScoreSkill({
    skillId: 91,
    skillLevel: 1,
    skillMaster: skillWithEffects({
      score: { activateEffectValue: regional(115) },
      score_rate_up_with_perfect: { activateEffectValue: regional(0.5) },
    }),
    context: { sameBandId: null, sameAttribute: null },
    server: 0,
  });
  assert.deepEqual(crescendo.behavior, { kind: "score", scoreUpPercent: 115 });
  assert.deepEqual(crescendo.rateUpWithPerfect, {
    stackPercent: 0.5,
    maxScoreUpPercent: 165,
  });
});

test("malformed selected skill rows fail closed", () => {
  assert.throws(() => resolveBestdoriScoreSkill({
    skillId: 1,
    skillLevel: 5,
    skillMaster: { duration: [5] },
    context: { sameBandId: null, sameAttribute: null },
    server: 0,
  }), /INVALID_SKILL.*duration/u);

  assert.throws(() => resolveBestdoriScoreSkill({
    skillId: 2,
    skillLevel: 1,
    skillMaster: skillWithEffects({
      score_only_perfect: { activateEffectValue: regional(100) },
      score_rate_up_with_perfect: { activateEffectValue: regional(0.5) },
    }),
    context: { sameBandId: null, sameAttribute: null },
    server: 0,
  }), /rate-up requires an unconditional score effect/u);

  assert.throws(() => resolveBestdoriScoreSkill({
    skillId: 0x1_0000_0000,
    skillLevel: 1,
    skillMaster: skillWithEffects({}),
    context: { sameBandId: null, sameAttribute: null },
    server: 0,
  }), /unsigned 32-bit/u);
});
