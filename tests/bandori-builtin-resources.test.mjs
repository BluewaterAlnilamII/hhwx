import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBandoriAttributeIconUrl,
  buildBandoriBandIconUrl,
  buildBandoriCharacterIconUrl,
  buildBandoriFullCardFrameUrl,
  buildBandoriLegacyRarityCompositeUrl,
  buildBandoriMasterRankIconUrl,
  buildBandoriRarityStarIconUrl,
  buildBandoriThumbnailFrameUrl,
} from "../src/lib/bandori-builtin-resources.ts";

test("built-in resources preserve official fixed names", () => {
  const previousBaseUrl = process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
  process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = "https://assets.example.test/";
  try {
    assert.equal(
      buildBandoriFullCardFrameUrl("frame_ss_rainbow"),
      "https://assets.example.test/bandori/resources/images/card-frame/frame_ss_rainbow.png",
    );
    assert.equal(
      buildBandoriThumbnailFrameUrl(1, "cool"),
      "https://assets.example.test/bandori/resources/atlases/menu-atlas/frame_n_cool.png",
    );
    assert.equal(
      buildBandoriThumbnailFrameUrl(5, null),
      "https://assets.example.test/bandori/resources/atlases/menu-atlas/frame_ur_orange.png",
    );
    assert.equal(
      buildBandoriAttributeIconUrl("powerful"),
      "https://assets.example.test/bandori/resources/atlases/menu-atlas/icon_attribute_powerful.png",
    );
    assert.equal(
      buildBandoriCharacterIconUrl(1),
      "https://assets.example.test/bandori/resources/atlases/menu-atlas/icon_character001.png",
    );
    assert.equal(
      buildBandoriBandIconUrl(45),
      "https://assets.example.test/bandori/resources/atlases/menu-atlas/bandmark_flat_045.png",
    );
    assert.equal(
      buildBandoriRarityStarIconUrl(true),
      "https://assets.example.test/bandori/resources/atlases/menu-atlas/icon_rarity_rainbow.png",
    );
    assert.equal(
      buildBandoriMasterRankIconUrl(),
      "https://assets.example.test/bandori/resources/atlases/menu-atlas/bg_masterrank.png",
    );
    assert.equal(
      buildBandoriLegacyRarityCompositeUrl(5),
      "https://assets.example.test/bandori/res/icon/star_5.png",
    );
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = previousBaseUrl;
    }
  }
});

test("built-in resources fail closed without an owned CDN", () => {
  const previousBaseUrl = process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
  delete process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL;
  try {
    assert.equal(buildBandoriCharacterIconUrl(1), null);
    assert.equal(buildBandoriBandIconUrl(999), null);
    assert.equal(buildBandoriLegacyRarityCompositeUrl(6), null);
  } finally {
    if (previousBaseUrl !== undefined) {
      process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = previousBaseUrl;
    }
  }
});
