import assert from "node:assert/strict";
import test from "node:test";
import {
  BANDORI_NATIVE_DIRECTIONAL_EFFECT_RECIPE_KEYS,
  getBandoriNativeDirectionalEffectAssetContract,
} from "../src/app/[locale]/bandori/songs/[songId]/native-directional-effect-assets.ts";
import {
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS,
} from "../src/app/[locale]/bandori/songs/[songId]/native-note-assets.ts";
import {
  BANDORI_LIMITED_PERFORMANCE_SKINS,
} from "../src/app/[locale]/bandori/songs/[songId]/limited-performance-skins.ts";
import {
  adjustBandoriNativeNoteSize,
  adjustBandoriNativeSuddenRate,
  getBandoriNativeNoteScale,
  getBandoriNativeSuddenLineSize,
  getBandoriNativeSuddenRatio,
  getBandoriNativeSuddenScreenY,
  isBandoriNativeMultiRangeChart,
} from "../src/app/[locale]/bandori/songs/[songId]/native-live-settings.ts";

test("native live-setting ranges clamp to the verified JP controls", () => {
  assert.equal(adjustBandoriNativeNoteSize(100, -10), 90);
  assert.equal(adjustBandoriNativeNoteSize(10, -10), 10);
  assert.equal(adjustBandoriNativeNoteSize(200, 10), 200);
  assert.equal(adjustBandoriNativeSuddenRate(0, -5), 0);
  assert.equal(adjustBandoriNativeSuddenRate(99, 5), 100);
});

test("Habahiro charts clamp the effective note scale without changing the stored value", () => {
  assert.equal(getBandoriNativeNoteScale(10, false), 0.1);
  assert.equal(getBandoriNativeNoteScale(200, false), 2);
  assert.equal(getBandoriNativeNoteScale(10, true), 0.8);
  assert.equal(getBandoriNativeNoteScale(200, true), 1.5);

  const ordinary = {
    notes: {
      coverageOffsets: new Uint32Array([0, 1, 2]),
      times: new Float64Array([0, 1]),
    },
  };
  const habahiro = {
    notes: {
      coverageOffsets: new Uint32Array([0, 1, 4]),
      times: new Float64Array([0, 1]),
    },
  };
  assert.equal(isBandoriNativeMultiRangeChart(ordinary), false);
  assert.equal(isBandoriNativeMultiRangeChart(habahiro), true);
});

test("Sudden uses the native nonzero minimum and field projection", () => {
  assert.equal(getBandoriNativeSuddenRatio(0), 0);
  assert.ok(Math.abs(getBandoriNativeSuddenRatio(1) - 0.0595) < 1e-12);
  assert.equal(getBandoriNativeSuddenRatio(100), 1);
  assert.equal(getBandoriNativeSuddenScreenY(0), 5);
  assert.equal(getBandoriNativeSuddenScreenY(100), 615);
  assert.equal(getBandoriNativeSuddenLineSize(100).width, 1160);
  assert.ok(getBandoriNativeSuddenLineSize(1).width > 0);
});

test("all six directional families expose both exact eight-recipe variants", () => {
  const persona = BANDORI_LIMITED_PERFORMANCE_SKINS.find(
    (skin) => skin.id === "persona",
  )?.directionalFlickSkin;
  assert.ok(persona);
  const families = [...BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS, persona];
  assert.equal(families.length, 6);

  for (const skin of families) {
    const contract = getBandoriNativeDirectionalEffectAssetContract(skin);
    for (const variant of ["normal", "light"]) {
      assert.deepEqual(
        Object.keys(contract.recipes[variant]).sort(),
        [...BANDORI_NATIVE_DIRECTIONAL_EFFECT_RECIPE_KEYS].sort(),
      );
      for (const url of Object.values(contract.recipes[variant])) {
        assert.match(url, new RegExp(`directionalflick${skin.assetBundleName}${variant}`));
      }
    }
    assert.equal(Object.keys(contract.resources).length, skin.assetBundleName === "skin_persona" ? 6 : 3);
  }
  assert.throws(
    () => getBandoriNativeDirectionalEffectAssetContract({
      ...BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS[0],
      assetBundleName: "skin_future",
    }),
    /outside the verified JP set/u,
  );
});
