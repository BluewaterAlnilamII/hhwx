import assert from "node:assert/strict";
import test from "node:test";
import { getBandoriDeckRankLayout } from "../src/lib/bandori/deck-rank-layout.ts";

const rect = ({ x, y, width, height }) => [x, y, width, height];

test("deck ranks restore the JP 10.1.3 atlas padding and right-hand digit overlay", () => {
  const ss5 = getBandoriDeckRankLayout("ss", 5);
  assert.deepEqual(ss5.map(rect), [[0.5, 2.5, 49, 45], [37, 24.5, 16, 21]]);
  // SSS deliberately fills a square widget despite its 140×90 original canvas.
  const sss = getBandoriDeckRankLayout("sss", 1);
  assert.deepEqual(rect(sss[0]), [2 * 50 / 140, 0, 135 * 50 / 140, 50]);
  assert.deepEqual(rect(sss[1]), [37.5, 24, 12, 21.5]);
  const ss10 = getBandoriDeckRankLayout("ss", 10);
  assert.deepEqual(ss10.map(rect), [[0.5, 2.5, 49, 45], [32.5, 24, 11.5, 21.5], [42.5, 24, 16, 21.5]]);
  assert.ok(ss10[2].x + ss10[2].width > 50, "the last digit may extend beyond the symbol box");
  const ss100 = getBandoriDeckRankLayout("ss", 100);
  assert.deepEqual(rect(ss100[0]), rect(ss5[0]), "digits must not move the symbol");
  assert.ok(Math.abs(ss100[1].x - 29.74) < 1e-10);
  assert.ok(Math.abs(ss100[2].x - 37.54) < 1e-10);
  assert.ok(Math.abs(ss100[3].x - 46.12) < 1e-10);
  assert.equal(ss100[1].height, 43 * 19.5 / 50);
});

test("deck ranks hide zero-level digits and avoid unsupported sprite or digit counts", () => {
  for (const level of [null, 0]) assert.equal(getBandoriDeckRankLayout("ss", level).length, 1);
  assert.deepEqual(getBandoriDeckRankLayout("hyphen", 5).map(rect), [[19.5, 20.5, 11.5, 8.5]]);
  assert.equal(getBandoriDeckRankLayout("ss", 1000), null);
  assert.equal(getBandoriDeckRankLayout("sss", 6), null);
  assert.equal(getBandoriDeckRankLayout("a", 4), null);
  assert.equal(getBandoriDeckRankLayout("unknown", 1), null);
});
