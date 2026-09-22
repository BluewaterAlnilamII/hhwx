import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolveBandoriSkill } from "../src/lib/bandori/team-builder/core/calculator.ts";
import { resolveBestdoriScoreSkill } from "../src/lib/bandori/medley-foundation/skills.ts";
import { buildSingleSearchInput } from "../src/lib/bandori/team-builder/single-source.ts";
import { initSync, runSingleSearchJson } from "../src/lib/bandori/medley-wasm/pkg/bandori_medley.js";

initSync({ module: readFileSync(new URL("../src/lib/bandori/medley-wasm/pkg/bandori_medley_bg.wasm", import.meta.url)) });
const MIXED_TEAM_CONTEXT = { sameBandId: null, sameAttribute: null };
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


function normalized(server, skillMaster) {
  return resolveBestdoriScoreSkill({ skillId: 82, skillLevel: 5, skillMaster, context: MIXED_TEAM_CONTEXT, server });
}
test("single shared resolver preserves CN null fallback and explicit zero", () => {
  assert.deepEqual(normalized(3, skill160), normalized(0, skill160));
  assert.equal(normalized(3, skill160).durationSeconds, 7);
  assert.equal(normalized(3, skill160).behavior.scoreUpPercent, 160);
  assert.equal(normalized(3, skill170).behavior.scoreUpPercent, 170);
  assert.equal(normalized(3, skill150).behavior.scoreUpPercent, 150);
  // Card-detail callers retain their general calculator and the same regional policy.
  assert.deepEqual(resolveBandoriSkill(82, skill160, 5, MIXED_TEAM_CONTEXT, 3).scoreEffects.map(e => e.valuePercent), [160, 110]);
  const zero = createSkill({ score: 160 });
  zero.activationEffect.activateEffectTypes.score.activateEffectValue[3] = 0;
  assert.equal(normalized(3, zero).behavior.scoreUpPercent, 0);
  assert.equal(normalized(0, zero).behavior.scoreUpPercent, 160);
});
test("actual single WASM uses the same regional resolution in search, bounds and hydration", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/bandori-medley-foundation-source-v1.json", import.meta.url), "utf8"));
  fixture.profilePayload.bestdoriProfile.data.cards.skills = [15, 4];
  for (const key of Object.keys(fixture.skillsById)) fixture.skillsById[key] = [skill150, skill160, skill170][Number(key) % 3];
  const results = [0, 3].map(server => {
    fixture.profilePayload.bestdoriProfile.server = server;
    const { input } = buildSingleSearchInput({ ...fixture, song: fixture.songs[0], settings: { resultLimit: 1 } });
    input.cards = input.cards.slice(0, 6); input.supportPowers.length = 6; input.pointBonusRates.length = 6;
    return JSON.parse(runSingleSearchJson(JSON.stringify(input), 64 * 1024 * 1024, () => undefined, () => {}, () => {}));
  });
  assert.equal(results[0].outcome.status, "exact");
  assert.deepEqual(results[0], results[1]);
});
