import assert from "node:assert/strict";
import test from "node:test";
import { BANDORI_COMPILED_DIRECTION } from "../src/lib/bandori/chart-simulator/compiler.ts";
import {
  BANDORI_NATIVE_BACKGROUND_RECT,
  BANDORI_NATIVE_BACKGROUND_TEXTURE_URL,
  BANDORI_NATIVE_FIELD_RECT,
  BANDORI_NATIVE_FIELD_SKIN,
  BANDORI_NATIVE_FIELD_SKINS,
  BANDORI_NATIVE_JUDGMENT_LINE_RECT,
  BANDORI_NATIVE_STAGE_SIZE,
  getBandoriNativeJudgmentLineRect,
  mirrorBandoriChartPoint,
} from "../src/app/[locale]/bandori/songs/[songId]/native-stage-contract.ts";

const closeTo = (actual, expected, tolerance = 0.001) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);
};

test("native stage and field geometry stay fixed to APK evidence", () => {
  assert.deepEqual(BANDORI_NATIVE_STAGE_SIZE, { width: 1334, height: 750 });
  assert.deepEqual(BANDORI_NATIVE_FIELD_RECT, {
    left: 87,
    top: 5,
    width: 1160,
    height: 610,
  });
});

test("normal-play background layout is independent from its verified texture", () => {
  assert.deepEqual(BANDORI_NATIVE_BACKGROUND_RECT, {
    left: -216.2,
    top: -131,
    width: 1766.4,
    height: 1324.8,
  });
  assert.equal(
    BANDORI_NATIVE_BACKGROUND_TEXTURE_URL,
    "/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/bgskin/skin00/livebg_normal.png",
  );
  assert.equal(BANDORI_NATIVE_FIELD_SKIN.id, 10);
  assert.equal(BANDORI_NATIVE_FIELD_SKIN.assetBundleName, "skin09");
});

test("all master lane skins keep their exact paired JP field and judgment-line resources", () => {
  assert.equal(BANDORI_NATIVE_FIELD_SKINS.length, 15);
  assert.deepEqual(
    BANDORI_NATIVE_FIELD_SKINS.map((skin) => [
      skin.id,
      skin.assetBundleName,
      skin.skinType,
      skin.judgmentLineSpriteHeight,
    ]),
    [
      [1, "skin00", "normal", 38],
      [2, "skin01", "normal", 38],
      [3, "skin02", "normal", 38],
      [4, "skin03", "normal", 18],
      [5, "skin04", "normal", 40],
      [6, "skin05", "mission", 56],
      [7, "skin06", "mission", 56],
      [8, "skin07", "mission", 56],
      [9, "skin08", "mission", 56],
      [10, "skin09", "mission", 56],
      [11, "skin10", "mission", 56],
      [12, "skin11", "mission", 56],
      [13, "skin12", "normal", 56],
      [14, "skin13", "normal", 40],
      [15, "skin14", "mission", 56],
    ],
  );
  assert.equal(
    BANDORI_NATIVE_FIELD_SKINS[0].judgmentLineTextureUrl,
    "/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/fieldskin/skin00/game_play_line.png",
  );
  for (const skin of BANDORI_NATIVE_FIELD_SKINS) {
    assert.match(skin.textureUrl, new RegExp(`/fieldskin/${skin.assetBundleName}/bg_line_rhythm\\.png$`, "u"));
    assert.match(skin.judgmentLineTextureUrl, new RegExp(`/fieldskin/${skin.assetBundleName}/game_play_line\\.png$`, "u"));
  }
});

test("judgment-line Sprite height selects native Button4 geometry without changing its carrier", () => {
  const skin00 = getBandoriNativeJudgmentLineRect(38);
  const narrow = getBandoriNativeJudgmentLineRect(18);
  const tall = getBandoriNativeJudgmentLineRect(56);
  closeTo(skin00.left, -232.1945);
  closeTo(skin00.top, 596.256);
  closeTo(skin00.width, 1798.389);
  closeTo(skin00.height, 37.966);
  closeTo(narrow.width, skin00.width);
  closeTo(tall.width, skin00.width);
  closeTo(narrow.height / skin00.height, 18 / 38);
  closeTo(tall.height / skin00.height, 56 / 38);
  closeTo(BANDORI_NATIVE_JUDGMENT_LINE_RECT.left, tall.left);
  closeTo(BANDORI_NATIVE_JUDGMENT_LINE_RECT.top, tall.top);
  closeTo(BANDORI_NATIVE_JUDGMENT_LINE_RECT.height, tall.height);
});

test("mirror changes chart lanes and directions without transforming the stage", () => {
  assert.deepEqual(
    mirrorBandoriChartPoint(1, 2, BANDORI_COMPILED_DIRECTION.left),
    {
      lane: 5,
      width: 2,
      direction: BANDORI_COMPILED_DIRECTION.right,
      leftLane: 5,
      rightLane: 7,
    },
  );
  assert.deepEqual(
    mirrorBandoriChartPoint(5, 2, BANDORI_COMPILED_DIRECTION.none),
    {
      lane: 1,
      width: 2,
      direction: BANDORI_COMPILED_DIRECTION.none,
      leftLane: 0,
      rightLane: 2,
    },
  );
});
