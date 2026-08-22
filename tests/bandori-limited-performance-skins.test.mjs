import assert from "node:assert/strict";
import test from "node:test";

import {
  BANDORI_LIMITED_PERFORMANCE_SKINS,
  getBandoriLimitedPerformanceSkin,
} from "../src/app/[locale]/bandori/songs/[songId]/limited-performance-skins.ts";
import {
  getBandoriNativeNoteFrameUrl,
} from "../src/app/[locale]/bandori/songs/[songId]/native-note-assets.ts";
import {
  getBandoriNativeTapSeCueBankId,
} from "../src/lib/bandori/chart-simulator/native-note-sound-presentation.ts";

test("only the fully closed Persona collaboration is browser-selectable", () => {
  assert.deepEqual(BANDORI_LIMITED_PERFORMANCE_SKINS.map(({ id }) => id), ["persona"]);
  const skin = getBandoriLimitedPerformanceSkin("persona");
  assert.ok(skin);
  assert.deepEqual(skin.coverage, [
    "lane",
    "notes",
    "directionalFlick",
    "tapEffect",
    "directionalFlickEffect",
    "soundEffect",
  ]);
  assert.equal(skin.coverage.includes("background"), false);
  assert.deepEqual(skin.effects.animatedVerticalBeam, {
    hierarchyPath: "effect_tap_swipe/line1",
    recipe: "flick",
    travelSpeedMultiplier: 4,
  });
  assert.equal(skin.fieldSkin.judgmentLineSpriteHeight, 40);
  assert.equal(getBandoriNativeTapSeCueBankId(skin.tapSeSkin), "tapse-persona");
});

test("Persona note frames and effects use fixed direct files without a runtime catalog", () => {
  const skin = getBandoriLimitedPerformanceSkin("persona");
  assert.ok(skin);
  assert.equal(
    getBandoriNativeNoteFrameUrl(
      "note_normal_3",
      skin.noteSkin,
      skin.directionalFlickSkin,
    ),
    "/local/chart-simulator/ingameskin/noteskin/skin_persona/sprites/note_normal_3.png",
  );
  assert.equal(
    getBandoriNativeNoteFrameUrl(
      "note_flick_top_l",
      skin.noteSkin,
      skin.directionalFlickSkin,
    ),
    "/local/chart-simulator/ingameskin/noteskin/directionalflickskin_persona/sprites/note_flick_top_l.png",
  );
  for (const url of [
    ...Object.values(skin.effects.recipes),
    ...Object.values(skin.effects.directionalRecipes),
    ...Object.values(skin.effects.resources),
  ]) {
    assert.match(url, /^\/local\/chart-simulator\//u);
    assert.doesNotMatch(url, /manifest|index\.json|api\//iu);
  }
});

test("clearing the selector has no implicit fallback skin", () => {
  assert.equal(getBandoriLimitedPerformanceSkin(null), null);
});
