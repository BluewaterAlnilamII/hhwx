import assert from "node:assert/strict";
import test from "node:test";
import { selectChartSampleMarkers } from "../src/app/[locale]/bandori/events/_tracker/TrackerActiveMarkerOverlay.tsx";

const points = Array.from({ length: 10001 }, (_, x) => Object.freeze({ key: String(x), x, y: x, color: "blue", radius: 3 }));

test("dense dots stay bounded while the true latest sample remains visible", () => {
  assert.deepEqual(selectChartSampleMarkers(points, 0, 10000, 300), [points.at(-1)]);
  assert.deepEqual(selectChartSampleMarkers(points, 1000, 2000, 300), []);
  assert.deepEqual(selectChartSampleMarkers(points, 0, 10000, 0), []);
});

test("zoom reveals real samples without mutating or thinning source data", () => {
  const visible = selectChartSampleMarkers(points, 9980, 10000, 300);
  assert.deepEqual(visible, points.slice(-21));
  assert.equal(points.length, 10001);
  assert.ok(visible.every(point => point === points[point.x]));
});

test("dots appear at eight-pixel spacing while tighter clusters stay hidden", () => {
  const samples = points.slice(0, 51);
  assert.deepEqual(selectChartSampleMarkers(samples, 0, 50, 400), samples);
  assert.deepEqual(selectChartSampleMarkers(samples, 0, 50, 350), [samples.at(-1)]);
});

test("irregular dense clusters do not masquerade as sparse measurements", () => {
  const sparse = [0, 1, 2, 50, 100].map(x => points[x]);
  assert.deepEqual(selectChartSampleMarkers(sparse, 0, 100, 300), [points[50], points[100]]);
});
