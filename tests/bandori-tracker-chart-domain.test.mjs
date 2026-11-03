import assert from "node:assert/strict";
import test from "node:test";
import { generateYTicks } from "../src/app/[locale]/bandori/events/_tracker/useChartData.ts";

test("empty tracker data has a finite nonzero domain and grid ticks without adding score records", () => {
  const points = [];
  const { domain, ticks } = generateYTicks(points);
  assert.equal(domain[0], 0);
  assert.ok(Number.isFinite(domain[1]) && domain[1] > 0);
  assert.ok(ticks.length >= 3);
  assert.equal(ticks[0], domain[0]);
  assert.equal(ticks.at(-1), domain[1]);
  assert.ok(ticks.every((value, index) => Number.isFinite(value) && (index === 0 || value > ticks[index - 1])));
  assert.deepEqual(points, []);
});

test("score-based domains still cover actual, projected and comparison scores", () => {
  for (const point of [
    { ep: 2_000_000 },
    { ep: 0, instantEp: 2_000_000 },
    { ep: 0, dayEp: 2_000_000 },
    { ep: 0, bestdoriPredictionEp: 2_000_000 },
    { ep: 0, comparisonPoints: { compare_1_ep: { ep: 2_000_000 } } },
  ]) {
    const { domain, ticks } = generateYTicks([{ time: 1, ...point }]);
    assert.equal(domain[0], 0);
    assert.ok(domain[1] >= 2_000_000);
    assert.equal(ticks.at(-1), domain[1]);
  }
});
