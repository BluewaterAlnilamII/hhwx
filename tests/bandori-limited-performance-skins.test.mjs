import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import test from "node:test";

import { BANDORI_LIMITED_PERFORMANCE_SKINS } from "../src/app/[locale]/bandori/songs/[songId]/limited-performance-skins.ts";
import {
  getBandoriNativeNoteFrameUrl,
} from "../src/app/[locale]/bandori/songs/[songId]/native-note-assets.ts";
import {
  getBandoriNativeTapSeCueBankId,
} from "../src/lib/bandori/chart-simulator/native-note-sound-presentation.ts";
import {
  createBandoriEffectRecipeRuntime,
} from "../src/lib/bandori/chart-simulator/effect-recipe-runtime.ts";

const chartSimulatorProjectionRoot =
  process.env.HHWX_CHART_SIMULATOR_PROJECTION_ROOT?.trim() || null;

function findLimitedPerformanceSkin(id) {
  return BANDORI_LIMITED_PERFORMANCE_SKINS.find((skin) => skin.id === id) ?? null;
}

function getProjectionFilePath(logicalUrl) {
  assert.ok(chartSimulatorProjectionRoot);
  const prefix = "/local/chart-simulator/";
  assert.ok(logicalUrl.startsWith(prefix));
  const root = resolve(chartSimulatorProjectionRoot);
  const file = resolve(root, logicalUrl.slice(prefix.length));
  assert.ok(file.startsWith(`${root}${sep}`));
  return file;
}

test("the selector exposes exactly the approved limited performance skins", () => {
  assert.deepEqual(BANDORI_LIMITED_PERFORMANCE_SKINS.map(({ id }) => id), [
    "april2018",
    "persona",
    "miku",
    "april2019",
    "cafe",
    "maid",
    "gbp2020",
    "coin",
    "witch",
    "april2021",
    "stage",
    "delta",
    "5th",
    "bike",
    "satan",
    "collabo23_summer_g",
    "collabo23_winter_d",
    "april2024",
    "collabo24_autumn_i",
    "collabo25_autumn_s",
  ]);
  assert.equal(findLimitedPerformanceSkin("practice"), null);
  const skin = findLimitedPerformanceSkin("persona");
  assert.ok(skin);
  assert.deepEqual(skin.coverage, [
    "background",
    "lane",
    "notes",
    "directionalFlick",
    "tapEffect",
    "directionalFlickEffect",
    "soundEffect",
  ]);
  assert.deepEqual(skin.backgroundSkin.layers[0].rect, {
    left: -216.2,
    top: -131,
    width: 1766.4,
    height: 1324.8,
  });
  assert.equal(
    skin.backgroundSkin.layers[0].textureUrl,
    "/local/chart-simulator/assets/star/forassetbundle/asneeded/ingameskin/bgskin/skin_persona/livebg.png",
  );
  assert.deepEqual(skin.effects.animatedVerticalBeam, {
    hierarchyPath: "effect_tap_swipe/line1",
    recipe: "flick",
    travelSpeedMultiplier: 4,
  });
  assert.equal(skin.fieldSkin.judgmentLineSpriteHeight, 40);
  assert.equal(skin.fieldSkin.judgmentLineSpriteWidth, 1800);
  assert.equal(getBandoriNativeTapSeCueBankId(skin.tapSeSkin), "tapse-persona");
});

test("later sparse skins only replace the slots present in their frozen bundles", () => {
  const gbp2020 = findLimitedPerformanceSkin("gbp2020");
  assert.ok(gbp2020);
  assert.deepEqual(gbp2020.coverage, ["background", "lane"]);
  assert.equal(gbp2020.fieldSkin.judgmentLineSpriteWidth, 1782);
  assert.equal(gbp2020.fieldSkin.judgmentLineSpriteHeight, 55);
  assert.equal(gbp2020.noteSkin, null);

  const bike = findLimitedPerformanceSkin("bike");
  assert.ok(bike);
  assert.deepEqual(bike.coverage, ["background", "lane", "judgment"]);
  assert.equal(bike.fieldSkin.judgmentLineSpriteWidth, 1801);
  assert.equal(
    bike.judgmentPerfectTextureUrl,
    "/local/chart-simulator/ingameskin/judgeskin/skin_bike/perfect.png",
  );

  const collaboration = findLimitedPerformanceSkin("collabo23_summer_g");
  assert.ok(collaboration);
  assert.deepEqual(collaboration.coverage, ["background", "lane", "notes"]);
  assert.equal(collaboration.fieldSkin.assetBundleName, "collabo23_summer_g");
  assert.equal(collaboration.noteSkin.assetBundleName, "collabo23_summer_g");
  assert.equal(collaboration.noteSkin.syncLineEdgeMargin, 0);
  assert.equal(collaboration.effects, null);

  const april2021 = findLimitedPerformanceSkin("april2021");
  assert.ok(april2021);
  assert.deepEqual(april2021.coverage, [
    "background",
    "lane",
    "judgment",
    "notes",
    "soundEffect",
  ]);
  assert.equal(april2021.directionalFlickSkin, null);
  assert.equal(april2021.effects, null);
  assert.equal(getBandoriNativeTapSeCueBankId(april2021.tapSeSkin), "tapse-april2021");
});

test("sparse limited skins preserve ordinary slots and Miku reuses its only Long line", () => {
  const backgroundOnly = findLimitedPerformanceSkin("5th");
  assert.ok(backgroundOnly);
  assert.deepEqual(backgroundOnly.coverage, ["background"]);
  assert.equal(backgroundOnly.fieldSkin, null);
  assert.equal(backgroundOnly.noteSkin, null);
  assert.equal(backgroundOnly.effects, null);
  assert.equal(backgroundOnly.tapSeSkin, null);

  const april2018 = findLimitedPerformanceSkin("april2018");
  assert.ok(april2018);
  assert.equal(april2018.backgroundSkin, null);
  assert.equal(april2018.fieldSkin, null);
  assert.equal(
    april2018.noteSkin.curveSlideNoteLineUrl,
    "/local/chart-simulator/assets/star/forassetbundle/startapp/ingameskin/noteskin/skin_april2018/longnoteline2.png",
  );

  const miku = findLimitedPerformanceSkin("miku");
  assert.ok(miku);
  assert.equal(miku.noteSkin.curveSlideNoteLineUrl, miku.noteSkin.longNoteLineUrl);
  assert.equal(miku.fieldSkin.judgmentLineSpriteHeight, 40);
  assert.equal(getBandoriNativeTapSeCueBankId(miku.tapSeSkin), "tapse-miku");
  assert.deepEqual(miku.effects.resources, {
    "limited-miku-tap-tex_e_miku":
      "/local/chart-simulator/ingameskin/tapeffect/skin_miku/textures/tex_e_miku.png",
  });
});

test("Hololive Part 2 combines its new background with the original Delta slots", () => {
  const firstPhase = findLimitedPerformanceSkin("delta");
  const secondPhase = findLimitedPerformanceSkin("collabo23_winter_d");
  assert.ok(firstPhase);
  assert.ok(secondPhase);
  assert.deepEqual(secondPhase.coverage, [
    "background",
    "lane",
    "notes",
    "tapEffect",
    "soundEffect",
  ]);
  assert.match(
    secondPhase.backgroundSkin.layers[0].textureUrl,
    /bgskin\/skin_collabo23_winter_d\/livebg\.png$/,
  );
  assert.notStrictEqual(secondPhase.backgroundSkin, firstPhase.backgroundSkin);
  assert.strictEqual(secondPhase.fieldSkin, firstPhase.fieldSkin);
  assert.strictEqual(secondPhase.noteSkin, firstPhase.noteSkin);
  assert.strictEqual(secondPhase.effects, firstPhase.effects);
  assert.strictEqual(secondPhase.tapSeSkin, firstPhase.tapSeSkin);
  assert.equal(secondPhase.judgmentPerfectTextureUrl, null);
  assert.equal(secondPhase.directionalFlickSkin, null);
});

test("the final six families expose bounded tap effects and reuse Long lines explicitly", () => {
  const cafe = findLimitedPerformanceSkin("cafe");
  assert.ok(cafe);
  assert.deepEqual(cafe.coverage, [
    "background",
    "lane",
    "notes",
    "tapEffect",
    "soundEffect",
  ]);
  assert.ok(cafe.effects);
  assert.equal(cafe.directionalFlickSkin, null);
  assert.equal(cafe.noteSkin.curveSlideNoteLineUrl, cafe.noteSkin.longNoteLineUrl);
  assert.equal(getBandoriNativeTapSeCueBankId(cafe.tapSeSkin), "tapse-cafe");

  const coin = findLimitedPerformanceSkin("coin");
  const witch = findLimitedPerformanceSkin("witch");
  assert.ok(coin);
  assert.ok(witch);
  assert.equal(coin.noteSkin.curveSlideNoteLineUrl, coin.noteSkin.longNoteLineUrl);
  assert.equal(witch.noteSkin.curveSlideNoteLineUrl, witch.noteSkin.longNoteLineUrl);
  assert.ok(coin.effects);
  assert.ok(witch.effects);

  const delta = findLimitedPerformanceSkin("delta");
  const maid = findLimitedPerformanceSkin("maid");
  assert.ok(delta);
  assert.ok(maid);
  assert.match(delta.noteSkin.curveSlideNoteLineUrl, /longnoteline2\.png$/);
  assert.match(maid.noteSkin.curveSlideNoteLineUrl, /longnoteline2\.png$/);
  assert.equal(delta.fieldSkin.judgmentLineSpriteWidth, 1797);
  assert.equal(delta.fieldSkin.judgmentLineSpriteHeight, 41);

  const stage = findLimitedPerformanceSkin("stage");
  assert.ok(stage);
  assert.deepEqual(stage.coverage, [
    "background",
    "lane",
    "notes",
    "tapEffect",
    "soundEffect",
  ]);
  assert.equal(stage.effects.animatedVerticalBeam, null);
  assert.equal(
    stage.effects.recipes.flick,
    "/local/chart-simulator/ingameskin/tapeffect/skin_stage/recipes/flick.json",
  );
  assert.equal(
    stage.effects.resources["limited-stage-tap-par_thunder"],
    "/local/chart-simulator/ingameskin/tapeffect/skin_stage/textures/par_thunder.png",
  );
  assert.equal(getBandoriNativeTapSeCueBankId(stage.tapSeSkin), "tapse-stage");
});

test(
  "a prepared projection closes every final-family effect recipe",
  { skip: chartSimulatorProjectionRoot === null },
  () => {
    for (const id of ["cafe", "coin", "delta", "maid", "witch"]) {
      const skin = findLimitedPerformanceSkin(id);
      assert.ok(skin?.effects);
      assert.ok(skin.coverage.includes("tapEffect"));
      for (const resourceUrl of Object.values(skin.effects.resources)) {
        assert.doesNotThrow(() => readFileSync(getProjectionFilePath(resourceUrl)));
      }
      for (const [recipeName, recipeUrl] of Object.entries(skin.effects.recipes)) {
        const recipe = JSON.parse(readFileSync(
          getProjectionFilePath(recipeUrl),
          "utf8",
        ));
        const referencedResources = new Set(
          Object.values(recipe.materials)
            .map((material) => material.mainTexture)
            .filter(Boolean),
        );
        for (const resourceId of referencedResources) {
          assert.ok(
            resourceId in skin.effects.resources,
            `${id}/${recipeName} should register ${resourceId}`,
          );
        }
        const runtime = createBandoriEffectRecipeRuntime(recipe, {
          buttonIndex: 3,
          seed: 17,
        });
        runtime.play(0, 17);
        assert.doesNotThrow(
          () => runtime.sample(0.1),
          `${id}/${recipeName} should compile and sample`,
        );
      }
    }
  },
);

test("April 2019 uses sparse overrides and keeps ordinary Directional resources", () => {
  const skin = findLimitedPerformanceSkin("april2019");
  assert.ok(skin);
  assert.deepEqual(skin.coverage, [
    "background",
    "lane",
    "judgment",
    "notes",
    "tapEffect",
    "soundEffect",
  ]);
  assert.equal(skin.directionalFlickSkin, null);
  assert.equal(
    skin.backgroundSkin.layers[0].textureUrl,
    "/local/chart-simulator/assets/star/forassetbundle/asneeded/ingameskin/bgskin/skin_april2019/livebg.png",
  );
  assert.equal(skin.effects.animatedVerticalBeam, null);
  assert.deepEqual(skin.effects.directionalRecipes, {});
  assert.equal(
    skin.judgmentPerfectTextureUrl,
    "/local/chart-simulator/ingameskin/judgeskin/skin_april2019/perfect.png",
  );
  assert.equal(
    skin.noteSkin.spriteAnchorsUrl,
    "/local/chart-simulator/ingameskin/noteskin/skin_april2019/sprites/sprite-anchors.json",
  );
  assert.equal(getBandoriNativeTapSeCueBankId(skin.tapSeSkin), "tapse-april2019");
});

test("Persona note frames and effects use fixed direct files without per-skin catalogs", () => {
  const skin = findLimitedPerformanceSkin("persona");
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
