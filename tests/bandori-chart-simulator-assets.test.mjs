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
