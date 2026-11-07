import assert from "node:assert/strict";
import test from "node:test";
import { chartZoomTicks, nextChartZoom, zoomChartWindow } from "../src/app/[locale]/bandori/events/_tracker/useTrackerChartZoom.ts";

test("continuous zoom keeps its anchor in place and preserves fractional scales", () => {
  const view = zoomChartWindow(2.7, 0.6, 0.4);
  assert.ok(Math.abs(1 / (view.end - view.start) - 2.7) < 1e-10);
  assert.ok(Math.abs(view.start + 0.4 * (view.end - view.start) - 0.6) < 1e-10);
});

test("zoom and pan clamp at both timeline edges without shrinking the window", () => {
  assert.deepEqual(zoomChartWindow(2, 0, 0.76), { start: 0, end: 0.5 });
  assert.deepEqual(zoomChartWindow(2, 1, 0), { start: 0.5, end: 1 });
  assert.deepEqual(zoomChartWindow(0.3, 0.2, 0.5), { start: 0, end: 1 });
  const maximum = zoomChartWindow(100, 0.5, 0.5);
  assert.equal(1 / (maximum.end - maximum.start), 32);
});

test("buttons select adjacent fixed levels from a continuous pinch result", () => {
  for (const [scale, lower, higher] of [[1,1,2], [1.6,1,2], [2,1,4], [2.7,2,4], [32,16,32]]) {
    assert.equal(nextChartZoom(scale, -1), lower);
    assert.equal(nextChartZoom(scale, 1), higher);
  }
});

test("zoomed time ticks align to hours and leave room for endpoint labels", () => {
  const hour = 3600000;
  for (const span of [4.5, 18, 36, 72, 372]) {
    const start = 1.3 * hour, end = start + span * hour;
    const ticks = chartZoomTicks(start, end, 0);
    assert.ok(ticks.length >= 2 && ticks.length <= 4);
    assert.ok(ticks.every(tick => tick % hour === 0 && tick >= start + (end - start) * 0.12 && tick < end - (end - start) * 0.12));
  }
});
