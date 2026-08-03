import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_TOPDATA_MAX_SAMPLE_SIZE,
  countBandoriTopDataSamples,
  groupBandoriTopDataSamples,
  parseBandoriTopDataPayload,
} from "../src/lib/bandori-topdata-contract.ts";

function payload(count = 10, time = 1_785_501_041_920) {
  return {
    points: Array.from({ length: count }, (_, index) => ({
      time,
      uid: 1_001 + index,
      value: 1_000_000 - Math.floor(index / 2),
    })),
    users: Array.from({ length: count }, (_, index) => ({
      uid: 1_001 + index,
      name: `Player ${index + 1}`,
      introduction: "",
      rank: 300,
      sid: index === 0 ? 0 : 1_801 + index,
      strained: index % 2,
      degrees: index === 0 ? [] : [8_508, 20_094],
    })),
  };
}

test("accepts a complete TOP10 sample and preserves tied ranking order", () => {
  assert.deepEqual(parseBandoriTopDataPayload(payload()), payload());
});

test("accepts partial samples and rejects user registries that do not cover points", () => {
  for (const count of [1, 3, 9, 10]) {
    assert.deepEqual(parseBandoriTopDataPayload(payload(count)), payload(count));
  }

  const uncovered = payload();
  uncovered.users.pop();
  assert.throws(() => parseBandoriTopDataPayload(uncovered), /cover every point UID/u);
});

test("groups variable-size history by time and rejects samples above ten", () => {
  const first = payload(1, 1_785_501_041_920);
  const second = payload(5, 1_785_501_071_920);
  const third = payload(10, 1_785_501_101_920);
  const mixed = {
    points: [...first.points, ...second.points, ...third.points],
    users: third.users,
  };
  const parsed = parseBandoriTopDataPayload(mixed);
  assert.equal(parsed.points.length, 16);
  assert.equal(countBandoriTopDataSamples(parsed.points), 3);
  assert.deepEqual(groupBandoriTopDataSamples(parsed.points).map((sample) => sample.length), [1, 5, 10]);
  assert.equal(BANDORI_TOPDATA_MAX_SAMPLE_SIZE, 10);

  const oversized = payload(10);
  oversized.points.push({
    time: oversized.points[0].time,
    uid: 99_999,
    value: 1,
  });
  oversized.users.push({
    uid: 99_999,
    name: "Eleventh",
    introduction: "",
    rank: 1,
    sid: 0,
    strained: 0,
    degrees: [],
  });
  oversized.users.sort((left, right) => left.uid - right.uid);
  assert.throws(() => parseBandoriTopDataPayload(oversized), /between one and ten/u);
});

test("rejects decreasing or non-contiguous sample times", () => {
  const first = payload(1, 1_785_501_041_920);
  const second = payload(1, 1_785_501_071_920);

  assert.throws(
    () => parseBandoriTopDataPayload({
      points: [...second.points, ...first.points],
      users: second.users,
    }),
    /strictly increasing/u,
  );
  assert.throws(
    () => parseBandoriTopDataPayload({
      points: [...first.points, ...second.points, ...first.points],
      users: first.users,
    }),
    /strictly increasing/u,
  );
});

test("rejects unsafe integers, extra fields, and ranking score inversions", () => {
  const unsafe = payload();
  unsafe.points[0].uid = Number.MAX_SAFE_INTEGER + 1;
  assert.throws(() => parseBandoriTopDataPayload(unsafe), /safe integer/u);

  const extra = payload();
  extra.users[0].deck = { cards: [1, 2, 3] };
  assert.throws(() => parseBandoriTopDataPayload(extra), /fields are invalid/u);

  const inverted = payload();
  inverted.points[1].value = inverted.points[0].value + 1;
  assert.throws(() => parseBandoriTopDataPayload(inverted), /non-increasing/u);
});
