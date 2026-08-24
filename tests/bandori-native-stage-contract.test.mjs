import assert from "node:assert/strict";
import test from "node:test";
import { BANDORI_COMPILED_DIRECTION } from "../src/lib/bandori/chart-simulator/compiler.ts";
import {
  BANDORI_NATIVE_BACKGROUND_RECT,
  BANDORI_NATIVE_BACKGROUND_SKIN,
  BANDORI_NATIVE_BACKGROUND_SKINS,
  BANDORI_NATIVE_FIELD_RECT,
  BANDORI_NATIVE_FIELD_SKIN,
  BANDORI_NATIVE_FIELD_SKIN_CHOICES,
  BANDORI_NATIVE_FIELD_SKINS,
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

test("ordinary backgrounds preserve native compositions and end with black Off", () => {
  assert.deepEqual(BANDORI_NATIVE_BACKGROUND_RECT, {
    left: -216.2,
    top: -131,
    width: 1766.4,
    height: 1324.8,
  });
  assert.equal(
    BANDORI_NATIVE_BACKGROUND_SKIN.layers[0].textureUrl,
    "/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/bgskin/skin00/livebg_normal.png",
  );
  assert.equal(BANDORI_NATIVE_BACKGROUND_SKIN.id, "skin00");
  assert.deepEqual(
    BANDORI_NATIVE_BACKGROUND_SKINS.map((skin) => [skin.id, skin.layers.length]),
    [
      ["skin00", 1],
      ["skin02", 2],
      ["skin03", 3],
      ["teamLiveJudgment", 1],
      ["teamLiveCombo", 1],
      ["teamLiveLife", 1],
      ["practice", 1],
      ["off", 0],
    ],
  );

  const skin02 = BANDORI_NATIVE_BACKGROUND_SKINS[1];
  assert.match(skin02.layers[0].textureUrl, /\/skin02\/livebg_normal\.png$/u);
  assert.match(skin02.layers[1].textureUrl, /\/skin02\/livebg_layer1\.png$/u);
  closeTo(skin02.layers[1].rect.left, -216.2);
  closeTo(skin02.layers[1].rect.top, -403.78);
  closeTo(skin02.layers[1].rect.width, 1766.4);
  closeTo(skin02.layers[1].rect.height, 552.92);

  const skin03 = BANDORI_NATIVE_BACKGROUND_SKINS[2];
  closeTo(skin03.layers[1].rect.top, -407.46);
  closeTo(skin03.layers[1].rect.height, 560.28);
  closeTo(skin03.layers[2].rect.top, -346.28);
  closeTo(skin03.layers[2].rect.height, 437.92);

  const practice = BANDORI_NATIVE_BACKGROUND_SKINS[6];
  assert.match(practice.layers[0].textureUrl, /\/skinpractice\/livebg_normal\.png$/u);
  assert.deepEqual(practice.layers[0].rect, BANDORI_NATIVE_BACKGROUND_RECT);
  assert.deepEqual(BANDORI_NATIVE_BACKGROUND_SKINS[7], {
    id: "off",
    layers: [],
  });

  for (const teamLive of BANDORI_NATIVE_BACKGROUND_SKINS.slice(3, 6)) {
    assert.match(teamLive.layers[0].textureUrl, /\/(?:perfect|combo|life)stage\.png$/u);
    assert.deepEqual(teamLive.layers[0].rect, BANDORI_NATIVE_BACKGROUND_RECT);
  }
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
  assert.deepEqual(
    BANDORI_NATIVE_FIELD_SKIN_CHOICES.map((skin) => skin.id),
    [1, 2, 3, 4, 5, 13, 14, 6, 7, 8, 9, 10, 11, 12, 15],
  );
});

test("judgment-line Sprite dimensions select native Button4 geometry without changing its carrier", () => {
  const skin00 = getBandoriNativeJudgmentLineRect(38);
  const narrow = getBandoriNativeJudgmentLineRect(18);
  const tall = getBandoriNativeJudgmentLineRect(56);
  const defaultRect = getBandoriNativeJudgmentLineRect(
    BANDORI_NATIVE_FIELD_SKIN.judgmentLineSpriteHeight,
    BANDORI_NATIVE_FIELD_SKIN.judgmentLineSpriteWidth,
  );
  const narrowTexture = getBandoriNativeJudgmentLineRect(55, 1782);
  const wideTexture = getBandoriNativeJudgmentLineRect(56, 1801);
  closeTo(skin00.left, -232.1945);
  closeTo(skin00.top, 596.256);
  closeTo(skin00.width, 1798.389);
  closeTo(skin00.height, 37.966);
  closeTo(narrow.width, skin00.width);
  closeTo(tall.width, skin00.width);
  closeTo(narrowTexture.width / skin00.width, 1782 / 1800);
  closeTo(wideTexture.width / skin00.width, 1801 / 1800);
  closeTo(narrow.height / skin00.height, 18 / 38);
  closeTo(tall.height / skin00.height, 56 / 38);
  closeTo(defaultRect.left, tall.left);
  closeTo(defaultRect.top, tall.top);
  closeTo(defaultRect.height, tall.height);
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
