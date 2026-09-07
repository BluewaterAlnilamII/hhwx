import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MedleyFoundationInputError,
  buildFixedMedleyEvaluationInput,
  buildMedleySearchInput,
  normalizeBestdoriScoringChart,
  parsePerfectRatePercent,
  parseSongIdText,
} from "../src/lib/bandori/medley-foundation/index.ts";

const sourceFixture = JSON.parse(readFileSync(new URL(
  "./fixtures/bandori-medley-foundation-source-v1.json",
  import.meta.url,
), "utf8"));

test("malformed scoring entities fail at their original chart field", () => {
  const prefix = sourceFixture.songs[0].chart.slice(0, 7);
  const cases = [];
  for (const type of ["Single", "Directional"]) {
    for (const beat of [undefined, "broken", null, "", " ", true, [], {}, Infinity, NaN]) {
      cases.push([{ type, beat }, "beat"]);
    }
  }
  for (const type of ["Long", "Slide"]) {
    for (const connections of [undefined, null, {}, [], [{ beat: 6 }]]) {
      cases.push([{ type, connections }, "connections"]);
    }
    cases.push(
      [{ type, connections: [null, { beat: 7 }] }, "connections[0]"],
      [{ type, connections: [{ beat: 6 }, { beat: "broken", hidden: true }] }, "connections[1].beat"],
    );
  }
  cases.push(
    [{ type: "Slide", connections: [{ beat: 6 }, { beat: "broken" }, { beat: 8 }] }, "connections[1].beat"],
    [{ type: "BPM", beat: "broken", bpm: 60 }, "beat"],
  );
  for (const bpm of [undefined, null, "", "broken", 0, -60, Infinity]) {
    cases.push([{ type: "BPM", beat: 6, bpm }, "bpm"]);
  }
  for (const [entity, field] of cases) {
    assert.throws(
      () => normalizeBestdoriScoringChart([...prefix, entity], "songs[2].chart"),
      (error) => error instanceof MedleyFoundationInputError
        && error.code === "INVALID_CHART"
        && error.path === `songs[2].chart[7].${field}`,
      `${entity.type}: ${field}`,
    );
  }
});

test("valid numeric strings and non-scoring chart data preserve normalization", () => {
  const chart = structuredClone(sourceFixture.songs[0].chart);
  for (const entity of chart) {
    entity.beat = String(entity.beat);
    if (entity.type === "BPM") entity.bpm = "60";
  }
  chart.push(
    { type: "Long", connections: [{ beat: "7" }, null, { beat: "8" }] },
    { type: "Slide", connections: [{ beat: 9 }, { beat: "ignored", hidden: false }, { beat: 10 }] },
    { type: "Unknown", beat: "ignored" },
    { type: "System", beat: "ignored" },
    null,
  );
  const normalized = normalizeBestdoriScoringChart(chart);
  assert.deepEqual(normalized.slice(0, 7), normalizeBestdoriScoringChart(sourceFixture.songs[0].chart));
  assert.deepEqual(normalized.slice(7).map((note) => note.timeSeconds), [7, 8, 9, 10]);
});

test("both source entry points reject a damaged ordinary note instead of silently deleting it", () => {
  const source = structuredClone(sourceFixture);
  source.songs[0].chart[7].beat = "broken";
  const expected = (error) => error instanceof MedleyFoundationInputError
    && error.code === "INVALID_CHART"
    && error.path === "sourceInput.songs[0].chart[7].beat";
  assert.throws(() => buildFixedMedleyEvaluationInput(source), expected);
  source.schemaVersion = "hhwx-medley-search-source-v1";
  delete source.teams;
  delete source.selectedAreaItemIds;
  assert.throws(() => buildMedleySearchInput(source), expected);
});

test("chart normalization follows Bestdori entity and property-presence semantics", () => {
  const chart = [
    { type: "BPM", beat: 0, bpm: 120 },
    { type: "Single", beat: 0, lane: 3 },
    { type: "Single", beat: 0, lane: 3, skill: false },
    ...Array.from({ length: 5 }, (_, index) => ({
      type: "Directional",
      beat: (index + 1) * 2,
      skill: true,
    })),
    {
      type: "Slide",
      connections: [
        { beat: 12 },
        { beat: 13, hidden: false },
        { beat: 14 },
      ],
    },
    { type: "Unknown", beat: 20 },
    { type: "System", beat: 3, data: "cmd_fever_start.wav" },
  ];
  const notes = normalizeBestdoriScoringChart(chart);

  assert.equal(notes.length, 9);
  assert.deepEqual(notes.slice(0, 2), [
    { noteId: 0, timeSeconds: 0, isSkillTrigger: true },
    { noteId: 1, timeSeconds: 0, isSkillTrigger: false },
  ]);
  assert.equal(notes.filter((note) => note.isSkillTrigger).length, 6);
  assert.equal(notes.some((note) => note.timeSeconds === 6.5), false);
  assert.equal(notes.at(-1).timeSeconds, 7);
});

test("chart normalization rejects scoring notes without a preceding BPM", () => {
  const skillNotes = Array.from({ length: 6 }, (_, index) => ({
    type: "Single",
    beat: index + 1,
    skill: true,
  }));

  assert.throws(
    () => normalizeBestdoriScoringChart(skillNotes.toReversed()),
    (error) => error instanceof MedleyFoundationInputError
      && error.code === "INVALID_CHART"
      && error.path === "chart[5]"
      && error.message.includes("preceding BPM"),
  );
  assert.throws(
    () => normalizeBestdoriScoringChart([
      ...skillNotes,
      { type: "BPM", beat: 2, bpm: 120 },
    ]),
    /INVALID_CHART.*preceding BPM/u,
  );
});

test("plain decimal UI values normalize to exact scorer inputs", () => {
  assert.deepEqual(parsePerfectRatePercent("99.5"), { numerator: 995, decimalScale: 3 });
  assert.deepEqual(parsePerfectRatePercent("100.000"), { numerator: 1, decimalScale: 0 });
  assert.deepEqual(parsePerfectRatePercent("0"), { numerator: 0, decimalScale: 0 });
  assert.equal(parseSongIdText("\t595 "), 595);

  for (const invalid of ["99e-2", "+99", ".99", "01", "100.1"]) {
    assert.throws(() => parsePerfectRatePercent(invalid), MedleyFoundationInputError);
  }
  for (const invalid of ["0", "01", "1.0", "+1", "1e2"]) {
    assert.throws(() => parseSongIdText(invalid), MedleyFoundationInputError);
  }
});
