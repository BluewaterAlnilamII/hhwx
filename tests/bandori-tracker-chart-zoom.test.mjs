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
    const labelWidth = span >= 72 ? 32 : 64;
    const ticks = chartZoomTicks(start, end, 0, 400, labelWidth).filter(tick => tick.labeled).map(tick => tick.time);
    assert.ok(ticks.length >= 2);
    const positions = ticks.map(time => (time - start) / (end - start) * 400);
    assert.ok(ticks.every(tick => tick % (hour / 4) === 0));
    assert.ok(positions.every(x => x >= labelWidth / 2 + 2 && x <= 400 - labelWidth / 2 - 2));
    assert.ok(positions.slice(1).every((x, i) => x - positions[i] >= labelWidth + 8 - 1e-6));
  }
});

test("time grid density follows available width on desktop and mobile", () => {
  const end = 48 * 3600000;
  const mobile = chartZoomTicks(0, end, 0, 300, 64).filter(tick => tick.labeled);
  const desktop = chartZoomTicks(0, end, 0, 900, 64).filter(tick => tick.labeled);
  assert.ok(mobile.length > 0 && mobile.length < desktop.length);
  for (const width of [300, 900]) {
    const ticks = chartZoomTicks(0, end, 0, width, 64).filter(tick => tick.labeled).map(tick => tick.time);
    assert.ok(ticks.slice(1).every((tick, index) => (tick - ticks[index]) / end * width >= 72));
  }
});

test("unlabeled grid lines fill the visible range without crowding labels or duplicating axes", () => {
  const hour = 3600000;
  for (const width of [293, 622, 900]) {
    const start = 1.3 * hour, end = start + 18 * hour;
    const ticks = chartZoomTicks(start, end, 0, width, 64);
    const labels = ticks.filter(tick => tick.labeled);
    assert.ok(ticks.some(tick => !tick.labeled), "minor grid remains between the readable labels");
    assert.ok(labels.slice(1).every((tick, index) => (tick.time - labels[index].time) / (end - start) * width >= 72));
    assert.ok(ticks.every(tick => tick.time > start && tick.time < end));
    assert.ok(ticks.slice(1).every((tick, index) => (tick.time - ticks[index].time) / (end - start) * width >= 32));
    const interval = ticks[1].time - ticks[0].time;
    assert.ok(ticks[0].time - start <= interval && end - ticks.at(-1).time <= interval);
  }
  assert.deepEqual(chartZoomTicks(0, 18 * hour, 0, 0, 64), []);
});

test("labels and minor grid share the supplied server-midnight anchor", () => {
  const hour = 3600000;
  const ticks = chartZoomTicks(0, 48 * hour, 8 * hour, 900, 64);
  assert.ok(ticks.every(tick => (tick.time - 8 * hour) % (2 * hour) === 0));
  const dates = chartZoomTicks(0, 208 * hour, 8 * hour, 293, 32).filter(tick => tick.labeled);
  assert.ok(dates.length >= 3);
  assert.ok(dates.every(tick => (tick.time - 8 * hour) % (24 * hour) === 0), "date-only labels denote server midnight, not midday");
});

test("small zoom changes keep several mobile date labels across timeline positions", () => {
  const hour = 3600000;
  for (const width of [213, 293]) for (const scale of [1.01, 1.1, 1.5, 2]) for (const offset of [0, 3, 19]) {
    const ticks = chartZoomTicks(offset * hour, (offset + 208 / scale) * hour, 0, width, 32);
    assert.ok(ticks.filter(tick => tick.labeled).length >= 3, `${width}px, ${scale}x, ${offset}h offset`);
  }
});

test("date-time labels use their measured width without changing minor grid density", () => {
  const hour = 3600000;
  for (const width of [213, 293, 622]) for (const scale of [4, 8, 16, 32]) for (const span of [208, 226]) for (const offset of [0, 0.25, 1, 2]) {
    const start = offset * hour, end = start + span / scale * hour;
    const narrow = chartZoomTicks(start, end, 0, width, 32);
    const wide = chartZoomTicks(start, end, 0, width, 64);
    assert.deepEqual(narrow.map(tick => tick.time), wide.map(tick => tick.time));
    const labels = wide.filter(tick => tick.labeled);
    assert.ok(labels.length >= 2, `${width}px, ${scale}x`);
    assert.ok(labels.slice(1).every((tick, i) => (tick.time - labels[i].time) / (end - start) * width >= 72));
  }
});
