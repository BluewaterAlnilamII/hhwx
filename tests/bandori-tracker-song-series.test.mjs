import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeTrackerSongGroups,
  resolveSelectedSongId,
  selectSongCutoffs,
} from "../src/lib/bandori-tracker-song-series.ts";

function eventMeta(eventType, musicIds) {
  return {
    eventType,
    musicIds: {
      jp: musicIds.jp ?? [],
      en: musicIds.en ?? [],
      tw: musicIds.tw ?? [],
      cn: musicIds.cn ?? [],
    },
  };
}

test("Versus resolves its one regional music ID", () => {
  assert.equal(
    resolveSelectedSongId("song", eventMeta("versus", { jp: [807] }), 0, 0),
    807,
  );
});

test("Versus merges legacy song 0 into the explicit series", () => {
  const merged = selectSongCutoffs(
    [
      { songId: 0, cutoffs: [{ time: 1000, ep: 10 }, { time: 2000, ep: 20, isFinal: true }] },
      { songId: 807, cutoffs: [{ time: 2000, ep: 21 }, { time: 3000, ep: 30 }] },
    ],
    807,
    "versus",
  );

  assert.deepEqual(merged.map(({ time, ep }) => ({ time, ep })), [
    { time: 1000, ep: 10 },
    { time: 2000, ep: 21 },
    { time: 3000, ep: 30 },
  ]);
  assert.equal(merged[1].isFinal, undefined);
});

test("Versus falls back to legacy song 0 before migration", () => {
  assert.deepEqual(
    selectSongCutoffs(
      [{ songId: 0, cutoffs: [{ time: 1000, ep: 10 }] }],
      807,
      "versus",
    ),
    [{ time: 1000, ep: 10 }],
  );
});

test("cache refresh order preserves both Versus groups", () => {
  const legacy = [{ songId: 0, cutoffs: [{ time: 1000, ep: 10 }] }];
  const explicit = [{ songId: 807, cutoffs: [{ time: 2000, ep: 20, isFinal: true }] }];

  for (const groups of [
    mergeTrackerSongGroups(explicit, legacy),
    mergeTrackerSongGroups(legacy, explicit),
  ]) {
    assert.deepEqual(
      selectSongCutoffs(groups, 807, "versus").map(({ time, ep, isFinal }) => ({ time, ep, isFinal })),
      [
        { time: 1000, ep: 10, isFinal: undefined },
        { time: 2000, ep: 20, isFinal: true },
      ],
    );
  }
});

test("Challenge never merges the legacy song 0 group", () => {
  assert.deepEqual(
    selectSongCutoffs(
      [
        { songId: 0, cutoffs: [{ time: 1000, ep: 10 }] },
        { songId: 101, cutoffs: [{ time: 2000, ep: 20 }] },
      ],
      101,
      "challenge",
    ),
    [{ time: 2000, ep: 20 }],
  );
});

test("Challenge selection and Medley song 0 behavior remain unchanged", () => {
  const challenge = eventMeta("challenge", { cn: [103, 101, 102] });
  assert.equal(resolveSelectedSongId("song", challenge, 102, 3), 102);
  assert.equal(resolveSelectedSongId("song", challenge, 999, 3), 101);
  assert.equal(
    resolveSelectedSongId("song", eventMeta("medley", { jp: [1, 2, 3] }), 3, 0),
    0,
  );
  assert.deepEqual(
    selectSongCutoffs([{ songId: 0, cutoffs: [{ time: 1000, ep: 10 }] }], 0, "medley"),
    [{ time: 1000, ep: 10 }],
  );
});
