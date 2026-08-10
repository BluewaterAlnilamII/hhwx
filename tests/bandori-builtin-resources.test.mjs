import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBandoriCardAttributeIconUrl,
  buildBandoriCardBandIconUrl,
  buildBandoriCardMasterRankIconUrl,
  buildBandoriCharacterIconUrl,
  buildBandoriFullCardFrameUrl,
  buildBandoriLegacyRarityCompositeUrl,
  buildBandoriMasterRankIconUrl,
  buildBandoriRarityStarIconUrl,
  buildBandoriThumbnailFrameUrl,
} from "../src/lib/bandori-builtin-resources.ts";
import { BANDORI_FULL_CARD_LAYOUT } from "../src/lib/bandori-full-card-layout.ts";

test("full-card overlays preserve the measured game and Bestdori geometry", () => {
  assert.deepEqual(BANDORI_FULL_CARD_LAYOUT.surface, { width: 508, height: 340 });
  assert.deepEqual(BANDORI_FULL_CARD_LAYOUT.artworkViewport, {
    top: 7,
    right: 8,
    bottom: 7,
    left: 8,
    radius: 7,
  });
  assert.deepEqual(BANDORI_FULL_CARD_LAYOUT.attribute, {
    top: 7,
    right: 8,
    width: 52,
    height: 52,
  });
  assert.deepEqual(BANDORI_FULL_CARD_LAYOUT.rarityStar, {
    left: 4,
    bottom: 4,
    width: 40,
    height: 40,
    verticalStep: 31,
  });
  assert.deepEqual(BANDORI_FULL_CARD_LAYOUT.bandMark, {
    left: 6,
    top: 7,
    width: 51,
    height: 51,
  });
});

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
      buildBandoriCharacterIconUrl(1),
      "https://assets.example.test/bandori/resources/atlases/menu-atlas/icon_character001.png",
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
      buildBandoriCardAttributeIconUrl("powerful"),
      "https://assets.example.test/bandori/res/icon/powerful.svg",
    );
    assert.equal(
      buildBandoriCardBandIconUrl(18),
      "https://assets.example.test/bandori/res/icon/band_18.svg",
    );
    assert.equal(
      buildBandoriCardMasterRankIconUrl(),
      "https://assets.example.test/bandori/res/icon/master.svg",
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
    assert.equal(buildBandoriCardBandIconUrl(999), null);
    assert.equal(buildBandoriLegacyRarityCompositeUrl(6), null);
  } finally {
    if (previousBaseUrl !== undefined) {
      process.env.NEXT_PUBLIC_BANDORI_ASSET_CDN_BASE_URL = previousBaseUrl;
    }
  }
});
