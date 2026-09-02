import assert from "node:assert/strict";
import test from "node:test";

import {
  MedleyFoundationInputError,
  normalizeBestdoriScoringChart,
  parsePerfectRatePercent,
  parseSongIdText,
} from "../src/lib/bandori/medley-foundation/index.ts";

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
