import assert from "node:assert/strict";
import test from "node:test";
import { compileBandoriChart } from "../src/lib/bandori/chart-simulator/compiler.ts";
import {
  BANDORI_FULL_CHART_LANE_COUNT,
  buildBandoriFullChartGeometry,
} from "../src/app/[locale]/bandori/songs/[songId]/full-chart-geometry.ts";

test("full-chart analysis geometry covers the complete duration and splits ribbons by column", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 60 },
    { type: "Single", beat: 2, lane: 3 },
    {
      type: "Slide",
      connections: [
        { beat: 7, lane: 0, width: 2 },
        { beat: 9, lane: 5, width: 2 },
      ],
      curveControls: [{ beat: 8, lane: 3, position: "Back" }],
    },
  ], { mediaDurationSeconds: 10 });

  const geometry = buildBandoriFullChartGeometry(compiled);
  assert.equal(BANDORI_FULL_CHART_LANE_COUNT, 7);
  assert.equal(geometry.durationSeconds, 10);
  assert.equal(geometry.segments.length, 2);
  assert.equal(geometry.notes.length, 3);
  assert.deepEqual(geometry.ribbons[0].segments.map((segment) => segment.segmentIndex), [0, 1]);
  assert.deepEqual(
    geometry.ribbons[0].segments.map((segment) => [
      segment.points[0].time,
      segment.points.at(-1).time,
    ]),
    [[7, 8], [8, 9]],
  );
  assert.ok(geometry.ribbons[0].segments.every(
    (segment) => segment.points.every((point, index, points) => (
      index === 0 || point.time >= points[index - 1].time
    )),
  ));
  assert.equal(geometry.ribbons[0].curvePoints.length, 0);
  assert.equal(geometry.bpmMarkers[0].value, 60);
  assert.ok(geometry.notes.every((note) => Number.isFinite(note.x) && Number.isFinite(note.y)));
});

test("full-chart projection is deterministic", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Directional", beat: 1, lane: 4, width: 2, direction: "Left" },
  ], { mediaDurationSeconds: 4 });

  assert.deepEqual(
    buildBandoriFullChartGeometry(compiled),
    buildBandoriFullChartGeometry(compiled),
  );
});

test("full-chart mirror reflects chart data while retaining the stage layout", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Directional", beat: 1, lane: 1, width: 2, direction: "Left" },
    { type: "Single", beat: 2, lane: 5, width: 2 },
  ], { mediaDurationSeconds: 4 });

  const normal = buildBandoriFullChartGeometry(compiled);
  const mirrored = buildBandoriFullChartGeometry(compiled, { isMirrored: true });
  const segment = normal.segments[0];

  assert.equal(mirrored.notes[0].lane, 5);
  assert.equal(mirrored.notes[0].direction, 1);
  assert.equal(mirrored.notes[1].lane, 1);
  for (let index = 0; index < normal.notes.length; index += 1) {
    assert.equal(
      normal.notes[index].x + mirrored.notes[index].x,
      segment.plotLeft + segment.plotRight,
    );
  }
});

test("full-chart Habahiro geometry uses explicit coverage without source lane input", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "System", beat: 0, data: "lane_change", laneChange: true },
    { type: "Single", beat: 1, lanes: [1, 2] },
    {
      type: "Slide",
      connections: [
        { beat: 2, lanes: [0, 1] },
        { beat: 3, lanes: [4, 5] },
      ],
    },
  ], { mediaDurationSeconds: 4 });

  const normal = buildBandoriFullChartGeometry(compiled);
  const mirrored = buildBandoriFullChartGeometry(compiled, { isMirrored: true });
  assert.equal(normal.notes[0].lane, 1.5);
  assert.equal(normal.notes[0].width, 2);
  assert.equal(mirrored.notes[0].lane, 4.5);
  assert.equal(mirrored.notes[0].width, 2);
  assert.deepEqual(
    normal.ribbons[0].segments[0].points.map(({ lane, width }) => ({ lane, width })),
    [{ lane: 0.5, width: 2 }, { lane: 4.5, width: 2 }],
  );
  assert.deepEqual(
    mirrored.ribbons[0].segments[0].points.map(({ lane, width }) => ({ lane, width })),
    [{ lane: 5.5, width: 2 }, { lane: 1.5, width: 2 }],
  );
});
