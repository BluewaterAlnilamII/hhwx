import assert from "node:assert/strict";
import test from "node:test";

import {
  getBandoriDegreeCatalogItemsForRegion,
  hasBandoriDegreeMasterRegion,
  normalizeBandoriDegreeId,
  parseBandoriDegreeAnimationManifest,
  parseBandoriDegreeMasterApiResponse,
} from "../src/lib/bandori-degree-assets.ts";
import { parseBandoriDegreesAssetIndex } from "../src/lib/bandori-public-asset-index.ts";
import { parseBandoriStampAnimationCdnResponse } from "../src/lib/bandori-stamp-assets.ts";
import { getBandoriAtlasFrameIndex } from "../src/lib/bandori-atlas-animation.ts";

const imageSha256 = "a".repeat(64);
const manifestSha256 = "b".repeat(64);
const atlasSha256 = "c".repeat(64);

function masterResponse() {
  return {
    success: true,
    data: {
      "1": {
        degreeType: ["normal", "", "", "normal"],
        iconImageName: ["degree_1", "", "", "degree_1"],
        baseImageName: ["degree001", "", "", "ani_degree_cn"],
        rank: ["1", "", "", "3"],
        degreeName: ["JP Degree", "", "", "CN Degree"],
        description: ["JP", "", "", "CN"],
        seq: [1, 0, 0, 9],
        characterId: [0, 0, 0, 0],
      },
      "2": {
        degreeType: ["", "", "", "normal"],
        iconImageName: ["", "", "", "degree_missing"],
        baseImageName: ["", "", "", "degree_missing"],
        rank: ["", "", "", "none"],
        degreeName: ["", "", "", "Missing Asset Degree"],
        description: ["", "", "", "Still visible"],
        seq: [0, 0, 0, 10],
        characterId: [0, 0, 0, 0],
      },
    },
  };
}

function assetIndex() {
  return {
    schemaVersion: 1,
    updatedAt: "2026-08-11T00:00:00Z",
    resources: {
      degree001: { images: [imageSha256, "", "", ""] },
      normal_1: { images: [imageSha256, "", "", ""] },
      degree_1_1: { images: [imageSha256, "", "", ""] },
      normal_3: { images: ["", "", "", imageSha256] },
      degree_1_3: { images: ["", "", "", imageSha256] },
      ani_degree_cn: {
        animations: {
          cn: { manifest: manifestSha256, atlas: atlasSha256 },
        },
      },
    },
  };
}

function degreeManifest() {
  return {
    schemaVersion: "hhwx-bandori-degree-animation-v1",
    frameRate: 30,
    loop: true,
    atlasDimensions: { width: 128, height: 64 },
    frames: [
      { name: "ani_degree_0000", rect: { x: 0, y: 0, width: 64, height: 32 } },
      { name: "ani_degree_0001", rect: { x: 64, y: 0, width: 64, height: 32 } },
    ],
  };
}

test("degree master metadata resolves all resource descriptors without server fallback", () => {
  const master = parseBandoriDegreeMasterApiResponse(masterResponse());
  const assets = parseBandoriDegreesAssetIndex(assetIndex());
  const jp = getBandoriDegreeCatalogItemsForRegion({ master, assets }, "jp");
  const cn = getBandoriDegreeCatalogItemsForRegion({ master, assets }, "cn");
  const en = getBandoriDegreeCatalogItemsForRegion({ master, assets }, "en");

  assert.equal(jp.length, 1);
  assert.equal(jp[0].baseImageName, "degree001");
  assert.equal(jp[0].baseImage.sha256, imageSha256);
  assert.equal(jp[0].rankImageName, "normal_1");
  assert.equal(jp[0].rankImage.sha256, imageSha256);
  assert.equal(jp[0].iconImageResourceName, "degree_1_1");
  assert.equal(jp[0].iconImage.sha256, imageSha256);
  assert.equal(cn.length, 2);
  assert.equal(cn[0].baseImage, null);
  assert.deepEqual(cn[0].animation, {
    manifest: {
      key: `bandori/degrees/animation/manifests/${manifestSha256}.json`,
      sha256: manifestSha256,
    },
    atlas: {
      key: `bandori/degrees/animation/atlases/${atlasSha256}.png`,
      sha256: atlasSha256,
    },
  });
  assert.equal(cn[1].degreeName, "Missing Asset Degree");
  assert.equal(cn[1].baseImage, null);
  assert.equal(cn[1].rankImageName, "rank_none");
  assert.equal(cn[1].rankImage, null);
  assert.deepEqual(en, []);
  assert.equal(hasBandoriDegreeMasterRegion(master["1"], "jp"), true);
  assert.equal(hasBandoriDegreeMasterRegion(master["1"], "en"), false);
});

test("degree master metadata enforces complete four-server slots and public limits", () => {
  const boundary = masterResponse();
  boundary.data["1"].degreeType[0] = "x".repeat(255);
  boundary.data["1"].description[0] = "x".repeat(4096);
  assert.equal(parseBandoriDegreeMasterApiResponse(boundary)["1"].seq[0], 1);

  const incomplete = masterResponse();
  incomplete.data["1"].description[0] = "";
  assert.throws(
    () => parseBandoriDegreeMasterApiResponse(incomplete),
    /record is invalid: 1/u,
  );

  const dirtyMissingSlot = masterResponse();
  dirtyMissingSlot.data["1"].degreeType[1] = "normal";
  assert.throws(
    () => parseBandoriDegreeMasterApiResponse(dirtyMissingSlot),
    /record is invalid: 1/u,
  );

  const overlong = masterResponse();
  overlong.data["1"].degreeName[0] = "x".repeat(256);
  assert.throws(
    () => parseBandoriDegreeMasterApiResponse(overlong),
    /record is invalid: 1/u,
  );

  assert.equal(normalizeBandoriDegreeId(1.5), null);
  assert.equal(normalizeBandoriDegreeId("9007199254740992"), null);
});

test("degree animation manifest requires the fixed 30 FPS looping contiguous contract", () => {
  const parsed = parseBandoriDegreeAnimationManifest(
    degreeManifest(),
    "https://assets.example.test/manifest.json",
    "https://assets.example.test/atlas.png",
  );
  assert.equal(parsed.frameRate, 30);
  assert.equal(parsed.loop, true);
  assert.deepEqual(parsed.frames[0].rect, { x: 0, y: 0, width: 64, height: 32 });

  const wrongRate = degreeManifest();
  wrongRate.frameRate = 12;
  assert.throws(
    () => parseBandoriDegreeAnimationManifest(wrongRate, "manifest", "atlas"),
    /contract is unsupported/u,
  );

  const gap = degreeManifest();
  gap.frames[1].name = "ani_degree_0002";
  assert.throws(
    () => parseBandoriDegreeAnimationManifest(gap, "manifest", "atlas"),
    /sorted and contiguous/u,
  );

  const outside = degreeManifest();
  outside.frames[1].rect.x = 100;
  assert.throws(
    () => parseBandoriDegreeAnimationManifest(outside, "manifest", "atlas"),
    /outside the atlas/u,
  );
});

test("atlas frame timing uses elapsed time and preserves non-looping final frames", () => {
  assert.equal(getBandoriAtlasFrameIndex(0, 30, 52, true), 0);
  assert.equal(getBandoriAtlasFrameIndex(100, 30, 52, true), 3);
  assert.equal(getBandoriAtlasFrameIndex(2000, 30, 52, true), 8);
  assert.equal(getBandoriAtlasFrameIndex(2000, 30, 52, false), 51);
});

test("stamp animation manifests require an explicit positive frameRate", () => {
  const manifest = {
    schemaVersion: "hhwx-bandori-stamp-animation-v1",
    frameRate: 12,
    atlasDimensions: { width: 64, height: 32 },
    frames: [{ name: "stamp_0000", cssRect: { x: 0, y: 0, width: 32, height: 32 } }],
  };
  const parsed = parseBandoriStampAnimationCdnResponse(
    "jp",
    1,
    manifest,
    "manifest",
    "atlas",
  );
  assert.equal(parsed.frameRate, 12);
  assert.equal(parsed.loop, true);
  assert.deepEqual(parsed.frames[0].rect, { x: 0, y: 0, width: 32, height: 32 });

  const unityOnly = structuredClone(manifest);
  unityOnly.frames[0] = {
    name: "stamp_0000",
    unityRect: { x: 0, y: 0, width: 32, height: 32 },
  };
  assert.throws(
    () => parseBandoriStampAnimationCdnResponse("jp", 1, unityOnly, "manifest", "atlas"),
    /frame is invalid/u,
  );

  const outside = structuredClone(manifest);
  outside.frames[0].cssRect.x = 40;
  assert.throws(
    () => parseBandoriStampAnimationCdnResponse("jp", 1, outside, "manifest", "atlas"),
    /outside the atlas/u,
  );

  delete manifest.frameRate;
  assert.throws(
    () => parseBandoriStampAnimationCdnResponse("jp", 1, manifest, "manifest", "atlas"),
    /manifest is incomplete/u,
  );
});
