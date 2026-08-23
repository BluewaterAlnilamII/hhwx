import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  BANDORI_CHART_SIMULATOR_MANIFEST_SCHEMA,
  buildBandoriChartSimulatorManifestUrl,
  createBandoriChartSimulatorAssetResolver,
  inferBandoriChartSimulatorBundleKey,
  parseBandoriChartSimulatorAssetIndex,
  parseBandoriChartSimulatorAssetManifest,
} from "../src/lib/bandori/chart-simulator/asset-manifest.ts";
import { loadBandoriChartSimulatorAssets } from "../src/lib/bandori/chart-simulator/asset-manifest-client.ts";
import {
  BANDORI_LIMITED_PERFORMANCE_SKINS,
} from "../src/app/[locale]/bandori/songs/[songId]/limited-performance-skins.ts";
import {
  BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS,
  BANDORI_NATIVE_NOTE_SKINS,
  getBandoriHabahiroSpriteUrl,
  getBandoriNativeLongFlashUrl,
  getBandoriNativeRhythmSupportNoteUrl,
} from "../src/app/[locale]/bandori/songs/[songId]/native-note-assets.ts";
import {
  BANDORI_NATIVE_BACKGROUND_SKINS,
  BANDORI_NATIVE_FIELD_SKINS,
} from "../src/app/[locale]/bandori/songs/[songId]/native-stage-contract.ts";
import {
  BANDORI_HABAHIRO_SPRITES,
} from "../src/app/[locale]/bandori/songs/[songId]/habahiro-note-assets.ts";
import {
  BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL,
  BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL,
  getBandoriNativeLaneEffectUrl,
} from "../src/lib/bandori/chart-simulator/native-hit-effect-presentation.ts";
import {
  BANDORI_NATIVE_HOLD_EFFECT_TEXTURE_URLS,
} from "../src/lib/bandori/chart-simulator/native-hold-effect-presentation.ts";
import {
  BANDORI_NATIVE_ALL_PERFECT_COMBO_DIGIT_URLS,
  BANDORI_NATIVE_ALL_PERFECT_COMBO_UNIT_URL,
  BANDORI_NATIVE_COMBO_DIGIT_URLS,
  BANDORI_NATIVE_COMBO_UNIT_URL,
  BANDORI_NATIVE_PERFECT_JUDGMENT_URL,
} from "../src/lib/bandori/chart-simulator/native-judgment-combo-presentation.ts";
import {
  BANDORI_NATIVE_TAP_SE_SKINS,
} from "../src/lib/bandori/chart-simulator/native-note-sound-presentation.ts";
import {
  BANDORI_NATIVE_DIRECTIONAL_EFFECT_FRAME_URLS,
  BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS,
} from "../src/lib/bandori/chart-simulator/native-swipe-effect-presentation.ts";

const notePackHash = "a".repeat(64);
const backgroundPackHash = "b".repeat(64);
const soundPackHash = "c".repeat(64);

function manifestValue() {
  return {
    schemaVersion: BANDORI_CHART_SIMULATOR_MANIFEST_SCHEMA,
    packs: {
      "ingameskin/noteskin/habahiro": notePackHash,
      "ingameskin/bgskin/skin_teamlivefestival": backgroundPackHash,
      "sound/tapseskin/skin00": soundPackHash,
    },
  };
}

function collectLogicalAssetUrls(value, urls = new Set()) {
  if (typeof value === "string") {
    if (value.startsWith("/local/chart-simulator/")) urls.add(value);
    return urls;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectLogicalAssetUrls(entry, urls);
    return urls;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectLogicalAssetUrls(entry, urls);
  }
  return urls;
}

test("chart-simulator asset contracts stay minimal and fail closed", () => {
  assert.deepEqual(parseBandoriChartSimulatorAssetIndex({
    schemaVersion: 1,
    updatedAt: "2026-08-23T00:00:00Z",
    manifest: "d".repeat(64),
  }), {
    schemaVersion: 1,
    updatedAt: "2026-08-23T00:00:00Z",
    manifest: "d".repeat(64),
  });
  assert.deepEqual(
    { ...parseBandoriChartSimulatorAssetManifest(manifestValue()).packs },
    manifestValue().packs,
  );
  assert.throws(
    () => parseBandoriChartSimulatorAssetIndex({
      schemaVersion: 1,
      updatedAt: "2026-08-23T00:00:00Z",
      manifest: "d".repeat(64),
      size: 1,
    }),
    /unsupported fields/u,
  );
  assert.throws(
    () => parseBandoriChartSimulatorAssetManifest({
      ...manifestValue(),
      kind: "limited",
    }),
    /unsupported fields/u,
  );
});

test("logical paths resolve through the original game bundle pack", () => {
  const manifest = parseBandoriChartSimulatorAssetManifest(manifestValue());
  const resolve = createBandoriChartSimulatorAssetResolver(
    manifest,
    "https://assets.example.test/",
  );
  const noteUrl = "/local/chart-simulator/ingameskin/noteskin/habahiro/sprites/note_normal_2.png";
  assert.equal(
    inferBandoriChartSimulatorBundleKey(noteUrl),
    "ingameskin/noteskin/habahiro",
  );
  assert.equal(
    resolve(noteUrl),
    `https://assets.example.test/bandori/chart-simulator/packs/${notePackHash}/ingameskin/noteskin/habahiro/sprites/note_normal_2.png`,
  );

  const teamLiveUrl = "/local/chart-simulator/assets/star/forassetbundle/asneeded/ingameskin/bgskin/skin_teamlivefestival/lifestage.png";
  assert.equal(
    inferBandoriChartSimulatorBundleKey(teamLiveUrl),
    "ingameskin/bgskin/skin_teamlivefestival",
  );
  assert.equal(
    resolve(teamLiveUrl),
    `https://assets.example.test/bandori/chart-simulator/packs/${backgroundPackHash}/assets/star/forassetbundle/asneeded/ingameskin/bgskin/skin_teamlivefestival/lifestage.png`,
  );
  assert.throws(
    () => resolve("/local/chart-simulator/ingameskin/tapeffect/skin_witch/recipes/flick.json"),
    /pack is unavailable/u,
  );
  assert.throws(
    () => inferBandoriChartSimulatorBundleKey(
      "/local/chart-simulator/assets/star/forassetbundle/asneeded/ingameskin/bgskin/skinteamlivefestival/lifestage.png",
    ),
    /skin_teamlivefestival/u,
  );
  assert.throws(() => resolve("https://example.test/file.png"), /logical asset URL/u);
});

test("every declared simulator asset maps to one game bundle pack", () => {
  const generatedUrls = [
    ...BANDORI_NATIVE_NOTE_SKINS.flatMap((skin) => [
      ...Array.from({ length: 7 }, (_, lane) => (
        getBandoriNativeLongFlashUrl(skin, lane)
      )),
      ...Array.from({ length: 7 }, (_, lane) => (
        getBandoriNativeRhythmSupportNoteUrl(skin, lane)
      )),
    ]),
    ...Object.keys(BANDORI_HABAHIRO_SPRITES).map(getBandoriHabahiroSpriteUrl),
    ...Array.from(
      { length: 4 },
      (_, index) => getBandoriNativeLaneEffectUrl(`NoteLaneEffect_${index + 1}.png`),
    ),
  ];
  const urls = collectLogicalAssetUrls([
    BANDORI_LIMITED_PERFORMANCE_SKINS,
    BANDORI_NATIVE_BACKGROUND_SKINS,
    BANDORI_NATIVE_DIRECTIONAL_EFFECT_FRAME_URLS,
    BANDORI_NATIVE_DIRECTIONAL_FLICK_SKINS,
    BANDORI_NATIVE_FIELD_SKINS,
    BANDORI_NATIVE_HOLD_EFFECT_TEXTURE_URLS,
    BANDORI_NATIVE_NOTE_SKINS,
    BANDORI_NATIVE_SWIPE_EFFECT_TEXTURE_URLS,
    BANDORI_NATIVE_TAP_EFFECT_ATLAS_1_URL,
    BANDORI_NATIVE_TAP_EFFECT_ATLAS_2_URL,
    BANDORI_NATIVE_TAP_SE_SKINS,
    BANDORI_NATIVE_PERFECT_JUDGMENT_URL,
    BANDORI_NATIVE_COMBO_UNIT_URL,
    BANDORI_NATIVE_ALL_PERFECT_COMBO_UNIT_URL,
    BANDORI_NATIVE_COMBO_DIGIT_URLS,
    BANDORI_NATIVE_ALL_PERFECT_COMBO_DIGIT_URLS,
    generatedUrls,
  ]);
  assert.ok(urls.size > 0);
  for (const url of urls) {
    assert.doesNotThrow(
      () => inferBandoriChartSimulatorBundleKey(url),
      `${url} should map to a chart-simulator pack`,
    );
  }
});

test("browser loader pins one hash-verified manifest for the page lifetime", async () => {
  const manifestBody = JSON.stringify(manifestValue());
  const manifestHash = createHash("sha256").update(manifestBody).digest("hex");
  const baseUrl = "https://assets-loader.example.test";
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push([String(url), init]);
    if (String(url).endsWith("/index.json")) {
      return Response.json({
        schemaVersion: 1,
        updatedAt: "2026-08-23T00:00:00Z",
        manifest: manifestHash,
      });
    }
    return new Response(manifestBody, {
      headers: { "content-type": "application/json" },
    });
  };

  const [first, second] = await Promise.all([
    loadBandoriChartSimulatorAssets({ baseUrl, fetcher }),
    loadBandoriChartSimulatorAssets({ baseUrl, fetcher }),
  ]);
  assert.equal(first, second);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].credentials, "omit");
  assert.equal(calls[1][1].cache, "force-cache");
  assert.equal(
    calls[1][0],
    buildBandoriChartSimulatorManifestUrl(manifestHash, baseUrl),
  );
  assert.equal(
    first.resolveAssetUrl("/local/chart-simulator/sound/tapseskin/skin00/TapSE/perfect.wav"),
    `${baseUrl}/bandori/chart-simulator/packs/${soundPackHash}/sound/tapseskin/skin00/TapSE/perfect.wav`,
  );
});

test("one caller cannot abort the shared manifest request used by another caller", async () => {
  const manifestBody = JSON.stringify(manifestValue());
  const manifestHash = createHash("sha256").update(manifestBody).digest("hex");
  const baseUrl = "https://assets-shared-request.example.test";
  let releaseIndex;
  const indexGate = new Promise((resolve) => {
    releaseIndex = resolve;
  });
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push([String(url), init]);
    if (String(url).endsWith("/index.json")) {
      await indexGate;
      return Response.json({
        schemaVersion: 1,
        updatedAt: "2026-08-23T00:00:00Z",
        manifest: manifestHash,
      });
    }
    return new Response(manifestBody);
  };
  const controller = new AbortController();
  const first = loadBandoriChartSimulatorAssets({
    baseUrl,
    fetcher,
    signal: controller.signal,
  });
  const second = loadBandoriChartSimulatorAssets({ baseUrl, fetcher });
  controller.abort();
  releaseIndex();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.equal(firstResult, secondResult);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].signal, undefined);
  assert.equal(calls[1][1].signal, undefined);
});

test("an older refresh cannot replace a newer verified manifest", async () => {
  const olderManifest = manifestValue();
  const newerManifest = {
    ...manifestValue(),
    packs: {
      ...manifestValue().packs,
      "ingameskin/noteskin/habahiro": "e".repeat(64),
    },
  };
  const olderBody = JSON.stringify(olderManifest);
  const newerBody = JSON.stringify(newerManifest);
  const olderHash = createHash("sha256").update(olderBody).digest("hex");
  const newerHash = createHash("sha256").update(newerBody).digest("hex");
  const baseUrl = "https://assets-refresh-race.example.test";
  let indexRequestCount = 0;
  let releaseOlderManifest;
  const olderManifestGate = new Promise((resolve) => {
    releaseOlderManifest = resolve;
  });
  let notifyOlderManifestRequested;
  const olderManifestRequested = new Promise((resolve) => {
    notifyOlderManifestRequested = resolve;
  });
  const fetcher = async (url) => {
    const value = String(url);
    if (value.endsWith("/index.json")) {
      indexRequestCount += 1;
      const manifest = indexRequestCount === 1 ? olderHash : newerHash;
      return Response.json({
        schemaVersion: 1,
        updatedAt: "2026-08-23T00:00:00Z",
        manifest,
      });
    }
    if (value.includes(olderHash)) {
      notifyOlderManifestRequested();
      await olderManifestGate;
      return new Response(olderBody);
    }
    return new Response(newerBody);
  };

  const olderRequest = loadBandoriChartSimulatorAssets({
    baseUrl,
    fetcher,
    refresh: true,
  });
  await olderManifestRequested;
  const newer = await loadBandoriChartSimulatorAssets({
    baseUrl,
    fetcher,
    refresh: true,
  });
  releaseOlderManifest();
  await olderRequest;
  const cached = await loadBandoriChartSimulatorAssets({ baseUrl, fetcher });

  assert.equal(cached, newer);
  assert.match(
    cached.resolveAssetUrl(
      "/local/chart-simulator/ingameskin/noteskin/habahiro/sprites/note_normal_2.png",
    ),
    new RegExp(`/packs/${"e".repeat(64)}/`, "u"),
  );
});
