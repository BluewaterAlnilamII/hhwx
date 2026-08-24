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
  BANDORI_CHART_SIMULATOR_PREFERENCES_STORAGE_KEY,
  createDefaultBandoriChartSimulatorPreferences,
  normalizeBandoriChartSimulatorPreferences,
  readBandoriChartSimulatorPreferences,
  writeBandoriChartSimulatorPreferences,
} from "../src/app/[locale]/bandori/songs/[songId]/chart-simulator-preferences.ts";
import {
  BANDORI_NATIVE_SUDDEN_LINE_BORDER_PIXELS,
  BANDORI_NATIVE_VOLUME_DEFAULT,
  adjustBandoriNativeNoteSize,
  adjustBandoriNativeSuddenRate,
  getBandoriNativeBgmGain,
  getBandoriNativeNoteScale,
  getBandoriNativeSeGain,
  getBandoriNativeSuddenLineScreenY,
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
  assert.equal(BANDORI_NATIVE_VOLUME_DEFAULT, 70);
  assert.equal(getBandoriNativeBgmGain(70), 0.7);
  assert.equal(getBandoriNativeBgmGain(0), 0.0001);
  assert.equal(getBandoriNativeSeGain(70), 0.7);
  assert.equal(getBandoriNativeSeGain(0), 0);
});

test("chart simulator preferences persist every effect, skin, and volume control", () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const preferences = {
    backgroundSkinId: "off",
    bgmVolume: 31,
    directionalEffectVariant: "off",
    directionalFlickSkinId: 5,
    fieldSkinId: 15,
    isBgmMuted: true,
    isLaneEffectEnabled: false,
    isMirrored: true,
    isRhythmSupportEnabled: false,
    isSeMuted: true,
    isSuddenLaneEnabled: true,
    isSyncLineEnabled: false,
    limitedPerformanceSkinId: "witch",
    noteSize: 130,
    noteSkinId: 7,
    noteSpeed: 8.75,
    playbackRateHundredths: 73,
    seVolume: 42,
    suddenRate: 64,
    tapEffectSkinId: "off",
    tapSeSkinId: 3,
  };

  writeBandoriChartSimulatorPreferences(storage, preferences);

  assert.deepEqual(readBandoriChartSimulatorPreferences(storage), preferences);
  assert.deepEqual(
    JSON.parse(values.get(BANDORI_CHART_SIMULATOR_PREFERENCES_STORAGE_KEY)),
    preferences,
  );
});

test("chart simulator preferences safely normalize stale or invalid stored values", () => {
  const defaults = createDefaultBandoriChartSimulatorPreferences();
  assert.deepEqual(normalizeBandoriChartSimulatorPreferences({
    backgroundSkinId: "unknown",
    bgmVolume: 101,
    directionalEffectVariant: "future",
    directionalFlickSkinId: 99,
    fieldSkinId: "retired",
    isBgmMuted: "true",
    isLaneEffectEnabled: false,
    isMirrored: true,
    isRhythmSupportEnabled: false,
    isSeMuted: true,
    isSuddenLaneEnabled: true,
    isSyncLineEnabled: false,
    limitedPerformanceSkinId: "unknown",
    noteSize: 207,
    noteSkinId: 99,
    noteSpeed: 10.126,
    playbackRateHundredths: 20,
    seVolume: -4,
    suddenRate: 105,
    tapEffectSkinId: "future",
    tapSeSkinId: 99,
  }), {
    ...defaults,
    bgmVolume: 100,
    isLaneEffectEnabled: false,
    isMirrored: true,
    isRhythmSupportEnabled: false,
    isSeMuted: true,
    isSuddenLaneEnabled: true,
    isSyncLineEnabled: false,
    noteSize: 200,
    noteSpeed: 10.13,
    playbackRateHundredths: 50,
    seVolume: 0,
    suddenRate: 100,
  });
  assert.deepEqual(readBandoriChartSimulatorPreferences({
    getItem: () => "not JSON",
    setItem: () => {},
  }), defaults);
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
  assert.ok(Math.abs(getBandoriNativeSuddenLineScreenY(1) - 42.809264587402344) < 1e-12);
  assert.ok(Math.abs(getBandoriNativeSuddenLineScreenY(50) - 326.01527099609376) < 1e-12);
  assert.ok(Math.abs(getBandoriNativeSuddenLineScreenY(100) - 615.0009918212891) < 1e-12);
  assert.ok(Math.abs(getBandoriNativeSuddenLineSize(1).width - 82.67365) < 1e-12);
  assert.ok(Math.abs(getBandoriNativeSuddenLineSize(50).width - 574.5675) < 1e-12);
  assert.equal(getBandoriNativeSuddenLineSize(100).width, 1076.5);
  assert.equal(getBandoriNativeSuddenLineSize(100).height, 3);
  assert.deepEqual(BANDORI_NATIVE_SUDDEN_LINE_BORDER_PIXELS, {
    bottom: 0,
    left: 26,
    right: 26,
    top: 0,
  });
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
