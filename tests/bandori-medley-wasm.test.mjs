import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildMedleySearchInput } from "../src/lib/bandori/medley-foundation/index.ts";
import { initSync, runMedleySearchJson } from "../src/lib/bandori/medley-wasm/pkg/bandori_medley.js";

initSync({ module: readFileSync(new URL(
  "../src/lib/bandori/medley-wasm/pkg/bandori_medley_bg.wasm", import.meta.url,
)) });
const source = JSON.parse(readFileSync(new URL(
  "./fixtures/bandori-medley-foundation-source-v1.json", import.meta.url,
), "utf8"));
source.schemaVersion = "hhwx-medley-search-source-v1";
delete source.teams;
delete source.selectedAreaItemIds;
const input = buildMedleySearchInput(source);

function run(value = input, {
  budget = 64 * 1024 * 1024, stop = () => undefined,
  incumbent = () => {}, finished = () => {},
} = {}) {
  return JSON.parse(runMedleySearchJson(JSON.stringify(value), budget, stop, incumbent, finished));
}

test("committed WASM returns the public fixture's exact score, tie winner and hydrated orders", () => {
  // Scores are independently retained in bandori-medley-reference/src/scoring.rs.
  // All cards have identical stats/skills, so the canonical smallest legal teams win ties.
  const teams = [
    { slot: 0, memberInstanceIds: [1, 2, 0, 3, 4], averageScore: 175410 },
    { slot: 1, memberInstanceIds: [6, 7, 5, 8, 9], averageScore: 175410 },
    { slot: 2, memberInstanceIds: [11, 12, 10, 13, 14], averageScore: 175701 },
  ];
  for (const budget of [16384, 64 * 1024 * 1024]) {
    const improvements = [];
    let finished = 0;
    const result = run(input, {
      budget,
      incumbent: (json) => {
        assert.equal(finished, 0);
        improvements.push(JSON.parse(json));
      },
      finished: () => { finished += 1; },
    });
    assert.equal(result.outcome.status, "exact");
    assert.deepEqual(result.outcome.best, { selectedAreaItemIds: [], teams, totalAverageScore: 526521 });
    assert.equal(finished, 1);
    assert.ok(improvements.length > 0);
    assert.equal(improvements.at(-1).totalAverageScore, 526521);
    for (let index = 1; index < improvements.length; index += 1) {
      assert.ok(improvements[index].totalAverageScore > improvements[index - 1].totalAverageScore);
    }
    const hydrated = result.hydration.candidates[0];
    assert.deepEqual(hydrated.selectedAreaItemIds, []);
    assert.equal(hydrated.totalMinimumScore, 526521);
    assert.equal(hydrated.totalAverageScore, 526521);
    assert.equal(hydrated.totalMaximumScore, 526521);
    for (const [slot, team] of hydrated.teams.entries()) {
      assert.equal(team.slot, slot);
      assert.deepEqual(team.memberInstanceIds, teams[slot].memberInstanceIds);
      assert.equal(team.parameters.deckTotalParameter, 17250);
      assert.equal(team.minimumScore, teams[slot].averageScore);
      assert.equal(team.averageScore, teams[slot].averageScore);
      assert.equal(team.maximumScore, teams[slot].averageScore);
      assert.deepEqual(team.bestSkillOrderMemberInstanceIds, [...team.memberInstanceIds, team.memberInstanceIds[2]]);
      assert.equal(team.maximumScoreOrderCount, 120);
      assert.equal(team.scoreOrderCount, 120);
    }
  }
});

test("committed WASM preserves controlled stop reasons and an empty result", () => {
  for (const reason of ["timed_out", "cancelled", "memory_exhausted"]) {
    const result = run(input, reason === "memory_exhausted"
      ? { budget: 0 } : { stop: () => reason });
    assert.equal(result.outcome.status, "incomplete");
    assert.equal(result.outcome.reason, reason);
    assert.equal(result.outcome.bestSoFar, null);
    assert.deepEqual(result.hydration.candidates, []);
  }
});

test("committed WASM hydrates a best-so-far result without certifying it", () => {
  let improved = false;
  const result = run(input, {
    stop: () => improved ? "timed_out" : undefined,
    incumbent: () => { improved = true; },
  });
  assert.equal(result.outcome.status, "incomplete");
  assert.equal(result.outcome.reason, "timed_out");
  assert.ok(result.outcome.bestSoFar);
  assert.equal(result.hydration.candidates[0].totalAverageScore, result.outcome.bestSoFar.totalAverageScore);
});

test("committed WASM proves infeasibility when fewer than fifteen cards are eligible", () => {
  const excluded = structuredClone(input);
  excluded.cards[0].isExcluded = true;
  const result = run(excluded);
  assert.equal(result.outcome.status, "exact");
  assert.equal(result.outcome.best, null);
  assert.deepEqual(result.hydration.candidates, []);
});

test("committed WASM rejects unknown scoring rules before search", () => {
  assert.throws(() => run({ ...input, scoringRulesVersion: "unsupported" }), (error) => {
    const parsed = JSON.parse(error);
    assert.equal(parsed.code, "UNSUPPORTED_RULES");
    assert.equal(parsed.path, "scoringRulesVersion");
    return true;
  });
});
