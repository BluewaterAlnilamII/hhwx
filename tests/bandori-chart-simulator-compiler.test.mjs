import assert from "node:assert/strict";
import test from "node:test";
import {
  BANDORI_CHART_SIMULATOR_PAYLOAD_VERSION,
  BANDORI_COMPILED_DIRECTION,
  BANDORI_COMPILED_NOTE_FLAG,
  collectCompiledBandoriChartTransferables,
  compileBandoriChart,
  getBandoriCompiledBeatAtTime,
  getBandoriCompiledLaneSpan,
  rebuildBandoriChartState,
} from "../src/lib/bandori/chart-simulator/compiler.ts";
import {
  createBandoriChartCompilerWorkerRequest,
  isBandoriChartCompilerWorkerResponse,
} from "../src/lib/bandori/chart-simulator/worker-contract.ts";

const chart = [
  { type: "BPM", beat: 0, bpm: 120, provenance: { source: "JP" } },
  { type: "Meta", artist: "fixture", retained: true },
  { type: "Single", beat: 1, lane: 0, skill: true, unknownField: [1, 2, 3] },
  { type: "Directional", beat: 2, lane: 5, width: 2, direction: "Left", flick: true },
  {
    type: "Long",
    connections: [
      { beat: 3, lane: 1 },
      { beat: 4, lane: 1, direction: "Right", flick: true },
    ],
  },
  { type: "BPM", beat: 4, bpm: 60 },
  {
    type: "Slide",
    connections: [
      { beat: 5, lane: 0, lanes: [0, 1] },
      { beat: 6, lane: 2, hidden: true },
      { beat: 9, lane: 6, direction: "Left" },
    ],
    curveControls: [
      { beat: 7, lane: 4, position: "Front", width: 1 },
    ],
  },
  { type: "System", beat: 7, data: "cmd_fever_start.wav" },
];

test("compiler retains the source chart while deriving deterministic typed tables", () => {
  const compiled = compileBandoriChart(chart, { mediaDurationSeconds: 10 });

  assert.equal(compiled.schemaVersion, BANDORI_CHART_SIMULATOR_PAYLOAD_VERSION);
  assert.deepEqual(compiled.source, chart);
  assert.notEqual(compiled.source, chart);
  assert.equal(compiled.sourceEntityCount, chart.length);
  assert.deepEqual(Array.from(compiled.bpm.beats), [0, 4]);
  assert.deepEqual(Array.from(compiled.bpm.times), [0, 2]);
  assert.deepEqual(Array.from(compiled.bpm.values), [120, 60]);
  assert.deepEqual(Array.from(compiled.notes.times), [0.5, 1, 1.5, 2, 3, 7]);
  assert.deepEqual(Array.from(compiled.notes.lanes), [0, 5, 1, 1, 0, 6]);
  assert.deepEqual(Array.from(compiled.notes.coverageOffsets), [0, 1, 2, 3, 4, 6, 7]);
  assert.deepEqual(Array.from(compiled.notes.coverageLanes), [0, 5, 1, 1, 0, 1, 6]);
  assert.equal(compiled.maxCombo, 6);
  assert.equal(compiled.chartEndSeconds, 7);
  assert.equal(compiled.timelineDurationSeconds, 10);
  assert.equal(compiled.ribbons.kinds.length, 2);
  assert.deepEqual(
    Array.from(compiled.ribbons.connectionCoverageOffsets),
    [0, 1, 2, 4, 5, 6],
  );
  assert.deepEqual(
    Array.from(compiled.ribbons.connectionCoverageLanes),
    [1, 1, 0, 1, 2, 6],
  );
  assert.equal(compiled.ribbons.curveTimes[0], 5);
  assert.equal(
    compiled.ribbons.connectionFlags[3] & BANDORI_COMPILED_NOTE_FLAG.hidden,
    BANDORI_COMPILED_NOTE_FLAG.hidden,
  );
});

test("explicit coverage compiles without reading a scalar lane anchor", () => {
  const source = [
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "System", beat: 0, data: "lane_change", laneChange: true },
    { type: "Single", beat: 1, lanes: [1, 2] },
    // A retained legacy value is deliberately wrong: explicit coverage remains authoritative.
    { type: "Single", beat: 2, lane: 6, lanes: [2, 3, 4] },
    {
      type: "Long",
      connections: [
        { beat: 3, lanes: [4, 5] },
        { beat: 4, lanes: [4, 5] },
      ],
    },
    {
      type: "Slide",
      connections: [
        { beat: 5, lanes: [0, 1, 2] },
        { beat: 6, lanes: [2, 3, 4], hidden: true },
        { beat: 7, lanes: [4, 5, 6] },
      ],
    },
  ];
  const compiled = compileBandoriChart(source);

  assert.deepEqual(Array.from(compiled.notes.lanes), [1, 3, 4, 4, 1, 5]);
  assert.deepEqual(
    Array.from(compiled.notes.coverageLanes),
    [1, 2, 2, 3, 4, 4, 5, 4, 5, 0, 1, 2, 4, 5, 6],
  );
  assert.deepEqual(
    Array.from(compiled.ribbons.connectionLanes),
    [4, 4, 1, 3, 5],
  );
});

test("ordinary Slide curves are converted into native hidden nodes before presentation", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    {
      type: "Slide",
      connections: [
        { beat: 8.75, lane: 1 },
        { beat: 9.5, lane: 0 },
      ],
      curveControls: [{ beat: 9, lane: 0, position: "Back" }],
    },
  ]);

  assert.equal(compiled.ribbons.curveTimes.length, 0);
  const lanes = Array.from(compiled.ribbons.connectionLanes);
  const beats = Array.from(compiled.ribbons.connectionBeats);
  const flags = Array.from(compiled.ribbons.connectionFlags);
  const sampleIndex = beats.indexOf(435 / 48);
  assert.notEqual(sampleIndex, -1);
  assert.equal(lanes[sampleIndex], 0.25);
  assert.equal(
    flags[sampleIndex] & BANDORI_COMPILED_NOTE_FLAG.hidden,
    BANDORI_COMPILED_NOTE_FLAG.hidden,
  );
  assert.ok(beats.length > 2);
  assert.ok(beats.length < 200);
  assert.equal(compiled.maxCombo, 2);
  assert.equal(getBandoriCompiledBeatAtTime(compiled, 4.5), 9);
});

test("pre-expanded hidden Slide samples retain their fractional native lanes", () => {
  const sourceConnections = [
    { lane: 0, beat: 8 },
    { lane: 0.63, beat: 8.0625, hidden: true },
    { lane: 1.13, beat: 8.125, hidden: true },
    { lane: 1.49, beat: 8.1875, hidden: true },
    { lane: 1.73, beat: 8.25, hidden: true },
    { lane: 1.87, beat: 8.3125, hidden: true },
    { lane: 1.95, beat: 8.375, hidden: true },
    { lane: 1.99, beat: 8.4375, hidden: true },
    { lane: 2, beat: 8.5 },
  ];
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Slide", connections: sourceConnections },
  ]);

  const compiledLanes = Array.from(compiled.ribbons.connectionLanes);
  assert.equal(compiledLanes.length, sourceConnections.length);
  compiledLanes.forEach((lane, index) => {
    assert.ok(Math.abs(lane - sourceConnections[index].lane) < 0.000001);
  });
  assert.deepEqual(Array.from(compiled.notes.lanes), [0, 2]);
  assert.equal(compiled.maxCombo, 2);
  assert.equal(compiled.ribbons.curveTimes.length, 0);
  assert.equal(
    compiled.ribbons.connectionFlags[1] & BANDORI_COMPILED_NOTE_FLAG.hidden,
    BANDORI_COMPILED_NOTE_FLAG.hidden,
  );
});

test("pre-expanded hidden Slide samples retain native edge DiffVolume", () => {
  const compiled = compileBandoriChart([
    { type: "BPM", beat: 0, bpm: 120 },
    {
      type: "Slide",
      connections: [
        { lane: 6, beat: 10 },
        { lane: 6.4, beat: 10.25, hidden: true },
        { lane: 6, beat: 10.5 },
      ],
    },
    {
      type: "Slide",
      connections: [
        { lane: 0, beat: 11 },
        { lane: -0.4, beat: 11.25, hidden: true },
        { lane: 0, beat: 11.5 },
      ],
    },
  ]);

  const lanes = Array.from(compiled.ribbons.connectionLanes);
  assert.ok(Math.abs(lanes[1] - 6.4) < 0.000001);
  assert.ok(Math.abs(lanes[4] - -0.4) < 0.000001);
  assert.deepEqual(Array.from(compiled.notes.lanes), [6, 6, 0, 0]);
});

test("seek rebuild derives combo and active ribbons without replaying effects", () => {
  const compiled = compileBandoriChart(chart, { mediaDurationSeconds: 10 });
  const state = rebuildBandoriChartState(compiled, 3.5, 4);

  assert.equal(state.timeSeconds, 3.5);
  assert.equal(state.combo, 5);
  assert.equal(state.nextNoteIndex, 5);
  assert.equal(state.visibleNoteEndIndex, 6);
  assert.deepEqual(Array.from(state.activeRibbonIndexes), [1]);
  assert.equal(rebuildBandoriChartState(compiled, 100, 0).timeSeconds, 10);
});

test("compiler fails closed for unsupported entities and malformed native semantics", () => {
  assert.throws(
    () => compileBandoriChart([{ type: "BPM", beat: 0, bpm: 120 }, { type: "Unknown", beat: 1 }]),
    /unsupported entity type/u,
  );
  assert.throws(
    () => compileBandoriChart([{ type: "BPM", beat: 0, bpm: 120 }, { type: "Single", beat: 1, lane: 7 }]),
    /integer from 0 through 6/u,
  );
  assert.throws(
    () => compileBandoriChart([
      { type: "BPM", beat: 0, bpm: 120 },
      { type: "Slide", connections: [
        { beat: 1, lane: 0 },
        { beat: 1.5, lane: 0.5 },
        { beat: 2, lane: 1 },
      ] },
    ]),
    /integer from 0 through 6/u,
  );
  assert.throws(
    () => compileBandoriChart([
      { type: "BPM", beat: 0, bpm: 120 },
      { type: "Slide", connections: [
        { beat: 1, lane: 6 },
        { beat: 1.5, lane: 6.51, hidden: true },
        { beat: 2, lane: 6 },
      ] },
    ]),
    /integer from 0 through 6/u,
  );
  assert.throws(
    () => compileBandoriChart([
      { type: "BPM", beat: 0, bpm: 120 },
      { type: "Slide", connections: [
        { beat: 1, lane: 0.5, hidden: true },
        { beat: 2, lane: 1 },
      ] },
    ]),
    /integer from 0 through 6/u,
  );
  assert.throws(
    () => compileBandoriChart([
      { type: "BPM", beat: 0, bpm: 120 },
      { type: "Long", connections: [
        { beat: 1, lane: 0.5, hidden: true },
        { beat: 2, lane: 0.5, hidden: true },
      ] },
    ]),
    /integer from 0 through 6/u,
  );
  assert.throws(
    () => compileBandoriChart([
      { type: "BPM", beat: 0, bpm: 120 },
      { type: "Single", beat: 1, lane: 1, lanes: [0, 2] },
    ]),
    /contiguous ascending lane range/u,
  );
  assert.throws(
    () => compileBandoriChart([
      { type: "BPM", beat: 0, bpm: 120 },
      { type: "Single", beat: 1, lane: 1, multiRangeWidth: 2 },
    ]),
    /obsolete pre-v7 field/u,
  );
  assert.throws(
    () => compileBandoriChart([{ type: "Single", beat: 1, lane: 0 }]),
    /BPM at beat 0/u,
  );
  assert.throws(
    () => compileBandoriChart([
      { type: "BPM", beat: 0, bpm: 120 },
      { type: "Long", connections: [
        { beat: 1, lane: 0 },
        { beat: 2, lane: 1 },
      ] },
    ]),
    /same native lane/u,
  );
});

test("directional lane spans and worker payloads stay versioned", () => {
  assert.deepEqual(
    getBandoriCompiledLaneSpan(5, 2, BANDORI_COMPILED_DIRECTION.left),
    { leftLane: 4, rightLane: 6 },
  );

  const compiled = compileBandoriChart(chart, { mediaDurationSeconds: 10 });
  const request = createBandoriChartCompilerWorkerRequest({
    requestId: "request-1",
    chart,
    mediaDurationSeconds: 10,
  });
  assert.equal(request.kind, "compile");
  assert.equal(request.protocolVersion, 1);
  assert.equal(isBandoriChartCompilerWorkerResponse({
    protocolVersion: 1,
    kind: "compiled",
    requestId: "request-1",
    payloadVersion: BANDORI_CHART_SIMULATOR_PAYLOAD_VERSION,
    chart: compiled,
  }), true);
  assert.equal(isBandoriChartCompilerWorkerResponse({ ...request, kind: "compiled" }), false);

  const transferables = collectCompiledBandoriChartTransferables(compiled);
  assert.ok(transferables.length > 10);
  assert.equal(new Set(transferables).size, transferables.length);
});
