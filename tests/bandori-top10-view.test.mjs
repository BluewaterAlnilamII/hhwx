import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_TOP10_LINE_COLORS,
  buildBandoriTop10View,
} from "../src/lib/bandori-top10-view.ts";
import { BANDORI_TOPDATA_MAX_SAMPLE_SIZE } from "../src/lib/bandori-topdata-contract.ts";

test("TOP10 line colors cover the complete contract sample size", () => {
  assert.equal(BANDORI_TOP10_LINE_COLORS.length, BANDORI_TOPDATA_MAX_SAMPLE_SIZE);
});

test("TOP10 view keeps only newest-sample UIDs and preserves missing-sample gaps", () => {
  const view = buildBandoriTop10View({
    points: [
      { time: 1000, uid: 101, value: 100 },
      { time: 1000, uid: 102, value: 90 },
      { time: 2000, uid: 102, value: 120 },
      { time: 2000, uid: 103, value: 110 },
      { time: 3000, uid: 101, value: 150 },
      { time: 3000, uid: 103, value: 145 },
    ],
    users: [
      { uid: 101, name: "[b]Alice[/b]", introduction: "", rank: 100, sid: 1610, strained: 1, degrees: [] },
      { uid: 102, name: "Former player", introduction: "", rank: 100, sid: 0, strained: 0, degrees: [] },
      { uid: 103, name: "Bob", introduction: "", rank: 100, sid: 2208, strained: 0, degrees: [] },
    ],
  });

  assert.equal(view.latestTime, 3000);
  assert.deepEqual(view.players.map((player) => ({
    position: player.position,
    uid: player.uid,
    name: player.name,
    score: player.score,
    avatarCardId: player.avatarCardId,
    isAvatarTrained: player.isAvatarTrained,
    color: player.color,
  })), [
    {
      position: 1,
      uid: 101,
      name: "[b]Alice[/b]",
      score: 150,
      avatarCardId: 1610,
      isAvatarTrained: true,
      color: BANDORI_TOP10_LINE_COLORS[0],
    },
    {
      position: 2,
      uid: 103,
      name: "Bob",
      score: 145,
      avatarCardId: 2208,
      isAvatarTrained: false,
      color: BANDORI_TOP10_LINE_COLORS[1],
    },
  ]);
  assert.equal(view.chartData[0].top10_uid_101, 100);
  assert.equal("top10_uid_103" in view.chartData[0], false);
  assert.equal("top10_uid_101" in view.chartData[1], false);
  assert.equal(view.chartData[1].top10_uid_103, 110);
  assert.equal("top10_uid_102" in view.chartData[1], false);
  assert.deepEqual(view.scores, [100, 110, 150, 145]);
});

test("TOP10 view accepts a partial one-player newest sample", () => {
  const view = buildBandoriTop10View({
    points: [{ time: 1000, uid: 101, value: 100 }],
    users: [{ uid: 101, name: "Alice", introduction: "", rank: 1, sid: 0, strained: 0, degrees: [] }],
  });

  assert.equal(view.players.length, 1);
  assert.equal(view.players[0].position, 1);
  assert.equal(view.chartData.length, 1);
});
